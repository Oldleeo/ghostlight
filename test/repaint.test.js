import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { repaint } from '../src/engine/repaint.js';

const img = (w, h, c) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) { d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b; d[i + 3] = 255; } return { data: d, width: w, height: h }; };
const rgb = fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }) });

test('pure background is never touched', () => {
  fc.assert(fc.property(rgb, rgb, rgb, (bg, fg, fix) => {
    const im = img(8, 8, bg); const before = im.data.slice();
    repaint(im, { x: 0, y: 0, w: 8, h: 8 }, fg, bg, fix);
    assert.deepEqual(im.data, before);
  }));
});

const stripes = (w, h, fg, bg) => { const im = img(w, h, bg); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x % 6 < 2) { const i = (y * w + x) * 4; im.data[i] = fg.r; im.data[i + 1] = fg.g; im.data[i + 2] = fg.b; } return im; };

test('glyph-like foreground pixels become exactly the fix colour', () => {
  fc.assert(fc.property(rgb, rgb, rgb, (bg, fg, fix) => {
    fc.pre(Math.abs(fg.r - bg.r) + Math.abs(fg.g - bg.g) + Math.abs(fg.b - bg.b) > 40);
    const im = stripes(12, 4, fg, bg);
    repaint(im, { x: 0, y: 0, w: 12, h: 4 }, fg, bg, fix);
    const k = 6 * 4; // a stroke with background on both sides
    assert.deepEqual([im.data[k], im.data[k + 1], im.data[k + 2]], [fix.r, fix.g, fix.b]);
  }));
});

test('a large flat area sharing the text colour is left alone (no smearing)', () => {
  const bg = { r: 160, g: 210, b: 200 }, fg = { r: 255, g: 255, b: 255 }, fix = { r: 0, g: 0, b: 0 };
  const im = img(80, 10, fg);              // a white label...
  for (let y = 0; y < 10; y++) for (let x = 0; x < 3; x++) { const i = (y * 80 + x) * 4; im.data[i] = bg.r; im.data[i + 1] = bg.g; im.data[i + 2] = bg.b; }
  repaint(im, { x: 0, y: 0, w: 80, h: 10 }, fg, bg, fix);
  const i = (5 * 80 + 60) * 4;             // ...far from any background stays white
  assert.deepEqual([im.data[i], im.data[i + 1], im.data[i + 2]], [255, 255, 255]);
});

test('pixels outside the box are untouched', () => {
  const fg = { r: 200, g: 200, b: 200 }, bg = { r: 255, g: 255, b: 255 };
  const im = stripes(12, 12, fg, bg);
  repaint(im, { x: 0, y: 0, w: 10, h: 6 }, fg, bg, { r: 90, g: 90, b: 90 });
  assert.equal(im.data[6 * 4], 90);
  const j = (11 * 12 + 6) * 4; assert.equal(im.data[j], 200);
});
