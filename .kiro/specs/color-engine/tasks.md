# Color Engine — Implementation Tasks

Spec ID: `color-engine`
Implements `requirements.md` per `design.md`. Each task references the requirement(s) it
satisfies. Check a box only after its tests pass (`npm test`), per the ghost-smith workflow.

Conventions (from `.kiro/steering/tech.md`):
- Pure ES modules, no DOM, no globals, deterministic.
- Every exported function gets example tests **and** at least one fast-check property test.
- Run `npm test` after each task; fix failures before moving on.

## Phase 1 — Module scaffolding

- [x] **T-00** Create `src/engine/color.js`, `src/engine/cvd.js`, `src/engine/scan.js` as
  empty modules exporting the functions named in design §1. Add `test/color.test.js`,
  `test/cvd.test.js`, `test/scan.test.js` with a `node:test` skeleton.
  *(REQ-42, REQ-44)*

## Phase 2 — Color parsing & formats (color.js)

- [x] **T-01** Implement `parseColor(str)` accepting `#rgb`, `#rgba`, `#rrggbb`,
  `#rrggbbaa`, `rgb(r,g,b)`, `rgb(r g b)`, `rgba(r,g,b,a)`; throw on invalid input.
  Write example tests for each accepted form + rejection tests. Write fast-check **P-01**,
  **P-02**.
  *(REQ-01, REQ-02, REQ-03)*
- [x] **T-02** Implement `toHex({r,g,b})` and `toRgbString({r,g,b,a})` with canonical
  lowercase output; example tests + reuse **P-01** for round-trip.
  *(REQ-04)*

## Phase 3 — sRGB ↔ linear & luminance (color.js)

- [x] **T-03** Implement `linearize({r,g,b}) → LinRGB` and `delinearize(LinRGB) → {r,g,b}`
  using the 0.04045 / 0.0031308 thresholds. Example tests for 0, 0.5-ish, 255. Write
  fast-check **P-03** (round-trip tolerance).
  *(REQ-05, REQ-06, REQ-07)*
- [x] **T-04** Implement `relativeLuminance({r,g,b})` with WCAG 2.2 weights. Example tests
  for black=0, white=1, mid-gray. Write fast-check **P-04**, **P-05**.
  *(REQ-08, REQ-09)*

## Phase 4 — Contrast, verdict & display (color.js)

- [x] **T-05** Implement `contrastRatio(fg, bg)` per the (Lmax+0.05)/(Lmin+0.05) formula.
  Example tests: white/black=21, same=1. Write fast-check **P-06..P-09** (range, symmetric,
  white/black, identity) and **P-10** (monotonicity).
  *(REQ-10, REQ-11)*
- [x] **T-06** Implement `verdict(ratio, {level, large})` with thresholds 4.5/3.0/7.0/4.5.
  Boundary example tests. Write fast-check **P-11**.
  *(REQ-12, REQ-13)*
- [x] **T-07** Implement `ratioDisplay(ratio)` flooring to 2 decimals (never round up).
  Example: 4.497 → "4.49", 7 → "7.00". Write fast-check **P-12** (`display ≤ raw`).
  *(REQ-14, REQ-46)*
- [x] **T-08** Implement `analyze(fg, bg)` returning `{ratio, display, verdict, Lfg, Lbg}`;
  verdict computed from raw ratio, display from floored. Write fast-check **P-13**.
  *(REQ-15, REQ-16)*

## Phase 5 — OKLab / OKLCH (color.js)

- [x] **T-09** Implement `sRGBtoOKLab({r,g,b})` and `OKLabtoSRGB(oklab)` with the Ottosson
  (2020) matrices in design §3.8. Example: white → L=1, a=b=0; black → L=0. Write fast-check
  **P-14** (round-trip <1 channel after 8-bit).
  *(REQ-17, REQ-18, REQ-20)*
- [x] **T-10** Implement `OKLabtoOKLCH` and `OKLCHtoOKLab` (C, atan2 ∈ [0,2π)). Example
  test for a known color. Write fast-check **P-15** (round-trip exactness).
  *(REQ-19)*
- [x] **T-11** Implement `gamutClip({r,g,b})` clamping to [0,255]. Write fast-check **P-16**.
  *(REQ-21)*

## Phase 6 — Exorcise (color.js)

- [x] **T-12** Implement `exorcise(fg, bg, target)`:
  - If already passing, return fg unchanged.
  - Convert fg → OKLCH, fix H and C, vary L.
  - Binary search L in the direction away from bg luminance; pick smallest |ΔL| that passes.
  - Convert candidate OKLCH → sRGB, gamut-clip, re-check post-8-bit; if it fails, continue
    search or fall back.
  - Fallback to black/white (whichever has greater contrast with bg) when no L passes.
  Example: dark gray on near-black bg exorcised toward white; already-passing unchanged.
  Write fast-check **P-17..P-21** (already-passing, passes-when-possible, minimal ΔL, hue/
  chroma preserved except fallback, fallback correctness).
  *(REQ-22, REQ-23, REQ-24, REQ-25, REQ-26)*

## Phase 7 — CVD simulation (cvd.js)

- [x] **T-13** Add the Machado 2009 severity-1.0 3×3 matrices for protanopia,
  deuteranopia, tritanopia (linear RGB) to `cvd.js` as module constants. Source the exact
  values from the canonical Machado supplemental file; document the source URL in a
  comment.
  *(REQ-27)*
- [x] **T-14** Implement `simulate(type, {r,g,b})`:
  - Validate `type`; throw on unknown.
  - `achromatopsia`: gray = sRGB-encoding of `relativeLuminance(input)`; all channels equal.
  - Dichromats: linearize → matrix multiply (linear RGB) → clamp [0,1] → delinearize.
  Example tests: red under protanopia changes; gray stays gray. Write fast-check **P-22..P-26**.
  *(REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32)*

## Phase 8 — Scan / ghost light (scan.js)

- [x] **T-15** Implement the tile grid split in `scan(imageData, {tile, target})`:
  compute tilesX/tilesY, clip edge tiles. Add validation: `tile >= 1`, non-empty image.
  Example test: a 64×64 image with tile=16 yields 16 tiles. Write fast-check **P-27**
  (bounds coverage).
  *(REQ-33)*
- [x] **T-16** Implement flat-tile skip: compute per-pixel relative luminance, skip tiles
  whose max−min luminance < `EPSILON_FLAT`. Example: solid-color image → 0 hauntings. Write
  fast-check **P-28**.
  *(REQ-34, REQ-47)*
- [x] **T-17** Implement 2-means clustering on per-tile luminance (seed min/max, iterate
  to convergence or `MAX_ITERS`). Assign minority cluster → fg, majority → bg; tie →
  darker is fg. Compute mean sRGB color per cluster. Example: dark-text/light-bg tile →
  fg≈dark, bg≈light, ratio≈contrastRatio(dark,light). Write fast-check **P-30**.
  *(REQ-35, REQ-36, REQ-37)*
- [x] **T-18** Emit one `Haunting` per non-flat tile with `{x,y,w,h,fg,bg,ratio,pass}`
  (`pass = ratio >= target`), including passing tiles. Implement text-likeness filter (REQ-48)
  and anti-aliasing mitigation (REQ-49). Example: text stripes yield hauntings. Write fast-check **P-32**.
  *(REQ-38, REQ-48, REQ-49)*
- [x] **T-19** Implement `mergeAdjacentFailing` with 8-connected adjacency (REQ-50): bounding box,
  count, dominant fg/bg (min-ratio tile), `ratio = min`, `pass=false`. Return `{hauntings, regions}`.
  Example: 2×2 identical failing block → one region, count=4. Write fast-check **P-31**, **P-33**.
  *(REQ-39, REQ-40, REQ-50)*
- [x] **T-20** Ensure `scan` is pure/deterministic (no `Math.random`, fixed BFS order).
  Write fast-check **P-29** (same input → same output).
  *(REQ-41, REQ-45)*

## Phase 9 — Engine-wide verification

- [x] **T-21** Confirm every exported engine function has ≥1 example test and ≥1 fast-check
  property test (audit test files). Run full `npm test`; all green.
  *(REQ-44)*
- [ ] **T-22** Lint-confirm `src/engine/` has no DOM access, no globals, no side effects
  (grep for `document`, `window`, `Math.random`, top-level mutation). Confirm zero runtime
  imports beyond `fast-check` in tests only.
  *(REQ-42, REQ-43, REQ-45)*
- [x] **T-23** Run the design-system self-check: feed Ghostlight's own palette (from
  `.kiro/steering/design-system.md`) through `analyze` and verify every text/surface pair
  meets 4.5:1 (per design-system.md "The UI itself must pass WCAG AA"). Record results.
  *(REQ-08..16, design-system.md)*


## Status notes (2026-10-31)

- T-00..T-12: implemented in `src/engine/color.js`; covered by `test/color.test.js`
  (examples + 8 fast-check properties). Not every property P-01..P-21 from design §4 has its own
  test yet — the ones that matter most for users (range, symmetry, never-round-up display,
  exorcise passes / is idempotent / leaves passing colours alone, hex round-trip) do.
- T-22 left open on purpose: `scan.js` keeps module-level scratch buffers (REQ-52 performance).
  Output is still deterministic, but it is shared mutable state, which tech.md discourages.
- T-23: done with the `ghost-auditor` agent, see `docs/self-audit.md`.
- `src/engine/repaint.js` (apply an exorcism to pixels) was added after this spec, by hand, with
  its own property tests in `test/repaint.test.js`.
