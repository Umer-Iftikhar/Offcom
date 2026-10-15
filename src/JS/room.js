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

		showToast(`Microphone ready! (${role})`, false);
	} catch (err) {
		logError('[Audio] Mic error:', err);
		showToast('ERROR: Allow microphone in Chrome!');
	}
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', async () => {
	log('=== OffCom Initializing ===');
	if (!navigator.mediaDevices?.getUserMedia) showToast('ERROR: Microphone access not supported (use HTTPS)!', true);

	// Boot the first screen dynamically
	await showScreen('screenRole');

	log('=== OffCom Ready ===');
});
