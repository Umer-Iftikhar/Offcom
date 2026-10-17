// ============================================
// state.js — Global state & logging
// ============================================

// Turn on verbose console logs with: localStorage.setItem('offcom_debug', 'true')
const DEBUG = localStorage.getItem('offcom_debug') === 'true';

function log(...args)      { if (DEBUG) console.log('[OffCom]', ...args); }
function logError(...args) { console.error('[OffCom ERROR]', ...args); }

// ---- Audio pipeline ----
let localStream     = null;

// ---- Session ----
let isHost                = false;
let currentRoomId         = null;
let signalingUrl          = window.location.origin;

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
