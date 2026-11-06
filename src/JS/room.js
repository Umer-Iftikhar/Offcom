// ============================================
// room.js — Role selection, room management, disconnect, init
// ============================================

// ---- Role selection ----

async function selectRole(role) {
	log('[Init] Selecting role:', role);
	isHost = role === 'host';

	try {
		showToast('Requesting microphone...', false);
		const constraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 };
		localStream = await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });
		log('[Audio] Mic granted. Tracks:', localStream.getAudioTracks().length);

		// Kick off screenCall fetch in background — it'll be in the DOM before ICE finishes
		preloadScreen('screenCall');

		showToast('Microphone ready!', false);
		await showScreen(isHost ? 'screenHost' : 'screenGuest');
	} catch (err) {
		logError('[Audio] Mic error:', err);
		showToast('ERROR: Allow microphone in Chrome!');
	}
}

// ---- Host: create room ----

async function createHostRoom() {
	const btn = document.getElementById('createOfferBtn');
	try {
		log('[Init] createHostRoom clicked');
		btn.disabled  = true;
		btn.innerHTML = '<span class="loading"></span>Creating...';

		currentRoomId = generateRandomId(16);
		signalingUrl  = window.location.origin;

		const myIdDisplay = document.getElementById('myIdDisplay');
		if (myIdDisplay) myIdDisplay.textContent = `${myUsername} (${myDeviceId})`;

		document.getElementById('qrDisplayCard')?.classList.remove('hidden');
		document.getElementById('waitForGuestCard')?.classList.remove('hidden');

		// QR payload: server URL + room ID, so guests know where to connect
		const qrData = `OFFCOM:ROOM:${signalingUrl}::${currentRoomId}`;
		generateQRCode('hostQRContainer', qrData);

		const roomIdDisplay = document.getElementById('roomIdDisplay');
		if (roomIdDisplay) roomIdDisplay.textContent = currentRoomId;

		const ok = await registerGuest(currentRoomId);
		if (!ok) {
			logError('[Init] Server unreachable.');
			showToast('Cannot reach server. Is it running?', true);
			btn.disabled  = false;
			btn.innerHTML = 'Create Room';
			currentRoomId = null;
			document.getElementById('qrDisplayCard')?.classList.add('hidden');
			document.getElementById('waitForGuestCard')?.classList.add('hidden');
			return;
		}

		btn.innerHTML = 'Room Created';
		showToast(`Room ${currentRoomId} created!`, false);
	} catch(err) {
		logError('[Init] createHostRoom error:', err);
		showToast('Error: ' + err.message, true);
		btn.disabled  = false;
		btn.innerHTML = 'Create Room';
	}
}

async function startCallWithPeers() {
	await showScreen('screenCall');
	updateCallStatus();
}

// ---- Guest: join room ----

async function joinRoom(url, roomId) {
	signalingUrl          = url;
	currentRoomId         = roomId;

	const myIdDisplay = document.getElementById('myIdDisplay');
	if (myIdDisplay) myIdDisplay.textContent = `${myUsername} (${myDeviceId})`;

	try {
		log(`[Init] Joining room ${roomId} at ${url}`);
		showToast('Joining room...', false);

		const ok = await registerGuest(roomId);
		if (!ok) {
			logError('[Init] Registration failed.');
			showToast('Cannot reach server. Is it running?', true);
			currentRoomId = null;
			return;
		}

		await showScreen('screenCall');
		updateCallStatus();
		showToast('Connected to room!', false);
	} catch(err) {
		logError('[Init] joinRoom error:', err);
		showToast('Error joining: ' + err.message, true);
	}
}

function joinRoomManual() {
	const roomId = document.getElementById('manualRoomId')?.value.trim().toUpperCase();
	if (!roomId) return showToast('Enter room ID!', true);
	joinRoom(window.location.origin, roomId);
}

// ---- Navigation ----

async function goBack() {
	await showScreen('screenRole');
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', async () => {
	log('=== OffCom Initializing ===');
	if (typeof qrcode === 'undefined')         showToast('ERROR: QR library not loaded!', true);
	if (typeof jsQR === 'undefined')           showToast('ERROR: Scanner library not loaded!', true);
	if (!navigator.mediaDevices?.getUserMedia) showToast('ERROR: Microphone access not supported (use HTTPS)!', true);

	// Boot the first screen dynamically
	await showScreen('screenRole');

	log('=== OffCom Ready ===');
});
