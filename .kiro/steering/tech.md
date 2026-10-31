---
inclusion: always
---
# Tech conventions

- Plain ES modules, no framework, no build step. `index.html` + `src/**/*.js` must run from any static host.
- `src/engine/` is pure: no DOM, no globals, deterministic, fully unit-testable in Node.
- `src/ui/` owns the DOM and canvas; it only calls the engine through its exported functions.
- Tests: `node --test` with `fast-check` for property-based tests. Every engine function gets
  at least one property test describing an invariant, not just examples.
- Color math follows WCAG 2.2 relative luminance (sRGB, 0.04045 threshold) and Björn Ottosson's OKLab/OKLCH.
- Numbers shown to users: contrast ratios rounded *down* to 2 decimals (never round a failing 4.497 up to 4.50).
- No dependencies at runtime. Dev dependency allowed: fast-check.
