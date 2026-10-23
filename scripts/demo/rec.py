#!/usr/bin/env python3
"""Record the PackageCare demo scenes with Playwright (1920x1080), one video file per take.

    REC_ENV/bin/python scripts/demo/rec.py TAKE [TAKE ...] [--out data/demo-video/takes]

Takes: title home ring cloud built aws roadmap end. "ring" (local app, screens 2-3) and "cloud" (deployed app,
screens 4-7) are single continuous takes; each writes TAKE.marks.json with the second at which every screen
starts, so assemble.py can trim the off-camera setup and split screens without any reload or jump. The cloud takes log in with the workspace password
from the ignored data/aws-deploy/secrets.env (never printed). The Ring takes use the local app on :3013, which
must already be connected to Ring from its Connections page. A visible cursor is injected because headless
Chromium draws none. Each take records at natural speed; assemble.py fits takes to the narration.
"""
import argparse
import json
import re
import shutil
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
CLOUD = json.loads((ROOT / "data/aws-deploy/outputs.json").read_text())["PackageCare"]["ApplicationUrl"].rstrip("/")
LOCAL = "http://127.0.0.1:3013"
SLIDES = ROOT / "scripts/demo/slides"
SIZE = {"width": 1920, "height": 1080}  # slides
APP = {"width": 1440, "height": 810}  # app takes; upscaled to 1080p in assembly

CURSOR_JS = """
(() => {
  if (window.__cursor) return;
  const c = document.createElement('div');
  c.style.cssText = 'position:fixed;left:720px;top:405px;width:26px;height:26px;margin:-4px 0 0 -4px;z-index:2147483647;pointer-events:none;transition:left .7s cubic-bezier(.4,0,.2,1),top .7s cubic-bezier(.4,0,.2,1)';
  c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#1f2d29" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(c);
  window.__cursor = c;
  window.__ripple = (x, y) => {
    const r = document.createElement('div');
    r.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;border:3px solid #0b6657;z-index:2147483646;pointer-events:none;opacity:.9;transition:transform .45s ease,opacity .45s ease`;
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 600);
  };
})();
"""


LIVE = []


class Take:
    def __init__(self, browser, name, out, storage=None, size=APP):
        self.name, self.out = name, out
        self.ctx = browser.new_context(viewport=size, device_scale_factor=1, record_video_dir=str(out / "raw"),
                                       record_video_size=size, storage_state=storage, accept_downloads=True)
        self.ctx.add_init_script(CURSOR_JS)
        self.page = self.ctx.new_page()
        self.t0, self.marks = time.monotonic(), {}
        LIVE.append(self)

    def mark(self, label):
        self.marks[label] = round(time.monotonic() - self.t0, 2)

    def wait(self, s):
        self.page.wait_for_timeout(int(s * 1000))

    def cursor(self):
        self.page.evaluate(CURSOR_JS)

    def reveal(self, locator):
        """Smoothly scroll the target into view when it is not fully visible (no instant jumps)."""
        visible = locator.evaluate("""el => { const r = el.getBoundingClientRect();
            return r.top >= 70 && r.bottom <= window.innerHeight - 10; }""")
        if not visible:
            locator.evaluate("el => el.scrollIntoView({behavior: 'smooth', block: 'center'})")
            self.wait(0.9)

    def point(self, locator, click=True, pause=0.35):
        self.cursor()
        locator.wait_for()
        self.reveal(locator)
        box = locator.bounding_box()
        x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        self.page.evaluate(f"window.__cursor.style.left='{x}px';window.__cursor.style.top='{y}px'")
        self.wait(0.8)
        if click:
            self.page.evaluate(f"window.__ripple({x},{y})")
            locator.click()
        self.wait(pause)

    def type(self, locator, text, delay=35):
        self.point(locator)
        locator.press_sequentially(text, delay=delay)

    def close(self):
        video = self.page.video
        self.ctx.close()
        dst = self.out / f"{self.name}.webm"
        shutil.move(video.path(), dst)
        (self.out / f"{self.name}.marks.json").write_text(json.dumps(self.marks, indent=1))
        print("wrote", dst, self.marks)


def login(browser, out):
    secrets = dict(l.split("=", 1) for l in (ROOT / "data/aws-deploy/secrets.env").read_text().split())
    ctx = browser.new_context(viewport=SIZE)
    page = ctx.new_page()
    page.goto(CLOUD)
    page.get_by_label("Workspace password").fill(secrets["WORKSPACE_PASSWORD"])
    page.get_by_role("button", name="Open workspace").click()
    page.get_by_text("Delivery review").first.wait_for()
    state = out / "cloud-state.json"
    ctx.storage_state(path=str(state))
    ctx.close()
    return str(state)


def select(t, title, show=True):
    """Open a delivery from the list; show=False selects it off-camera (before the take's first mark)."""
    btn = t.page.get_by_role("button", name=title).first
    t.point(btn) if show else btn.click()
    t.page.get_by_role("heading", name=title).wait_for()
    t.wait(0.7)


def top(t):
    t.page.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})"); t.wait(0.8)


def slide(b, out, name, seconds):
    t = Take(b, name, out, size=SIZE)
    t.page.goto(f"file://{SLIDES}/{name}.html")
    t.mark("start")
    t.wait(seconds)
    t.close()


def run(take, b, out, state):
    if take in ("title", "built", "aws", "roadmap", "end"):
        return slide(b, out, take, {"title": 8, "built": 14, "aws": 14, "roadmap": 12, "end": 6}[take])
    if take == "home":
        t = Take(b, take, out, state); p = t.page
        p.goto(CLOUD); p.get_by_text("Delivery review").first.wait_for(); t.wait(1.2)
        t.mark("start")
        for name in ["AI-generated - townhouse stoop overcast", "AI-generated - bungalow in rain",
                     "AI-generated - wooden porch daylight"]:
            t.point(p.get_by_role("button", name=name).first, click=False); t.wait(1.4)
        t.point(p.get_by_role("tab", name="To review").first, click=False); t.wait(1.2)
        t.point(p.get_by_role("button", name="Import footage"), click=False); t.wait(1.5)
        return t.close()
    if take == "ring":  # local app: Ring live view -> 12 s capture -> analyze -> result, one continuous take
        t = Take(b, take, out); p = t.page
        p.goto(LOCAL); p.get_by_text("Delivery review").first.wait_for()
        p.get_by_role("button", name="Connections").click()  # set the scene off-camera
        p.get_by_text("Playground access token").wait_for(); t.wait(1)
        if not p.locator("select", has=p.locator("option", has_text="Choose a device")).count():
            p.get_by_role("button", name="Refresh devices").click()
        p.locator("select", has=p.locator("option", has_text="Choose a device")).first.wait_for(); t.wait(1)
        t.mark("start")
        for _ in range(2):  # device, then camera component if the device has several
            for sel in p.locator("select").all():
                first = sel.locator("option").first.inner_text() if sel.locator("option").count() else ""
                if (sel.is_visible() and not sel.input_value() and sel.locator("option").count() > 1
                        and first in ("Choose a device", "Select a component")):
                    t.point(sel, click=False); sel.select_option(index=1); t.wait(1.2)
        t.point(p.get_by_role("button", name="Capture 12-second clip"))
        p.wait_for_function("() => [...document.querySelectorAll('video')].some(v => v.currentTime > 0.5 && !v.paused)",
                            timeout=60000)
        p.get_by_role("button", name="Cancel recording").wait_for(timeout=30000)
        p.get_by_role("button", name="Cancel recording").wait_for(state="hidden", timeout=60000)
        analyze = p.get_by_role("button", name="Analyze clip")
        analyze.wait_for(timeout=60000); t.wait(1.5)
        t.mark("saved")
        t.point(analyze, pause=0.5)
        p.locator(".stepper").wait_for(timeout=30000); t.wait(2.5)
        t.mark("wait_from")
        p.locator(".verdict").wait_for(timeout=240000)
        t.mark("wait_to")
        t.wait(1)
        t.point(p.locator(".verdict"), click=False); t.wait(4)
        t.mark("end")
        return t.close()
    if take == "cloud":  # deployed app: screens 4-7 in one continuous take
        t = Take(b, take, out, state); p = t.page
        p.goto(CLOUD); p.get_by_text("Delivery review").first.wait_for()
        select(t, "AI-generated - wooden porch daylight", show=False); t.wait(0.6)
        t.mark("s4")
        t.point(p.locator(".verdict"), click=False); t.wait(2)
        t.point(p.get_by_text("Why?", exact=True).first, pause=2.5)
        t.point(p.get_by_role("region", name="Handling activity (classifier)"), click=False); t.wait(1.5)
        t.point(p.get_by_role("button", name=re.compile(r"^\d\d:\d\d\.\d Possible airborne release")).first, pause=1.5)
        top(t)
        t.point(p.get_by_text("Why?", exact=True).first, pause=0.6)  # fold the scores away before replaying
        t.point(p.get_by_role("button", name="Replay moment"), pause=7)
        t.point(p.get_by_role("button", name=re.compile("replay|stop", re.I)).first, pause=1)
        t.mark("s5")
        t.point(p.get_by_role("button", name="Confirm", exact=True), pause=1.2)
        damage = p.locator("select").filter(has=p.locator("option[value=observed]"))
        t.point(damage, click=False); damage.select_option("observed"); t.wait(1)
        t.type(p.get_by_placeholder("Order or tracking number"), "TBA304918275000")
        t.type(p.get_by_placeholder("What did you observe?"),
               "Corner seam split open and the flaps were torn when I brought it in.", delay=22)
        t.point(p.get_by_role("button", name="Add damage photos"), click=False)
        p.locator("input[type=file][accept^=image]").set_input_files(str(ROOT / "data/demo-video/damage-photo.jpg"))
        p.get_by_text("photo added", exact=False).first.wait_for(timeout=60000)
        t.wait(2)
        t.mark("s6")
        t.point(p.get_by_text("I've finished reviewing this delivery."), pause=0.6)
        t.point(p.get_by_role("button", name="Save review"), pause=1.5)
        t.point(p.get_by_role("button", name="Preview report"), pause=2)
        frame = p.frame_locator("iframe")
        for _ in range(3):
            frame.locator("body").hover(); p.mouse.wheel(0, 700); t.wait(0.6)
        t.point(p.get_by_role("button", name="Finalize report"), pause=2)
        with p.expect_download() as dl:
            t.point(p.get_by_role("link", name="Download evidence bundle"), pause=1)
        dl.value.save_as(str(out / "bundle.zip"))
        t.wait(1.2)
        t.mark("s6_close")
        p.keyboard.press("Escape"); t.wait(0.8)
        top(t)
        t.mark("s7")
        select(t, "AI-generated - bungalow in rain")
        t.point(p.locator(".verdict"), click=False); t.wait(3)
        select(t, "AI-generated - farmhouse porch sunset")
        t.point(p.locator(".verdict"), click=False); t.wait(3)
        t.mark("end")
        return t.close()
    raise SystemExit(f"unknown take {take}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("takes", nargs="+")
    ap.add_argument("--out", default=str(ROOT / "data/demo-video/takes"))
    ap.add_argument("--headed", action="store_true")
    a = ap.parse_args()
    out = Path(a.out); (out / "raw").mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=not a.headed, args=["--autoplay-policy=no-user-gesture-required"])
        state = login(b, out) if any(t in ("home", "cloud") for t in a.takes) else None
        for take in a.takes:
            t0 = time.time()
            try:
                run(take, b, out, state)
            except Exception:
                for t in LIVE:  # keep the partial video for diagnosis
                    if not t.ctx.pages == []:
                        t.name += "-FAILED"; t.close()
                raise
            finally:
                LIVE.clear()
            print(f"  {take}: {time.time() - t0:.1f}s")
        b.close()


if __name__ == "__main__":
    main()
