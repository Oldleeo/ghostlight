// Ghostlight UI — owns DOM + canvas, talks to the pure engine only through its exports.
import { parseColor, toHex, contrastRatio, ratioDisplay, exorcise } from '../engine/color.js';
import { simulate } from '../engine/cvd.js';
import { scan } from '../engine/scan.js';
import { repaint } from '../engine/repaint.js';
import { SAMPLES } from './samples.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const state = { sim: 'none', target: 4.5, source: null, result: null, active: -1, fixed: new Set() };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const SPIRIT = `<svg class="spirit" viewBox="0 0 34 40" aria-hidden="true"><path d="M17 1C8.7 1 3 7.4 3 15.5V37l4.7-3.4 4.6 3.4 4.7-3.4 4.7 3.4 4.6-3.4L31 37V15.5C31 7.4 25.3 1 17 1z" fill="#f4e9c8" fill-opacity=".92"/><ellipse cx="12" cy="15" rx="2.6" ry="3.6" fill="#0d0c0b"/><ellipse cx="22" cy="15" rx="2.6" ry="3.6" fill="#0d0c0b"/><ellipse cx="17" cy="24" rx="3" ry="2.2" fill="#0d0c0b" opacity=".75"/></svg>`;
const MINI = `<svg class="g" viewBox="0 0 34 40" aria-hidden="true"><path d="M17 1C8.7 1 3 7.4 3 15.5V37l4.7-3.4 4.6 3.4 4.7-3.4 4.7 3.4 4.6-3.4L31 37V15.5C31 7.4 25.3 1 17 1z" fill="#f4e9c8"/><ellipse cx="12" cy="15" rx="2.6" ry="3.6" fill="#0d0c0b"/><ellipse cx="22" cy="15" rx="2.6" ry="3.6" fill="#0d0c0b"/></svg>`;

const hex = (c) => toHex(c);
const fmt = (r) => `${ratioDisplay(r)}:1`;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }
async function copy(text, msg) { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('Copy blocked — select the text manually'); } }

/* ---------- tabs ---------- */
$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
  $$('.panel').forEach((p) => { p.hidden = p.id !== tab.getAttribute('aria-controls'); });
}));

/* ---------- possession + target ---------- */
const simCache = new Map();
function simColor(c) {
  if (state.sim === 'none' || state.sim === 'blur') return c;
  const key = state.sim + ((c.r << 16) | (c.g << 8) | c.b);
  let v = simCache.get(key);
  if (!v) { v = simulate(state.sim, c); simCache.set(key, v); }
  return v;
}
$$('.seg button').forEach((b) => b.addEventListener('click', () => {
  $$('.seg button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  state.sim = b.dataset.sim;
  renderView(); if (state.source) runScan(); renderMatrix();
}));
$('#target').addEventListener('change', (e) => { state.target = +e.target.value; if (state.source) runScan(); renderMatrix(); });

/* ---------- haunt scan ---------- */
const view = $('#view'), fx = $('#fx'), stage = $('#stage'), ghosts = $('#ghosts'), drop = $('#drop');

function loadImage(img) {
  const max = 1400;
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  setSource(c);
}
function cloneCanvas(c) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d; }
function setSource(canvas) {
  state.source = canvas; state.work = cloneCanvas(canvas); state.fixed.clear(); state.active = -1;
  drop.classList.add('hidden'); $('#rescan').disabled = false; $('#clear').disabled = false;
  renderView(); runScan(true);
}

/** Draw the source through the current possession into #view. */
function renderView() {
  const src = state.work || state.source; if (!src) return;
  view.width = src.width; view.height = src.height;
  const ctx = view.getContext('2d', { willReadFrequently: true });
  ctx.filter = state.sim === 'blur' ? `blur(${Math.max(1.5, src.width / 520)}px)` : 'none';
  ctx.drawImage(src, 0, 0); ctx.filter = 'none';
  if (state.sim !== 'none' && state.sim !== 'blur') {
    const id = ctx.getImageData(0, 0, view.width, view.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const o = simColor({ r: d[i], g: d[i + 1], b: d[i + 2] });
      d[i] = o.r; d[i + 1] = o.g; d[i + 2] = o.b;
    }
    ctx.putImageData(id, 0, 0);
  }
  fx.width = view.width; fx.height = view.height;
}

function tileSize(w) { return Math.max(16, Math.round(w / 60)); }

function runScan(animate = false) {
  if (state.source && state.fixed.size) { state.work = cloneCanvas(state.source); renderView(); }
  const ctx = view.getContext('2d', { willReadFrequently: true });
  const id = ctx.getImageData(0, 0, view.width, view.height);
  const t0 = performance.now();
  const res = scan(id, { tile: tileSize(view.width), target: state.target });
  const ms = Math.round(performance.now() - t0);
  state.result = res;
  const checked = res.hauntings.length;
  const failed = res.hauntings.filter((h) => !h.pass).length;
  $('#status').textContent = `Swept ${checked} text tiles in ${ms} ms · ${res.regions.length} haunted places below ${state.target}:1${state.sim !== 'none' ? ' · possessed: ' + state.sim : ''}`;
  state.groups = groupRegions(res.regions); state.fixed.clear(); state.active = -1;
  const legible = checked ? Math.round(100 * (checked - failed) / checked) : 100;
  $('#meter').style.width = legible + '%';
  $('#meter-lab').textContent = `Legible text area ${legible}% · target ${state.target}:1`;
  $('#report-scan').disabled = !res.regions.length; $('#exorcise-scan').disabled = !res.regions.length;
  renderGhosts(); renderList(); updateScore();
  if (animate && !reduceMotion) sweep(); else fx.getContext('2d').clearRect(0, 0, fx.width, fx.height);
}

/** The ghost light: a warm beam sweeping the stage once after each new image. */
function sweep() {
  const ctx = fx.getContext('2d'); const W = fx.width, H = fx.height; let x = -W * 0.3; const t0 = performance.now();
  function frame(t) {
    const p = Math.min(1, (t - t0) / 1400); x = -W * 0.3 + p * W * 1.6;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = `rgba(13,12,11,${0.55 * (1 - p)})`; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(x - W * 0.18, 0, x + W * 0.18, 0);
    g.addColorStop(0, 'rgba(255,181,71,0)'); g.addColorStop(.5, `rgba(255,214,140,${0.35 * (1 - p * 0.6)})`); g.addColorStop(1, 'rgba(255,181,71,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
    if (p < 1) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
}

function layoutGhostLayer() {
  const r = view.getBoundingClientRect(), s = stage.getBoundingClientRect();
  Object.assign(ghosts.style, { left: (r.left - s.left) + 'px', top: (r.top - s.top) + 'px', width: r.width + 'px', height: r.height + 'px' });
  Object.assign(fx.style, { left: (r.left - s.left) + 'px', top: (r.top - s.top) + 'px', width: r.width + 'px', height: r.height + 'px' });
  return r.width / view.width;
}
addEventListener('resize', () => { if (state.result) renderGhosts(); });

/** Group hauntings that share (almost) the same text/background pair: one decision fixes them all. */
function groupRegions(regions) {
  const q = (c) => [c.r, c.g, c.b].map((v) => Math.round(v / 10)).join('.');
  const map = new Map();
  regions.forEach((g, i) => {
    const key = q(g.fg) + '|' + q(g.bg);
    let grp = map.get(key);
    if (!grp) { grp = { fg: g.fg, bg: g.bg, ratio: g.ratio, regions: [], tiles: 0, lead: i }; map.set(key, grp); }
    grp.regions.push(i); grp.tiles += g.count;
    if (g.ratio < grp.ratio) { grp.ratio = g.ratio; grp.fg = g.fg; grp.bg = g.bg; }
    if (g.count > regions[grp.lead].count) grp.lead = i;
  });
  return [...map.values()].sort((a, b) => a.ratio - b.ratio);
}

function renderGhosts() {
  const k = layoutGhostLayer();
  ghosts.innerHTML = '';
  const groups = state.groups;
  groups.forEach((grp, gi) => grp.regions.forEach((ri) => {
    const g = state.result.regions[ri];
    const done = state.fixed.has(gi), lead = ri === grp.lead;
    const el = document.createElement('button');
    el.className = 'haunt' + (done ? ' exorcised' : '') + (gi === state.active ? ' active' : '');
    el.style.cssText = `left:${g.x * k - 3}px;top:${g.y * k - 3}px;width:${g.w * k + 6}px;height:${g.h * k + 6}px`;
    el.setAttribute('aria-label', `Haunting: text ${hex(g.fg)} on ${hex(g.bg)}, contrast ${fmt(g.ratio)}, needs ${state.target}:1`);
    el.innerHTML = `${lead && !done ? SPIRIT : ''}${lead || gi === state.active ? `<span class="tag">${done ? 'exorcised' : fmt(g.ratio)}</span>` : ''}`;
    if (!reduceMotion) el.querySelector('.spirit')?.style.setProperty('animation-delay', `${-(gi * 1.3) % 8}s`);
    el.addEventListener('click', () => select(gi));
    ghosts.appendChild(el);
  }));
}

function renderList() {
  const list = $('#list'); list.innerHTML = '';
  const groups = state.groups;
  if (!groups.length) { list.innerHTML = `<li class="empty">No ghosts at ${state.target}:1. This stage is clean — try a stricter target or another possession.</li>`; return; }
  groups.forEach((g, i) => {
    const fix = exorcise(g.fg, g.bg, state.target);
    const done = state.fixed.has(i);
    const li = document.createElement('li');
    li.className = 'item' + (i === state.active ? ' active' : '') + (done ? ' done' : '');
    li.tabIndex = 0;
    const n = g.regions.length;
    li.innerHTML = `
      <div class="chip" style="background:${hex(g.bg)};color:${hex(done ? fix : g.fg)}">Aa</div>
      <div><div class="meta">text ${hex(g.fg)} on ${hex(g.bg)}</div><div class="meta">${n} place${n > 1 ? 's' : ''} · ${g.tiles} tile${g.tiles > 1 ? 's' : ''}</div></div>
      <div class="ratio">${fmt(done ? contrastRatio(fix, g.bg) : g.ratio)}</div>
      <div class="fix">
        <span>Exorcise →</span>
        <span class="chip" style="width:32px;height:32px;font-size:13px;background:${hex(g.bg)};color:${hex(fix)}">Aa</span>
        <b style="color:var(--light)">${hex(fix)}</b><span>${fmt(contrastRatio(fix, g.bg))}</span>
        <span class="spacer"></span>
        <button class="btn" data-ex="${i}">${done ? 'Exorcised' : 'Exorcise'}</button>
      </div>`;
    li.addEventListener('click', (e) => {
      if (e.target.dataset.ex !== undefined) { if (state.fixed.has(i)) return; state.fixed.add(i); applyExorcism(g, fix); toast(`Exorcised ${n} place${n > 1 ? 's' : ''}: ${hex(g.fg)} → ${hex(fix)}`); renderGhosts(); renderList(); updateScore(); return; }
      select(i);
    });
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(i); });
    list.appendChild(li);
  });
}
/** Repaint the haunted pixels on the stage so the fix is visible, not just listed. */
function applyExorcism(g, fix) {
  const ctx = state.work.getContext('2d', { willReadFrequently: true });
  const id = ctx.getImageData(0, 0, state.work.width, state.work.height);
  // regions were measured on the (possibly possessed) view; repaint the true-colour source pixels
  g.regions.forEach((ri) => { const r = state.result.regions[ri]; const pad = tileSize(view.width);
    repaint(id, { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad }, r.fg, r.bg, exorcise(r.fg, r.bg, state.target)); });
  ctx.putImageData(id, 0, 0);
  renderView();
}
function updateScore() {
  const left = state.groups.filter((_, i) => !state.fixed.has(i)).length;
  const checked = state.result.hauntings.length;
  const failing = state.groups.reduce((n, g, i) => n + (state.fixed.has(i) ? 0 : g.tiles), 0);
  const legible = checked ? Math.round(100 * (checked - failing) / checked) : 100;
  $('#meter').style.width = legible + '%';
  $('#meter-lab').textContent = `Legible text area ${legible}% · target ${state.target}:1`;
  $('#score').textContent = left;
  $('.score-lab').textContent = left === 1 ? 'ghost left' : (state.fixed.size ? 'ghosts left' : 'ghosts found');
}
function select(i) {
  state.active = state.active === i ? -1 : i;
  renderGhosts(); renderList();
  $(`#list .item.active`)?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
}

/* ghost-light cursor: dims the stage except a warm pool around the pointer */
stage.addEventListener('pointermove', (e) => {
  if (!state.source || reduceMotion) return;
  const r = view.getBoundingClientRect(); const k = view.width / r.width;
  const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
  const ctx = fx.getContext('2d'); ctx.clearRect(0, 0, fx.width, fx.height);
  const rad = fx.width * 0.16;
  ctx.fillStyle = 'rgba(8,7,6,.55)'; ctx.fillRect(0, 0, fx.width, fx.height);
  ctx.globalCompositeOperation = 'destination-out';
  const g = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const w = ctx.createRadialGradient(x, y, 0, x, y, rad); w.addColorStop(0, 'rgba(255,200,120,.10)'); w.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = w; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
});
stage.addEventListener('pointerleave', () => fx.getContext('2d').clearRect(0, 0, fx.width, fx.height));

/* input: file, drop, paste, samples */
$('#file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) readFile(f); });
function readFile(f) { const img = new Image(); img.onload = () => loadImage(img); img.src = URL.createObjectURL(f); }
stage.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
stage.addEventListener('dragleave', () => drop.classList.remove('over'));
stage.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) readFile(f); });
addEventListener('paste', (e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) readFile(f); });
$$('[data-sample]').forEach((b) => b.addEventListener('click', async () => { await document.fonts.ready; setSource(SAMPLES[b.dataset.sample](document.createElement('canvas'))); }));
$('#rescan').addEventListener('click', () => runScan(true));
$('#clear').addEventListener('click', () => { state.source = null; state.result = null; ghosts.innerHTML = ''; view.width = view.height = 0; fx.width = fx.height = 0; drop.classList.remove('hidden'); $('#list').innerHTML = ''; $('#score').textContent = '—'; $('#status').textContent = 'The stage is dark.'; $('#rescan').disabled = $('#clear').disabled = $('#report-scan').disabled = true; });
$('#exorcise-scan').addEventListener('click', () => {
  let n = 0;
  state.groups.forEach((g, i) => { if (!state.fixed.has(i)) { state.fixed.add(i); applyExorcism(g, exorcise(g.fg, g.bg, state.target)); n++; } });
  renderGhosts(); renderList(); updateScore(); toast(n ? `${n} ghost${n > 1 ? 's' : ''} exorcised — the stage is clean` : 'Nothing left to exorcise');
});
$('#report-scan').addEventListener('click', () => {
  const lines = ['# Ghostlight exorcism report', '', `Target: ${state.target}:1 · Possession: ${state.sim}`, '', '| # | Text | Background | Ratio | Exorcised text | New ratio |', '|---|---|---|---|---|---|'];
  state.groups.forEach((g, i) => { const f = exorcise(g.fg, g.bg, state.target); lines.push(`| ${i + 1} | ${hex(g.fg)} | ${hex(g.bg)} | ${fmt(g.ratio)} (${g.regions.length} places) | ${hex(f)} | ${fmt(contrastRatio(f, g.bg))} |`); });
  copy(lines.join('\n'), 'Exorcism report copied as Markdown');
});

/* ---------- séance palette ---------- */
let palette = ['#1b1b1f', '#ffffff', '#7b61ff', '#ffd23f', '#b5b5b5', '#f9d7df'];
const HAUNTED_BRAND = ['#2b2140', '#f6f1ff', '#9d7bff', '#ff8fb1', '#c9c2d9', '#ffcf5c', '#5ad1b4'];
function renderPalette() {
  const box = $('#palette'); box.innerHTML = '';
  palette.forEach((c, i) => {
    const d = document.createElement('div'); d.className = 'pcolor';
    d.innerHTML = `<input type="color" value="${c}" aria-label="Colour ${i + 1}"><input type="text" value="${c}" aria-label="Hex for colour ${i + 1}" spellcheck="false"><button class="x" aria-label="Remove colour ${i + 1}">×</button>`;
    const [pick, txt, x] = d.children;
    pick.addEventListener('input', () => { palette[i] = pick.value; txt.value = pick.value; renderMatrix(); });
    txt.addEventListener('change', () => { try { palette[i] = toHex(parseColor(txt.value.trim())); pick.value = palette[i]; renderMatrix(); } catch { txt.value = palette[i]; toast('That is not a colour the spirits recognise'); } });
    x.addEventListener('click', () => { if (palette.length > 2) { palette.splice(i, 1); renderPalette(); renderMatrix(); } });
    box.appendChild(d);
  });
  $('#add-color').disabled = palette.length >= 8;
}
function renderMatrix() {
  const t = $('#matrix'); const cols = palette.map(parseColor);
  let h = '<thead><tr><th>text ↓ / bg →</th>' + palette.map((c) => `<th><span class="sw" style="background:${c}"></span>${c}</th>`).join('') + '</tr></thead><tbody>';
  cols.forEach((fg, i) => {
    h += `<tr><th><span class="sw" style="background:${palette[i]}"></span>${palette[i]}</th>`;
    cols.forEach((bg, j) => {
      if (i === j) { h += `<td class="cell same" style="background:${palette[j]}"></td>`; return; }
      const sf = simColor(fg), sb = simColor(bg); const r = contrastRatio(sf, sb); const pass = r >= state.target;
      h += `<td class="cell ${pass ? 'pass' : 'fail'}" style="background:${toHex(sb)};color:${toHex(sf)}" title="${palette[i]} on ${palette[j]}: ${fmt(r)}"><span class="aa">Aa</span>${pass ? '' : MINI}<span class="r">${fmt(r)}</span></td>`;
    });
    h += '</tr>';
  });
  t.innerHTML = h + '</tbody>';
}
function exorciseAll() {
  const cols = palette.map(parseColor); const rows = [];
  // For each background, find text colours that fail but are "close" to passing usage, and exorcise them.
  cols.forEach((fg, i) => cols.forEach((bg, j) => {
    if (i === j) return; const r = contrastRatio(fg, bg);
    if (r < state.target) { const f = exorcise(fg, bg, state.target); rows.push({ i, j, fg, bg, f, r, nr: contrastRatio(f, bg) }); }
  }));
  const ex = $('#export'); ex.hidden = false;
  $('#ex-row').innerHTML = rows.slice(0, 24).map((x) => `<div class="ex"><div class="pair"><span style="background:${palette[x.j]};color:${palette[x.i]}">Aa</span><span style="background:${palette[x.j]};color:${toHex(x.f)}">Aa</span></div><div>${palette[x.i]} → <b>${toHex(x.f)}</b></div><div>${fmt(x.r)} → ${fmt(x.nr)}</div></div>`).join('') || '<p class="empty">Nothing to exorcise — every pair already passes.</p>';
  const css = [':root {', ...palette.map((c, i) => `  --color-${i + 1}: ${c};`), '', '  /* exorcised text-on-background pairs */', ...rows.map((x) => `  --text-${x.i + 1}-on-${x.j + 1}: ${toHex(x.f)}; /* ${fmt(x.r)} → ${fmt(x.nr)} */`), '}'];
  $('#css-out').textContent = css.join('\n');
  state.paletteRows = rows;
  ex.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}
$('#add-color').addEventListener('click', () => { palette.push('#888888'); renderPalette(); renderMatrix(); });
$('#preset').addEventListener('click', () => { palette = [...HAUNTED_BRAND]; renderPalette(); renderMatrix(); });
$('#exorcise-all').addEventListener('click', exorciseAll);
$('#copy-css').addEventListener('click', () => copy($('#css-out').textContent, 'CSS variables copied'));
$('#report-palette').addEventListener('click', () => {
  const rows = state.paletteRows || [];
  const md = ['# Ghostlight séance report', '', `Target: ${state.target}:1`, '', '| Text | Background | Ratio | Exorcised | New ratio |', '|---|---|---|---|---|', ...rows.map((x) => `| ${palette[x.i]} | ${palette[x.j]} | ${fmt(x.r)} | ${toHex(x.f)} | ${fmt(x.nr)} |`)];
  copy(md.join('\n'), 'Séance report copied as Markdown');
});
renderPalette(); renderMatrix();

// deep links for demos: ?sample=landing|lens&tab=seance
const q = new URLSearchParams(location.search);
if (q.get('tab')) $(`#tab-${q.get('tab')}`)?.click();
if (q.get('sample') && SAMPLES[q.get('sample')]) document.fonts.ready.then(() => setSource(SAMPLES[q.get('sample')](document.createElement('canvas'))));
