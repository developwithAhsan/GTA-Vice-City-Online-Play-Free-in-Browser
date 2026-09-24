
import { openModManager } from "./mod-manager.js";

const VC_CHEATS = [
  ["Weapons","THUGSTOOLS","Weapon Set 1"],
  ["Weapons","PROFESSIONALTOOLS","Weapon Set 2"],
  ["Weapons","NUTTERTOOLS","Weapon Set 3"],
  ["Player","ASPIRINE","Full Health (Instant)Talk"],
  ["Player","PRECIOUSPROTECTION","Full Body Armor"],

  ["Vehicle Effects","SEAWAYS","Cars Can Drive on Water"],
  ["Vehicle Effects","GRIPISEVERYTHING","Better Handling"],
  ["Player","ICANTTAKEITANYMORE","Instant Death"],
  ["Vehicle Effects","COMEFLYWITHME","Flying Cars"],
  ["Wanted Level","LEAVEMEALONE","Lower Wanted Level"],
  ["Wanted Level","YOUWONTTAKEMEALIVE","Raise Wanted Level"],
  ["Gameplay","BIGBANG","Car Explosion"],
  ["Gameplay","FIGHTFIGHTFIGHT","Pedestrians Riot"],
  ["Gameplay","NOBODYLIKESME","Pedestrians Attack You"],
  ["Gameplay","OURGODGIVENRIGHTTOBEARARMS","Pedestrians Carry Weapons"],
  ["Gameplay","CHICKSWITHGUNS","Female Pedestrians Carry Weapons"],
  ["Gameplay","FANNYMAGNET","Ladies' Man"],

  ["Vehicles","TRAVELINSTYLE","Bloodring Banger"],
  ["Vehicles","GETTHEREQUICKLY","Bloodring Racer"],
  ["Vehicles","BETTERTHANWALKING","Golf Caddy"],
  ["Vehicles","GETTHEREVERYFASTINDEED","Hotring Racer 1"],
  ["Vehicles","GETTHEREAMAZINGLYFAST","Hotring Racer 2"],
  ["Vehicles","ROCKANDROLLCAR","Love Fist Limo"],
  ["Vehicles","PANZER","Rhino (Tank)"],
  ["Vehicles","THELASTRIDE","Romero's Hearse"],
  ["Vehicles","GETTHEREFAST","Sabre Turbo"],
  ["Vehicles","RUBBISHCAR","Trashmaster"],
  ["Vehicles","FLYINGWAYS","Aeroplane Spawn"],
  ["Vehicles","AMERICAHELICOPTER","Hunter Spawn"],

  ["Skins","?","Change Outfit"],
  ["Skins","IWANTBIGTITS","Candy Suxxx"],
  ["Skins","MYSONISALAWYER","Ken Rosenberg"],
  ["Skins","LOOKLIKELANCE","Lance Vance"],
  ["Skins","ROCKANDROLLMAN","Love Fist 1"],
  ["Skins","WELOVEOURDICK","Love Fist 2"],
  ["Skins","FOXYLITTLETHING","Mercedes"],
  ["Skins","ONEARMEDBANDIT","Phil Cassady"],
  ["Skins","CHEATSHAVEBEENCRACKED","Ricardo Diaz"],
  ["Skins","IDONTHAVETHEMONEYSONNY","Sonny Forelli"],

  ["Weather","ALOVELYDAY","Sunny Weather"],
  ["Weather","CATSANDDOGS","Stormy Weather"],
  ["Weather","CANTSEEATHING","Foggy Weather"],
  ["Weather","APLEASANTDAY","Overcast Weather"],

  ["Gameplay","BOOOOOORING","Slow-Mo"],
  ["Gameplay","ONSPEED","Fast Motion"],
  ["Gameplay","LIFEISPASSINGMEBY","Quick Clock"],
  ["Traffic","MIAMITRAFFIC","Increased Traffic"],
  ["Traffic","IWANTITPAINTEDBLACK","Black Vehicles"],
  ["Traffic","AHAIRDRESSERSCAR","Pink Vehicles"],
  ["Traffic","GREENLIGHT","All Traffic Lights Green"],
  ["Vehicle Effects","WHEELSAREALLINEED","Invisible Cars"],
  ["Vehicle Effects","LOADSOFLITTLETHINGS","Big Wheel Cars"],

  ["Cheats Confirmed Not to Work","PROGRAMMER","Skinny"],
  ["Cheats Confirmed Not to Work","DEEPFRIEDMARSBARS","Fat"],
  ["Cheats Confirmed Not to Work","CERTAINDEATH","Smoke a Cigarette"],
  ["Cheats Confirmed Not to Work","LOOKLIKEHILARY","Hilary King"]
]

let initialized = false;
let cheatPanel = null;
let sensitivityPanel = null;
let morePanel = null;
let touchToolbarBtn = null;

const TOUCH_STATES = ["auto", "on", "off"];

function closePointerLock() {
  if (document.pointerLockElement) {
    try { document.exitPointerLock(); } catch (_) {}
  }
}

function setToolOpen(open) {
  document.body.classList.toggle("vc-tool-open", !!open);
  if (open) {
    closePointerLock();
    document.body.style.cursor = "default";
    const canvas = document.getElementById("canvas");
    if (canvas) canvas.style.cursor = "default";
  }
}

function closePanels() {
  [cheatPanel, sensitivityPanel, morePanel].forEach(function(panel) {
    if (!panel) return;
    panel.classList.add("hidden");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  });
  setToolOpen(false);
}

function togglePanel(panel) {
  if (!panel) return;
  const shouldOpen = panel.classList.contains("hidden");
  closePanels();
  if (shouldOpen) {
    panel.classList.remove("hidden");
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    setToolOpen(true);

    // Keep the opened panel above the install/loading layer and focus it
    // so touch and mouse users immediately get an interactive surface.
    requestAnimationFrame(function() {
      const focusTarget = panel.querySelector("input, button, a, [tabindex]");
      if (focusTarget && typeof focusTarget.focus === "function") {
        try { focusTarget.focus({ preventScroll: true }); } catch (_) {}
      }
    });
  }
}

async function applyCheat(code) {
  if (!document.body.classList.contains("gameIsStarted")) {
    throw new Error("Start Vice City before applying a cheat.");
  }

  if (typeof window.typeCheat === "function") {
    await window.typeCheat(code);
    return;
  }

  const JSE = globalThis.JSEvents;
  const malloc = globalThis._malloc;
  const free = globalThis._free;
  const heapU8 = globalThis.HEAPU8;
  const heap32 = globalThis.HEAP32;
  const heapF64 = globalThis.HEAPF64;
  const writeString = globalThis.stringToUTF8;
  const tableEntry = globalThis.getWasmTableEntry;

  if (!JSE || !JSE.eventHandlers || typeof malloc !== "function" ||
      typeof free !== "function" || !heapU8 || !heap32 || !heapF64 ||
      typeof writeString !== "function" || typeof tableEntry !== "function") {
    throw new Error("Game input is still loading. Try again in a few seconds.");
  }

  const handlers = JSE.eventHandlers.filter(function(h) {
    return h.eventTypeString === "keydown" ||
      h.eventTypeString === "keypress" ||
      h.eventTypeString === "keyup";
  });
  if (!handlers.length) throw new Error("Keyboard input is not ready yet.");

  const ptr = malloc(160);
  try {
    const upper = String(code).toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i];
      const keyCode = ch.charCodeAt(0);

      function fillBuffer() {
        for (let j = 0; j < 160; j++) heapU8[ptr + j] = 0;
        heapF64[ptr >> 3] = performance.now();
        const idx = ptr >> 2;
        heap32[idx + 5] = keyCode;
        heap32[idx + 6] = keyCode;
        heap32[idx + 7] = keyCode;
        writeString(ch, ptr + 32, 32);
        writeString("Key" + ch, ptr + 64, 32);
        writeString(ch, ptr + 96, 32);
      }

      ["keydown","keypress","keyup"].forEach(function(type) {
        fillBuffer();
        handlers.forEach(function(h) {
          if (h.eventTypeString === type) {
            tableEntry(h.callbackfunc)(h.eventTypeId, ptr, h.userData);
          }
        });
      });
      await new Promise(function(resolve) { setTimeout(resolve, 7); });
    }
  } finally {
    free(ptr);
  }
}

function makeButton(id, label, symbol) {
  const button = document.createElement("button");
  button.id = id;
  button.className = "vc-game-toolbar-btn";
  button.type = "button";
  button.innerHTML = '<span class="vc-game-toolbar-symbol" aria-hidden="true">' + symbol + '</span><span class="vc-game-toolbar-label">' + label + '</span>';
  return button;
}

function hasTouchHardware() {
  return "ontouchstart" in window ||
    Number(navigator.maxTouchPoints || 0) > 0 ||
    !!window.matchMedia?.("(pointer: coarse)")?.matches;
}

function readTouchMode() {
  const stored = localStorage.getItem("vcsky.touchControls") || "auto";
  return TOUCH_STATES.includes(stored) ? stored : "auto";
}

function applyTouchMode(mode) {
  const normalized = TOUCH_STATES.includes(mode) ? mode : "auto";
  const enabled = normalized === "on" || (normalized === "auto" && hasTouchHardware());
  localStorage.setItem("vcsky.touchControls", normalized);
  document.body.dataset.isTouch = enabled ? "1" : "0";

  const homeButton = document.getElementById("touch-controls-toggle");
  if (homeButton) {
    homeButton.textContent = normalized.toUpperCase();
    homeButton.dataset.state = normalized;
  }

  if (touchToolbarBtn) {
    touchToolbarBtn.dataset.state = normalized;
    touchToolbarBtn.title = "Touch controls: " + normalized.toUpperCase();
    const label = touchToolbarBtn.querySelector(".vc-game-toolbar-label");
    if (label) label.textContent = "Touch " + normalized.toUpperCase();
  }

  window.dispatchEvent(new CustomEvent("vc-touch-controls", {
    detail: { mode: normalized, enabled: enabled }
  }));
  return normalized;
}

function cycleTouchMode() {
  const current = readTouchMode();
  const next = TOUCH_STATES[(TOUCH_STATES.indexOf(current) + 1) % TOUCH_STATES.length];
  applyTouchMode(next);
}

function buildCheatPanel() {
  const panel = document.createElement("section");
  panel.id = "vc-game-cheats-panel";
  panel.className = "vc-game-tool-panel vc-game-cheats-panel hidden";
  panel.setAttribute("aria-label", "GTA Vice City cheats");
  panel.setAttribute("aria-hidden", "true");

  const categories = [];
  VC_CHEATS.forEach(function(item) {
    if (categories.indexOf(item[0]) < 0) categories.push(item[0]);
  });

  let groups = "";
  categories.forEach(function(category) {
    groups += '<div class="vc-game-cheat-group" data-category="' + category + '"><h3>' + category + '</h3><div class="vc-game-cheat-grid">';
    VC_CHEATS.filter(function(item) { return item[0] === category; }).forEach(function(item) {
      groups += '<button type="button" class="vc-game-cheat-item" data-code="' + item[1] + '" data-search="' +
        (item[2] + " " + item[1]).toLowerCase() + '"><span>' + item[2] + '</span><code>' + item[1] + '</code></button>';
    });
    groups += "</div></div>";
  });

  panel.innerHTML =
    '<div class="vc-game-panel-head"><div><strong>GTA VICE CITY CHEATS</strong>' +
    '<small>Click a cheat to enter it directly into the running game.</small></div>' +
    '<button type="button" class="vc-game-panel-close" aria-label="Close">×</button></div>' +
    '<div class="vc-game-cheat-search"><input id="vc-game-cheat-search" type="search" placeholder="Search cheats or codes" autocomplete="off">' +
    '<span id="vc-game-cheat-count">' + VC_CHEATS.length + ' cheats</span></div>' +
    '<div class="vc-game-cheat-scroll">' + groups + '</div>' +
    '<div id="vc-game-cheat-status" class="vc-game-panel-status" aria-live="polite">Select a cheat to apply it.</div>';

  panel.querySelector(".vc-game-panel-close").addEventListener("click", closePanels);
  const status = panel.querySelector("#vc-game-cheat-status");

  panel.querySelectorAll(".vc-game-cheat-item").forEach(function(button) {
    button.addEventListener("click", async function() {
      const code = button.dataset.code;
      button.disabled = true;
      status.textContent = "Applying " + code + "...";
      try {
        await applyCheat(code);
        status.textContent = "Applied: " + code;
      } catch (error) {
        status.textContent = error && error.message ? error.message : "Could not apply cheat.";
      } finally {
        button.disabled = false;
      }
    });
  });

  const search = panel.querySelector("#vc-game-cheat-search");
  const count = panel.querySelector("#vc-game-cheat-count");
  search.addEventListener("input", function() {
    const q = search.value.trim().toLowerCase();
    let visible = 0;
    panel.querySelectorAll(".vc-game-cheat-item").forEach(function(button) {
      const show = !q || button.dataset.search.indexOf(q) >= 0;
      button.hidden = !show;
      if (show) visible++;
    });
    panel.querySelectorAll(".vc-game-cheat-group").forEach(function(group) {
      const anyVisible = Array.from(group.querySelectorAll(".vc-game-cheat-item")).some(function(button) {
        return !button.hidden;
      });
      group.hidden = !anyVisible;
    });
    count.textContent = visible + (visible === 1 ? " cheat" : " cheats");
  });

  return panel;
}

function buildSensitivityPanel() {
  const stored = Number(localStorage.getItem("vcsky.touchSensitivity") || 100);
  const initial = Number.isFinite(stored) ? Math.max(50, Math.min(200, stored)) : 100;
  globalThis.__vcTouchSensitivity = initial / 100;

  const panel = document.createElement("section");
  panel.id = "vc-game-sensitivity-panel";
  panel.className = "vc-game-tool-panel vc-game-sensitivity-panel hidden";
  panel.innerHTML =
    '<div class="vc-game-panel-head"><div><strong>CONTROL SENSITIVITY</strong>' +
    '<small>Adjust movement and camera response. Changes apply live.</small></div>' +
    '<button type="button" class="vc-game-panel-close" aria-label="Close">×</button></div>' +
    '<div class="vc-game-sensitivity-control"><input id="vc-game-sensitivity-range" type="range" min="50" max="200" step="10" value="' + initial + '">' +
    '<output id="vc-game-sensitivity-output">' + initial + '%</output></div>' +
    '<div class="vc-game-sensitivity-presets"><button type="button" data-value="70">Low</button>' +
    '<button type="button" data-value="100">Normal</button><button type="button" data-value="140">High</button>' +
    '<button type="button" data-value="180">Very High</button></div>';

  const range = panel.querySelector("#vc-game-sensitivity-range");
  const output = panel.querySelector("#vc-game-sensitivity-output");

  function update(value) {
    const n = Math.max(50, Math.min(200, Number(value) || 100));
    range.value = String(n);
    output.textContent = n + "%";
    localStorage.setItem("vcsky.touchSensitivity", String(n));
    globalThis.__vcTouchSensitivity = n / 100;
    window.dispatchEvent(new CustomEvent("vc-touch-sensitivity", { detail: { value: n } }));
  }

  range.addEventListener("input", function() { update(range.value); });
  panel.querySelectorAll("[data-value]").forEach(function(button) {
    button.addEventListener("click", function() { update(button.dataset.value); });
  });
  panel.querySelector(".vc-game-panel-close").addEventListener("click", closePanels);
  return panel;
}

function buildMorePanel() {
  const panel = document.createElement("section");
  panel.id = "vc-game-more-panel";
  panel.className = "vc-game-tool-panel vc-game-more-panel hidden";
  panel.innerHTML =
    '<div class="vc-game-panel-head"><div><strong>MORE GAMES</strong><small>Other browser game projects.</small></div>' +
    '<button type="button" class="vc-game-panel-close" aria-label="Close">×</button></div>' +
    '<div class="vc-game-more-grid">' +
      '<a class="vc-game-more-card" href="https://gta3browser.vercel.app/" target="_blank" rel="noopener">' +
        '<strong>GTA 3 Browser</strong><span>Play GTA III in your browser</span>' +
      '</a>' +
      '<a class="vc-game-more-card" href="https://doombrowser.vercel.app/" target="_blank" rel="noopener">' +
        '<strong>Doom Browser</strong><span>Play Doom directly in your browser</span>' +
      '</a>' +
    '</div>';
  panel.querySelector(".vc-game-panel-close").addEventListener("click", closePanels);
  return panel;
}

async function toggleFullscreen() {
  closePanels();
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch (_) {}
  } else if (document.documentElement.requestFullscreen) {
    try { await document.documentElement.requestFullscreen(); } catch (_) {}
  }
}

async function exitGame() {
  closePanels();
  closePointerLock();
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch (_) {}
  }
  try {
    if (globalThis.Module && globalThis.Module.FS && globalThis.Module.FS.syncfs) {
      globalThis.Module.FS.syncfs(false, function() {});
    }
  } catch (_) {}
  try {
    if (globalThis.Module && globalThis.Module.pauseMainLoop) globalThis.Module.pauseMainLoop();
  } catch (_) {}
  window.onbeforeunload = null;
  location.reload();
}

export function initGameTools() {
  if (initialized) return;
  initialized = true;

  cheatPanel = buildCheatPanel();
  sensitivityPanel = buildSensitivityPanel();
  morePanel = buildMorePanel();

  const toolbar = document.createElement("div");
  toolbar.id = "vc-game-toolbar";
  toolbar.className = "vc-game-toolbar";

  const left = document.createElement("div");
  left.className = "vc-game-toolbar-left";
  const center = document.createElement("div");
  center.className = "vc-game-toolbar-center";
  const right = document.createElement("div");
  right.className = "vc-game-toolbar-right";

  const cheatsBtn = makeButton("vc-game-cheats-btn", "Cheats", "★");
  const modsBtn = makeButton("vc-game-mods-btn", "Mod Manager", "◆");
  const moreBtn = makeButton("vc-game-more-btn", "More Games", "🎮");
  const saveBtn = makeButton("vc-game-save-btn", "Save Manager", "▣");
  const sensitivityBtn = makeButton("vc-game-sensitivity-btn", "Sensitivity", "◫");
  touchToolbarBtn = makeButton("vc-game-touch-btn", "Touch AUTO", "☝");
  const fullscreenBtn = makeButton("vc-game-fullscreen-btn", "Fullscreen", "⛶");
  const exitBtn = makeButton("vc-game-exit-btn", "Exit Game", "✕");
  exitBtn.classList.add("danger");

  left.appendChild(modsBtn);
  left.appendChild(saveBtn);

  center.appendChild(cheatsBtn);
  center.appendChild(moreBtn);

  right.appendChild(sensitivityBtn);
  right.appendChild(touchToolbarBtn);
  right.appendChild(fullscreenBtn);
  right.appendChild(exitBtn);

  toolbar.appendChild(left);
  toolbar.appendChild(center);
  toolbar.appendChild(right);

  document.body.appendChild(toolbar);
  document.body.appendChild(cheatPanel);
  document.body.appendChild(sensitivityPanel);
  document.body.appendChild(morePanel);

  cheatsBtn.addEventListener("click", function(event) {
    event.preventDefault();
    event.stopPropagation();
    togglePanel(cheatPanel);
  });
  moreBtn.addEventListener("click", function(event) {
    event.preventDefault();
    event.stopPropagation();
    togglePanel(morePanel);
  });
  sensitivityBtn.addEventListener("click", function(event) {
    event.preventDefault();
    event.stopPropagation();
    togglePanel(sensitivityPanel);
  });
  touchToolbarBtn.addEventListener("click", function() {
    closePanels();
    cycleTouchMode();
  });
  applyTouchMode(readTouchMode());

  saveBtn.addEventListener("click", function() {
    closePanels();
    closePointerLock();
    const button = document.getElementById("save-manager-btn");
    if (button) button.click();
  });

  modsBtn.addEventListener("click", function() {
    closePanels();
    openModManager();
  });

  fullscreenBtn.addEventListener("click", function() { void toggleFullscreen(); });
  exitBtn.addEventListener("click", function() {
    if (confirm("Exit Vice City and return to the website?")) void exitGame();
  });

  document.addEventListener("fullscreenchange", function() {
    const label = fullscreenBtn.querySelector(".vc-game-toolbar-label");
    if (label) label.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
  });

  document.addEventListener("keydown", function(event) {
    if (event.key === "Escape" && document.body.classList.contains("vc-tool-open")) {
      closePanels();
    }
  });
}
