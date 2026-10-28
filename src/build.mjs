// Builds the static site into ../dist.
// Usage: node src/build.mjs [path-to-deps-dir]   (deps dir holds node_modules with esbuild, @resvg/resvg-js, clipper-lib;
// defaults to ./node_modules, then /home/user/sml-deps)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import {
  TEMPLATES, templateDesign, designSVG, randomDesign, buildPaths, pdfContent, pdfFile, compactDesign, SHAPES, escapeXML, simplify,
} from './js/core.js';
import { FAQ, ARTICLES } from './content.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const DIST = path.join(ROOT, 'dist');
// Dependencies come from ./node_modules when present, otherwise from a deps folder given as the argument.
const deps = process.argv[2] ? path.resolve(process.argv[2])
  : fs.existsSync(path.join(ROOT, 'node_modules')) ? ROOT : '/home/user/sml-deps';
const require = createRequire(path.join(deps, 'package.json'));
const esbuild = require('esbuild');
const { Resvg } = require('@resvg/resvg-js');

const SITE = 'https://supermandalalab.com';
const BRAND = 'Super Mandala Lab';
const TODAY = new Date().toISOString().slice(0, 10);

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const write = (rel, data) => {
  const file = path.join(DIST, rel);
  // Trim coordinates in static SVG files; a tenth of a unit is invisible at any print size.
  if (rel.endsWith('.svg') && typeof data === 'string') data = data.replace(/(\d+\.\d)\d+/g, '$1');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};
const hash = data => crypto.createHash('sha1').update(data).digest('hex').slice(0, 10);
const esc = escapeXML;
// Fewer points for static files: 0.35 units is under a tenth of a millimeter on a printed page.
const lean = d => buildPaths(d).map(p => ({ ...p, pts: p.pts.length > 3 ? simplify(p.pts, 0.35) : p.pts }));

// ---------- assets ----------
const css = fs.readFileSync(path.join(here, 'css/site.css'), 'utf8');
const cssMin = (await esbuild.transform(css, { loader: 'css', minify: true })).code;
write('css/site.css', cssMin);
const CSS_URL = `/css/site.css?v=${hash(cssMin)}`;

const bundle = await esbuild.build({
  entryPoints: [path.join(here, 'js/app.js')], bundle: true, minify: true, format: 'esm', write: false, target: ['es2020'],
});
const js = bundle.outputFiles[0].text;
write('js/maker.js', js);
const JS_URL = `/js/maker.js?v=${hash(js)}`;

const clipperSrc = fs.readFileSync(require.resolve('clipper-lib/clipper.js'), 'utf8');
const clipperMin = (await esbuild.transform(clipperSrc, { minify: true })).code;
write('js/clipper.js', clipperMin);
const CLIPPER_URL = `/js/clipper.js?v=${hash(clipperMin)}`;

const LOGO = `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="#d9622b" stroke-width="5" stroke-linejoin="round">${
  Array.from({ length: 8 }, (_, i) => `<path transform="rotate(${i * 45})" d="M0 -6C10 -18 10 -34 0 -46C-10 -34 -10 -18 0 -6Z"/>`).join('')
}</g><circle r="7" fill="#3b3480"/></svg>`;
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100"><circle r="50" fill="#fbf8f3"/><g fill="none" stroke="#d9622b" stroke-width="6" stroke-linejoin="round">${
  Array.from({ length: 8 }, (_, i) => `<path transform="rotate(${i * 45})" d="M0 -6C10 -18 10 -34 0 -46C-10 -34 -10 -18 0 -6Z"/>`).join('')
}</g><circle r="8" fill="#3b3480"/></svg>`;
write('favicon.svg', FAVICON);
const png = (svg, w, h) => new Resvg(svg, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: true, defaultFontFamily: 'Inter' } }).render().asPng();
write('apple-touch-icon.png', png(FAVICON.replace('<circle r="50"', '<rect x="-50" y="-50" width="100" height="100"'), 180));
write('icon-512.png', png(FAVICON, 512));
write('favicon.ico', png(FAVICON, 48)); // browsers accept a PNG served as .ico

// ---------- images ----------
function mandalaInner(d, coloring) {
  const s = designSVG(d, { coloring });
  return s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}
function socialCard(d, title, subtitle) {
  const inner = mandalaInner({ ...d, bg: 'transparent' }, false);
  const lines = wrapText(title, 22);
  const t = lines.map((l, i) => `<text x="640" y="${250 + i * 70 - (lines.length - 1) * 35}" font-family="DejaVu Serif" font-weight="700" font-size="58" fill="#24203f">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<rect width="1200" height="630" fill="#fbf8f3"/>
<svg x="40" y="35" width="560" height="560" viewBox="-512 -512 1024 1024">${inner}</svg>
${t}
<text x="640" y="${330 + (lines.length - 1) * 35}" font-family="Inter" font-size="28" fill="#4c4766">${esc(subtitle)}</text>
<rect x="640" y="${400 + (lines.length - 1) * 35}" width="330" height="56" rx="12" fill="#d9622b"/>
<text x="664" y="${437 + (lines.length - 1) * 35}" font-family="Inter" font-weight="700" font-size="26" fill="#ffffff">supermandalalab.com</text>
</svg>`;
}
function pinCard(d, title) {
  const inner = mandalaInner(d, true);
  const lines = wrapText(title, 24);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1500" width="1000" height="1500">
<rect width="1000" height="1500" fill="#ffffff"/>
<rect x="0" y="0" width="1000" height="${200 + lines.length * 10}" fill="#fbf8f3"/>
<text x="500" y="70" text-anchor="middle" font-family="Inter" font-weight="700" font-size="30" letter-spacing="3" fill="#d9622b">FREE PRINTABLE</text>
${lines.map((l, i) => `<text x="500" y="${135 + i * 60}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="50" fill="#24203f">${esc(l)}</text>`).join('')}
<svg x="60" y="${260 + lines.length * 20}" width="880" height="880" viewBox="-512 -512 1024 1024">${inner}</svg>
<rect x="0" y="1380" width="1000" height="120" fill="#24203f"/>
<text x="500" y="1452" text-anchor="middle" font-family="Inter" font-weight="600" font-size="34" fill="#ffffff">Print it or make your own at supermandalalab.com</text>
</svg>`;
}
function wrapText(s, max) {
  const words = s.split(' ');
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > max && cur) lines.push(w); else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  return lines;
}
function writeJPEGFromPNG(rel, pngBuf) {
  // Keep PNG: resvg can't write JPEG and line art compresses well as PNG.
  write(rel, pngBuf);
}

// ---------- share links for "edit this design" ----------
function editLink(d) {
  const raw = zlib.deflateRawSync(Buffer.from(JSON.stringify(compactDesign(d))));
  return '/#d=z' + raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------- layout ----------
const NAV = [
  ['/', 'Maker'],
  ['/templates/', 'Templates'],
  ['/coloring-pages/', 'Coloring pages'],
  ['/svg-for-cricut/', 'SVG for Cricut'],
  ['/dxf-for-laser-and-plasma/', 'DXF for laser'],
  ['/learn/', 'Learn'],
];

const SITEMAP = [];

function page(o) {
  const url = SITE + o.path;
  if (!o.noindex) SITEMAP.push({ loc: url, img: o.sitemapImages || [] });
  const og = SITE + (o.ogImage || '/img/og/home.png');
  const crumbs = o.crumbs ? `<nav class="crumbs" aria-label="Breadcrumb">${o.crumbs.map(([href, label], i) => i < o.crumbs.length - 1 ? `<a href="${href}">${esc(label)}</a> › ` : `<span>${esc(label)}</span>`).join('')}</nav>` : '';
  const schemas = [...(o.schema || [])];
  if (o.crumbs) {
    schemas.push({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: o.crumbs.map(([href, label], i) => ({ '@type': 'ListItem', position: i + 1, name: label, item: SITE + href })),
    });
  }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${url}">
${o.noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta property="og:site_name" content="${BRAND}">
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:title" content="${esc(o.ogTitle || o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${og}">
${o.ogImageAlt ? `<meta property="og:image:alt" content="${esc(o.ogImageAlt)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#fbf8f3">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="${CSS_URL}">
${o.maker ? `<script type="module" src="${JS_URL}"></script>` : ''}
${schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-head"><div class="wrap">
<a class="brand" href="/">${LOGO}<span>${BRAND}</span></a>
<nav class="nav" aria-label="Main">${NAV.map(([href, label]) => `<a href="${href}"${href === o.path ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
</div></header>
<main id="main">
${o.wide ? '' : ''}<div class="wrap">${crumbs}</div>
${o.body}
</main>
<footer class="site-foot"><div class="wrap">
<div class="cols">
<div><h4>${BRAND}</h4><p>A free mandala maker. Draw, print and cut your own mandalas, with no signup and no watermark.</p></div>
<div><h4>Make</h4><ul><li><a href="/">Mandala maker</a></li><li><a href="/coloring-page-maker/">Coloring page maker</a></li><li><a href="/svg-for-cricut/">Mandala SVG for Cricut</a></li><li><a href="/dxf-for-laser-and-plasma/">Mandala DXF for laser and plasma</a></li></ul></div>
<div><h4>Free designs</h4><ul><li><a href="/templates/">Mandala templates</a></li><li><a href="/coloring-pages/">Mandala coloring pages</a></li><li><a href="/coloring-pages/easy/">Easy coloring pages</a></li><li><a href="/coloring-pages/intricate/">Intricate coloring pages</a></li></ul></div>
<div><h4>Learn</h4><ul>${ARTICLES.map(a => `<li><a href="/learn/${a.slug}/">${esc(a.short)}</a></li>`).join('')}<li><a href="/about/">About</a></li><li><a href="/privacy/">Privacy</a></li></ul></div>
</div>
<p class="fine">Made in Reno, Nevada by <a href="https://superfablab.com">SuperFabLab</a>, a metal fabrication studio. © 2026 ${BRAND}.</p>
</div></footer>
</body>
</html>
`;
  write(o.path === '/' ? 'index.html' : o.path.replace(/^\//, '') + (o.path.endsWith('/') ? 'index.html' : ''), html);
}

// ---------- the maker block ----------
function maker(o = {}) {
  return `<section id="maker" class="maker wrap" data-mode="draw" data-clipper="${CLIPPER_URL}"${o.template ? ` data-template="${o.template}"` : ''}${o.tab ? ` data-focus-tab="${o.tab}"` : ''} aria-label="Mandala maker">
<div class="mk-stage">
  <div class="mk-toolbar" role="toolbar" aria-label="Maker tools">
    <button type="button" data-mode-btn="draw" aria-pressed="true">Draw</button>
    <button type="button" data-mode-btn="shapes" aria-pressed="false">Shapes</button>
    <span class="sep"></span>
    <button type="button" id="mk-undo" disabled title="Undo (Ctrl+Z)">Undo</button>
    <button type="button" id="mk-redo" disabled title="Redo (Ctrl+Shift+Z)">Redo</button>
    <button type="button" id="mk-clear">Clear</button>
    <span class="grow"></span>
    <button type="button" class="mk-primary" data-tab="download">Download</button>
  </div>
  <div class="mk-canvas">
    <svg id="mk-svg" viewBox="-512 -512 1024 1024" role="img" aria-label="Your mandala. Draw here.">
      <rect id="mk-bg" x="-512" y="-512" width="1024" height="1024" fill="#ffffff"/>
      <g id="mk-guides"></g>
      <g id="mk-art" fill="none" stroke-linecap="round" stroke-linejoin="round"></g>
      <g id="mk-highlight" stroke-linecap="round" stroke-linejoin="round"></g>
      <g id="mk-live" fill="none" stroke-linecap="round" stroke-linejoin="round"></g>
    </svg>
    <div class="mk-empty" id="mk-empty" hidden>Draw anywhere in the circle.<br>Every stroke repeats around the center.</div>
  </div>
  <p class="mk-tip">Tip: draw with a mouse, finger or stylus. Use Shapes to add rings of petals, dots and scallops, and Surprise me for a fresh design.</p>
</div>
<div class="mk-panel">
  <div class="mk-tabs" role="tablist">
    <button type="button" role="tab" data-tab="design" aria-selected="true">Design</button>
    <button type="button" role="tab" data-tab="shapes" aria-selected="false">Shapes (<span id="mk-layer-count">0</span>)</button>
    <button type="button" role="tab" data-tab="download" aria-selected="false">Download</button>
  </div>
  <div class="mk-tab-body" data-panel="design">
    <label class="mk-row"><span>Symmetry</span><select id="mk-n"></select></label>
    <label class="mk-check"><input type="checkbox" id="mk-mirror" checked> Mirror inside each slice</label>
    <label class="mk-row"><span>Line weight</span><input type="range" id="mk-w" min="0.5" max="20" step="0.5" value="3"><output id="mk-w-out">3.0</output></label>
    <label class="mk-row"><span>Line color</span><input type="color" id="mk-ink" value="#24203f"></label>
    <label class="mk-row"><span>Background</span><input type="color" id="mk-bgc" value="#ffffff"></label>
    <label class="mk-check"><input type="checkbox" id="mk-guides-on" checked> Show slice guides</label>
    <div class="mk-group">
      <h3>Start from something</h3>
      <select id="mk-template" aria-label="Templates"></select>
      <div class="mk-inline"><select id="mk-level" aria-label="Detail level"><option value="easy">Simple</option><option value="medium" selected>Medium</option><option value="intricate">Intricate</option></select><button type="button" id="mk-random">Surprise me</button></div>
      <p>Templates and Surprise me replace the current design. Undo brings it back.</p>
    </div>
  </div>
  <div class="mk-tab-body" data-panel="shapes" hidden>
    <div class="mk-inline"><select id="mk-add-shape" aria-label="Shape to add"></select><button type="button" id="mk-add" class="mk-primary">Add ring</button></div>
    <p class="mk-hint">Each ring repeats a shape around the circle. Tap a layer to change its size, distance, twist and fill.</p>
    <ul class="mk-layers" id="mk-layers"></ul>
  </div>
  <div class="mk-tab-body" data-panel="download" hidden>
    <div class="mk-dl"><h3>PDF <small>coloring pages and prints</small></h3>
      <div class="mk-inline"><select id="mk-pdf-page" aria-label="Paper size"><option value="letter">US Letter</option><option value="a4">A4</option></select><button type="button" id="mk-dl-pdf" class="mk-primary">Download PDF</button></div>
      <label class="mk-check"><input type="checkbox" id="mk-pdf-coloring" checked> Coloring page (black lines, no fills)</label>
    </div>
    <div class="mk-dl"><h3>PNG <small>sharing and digital coloring</small></h3>
      <div class="mk-inline"><select id="mk-png-size" aria-label="Image size"><option value="1000">1000 px</option><option value="2000" selected>2000 px</option><option value="4000">4000 px</option></select><button type="button" id="mk-dl-png" class="mk-primary">Download PNG</button></div>
      <label class="mk-check"><input type="checkbox" id="mk-png-clear"> Transparent background</label>
    </div>
    <div class="mk-dl"><h3>SVG <small>Cricut, Silhouette, Illustrator</small></h3>
      <select id="mk-svg-style" aria-label="SVG style"><option value="cut">Cut-ready shapes (Cricut)</option><option value="stencil">Stencil: design cut from a disc</option><option value="lines">Line drawing (editable strokes)</option></select>
      <div class="mk-inline" data-cut-for="mk-svg" data-cut-only="1"><label class="mk-row" style="grid-template-columns:auto 1fr"><span>Width</span><input type="number" id="mk-svg-size" value="12" min="0.5" step="0.5"></label><select id="mk-svg-unit" aria-label="Units"><option value="in">in</option><option value="mm">mm</option></select></div>
      <label class="mk-row" data-cut-for="mk-svg" data-cut-only="1" style="grid-template-columns:auto 1fr"><span>Line thickness</span><input type="number" id="mk-svg-thick" value="0.08" min="0.001" step="0.01"></label>
      <button type="button" id="mk-dl-svg" class="mk-primary">Download SVG</button>
    </div>
    <div class="mk-dl"><h3>DXF <small>laser, CNC and plasma</small></h3>
      <select id="mk-dxf-style" aria-label="DXF style"><option value="cut">Cut-ready outlines</option><option value="stencil">Stencil: design cut from a disc</option><option value="lines">Centerlines (engrave or score)</option></select>
      <div class="mk-inline" data-cut-for="mk-dxf"><label class="mk-row" style="grid-template-columns:auto 1fr"><span>Width</span><input type="number" id="mk-dxf-size" value="12" min="0.5" step="0.5"></label><select id="mk-dxf-unit" aria-label="Units"><option value="in">in</option><option value="mm">mm</option></select></div>
      <label class="mk-row" data-cut-for="mk-dxf" data-cut-only="1" style="grid-template-columns:auto 1fr"><span>Line thickness</span><input type="number" id="mk-dxf-thick" value="0.08" min="0.001" step="0.01"></label>
      <button type="button" id="mk-dl-dxf" class="mk-primary">Download DXF</button>
    </div>
    <div class="mk-dl"><h3>Share</h3><p class="mk-hint" style="margin:0">Copy a link that opens this mandala for anyone.</p><button type="button" id="mk-share">Copy share link</button></div>
  </div>
</div>
<div class="mk-toast" id="mk-toast" role="status" aria-live="polite"></div>
</section>`;
}

// ---------- shared bits ----------
const ORG = {
  '@context': 'https://schema.org', '@type': 'Organization', name: BRAND, url: SITE + '/', logo: SITE + '/icon-512.png',
  parentOrganization: { '@type': 'Organization', name: 'SuperFabLab', url: 'https://superfablab.com' },
};
const faqHTML = items => `<div class="faq">${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}</div>`;
const faqSchema = items => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })),
});

// Template previews and cards
fs.mkdirSync(path.join(DIST, 'img/templates'), { recursive: true });
for (const t of TEMPLATES) {
  const d = templateDesign(t.slug);
  write(`img/templates/${t.slug}.svg`, designSVG(d, { title: t.name, paths: lean(d) }));
  write(`img/og/${t.slug}.png`, png(socialCard(d, t.name + ' Template', 'Free to edit, print and cut'), 1200));
}
const homeDesign = templateDesign('lotus-mandala');
write('img/og/home.png', png(socialCard(templateDesign('intricate-mandala'), 'Free Mandala Maker', 'SVG, DXF, PDF and PNG. No signup.'), 1200));

const templateTiles = (exclude) => `<ul class="tiles">${TEMPLATES.filter(t => t.slug !== exclude).map(t => `<li><a href="/templates/${t.slug}/"><img src="/img/templates/${t.slug}.svg" alt="${esc(t.name)} preview" width="300" height="300" loading="lazy"><span>${esc(t.name)}</span></a></li>`).join('')}</ul>`;

// ---------- coloring pages ----------
const LEVELS = [
  { key: 'easy', name: 'Easy', title: 'Easy Mandala Coloring Pages', blurb: 'Big shapes and thick lines for kids, beginners and relaxed coloring.', seeds: [11, 23, 37, 41, 59, 61, 79, 83] },
  { key: 'medium', name: 'Medium', title: 'Mandala Coloring Pages', blurb: 'A balance of detail and space, for an afternoon of coloring.', seeds: [101, 131, 151, 181, 191, 211, 241, 271] },
  { key: 'intricate', name: 'Intricate', title: 'Intricate Mandala Coloring Pages for Adults', blurb: 'Fine lines and dense rings for detailed adult coloring.', seeds: [307, 331, 347, 367, 389, 409, 431, 457] },
];
const SHAPE_WORD = { petal: 'Petal', leaf: 'Leaf', drop: 'Teardrop', dot: 'Dot', diamond: 'Diamond', spike: 'Star', arch: 'Arch', heart: 'Heart', square: 'Square', line: 'Sunburst', circle: 'Ring', scallop: 'Scallop', zigzag: 'Star', wave: 'Wave' };
const coloring = [];
for (const lv of LEVELS) {
  lv.seeds.forEach((seed, i) => {
    const d = randomDesign(seed * 7919 + 13, lv.key);
    const counts = {};
    for (const l of d.layers) if (l.kind === 'ring' && l.shape !== 'circle') counts[l.shape] = (counts[l.shape] || 0) + 1;
    const main = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'petal';
    const word = SHAPE_WORD[main];
    const num = String(i + 1).padStart(2, '0');
    const name = `${lv.name === 'Medium' ? '' : lv.name + ' '}${word} Mandala ${num}`.trim();
    const slug = `${word.toLowerCase()}-mandala-${num}`;
    coloring.push({ d, lv, name, slug, n: d.n });
  });
}
for (const c of coloring) {
  const base = `coloring-pages/${c.lv.key}/${c.slug}`;
  write(`img/${base}.svg`, designSVG(c.d, { coloring: true, title: c.name + ' coloring page', paths: lean(c.d) }));
  for (const pg of ['letter', 'a4']) {
    const pc = pdfContent(c.d, { page: pg, coloring: true, paths: lean(c.d) });
    write(`files/${base}-${pg}.pdf`, pdfFile(pc, zlib.deflateSync(Buffer.from(pc.content), { level: 9 })));
  }
  write(`img/pins/${c.lv.key}-${c.slug}.png`, png(pinCard(c.d, c.name + ' Coloring Page'), 700));
}

// ---------- pages ----------

// Home
page({
  path: '/',
  title: 'Free Mandala Maker: Create and Download Mandalas as SVG, PNG, PDF and DXF',
  ogTitle: 'Free Mandala Maker',
  description: 'Design your own mandala online in minutes. Free, no signup, no watermark. Export print-ready coloring pages or cut-ready SVG and DXF files for Cricut, laser and plasma.',
  maker: true,
  schema: [
    {
      '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Super Mandala Lab Mandala Maker', url: SITE + '/',
      applicationCategory: 'DesignApplication', operatingSystem: 'Any', browserRequirements: 'Requires a modern web browser with JavaScript',
      isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: ['Symmetry from 4 to 36 slices', 'Freehand drawing with mirror symmetry', 'Rings of petals, dots, scallops and more', 'PNG export', 'PDF coloring pages', 'Cut-ready SVG for Cricut', 'DXF for laser and plasma cutting'],
      image: SITE + '/img/og/home.png', publisher: ORG,
    },
    ORG,
    { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: SITE + '/' },
    faqSchema(FAQ),
  ],
  body: `
<div class="wrap hero">
<h1>Free Mandala Maker</h1>
<p class="lede">Draw one line and watch it bloom into a full mandala. Download it to color, print or cut, free and with no account.</p>
<ul class="badges"><li>Free forever</li><li>No signup</li><li>No watermark</li><li>PNG · PDF · SVG · DXF</li></ul>
</div>
${maker()}
<div class="wrap section">
<h2>How it works</h2>
<ol class="steps">
<li><strong>Pick your symmetry.</strong> Choose how many slices, from 4 to 36, and whether each slice mirrors.</li>
<li><strong>Draw in one slice.</strong> Every stroke repeats around the circle as you go.</li>
<li><strong>Shape it.</strong> Add rings of petals, dots and scallops, change line weight, and fill sections with color.</li>
<li><strong>Download it.</strong> Save a coloring page, a print, or a cut file in the format you need.</li>
</ol>

<h2>Start from a template</h2>
<p>When a blank circle feels like too much, open a template and change it ring by ring.</p>
${templateTiles()}

<div class="two-col">
<div>
<h2>What you can make</h2>
<ul>
<li>Coloring pages for yourself, your kids or your classroom</li>
<li>Wall art and prints</li>
<li>Cricut and Silhouette projects, including layered paper mandalas</li>
<li>Laser-cut wood and acrylic, and plasma-cut steel</li>
<li>Stencils, tattoo sketches and embroidery patterns</li>
</ul>
</div>
<div>
<h2>Features</h2>
<ul>
<li>Free forever, with no signup and no watermark</li>
<li>Real vector shapes, not just a picture of lines</li>
<li>Templates and a Surprise me button for when the blank page feels like too much</li>
<li>Adjustable detail, from simple shapes for kids to intricate designs for adults</li>
<li>Saves in your browser, so you can come back to your work</li>
<li>Works with a mouse, a touch screen or a stylus</li>
<li>Share links that open your mandala for anyone</li>
</ul>
</div>
</div>

<h2>Export formats</h2>
<table class="fmt">
<thead><tr><th>Format</th><th>Best for</th></tr></thead>
<tbody>
<tr><td>PNG</td><td>Sharing, social posts and digital coloring apps, up to 4000 pixels, with an optional transparent background</td></tr>
<tr><td>PDF</td><td>Printing <a href="/coloring-page-maker/">coloring pages</a> at US Letter or A4 size</td></tr>
<tr><td>SVG</td><td>Cricut, Silhouette, vinyl, and editing in Illustrator or Inkscape. <a href="/svg-for-cricut/">Cut-ready SVG guide</a></td></tr>
<tr><td>DXF</td><td>Laser cutters, CNC routers and plasma tables, at real size in inches or millimeters. <a href="/dxf-for-laser-and-plasma/">DXF guide</a></td></tr>
</tbody>
</table>

<h2>Free mandala coloring pages</h2>
<p>Want something ready to print? Browse <a href="/coloring-pages/">free mandala coloring pages</a>, from <a href="/coloring-pages/easy/">easy designs for kids</a> to <a href="/coloring-pages/intricate/">intricate pages for adults</a>. Each one prints at Letter or A4, and you can open any of them in the maker to change it.</p>

<h2>Made by a fabricator</h2>
<p>Super Mandala Lab comes from <a href="https://superfablab.com">SuperFabLab</a>, a metal fabrication studio in Reno, Nevada that cuts decorative panels and lanterns from steel. That's why the maker's cut files are real closed shapes at real sizes, and why it tells you when a design would fall apart into loose pieces before you cut it.</p>

<h2>Frequently asked questions</h2>
${faqHTML(FAQ)}

<div class="closing">
<h2>Your first mandala takes about two minutes.</h2>
<p><a class="btn" href="#maker">Start a mandala</a></p>
</div>
</div>`,
});

// Export landing pages
const exportPages = [
  {
    path: '/svg-for-cricut/', tab: 'download', template: 'flower-mandala',
    title: 'Free Mandala SVG Maker for Cricut and Silhouette',
    h1: 'Free Mandala SVG for Cricut',
    lede: 'Design a mandala and download a cut-ready SVG that opens in Cricut Design Space as solid shapes. Free, no signup, no watermark.',
    description: 'Make your own mandala SVG for Cricut or Silhouette. Download cut-ready shapes at the size you want, free with no signup or watermark.',
    faq: [
      ['What\'s the difference between Cut-ready shapes and Line drawing?', 'A line drawing is made of strokes, which Cricut Design Space treats as thin outlines. Cut-ready shapes turn every line into a solid shape with the thickness you choose, so the machine cuts around it and the design comes out in one piece.'],
      ['What line thickness should I use?', 'For cardstock and vinyl, try 0.04 to 0.08 inches at a 10 to 12 inch size. Thinner lines look more delicate but tear more easily when you weed or lift them.'],
      ['Can I make a layered 3D mandala?', 'Yes. Make a few versions of a design with more detail removed in each one, export each as a cut-ready SVG at the same size, and cut each in a different color of cardstock. Stack them with foam dots between layers.'],
    ],
    content: `
<h2>How to make a mandala SVG for Cricut</h2>
<ol class="steps">
<li><strong>Design it.</strong> Draw in the maker above, or pick a template and change it.</li>
<li><strong>Choose Cut-ready shapes.</strong> In Download, set SVG to Cut-ready shapes, then enter the width and a line thickness for your material.</li>
<li><strong>Download the SVG.</strong> The maker merges overlapping lines into clean shapes and tells you if anything will come out as loose pieces.</li>
<li><strong>Upload to Design Space.</strong> Choose Upload, then Upload Image, pick the SVG, and add it to your canvas.</li>
</ol>
<h2>Tips for clean cuts</h2>
<ul>
<li><strong>Keep it connected.</strong> Floating dots and shapes cut out as separate pieces. Overlap shapes with the ring next to them, or add a ring through them.</li>
<li><strong>Size first, then thickness.</strong> The SVG opens at the width you entered. If you resize it a lot in Design Space, the line thickness changes too.</li>
<li><strong>Test on scrap.</strong> Intricate mandalas push a cutting mat's grip. Cut a small version first.</li>
<li><strong>Use a stencil for paint.</strong> The Stencil option cuts the design out of a solid disc, which works for stencil vinyl and painting. Closed areas fall out of a stencil, so the maker counts them for you.</li>
</ul>
<p>Prefer a ready-made design? Start from the <a href="/templates/flower-mandala/">flower mandala</a> or the <a href="/templates/geometric-mandala/">geometric mandala</a> template.</p>`,
  },
  {
    path: '/dxf-for-laser-and-plasma/', tab: 'download', template: 'star-mandala',
    title: 'Free Mandala DXF Maker for Laser, CNC and Plasma Cutting',
    h1: 'Free Mandala DXF for Laser and Plasma',
    lede: 'Design a mandala and download a DXF at real size, in inches or millimeters, with closed cut-ready outlines. Built by a metal fabrication studio.',
    description: 'Make a mandala DXF for laser cutters, CNC routers and plasma tables. Closed, cut-ready outlines at real size in inches or mm. Free, no signup.',
    faq: [
      ['Which DXF style should I use?', 'Cut-ready outlines keep your lines as solid material, for filigree pieces and wall art. Stencil cuts the design out of a solid disc, for panels and lantern sides. Centerlines are single lines for engraving, scoring or pen plotters.'],
      ['What units does the DXF use?', 'Inches or millimeters, whichever you choose. The design is scaled so its outside edge is exactly the width you enter, and the file header records the units.'],
      ['Will it open in my software?', 'The DXF uses simple closed polylines, which LightBurn, Fusion, Inkscape, SheetCAM and most other CAD and CAM programs read.'],
    ],
    content: `
<h2>How to make a mandala DXF</h2>
<ol class="steps">
<li><strong>Design it.</strong> Draw in the maker above, or start from a template. Straight shapes like spikes and diamonds cut cleanest.</li>
<li><strong>Pick a style.</strong> In Download, choose Cut-ready outlines, Stencil or Centerlines.</li>
<li><strong>Set size and thickness.</strong> Enter the finished width and a line thickness your material can hold.</li>
<li><strong>Download and check.</strong> The maker tells you how many separate pieces the design cuts into, so you can fix loose shapes before you cut.</li>
</ol>
<h2>Line thickness by machine</h2>
<table class="fmt">
<thead><tr><th>Machine and material</th><th>Starting line thickness</th></tr></thead>
<tbody>
<tr><td>Plasma, 16 to 14 gauge steel</td><td>0.08 to 0.125 in (2 to 3 mm) or more</td></tr>
<tr><td>Laser, 3 mm plywood or acrylic</td><td>0.06 to 0.08 in (1.5 to 2 mm)</td></tr>
<tr><td>CNC router</td><td>Wider than your bit diameter</td></tr>
</tbody>
</table>
<p>These are starting points. A common plasma rule of thumb is to keep lines and bridges at least as wide as the material is thick. Always test on scrap.</p>
<h2>Before you cut</h2>
<ul>
<li><strong>Kerf.</strong> Draw at finished size and let your CAM software apply the kerf offset.</li>
<li><strong>Loose pieces.</strong> Anything that doesn't touch another line drops out. Overlap shapes or add rings to tie them in.</li>
<li><strong>Heat.</strong> Dense designs on thin sheet can warp. Spread the cut order around the part.</li>
</ul>
<p>Read the full guide: <a href="/learn/how-to-laser-or-plasma-cut-a-mandala/">How to laser or plasma cut a mandala</a>.</p>`,
  },
  {
    path: '/coloring-page-maker/', tab: 'download', template: 'easy-mandala-for-kids',
    title: 'Mandala Coloring Page Maker: Make and Print Your Own, Free',
    h1: 'Mandala Coloring Page Maker',
    lede: 'Make your own mandala coloring page and print it at US Letter or A4. Simple for kids or intricate for adults, free with no signup.',
    description: 'Make your own mandala coloring pages online and print them as PDF at Letter or A4. Easy designs for kids or intricate ones for adults. Free, no signup.',
    faq: [
      ['How do I make a coloring page?', 'Design a mandala, open Download, keep "Coloring page" ticked, choose Letter or A4 and download the PDF. It prints with black lines on white, centered on the page.'],
      ['How do I make it easier or harder to color?', 'For kids, use 6 or 8 slices, a thick line weight and a few big shapes. For adults, use 16 or more slices, a thin line and the Intricate setting on Surprise me.'],
      ['Can I print copies for my class?', 'Yes. Print as many copies as you like for your classroom, group or family.'],
    ],
    content: `
<h2>Make a printable mandala in four steps</h2>
<ol class="steps">
<li><strong>Pick a look.</strong> Start from a template, press Surprise me, or draw your own.</li>
<li><strong>Set the detail.</strong> Fewer slices and thicker lines make it easier to color. More slices and thinner lines make it intricate.</li>
<li><strong>Download the PDF.</strong> Choose US Letter or A4 with Coloring page ticked.</li>
<li><strong>Print and color.</strong> Print at 100 percent scale on plain or heavier paper.</li>
</ol>
<h2>Printing tips</h2>
<ul>
<li>Heavier paper, around 28 lb or 100 gsm and up, takes markers without bleeding through.</li>
<li>For digital coloring apps, download a PNG instead.</li>
<li>Coloring with a group? Use the share link so everyone opens the same design.</li>
</ul>
<p>Or print one that's ready now from the <a href="/coloring-pages/">free mandala coloring pages</a>.</p>`,
  },
];
for (const p of exportPages) {
  const d = templateDesign(p.template);
  write(`img/og${p.path.replace(/\/$/, '')}.png`, png(socialCard(d, p.h1, 'Free. No signup. No watermark.'), 1200));
  page({
    path: p.path, title: p.title, description: p.description, maker: true,
    ogImage: `/img/og${p.path.replace(/\/$/, '')}.png`,
    crumbs: [['/', 'Home'], [p.path, p.h1]],
    schema: [faqSchema(p.faq)],
    body: `<div class="wrap hero"><h1>${esc(p.h1)}</h1><p class="lede">${esc(p.lede)}</p></div>
${maker({ template: p.template, tab: p.tab })}
<div class="wrap section narrow article">${p.content}
<h2>Questions</h2>${faqHTML(p.faq)}</div>`,
  });
}

// Templates
page({
  path: '/templates/', title: 'Free Mandala Templates to Edit, Print or Cut',
  description: 'Free mandala templates you can open in the maker, change ring by ring, and download as PNG, PDF coloring pages, SVG or DXF.',
  crumbs: [['/', 'Home'], ['/templates/', 'Templates']],
  sitemapImages: TEMPLATES.map(t => `${SITE}/img/templates/${t.slug}.svg`),
  body: `<div class="wrap hero"><h1>Mandala Templates</h1><p class="lede">Each template opens in the free maker, where you can change the symmetry, shapes and colors, then download it to print or cut.</p></div>
<div class="wrap section">${templateTiles()}</div>`,
});
for (const t of TEMPLATES) {
  const d = templateDesign(t.slug);
  page({
    path: `/templates/${t.slug}/`,
    title: `${t.name} Template: Free to Edit, Print and Cut`,
    description: `${t.blurb} Edit it free and download as PNG, PDF, SVG or DXF.`.slice(0, 300),
    maker: true,
    ogImage: `/img/og/${t.slug}.png`, ogImageAlt: `${t.name} template`,
    crumbs: [['/', 'Home'], ['/templates/', 'Templates'], [`/templates/${t.slug}/`, t.name]],
    sitemapImages: [`${SITE}/img/templates/${t.slug}.svg`],
    schema: [{
      '@context': 'https://schema.org', '@type': 'ImageObject', name: `${t.name} template`, description: t.blurb,
      contentUrl: `${SITE}/img/templates/${t.slug}.svg`, creator: ORG, isAccessibleForFree: true,
    }],
    body: `<div class="wrap hero"><h1>${esc(t.name)} Template</h1><p class="lede">${esc(t.blurb)}</p></div>
${maker({ template: t.slug })}
<div class="wrap section">
<div class="two-col">
<div>
<h2>How to use this template</h2>
<p>The ${esc(t.name.toLowerCase())} is loaded in the maker above with ${d.n}-fold symmetry. Open the Shapes tab to change any ring: move it closer to the center, make the shapes longer or wider, twist them, or fill them with color. Switch to Draw to add your own lines, which repeat around all ${d.n} slices.</p>
<p>When it looks right, open Download and save it as a PDF coloring page, a PNG, a cut-ready SVG for Cricut, or a DXF for a laser or plasma table.</p>
${t.more ? `<h2>About the ${esc(t.name.toLowerCase())}</h2>
${t.more}` : ''}
</div>
<div class="preview"><img src="/img/templates/${t.slug}.svg" alt="${esc(t.name)} line art" width="520" height="520" loading="lazy"></div>
</div>
<h2>More templates</h2>
${templateTiles(t.slug)}
</div>`,
  });
}

// Coloring pages
page({
  path: '/coloring-pages/', title: 'Free Printable Mandala Coloring Pages (PDF)',
  description: 'Free printable mandala coloring pages in Letter and A4 PDF, from easy designs for kids to intricate pages for adults. Open any page in the maker to change it.',
  crumbs: [['/', 'Home'], ['/coloring-pages/', 'Coloring pages']],
  ogImage: `/img/pins/${coloring[8].lv.key}-${coloring[8].slug}.png`,
  body: `<div class="wrap hero"><h1>Free Printable Mandala Coloring Pages</h1><p class="lede">Print any of these at US Letter or A4, or open it in the maker to change it first. Free for personal and classroom use.</p></div>
<div class="wrap section">${LEVELS.map(lv => `<h2><a href="/coloring-pages/${lv.key}/">${esc(lv.title)}</a></h2><p>${esc(lv.blurb)}</p>
<ul class="tiles">${coloring.filter(c => c.lv === lv).slice(0, 4).map(c => `<li><a href="/coloring-pages/${lv.key}/${c.slug}/"><img src="/img/coloring-pages/${lv.key}/${c.slug}.svg" alt="${esc(c.name)} coloring page" width="300" height="300" loading="lazy"><span>${esc(c.name)}</span></a></li>`).join('')}</ul>
<p><a href="/coloring-pages/${lv.key}/">See all ${lv.name.toLowerCase()} pages</a></p>`).join('')}
<div class="closing"><h2>Make your own coloring page</h2><p>Pick a level of detail, press Surprise me, and print it.</p><p><a class="btn" href="/coloring-page-maker/">Open the coloring page maker</a></p></div>
</div>`,
});
for (const lv of LEVELS) {
  const items = coloring.filter(c => c.lv === lv);
  page({
    path: `/coloring-pages/${lv.key}/`, title: `${lv.title}: Free Printable PDF`,
    description: `${lv.blurb} Free printable mandala coloring pages in Letter and A4 PDF.`,
    crumbs: [['/', 'Home'], ['/coloring-pages/', 'Coloring pages'], [`/coloring-pages/${lv.key}/`, lv.name]],
    ogImage: `/img/pins/${lv.key}-${items[0].slug}.png`,
    body: `<div class="wrap hero"><h1>${esc(lv.title)}</h1><p class="lede">${esc(lv.blurb)} Print at Letter or A4, or open one in the maker to change it.</p></div>
<div class="wrap section"><ul class="tiles">${items.map(c => `<li><a href="/coloring-pages/${lv.key}/${c.slug}/"><img src="/img/coloring-pages/${lv.key}/${c.slug}.svg" alt="${esc(c.name)} coloring page" width="300" height="300" loading="lazy"><span>${esc(c.name)}</span><small>${c.n}-fold symmetry</small></a></li>`).join('')}</ul>
<p>Other levels: ${LEVELS.filter(x => x !== lv).map(x => `<a href="/coloring-pages/${x.key}/">${esc(x.title)}</a>`).join(' · ')}</p></div>`,
  });
  items.forEach((c, i) => {
    const base = `/coloring-pages/${lv.key}/${c.slug}`;
    const others = items.filter(x => x !== c).slice(0, 4);
    page({
      path: base + '/',
      title: `${c.name} Coloring Page: Free Printable PDF`,
      description: `A free printable ${lv.key === 'medium' ? '' : lv.key + ' '}mandala coloring page with ${c.n}-fold symmetry. Download the PDF at Letter or A4, or edit it in the free mandala maker.`,
      crumbs: [['/', 'Home'], ['/coloring-pages/', 'Coloring pages'], [`/coloring-pages/${lv.key}/`, lv.name], [base + '/', c.name]],
      ogImage: `/img/pins/${lv.key}-${c.slug}.png`, ogImageAlt: `${c.name} coloring page`,
      sitemapImages: [`${SITE}/img${base}.svg`],
      schema: [{
        '@context': 'https://schema.org', '@type': 'ImageObject', name: `${c.name} coloring page`, contentUrl: `${SITE}/img${base}.svg`,
        description: `Printable mandala coloring page with ${c.n}-fold symmetry`, creator: ORG, isAccessibleForFree: true,
      }],
      body: `<div class="wrap hero"><h1>${esc(c.name)} Coloring Page</h1><p class="lede">A free printable mandala with ${c.n}-fold symmetry. ${esc(lv.blurb)}</p></div>
<div class="wrap section"><div class="two-col">
<div class="preview"><img src="/img${base}.svg" alt="${esc(c.name)} coloring page" width="520" height="520"></div>
<div>
<h2 style="margin-top:0">Download and print</h2>
<div class="cta-row"><a class="btn" href="/files${base}-letter.pdf" download>PDF, US Letter</a><a class="btn ghost" href="/files${base}-a4.pdf" download>PDF, A4</a></div>
<p>Print at 100 percent scale. Heavier paper takes markers without bleeding through.</p>
<h2>Change it first</h2>
<p>Open this mandala in the maker to change the symmetry, thicken the lines, remove rings or add your own drawing, then print your version.</p>
<p><a class="btn ghost" href="${editLink(c.d)}">Edit this mandala</a></p>
<p class="meta">Free for personal and classroom use.</p>
</div></div>
<h2>More ${esc(lv.name.toLowerCase())} mandalas</h2>
<ul class="tiles">${others.map(o => `<li><a href="/coloring-pages/${lv.key}/${o.slug}/"><img src="/img/coloring-pages/${lv.key}/${o.slug}.svg" alt="${esc(o.name)} coloring page" width="300" height="300" loading="lazy"><span>${esc(o.name)}</span></a></li>`).join('')}</ul>
</div>`,
    });
  });
}

// Learn
page({
  path: '/learn/', title: 'Learn About Mandalas: Meaning, Drawing and Cutting Guides',
  description: 'Guides to mandalas: what they mean, how to draw one step by step, how to cut one on a Cricut, and how to prepare a mandala for laser and plasma cutting.',
  crumbs: [['/', 'Home'], ['/learn/', 'Learn']],
  body: `<div class="wrap hero"><h1>Learn About Mandalas</h1><p class="lede">Where mandalas come from, how to draw one, and how to turn one into a cut piece on a Cricut, laser or plasma table.</p></div>
<div class="wrap section"><div class="grid-3">${ARTICLES.map(a => `<article class="card"><h3><a href="/learn/${a.slug}/">${esc(a.title)}</a></h3><p>${esc(a.description)}</p></article>`).join('')}</div></div>`,
});
const longDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
for (const a of ARTICLES) {
  const d = templateDesign(a.template);
  write(`img/og/learn-${a.slug}.png`, png(socialCard(d, a.short.replace(/\?$/, '?'), 'A guide from Super Mandala Lab'), 1200));
  page({
    path: `/learn/${a.slug}/`, title: a.title, description: a.description, ogType: 'article',
    ogImage: `/img/og/learn-${a.slug}.png`,
    crumbs: [['/', 'Home'], ['/learn/', 'Learn'], [`/learn/${a.slug}/`, a.short]],
    schema: [{
      '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.description,
      datePublished: a.date || TODAY, dateModified: a.updated || a.date || TODAY, author: { '@type': 'Organization', name: BRAND, url: SITE + '/' }, publisher: ORG,
      image: `${SITE}/img/og/learn-${a.slug}.png`, mainEntityOfPage: `${SITE}/learn/${a.slug}/`,
    }],
    body: `<article class="narrow article"><header class="hero"><h1>${esc(a.title)}</h1><p class="meta">By ${BRAND} · <time datetime="${a.date || TODAY}">${longDate(a.date || TODAY)}</time></p></header>
${a.body}
<div class="closing"><h2>Make a mandala now</h2><p>Free, no signup, and ready to print or cut.</p><p><a class="btn" href="/templates/${a.template}/">Open the ${esc(TEMPLATES.find(t => t.slug === a.template).name.toLowerCase())}</a></p></div>
</article>`,
  });
}

// About and privacy
page({
  path: '/about/', title: 'About Super Mandala Lab',
  description: 'Super Mandala Lab is a free mandala maker from SuperFabLab, a metal fabrication studio in Reno, Nevada.',
  crumbs: [['/', 'Home'], ['/about/', 'About']],
  body: `<div class="narrow article"><div class="hero"><h1>About Super Mandala Lab</h1></div>
<p>Super Mandala Lab is a free mandala maker. You can draw a mandala, print it as a coloring page, or download a cut file for a Cricut, laser cutter or plasma table, without making an account or paying for exports.</p>
<p>It's made by <a href="https://superfablab.com">SuperFabLab</a>, a metal fabrication studio in Reno, Nevada that cuts decorative panels and lanterns from steel. Most free mandala tools stop at a picture. We wanted one that also makes files a machine can cut: real closed shapes, at real sizes, with a warning before a design falls apart into loose pieces.</p>
<h2>Free, and staying free</h2>
<p>Every format is free to download, with no watermark. Your designs are yours to use, including on things you sell.</p>
<h2>Get in touch</h2>
<p>Ideas, bugs or something you made with the maker? We'd love to hear about it through <a href="https://superfablab.com">SuperFabLab</a>.</p>
</div>`,
});
page({
  path: '/privacy/', title: 'Privacy at Super Mandala Lab',
  description: 'Super Mandala Lab needs no account and keeps your designs in your own browser.',
  crumbs: [['/', 'Home'], ['/privacy/', 'Privacy']],
  body: `<div class="narrow article"><div class="hero"><h1>Privacy</h1><p class="meta">Updated October 28, 2026</p></div>
<p>The mandala maker runs in your browser. There's no account, and your designs are never uploaded to us.</p>
<ul>
<li><strong>Your designs.</strong> Your current design is saved in your browser's local storage so it's there when you come back. Clearing your browser data removes it.</li>
<li><strong>Share links.</strong> A share link holds the design itself inside the link. Anyone you send it to can open the design.</li>
<li><strong>Analytics.</strong> We use Cloudflare Web Analytics to count visits. It doesn't use cookies or track you across sites.</li>
<li><strong>Hosting.</strong> The site is served by Cloudflare, which processes basic request data such as IP addresses to deliver and protect the site.</li>
</ul>
</div>`,
});

// 404
page({
  path: '/404.html', title: 'Page not found | Super Mandala Lab', description: 'This page could not be found.', noindex: true,
  body: `<div class="narrow article"><div class="hero"><h1>That page isn't here</h1><p class="lede">It may have moved. You can still make a mandala.</p></div><p><a class="btn" href="/">Open the mandala maker</a> <a class="btn ghost" href="/coloring-pages/">Coloring pages</a></p></div>`,
});

// ---------- crawl files ----------
const smap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${SITEMAP.map(u => `<url><loc>${u.loc}</loc><lastmod>${TODAY}</lastmod>${u.img.map(i => `<image:image><image:loc>${i}</image:loc></image:image>`).join('')}</url>`).join('\n')}
</urlset>
`;
write('sitemap.xml', smap);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
write('google114b1fb682c7dd8a.html', 'google-site-verification: google114b1fb682c7dd8a.html');
write('site.webmanifest', JSON.stringify({
  name: BRAND, short_name: 'Mandala Lab', start_url: '/', display: 'standalone', background_color: '#fbf8f3', theme_color: '#fbf8f3',
  icons: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
}));
write('llms.txt', `# ${BRAND}

> A free online mandala maker at ${SITE}. Draw with radial symmetry (4 to 36 slices, optional mirroring), add rings of shapes, and download PNG, PDF coloring pages, cut-ready SVG for Cricut and Silhouette, and DXF for laser, CNC and plasma cutting. No signup, no watermark, free to use for products you sell.

## Tools
- [Mandala maker](${SITE}/): draw or build a mandala and export it
- [Mandala SVG for Cricut](${SITE}/svg-for-cricut/)
- [Mandala DXF for laser and plasma](${SITE}/dxf-for-laser-and-plasma/)
- [Mandala coloring page maker](${SITE}/coloring-page-maker/)

## Free designs
- [Mandala templates](${SITE}/templates/)
- [Printable mandala coloring pages](${SITE}/coloring-pages/)

## Guides
${ARTICLES.map(a => `- [${a.title}](${SITE}/learn/${a.slug}/)`).join('\n')}
`);
write('_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/js/*
  Cache-Control: public, max-age=31536000, immutable

/css/*
  Cache-Control: public, max-age=31536000, immutable

/img/*
  Cache-Control: public, max-age=604800

/files/*
  Cache-Control: public, max-age=604800
`);

// Shrink PNGs to palette images (line art needs few colors).
try {
  const { execFileSync } = await import('child_process');
  execFileSync('python3', [path.join(here, 'optimize_png.py'), DIST], { stdio: 'inherit' });
} catch (e) { console.warn('PNG optimize skipped:', e.message); }
// Size report
let total = 0, count = 0; // counted after optimizing
const walk = dir => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p); else { total += fs.statSync(p).size; count++; } } };
walk(DIST);
console.log(`Built ${count} files, ${(total / 1024 / 1024).toFixed(2)} MB, ${SITEMAP.length} pages in sitemap`);
