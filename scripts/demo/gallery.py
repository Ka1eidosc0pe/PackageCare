#!/usr/bin/env python3
"""Capture the Devpost thumbnail and gallery images (3:2) from the local demo workspace and the exported report.

    REC_ENV/bin/python scripts/demo/gallery.py [--app http://127.0.0.1:3013] [--bundle data/demo-video/takes/bundle.zip]

Writes docs/media/submission/*.jpg. Read-only against the app: it selects deliveries and opens panels, never saves.
"""
import argparse
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/media/submission"
VIEW = {"width": 1500, "height": 1000}


def save(page, name, **kw):
    png = OUT / f"{name}.png"
    page.screenshot(path=str(png), **kw)
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "86", str(png), "--out",
                    str(OUT / f"{name}.jpg")], check=True, capture_output=True)
    png.unlink()
    print("wrote", OUT / f"{name}.jpg")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", default="http://127.0.0.1:3013")
    ap.add_argument("--bundle", default=str(ROOT / "data/demo-video/takes/bundle.zip"))
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        p = b.new_page(viewport=VIEW, device_scale_factor=1.5)

        def open_delivery(title):
            p.get_by_role("button", name=title).first.click()
            p.get_by_role("heading", name=title).wait_for(); p.wait_for_timeout(900)
            p.evaluate("window.scrollTo(0, 0)"); p.wait_for_timeout(300)

        p.goto(a.app); p.get_by_text("Delivery review").first.wait_for(); p.wait_for_timeout(800)
        save(p, "01-deliveries")
        open_delivery("AI-generated - wooden porch daylight")
        p.locator("video").first.evaluate("v => { v.currentTime = 2.6; }"); p.wait_for_timeout(700)
        save(p, "02-verdict")
        p.get_by_text("Why?", exact=True).first.click(); p.wait_for_timeout(500)
        p.get_by_role("region", name="Handling activity (classifier)").evaluate(
            "el => el.scrollIntoView({block: 'center'})"); p.wait_for_timeout(600)
        save(p, "03-activity-track")
        p.get_by_text("Why?", exact=True).first.click()
        p.get_by_role("button", name="Confirm", exact=True).click()
        p.locator("select").filter(has=p.locator("option[value=observed]")).select_option("observed")
        p.get_by_placeholder("Order or tracking number").fill("TBA304918275000")
        p.get_by_placeholder("What did you observe?").fill("Corner seam split open and the flaps were torn when I brought it in.")
        p.get_by_placeholder("What did you observe?").evaluate("el => el.scrollIntoView({block: 'center'})")
        p.wait_for_timeout(600)
        save(p, "04-recipient-review")  # unsaved edits only; nothing is written
        p.reload(); p.get_by_text("Delivery review").first.wait_for(); p.wait_for_timeout(800)
        open_delivery("AI-generated - bungalow in rain")
        save(p, "05-no-concern")
        rings = p.get_by_role("button", name=re.compile("^Ring live capture"))
        if rings.count():
            rings.first.click(); p.get_by_role("heading", name="Ring live capture").wait_for(); p.wait_for_timeout(900)
            p.evaluate("window.scrollTo(0, 0)"); p.wait_for_timeout(300)
            save(p, "06-ring-capture-abstains")

        with tempfile.TemporaryDirectory() as tmp:  # exported report, opened offline from the ZIP
            zipfile.ZipFile(a.bundle).extractall(tmp)
            r = b.new_page(viewport={"width": 1500, "height": 1000}, device_scale_factor=1.5)
            r.goto(f"file://{tmp}/report.html"); r.wait_for_timeout(1200)
            save(r, "07-exported-report")
            r.get_by_text("Timeline", exact=True).first.evaluate("el => el.scrollIntoView({block: 'start'})")
            r.mouse.wheel(0, -40); r.wait_for_timeout(500)
            save(r, "08-report-timeline")

        s = b.new_page(viewport={"width": 1920, "height": 1080})
        for name, slide in (("09-how-it-was-built", "built"), ("10-aws-architecture", "aws")):
            s.goto(f"file://{ROOT}/scripts/demo/slides/{slide}.html"); s.wait_for_timeout(4500)
            save(s, name)
        t = b.new_page(viewport=VIEW, device_scale_factor=1.0)
        t.goto(f"file://{ROOT}/scripts/demo/thumbnail.html"); t.wait_for_timeout(1500)
        save(t, "00-thumbnail")
        b.close()


if __name__ == "__main__":
    main()
