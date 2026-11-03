// Tells IndexNow which pages changed in this deploy. IndexNow passes them on to Bing, Yandex, Seznam,
// Naver and the other engines that use it (Google doesn't).
// Sends the pages in dist/sitemap.xml whose <lastmod> is the date of the deployed build (from
// dist/version.txt, the date the build gives a changed page), or every page with --all.
// The key is public by design: the engines check that https://supermandalalab.com/<key>.txt holds it.
// Usage: node src/indexnow.mjs [--all] [--dry-run]   (--dry-run lists the pages and sends nothing)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://supermandalalab.com';
const KEY = 'f7a309703ca332a5581d2a331502d891'; // build.mjs writes dist/<KEY>.txt, so change both together
const KEY_URL = `${SITE}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const all = process.argv.includes('--all');
const dryRun = process.argv.includes('--dry-run');
const inActions = process.env.GITHUB_ACTIONS === 'true';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const die = msg => { console.log((inActions ? '::error::' : '') + msg); process.exit(1); };

const sitemap = fs.readFileSync(path.join(ROOT, 'dist/sitemap.xml'), 'utf8');
const date = fs.readFileSync(path.join(ROOT, 'dist/version.txt'), 'utf8').match(/\d{4}-\d{2}-\d{2}/)?.[0];
if (!date) die('dist/version.txt has no build date');
const pages = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, u]) => ({
  loc: u.match(/<loc>([^<]+)<\/loc>/)?.[1].trim().replace(/&amp;/g, '&'),
  lastmod: u.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1].trim().slice(0, 10),
})).filter(p => p.loc?.startsWith(SITE + '/'));
const urls = pages.filter(p => all || p.lastmod === date).map(p => p.loc);

if (!urls.length) {
  console.log(`No pages in the sitemap changed on ${date}, so there's nothing to send.`);
  process.exit(0);
}
console.log(`${all ? 'All' : `Changed on ${date}:`} ${urls.length} of ${pages.length} pages`);
for (const u of urls) console.log('  ' + u);

// The engines fetch the key file to check the key, so make sure it's live first.
const keyServed = () => fetch(KEY_URL, { signal: AbortSignal.timeout(15000) })
  .then(r => r.ok ? r.text() : '', () => '').then(t => t.trim() === KEY);
if (dryRun) {
  console.log(`\nDry run, nothing sent. ${KEY_URL} ${await keyServed() ? 'serves the key' : "doesn't serve the key yet"}.`);
  process.exit(0);
}
// A deploy that adds the key file without a new build leaves version.txt as it was, so the wait for the
// deploy can end before the file is live: allow a minute.
let served = await keyServed();
for (let i = 0; i < 6 && !served; i++) { await sleep(10000); served = await keyServed(); }
if (!served) die(`${KEY_URL} doesn't serve the IndexNow key, so IndexNow would reject it. Is dist/${KEY}.txt deployed?`);

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: KEY_URL, urlList: urls }),
  signal: AbortSignal.timeout(30000),
});
// 200 means accepted, and 202 accepted while the engines check the key (the first ping or two).
const MEANING = { 400: 'bad request', 403: 'the key file was not valid', 422: "some URLs aren't on the host", 429: 'too many requests' };
if (res.status !== 200 && res.status !== 202) {
  const text = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
  die(`IndexNow answered ${res.status}${MEANING[res.status] ? ` (${MEANING[res.status]})` : ''}${text ? ': ' + text : ''}`);
}
console.log(`\nIndexNow accepted ${urls.length} URL${urls.length === 1 ? '' : 's'} (${res.status}).`);
