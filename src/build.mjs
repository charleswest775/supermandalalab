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
  emptyDesign, normalizeDesign, ringLayer, cutOutlines, cutSVG, toDXF, boundsOf, countPieces, stickerSVG, hasOpenCenter, openingSizes,
} from './js/core.js';
import { FAQ, ARTICLES } from './content.mjs';
import { lastmodDates } from './lastmod.mjs';
import { checkSite, printReport } from './seo-check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const DIST = path.join(ROOT, 'dist');
// Dependencies come from ./node_modules when present, otherwise from a deps folder given as the argument.
const deps = process.argv[2] ? path.resolve(process.argv[2])
  : fs.existsSync(path.join(ROOT, 'node_modules')) ? ROOT : '/home/user/sml-deps';
const require = createRequire(path.join(deps, 'package.json'));
const esbuild = require('esbuild');
const { Resvg } = require('@resvg/resvg-js');
const ClipperLib = require('clipper-lib');

const SITE = 'https://supermandalalab.com';
const BRAND = 'Super Mandala Lab';
const TODAY = new Date().toISOString().slice(0, 10);

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const write = (rel, data, trim = true) => {
  const file = path.join(DIST, rel);
  // Trim coordinates in static SVG files; a tenth of a unit is invisible at any print size.
  if (trim && rel.endsWith('.svg') && typeof data === 'string') data = data.replace(/(\d+\.\d)\d+/g, '$1');
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
function editLink(d, at = '/') {
  const raw = zlib.deflateRawSync(Buffer.from(JSON.stringify(compactDesign(d))));
  return at + '#d=z' + raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------- layout ----------
// What people come to make. Each goal page opens the maker with only that goal's starting designs,
// controls and files. The home page, the templates and sacred geometry keep the full maker.
const GOALS = [
  { key: 'coloring', name: 'Coloring page', nav: 'Coloring pages', path: '/coloring-page-maker/', blurb: 'Print a PDF at Letter or A4', img: '/img/templates/easy-mandala-for-kids.svg' },
  { key: 'kind', name: 'Kind message', nav: 'Kind messages', path: '/kindness-mandala/', blurb: 'Text or post one to someone', img: '/img/kind/heart-frame-mandala.svg' },
  { key: 'sticker', name: 'Sticker', nav: 'Stickers', path: '/mandala-stickers/', blurb: 'Die-cut sticker SVG or PNG', img: '/img/stickers/flower-of-life-mandala.svg' },
  { key: 'words', name: 'Words in the center', nav: 'Words', path: '/mandala-frames/', blurb: 'Wall tags, signs and cards', img: '/img/templates/petal-frame-mandala.svg' },
  { key: 'cut', name: 'Cut file', nav: 'Cut files', path: '/svg-for-cricut/', blurb: 'Cricut, laser or plasma', img: '/img/templates/mystic-rose-mandala.svg' },
];
const NAV = [...GOALS.map(g => [g.path, g.nav]), ['/templates/', 'Free designs'], ['/learn/', 'Learn']];
// The nav item a page sits under.
const navFor = p => p === '/dxf-for-laser-and-plasma/' ? '/svg-for-cricut/'
  : /^\/(templates|coloring-pages|sacred-geometry)\//.test(p) ? '/templates/'
  : p.startsWith('/learn/') ? '/learn/' : p;

const SITEMAP = [];

function page(o) {
  const url = SITE + o.path;
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
<nav class="nav" aria-label="Main">${NAV.map(([href, label]) => `<a href="${href}"${href === navFor(o.path) ? ` aria-current="${href === o.path ? 'page' : 'true'}"` : ''}>${label}</a>`).join('')}</nav>
</div></header>
<main id="main">
${o.wide ? '' : ''}<div class="wrap">${crumbs}</div>
${o.body}
</main>
<footer class="site-foot"><div class="wrap">
<div class="cols">
<div><h4>${BRAND}</h4><p>A free mandala maker. Draw, print and cut your own mandalas, with no signup and no watermark.</p></div>
<div><h4>Make</h4><ul><li><a href="/coloring-page-maker/">Coloring page maker</a></li><li><a href="/kindness-mandala/">Kind message mandalas</a></li><li><a href="/mandala-stickers/">Mandala sticker maker</a></li><li><a href="/mandala-frames/">Mandala frames for words</a></li><li><a href="/svg-for-cricut/">Mandala SVG for Cricut</a></li><li><a href="/dxf-for-laser-and-plasma/">Mandala DXF for laser and plasma</a></li><li><a href="/">The full mandala maker</a></li></ul></div>
<div><h4>Free designs</h4><ul><li><a href="/templates/">Mandala templates</a></li><li><a href="/sacred-geometry/">Sacred geometry</a></li><li><a href="/coloring-pages/sacred-geometry/">Sacred geometry coloring pages</a></li><li><a href="/coloring-pages/">Mandala coloring pages</a></li><li><a href="/coloring-pages/easy/">Easy coloring pages</a></li><li><a href="/coloring-pages/intricate/">Intricate coloring pages</a></li></ul></div>
<div><h4>Learn</h4><ul>${ARTICLES.map(a => `<li><a href="/learn/${a.slug}/">${esc(a.short)}</a></li>`).join('')}<li><a href="/about/">About</a></li><li><a href="/license/">License</a></li><li><a href="/privacy/">Privacy</a></li></ul></div>
</div>
<p class="fine">Made in Reno, Nevada by <a href="https://superfablab.com">SuperFabLab</a>, a metal fabrication studio. © 2026 ${BRAND}.</p>
</div></footer>
</body>
</html>
`;
  if (!o.noindex) SITEMAP.push({ path: o.path, img: o.sitemapImages || [], html });
  write(o.path === '/' ? 'index.html' : o.path.replace(/^\//, '') + (o.path.endsWith('/') ? 'index.html' : ''), html);
}

// ---------- the maker block ----------
// The maker's controls by name, so the full maker and each goal can lay out only the ones they need.
// app.js finds them by id and skips any a page leaves out.
const row = (label, input, out = '') => `<label class="mk-row"><span>${label}</span>${input}${out}</label>`;
// Kind messages to tap, with | between the two lines. Two short lines read biggest in the middle.
const KIND_MESSAGES = ['You are|loved', 'Thinking|of you', 'Thank|you', 'Proud|of you', 'You\'ve|got this', 'You|matter',
  'Sending|love', 'Get well|soon', 'Happy|birthday', 'Miss|you', 'You are|enough', 'Breathe'];
const CTRL = {
  n: row('Symmetry', '<select id="mk-n"></select>'),
  mirror: '<label class="mk-check"><input type="checkbox" id="mk-mirror" checked> Mirror inside each slice</label>',
  w: row('Line weight', '<input type="range" id="mk-w" min="0.5" max="20" step="0.5" value="3">', '<output id="mk-w-out">3.0</output>'),
  ink: row('Line color', '<input type="color" id="mk-ink" value="#24203f">'),
  bg: row('Background', '<input type="color" id="mk-bgc" value="#ffffff">'),
  guides: '<label class="mk-check"><input type="checkbox" id="mk-guides-on" checked> Show slice guides</label>',
  open: row('Opening', '<input type="range" id="mk-open" min="0" max="340" step="2" value="0">', '<output id="mk-open-out">Off</output>'),
  words: `<label class="mk-row mk-text-row"><span>Words</span><input type="text" id="mk-text1" maxlength="30" placeholder="A name or a word" autocomplete="off"></label>
<label class="mk-row mk-text-row"><span>Second line</span><input type="text" id="mk-text2" maxlength="30" placeholder="Optional, like a date" autocomplete="off"></label>
<label class="mk-row mk-text-row"><span>Lettering</span><select id="mk-font"><option value="serif">Serif</option><option value="sans">Sans serif</option></select></label>`,
  wordsFiles: '<label class="mk-check"><input type="checkbox" id="mk-words-files" checked> Put the words in downloads</label>',
  openNote: '<p id="mk-open-note" class="mk-note">Slide to leave the middle empty for a name, a word or a date.</p>',
  look: '<label class="mk-row" style="grid-template-columns:auto 1fr"><span>Look</span><select id="mk-st-look"><option value="mine">My colors</option><option value="night">Night glow (gold on dark)</option></select></label>',
  msgs: `<div class="mk-msgs" role="group" aria-label="Kind messages">${KIND_MESSAGES.map(m => `<button type="button" data-msg="${esc(m)}">${esc(m.replace('|', ' '))}</button>`).join('')}</div>`,
};
const levelSelect = frame => `<select id="mk-level" aria-label="Detail level"><option value="easy">Simple</option><option value="medium" selected>Medium</option><option value="intricate">Intricate</option><option value="sacred">Sacred geometry</option>${frame ? '<option value="frame">Open center for words</option>' : ''}</select>`;
const DL = {
  pdf: `<div class="mk-dl"><h3>PDF <small>coloring pages and prints</small></h3>
      <div class="mk-inline"><select id="mk-pdf-page" aria-label="Paper size"><option value="letter">US Letter</option><option value="a4">A4</option></select><button type="button" id="mk-dl-pdf" class="mk-primary">Download PDF</button></div>
      <label class="mk-check"><input type="checkbox" id="mk-pdf-coloring" checked> Coloring page (black lines, no fills)</label>
    </div>`,
  png: `<div class="mk-dl"><h3>PNG <small>sharing and digital coloring</small></h3>
      <div class="mk-inline"><select id="mk-png-size" aria-label="Image size"><option value="1000">1000 px</option><option value="2000" selected>2000 px</option><option value="4000">4000 px</option></select><button type="button" id="mk-dl-png" class="mk-primary">Download PNG</button></div>
      <label class="mk-check"><input type="checkbox" id="mk-png-clear"> Transparent background</label>
    </div>`,
  svg: (machine = '') => `<div class="mk-dl"${machine ? ` data-machine="${machine}"` : ''}><h3>SVG <small>Cricut, Silhouette, Illustrator</small></h3>
      <select id="mk-svg-style" aria-label="SVG style"><option value="cut">Cut-ready shapes (Cricut)</option><option value="stencil">Stencil: design cut from a disc</option><option value="lines">Line drawing (editable strokes)</option></select>
      <div class="mk-inline" data-cut-for="mk-svg" data-cut-only="1"><label class="mk-row" style="grid-template-columns:auto 1fr"><span>Width</span><input type="number" id="mk-svg-size" value="12" min="0.5" step="0.5"></label><select id="mk-svg-unit" aria-label="Units"><option value="in">in</option><option value="mm">mm</option></select></div>
      <label class="mk-row" data-cut-for="mk-svg" data-cut-only="1" style="grid-template-columns:auto 1fr"><span>Line thickness</span><input type="number" id="mk-svg-thick" value="0.08" min="0.001" step="0.01"></label>
      <label class="mk-check" data-cut-for="mk-svg" data-lines-only="1"><input type="checkbox" id="mk-svg-clear" checked> Transparent background</label>
      <button type="button" id="mk-dl-svg" class="mk-primary">Download SVG</button>
    </div>`,
  dxf: (machine = '') => `<div class="mk-dl"${machine ? ` data-machine="${machine}"` : ''}><h3>DXF <small>laser, CNC and plasma</small></h3>
      <select id="mk-dxf-style" aria-label="DXF style"><option value="cut">Cut-ready outlines</option><option value="stencil">Stencil: design cut from a disc</option><option value="lines">Centerlines (engrave or score)</option></select>
      <div class="mk-inline" data-cut-for="mk-dxf"><label class="mk-row" style="grid-template-columns:auto 1fr"><span>Width</span><input type="number" id="mk-dxf-size" value="12" min="0.5" step="0.5"></label><select id="mk-dxf-unit" aria-label="Units"><option value="in">in</option><option value="mm">mm</option></select></div>
      <label class="mk-row" data-cut-for="mk-dxf" data-cut-only="1" style="grid-template-columns:auto 1fr"><span>Line thickness</span><input type="number" id="mk-dxf-thick" value="0.08" min="0.001" step="0.01"></label>
      <button type="button" id="mk-dl-dxf" class="mk-primary">Download DXF</button>
    </div>`,
  sticker: look => `<div class="mk-dl"><h3>Sticker <small>die-cut, print then cut</small></h3>
      <div class="mk-inline"><label class="mk-row" style="grid-template-columns:auto 1fr"><span>Size</span><input type="number" id="mk-st-size" value="3" min="0.5" step="0.25"></label><select id="mk-st-unit" aria-label="Sticker units"><option value="in">in</option><option value="mm">mm</option></select></div>
      ${look ? CTRL.look : ''}
      <label class="mk-row" style="grid-template-columns:auto 1fr"><span>White border</span><input type="number" id="mk-st-border" value="0.1" min="0" step="0.05"></label>
      <label class="mk-check"><input type="checkbox" id="mk-st-plain"> Disc only, with no border or cut line</label>
      <div class="mk-inline"><button type="button" id="mk-dl-st-svg" class="mk-primary">Sticker SVG</button><button type="button" id="mk-dl-st-png">Sticker PNG</button></div>
      <p class="mk-hint" style="margin:0">The SVG has bleed and a cut line on its own CutContour layer. The PNG is 300 dpi and transparent outside the border, for sticker printers.</p>
    </div>`,
  // app.js fills in the links, which carry the design.
  share: `<div class="mk-dl" id="mk-share-box"><h3>Share <small>text it, post it, send it</small></h3>
      <button type="button" id="mk-share" class="mk-primary">Share the picture and link</button>
      <div class="mk-share-links"><a data-share="sms">Text</a><a data-share="whatsapp" target="_blank" rel="noopener">WhatsApp</a><a data-share="facebook" target="_blank" rel="noopener">Facebook</a><a data-share="x" target="_blank" rel="noopener">X</a><a data-share="email">Email</a><button type="button" id="mk-copy">Copy link</button></div>
      <div class="mk-inline"><select id="mk-card-size" aria-label="Picture shape"><option value="square">Square, for posts and texts</option><option value="story">Story, for Instagram and WhatsApp</option></select><button type="button" id="mk-dl-card">Save picture</button></div>
      <label class="mk-check"><input type="checkbox" id="mk-card-credit" checked> Add supermandalalab.com under it</label>
      <p class="mk-hint" style="margin:0">The link opens your mandala on any phone or computer, ready to save or print and color. The design and words travel inside the link, so Super Mandala Lab never stores them.</p>
      <p class="mk-hint mk-kind-nudge" style="margin:0">Or <a id="mk-kind-link" href="/kindness-mandala/">put a kind message in the middle</a> and send it to someone.</p>
    </div>`,
};
const SHAPES_PANEL = `<div class="mk-inline"><select id="mk-add-shape" aria-label="Shape to add"></select><button type="button" id="mk-add" class="mk-primary">Add</button></div>
    <p class="mk-hint">Each ring repeats a shape around the circle. Sacred geometry figures, like the Flower of Life and Metatron's Cube, sit at the center. Tap a layer to change its size, distance, twist and fill.</p>
    <ul class="mk-layers" id="mk-layers"></ul>`;

// Every control on one page, in tabs: the home page, the templates and sacred geometry.
const fullPanel = () => `<div class="mk-panel">
  <div class="mk-tabs" role="tablist">
    <button type="button" role="tab" data-tab="design" aria-selected="true">Design</button>
    <button type="button" role="tab" data-tab="shapes" aria-selected="false">Shapes (<span id="mk-layer-count">0</span>)</button>
    <button type="button" role="tab" data-tab="download" aria-selected="false">Download</button>
  </div>
  <div class="mk-tab-body" data-panel="design">
    ${CTRL.n}${CTRL.mirror}${CTRL.w}${CTRL.ink}${CTRL.bg}${CTRL.guides}
    <div class="mk-group">
      <h3>Open center for words</h3>
      ${CTRL.open}${CTRL.words}${CTRL.wordsFiles}${CTRL.openNote}
    </div>
    <div class="mk-group">
      <h3>Start from something</h3>
      <select id="mk-template" aria-label="Templates"></select>
      <div class="mk-inline">${levelSelect(true)}<button type="button" id="mk-random">Surprise me</button></div>
      <p>Templates and Surprise me replace the current design. Undo brings it back.</p>
    </div>
  </div>
  <div class="mk-tab-body" data-panel="shapes" hidden>
    ${SHAPES_PANEL}
  </div>
  <div class="mk-tab-body" data-panel="download" hidden>
    ${DL.pdf}${DL.png}${DL.svg()}${DL.dxf()}${DL.sticker(true)}${DL.share}
  </div>
</div>`;

// One goal: three steps from top to bottom, with every other format one click away.
const goalPanel = (key, machine) => {
  const g = GOAL_UI[key];
  return `<div class="mk-panel">
  <div class="mk-goal-head"><label for="mk-goal">Making</label><select id="mk-goal">${GOALS.map(x => `<option value="${x.path}"${x.key === key ? ' selected' : ''}>${x.name}</option>`).join('')}<option value="/">Anything: the full maker</option></select></div>
  <div class="mk-tab-body" data-panel="steps">
    <section class="mk-step"><h3><span>1</span> Start from</h3>
      <div class="mk-starters">${g.starters.join('')}</div>
      <div class="mk-inline">${g.level ? levelSelect(false) : ''}<button type="button" id="mk-random">Surprise me</button></div>
      ${g.after || ''}
    </section>
    <section class="mk-step"><h3><span>2</span> Make it yours</h3>
      ${g.make}
    </section>
    <section class="mk-step" id="mk-file"><h3><span>3</span> ${g.title}</h3>
      ${typeof g.file === 'function' ? g.file(machine) : g.file}
      <details class="mk-more"><summary>Other formats</summary>${g.more}${g.file === DL.share ? '' : DL.share}</details>
    </section>
  </div>
  <div class="mk-tab-body" data-panel="shapes" hidden>
    <button type="button" id="mk-back" class="mk-back">‹ Back to the steps</button>
    ${SHAPES_PANEL}
  </div>
</div>`;
};

// o.goal picks a goal panel (coloring, sticker, words or cut); without one, the full maker.
function maker(o = {}) {
  const attrs = { template: o.template, text: o.text, 'focus-tab': o.tab, goal: o.goal, machine: o.goal === 'cut' ? (o.machine || 'cricut') : '',
    surprise: o.goal && GOAL_UI[o.goal].surprise, 'svg-style': o.goal && GOAL_UI[o.goal].svgStyle };
  return `<section id="maker" class="maker wrap" data-mode="draw" data-clipper="${CLIPPER_URL}"${Object.entries(attrs).map(([k, v]) => v ? ` data-${k}="${v}"` : '').join('')} aria-label="Mandala maker">
<div class="mk-stage">
  <div class="mk-toolbar" role="toolbar" aria-label="Maker tools">
    <button type="button" data-mode-btn="draw" aria-pressed="true">Draw</button>
    <button type="button" data-mode-btn="shapes" aria-pressed="false">Shapes</button>
    <span class="sep"></span>
    <button type="button" id="mk-undo" disabled title="Undo (Ctrl+Z)">Undo</button>
    <button type="button" id="mk-redo" disabled title="Redo (Ctrl+Shift+Z)">Redo</button>
    <button type="button" id="mk-clear">Clear</button>
    <span class="grow"></span>
    <button type="button" class="mk-primary" data-tab="download">${o.goal === 'kind' ? 'Send' : 'Download'}</button>
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
  ${o.goal === 'sticker' || o.goal === 'cut' ? `<div class="mk-status" id="mk-status" role="status" hidden>${o.goal === 'sticker' ? '<img id="mk-status-img" alt="Your sticker as it will print" width="64" height="64">' : ''}<span id="mk-status-text"></span></div>` : ''}
  <p class="mk-tip">Tip: draw with a mouse, finger or stylus. Use Shapes to add rings of petals, dots and scallops, and Surprise me for a fresh design.</p>
</div>
${o.goal ? goalPanel(o.goal, o.machine) : fullPanel()}
<div class="mk-toast" id="mk-toast" role="status" aria-live="polite"></div>
</section>`;
}

// ---------- shared bits ----------
const ORG = {
  '@context': 'https://schema.org', '@type': 'Organization', name: BRAND, url: SITE + '/', logo: SITE + '/icon-512.png',
  parentOrganization: { '@type': 'Organization', name: 'SuperFabLab', url: 'https://superfablab.com' },
};
// Everything on the site is free to use, including on things people sell: see /license/.
const IMAGE_RIGHTS = { license: SITE + '/license/', acquireLicensePage: SITE + '/license/', creditText: BRAND, copyrightNotice: `© 2026 ${BRAND}` };
// The first wording of a title or description that fits, or the last one if none does.
const fitText = (max, ...options) => options.find(s => s.length <= max) ?? options[options.length - 1];
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

const FRAME_TEMPLATES = TEMPLATES.filter(hasOpenCenter);
const SACRED_TEMPLATES = TEMPLATES.filter(t => t.sacred && !hasOpenCenter(t));
const MANDALA_TEMPLATES = TEMPLATES.filter(t => !t.sacred && !hasOpenCenter(t));
const templateTiles = (exclude, list = TEMPLATES) => `<ul class="tiles">${list.filter(t => t.slug !== exclude).map(t => `<li><a href="/templates/${t.slug}/"><img src="/img/templates/${t.slug}.svg" alt="${esc(t.name)} preview" width="300" height="300" loading="lazy"><span>${esc(t.name)}</span></a></li>`).join('')}</ul>`;

// Sticker previews, and for designs without words a sticker ready to print and cut: 3 in across the
// cut, with bleed and a CutContour line.
const STICKER_TEMPLATES = TEMPLATES.filter(t => t.sticker && !hasOpenCenter(t));
const WORD_STICKERS = TEMPLATES.filter(t => t.sticker && hasOpenCenter(t));
for (const t of [...STICKER_TEMPLATES, ...WORD_STICKERS]) {
  const d = templateDesign(t.slug);
  const paths = lean(d);
  // Untrimmed: a sticker is sized in millimeters, so its scale and its hairline cut are below a tenth.
  write(`img/stickers/${t.slug}.svg`, stickerSVG(d, { look: t.sticker, paths, bleedMM: 0, cutline: false, px: 300 }), false);
  if (!d.open) write(`files/stickers/${t.slug}-sticker.svg`, stickerSVG(d, { look: t.sticker, paths }), false);
}
const stickerTiles = list => `<ul class="tiles stickers">${list.map(t => `<li><a href="/templates/${t.slug}/"><img src="/img/stickers/${t.slug}.svg" alt="${esc(t.name)} as a round sticker" width="300" height="300" loading="lazy"><span>${esc(t.name)}</span></a></li>`).join('')}</ul>`;

// How many pieces a design cuts into at 12 inches wide with 0.08 inch lines, the same math as the maker.
function cutPieces(d) {
  const b = boundsOf(buildPaths(d).map(p => ({ ...p, w: 0 })));
  const weight = (0.08 * Math.max(b.x1 - b.x0, b.y1 - b.y0)) / (12 - 0.08);
  return countPieces(cutOutlines(buildPaths(d), ClipperLib, { weight, margin: weight * 4 }));
}
// Cut files start from the templates that come apart into the fewest pieces.
const CUT_STARTERS = MANDALA_TEMPLATES.concat(SACRED_TEMPLATES).map(t => ({ t, pieces: cutPieces(templateDesign(t.slug)) }))
  .sort((a, b) => a.pieces - b.pieces).slice(0, 8);
console.log('Cut starters:', CUT_STARTERS.map(c => `${c.t.slug} ${c.pieces}`).join(', '));

// A starting design in a goal panel: loads in place, replacing the design (Undo brings it back).
// words: its own words, with | between the lines.
const startTile = (slug, img, note = '', words = '') => {
  const t = TEMPLATES.find(x => x.slug === slug);
  const name = words ? `${words.replace('|', ' ')} in the ${t.name}` : t.name;
  return `<button type="button" class="mk-start" data-start="${slug}"${words ? ` data-words="${esc(words)}"` : ''}${t.sticker ? ` data-look="${t.sticker}"` : ''} aria-label="${esc(name)}${note ? `, ${note}` : ''}" title="${esc(name)}"><img src="${img}" alt="" width="72" height="72" loading="lazy">${note ? `<small>${note}</small>` : ''}</button>`;
};
// Kind messages, each in a frame: the kind message page's starting designs, and its examples.
const KIND = [['heart-frame-mandala', 'You are|loved'], ['petal-frame-mandala', 'Thinking|of you'], ['laurel-wreath-mandala', 'Thank|you'],
  ['sunburst-frame-mandala', 'You\'ve|got this'], ['lotus-frame-mandala', 'Breathe'], ['dot-frame-mandala', 'You|matter'],
  ['arch-frame-mandala', 'Happy|birthday'], ['star-frame-mandala', 'Proud|of you']]
  .map(([slug, words]) => ({ slug, words, d: { ...templateDesign(slug), text: words.replace('|', '\n') } }));
for (const k of KIND) write(`img/kind/${k.slug}.svg`, designSVG(k.d, { title: `${k.words.replace('|', ' ')}: a kind message mandala`, paths: lean(k.d) }));
const kindTiles = list => `<ul class="tiles">${list.map(k => `<li><a href="${editLink(k.d, '/kindness-mandala/')}"><img src="/img/kind/${k.slug}.svg" alt="A mandala with the words ${esc(k.words.replace('|', ' '))} in the middle" width="300" height="300" loading="lazy"><span>${esc(k.words.replace('|', ' '))}</span></a></li>`).join('')}</ul>`;
const GOAL_UI = {
  coloring: {
    starters: ['easy-mandala-for-kids', 'simple-mandala', 'leaf-mandala', 'lotus-mandala', 'snowflake-mandala', 'flower-of-life-mandala', 'mystic-rose-mandala', 'intricate-mandala']
      .map(s => startTile(s, `/img/templates/${s}.svg`)),
    level: true,
    after: '<p class="mk-note">Or print one that\'s ready now from the <a href="/coloring-pages/">free coloring pages</a>.</p>',
    make: `${CTRL.n}${CTRL.w}<p class="mk-note">Fewer slices and thicker lines are easier to color. Draw on the circle to add your own lines.</p>`,
    title: 'Get your coloring page',
    file: DL.pdf,
    more: DL.png + DL.svg() + DL.dxf() + DL.sticker(true),
  },
  sticker: {
    starters: ['flower-of-life-mandala', 'lotus-mandala', 'snowflake-mandala', 'mystic-rose-mandala', 'flower-mandala', 'dot-mandala', 'boho-mandala', 'name-mandala']
      .map(s => startTile(s, `/img/stickers/${s}.svg`)),
    surprise: 'medium,sacred',
    make: `${CTRL.look}${CTRL.ink}${CTRL.bg}${CTRL.w}<div class="mk-if-words">${CTRL.words}${CTRL.open}${CTRL.openNote}${CTRL.wordsFiles}</div>`,
    title: 'Get your sticker',
    file: DL.sticker(false),
    more: DL.pdf + DL.png + DL.svg() + DL.dxf(),
  },
  kind: {
    starters: KIND.map(k => startTile(k.slug, `/img/kind/${k.slug}.svg`, '', k.words)),
    surprise: 'frame',
    after: '<p class="mk-note">Surprise me makes a new frame and keeps your message.</p>',
    make: `${CTRL.msgs}<p class="mk-note">Tap a message, or type your own. Two short lines read best on a phone.</p>${CTRL.words}${CTRL.ink}${CTRL.bg}${CTRL.open}`,
    title: 'Send it',
    file: DL.share,
    more: DL.png + DL.pdf + DL.sticker(true) + DL.svg() + DL.dxf(),
  },
  words: {
    starters: FRAME_TEMPLATES.slice(0, 8).map(t => startTile(t.slug, `/img/templates/${t.slug}.svg`)),
    surprise: 'frame',
    svgStyle: 'lines',
    after: '<p class="mk-note">A new frame keeps the words you typed.</p>',
    make: `${CTRL.words}${CTRL.open}${CTRL.openNote}${CTRL.ink}${CTRL.w}`,
    title: 'Get your design',
    file: `${CTRL.wordsFiles}<p class="mk-note">Untick it to letter the words yourself: the files keep the center empty.</p>${DL.png}${DL.svg()}`,
    more: DL.pdf + DL.dxf() + DL.sticker(true),
  },
  cut: {
    starters: CUT_STARTERS.map(({ t, pieces }) => startTile(t.slug, `/img/templates/${t.slug}.svg`, pieces === 1 ? '1 piece' : `${pieces} pieces`)),
    surprise: 'easy,sacred',
    after: '<p class="mk-note">Pieces counted at 12 in with 0.08 in lines.</p>',
    make: `${CTRL.n}<p class="mk-note">Shapes that don't touch another line cut out loose. Overlap them, or use Shapes to add a ring that ties them together. The count under the design updates as you go.</p>`,
    title: 'Get your cut file',
    file: machine => `<div class="mk-machine" role="radiogroup" aria-label="Machine">
      <label><input type="radio" name="mk-machine" value="cricut"${machine !== 'laser' ? ' checked' : ''}> Cricut or Silhouette</label>
      <label><input type="radio" name="mk-machine" value="laser"${machine === 'laser' ? ' checked' : ''}> Laser, CNC or plasma</label>
    </div>${DL.svg('cricut')}${DL.dxf('laser')}`,
    more: DL.pdf + DL.png + DL.sticker(true),
  },
};

// ---------- coloring pages ----------
// about and tips describe what randomDesign makes at each level: keep them true if it changes.
const LEVELS = [
  { key: 'easy', name: 'Easy', title: 'Easy Mandala Coloring Pages', blurb: 'Big shapes and thick lines for kids, beginners and relaxed coloring.', seeds: [11, 23, 37, 41, 59, 61, 79, 83],
    about: 'Easy pages have a few rings of big, simple shapes drawn with thick lines, so every space is roomy enough for crayons and chunky markers. They suit young kids, beginners and anyone who wants a short, relaxing page.',
    tips: ['Crayons and washable markers both work. Print on heavier paper if you use markers.', 'Pick two or three colors and repeat them ring by ring for a bold, tidy look.', 'Coloring with a group? Print a few different pages, or open one in the maker and press Surprise me for a new design each.'] },
  { key: 'medium', name: 'Medium', title: 'Mandala Coloring Pages', blurb: 'A balance of detail and space, for an afternoon of coloring.', seeds: [101, 131, 151, 181, 191, 211, 241, 271],
    about: 'Medium pages have more rings than the easy ones, and some rings repeat twice as many shapes as there are slices. There\'s enough detail to fill an afternoon, without the tiny spaces of the intricate pages.',
    tips: ['Fine-line markers and colored pencils suit these lines best.', 'Work from the center out, so your hand doesn\'t smudge what you\'ve finished.', 'Try one color in three shades, light to dark from the center, for a calm, finished look.'] },
  { key: 'intricate', name: 'Intricate', title: 'Intricate Mandala Coloring Pages for Adults', blurb: 'Fine lines and dense rings for detailed adult coloring.', seeds: [307, 331, 347, 367, 389, 409, 431, 457],
    about: 'Intricate pages pack many rings onto high symmetry, with thin lines and shapes drawn with smaller copies inside them. They\'re slow, absorbing pages that reward a steady hand.',
    tips: ['Use fine-tip markers, gel pens or well-sharpened colored pencils.', 'Smooth, heavier paper lets fine tips glide and keeps colors inside the lines.', 'Color one ring at a time all the way around, so the pattern stays even.'] },
  { key: 'sacred-geometry', name: 'Sacred geometry', level: 'sacred', title: 'Sacred Geometry Coloring Pages', blurb: 'The Flower of Life, Metatron\'s Cube, golden spirals and more at the center, ringed with petals and arches.', seeds: [503, 521, 547, 563, 587, 601, 619, 643],
    figs: ['flower', 'seed', 'metatron', 'flower', 'spiral', 'rose', 'seed', 'stars'],
    about: 'Each page puts a sacred geometry figure at the center, such as the Flower of Life, the Seed of Life or Metatron\'s Cube, ringed with bands of shapes like petals, leaves, arches and dots. The figures are drawn from true circles and straight lines.',
    tips: ['Shade the overlapping circles of the figure in alternating colors to bring out its petals.', 'Colored pencils handle the fine, crossing lines at the center best.', 'Want a figure on its own? Download it from the <a href="/sacred-geometry/">sacred geometry</a> page.'] },
];
const SHAPE_WORD = { petal: 'Petal', leaf: 'Leaf', drop: 'Teardrop', dot: 'Dot', diamond: 'Diamond', spike: 'Star', arch: 'Arch', heart: 'Heart', square: 'Square', line: 'Sunburst', circle: 'Ring', scallop: 'Scallop', zigzag: 'Star', wave: 'Wave' };
const titleCase = s => s.split(' ').map((w, i) => i && /^(of|and|the)$/.test(w) ? w : w[0].toUpperCase() + w.slice(1)).join(' ');
const andList = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
// Rounded, so a count that differs by one between machines doesn't change the page.
const roughly = v => v < 50 ? Math.round(v / 5) * 5 : v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 50) * 50;

// What a coloring page is made of, read from its design, so each page describes itself: the rings
// from the center out, how many spaces there are to color, and how wide the lines print.
const PLURAL = { petal: 'petals', leaf: 'leaves', drop: 'teardrops', dot: 'dots', diamond: 'diamonds', spike: 'spikes', arch: 'arches', heart: 'hearts', square: 'squares', line: 'rays', scallop: 'scallops', zigzag: 'zigzags', wave: 'waves' };
const BAND = { scallop: 'a scalloped band', zigzag: 'a zigzag band', wave: 'a wavy band' };
// How each figure reads in a sentence, and whether it takes "are".
const FIGURE_NOUN = { flower: 'the Flower of Life', seed: 'the Seed of Life', metatron: "Metatron's Cube", stars: 'stars within stars', rose: 'a mystic rose', spiral: 'golden spirals', times: 'a times table circle' };
const PLURAL_FIGURES = new Set(['stars', 'spiral']);
// Rings in a sentence, with repeats run together: "two scalloped bands", "two rings of 12 dots".
const NUMBER = ['', '', 'two', 'three', 'four', 'five'];
function ringList(rings) {
  const runs = [];
  for (const r of rings) { const last = runs[runs.length - 1]; if (last?.r === r) last.k++; else runs.push({ r, k: 1 }); }
  return andList(runs.map(({ r, k }) => k === 1 ? r : r.startsWith('a ') ? `${NUMBER[k] || k} ${r.slice(2)}s` : `${NUMBER[k] || k} rings of ${r}`));
}
function coloringFacts(d) {
  const rings = [], kinds = [];
  let figure = null;
  for (const l of d.layers) {
    const s = SHAPES[l.shape];
    if (s.kind === 'figure') {
      const v = s.variations[(l.mult || 1) - 1].replace(/\s*\(.*\)/, '');
      figure = { shape: l.shape, v: l.mult || 1, noun: FIGURE_NOUN[l.shape], are: PLURAL_FIGURES.has(l.shape), variation: /^[A-Z][^A-Z]*$/.test(v) ? v[0].toLowerCase() + v.slice(1) : v };
      continue;
    }
    if (l.shape === 'circle') continue;
    if (!kinds.includes(PLURAL[l.shape])) kinds.push(PLURAL[l.shape]);
    const echo = l.shape === 'line' ? 0 : l.echo; // rays are open lines, which buildPaths never echoes
    rings.push(BAND[l.shape] || `${d.n * (l.mult || 1)} ${echo ? (echo === 1 ? 'double-lined ' : 'triple-lined ') : ''}${PLURAL[l.shape]}`);
  }
  // The spaces are the areas a stencil of the lines would cut out, less the margin outside the last ring.
  const spaces = roughly(countPieces(cutOutlines(buildPaths(d), ClipperLib, { stencil: true })) - 1);
  // Line width on a Letter page, which pdfContent fits inside 40 point margins.
  const b = boundsOf(buildPaths(d));
  const lineMM = (d.w * (612 - 80) / Math.max(b.x1 - b.x0, b.y1 - b.y0)) * 25.4 / 72;
  return { rings, kinds, figure, spaces, lineMM };
}
const lineAdvice = mm => mm >= 0.65 ? 'bold enough for crayons and markers'
  : mm >= 0.45 ? 'good for markers and colored pencils' : 'best with fine-tip markers, gel pens or sharp colored pencils';
const coloring = [];
for (const lv of LEVELS) {
  lv.seeds.forEach((seed, i) => {
    const d = randomDesign(seed * 7919 + 13, lv.level || lv.key);
    if (lv.figs) d.layers[0].shape = lv.figs[i]; // one page per well-known figure, with the most searched ones first
    const counts = {};
    for (const l of d.layers) if (l.kind === 'ring' && l.shape !== 'circle') counts[l.shape] = (counts[l.shape] || 0) + 1;
    const main = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'petal';
    const num = String(i + 1).padStart(2, '0');
    let name, slug;
    if (lv.level === 'sacred') {
      const fig = titleCase(SHAPES[d.layers[0].shape].label); // the figure at the center names the page
      name = `${fig} Mandala ${num}`;
      slug = `${fig.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-')}-mandala-${num}`;
    } else {
      const word = SHAPE_WORD[main];
      name = `${lv.name === 'Medium' ? '' : lv.name + ' '}${word} Mandala ${num}`.trim();
      slug = `${word.toLowerCase()}-mandala-${num}`;
    }
    coloring.push({ d, lv, name, slug, n: d.n, facts: coloringFacts(d) });
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
  title: 'Free Mandala Maker: Draw and Download SVG, PNG, PDF and DXF',
  ogTitle: 'Free Mandala Maker',
  description: 'Make a mandala or sacred geometry online. Free, no signup, no watermark. Export coloring pages, stickers, or cut-ready SVG and DXF for Cricut, laser and plasma.',
  maker: true,
  schema: [
    {
      '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Super Mandala Lab Mandala Maker', url: SITE + '/',
      applicationCategory: 'DesignApplication', operatingSystem: 'Any', browserRequirements: 'Requires a modern web browser with JavaScript',
      isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: ['Symmetry from 4 to 36 slices', 'Freehand drawing with mirror symmetry', 'Rings of petals, dots, scallops and more', 'Sacred geometry: Flower of Life, Seed of Life, Metatron\'s Cube, golden spirals, mystic rose', 'Open center for a name or date', 'PNG export', 'PDF coloring pages', 'Die-cut sticker SVG with CutContour line', 'Cut-ready SVG for Cricut', 'DXF for laser and plasma cutting'],
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
<h2 class="goals-q">What are you making?</h2>
<ul class="goals">${GOALS.map(g => `<li><a href="${g.path}"><img src="${g.img}" alt="" width="56" height="56"><span><strong>${esc(g.name)}</strong><small>${esc(g.blurb)}</small></span></a></li>`).join('')}
<li><a href="#maker"><img src="/img/templates/lotus-mandala.svg" alt="" width="56" height="56"><span><strong>Just draw</strong><small>Every tool and format, right here</small></span></a></li></ul>
</div>
${maker()}
<div class="wrap section">
<h2>Sacred geometry, built in</h2>
<p>Add the Flower of Life, the Seed of Life, Metatron's Cube, golden spirals, a mystic rose and more as a single layer, then ring it with petals and arches. Every figure is drawn from true circles and straight lines, so it prints crisply and cuts cleanly. See the <a href="/sacred-geometry/">sacred geometry generator and free downloads</a>.</p>
${templateTiles(null, SACRED_TEMPLATES)}

<h2>Send a kind message</h2>
<p>Put a kind word in the middle of a mandala and send it to someone: a text to a friend having a hard week, a thank-you to a teacher, a birthday post. It takes a couple of minutes, and the link opens on any phone. Start in the <a href="/kindness-mandala/">kind message maker</a>.</p>
${kindTiles(KIND.slice(0, 5))}

<h2>Frames for words</h2>
<p>Simple, bold mandalas with the center left open for a name, a quote or a date, made for wall tags, signs, cards and gifts. Type your words in the maker, or download the frame alone and letter it in your own software. See all the <a href="/mandala-frames/">mandala frames for words</a>.</p>
${templateTiles(null, FRAME_TEMPLATES.filter(t => t.slug !== 'name-mandala').slice(0, 5))}

<h2>Mandala stickers</h2>
<p>Any design becomes a round die-cut sticker, with a white border, bleed and a CutContour cut line, or a 300 dpi PNG for sticker printers. These make especially good ones. Open the <a href="/mandala-stickers/">mandala sticker maker</a>.</p>
${stickerTiles(STICKER_TEMPLATES.slice(0, 5))}

<h2>How it works</h2>
<ol class="steps">
<li><strong>Pick your symmetry.</strong> Choose how many slices, from 4 to 36, and whether each slice mirrors.</li>
<li><strong>Draw in one slice.</strong> Every stroke repeats around the circle as you go.</li>
<li><strong>Shape it.</strong> Add rings of petals, dots and scallops, change line weight, and fill sections with color.</li>
<li><strong>Download it.</strong> Save a coloring page, a print, or a cut file in the format you need.</li>
</ol>
<p>Prefer paper and pencil? Follow the guide to <a href="/learn/how-to-draw-a-mandala/">drawing a mandala by hand</a>, step by step.</p>

<h2>Start from a template</h2>
<p>When a blank circle feels like too much, open a template and change it ring by ring. There are more in <a href="/templates/">all the templates</a>.</p>
${templateTiles(null, MANDALA_TEMPLATES)}

<div class="two-col">
<div>
<h2>What you can make</h2>
<ul>
<li>Coloring pages for yourself, your kids or your classroom</li>
<li>Wall art and prints</li>
<li>Cricut and Silhouette projects, including layered paper mandalas</li>
<li>Laser-cut wood and acrylic, and plasma-cut steel</li>
<li>Stencils, tattoo sketches and embroidery patterns</li>
<li>Round <a href="/mandala-stickers/">stickers</a> and name gifts</li>
<li>Wall tags, signs and cards with words in an <a href="/mandala-frames/">open center</a></li>
<li><a href="/kindness-mandala/">Kind messages</a> to text or post for someone</li>
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
<li>Share by text, WhatsApp, email or social media, with a picture sized for posts and stories</li>
<li>An open center for a name, a word or a date, with the opening's size shown for print and stickers</li>
<li>Die-cut sticker files with bleed and a CutContour cut line</li>
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
<tr><td>Sticker</td><td>Round die-cut stickers: an SVG with white border, bleed and a CutContour cut line for print then cut, or a 300 dpi PNG for sticker printers</td></tr>
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
    path: '/svg-for-cricut/', goal: 'cut', machine: 'cricut', template: 'metatrons-cube-mandala',
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
<li><strong>Design it.</strong> Start from a design above, press Surprise me, or draw your own. The count under the design tells you how many pieces it cuts into.</li>
<li><strong>Choose Cut-ready shapes.</strong> Under Get your cut file, keep Cricut or Silhouette and Cut-ready shapes, then enter the width and a line thickness for your material.</li>
<li><strong>Download the SVG.</strong> The maker merges overlapping lines into clean shapes.</li>
<li><strong>Upload to Design Space.</strong> Choose Upload, then Upload Image, pick the SVG, and add it to your canvas.</li>
</ol>
<h2>Tips for clean cuts</h2>
<ul>
<li><strong>Keep it connected.</strong> Floating dots and shapes cut out as separate pieces. Overlap shapes with the ring next to them, or add a ring through them.</li>
<li><strong>Size first, then thickness.</strong> The SVG opens at the width you entered. If you resize it a lot in Design Space, the line thickness changes too.</li>
<li><strong>Test on scrap.</strong> Intricate mandalas push a cutting mat's grip. Cut a small version first.</li>
<li><strong>Use a stencil for paint.</strong> The Stencil option cuts the design out of a solid disc, which works for stencil vinyl and painting. Closed areas fall out of a stencil, so the maker counts them for you.</li>
<li><strong>Loose pieces are fine on vinyl.</strong> Transfer tape holds every piece in place, so a design that cuts into many pieces still works as a vinyl decal. Paper, wood and metal need one connected piece.</li>
</ul>
<p>Read the full guide: <a href="/learn/how-to-cut-a-mandala-on-cricut/">How to cut a mandala on a Cricut</a>.</p>
<h2>Print then cut stickers</h2>
<p>The <a href="/mandala-stickers/">sticker maker</a> makes a round die-cut sticker: your mandala on a disc, a white border, bleed beyond the cut, and the cut line as a magenta hairline on its own layer named CutContour. Print then cut workflows and many sticker printers look for that layer. Or download the sticker PNG at 300 dpi for printers that trace the edge of the image. Add a name in the open center for gifts and party favors.</p>
<p>Prefer a ready-made design? Start from the <a href="/templates/flower-mandala/">flower mandala</a>, the <a href="/templates/flower-of-life-mandala/">Flower of Life</a> or the <a href="/templates/name-mandala/">name mandala</a> template.</p>`,
  },
  {
    path: '/dxf-for-laser-and-plasma/', goal: 'cut', machine: 'laser', template: 'mystic-rose-mandala',
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
<li><strong>Design it.</strong> Start from a design above, press Surprise me, or draw your own. Straight shapes like spikes and diamonds cut cleanest.</li>
<li><strong>Pick a style.</strong> Under Get your cut file, keep Laser, CNC or plasma and choose Cut-ready outlines, Stencil or Centerlines.</li>
<li><strong>Set size and thickness.</strong> Enter the finished width and a line thickness your material can hold.</li>
<li><strong>Check, then download.</strong> The count under the design tells you how many separate pieces it cuts into at that size and thickness, so you can fix loose shapes before you cut.</li>
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
    path: '/coloring-page-maker/', goal: 'coloring', template: 'easy-mandala-for-kids',
    title: 'Mandala Coloring Page Maker: Make and Print Your Own, Free',
    h1: 'Mandala Coloring Page Maker',
    lede: 'Make your own mandala coloring page and print it at US Letter or A4. Simple for kids or intricate for adults, free with no signup.',
    description: 'Make your own mandala coloring pages online and print them as PDF at Letter or A4. Easy designs for kids or intricate ones for adults. Free, no signup.',
    faq: [
      ['How do I make a coloring page?', 'Pick a starting design or press Surprise me, change it if you like, then under Get your coloring page choose Letter or A4 and download the PDF. It prints with black lines on white, centered on the page.'],
      ['How do I make it easier or harder to color?', 'For kids, use 6 or 8 slices, a thick line weight and a few big shapes. For adults, use 16 or more slices, a thin line, and Intricate next to Surprise me.'],
      ['Can I print copies for my class?', 'Yes. Print as many copies as you like for your classroom, group or family.'],
    ],
    content: `
<h2>Make a printable mandala in four steps</h2>
<ol class="steps">
<li><strong>Pick a look.</strong> Start from a design above, choose a detail level and press Surprise me, or draw your own.</li>
<li><strong>Set the detail.</strong> Fewer slices and thicker lines make it easier to color. More slices and thinner lines make it intricate.</li>
<li><strong>Download the PDF.</strong> Choose US Letter or A4. Coloring page keeps it black lines on white.</li>
<li><strong>Print and color.</strong> Print at 100 percent scale on plain or heavier paper.</li>
</ol>
<h2>Printing tips</h2>
<ul>
<li>Heavier paper, around 28 lb or 100 gsm and up, takes markers without bleeding through.</li>
<li>For digital coloring apps, download a PNG instead, under Other formats.</li>
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
${maker({ template: p.template, goal: p.goal, machine: p.machine })}
<div class="wrap section narrow article">${p.content}
<h2>Questions</h2>${faqHTML(p.faq)}</div>`,
  });
}

// Sacred geometry landing page, with free downloads of each figure on its own.
const SG_FIGURES = [
  { slug: 'seed-of-life', name: 'Seed of Life', shape: 'seed', v: 1, n: 6,
    about: 'Seven equal circles: one in the middle and six around it, each passing through the center. It is the first stage of the Flower of Life.' },
  { slug: 'flower-of-life', name: 'Flower of Life', shape: 'flower', v: 1, n: 6,
    about: 'Nineteen overlapping circles on a six-fold grid, inside a bounding circle. The best known sacred geometry figure, found drawn on the walls of the Temple of Osiris at Abydos in Egypt.' },
  { slug: 'flower-of-life-completed', name: 'Flower of Life, Completed Petals', shape: 'flower', v: 2, n: 6,
    about: 'The Flower of Life with the partial circles at its edge drawn in, so every petal against the outer ring is whole.' },
  { slug: 'fruit-of-life', name: 'Fruit of Life', shape: 'metatron', v: 3, n: 6,
    about: 'Thirteen circles taken from the Flower of Life pattern. Join their centers and you get Metatron\'s Cube.' },
  { slug: 'metatrons-cube', name: "Metatron's Cube", shape: 'metatron', v: 1, n: 6,
    about: 'The 13 circles of the Fruit of Life with all 78 straight lines between their centers. The lines are said to hold flat drawings of the five Platonic solids.' },
  { slug: 'stars-within-stars', name: 'Stars Within Stars', shape: 'stars', v: 1, n: 5,
    about: 'A five-pointed star with smaller stars nested inside it, each turned to fit the last. Its proportions follow the golden ratio.' },
  { slug: 'mystic-rose', name: 'Mystic Rose', shape: 'rose', v: 1, n: 12,
    about: 'Points around a circle, each joined to every other point by a straight line. The chords weave rings of stars and curves toward the center.' },
  { slug: 'golden-spirals', name: 'Golden Spirals', shape: 'spiral', v: 1, n: 12,
    about: 'Spirals that grow by the golden ratio each quarter turn, crossing in opposite directions like the spirals of seeds in a sunflower head.' },
  { slug: 'times-table-circle', name: 'Times Table Circle', shape: 'times', v: 1, n: 6,
    about: 'Points around a circle joined by a multiplication rule. Hundreds of straight lines trace curved, cardioid-like petals.' },
];
const sgDesign = f => ({ ...emptyDesign(), n: f.n, w: 2.5, layers: [ringLayer(f.shape, 480, 0, 0, { mult: f.v })] });
for (const f of SG_FIGURES) {
  const d = sgDesign(f);
  const base = `sacred-geometry/${f.slug}`;
  const paths = lean(d);
  write(`img/${base}.svg`, designSVG(d, { title: f.name, paths }));
  write(`files/${base}.svg`, designSVG(d, { title: f.name, paths, width: '12in' }));
  // Cut files at 12 inches wide with 0.08 inch lines, the same math as the maker.
  const b = boundsOf(buildPaths(d).map(p => ({ ...p, w: 0 })));
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  const weight = (0.08 * span) / (12 - 0.08);
  const polys = cutOutlines(buildPaths(d), ClipperLib, { weight });
  f.pieces = countPieces(polys);
  write(`files/${base}-cut.svg`, cutSVG(polys, { physW: 12, unit: 'in' }));
  write(`files/${base}-cut.dxf`, toDXF(polys, { unit: 'in', size: 12 }));
  write(`files/${base}-lines.dxf`, toDXF(buildPaths(d), { unit: 'in', size: 12 }));
  const pc = pdfContent(d, { page: 'letter', coloring: true, paths });
  write(`files/${base}-letter.pdf`, pdfFile(pc, zlib.deflateSync(Buffer.from(pc.content), { level: 9 })));
  f.edit = editLink(d);
}
console.log('Sacred geometry cut pieces:', SG_FIGURES.map(f => `${f.slug} ${f.pieces}`).join(', '));
{
  const faq = [
    ['Is the sacred geometry generator free?', 'Yes. Every figure and every export is free, with no signup and no watermark, and you may sell what you make with it.'],
    ['Can I cut the Flower of Life on a Cricut or laser?', 'Yes. Download the cut-ready SVG for Cricut or Silhouette, or the DXF for a laser, CNC router or plasma table. Every circle is merged into one connected outline at the size and line thickness you choose.'],
    ['How do I put a name in the middle?', 'Open Design, slide Open center for words, and type a name or a date. The rings stop at the opening, and the maker shows how wide the opening will print.'],
    ['Can I make a sticker?', 'Yes. In Download, the Sticker option makes a round die-cut sticker with a white border, bleed and a CutContour cut line, or a 300 dpi PNG for sticker printers.'],
    ['Why does the Flower of Life need six-fold symmetry?', 'Its circles sit on a six-fold grid. Set Symmetry to 6, 12, 18 or 24 and the rings you add around it line up with its petals.'],
  ];
  const sgD = templateDesign('sacred-geometry-mandala');
  write('img/og/sacred-geometry.png', png(socialCard(sgD, 'Sacred Geometry Generator', 'Flower of Life, Metatron\'s Cube and more'), 1200));
  page({
    path: '/sacred-geometry/',
    title: 'Free Sacred Geometry Generator: Flower of Life SVG and DXF',
    ogTitle: 'Free Sacred Geometry Generator',
    description: "Make sacred geometry online: the Flower of Life, Seed of Life, Metatron's Cube, golden spirals and more. Free SVG, DXF, PDF and sticker files, no signup.",
    maker: true, ogImage: '/img/og/sacred-geometry.png',
    crumbs: [['/', 'Home'], ['/sacred-geometry/', 'Sacred geometry']],
    sitemapImages: SG_FIGURES.map(f => `${SITE}/img/sacred-geometry/${f.slug}.svg`),
    schema: [faqSchema(faq), {
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'Free sacred geometry downloads',
      itemListElement: SG_FIGURES.map((f, i) => ({ '@type': 'ListItem', position: i + 1, item: {
        '@type': 'ImageObject', name: f.name, description: f.about, contentUrl: `${SITE}/img/sacred-geometry/${f.slug}.svg`, creator: ORG, isAccessibleForFree: true, ...IMAGE_RIGHTS,
      } })),
    }],
    body: `<div class="wrap hero"><h1>Sacred Geometry Generator</h1><p class="lede">Build the Flower of Life, Metatron's Cube, golden spirals and more, ring them with petals, leave room for a name, then download them to print, cut or stick. Free, with no signup.</p></div>
${maker({ template: 'sacred-geometry-mandala', tab: 'shapes' })}
<div class="wrap section">
<h2>Free sacred geometry downloads</h2>
<p>Each figure on its own, ready to use. Cut files are 12 inches wide with 0.08 inch lines. Open one in the maker to change its size, add rings or a name.</p>
<ul class="sg-grid">${SG_FIGURES.map(f => `<li><img src="/img/sacred-geometry/${f.slug}.svg" alt="${esc(f.name)} line art" width="300" height="300" loading="lazy"><h3>${esc(f.name)}</h3><p>${esc(f.about)}</p>
<p class="sg-links"><a href="/files/sacred-geometry/${f.slug}.svg" download>SVG</a><a href="/files/sacred-geometry/${f.slug}-cut.svg" download>Cut SVG</a><a href="/files/sacred-geometry/${f.slug}-cut.dxf" download>Cut DXF</a><a href="/files/sacred-geometry/${f.slug}-lines.dxf" download>Line DXF</a><a href="/files/sacred-geometry/${f.slug}-letter.pdf" download>PDF</a><a class="edit" href="${f.edit}">Edit</a></p></li>`).join('')}</ul>
</div>
<div class="wrap section narrow article">
<h2>How to make a sacred geometry mandala</h2>
<ol class="steps">
<li><strong>Pick a figure.</strong> In Shapes, choose a figure from the Sacred geometry group and press Add. It sits at the center and fits inside your rings.</li>
<li><strong>Choose a variation.</strong> Tap the layer to switch between versions, like 19, 37 or 61 circles for the Flower of Life, and to change its size or turn it.</li>
<li><strong>Ring it.</strong> Add petals, arches or dots around it. Use six-fold symmetry, or 12, 18 or 24, so the rings line up with six-fold figures.</li>
<li><strong>Download.</strong> Print a PDF coloring page, save a PNG, make a sticker, or download a cut-ready SVG or DXF.</li>
</ol>
<h2>Leave the center open for a name</h2>
<p>In Design, slide Open center for words and type a name, a word or a date. The figure and rings stop at the opening, and the maker tells you how wide the opening prints on a page and on a sticker, so you know the lettering will fit. Cut files keep the center open so you can add your own lettering in your cutting software.</p>
<h2>Make it a sticker</h2>
<p>The Sticker download makes a round die-cut sticker: your design on a disc, a white border, bleed beyond the cut, and a magenta CutContour line that print then cut machines and sticker printers recognize. Try the Night glow look for gold lines on a dark disc.</p>
<h2>Start from a template</h2>
${templateTiles(null, SACRED_TEMPLATES)}
<p>Or print one ready now from the <a href="/coloring-pages/sacred-geometry/">sacred geometry coloring pages</a>.</p>
<h2>Questions</h2>${faqHTML(faq)}
</div>`,
  });
}

// Mandala frames: an open center for words, for wall tags, signs and cards.
{
  const faq = [
    ['Can I put a quote in the middle?', 'Yes, up to two lines of 30 characters each, sized to fit the opening. For a longer quote, untick Put the words in downloads under Get your design, download the frame, and set the quote in your own design software.'],
    ['How do I make a monogram?', 'Type a single capital letter as the words. The laurel wreath and petal frames suit a monogram, with the serif lettering.'],
    ['Can I use my own font?', 'The maker letters in serif or sans serif. For any other font, untick Put the words in downloads and add your lettering in your design or cutting software. The words stay in the maker as a preview.'],
    ['Can I sell what I make with these frames?', 'Yes. The frames and everything you make with them are free to use, including on wall tags, signs, cards and stickers you sell.'],
    ['Will the frame cut on a Cricut or a laser?', 'Yes. Download a cut-ready SVG or a DXF. Cut files always leave the center open, so the words don\'t cut out as loose letters, and the maker tells you if any shape would come out as a separate piece.'],
  ];
  const sizes = FRAME_TEMPLATES.map(t => ({ t, share: openingSizes(templateDesign(t.slug)).share }));
  const inch = v => `${v.toFixed(1)} in`;
  const frD = templateDesign('petal-frame-mandala');
  write('img/og/mandala-frames.png', png(socialCard(frD, 'Mandala Frames for Words', 'Names, quotes and dates. Free.'), 1200));
  page({
    path: '/mandala-frames/',
    title: 'Free Mandala Frames for Names, Quotes and Monograms',
    ogTitle: 'Mandala Frames for Words',
    description: 'Free mandala frames with an open center for a name, a quote or a monogram. Bold, simple designs for wall tags, signs and cards. Download SVG, PNG, PDF or DXF.',
    maker: true, ogImage: '/img/og/mandala-frames.png',
    crumbs: [['/', 'Home'], ['/mandala-frames/', 'Frames for words']],
    sitemapImages: FRAME_TEMPLATES.map(t => `${SITE}/img/templates/${t.slug}.svg`),
    schema: [faqSchema(faq)],
    body: `<div class="wrap hero"><h1>Mandala Frames for Words</h1><p class="lede">Simple mandalas with the center left open for a name, a quote or a date. Made for wall tags, signs, cards, ornaments and name stickers. Type your words, or download the frame alone and letter it yourself.</p></div>
${maker({ template: 'petal-frame-mandala', goal: 'words' })}
<div class="wrap section">
<h2>Frames to start from</h2>
<p>Each one has its own page with sample words. In the maker, a new frame from the starting designs or Surprise me keeps the words you typed.</p>
${templateTiles(null, FRAME_TEMPLATES)}
</div>
<div class="wrap section narrow article">
<h2>How to make a mandala frame</h2>
<ol class="steps">
<li><strong>Pick a frame.</strong> Choose one of the starting designs, or press Surprise me for a new one.</li>
<li><strong>Type your words.</strong> Under Make it yours, type up to two lines and pick serif or sans serif lettering. The words are sized to fit the opening.</li>
<li><strong>Size the opening.</strong> Slide Opening to make more room or less. The maker shows the opening as a share of the design's width, and how wide it prints on a page and on a sticker.</li>
<li><strong>Download.</strong> A PNG to print, or a line drawing SVG for your design software. A PDF, a sticker, or a cut-ready SVG or DXF are under Other formats.</li>
</ol>
<h2>For wall tags, signs and screen printing</h2>
<p>Small pieces need bold lines. These frames use a line weight of 4.5 to 6, which prints about 0.3 mm wide on a design 2 inches across: enough for screen printing and laser engraving. Going smaller, or printing with a coarse screen? Raise Line weight under Make it yours.</p>
<p>To set the words in your own lettering, untick <strong>Put the words in downloads</strong> under Get your design, then download a <strong>Line drawing</strong> SVG at the size you need. It has a transparent background and an empty center, so you can place it on your tag or sign and add the words in your own software. The words stay in the maker as a preview.</p>
<p>For a cut frame in vinyl, paper, wood or metal, switch Making to Cut file. Cut files always leave the center open.</p>
<h2>How much room for words</h2>
<p>The opening of each frame, inside its line, as a share of the frame's width and at two sizes:</p>
<table class="fmt">
<thead><tr><th>Frame</th><th>Opening</th><th>2 in frame</th><th>4 in frame</th></tr></thead>
<tbody>
${sizes.map(({ t, share }) => `<tr><td><a href="/templates/${t.slug}/">${esc(t.name)}</a></td><td>${Math.round(share * 100)}%</td><td>${inch(share * 2)}</td><td>${inch(share * 4)}</td></tr>`).join('\n')}
</tbody>
</table>
<p>Need a frame for a tag or sign of another size? Multiply its width by the share. The Opening slider changes it.</p>
<h2>Name stickers</h2>
<p>A frame with a name makes a good round sticker or party favor. Switch Making to Sticker to choose the size and the look, or see the <a href="/mandala-stickers/">mandala sticker maker</a>.</p>
<h2>Questions</h2>${faqHTML(faq)}
</div>`,
  });
}

// Kind messages: a mandala with a kind word in the middle, to text, post or print for someone.
{
  const faq = [
    ['Who can see my message?', 'Only the people you send it to. The design and the words travel inside the link itself, so Super Mandala Lab never stores them. Anyone who has the link can open it, so post it publicly only if you mean to.'],
    ['How do I send it in a text?', 'On a phone, tap Share the picture and link and pick Messages: they get the picture, and a link that opens it. On a computer, use Text or Copy link, or save the picture and attach it.'],
    ['Can I post it on Instagram?', 'Yes. Choose Story under Send it, save the picture and post it from your phone. Or tap Share on your phone and pick Instagram.'],
    ['Do they need an account to open it?', 'No. The link opens the mandala in any web browser, where they can save it, print it to color in, or make one back. There is nothing to sign up for.'],
    ['Can I print it as a card?', 'Yes. Under Other formats, download a PDF at Letter or A4 to print and fold, or a round sticker for an envelope or a gift.'],
    ['Can I write a longer message?', 'The middle takes two lines of up to 30 characters each, sized to fit. Two short lines read best on a phone. For more, write it in the text or the post, and let the mandala carry the short version.'],
  ];
  const kD = KIND[0].d;
  write('img/og/kindness-mandala.png', png(socialCard(kD, 'Send Kindness in a Mandala', 'Text it, post it or print it. Free.'), 1200));
  page({
    path: '/kindness-mandala/',
    title: 'Kindness Mandala: Send a Mandala With a Kind Message, Free',
    ogTitle: 'Send a Kind Message in a Mandala',
    description: 'Make a mandala with a kind word in the middle, like You are loved or Thinking of you, and text it, post it or print it for someone. Free, no signup.',
    maker: true, ogImage: '/img/og/kindness-mandala.png',
    crumbs: [['/', 'Home'], ['/kindness-mandala/', 'Kind messages']],
    sitemapImages: KIND.map(k => `${SITE}/img/kind/${k.slug}.svg`),
    schema: [faqSchema(faq)],
    body: `<div class="wrap hero"><h1>Send a Kind Message in a Mandala</h1><p class="lede">Put a kind word in the middle of a mandala, then text it, post it or print it for someone who could use it. It takes a couple of minutes, and it's free with no signup.</p></div>
${maker({ template: KIND[0].slug, text: KIND[0].words, goal: 'kind' })}
<div class="wrap section">
<h2>Kind messages to start from</h2>
<p>Open one, change the words or the colors, and send it.</p>
${kindTiles(KIND)}
</div>
<div class="wrap section narrow article">
<h2>How to send a kind mandala</h2>
<ol class="steps">
<li><strong>Pick a frame.</strong> Each starting design opens with a message in the middle. Surprise me makes a new frame and keeps your words.</li>
<li><strong>Write your message.</strong> Tap one of the suggestions, or type up to two short lines of your own.</li>
<li><strong>Make it theirs.</strong> Pick a line color and a background they'd like, and serif or sans serif lettering.</li>
<li><strong>Send it.</strong> On a phone, Share sends the picture and a link by text, WhatsApp or any app. Or save a square picture for a post, or a story for Instagram.</li>
</ol>
<h2>Ideas for kind messages</h2>
<ul>
<li><strong>To lift someone up:</strong> You've got this. Proud of you. Keep going. You are enough.</li>
<li><strong>When things are hard:</strong> Thinking of you. Sending love. Here for you. Get well soon.</li>
<li><strong>To say thanks:</strong> Thank you. Grateful for you. You made my day.</li>
<li><strong>To celebrate:</strong> Happy birthday. Congratulations. Best day ever.</li>
<li><strong>For calm:</strong> Breathe. One day at a time. Be gentle with yourself.</li>
<li><strong>Just because:</strong> You matter. Miss you. Glad you exist.</li>
</ul>
<p>A name works too: put it on the first line and the message on the second, like <em>Mom</em> and <em>Thank you</em>.</p>
<h2>What they see</h2>
<p>The link opens a page with your mandala and its message, and nothing else to click away to. From there they can save the picture, print it as a coloring page and color it in, or make a mandala to send back. The design and the words travel inside the link, so nothing is stored on our side.</p>
<h2>For classrooms and groups</h2>
<p>On a kindness day, have each person make a mandala for someone else in the group, then print them as <a href="/coloring-page-maker/">coloring pages</a> and swap. The words print in the middle, and the rings around them are ready to color.</p>
<h2>Questions</h2>${faqHTML(faq)}
</div>`,
  });

  // Where a shared link opens: the mandala, as the person it was sent to sees it. app.js draws it from the link.
  write('img/og/for-you.png', png(socialCard({ ...kD, text: 'For you' }, 'A Mandala for You', 'Open it to see the message inside.'), 1200));
  page({
    path: '/for-you/', noindex: true, maker: true,
    title: 'A Mandala Made for You | Super Mandala Lab',
    ogTitle: 'A mandala made for you',
    description: 'Someone made you a mandala. Open it to see it, save it, print it to color in, or make one back. Free at Super Mandala Lab.',
    ogImage: '/img/og/for-you.png', ogImageAlt: 'A heart mandala with the words For you in the middle',
    body: `<div class="wrap gift" id="gift">
<h1 id="gift-title">A mandala made for you</h1>
<div class="gift-art" id="gift-art"></div>
<div class="cta-row gift-keep"><button type="button" class="btn" id="gift-save">Save the picture</button><a class="btn ghost" id="gift-color" href="/coloring-page-maker/">Print it to color in</a></div>
<div class="gift-back">
<h2>Pass it on</h2>
<p>Make a mandala with a kind word in the middle for someone else. It takes a couple of minutes, it's free, and there's nothing to sign up for.</p>
<p><a class="btn" href="/kindness-mandala/">Make one for someone</a></p>
<p class="meta gift-keep"><a id="gift-edit" href="/">Change this one in the maker</a></p>
</div>
</div>
<div class="wrap narrow article">
<h2>What is this?</h2>
<p>Someone made this mandala at Super Mandala Lab, a free mandala maker, and sent you the link. The design and any words in it travel inside the link itself, so nothing about it is stored on our side.</p>
</div>`,
  });
}

// Mandala stickers
{
  const faq = [
    ['Is the sticker maker free? Can I sell the stickers?', 'Yes. Every sticker download is free, with no watermark, and you may sell the stickers you make.'],
    ['What is the CutContour layer?', 'CutContour is the name print-and-cut software and many print shops look for to find the cut line. The sticker SVG puts the cut line, a thin magenta circle, on a layer of its own with that name, and everything that prints in a group called artwork.'],
    ['What size should a sticker be?', 'Round stickers are most often 2 to 4 inches across. The maker starts at 3 inches, measured across the cut line, with a 0.1 inch white border. Enter any size in inches or millimeters.'],
    ['Will it work with Cricut Print Then Cut?', 'Yes. Upload the sticker PNG to Design Space as a Print Then Cut image, and Cricut cuts around the edge of the white border. Check the size in Design Space before you print.'],
    ['Can I put a name on a sticker?', 'Yes. Start from the name mandala, or from one of the <a href="/mandala-frames/">mandala frames for words</a> and switch Making to Sticker. Type a name or a date under Make it yours, and the maker shows how wide the opening is on your sticker.'],
  ];
  const stD = templateDesign('flower-of-life-mandala');
  write('img/og/mandala-stickers.png', png(socialCard(stD, 'Mandala Sticker Maker', 'Die-cut SVG and PNG. Free.'), 1200));
  page({
    path: '/mandala-stickers/',
    title: 'Free Mandala Sticker Maker: Die-Cut Sticker SVG and PNG',
    ogTitle: 'Mandala Sticker Maker',
    description: 'Make round mandala stickers online: a free die-cut SVG with bleed and a CutContour cut line, or a 300 dpi PNG for sticker printers. Add a name in the center.',
    maker: true, ogImage: '/img/og/mandala-stickers.png',
    crumbs: [['/', 'Home'], ['/mandala-stickers/', 'Stickers']],
    sitemapImages: [...STICKER_TEMPLATES, ...WORD_STICKERS].map(t => `${SITE}/img/stickers/${t.slug}.svg`),
    schema: [faqSchema(faq), {
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'Free mandala sticker downloads',
      itemListElement: STICKER_TEMPLATES.map((t, i) => ({ '@type': 'ListItem', position: i + 1, item: {
        '@type': 'ImageObject', name: `${t.name} sticker`, description: t.blurb, contentUrl: `${SITE}/img/stickers/${t.slug}.svg`, creator: ORG, isAccessibleForFree: true, ...IMAGE_RIGHTS,
      } })),
    }],
    body: `<div class="wrap hero"><h1>Mandala Sticker Maker</h1><p class="lede">Turn any mandala into a round die-cut sticker. Download an SVG with bleed and a CutContour cut line for print then cut, or a 300 dpi PNG for sticker printers. Free, with no signup.</p></div>
${maker({ template: 'flower-of-life-mandala', goal: 'sticker' })}
<div class="wrap section">
<h2>Mandalas that make great stickers</h2>
<p>Detailed enough to look rich at three inches and drawn with lines that hold up when printed small. Each sticker SVG is ready to print and cut at 3 inches; open one in the maker to change its size, colors or border.</p>
<ul class="sg-grid stickers">${STICKER_TEMPLATES.map(t => `<li><img src="/img/stickers/${t.slug}.svg" alt="${esc(t.name)} as a round sticker" width="300" height="300" loading="lazy"><h3>${esc(t.name)}</h3>
<p class="sg-links"><a href="/files/stickers/${t.slug}-sticker.svg" download>Sticker SVG</a><a class="edit" href="/templates/${t.slug}/">Edit</a></p></li>`).join('')}</ul>
<h2>Name and word stickers</h2>
<p>Leave the center open and type a name, a word or a date. The maker tells you how wide the opening is on your sticker, so you know the words will be big enough to read.</p>
${stickerTiles(WORD_STICKERS)}
</div>
<div class="wrap section narrow article">
<h2>How to make a mandala sticker</h2>
<ol class="steps">
<li><strong>Pick a design.</strong> Start from one of the starting designs, press Surprise me, or draw your own.</li>
<li><strong>Choose a look.</strong> Under Make it yours, keep your own colors or pick Night glow for gold lines on a dark disc.</li>
<li><strong>Set the size.</strong> Enter the size across the cut line, 3 inches to start, and the width of the white border. The note under the design tells you how wide the thinnest lines print at that size.</li>
<li><strong>Download.</strong> The sticker SVG for print then cut, or the sticker PNG for online sticker printers.</li>
</ol>
<h2>Which file to use</h2>
<table class="fmt">
<thead><tr><th>File</th><th>Best for</th></tr></thead>
<tbody>
<tr><td>Sticker SVG</td><td>Print-and-cut printers and print shops, or any workflow that reads a CutContour line. White bleed runs past the cut, so a cut that lands slightly off never shows a hard edge.</td></tr>
<tr><td>Sticker PNG</td><td>Online sticker printers and Cricut Print Then Cut, which trace the edge of the image. 300 dpi, transparent outside the white border.</td></tr>
<tr><td>Disc only</td><td>Round labels and printers that cut their own circle: tick Disc only for the design on its disc, with no border, bleed or cut line.</td></tr>
</tbody>
</table>
<h2>Tips for small stickers</h2>
<ul>
<li><strong>Lines.</strong> The sticker file never draws a line thinner than 0.12 mm, so fine detail still prints. For stickers under 2 inches, a Line weight of 4 or more keeps them crisp.</li>
<li><strong>Words.</strong> On a 3 inch sticker, aim for an opening of an inch or more for a name. The maker shows it as you slide Opening.</li>
<li><strong>Colors.</strong> Set the line and background colors under Make it yours. Night glow turns dark lines gold on a deep indigo disc, with a soft glow behind the center.</li>
</ul>
<h2>Questions</h2>${faqHTML(faq)}
</div>`,
  });
}

// Templates
page({
  path: '/templates/', title: 'Free Mandala Templates to Edit, Print or Cut',
  description: 'Free mandala templates you can open in the maker, change ring by ring, and download as PNG, PDF coloring pages, SVG or DXF.',
  crumbs: [['/', 'Home'], ['/templates/', 'Templates']],
  sitemapImages: TEMPLATES.map(t => `${SITE}/img/templates/${t.slug}.svg`),
  body: `<div class="wrap hero"><h1>Mandala Templates</h1><p class="lede">Each template opens in the free maker, where you can change the symmetry, shapes and colors, then download it to print or cut.</p></div>
<div class="wrap section"><h2>Ready to download now</h2>
<div class="grid-3">
<article class="card"><h3><a href="/coloring-pages/">Printable coloring pages</a></h3><p>${coloring.length} mandala coloring pages in Letter and A4 PDF, from easy designs for kids to intricate and sacred geometry pages for adults.</p></article>
<article class="card"><h3><a href="/mandala-stickers/">Sticker files</a></h3><p>Round die-cut stickers at 3 inches, with bleed and a CutContour cut line, ready to print and cut.</p></article>
<article class="card"><h3><a href="/sacred-geometry/">Sacred geometry</a></h3><p>The Flower of Life, Metatron's Cube and more on their own, as SVG, cut-ready SVG and DXF, and PDF.</p></article>
</div>
<h2>Frames with an open center for words</h2>
<p>Simple, bold designs with room in the middle for a name, a quote or a date, for wall tags, signs and cards. <a href="/mandala-frames/">More about mandala frames</a>.</p>${templateTiles(null, FRAME_TEMPLATES)}
<h2>Sacred geometry templates</h2>${templateTiles(null, SACRED_TEMPLATES)}
<h2>Mandala templates</h2>${templateTiles(null, MANDALA_TEMPLATES)}
<p>Making stickers? See which templates make the best ones in the <a href="/mandala-stickers/">mandala sticker maker</a>.</p></div>`,
});
for (const t of TEMPLATES) {
  const d = templateDesign(t.slug);
  page({
    path: `/templates/${t.slug}/`,
    title: fitText(60, `${t.name} Template: Free to Edit, Print and Cut`, `${t.name} Template: Free to Print and Cut`),
    description: fitText(160, `${t.blurb} Edit it free and download as PNG, PDF, SVG or DXF.`, `${t.blurb} Free to edit, as PNG, PDF, SVG or DXF.`, `${t.blurb} Free to edit and download.`, t.blurb),
    maker: true,
    ogImage: `/img/og/${t.slug}.png`, ogImageAlt: `${t.name} template`,
    crumbs: [['/', 'Home'], ['/templates/', 'Templates'], [`/templates/${t.slug}/`, t.name]],
    sitemapImages: [`${SITE}/img/templates/${t.slug}.svg`],
    schema: [{
      '@context': 'https://schema.org', '@type': 'ImageObject', name: `${t.name} template`, description: t.blurb,
      contentUrl: `${SITE}/img/templates/${t.slug}.svg`, creator: ORG, isAccessibleForFree: true, ...IMAGE_RIGHTS,
    }],
    body: `<div class="wrap hero"><h1>${esc(t.name)} Template</h1><p class="lede">${esc(t.blurb)}</p></div>
${maker({ template: t.slug })}
<div class="wrap use-for"><span>Use this design for</span>${GOALS.map(g => `<a class="btn ghost" href="${g.path}?template=${t.slug}">${esc(g.name)}</a>`).join('')}</div>
<div class="wrap section">
<div class="two-col">
<div>
<h2>How to use this template</h2>
<p>The ${esc(t.name.toLowerCase())} is loaded in the maker above with ${d.n}-fold symmetry. Open the Shapes tab to change any ring: move it closer to the center, make the shapes longer or wider, twist them, or fill them with color. Switch to Draw to add your own lines, which repeat around all ${d.n} slices.</p>
<p>When it looks right, open Download and save it as a PDF coloring page, a PNG, a cut-ready SVG for Cricut, or a DXF for a laser or plasma table.</p>
${t.more ? `<h2>About the ${esc(t.name.toLowerCase())}</h2>
${t.more}` : ''}
${d.open ? `<h2>Add your words</h2>
<p>Open Design and type up to two lines under Open center for words. They're sized to fit the opening, and the maker tells you how wide the opening is at your size. To letter it yourself instead, untick Put the words in downloads and download a Line drawing SVG: it has a transparent background and an empty center, ready for your own lettering. See more <a href="/mandala-frames/">mandala frames for words</a>.</p>` : ''}
${t.sticker ? `<h2>Make it a sticker</h2>
<div class="sticker-note"><img src="/img/stickers/${t.slug}.svg" alt="${esc(t.name)} as a round sticker" width="140" height="140" loading="lazy">
<p>This design makes a good round sticker. In Download, under Sticker, choose a size, a look and the white border, then download an SVG with a CutContour cut line or a 300 dpi PNG.${d.open ? '' : ` Or download a <a href="/files/stickers/${t.slug}-sticker.svg" download>3 inch sticker SVG</a> ready to print and cut.`} <a href="/mandala-stickers/">More about mandala stickers</a>.</p></div>` : ''}
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
  body: `<div class="wrap hero"><h1>Free Printable Mandala Coloring Pages</h1><p class="lede">Print any of these at US Letter or A4, or open it in the maker to change it first. Free to use, including on things you sell.</p></div>
<div class="wrap section">${LEVELS.map(lv => `<h2><a href="/coloring-pages/${lv.key}/">${esc(lv.title)}</a></h2><p>${esc(lv.blurb)}</p>
<ul class="tiles">${coloring.filter(c => c.lv === lv).slice(0, 4).map(c => `<li><a href="/coloring-pages/${lv.key}/${c.slug}/"><img src="/img/coloring-pages/${lv.key}/${c.slug}.svg" alt="${esc(c.name)} coloring page" width="300" height="300" loading="lazy"><span>${esc(c.name)}</span></a></li>`).join('')}</ul>
<p><a href="/coloring-pages/${lv.key}/">See all ${lv.name.toLowerCase()} pages</a></p>`).join('')}
<div class="closing"><h2>Make your own coloring page</h2><p>Pick a level of detail, press Surprise me, and print it.</p><p><a class="btn" href="/coloring-page-maker/">Open the coloring page maker</a></p></div>
</div>`,
});
// "6 to 12" for a list of numbers, or "8" when they're all the same. range([6, 12], '-fold') is "6- to 12-fold".
const range = (vals, unit = '') => {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return lo === hi ? `${lo}${unit}` : `${lo}${unit && '-'} to ${hi}${unit}`;
};
for (const lv of LEVELS) {
  const items = coloring.filter(c => c.lv === lv);
  const summary = `These ${items.length} pages have ${range(items.map(c => c.n), '-fold')} symmetry, ${range(items.map(c => c.facts.rings.length))} rings of shapes${lv.level === 'sacred' ? ' around the figure' : ''}, and about ${range(items.map(c => c.facts.spaces))} spaces to color.`;
  page({
    path: `/coloring-pages/${lv.key}/`, title: fitText(60, `${lv.title}: Free Printable PDF`, `${lv.title} (Free PDF)`),
    description: fitText(160, `${lv.blurb} Free printable mandala coloring pages in Letter and A4 PDF.`, `${lv.blurb} Free printable Letter and A4 PDFs.`, lv.blurb),
    crumbs: [['/', 'Home'], ['/coloring-pages/', 'Coloring pages'], [`/coloring-pages/${lv.key}/`, lv.name]],
    ogImage: `/img/pins/${lv.key}-${items[0].slug}.png`,
    body: `<div class="wrap hero"><h1>${esc(lv.title)}</h1><p class="lede">${esc(lv.blurb)} Print at Letter or A4, or open one in the maker to change it.</p></div>
<div class="wrap section"><ul class="tiles">${items.map(c => `<li><a href="/coloring-pages/${lv.key}/${c.slug}/"><img src="/img/coloring-pages/${lv.key}/${c.slug}.svg" alt="${esc(c.name)} coloring page" width="300" height="300" loading="lazy"><span>${esc(c.name)}</span><small>${c.n}-fold, about ${c.facts.spaces} spaces</small></a></li>`).join('')}</ul></div>
<div class="wrap section narrow article">
<h2>About these pages</h2>
<p>${esc(lv.about)} ${summary}</p>
<h2>Tips for coloring them</h2>
<ul>${lv.tips.map(t => `<li>${t}</li>`).join('')}</ul>
<p>Other levels: ${LEVELS.filter(x => x !== lv).map(x => `<a href="/coloring-pages/${x.key}/">${esc(x.title)}</a>`).join(' · ')}</p>
</div>`,
  });
  items.forEach((c, i) => {
    const base = `/coloring-pages/${lv.key}/${c.slug}`;
    // The next four around the level, so every page is linked from four others.
    const others = [1, 2, 3, 4].map(k => items[(i + k) % items.length]);
    const f = c.facts;
    // The figure's own entry on /sacred-geometry/, or its plain version when this variation has none.
    const fig = f.figure && (SG_FIGURES.find(x => x.shape === f.figure.shape && x.v === f.figure.v) || SG_FIGURES.find(x => x.shape === f.figure.shape && x.v === 1));
    const contents = f.figure ? `At the center ${f.figure.are ? 'are' : 'is'} ${f.figure.noun} (${f.figure.variation}), ringed by ${ringList(f.rings)}.`
      : `From the center out: ${ringList(f.rings)}, inside a plain outer ring.`;
    const level = lv.key === 'medium' ? '' : `${lv.name.toLowerCase()} `;
    page({
      path: base + '/',
      title: fitText(60, `${c.name}: Free Printable Coloring Page`, `${c.name} Coloring Page (Free PDF)`),
      description: f.figure
        ? fitText(160, `${c.name}: a free printable coloring page with ${f.figure.noun} at the center, ${c.n}-fold symmetry and about ${f.spaces} spaces to color. Letter or A4 PDF.`,
          `${c.name}: a free printable coloring page with ${f.figure.noun} at the center and about ${f.spaces} spaces to color.`)
        : fitText(160, `${c.name}: a free printable coloring page with ${c.n}-fold symmetry, rings of ${andList(f.kinds.slice(0, 3))}, and about ${f.spaces} spaces to color. Letter or A4 PDF.`,
          `${c.name}: a free printable coloring page with ${c.n}-fold symmetry and about ${f.spaces} spaces to color. Letter or A4 PDF.`),
      crumbs: [['/', 'Home'], ['/coloring-pages/', 'Coloring pages'], [`/coloring-pages/${lv.key}/`, lv.name], [base + '/', c.name]],
      ogImage: `/img/pins/${lv.key}-${c.slug}.png`, ogImageAlt: `${c.name} coloring page`,
      sitemapImages: [`${SITE}/img${base}.svg`],
      schema: [{
        '@context': 'https://schema.org', '@type': 'ImageObject', name: `${c.name} coloring page`, contentUrl: `${SITE}/img${base}.svg`,
        description: `Printable ${level}mandala coloring page with ${c.n}-fold symmetry and about ${f.spaces} spaces to color`, creator: ORG, isAccessibleForFree: true, ...IMAGE_RIGHTS,
      }],
      body: `<div class="wrap hero"><h1>${esc(c.name)} Coloring Page</h1><p class="lede">A free printable ${level}mandala with ${c.n}-fold symmetry and about ${f.spaces} spaces to color.</p></div>
<div class="wrap section"><div class="two-col">
<div class="preview"><img src="/img${base}.svg" alt="${esc(c.name)} coloring page" width="520" height="520"></div>
<div>
<h2 style="margin-top:0">Download and print</h2>
<div class="cta-row"><a class="btn" href="/files${base}-letter.pdf" download>PDF, US Letter</a><a class="btn ghost" href="/files${base}-a4.pdf" download>PDF, A4</a></div>
<p>Print at 100 percent scale. The lines print about ${f.lineMM.toFixed(1)} mm wide, ${lineAdvice(f.lineMM)}.</p>
<h2>What's in it</h2>
<p>${esc(contents)}</p>
${fig ? `<p>${esc(fig.about)} Download the figure on its own from the <a href="/sacred-geometry/">sacred geometry</a> page.</p>` : ''}
<h2>Change it first</h2>
<p>Open it in the maker to change the symmetry, thicken the lines or add your own drawing.</p>
<p><a class="btn ghost" href="${editLink(c.d)}">Edit this mandala</a></p>
<p class="meta">Free to use, including on things you sell. See the <a href="/license/">license</a>.</p>
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
  path: '/license/', title: 'License: Free to Use, Including on Things You Sell',
  description: 'Every design and file from Super Mandala Lab is free to use, including on things you sell: coloring pages, templates, stickers, cut files and maker designs.',
  crumbs: [['/', 'Home'], ['/license/', 'License']],
  body: `<div class="narrow article"><div class="hero"><h1>License</h1><p class="meta">Updated November 3, 2026</p></div>
<p>Everything you download from Super Mandala Lab is free to use, including on things you sell. That covers:</p>
<ul>
<li>Mandalas you make in the maker, in every format</li>
<li>The ready-made <a href="/coloring-pages/">coloring pages</a></li>
<li>The <a href="/templates/">templates</a> and the <a href="/mandala-frames/">frames for words</a></li>
<li>The <a href="/mandala-stickers/">sticker files</a></li>
<li>The <a href="/sacred-geometry/">sacred geometry</a> figures and cut files</li>
</ul>
<p>Print them, color them, cut them, and sell what you make with them, such as prints, stickers, signs, cards and cut pieces. There's no fee and no watermark, and you don't need an account.</p>
<h2>Questions</h2>
<p>Ask us through <a href="https://superfablab.com">SuperFabLab</a>.</p>
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
// Each page's lastmod is the day its content last changed, not the day of the build.
const LASTMOD = lastmodDates(path.join(here, 'lastmod.json'), SITEMAP, TODAY);
const smap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${SITEMAP.map(u => `<url><loc>${SITE + u.path}</loc><lastmod>${LASTMOD[u.path]}</lastmod>${u.img.map(i => `<image:image><image:loc>${i}</image:loc></image:image>`).join('')}</url>`).join('\n')}
</urlset>
`;
write('sitemap.xml', smap);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
write('google114b1fb682c7dd8a.html', 'google-site-verification: google114b1fb682c7dd8a.html');
write('version.txt', 'Super Mandala Lab build ' + new Date().toISOString() + '\n');
write('site.webmanifest', JSON.stringify({
  name: BRAND, short_name: 'Mandala Lab', start_url: '/', display: 'standalone', background_color: '#fbf8f3', theme_color: '#fbf8f3',
  icons: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
}));
write('llms.txt', `# ${BRAND}

> A free online mandala maker at ${SITE}. Draw with radial symmetry (4 to 36 slices, optional mirroring), add rings of shapes, and download PNG, PDF coloring pages, cut-ready SVG for Cricut and Silhouette, and DXF for laser, CNC and plasma cutting. Sacred geometry figures, an open center for a name, and die-cut sticker export. No signup, no watermark, free to use for products you sell.

## Tools
- [Mandala maker](${SITE}/): draw or build a mandala and export it
- [Mandala SVG for Cricut](${SITE}/svg-for-cricut/)
- [Mandala DXF for laser and plasma](${SITE}/dxf-for-laser-and-plasma/)
- [Mandala coloring page maker](${SITE}/coloring-page-maker/)
- [Kind message mandalas](${SITE}/kindness-mandala/): a mandala with a kind word in the middle, like You are loved, to text, post or print for someone
- [Sacred geometry generator](${SITE}/sacred-geometry/): the Flower of Life, Seed of Life, Metatron's Cube, golden spirals and more, with free SVG, DXF and PDF downloads
- [Mandala sticker maker](${SITE}/mandala-stickers/): round die-cut stickers as SVG with a CutContour cut line, or 300 dpi PNG, with free sticker downloads

## Free designs
- [Mandala templates](${SITE}/templates/)
- [Mandala frames for words](${SITE}/mandala-frames/): simple mandalas with an open center for a name, a quote or a date, for wall tags, signs and cards
- [Printable mandala coloring pages](${SITE}/coloring-pages/)
- [Sacred geometry coloring pages](${SITE}/coloring-pages/sacred-geometry/)

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

const seo = checkSite(DIST, SITE);
printReport(seo);
if (seo.errors.length) process.exitCode = 1;
