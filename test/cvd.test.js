// cvd.test.js — tests for color-vision simulation
// Run with: node --test

import { test } from 'node:test';
import * as assert from 'node:assert';
import fc from 'fast-check';
import { simulate } from '../src/engine/cvd.js';
import { relativeLuminance } from '../src/engine/color.js';

// Custom arbitrary: RGB color {r,g,b} ∈ [0,255]
const arbRGB = () =>
  fc
    .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
    .map(([r, g, b]) => ({ r, g, b }));

// Custom arbitrary: Gray {r,g,b} where r===g===b
const arbGray = () =>
  fc
    .integer({ min: 0, max: 255 })
    .map(v => ({ r: v, g: v, b: v }));

// Custom arbitrary: CVD type
const arbCVDType = () => fc.constantFrom('protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia');

// ---------------------------------------------------------------------------
// Example tests
// ---------------------------------------------------------------------------

test('Example: black stays black for all CVD types', () => {
  const black = { r: 0, g: 0, b: 0 };
  const types = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
  types.forEach(type => {
    const result = simulate(type, black);
    assert.strictEqual(result.r, 0, `${type} black r`);
    assert.strictEqual(result.g, 0, `${type} black g`);
    assert.strictEqual(result.b, 0, `${type} black b`);
  });
});

test('Example: white stays ~white (within 1 per channel) for all CVD types', () => {
  const white = { r: 255, g: 255, b: 255 };
  const types = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
  types.forEach(type => {
    const result = simulate(type, white);
    assert.ok(result.r >= 254 && result.r <= 255, `${type} white r in range`);
    assert.ok(result.g >= 254 && result.g <= 255, `${type} white g in range`);
    assert.ok(result.b >= 254 && result.b <= 255, `${type} white b in range`);
  });
});

test('Example: unknown CVD type throws Error', () => {
  assert.throws(() => simulate('foo', { r: 255, g: 0, b: 0 }), /Unknown CVD type/);
});

test('Example: achromatopsia collapses red to gray', () => {
  const red = { r: 255, g: 0, b: 0 };
  const result = simulate('achromatopsia', red);
  assert.strictEqual(result.r, result.g, 'achromatopsia red r===g');
  assert.strictEqual(result.g, result.b, 'achromatopsia red g===b');
});

// ---------------------------------------------------------------------------
// Fast-check property tests
// ---------------------------------------------------------------------------

test('Property: output channels are always integers in [0,255] (P-24)', () => {
  fc.assert(
    fc.property(arbCVDType(), arbRGB(), (type, color) => {
      const result = simulate(type, color);
      assert.ok(Number.isInteger(result.r) && result.r >= 0 && result.r <= 255);
      assert.ok(Number.isInteger(result.g) && result.g >= 0 && result.g <= 255);
      assert.ok(Number.isInteger(result.b) && result.b >= 0 && result.b <= 255);
    })
  );
});

test('Property: achromatopsia output has r===g===b (part of P-22)', () => {
  fc.assert(
    fc.property(arbRGB(), color => {
      const result = simulate('achromatopsia', color);
      assert.strictEqual(result.r, result.g);
      assert.strictEqual(result.g, result.b);
    })
  );
});

test('Property: achromatopsia preserves luminance within 0.01 (P-23)', () => {
  fc.assert(
    fc.property(arbRGB(), color => {
      const inputLum = relativeLuminance(color);
      const result = simulate('achromatopsia', color);
      const outputLum = relativeLuminance(result);
      assert.ok(Math.abs(outputLum - inputLum) < 0.01, `Luminance diff ${Math.abs(outputLum - inputLum)}`);
    })
  );
});

test('Property: simulate is deterministic (P-26)', () => {
  fc.assert(
    fc.property(arbCVDType(), arbRGB(), (type, color) => {
      const result1 = simulate(type, color);
      const result2 = simulate(type, color);
      assert.strictEqual(result1.r, result2.r);
      assert.strictEqual(result1.g, result2.g);
      assert.strictEqual(result1.b, result2.b);
    })
  );
});

test('Property: grays stay grays for dichromats within 3 per channel (P-22)', () => {
  fc.assert(
    fc.property(arbGray(), gray => {
      const types = ['protanopia', 'deuteranopia', 'tritanopia'];
      types.forEach(type => {
        const result = simulate(type, gray);
        // Check that output is "nearly gray": r,g,b within 3 of each other
        const maxDiff = Math.max(Math.abs(result.r - result.g), Math.abs(result.g - result.b), Math.abs(result.r - result.b));
        assert.ok(maxDiff <= 3, `Gray ${gray.r} under ${type}: max diff ${maxDiff}`);
      });
    })
  );
});
