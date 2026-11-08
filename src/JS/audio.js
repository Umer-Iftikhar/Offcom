// ============================================
// audio.js — Audio pipeline, mute, transmit modes
// ============================================

// ---- AudioContext setup ----
// mic → analyser (VOX level) → gain (mute gate for VOX/PTT) → stream sent to peers

function initAudioContext() {
	if (audioContext && audioContext.state !== 'closed') return audioContext;
	log('[Audio] Initializing AudioContext');
	audioContext = new (window.AudioContext || window.webkitAudioContext)();
	micGainNode  = audioContext.createGain();
	analyserNode = audioContext.createAnalyser();
	analyserNode.fftSize = 256;
	micGainNode.gain.value = 1;
	return audioContext;
}

function processLocalStream(stream) {
	initAudioContext();
	if (audioContext.state === 'suspended') audioContext.resume();
	if (localSource) { try { localSource.disconnect(); } catch(e) {} }

	const destination = audioContext.createMediaStreamDestination();
	localSource = audioContext.createMediaStreamSource(stream);
	localSource.connect(analyserNode);
	analyserNode.connect(micGainNode);
	micGainNode.connect(destination);

	applyTransmitMode();
	return destination.stream;
}

// ---- Remote audio ----

function attachRemoteStream(peerId, stream) {
	initAudioContext();
	if (audioContext.state === 'suspended') audioContext.resume();

	let audioEl = document.getElementById('remoteAudio_' + peerId);
	if (!audioEl) {
		log(`[Audio] Creating <audio> element for ${peerId}`);
		audioEl = document.createElement('audio');
		audioEl.id = 'remoteAudio_' + peerId;
		audioEl.autoplay = true;
		audioEl.setAttribute('playsinline', '');
		document.body.appendChild(audioEl);
	}

	audioEl.srcObject = stream;
	audioEl.play().catch(e => logError('[Audio] Remote play failed:', e));

	if (peers[peerId]) peers[peerId].audioEl = audioEl;
}

// ---- Mute ----

function toggleLocalMute() {
	if (transmitMode === 'ptt') return;
	isLocalMuted = !isLocalMuted;
	if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isLocalMuted);
	log(`[Audio] Mic manually ${isLocalMuted ? 'MUTED' : 'UNMUTED'}`);
	updateMuteButtonUI();
}

function updateMuteButtonUI() {
	const btn = document.getElementById('muteToggleBtn');
	if (!btn) return;

	if (transmitMode === 'ptt') {
		// PTT already controls the mic — the mute button is disabled in this mode
		btn.disabled      = true;
		btn.style.opacity = '0.4';
		btn.style.color   = '';
		btn.innerHTML     = 'Mic: PTT';
		return;
	}

	btn.disabled      = false;
	btn.style.opacity = '1';
	btn.style.color   = isLocalMuted ? 'var(--red)' : 'var(--accent)';
	btn.innerHTML     = isLocalMuted ? 'Mic: MUTED' : 'Mic: ON';
}

// ---- Transmit mode ----

function setTransmitMode(mode) {
	log('[Transmit] Setting mode to:', mode);
	transmitMode = mode;
	localStorage.setItem('offcom_transmit_mode', mode);

	document.querySelectorAll('.transmit-btn').forEach(b => b.classList.remove('active'));
	document.getElementById('transmit-' + mode)?.classList.add('active');

	document.getElementById('voxHint')?.classList.toggle('hidden', mode !== 'vox');
	document.getElementById('pttContainer')?.classList.toggle('hidden', mode !== 'ptt');

	if (voxCheckInterval) { clearInterval(voxCheckInterval); voxCheckInterval = null; }
	if (voxHoldTimer)     { clearTimeout(voxHoldTimer);     voxHoldTimer = null; }
	voxActive = false;

	switch (mode) {
		case 'open': if (micGainNode) micGainNode.gain.value = 1; break;
		case 'vox':  if (micGainNode) micGainNode.gain.value = 0; startVOXMonitoring(); break;
		case 'ptt':
			if (micGainNode) micGainNode.gain.value = 0;
			isPttActive = false;
			document.getElementById('pttButton')?.classList.remove('ptt-active');
			break;
	}

	updateMuteButtonUI();
}

function applyTransmitMode() {
	setTransmitMode(localStorage.getItem('offcom_transmit_mode') || 'open');
}

// ---- VOX (voice-activated transmit) ----
// Opens the mic while the average input level is above VOX_THRESHOLD,
// and keeps it open for VOX_HOLD_MS after speech stops.

function startVOXMonitoring() {
	if (!analyserNode) return;
	voxCheckInterval = setInterval(() => {
		const data = new Uint8Array(analyserNode.frequencyBinCount);
		analyserNode.getByteFrequencyData(data);
		let sum = 0;
		for (let i = 0; i < data.length; i++) sum += data[i];
		const level = sum / data.length / 255;

		if (level > VOX_THRESHOLD) {
			if (!voxActive) {
				voxActive = true;
				if (micGainNode) micGainNode.gain.value = 1;
			}
			if (voxHoldTimer) { clearTimeout(voxHoldTimer); voxHoldTimer = null; }
		} else if (voxActive) {
			if (!voxHoldTimer) {
				voxHoldTimer = setTimeout(() => {
					voxActive    = false;
					voxHoldTimer = null;
					if (micGainNode) micGainNode.gain.value = 0;
				}, VOX_HOLD_MS);
			}
		}
	}, 30);
}

// ---- PTT (push-to-talk) ----
// Mic transmits only while the button is held.

function pttStart(e) {
	if (e) e.preventDefault();
	if (transmitMode !== 'ptt' || isPttActive) return;
	isPttActive = true;
	if (micGainNode) micGainNode.gain.value = 1;
	document.getElementById('pttButton')?.classList.add('ptt-active');
}

function pttStop(e) {
	if (e) e.preventDefault();
	if (transmitMode !== 'ptt' || !isPttActive) return;
	isPttActive = false;
	if (micGainNode) micGainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.01);
	document.getElementById('pttButton')?.classList.remove('ptt-active');
}
