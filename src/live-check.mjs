// Checks the live site: every page in the sitemap returns 200, http and www redirect (301) to the
// https apex, a made-up path returns 404, and robots.txt points to the sitemap. GETs only.
// Usage: node src/live-check.mjs [site]   (npm run live-check; the site defaults to https://supermandalalab.com)

const SITE = (process.argv[2] || 'https://supermandalalab.com').replace(/\/$/, '');
const HOST = new URL(SITE).host;
const UA = 'supermandalalab-live-check (+https://github.com/charleswest775/supermandalalab)';
const CONCURRENCY = 6;
const inActions = process.env.GITHUB_ACTIONS === 'true';

const failures = [];
const fail = msg => { failures.push(msg); console.log('  FAIL ' + msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// One GET that doesn't follow redirects. Network errors and 5xx are retried twice.
async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
      const body = await res.text();
      if (res.status >= 500 && attempt < 3) throw new Error(`HTTP ${res.status}`);
      const location = res.headers.get('location');
      return { status: res.status, location: location && new URL(location, url).href, body };
    } catch (e) {
      if (attempt === 3) return { status: 0, error: e.cause?.code || e.message };
      await sleep(1000 * attempt);
    }
  }
}
const describe = r => r.status ? `${r.status}${r.location ? ' to ' + r.location : ''}` : `no answer (${r.error})`;

async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

// Prints "ok" (and an optional note from fn) when fn adds no failures.
async function section(name, fn) {
  console.log(name);
  const before = failures.length;
  const note = await fn();
  if (failures.length === before) console.log('  ok' + (note ? ', ' + note : ''));
}

console.log(`Checking ${SITE}`);

await section('robots.txt', async () => {
  const r = await get(SITE + '/robots.txt');
  if (r.status !== 200) return fail(`/robots.txt returned ${describe(r)}`);
  const sitemaps = r.body.split('\n').filter(l => /^sitemap:/i.test(l)).map(l => l.slice(8).trim());
  if (!sitemaps.includes(SITE + '/sitemap.xml')) fail(`/robots.txt has no "Sitemap: ${SITE}/sitemap.xml" line`);
});

let locs = [];
await section('Sitemap pages', async () => {
  const r = await get(SITE + '/sitemap.xml');
  if (r.status !== 200) return fail(`/sitemap.xml returned ${describe(r)}`);
  locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim().replace(/&amp;/g, '&'));
  if (!locs.length) return fail('/sitemap.xml lists no pages');
  await pool(locs, CONCURRENCY, async loc => {
    if (!loc.startsWith(SITE + '/')) return fail(`the sitemap lists ${loc}, which isn't on ${SITE}`);
    const p = await get(loc);
    if (p.status !== 200) fail(`${loc} returned ${describe(p)}`);
  });
  return `all ${locs.length} returned 200`;
});

// http and www, for the home page and a deeper page with a query string, must each reach the same
// address on the https apex in a single 301.
await section('Redirects', async () => {
  const deep = (locs.find(l => l.startsWith(SITE + '/') && l !== SITE + '/') || SITE + '/templates/').slice(SITE.length) + '?from=live-check';
  for (const from of [`http://${HOST}`, `https://www.${HOST}`, `http://www.${HOST}`]) {
    for (const p of ['/', deep]) {
      const r = await get(from + p);
      if (r.status !== 301 || r.location !== SITE + p) fail(`${from + p} returned ${describe(r)}, not 301 to ${SITE + p}`);
    }
  }
});

await section('Missing page', async () => {
  const url = `${SITE}/live-check-${Date.now().toString(36)}/`;
  const r = await get(url);
  if (r.status !== 404) fail(`${url} returned ${describe(r)}, not 404`);
});

if (failures.length) {
  console.log(`\n${failures.length} problem${failures.length === 1 ? '' : 's'} on ${SITE}`);
  if (inActions) for (const f of failures.slice(0, 10)) console.log('::error::' + f);
  process.exit(1);
}
console.log(`\nAll checks passed on ${SITE}`);
