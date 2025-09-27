# Mallo Experiments

Mallo is a collection of realtime playgrounds that live entirely in the browser. The primary experience is a WebGPU-powered path-traced chess board backed by a Stockfish worker.  This README documents how the project is structured today so future updates are quick to orient.

## Quick Start

```bash
# serve the project from the repo root (any static server works)
npx serve .
# or use python
python3 -m http.server 4173
```

Open the served URL in a WebGPU-capable browser (Chrome 113+, Edge 113+, or other Chromium builds with `--enable-unsafe-webgpu`). The site auto-launches the chess experience and keeps the HUD hidden until assets finish loading.

## Repository Layout

```
├── index.html                  # Single-page shell, includes loader + Babylon CDN scripts
├── styles.css                  # Global layout, HUD styling, loading overlay
├── src
│   ├── main.js                 # DOM bootstrap, app launcher, loader animation plumbing
│   ├── apps
│   │   ├── chess
│   │   │   ├── app.js          # Chess application orchestrator (state, UI, engine)
│   │   │   ├── assets          # Babylon-ready GLBs + FBX source for conversion
│   │   │   ├── camera          # Orbit-style camera controller utilities
│   │   │   ├── game            # Chess rules engine, move history, Stockfish worker
│   │   │   ├── graphics        # Babylon renderer, board/piece instancing, materials
│   │   │   ├── loading         # Babylon-based king preview animation
│   │   │   ├── shaders         # WGSL shaders (legacy WebGPU renderer prototype)
│   │   │   └── vendor          # Stockfish wasm bundle
│   │   └── neon-garden         # Babylon procedural garden demo
│   ├── math                    # Minimal vec/mat helpers shared by chess systems
│   └── webgpu                  # (Legacy) WebGPU context helpers used by early builds
└── README.md                   # You are here
```

### Key External Assets

- `src/apps/chess/assets/*.glb` – High-fidelity Babylon meshes for each chess piece.
- `src/apps/chess/vendor/stockfish-17.1-lite-single-03e3232.js` – Stockfish WASM build for engine assistance.
- `index.html` pulls Babylon.js + loaders from CDN so no bundler is required.

## Runtime Flow

1. **Boot (`src/main.js`)**
   - Waits for `DOMContentLoaded`, wires up filters, move log controls, and binds launcher buttons.
   - Immediately calls `initializeChess()` which:
     - Reveals the full-screen black overlay.
     - Creates a `KingLoadingPreview` instance (Babylon mini-scene) for the king reveal animation.
     - Instantiates `App` from `src/apps/chess/app.js`, passing callbacks for state updates, UI messages, and per-asset load progress.

2. **Loading Overlay**
   - `KingLoadingPreview` loads `king.glb`, spins it slowly, and uses a dynamic clipping plane to grow the model from the feet upward while easing visibility. Progress updates are smoothed every frame and the overlay is held for at least five seconds before fade-out.

3. **Chess App**
   - `App.initialize()` builds the Babylon renderer, orbit camera, board instances, and attaches event listeners.
   - When single-player mode is active it boots Stockfish asynchronously.
   - `App.start()` enters the animation loop: camera updates, animation tweens, renderer draws each frame.

4. **HUD + Input**
   - Move selection, highlighting, and history rendering are handled inside `app.js` via `onStateChange` callbacks.
   - The HUD is initially hidden and only revealed after the loader completes to keep the focus on the animation.

5. **Neon Garden**
   - Accessible from the launcher (currently hidden by default) and driven by Babylon as well. Event listeners live in `src/main.js`, and the implementation mirrors the chess bootstrap pattern.

## Important Modules

| Path | Responsibility |
| ---- | -------------- |
| `src/apps/chess/app.js` | Central coordinator: creates renderer, camera, input handlers, Stockfish engine, HUD wiring. |
| `src/apps/chess/graphics/renderer.js` | Babylon scene setup, model caching, instancing, load-progress emission for the king preview. |
| `src/apps/chess/loading/kingPreview.js` | Dedicated Babylon scene for the loading animation; manages easing, smoothing, and cleanup. |
| `src/apps/chess/game/chessGame.js` | Pure chess rules & move generation. Keeps history to drive the HUD list. |
| `src/apps/chess/game/stockfishEngine.js` | Wraps the Stockfish WASM worker with promise-based helpers. |
| `src/apps/chess/camera/cameraController.js` | Orbit camera with touch/scroll controls and auto-anchor behaviour. |
| `src/main.js` | UI plumbing: loader, filters, move log responsiveness, app launch toggles, overlay visibility. |

## Styling Notes

- Loader overlay is intentionally pure black (`styles.css:572`) with concentric gradient focus on the king model.
- HUD (`.ui-overlay`) is hidden until chess initialization finishes; make sure any new controls follow the same visibility logic in `src/main.js`.
- Mobile breakpoints are driven by the `@media (max-width: 768px)` section near the bottom of `styles.css`.

## Working With Assets

- All Babylon mesh loads are relative to `src/apps/chess/assets`. Paths are case-sensitive (e.g., `king.glb`).
- If new meshes are added, register them in the renderer’s `modelDefinitions` map and adjust `KingLoadingPreview` if the loader animation should feature a different model.

## Development Tips

- No bundler is required; ES modules run natively. Keep paths relative from `index.html`.
- When editing Babylon scenes, keep in mind that `Renderer` caches materials per color key. If you introduce new materials, update `getColorKey()` and the tint cache logic.
- `KingLoadingPreview` owns its own Babylon engine; dispose it to free resources when swapping loader visuals.
- The move log is virtualized for mobile: `src/main.js` toggles classes and ARIA attributes based on media queries – extend there if new HUD panels are added.

## Troubleshooting

- **404 for piece models**: verify filenames match casing (`king.glb`, `queen.glb`, etc.). Both the loader and renderer share the same asset folder.
- **WebGPU not available**: Chrome/Edge must have WebGPU enabled; otherwise Babylon will fall back to WebGL, but Stockfish and the overlay still work.
- **Stuck loader**: check console for Babylon warnings. The overlay will remain if either the renderer initialization or Stockfish bootstrap throws; errors are surfaced via `console.error` in `src/main.js`.

This document should evolve alongside the codebase—update the repository layout and flow sections whenever new apps or systems are added.
