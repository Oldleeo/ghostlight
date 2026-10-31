// color.js — parse, sRGB↔linear, WCAG luminance, contrast, verdict, OKLab/OKLCH, exorcise
//
// Pure ES module. No DOM, no globals, no side effects. All functions are deterministic.
// Implements requirements REQ-01..REQ-26 of the color-engine spec.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SRGB_THRESHOLD = 0.04045; // sRGB decode threshold (REQ-05)
const LIN_THRESHOLD = 0.0031308; // sRGB encode threshold (REQ-06)

const WCAG_R = 0.2126; // WCAG 2.2 luminance weights (REQ-08)
const WCAG_G = 0.7152;
const WCAG_B = 0.0722;

const WCAG_OFFSET = 0.05; // contrast ratio offset (REQ-10)

// ---------------------------------------------------------------------------
// Internal helpers — sRGB gamma encode/decode on [0,1]
// ---------------------------------------------------------------------------

/** Decode a gamma-encoded sRGB channel c∈[0,1] to linear light (REQ-05). */
function decodeChannel(c) {
  return c <= SRGB_THRESHOLD ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Encode a linear channel c∈[0,1] back to sRGB (REQ-06). */
function encodeChannel(c) {
  return c <= LIN_THRESHOLD ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Clamp to [0,1]. */
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Clamp to [0,255] and round to nearest integer. */
function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

// ---------------------------------------------------------------------------
// Internal helpers — OKLab (Ottosson 2020)
// ---------------------------------------------------------------------------

/** Linear RGB ∈[0,1] → OKLab. */
function linearRGBToOKLab({ r, g, b }) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

/** OKLab → linear RGB ∈[0,1] (may go slightly out of range — caller must clamp). */
function oklabToLinearRGB({ L, a, b }) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

// ---------------------------------------------------------------------------
// Exported functions — Parsing & formats  (REQ-01..04)
// ---------------------------------------------------------------------------

/**
 * parseColor(str): RGBA — parse a color string into {r,g,b,a}.
 *
 * Accepts (case-insensitive, surrounding whitespace tolerated):
 *   #rgb, #rgba, #rrggbb, #rrggbbaa
 *   rgb(r,g,b), rgb(r g b), rgba(r,g,b,a)
 *
 * Returns {r,g,b,a} with r,g,b ∈ [0,255] integers, a ∈ [0,1] float (default 1).
 * Throws Error on unrecognized format or out-of-range values. (REQ-01,02,03)
 */
export function parseColor(str) {
  const s = String(str).toLowerCase().trim();

  // --- Hex forms ---
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) throw new Error(`Invalid hex color: "${str}"`);

    if (hex.length === 3) {
      // #rgb → expand each digit
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 1 };
    }
    if (hex.length === 4) {
      // #rgba → expand each digit
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = parseInt(hex[3] + hex[3], 16) / 255;
      if (a < 0 || a > 1) throw new Error(`Invalid alpha: "${str}"`);
      return { r, g, b, a };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b, a: 1 };
    }
    if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      if (a < 0 || a > 1) throw new Error(`Invalid alpha: "${str}"`);
      return { r, g, b, a };
    }
    throw new Error(`Invalid hex color: "${str}"`);
  }

  // --- rgb()/rgba() forms ---
  const fnMatch = s.match(/^rgba?\(\s*([^)]+)\s*\)$/);
  if (fnMatch) {
    const parts = fnMatch[1].split(/[, ]+/).filter((p) => p.length > 0);
    if (parts.length !== 3 && parts.length !== 4)
      throw new Error(`Invalid rgb/rgba: "${str}"`);

    const r = parseInt(parts[0], 10);
    const g = parseInt(parts[1], 10);
    const b = parseInt(parts[2], 10);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b))
      throw new Error(`Invalid rgb values: "${str}"`);
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255)
      throw new Error(`rgb values out of range [0,255]: "${str}"`);

    let a = 1;
    if (parts.length === 4) {
      a = parseFloat(parts[3]);
      if (Number.isNaN(a) || a < 0 || a > 1)
        throw new Error(`Invalid alpha: "${str}"`);
    }
    return { r, g, b, a };
  }

  throw new Error(`Unrecognized color format: "${str}"`);
}

/**
 * toHex({r,g,b}): string — lowercase "#rrggbb" with two-digit hex per channel. (REQ-04)
 */
export function toHex({ r, g, b }) {
  const h = (c) => {
    const v = clamp255(c).toString(16).padStart(2, '0');
    return v.length > 2 ? v.slice(-2) : v;
  };
  return '#' + h(r) + h(g) + h(b);
}

/**
 * toRgbString({r,g,b,a}): string — canonical "rgba(r, g, b, a)" with a rounded to 3 decimals. (REQ-04)
 */
export function toRgbString({ r, g, b, a = 1 }) {
  const aRounded = Math.round(a * 1000) / 1000;
  return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${aRounded})`;
}

// ---------------------------------------------------------------------------
// Exported functions — sRGB ↔ linear  (REQ-05..07)
// ---------------------------------------------------------------------------

/**
 * linearize({r,g,b}): LinRGB — convert 8-bit sRGB to linear [0,1] per channel. (REQ-05)
 */
export function linearize({ r, g, b }) {
  return {
    r: decodeChannel(r / 255),
    g: decodeChannel(g / 255),
    b: decodeChannel(b / 255),
  };
}

/**
 * delinearize(LinRGB): {r,g,b} — convert linear [0,1] to 8-bit sRGB (round + clamp). (REQ-06)
 */
export function delinearize({ r, g, b }) {
  return {
    r: clamp255(encodeChannel(r) * 255),
    g: clamp255(encodeChannel(g) * 255),
    b: clamp255(encodeChannel(b) * 255),
  };
}

// ---------------------------------------------------------------------------
// Exported functions — Luminance & contrast  (REQ-08..11)
// ---------------------------------------------------------------------------

/**
 * relativeLuminance({r,g,b}): number — WCAG 2.2 relative luminance ∈ [0,1]. (REQ-08,09)
 *
 * L = 0.2126·R + 0.7152·G + 0.0722·B (each channel linearized from 8-bit).
 * black → 0, white → 1 (exact).
 */
export function relativeLuminance({ r, g, b }) {
  const lin = linearize({ r, g, b });
  return WCAG_R * lin.r + WCAG_G * lin.g + WCAG_B * lin.b;
}

/**
 * contrastRatio(fg, bg): number — WCAG contrast ratio ∈ [1,21]. (REQ-10,11)
 *
 * (Lmax + 0.05) / (Lmin + 0.05). Symmetric. white/black = 21, x/x = 1.
 */
export function contrastRatio(fg, bg) {
  const Lfg = relativeLuminance(fg);
  const Lbg = relativeLuminance(bg);
  const Lmax = Lfg > Lbg ? Lfg : Lbg;
  const Lmin = Lfg < Lbg ? Lfg : Lbg;
  return (Lmax + WCAG_OFFSET) / (Lmin + WCAG_OFFSET);
}

// ---------------------------------------------------------------------------
// Exported functions — Verdict & display  (REQ-12..16)
// ---------------------------------------------------------------------------

/**
 * verdict(ratio, {level, large}): boolean — WCAG pass/fail for one threshold. (REQ-12,13)
 *
 * level ∈ {'AA','AAA'}, large ∈ {true,false}.
 * Thresholds: AA normal 4.5, AA large 3.0, AAA normal 7.0, AAA large 4.5.
 */
export function verdict(ratio, { level, large }) {
  const threshold =
    level === 'AAA' ? (large ? 4.5 : 7.0) : large ? 3.0 : 4.5;
  return ratio >= threshold;
}

/**
 * ratioDisplay(ratio): string — ratio floored to 2 decimals, never rounded up. (REQ-14,46)
 *
 * "4.497" → "4.49", "7" → "7.00", "1" → "1.00".
 * Caller computes pass/fail from the raw ratio, never from this string.
 */
export function ratioDisplay(ratio) {
  const floored = Math.floor(ratio * 100) / 100;
  return floored.toFixed(2);
}

/**
 * analyze(fg, bg): Analyze — full contrast analysis result. (REQ-15,16)
 *
 * Returns { ratio, display, verdict, Lfg, Lbg } where:
 *   ratio   = raw contrast ratio,
 *   display = floored string (REQ-14),
 *   verdict = { aa, aaa, aaLarge, aaaLarge } computed from raw ratio,
 *   Lfg/Lbg = relative luminances.
 */
export function analyze(fg, bg) {
  const Lfg = relativeLuminance(fg);
  const Lbg = relativeLuminance(bg);
  const ratio = contrastRatio(fg, bg);
  return {
    ratio,
    display: ratioDisplay(ratio),
    verdict: {
      aa: ratio >= 4.5,
      aaa: ratio >= 7.0,
      aaLarge: ratio >= 3.0,
      aaaLarge: ratio >= 4.5,
    },
    Lfg,
    Lbg,
  };
}

// ---------------------------------------------------------------------------
// Exported functions — OKLab / OKLCH  (REQ-17..21)
// ---------------------------------------------------------------------------

/**
 * sRGBtoOKLab({r,g,b}): OKLab — 8-bit sRGB → OKLab (Ottosson 2020). (REQ-17,18)
 */
export function sRGBtoOKLab(rgb) {
  const lin = linearize(rgb);
  return linearRGBToOKLab(lin);
}

/**
 * OKLabtoSRGB(oklab): {r,g,b} — OKLab → 8-bit sRGB with gamut clipping. (REQ-18,20,21)
 *
 * Converts to linear RGB, clamps each channel to [0,1] (gamut clip), then
 * delinearizes to 8-bit.
 */
export function OKLabtoSRGB(oklab) {
  const lin = oklabToLinearRGB(oklab);
  const clamped = {
    r: clamp01(lin.r),
    g: clamp01(lin.g),
    b: clamp01(lin.b),
  };
  return delinearize(clamped);
}

/**
 * OKLabtoOKLCH(oklab): OKLCH — convert OKLab to OKLCH. (REQ-19)
 *
 * C = √(a²+b²), H = atan2(b,a) ∈ [0,2π), L unchanged.
 */
export function OKLabtoOKLCH({ L, a, b }) {
  const C = Math.sqrt(a * a + b * b);
  let H = Math.atan2(b, a);
  if (H < 0) H += 2 * Math.PI;
  return { L, C, H };
}

/**
 * OKLCHtoOKLab(oklch): OKLab — convert OKLCH to OKLab. (REQ-19)
 *
 * a = C·cos(H), b = C·sin(H), L unchanged.
 */
export function OKLCHtoOKLab({ L, C, H }) {
  return { L, a: C * Math.cos(H), b: C * Math.sin(H) };
}

/**
 * gamutClip({r,g,b}): RGB — clamp each 8-bit channel to [0,255]. (REQ-21)
 *
 * Guarantees no out-of-range values reach the caller. Used after any
 * OKLab/OKLCH-derived conversion to ensure valid sRGB output.
 */
export function gamutClip({ r, g, b }) {
  return { r: clamp255(r), g: clamp255(g), b: clamp255(b) };
}

// ---------------------------------------------------------------------------
// Exported functions — Exorcise  (REQ-22..26)
// ---------------------------------------------------------------------------

/**
 * exorcise(fg, bg, target): RGB — nearest passing foreground by varying OKLCH L only. (REQ-22..26)
 *
 * Strategy:
 *  1. If fg already passes target, return fg unchanged (zero change, REQ-24).
 *  2. Convert fg to OKLCH {L0, C, H}. Fix C and H, vary L.
 *  3. Binary-search L in the direction away from bg's luminance for the
 *     continuous boundary where contrast crosses target.
 *  4. Convert the boundary candidate to 8-bit sRGB (with gamut clipping),
 *     re-check post-quantization. If it fails, step slightly further outward.
 *  5. If no L in [0,1] passes (including after 8-bit quantization), fall back
 *     to black or white — whichever has the greater contrast with bg (REQ-25).
 *
 * Guarantees:
 *  - Returns fg unchanged when already passing (REQ-24).
 *  - Returned color has contrastRatio >= target against bg whenever a
 *    passing lightness exists (REQ-26), even after 8-bit rounding.
 *  - Minimal |ΔL| from L0 among passing candidates (REQ-23).
 *  - Hue H and chroma C are preserved (only L moves), except fallback (REQ-22).
 */
export function exorcise(fg, bg, target) {
  // REQ-24: already passing → return unchanged
  if (contrastRatio(fg, bg) >= target) {
    return { r: fg.r, g: fg.g, b: fg.b };
  }

  // Convert fg to OKLCH, fix C and H
  const oklab = sRGBtoOKLab(fg);
  const oklch = OKLabtoOKLCH(oklab);
  const L0 = oklch.L;
  const C = oklch.C;
  const H = oklch.H;

  // Determine search direction
  const Lfg = relativeLuminance(fg);
  const Lbg = relativeLuminance(bg);
  const goDarker = Lfg < Lbg; // if fg darker than bg, make fg even darker

  // Helper: continuous (pre-8-bit) contrast at a candidate OKLCH lightness L.
  // Uses gamut-clipped linear RGB luminance (no 8-bit quantization step).
  function continuousContrast(L) {
    const candLab = OKLCHtoOKLab({ L, C, H });
    const lin = oklabToLinearRGB(candLab);
    const Lcand =
      WCAG_R * clamp01(lin.r) + WCAG_G * clamp01(lin.g) + WCAG_B * clamp01(lin.b);
    const hi = Lcand > Lbg ? Lcand : Lbg;
    const lo = Lcand < Lbg ? Lcand : Lbg;
    return (hi + WCAG_OFFSET) / (lo + WCAG_OFFSET);
  }

  // Helper: 8-bit candidate at a given L, with gamut clip and re-check.
  function tryL8bit(L) {
    const candLab = OKLCHtoOKLab({ L, C, H });
    const rgb = OKLabtoSRGB(candLab); // includes clamp + delinearize
    const clipped = gamutClip(rgb);
    return { rgb: clipped, ratio: contrastRatio(clipped, bg) };
  }

  // Check whether the far end of the range passes (continuous).
  const farL = goDarker ? 0 : 1;
  if (continuousContrast(farL) < target) {
    // No L in [0,1] achieves target even before 8-bit quantization.
    // Fallback: black or white, whichever has greater contrast (REQ-25).
    const BLACK = { r: 0, g: 0, b: 0 };
    const WHITE = { r: 255, g: 255, b: 255 };
    return contrastRatio(BLACK, bg) >= contrastRatio(WHITE, bg) ? BLACK : WHITE;
  }

  // Binary search for the continuous boundary.
  // goDarker: lo=0 (passes), hi=L0 (fails) → find largest L that passes (closest to L0)
  // !goDarker: lo=L0 (fails), hi=1 (passes) → find smallest L that passes (closest to L0)
  let lo = goDarker ? 0 : L0;
  let hi = goDarker ? L0 : 1;

  for (let iter = 0; iter < 60; iter++) {
    if (hi - lo < 1e-9) break;
    const mid = (lo + hi) / 2;
    const passes = continuousContrast(mid) >= target;
    if (goDarker) {
      if (passes) lo = mid;
      else hi = mid;
    } else {
      if (passes) hi = mid;
      else lo = mid;
    }
  }

  // boundaryL is the continuous boundary (closest-to-L0 side that passes)
  const boundaryL = goDarker ? lo : hi;

  // Try the 8-bit result at the boundary. If it passes, done.
  let result = tryL8bit(boundaryL);
  if (result.ratio >= target) return result.rgb;

  // Step slightly outward from the continuous boundary to find the first
  // 8-bit candidate that still passes after quantization. The quantization
  // error is tiny (< 1/255 per channel), so a small outward scan suffices.
  for (let i = 1; i <= 1000; i++) {
    const dL = i * 1e-5;
    const L = goDarker ? boundaryL - dL : boundaryL + dL;
    if (L < 0 || L > 1) break;
    result = tryL8bit(L);
    if (result.ratio >= target) return result.rgb;
  }

  // Fallback (should not normally reach here if farL passed continuously,
  // but guard against edge cases where quantization prevents any L from passing)
  const BLACK = { r: 0, g: 0, b: 0 };
  const WHITE = { r: 255, g: 255, b: 255 };
  return contrastRatio(BLACK, bg) >= contrastRatio(WHITE, bg) ? BLACK : WHITE;
}
