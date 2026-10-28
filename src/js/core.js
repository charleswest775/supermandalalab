// Super Mandala Lab: shared mandala geometry and file writers.
// Pure functions, used by the browser maker and by the static build.

export const R = 500;
const TAU = Math.PI * 2;
const BASE_ANGLE = -Math.PI / 2;

export const SHAPES = {
  petal:   { label: 'Petal',    kind: 'instance' },
  leaf:    { label: 'Leaf',     kind: 'instance' },
  drop:    { label: 'Teardrop', kind: 'instance' },
  dot:     { label: 'Dot',      kind: 'instance' },
  diamond: { label: 'Diamond',  kind: 'instance' },
  spike:   { label: 'Spike',    kind: 'instance' },
  arch:    { label: 'Arch',     kind: 'instance' },
  heart:   { label: 'Heart',    kind: 'instance' },
  square:  { label: 'Square',   kind: 'instance' },
  line:    { label: 'Ray',      kind: 'instance' },
  circle:  { label: 'Ring',     kind: 'ring' },
  scallop: { label: 'Scallop ring', kind: 'ring' },
  zigzag:  { label: 'Zigzag ring',  kind: 'ring' },
  wave:    { label: 'Wave ring',    kind: 'ring' },
  // Sacred geometry: whole figures centered on the mandala, ported from mandala-studio.
  seed:     { label: 'Seed of Life',       kind: 'figure', variations: ['6 circles (Seed of Life)', '12 circles', '18 circles', '24 circles'] },
  flower:   { label: 'Flower of Life',     kind: 'figure', variations: ['19 circles (classic)', '19 circles, petals completed', '37 circles', '61 circles'] },
  metatron: { label: "Metatron's Cube",    kind: 'figure', variations: ['Circles and lines', 'Lines only', 'Fruit of Life (circles only)', 'With outer ring'] },
  stars:    { label: 'Stars within stars', kind: 'figure', variations: ['Star', 'Sharper star', 'Double star', 'Double sharper star'] },
  rose:     { label: 'Mystic rose',        kind: 'figure', variations: ['Every chord', 'Open middle', 'More open', 'Most open'] },
  times:    { label: 'Times table',        kind: 'figure', variations: ['One cusp per slice', 'Two cusps per slice', 'Inward cusps', 'Dense'] },
  spiral:   { label: 'Golden spirals',     kind: 'figure', variations: ['Small center', 'Medium center', 'Large center', 'Widest center'] },
};
export const FIGURES = Object.keys(SHAPES).filter(k => SHAPES[k].kind === 'figure');

export const SYMMETRY_CHOICES = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 30, 36];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : d);
const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (v, d) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);

let _id = 0;
export const newId = () => 'e' + Date.now().toString(36) + (_id++).toString(36);

export function ringLayer(shape, r, len, wid, o = {}) {
  return {
    id: newId(), kind: 'ring', shape, r, len, wid,
    mult: o.mult ?? 1, off: o.off ?? 0, fill: o.fill ?? null,
    echo: o.echo ?? 0, w: o.w ?? null, spin: o.spin ?? 0,
  };
}

export function emptyDesign() {
  return { v: 1, n: 12, mirror: true, ink: '#24203f', bg: '#ffffff', w: 3, open: 0, text: '', font: 'serif', layers: [] };
}

// Words for the open center: at most two lines of 30 characters, no control characters.
export function cleanText(t) {
  if (typeof t !== 'string') return '';
  return t.replace(/\r/g, '').split('\n').slice(0, 2)
    .map(line => line.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30))
    .join('\n').replace(/\n$/, '');
}

// Clean anything that came from storage or a shared link.
export function normalizeDesign(d) {
  const out = emptyDesign();
  if (!d || typeof d !== 'object') return out;
  out.n = Math.round(num(d.n, 12, 2, 48));
  out.mirror = d.mirror !== false;
  out.ink = color(d.ink, out.ink);
  out.bg = d.bg === 'transparent' ? 'transparent' : color(d.bg, out.bg);
  out.w = num(d.w, 3, 0.5, 30);
  out.open = num(d.open, 0, 0, R * 0.7);
  out.text = cleanText(d.text);
  out.font = d.font === 'sans' ? 'sans' : 'serif';
  const layers = Array.isArray(d.layers) ? d.layers.slice(0, 300) : [];
  for (const l of layers) {
    if (!l || typeof l !== 'object') continue;
    if (l.kind === 'stroke') {
      const pts = Array.isArray(l.pts) ? l.pts.slice(0, 4000) : [];
      const clean = [];
      for (const p of pts) {
        if (Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])) {
          clean.push([clamp(+p[0], -R * 1.2, R * 1.2), clamp(+p[1], -R * 1.2, R * 1.2)]);
        }
      }
      if (clean.length > 1) {
        out.layers.push({ id: newId(), kind: 'stroke', pts: clean, w: l.w == null ? null : num(l.w, 3, 0.5, 30), fill: null });
      }
    } else if (l.kind === 'ring' && SHAPES[l.shape]) {
      out.layers.push({
        id: newId(), kind: 'ring', shape: l.shape,
        r: num(l.r, 100, 0, R), len: num(l.len, 60, 1, R), wid: num(l.wid, 40, 1, R),
        mult: Math.round(num(l.mult, 1, 1, 6)), off: num(l.off, 0, 0, 1),
        fill: l.fill ? color(l.fill, null) : null,
        echo: Math.round(num(l.echo, 0, 0, 3)), w: l.w == null ? null : num(l.w, 3, 0.5, 30),
        spin: num(l.spin, 0, -180, 180),
      });
    }
  }
  return out;
}

// ---------- Shape outlines in a local frame: x points outward from the center ----------

function profile(len, wid, fn, steps = 40) {
  const pts = [];
  for (let i = 0; i <= steps; i++) { const t = i / steps; pts.push([t * len, fn(t) * wid / 2]); }
  for (let i = steps - 1; i >= 1; i--) { const t = i / steps; pts.push([t * len, -fn(t) * wid / 2]); }
  return pts;
}

function ellipse(cx, cy, rx, ry, steps = 40) {
  const pts = [];
  for (let i = 0; i < steps; i++) { const a = (i / steps) * TAU; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return pts;
}

function teardrop(len, wid) {
  const a = Math.min(wid / 2, len / 2);
  const d = len - a;
  if (d <= a * 1.01) return ellipse(len / 2, 0, len / 2, wid / 2);
  const beta = Math.acos(a / d);
  const pts = [[0, 0]];
  const start = -(Math.PI - beta), end = Math.PI - beta, steps = 36;
  for (let i = 0; i <= steps; i++) {
    const ang = start + (end - start) * (i / steps);
    pts.push([d + a * Math.cos(ang), a * Math.sin(ang)]);
  }
  return pts;
}

function heart(len, wid, steps = 60) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * TAU;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([((hy + 17) / 29.5) * len, (hx / 32) * wid]);
  }
  return pts;
}

function localShape(shape, len, wid) {
  switch (shape) {
    case 'petal': return { pts: profile(len, wid, t => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.85)), closed: true };
    case 'leaf': return { pts: profile(len, wid, t => Math.sin(Math.PI * t)), closed: true };
    case 'drop': return { pts: teardrop(len, wid), closed: true };
    case 'dot': return { pts: ellipse(len / 2, 0, wid / 2, wid / 2, 32), closed: true };
    case 'diamond': return { pts: [[0, 0], [len / 2, wid / 2], [len, 0], [len / 2, -wid / 2]], closed: true };
    case 'spike': return { pts: [[0, -wid / 2], [len, 0], [0, wid / 2]], closed: true };
    case 'square': return { pts: [[0, -wid / 2], [len, -wid / 2], [len, wid / 2], [0, wid / 2]], closed: true };
    case 'arch': {
      const pts = [];
      for (let i = 0; i <= 32; i++) { const a = -Math.PI / 2 + (i / 32) * Math.PI; pts.push([len * Math.cos(a), (wid / 2) * Math.sin(a)]); }
      return { pts, closed: true };
    }
    case 'heart': return { pts: heart(len, wid), closed: true };
    case 'line': return { pts: [[0, 0], [len, 0]], closed: false };
  }
  return null;
}

function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

function ringOutline(l, count, a0) {
  const pts = [];
  const r = l.r, h = l.len;
  if (l.shape === 'circle') {
    const steps = Math.max(96, Math.round(r / 2));
    for (let i = 0; i < steps; i++) { const a = (i / steps) * TAU; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
    return pts;
  }
  if (l.shape === 'zigzag') {
    for (let i = 0; i < count * 2; i++) {
      const a = a0 + (i / (count * 2)) * TAU;
      const rr = i % 2 === 0 ? r + h : r;
      pts.push([rr * Math.cos(a), rr * Math.sin(a)]);
    }
    return pts;
  }
  const per = l.shape === 'scallop' ? 24 : 32;
  const steps = count * per;
  for (let i = 0; i < steps; i++) {
    const a = a0 + (i / steps) * TAU;
    const u = (i / steps) * count; // bumps travelled
    const rr = l.shape === 'scallop'
      ? r + h * Math.abs(Math.sin(Math.PI * u))
      : r + h * (0.5 + 0.5 * Math.cos(TAU * u));
    pts.push([rr * Math.cos(a), rr * Math.sin(a)]);
  }
  return pts;
}

// ---------- Sacred geometry figures (ported from mandala-studio's generator) ----------

const PHI = (1 + Math.sqrt(5)) / 2;
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

// An arc of the circle about (cx, cy) from angle a0 sweeping da, about 5 units per segment.
function arcPts(cx, cy, r, a0, da) {
  const steps = Math.max(8, Math.min(360, Math.ceil((Math.abs(da) * r) / 5)));
  const pts = [];
  for (let i = 0; i <= steps; i++) { const a = a0 + (da * i) / steps; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
function circlePath(cx, cy, r, a0 = 0) {
  const pts = arcPts(cx, cy, r, a0, TAU);
  pts.pop();
  return { pts, closed: true };
}

// The parts of the circle about (x, y) of radius rho lying between radius r0 and r1 of the center,
// as [middle angle, half-width] pairs.
function clipCircle(x, y, rho, r0, r1) {
  const d = Math.hypot(x, y);
  if (d < 1e-9) return rho >= r0 - 1e-9 && rho <= r1 + 1e-9 ? [[0, Math.PI]] : [];
  const out = Math.atan2(y, x);
  const cosAt = r => (r * r - d * d - rho * rho) / (2 * d * rho);
  const hi = cosAt(r1), lo = cosAt(r0);
  const A = hi >= 1 - 1e-9 ? 0 : Math.acos(Math.max(-1, hi));
  const B = lo <= -1 + 1e-9 ? Math.PI : Math.acos(Math.min(1, lo));
  if (B - A < 1e-9) return [];
  if (A < 1e-9 && B > Math.PI - 1e-9) return [[out + Math.PI, Math.PI]];
  if (A < 1e-9) return [[out, B]];
  if (B > Math.PI - 1e-9) return [[out + Math.PI, Math.PI - A]];
  return [[out + (A + B) / 2, (B - A) / 2], [out - (A + B) / 2, (B - A) / 2]];
}

const seg = (p, q) => ({ pts: [p, q], closed: false });

// The star {k/q}: k points on radius R, each joined to the q-th point on.
function starLines(k, q, R, t) {
  const out = [];
  for (let i = 0; i < (2 * q === k ? k / 2 : k); i++) out.push(seg(polar(R, t + (TAU * i) / k), polar(R, t + (TAU * (i + q)) / k)));
  return out;
}
const starInner = (k, q) => Math.cos((Math.PI * q) / k) / Math.cos(Math.PI / k);

// A logarithmic spiral from radius r0 out to r1, turning by `turn` radians from angle a.
function spiralPts(r0, r1, turn, a, spacing = 4) {
  const T = Math.abs(turn), b = Math.log(r1 / r0) / T;
  const len = ((r1 - r0) * Math.sqrt(1 + b * b)) / b;
  const m = Math.max(8, Math.min(600, Math.ceil(len / spacing))), grow = Math.exp(b * T) - 1, pts = [];
  for (let i = 0; i <= m; i++) {
    const th = Math.log(1 + (grow * i) / m) / b; // even steps along the curve
    pts.push(polar(r0 * Math.exp(b * th), a + Math.sign(turn) * th));
  }
  return pts;
}

// The figure's own symmetry: a multiple of the design's that's at least `lo`.
const foldAtLeast = (n, lo) => { let k = n; while (k < lo) k += n; return k; };

// One sacred geometry figure, centered, with outer radius l.r. l.mult picks the variation, l.spin turns it.
export function figurePaths(l, n, mirror) {
  const c = l.r, v = clamp(Math.round(l.mult || 1), 1, 4);
  if (!(c > 1)) return [];
  const rot = BASE_ANGLE + ((l.spin || 0) * Math.PI) / 180;
  const out = [];
  switch (l.shape) {
    case 'seed': { // circles through the center, each centered on the circle of radius c/2
      const k = 6 * v, a = c / 2, t = rot + (l.off ? Math.PI / k : 0);
      if (k === 6) out.push(circlePath(0, 0, a, t));
      for (let i = 0; i < k; i++) { const u = t + (TAU * i) / k; out.push(circlePath(...polar(a, u), a, u + Math.PI)); }
      out.push(circlePath(0, 0, c, t));
      break;
    }
    case 'flower': { // circles on a triangular lattice: the 19 circles within two rings of the center make the Flower of Life
      const rings = v >= 3 ? v : 2, a = c / (rings + 1), t = rot + (l.off ? Math.PI / 6 : 0);
      const reach = v === 2 ? rings + 1 : rings; // completed petals: the next ring's arcs inside the boundary
      const e1 = polar(a, t), e2 = polar(a, t + Math.PI / 3);
      for (let i = -reach; i <= reach; i++) {
        for (let j = -reach; j <= reach; j++) {
          if (Math.max(Math.abs(i), Math.abs(j), Math.abs(i + j)) > reach) continue; // lattice steps from the center
          const x = i * e1[0] + j * e2[0], y = i * e1[1] + j * e2[1];
          for (const [mid, h] of clipCircle(x, y, a, 0, c + 1e-6)) {
            if (h > Math.PI - 1e-6) out.push(circlePath(x, y, a, mid));
            else out.push({ pts: arcPts(x, y, a, mid - h, 2 * h), closed: false });
          }
        }
      }
      out.push(circlePath(0, 0, c, t));
      break;
    }
    case 'metatron': { // the Fruit of Life's 13 circles and the 78 lines joining their centers
      const a = c / 5, t = rot + (l.off ? Math.PI / 6 : 0);
      const pts = [[0, 0]];
      for (let i = 0; i < 6; i++) pts.push(polar(2 * a, t + (Math.PI * i) / 3));
      for (let i = 0; i < 6; i++) pts.push(polar(4 * a, t + (Math.PI * i) / 3));
      if (v !== 2) for (const [x, y] of pts) out.push(circlePath(x, y, a, Math.atan2(y, x) + Math.PI));
      if (v !== 3) for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) out.push(seg(pts[i], pts[j]));
      if (v === 4) out.push(circlePath(0, 0, c, t));
      break;
    }
    case 'stars': { // a star, the smaller star its crossing sides make, and so on inward
      const k = foldAtLeast(n, 5) * (v >= 3 ? 2 : 1), options = [];
      for (let q = 2; 2 * q < k; q++) if (starInner(k, q) > 0.3 && starInner(k, q) < 0.75) options.push(q);
      const q = options.length ? options[v % 2 ? 0 : options.length - 1] : Math.max(2, Math.floor((k - 1) / 2));
      const shrink = starInner(k, q);
      let R0 = c, t = rot + (l.off ? Math.PI / k : 0);
      out.push(circlePath(0, 0, c, t));
      for (let level = 0; level < 7 && R0 > 0.06 * c && shrink > 0; level++) {
        out.push(...starLines(k, q, R0, t));
        R0 *= shrink;
        t += (Math.PI * (q + 1)) / k; // the next star's points are this one's inner corners
      }
      break;
    }
    case 'rose': { // every chord between m points: the stars {m/1}, {m/2} ... in turn
      let m = n >= 7 ? n : 2 * n;
      if (m > 24) { m = 0; for (let k = 24; k >= 7; k--) if (n % k === 0) { m = k; break; } if (!m) m = 24; }
      const t = rot + (l.off ? Math.PI / m : 0), maxQ = Math.floor(m / 2);
      const qMax = Math.max(1, Math.ceil((maxQ * (5 - v)) / 4));
      out.push(circlePath(0, 0, c, t));
      for (let q = 1; q <= qMax; q++) out.push(...starLines(m, q, c, t));
      break;
    }
    case 'times': { // N points, point j joined to point m*j: the envelope is a cardioid-like curve with n-fold symmetry
      const per = Math.max(3, Math.round((v === 4 ? 200 : 110) / n)), N = n * per;
      const m = v === 2 ? 2 * n + 1 : v === 3 ? N + 1 - n : n + 1;
      const t = rot + (l.off ? Math.PI / n : 0);
      out.push(circlePath(0, 0, c, t));
      for (let j = 0; j < N; j++) {
        const k = (m * j) % N;
        if (k !== j) out.push(seg(polar(c, t + (TAU * j) / N), polar(c, t + (TAU * k) / N)));
      }
      break;
    }
    case 'spiral': { // spirals from a small circle, both ways when mirrored, growing by phi every quarter turn
      const k = n >= 8 ? n : 2 * n, r0 = c * [0.08, 0.15, 0.25, 0.35][v - 1];
      const turn = Math.log(c / r0) / (Math.log(PHI) / (Math.PI / 2));
      const t = rot + (l.off ? Math.PI / k : 0);
      out.push(circlePath(0, 0, r0, t));
      for (let i = 0; i < k; i++) {
        const a = t + (TAU * i) / k;
        for (const dir of mirror ? [1, -1] : [1]) out.push({ pts: spiralPts(r0, c, dir * turn, a), closed: false });
      }
      out.push(circlePath(0, 0, c, t));
      break;
    }
  }
  return out;
}

// ---------- The open center ----------

const lerp2 = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];

// Cuts away every part of every path that lies inside radius r. Paths that are cut become open.
export function clipOutside(paths, r) {
  const r2 = r * r, out = [];
  for (const p of paths) {
    const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
    const runs = [];
    let cur = null, cut = false, startsAt0 = false;
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1];
      const dx = B[0] - A[0], dy = B[1] - A[1];
      const qa = dx * dx + dy * dy, qb = 2 * (A[0] * dx + A[1] * dy), qc = A[0] * A[0] + A[1] * A[1] - r2;
      let lo = 1, hi = 0; // the part of the segment inside the circle
      if (qa > 1e-12) {
        const disc = qb * qb - 4 * qa * qc;
        if (disc > 0) { const s = Math.sqrt(disc); lo = Math.max(0, (-qb - s) / (2 * qa)); hi = Math.min(1, (-qb + s) / (2 * qa)); }
      } else if (qc < 0) { lo = 0; hi = 1; }
      if (lo >= hi) { // all outside
        if (!cur) { cur = [A]; runs.push(cur); if (i === 0) startsAt0 = true; }
        cur.push(B);
        continue;
      }
      cut = true;
      if (lo > 0) { if (!cur) { cur = [A]; runs.push(cur); if (i === 0) startsAt0 = true; } cur.push(lerp2(A, B, lo)); }
      cur = null;
      if (hi < 1) { cur = [lerp2(A, B, hi), B]; runs.push(cur); }
    }
    if (!cut) { out.push(p); continue; }
    // A closed path cut once or more: join the run that ends where it started to the first run.
    if (p.closed && runs.length > 1 && startsAt0 && cur && cur === runs[runs.length - 1]) {
      const last = runs.pop();
      runs[0] = last.concat(runs[0].slice(1));
    }
    for (const run of runs) {
      let len = 0;
      for (let i = 1; i < run.length; i++) len += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
      if (len > 0.5) out.push({ ...p, pts: run, closed: false, fill: null });
    }
  }
  return out;
}

// Advance widths (thousandths of an em) for ASCII 32-126: Times-Roman and Helvetica, the PDF base fonts.
const WIDTHS = {
  serif: '250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541'.split(',').map(Number),
  sans: '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584'.split(',').map(Number),
};
export const FONT_FAMILY = { serif: "'Times New Roman', Times, serif", sans: 'Helvetica, Arial, sans-serif' };
export const PDF_FONT = { serif: 'Times-Roman', sans: 'Helvetica' };
function textWidth(s, font) {
  const w = WIDTHS[font] || WIDTHS.serif;
  let t = 0;
  for (const ch of s) { const c = ch.codePointAt(0); t += c >= 32 && c <= 126 ? w[c - 32] : (font === 'sans' ? 556 : 500); }
  return t / 1000;
}

// Where the words go: font size and baselines, in design units, fitted inside the opening.
export function textLayout(d) {
  if (!d.open || !d.text) return null;
  const lines = d.text.split('\n').filter(Boolean);
  if (!lines.length) return null;
  const r = d.open - (d.w || 3) * 1.5, lh = 1.2;
  let size = r;
  for (let iter = 0; iter < 6; iter++) {
    let best = Infinity;
    lines.forEach((line, i) => {
      const yc = (i - (lines.length - 1) / 2) * lh * size;
      const edge = Math.abs(yc) + size * 0.45; // the far edge of the line's letters
      const half = edge < r ? Math.sqrt(r * r - edge * edge) : 0;
      best = Math.min(best, (half * 2 * 0.86) / Math.max(0.01, textWidth(line, d.font)));
    });
    size = Math.min(best, (r * 2 * 0.62) / (lines.length * lh));
  }
  if (!(size > 0.5)) return null;
  return {
    size, lines, font: d.font,
    items: lines.map((line, i) => ({ line, y: (i - (lines.length - 1) / 2) * lh * size + size * 0.34, width: textWidth(line, d.font) * size })),
  };
}

// The words as SVG text, in design units; nothing when there are none.
export function textSVG(d, fill) {
  const tl = textLayout(d);
  if (!tl) return '';
  return `<g fill="${fill}" stroke="none" font-family="${escapeXML(FONT_FAMILY[tl.font])}" font-size="${f2(tl.size)}" text-anchor="middle">` +
    tl.items.map(it => `<text x="0" y="${f2(it.y)}">${escapeXML(it.line)}</text>`).join('') + '</g>';
}

// Every path the design draws: { pts, closed, w, stroke, fill, id }
export function buildPaths(d) {
  const out = [];
  const n = d.n;
  for (const l of d.layers) {
    const w = l.w ?? d.w;
    if (l.kind === 'stroke') {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU, c = Math.cos(a), s = Math.sin(a);
        out.push({ pts: l.pts.map(([x, y]) => [x * c - y * s, x * s + y * c]), closed: false, w, stroke: d.ink, fill: null, id: l.id });
        if (d.mirror) {
          out.push({ pts: l.pts.map(([x, y]) => [x * c + y * s, x * s - y * c]), closed: false, w, stroke: d.ink, fill: null, id: l.id });
        }
      }
      continue;
    }
    if (SHAPES[l.shape].kind === 'figure') {
      for (const p of figurePaths(l, n, d.mirror)) out.push({ pts: p.pts, closed: p.closed, w, stroke: d.ink, fill: null, id: l.id });
      continue;
    }
    const count = n * (l.mult || 1);
    const step = TAU / count;
    const a0 = BASE_ANGLE + (l.off || 0) * step;
    if (SHAPES[l.shape].kind === 'ring') {
      out.push({ pts: ringOutline(l, count, a0), closed: true, w, stroke: d.ink, fill: l.fill, id: l.id });
      continue;
    }
    const base = localShape(l.shape, l.len, l.wid);
    if (!base) continue;
    const variants = [base.pts];
    if (base.closed && l.echo) {
      const [cx, cy] = centroid(base.pts);
      for (let j = 1; j <= l.echo; j++) {
        const f = 1 - j * 0.27;
        variants.push(base.pts.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]));
      }
    }
    const spin = ((l.spin || 0) * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      const a = a0 + i * step;
      const ca = Math.cos(a), sa = Math.sin(a);
      const cs = Math.cos(spin), ss = Math.sin(spin);
      const ox = l.r * ca, oy = l.r * sa;
      variants.forEach((v, j) => {
        const pts = v.map(([x, y]) => {
          const xs = x * cs - y * ss, ys = x * ss + y * cs; // spin around the anchor
          return [ox + xs * ca - ys * sa, oy + xs * sa + ys * ca];
        });
        out.push({ pts, closed: base.closed, w, stroke: d.ink, fill: j === 0 ? l.fill : null, id: l.id });
      });
    }
  }
  // An open center: nothing drawn inside it but the circle around it, leaving room for words.
  if (d.open > 0 && out.length) {
    const kept = clipOutside(out, d.open);
    kept.push({ ...circlePath(0, 0, d.open, BASE_ANGLE), w: d.w, stroke: d.ink, fill: null, id: 'open' });
    return kept;
  }
  return out;
}

export function boundsOf(paths) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of paths) {
    const h = (p.w || 0) / 2;
    for (const [x, y] of p.pts) {
      if (x - h < x0) x0 = x - h; if (y - h < y0) y0 = y - h;
      if (x + h > x1) x1 = x + h; if (y + h > y1) y1 = y + h;
    }
  }
  if (!isFinite(x0)) return { x0: -R, y0: -R, x1: R, y1: R };
  return { x0, y0, x1, y1 };
}

const f2 = v => Math.round(v * 100) / 100;

export function pathD(pts, closed) {
  let s = 'M' + f2(pts[0][0]) + ' ' + f2(pts[0][1]);
  for (let i = 1; i < pts.length; i++) s += 'L' + f2(pts[i][0]) + ' ' + f2(pts[i][1]);
  return closed ? s + 'Z' : s;
}

// ---------- Smoothing for freehand strokes ----------

export function simplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    let best = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const dist = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L;
      if (dist > best) { best = dist; idx = i; }
    }
    if (best > eps) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function chaikin(pts, iterations = 2) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    if (p.length < 3) return p;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[i + 1];
      q.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

export function smoothStroke(raw) {
  const s = simplify(raw, 1.4);
  return chaikin(s, 2).map(([x, y]) => [f2(x), f2(y)]);
}

// ---------- SVG ----------

export function designSVG(d, o = {}) {
  const paths = o.paths || buildPaths(d);
  const coloring = !!o.coloring;
  const ink = coloring ? '#000000' : d.ink;
  const pad = o.pad ?? 12;
  const b = boundsOf(paths);
  const ext = Math.max(R, Math.abs(b.x0), Math.abs(b.x1), Math.abs(b.y0), Math.abs(b.y1)) + pad;
  const vb = o.viewBox || `${-ext} ${-ext} ${ext * 2} ${ext * 2}`;
  const size = o.width ? ` width="${o.width}" height="${o.height || o.width}"` : '';
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${size}${o.attrs || ''}>`;
  if (o.title) s += `<title>${escapeXML(o.title)}</title>`;
  const bg = coloring ? '#ffffff' : d.bg;
  if (bg && bg !== 'transparent' && !o.noBg) s += `<rect x="${-ext}" y="${-ext}" width="${ext * 2}" height="${ext * 2}" fill="${bg}"/>`;
  s += `<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">`;
  for (const p of paths) {
    const fill = !coloring && p.fill ? ` fill="${p.fill}"` : '';
    const w = p.w !== d.w ? ` stroke-width="${f2(p.w)}"` : '';
    s += `<path d="${pathD(p.pts, p.closed)}"${fill}${w}${o.ids ? ` data-id="${p.id}"` : ''}/>`;
  }
  s = s.replace(`stroke-linejoin="round">`, `stroke-linejoin="round" stroke-width="${f2(d.w)}">`);
  return s + '</g>' + (o.noText ? '' : textSVG(d, ink)) + '</svg>';
}

// ---------- Die-cut sticker (ported from mandala-studio) ----------

const GLOW_STOPS = [[0, 0.42], [0.15, 0.22], [0.45, 0.07], [1, 0]];
function luminance(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}

// The design on a round sticker, sized in mm: a white border around the disc, white bleed beyond
// the cut, and the cut line as a magenta hairline on a layer of its own named CutContour, the name
// print-and-cut software looks for. For a PNG, pass bleed 0 and cutline false: the printer traces
// the edge of the white border. plain: the disc alone, with no border, bleed or cut line.
export function stickerSVG(d, o = {}) {
  const plain = !!o.plain;
  const sizeMM = o.sizeMM || 76.2;
  const borderMM = plain ? 0 : clamp(o.borderMM ?? 2.54, 0, sizeMM / 2 - 1);
  const bleedMM = plain ? 0 : (o.bleedMM ?? 1.5875);
  const cutline = !plain && o.cutline !== false;
  const cutR = sizeMM / 2, W = 2 * (cutR + bleedMM), C = W / 2, discR = cutR - borderMM;
  const night = o.look === 'night';
  const ink = night && luminance(d.ink) < 0.4 ? '#ecbc64' : d.ink;
  const disc = night ? '#0d0b1a' : d.bg === 'transparent' ? '#ffffff' : d.bg;
  const paths = buildPaths(d);
  const b = boundsOf(paths);
  const ext = Math.max(Math.abs(b.x0), Math.abs(b.x1), Math.abs(b.y0), Math.abs(b.y1), 1);
  const k = (discR * 0.94) / ext;
  const minW = 0.12 / k; // no line thinner than 0.12 mm, so it survives printing
  const size = o.px ? ` width="${o.px}" height="${o.px}"` : ` width="${f2(W)}mm" height="${f2(W)}mm"`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="0 0 ${f2(W)} ${f2(W)}">`;
  s += `<title>Mandala sticker, ${f2(sizeMM)} mm, from supermandalalab.com</title>`;
  if (night) {
    s += `<defs><radialGradient id="glow" cx="${f2(C)}" cy="${f2(C)}" r="${f2(discR * 0.62)}" gradientUnits="userSpaceOnUse">` +
      GLOW_STOPS.map(([at, a]) => `<stop offset="${at}" stop-color="${ink}" stop-opacity="${a}"/>`).join('') + '</radialGradient></defs>';
  }
  s += '<g id="artwork">';
  if (borderMM || bleedMM) s += `<circle id="border" cx="${f2(C)}" cy="${f2(C)}" r="${f2(W / 2)}" fill="#ffffff"/>`;
  s += `<circle id="disc" cx="${f2(C)}" cy="${f2(C)}" r="${f2(discR)}" fill="${disc}"/>`;
  if (night) s += `<circle cx="${f2(C)}" cy="${f2(C)}" r="${f2(discR * 0.62)}" fill="url(#glow)"/>`;
  s += `<g transform="translate(${f2(C)} ${f2(C)}) scale(${+k.toPrecision(6)})">`;
  s += `<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${f2(Math.max(d.w, minW))}">`;
  for (const p of paths) {
    const fill = p.fill ? ` fill="${p.fill}"` : '';
    const w = Math.max(p.w, minW);
    s += `<path d="${pathD(p.pts, p.closed)}"${fill}${w !== Math.max(d.w, minW) ? ` stroke-width="${f2(w)}"` : ''}/>`;
  }
  s += '</g>' + textSVG(d, ink) + '</g></g>';
  if (cutline) s += `<g id="CutContour"><circle cx="${f2(C)}" cy="${f2(C)}" r="${f2(cutR)}" fill="none" stroke="#ec008c" stroke-width="0.088"/></g>`;
  return s + '</svg>';
}

// How wide the open center is on a printed page and on a sticker, in inches.
export function openingSizes(d, stickerIn = 3, borderIn = 0.1) {
  if (!d.open) return null;
  const b = boundsOf(buildPaths(d));
  const ext = Math.max(Math.abs(b.x0), Math.abs(b.x1), Math.abs(b.y0), Math.abs(b.y1), 1);
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0) || 1;
  const across = 2 * (d.open - d.w / 2);
  return {
    page: (across * ((612 - 80) / span)) / 72, // US Letter, as the PDF lays it out
    sticker: across * (((stickerIn / 2 - borderIn) * 0.94) / ext),
  };
}

export function escapeXML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Cut-ready outlines (needs ClipperLib) ----------

const SCALE = 100;

export function cutOutlines(paths, ClipperLib, o = {}) {
  const C = ClipperLib;
  const pieces = [];
  for (const p of paths) {
    const half = Math.max(0.25, (o.weight || p.w || 1) / 2) * SCALE;
    const ip = p.pts.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
    const co = new C.ClipperOffset(2, 0.15 * SCALE);
    const sol = new C.Paths();
    if (!p.closed) {
      co.AddPath(ip, C.JoinType.jtRound, C.EndType.etOpenRound);
    } else if (p.fill) {
      const cleaned = C.Clipper.SimplifyPolygon(ip, C.PolyFillType.pftNonZero);
      co.AddPaths(cleaned, C.JoinType.jtRound, C.EndType.etClosedPolygon);
    } else {
      co.AddPath(ip, C.JoinType.jtRound, C.EndType.etClosedLine);
    }
    co.Execute(sol, half);
    for (const s of sol) pieces.push(s);
  }
  const cl = new C.Clipper();
  cl.AddPaths(pieces, C.PolyType.ptSubject, true);
  let union = new C.Paths();
  cl.Execute(C.ClipType.ctUnion, union, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  if (o.stencil) {
    let ext = 0;
    for (const poly of union) for (const pt of poly) ext = Math.max(ext, Math.hypot(pt.X, pt.Y));
    const discR = ext + (o.margin ?? 30) * SCALE;
    const disc = [];
    const steps = 360;
    for (let i = 0; i < steps; i++) { const a = (i / steps) * TAU; disc.push({ X: Math.round(discR * Math.cos(a)), Y: Math.round(discR * Math.sin(a)) }); }
    const c2 = new C.Clipper();
    c2.AddPath(disc, C.PolyType.ptSubject, true);
    c2.AddPaths(union, C.PolyType.ptClip, true);
    const diff = new C.Paths();
    c2.Execute(C.ClipType.ctDifference, diff, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    union = diff;
  }
  union = C.Clipper.CleanPolygons(union, 0.05 * SCALE);
  return union.filter(poly => poly.length > 2 && Math.abs(C.Clipper.Area(poly)) > 4 * SCALE * SCALE)
    .map(poly => poly.map(pt => [pt.X / SCALE, pt.Y / SCALE]));
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return a / 2;
}

// Outer contours wind one way and holes the other, so the outer count is the number of loose pieces.
export function countPieces(polys) {
  if (!polys.length) return 0;
  let big = polys[0], bigA = 0;
  for (const p of polys) { const a = Math.abs(signedArea(p)); if (a > bigA) { bigA = a; big = p; } }
  const sign = Math.sign(signedArea(big));
  return polys.filter(p => Math.sign(signedArea(p)) === sign).length;
}

export function cutSVG(polys, o = {}) {
  const b = boundsOf(polys.map(pts => ({ pts, w: 0 })));
  const pad = 2;
  const x = b.x0 - pad, y = b.y0 - pad, w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2;
  const size = o.physW ? ` width="${o.physW}${o.unit}" height="${f2((o.physW * h) / w)}${o.unit}"` : '';
  let d = '';
  for (const p of polys) d += pathD(p, true);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(x)} ${f2(y)} ${f2(w)} ${f2(h)}"${size}><path fill="${o.color || '#000000'}" fill-rule="evenodd" d="${d}"/></svg>`;
}

// ---------- Scaled export geometry ----------

// Scale shapes so the outside of the design is exactly `size` units across, origin at bottom-left, y up.
function fitForCAD(polys, size, pad = 0) {
  const b = boundsOf(polys.map(pts => ({ pts, w: 0 })));
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0) || 1;
  const k = size / span;
  return polys.map(pts => pts.map(([x, y]) => [(x - b.x0) * k + pad, (b.y1 - y) * k + pad]));
}

export function toDXF(polys, o = {}) {
  const unit = o.unit === 'mm' ? 'mm' : 'in';
  const fitted = fitForCAD(polys.map(p => p.pts || p), o.size || (unit === 'mm' ? 300 : 12));
  const closedFlags = polys.map(p => (p.pts ? p.closed : true));
  const lines = [];
  const add = (code, val) => lines.push(String(code), String(val));
  add(0, 'SECTION'); add(2, 'HEADER');
  add(9, '$ACADVER'); add(1, 'AC1009');
  add(9, '$INSUNITS'); add(70, unit === 'mm' ? 4 : 1);
  add(9, '$MEASUREMENT'); add(70, unit === 'mm' ? 1 : 0);
  add(0, 'ENDSEC');
  add(0, 'SECTION'); add(2, 'TABLES');
  add(0, 'TABLE'); add(2, 'LAYER'); add(70, 1);
  add(0, 'LAYER'); add(2, 'CUT'); add(70, 0); add(62, 7); add(6, 'CONTINUOUS');
  add(0, 'ENDTAB'); add(0, 'ENDSEC');
  add(0, 'SECTION'); add(2, 'ENTITIES');
  fitted.forEach((pts, i) => {
    add(0, 'POLYLINE'); add(8, 'CUT'); add(66, 1); add(70, closedFlags[i] ? 1 : 0);
    add(10, 0); add(20, 0); add(30, 0);
    for (const [x, y] of pts) {
      add(0, 'VERTEX'); add(8, 'CUT'); add(10, x.toFixed(4)); add(20, y.toFixed(4)); add(30, 0);
    }
    add(0, 'SEQEND'); add(8, 'CUT');
  });
  add(0, 'ENDSEC'); add(0, 'EOF');
  return lines.join('\r\n') + '\r\n';
}

// ---------- PDF ----------

const PAGES = { letter: [612, 792], a4: [595.28, 841.89] };

function hexRGB(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => +v.toFixed(3)).join(' ');
}

// Builds the page's drawing commands; pass them to pdfFile with an optional compressor.
export function pdfContent(d, o = {}) {
  const paths = o.paths || buildPaths(d);
  const coloring = o.coloring !== false;
  const [pw, ph] = PAGES[o.page] || PAGES.letter;
  const margin = o.margin ?? 40;
  const b = boundsOf(paths);
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0) || 1;
  const k = Math.min(pw - margin * 2, ph - margin * 2) / span;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const tx = pw / 2 - cx * k, ty = ph / 2 + cy * k;
  const out = [];
  out.push('1 J 1 j');
  if (!coloring && d.bg && d.bg !== 'transparent') {
    out.push(`${hexRGB(d.bg)} rg 0 0 ${pw} ${ph} re f`);
  }
  out.push(`${coloring ? '0 0 0' : hexRGB(d.ink)} RG`);
  out.push(`q ${f3(k)} 0 0 ${f3(-k)} ${f3(tx)} ${f3(ty)} cm`);
  let lastW = null;
  for (const p of paths) {
    if (p.w !== lastW) { out.push(`${f3(p.w)} w`); lastW = p.w; }
    let s = `${f2(p.pts[0][0])} ${f2(p.pts[0][1])} m`;
    for (let i = 1; i < p.pts.length; i++) s += ` ${f2(p.pts[i][0])} ${f2(p.pts[i][1])} l`;
    if (p.closed) s += ' h';
    if (!coloring && p.fill) out.push(`${hexRGB(p.fill)} rg ${s} B`);
    else out.push(s + ' S');
  }
  out.push('Q');
  // Words in the open center, in a PDF base font, placed in page coordinates (y up).
  const tl = o.noText ? null : textLayout(d);
  if (tl) {
    out.push(`${coloring ? '0 0 0' : hexRGB(d.ink)} rg`);
    for (const it of tl.items) {
      const x = tx - (it.width / 2) * k, y = ty - it.y * k;
      out.push(`BT /F1 ${f3(tl.size * k)} Tf ${f3(x)} ${f3(y)} Td (${pdfString(it.line)}) Tj ET`);
    }
  }
  return { content: out.join('\n'), width: pw, height: ph, font: tl ? PDF_FONT[tl.font] : null };
}

const f3 = v => Math.round(v * 1000) / 1000;

// A PDF string in WinAnsi: Latin-1 letters as octal escapes, anything beyond as '?'.
function pdfString(t) {
  let out = '';
  for (const ch of t) {
    const c = ch.codePointAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
    else if (c >= 32 && c <= 126) out += ch;
    else if (c >= 160 && c <= 255) out += '\\' + c.toString(8).padStart(3, '0');
    else out += '?';
  }
  return out;
}

// compressed: Uint8Array of zlib (FlateDecode) data for the content, or null to store it plain.
export function pdfFile(page, compressed) {
  const enc = new TextEncoder();
  const body = compressed || enc.encode(page.content);
  const parts = [];
  let len = 0;
  const offsets = [];
  const push = chunk => { const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(b); len += b.length; };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\x80-\xff]/g, '~'));
  const obj = (i, s) => { offsets[i] = len; push(`${i} 0 obj\n${s}\nendobj\n`); };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Contents 4 0 R /Resources << ${page.font ? `/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /${page.font} /Encoding /WinAnsiEncoding >> >> ` : ''}>> >>`);
  offsets[4] = len;
  push(`4 0 obj\n<< /Length ${body.length}${compressed ? ' /Filter /FlateDecode' : ''} >>\nstream\n`);
  push(body);
  push('\nendstream\nendobj\n');
  obj(5, '<< /Producer (Super Mandala Lab, supermandalalab.com) /Title (Mandala) >>');
  const xref = len;
  let x = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size 6 /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const outBytes = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { outBytes.set(p, o); o += p.length; }
  return outBytes;
}

// ---------- Generators ----------

const RAND_SHAPES = ['petal', 'leaf', 'drop', 'dot', 'diamond', 'spike', 'arch', 'heart', 'line', 'circle', 'scallop', 'zigzag', 'wave'];

export function randomDesign(seed, level = 'medium') {
  const rnd = mulberry32(seed);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + (b - a) * rnd();
  const d = emptyDesign();
  if (level === 'sacred') return sacredDesign(d, pick, between, rnd);
  const simple = level === 'easy', intricate = level === 'intricate';
  d.n = pick(simple ? [6, 8, 8, 10, 12] : intricate ? [12, 16, 18, 20, 24] : [8, 10, 12, 12, 16]);
  d.w = simple ? 4 : intricate ? 2 : 3;
  const target = simple ? 4 + Math.floor(rnd() * 2) : intricate ? 9 + Math.floor(rnd() * 4) : 6 + Math.floor(rnd() * 3);
  const centerShape = pick(['petal', 'leaf', 'drop', 'heart', 'petal']);
  const hub = intricate ? between(28, 46) : between(14, 26);
  const cLen = between(70, 120);
  d.layers.push(ringLayer('circle', hub, 0, 0));
  d.layers.push(ringLayer(centerShape, intricate ? hub : 0, cLen, cLen * between(0.35, 0.6), { echo: intricate ? 1 : 0 }));
  let r = (intricate ? hub : 0) + cLen;
  const limit = R - 30;
  const stepBase = (limit - r) / target;
  let lastRing = false;
  for (let i = 0; i < target && r < limit - 20; i++) {
    let shape = pick(RAND_SHAPES);
    if (SHAPES[shape].kind === 'ring' && lastRing) shape = pick(['petal', 'leaf', 'drop', 'dot', 'arch']);
    lastRing = SHAPES[shape].kind === 'ring';
    const start = r + 4;
    const len = Math.max(12, Math.min(limit - start, stepBase * between(0.8, 1.6)));
    const mult = simple ? 1 : pick(intricate ? [1, 1, 2, 2, 3] : [1, 1, 1, 2]);
    const count = d.n * mult;
    const circ = (TAU * (start + len / 2)) / count;
    let wid = Math.min(circ * between(0.5, 1.0), len * 1.1);
    if (shape === 'dot') wid = Math.min(len, circ * 0.7);
    if (shape === 'arch') wid = Math.min(circ * 0.95, len * 2);
    if (shape === 'line') wid = 0;
    const off = rnd() < 0.5 ? 0.5 : 0;
    if (shape === 'circle') {
      d.layers.push(ringLayer('circle', r + 6, 0, 0));
      r += 10;
      continue;
    }
    if (SHAPES[shape].kind === 'ring') {
      const h = Math.min(len, between(16, 40));
      d.layers.push(ringLayer(shape, start, h, 0, { mult, off }));
      r = start + h + 4;
      continue;
    }
    d.layers.push(ringLayer(shape, start, len, Math.max(4, wid), { mult, off, echo: intricate && rnd() < 0.5 ? 1 + Math.floor(rnd() * 2) : 0 }));
    if (!simple && rnd() < 0.35 && shape !== 'line' && start + len + 20 < limit) {
      d.layers.push(ringLayer('dot', start + len + 4, 12, Math.min(12, circ * 0.4), { mult, off: off ? 0 : 0.5 }));
      r = start + len + 16;
    } else {
      r = start + len * between(0.75, 0.95);
    }
  }
  // Close the design with a ring just outside everything drawn so far.
  let ext = 0;
  for (const p of buildPaths(d)) for (const [x, y] of p.pts) ext = Math.max(ext, Math.hypot(x, y));
  d.layers.push(ringLayer('circle', Math.min(R, ext + 10), 0, 0));
  return d;
}

// A sacred geometry figure at the center, ringed by bands of shapes.
function sacredDesign(d, pick, between, rnd) {
  d.n = pick([6, 6, 12, 12, 18, 24]);
  d.w = 2.5;
  const fig = pick(FIGURES);
  const c = between(170, 250);
  d.layers.push(ringLayer(fig, c, 0, 0, { mult: 1 + Math.floor(rnd() * 3) }));
  d.layers.push(ringLayer('circle', c + 8, 0, 0));
  let r = c + 14;
  const limit = R - 30;
  const bands = 2 + Math.floor(rnd() * 3);
  const step = (limit - r) / bands;
  for (let i = 0; i < bands && r < limit - 24; i++) {
    const shape = pick(['petal', 'leaf', 'drop', 'arch', 'diamond', 'spike', 'dot', 'scallop']);
    const mult = pick([1, 1, 2]);
    const len = Math.max(16, Math.min(limit - r, step * between(0.75, 1.1)));
    const circ = (TAU * (r + len / 2)) / (d.n * mult);
    if (shape === 'scallop') {
      const h = Math.min(len, between(18, 36));
      d.layers.push(ringLayer('scallop', r, h, 0, { mult, off: 0.5 }));
      r += h + 8;
    } else {
      const wid = shape === 'dot' ? Math.min(len, circ * 0.6) : Math.min(circ * between(0.6, 0.95), len * 1.1);
      d.layers.push(ringLayer(shape, r, shape === 'dot' ? Math.max(12, wid) : len, Math.max(6, wid), { mult, off: rnd() < 0.5 ? 0.5 : 0 }));
      r += (shape === 'dot' ? Math.max(12, wid) : len) + 6;
    }
    if (rnd() < 0.5 && r < limit - 10) { d.layers.push(ringLayer('circle', r, 0, 0)); r += 8; }
  }
  let ext = 0;
  for (const p of buildPaths(d)) for (const [x, y] of p.pts) ext = Math.max(ext, Math.hypot(x, y));
  d.layers.push(ringLayer('circle', Math.min(R, ext + 10), 0, 0));
  return d;
}

const L = ringLayer;

export const TEMPLATES = [
  {
    slug: 'lotus-mandala', name: 'Lotus Mandala',
    blurb: 'Layered lotus petals opening from a small center, finished with a scalloped border. A classic first mandala that colors beautifully and cuts cleanly.',
    make: () => ({ ...emptyDesign(), n: 8, layers: [
      L('circle', 30, 0, 0), L('petal', 30, 120, 80), L('petal', 40, 190, 120, { off: 0.5 }),
      L('leaf', 150, 70, 30, { echo: 1 }), L('circle', 245, 0, 0), L('petal', 245, 140, 150, { echo: 1 }),
      L('petal', 255, 110, 70, { off: 0.5 }), L('dot', 380, 18, 18, { mult: 2, off: 0.25 }),
      L('scallop', 400, 45, 0, { mult: 2 }), L('circle', 450, 0, 0),
    ] }),
  },
  {
    slug: 'snowflake-mandala', name: 'Snowflake Mandala',
    blurb: 'Six-fold spikes and diamonds in the pattern of a snow crystal. Good for winter crafts, ornaments and window clings.',
    make: () => ({ ...emptyDesign(), n: 6, layers: [
      L('circle', 26, 0, 0), L('line', 26, 420, 0), L('diamond', 40, 120, 50, { echo: 1 }),
      L('spike', 60, 70, 40, { off: 0.5 }), L('diamond', 170, 90, 44), L('line', 175, 80, 0, { off: 0.5 }),
      L('spike', 250, 80, 34, { spin: 35 }), L('spike', 250, 80, 34, { spin: -35 }),
      L('diamond', 330, 70, 36), L('dot', 400, 34, 34), L('spike', 300, 90, 40, { off: 0.5 }),
    ] }),
  },
  {
    slug: 'sun-mandala', name: 'Sun Mandala',
    blurb: 'A round face of rings with alternating straight and wavy rays. Bold and simple, it works for kids and for metal wall art.',
    make: () => ({ ...emptyDesign(), n: 16, w: 3.5, layers: [
      L('circle', 60, 0, 0), L('circle', 110, 0, 0), L('dot', 70, 30, 22, { mult: 1 }),
      L('wave', 130, 26, 0), L('spike', 175, 150, 40), L('drop', 185, 230, 36, { off: 0.5 }),
      L('circle', 335, 0, 0), L('zigzag', 345, 30, 0, { mult: 2 }), L('dot', 400, 26, 20, { off: 0.5 }), L('circle', 440, 0, 0),
    ] }),
  },
  {
    slug: 'flower-mandala', name: 'Flower Mandala',
    blurb: 'Round petals, teardrops and a ring of hearts, like a stylized bloom. A friendly design for coloring pages and stickers.',
    make: () => ({ ...emptyDesign(), n: 10, layers: [
      L('dot', 0, 50, 50), L('leaf', 25, 100, 50), L('circle', 130, 0, 0), L('arch', 130, 80, 80, { echo: 1 }),
      L('drop', 130, 140, 50, { off: 0.5 }), L('heart', 280, 70, 60, { echo: 1 }), L('circle', 280, 0, 0),
      L('petal', 350, 110, 70, { off: 0.5 }), L('dot', 360, 20, 20), L('circle', 470, 0, 0),
    ] }),
  },
  {
    slug: 'star-mandala', name: 'Star Mandala',
    blurb: 'Crisp geometric stars stacked in rings. Sharp points and straight lines make it easy to cut on a laser or plasma table.',
    make: () => ({ ...emptyDesign(), n: 12, w: 3, layers: [
      L('spike', 0, 100, 40), L('circle', 100, 0, 0), L('zigzag', 100, 60, 0),
      L('diamond', 170, 110, 46, { echo: 2 }), L('spike', 175, 90, 30, { off: 0.5 }),
      L('circle', 290, 0, 0), L('spike', 290, 150, 60, { echo: 1 }), L('line', 290, 120, 0, { off: 0.5 }),
      L('dot', 420, 18, 18, { off: 0.5 }), L('circle', 450, 0, 0),
    ] }),
  },
  {
    slug: 'easy-mandala-for-kids', name: 'Easy Mandala for Kids',
    blurb: 'Big shapes, thick lines and only a few rings, so small hands can color inside the lines. Great for classrooms.',
    make: () => ({ ...emptyDesign(), n: 6, w: 6, layers: [
      L('circle', 50, 0, 0), L('petal', 50, 170, 130), L('dot', 260, 70, 70, { off: 0.5 }),
      L('circle', 300, 0, 0), L('heart', 310, 120, 120), L('circle', 450, 0, 0),
    ] }),
  },
  {
    slug: 'intricate-mandala', name: 'Intricate Mandala',
    blurb: 'Twenty-four-fold symmetry with nested petals and fine rings, for adult coloring and detailed vinyl or paper cuts.',
    make: () => ({ ...emptyDesign(), n: 24, w: 2, layers: [
      L('circle', 20, 0, 0), L('petal', 20, 80, 22), L('circle', 105, 0, 0), L('leaf', 105, 70, 26, { echo: 1 }),
      L('dot', 182, 10, 10, { off: 0.5 }), L('scallop', 195, 22, 0), L('petal', 220, 110, 40, { echo: 2 }),
      L('drop', 225, 90, 20, { off: 0.5 }), L('circle', 335, 0, 0), L('arch', 335, 50, 44, { echo: 1 }),
      L('spike', 340, 70, 18, { off: 0.5 }), L('wave', 395, 18, 0, { mult: 2 }), L('petal', 420, 55, 30, { mult: 2 }), L('circle', 478, 0, 0),
    ] }),
  },
  {
    slug: 'geometric-mandala', name: 'Geometric Mandala',
    blurb: 'Squares, diamonds and zigzags on eight-fold symmetry. A clean modern look for stencils, tiles and signs.',
    make: () => ({ ...emptyDesign(), n: 8, w: 3, layers: [
      L('square', 0, 60, 60), L('circle', 90, 0, 0), L('diamond', 90, 120, 90, { echo: 2 }),
      L('square', 110, 50, 50, { off: 0.5 }), L('zigzag', 220, 50, 0, { mult: 2 }), L('circle', 280, 0, 0),
      L('square', 290, 80, 70, { echo: 1 }), L('spike', 290, 140, 70, { off: 0.5 }), L('circle', 440, 0, 0),
    ] }),
  },
  {
    slug: 'heart-mandala', name: 'Heart Mandala',
    blurb: 'Rings of hearts around a small flower center, with a scalloped edge. Made for Valentine\'s cards, wedding crafts and kids\' coloring.',
    more: `<p>Hearts sit point-in, so each ring reads as a flower when you step back and as hearts up close. The eight-fold symmetry keeps the shapes large enough for crayons and for a cutting machine.</p><p>For a card, download a PNG and drop it on the front. For a vinyl decal or a paper cut, download the cut-ready SVG and upload it to Cricut Design Space.</p>`,
    make: () => ({ ...emptyDesign(), n: 8, layers: [
      L('circle', 30, 0, 0), L('heart', 30, 90, 80), L('circle', 130, 0, 0),
      L('heart', 135, 110, 100, { off: 0.5, echo: 1 }), L('dot', 262, 22, 22), L('circle', 270, 0, 0),
      L('heart', 280, 120, 110, { echo: 1 }), L('dot', 330, 26, 26, { off: 0.5 }),
      L('scallop', 405, 40, 0, { mult: 2 }), L('circle', 460, 0, 0),
    ] }),
  },
  {
    slug: 'dot-mandala', name: 'Dot Mandala',
    blurb: 'Rings of dots that grow toward the edge, the classic pattern for dot painting on rocks, canvas and wood.',
    more: `<p>Dot mandalas are painted one dot at a time with the end of a brush, a dotting tool or a pencil eraser. Print this pattern at the size of your rock or board as a guide, or trace the rings and mark the dots before you paint.</p><p>Start in the center and work out one ring at a time. Use the Design tab to change the number of dots in each ring, then download a PDF at Letter or A4 to print.</p>`,
    make: () => ({ ...emptyDesign(), n: 12, w: 2.5, layers: [
      L('dot', 0, 70, 70), L('dot', 52, 30, 30, { off: 0.5 }), L('dot', 90, 34, 34),
      L('dot', 130, 38, 38, { off: 0.5 }), L('dot', 172, 44, 44), L('dot', 222, 22, 22, { mult: 2, off: 0.25 }),
      L('dot', 250, 50, 50, { off: 0.5 }), L('petal', 300, 90, 60), L('dot', 330, 26, 26, { off: 0.5 }),
      L('dot', 395, 28, 28, { mult: 2, off: 0.25 }), L('dot', 430, 40, 40, { off: 0.5 }),
    ] }),
  },
  {
    slug: 'tattoo-mandala', name: 'Tattoo Mandala',
    blurb: 'A fine-line, sixteen-fold mandala with layered petals and dotwork, drawn in the style of mandala tattoos.',
    more: `<p>Fine lines and dotwork are what give mandala tattoos their look. This template uses a thin line weight and nested petals so it holds up as a stencil at forearm, shoulder or back size.</p><p>Download a high resolution PNG or an SVG to bring into Procreate or your stencil printer, and change the symmetry or line weight first if you want it bolder. Talk to your artist about size, since very fine detail spreads over time.</p>`,
    make: () => ({ ...emptyDesign(), n: 16, w: 1.5, layers: [
      L('dot', 0, 40, 40), L('petal', 20, 70, 26), L('circle', 95, 0, 0), L('dot', 102, 8, 8, { off: 0.5 }),
      L('petal', 112, 120, 46, { echo: 2 }), L('spike', 115, 80, 20, { off: 0.5 }), L('circle', 240, 0, 0),
      L('arch', 240, 60, 52, { echo: 2 }), L('line', 250, 70, 0, { off: 0.5 }), L('dot', 312, 8, 8, { mult: 2, off: 0.25 }),
      L('petal', 330, 130, 54, { echo: 1 }), L('drop', 330, 100, 24, { off: 0.5 }), L('dot', 470, 10, 10, { off: 0.5 }),
    ] }),
  },
  {
    slug: 'simple-mandala', name: 'Simple Mandala',
    blurb: 'Three rings, bold lines and plenty of open space. A simple mandala for beginners, quick crafts and large signs.',
    more: `<p>If you're new to mandalas, this is the one to start with. It has only a few rings, so it's quick to color, easy to copy by hand and simple to cut on any machine.</p><p>Open the Shapes tab to see how it's built: each ring is one shape repeated around the center. Change one ring at a time to learn how mandalas come together, or press Surprise me on the Easy setting for a new simple design.</p>`,
    make: () => ({ ...emptyDesign(), n: 8, w: 4.5, layers: [
      L('circle', 60, 0, 0), L('petal', 60, 160, 100), L('circle', 230, 0, 0),
      L('drop', 232, 140, 80, { off: 0.5 }), L('dot', 245, 40, 40), L('circle', 385, 0, 0),
      L('dot', 400, 40, 40, { off: 0.5 }), L('circle', 455, 0, 0),
    ] }),
  },
  {
    slug: 'leaf-mandala', name: 'Leaf Mandala',
    blurb: 'Layers of leaves and vines wrapping a small center, for nature-themed coloring, botanical wall art and autumn crafts.',
    more: `<p>Leaves overlap from ring to ring, which makes this a good mandala for cutting: the shapes touch, so a cut-ready file comes out as one connected piece.</p><p>For autumn, color it in reds and golds, or set a warm line color in the Design tab before you download a PNG.</p>`,
    make: () => ({ ...emptyDesign(), n: 10, w: 3, layers: [
      L('dot', 0, 50, 50), L('leaf', 22, 110, 44), L('circle', 125, 0, 0), L('leaf', 110, 150, 60, { off: 0.5, echo: 1 }),
      L('leaf', 125, 120, 40, { spin: 30 }), L('leaf', 125, 120, 40, { spin: -30 }), L('circle', 275, 0, 0),
      L('leaf', 262, 170, 70, { echo: 2 }), L('leaf', 280, 130, 44, { off: 0.5 }), L('wave', 440, 18, 0, { mult: 2 }),
    ] }),
  },
  {
    slug: 'boho-mandala', name: 'Boho Mandala',
    blurb: 'Arches, rays and dot borders in a half-sun boho style, made for wall decals, tote bags and nursery prints.',
    more: `<p>Boho designs lean on repeated arches, sunbursts and dots in earthy colors. Set the line color to terracotta or sage in the Design tab, or download the SVG and color it in your own software.</p><p>For a wall decal, download a cut-ready SVG at the size of your wall and cut it from removable vinyl.</p>`,
    make: () => ({ ...emptyDesign(), n: 12, w: 3, ink: '#8a4b2c', layers: [
      L('circle', 50, 0, 0), L('line', 50, 70, 0), L('circle', 120, 0, 0), L('arch', 120, 90, 70, { echo: 2 }),
      L('dot', 222, 16, 16), L('spike', 240, 140, 30, { off: 0.5 }), L('line', 240, 110, 0),
      L('circle', 380, 0, 0), L('scallop', 380, 40, 0), L('dot', 432, 14, 14, { mult: 2, off: 0.25 }), L('circle', 460, 0, 0),
    ] }),
  },
  {
    slug: 'mandala-stencil', name: 'Mandala Stencil',
    blurb: 'Thick, connected shapes made to cut as a stencil for painting walls, floors, furniture and fabric.',
    more: `<p>A stencil needs wide bridges between openings so it doesn't tear and so paint doesn't bleed. This template uses heavy lines and shapes that touch their neighbors.</p><p>Open Download, choose SVG or DXF, and pick the <strong>Stencil</strong> style to get the design cut out of a solid disc. The maker tells you if any piece would fall out. Cut it from stencil film or mylar on a Cricut, Silhouette or laser.</p>`,
    make: () => ({ ...emptyDesign(), n: 8, w: 9, layers: [
      L('dot', 0, 90, 90), L('petal', 40, 150, 100), L('circle', 190, 0, 0), L('drop', 170, 150, 90, { off: 0.5 }),
      L('heart', 200, 110, 100), L('circle', 330, 0, 0), L('petal', 330, 120, 90, { off: 0.5 }), L('dot', 345, 50, 50),
      L('circle', 450, 0, 0),
    ] }),
  },
  {
    slug: 'flower-of-life-mandala', name: 'Flower of Life Mandala',
    blurb: 'The sacred geometry Flower of Life: 19 overlapping circles in a hexagonal pattern, framed with a ring of petals. Free to print, cut or engrave.',
    sacred: true,
    more: `<p>The Flower of Life is a pattern of equal circles, each centered where its neighbors cross. The first seven circles form the Seed of Life; two full rings around the center make the classic 19-circle flower, the version found carved and drawn from ancient Egypt to Renaissance notebooks.</p><p>In the Shapes tab the Flower of Life is a single layer: change its size, turn it, or switch its variation to complete the outer petals or grow it to 37 or 61 circles. Because every line is a true circle, it cuts and engraves cleanly. Use a lines-only SVG or DXF to engrave it, or a cut-ready file to cut it as one connected piece.</p>`,
    make: () => ({ ...emptyDesign(), n: 12, w: 2.5, layers: [
      L('flower', 300, 0, 0), L('petal', 300, 170, 92, { echo: 1 }),
      L('dot', 454, 16, 16, { off: 0.5 }), L('circle', 470, 0, 0),
    ] }),
  },
  {
    slug: 'seed-of-life-mandala', name: 'Seed of Life Mandala',
    blurb: 'Seven circles of the Seed of Life at the center, ringed with arches, leaves and a scalloped edge.',
    sacred: true,
    more: `<p>The Seed of Life is seven equal circles: one in the middle and six around it, each passing through the center. It's the first stage of the Flower of Life, and its six overlapping petals make a natural center for a mandala.</p><p>Pick the Seed of Life layer in the Shapes tab to make it larger or smaller, or switch its variation to 12, 18 or 24 circles for a denser, rosette-like center.</p>`,
    make: () => ({ ...emptyDesign(), n: 12, w: 2.5, layers: [
      L('seed', 222, 0, 0), L('arch', 222, 80, 104), L('circle', 302, 0, 0), L('leaf', 302, 128, 44, { off: 0.5, echo: 1 }),
      L('circle', 430, 0, 0), L('scallop', 430, 32, 0, { mult: 2 }), L('circle', 474, 0, 0),
    ] }),
  },
  {
    slug: 'metatrons-cube-mandala', name: "Metatron's Cube Mandala",
    blurb: "Metatron's Cube: the 13 circles of the Fruit of Life joined by 78 straight lines, inside a ring of petals.",
    sacred: true,
    more: `<p>Metatron's Cube is drawn from the Fruit of Life, 13 circles on the Flower of Life's pattern, by joining every center to every other center with a straight line. Hidden in its lines are flat views of the cube, the octahedron and the other shapes long known as the Platonic solids.</p><p>Its long straight lines make it a strong choice for laser engraving and plasma-cut panels. In the Shapes tab, switch its variation to show only the lines, or only the circles of the Fruit of Life.</p>`,
    make: () => ({ ...emptyDesign(), n: 12, w: 2.2, layers: [
      L('metatron', 330, 0, 0, { mult: 4 }), L('petal', 330, 108, 120, { off: 0.5 }), L('circle', 438, 0, 0),
      L('dot', 438, 36, 36), L('circle', 474, 0, 0),
    ] }),
  },
  {
    slug: 'golden-spiral-mandala', name: 'Golden Spiral Mandala',
    blurb: 'Golden spirals turning both ways from a small center, crossing like the seeds of a sunflower, with a ring of teardrops.',
    sacred: true,
    more: `<p>A golden spiral grows by the golden ratio, about 1.618, every quarter turn. Spirals like these appear in sunflower heads, pine cones and shells, where seeds and scales pack along two sets of curves turning opposite ways.</p><p>The number of spirals follows the Symmetry setting. Try 8, 12 or 20 slices, and turn off Mirror to keep the spirals turning one way only.</p>`,
    make: () => ({ ...emptyDesign(), n: 12, w: 2.2, layers: [
      L('spiral', 360, 0, 0), L('drop', 360, 102, 62, { off: 0.5 }), L('circle', 462, 0, 0),
    ] }),
  },
  {
    slug: 'mystic-rose-mandala', name: 'Mystic Rose Mandala',
    blurb: 'A mystic rose: every point on a circle joined to every other point, for a web of stars inside stars, framed with spikes.',
    sacred: true,
    more: `<p>A mystic rose joins every one of a set of evenly spaced points to every other point. With 12 points that's 66 straight lines, and together they draw every star polygon the points can make, from the outer dodecagon to the six diameters through the center.</p><p>Switch its variation to open the middle, which leaves room to color or to set words in an open center.</p>`,
    make: () => ({ ...emptyDesign(), n: 12, w: 2.2, layers: [
      L('rose', 330, 0, 0), L('spike', 330, 140, 56), L('spike', 330, 64, 40, { off: 0.5 }), L('circle', 470, 0, 0),
    ] }),
  },
  {
    slug: 'sacred-geometry-mandala', name: 'Sacred Geometry Mandala',
    blurb: 'A Flower of Life center with completed petals, surrounded by layered lotus petals, arches and a star border.',
    sacred: true,
    more: `<p>This template combines a Flower of Life center with the petal rings of a lotus mandala. Each part is its own layer, so you can swap the center for the Seed of Life, Metatron's Cube or golden spirals in the Shapes tab and keep the rings around it.</p><p>Every sacred geometry figure in the maker downloads as a print-ready PDF, a cut-ready SVG for Cricut or a DXF for laser and plasma.</p>`,
    make: () => ({ ...emptyDesign(), n: 12, w: 2.2, layers: [
      L('flower', 190, 0, 0, { mult: 2 }), L('petal', 190, 140, 104, { echo: 1 }), L('petal', 190, 100, 64, { off: 0.5 }),
      L('circle', 330, 0, 0), L('arch', 330, 64, 84, { mult: 2 }), L('circle', 394, 0, 0), L('dot', 394, 34, 34, { mult: 2, off: 0.25 }),
      L('zigzag', 428, 34, 0, { mult: 2 }), L('circle', 462, 0, 0),
    ] }),
  },
  {
    slug: 'name-mandala', name: 'Name Mandala',
    blurb: 'A mandala with an open center for a name, a word or a date. Type your words in the maker and print or make a sticker.',
    sacred: false,
    more: `<p>The center of this mandala is left open for words. Open the Design tab and type a name, a word or a date under Open center, with an optional second line. The words are sized to fit the opening and go into the PNG, PDF, line SVG and sticker downloads.</p><p>The maker tells you how wide the opening will be on a printed page and on a sticker, so you can plan lettering of your own. Cut-ready SVG and DXF files leave the center open, so you can add lettering in your cutting software.</p>`,
    make: () => ({ ...emptyDesign(), n: 12, w: 2.5, open: 150, text: 'Your Name', layers: [
      L('flower', 330, 0, 0, { mult: 2 }), L('petal', 330, 152, 92, { echo: 1 }), L('circle', 482, 0, 0),
    ] }),
  },
];

export function templateDesign(slug) {
  const t = TEMPLATES.find(t => t.slug === slug);
  return t ? normalizeDesign(t.make()) : null;
}

// ---------- Share links ----------

export function compactDesign(d) {
  return {
    v: 1, n: d.n, mirror: d.mirror, ink: d.ink, bg: d.bg, w: d.w,
    ...(d.open ? { open: d.open } : {}), ...(d.text ? { text: d.text, font: d.font } : {}),
    layers: d.layers.map(l => {
      const c = { ...l }; delete c.id; return c;
    }),
  };
}
