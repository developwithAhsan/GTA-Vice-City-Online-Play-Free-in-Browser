# GTA Vice City Online — Play Free in Browser (WebAssembly Port)

> **Play GTA Vice City online free** — no download, no install required. The full game runs entirely in your browser via WebAssembly. Works on desktop and mobile.

[![Live Demo](https://img.shields.io/badge/Play%20Now-Live%20Demo-ff2870?style=for-the-badge)](https://joncodeofficial.github.io/gta-vice-city-wasm/)
[![WebAssembly](https://img.shields.io/badge/Powered%20By-WebAssembly-654ff0?style=for-the-badge&logo=webassembly)](https://webassembly.org/)
[![Platform](https://img.shields.io/badge/Platform-Browser%20%7C%20Mobile-00d2ff?style=for-the-badge)](#browser-support)

**🎮 [Play GTA Vice City Online Now →](https://joncodeofficial.github.io/gta-vice-city-wasm/)**

---

## What Is This?

This is a complete **browser-based port of GTA: Vice City** built on the [reVCDOS](https://github.com/Lolendor/reVCDOS) reverse-engineered engine and compiled to WebAssembly. The full game — all missions, open world, vehicles, radio stations, and cutscenes — runs directly in a browser tab.

Game files (~701 MB) are downloaded once and stored permanently in your browser's local storage (OPFS). After the first visit the game loads instantly offline with no CDN dependency and no recurring downloads.

> **Keywords:** `gta vice city online` · `gta vice city play online free` · `gta vice city browser game` · `grand theft auto vice city online` · `gta vice city no download` · `gta vice city wasm` · `gta vice city online game` · `gta vice city play in browser`

---

## Features

- **Full game** — every mission, vehicle, weapon, and radio station from the 2002 original
- **No install required** — game files auto-download on first visit and cache permanently
- **Works offline** — after first load, the game runs entirely from your device via OPFS
- **Mobile touch controls** — full on-screen gamepad with context-aware buttons (on-foot vs. in-car)
- **Camera drag** — drag the right side of the screen to rotate the camera on mobile
- **Gamepad support** — plug in any USB or Bluetooth controller on desktop
- **Save Manager** — import `.b` save files from PC or PS2, export backups anytime
- **FPS limiter** — set to 30 FPS for stable physics or to reduce heat on mobile
- **Cheat codes** — full cheat keyboard overlay with one-tap quick cheats on mobile
- **Fullscreen & Share** — one-click fullscreen and native share/copy link

---

## Play Now

**Live:** [joncodeofficial.github.io/gta-vice-city-wasm](https://joncodeofficial.github.io/gta-vice-city-wasm/)

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome 110+ | ✅ Full support | ✅ Full support |
| Firefox 111+ | ✅ Full support | ✅ Full support |
| Safari 16.4+ | ✅ Full support | ✅ Full support (iOS) |
| Samsung Internet | ✅ Full support | ✅ Full support |

---

## How It Works

```
Browser visit
    │
    ▼
Service Worker registers
    │
    ▼
OPFS checked for cached game files
    │
    ├─ Found ──► PLAY button enabled immediately (instant load)
    │
    └─ Not found ──► Auto-download game archive (~701 MB)
                          │
                          ▼
                    Web Worker extracts tar.gz → writes files to OPFS
                          │
                          ▼
                    Service Worker serves /vcbr/ and /vcsky/ from OPFS
                          │
                          ▼
                    WASM engine (reVC) boots → game renders to <canvas>
```

### Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS + Vite |
| Game engine | WebAssembly (reVCDOS / reVC) |
| Local storage | OPFS (Origin Private File System) |
| Asset serving | Service Worker — intercepts `/vcbr/` and `/vcsky/` |
| Download proxy | Vite plugin — proxies archive.org CDN, handles CORS & redirects |
| Touch input | Custom GamepadEmulator — maps screen drag zones to virtual gamepad axes |
| Save persistence | IDBFS (IndexedDB-backed filesystem) |

---

## Mobile Touch Controls

On any touch device, a full on-screen control overlay appears automatically when the game starts:

| Zone | Action |
|------|--------|
| Left half of screen — drag | Move character / steer vehicle |
| Right half of screen — drag | Rotate camera |
| Top-left | Pause / Menu |
| Below pause | Cheat keyboard |
| Right side — on foot | Get in car · Punch |
| Right side — in car | Get out · Handbrake |
| Bottom-right — on foot | Sprint · Jump |
| Top-right — on foot | Cycle weapon |
| Top-right — in car | Camera · Horn |
| Centre-top — in car | Radio station switcher |

Controls switch automatically when you enter or exit a vehicle. All controls are hidden during cutscenes and menus so you can navigate them freely.

---

## Keyboard Controls (Desktop)

| Key | Action |
|-----|--------|
| `W A S D` | Move / Drive |
| Mouse | Camera / Aim |
| Left Click | Fire |
| Right Click | Target lock |
| `Space` | Jump |
| `Shift` | Sprint / Accelerate |
| `Ctrl` | Crouch |
| `F` | Enter / Exit vehicle |
| `Tab` | Next weapon |
| `Q` | Previous weapon |
| `Esc` | Pause / Menu |
| `M` | Map |
| `H` | Horn |
| `R` | Handbrake |

---

## Cheat Codes

Type any cheat during gameplay on desktop, or tap the cheat button on mobile:

| Code | Effect |
|------|--------|
| `ASPIRINE` | Full health |
| `YOUWONTLIKETHIS` | Full armor |
| `LEAVEMEALONE` | Lower wanted level |
| `BRINGITON` | 6-star wanted level |
| `PANZER` | Spawn Rhino tank |
| `BIGBANG` | Blow up all cars |
| `NUTTERTOOLS` | Heavy weapons set |
| `PROFESSIONALTOOLS` | Combat weapons set |
| `FANNYMAGNET` | Women follow you |
| `STILLLIKEDRESSINGUP` | Change skin |
| `ICANTTAKEITANYMORE` | Suicide |
| `CERTAINDEATH` | Smoke cigarette |

---

## Running Locally

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)

### Setup

```bash
git clone https://github.com/joncodeofficial/gta-vice-city-wasm.git
cd gta-vice-city-wasm
pnpm install
pnpm dev
```

Then open `http://localhost:5000`. The dev server proxies the game archive download automatically — no manual file setup needed.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_ASSET_URL` | archive.org CDN URL | Override the `game.tar.gz` download source |

---

## Project Structure

```
├── index.html                  # Main page — UI, SEO meta tags, JSON-LD structured data
├── src/
│   ├── main.js                 # Setup flow: SW registration, OPFS check, download, launch
│   └── style.css               # All styles including touch controls overlay
├── public/
│   ├── sw.js                   # Service Worker — serves game assets from OPFS
│   ├── extract-worker.js       # Web Worker — decompresses tar.gz into OPFS
│   ├── game.js                 # Game bootstrap, touch input, state management
│   ├── GamepadEmulator.js      # Virtual gamepad — maps touch zones to gamepad axes
│   ├── idbfs.js                # IndexedDB filesystem (save game persistence)
│   └── modules/
│       ├── main.js             # WASM module entry point
│       ├── events.js           # Browser / input event bridge
│       ├── graphics.js         # WebGL rendering helpers
│       ├── audio.js            # Audio context management
│       ├── cheats.js           # Cheat code overlay (desktop + mobile)
│       └── asm_consts/
│           └── en.js           # WASM → JS state callbacks (menu, car, cutscene flags)
└── vite.config.js              # Vite config + archive.org proxy plugin
```

---

## Browser Requirements

The game uses four modern browser APIs:

| API | Purpose | Minimum version |
|-----|---------|----------------|
| WebAssembly | Game engine execution | Chrome 57, Firefox 52, Safari 11 |
| Service Workers | Asset serving from OPFS | Chrome 45, Firefox 44, Safari 11.1 |
| OPFS | Local game file storage | Chrome 86, Firefox 111, Safari 15.2 |
| SharedArrayBuffer | WASM threading | Chrome 92, Firefox 79, Safari 15.2 |

> SharedArrayBuffer requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. The dev server and production server set these automatically.

---

## FAQ

**Is this the full GTA Vice City game?**
Yes. All missions, vehicles, weapons, and radio stations from the original 2002 release are present.

**Do I need to upload any files?**
No. Game files download automatically on first visit (~701 MB). Every visit after that loads instantly from your browser's local storage.

**Does it work on iPhone and Android?**
Yes. Full touch controls appear automatically on mobile. Play in landscape orientation for the best experience.

**Why do physics act weird or missions fail?**
The original game was engineered for 30 FPS. Running at higher framerates causes physics glitches. Set the FPS Limit to 30 in the settings panel to fix mission-critical physics bugs.

**Can I use a gamepad / controller?**
Yes. Any USB or Bluetooth gamepad is recognized automatically on desktop via the browser's Gamepad API.

**How do I transfer my PC save file?**
Use the Save Manager on the page to upload a `.b` save file from your PC installation (`Documents/Rockstar Games/GTA Vice City/User Files/`). You can also download your browser save as a backup at any time.

**Does it work offline after the first download?**
Yes. Once the game files are cached in OPFS, the Service Worker serves everything locally. No internet connection needed after first setup.

---

## Technical Notes

- The WASM engine is built from [reVC](https://github.com/SugaryHull/re3/tree/miami) — an open-source reverse-engineered reimplementation of the GTA Vice City engine
- Game configuration (`revc.ini`) is written to IDBFS at startup; `Method=1` is set automatically on touch devices to enable analog gamepad input mapping
- Touch control zones use the Pointer Events API with `setPointerCapture` for reliable multi-touch tracking across all mobile browsers
- Game state transitions (on-foot ↔ in-car, menu open/closed, cutscene active) are driven by direct `dataset` attribute writes from WASM `ASM_CONSTS` callbacks — CSS attribute selectors instantly show or hide the correct control buttons with zero JavaScript
- `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers are required for SharedArrayBuffer; both are set on all response paths

---

## Credits

**Browser client port** (OPFS storage, Service Worker, UI, auto-download, mobile touch controls):
[@joncodeofficial](https://github.com/joncodeofficial)

**Based on** [reVCDOS](https://github.com/Lolendor/reVCDOS) by [@Lolendor](https://github.com/Lolendor)

**WASM engine port** by the DOS Zone team:
- [@specialist003](https://github.com/okhmanyuk-ev)
- [@caiiiycuk](https://www.youtube.com/caiiiycuk)
- [@SerGen](https://t.me/ser_var)

**Game engine** based on the open-source reverse engineering project [re3/reVC](https://github.com/SugaryHull/re3/tree/miami)

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## Disclaimer

This is not a commercial release and is not affiliated with Rockstar Games or Take-Two Interactive. It is built entirely on an open-source reimplementation of the game engine and does not include, distribute, or host any original game assets. You must own a legitimate copy of GTA: Vice City to use this software. All trademarks and copyrights belong to their respective owners.

---

*GTA Vice City online — play free in browser. Grand Theft Auto Vice City web edition, no download required.*
