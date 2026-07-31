#!/usr/bin/env python3
"""Local background-removal helper for admin.html's "Quitar fondo" button.

admin.html has no backend of its own (GitHub API is the only "backend"), and
the AI model that removes backgrounds well (birefnet-general, ~1GB, 30-60s a
photo on CPU) is too heavy to run inside a browser tab. So it runs here
instead — a small server on YOUR OWN computer that the "Quitar fondo" button
in admin.html's photo editor talks to over localhost. Nothing else changes:
normal photo upload works exactly as before whether or not this is running.

Usage:
  pip install -r tools/requirements.txt
  python3 tools/bg-server.py
  # leave it running, then use "Quitar fondo" in admin.html

Stop with Ctrl+C. Only accepts connections from your own machine
(127.0.0.1) — nothing about this is reachable from the internet.
"""

import argparse
import base64
import importlib.util
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# remove-bg.py has a hyphen, so it can't be `import`ed by name — load it by
# file path instead. Keeps both scripts sharing the exact same processing
# logic (remove_background_to_white) without duplicating it.
_spec = importlib.util.spec_from_file_location("remove_bg_cli", Path(__file__).parent / "remove-bg.py")
_remove_bg_cli = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_remove_bg_cli)
remove_background_to_white = _remove_bg_cli.remove_background_to_white

DEFAULT_PORT = 8642
MAX_BODY_BYTES = 30 * 1024 * 1024  # 30MB — generous for a single uncompressed photo

_session = None
_session_lock = threading.Lock()


def get_session(model):
    global _session
    with _session_lock:
        if _session is None:
            from rembg import new_session
            print(f"Loading model '{model}' (first run downloads it, ~1GB — this can take a while)...")
            _session = new_session(model)
            print("Model loaded. Ready.")
    return _session


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self):
        origin = self.headers.get("Origin", "*")
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Chrome's Private Network Access check: a page on a public origin
        # (https://escenabmx.com) calling a private-network address
        # (127.0.0.1) needs this explicit opt-in on top of normal CORS,
        # or the preflight is blocked before our own headers are even read.
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def log_message(self, fmt, *a):
        print("[bg-server]", (fmt % a))

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            body = json.dumps({"status": "ok", "model": self.server.model}).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != "/remove-bg":
            self.send_response(404)
            self._cors()
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > MAX_BODY_BYTES:
            self._error(400, "missing or oversized request body")
            return

        try:
            raw = self.rfile.read(length)
            payload = json.loads(raw)
            data_uri = payload["image"]
            header, b64data = data_uri.split(",", 1)
            img_bytes = base64.b64decode(b64data)

            from PIL import Image
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

            session = get_session(self.server.model)
            out_img = remove_background_to_white(img, session, feather=2.0, canvas=1200, pad=0.08)

            buf = io.BytesIO()
            out_img.save(buf, "JPEG", quality=92, optimize=True)
            out_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            out_data_uri = "data:image/jpeg;base64," + out_b64

            body = json.dumps({"image": out_data_uri}).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self._error(500, str(e))

    def _error(self, code, message):
        body = json.dumps({"error": message}).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Port to listen on (default: {DEFAULT_PORT})")
    p.add_argument("--model", default="birefnet-general",
                    help="rembg model — must match what tools/remove-bg.py uses for consistent results")
    args = p.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.model = args.model
    print(f"bg-server listening on http://127.0.0.1:{args.port}")
    print("Loading the model now so the first 'Quitar fondo' click isn't slower than the rest...")
    get_session(args.model)
    print("Leave this running, then use 'Quitar fondo' on a photo in admin.html. Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping.")


if __name__ == "__main__":
    main()
