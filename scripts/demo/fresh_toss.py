#!/usr/bin/env python3
"""Replace the cloud demo's toss delivery with a fresh, unreviewed copy (before re-filming the cloud take).

    python3 scripts/demo/fresh_toss.py
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.argv = ["cloud-smoke", "https://v98w5ez7g7.execute-api.us-east-2.amazonaws.com", "/dev/null"]
src = (ROOT / "scripts/cloud-smoke.py").read_text()
exec(src.split('api("/session"')[0])  # login helpers: base, opener, api, secrets
api("/session", {"password": secrets["WORKSPACE_PASSWORD"]})  # noqa: F821
title = "AI-generated - wooden porch daylight"
ds = api("/deliveries")  # noqa: F821
for x in ds if isinstance(ds, list) else ds["deliveries"]:
    if x["title"] == title:
        req = urllib.request.Request(base + f"/api/deliveries/{x['id']}", method="DELETE", headers={"Origin": base})  # noqa: F821
        print("removed previous copy", opener.open(req).status)  # noqa: F821
subprocess.run([sys.executable, str(ROOT / "scripts/cloud-smoke.py"), base,  # noqa: F821
                str(ROOT / f"data/synthetic/demo/named/{title}.mp4")], check=True)
