# Neon Garden

Neon Garden is an interactive, procedural art experience built for the Mallo
launcher. The project explores bioluminescent botany rendered in real-time,
inviting visitors to sculpt luminous foliage with light, sound, and motion.

## Vision

- **Living light installation** — A dark, volumetric environment where neon
  flora grows in response to user interaction and ambient audio.
- **Accessible creativity** — Casual visitors can trigger beautiful results in
  seconds, while power users can dive into parametric controls for precise
  compositions.
- **Shareable moments** — Built-in capture tools encourage exporting stills or
  short looping clips that showcase the evolving garden.

## Experience Pillars

1. **Glow-first aesthetics** — Soft additive lighting, color harmonies inspired
   by deep-sea bioluminescence, subtle bloom and chromatic fog.
2. **Procedural growth** — Layered systems (noise fields, L-systems, instanced
   geometry) drive always-different foliage while staying performant.
3. **Light as interface** — Pointer, touch, or controller gestures emit light
   beams that coax plants into new shapes. Optional microphone input translates
   audio amplitude and frequency into growth pulses.
4. **Calming ambience** — Minimal UI chrome, a hushed generative soundtrack,
   gentle camera motion, and time-of-day color grading keep the space meditative.

## Technical Overview

- **Render stack**: Target WebGPU first, with a graceful WebGL2 fallback. Uses
  instancing for stems and petals, particle systems for pollen, and fullscreen
  compositing for volumetric light shafts.
- **Data model**: Scene graph organized into _clusters_. Each cluster owns:
  - Seed position and lifespan
  - Growth curve parameters (spline control points)
  - Material palette (primary, accent, rim colors)
  - Audio-response coefficients
- **Simulation loop**:
  1. Update seeds with Perlin/Simplex noise and player input forces.
  2. Spawn or retire branches based on growth budget.
  3. Rebuild instance buffers (stems, petals) and shader uniforms.
  4. Composite lighting passes and post-process (bloom, color grade).
- **Performance**: Adaptive quality settings (particle count, bloom samples,
  target FPS). Profiling hooks for Chrome GPU track.

## Interaction Schema

| Input                | Effect                                                        |
|----------------------|---------------------------------------------------------------|
| Pointer / touch drag | Emits a light ribbon that bends nearby stems toward the path. |
| Click / tap hold     | Plants a seed cluster that blooms over 5–10 seconds.          |
| Keyboard (1–4)       | Switches palette presets.                                     |
| Spacebar             | Toggles “autoplay” — garden evolves without input.            |
| Microphone (optional)| Peaks drive bloom velocity & pollen bursts.                   |

## Deliverables

- `main.ts` (or `.js`): scene initialization, render loop, interaction bindings.
- `systems/growth.ts`: procedural plant creation & simulation.
- `systems/rendering.ts`: instancing, shader setup, post-processing chain.
- `ui/controls.tsx`: lightweight overlay for presets, capture tools.
- `assets/shaders/`: WGSL/GLSL files for foliage, particles, glow, and composites.

## Future Ideas

- Multi-user “shared garden” mode where several clients co-create a scene.
- Daily challenges themed around color palettes or growth constraints.
- AR export: bake the garden into a USDZ/glTF for mobile AR viewers.

For development tasks and ownership roles, see `TODO.md` and `AGENTS.md` in this
folder.
