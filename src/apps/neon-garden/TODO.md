# Neon Garden · TODO

## Phase 1 — Foundations
- [ ] Spike WebGPU scene: orbit camera, fullscreen bloom pass prototype.
- [ ] Implement seed + branch data structures (position, age, growth rate).
- [ ] Author base shader set: stem material, neon petal material, additive glow.
- [ ] Input mapping: pointer drag → light ribbon; tap → seed spawn.
- [ ] Build adaptive quality toggles (Low / Medium / High) with instancing caps.

## Phase 2 — Interaction & Atmosphere
- [ ] Audio-reactive pipeline (Web Audio analyser feeding growth modifiers).
- [ ] Palette system with 4 curated themes + custom HSV editor.
- [ ] Particle pollen system tied to bloom events.
- [ ] Camera choreography (slow dolly, auto-compose when user idle).
- [ ] Ambient sound bed + procedural chimes for bloom moments.

## Phase 3 — Capture & Polish
- [ ] Screenshot + 10-second looped video export (WebM / GIF fallback).
- [ ] UI overlay with minimal controls, tooltips, accessibility toggles.
- [ ] Onboarding flow (1–2 slide hints, skip-able).
- [ ] Performance audit on mid-tier laptops & tablets, add graceful degradation.
- [ ] QA checklist: input devices, resizing, suspend/resume, mobile orientation.

## Backlog / Stretch Goals
- [ ] Shared session sync (WebRTC or Supabase Realtime) for collaborative gardens.
- [ ] Generative soundtrack layer using Tone.js or Web MIDI input.
- [ ] Seasonal palette packs, automatically rotating via launcher metadata.
- [ ] AR snapshot export (USDZ) for iOS.
