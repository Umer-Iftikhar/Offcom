#!/usr/bin/env python3
"""
OffCom Signaling Server
Serves the app's static files over HTTPS.
"""
import asyncio
import ssl
import os
import signal
import urllib.parse

PORT    = 8443
DEBUG   = True

def log(*a):
    if DEBUG:
        print("[Server]", *a, flush=True)

# ── Static file serving ───────────────────────────────────────────────────────
MIME = {
    ".html": "text/html", ".js": "application/javascript",
    ".css": "text/css",   ".json": "application/json",
    ".png": "image/png",  ".otf": "font/otf",
    ".ico": "image/x-icon", ".svg": "image/svg+xml",
}

def build_http_response(status, ctype, body):
    return (
        f"HTTP/1.1 {status}\r\n"
        f"Content-Type: {ctype}\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"Access-Control-Allow-Origin: *\r\n"
        f"Connection: close\r\n\r\n"
    ).encode() + body

def serve_static_sync(path, writer):
    clean = urllib.parse.urlparse(path).path
    if clean in ("/", ""):
        clean = "/index.html"
    fpath = "." + clean
    if not os.path.isfile(fpath):
        writer.write(build_http_response("404 Not Found", "text/plain", b"Not Found"))
        return
    ext   = os.path.splitext(fpath)[1].lower()
    ctype = MIME.get(ext, "application/octet-stream")
    with open(fpath, "rb") as f:
        body = f.read()
    writer.write(build_http_response("200 OK", ctype, body))

# ── Connection dispatcher ─────────────────────────────────────────────────────
async def handle_connection(reader, writer):
    try:
        # Read HTTP request headers
        raw = b""
        while b"\r\n\r\n" not in raw:
            chunk = await reader.read(4096)
            if not chunk:
                return
            raw += chunk
        header_text = raw.split(b"\r\n\r\n")[0].decode("latin-1")
        lines       = header_text.splitlines()
        req_line    = lines[0].split()
        path        = req_line[1] if len(req_line) > 1 else "/"

        hdrs = {}
        for line in lines[1:]:
            if ":" in line:
                k, _, v = line.partition(":")
                hdrs[k.strip().lower()] = v.strip()

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, serve_static_sync, path, writer)
        await writer.drain()

    except Exception as e:
        log(f"Connection error: {e}")
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain("cert.pem", "key.pem")

    server = await asyncio.start_server(handle_connection, "0.0.0.0", PORT, ssl=ctx)

    loop     = asyncio.get_running_loop()
    stop_evt = asyncio.Event()

    def _handle_exit():
        if not stop_evt.is_set():
            print("\n[Server] Shutting down gracefully...", flush=True)
            stop_evt.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _handle_exit)

    print(f"OffCom server on https://0.0.0.0:{PORT}", flush=True)
    print(f"[Server] Press Ctrl+C once to stop.", flush=True)

    async with server:
        await stop_evt.wait()

    print("[Server] Goodbye.", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
