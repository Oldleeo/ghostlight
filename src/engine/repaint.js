// repaint.js — apply an exorcism to pixels, keeping anti-aliasing.
// Pure: returns nothing, mutates only the RGBA buffer it is given.
import { relativeLuminance } from './color.js';

/**
 * Inside box {x,y,w,h}, every pixel is placed on the luminance line between bg and fg
 * (t = 0 at bg, 1 at fg) and re-mixed between bg and `fix` with the same t.
 * Pixels that are not between bg and fg (other content) are left alone.
 */
export function repaint(imageData, box, fg, bg, fix, reach = 14) {
  const { data, width, height } = imageData;
  const Lf = relativeLuminance(fg), Lb = relativeLuminance(bg);
  const span = Lf - Lb;
  if (Math.abs(span) < 1e-6) return 0;
  const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
  const x1 = Math.min(width, box.x + box.w), y1 = Math.min(height, box.y + box.h);
  let changed = 0;
  const near = (i) => Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b) < 30;
  const W = x1 - x0, lastL = new Int32Array(W), nextR = new Int32Array(W);
  for (let y = y0; y < y1; y++) {
    // A glyph stroke always has background on both sides within `reach` px on its row;
    // a large flat area that merely shares the text colour (a white label next to a button) does not.
    let last = -1e9;
    for (let x = x0; x < x1; x++) { if (near((y * width + x) * 4)) last = x; lastL[x - x0] = last; }
    let next = 1e9;
    for (let x = x1 - 1; x >= x0; x--) { if (near((y * width + x) * 4)) next = x; nextR[x - x0] = next; }
    for (let x = x0; x < x1; x++) {
      if (x - lastL[x - x0] > reach || nextR[x - x0] - x > reach) continue;
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // only pixels whose colour is close to the bg→fg segment belong to this ghost
      const dr = fg.r - bg.r, dg = fg.g - bg.g, db = fg.b - bg.b;
      const len2 = dr * dr + dg * dg + db * db || 1;
      let t = ((r - bg.r) * dr + (g - bg.g) * dg + (b - bg.b) * db) / len2;
      if (t <= 0.18) continue; // gradients and JPEG noise around the background stay untouched
      t = Math.min(1, t);
      const pr = bg.r + dr * t, pg = bg.g + dg * t, pb = bg.b + db * t;
      const off = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
      if (off > 36) continue;
      data[i] = Math.round(bg.r + (fix.r - bg.r) * t);
      data[i + 1] = Math.round(bg.g + (fix.g - bg.g) * t);
      data[i + 2] = Math.round(bg.b + (fix.b - bg.b) * t);
      changed++;
    }
  }
  return changed;
}
