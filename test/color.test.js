import { test } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  parseColor, toHex, contrastRatio, ratioDisplay, exorcise
} from '../src/engine/color.js';

// Example tests (REQ-01..16, 22..26)
test('contrastRatio: white/black = 21', () => {
  assert.strictEqual(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }), 21);
});

test('contrastRatio: same = 1', () => {
  assert.strictEqual(contrastRatio({ r: 128, g: 128, b: 128 }, { r: 128, g: 128, b: 128 }), 1);
});

test('ratioDisplay: 4.497 → "4.49"', () => {
  assert.strictEqual(ratioDisplay(4.497), '4.49');
});

test('#767676 on white passes 4.5:1', () => {
  const ratio = contrastRatio(parseColor('#767676'), { r: 255, g: 255, b: 255 });
  assert(ratio >= 4.5);
});

test('parseColor round-trip: toHex → parseColor', () => {
  const c = { r: 118, g: 118, b: 118 };
  const parsed = parseColor(toHex(c));
  assert.deepStrictEqual(parsed, { r: c.r, g: c.g, b: c.b, a: 1 });
});

test('exorcise already-passing returns unchanged', () => {
  const result = exorcise({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 4.5);
  assert.deepStrictEqual(result, { r: 0, g: 0, b: 0 });
});

test('exorcise result passes target contrast', () => {
  const result = exorcise({ r: 200, g: 200, b: 200 }, { r: 200, g: 200, b: 200 }, 4.5);
  assert(contrastRatio(result, { r: 200, g: 200, b: 200 }) >= 4.5);
});

test('parseColor: #rgb, rgb(), rgba() forms', () => {
  assert.strictEqual(parseColor('#abc').r, 0xaa);
  const c2 = parseColor('rgb(255, 128, 64)');
  assert.strictEqual(c2.r, 255);
  const c3 = parseColor('rgba(1,2,3,0.5)');
  assert.strictEqual(c3.a, 0.5);
});

test('parseColor: throws on invalid', () => {
  assert.throws(() => parseColor('invalid'));
});

// Property tests (fast-check) — per spec P-01 .. P-09
test('P-01: contrastRatio ∈ [1, 21]', () => {
  fc.assert(fc.property(
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    (fg, bg) => {
      const r = contrastRatio(fg, bg);
      assert(r >= 1 && r <= 21);
    }
  ));
});

test('P-02: contrastRatio is symmetric', () => {
  fc.assert(fc.property(
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    (a, b) => assert.strictEqual(contrastRatio(a, b), contrastRatio(b, a))
  ));
});

test('P-03: ratioDisplay ≤ raw ratio (never rounds up)', () => {
  fc.assert(fc.property(fc.double({ min: 1, max: 21, noNaN: true }), (r) => {
    assert(parseFloat(ratioDisplay(r)) <= r);
  }));
});

test('P-04: exorcise passes at 3.0 target', () => {
  fc.assert(fc.property(
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    (fg, bg) => {
      if (fg.r === bg.r && fg.g === bg.g && fg.b === bg.b) return;
      assert(contrastRatio(exorcise(fg, bg, 3.0), bg) >= 3.0);
    }
  ));
});

test('P-05: exorcise passes at 4.5 target', () => {
  fc.assert(fc.property(
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    (fg, bg) => {
      if (fg.r === bg.r && fg.g === bg.g && fg.b === bg.b) return;
      assert(contrastRatio(exorcise(fg, bg, 4.5), bg) >= 4.5);
    }
  ));
});

test('P-06: exorcise already-passing unchanged', () => {
  fc.assert(fc.property(
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    (fg, bg) => {
      if (contrastRatio(fg, bg) >= 4.5) {
        const r = exorcise(fg, bg, 4.5);
        assert.deepStrictEqual(r, fg);
      }
    }
  ));
});

test('P-07: exorcise idempotent', () => {
  fc.assert(fc.property(
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    (fg, bg) => {
      if (fg.r === bg.r && fg.g === bg.g && fg.b === bg.b) return;
      const r1 = exorcise(fg, bg, 4.5);
      const r2 = exorcise(r1, bg, 4.5);
      assert.deepStrictEqual(r1, r2);
    }
  ));
});

test('P-08: parseColor(toHex(c)) round-trip', () => {
  fc.assert(fc.property(
    fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) }),
    (c) => {
      const p = parseColor(toHex(c));
      assert.strictEqual(p.r, c.r);
      assert.strictEqual(p.g, c.g);
      assert.strictEqual(p.b, c.b);
    }
  ));
});
