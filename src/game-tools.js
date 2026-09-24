
import { openModManager } from "./mod-manager.js";

const VC_CHEATS = [
  ["Weapons & Health","THUGSTOOLS","Thug Tools"],
  ["Weapons & Health","PROFESSIONALTOOLS","Professional Tools"],
  ["Weapons & Health","NUTTERTOOLS","Nutter Tools"],
  ["Weapons & Health","ASPIRINE","Full Health"],
  ["Weapons & Health","PRECIOUSPROTECTION","Full Armour"],

  ["Gameplay","LEAVEMEALONE","Clear Wanted Level"],
  ["Gameplay","YOUWONTTAKEMEALIVE","Raise Wanted Level"],
  ["Gameplay","ONSPEED","Fast Gameplay"],
  ["Gameplay","BOOOOOORING","Slow Gameplay"],
  ["Gameplay","LIFEISPASSINGMEBY","Faster Game Clock"],
  ["Gameplay","BIGBANG","Destroy Nearby Vehicles"],
  ["Gameplay","FIGHTFIGHTFIGHT","Pedestrian Riot"],
  ["Gameplay","NOBODYLIKESME","Pedestrians Attack You"],
  ["Gameplay","OURGODGIVENRIGHTTOBEARARMS","Armed Pedestrians"],
  ["Gameplay","CHICKSWITHGUNS","Armed Women"],
  ["Gameplay","FANNYMAGNET","Ladies Follow Tommy"],
  ["Gameplay","HOPINGIRL","Pedestrians Enter Your Car"],
  ["Gameplay","GREENLIGHT","All Traffic Lights Green"],
  ["Gameplay","MIAMITRAFFIC","Aggressive Traffic"],
  ["Gameplay","ICANTTAKEITANYMORE","Suicide"],

  ["Skins","STILLLIKEDRESSINGUP","Random Character Skin"],
  ["Skins","IDONTHAVETHEMONEYSONNY","Sonny Forelli"],
  ["Skins","LOOKLIKELANCE","Lance Vance"],
  ["Skins","ILOOKLIKEHILARY","Hilary King"],
  ["Skins","ROCKANDROLLMAN","Jezz Torrent"],
  ["Skins","WELOVEOURDICK","Dick"],
  ["Skins","MYSONISALAWYER","Ken Rosenberg"],
  ["Skins","ONEARMEDBANDIT","Phil Cassidy"],
  ["Skins","FOXYLITTLETHING","Mercedes"],
  ["Skins","CHEATSHAVEBEENCRACKED","Ricardo Diaz"],
  ["Skins","IWANTBIGTITS","Candy Suxxx"],
  ["Skins","CERTAINDEATH","Tommy Smokes"],
  ["Skins","DEEPFRIEDMARSBARS","Fat Tommy"],
  ["Skins","PROGRAMMER","Thin Tommy"],

  ["Vehicles","PANZER","Spawn Rhino Tank"],
  ["Vehicles","GETTHEREFAST","Spawn Sabre Turbo"],
  ["Vehicles","GETTHEREQUICKLY","Spawn Bloodring Banger A"],
  ["Vehicles","TRAVELINSTYLE","Spawn Bloodring Banger B"],
  ["Vehicles","GETTHEREVERYFASTINDEED","Spawn Hotring Racer A"],
  ["Vehicles","GETTHEREAMAZINGLYFAST","Spawn Hotring Racer B"],
  ["Vehicles","THELASTRIDE","Spawn Romero Hearse"],
  ["Vehicles","ROCKANDROLLCAR","Spawn Love Fist Limo"],
  ["Vehicles","BETTERTHANWALKING","Spawn Caddy"],
  ["Vehicles","RUBBISHCAR","Spawn Trashmaster"],

  ["Vehicle Effects","COMEFLYWITHME","Flying Cars"],
  ["Vehicle Effects","AIRSHIP","Flying Boats"],
  ["Vehicle Effects","SEAWAYS","Cars Drive on Water"],
  ["Vehicle Effects","WHEELSAREALLINEED","Invisible Cars / Wheels Only"],
  ["Vehicle Effects","GRIPISEVERYTHING","Improved Handling"],
  ["Vehicle Effects","IWANTITPAINTEDBLACK","Black Traffic"],
  ["Vehicle Effects","AHAIRDRESSERSCAR","Pink Traffic"],
  ["Vehicle Effects","LOADSOFLITTLETHINGS","Small Wheels"],

  ["Weather","ALOVELYDAY","Sunny Weather"],
  ["Weather","APLEASANTDAY","Cloudy Weather"],
  ["Weather","ABITDRIEG","Very Cloudy Weather"],
  ["Weather","CATSANDDOGS","Stormy / Rainy Weather"],
  ["Weather","CANTSEEATHING","Foggy Weather"]
];

let initialized = false;
let cheatPanel = null;
let sensitivityPanel = null;
let morePanel = null;

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
    if (panel) panel.classList.add("hidden");
  });
  setToolOpen(false);
}

function togglePanel(panel) {
  const shouldOpen = panel.classList.contains("hidden");
  closePanels();
  if (shouldOpen) {
    panel.classList.remove("hidden");
    setToolOpen(true);
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

function buildCheatPanel() {
  const panel = document.createElement("section");
  panel.id = "vc-game-cheats-panel";
  panel.className = "vc-game-tool-panel vc-game-cheats-panel hidden";
  panel.setAttribute("aria-label", "GTA Vice City cheats");

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
    '<a class="vc-game-more-card" href="https://gta3browser.vercel.app/" target="_blank" rel="noopener">' +
    '<strong>GTA 3 Browser</strong><span>Play GTA III in your browser</span></a>';
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
  const right = document.createElement("div");
  right.className = "vc-game-toolbar-right";

  const cheatsBtn = makeButton("vc-game-cheats-btn", "Cheats", "★");
  const moreBtn = makeButton("vc-game-more-btn", "More Games", "🎮");
  const sensitivityBtn = makeButton("vc-game-sensitivity-btn", "Sensitivity", "◫");
  const saveBtn = makeButton("vc-game-save-btn", "Save Manager", "▣");
  const modsBtn = makeButton("vc-game-mods-btn", "Mod Manager", "◆");
  const fullscreenBtn = makeButton("vc-game-fullscreen-btn", "Fullscreen", "⛶");
  const exitBtn = makeButton("vc-game-exit-btn", "Exit Game", "✕");
  exitBtn.classList.add("danger");

  left.appendChild(cheatsBtn);
  left.appendChild(moreBtn);
  right.appendChild(sensitivityBtn);
  right.appendChild(saveBtn);
  right.appendChild(modsBtn);
  right.appendChild(fullscreenBtn);
  right.appendChild(exitBtn);
  toolbar.appendChild(left);
  toolbar.appendChild(right);

  document.body.appendChild(toolbar);
  document.body.appendChild(cheatPanel);
  document.body.appendChild(sensitivityPanel);
  document.body.appendChild(morePanel);

  cheatsBtn.addEventListener("click", function() { togglePanel(cheatPanel); });
  moreBtn.addEventListener("click", function() { togglePanel(morePanel); });
  sensitivityBtn.addEventListener("click", function() { togglePanel(sensitivityPanel); });

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
