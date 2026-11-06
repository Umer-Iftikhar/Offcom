// ============================================
// ui.js — UI helpers, peer badges, QR, scanner
// ============================================

// ---- Toast & screen navigation ----

function showToast(message, isError = true) {
	log(isError ? "[Toast ERROR]" : "[Toast INFO]", message);
	const toast = document.getElementById("toast");
	if (!toast) return;
	toast.textContent = message;
	toast.className = isError ? "toast" : "toast success";
	toast.classList.add("show");
	setTimeout(() => toast.classList.remove("show"), 3000);
}

// "screenRole" → "screen-role.html"
function screenFileName(screenId) {
	return screenId.replace(/([A-Z])/g, "-$1").toLowerCase() + ".html";
}

async function showScreen(screenId) {
	log("[UI] Showing screen:", screenId);

	// If the screen isn't in the DOM yet, fetch it dynamically
	if (!document.getElementById(screenId)) {
		try {
			const fileName = screenFileName(screenId);
			log("[UI] Fetching dynamically:", fileName);

			const response = await fetch(`/src/HTML/${fileName}`);
			if (!response.ok) throw new Error("File not found");
			const html = await response.text();

			document
				.getElementById("mainContent")
				.insertAdjacentHTML("afterbegin", html);
		} catch (e) {
			logError("[UI] Failed to load screen dynamically:", screenId, e);
			showToast("Error loading screen layout", true);
			return;
		}
	}

	// Hide all screens, then show the requested one
	document
		.querySelectorAll(".screen")
		.forEach((s) => s.classList.remove("active"));
	document.getElementById(screenId)?.classList.add("active");
}

// ---- Screen preloader ----
// Fetches and injects a screen partial into the DOM without switching to it.
// Call fire-and-forget so the HTML is ready when showScreen() needs it.

async function preloadScreen(screenId) {
	if (document.getElementById(screenId)) return; // already in DOM
	try {
		const fileName = screenFileName(screenId);
		log("[UI] Preloading screen:", fileName);
		const response = await fetch(`/src/HTML/${fileName}`);
		if (!response.ok) throw new Error("Not found");
		const html = await response.text();
		document
			.getElementById("mainContent")
			.insertAdjacentHTML("afterbegin", html);
	} catch (e) {
		logError("[UI] Preload failed for", screenId, e);
	}
}

// ---- Call status ----

function updateCallStatus() {
	const connectedCount = Object.values(peers).filter(
		(p) => p.pc?.connectionState === "connected",
	).length;
	const el = document.getElementById("connState");
	if (!el) return;
	if (connectedCount > 0) {
		el.textContent = `Audio active — ${connectedCount} peer(s)`;
		el.style.color = "var(--accent)";
	} else {
		el.textContent = "Waiting for connection...";
		el.style.color = "var(--text-dim)";
	}
}

function updateHostUI() {
	if (
		isHost &&
		document.getElementById("screenHost")?.classList.contains("active")
	) {
		const count = Object.keys(peers).length;
		if (count > 0) {
			const cd = document.getElementById("peerCountDisplay");
			const sb = document.getElementById("startCallBtn");
			if (cd) cd.textContent = `${count} peer(s) detected`;
			if (sb) sb.style.display = "";
		}
	}
}

// ---- QR code ----

function generateQRCode(containerId, data) {
	const container = document.getElementById(containerId);
	if (!container || typeof qrcode === "undefined") return;
	container.innerHTML = "";
	try {
		const qr = qrcode(0, "L");
		qr.addData(data);
		qr.make();
		const mc = qr.getModuleCount(),
			cs = 6,
			m = 24,
			size = mc * cs + m * 2;
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = size;
		canvas.style.maxWidth = "100%";
		canvas.style.height = "auto";
		const ctx = canvas.getContext("2d");
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, size, size);
		ctx.fillStyle = "#0a0a0f";
		for (let r = 0; r < mc; r++) {
			for (let c = 0; c < mc; c++) {
				if (qr.isDark(r, c))
					ctx.fillRect(m + c * cs, m + r * cs, cs, cs);
			}
		}
		container.appendChild(canvas);
	} catch (err) {
		logError("[QR] Generation failed:", err);
	}
}

// ---- Lazy overlay loader ----
// Overlays live in /src/HTML/ partials and are injected into #overlayContainer on first use.

const _overlayLoaded = {};

async function loadOverlay(filename) {
	if (_overlayLoaded[filename]) return;
	try {
		const res = await fetch(`/src/HTML/${filename}`);
		if (!res.ok) throw new Error(`${filename} not found`);
		const html = await res.text();
		document
			.getElementById("overlayContainer")
			.insertAdjacentHTML("beforeend", html);
		_overlayLoaded[filename] = true;
		log("[UI] Overlay loaded:", filename);
	} catch (e) {
		logError("[UI] Failed to load overlay:", filename, e);
		showToast("Error loading UI component", true);
		throw e;
	}
}

// ---- QR scanner ----

let scannerStream = null;
let scanInterval = null;

async function openScanner() {
	await loadOverlay("overlay-scanner.html");
	document.getElementById("scannerOverlay").classList.remove("hidden");
	document.getElementById("scannerStatus").textContent = "Starting camera...";
	startScanner();
}

async function startScanner() {
	try {
		const video = document.getElementById("scannerVideo");
		const canvas = document.getElementById("scannerCanvas");
		const ctx = canvas.getContext("2d", { willReadFrequently: true });

		scannerStream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: "environment" },
		});
		video.srcObject = scannerStream;
		await video.play();

		canvas.width = video.videoWidth || 640;
		canvas.height = video.videoHeight || 480;
		document.getElementById("scannerStatus").textContent = "Scanning...";

		scanInterval = setInterval(() => {
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			const imageData = ctx.getImageData(
				0,
				0,
				canvas.width,
				canvas.height,
			);
			if (typeof jsQR === "undefined") return;
			const code = jsQR(
				imageData.data,
				imageData.width,
				imageData.height,
				{ inversionAttempts: "dontInvert" },
			);
			if (code) handleScannedQR(code.data);
		}, 100);
	} catch (err) {
		document.getElementById("scannerStatus").textContent =
			"Camera error: " + (err.message || err);
	}
}

function handleScannedQR(data) {
	if (!data.startsWith("OFFCOM:ROOM:")) {
		document.getElementById("scannerStatus").textContent =
			"Invalid QR format";
		return;
	}
	const parts = data.slice("OFFCOM:ROOM:".length).split("::");
	if (parts.length !== 2) {
		document.getElementById("scannerStatus").textContent =
			"Invalid QR format";
		return;
	}
	closeScanner();
	joinRoom(parts[0], parts[1]);
}

function closeScanner() {
	if (scanInterval) {
		clearInterval(scanInterval);
		scanInterval = null;
	}
	if (scannerStream) {
		scannerStream.getTracks().forEach((t) => t.stop());
		scannerStream = null;
	}
	const overlay = document.getElementById("scannerOverlay");
	if (overlay) {
		overlay.classList.add("closing");
		setTimeout(() => {
			overlay.classList.add("hidden");
			overlay.classList.remove("closing");
		}, 200);
	}
}
