
const STORE_DIR = "_vc_mod_manager_v1";
const META_FILE = "mods.json";
const BACKUP_DIR = "backups";
const TEXT_EXTS = new Set(["txt","cfg","dat","ide","ipl","ini","json","xml","md","log","csv","zon"]);
const PROTECTED_ROOTS = new Set(["_game_ready", "_dl_tmp", STORE_DIR]);
const GAME_PROXY_URL = import.meta.env.VITE_ASSET_URL || "https://gta-proxy.editingking-2977.workers.dev/";
const BASE = import.meta.env.BASE_URL;

let overlay, statusEl, modsList, filesList, filesSearch, filesCount;
let workspaceList, workspaceSearch, workspaceName, workspaceCount;
let editor, editorText, editorName;
let workspace = new Map();
let workspaceSourceName = "vice-city-mod.zip";
let editing = null;
let pendingReplace = null;
let gameFiles = [];
let initialized = false;

function supported() {
  return !!(navigator.storage && navigator.storage.getDirectory);
}

function setStatus(message, isError) {
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.classList.toggle("is-error", !!isError);
}

function fmt(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(n > 102400 ? 0 : 1) + " KB";
  if (n < 1073741824) return (n / 1048576).toFixed(n > 104857600 ? 0 : 1) + " MB";
  return (n / 1073741824).toFixed(2) + " GB";
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cleanPath(raw) {
  const parts = String(raw || "").replace(/\\/g, "/").replace(/^\/+/, "")
    .split("/").filter(function(p) { return p && p !== "."; });
  if (!parts.length || parts.some(function(p) { return p === ".."; })) return null;
  return parts;
}

function ext(name) {
  const base = String(name || "").split("/").pop() || "";
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

function isText(name) {
  return TEXT_EXTS.has(ext(name));
}

async function ensureFflate() {
  if (window.fflate && window.fflate.unzipSync && window.fflate.zipSync) return window.fflate;
  await new Promise(function(resolve, reject) {
    const existing = document.querySelector('script[data-vc-fflate="1"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js";
    script.crossOrigin = "anonymous";
    script.dataset.vcFflate = "1";
    script.onload = resolve;
    script.onerror = function() { reject(new Error("Could not load ZIP support.")); };
    document.head.appendChild(script);
  });
  if (!window.fflate || !window.fflate.unzipSync) throw new Error("ZIP support did not initialize.");
  return window.fflate;
}

async function rootDir() {
  if (!supported()) throw new Error("OPFS is not supported in this browser.");
  return navigator.storage.getDirectory();
}

async function managerDir(create) {
  return (await rootDir()).getDirectoryHandle(STORE_DIR, { create: create !== false });
}

async function backupRoot(create) {
  return (await managerDir(create !== false)).getDirectoryHandle(BACKUP_DIR, { create: create !== false });
}

async function readMeta() {
  try {
    const dir = await managerDir(false);
    const handle = await dir.getFileHandle(META_FILE);
    const data = JSON.parse(await (await handle.getFile()).text());
    return data && Array.isArray(data.mods) ? data : { mods: [] };
  } catch (_) {
    return { mods: [] };
  }
}

async function writeMeta(meta) {
  const dir = await managerDir(true);
  const handle = await dir.getFileHandle(META_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify({ version: 1, mods: meta.mods || [] }, null, 2));
  await writable.close();
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : "mod-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

async function dirAt(parts, create, base) {
  let dir = base || await rootDir();
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: !!create });
  return dir;
}

async function fileAt(parts, create) {
  if (!parts || !parts.length) throw new Error("Invalid file path.");
  const dir = await dirAt(parts.slice(0, -1), create);
  return dir.getFileHandle(parts[parts.length - 1], { create: !!create });
}

async function readFile(parts) {
  return (await fileAt(parts, false)).getFile();
}

async function writeFile(parts, data) {
  const handle = await fileAt(parts, true);
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function removeFile(parts) {
  const dir = await dirAt(parts.slice(0, -1), false);
  await dir.removeEntry(parts[parts.length - 1]);
}

async function exists(parts) {
  try { await fileAt(parts, false); return true; } catch (_) { return false; }
}

async function storeZip(name, blob) {
  const dir = await managerDir(true);
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function getStoredZip(mod) {
  const dir = await managerDir(false);
  return (await dir.getFileHandle(mod.storageName)).getFile();
}

async function removeStoredZip(name) {
  try { await (await managerDir(false)).removeEntry(name); } catch (_) {}
}

async function unzipFile(file) {
  const fflate = await ensureFflate();
  const entries = fflate.unzipSync(new Uint8Array(await file.arrayBuffer()));
  const map = new Map();
  Object.keys(entries).forEach(function(name) {
    const parts = cleanPath(name);
    if (parts && !String(name).endsWith("/")) map.set(parts.join("/"), entries[name]);
  });
  return map;
}

function targetPath(name) {
  const parts = cleanPath(name);
  if (!parts) return null;
  const first = parts[0].toLowerCase();
  if (first !== "vcsky" && first !== "vcbr") return null;
  return parts;
}

async function backupFile(modId, parts) {
  const source = await readFile(parts);
  let dir = await backupRoot(true);
  dir = await dir.getDirectoryHandle(modId, { create: true });
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
  const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  await source.stream().pipeTo(await handle.createWritable());
}

async function restoreFile(modId, parts) {
  let dir = await backupRoot(false);
  dir = await dir.getDirectoryHandle(modId);
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
  const file = await (await dir.getFileHandle(parts[parts.length - 1])).getFile();
  await writeFile(parts, file);
}

async function removeBackup(modId) {
  try { await (await backupRoot(false)).removeEntry(modId, { recursive: true }); } catch (_) {}
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
}

function normalizeRemoteUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim(), location.href);
  } catch (_) {
    throw new Error("Enter a valid download URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTP/HTTPS download URLs are supported.");
  }
  return parsed.href;
}

function openArchiveDownload(url) {
  const href = normalizeRemoteUrl(url);
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.download = "vc-assets.tar.gz";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus("Opened game archive download: " + href);
}

async function installArchiveFromUrl(url) {
  const href = normalizeRemoteUrl(url);
  if (!confirm("Install/refresh Vice City game files from this URL? Existing files with the same paths can be replaced.\n\n" + href)) return;

  setStatus("Connecting to game archive...");
  await new Promise(function(resolve, reject) {
    const worker = new Worker(BASE + "extract-worker.js");
    let finished = false;

    function finish(error) {
      if (finished) return;
      finished = true;
      worker.terminate();
      if (error) reject(error);
      else resolve();
    }

    worker.onerror = function(event) {
      finish(new Error(event.message || "Archive worker crashed."));
    };

    worker.onmessage = function(event) {
      const msg = event.data || {};
      if (msg.type === "progress") {
        const pct = Number.isFinite(Number(msg.pct)) ? Math.round(Number(msg.pct)) : null;
        const phase = msg.phase === "extracting" ? "Extracting" :
          msg.phase === "reading" ? "Reading" :
          msg.resuming ? "Resuming" : "Downloading";
        const file = msg.file ? " • " + msg.file : "";
        setStatus(phase + (pct !== null ? " " + pct + "%" : "") + file);
        return;
      }
      if (msg.type === "done") {
        finish();
        return;
      }
      if (msg.type === "error") {
        finish(new Error(msg.message || "Archive install failed."));
      }
    };

    worker.postMessage({ url: href });
  });

  window.__gtaGameReady = true;
  const play = document.getElementById("click-to-play-button");
  if (play) {
    play.disabled = false;
    play.classList.remove("disabled");
  }
  gameFiles = [];
  await refreshFiles();
  setStatus("Game files installed/refreshed from the download URL. Reload or restart Vice City before playing.");
}

async function moveGameFile(oldParts, newParts) {
  if (!oldParts || !newParts) throw new Error("Invalid file path.");
  if (PROTECTED_ROOTS.has(oldParts[0]) || PROTECTED_ROOTS.has(newParts[0])) {
    throw new Error("That path is protected.");
  }
  if (oldParts.join("/") === newParts.join("/")) return;
  if (await exists(newParts) && !confirm("A file already exists at " + newParts.join("/") + ". Replace it?")) return;
  const file = await readFile(oldParts);
  await writeFile(newParts, file);
  await removeFile(oldParts);
}

async function installZip(file) {
  if (!file || !/\.zip$/i.test(file.name)) throw new Error("Choose a ZIP mod package.");
  setStatus("Inspecting " + file.name + "...");
  const entries = await unzipFile(file);
  if (!entries.size) throw new Error("The ZIP contains no files.");

  const id = makeId();
  const storageName = id + ".zip";
  await storeZip(storageName, file);
  const compatible = Array.from(entries.keys()).filter(function(name) { return !!targetPath(name); }).length;
  const meta = await readMeta();
  meta.mods.push({
    id: id,
    name: file.name,
    storageName: storageName,
    size: file.size,
    entryCount: entries.size,
    compatibleCount: compatible,
    enabled: false,
    addedAt: new Date().toISOString(),
    applied: []
  });
  await writeMeta(meta);
  setStatus("Stored " + file.name + ". " + compatible + " file(s) match vcsky/ or vcbr/ paths.");
  await renderMods();
}

async function applyMod(id) {
  const meta = await readMeta();
  const mod = meta.mods.find(function(item) { return item.id === id; });
  if (!mod || mod.enabled) return;
  const entries = await unzipFile(await getStoredZip(mod));
  const applied = [];
  let written = 0;
  let skipped = 0;
  setStatus("Applying " + mod.name + "...");

  for (const pair of entries) {
    const name = pair[0];
    const bytes = pair[1];
    const parts = targetPath(name);
    if (!parts || PROTECTED_ROOTS.has(parts[0])) { skipped++; continue; }
    const hadFile = await exists(parts);
    if (hadFile) await backupFile(mod.id, parts);
    await writeFile(parts, bytes);
    applied.push({ path: parts.join("/"), existed: hadFile });
    written++;
  }

  if (!written) throw new Error("No files applied. ZIP paths must begin with vcsky/ or vcbr/.");
  mod.enabled = true;
  mod.applied = applied;
  mod.lastAppliedAt = new Date().toISOString();
  await writeMeta(meta);
  setStatus("Applied " + written + " file(s). " + (skipped ? skipped + " unmatched file(s) skipped. " : "") + "Restart Vice City to load changed assets.");
  await renderMods();
}

async function disableMod(id) {
  const meta = await readMeta();
  const mod = meta.mods.find(function(item) { return item.id === id; });
  if (!mod || !mod.enabled) return;
  setStatus("Restoring files for " + mod.name + "...");
  const applied = (mod.applied || []).slice().reverse();
  for (const item of applied) {
    const parts = cleanPath(item.path);
    if (!parts) continue;
    if (item.existed) await restoreFile(mod.id, parts);
    else { try { await removeFile(parts); } catch (_) {} }
  }
  await removeBackup(mod.id);
  mod.enabled = false;
  mod.applied = [];
  await writeMeta(meta);
  setStatus("Disabled " + mod.name + " and restored backups. Restart Vice City.");
  await renderMods();
}

async function deleteMod(id) {
  let meta = await readMeta();
  let mod = meta.mods.find(function(item) { return item.id === id; });
  if (!mod) return;
  if (mod.enabled) await disableMod(id);
  meta = await readMeta();
  const index = meta.mods.findIndex(function(item) { return item.id === id; });
  if (index < 0) return;
  mod = meta.mods.splice(index, 1)[0];
  await removeStoredZip(mod.storageName);
  await removeBackup(id);
  await writeMeta(meta);
  setStatus("Removed " + mod.name + ".");
  await renderMods();
}

async function renameMod(id) {
  const meta = await readMeta();
  const mod = meta.mods.find(function(item) { return item.id === id; });
  if (!mod) return;
  let next = prompt("Rename stored mod ZIP:", mod.name || "vice-city-mod.zip");
  if (next == null) return;
  next = next.trim();
  if (!next) return;
  if (!/\.zip$/i.test(next)) next += ".zip";
  mod.name = next;
  await writeMeta(meta);
  setStatus("Renamed mod package to " + next + ".");
  await renderMods();
}

async function openModWorkspace(id) {
  const meta = await readMeta();
  const mod = meta.mods.find(function(item) { return item.id === id; });
  if (!mod) return;
  workspace = await unzipFile(await getStoredZip(mod));
  workspaceSourceName = mod.name || "vice-city-mod.zip";
  workspaceName.textContent = workspaceSourceName;
  showTab("workspace");
  renderWorkspace();
  setStatus("Opened " + workspaceSourceName + " in ZIP Workspace.");
}

async function renderMods() {
  const meta = await readMeta();
  if (!meta.mods.length) {
    modsList.innerHTML = '<div class="vc-mm-empty">No ZIP mods stored. Upload a mod package to inspect it.</div>';
    return;
  }
  modsList.innerHTML = meta.mods.map(function(mod) {
    return '<article class="vc-mm-mod-card" data-id="' + esc(mod.id) + '">' +
      '<div class="vc-mm-mod-main"><strong>' + esc(mod.name) + '</strong><span>' +
      fmt(mod.size) + ' • ' + Number(mod.entryCount || 0) + ' files • ' +
      Number(mod.compatibleCount || 0) + ' path-matched</span></div>' +
      '<span class="vc-mm-state ' + (mod.enabled ? 'is-on' : '') + '">' + (mod.enabled ? 'APPLIED' : 'STORED') + '</span>' +
      '<div class="vc-mm-actions">' +
      '<button type="button" data-action="' + (mod.enabled ? 'disable' : 'apply') + '">' + (mod.enabled ? 'Restore / Disable' : 'Apply') + '</button>' +
      '<button type="button" data-action="workspace">Edit ZIP</button>' +
      '<button type="button" data-action="rename">Rename</button>' +
      '<button type="button" data-action="download">Download ZIP</button>' +
      '<button type="button" class="danger" data-action="delete">Delete</button></div></article>';
  }).join("");

  modsList.querySelectorAll(".vc-mm-mod-card").forEach(function(card) {
    card.addEventListener("click", async function(event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      button.disabled = true;
      try {
        const id = card.dataset.id;
        const action = button.dataset.action;
        if (action === "apply") await applyMod(id);
        if (action === "disable") await disableMod(id);
        if (action === "workspace") await openModWorkspace(id);
        if (action === "rename") await renameMod(id);
        if (action === "download") {
          const metaNow = await readMeta();
          const modNow = metaNow.mods.find(function(item) { return item.id === id; });
          if (modNow) downloadBlob(await getStoredZip(modNow), modNow.name);
        }
        if (action === "delete" && confirm("Delete this stored mod package?")) await deleteMod(id);
      } catch (error) {
        setStatus(error && error.message ? error.message : String(error), true);
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function walk(dir, prefix, out, limit) {
  if (out.length >= limit) return out;
  for await (const pair of dir.entries()) {
    const name = pair[0], handle = pair[1];
    if (!prefix.length && (name === STORE_DIR || name === "_dl_tmp")) continue;
    if (handle.kind === "directory") await walk(handle, prefix.concat(name), out, limit);
    else {
      const file = await handle.getFile();
      out.push({ path: prefix.concat(name).join("/"), size: file.size });
    }
    if (out.length >= limit) break;
  }
  return out;
}

async function refreshFiles() {
  setStatus("Scanning Vice City OPFS files...");
  gameFiles = await walk(await rootDir(), [], [], 3000);
  renderFiles();
  setStatus("Found " + gameFiles.length + " browser game file(s).");
}

function renderFiles() {
  const q = String(filesSearch.value || "").trim().toLowerCase();
  const visible = gameFiles.filter(function(item) {
    return !q || item.path.toLowerCase().includes(q);
  }).slice(0, 1000);
  filesCount.textContent = visible.length + " files shown";
  filesList.innerHTML = visible.length ? visible.map(function(item) {
    return '<div class="vc-mm-file-row" data-path="' + esc(item.path) + '">' +
      '<div class="vc-mm-file-name"><strong>' + esc(item.path) + '</strong><span>' + fmt(item.size) + '</span></div>' +
      '<div class="vc-mm-actions">' +
      (isText(item.path) && item.size < 2097152 ? '<button type="button" data-action="edit">Edit</button>' : '') +
      '<button type="button" data-action="download">Download Local</button>' +
      '<button type="button" data-action="rename">Rename</button>' +
      '<button type="button" data-action="replace">Replace</button>' +
      '<button type="button" class="danger" data-action="delete">Delete</button></div></div>';
  }).join("") : '<div class="vc-mm-empty">No matching files.</div>';

  filesList.querySelectorAll(".vc-mm-file-row").forEach(function(row) {
    row.addEventListener("click", async function(event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const path = row.dataset.path;
      const parts = cleanPath(path);
      try {
        if (button.dataset.action === "download") downloadBlob(await readFile(parts), parts[parts.length - 1]);
        if (button.dataset.action === "rename") {
          const nextPath = prompt("New OPFS path:", path);
          if (nextPath && nextPath.trim() && nextPath.trim() !== path) {
            const nextParts = cleanPath(nextPath.trim());
            if (!nextParts) throw new Error("Invalid destination path.");
            await moveGameFile(parts, nextParts);
            await refreshFiles();
            setStatus("Renamed " + path + " to " + nextParts.join("/") + ".");
          }
        }
        if (button.dataset.action === "replace") {
          pendingReplace = path;
          document.getElementById("vc-mm-replace-input").click();
        }
        if (button.dataset.action === "edit") {
          const file = await readFile(parts);
          openEditor(path, await file.text(), "game");
        }
        if (button.dataset.action === "delete" && confirm("Delete " + path + "? This may break the game.")) {
          await removeFile(parts);
          await refreshFiles();
        }
      } catch (error) {
        setStatus(error && error.message ? error.message : String(error), true);
      }
    });
  });
}

async function importWorkspace(file) {
  workspace = await unzipFile(file);
  workspaceSourceName = file.name || "vice-city-mod.zip";
  workspaceName.textContent = workspaceSourceName;
  renderWorkspace();
  setStatus("Opened " + workspace.size + " ZIP file(s).");
}

function renderWorkspace() {
  const q = String(workspaceSearch.value || "").trim().toLowerCase();
  const entries = Array.from(workspace.entries()).filter(function(pair) {
    return !q || pair[0].toLowerCase().includes(q);
  }).sort(function(a,b) { return a[0].localeCompare(b[0]); });
  workspaceCount.textContent = entries.length + " files";
  workspaceList.innerHTML = entries.length ? entries.map(function(pair) {
    const name = pair[0], bytes = pair[1];
    return '<div class="vc-mm-file-row" data-path="' + esc(name) + '">' +
      '<div class="vc-mm-file-name"><strong>' + esc(name) + '</strong><span>' + fmt(bytes.byteLength) + '</span></div>' +
      '<div class="vc-mm-actions">' +
      (isText(name) && bytes.byteLength < 2097152 ? '<button type="button" data-action="edit">Edit</button>' : '') +
      '<button type="button" data-action="rename">Rename</button>' +
      '<button type="button" data-action="replace">Replace</button>' +
      '<button type="button" class="danger" data-action="delete">Delete</button></div></div>';
  }).join("") : '<div class="vc-mm-empty">Upload or open a ZIP to edit its contents.</div>';

  workspaceList.querySelectorAll(".vc-mm-file-row").forEach(function(row) {
    row.addEventListener("click", function(event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const path = row.dataset.path;
      if (button.dataset.action === "edit") openEditor(path, new TextDecoder().decode(workspace.get(path)), "workspace");
      if (button.dataset.action === "rename") {
        const nextRaw = prompt("New ZIP path:", path);
        const nextParts = nextRaw && cleanPath(nextRaw.trim());
        if (nextParts) {
          const next = nextParts.join("/");
          if (next !== path) {
            if (workspace.has(next) && !confirm("Replace existing workspace file " + next + "?")) return;
            workspace.set(next, workspace.get(path));
            workspace.delete(path);
            renderWorkspace();
            setStatus("Renamed workspace file to " + next + ".");
          }
        }
      }
      if (button.dataset.action === "replace") {
        pendingReplace = "workspace:" + path;
        document.getElementById("vc-mm-replace-input").click();
      }
      if (button.dataset.action === "delete") {
        workspace.delete(path);
        renderWorkspace();
      }
    });
  });
}

function openEditor(path, text, source) {
  editing = { path: path, source: source };
  editorName.textContent = path;
  editorText.value = text;
  editor.classList.remove("hidden");
  editorText.focus();
}

async function saveEditor() {
  if (!editing) return;
  if (editing.source === "workspace") {
    workspace.set(editing.path, new TextEncoder().encode(editorText.value));
    renderWorkspace();
  } else {
    await writeFile(cleanPath(editing.path), new TextEncoder().encode(editorText.value));
    await refreshFiles();
  }
  editor.classList.add("hidden");
  setStatus("Saved " + editing.path + ".");
  editing = null;
}

async function exportWorkspace(shouldDownload) {
  if (!workspace.size) throw new Error("ZIP Workspace is empty.");
  const fflate = await ensureFflate();
  const input = {};
  for (const pair of workspace) input[pair[0]] = pair[1];
  setStatus("Building edited ZIP...");
  const bytes = fflate.zipSync(input, { level: 6 });
  const blob = new Blob([bytes], { type: "application/zip" });
  const name = (workspaceSourceName.replace(/\.zip$/i, "") || "vice-city-mod") + "-edited.zip";
  if (shouldDownload) downloadBlob(blob, name);
  setStatus("Built " + name + " (" + fmt(blob.size) + ").");
  return new File([blob], name, { type: "application/zip" });
}

function showTab(name) {
  overlay.querySelectorAll("[data-mm-tab]").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.mmTab === name);
  });
  overlay.querySelectorAll("[data-mm-panel]").forEach(function(panel) {
    panel.classList.toggle("hidden", panel.dataset.mmPanel !== name);
  });
  if (name === "files" && !gameFiles.length) refreshFiles().catch(function(e) { setStatus(e.message, true); });
}

function buildUI() {
  overlay = document.createElement("div");
  overlay.id = "vc-mod-manager";
  overlay.className = "vc-mm-overlay hidden";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML =
    '<section class="vc-mm-panel" role="dialog" aria-modal="true" aria-label="Vice City Mod Manager">' +
    '<header class="vc-mm-header"><div><strong>VICE CITY MOD MANAGER</strong><span>ZIP mods • OPFS files • editable workspace</span></div>' +
    '<button id="vc-mm-close" type="button" aria-label="Close">×</button></header>' +
    '<nav class="vc-mm-tabs"><button type="button" data-mm-tab="mods" class="active">Mods</button>' +
    '<button type="button" data-mm-tab="downloads">Downloads</button><button type="button" data-mm-tab="files">Game Files</button>' +
    '<button type="button" data-mm-tab="workspace">ZIP Workspace</button></nav>' +
    '<div id="vc-mm-status" class="vc-mm-status" aria-live="polite">Ready.</div>' +

    '<div data-mm-panel="mods" class="vc-mm-body"><div class="vc-mm-toolbar">' +
    '<button id="vc-mm-upload-btn" type="button">Upload Mod ZIP</button><button id="vc-mm-refresh-mods" type="button">Refresh</button>' +
    '<input id="vc-mm-upload-input" type="file" accept=".zip,application/zip" hidden></div><div id="vc-mm-mods-list" class="vc-mm-list"></div></div>' +

    '<div data-mm-panel="downloads" class="vc-mm-body hidden">' +
    '<div class="vc-mm-download-card"><strong>Cloudflare Game Archive</strong><code id="vc-mm-proxy-url">' + esc(GAME_PROXY_URL) + '</code>' +
    '<p>Uses the same proxy URL as the normal Vice City installer.</p><div class="vc-mm-actions">' +
    '<button id="vc-mm-proxy-install" type="button">Install / Refresh from Proxy</button>' +
    '<button id="vc-mm-proxy-download" type="button">Download Archive</button></div></div>' +
    '<div class="vc-mm-download-card"><strong>Custom Download URL</strong>' +
    '<input id="vc-mm-custom-url" type="url" placeholder="https://example.com/vc-assets.tar.gz" autocomplete="off">' +
    '<p>Use your own HTTP/HTTPS tar.gz source. It must allow browser access/CORS for installation.</p><div class="vc-mm-actions">' +
    '<button id="vc-mm-custom-install" type="button">Install / Refresh URL</button>' +
    '<button id="vc-mm-custom-download" type="button">Download URL</button></div></div></div>' +

    '<div data-mm-panel="files" class="vc-mm-body hidden"><div class="vc-mm-toolbar">' +
    '<input id="vc-mm-files-search" type="search" placeholder="Search OPFS game files">' +
    '<button id="vc-mm-files-upload-btn" type="button">Upload File</button>' +
    '<button id="vc-mm-files-proxy-download" type="button">Download Game Archive</button>' +
    '<button id="vc-mm-refresh-files" type="button">Refresh Files</button>' +
    '<input id="vc-mm-files-upload-input" type="file" multiple hidden><span id="vc-mm-files-count"></span></div>' +
    '<div class="vc-mm-warning">These are the real browser game files. You can upload, rename, replace, edit, download or delete them. Restart the game after changing assets.</div>' +
    '<div id="vc-mm-files-list" class="vc-mm-list vc-mm-files"></div></div>' +

    '<div data-mm-panel="workspace" class="vc-mm-body hidden"><div class="vc-mm-toolbar">' +
    '<button id="vc-mm-workspace-upload" type="button">Open ZIP</button><button id="vc-mm-workspace-add" type="button">Add Files</button>' +
    '<button id="vc-mm-workspace-export" type="button">Download ZIP</button><button id="vc-mm-workspace-install" type="button">Save as Mod</button>' +
    '<input id="vc-mm-workspace-input" type="file" accept=".zip,application/zip" hidden><input id="vc-mm-workspace-add-input" type="file" multiple hidden></div>' +
    '<div class="vc-mm-workspace-meta"><strong id="vc-mm-workspace-name">No ZIP open</strong>' +
    '<input id="vc-mm-workspace-search" type="search" placeholder="Search ZIP files"><span id="vc-mm-workspace-count">0 files</span></div>' +
    '<div id="vc-mm-workspace-list" class="vc-mm-list vc-mm-files"></div></div>' +

    '<div id="vc-mm-editor" class="vc-mm-editor hidden"><div class="vc-mm-editor-head"><strong id="vc-mm-editor-name">File</strong>' +
    '<button id="vc-mm-editor-close" type="button">×</button></div><textarea id="vc-mm-editor-text" spellcheck="false"></textarea>' +
    '<div class="vc-mm-editor-actions"><button id="vc-mm-editor-save" type="button">Save Changes</button><button id="vc-mm-editor-cancel" type="button">Cancel</button></div></div>' +
    '<input id="vc-mm-replace-input" type="file" hidden></section>';
  document.body.appendChild(overlay);

  statusEl = overlay.querySelector("#vc-mm-status");
  modsList = overlay.querySelector("#vc-mm-mods-list");
  filesList = overlay.querySelector("#vc-mm-files-list");
  filesSearch = overlay.querySelector("#vc-mm-files-search");
  filesCount = overlay.querySelector("#vc-mm-files-count");
  workspaceList = overlay.querySelector("#vc-mm-workspace-list");
  workspaceSearch = overlay.querySelector("#vc-mm-workspace-search");
  workspaceName = overlay.querySelector("#vc-mm-workspace-name");
  workspaceCount = overlay.querySelector("#vc-mm-workspace-count");
  editor = overlay.querySelector("#vc-mm-editor");
  editorText = overlay.querySelector("#vc-mm-editor-text");
  editorName = overlay.querySelector("#vc-mm-editor-name");

  overlay.querySelector("#vc-mm-close").addEventListener("click", closeModManager);
  overlay.addEventListener("click", function(e) { if (e.target === overlay) closeModManager(); });
  overlay.querySelectorAll("[data-mm-tab]").forEach(function(btn) {
    btn.addEventListener("click", function() { showTab(btn.dataset.mmTab); });
  });

  const uploadInput = overlay.querySelector("#vc-mm-upload-input");
  overlay.querySelector("#vc-mm-upload-btn").addEventListener("click", function() { uploadInput.value = ""; uploadInput.click(); });
  uploadInput.addEventListener("change", async function() {
    const file = uploadInput.files && uploadInput.files[0];
    if (!file) return;
    try { await installZip(file); } catch (e) { setStatus(e.message, true); }
  });
  overlay.querySelector("#vc-mm-refresh-mods").addEventListener("click", function() {
    renderMods().catch(function(e) { setStatus(e.message, true); });
  });

  overlay.querySelector("#vc-mm-proxy-install").addEventListener("click", function() {
    installArchiveFromUrl(GAME_PROXY_URL).catch(function(e) { setStatus(e.message, true); });
  });
  overlay.querySelector("#vc-mm-proxy-download").addEventListener("click", function() {
    try { openArchiveDownload(GAME_PROXY_URL); } catch (e) { setStatus(e.message, true); }
  });

  const customUrl = overlay.querySelector("#vc-mm-custom-url");
  overlay.querySelector("#vc-mm-custom-install").addEventListener("click", function() {
    installArchiveFromUrl(customUrl.value).catch(function(e) { setStatus(e.message, true); });
  });
  overlay.querySelector("#vc-mm-custom-download").addEventListener("click", function() {
    try { openArchiveDownload(customUrl.value); } catch (e) { setStatus(e.message, true); }
  });

  overlay.querySelector("#vc-mm-files-proxy-download").addEventListener("click", function() {
    try { openArchiveDownload(GAME_PROXY_URL); } catch (e) { setStatus(e.message, true); }
  });

  const gameUploadInput = overlay.querySelector("#vc-mm-files-upload-input");
  overlay.querySelector("#vc-mm-files-upload-btn").addEventListener("click", function() {
    gameUploadInput.value = "";
    gameUploadInput.click();
  });
  gameUploadInput.addEventListener("change", async function() {
    try {
      for (const file of gameUploadInput.files || []) {
        const desired = prompt("Target OPFS path for " + file.name + ":", file.name);
        if (!desired) continue;
        const parts = cleanPath(desired.trim());
        if (!parts) throw new Error("Invalid upload path.");
        if (PROTECTED_ROOTS.has(parts[0])) throw new Error("That upload path is protected.");
        if (await exists(parts) && !confirm("Replace existing file " + parts.join("/") + "?")) continue;
        await writeFile(parts, file);
      }
      await refreshFiles();
      setStatus("Uploaded selected file(s) to Vice City OPFS.");
    } catch (e) {
      setStatus(e.message, true);
    }
  });

  overlay.querySelector("#vc-mm-refresh-files").addEventListener("click", function() {
    refreshFiles().catch(function(e) { setStatus(e.message, true); });
  });
  filesSearch.addEventListener("input", renderFiles);

  const workspaceInput = overlay.querySelector("#vc-mm-workspace-input");
  overlay.querySelector("#vc-mm-workspace-upload").addEventListener("click", function() { workspaceInput.value = ""; workspaceInput.click(); });
  workspaceInput.addEventListener("change", async function() {
    const file = workspaceInput.files && workspaceInput.files[0];
    if (!file) return;
    try { await importWorkspace(file); } catch (e) { setStatus(e.message, true); }
  });

  const addInput = overlay.querySelector("#vc-mm-workspace-add-input");
  overlay.querySelector("#vc-mm-workspace-add").addEventListener("click", function() { addInput.value = ""; addInput.click(); });
  addInput.addEventListener("change", async function() {
    for (const file of addInput.files || []) {
      const desired = prompt("ZIP path for " + file.name + ":", file.name);
      if (!desired) continue;
      const parts = cleanPath(desired.trim());
      if (!parts) continue;
      workspace.set(parts.join("/"), new Uint8Array(await file.arrayBuffer()));
    }
    renderWorkspace();
    setStatus("Added file(s) to ZIP Workspace.");
  });
  workspaceSearch.addEventListener("input", renderWorkspace);

  overlay.querySelector("#vc-mm-workspace-export").addEventListener("click", function() {
    exportWorkspace(true).catch(function(e) { setStatus(e.message, true); });
  });
  overlay.querySelector("#vc-mm-workspace-install").addEventListener("click", async function() {
    try {
      await installZip(await exportWorkspace(false));
      showTab("mods");
    } catch (e) { setStatus(e.message, true); }
  });

  overlay.querySelector("#vc-mm-editor-save").addEventListener("click", function() {
    saveEditor().catch(function(e) { setStatus(e.message, true); });
  });
  ["#vc-mm-editor-close", "#vc-mm-editor-cancel"].forEach(function(sel) {
    overlay.querySelector(sel).addEventListener("click", function() {
      editor.classList.add("hidden");
      editing = null;
    });
  });

  const replaceInput = overlay.querySelector("#vc-mm-replace-input");
  replaceInput.addEventListener("change", async function() {
    const file = replaceInput.files && replaceInput.files[0];
    if (!file || !pendingReplace) return;
    try {
      if (pendingReplace.indexOf("workspace:") === 0) {
        workspace.set(pendingReplace.slice(10), new Uint8Array(await file.arrayBuffer()));
        renderWorkspace();
      } else {
        await writeFile(cleanPath(pendingReplace), file);
        await refreshFiles();
      }
      setStatus("Replaced " + pendingReplace.replace(/^workspace:/, "") + ".");
    } catch (e) {
      setStatus(e.message, true);
    } finally {
      pendingReplace = null;
      replaceInput.value = "";
    }
  });

  document.addEventListener("keydown", function(event) {
    if (event.key === "Escape" && overlay && !overlay.classList.contains("hidden")) closeModManager();
  });
}

export function initModManager() {
  if (initialized) return;
  initialized = true;
  buildUI();

  // Match the GTA 3 site: expose Mod Manager before the game starts as well.
  const saveButton = document.getElementById("save-manager-btn");
  if (saveButton && !document.getElementById("mod-manager-btn")) {
    const modButton = document.createElement("button");
    modButton.id = "mod-manager-btn";
    modButton.className = "vc-btn-secondary";
    modButton.type = "button";
    modButton.textContent = "MOD MANAGER";
    modButton.addEventListener("click", openModManager);
    saveButton.insertAdjacentElement("afterend", modButton);
  }

  renderMods().catch(function(e) { setStatus(e.message, true); });
}

export function openModManager() {
  if (!initialized) initModManager();
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("vc-tool-open");
  if (document.pointerLockElement) {
    try { document.exitPointerLock(); } catch (_) {}
  }
  renderMods().catch(function(e) { setStatus(e.message, true); });
}

export function closeModManager() {
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("vc-tool-open");
}
