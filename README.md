# WebGPU 3D Chess

A fully client-side 3D chess experience built with HTML, CSS and the WebGPU API. The renderer, input handling and game logic are all modularized to make it easy to extend the board, visuals or rules engine.

## Features

- WebGPU powered renderer with physically-inspired lighting, instanced board tiles and multi-part piece geometry.
- Playable chess ruleset (including check and mate detection, automatic queen promotion; castling and en passant are not yet implemented).
- Orbit/pan/zoom camera controls, tile picking, move highlighting and move history tracking.
- Responsive HUD with current turn, check indicators, reset control and move log.

## Running locally

No build step is required. Open `index.html` in a WebGPU-enabled browser (such as Chrome 113+ or recent Edge builds). For the best experience run a local web server, e.g.

```bash
npx serve .
```

Then navigate to the served URL in a browser that supports WebGPU.

## Controls

- **Left click**: select a piece and choose a destination tile.
- **Right click + drag**: orbit the camera around the board.
- **Middle click + drag** or **Shift + left drag**: pan the camera.
- **Mouse wheel / trackpad scroll**: zoom in or out.
- **Reset Game** button: restart from the initial position.

## Project structure

```
├── index.html          # Layout and canvas host
├── styles.css          # HUD and layout styling
└── src
    ├── app.js          # Game orchestration, input and UI wiring
    ├── main.js         # Entry point and bootstrapping
    ├── camera          # Orbit camera controller
    ├── game            # Chess rules engine
    ├── graphics        # Geometry builders and renderer
    ├── math            # Minimal vector / matrix utilities
    ├── shaders         # WGSL shader modules
    └── webgpu          # Context helpers
```

## Extending the game

The codebase is organized so that rendering, camera behaviour, input and game logic are largely independent. For example:

- Add new shaders or materials by creating additional WGSL files in `src/shaders` and swapping pipelines in `src/graphics/renderer.js`.
- Extend the `ChessGame` class to add advanced rules (castling, en passant, time controls) without touching rendering code.
- Customize visual design by editing the piece layer definitions in `src/app.js` or the global styling in `styles.css`.

Enjoy exploring WebGPU!
