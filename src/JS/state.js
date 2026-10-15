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
