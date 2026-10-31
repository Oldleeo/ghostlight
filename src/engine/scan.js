// scan.js — image tiling, 2-means clustering, text-likeness filter, region merge
// Pure ES module, deterministic, no DOM. REQ-33..41, REQ-47..52.

import { relativeLuminance, contrastRatio } from './color.js';

const EPSILON_FLAT = 0.02, MAX_ITERS = 20, FG_MIN_RATIO = 0.02, FG_MAX_RATIO = 0.45,
  FG_CORE_FRACTION = 0.35;

// Reusable buffers for performance
const lumBuf = new Float32Array(529);  // max 23×23 tile
const maskBuf = new Uint8Array(529);
const distBuf = [];

export function scan(imageData, { tile, target }) {
  if (!Number.isInteger(tile) || tile < 1)
    throw new Error('tile must be a positive integer');
  if (!imageData.data || imageData.width < 1 || imageData.height < 1)
    throw new Error('imageData must be non-empty');

  const W = imageData.width, H = imageData.height, data = imageData.data;
  const tilesX = Math.ceil(W / tile), tilesY = Math.ceil(H / tile);
  const hauntings = [];

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = tx * tile, y0 = ty * tile, w = Math.min(tile, W - x0), h = Math.min(tile, H - y0);
      const tilePixels = w * h;

      // Collect per-pixel luminance
      const lums = lumBuf.subarray(0, tilePixels);
      const pixels = [];

      let lumIdx = 0, minL = 1e9, maxL = -1e9;
      for (let py = y0; py < y0 + h; py++) {
        for (let px = x0; px < x0 + w; px++) {
          const i = (py * W + px) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          pixels.push({ r, g, b });
          const l = relativeLuminance({ r, g, b });
          lums[lumIdx++] = l;
          if (l < minL) minL = l;
          if (l > maxL) maxL = l;
        }
      }

      // Flat check
      if (maxL - minL < EPSILON_FLAT) continue;

      // 2-means clustering (single pass)
      let c0 = minL, c1 = maxL;
      const mask = maskBuf.subarray(0, tilePixels);

      for (let iter = 0; iter < MAX_ITERS; iter++) {
        let sum0 = 0, count0 = 0, sum1 = 0, count1 = 0;
        for (let i = 0; i < tilePixels; i++) {
          const l = lums[i];
          if (Math.abs(l - c0) <= Math.abs(l - c1)) {
            mask[i] = 0;
            sum0 += l;
            count0++;
          } else {
            mask[i] = 1;
            sum1 += l;
            count1++;
          }
        }
        const nC0 = count0 > 0 ? sum0 / count0 : c0;
        const nC1 = count1 > 0 ? sum1 / count1 : c1;
        if (Math.abs(nC0 - c0) < 1e-6 && Math.abs(nC1 - c1) < 1e-6) break;
        c0 = nC0;
        c1 = nC1;
      }

      // Count clusters
      let cluster0Count = 0, cluster1Count = 0, cluster0SumL = 0, cluster1SumL = 0;
      for (let i = 0; i < tilePixels; i++) {
        if (mask[i] === 0) {
          cluster0Count++;
          cluster0SumL += lums[i];
        } else {
          cluster1Count++;
          cluster1SumL += lums[i];
        }
      }

      // Determine fg (minority) and bg (majority)
      let fgMask, bgMask;
      if (cluster0Count < cluster1Count) {
        fgMask = 0;
        bgMask = 1;
      } else if (cluster0Count > cluster1Count) {
        fgMask = 1;
        bgMask = 0;
      } else {
        const l0 = cluster0SumL / cluster0Count;
        const l1 = cluster1SumL / cluster1Count;
        fgMask = l0 <= l1 ? 0 : 1;
        bgMask = 1 - fgMask;
      }

      const fgCount = fgMask === 0 ? cluster0Count : cluster1Count;
      const fgR = fgCount / tilePixels;
      if (fgR < FG_MIN_RATIO || fgR > FG_MAX_RATIO) continue;

      // REQ-51: Multi-axis transition filter
      let rows2 = 0;
      for (let py = 0; py < h; py++) {
        let trans = 0;
        for (let px = 0; px < w - 1; px++) {
          if (mask[py * w + px] !== mask[py * w + px + 1]) trans++;
        }
        if (trans >= 2) rows2++;
      }

      let cols2 = 0;
      for (let px = 0; px < w; px++) {
        let trans = 0;
        for (let py = 0; py < h - 1; py++) {
          if (mask[py * w + px] !== mask[(py + 1) * w + px]) trans++;
        }
        if (trans >= 2) cols2++;
      }

      const minRows = Math.max(2, Math.ceil(0.15 * h));
      const minCols = Math.max(2, Math.ceil(0.15 * w));
      if (rows2 < minRows || cols2 < minCols) continue;

      // Compute colors
      let fgSR = 0, fgSG = 0, fgSB = 0;
      let bgSR = 0, bgSG = 0, bgSB = 0;
      let bgSumL = 0;

      for (let i = 0; i < tilePixels; i++) {
        const p = pixels[i];
        if (mask[i] === fgMask) {
          fgSR += p.r;
          fgSG += p.g;
          fgSB += p.b;
        } else {
          bgSR += p.r;
          bgSG += p.g;
          bgSB += p.b;
          bgSumL += lums[i];
        }
      }

      const bgCount = tilePixels - fgCount;
      const bgL = bgSumL / bgCount;
      
      // Anti-aliasing: take 35% of fg pixels by distance (REQ-49)
      const coreCount = Math.ceil(fgCount * FG_CORE_FRACTION);
      
      // Use reusable distBuf for sorting
      distBuf.length = 0;
      for (let i = 0; i < tilePixels; i++) {
        if (mask[i] === fgMask) {
          distBuf.push(i);
        }
      }
      
      // Sort indices by distance
      distBuf.sort((a, b) => Math.abs(lums[b] - bgL) - Math.abs(lums[a] - bgL));
      
      let coreSR = 0, coreSG = 0, coreSB = 0;
      for (let j = 0; j < coreCount && j < distBuf.length; j++) {
        const p = pixels[distBuf[j]];
        coreSR += p.r;
        coreSG += p.g;
        coreSB += p.b;
      }

      const fgCol = {
        r: Math.round(coreSR / coreCount),
        g: Math.round(coreSG / coreCount),
        b: Math.round(coreSB / coreCount),
      };

      const bgCol = {
        r: Math.round(bgSR / bgCount),
        g: Math.round(bgSG / bgCount),
        b: Math.round(bgSB / bgCount),
      };

      const ratio = contrastRatio(fgCol, bgCol);
      hauntings.push({ x: x0, y: y0, w, h, fg: fgCol, bg: bgCol, ratio, pass: ratio >= target });
    }
  }

  // Merge failing tiles
  const failTiles = hauntings.filter((h) => !h.pass);
  if (failTiles.length === 0) return { hauntings, regions: [] };

  const tileMap = new Map();
  failTiles.forEach((h) => {
    const tx = Math.floor(h.x / tile), ty = Math.floor(h.y / tile);
    const key = (ty << 16) | tx;
    tileMap.set(key, h);
  });

  const visited = new Set(), regions = [];
  for (const [key, _] of tileMap) {
    if (visited.has(key)) continue;

    const comp = [], q = [key];
    visited.add(key);

    while (q.length) {
      const cur = q.shift();
      const tx = cur & 0xFFFF, ty = (cur >> 16) & 0xFFFF;
      comp.push(tileMap.get(cur));

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nkey = ((ty + dy) << 16) | (tx + dx);
          if (tileMap.has(nkey) && !visited.has(nkey)) {
            visited.add(nkey);
            q.push(nkey);
          }
        }
      }
    }

    let minX = comp[0].x, minY = comp[0].y, maxX = comp[0].x + comp[0].w, maxY = comp[0].y + comp[0].h;
    let minR = comp[0].ratio;
    let dom = comp[0];

    for (let i = 1; i < comp.length; i++) {
      const h = comp[i];
      if (h.x < minX) minX = h.x;
      if (h.y < minY) minY = h.y;
      if (h.x + h.w > maxX) maxX = h.x + h.w;
      if (h.y + h.h > maxY) maxY = h.y + h.h;
      if (h.ratio < minR) {
        minR = h.ratio;
        dom = h;
      }
    }

    regions.push({
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
      count: comp.length,
      fg: dom.fg,
      bg: dom.bg,
      ratio: minR,
      pass: false,
    });
  }

  return { hauntings, regions };
}
