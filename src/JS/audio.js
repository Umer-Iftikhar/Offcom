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
