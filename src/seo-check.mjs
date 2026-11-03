// Checks the built site for what search engines read, so a new page can't quietly ship without a
// title, with a broken link, or as a near copy of another page.
// Runs at the end of every build, and `npm run seo` runs it alone. Errors fail the build's exit code;
// warnings are for a person to judge.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TITLE_MAX = 60;
const DESC_MIN = 70, DESC_MAX = 160;
// By page, the first match wins: the fewest words of copy (outside the maker and navigation), and the
// share of five-word runs two pages can have in common before they read as copies of each other.
// About, privacy and the license are short on purpose, and hubs are mostly tiles. Coloring pages are
// image pages, a printable design in a short frame of text that its level shares, so they're held
// to less; URL Inspection in Search Console is the real test of whether Google sees them as copies.
const RULES = [
  { match: /^\/learn\/.+/, minWords: 500 },
  { match: /^\/(about|privacy|license)\/$/, minWords: 0 },
  { match: /^\/(templates|learn|coloring-pages(\/[^/]+)?)\/$/, minWords: 100 },
  { match: /^\/coloring-pages\/[^/]+\/[^/]+\/$/, minWords: 100, dupShare: 0.75 },
  { match: /./, minWords: 150 },
];
const rule = url => ({ dupShare: 0.6, ...RULES.find(r => r.match.test(url)) });
// Every page should be linked from the main content of at least this many other pages.
// The home page and the footer-only pages are exempt.
const MIN_INBOUND = 2;
const INBOUND_EXEMPT = new Set(['/', '/about/', '/privacy/']);

const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const text = html => decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const first = (html, re) => (html.match(re) || [])[1];

// The copy of a page's main content: without the maker, which is a tool, and without breadcrumbs
// and tile grids of other pages, which are navigation.
const copyOf = main => text(withoutMaker(main).replace(/<nav\b[\s\S]*?<\/nav>/g, ' ').replace(/<ul class="tiles[^"]*">[\s\S]*?<\/ul>/g, ' '));

// The maker's <section> holds nested sections of its own.
function withoutMaker(html) {
  const start = html.indexOf('<section id="maker"');
  if (start < 0) return html;
  const re = /<section\b|<\/section>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[0] === '</section>' ? -1 : 1;
    if (!depth) return html.slice(0, start) + html.slice(re.lastIndex);
  }
  return html;
}

const shingles = words => {
  const s = new Set();
  for (let i = 0; i + 5 <= words.length; i++) s.add(words.slice(i, i + 5).join(' '));
  return s;
};

export function checkSite(dist, site) {
  const errors = [], warnings = [];
  const err = (rule, msg) => errors.push({ rule, msg });
  const warn = (rule, msg) => warnings.push({ rule, msg });

  const files = new Set();
  const walk = dir => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p); else files.add('/' + path.relative(dist, p).split(path.sep).join('/')); } };
  walk(dist);
  // Where a root-relative URL lands: a file, or a folder's index.html.
  const resolve = u => {
    const p = decodeURI(u.split(/[?#]/)[0]);
    if (p.endsWith('/')) return files.has(p + 'index.html') ? p : null;
    if (files.has(p)) return p;
    return files.has(p + '/index.html') ? p + '/' : null;
  };

  const pages = [];
  for (const f of files) {
    if (!f.endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(dist, f), 'utf8');
    if (!html.includes('<html')) continue; // the Search Console verification file
    const url = f.replace(/index\.html$/, '');
    const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
    const main = first(html, /<main[^>]*>([\s\S]*?)<\/main>/) || '';
    const words = copyOf(main).toLowerCase().split(' ').filter(Boolean);
    pages.push({ url, html, main, noindex, words });
  }
  const indexable = pages.filter(p => !p.noindex);

  // Head tags and on-page basics.
  const seenTitle = {}, seenDesc = {};
  for (const p of pages) {
    const { url, html, main } = p;
    if (!/<html lang="[a-z-]+"/.test(html)) err('lang', `${url} has no <html lang>`);
    for (const img of html.match(/<img\b[^>]*>/g) || []) if (!/\salt="/.test(img)) err('alt', `${url} has an image with no alt: ${img.slice(0, 80)}`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let data;
      try { data = JSON.parse(m[1]); } catch { err('schema', `${url} has structured data that isn't valid JSON`); continue; }
      if (!data['@context'] || !data['@type']) err('schema', `${url} has structured data with no @context or @type`);
      // Every URL on this site named in structured data must exist.
      JSON.stringify(data, (k, v) => {
        if (typeof v === 'string' && v.startsWith(site + '/') && !resolve(v.slice(site.length))) err('schema', `${url} structured data points to a missing ${v}`);
        return v;
      });
    }
    if (p.noindex) continue;
    const title = decode(first(html, /<title>([\s\S]*?)<\/title>/) || '');
    const desc = decode(first(html, /<meta name="description" content="([^"]*)"/) || '');
    const canonical = first(html, /<link rel="canonical" href="([^"]*)"/);
    const h1s = (main.match(/<h1\b/g) || []).length;
    if (!title) err('title', `${url} has no title`);
    else if (title.length > TITLE_MAX) warn('title length', `${url} title is ${title.length} characters, over ${TITLE_MAX}: ${title}`);
    if (!desc) err('description', `${url} has no meta description`);
    else if (desc.length > DESC_MAX || desc.length < DESC_MIN) warn('description length', `${url} description is ${desc.length} characters, want ${DESC_MIN} to ${DESC_MAX}`);
    if (canonical !== site + url) err('canonical', `${url} canonical is ${canonical}`);
    if (h1s !== 1) err('h1', `${url} has ${h1s} h1 headings`);
    const og = first(html, /<meta property="og:image" content="([^"]*)"/);
    if (!og || !og.startsWith(site + '/') || !resolve(og.slice(site.length))) err('og:image', `${url} og:image is missing or points to a missing file: ${og}`);
    (seenTitle[title] ||= []).push(url);
    (seenDesc[desc] ||= []).push(url);
    const min = rule(url).minWords;
    if (p.words.length < min) warn('thin copy', `${url} has ${p.words.length} words of copy outside the maker and navigation, want ${min}`);
  }
  for (const [t, urls] of Object.entries(seenTitle)) if (t && urls.length > 1) err('duplicate title', `"${t}" is the title of ${urls.join(', ')}`);
  for (const [d, urls] of Object.entries(seenDesc)) if (d && urls.length > 1) err('duplicate description', `${urls.length} pages share a description: ${urls.join(', ')}`);

  // Internal links and assets, and who links to whom from their main content.
  const inbound = {};
  for (const p of pages) {
    for (const m of p.html.matchAll(/\s(?:href|src)="(\/[^"/][^"]*|\/)"/g)) {
      const u = decode(m[1]);
      const to = resolve(u);
      if (!to) err('broken link', `${p.url} links to missing ${u}`);
      else if (to !== u.split(/[?#]/)[0] && to.endsWith('/')) warn('redirecting link', `${p.url} links to ${u}, which redirects to ${to}`);
    }
    for (const m of p.main.matchAll(/\shref="(\/[^"]*)"/g)) {
      const to = resolve(decode(m[1]));
      if (to && to !== p.url) (inbound[to] ||= new Set()).add(p.url);
    }
  }
  for (const p of indexable) {
    const n = inbound[p.url]?.size || 0;
    if (n < MIN_INBOUND && !INBOUND_EXEMPT.has(p.url)) warn('few inbound links', `${p.url} is linked from the main content of ${n} other page${n === 1 ? '' : 's'}`);
  }

  // Pages whose copy is mostly the same as another page's.
  const sets = indexable.map(p => shingles(p.words));
  let dupPairs = 0;
  for (let i = 0; i < indexable.length; i++) for (let j = i + 1; j < indexable.length; j++) {
    const a = sets[i], b = sets[j];
    if (!a.size || !b.size) continue;
    let both = 0;
    for (const s of a) if (b.has(s)) both++;
    const share = both / (a.size + b.size - both);
    if (share > Math.max(rule(indexable[i].url).dupShare, rule(indexable[j].url).dupShare)) { dupPairs++; warn('near duplicate', `${indexable[i].url} and ${indexable[j].url} share ${Math.round(share * 100)}% of their copy`); }
  }

  // The sitemap lists exactly the indexable pages, with real dates and images that exist.
  const smap = files.has('/sitemap.xml') ? fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8') : '';
  if (!smap) err('sitemap', 'dist/sitemap.xml is missing');
  const listed = new Set();
  for (const m of smap.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]*)<\/lastmod>)?([\s\S]*?)<\/url>/g)) {
    const [, loc, lastmod, rest] = m;
    const u = loc.slice(site.length);
    listed.add(u);
    if (!loc.startsWith(site + '/') || !indexable.some(p => p.url === u)) err('sitemap', `sitemap lists ${loc}, which isn't an indexable page`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod || '')) err('sitemap', `sitemap entry ${loc} has no valid lastmod`);
    for (const im of rest.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)) if (!resolve(im[1].slice(site.length))) err('sitemap', `sitemap image ${im[1]} is missing`);
  }
  for (const p of indexable) if (!listed.has(p.url)) err('sitemap', `${p.url} is indexable but not in the sitemap`);
  const robots = files.has('/robots.txt') ? fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8') : '';
  if (!robots.includes(`Sitemap: ${site}/sitemap.xml`)) err('robots', 'robots.txt does not point to the sitemap');
  if (/^Disallow:\s*\/\s*$/m.test(robots)) err('robots', 'robots.txt disallows the whole site');

  return { pages: pages.length, indexable: indexable.length, dupPairs, errors, warnings };
}

export function printReport(r, max = 8) {
  console.log(`SEO check: ${r.indexable} indexable pages, ${r.errors.length} errors, ${r.warnings.length} warnings`);
  for (const [kind, list] of [['error', r.errors], ['warning', r.warnings]]) {
    const byRule = {};
    for (const x of list) (byRule[x.rule] ||= []).push(x.msg);
    for (const [rule, msgs] of Object.entries(byRule)) {
      console.log(`  ${kind}: ${rule} (${msgs.length})`);
      for (const m of msgs.slice(0, max)) console.log(`    ${m}`);
      if (msgs.length > max) console.log(`    ... and ${msgs.length - max} more`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const r = checkSite(path.resolve(here, '..', 'dist'), 'https://supermandalalab.com');
  printReport(r, process.argv.includes('--all') ? Infinity : 8);
  if (r.errors.length) process.exitCode = 1;
}
