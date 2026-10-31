# Color Engine — Design

Spec ID: `color-engine`
Implements requirements in `requirements.md`. References use `REQ-NN`.

## 1. Module layout

```
src/engine/
  color.js   — parse, sRGB↔linear, WCAG luminance, contrast, verdict, OKLab/OKLCH, exorcise
  cvd.js     — color-vision simulation (possession)
  scan.js    — image tiling, clustering, hauntings, region merge (ghost light)
```

Each module exports only the functions listed in this design. There is no default
export and no shared mutable state. `cvd.js` and `scan.js` import from `color.js`; there
are no cycles. No module imports from `src/ui/`.

## 2. Data types

All types are plain JS objects (no classes) and never touch the DOM.

```ts
// 8-bit sRGB color (engine canonical form)
type RGB  = { r: number /* 0..255 int */, g: number, b: number }
type RGBA = { r: number, g: number, b: number, a: number /* 0..1 float */ }

// Linear-light sRGB (per channel, [0,1])
type LinRGB = { r: number, g: number, b: number }   // each ∈ [0,1]

// CIE 1931-ish LMS intermediate (Ottosson)
type LMS = { L: number, M: number, S: number }      // each ∈ approx [-0.1, 1.1]

// OKLab (perceptual)
type OKLab = { L: number, a: number, b: number }    // L ∈ [0,1], a,b small
type OKLCH = { L: number, C: number, H: number }    // H ∈ [0, 2π)

// Contrast verdict for one color pair
type Verdict = { aa: boolean, aaa: boolean, aaLarge: boolean, aaaLarge: boolean }

// Full analysis result
type Analyze = {
  ratio:   number,            // raw contrast ratio, [1,21]
  display: string,            // floored to 2 decimals, e.g. "4.49"
  verdict: Verdict,
  Lfg:     number,            // relative luminance of fg
  Lbg:     number             // relative luminance of bg
}

// CVD simulation result (returns RGB, input RGBA ignored for alpha)
type CVDType = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia'

// Image scan input
type ImageData = {
  data:   Uint8ClampedArray,  // RGBA, length = width*height*4
  width:  number,
  height: number
}
type ScanOptions = { tile: number, target: number }

// Per-tile haunting
type Haunting = {
  x: number, y: number, w: number, h: number,  // tile bounds in px
  fg: RGB, bg: RGB,                             // representative colors
  ratio: number,                                // raw contrast ratio
  pass:  boolean                                // ratio >= target
}

// Merged region of adjacent failing tiles (4-connected)
type Region = {
  x: number, y: number, w: number, h: number,  // bounding box of member tiles
  count: number,                                 // number of member tiles
  fg: RGB, bg: RGB,                              // dominant cluster colors
  ratio: number,                                // min ratio across members
  pass:  false                                   // regions are always failing
}

type ScanResult = { hauntings: Haunting[], regions: Region[] }
```

## 3. Algorithms

### 3.1 Parsing — `parseColor(str): RGBA`  (REQ-01..03)

Normalize to lowercase, trim. Match against, in order:

1. `#rgb` / `#rgba` → expand each hex digit to a pair (`a` → `aa`).
2. `#rrggbb` / `#rrggbbaa` → `parseInt(hex, 16)`.
3. `rgb(r,g,b)` / `rgb(r g b)` / `rgba(r,g,b,a)` → split on commas or spaces, parse ints.

Validate ranges: `r,g,b ∈ [0,255]`, `a ∈ [0,1]`. On any mismatch, throw `Error`
with the offending input. Return `{ r, g, b, a }` (`a` defaults to `1`).

Inverse helpers:
- `toHex({r,g,b}) → "#rrggbb"` — two-digit lowercase hex per channel.
- `toRgbString({r,g,b,a}) → "rgba(r, g, b, a)"` — canonical, `a` rounded to 3 decimals.

### 3.2 sRGB ↔ linear  (REQ-05..07)

```
encode (linear → sRGB, [0,1]):
  c <= 0.0031308 ? c * 12.92 : 1.055 * c^(1/2.4) - 0.055

decode (sRGB → linear, [0,1]):
  c <= 0.04045  ? c / 12.92 : ((c + 0.055) / 1.055)^2.4
```

On 8-bit input, first divide by 255 to get `[0,1]`. On output, multiply by 255 and
round to the nearest integer, clamping to `[0,255]`.

Round-trip helpers used internally:
```
linearize({r,g,b})  -> LinRGB   // 8-bit in, [0,1] out
delinearize(LinRGB) -> {r,g,b}  // [0,1] in, 8-bit out (round + clamp)
```

### 3.3 Relative luminance — `relativeLuminance({r,g,b}): number`  (REQ-08,09)

```
Rl = 0.2126, Gl = 0.7152, Bl = 0.0722
L = Rl * lin(r) + Gl * lin(g) + Bl * lin(b)
```
where `lin(c) = decode(c/255)`. Result ∈ [0,1]; `lin` of 0 is exactly 0, of 255 exactly 1,
so `L(black)=0`, `L(white)=1` exactly.

### 3.4 Contrast ratio — `contrastRatio(fg, bg): number`  (REQ-10,11)

```
Lfg = relativeLuminance(fg)
Lbg = relativeLuminance(bg)
Lmax = max(Lfg, Lbg)
Lmin = min(Lfg, Lbg)
ratio = (Lmax + 0.05) / (Lmin + 0.05)
```
∈ [1, 21]. Symmetric by construction. `white/black → (1.05)/(0.05) = 21` exactly.

### 3.5 Verdict — `verdict(ratio, {level, large}): boolean`  (REQ-12,13)

```
threshold = level === 'AAA' ? (large ? 4.5 : 7.0)
          :                   (large ? 3.0 : 4.5)     // AA
return ratio >= threshold
```
Caller supplies `level ∈ {'AA','AAA'}` and `large ∈ {true,false}`.

### 3.6 Ratio display — `ratioDisplay(ratio): string`  (REQ-14)

Floor to 2 decimals, never round up:
```
floored = Math.floor(ratio * 100) / 100
return floored.toFixed(2)        // "4.49", "7.00", "1.00"
```
The caller computes pass/fail from the **raw** ratio (REQ-15), never from this string.

### 3.7 Analyze — `analyze(fg, bg): Analyze`  (REQ-16)

Compose the above:
```
Lfg = relativeLuminance(fg)
Lbg = relativeLuminance(bg)
ratio = contrastRatio(fg, bg)
return {
  ratio,
  display: ratioDisplay(ratio),
  verdict: {
    aa:       ratio >= 4.5,
    aaa:      ratio >= 7.0,
    aaLarge:  ratio >= 3.0,
    aaaLarge: ratio >= 4.5
  },
  Lfg, Lbg
}
```

### 3.8 sRGB ↔ OKLab  (REQ-17,18)

Ottosson (2020) matrices.

sRGB (8-bit) → linear ([0,1]) → OKLab:
```
// linear RGB -> LMS
l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b

// non-linear LMS (cube root)
l_ = cbrt(l); m_ = cbrt(m); s_ = cbrt(s)

// -> OKLab
L = 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_
a = 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_
b = 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
```

OKLab → linear RGB → sRGB (8-bit):
```
// OKLab -> non-linear LMS
l_ = L + 0.3963377774*a + 0.2158037573*b
m_ = L - 0.1055613458*a - 0.0638541728*b
s_ = L - 0.0894841775*a - 1.2914855480*b

// -> linear LMS (cube)
l = l_^3; m = m_^3; s = s_^3

// -> linear RGB
r =  4.0767416621*l - 3.3077115913*m + 0.2309699292*s
g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
b = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
```
Then encode per §3.2 (`delinearize`) to get 8-bit output.

### 3.9 OKLab ↔ OKLCH  (REQ-19)

```
OKLab -> OKLCH:
  C = sqrt(a*a + b*b)
  H = atan2(b, a) ; if H < 0, H += 2*PI     // H ∈ [0, 2π)
  L = L

OKLCH -> OKLab:
  a = C * cos(H)
  b = C * sin(H)
  L = L
```

### 3.10 Gamut clipping — `gamutClip({r,g,b}): RGB`  (REQ-21)

After any OKLab/OKLCH-derived linear-to-sRGB conversion, clamp each channel to `[0,1]`
**before** quantizing to 8 bits. Implementation works on the `[0,1]` linear or the `[0,255]`
sRGB form consistently; the key invariant is no out-of-range values reach the caller.

For the exorcise search we operate in OKLCH space and convert `OKLCH → OKLab → linearRGB →
clamp each linear channel to [0,1] → delinearize → 8-bit`. The clamp is applied to the linear
channels so we never produce a physically invalid sRGB value.

### 3.11 Exorcise — `exorcise(fg, bg, target): RGB`  (REQ-22..26)

Goal: find the nearest passing foreground by moving **only** OKLCH lightness `L`, keeping
hue `H` and chroma `C` fixed.

```
1. If contrastRatio(fg, bg) >= target: return fg  (REQ-24, zero change)

2. Convert fg to OKLCH: { L0, C, H }.
   Convert bg to sRGB (keep as RGB for contrast math).

3. Search candidate lightnesses. Because contrast is monotonic in |Lfg − Lbg| once we
   fix the bg, and OKLCH L correlates with perceptual lightness, we find the boundary:

   For L in [0, 1]:
     candidateOKLCH = { L, C, H }
     candidateRGB   = gamutClip(toSRGB(candidateOKLCH))
     if contrastRatio(candidateRGB, bg) >= target: L is a "passing" lightness

   We want the passing L closest to L0 (smallest |ΔL|).

   Method: binary-search the lightness toward the bg's luminance direction:
     - If the fg is darker than the bg (Lfg < Lbg), the only way to increase contrast is
       to make the fg darker → search L ∈ [0, L0] decreasing; the first L that passes
       (scanning from L0 downward) has the smallest |ΔL|.
     - If the fg is lighter than the bg (Lfg > Lbg), search L ∈ [L0, 1] increasing.
     - Use a dense scan or binary search on L with tolerance 1e-3, then pick the boundary
       L. Concretely: binary-search in the correct half, evaluate contrast at each step,
       stop when within [target, target + epsilon] from the passing side, then step back
       outward to the first L that still passes (the closest to L0).

   Because contrast vs L is continuous and monotonic in the relevant half, a bisection
   on "does L pass?" converges. Resolution: 1/1024 in L is sufficient (≈1e-3).

4. If a passing L is found in [0,1]:
     result = gamutClip(toSRGB({ L: Lpass, C, H }))
     return to8bit(result)

5. Fallback (REQ-25): if no L in [0,1] passes (e.g. extremely close bg):
     blackC = contrastRatio(BLACK, bg)
     whiteC = contrastRatio(WHITE, bg)
     return blackC >= whiteC ? BLACK : WHITE
```

Note: because `gamutClip` may lower contrast (clamping changes the real color), the final
returned 8-bit color is re-checked: if it no longer passes due to clipping/quantization,
the fallback in step 5 is used. This guarantees REQ-26 whenever a *passing* lightness exists.

### 3.12 CVD simulation — `simulate(type, {r,g,b}): RGB`  (REQ-27..32)

```
if type not in {protanopia, deuteranopia, tritanopia, achromatopsia}: throw Error

if type === 'achromatopsia':
  L = relativeLuminance({r,g,b})
  // gray with the same luminance: all channels = sRGB-encoding of L
  g = delinearizeChannel(L)          // linear L -> 8-bit sRGB gray
  return { r: g, g: g, b: g }         // REQ-28, REQ-31

// dichromat (Machado 2009, severity 1.0) — applied in LINEAR RGB:
lin = linearize({r,g,b})              // [0,1] per channel
M = MACHADO_1_0[type]                 // 3x3 matrix
out_lin = M * lin                      // matrix multiply (each channel may go slightly out of [0,1])
clamped = clamp each channel to [0,1]
return delinearize(clamped)           // 8-bit
```

Machado 2009 severity-1.0 matrices (linear RGB):

```
protanopia:
  [ 0.0,       1.0918591,  -0.0918591 ]
  [ 0.0,       0.0,         0.0       ]   // (second row actually given below)

deuteranopia:
  [ ... ]

tritanopia:
  [ ... ]
```

> **Exact numeric matrices are specified in the implementation task** (the task references
> REQ-27). The matrices must be the Machado 2009 severity-1.0 values from the canonical
> source (Machado, Oliveira & Fernandes, "A physiologically-based model for simulation of
> color vision deficiency", IEEE TVCG 2009, supplemental matrices at
> `http://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html`).
> They are 3×3 and applied to linear RGB, not sRGB.

The design mandates applying the matrix in **linear** RGB (decompress the gamma first,
apply matrix, recompress), because that is what Machado specifies.

### 3.13 Scan — `scan(imageData, {tile, target}): ScanResult`  (REQ-33..41)

```
W = imageData.width, H = imageData.height
data = imageData.data   // RGBA Uint8ClampedArray

// 1. Tile grid (REQ-33)
tilesX = ceil(W / tile)
tilesY = ceil(H / tile)

// 2. Per-tile processing
hauntings = []
for ty in [0, tilesY):
  for tx in [0, tilesX):
    x0 = tx*tile, y0 = ty*tile
    w = min(tile, W - x0), h = min(tile, H - y0)

    // collect per-pixel relative luminance for this tile (REQ-34, 35)
    lums = []
    colors = []      // mean we'll compute per cluster later
    for py in [y0, y0+h):
      for px in [x0, x0+w):
        i = (py*W + px)*4
        r = data[i], g = data[i+1], b = data[i+2]    // ignore alpha for contrast
        lums.push(relativeLuminance({r,g,b}))

    // flat check (REQ-34): range below epsilon → skip
    if (max(lums) - min(lums)) < EPSILON_FLAT: continue

    // 2-means on 1D luminance (REQ-35), seeded with min & max
    c0 = min(lums), c1 = max(lums)
    for iter in [0, MAX_ITERS):
      cluster0 = [], cluster1 = []
      for L in lums:
        if abs(L - c0) <= abs(L - c1): cluster0.push(L) else cluster1.push(L)
      newC0 = mean(cluster0) or c0 if empty
      newC1 = mean(cluster1) or c1 if empty
      if converged (|newC0-c0|<1e-6 and |newC1-c1|<1e-6): break
      c0, c1 = newC0, newC1

    // assign pixels to nearest cluster; compute mean sRGB color per cluster (REQ-37)
    cluster0_px = [], cluster1_px = []    // {r,g,b} per pixel
    for each pixel in tile:
      L = relativeLuminance(pixelColor)
      if abs(L - c0) <= abs(L - c1): cluster0_px.push(pixelColor)
      else: cluster1_px.push(pixelColor)

    fg_cluster = (|cluster0_px| <= |cluster1_px|) ? cluster0_px : cluster1_px   // minority = fg (REQ-36)
    bg_cluster = the other
    // tie -> darker cluster is fg (REQ-36)
    if |cluster0_px| == |cluster1_px|:
      meanLum0 = mean(lum of cluster0_px), meanLum1 = mean(lum of cluster1_px)
      if meanLum0 < meanLum1: fg_cluster = cluster0_px else fg_cluster = cluster1_px

    fg = meanColor(fg_cluster)   // average r,g,b then round to 8-bit
    bg = meanColor(bg_cluster)
    ratio = contrastRatio(fg, bg)
    pass = ratio >= target
    hauntings.push({ x:x0, y:y0, w, h, fg, bg, ratio, pass })   // REQ-38

// 3. Merge adjacent failing tiles into regions (REQ-39)
// 4-connected union of tiles where pass === false.
// Use a label array + BFS/DFS over the tile grid. For each connected component:
//   x = min(member.x), y = min(member.y)
//   w = max(member.x + member.w) - x
//   h = max(member.y + member.h) - y
//   count = number of member tiles
//   fg,bg = colors of the member tile with the minimum ratio (dominant ghost)
//   ratio = min(member.ratio)            // worst = lowest contrast
//   pass = false
regions = mergeAdjacentFailing(hauntings, tilesX, tilesY)

return { hauntings, regions }   // REQ-40
```

### 3.13b Scan revision — Real screenshots  (REQ-47..50)

Revision 2 refines the scan to handle real JPEG screenshots and reject false positives
(blocks/gradients misidentified as text).

**REQ-47: Flat-tile threshold**
- Change `EPSILON_FLAT` from `1/255` to `0.02`.
- A tile with luminance range (max − min) < `0.02` is flat and skipped.
- Rationale: `1/255 ≈ 0.0039` catches only single-bit differences; JPEG artifacts and
  gradients easily exceed this. `0.02` filters out natural image noise while preserving
  real contrast edges.

**REQ-48: Text-likeness filter**
After 2-means clustering, skip the tile unless **both**:
- **Minority cluster size**: `2% ≤ (fg pixel count) / (tile pixels) ≤ 45%`.
  - Text strokes are sparse relative to the tile; solid blocks of color violate this.
- **Stroke density**: For each pixel in the tile, count horizontal fg↔bg transitions
  (left/right neighbors differ in cluster membership).
  - `(total horizontal transitions) / (fg pixel count) ≥ 0.2`.
  - Glyphs have frequent stroke edges; solid blocks do not.

```
// pseudo-code for REQ-48
fgCount = fg_cluster.length
bgCount = bg_cluster.length
tilePixels = w * h

// check size
if fgCount / tilePixels < 0.02 or fgCount / tilePixels > 0.45: skip tile

// count horizontal transitions in fg cluster
transitions = 0
clusterGrid = assign each pixel to its cluster (0 or 1)
for py in [y0, y0+h):
  for px in [x0, x0+w-1):
    if clusterGrid[py][px] != clusterGrid[py][px+1]:
      if clusterGrid[py][px] is fg: transitions++
      if clusterGrid[py][px+1] is fg: transitions++  // both directions

if transitions / fgCount < 0.2: skip tile
```

**REQ-49: Anti-aliasing mitigation**
Compute `fg` color from the **35% of fg-cluster pixels farthest from the bg cluster mean
luminance**, not all fg pixels. This removes light halos.

```
bgMeanLum = mean(relativeLuminance(p) for p in bg_cluster)

// sort fg pixels by |luminance - bgMeanLum|, descending
fgSorted = fg_cluster.sort(p => -|relativeLuminance(p) - bgMeanLum|)

// take top 35%
fgCore = fgSorted.slice(0, ceil(fgSorted.length * 0.35))

fg = meanColor(fgCore)  // mean of core pixels only
bg = meanColor(bg_cluster)  // all bg pixels as before
```

**REQ-50: 8-connected region merge**
Change `mergeAdjacentFailing` from 4-connected (up/down/left/right) to 8-connected
(including diagonals). A tile is adjacent to its 8 neighbors: `(tx±1, ty)`, `(tx, ty±1)`,
`(tx±1, ty±1)`. This allows text on a curve to merge into one region despite row/column stagger.

Determinism (REQ-41) is preserved: fixed scan order, no randomness.

Constants:
- `EPSILON_FLAT = 1/255` (luminance range below this ⇒ flat tile, REQ-34).
- `MAX_ITERS = 20` for 2-means convergence (REQ-35).

Determinism (REQ-41): no `Math.random`; 2-means seeded deterministically with min/max
luminance; BFS visited set uses a fixed scan order. Identical input → identical output.

### 3.13c Scan revision 3 — Rounded corners & edges (REQ-51, 52)

Revision 3 refines the text-likeness filter to reject boxes and curved corners by counting
row/column transitions (2D), not just horizontal transitions. Also adds performance
optimization for large images.

**REQ-51: Multi-axis transition filter**
Replaces the stroke-density rule of REQ-48. After 2-means clustering, classify each pixel
as fg (1) or bg (0) via cluster membership. Then:

```
rows2 = count of rows [y0, y0+h) where the fg/bg sequence has >= 2 transitions
cols2 = count of cols [x0, x0+w) where the fg/bg sequence has >= 2 transitions

Tile is text-like only if both:
- fgCount / (w*h) in [0.02, 0.45]  (unchanged from REQ-48)
- rows2 >= max(2, 0.15*h)  AND  cols2 >= max(2, 0.15*w)
```

Rationale: glyphs have strokes that cross both horizontally and vertically (rows2 and
cols2 both high). A solid rounded-rectangle edge crosses only horizontally or only
vertically (one of rows2 or cols2 low), or a box corner gives a single transition per
row/column (at most 1). This filter rejects both.

**REQ-52: Performance optimization**
Optimize for scanning large real screenshots (1400×900, tile=23, expected ~60 tiles):

1. Use `Float32Array` instead of plain array for per-tile luminance values (`lums`).
2. Use `Uint8Array` for per-tile cluster membership (fg vs bg mask), not object array or set membership checks.
3. For region merge (BFS on tiles), use integer tile keys `(ty << 16) | tx` instead of
   `"tx,ty"` strings.
4. Minimize per-tile object allocations: reuse buffers where feasible.

Target: 1400×900 image, tile=23 → scans in < 250 ms in Node (REQ-52).

## 4. Correctness properties (fast-check)

Each property is tested with `fast-check` (`fc`) in `test/*.test.js`. These are
invariants, not single examples. `fc.float` values are clamped to valid ranges via custom
arbitraries.

### 4.1 Parsing & format (color.js) — REQ-01..04

**P-01** `parseColor` round-trip: for any valid hex/rgb string produced by `toHex`/
`toRgbString`, `parseColor(toHex(c)).r,g,b === c.r,g,b` (8-bit).
Arbitrary: random `{r,g,b} ∈ [0,255]³`.

**P-02** `parseColor` rejects garbage: for any string not matching the grammar,
`parseColor` throws (use `fc.string()` filtered to non-matching, or assert throws).
Simplified: `fc.constantFrom('zzz', '#gg', 'rgb(300,0,0)')` each throws.

### 4.2 sRGB ↔ linear (color.js) — REQ-05..07

**P-03** Round-trip: for all `c ∈ [0,1]`,
`|encode(decode(c)) − c| < 1e-6`. Also for 8-bit: `|delinearize(linearize(rgb)) − rgb| ≤ 1`
per channel (quantization).

### 4.3 Luminance & contrast (color.js) — REQ-08..11

**P-04** `relativeLuminance(c) ∈ [0,1]` for all 8-bit colors. Arbitrary: random RGB.
**P-05** `relativeLuminance(black) === 0 && relativeLuminance(white) === 1` (exact).
**P-06** `contrastRatio(a,b) ∈ [1,21]` for all 8-bit pairs.
**P-07** `contrastRatio(a,b) === contrastRatio(b,a)` (symmetric).
**P-08** `contrastRatio(white, black) === 21` (exact).
**P-09** `contrastRatio(x,x) === 1` (exact).
**P-10** Monotonicity: for fixed bg, if `Lfg` moves away from `Lbg`, ratio increases.

### 4.4 Verdict & display (color.js) — REQ-12..16

**P-11** `verdict` thresholds: `ratio >= threshold` exactly (boundary correctness).
Arbitrary: ratio in `[0, 21]`; check verdict equals `ratio >= threshold`.
**P-12** `ratioDisplay` never rounds up: for `r ∈ [1,21]`,
`ratioDisplay(r) ≤ r` (string parse ≤ raw). I.e. `parseFloat(ratioDisplay(r)) <= r`.
**P-13** `analyze` consistency: `analyze.verdict.aa === (analyze.ratio >= 4.5)` etc., and
`analyze.display === ratioDisplay(analyze.ratio)`, and verdict uses raw ratio.

### 4.5 OKLab / OKLCH (color.js) — REQ-17..21

**P-14** Round-trip `sRGB → OKLab → sRGB`: for all 8-bit colors, each channel differs by
`< 1` (8-bit) after round-trip (tolerance 1e-4 on [0,1]).
**P-15** Round-trip `OKLab ↔ OKLCH`: for `L∈[0,1], a,b∈[-0.4,0.4]`,
`L_back === L`, `|C_back − C| < 1e-9`, `H_back === H` (mod 2π).
**P-16** `gamutClip` never returns out-of-range: every channel ∈ `[0,255]`.

### 4.6 Exorcise (color.js) — REQ-22..26

**P-17** Already-passing: if `contrastRatio(fg,bg) >= target`, `exorcise(fg,bg,target)`
returns `fg` unchanged.
**P-18** Passing when possible: for any fg/bg where a passing lightness exists,
`contrastRatio(exorcise(fg,bg,target), bg) >= target` (post-8-bit).
**P-19** Minimal change: `|L_exorcised − L_original|` is minimal among passing L values
(checked by exhaustive fine scan in the test over a reduced chroma space).
**P-20** Hue & chroma preserved: `OKLCH(exorcise).H === H_original` and
`|OKLCH(exorcise).C − C_original|` within tolerance (only L moved), **except** fallback
case (black/white) which is allowed to change all channels.
**P-21** Fallback correctness: when no lightness passes, result is black or white and
has the higher contrast with bg.

### 4.7 CVD simulation (cvd.js) — REQ-27..32

**P-22** Gray stays gray: for any gray `{k,k,k}`, `simulate(type, {k,k,k})` is also gray
(`r === g === b`) for all four types.
**P-23** Achromatopsia preserves luminance:
`|relativeLuminance(simulate('achromatopsia', c)) − relativeLuminance(c)| < 1e-6`.
**P-24** Output in range: `simulate(type, c)` channels ∈ `[0,255]` for all types.
**P-25** Unknown type throws: `simulate('foo', c)` throws for any non-listed type.
**P-26** Deterministic: `simulate(type, c) === simulate(type, c)` (pure).

### 4.8 Scan (scan.js) — REQ-33..41

**P-27** Tile grid bounds: every haunting `{x,y,w,h}` lies within `[0,W)×[0,H)` and tiles
cover the image without gaps or overlaps.
**P-28** Flat-tile skip: a synthetic solid-color image produces **zero** hauntings.
**P-29** Determinism: `scan(img, opts) === scan(img, opts)` (same input, same output).
**P-30** Two-cluster correctness: a synthetic tile that is exactly two luminance levels
(dark text on light bg) yields exactly one haunting with `fg` ≈ dark level and
`bg` ≈ light level, and `ratio` ≈ `contrastRatio(dark, light)`.
**P-31** Region merge: a synthetic image with a 2×2 block of identical failing tiles
produces one region with `count === 4` and a bounding box covering all four.
**P-32** Passing tiles included: hauntings include `pass: true` tiles (not filtered out).
**P-33** Min-ratio region: a region's `ratio` equals the minimum ratio among its member
tiles.

## 5. Error handling summary

| Function         | Error condition                      | Behavior       | REQ |
|------------------|--------------------------------------|----------------|-----|
| `parseColor`     | Unrecognized format / out of range   | throw `Error`  | 02  |
| `simulate`       | Unknown `cvdType`                    | throw `Error`  | 29  |
| `scan`           | `tile < 1` or zero-size image        | throw `Error`  | —   |

All other functions assume valid inputs (in-range 8-bit colors); they clamp rather than
throw on edge values, per the "never return out-of-range" properties.

## 6. Constants reference

| Constant        | Value      | Used in            |
|-----------------|------------|--------------------|
| `SRGB_THRESHOLD`| 0.04045    | sRGB decode (REQ-05)|
| `LIN_THRESHOLD` | 0.0031308  | sRGB encode (REQ-06)|
| `EPSILON_FLAT`  | 1/255      | flat-tile skip (REQ-34)|
| `MAX_ITERS`     | 20         | 2-means (REQ-35)   |
| WCAG weights    | 0.2126/0.7152/0.0722 | luminance (REQ-08)|
| WCAG offsets    | 0.05 each  | contrast (REQ-10)  |
| Verdict AA normal/large | 4.5 / 3.0  | (REQ-12)   |
| Verdict AAA normal/large| 7.0 / 4.5  | (REQ-12)   |
