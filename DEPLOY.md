# Deploying supermandalalab.com

The site is a static build served by the Cloudflare Worker `supermandalalab`, using static assets on the free tier, at https://supermandalalab.com.

The GitHub repo https://github.com/charleswest775/supermandalalab is the source of truth. It is **public**, so never commit anything private: no tokens or keys, no account or zone ids, no personal email (commits use the GitHub noreply address), and no task notes. Cloudflare's Git integration (Workers Builds) is connected to this repo and watches the `main` branch. Each push to `main` runs `npx wrangler deploy`, which uploads `dist/` and goes live in under a minute (verified Oct 28, 2026: push to live took about 30 seconds). The Cloudflare build command is deliberately empty: `dist/` is built locally and committed, so Cloudflare only uploads it. Don't set the build command to `npm run build`, because the build also needs Python with Pillow, which Cloudflare's build image may not have.

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
6. Check that it's live. https://supermandalalab.com/version.txt shows the build time of what's deployed, so it should match the build you just pushed. Then open the new pages on https://supermandalalab.com/ in a browser. The Worker's Deployments list in the Cloudflare dashboard shows each push as a "Build" from `main`, and a failed build shows there too. Then use URL Inspection in Google Search Console (URL-prefix property `https://supermandalalab.com/`) to request indexing for the new pages. The quota is about 10 a day.

## After each deploy

The GitHub Actions workflow `.github/workflows/after-deploy.yml` runs on every push to `main` (except pushes that only change Markdown files), and you can run it by hand from the repo's Actions tab: open "After deploy" and click "Run workflow". It:

1. Waits until https://supermandalalab.com/version.txt matches the pushed `dist/version.txt`. If that hasn't happened after 5 minutes, it fails: look at the Worker's Deployments in the Cloudflare dashboard.
2. Checks the live site with `src/live-check.mjs`: every page in the sitemap returns 200, http and www redirect to `https://supermandalalab.com` with a 301, a made-up path returns 404, and robots.txt points to the sitemap. Run it yourself any time with `npm run live-check`.
3. Pings IndexNow with `src/indexnow.mjs`. IndexNow passes the pages on to Bing, Yandex and other search engines (Google doesn't use it). A push sends the sitemap pages whose `<lastmod>` is the deployed build's date; a run by hand sends every page. `node src/indexnow.mjs --dry-run` lists the pages without sending anything. The key is public by design. Search engines check it against `dist/f7a309703ca332a5581d2a331502d891.txt`.
4. Resubmits the sitemap to Google Search Console with `src/gsc-sitemap.mjs`, signed in as a service account. Until the secret below is set, this step is skipped with a notice. It runs even if the IndexNow step failed, but not if the live check failed.

The workflow only checks the site and submits to search engines. It reads no search data and saves no artifacts, because the logs of this public repo are public. Resubmitting the sitemap doesn't replace URL Inspection for new pages (step 6 above), but it gets Google to reread the sitemap soon.

### One-time setup for the Google step

Do this once, signed in with the Google account that owns the Search Console property.

1. In the Google Cloud console (https://console.cloud.google.com/), create a project, for example `supermandalalab`. The API is free, so the project needs no billing.
2. In the project, go to APIs & Services > Library, find "Google Search Console API" and click Enable.
3. Go to IAM & Admin > Service Accounts and create a service account, for example `sitemap-submit`. It needs no roles in the project. Open it, go to Keys > Add key > Create new key, choose JSON, and save the file it downloads.
4. In Search Console, open the `https://supermandalalab.com/` property and go to Settings > Users and permissions > Add user. Enter the service account's email (`client_email` in the key file, ending in `.iam.gserviceaccount.com`) and choose Full permission, which is enough to submit sitemaps.
5. In GitHub, go to the repo's Settings > Secrets and variables > Actions > New repository secret. Name it `GSC_SERVICE_ACCOUNT_JSON` and paste the whole key file as the value. Then delete the downloaded file. Never commit it, and don't paste the service account's email or the project id anywhere in the repo; the script keeps both out of the logs.
6. Run the workflow by hand. Its last step should print "Resubmitted https://supermandalalab.com/sitemap.xml to Google Search Console", and the sitemap's Submitted date under Indexing > Sitemaps in Search Console should change to today. If it fails with 403, check steps 2 and 4.

To replace the key later, create a new one on the service account, update the secret, then delete the old key.

## Things to keep

- `dist/google114b1fb682c7dd8a.html` is the Search Console verification file, written by `build.mjs`. Removing it unverifies the site.
- `dist/f7a309703ca332a5581d2a331502d891.txt` is the IndexNow key file, written by `build.mjs`. The same key is in `src/indexnow.mjs`, so change both together.
- `dist/version.txt` is the build stamp, written by `build.mjs`.
- `wrangler.jsonc` lists both custom domains. Leave them in, so a deploy keeps supermandalalab.com and www attached.
- The www-to-apex redirect and Always Use HTTPS are zone settings in Cloudflare, not part of this repo.
- Cloudflare Web Analytics is injected automatically, so the site needs no script tag for it.
- Never commit API tokens or other credentials. Pushing uses the session's GitHub access, and Cloudflare deploys through its own Git integration.

## Weekly routine

Once a week:
1. `git pull`, then add one guide to `ARTICLES` and, if useful, one template to `TEMPLATES`, aimed at a search people make ("mandala svg for cricut", "dot mandala template" and the like).
2. Build, preview new templates, commit and push. The site updates by itself.
3. Check `version.txt` and the new pages, then request indexing for them in Search Console.

## Manual fallback

If the Git integration is ever disconnected, zip `dist/` and upload it in the Cloudflare dashboard. Go to Workers & Pages, open supermandalalab, choose to upload static files to update the Worker, then click Deploy.
