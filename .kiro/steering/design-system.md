---
inclusion: fileMatch
fileMatchPattern: ["**/*.css", "**/*.html", "src/ui/**"]
---
# Design system — "theatre after midnight"

A ghost light is the single bulb left burning on an empty stage. The UI is that stage.

- Ink background #0d0c0b, stage floor #171512, hairlines rgba(244,233,200,.12)
- Ghost-light warm #f4e9c8 (primary text), candle #ffb547 (accent / actions), ectoplasm #9fe8d0 (pass), blood #ff6a5e (fail)
- Type: display "Fraunces" italic for headings, "JetBrains Mono" for numbers and ratios, Inter for UI text
- Grain: subtle 2–4% noise overlay; halftone dots are allowed as texture, never over data
- Motion: ghosts drift slowly (6–10 s loops); respect `prefers-reduced-motion` by freezing all drift
- The UI itself must pass WCAG AA — we are an accessibility tool. Run Ghostlight's own engine on our palette.
- Every haunting shows its numbers (ratio, required ratio, verdict) in text, never only by color.
