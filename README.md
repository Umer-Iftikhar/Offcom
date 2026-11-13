# OffCom

A browser-based group voice intercom. OffCom turns a group of phones into a live intercom: one phone hosts a room over its Wi-Fi hotspot, everyone else joins from their browser, and the whole group can talk in real time like a set of walkie-talkies. Nothing to install.

## Features

- **Role selection**: pick Host to create a room, or Guest to join one.
- **Room creation and joining**: the host gets a QR code and a short room code. Guests scan the QR code with the in-app scanner or type the code in.
- **Live group voice**: everyone in the room hears everyone else. More than two people can join.
- **Mic mute / unmute**: each person can mute their own microphone at any time.
- **Voice transmit modes**: Open (always on), VOX (opens when you speak), or PTT (transmits only while the button is held).

## Tech stack

| Part | Technology |
| --- | --- |
| Front-end | Plain HTML, CSS and JavaScript (no framework) |
| Real-time audio | WebRTC, peer to peer |
| Signalling server | Python 3 standard library (asyncio + ssl), WebSockets |
| QR codes | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) and [jsQR](https://github.com/cozmo/jsQR) |

## How it works

1. The host creates a room. The app shows a QR code containing the server address and room ID.
2. Each phone opens a WebSocket to the small Python server and registers in the room.
3. The server sends every phone the list of people in the room and relays WebRTC connection details between them.
4. Each phone connects directly to every other phone (a full mesh), so voice flows phone to phone. The server never carries the audio.

## Getting started

The host phone runs the server (for example in [Termux](https://termux.dev) on Android). Browsers only allow microphone access over HTTPS, so the server needs a certificate.

```bash
# 1. Generate a self-signed certificate (once, in the project folder)
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"

# 2. Start the server
python3 signaling_server.py
```

Then:

1. **Host**: turn on the Wi-Fi hotspot.
2. **Guests**: connect to the host's hotspot.
3. **Everyone**: open `https://<host-ip>:8443` in Chrome and accept the certificate warning. On the host, `ip addr show wlan0` shows the IP (often `192.168.43.1`).
4. **Host**: tap *Create Room (Host)* → *Create Room*.
5. **Guests**: tap *Join Room (Guest)*, then scan the QR code or type the room code.
6. **Host**: tap *Start Call* once guests appear.

Keep the browser tab open during the call; closing it ends your session.

## Project structure

```
index.html              App shell
signaling_server.py     HTTPS static server + WebSocket signalling
src/CSS/style.css       Styles
src/HTML/               Screens and overlays, loaded on demand
src/JS/state.js         Shared state and logging
src/JS/ui.js            Screens, toasts, peer list, QR code and scanner
src/JS/room.js          Role selection, create/join/leave room
src/JS/signaling.js     WebSocket client and room roster handling
src/JS/webrtc.js        Peer connections, mesh, reconnection
src/JS/audio.js         Audio pipeline, mute, Open/VOX/PTT
src/JS/lib/             QR libraries
```

## License

MIT, see [LICENSE](LICENSE).
