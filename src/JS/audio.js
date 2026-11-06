// ============================================
// audio.js — Audio pipeline, mute, transmit modes
// ============================================

// ---- Remote audio ----

function attachRemoteStream(peerId, stream) {
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
