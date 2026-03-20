# The Ancient Wanderer

An interactive audiovisual experience — a fictional ancient world told entirely through music. As you scroll, new layers of a live composition enter and dissolve with the landscape: solo strings give way to harp, percussion, choir, and full orchestra, building toward a climax and fading to silence.

**Live:** https://jacklarkincomposer.github.io/ancient-wanderer

---

## Concept

The piece treats scrolling as a performance gesture. Each section of the page corresponds to a movement of the composition — the user's pace through the world becomes the conductor's tempo. A pace lock holds the listener inside each section long enough to hear the musical transition before releasing them to continue.

The audio is not pre-mixed. It is assembled live in the browser from individual stem tracks, mixed in real time by the Web Audio API as the listener moves through the experience.

---

## File Structure

```
ancient-wanderer/
│
├── index.html                        # Shell HTML — no inline JS or CSS
├── css/
│   └── style.css                     # All visual styles
│
├── js/
│   ├── main.js                       # Entry point — boots the experience
│   ├── audio-engine.js               # Web Audio engine (scheduler, fades, stems)
│   ├── stem-loader.js                # Lazy loader — 3-room sliding window
│   ├── scroll-controller.js          # Scroll → room detection, pace lock, auto-scroll
│   └── ui.js                         # Cursor, visualiser, notifications, indicators
│
└── compositions/
    └── ancient-wanderer/
        └── config.json               # All composition data — stems, rooms, audio settings
```

### Module roles

| File | Responsibility |
|------|---------------|
| `main.js` | Fetches config, creates all modules, wires DOM controls, runs two-phase boot (prefetch → decode) |
| `audio-engine.js` | AudioContext lifecycle, lookahead scheduler, GainNode fades, stem loading/eviction, phase-aligned mid-loop scheduling |
| `stem-loader.js` | Decides which stems to load/evict based on current room position; 3-room window (prev + current + next) |
| `scroll-controller.js` | Maps scroll position to rooms, fires `engine.setRoom()`, enforces pace locks, drives auto-scroll |
| `ui.js` | Custom cursor, frequency visualiser, stem indicator dots, notifications, scroll arrow |
| `config.json` | Single source of truth for all composition data — see architecture section below |

---

## Config-Driven Architecture

All composition data lives in `compositions/ancient-wanderer/config.json`. The engine contains no hardcoded stem names, room counts, or durations — everything is data-driven.

### Adding a new stem

1. Upload the WAV file to the R2 CDN at `cdnBase` in the config.
2. Add an entry to the `stems` array:

```json
{
  "id": "flute",
  "file": "Flute_Melody.wav",
  "label": "Flute",
  "group": "woodwind"
}
```

3. Reference the `id` in any room's `stems` array.

No engine code changes required.

### Adding a new room

Add an entry to the `rooms` array:

```json
{
  "id": "scene-6",
  "stems": ["flute", "harp", "choir"],
  "paceLock": 10
}
```

- `id` must match the HTML element's `id` attribute for that section.
- `stems` is the set of stem IDs active in this room. Entering the room fades in any stems not already playing; leaving fades them out.
- `paceLock` is the minimum listening duration in seconds before the user can scroll forward.
- Rooms without `paceLock` have no enforced hold.
- The outro room uses `isOutro: true`, `holdDuration`, and `creditsTransition` — see the existing outro entry for the full schema.

### Config schema overview

```json
{
  "audio": {
    "cdnBase": "https://...",
    "defaultLoop": { "duration": 19.2, "bars": 16, "bpm": 150, "timeSignature": [3,4] },
    "fadeIn": 3,
    "fadeOut": 4,
    "masterGain": 0.8,
    "masterFadeOut": 8,
    "scheduleAhead": 1.5,
    "scheduleInterval": 200
  },
  "stems": [ { "id": "...", "file": "...", "label": "...", "group": "..." } ],
  "rooms": [ { "id": "...", "stems": [...], "paceLock": 10 } ],
  "impacts": [ { "id": "...", "duckTo": 0.4, "duckIn": 1.8, "duckOut": 2.2 } ],
  "stingers": []
}
```

---

## Audio Engine

### Lookahead scheduler

The Web Audio API's clock is sample-accurate but JavaScript timers are not. The engine uses a lookahead scheduler to bridge the two:

- A `setTimeout` loop fires every `scheduleInterval` ms (200ms by default).
- Each tick checks whether the next loop generation needs to be scheduled within the next `scheduleAhead` seconds (1.5s).
- If so, `schedGeneration(when)` is called with the precise Web Audio timestamp for that generation's start.
- `BufferSource.start(when)` hands the exact start time to the audio hardware — no JavaScript jitter.

This means all stems in a generation start at an identical `when` timestamp, ensuring perfect phase coherence regardless of CPU load or tab throttling.

### Why all stems play at gain 0

Every loaded stem gets a `BufferSource` scheduled at every generation, even if it is not active in the current room. Inactive stems play silently at `gain = 0`. The `GainNode` is the only switch.

This design means that when a room transition happens and a stem needs to fade in, its `BufferSource` is already running — `fadeIn()` simply ramps the `GainNode` from 0 to 1 over 3 seconds and audio appears immediately. There is no waiting for the next loop boundary.

For stems that finish loading mid-loop (after the current generation was scheduled), a `scheduleImmediately()` helper starts a phase-aligned `BufferSource` at the correct offset into the current loop, so the stem is playable within 50ms of loading regardless of where in the 19.2-second loop cycle the load completes.

### Lazy loader

Stems are large WAV files. The loader maintains a 3-room sliding window:

- **Current room** — loaded and decoded first (highest priority).
- **Next room** — loaded in the background immediately after current.
- **Previous room** — kept in memory to allow instant back-scroll.
- **Rooms 3+ behind** — evicted. Stems exclusive to those rooms are disconnected and deleted from memory.

The credits transition stems are also pre-loaded when the outro room is approaching.

---

## Local Development

ES modules (`type="module"`) require an HTTP server — they will not work over the `file://` protocol due to CORS restrictions.

```bash
# From the project root:
python3 -m http.server 8080

# Then open:
# http://localhost:8080
```

Any static HTTP server works (`npx serve`, VS Code Live Server, etc.). There is no build step, no bundler, and no `node_modules`.

Stem audio is fetched from the R2 CDN. The CDN bucket has public CORS headers set for all origins, so local dev works without any proxy.

---

## Known Limitations

**Load time on mobile** — Stems are uncompressed 24-bit WAV files, typically 5–15 MB each. On a slow mobile connection, the initial fetch (2 stems for rooms 1–2) can take 10–20 seconds. The fetch progress bar at the top of the page indicates loading.

**WAV format** — WAV files are used because they are universally supported and losslessly preserve the recorded dynamics. OGG/Opus compression would reduce file sizes by ~10× but is not yet implemented.

**Browser autoplay policy** — All browsers block `AudioContext` creation until a user gesture. The "Enter the World" button serves as the required gesture. The context is created inside the click handler, satisfying all major browsers.

**Safari AudioContext** — Safari creates `AudioContext` in a suspended state even after a user gesture. The `resumeContext()` call in the scroll handler ensures the context resumes on first scroll interaction.

**No mobile optimisation** — The experience is designed for desktop with a mouse. Touch scrolling works but the custom cursor and some layout choices are optimised for pointer devices.

---

## Roadmap

- **OGG/Opus compression** — Replace WAV with OGG at ~128kbps, reducing stem sizes by ~90%.
- **Stingers** — One-shot audio events triggered at specific scroll positions (thunder crack, distant bell). Schema is in the config (`stingers: []`) but not yet implemented.
- **Variable tempo per room** — Each room can define its own `loop` object with a different `duration` and `bpm`. The scheduler already reads `room.loop` — rooms just need the field populated.
- **Multiple compositions** — The URL parameter `?c=composition-id` routes to any composition folder. Adding a new piece requires only a new `compositions/[id]/config.json` and corresponding HTML page.
- **Video integration** — Replace static scene images with looping video clips that sync to the audio loop duration.
- **OGG fallback** — Detect codec support at runtime and serve OGG where available, WAV as fallback.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Vanilla JavaScript (ES2020, ES modules) |
| Audio | Web Audio API — `AudioContext`, `GainNode`, `AnalyserNode`, `AudioBufferSourceNode` |
| Styling | Plain CSS (custom properties, `@keyframes`, `IntersectionObserver` reveals) |
| Fonts | Google Fonts — Cinzel, Cormorant Garamond |
| Hosting | GitHub Pages (HTML/CSS/JS) + Cloudflare R2 (audio CDN) |
| Build | None — no bundler, no transpiler, no `node_modules` |

---

## Academic Context

This project is submitted as part of a final-year composition portfolio at [Institution]. It explores the intersection of interactive web technology and scored music — specifically, whether a listener's physical navigation of a web page can function as a form of musical performance.

The composition *The Ancient Wanderer* is an original work for strings, percussion, harp, and choir, written and produced by Jack Larkin. The web experience is a purpose-built platform for presenting the piece — the technology serves the music, not the reverse.

The stem architecture (individual instrument tracks mixed live in the browser) is designed to make the listener's scroll behaviour audible: a fast scroll collapses the transition; a slow, attentive scroll hears the full 3-second fade as intended by the composer.
