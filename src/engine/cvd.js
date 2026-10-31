// cvd.js — color-vision simulation (possession)
//
// Pure ES module. No DOM, no globals, no side effects. All functions are deterministic.
// Implements requirements REQ-27..32 of the color-engine spec.
//
// Simulates color vision deficiency using Machado, Oliveira & Fernandes (2009)
// severity 1.0 matrices applied in LINEAR RGB.
// Source: http://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html

import { linearize, delinearize, relativeLuminance } from './color.js';

// ---------------------------------------------------------------------------
// Machado 2009 severity 1.0 matrices (linear RGB)
// ---------------------------------------------------------------------------

// Protanopia: red-blind (L-cone deficiency)
const MACHADO_PROTANOPIA = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];

// Deuteranopia: green-blind (M-cone deficiency)
const MACHADO_DEUTERANOPIA = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.011820, 0.042940, 0.968881],
];

// Tritanopia: blue-yellow blind (S-cone deficiency)
const MACHADO_TRITANOPIA = [
  [1.255528, -0.076749, -0.178779],
  [-0.078411, 0.930809, 0.147602],
  [0.004733, 0.691367, 0.303900],
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp each channel to [0,1]. */
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Clamp to [0,255] and round to nearest integer. */
function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Apply a 3x3 matrix to a linear RGB vector, then clamp and delinearize. */
function applyMatrix(matrix, linRGB) {
  const result = {
    r:
      matrix[0][0] * linRGB.r +
      matrix[0][1] * linRGB.g +
      matrix[0][2] * linRGB.b,
    g:
      matrix[1][0] * linRGB.r +
      matrix[1][1] * linRGB.g +
      matrix[1][2] * linRGB.b,
    b:
      matrix[2][0] * linRGB.r +
      matrix[2][1] * linRGB.g +
      matrix[2][2] * linRGB.b,
  };

  // Clamp each channel to [0,1] before delinearizing
  result.r = clamp01(result.r);
  result.g = clamp01(result.g);
  result.b = clamp01(result.b);

  return delinearize(result);
}

// ---------------------------------------------------------------------------
// Exported function — CVD simulation (REQ-27..32)
// ---------------------------------------------------------------------------

/**
 * simulate(type, {r,g,b}): {r,g,b} — apply color-vision deficiency simulation.
 *
 * type ∈ {'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'}
 *
 * For dichromats (protanopia, deuteranopia, tritanopia): applies Machado 2009
 * severity 1.0 matrix in linear RGB space. (REQ-27)
 *
 * For achromatopsia (total color blindness): returns a gray with the same WCAG
 * relative luminance as the input. All channels are set to the sRGB encoding of
 * relativeLuminance(input). (REQ-28)
 *
 * Input: {r,g,b} with r,g,b ∈ [0,255] integers.
 * Output: {r,g,b} with r,g,b ∈ [0,255] integers.
 *
 * Throws Error if type is unknown. (REQ-29)
 * Grays (r===g===b) remain grays for all types. (REQ-30)
 * Achromatopsia preserves relative luminance exactly. (REQ-31)
 */
export function simulate(type, { r, g, b }) {
  if (type === 'achromatopsia') {
    // Collapse to gray with the same luminance (REQ-28, REQ-31)
    const L = relativeLuminance({ r, g, b });
    // Encode L back to 8-bit sRGB to get the gray level
    const gray = delinearize({ r: L, g: L, b: L });
    return { r: gray.r, g: gray.g, b: gray.b };
  }

  let matrix;
  if (type === 'protanopia') {
    matrix = MACHADO_PROTANOPIA;
  } else if (type === 'deuteranopia') {
    matrix = MACHADO_DEUTERANOPIA;
  } else if (type === 'tritanopia') {
    matrix = MACHADO_TRITANOPIA;
  } else {
    throw new Error(`Unknown CVD type: ${type}`);
  }

  // For dichromats: linearize, apply matrix, clamp, delinearize (REQ-27)
  const linRGB = linearize({ r, g, b });
  return applyMatrix(matrix, linRGB);
}
