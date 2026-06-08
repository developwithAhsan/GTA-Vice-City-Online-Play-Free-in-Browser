const ASSET_RELEASE_URL = import.meta.env.VITE_ASSET_URL || "https://archive.org/download/gta-vicecity-wasm-assets/game.tar.gz";

const BASE = import.meta.env.BASE_URL;

const LEGACY_SCRIPT_SOURCES = [
  `${BASE}GamepadEmulator.js`,
  `${BASE}jsdos-cloud-sdk.js`,
  `${BASE}idbfs.js`,
  `${BASE}game.js`,
];

function isLocalDevEnvironment() {
  return (
    window.location.protocol === "file:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

async function clearDevelopmentServiceWorkers() {
  if (!("serviceWorker" in navigator) || !isLocalDevEnvironment()) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        resolve();
        return;
      }

      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error(`Failed to load script: ${src}`)),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => reject(new Error(`Failed to load script: ${src}`)),
      { once: true },
    );
    document.body.appendChild(script);
  });
}

async function loadLegacyScripts() {
  for (const src of LEGACY_SCRIPT_SOURCES) {
    await loadScript(src);
  }
}

// Returns null if OK, or a string describing the failure reason.
async function checkReady() {
  try {
    const root = await navigator.storage.getDirectory();

    let markerFile;
    try {
      const fh = await root.getFileHandle("_game_ready");
      markerFile = await fh.getFile();
    } catch {
      return "OPFS marker '_game_ready' not found";
    }

    const version = await markerFile.text();
    if (version !== "v4") {
      return `OPFS marker version mismatch: got "${version}", expected "v4"`;
    }

    const requiredFiles = [
      ["vcbr", "vc-sky-en-v6.data", 100 * 1024 * 1024],
      ["vcbr", "vc-sky-en-v6.wasm", 0],
      ["vcsky", "sha256sums.txt", 0],
    ];

    for (const [directoryName, fileName, minSize] of requiredFiles) {
      let dir;
      try {
        dir = await root.getDirectoryHandle(directoryName);
      } catch {
        return `OPFS directory not found: ${directoryName}/`;
      }
      let fh;
      try {
        fh = await dir.getFileHandle(fileName);
      } catch {
        return `OPFS file not found: ${directoryName}/${fileName}`;
      }
      if (minSize > 0) {
        const f = await fh.getFile();
        if (f.size < minSize) {
          return `OPFS file too small: ${directoryName}/${fileName} is ${(f.size / 1024 / 1024).toFixed(1)} MB, need > ${minSize / 1024 / 1024} MB`;
        }
      }
    }

    return null;
  } catch (err) {
    return `checkReady error: ${err.message}`;
  }
}

// Returns null if OK, or a string describing the failure reason.
async function verifyGameServing() {
  const requiredUrls = [
    "/vcbr/vc-sky-en-v6.data",
    "/vcbr/vc-sky-en-v6.wasm",
    "/vcsky/sha256sums.txt",
  ];

  try {
    for (const url of requiredUrls) {
      let response;
      try {
        response = await fetch(url, { method: "HEAD", cache: "no-store" });
      } catch (err) {
        return `fetch failed for ${url}: ${err.message}`;
      }
      if (!response.ok) {
        return `SW served ${response.status} for ${url}`;
      }
    }

    return null;
  } catch (err) {
    return `verifyGameServing error: ${err.message}`;
  }
}

async function waitForGameReady(retries = 6, delayMs = 400) {
  let lastReason = "unknown";
  for (let attempt = 0; attempt < retries; attempt++) {
    const opfsReason = await checkReady();
    if (opfsReason !== null) {
      lastReason = opfsReason;
      console.warn(`[waitForGameReady] attempt ${attempt + 1}: ${opfsReason}`);
    } else {
      const servingReason = await verifyGameServing();
      if (servingReason !== null) {
        lastReason = servingReason;
        console.warn(`[waitForGameReady] attempt ${attempt + 1}: ${servingReason}`);
      } else {
        return { ready: true, reason: null };
      }
    }

    if (attempt < retries - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }

  return { ready: false, reason: lastReason };
}

async function resetGameData() {
  // Clear OPFS: delete all known directories and the marker file
  try {
    const root = await navigator.storage.getDirectory();
    for (const name of ["vcbr", "vcsky", "_game_ready"]) {
      try {
        await root.removeEntry(name, { recursive: true });
      } catch {
        // entry may not exist
      }
    }
  } catch (err) {
    console.warn("[reset] OPFS clear failed:", err);
  }

  // Clear IndexedDB databases used by Emscripten IDBFS
  try {
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs.map(
        (db) =>
          new Promise((resolve) => {
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = resolve;
            req.onerror = resolve;
            req.onblocked = resolve;
          }),
      ),
    );
  } catch (err) {
    console.warn("[reset] IndexedDB clear failed:", err);
  }
}

const VC_TIPS = [
  "Vice City is set in 1986 Miami — 109 licensed songs across 9 radio stations.",
  "Tommy Vercetti is voiced by Ray Liotta.",
  "The map has two main islands connected by three bridges.",
  "You can buy businesses to generate passive income.",
  "The Infernus is the fastest car in the game — find it in Vice Point.",
  "The Hunter military helicopter has missiles AND a minigun.",
  "Use the Rhino tank for almost anything — it's nearly indestructible.",
  "Files are being written to your browser's local storage.",
  "This is a one-time download — the game loads instantly next visit.",
  "Vice City's map is nearly twice the size of GTA III's Liberty City.",
];

async function initSetupFlow() {
  const overlay = document.getElementById("setup-overlay");
  const downloadLink = document.getElementById("dl-link");
  const fileInput = document.getElementById("game-file-input");
  const progress = document.getElementById("setup-progress");
  const progressBar = document.getElementById("setup-progress-bar");
  const progressLabel = document.getElementById("setup-progress-label");
  const progressPercent = document.getElementById("setup-progress-percent");
  const progressFile = document.getElementById("setup-progress-file");
  const progressTip = document.getElementById("setup-progress-tip");
  const progressTitle = document.getElementById("setup-progress-title");
  const errorBox = document.getElementById("setup-error");
  const storageStatus = document.getElementById("storage-status");
  const selectedFileName = document.getElementById("selected-file-name");
  const clickToPlayButton = document.getElementById("click-to-play-button");
  const resetBtn = document.getElementById("reset-game-btn");

  if (
    !overlay ||
    !downloadLink ||
    !fileInput ||
    !progress ||
    !progressBar ||
    !progressLabel ||
    !progressPercent ||
    !errorBox ||
    !storageStatus ||
    !selectedFileName ||
    !clickToPlayButton
  ) {
    return;
  }

  downloadLink.href = ASSET_RELEASE_URL;

  const showError = (message) => {
    errorBox.classList.remove("hidden");
    errorBox.textContent = message;
  };

  const setStorageStatus = (message, state) => {
    storageStatus.textContent = message;
    storageStatus.dataset.state = state;
  };

  const setPlayAvailability = (enabled) => {
    window.__gtaGameReady = enabled;
    clickToPlayButton.disabled = !enabled;
    clickToPlayButton.classList.toggle("disabled", !enabled);
    if (resetBtn) resetBtn.classList.toggle("hidden", !enabled);
  };

  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (!confirm("This will delete all local game data (OPFS + IndexedDB). You will need to re-import game.tar.gz. Continue?")) {
        return;
      }
      resetBtn.disabled = true;
      resetBtn.textContent = "Resetting…";
      await resetGameData();
      setStorageStatus("Import required", "missing");
      setPlayAvailability(false);
      progress.classList.add("hidden");
      errorBox.classList.add("hidden");
      selectedFileName.textContent = "No file selected";
      fileInput.value = "";
      resetBtn.disabled = false;
      resetBtn.textContent = "Reset game data";
    });
  }

  const formatTimeRemaining = (seconds) => {
    if (!isFinite(seconds) || seconds <= 0) return "";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m >= 60) return `~${Math.floor(m / 60)}h ${m % 60}m remaining`;
    if (m > 0) return `~${m}m ${s}s remaining`;
    if (seconds < 5) return "almost done…";
    return `~${s}s remaining`;
  };

  const setupInstallButton = (isRetry = false) => {
    clickToPlayButton.disabled = false;
    clickToPlayButton.classList.remove("disabled");
    clickToPlayButton.textContent = isRetry ? "RETRY INSTALL" : "INSTALL GAME";
    clickToPlayButton.dataset.installMode = "1";
    clickToPlayButton.addEventListener("click", startInstall, { once: true });
  };

  const runImport = async (file, url) => {
    errorBox.classList.add("hidden");
    progress.classList.remove("hidden");
    progressLabel.textContent = "Connecting…";
    progressPercent.textContent = "0%";
    progressBar.style.width = "0%";
    if (progressFile) progressFile.textContent = "";
    setPlayAvailability(false);

    // Rotate tips every 7 seconds while loading
    let tipIndex = Math.floor(Math.random() * VC_TIPS.length);
    let tipInterval = null;
    if (progressTip) {
      const showTip = () => {
        progressTip.style.opacity = "0";
        setTimeout(() => {
          progressTip.textContent = "💡 " + VC_TIPS[tipIndex % VC_TIPS.length];
          tipIndex++;
          progressTip.style.opacity = "1";
        }, 350);
      };
      showTip();
      tipInterval = setInterval(showTip, 7000);
    }

    let downloadStartTime = null;
    let lastPhase = null;

    const onInstallError = (message) => {
      if (tipInterval) clearInterval(tipInterval);
      progress.classList.add("hidden");
      showError(message);
      setStorageStatus("Installation failed — try again", "missing");
      setupInstallButton(true);
    };

    await new Promise((resolve) => {
      const worker = new Worker(`${BASE}extract-worker.js`);
      worker.onerror = (error) => {
        console.error("[worker error]", error);
        onInstallError(`Worker crashed: ${error.message || "unknown error"}. Please try again.`);
        worker.terminate();
        resolve();
      };
      worker.postMessage(url ? { url } : { file });
      worker.onmessage = async (event) => {
        const msg = event.data;

        if (msg.type === "progress") {
          progressBar.style.width = `${msg.pct}%`;
          progressPercent.textContent = `${Math.round(msg.pct)}%`;

          if (msg.phase === "downloading" || msg.phase === "reading") {
            if (progressFile) progressFile.textContent = "";
            if (msg.total > 0) {
              if (!downloadStartTime) downloadStartTime = Date.now();
              const loadedMB = (msg.loaded / 1048576).toFixed(0);
              const totalMB = (msg.total / 1048576).toFixed(0);
              const elapsedSec = (Date.now() - downloadStartTime) / 1000;
              const speed = elapsedSec > 1 ? msg.loaded / elapsedSec : 0;
              const remainingSec = speed > 0 ? (msg.total - msg.loaded) / speed : Infinity;
              const eta = formatTimeRemaining(remainingSec);
              const speedMB = speed > 0 ? ` • ${(speed / 1048576).toFixed(1)} MB/s` : "";
              const label = msg.phase === "reading" ? "Reading" : (msg.resuming ? "Resuming" : "Downloading");
              if (msg.resuming && progressTitle) progressTitle.textContent = "RESUMING...";
              progressLabel.textContent = `${label}… ${loadedMB} / ${totalMB} MB${speedMB}${eta ? "  •  " + eta : ""}`;
            } else {
              progressLabel.textContent = "Connecting to server…";
            }
          } else if (msg.phase === "extracting") {
            if (lastPhase !== "extracting" && progressTitle) {
              progressTitle.textContent = "EXTRACTING...";
            }
            if (msg.file && progressFile) {
              progressFile.textContent = msg.file;
            }
            progressLabel.textContent = `Writing to storage… ${msg.done || 0} files`;
          }

          lastPhase = msg.phase;
          return;
        }

        if (msg.type === "done") {
          if (tipInterval) clearInterval(tipInterval);
          progressBar.style.width = "100%";
          progressPercent.textContent = "100%";
          progressLabel.textContent = "Verifying…";
          if (progressFile) progressFile.textContent = "";
          if (progressTip) progressTip.textContent = "";
          const { ready: isReady, reason } = await waitForGameReady();
          if (isReady) {
            setStorageStatus("Ready to play", "ready");
            setPlayAvailability(true);
            progress.classList.add("hidden");
          } else {
            onInstallError(`Verification failed: ${reason}. Please reset and try again.`);
          }
          worker.terminate();
          resolve();
          return;
        }

        if (msg.type === "error") {
          const raw = msg.message || "unknown error";
          let friendly = `Install failed: ${raw}`;
          if (raw.includes("QuotaExceeded") || raw.includes("quota")) {
            friendly = "Not enough browser storage space. Free up space or try a different browser, then retry.";
          } else if (raw.includes("NetworkError") || raw.includes("Failed to fetch") || raw.includes("Download failed")) {
            friendly = "Download failed — check your connection and click Retry.";
          }
          onInstallError(friendly);
          worker.terminate();
          resolve();
        }
      };
    });
  };

  setPlayAvailability(false);

  if (
    !("serviceWorker" in navigator) ||
    !("storage" in navigator && navigator.storage.getDirectory)
  ) {
    showError(
      "Your browser does not support the required APIs (OPFS / Service Worker). Please use Chrome, Firefox or Safari 15.2+.",
    );
    return;
  }

  try {
    if (isLocalDevEnvironment()) {
      console.log("[setup] local dev detected, refreshing SW registration");
      await clearDevelopmentServiceWorkers();
    }

    console.log("[setup] registering SW...");
    await navigator.serviceWorker.register(`${BASE}sw.js`, { updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    console.log("[setup] SW ready");

    if (!navigator.serviceWorker.controller) {
      console.log("[setup] SW not yet controlling page — reloading...");
      window.location.reload();
      return;
    }
  } catch (error) {
    showError(`Service Worker error: ${error.message}`);
    return;
  }

  const { ready, reason } = await waitForGameReady(2, 150);
  console.log("[setup] game ready in OPFS:", ready, reason || "");
  if (ready) {
    setStorageStatus("Ready to play", "ready");
    setPlayAvailability(true);
    progress.classList.add("hidden");
    return;
  }

  // Game not installed — show install button and wait for user to click
  setStorageStatus("Click INSTALL GAME to set up (~701 MB, one-time)", "missing");

  const DEFAULT_ARCHIVE_URL = 'https://archive.org/download/gta-vicecity-wasm-assets/game.tar.gz';
  const hasCustomUrl = import.meta.env.VITE_ASSET_URL && import.meta.env.VITE_ASSET_URL !== DEFAULT_ARCHIVE_URL;

  let downloadUrl = null;
  if (ASSET_RELEASE_URL) {
    if (import.meta.env.DEV) {
      downloadUrl = `${BASE}proxy-game-download/game.tar.gz`;
    } else if (hasCustomUrl) {
      downloadUrl = import.meta.env.VITE_ASSET_URL;
    } else if (__IS_VERCEL__) {
      downloadUrl = `/api/proxy`;
    } else {
      downloadUrl = `${BASE}proxy-game-download/game.tar.gz`;
    }
  }

  const startInstall = async () => {
    if (clickToPlayButton.dataset.installMode !== "1") return;
    clickToPlayButton.disabled = true;
    clickToPlayButton.dataset.installMode = "";

    if (downloadUrl) {
      console.log("[setup] user triggered download from:", downloadUrl);
      await runImport(null, downloadUrl);
    } else {
      fileInput.click();
    }
  };

  // Repurpose the PLAY button as INSTALL GAME until game files are present
  setupInstallButton(false);

  // File picker fallback (used when no download URL is configured)
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) { selectedFileName.textContent = "No file selected"; return; }
    selectedFileName.textContent = file.name;
    if (!/\.tar\.gz$|\.gz$/i.test(file.name)) {
      showError("Please select the game.tar.gz file.");
      return;
    }
    await runImport(file);
  });
}

function initCanvasBindings() {
  const canvas = document.getElementById("canvas");
  if (!canvas) {
    return;
  }

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}

function checkBrowserCompatibility() {
  const missing = [];

  if (!("serviceWorker" in navigator)) missing.push("Service Workers");
  if (!("storage" in navigator) || !("getDirectory" in navigator.storage)) missing.push("OPFS");
  if (typeof WebAssembly === "undefined") missing.push("WebAssembly");
  if (typeof Worker === "undefined") missing.push("Web Workers");

  return missing;
}

function initHostRedirectGuard() {
  try {
    // const host = window.parent.location.host;
    // console.log("The host:", host);
    // if ((!host.endsWith("dos.zone") || host.endsWith("cdn.dos.zone")) && !host.startsWith("localhost") &&
    //     !host.startsWith("192.168.0.") && !host.startsWith("test.js-dos.com")) {
    //     location.href = "https://dos.zone/grand-theft-auto-vice-city/";
    // }
  } catch {
    // ignore
  }
}

function initOrientationLock() {
  const observer = new MutationObserver(() => {
    if (document.body.classList.contains("gameIsStarted")) {
      observer.disconnect();
      screen.orientation?.lock("landscape").catch(() => {});
    }
  });
  observer.observe(document.body, { attributeFilter: ["class"] });
}

async function boot() {
  initCanvasBindings();
  initHostRedirectGuard();
  initOrientationLock();

  const missing = checkBrowserCompatibility();
  if (missing.length > 0) {
    const storageStatus = document.getElementById("storage-status");
    const errorBox = document.getElementById("setup-error");
    if (storageStatus) {
      storageStatus.textContent = "Browser not supported";
      storageStatus.dataset.state = "error";
    }
    if (errorBox) {
      errorBox.classList.remove("hidden");
      errorBox.textContent = `Your browser is missing required features: ${missing.join(", ")}. Please use Chrome 110+, Firefox 111+, or Safari 16.4+.`;
    }
    return;
  }

  await initSetupFlow();
  await loadLegacyScripts();

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
} else {
  void boot();
}
