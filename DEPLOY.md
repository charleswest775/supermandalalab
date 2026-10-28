# Deploying supermandalalab.com

The site is a static build served by the Cloudflare Worker `supermandalalab`, using static assets on the free tier, at https://supermandalalab.com.

The GitHub repo https://github.com/charleswest775/supermandalalab is the source of truth. It is **public**, so never commit anything private: no tokens or keys, no account or zone ids, no personal email (commits use the GitHub noreply address), and no task notes. Cloudflare's Git integration (Workers Builds) watches the `main` branch. Each push to `main` runs `npx wrangler deploy`, which uploads `dist/` and goes live within a minute or two. No build runs on Cloudflare, because `dist/` is built locally and committed.

## Publishing a change

1. Get the code. Work in `/mnt/project-files/supermandalalab/` when it exists. It's a git clone of the repo, so run `git pull` first. In a fresh container without that folder, clone the repo to `/home/user/supermandalalab` instead.
2. Install the build tools once per container. npm can't install into `/mnt/project-files`, because that folder doesn't allow symlinks. Install them into a separate folder:
   ```
   npm install --prefix /home/user/sml-deps esbuild@0.28 @resvg/resvg-js@2.6 clipper-lib@6.4
   ```
   If git reports "dubious ownership" in the shared folder, run `git config --global --add safe.directory '*'` once.
   Python 3 with Pillow is also needed for PNG compression. Check with `python3 -c "import PIL"`, and run `python3 -m pip install pillow` if it's missing.
3. Edit the source:
   - Templates are the `TEMPLATES` list in `src/js/core.js`. Each needs a slug, name, blurb, an optional `more` HTML string and a `make()` function.
   - Guides are the `ARTICLES` list in `src/content.mjs`. Each needs slug, date, title, short, description, template and body.
   - Pages, the sitemap and the schema are in `src/build.mjs`.
4. Build:
   ```
   node src/build.mjs /home/user/sml-deps
   ```
   This rebuilds `dist/` and prints the file and sitemap counts. Before committing, preview any new template by rendering it to a PNG and looking at it.
5. Commit and push to `main`:
   ```
   git add -A && git commit -m "Add <what changed>" && git push origin main
   ```
6. Check that it's live. Open the new pages on https://supermandalalab.com/ in a browser. The Worker's Deployments list in the Cloudflare dashboard shows the new version. Then use URL Inspection in Google Search Console (URL-prefix property `https://supermandalalab.com/`) to request indexing for the new pages. The quota is about 10 a day.

## Things to keep

- `dist/google114b1fb682c7dd8a.html` is the Search Console verification file, written by `build.mjs`. Removing it unverifies the site.
- `wrangler.jsonc` lists both custom domains. Leave them in, so a deploy keeps supermandalalab.com and www attached.
- The www-to-apex redirect and Always Use HTTPS are zone settings in Cloudflare, not part of this repo.
- Cloudflare Web Analytics is injected automatically, so the site needs no script tag for it.
- Never commit API tokens or other credentials. Pushing uses the session's GitHub access, and Cloudflare deploys through its own Git integration.

## Manual fallback

If the Git integration is ever disconnected, zip `dist/` and upload it in the Cloudflare dashboard. Go to Workers & Pages, open supermandalalab, choose to upload static files to update the Worker, then click Deploy.
