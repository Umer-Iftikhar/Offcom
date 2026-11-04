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

		if (!isHost) return showToast('Joining a room is not ready yet', true);
		showToast('Microphone ready!', false);
		await showScreen('screenHost');
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

// ---- Navigation ----

async function goBack() {
	await showScreen('screenRole');
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', async () => {
	log('=== OffCom Initializing ===');
	if (typeof qrcode === 'undefined')         showToast('ERROR: QR library not loaded!', true);
	if (!navigator.mediaDevices?.getUserMedia) showToast('ERROR: Microphone access not supported (use HTTPS)!', true);

	// Boot the first screen dynamically
	await showScreen('screenRole');

	log('=== OffCom Ready ===');
});
