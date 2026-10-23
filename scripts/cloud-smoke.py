#!/usr/bin/env python3
"""Upload one clip to the deployed PackageCare stack and follow it to a result.

    python3 scripts/cloud-smoke.py https://API_ID.execute-api.us-east-2.amazonaws.com CLIP.mp4

Reads WORKSPACE_PASSWORD from the ignored data/aws-deploy/secrets.env and never prints it.
Same path as the browser: session login -> direct S3 upload authorization -> S3 POST ->
complete -> Step Functions -> Worker Lambda -> DynamoDB record.
"""
import hashlib
import http.cookiejar
import json
import sys
import time
import urllib.request
import uuid
from pathlib import Path

base, clip = sys.argv[1].rstrip("/"), Path(sys.argv[2])
secrets = dict(line.split("=", 1) for line in Path("data/aws-deploy/secrets.env").read_text().split())
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api(path, body=None, method=None):
    req = urllib.request.Request(base + "/api" + path, method=method or ("POST" if body is not None else "GET"),
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "Origin": base})
    with opener.open(req, timeout=60) as res:
        return json.loads(res.read() or b"{}")


api("/session", {"password": secrets["WORKSPACE_PASSWORD"]})
status = api("/status")
print("status:", {k: status.get(k) for k in ("uploadMode", "storage", "worker")}, status.get("analysis"))

data = clip.read_bytes()
grant = api("/uploads/authorize", {"purpose": "video", "name": clip.name, "bytes": len(data),
                                    "mime": "video/mp4", "sha256": hashlib.sha256(data).hexdigest()})
boundary = uuid.uuid4().hex
parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
         for k, v in grant["fields"].items()]
parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{clip.name}"\r\n'
             f"Content-Type: video/mp4\r\n\r\n".encode() + data + f"\r\n--{boundary}--\r\n".encode())
s3 = urllib.request.Request(grant["url"], data=b"".join(parts), method="POST",
                            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
with urllib.request.urlopen(s3, timeout=120) as res:
    print("S3 upload:", res.status)
d = api("/uploads/complete", {"ticket": grant["ticket"]})
print("delivery:", d["id"], d["state"])

start = time.time()
while d["state"] not in ("ready", "failed", "media_unavailable"):
    time.sleep(15)
    d = api(f"/deliveries/{d['id']}")
    print(f"  {time.time() - start:5.0f}s  {d['state']}", flush=True)
a = d.get("analysis") or {}
print("result:", d["state"], a.get("assessment"))
for o in a.get("observations", []):
    print("  ", o["label"], o["startMs"], o["endMs"], o["verification"], "-", o["description"][:100])
for r in d.get("runs", []):
    print("  run:", r.get("provider"), r.get("pass"), r.get("status"), {k: r.get(k) for k in ("wallMs", "error") if r.get(k)})
print(f"total {time.time() - start:.0f}s")
