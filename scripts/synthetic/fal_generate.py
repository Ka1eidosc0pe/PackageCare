#!/usr/bin/env python3
"""Generate synthetic training clips through the fal.ai queue API, under a hard spend cap.

Stdlib only. Reads FAL_KEY from the environment and never prints it.

    python3 scripts/synthetic/fal_generate.py JOBS.json --out data/synthetic/pilot --budget 5
    python3 scripts/synthetic/fal_generate.py JOBS.json --out data/synthetic/pilot --budget 5 --dry-run

Every job's price is looked up from fal's pricing API before submission. The ledger
(OUT/ledger.jsonl) records estimated spend; a job is refused when ledger + estimate
would exceed --budget. Completed jobs (same id) are skipped, so reruns never pay twice.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

QUEUE = "https://queue.fal.run"
PRICING = "https://api.fal.ai/v1/models/pricing"
lock = Lock()


def request(url, key, method="GET", body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Key {key}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace")[:800]
        raise RuntimeError(f"HTTP {err.code} from {url.split('?')[0]}: {detail}") from None


def prices(endpoints, key):
    query = urllib.parse.urlencode([("endpoint_id", e) for e in sorted(set(endpoints))])
    return {p["endpoint_id"]: p for p in request(f"{PRICING}?{query}", key)["prices"]}


def seconds(job):
    i = job["input"]
    if "num_frames" in i:
        return i["num_frames"] / i.get("frames_per_second", 16)
    return float(i.get("duration", 5))


def estimate(job, price):
    unit = price["unit"].lower()
    if "second" in unit:
        return price["unit_price"] * seconds(job)
    if unit in ("video", "videos", "request", "requests", "generation"):
        return price["unit_price"]
    if unit == "1m tokens":  # Seedance: tokens = width * height * fps * seconds / 1024
        w, h = {"480p": (864, 480), "720p": (1280, 720), "1080p": (1920, 1088)}[job["input"].get("resolution", "1080p")]
        return price["unit_price"] * w * h * 24 * seconds(job) / 1024 / 1e6
    if "override_usd" in job:
        return job["override_usd"]
    raise RuntimeError(f"{job['endpoint']}: unhandled price unit {unit!r}; set override_usd on the job")


def spent(ledger):
    """Total estimated spend, completed ids, and id -> request_id for submitted-but-unfinished jobs."""
    if not ledger.exists():
        return 0.0, set(), {}
    total, done, pending = 0.0, set(), {}
    for line in ledger.read_text().splitlines():
        row = json.loads(line)
        if row["status"] == "submitted":
            total += row["usd"]
            pending[row["id"]] = row["request_id"]
        if row["status"] == "completed":
            done.add(row["id"])
    return total, done, {k: v for k, v in pending.items() if k not in done}


def retrying(fn, attempts=5):
    for i in range(attempts):
        try:
            return fn()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            if i == attempts - 1:
                raise
            print(f"network error ({err}); retrying", flush=True)
            time.sleep(5 * (i + 1))


def log(ledger, row):
    with lock, ledger.open("a") as f:
        f.write(json.dumps(row) + "\n")


def run(job, usd, key, out, ledger, rid=None):
    app = "/".join(job["endpoint"].split("/")[:2])
    if rid is None:  # never retried automatically: a lost submit response could mean a paid duplicate
        rid = request(f"{QUEUE}/{job['endpoint']}", key, "POST", job["input"])["request_id"]
        log(ledger, {"id": job["id"], "status": "submitted", "usd": usd, "request_id": rid, "t": time.time()})
    start = time.time()
    while True:
        time.sleep(6)
        st = retrying(lambda: request(f"{QUEUE}/{app}/requests/{rid}/status", key))
        if st.get("error"):
            raise RuntimeError(f"{job['id']}: {st.get('error_type')}: {st['error']}")
        if st["status"] == "COMPLETED":
            break
        if time.time() - start > 1500:
            raise RuntimeError(f"{job['id']}: timed out waiting (request {rid})")
    result = retrying(lambda: request(f"{QUEUE}/{app}/requests/{rid}", key))
    video = out / "clips" / f"{job['id']}.mp4"
    retrying(lambda: urllib.request.urlretrieve(result["video"]["url"], video))
    meta = {k: job[k] for k in job if k != "override_usd"} | {
        "request_id": rid, "seed": result.get("seed"), "estimated_usd": usd,
        "generation_seconds": round(time.time() - start, 1), "synthetic": True,
    }
    (out / "clips" / f"{job['id']}.json").write_text(json.dumps(meta, indent=2))
    log(ledger, {"id": job["id"], "status": "completed", "request_id": rid, "t": time.time()})
    print(f"done {job['id']} ({meta['generation_seconds']}s)", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs")
    ap.add_argument("--out", required=True)
    ap.add_argument("--budget", type=float, required=True, help="hard USD cap across this output dir")
    ap.add_argument("--parallel", type=int, default=4)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    key = os.environ.get("FAL_KEY")
    if not key:
        sys.exit("FAL_KEY is not set in the environment")
    jobs = json.loads(Path(args.jobs).read_text())
    out = Path(args.out)
    (out / "clips").mkdir(parents=True, exist_ok=True)
    ledger = out / "ledger.jsonl"

    table = prices([j["endpoint"] for j in jobs], key)
    missing = {j["endpoint"] for j in jobs} - table.keys()
    if missing:
        sys.exit(f"no pricing returned for {sorted(missing)}; refusing to submit")

    total, done, pending = spent(ledger)
    plan, resume = [], []
    for job in jobs:
        if job["id"] in done:
            continue
        if job["id"] in pending:  # already paid for: fetch the existing request instead of resubmitting
            resume.append(job)
            print(f"resume {job['id']} (request {pending[job['id']]})")
            continue
        usd = estimate(job, table[job["endpoint"]])
        if total + usd > args.budget:
            print(f"SKIP {job['id']}: would exceed budget (${total:.2f} + ${usd:.2f} > ${args.budget:.2f})")
            continue
        total += usd
        plan.append((job, usd))
    for job, usd in plan:
        print(f"plan {job['id']:<28} {job['endpoint']:<52} ${usd:.3f}")
    print(f"planned ${sum(u for _, u in plan):.2f}; cumulative incl. ledger ${total:.2f} / cap ${args.budget:.2f}")
    if args.dry_run or not (plan or resume):
        return

    failures = []
    with ThreadPoolExecutor(args.parallel) as pool:
        futures = {pool.submit(run, j, u, key, out, ledger): j for j, u in plan}
        futures |= {pool.submit(run, j, 0.0, key, out, ledger, pending[j["id"]]): j for j in resume}
        for f, j in futures.items():
            try:
                f.result()
            except Exception as err:  # keep going; record for review
                failures.append(f"{j['id']}: {err}")
                log(ledger, {"id": j["id"], "status": "failed", "error": str(err)[:500], "t": time.time()})
    for f in failures:
        print("FAILED", f)


if __name__ == "__main__":
    main()
