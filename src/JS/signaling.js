// ============================================
// signaling.js — WebSocket signaling layer
// ============================================

function wsUrl() {
	return signalingUrl.replace(/^http/, 'ws') + '/ws';
}

// Open WebSocket, register with server. Returns a Promise that resolves on 'registered'.
function openWebSocket(roomId) {
	return new Promise((resolve, reject) => {
		if (ws) { try { ws.close(); } catch(e) {} }

		log(`[WS] Connecting to ${wsUrl()}`);
		ws = new WebSocket(wsUrl());

		const timeout = setTimeout(() => {
			logError('[WS] Connection timeout');
			ws.close();
			reject(new Error('WebSocket connection timed out'));
		}, 12000);

		ws.onopen = () => {
			log('[WS] Connected — registering...');
			clearTimeout(timeout);
			wsSend({
				type: 'register',
				room: roomId,
				peer: myDeviceId,
				name: myUsername,
				role: isHost ? 'host' : 'guest',
			});
		};

		ws.onmessage = (evt) => {
			let msg;
			try { msg = JSON.parse(evt.data); } catch(e) { return; }
			log(`[WS] ← ${msg.type}`, msg);

			if (msg.type === 'registered') {
				wsReady = true;
				resolve(true);
				return;
			}
			handleServerMessage(msg);
		};

		ws.onerror = (e) => {
			logError('[WS] Error', e);
			clearTimeout(timeout);
			reject(new Error('WebSocket error'));
		};

		ws.onclose = (e) => {
			log(`[WS] Closed (code=${e.code})`);
			wsReady = false;
		};
	});
}

function wsSend(obj) {
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		logError('[WS] Cannot send — socket not open:', obj.type);
		return;
	}
	ws.send(JSON.stringify(obj));
}

// Connect + register; returns true/false instead of throwing
async function registerGuest(roomId) {
	try {
		await openWebSocket(roomId);
		return true;
	} catch(e) {
		logError('[WS] registerGuest failed:', e);
		showToast('Cannot connect to server. Is it running?', true);
		return false;
	}
}

// ---- Incoming server message router ----

function handleServerMessage(msg) {
	if (msg.type === 'roster') {
		processRoster(msg.peers || []);
		return;
	}
}

// Process a roster push from the server
function processRoster(roster) {
	log(`[Roster] ${roster.length} peer(s): ${JSON.stringify(roster.map(p => `${p.id}/${p.role}`))}`);
}
