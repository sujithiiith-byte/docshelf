"""End-to-end test of the DocShelf extension in headless Chromium.

Talks to Chromium over the DevTools protocol on a localhost port (stdlib only). Uses the Origin
Private File System as a stand-in for a picked folder (same handle API).
Usage: python3 tools/e2e/run.py [screenshot-dir]      run the tests
       python3 tools/e2e/run.py --store            regenerate docs/screenshots
Env:   CHROME=/path/to/chromium   (default: /snap/bin/chromium)
       E2E_PROFILE=/path/to/profile (default: ~/snap/chromium/common/docshelf-e2e)
       E2E_EXTRA_ARGS="--no-sandbox"  extra browser flags (e.g. for CI)
"""
import base64, itertools, json, os, shutil, subprocess, sys, threading, time
from pathlib import Path

EXT = str(Path(__file__).resolve().parents[2] / "extension")
CHROME = os.environ.get("CHROME", "/snap/bin/chromium")
PROFILE = Path(os.environ.get("E2E_PROFILE", Path.home() / "snap/chromium/common/docshelf-e2e"))
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else Path(__file__).parent / "shots")
TEST_JS = (Path(__file__).parent / "e2e_page.js").read_text()


class WS:
    """Minimal WebSocket client (text frames only), enough for DevTools."""
    def __init__(self, url):
        import socket, urllib.parse
        u = urllib.parse.urlparse(url)
        self.sock = socket.create_connection((u.hostname, u.port))
        key = base64.b64encode(os.urandom(16)).decode()
        req = (f"GET {u.path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\n"
               f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.sock.sendall(req.encode())
        head = b""
        while b"\r\n\r\n" not in head:
            head += self.sock.recv(1)
        assert b" 101 " in head.split(b"\r\n")[0], head
        self.buf = b""

    def send(self, text):
        data = text.encode()
        hdr = bytearray([0x81])
        n = len(data)
        if n < 126: hdr.append(0x80 | n)
        elif n < 65536: hdr += bytes([0x80 | 126]) + n.to_bytes(2, "big")
        else: hdr += bytes([0x80 | 127]) + n.to_bytes(8, "big")
        mask = os.urandom(4)
        self.sock.sendall(bytes(hdr) + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(1 << 20)
            if not chunk: raise EOFError
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        parts = []
        while True:
            b0, b1 = self._read(2)
            n = b1 & 0x7F
            if n == 126: n = int.from_bytes(self._read(2), "big")
            elif n == 127: n = int.from_bytes(self._read(8), "big")
            payload = self._read(n)
            op = b0 & 0x0F
            if op == 8: raise EOFError
            if op in (0, 1, 2): parts.append(payload)
            if b0 & 0x80 and op in (0, 1, 2): return b"".join(parts).decode()


class CDP:
    def __init__(self, ws):
        self.ws = ws
        self.ids = itertools.count(1)
        self.pending, self.events, self.lock = {}, [], threading.Lock()
        threading.Thread(target=self._reader, daemon=True).start()

    def _reader(self):
        while True:
            try:
                data = json.loads(self.ws.recv())
            except Exception:
                return
            if "id" in data:
                with self.lock:
                    slot = self.pending.get(data["id"])
                if slot:
                    slot["res"] = data
                    slot["ev"].set()
            else:
                self.events.append(data)

    def send(self, method, params=None, session=None, timeout=30):
        i = next(self.ids)
        slot = {"ev": threading.Event()}
        with self.lock:
            self.pending[i] = slot
        msg = {"id": i, "method": method, "params": params or {}}
        if session:
            msg["sessionId"] = session
        self.ws.send(json.dumps(msg))
        if not slot["ev"].wait(timeout):
            raise TimeoutError(method)
        res = slot["res"]
        if "error" in res:
            raise RuntimeError(f"{method}: {res['error']}")
        return res["result"]


def main():
    import urllib.request
    shutil.rmtree(PROFILE, ignore_errors=True)
    PROFILE.mkdir(parents=True)
    SHOTS.mkdir(parents=True, exist_ok=True)
    port = 9334
    proc = subprocess.Popen(
        [
            CHROME, "--headless=new", f"--remote-debugging-port={port}",
            f"--user-data-dir={PROFILE}", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}",
            "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-first-run",
            "--window-size=1400,900", *os.environ.get("E2E_EXTRA_ARGS", "").split(), "about:blank",
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    ws_url = None
    for _ in range(100):
        try:
            ws_url = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version"))["webSocketDebuggerUrl"]
            break
        except Exception:
            time.sleep(0.2)
    cdp = CDP(WS(ws_url))
    try:
        run(cdp)
    finally:
        try:
            cdp.send("Browser.close", timeout=5)
        except Exception:
            pass
        proc.kill()


def run(cdp):
    cdp.send("Target.setDiscoverTargets", {"discover": True})
    ext_id = None
    for _ in range(100):
        for t in cdp.send("Target.getTargets")["targetInfos"]:
            if t["type"] == "service_worker" and t["url"].endswith("/background.js"):
                ext_id = t["url"].split("/")[2]
        if ext_id:
            break
        time.sleep(0.1)
    if not ext_id:
        print("FAIL  extension service worker not found")
        sys.exit(1)
    print("extension id", ext_id)

    url = f"chrome-extension://{ext_id}/workspace.html"

    def open_page(page_url):
        target = cdp.send("Target.createTarget", {"url": page_url})["targetId"]
        sid = cdp.send("Target.attachToTarget", {"targetId": target, "flatten": True})["sessionId"]
        for m in ("Runtime.enable", "Log.enable", "Page.enable", "Network.enable", "Performance.enable"):
            cdp.send(m, session=sid)
        cdp.send("Emulation.setDeviceMetricsOverride", {"width": 1400, "height": 900, "deviceScaleFactor": 1, "mobile": False}, session=sid)
        sessions.append(sid)
        return target, sid

    def evaluate(sid, expr, timeout=60):
        res = cdp.send("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True}, session=sid, timeout=timeout)
        if "exceptionDetails" in res:
            raise RuntimeError(json.dumps(res["exceptionDetails"])[:800])
        return res["result"].get("value")

    def shot(sid, name):
        data = cdp.send("Page.captureScreenshot", {"format": "png"}, session=sid)["data"]
        (SHOTS / name).write_bytes(base64.b64decode(data))

    def stage(sid, name):
        for _ in range(150):
            if evaluate(sid, "document.readyState === 'complete' && !!window.docshelf"):
                break
            time.sleep(0.1)
        else:
            info = evaluate(sid, "JSON.stringify({url: location.href, title: document.title, text: (document.body?.innerText || '').slice(0, 300)})")
            print(f"page did not load DocShelf: {info}")
            for t in cdp.send("Target.getTargets")["targetInfos"]:
                print(f"   target {t['type']}: {t['url'][:100]}")
            for e in cdp.events:
                if e.get("method") in ("Log.entryAdded", "Runtime.exceptionThrown"):
                    print("   event", json.dumps(e.get("params"))[:300])
            sys.exit(1)
        evaluate(sid, TEST_JS)
        out = evaluate(sid, f"window.__e2e.{name}()", timeout=90)
        for r in out["results"]:
            print(("PASS  " if r["ok"] else "FAIL  ") + r["name"] + (f"  ({r['extra']})" if r.get("extra") else ""))
        return out["results"]

    def size(sid, w, h):
        cdp.send("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False}, session=sid)

    sessions = []
    results = []

    if "--store" in sys.argv:
        # README screenshots (1280x800) with realistic sample docs.
        out_dir = Path(__file__).resolve().parents[2] / "docs" / "screenshots"
        out_dir.mkdir(parents=True, exist_ok=True)
        _, s = open_page(url)
        size(s, 1280, 800)
        for _ in range(100):
            if evaluate(s, "document.readyState === 'complete' && !!window.docshelf"):
                break
            time.sleep(0.1)
        evaluate(s, (Path(__file__).parent / "store_page.js").read_text())
        for i, step in enumerate(["setup", "search", "dark", "quickOpen", "pdf"], 1):
            evaluate(s, f"window.__store.{step}()", timeout=60)
            data = cdp.send("Page.captureScreenshot", {"format": "png"}, session=s)["data"]
            (out_dir / f"{i}-{step}.png").write_bytes(base64.b64decode(data))
            print("wrote", out_dir / f"{i}-{step}.png")
        return

    t1, s1 = open_page(url)
    results += stage(s1, "welcome")
    shot(s1, "01-welcome.png")
    results += stage(s1, "main")
    results += stage(s1, "quickOpenStage")
    shot(s1, "08-quick-open.png")
    results += stage(s1, "searchStage")
    shot(s1, "09-search.png")
    results += stage(s1, "menuStage")
    shot(s1, "10-context-menu.png")
    results += stage(s1, "afterMenu")
    results += stage(s1, "markdownShot")
    shot(s1, "02-markdown-light.png")
    results += stage(s1, "pdfShot")
    time.sleep(1.5)
    shot(s1, "04-pdf.png")
    results += stage(s1, "beforeReload")
    cdp.send("Page.reload", session=s1)
    time.sleep(1.5)
    results += stage(s1, "afterReload")
    time.sleep(0.5)
    shot(s1, "05-markdown-dark.png")

    # A second DocShelf tab gets its own folder.
    t2, s2 = open_page(url)
    time.sleep(1)
    results += stage(s2, "secondTab")
    shot(s2, "11-second-tab-welcome.png")
    results += stage(s2, "secondTabOpen")
    shot(s2, "12-second-tab-folder.png")
    results += stage(s1, "firstTabUnchanged")
    cdp.send("Target.closeTarget", {"targetId": t2})

    results += stage(s1, "splitStage")
    shot(s1, "13-split.png")
    results += stage(s1, "splitClose")

    size(s1, 760, 800)
    time.sleep(0.4)
    shot(s1, "06-narrow.png")
    size(s1, 1400, 900)
    results += stage(s1, "narrow")
    shot(s1, "07-reopen.png")

    # Console errors / exceptions / failed loads gathered from events.
    problems = []
    for e in cdp.events:
        if e.get("sessionId") not in sessions:
            continue
        m, p = e.get("method"), e.get("params", {})
        if m == "Runtime.exceptionThrown":
            problems.append("exception: " + json.dumps(p["exceptionDetails"])[:300])
        elif m == "Runtime.consoleAPICalled" and p.get("type") in ("error", "warning"):
            problems.append("console: " + " ".join(str(a.get("value", a.get("description"))) for a in p["args"])[:300])
        elif m == "Log.entryAdded" and p["entry"]["level"] in ("error", "warning"):
            text, src = p["entry"]["text"], p["entry"].get("url", "")
            # The test docs deliberately contain <img onerror=...>. Newer Chrome
            # logs that the extension's CSP blocked it while the sanitizer
            # parsed it: that's the defence working, not an error.
            if "inline event handler" in text and src.endswith("/lib/purify.es.mjs"):
                continue
            problems.append("log: " + text[:300] + " " + src)
    ok = not problems
    print(("PASS  " if ok else "FAIL  ") + "no console errors" + ("" if ok else "\n   " + "\n   ".join(problems)))
    results.append({"name": "console", "ok": ok})

    # Privacy: the extension must never touch the network.
    remote = sorted({
        e["params"]["request"]["url"][:120]
        for e in cdp.events
        if e.get("method") == "Network.requestWillBeSent"
        and not e["params"]["request"]["url"].startswith(("chrome-extension://", "blob:", "data:", "about:"))
    })
    print(("PASS  " if not remote else "FAIL  ") + "zero network requests" + ("" if not remote else "\n   " + "\n   ".join(remote)))
    results.append({"name": "network", "ok": not remote})
    local = sum(1 for e in cdp.events if e.get("method") == "Network.requestWillBeSent")
    print(f"      ({local} local file/blob loads, 0 to the internet)")

    # Resource report for the first workspace tab (after all the tests).
    metrics = {m["name"]: m["value"] for m in cdp.send("Performance.getMetrics", session=s1)["metrics"]}
    print(f"      JS heap in use: {metrics.get('JSHeapUsedSize', 0) / 1048576:.1f} MB, DOM nodes: {int(metrics.get('Nodes', 0))}")
    failed = [r for r in results if not r["ok"]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
