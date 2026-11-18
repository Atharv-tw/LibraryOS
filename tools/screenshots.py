"""Captures the website's pages as PNGs with headless Brave over the DevTools protocol.

Usage: python screenshots.py <out_dir> [base_url]
The site must already be running (python code/server.py). The demo scenario is restored first.
"""
import base64
import json
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

OUT = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:5000"
BRAVE = "/opt/brave.com/brave/brave"
PORT = 9223
# (file name, page, JavaScript to run before the capture, max height)
SHOTS = [
    ("ui_dashboard", "dashboard", "", 1400),
    ("ui_search", "search", "document.getElementById('bs-next').click(); document.getElementById('bs-next').click();", 1250),
    ("ui_issue", "issue", "", 1300),
    ("ui_returns", "returns", "", 1000),
    ("ui_members", "members", "", 1000),
    ("ui_reports", "reports", "", 1500),
    ("ui_lab", "lab", "", 1250),
    ("ui_log", "log", "", 900),
]

urllib.request.urlopen(urllib.request.Request(f"{BASE}/api/admin/demo", data=b"{}", method="POST",
                                              headers={"Content-Type": "application/json"}))
profile = tempfile.mkdtemp()
proc = subprocess.Popen([BRAVE, "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
                         f"--user-data-dir={profile}", f"--remote-debugging-port={PORT}", "about:blank"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
            page = next(t for t in targets if t["type"] == "page")
            break
        except Exception:
            time.sleep(0.2)
    ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=120)
    msg_id = 0

    def cdp(method, **params):
        global msg_id
        msg_id += 1
        ws.send(json.dumps({"id": msg_id, "method": method, "params": params}))
        while True:
            reply = json.loads(ws.recv())
            if reply.get("id") == msg_id:
                return reply.get("result", {})

    cdp("Page.enable")
    cdp("Runtime.enable")
    for name, page_name, script, max_h in SHOTS:
        cdp("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=1.5, mobile=False)
        cdp("Page.navigate", url=f"{BASE}/#{page_name}")
        time.sleep(6 if page_name == "lab" else 2.5)
        if script:
            cdp("Runtime.evaluate", expression=script)
            time.sleep(1)
        height = cdp("Runtime.evaluate", expression="document.documentElement.scrollHeight", returnByValue=True)["result"]["value"]
        cdp("Emulation.setDeviceMetricsOverride", width=1440, height=min(max_h, height), deviceScaleFactor=1.5, mobile=False)
        time.sleep(0.8)
        png = cdp("Page.captureScreenshot", format="png")["data"]
        with open(f"{OUT}/{name}.png", "wb") as f:
            f.write(base64.b64decode(png))
        print("saved", name, min(max_h, height))
finally:
    proc.terminate()
