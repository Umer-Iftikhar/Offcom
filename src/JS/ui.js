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
