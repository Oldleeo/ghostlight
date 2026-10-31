// Haunted samples drawn on canvas, so the demo works with zero uploads.
// Each one contains real-world low-contrast mistakes designers make every day.

function rr(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}
function text(ctx, s, x, y, font, color, align = 'left') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

export function drawLanding(canvas) {
  const W = 1200, H = 760;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
  // nav
  text(c, 'nimbus', 60, 62, '700 26px Inter, sans-serif', '#111111');
  ['Product', 'Pricing', 'Journal', 'Sign in'].forEach((s, i) => text(c, s, 700 + i * 110, 60, '500 16px Inter, sans-serif', '#c4c4c4'));
  // hero
  text(c, 'Calm software', 60, 190, '700 64px Inter, sans-serif', '#111111');
  text(c, 'for loud teams.', 60, 262, '700 64px Inter, sans-serif', '#111111');
  text(c, 'Plan, write and ship in one quiet place. No pings, no noise,', 60, 316, '400 20px Inter, sans-serif', '#b5b5b5');
  text(c, 'just the work that matters this week.', 60, 344, '400 20px Inter, sans-serif', '#b5b5b5');
  // input + button
  rr(c, 60, 384, 360, 56, 10, '#f6f6f6');
  text(c, 'you@company.com', 82, 419, '400 17px Inter, sans-serif', '#d0d0d0');
  rr(c, 432, 384, 190, 56, 10, '#ffd23f');
  text(c, 'Start free', 527, 419, '600 18px Inter, sans-serif', '#ffffff', 'center');
  text(c, 'No credit card required · Cancel anytime', 60, 470, '400 13px Inter, sans-serif', '#cfcfcf');
  // hero art
  rr(c, 700, 120, 440, 360, 24, '#7b61ff');
  rr(c, 740, 160, 360, 60, 12, '#8f7aff');
  text(c, 'This week', 762, 198, '600 18px Inter, sans-serif', '#a99bff');
  rr(c, 740, 240, 360, 200, 12, '#ffffff');
  text(c, 'Launch notes', 762, 280, '600 20px Inter, sans-serif', '#111111');
  text(c, 'Draft · edited 2h ago', 762, 306, '400 14px Inter, sans-serif', '#c9c9c9');
  text(c, 'Ship onboarding v2', 762, 350, '500 16px Inter, sans-serif', '#333333');
  text(c, 'Review pricing page copy', 762, 384, '500 16px Inter, sans-serif', '#333333');
  // footer band
  c.fillStyle = '#141414'; c.fillRect(0, 560, W, 200);
  text(c, 'Trusted by 4,000 quiet teams', 60, 620, '600 22px Inter, sans-serif', '#ffffff');
  ['About', 'Careers', 'Privacy', 'Terms', 'Status'].forEach((s, i) => text(c, s, 60 + i * 110, 680, '400 15px Inter, sans-serif', '#3d3d3d'));
  text(c, '© 2026 Nimbus Labs', 1140, 680, '400 14px Inter, sans-serif', '#444444', 'right');
  return canvas;
}

export function drawLensBox(canvas) {
  const W = 1200, H = 760;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  // table
  c.fillStyle = '#e9e4dc'; c.fillRect(0, 0, W, H);
  // box front (pastel pink, typical colored contact lens packaging)
  const g = c.createLinearGradient(140, 80, 740, 680);
  g.addColorStop(0, '#f9d7df'); g.addColorStop(1, '#f6c9d4');
  rr(c, 140, 80, 600, 600, 18, g);
  // lens illustration
  const cx = 440, cy = 300;
  const lg = c.createRadialGradient(cx, cy, 20, cx, cy, 130);
  lg.addColorStop(0, '#3a2a22'); lg.addColorStop(.35, '#7c5a44'); lg.addColorStop(.75, '#b48a6a'); lg.addColorStop(1, 'rgba(180,138,106,0)');
  c.fillStyle = lg; c.beginPath(); c.arc(cx, cy, 130, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1b1411'; c.beginPath(); c.arc(cx, cy, 40, 0, Math.PI * 2); c.fill();
  // brand + copy
  text(c, 'Hollow Iris', 440, 500, 'italic 600 54px Fraunces, Georgia, serif', '#ffffff', 'center');
  text(c, 'MOCHA BROWN  ·  14.2 mm', 440, 540, '600 18px Inter, sans-serif', '#ffffff', 'center');
  text(c, '1-DAY  ·  10 LENSES  ·  BC 8.6', 440, 572, '500 15px Inter, sans-serif', '#f2a7b8', 'center');
  text(c, 'Rx only. Read the leaflet before use.', 440, 640, '400 13px Inter, sans-serif', '#fbe3e9', 'center');
  // side label (white sticker)
  rr(c, 790, 140, 300, 480, 14, '#ffffff');
  text(c, 'POWER', 820, 196, '600 14px Inter, sans-serif', '#d8d8d8');
  text(c, '-3.00', 820, 250, '700 52px Inter, sans-serif', '#111111');
  text(c, 'LOT  2026-11-A7', 820, 300, '500 15px JetBrains Mono, monospace', '#c8c8c8');
  text(c, 'EXP  2029-10', 820, 326, '500 15px JetBrains Mono, monospace', '#c8c8c8');
  rr(c, 820, 360, 240, 54, 10, '#9fd3c7');
  text(c, 'Water 58%', 940, 395, '600 18px Inter, sans-serif', '#ffffff', 'center');
  text(c, 'Store at 2–30°C.', 820, 460, '400 15px Inter, sans-serif', '#333333');
  text(c, 'Discard after one day.', 820, 486, '400 15px Inter, sans-serif', '#333333');
  text(c, 'Made in Taiwan', 820, 580, '400 13px Inter, sans-serif', '#e2e2e2');
  return canvas;
}

export const SAMPLES = { landing: drawLanding, lens: drawLensBox };
