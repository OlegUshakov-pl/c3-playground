// js/main.js
import { EXAMPLES_MANIFEST, fetchExampleCode, prefetchAllExamples } from './examples.js';
import { setupMonacoC3, parseCompilerErrors, registerEditorCommands, applyTheme } from './monaco-c3.js';
import {
	preloadCompilerAssets,
	executeCompilerTask,
	queryCompilerVersion,
	queueDocgenUpdate,
	triggerStdlibDocgenHtml,
	readStdlibFile,
	openStdlibDoc,
	getDocsIframePatchJs
} from './compiler.js';
import { getSharedCode, createShareLink } from './share.js';
import { parseAssetDirectives, fetchAssets, writeVfsFile } from './assets.js';

// DOM Elements
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const statusTooltipEl = document.getElementById("statusTooltip");
const compileBtn = document.getElementById("compileBtn");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const saveBtn = document.getElementById("saveBtn");
const shareBtn = document.getElementById("shareBtn");
const exampleSelect = document.getElementById("exampleSelect");
const resizer = document.getElementById("resizer");
const mainLayout = document.getElementById("mainLayout");

const settingsBtn = document.getElementById("settingsBtn");
const settingsPopover = document.getElementById("settingsPopover");
const extraFlagsInput = document.getElementById("extraFlagsInput");
const canvasFullscreenBtn = document.getElementById("canvasFullscreenBtn");
const canvasContainer = document.getElementById("canvasContainer");

const menuBtn = document.getElementById("menuBtn");
const menuDropdown = document.getElementById("menuDropdown");
const menuNew = document.getElementById("menuNew");
const menuOpen = document.getElementById("menuOpen");
const menuSaveAs = document.getElementById("menuSaveAs");

let editor = null;
let rawConsoleOutput = "";
let currentTheme = localStorage.getItem("c3_playground_theme") || "dark";

function applyAppTheme(theme) {
	currentTheme = theme;
	localStorage.setItem("c3_playground_theme", theme);
	document.documentElement.setAttribute("data-theme", theme);
	if (window.monaco && editor) applyTheme(monaco, theme);
	document.querySelectorAll(".theme-option").forEach(el => {
		const isActive = el.dataset.themeValue === theme;
		el.classList.toggle("active", isActive);
		const check = el.querySelector(".theme-check");
		if (check) check.style.opacity = isActive ? "1" : "0";
	});
}
document.documentElement.setAttribute("data-theme", currentTheme);

const DEFAULT_COPY_HTML = copyBtn.innerHTML;

// iOS Warning Dialog
if ((/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
	&& !sessionStorage.getItem('dismissed_ios_warning')) {
	showIosWarningOverlay();
}

function showIosWarningOverlay() {
	const overlay = document.createElement('div');
	overlay.style.cssText = `
	position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
	background-color: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif;
	padding: 24px; display: flex; flex-direction: column; align-items: center;
	justify-content: center; text-align: center; box-sizing: border-box; z-index: 99999;
  `;
	overlay.innerHTML = `
	<button id="closeIosWarning" style="position:absolute;top:16px;right:16px;background:none;border:none;color:#94a3b8;font-size:28px;cursor:pointer;">&times;</button>
	<img src="favicon.svg" style="height: 64px; margin-bottom: 24px;" alt="C3 Logo">
	<h1 style="color: #38bdf8; font-size: 1.5rem; margin-bottom: 12px;">Playground Not Fully Supported on iOS</h1>
	<p style="color: #94a3b8; font-size: 0.95rem; max-width: 420px; margin-bottom: 24px;">The C3 compiler in WebAssembly requires memory features restricted on iOS.</p>
	<button id="bypassIosBtn" style="background:#38bdf8;color:#0f172a;font-weight:600;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;">Continue Anyway</button>
  `;
	document.body.appendChild(overlay);
	const dismiss = () => { sessionStorage.setItem('dismissed_ios_warning', 'true'); overlay.remove(); };
	document.getElementById('closeIosWarning').onclick = dismiss;
	document.getElementById('bypassIosBtn').onclick = dismiss;
}

// Layout Resizer
let leftPercentage = parseFloat(localStorage.getItem("c3_playground_left_percentage") || "50");
let topPercentage = parseFloat(localStorage.getItem("c3_playground_top_percentage") || "50");
if (!Number.isFinite(leftPercentage) || leftPercentage < 15 || leftPercentage > 85) leftPercentage = 50;
if (!Number.isFinite(topPercentage) || topPercentage < 15 || topPercentage > 85) topPercentage = 50;

function resetLayout() {
	leftPercentage = 50; topPercentage = 50; sidebarWidth = 260;
	localStorage.setItem("c3_playground_left_percentage", "50");
	localStorage.setItem("c3_playground_top_percentage", "50");
	localStorage.setItem("c3_playground_sidebar_w", "260");
	localStorage.removeItem("c3_playground_sidebar_collapsed");
	if (sidebarEl) sidebarEl.classList.remove("collapsed");
	if (mainLayoutEl) mainLayoutEl.classList.remove("sidebar-collapsed");
	if (sidebarResizer) sidebarResizer.style.display = "";
	if (sidebarShowBtn) sidebarShowBtn.style.display = "none";
	applyLayout();
	if (editor) setTimeout(() => editor.layout(), 50);
}

function applyLayout() {
	let sw = 260;
	let isCollapsed = false;
	try {
		const el = document.getElementById("sidebar");
		const wRaw = parseInt(localStorage.getItem("c3_playground_sidebar_w") || "260", 10);
		const w = Number.isFinite(wRaw) ? wRaw : 260;
		isCollapsed = !!(el && el.classList.contains("collapsed"));
		sw = isCollapsed ? 0 : w;
	} catch {}
	if (window.innerWidth <= 768) {
		mainLayout.style.gridTemplateColumns = "1fr";
		mainLayout.style.gridTemplateRows = `auto 10px ${topPercentage}% 10px 1fr`;
	} else {
		mainLayout.style.gridTemplateRows = "1fr";
		if (isCollapsed) {
			mainLayout.style.gridTemplateColumns = `${leftPercentage}% 14px 1fr`;
		} else {
			mainLayout.style.gridTemplateColumns = `${sw}px 14px ${leftPercentage}% 14px 1fr`;
		}
	}
	try { document.documentElement.style.setProperty("--sidebar-w", sw + "px"); } catch {}
}
applyLayout();

window.addEventListener("resize", () => {
	applyLayout();
	if (editor) editor.layout();
});

let isDragging = false;
resizer.onmousedown = (e) => {
	isDragging = true;
	resizer.classList.add("dragging");
	document.body.style.cursor = window.innerWidth <= 768 ? "row-resize" : "col-resize";
	document.body.style.userSelect = "none";
	e.preventDefault();
};

document.onmousemove = (e) => {
	if (!isDragging) return;
	const rect = mainLayout.getBoundingClientRect();
	const isCollapsed = sidebarEl && sidebarEl.classList.contains("collapsed");
	const sw = isCollapsed ? 0 : sidebarWidth;
	if (window.innerWidth <= 768) {
		topPercentage = Math.max(15, Math.min(85, ((e.clientY - rect.top) / rect.height) * 100));
	} else {
		// leftPercentage is % of total width; subtract sidebar + resizer offset for accurate drag
		const gap1 = isCollapsed ? 0 : 14;
		const effectiveX = e.clientX - rect.left - sw - gap1;
		const effectiveW = rect.width - sw - gap1 - 14; // minus sidebar and two resizers (14px each)
		leftPercentage = Math.max(15, Math.min(85, (effectiveX / effectiveW) * 100));
		// fallback to old calc if effectiveW too small
		if (!isFinite(leftPercentage) || effectiveW <= 0) {
			leftPercentage = Math.max(15, Math.min(85, ((e.clientX - rect.left) / rect.width) * 100));
		}
	}
	applyLayout();
	if (editor) editor.layout();
};

document.onmouseup = () => {
	if (isDragging) {
		isDragging = false;
		resizer.classList.remove("dragging");
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
		const isMobile = window.innerWidth <= 768;
		const key = isMobile ? "c3_playground_top_percentage" : "c3_playground_left_percentage";
		const val = isMobile ? topPercentage : leftPercentage;
		localStorage.setItem(key, val.toFixed(2));
	}
};
// Double-click resizers to reset layout
if (typeof resizer !== 'undefined' && resizer) resizer.addEventListener("dblclick", resetLayout);
setTimeout(() => {
	const sr = document.getElementById("sidebarResizer");
	if (sr) sr.addEventListener("dblclick", resetLayout);
}, 500);

// Console & UI Helpers
function appendConsole(text, isErr = false) {
	const line = isErr ? `[ERR] ${text}` : text;
	rawConsoleOutput += line;
	outputEl.innerHTML = formatConsoleOutput(rawConsoleOutput);
	outputEl.scrollTop = outputEl.scrollHeight;
}

function clearConsole() {
	stopExecution();
	rawConsoleOutput = "";
	outputEl.textContent = "";
	if (window.monaco && editor) monaco.editor.setModelMarkers(editor.getModel(), "c3", []);
}

function formatConsoleOutput(text) {
	let escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

	// Convert local main.c3 error paths to clickable spans (navigates to Monaco editor)
	escaped = escaped.replace(/(?:\/main\.c3|main\.c3):(\d+)(?::(\d+))?/g, (match, line, col) => {
		return `<span class="console-link" style="color:#38bdf8;cursor:pointer;font-weight:bold;" data-line="${line}" data-col="${col || 1}">${match}</span>`;
	});

	// Convert /usr/lib/c3/std/... error notes to GitHub source links
	const stdlibRegex = /(?:\/usr\/lib\/c3\/std\/|std\/)([^:\s)]+):(\d+)(?::(\d+))?/g;
	escaped = escaped.replace(stdlibRegex, (match, subpath, line) => {
		const githubUrl = `https://github.com/c3lang/c3c/blob/master/lib/std/${subpath}#L${line}`;
		return `<a href="${githubUrl}" target="_blank" class="console-link" style="color:#38bdf8;text-decoration:underline;cursor:pointer;font-weight:bold;">${match}</a>`;
	});

	return escaped;
}

// Global Audio Context Tracker to ensure audio never lingers across switches
const activeAudioContexts = new Set();
const OrigAudioContext = window.AudioContext || window.webkitAudioContext;
if (OrigAudioContext && !window.__c3AudioTracked) {
	window.__c3AudioTracked = true;
	const PatchedAudioContext = function(...args) {
		const ctx = new OrigAudioContext(...args);
		activeAudioContexts.add(ctx);
		const origClose = ctx.close;
		ctx.close = function() {
			activeAudioContexts.delete(ctx);
			return origClose.apply(this, arguments);
		};
		return ctx;
	};
	PatchedAudioContext.prototype = OrigAudioContext.prototype;
	window.AudioContext = PatchedAudioContext;
	if (window.webkitAudioContext) window.webkitAudioContext = PatchedAudioContext;
}

let currentEmscriptenInstance = null;

function setStatus(text, stateClass) {
	statusEl.textContent = text;
	statusEl.className = "status-badge " + (stateClass || "");
}

function resumeAudioIfSuspended() {
	for (const ctx of activeAudioContexts) {
		if (ctx && ctx.state === "suspended") {
			ctx.resume().catch(() => {});
		}
	}
	if (window.miniaudio && window.miniaudio.devices) {
		for (const dev of window.miniaudio.devices) {
			if (dev && dev.context && dev.context.state === "suspended") {
				dev.context.resume().catch(() => {});
			}
		}
	}
}

function stopExecution() {
	const container = document.getElementById("canvasContainer");
	if (container) container.style.display = "none";

	// 1. Cancel running Emscripten main loop / animation frame
	if (currentEmscriptenInstance) {
		try {
			if (typeof currentEmscriptenInstance.cancelMainLoop === "function") {
				currentEmscriptenInstance.cancelMainLoop();
			} else if (typeof currentEmscriptenInstance._emscripten_cancel_main_loop === "function") {
				currentEmscriptenInstance._emscripten_cancel_main_loop();
			} else if (currentEmscriptenInstance.Browser && currentEmscriptenInstance.Browser.mainLoop) {
				currentEmscriptenInstance.Browser.mainLoop.pause();
				currentEmscriptenInstance.Browser.mainLoop.func = null;
			}
		} catch (e) {}
		currentEmscriptenInstance = null;
	}

	// 2. Close all active Web Audio contexts
	for (const ctx of activeAudioContexts) {
		try {
			if (ctx && ctx.state !== "closed") {
				ctx.close().catch(() => {});
			}
		} catch (e) {}
	}
	activeAudioContexts.clear();

	// 3. Miniaudio device cleanup
	if (window.miniaudio && window.miniaudio.devices) {
		for (const dev of window.miniaudio.devices) {
			if (dev) {
				if (dev.node) {
					try { dev.node.disconnect(); } catch (e) {}
					dev.node.onaudioprocess = null;
				}
				if (dev.context && dev.context.state !== "closed") {
					try { dev.context.close().catch(() => {}); } catch (e) {}
				}
			}
		}
		window.miniaudio.devices = [];
	}

	getFreshCanvas();
}

// Extra Flags & Settings Popover
extraFlagsInput.value = localStorage.getItem("c3_playground_extra_flags") || "";
extraFlagsInput.oninput = () => {
	localStorage.setItem("c3_playground_extra_flags", extraFlagsInput.value);
};

extraFlagsInput.onkeydown = (e) => {
	if (e.key === "Enter") {
		settingsPopover.classList.remove("active");
		if (!compileBtn.disabled) compileBtn.click();
	}
};

settingsBtn.onclick = (e) => {
	e.stopPropagation();
	settingsPopover.classList.toggle("active");
	if (settingsPopover.classList.contains("active")) extraFlagsInput.focus();
};

document.onclick = (e) => {
	if (!settingsPopover.contains(e.target) && e.target !== settingsBtn) {
		settingsPopover.classList.remove("active");
	}
	if (menuDropdown && !menuDropdown.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
		menuDropdown.classList.remove("open");
		menuBtn.setAttribute("aria-expanded", "false");
	}
};

export function fitCanvasToContainer() {
	const wrapper = document.querySelector(".canvas-wrapper") || document.getElementById("canvasContainer");
	const canvas = document.getElementById("canvas");
	if (!wrapper || !canvas || !canvas.width || !canvas.height) return;

	const wrapW = wrapper.clientWidth;
	const wrapH = wrapper.clientHeight;
	if (wrapW <= 0 || wrapH <= 0) return;

	const scale = Math.min(wrapW / canvas.width, wrapH / canvas.height);
	const targetW = Math.max(1, Math.floor(canvas.width * scale));
	const targetH = Math.max(1, Math.floor(canvas.height * scale));

	canvas.style.width = targetW + "px";
	canvas.style.height = targetH + "px";
}

globalThis.fitCanvasToContainer = fitCanvasToContainer;

const canvasResizeObserver = new ResizeObserver(() => {
	fitCanvasToContainer();
});

// Navbar menu
if (menuBtn && menuDropdown) {
	const closeMenu = () => { menuDropdown.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); };
	menuBtn.onclick = (e) => {
		e.stopPropagation();
		const isOpen = menuDropdown.classList.toggle("open");
		menuBtn.setAttribute("aria-expanded", String(isOpen));
		if (isOpen) settingsPopover.classList.remove("active");
	};
	document.querySelectorAll(".theme-option").forEach(btn => {
		btn.onclick = (e) => { e.stopPropagation(); applyAppTheme(btn.dataset.themeValue); closeMenu(); };
	});
	document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

	// New
	const NEW_TEMPLATE = 'module main;\nimport std::io;\n\nfn void main()\n{\n    io::printn("Hello, World!");\n}\n';
	menuNew.onclick = () => {
		closeMenu();
		if (editor && !confirm("Create new file? Unsaved changes will be lost.")) return;
		if (editor) { editor.setValue(NEW_TEMPLATE); editor.setPosition({ lineNumber: 1, column: 1 }); editor.focus(); }
		localStorage.setItem("c3_playground_code", NEW_TEMPLATE);
		exampleSelect.value = "";
		history.replaceState(null, null, window.location.pathname);
	};
	// Open File...
	const fileInput = document.createElement("input");
	fileInput.type = "file"; fileInput.accept = ".c3,.c,.h,.txt,*/*"; fileInput.style.display = "none";
	document.body.appendChild(fileInput);
	fileInput.onchange = async () => {
		const file = fileInput.files[0]; if (!file) return;
		const text = await file.text();
		if (editor) { editor.setValue(text); editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 }); editor.focus(); }
		localStorage.setItem("c3_playground_code", text);
		exampleSelect.value = "";
		closeMenu();
		fileInput.value = "";
	};
	menuOpen.onclick = () => { fileInput.click(); };
	// Save As...
	menuSaveAs.onclick = async () => {
		closeMenu();
		if (!editor) return;
		const code = editor.getValue();
		const filename = activeFilePath || "main.c3";
		if (window.showSaveFilePicker) {
			try {
				const handle = await window.showSaveFilePicker({
					suggestedName: filename,
					types: [{ description: "C3 Source", accept: { "text/plain": [".c3"] } }]
				});
				const writable = await handle.createWritable();
				await writable.write(code);
				await writable.close();
				return;
			} catch (e) {
				if (e.name === "AbortError") return;
			}
		}
		const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a"); a.href = url; a.download = filename.split("/").pop();
		document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
	};
	// Reset Layout
	const menuResetLayout = document.getElementById("menuResetLayout");
	if (menuResetLayout) menuResetLayout.onclick = () => { closeMenu(); resetLayout(); };
	// Keyboard shortcuts for menu
	document.addEventListener("keydown", (e) => {
		if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
			if (e.key.toLowerCase() === "n") { e.preventDefault(); menuNew.click(); }
			if (e.key.toLowerCase() === "o") { e.preventDefault(); menuOpen.click(); }
		}
	});
}

// ── File Explorer Sidebar (FILES) ──
const sidebarEl = document.getElementById("sidebar");
const fileTreeEl = document.getElementById("fileTree");
const newFileBtn = document.getElementById("newFileBtn");
const newFolderBtn = document.getElementById("newFolderBtn");
const sidebarCollapseBtn = document.getElementById("sidebarCollapseBtn");
const sidebarShowBtn = document.getElementById("sidebarShowBtn");
const sidebarResizer = document.getElementById("sidebarResizer");
const activeFileLabel = document.getElementById("activeFileLabel");
const mainLayoutEl = document.getElementById("mainLayout");
const fileContextMenu = document.getElementById("fileContextMenu");

const FS_KEY = "c3_playground_files";
const ACTIVE_KEY = "c3_playground_active_file";
const SIDEBAR_W_KEY = "c3_playground_sidebar_w";
const SIDEBAR_COLLAPSED_KEY = "c3_playground_sidebar_collapsed";

let fileEntries = []; // {path, type:'file'|'folder', content?}
let activeFilePath = localStorage.getItem(ACTIVE_KEY) || "";
let selectedPath = "";
let expandedFolders;
try { expandedFolders = new Set(JSON.parse(localStorage.getItem("c3_playground_expanded") || "[]")); } catch { expandedFolders = new Set(); }
let sidebarWidth = parseInt(localStorage.getItem(SIDEBAR_W_KEY) || "260", 10);
if (!Number.isFinite(sidebarWidth) || sidebarWidth < 60 || sidebarWidth > 800) sidebarWidth = 260;
let isExplorerInitialized = false;

function saveFileSystem() {
	localStorage.setItem(FS_KEY, JSON.stringify(fileEntries));
	localStorage.setItem(ACTIVE_KEY, activeFilePath);
	localStorage.setItem("c3_playground_expanded", JSON.stringify([...expandedFolders]));
}
function loadFileSystem(initialCodeFallback) {
	try {
		const raw = localStorage.getItem(FS_KEY);
		if (raw) fileEntries = JSON.parse(raw);
	} catch {}
	if (!Array.isArray(fileEntries) || fileEntries.length === 0) {
		const fallback = initialCodeFallback || 'module main;\nimport std::io;\n\nfn void main()\n{\n    io::printn("Hello, World!");\n}\n';
		fileEntries = [{ path: "main.c3", type: "file", content: fallback }];
		activeFilePath = "main.c3";
		saveFileSystem();
	}
	if (!fileEntries.some(e => e.path === activeFilePath && e.type === "file")) {
		const firstFile = fileEntries.find(e => e.type === "file");
		activeFilePath = firstFile ? firstFile.path : "";
	}
	selectedPath = activeFilePath;
}
function getFileEntry(path) { return fileEntries.find(e => e.path === path); }
function getAllFileContents() {
	return fileEntries.filter(e => e.type === "file").map(e => ({ path: e.path, content: e.content || "" }));
}
function normalizePath(input, baseFolder) {
	let p = input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
	if (!p) return "";
	if (baseFolder && !p.includes("/")) p = baseFolder.replace(/\/$/, "") + "/" + p;
	if (!p.endsWith(".c3") && !p.includes(".")) {
		// keep as is for folders; files should have extension but allow any
	}
	return p;
}
function ensureUniquePath(path) {
	if (!fileEntries.some(e => e.path === path)) return path;
	let i = 1;
	const dot = path.lastIndexOf(".");
	const base = dot > 0 ? path.slice(0, dot) : path;
	const ext = dot > 0 ? path.slice(dot) : "";
	while (fileEntries.some(e => e.path === `${base}_${i}${ext}`)) i++;
	return `${base}_${i}${ext}`;
}
function getSelectedFolder() {
	if (!selectedPath) return "";
	const sel = getFileEntry(selectedPath);
	if (sel && sel.type === "folder") return sel.path;
	if (sel && sel.type === "file") {
		const idx = sel.path.lastIndexOf("/");
		return idx >= 0 ? sel.path.slice(0, idx + 1) : "";
	}
	return "";
}
function createFilePrompt() {
	const folder = getSelectedFolder();
	const hint = folder ? folder + "new_file.c3" : "new_file.c3";
	const name = prompt(`New file name:\n(e.g. ${hint} or src/utils.c3)`, hint);
	if (name === null) return;
	let p = normalizePath(name, "");
	if (!p) return alert("Invalid name");
	if (!p.includes(".")) p += ".c3";
	p = ensureUniquePath(p);
	// ensure parent folders exist as explicit folder entries
	const parts = p.split("/"); parts.pop();
	let cur = "";
	for (const part of parts) { cur += part + "/"; if (!fileEntries.some(e => e.path === cur)) fileEntries.push({ path: cur, type: "folder" }); expandedFolders.add(cur); }
	fileEntries.push({ path: p, type: "file", content: `module ${p.replace(/[^a-zA-Z0-9]/g, "_")} ;\n\nfn void foo()\n{\n}\n` });
	activeFilePath = p; selectedPath = p; saveFileSystem(); renderFileTree(); openFile(p);
}
function createFolderPrompt() {
	const folder = getSelectedFolder();
	const name = prompt(`New folder name:\n(parent: ${folder || "/"})`, "new_folder");
	if (name === null) return;
	let p = name.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	if (!p) return alert("Invalid name");
	let full = (folder ? folder : "") + p + "/";
	full = full.replace(/\/+/g, "/");
	if (fileEntries.some(e => e.path === full)) return alert("Folder already exists");
	fileEntries.push({ path: full, type: "folder" });
	expandedFolders.add(full);
	selectedPath = full;
	saveFileSystem(); renderFileTree();
}
function deletePath(path) {
	const entry = getFileEntry(path); if (!entry) return;
	if (!confirm(`Delete "${path}"?`)) return;
	fileEntries = fileEntries.filter(e => e.path !== path && !e.path.startsWith(path));
	if (activeFilePath === path || activeFilePath.startsWith(path)) {
		const fallback = fileEntries.find(e => e.type === "file");
		activeFilePath = fallback ? fallback.path : "";
		if (fallback && editor) openFile(activeFilePath);
	}
	saveFileSystem(); renderFileTree();
	if (!fileEntries.some(e => e.type === "file")) {
		fileEntries.push({ path: "main.c3", type: "file", content: 'module main;\nimport std::io;\n\nfn void main()\n{\n    io::printn("Hello");\n}\n' });
		activeFilePath = "main.c3"; saveFileSystem(); renderFileTree(); if (editor) openFile(activeFilePath);
	}
}
function renamePath(oldPath) {
	const entry = getFileEntry(oldPath); if (!entry) return;
	const newName = prompt(`Rename "${oldPath}" to:`, oldPath);
	if (newName === null) return;
	let np = newName.trim().replace(/\\/g, "/").replace(/^\/+/, "");
	if (!np) return;
	if (entry.type === "folder" && !np.endsWith("/")) np += "/";
	if (fileEntries.some(e => e.path === np)) return alert("Name already exists");
	const isFolder = entry.type === "folder";
	fileEntries.forEach(e => {
		if (e.path === oldPath) e.path = np;
		else if (isFolder && e.path.startsWith(oldPath)) e.path = np + e.path.slice(oldPath.length);
	});
	if (activeFilePath === oldPath) activeFilePath = np;
	else if (isFolder && activeFilePath.startsWith(oldPath)) activeFilePath = np + activeFilePath.slice(oldPath.length);
	if (selectedPath === oldPath) selectedPath = np;
	saveFileSystem(); renderFileTree();
	if (editor && getFileEntry(activeFilePath)) openFile(activeFilePath);
}
function openFile(path) {
	const entry = getFileEntry(path); if (!entry || entry.type !== "file") return;
	activeFilePath = path; selectedPath = path;
	document.querySelectorAll(".file-item.active").forEach(el => el.classList.remove("active"));
	saveFileSystem(); renderFileTree();
	const content = entry.content || "";
	if (editor) {
		const pos = editor.getPosition();
		editor.setValue(content);
		if (pos) editor.setPosition(pos);
		editor.focus();
		activeFileLabel.textContent = "— " + path;
	} else {
		activeFileLabel.textContent = "— " + path;
		localStorage.setItem("c3_playground_code", content);
	}
}
function buildTree() {
	const root = { name: "", path: "", type: "folder", children: new Map() };
	for (const e of fileEntries) {
		const parts = e.path.split("/").filter(Boolean);
		const isFolder = e.type === "folder";
		let cur = root;
		let curPath = "";
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;
			curPath += part + (isLast && isFolder ? "/" : (i < parts.length - 1 ? "/" : ""));
			let child = cur.children.get(part);
			if (!child) {
				const nodeIsFolder = !isLast || isFolder;
				child = { name: part, path: curPath, type: nodeIsFolder ? "folder" : "file", entry: isLast ? e : null, children: new Map() };
				cur.children.set(part, child);
			} else if (isLast) {
				child.entry = e;
				child.type = e.type;
				child.path = e.path;
			}
			cur = child;
		}
	}
	return root;
}
function renderFileTree() {
	if (!fileTreeEl) return;
	const root = buildTree();
	fileTreeEl.innerHTML = "";
	if (fileEntries.length === 0) {
		fileTreeEl.innerHTML = `<div class="sidebar-empty">No files yet.<br>Click + to create.</div>`;
		return;
	}
	const renderNode = (node, depth) => {
		const container = document.createElement("div");
		for (const child of [...node.children.values()].sort((a,b) => {
			if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
			return a.name.localeCompare(b.name);
		})) {
			const isFolder = child.type === "folder";
			const item = document.createElement("div");
			item.className = `file-item ${isFolder ? "folder" : "file"} ${selectedPath === child.path || activeFilePath === child.path ? "active" : ""}`;
			item.dataset.path = child.path;
			const indent = depth * 10;
			item.style.paddingLeft = (6 + indent) + "px";
			const icon = isFolder
				? (expandedFolders.has(child.path) ? `<svg class="file-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>` : `<svg class="file-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`)
				: `<svg class="file-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
			const chevron = isFolder ? `<span style="font-size:0.7rem;opacity:0.6">${expandedFolders.has(child.path) ? "▾" : "▸"}</span>` : "";
			item.innerHTML = `${chevron} ${icon} <span class="file-name">${child.name}${isFolder ? "/" : ""}</span>`;
			item.onclick = (e) => {
				e.stopPropagation();
				selectedPath = child.path;
				if (isFolder) {
					if (expandedFolders.has(child.path)) expandedFolders.delete(child.path); else expandedFolders.add(child.path);
					saveFileSystem(); renderFileTree();
				} else {
					openFile(child.path);
				}
			};
			item.oncontextmenu = (e) => { e.preventDefault(); selectedPath = child.path; renderFileTree(); showContextMenu(e.clientX, e.clientY, child.path); };
			container.appendChild(item);
			if (isFolder && expandedFolders.has(child.path)) {
				const nested = document.createElement("div");
				nested.className = "file-nested";
				nested.appendChild(renderNode(child, depth + 1));
				container.appendChild(nested);
			}
		}
		return container;
	};
	fileTreeEl.appendChild(renderNode(root, 0));
	if (activeFilePath) activeFileLabel.textContent = "— " + activeFilePath;
	else activeFileLabel.textContent = "";
}
function showContextMenu(x, y, path) {
	if (!fileContextMenu) return;
	fileContextMenu.innerHTML = `
		<button class="menu-item" data-act="rename">Rename</button>
		<button class="menu-item" data-act="delete" style="color:#f87171">Delete</button>
	`;
	fileContextMenu.style.left = x + "px";
	fileContextMenu.style.top = y + "px";
	fileContextMenu.style.display = "flex";
	fileContextMenu.classList.add("open");
	fileContextMenu.querySelectorAll("button").forEach(btn => {
		btn.onclick = () => {
			hideContextMenu();
			if (btn.dataset.act === "rename") renamePath(path);
			if (btn.dataset.act === "delete") deletePath(path);
		};
	});
}
function hideContextMenu() { if (fileContextMenu) { fileContextMenu.style.display = "none"; fileContextMenu.classList.remove("open"); } }
document.addEventListener("click", hideContextMenu);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideContextMenu(); });

// Sidebar collapse / expand
function applySidebarCollapsed(collapsed) {
	if (!sidebarEl || !mainLayoutEl) return;
	if (collapsed) {
		sidebarEl.classList.add("collapsed");
		mainLayoutEl.classList.add("sidebar-collapsed");
		sidebarResizer.style.display = "none";
		sidebarShowBtn.style.display = "";
	} else {
		sidebarEl.classList.remove("collapsed");
		mainLayoutEl.classList.remove("sidebar-collapsed");
		sidebarResizer.style.display = "";
		sidebarShowBtn.style.display = "none";
	}
	localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
	applyLayout();
	if (editor) setTimeout(() => editor.layout(), 50);
}
const initiallyCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
applySidebarCollapsed(initiallyCollapsed);
if (sidebarCollapseBtn) sidebarCollapseBtn.onclick = () => applySidebarCollapsed(true);
if (sidebarShowBtn) sidebarShowBtn.onclick = () => applySidebarCollapsed(false);
if (newFileBtn) newFileBtn.onclick = createFilePrompt;
if (newFolderBtn) newFolderBtn.onclick = createFolderPrompt;

// Sidebar resize
function applySidebarWidth(w) {
	sidebarWidth = Math.max(160, Math.min(520, w));
	localStorage.setItem(SIDEBAR_W_KEY, String(sidebarWidth));
	applyLayout();
	if (editor) editor.layout();
}
applySidebarWidth(sidebarWidth);
if (sidebarResizer) {
	let dragging = false;
	sidebarResizer.addEventListener("mousedown", (e) => { dragging = true; sidebarResizer.classList.add("dragging"); document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; e.preventDefault(); });
	document.addEventListener("mousemove", (e) => {
		if (!dragging) return;
		const rect = mainLayoutEl.getBoundingClientRect();
		const newW = e.clientX - rect.left - 12; // 12 = main padding
		applySidebarWidth(newW);
	});
	document.addEventListener("mouseup", () => {
		if (!dragging) return;
		dragging = false; sidebarResizer.classList.remove("dragging"); document.body.style.cursor = ""; document.body.style.userSelect = "";
	});
}

if (canvasFullscreenBtn) {
	canvasFullscreenBtn.onclick = () => {
		if (!document.fullscreenElement) {
			if (canvasContainer.requestFullscreen) canvasContainer.requestFullscreen();
		} else if (document.exitFullscreen) {
			document.exitFullscreen();
		}
		canvasFullscreenBtn.blur();
		const canvasEl = document.getElementById("canvas");
		if (canvasEl) {
			try { canvasEl.focus(); } catch (e) {}
		}
	};
}

document.addEventListener("fullscreenchange", () => {
	setTimeout(fitCanvasToContainer, 50);
});

window.addEventListener('click', resumeAudioIfSuspended, { passive: true });

// Monaco Initialization
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.56.0/min/vs' } });

require(['vs/editor/editor.main'], async () => {
	setupMonacoC3(monaco);
	// Init file system before UI (uses saved files if any)
	loadFileSystem();

	// 1. Populate Examples Dropdown with Categorized optgroup Sections
	exampleSelect.replaceChildren();
	const placeholderOpt = document.createElement("option");
	placeholderOpt.value = "";
	placeholderOpt.disabled = true;
	placeholderOpt.selected = true;
	placeholderOpt.hidden = true;
	placeholderOpt.textContent = "Examples...";
	exampleSelect.appendChild(placeholderOpt);

	// Group examples by category
	const categories = new Map();
	EXAMPLES_MANIFEST.forEach(ex => {
		const cat = ex.category || "General";
		if (!categories.has(cat)) categories.set(cat, []);
		categories.get(cat).push(ex);
	});

	for (const [catName, examples] of categories.entries()) {
		const group = document.createElement("optgroup");
		group.label = catName;
		examples.forEach(ex => {
			const opt = document.createElement("option");
			opt.value = ex.file;
			opt.dataset.id = ex.id;
			opt.textContent = ex.name;
			group.appendChild(opt);
		});
		exampleSelect.appendChild(group);
	}

	// 2. Load Initial Code (supporting URL example, paste snippet, or file explorer)
	const shared = await getSharedCode();
	let initialCode = "";
	let matchedExampleFile = null;
	let fromExplorer = false;

	if (shared && shared.type === 'example') {
		const found = EXAMPLES_MANIFEST.find(e => e.id === shared.id || e.file === shared.id);
		if (found) {
			matchedExampleFile = found.file;
			initialCode = await fetchExampleCode(found.file);
		}
	} else if (shared && shared.type === 'snippet') {
		initialCode = shared.code;
	}

	if (!initialCode) {
		// Prefer file explorer active file
		const activeEntry = getFileEntry(activeFilePath);
		if (activeEntry && activeEntry.type === "file" && activeEntry.content) {
			initialCode = activeEntry.content;
			fromExplorer = true;
		} else {
			const savedCode = localStorage.getItem("c3_playground_code");
			if (savedCode) initialCode = savedCode;
			else { initialCode = await fetchExampleCode(EXAMPLES_MANIFEST[0].file); matchedExampleFile = EXAMPLES_MANIFEST[0].file; }
		}
	}
	// Ensure fileEntries reflect initialCode if not from explorer
	if (!fromExplorer && initialCode) {
		const entry = getFileEntry(activeFilePath);
		if (entry) entry.content = initialCode;
		else if (activeFilePath) fileEntries.push({ path: activeFilePath, type: "file", content: initialCode });
		saveFileSystem();
	}

	// 3. Create Monaco Instance with Full Settings
	const initialTheme = localStorage.getItem("c3_playground_theme") || "dark";
	applyAppTheme(initialTheme);
	editor = monaco.editor.create(document.getElementById("code"), {
		value: initialCode,
		language: 'c3',
		theme: initialTheme === "light" ? "c3PlaygroundThemeLight" : "c3PlaygroundTheme",
		automaticLayout: true,
		fontSize: 14,
		lineHeight: 22,
		tabSize: 4,
		insertSpaces: false,
		detectIndentation: false,
		minimap: { enabled: true },
		unicodeHighlight: {
			allowedLocales: { el: true }
		}
	});

	if (matchedExampleFile) {
		exampleSelect.value = matchedExampleFile;
	}

	editor.layout();
	editor.focus();
	registerEditorCommands(monaco);
	renderFileTree();

	// 4. Save edits & reset dropdown placeholder when code changes
	editor.onDidChangeModelContent(() => {
		const code = editor.getValue();
		localStorage.setItem("c3_playground_code", code);
		const ent = getFileEntry(activeFilePath);
		if (ent) { ent.content = code; saveFileSystem(); }
		exampleSelect.value = "";
		queueDocgenUpdate(code);
	});

	editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
		if (!compileBtn.disabled) compileBtn.click();
	});

	editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCodeToDisk);

	// 5. Fetch example, update URL query & auto-compile and run immediately
	exampleSelect.onchange = async () => {
		if (!exampleSelect.value) return;
		clearConsole();
		const selectedFile = exampleSelect.value;
		const code = await fetchExampleCode(selectedFile);
		// Write to active explorer file as well
		const ent = getFileEntry(activeFilePath);
		if (ent) { ent.content = code; saveFileSystem(); renderFileTree(); }
		editor.setValue(code);
		editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
		editor.setPosition({ lineNumber: 1, column: 1 });
		localStorage.setItem("c3_playground_code", code);
		exampleSelect.value = selectedFile;

		// Update URL parameter so example is shareable
		const selectedEx = EXAMPLES_MANIFEST.find(e => e.file === selectedFile);
		if (selectedEx) {
			const newUrl = new URL(window.location);
			newUrl.searchParams.set('example', selectedEx.id);
			newUrl.hash = '';
			history.replaceState(null, null, newUrl.toString());
		}

		// Auto-compile and run the selected example
		if (!compileBtn.disabled) {
			compileBtn.click();
		}

		// Return focus to the editor so the user can read/edit immediately
		editor.focus();
	};

// 6. Compiler Pipeline Execution Handler
	compileBtn.onclick = async () => {
		stopExecution();
		resumeAudioIfSuspended();
		clearConsole();

		const codeValue = editor.getValue();
		// Sync active file before compile (multi-file project)
		{ const ent = getFileEntry(activeFilePath); if (ent) { ent.content = codeValue; saveFileSystem(); } }
		const extraFiles = getAllFileContents().map(f => f.path === activeFilePath ? { path: f.path, content: codeValue } : f);
		const assetDirectives = parseAssetDirectives(codeValue);
		let fetchedAssets = [];

		if (assetDirectives.length > 0) {
			setStatus("Fetching assets...", "compiling");
			appendConsole(`[Assets] Found ${assetDirectives.length} asset directive(s)...\n`);
			try {
				fetchedAssets = await fetchAssets(assetDirectives, (msg) => {
					setStatus(msg, "compiling");
					appendConsole(`[Assets] ${msg}\n`);
				});
				appendConsole(`[Assets] All assets loaded successfully.\n`);
			} catch (assetErr) {
				setStatus("Compiler Ready", "ready");
				appendConsole(`\n[Asset Error] ${assetErr.message}\n`, true);
				return;
			}
		}

		let compileStderrBuffer = [];

		executeCompilerTask("compile", codeValue, async (msg) => {
			if (msg.type === "stdout") {
				appendConsole(msg.text);
			} else if (msg.type === "stderr") {
				compileStderrBuffer.push(msg.text);
				appendConsole(msg.text, true);
			} else if (msg.type === "compiled") {
				appendConsole(`\n[WASM Linked: ${msg.wasm.byteLength} bytes]\n`);
				await runEmscriptenProgram(msg.wasm, fetchedAssets);
				const markers = parseCompilerErrors(compileStderrBuffer.join('\n'), editor.getModel(), monaco);
				monaco.editor.setModelMarkers(editor.getModel(), "c3", markers);
			} else if (msg.type === "failed") {
				appendConsole(`\n[Compilation Failed]\n${msg.error}\n`);
				const markers = parseCompilerErrors(compileStderrBuffer.join('\n'), editor.getModel(), monaco);
				monaco.editor.setModelMarkers(editor.getModel(), "c3", markers);
			}
		}, extraFlagsInput.value, setStatus, fetchedAssets, extraFiles);
	};

	try {
		await preloadCompilerAssets(setStatus);
		queryCompilerVersion(vText => { statusTooltipEl.textContent = vText; });
		setStatus("Compiler Ready", "ready");
		compileBtn.disabled = false;
		queueDocgenUpdate(editor.getValue());
		// Kick off stdlib HTML docgen in the background - no-op if already cached
		setTimeout(() => triggerStdlibDocgenHtml(), 100);

		// Auto-run on startup if loaded directly from an example URL param
		if (shared && shared.type === 'example' && matchedExampleFile) {
			compileBtn.click();
		}

		// Background prefetch all examples so dropdown switches are instant
		prefetchAllExamples();
	} catch (err) {
		setStatus("Initialization Failed", "");
		appendConsole(`\n[Fatal Error] Failed to initialize compiler: ${err.message}\n`);
	}
});

// --- Stdlib Docs Modal ---
const stdlibDocsModal = document.getElementById('stdlibDocsModal');
const stdlibDocsIframe = document.getElementById('stdlibDocsIframe');
const stdlibDocsClose = document.getElementById('stdlibDocsClose');

function closeStdlibModal() {
	stdlibDocsModal.classList.remove('open');
	stdlibDocsIframe.src = 'about:blank';
}

stdlibDocsClose.addEventListener('click', closeStdlibModal);
stdlibDocsModal.addEventListener('click', (e) => {
	if (e.target === stdlibDocsModal) closeStdlibModal();
});
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && stdlibDocsModal.classList.contains('open')) closeStdlibModal();
});

// Nav docs button → open local docs modal
document.getElementById('docsBtn').addEventListener('click', () => openStdlibDoc(''));


window.addEventListener('message', (e) => {
	if (!e.data || e.source !== stdlibDocsIframe.contentWindow) return;
	if (e.data.type === 'close-stdlib-docs') {
		closeStdlibModal();
	} else if (e.data.type === 'read_stdlib_file') {
		const { path, line } = e.data;
		readStdlibFile(path, (content, error) => {
			try {
				stdlibDocsIframe.contentWindow.postMessage(
					{ type: 'stdlib_file_content', path, line, content, error }, '*'
				);
			} catch (_) {}
		});
	}
});

window.addEventListener('open-stdlib-doc', (e) => {
	const { html, uid } = e.detail;

	// Patch the HTML before injecting as srcdoc:
	let patched = html;

	// 1. Inject iframe patch script (history sandbox override, file link observer, source viewer)
	const patchScript = getDocsIframePatchJs();
	if (patchScript) {
		patched = patched.replace('<head>', `<head><script>${patchScript}<\/script>`);
	}

	// 2. Remove c3-lang.org assets blocked by CORP
	patched = patched.replace(/<link[^>]+c3-lang\.org[^>]+>/gi, '');
	patched = patched.replace(/<img[^>]+c3-lang\.org[^>]+>/gi, '');

	stdlibDocsIframe.srcdoc = patched;
	stdlibDocsModal.classList.add('open');
	stdlibDocsIframe.onload = () => {
		try { stdlibDocsIframe.contentWindow.location.hash = encodeURIComponent(uid); } catch {}
		stdlibDocsIframe.onload = null;
	};
});


function getFreshCanvas() {
	const container = document.getElementById("canvasContainer");
	let wrapper = document.querySelector(".canvas-wrapper");
	if (!wrapper && container) {
		wrapper = document.createElement("div");
		wrapper.className = "canvas-wrapper";
		container.appendChild(wrapper);
	}
	const oldCanvas = document.getElementById("canvas");
	const newCanvas = document.createElement("canvas");
	newCanvas.id = "canvas";
	newCanvas.tabIndex = 0;
	newCanvas.addEventListener("mousedown", () => newCanvas.focus());
	newCanvas.addEventListener("contextmenu", (e) => e.preventDefault());

	if (oldCanvas && oldCanvas.parentNode) {
		oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
	} else if (wrapper) {
		wrapper.appendChild(newCanvas);
	}

	if (document.pointerLockElement) {
		try { document.exitPointerLock(); } catch (_) {}
	}

	if (wrapper) {
		canvasResizeObserver.disconnect();
		canvasResizeObserver.observe(wrapper);
	}
	return newCanvas;
}

async function runEmscriptenProgram(wasmBuffer, assets = []) {
	const runtimeFn = window.C3EmscriptenRuntime;
	if (!runtimeFn) {
		appendConsole("\n[Error] C3EmscriptenRuntime not found.\n");
		return;
	}

	try {
		const canvasEl = getFreshCanvas();

		const instance = await runtimeFn({
			wasmBinary: wasmBuffer,
			canvas: canvasEl,
			print: (t) => appendConsole(t + "\n"),
			printErr: (t) => appendConsole(t + "\n", true),
			onExit: (code) => appendConsole(`\nProgram exited with code: ${code}\n`),
			noInitialRun: true
		});

		currentEmscriptenInstance = instance;

		// Mount/write assets into the Emscripten runtime VFS
		if (assets && assets.length > 0) {
			const fs = instance.FS || (instance.wasmExports && instance.wasmExports.FS);
			if (!fs) {
				console.error("[Runtime] FS not found on Emscripten instance!", instance);
				appendConsole("\n[Runtime Error] Virtual File System (FS) is not available on runtime instance.\n", true);
			} else {
				for (const asset of assets) {
					writeVfsFile(fs, asset.path, asset.data);
				}
			}
		}

		const mainFn = instance.wasmExports?.main || instance.wasmExports?.['__main_argc_argv'];
		if (mainFn) {
			const ret = mainFn(0, 0);
			appendConsole(`\n[Process finished with exit code ${ret}]\n`);
		}
	} catch (err) {
		if (err === "unwind" || err?.name === "ExitStatus") {
			// Normal Emscripten loop unwinding when simulate_infinite_loop is 1
			return;
		}
		appendConsole(`\n[Execution Error] ${err}\n`);
	}
}

// Console Line Click Navigation
outputEl.onclick = (e) => {
	if (e.target && e.target.classList.contains('console-link')) {
		const line = parseInt(e.target.getAttribute('data-line'), 10);
		const col = parseInt(e.target.getAttribute('data-col'), 10);
		if (editor && line) {
			editor.revealLineInCenter(line);
			editor.setPosition({ lineNumber: line, column: col });
			editor.focus();
		}
	}
};

clearBtn.onclick = clearConsole;
saveBtn.onclick = saveCodeToDisk;

async function saveCodeToDisk() {
	if (!editor) return;
	const code = editor.getValue();
	const filename = activeFilePath || "main.c3";
	if (window.showSaveFilePicker) {
		try {
			const handle = await window.showSaveFilePicker({
				suggestedName: filename,
				types: [{ description: "C3 Source", accept: { "text/plain": [".c3"] } }]
			});
			const writable = await handle.createWritable();
			await writable.write(code);
			await writable.close();
			return;
		} catch (e) {
			if (e.name === "AbortError") return;
		}
	}
	const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename.split("/").pop();
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

copyBtn.onclick = () => {
	if (!editor) return;
	navigator.clipboard.writeText(editor.getValue()).then(() => {
		copyBtn.innerHTML = `
	  <svg viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<polyline points="20 6 9 17 4 12"></polyline>
	  </svg>
	`;
		copyBtn.title = "Copied!";
		setTimeout(() => {
			copyBtn.innerHTML = DEFAULT_COPY_HTML;
			copyBtn.title = "Copy Code";
		}, 1500);
	});
};

const DEFAULT_SHARE_HTML = shareBtn.innerHTML;
let shareResetTimeout = null;

shareBtn.onclick = async () => {
	if (!editor) return;
	shareBtn.disabled = true;
	shareBtn.title = "Generating Link...";

	try {
		await createShareLink(editor.getValue());
		shareBtn.innerHTML = `
	  <svg viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<polyline points="20 6 9 17 4 12"></polyline>
	  </svg>
	`;
		shareBtn.title = "Link Copied!";
	} catch (err) {
		console.error("Failed to share code:", err);
		alert("Could not reach pastes.dev API");
	} finally {
		shareBtn.disabled = false;
		clearTimeout(shareResetTimeout);
		shareResetTimeout = setTimeout(() => {
			shareBtn.innerHTML = DEFAULT_SHARE_HTML;
			shareBtn.title = "Share Code";
		}, 1500);
	}
};