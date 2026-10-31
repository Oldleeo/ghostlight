---
inclusion: always
---
# Product: Ghostlight

Ghostlight finds "ghost text" — text whose contrast is too low for people to read — in a design
screenshot or a color palette, makes it visible as a haunting, and "exorcises" it by proposing the
closest color that passes WCAG 2.x.

Audience: product/visual/packaging designers and front-end developers who want a fast, visual
accessibility pass before handoff. Everything runs in the browser; no upload ever leaves the device.

Vocabulary (use consistently in UI copy and code comments):
- ghost / haunting = a fg/bg pair or image zone below the target contrast
- ghost light = the scanner
- possession = a color-vision or low-vision simulation
- exorcise = compute the nearest passing replacement color
- séance = the palette matrix view

The metaphor must always *explain* the function. Never add decoration that hides information.
