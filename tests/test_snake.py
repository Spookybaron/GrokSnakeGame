import subprocess, time, json, sys, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = "/workspace/grok-snake-shots"
PORT = 8765
URL = f"http://127.0.0.1:{PORT}/index.html"
server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond), extra)); print(("PASS " if cond else "FAIL ") + name, extra)

DIRS = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}
KEY = {"up": "ArrowUp", "down": "s", "left": "a", "right": "ArrowRight"}  # mix arrows and WASD

def choose(st):
    hx, hy = st["head"]["x"], st["head"]["y"]; fx, fy = st["food"]["x"], st["food"]["y"]
    body = {(s["x"], s["y"]) for s in st["snake"][:-1]}
    cur = (st["dir"]["x"], st["dir"]["y"])
    opts = []
    for name, (dx, dy) in DIRS.items():
        if (dx, dy) == (-cur[0], -cur[1]): continue
        nx, ny = hx + dx, hy + dy
        if not (0 <= nx < st["cols"] and 0 <= ny < st["rows"]) or (nx, ny) in body: continue
        opts.append((abs(nx - fx) + abs(ny - fy), name))
    opts.sort()
    return opts[0][1] if opts else None

def swipe(page, cdp, name):
    box = page.locator("#board").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    dx, dy = DIRS[name]
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": cx, "y": cy}]})
    for i in range(1, 6):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": cx + dx * 16 * i, "y": cy + dy * 16 * i}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})

def steer(page, mobile, cdp, target_score):
    last_head = None; used_swipe = False; done_at = None; t0 = time.time()
    while time.time() - t0 < 60:
        st = page.evaluate("grokSnake.getState()")
        if st["state"] != "playing": return st, used_swipe
        if st["score"] >= target_score and not done_at: done_at = time.time()
        if done_at and time.time() - done_at > 0.45: return st, used_swipe
        if st["head"] != last_head:
            last_head = st["head"]
            d = choose(st)
            if d and DIRS[d] != (st["dir"]["x"], st["dir"]["y"]):
                if mobile:
                    if not used_swipe: swipe(page, cdp, d); used_swipe = True
                    else: page.tap(f".dir.{d}")
                else:
                    page.keyboard.press(KEY[d])
        time.sleep(0.01)
    return page.evaluate("grokSnake.getState()"), used_swipe

def run(p, label, mobile):
    browser = p.chromium.launch()
    opts = dict(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True) if mobile \
        else dict(viewport={"width": 1280, "height": 800})
    ctx = browser.new_context(**opts)
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    cdp = ctx.new_cdp_session(page) if mobile else None
    page.goto(URL); page.wait_for_load_state("networkidle"); page.evaluate("document.fonts.ready")
    time.sleep(0.4)
    font = page.evaluate("document.fonts.check('16px \"Press Start 2P\"')")
    check(f"[{label}] pixel font loaded", font)
    scroll = page.evaluate("[document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth]")
    check(f"[{label}] no page scrolling (fits viewport)", scroll[0] <= scroll[1] and scroll[2] <= scroll[3], str(scroll))
    check(f"[{label}] title screen shown", page.evaluate("grokSnake.getState().state") == "title")
    page.screenshot(path=f"{SHOTS}/{label}-1-title.png")

    if mobile: page.tap("#titleScreen")
    else: page.keyboard.press("Space")
    time.sleep(0.2)
    check(f"[{label}] game started", page.evaluate("grokSnake.getState().state") == "playing")
    if mobile:
        swipe(page, cdp, "up"); time.sleep(0.4)
        d = page.evaluate("grokSnake.getState().dir")
        check(f"[{label}] swipe up turns snake up", d == {"x": 0, "y": -1}, str(d))
        page.tap(".dir.left"); time.sleep(0.4)
        d = page.evaluate("grokSnake.getState().dir")
        check(f"[{label}] on-screen left button turns snake", d == {"x": -1, "y": 0}, str(d))
    tick0 = page.evaluate("grokSnake.getState().tickMs")
    st, used_swipe = steer(page, mobile, cdp, 80)
    check(f"[{label}] ate food, score went up", st["score"] >= 80, f"score={st['score']} len={st['length']}")
    check(f"[{label}] snake grew", st["length"] >= 11, f"len={st['length']}")
    check(f"[{label}] speed increased", st["tickMs"] < tick0, f"{tick0}ms -> {st['tickMs']}ms")
    if mobile: check(f"[{label}] swipe + on-screen buttons steer", used_swipe)
    page.screenshot(path=f"{SHOTS}/{label}-2-gameplay.png")

    # pause / resume
    if mobile: page.tap("#pauseBtn")
    else: page.keyboard.press("p")
    h1 = page.evaluate("grokSnake.getState()"); time.sleep(0.6); h2 = page.evaluate("grokSnake.getState()")
    check(f"[{label}] pause freezes game", h1["state"] == "paused" and h1["head"] == h2["head"])
    if mobile: page.tap("#pauseScreen")
    else: page.keyboard.press("p")
    check(f"[{label}] resume", page.evaluate("grokSnake.getState().state") == "playing")

    # crash into the wall: steer straight at the nearest wall ahead and stop steering
    st = page.evaluate("grokSnake.getState()")
    hx, hy = st["head"]["x"], st["head"]["y"]
    cur = (st["dir"]["x"], st["dir"]["y"])
    cands = {"up": hy, "down": st["rows"] - 1 - hy, "left": hx, "right": st["cols"] - 1 - hx}
    body = {(s["x"], s["y"]) for s in st["snake"]}
    def clear(n):
        dx, dy = DIRS[n]; x, y = hx + dx, hy + dy
        while 0 <= x < st["cols"] and 0 <= y < st["rows"]:
            if (x, y) in body: return False
            x += dx; y += dy
        return True
    order = sorted([n for n in cands if DIRS[n] != (-cur[0], -cur[1]) and clear(n)], key=lambda n: cands[n])
    if order and DIRS[order[0]] != cur:
        if mobile: page.tap(f".dir.{order[0]}")
        else: page.keyboard.press(KEY[order[0]])
    t0 = time.time()
    while page.evaluate("grokSnake.getState().state") == "playing" and time.time() - t0 < 10: time.sleep(0.02)
    end = page.evaluate("grokSnake.getState()")
    hx, hy = end["head"]["x"], end["head"]["y"]; dx, dy = end["dir"]["x"], end["dir"]["y"]
    nx, ny = hx + dx, hy + dy
    wall = not (0 <= nx < end["cols"] and 0 <= ny < end["rows"])
    check(f"[{label}] crashed into wall -> game over", end["state"] == "over" and wall, f"score={end['score']}")
    time.sleep(0.6)  # let crash flash fade
    page.screenshot(path=f"{SHOTS}/{label}-3-gameover.png")
    hi = page.evaluate("localStorage.getItem('grokSnake.highScore')")
    check(f"[{label}] high score saved to localStorage", hi == str(end["score"]), f"hi={hi}")

    # restart
    if mobile: page.tap("#restartBtn")
    else: page.keyboard.press("Space")
    time.sleep(0.2)
    s = page.evaluate("grokSnake.getState()")
    check(f"[{label}] restart works", s["state"] == "playing" and s["score"] == 0 and s["length"] == 3)

    page.reload(); page.wait_for_load_state("networkidle"); time.sleep(0.3)
    shown = page.inner_text("#hiscore"); title_hi = page.inner_text("#titleHi")
    check(f"[{label}] high score persists after reload", shown == str(end["score"]) and title_hi == shown, f"HUD={shown}")
    check(f"[{label}] no console errors", not errors, json.dumps(errors))
    browser.close()

try:
    with sync_playwright() as p:
        run(p, "desktop", False)
        run(p, "phone", True)
finally:
    server.terminate()
fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
