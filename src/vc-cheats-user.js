
const USER_VC_CHEATS = [
  ["Weapons & Health","THUGSTOOLS","Weapon Set 1"],
  ["Weapons & Health","PROFESSIONALTOOLS","Weapon Set 2"],
  ["Weapons & Health","NUTTERTOOLS","Weapon Set 3"],
  ["Weapons & Health","ASPIRINE","Full Health (Instant)"],
  ["Weapons & Health","PRECIOUSPROTECTION","Full Body Armor"],

  ["Gameplay","ICANTTAKEITANYMORE","Instant " + "Death"],
  ["Gameplay","LEAVEMEALONE","Lower Wanted Level"],
  ["Gameplay","YOUWONTTAKEMEALIVE","Raise Wanted Level"],
  ["Gameplay","FIGHTFIGHTFIGHT","Pedestrians Riot"],
  ["Gameplay","NOBODYLIKESME","Pedestrians Attack You"],
  ["Gameplay","OURGODGIVENRIGHTTOBEARARMS","Pedestrians Carry Weapons"],
  ["Gameplay","CHICKSWITHGUNS","Female Pedestrians Carry Weapons"],
  ["Gameplay","FANNYMAGNET","Ladies' Man"],
  ["Gameplay","BOOOOOORING","Slow-Mo"],
  ["Gameplay","ONSPEED","Fast Motion"],
  ["Gameplay","LIFEISPASSINGMEBY","Quick Clock"],

  ["Vehicles","SEAWAYS","Cars Can Drive on Water"],
  ["Vehicles","GRIPISEVERYTHING","Better Handling"],
  ["Vehicles","COMEFLYWITHME","Flying Cars"],
  ["Vehicles","BIGBANG","Car Explosion"],
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

  ["Traffic & Vehicle Effects","MIAMITRAFFIC","Increased Traffic"],
  ["Traffic & Vehicle Effects","IWANTITPAINTEDBLACK","Black Vehicles"],
  ["Traffic & Vehicle Effects","AHAIRDRESSERSCAR","Pink Vehicles"],
  ["Traffic & Vehicle Effects","GREENLIGHT","All Traffic Lights Green"],
  ["Traffic & Vehicle Effects","WHEELSAREALLINEED","Invisible Cars"],
  ["Traffic & Vehicle Effects","LOADSOFLITTLETHINGS","Big Wheel Cars"],

  ["Characters","","Change Outfit"],
  ["Characters","IWANTBIGTITS","Candy Suxxx"],
  ["Characters","MYSONISALAWYER","Ken Rosenberg"],
  ["Characters","LOOKLIKELANCE","Lance Vance"],
  ["Characters","ROCKANDROLLMAN","Love Fist 1"],
  ["Characters","WELOVEOURDICK","Love Fist 2"],
  ["Characters","FOXYLITTLETHING","Mercedes"],
  ["Characters","ONEARMEDBANDIT","Phil Cassady"],
  ["Characters","CHEATSHAVEBEENCRACKED","Ricardo Diaz"],
  ["Characters","IDONTHAVETHEMONEYSONNY","Sonny Forelli"],
  ["Characters","PROGRAMMER","Skinny"],
  ["Characters","DEEPFRIEDMARSBARS","Fat"],
  ["Characters","CERTAINDEATH","Smoke a Cigarette"],
  ["Characters","LOOKLIKEHILARY","Hilary King"],

  ["Weather","ALOVELYDAY","Sunny Weather"],
  ["Weather","CATSANDDOGS","Stormy Weather"],
  ["Weather","CANTSEEATHING","Foggy Weather"],
  ["Weather","APLEASANTDAY","Overcast Weather"]
];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function applyCode(code) {
  if (!document.body.classList.contains("gameIsStarted")) {
    throw new Error("Start Vice City before applying a cheat.");
  }
  if (typeof window.typeCheat !== "function") {
    throw new Error("Vice City cheat input is still loading. Try again in a few seconds.");
  }
  await window.typeCheat(code);
}

export function installUserViceCityCheats() {
  const panel = document.getElementById("vc-game-cheats-panel");
  if (!panel) return;

  const scroll = panel.querySelector(".vc-game-cheat-scroll");
  const status = panel.querySelector("#vc-game-cheat-status");
  const count = panel.querySelector("#vc-game-cheat-count");
  const search = panel.querySelector("#vc-game-cheat-search");
  if (!scroll || !status) return;

  const categories = [];
  USER_VC_CHEATS.forEach((item) => {
    if (!categories.includes(item[0])) categories.push(item[0]);
  });

  scroll.innerHTML = categories.map((category) => {
    const items = USER_VC_CHEATS.filter((item) => item[0] === category);
    return '<div class="vc-game-cheat-group" data-category="' + esc(category) + '">' +
      '<h3>' + esc(category) + '</h3><div class="vc-game-cheat-grid">' +
      items.map((item) => {
        const code = item[1] || "";
        const shown = code || "CODE NOT SUPPLIED";
        return '<button type="button" class="vc-game-cheat-item" data-code="' + esc(code) +
          '" data-label="' + esc(item[2]) + '" data-search="' +
          esc((item[2] + " " + shown).toLowerCase()) + '">' +
          '<span>' + esc(item[2]) + '</span><code>' + esc(shown) + '</code></button>';
      }).join("") +
      '</div></div>';
  }).join("");

  if (count) count.textContent = USER_VC_CHEATS.length + " cheats";

  scroll.querySelectorAll(".vc-game-cheat-item").forEach((row) => {
    row.addEventListener("click", async () => {
      const code = row.dataset.code || "";
      const label = row.dataset.label || "Cheat";
      if (!code) {
        status.textContent = "No cheat code was supplied for " + label + ".";
        return;
      }
      row.disabled = true;
      status.textContent = "Applying " + label + " — " + code + "...";
      try {
        await applyCode(code);
        status.textContent = "Applied: " + label + " — " + code;
      } catch (error) {
        status.textContent = error?.message || "Could not apply cheat.";
      } finally {
        row.disabled = false;
      }
    });
  });

  search?.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let visible = 0;
    scroll.querySelectorAll(".vc-game-cheat-item").forEach((row) => {
      const show = !q || (row.dataset.search || "").includes(q);
      row.hidden = !show;
      if (show) visible++;
    });
    scroll.querySelectorAll(".vc-game-cheat-group").forEach((group) => {
      group.hidden = !Array.from(group.querySelectorAll(".vc-game-cheat-item")).some((row) => !row.hidden);
    });
    if (count) count.textContent = visible + (visible === 1 ? " cheat" : " cheats");
  });
}
