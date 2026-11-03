// Sitemap dates that change only when a page does.
// src/lastmod.json keeps a hash of what search engines read on each page (its title, description,
// structured data and main content) and the date that hash last changed. The build updates it, so
// commit it along with dist/.
import fs from 'fs';
import crypto from 'crypto';

export function fingerprint(html) {
  const all = re => (html.match(re) || []).join('\n');
  const read = [
    all(/<title>[\s\S]*?<\/title>/g),
    all(/<meta name="description"[^>]*>/g),
    all(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g),
    all(/<main[\s\S]*?<\/main>/g),
  ].join('\n').replace(/\?v=[0-9a-f]+/g, ''); // asset cache-busters change with any CSS or JS edit
  return crypto.createHash('sha1').update(read).digest('hex').slice(0, 16);
}

// pages: [{ path, html }]. Returns { path: date }, and rewrites the file with only these pages.
export function lastmodDates(file, pages, today) {
  let old = {};
  try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const next = {};
  for (const { path, html } of pages) {
    const hash = fingerprint(html);
    next[path] = old[path]?.hash === hash ? old[path] : { date: today, hash };
  }
  const keys = Object.keys(next).sort();
  // One page per line, so two branches that touch different pages merge cleanly.
  fs.writeFileSync(file, `{\n${keys.map(k => ` ${JSON.stringify(k)}: ${JSON.stringify(next[k])}`).join(',\n')}\n}\n`);
  return Object.fromEntries(keys.map(k => [k, next[k].date]));
}
