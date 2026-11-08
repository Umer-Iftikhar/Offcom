// ============================================
// state.js — Global state & logging
// ============================================

// Turn on verbose console logs with: localStorage.setItem('offcom_debug', 'true')
const DEBUG = localStorage.getItem('offcom_debug') === 'true';

function log(...args)      { if (DEBUG) console.log('[OffCom]', ...args); }
function logError(...args) { console.error('[OffCom ERROR]', ...args); }
function logWebRTC(peerId, msg) { if (DEBUG) console.log(`[WebRTC - ${peerId}]`, msg); }

// ---- Audio pipeline ----
let localStream     = null;
let audioContext    = null;
let micGainNode     = null;
let localSource     = null;
let analyserNode    = null;

// ---- Session ----
let isHost                = false;
let currentRoomId         = null;
let signalingUrl          = window.location.origin;
let intentionalDisconnect = false;

// ---- Identity (persisted across sessions) ----
function generateRandomId(len) {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

let myDeviceId = localStorage.getItem('offcom_device_id');
if (!myDeviceId) {
	myDeviceId = generateRandomId(6);
	localStorage.setItem('offcom_device_id', myDeviceId);
}

let myUsername = localStorage.getItem('offcom_username');
if (!myUsername) {
	myUsername = 'Rider-' + Math.floor(1000 + Math.random() * 9000);
	localStorage.setItem('offcom_username', myUsername);
}

// ---- WebSocket signaling state ----
let ws            = null;
let wsReady       = false;
let wsPingTimer   = null;
const WS_PING_MS  = 10000;

// ---- Multi-peer state ----
const peers = {};   // peerId → { pc, name, role, audioEl, ... }

// ---- ICE candidate buffer (keyed by peerId) ----
let iceCandidateBuffer = {};

// ---- Mute / transmit mode ----
let isLocalMuted     = false;
