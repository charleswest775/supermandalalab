# supermandalalab: context for Claude Code sessions

Super Mandala Lab, https://supermandalalab.com: a free in-browser mandala maker, with templates,
coloring pages (PDF, Letter and A4), SVG for Cricut, DXF for laser and plasma, and guides. It's a
static site built into `dist/`, and `dist/` is committed. The project was started on 2026-10-28 in
Duet, which also pushes to this repo. DEPLOY.md was written for Duet's container
(`/mnt/project-files`, `/home/user/sml-deps`); on a Mac clone, use the steps below instead.

## Layout

- `src/js/core.js`: the geometry and the `TEMPLATES` list, plus SVG, cut-outline, DXF and PDF
  output. It's shared by the browser and the build.
  Sacred geometry figures (`kind: 'figure'` in `SHAPES`, drawn by `figurePaths`), the open
  center and its words (`d.open`, `d.text`, `d.font`), and the die-cut sticker (`stickerSVG`)
  were ported from the older mandala-studio project on 2026-10-28.
- `src/js/app.js`: the maker's UI, bundled by esbuild into `dist/js/maker.js`.
  Goal pages (coloring page, sticker, words in the center, cut file) show the maker with one goal's
  starting designs, controls and files as three steps: `GOALS` and `GOAL_UI` in `build.mjs`,
  `maker({ goal })`. The home page, templates and sacred geometry keep the full tabbed maker. Controls
  are named pieces (`CTRL`, `DL`), and app.js skips any a page leaves out.
- `src/content.mjs`: `FAQ` and the `ARTICLES` (guides).
- `src/build.mjs`: the pages, sitemap, schema and assets, written to `dist/`. `/sacred-geometry/` also writes
  free downloads of each figure to `dist/files/sacred-geometry/`. Coloring pages describe
  themselves from their design data (`coloringFacts`); the `about` and `tips` of each level in
  `LEVELS` describe what `randomDesign` makes, so keep them true if it changes.
- `src/seo-check.mjs`: checks `dist/` for what search engines read (titles, descriptions,
  canonicals, one H1, structured data, links, alt text, sitemap, thin or near-duplicate copy,
  internal links). The rules for each kind of page are in `RULES` at the top.
- `src/lastmod.mjs` and `src/lastmod.json`: each page's sitemap date is the day its content last
  changed. The build updates `lastmod.json`, so commit it with `dist/`.
- `src/css/site.css`
- `src/optimize_png.py`: palette-quantizes the PNGs (needs Pillow).

## Build and preview

- Once: `npm install --no-package-lock` (the repo has no lockfile), and Pillow for `python3`
  (`python3 -m pip install --user pillow`). Without Pillow the build carries on and prints
  "PNG optimize skipped", so the PNGs come out big.
- `npm run build` takes about 15 s. It's deterministic: only `version.txt` changes between two
  builds.
- The build ends with the SEO check. Errors (a missing title, a broken link, two pages with the
  same description) make it exit 1; fix them before committing. Warnings are for judgment.
  `npm run seo` runs the check alone, and `node src/seo-check.mjs --all` lists every item.
- Preview: `python3 -m http.server 8780 --bind 127.0.0.1 --directory dist`, then open
  http://127.0.0.1:8780/. It has no 404 page and no `_headers`; Cloudflare serves those.
- There are no tests beyond the SEO check. Before committing a new template, render it and look at it.

## Deploying

Cloudflare Workers Builds watches `main`. Every push to `main` goes live in about 30 s: it runs
`npx wrangler deploy`, which uploads `dist/` with no build step on Cloudflare. **So a push to
`main` is publishing: ask before pushing to `main` unless Charles asked for it.** Work on a
branch otherwise. Afterwards, https://supermandalalab.com/version.txt should match
`dist/version.txt`. Pushes to other branches build a Preview on workers.dev instead
(`wrangler preview`, which needs the `previews` block in `wrangler.jsonc`).

## Sharing main with Duet

- Run `git pull --rebase` before starting and again before building.
- `dist/` and `src/lastmod.json` are generated, so never hand-merge them. On a conflict, take
  either side, rebuild and commit.
- Builds here differ from Duet's in about 120 `dist/` files, with no visible change:
  - Duet's file tools embed C2PA content credentials in SVGs and PNGs.
  - PNGs are re-encoded by a different Pillow.
  - In about half the coloring-page SVGs and PDFs, the simplifier keeps different points along
    the same curves (floating-point differences between platforms).

  So rebuilding here gives a large but harmless `dist/` diff. Say so in the commit message.

## Public repo

Never commit secrets, Cloudflare account or zone ids, a personal email, or task notes. Commits use
the GitHub noreply address, which is set in this clone's git config.

Keep these in `dist/`:
- `google114b1fb682c7dd8a.html` (Search Console verification)
- `version.txt`

Keep both custom domains in `wrangler.jsonc`.
