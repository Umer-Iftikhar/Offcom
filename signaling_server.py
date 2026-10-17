#!/usr/bin/env python3
"""
OffCom Signaling Server
Pure stdlib: asyncio + ssl. Zero pip dependencies.
Serves static files over HTTPS and WebSocket signaling over WSS on the same port.
"""
import asyncio
import ssl
import json
import hashlib
import base64
import struct
import time
import os
import signal
import urllib.parse

PORT    = 8443
WS_PATH = "/ws"
DEBUG   = True

# ── Shared state ─────────────────────────────────────────────────────────────
rooms      = {}   # room_id → { "peers": { peer_id → PeerState } }
rooms_lock = None # asyncio.Lock() created inside main()

def log(*a):
    if DEBUG:
        print("[Server]", *a, flush=True)

# ── Peer state ────────────────────────────────────────────────────────────────
class PeerState:
    def __init__(self, peer_id, name, role):
        self.id        = peer_id
        self.name      = name
        self.role      = role
        self.ver       = 1
        self.last_seen = time.time()
        self.writer    = None
        self.left      = False

    def to_dict(self):
        return {"id": self.id, "name": self.name, "role": self.role, "ver": self.ver}

# ── Room helpers ──────────────────────────────────────────────────────────────
async def get_or_create_room(room_id):
    async with rooms_lock:
        if room_id not in rooms:
            rooms[room_id] = {"peers": {}}
            log(f"Room created: {room_id}")
        return rooms[room_id]

async def register_peer(room_id, peer_id, name, role):
    await get_or_create_room(room_id)
    async with rooms_lock:
        room = rooms[room_id]
        if peer_id in room["peers"]:
            p = room["peers"][peer_id]
            p.name = name; p.role = role
            p.ver += 1; p.last_seen = time.time(); p.left = False
        else:
            p = PeerState(peer_id, name, role)
            room["peers"][peer_id] = p
        log(f"Registered {name} ({peer_id}) as {role} ver={p.ver} in {room_id}")
        return p.ver

async def mark_left(room_id, peer_id):
    async with rooms_lock:
        room = rooms.get(room_id)
        if room and peer_id in room["peers"]:
            peer = room["peers"][peer_id]
            if peer.left:
                return  # already marked — ignore duplicate (client leave + WS finally)
            peer.left   = True
            peer.writer = None
            log(f"Peer left: {peer_id} in {room_id}")

async def get_active_peers(room_id):
    async with rooms_lock:
        room = rooms.get(room_id, {})
        return [p.to_dict() for p in room.get("peers", {}).values() if not p.left]

async def broadcast_roster(room_id):
    roster = await get_active_peers(room_id)
    msg    = json.dumps({"type": "roster", "peers": roster})
    async with rooms_lock:
        room    = rooms.get(room_id, {})
        writers = [(pid, p.writer) for pid, p in room.get("peers", {}).items()
                   if not p.left and p.writer]
    for pid, writer in writers:
        try:
            await ws_send(writer, msg)
        except Exception as e:
            log(f"Broadcast error for {pid}: {e}")

# ── WebSocket framing (RFC 6455) ──────────────────────────────────────────────
MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

def ws_accept_header(key):
    digest = base64.b64encode(hashlib.sha1((key + MAGIC).encode()).digest()).decode()
    return (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {digest}\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "\r\n"
    ).encode()

async def ws_send(writer, text):
    data = text.encode()
    n    = len(data)
    if   n < 126:    hdr = struct.pack("!BB",  0x81, n)
    elif n < 65536:  hdr = struct.pack("!BBH", 0x81, 126, n)
    else:            hdr = struct.pack("!BBQ", 0x81, 127, n)
    writer.write(hdr + data)
    await writer.drain()

async def ws_recv(reader):
    try:
        h = await reader.readexactly(2)
    except Exception:
        return None, None
    opcode = h[0] & 0x0F
    masked = bool(h[1] & 0x80)
    n      = h[1] & 0x7F
    if   n == 126: n = struct.unpack("!H", await reader.readexactly(2))[0]
    elif n == 127: n = struct.unpack("!Q", await reader.readexactly(8))[0]
    mask = await reader.readexactly(4) if masked else b""
    data = await reader.readexactly(n)
    if masked:
        data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    return opcode, data

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
    peer_id = None
    room_id = None
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

        # WebSocket upgrade?
        if hdrs.get("upgrade", "").lower() == "websocket" and path.split("?")[0] == WS_PATH:
            writer.write(ws_accept_header(hdrs.get("sec-websocket-key", "")))
            await writer.drain()
            # ── WebSocket session loop ──────────────────────────────────
            try:
                while True:
                    opcode, payload = await ws_recv(reader)
                    if opcode is None or opcode == 8:
                        break
                    if opcode == 9:  # ping → pong
                        writer.write(struct.pack("!BB", 0x8A, 0))
                        await writer.drain()
                        continue
                    if opcode not in (1, 2):
                        continue
                    try:
                        msg = json.loads(payload.decode())
                    except Exception:
                        continue

                    mtype = msg.get("type", "")
                    if mtype != "ping":
                        log(f"WS [{mtype}] from={msg.get('from','?')} room={msg.get('room','?')}")

                    if mtype == "register":
                        room_id = msg["room"]
                        peer_id = msg["peer"]
                        ver     = await register_peer(room_id, peer_id, msg.get("name", peer_id), msg.get("role", "guest"))
                        async with rooms_lock:
                            rooms[room_id]["peers"][peer_id].writer = writer
                        await ws_send(writer, json.dumps({"type": "registered", "ver": ver}))
                        await broadcast_roster(room_id)

            except Exception as e:
                log(f"WS session error ({peer_id}): {e}")
            finally:
                if peer_id and room_id:
                    await mark_left(room_id, peer_id)
                    await broadcast_roster(room_id)
                    log(f"WS disconnected: {peer_id}")
        else:
            # Static file
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
    global rooms_lock
    rooms_lock = asyncio.Lock()

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

    print(f"OffCom WebSocket server on port {PORT} (WSS + HTTPS)", flush=True)
    print(f"[Server] Press Ctrl+C once to stop.", flush=True)

    async with server:
        await stop_evt.wait()

    print("[Server] Goodbye.", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
