// ============================================
// webrtc.js — RTCPeerConnection, ICE, reconnection
// ============================================

// ---- PeerConnection factory ----

function createPeerConnection(peerId) {
	logWebRTC(peerId, 'Creating new RTCPeerConnection');
	// No STUN/TURN servers: every phone is on the same local hotspot
	const pc = new RTCPeerConnection({
		iceServers:          [],
		iceCandidatePoolSize: 4,
		iceTransportPolicy:  'all',
	});

	if (localStream) {
		localStream.getTracks().forEach(track => {
			logWebRTC(peerId, `Adding local track: ${track.kind}`);
			pc.addTrack(track, localStream);
		});
	} else {
		logError(`[WebRTC] localStream is null when creating PC for ${peerId}!`);
	}

	pc.ontrack = async (event) => {
		logWebRTC(peerId, `Remote track received: ${event.track.kind}`);
		attachRemoteStream(peerId, event.streams[0]);
		updateCallStatus();
		// Guest auto-enters call screen on first audio track
		if (!isHost && document.getElementById('screenGuest')?.classList.contains('active')) {
			await showScreen('screenCall');
		}
	};

	pc.onconnectionstatechange = () => {
		logWebRTC(peerId, `Connection state -> ${pc.connectionState} (ICE: ${pc.iceConnectionState}, signaling: ${pc.signalingState})`);
		const p = peers[peerId];
		if (!p) return;

		updateCallStatus();
	};

	pc.onsignalingstatechange     = () => logWebRTC(peerId, `Signaling state -> ${pc.signalingState}`);
	pc.onicegatheringstatechange  = () => logWebRTC(peerId, `ICE gathering state -> ${pc.iceGatheringState}`);
	pc.oniceconnectionstatechange = () => logWebRTC(peerId, `ICE connection state -> ${pc.iceConnectionState}`);

	pc.onicecandidate = (event) => {
		if (event.candidate) {
			logWebRTC(peerId, `ICE candidate (type=${event.candidate.type} proto=${event.candidate.protocol})`);
			postMessage(peerId, 'candidate', { candidate: event.candidate });
		} else {
			logWebRTC(peerId, 'ICE gathering complete.');
		}
	};

	return pc;
}

// ---- Peer lifecycle ----

function initPeer(peerObj) {
	log('[Mesh] Init Peer:', peerObj);
	peers[peerObj.id] = {
		pc:                 createPeerConnection(peerObj.id),
		name:               peerObj.name,
		role:               peerObj.role,
		audioEl:            null,
	};
	updateHostUI();
}

function cleanupPeer(peerId) {
	const p = peers[peerId];
	if (!p) return;
	log(`[Cleanup] Removing peer ${peerId} (role=${p.role}, state=${p.pc?.connectionState})`);
	if (p.pc)      { try { p.pc.close(); } catch(e) {} }
	if (p.audioEl) { p.audioEl.srcObject = null; p.audioEl.remove(); }
	delete iceCandidateBuffer[peerId];
	delete peers[peerId];
	updateCallStatus();
}

// ---- Offer / Answer ----

async function initiateOffer(targetPeerId) {
	const p = peers[targetPeerId];
	if (!p) return;
	const pc = p.pc;
	try {
		logWebRTC(targetPeerId, 'Creating offer...');
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		logWebRTC(targetPeerId, 'Offer set as local description, posting to server.');
		postMessage(targetPeerId, 'offer', { sdp: offer });
	} catch(err) {
		logError(`[Mesh] Offer failed for ${targetPeerId}:`, err);
	}
}

// ---- ICE candidate buffering ----
// Candidates can arrive before the remote description is set; buffer them.

async function flushIceCandidateBuffer(peerId) {
	const buf = iceCandidateBuffer[peerId];
	if (!buf || buf.length === 0) return;
	logWebRTC(peerId, `Flushing ${buf.length} buffered ICE candidate(s).`);
	const pc = peers[peerId]?.pc;
	if (!pc) { logError(`[ICE Buffer] No PC for ${peerId}, discarding.`); delete iceCandidateBuffer[peerId]; return; }
	for (const candidate of buf) {
		try {
			await pc.addIceCandidate(new RTCIceCandidate(candidate));
			logWebRTC(peerId, 'Applied buffered ICE candidate.');
		} catch(e) {
			logError(`[ICE Buffer] Failed to apply candidate for ${peerId}:`, e);
		}
	}
	delete iceCandidateBuffer[peerId];
}

// ---- Signaling message handler ----

async function handleSignalingMessage(msg) {
	const fromId = msg.from;
	log(`[Mesh] Received ${msg.type} from ${fromId}`);

	if (!peers[fromId]) {
		logError(`[Mesh] Message from unknown peer: ${fromId}. Ignoring.`);
		return;
	}

	const pc = peers[fromId].pc;

	try {
		if (msg.type === 'offer') {
			logWebRTC(fromId, 'Applying remote offer...');
			await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
			const answer = await pc.createAnswer();
			await pc.setLocalDescription(answer);
			logWebRTC(fromId, 'Sent answer back.');
			postMessage(fromId, 'answer', { sdp: answer });
			await flushIceCandidateBuffer(fromId);

		} else if (msg.type === 'answer') {
			logWebRTC(fromId, 'Applying remote answer...');
			await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
			await flushIceCandidateBuffer(fromId);

		} else if (msg.type === 'candidate') {
			if (!pc.remoteDescription?.type) {
				logWebRTC(fromId, 'ICE candidate arrived before remote description — buffering.');
				if (!iceCandidateBuffer[fromId]) iceCandidateBuffer[fromId] = [];
				iceCandidateBuffer[fromId].push(msg.payload.candidate);
			} else {
				logWebRTC(fromId, 'Applying ICE candidate...');
				await pc.addIceCandidate(new RTCIceCandidate(msg.payload.candidate));
			}
		}
	} catch(e) {
		logError(`[Mesh] Error handling ${msg.type} from ${fromId}:`, e);
	}
}
