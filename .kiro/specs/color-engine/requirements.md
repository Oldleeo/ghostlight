# Color Engine — Requirements

Spec ID: `color-engine`
Scope: the pure, DOM-free color engine under `src/engine/` (`color.js`, `cvd.js`, `scan.js`).
All requirements apply to engine code only. The UI layer (`src/ui/`) consumes the
exported functions but is out of scope for this spec.

Glossary terms follow `.kiro/steering/product.md` (ghost / haunting, ghost light,
possession, exorcise, séance) and `.kiro/steering/tech.md`.

## 1. User stories

**US-1 — Parse a color**
As a designer, I want to paste a hex or `rgb()` string so the engine understands any
color I copied from a design tool, without me normalizing it first.

**US-2 — Read the verdict**
As a designer, I want to see the contrast ratio and a clear AA/AAA pass/fail for
normal and large text so I know whether a fg/bg pair is readable.

**US-3 — Trust the number**
As a front-end developer, I want the displayed ratio to be rounded *down* to two
decimals so a failing 4.497 is never shown as a passing 4.50.

**US-4 — Exorcise a ghost**
As a designer, I want the closest replacement foreground color that passes, with
the smallest possible change, so my design stays visually intact.

**US-5 — See through another's eyes (possession)**
As a designer, I want to simulate protanopia, deuteranopia, tritanopia, and
achromatopsia so I can judge whether text stays distinguishable for color-vision-
deficient viewers.

**US-6 — Scan a screenshot (ghost light)**
As a designer, I want to drop in a screenshot and have the engine find every zone
whose contrast is too low, so I do not have to check pairs by hand.

**US-7 — Get regions, not noise**
As a designer, I want adjacent failing zones merged into regions so a paragraph of
ghost text reads as one haunting, not a hundred tiles.

**US-8 — Keep it on-device**
As a privacy-conscious user, I want all scanning and math to run locally with no
runtime dependencies, so my screenshot never leaves the browser.

## 2. Functional requirements (EARS)

Requirement IDs are stable and referenced by `tasks.md`.
EARS keywords used: *The system shall…* (ubiquitous), *When…* (event-driven),
*While…* (state-driven), *Where…* (optional), *If…, then…* (unwanted).

### 2.1 Color parsing & WCAG contrast (module `color.js`)

**REQ-01** The system shall provide `parseColor(str)` that accepts the string forms
`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(r,g,b)`, `rgb(r g b)`, and `rgba(r,g,b,a)`
(case-insensitive, with optional surrounding whitespace).

**REQ-02** When `parseColor` receives an input that matches none of the accepted forms,
then the system shall throw a descriptive `Error` and shall not return a silent default.

**REQ-03** The system shall return a parsed color as `{ r, g, b, a }` where `r,g,b` are
integers in `[0,255]` and `a` is a float in `[0,1]` (default `1` when absent).

**REQ-04** The system shall provide format helpers `toHex({r,g,b}) → "#rrggbb"` and
`toRgbString({r,g,b,a}) → "rgba(r, g, b, a)"` producing lowercase canonical output.

**REQ-05** The system shall convert a gamma-encoded sRGB channel `c ∈ [0,1]` to linear
light as: `c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4` (WCAG 2.2 threshold).

**REQ-06** The system shall convert a linear channel `c ∈ [0,1]` back to sRGB as:
`c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1/2.4) - 0.055`.

**REQ-07** The system shall preserve color under `sRGB → linear → sRGB` round-trip
within an absolute tolerance of `1e-6` per channel (on the `[0,1]` scale).

**REQ-08** The system shall compute WCAG 2.2 relative luminance
`relativeLuminance({r,g,b})` from 8-bit sRGB by normalizing each channel to `[0,1]`,
linearizing per REQ-05, and combining as `0.2126·R + 0.7152·G + 0.0722·B`.

**REQ-09** The system shall guarantee `relativeLuminance` ∈ `[0,1]` for all inputs, with
`relativeLuminance(black) = 0` and `relativeLuminance(white) = 1` exactly.

**REQ-10** The system shall compute `contrastRatio(fg, bg)` as
`(Lmax + 0.05) / (Lmin + 0.05)` where `Lmax = max(Lfg, Lbg)` and `Lmin = min(Lfg, Lbg)`
and `Lfg, Lbg` are the relative luminances of `fg` and `bg`.

**REQ-11** The system shall guarantee `contrastRatio` ∈ `[1, 21]`, that it is symmetric
(`ratio(a,b) = ratio(b,a)`), that `ratio(white, black) = 21` exactly, and that
`ratio(x, x) = 1` exactly.

**REQ-12** The system shall provide `verdict(ratio, { level, large })` returning a
boolean pass for the given target, where thresholds are:
- AA, normal: `ratio >= 4.5`
- AA, large:   `ratio >= 3.0`
- AAA, normal: `ratio >= 7.0`
- AAA, large:  `ratio >= 4.5`

**REQ-13** The `large` flag is supplied by the caller (the UI) based on WCAG 2.2 large-
text criteria (≥ 18pt, or ≥ 14pt bold). The engine shall not inspect font sizes itself.

**REQ-14** The system shall provide `ratioDisplay(ratio)` that returns the ratio floored
to two decimals as a string with two fractional digits (e.g. `4.497 → "4.49"`, `7 → "7.00"`).
The system shall never round up a value that would change the pass/fail boundary.

**REQ-15** The system shall compute the verdict (REQ-12) from the raw ratio, not from the
floored display value, so that flooring cannot turn a fail into an apparent pass.

**REQ-16** The system shall provide `analyze(fg, bg)` returning
`{ ratio, display, verdict, Lfg, Lbg }` where `ratio` is the raw value, `display` is the
floored string, and `verdict` is the full set `{ aa, aaa, aaLarge, aaaLarge }` booleans.

### 2.2 OKLab / OKLCH & exorcise (module `color.js`)

**REQ-17** The system shall convert sRGB to OKLab by linearizing per REQ-05, applying the
Ottosson (2020) linear-RGB → LMS matrix, taking the cube root of each LMS component, and
applying the LMS → OKLab matrix.

**REQ-18** The system shall convert OKLab back to sRGB by applying the OKLab → LMS matrix,
cubing each component, applying the LMS → linear-RGB matrix, and encoding per REQ-06.

**REQ-19** The system shall convert OKLab ↔ OKLCH with `C = √(a² + b²)` and
`H = atan2(b, a)` in radians ∈ `[0, 2π)`, and the inverse `a = C·cos(H)`, `b = C·sin(H)`.
`L` is unchanged.

**REQ-20** The system shall preserve color under `sRGB → OKLab → sRGB` round-trip within
an absolute tolerance of `1e-4` per channel on the `[0,1]` scale.

**REQ-21** The system shall provide `gamutClip({r,g,b})` that clamps each channel to `[0,1]`
and shall apply it to any OKLab/OKLCH-derived color before returning 8-bit output.

**REQ-22** The system shall provide `exorcise(fg, bg, target)` that returns the nearest
passing replacement foreground color, found by varying **only** the OKLCH lightness `L`
while holding hue `H` and chroma `C` fixed, then gamut-clipping (REQ-21) and converting to
8-bit sRGB.

**REQ-23** Where more than one lightness passes, the system shall choose the candidate
with the smallest `|ΔL|` from the original foreground lightness, so the change is minimal.

**REQ-24** If the foreground already passes `target` against `bg`, the system shall return
the foreground unchanged (zero lightness change).

**REQ-25** If no lightness in `[0,1]` achieves `target`, the system shall fall back to
black or white — whichever yields the greater contrast ratio against `bg` — so a passing
or nearest-passing color is always returned.

**REQ-26** The system shall guarantee that the raw contrast ratio of the returned
`exorcise` color against `bg` is `>= target` whenever a passing lightness exists in `[0,1]`,
even after 8-bit rounding of the result.

### 2.3 Color-vision simulation / possession (module `cvd.js`)

**REQ-27** The system shall provide `simulate(cvdType, color)` that applies the Machado,
Oliveira & Fernandes (2009) **severity 1.0** simulation matrix in **linear RGB** for the
types `protanopia`, `deuteranopia`, and `tritanopia`.

**REQ-28** For `achromatopsia`, the system shall collapse the color to a gray whose WCAG
relative luminance equals the input's relative luminance, i.e. all channels set to the
sRGB encoding of `relativeLuminance(input)`.

**REQ-29** `cvdType` shall be one of `protanopia`, `deuteranopia`, `tritanopia`,
`achromatopsia`. An unknown type shall throw an `Error`.

**REQ-30** While the input color is achromatic (R = G = B), the system shall keep the
output achromatic (R = G = B) for every CVD type — gray stays gray under every possession.

**REQ-31** For `achromatopsia`, the system shall preserve relative luminance exactly
(`relativeLuminance(simulate('achromatopsia', c)) = relativeLuminance(c)`).

**REQ-32** `simulate` shall accept and return 8-bit sRGB colors `{r,g,b}` (integers
`[0,255]`), converting to linear for the matrix multiply and back to sRGB for the result.

### 2.4 Image scan / ghost light (module `scan.js`)

**REQ-33** The system shall provide `scan(imageData, options)` where `imageData` is
`{ data: Uint8ClampedArray, width, height }` (RGBA, 8-bit) and `options` is
`{ tile, target }`. `tile` is the tile size in pixels and `target` is the contrast target
ratio (e.g. `4.5`). The system shall split the image into a grid of `tile × tile` cells,
clipping the last row/column to the image bounds.

**REQ-34** The system shall skip any tile whose pixels are flat (no text-like edges). A
tile is flat when its per-pixel relative-luminance range (max − min) is below a small
epsilon; flat tiles produce no haunting.

**REQ-35** For each non-flat tile, the system shall estimate foreground and background as
two luminance clusters via 2-means (1D k-means on per-pixel relative luminance), seeded
with the tile's minimum and maximum luminance and iterated to convergence or a fixed cap.

**REQ-36** The system shall label the **minority** cluster (fewer pixels) as the
foreground and the **majority** cluster as the background; on an exact tie the darker
cluster is the foreground.

**REQ-37** The system shall compute the contrast ratio between the representative colors
of the two clusters (the mean sRGB color of each cluster's pixels), and record a haunting
`{ x, y, w, h, fg, bg, ratio, pass }` where `x,y,w,h` are the tile bounds in pixels,
`fg,bg` are 8-bit sRGB colors, `ratio` is the raw contrast ratio, and `pass` is
`ratio >= target`.

**REQ-38** The system shall return one haunting per non-flat tile (both passing and
failing), so the caller can render the full grid and highlight the ghosts (`pass: false`).

**REQ-39** The system shall merge adjacent failing tiles (4-connected) into regions. A
region shall be `{ x, y, w, h, count, fg, bg, ratio, pass: false }` where `x,y,w,h` is the
bounding box of all member tiles, `count` is the number of tiles, `fg,bg` are the dominant
cluster colors of the region, and `ratio` is the **minimum** ratio across member tiles.

**REQ-40** The system shall return `{ hauntings, regions }` where `hauntings` is the array
from REQ-38 and `regions` is the array from REQ-39.

**REQ-41** `scan` shall be a pure function: the same `imageData` and `options` shall always
produce the same output, with no reads of globals, the DOM, or `Math.random`.

### 2.5 Non-functional requirements

**REQ-42** The system shall keep `src/engine/` free of DOM access, globals, and side
effects, so it is fully unit-testable in Node without a browser.

**REQ-43** The system shall have zero runtime dependencies. `fast-check` is allowed only
as a dev dependency for property-based tests.

**REQ-44** The system shall be tested with `node --test`. Every exported engine function
shall have at least one `fast-check` property test expressing an invariant, plus example
(unit) tests.

**REQ-45** The system shall be deterministic across runs for the same inputs.

**REQ-46** Every ratio number shown to a user shall be floored to two decimals per REQ-14;
the engine shall never surface a rounded-up ratio.

## 3. Revision 2 — Real screenshots

**REQ-47** Flat-tile skip (REQ-34) shall use a luminance range threshold of `0.02`
instead of `1/255` to account for JPEG noise and gradients; a tile with `max(lums) - min(lums) < 0.02`
is skipped and produces no haunting. This prevents blocks and gradients from being
misidentified as text.

**REQ-48** Text-likeness filter: after 2-means clustering, the system shall further skip a
tile unless **both** conditions hold:
- Minority (fg) cluster is between 2% and 45% of the tile pixels (text has sparse strokes,
  solid blocks have high fg coverage).
- Stroke density: `(horizontal fg/bg transitions) / (fg pixel count) >= 0.2`, i.e. fg pixels
  have frequent edges with the bg, characteristic of glyph strokes, not solid fill.

**REQ-49** Anti-aliasing mitigation: the fg color shall be the mean sRGB of only those
fg-cluster pixels whose luminance is in the **35% farthest from the bg cluster mean
luminance** (i.e. the darkest 35% of an fg cluster on light bg, or the lightest 35% on
dark bg); the bg color remains the mean of all bg-cluster pixels. This eliminates light
anti-aliasing halos around dark text, improving focus on the core stroke.

**REQ-50** Regions merge failing tiles using **8-connected** adjacency (including diagonals),
not 4-connected, so a line of text on a curve merges into one haunting despite row/column
stagger.

## 4. Revision 3 — Rounded corners & edges

**REQ-51** Text-likeness filter (replaces stroke-density rule of REQ-48): after 2-means clustering,
classify each tile pixel as fg or bg. Count `rows2` = rows whose fg/bg sequence has ≥ 2 transitions,
and `cols2` = columns with ≥ 2 transitions. A tile is text-like only if **both**:
- Minority (fg) cluster is between 2% and 45% of tile pixels (unchanged from REQ-48).
- `rows2 >= max(2, 0.15 * h)` **AND** `cols2 >= max(2, 0.15 * w)` (glyphs have strokes crossing
  both horizontally and vertically; straight edges or box corners give at most 1 transition per row/column).

**REQ-52** Performance (scan.js): a 1400×900 image with `tile: 23` must scan in under 250 ms in Node.
Optimize by using `Float32Array` for per-tile luminance and `Uint8Array` for fg cluster mask,
integer tile keys (not strings) for the merge, and minimize object allocation.
