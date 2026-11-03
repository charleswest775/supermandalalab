// Resubmits the sitemap to Google Search Console, so Google rereads it soon after a deploy.
// It signs in as a service account: GSC_SERVICE_ACCOUNT_JSON holds the account's JSON key, and the
// account must be a user on the URL-prefix property https://supermandalalab.com/ (DEPLOY.md says how).
// Without GSC_SERVICE_ACCOUNT_JSON it skips with a notice. It only submits; it reads no search data.
// Usage: GSC_SERVICE_ACCOUNT_JSON="$(cat key.json)" node src/gsc-sitemap.mjs
import crypto from 'crypto';

const PROPERTY = 'https://supermandalalab.com/';
const SITEMAP = PROPERTY + 'sitemap.xml';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters'; // submitting needs more than webmasters.readonly
const inActions = process.env.GITHUB_ACTIONS === 'true';

// The Actions log of a public repo is public: keep the account's email and project id out of it.
let secrets = [];
const scrub = s => secrets.reduce((t, x) => t.split(x).join('***'), String(s));
const die = msg => { console.log((inActions ? '::error::' : '') + scrub(msg)); process.exit(1); };

const raw = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();
if (!raw) {
  console.log(`${inActions ? '::notice::' : ''}GSC_SERVICE_ACCOUNT_JSON isn't set, so the sitemap wasn't resubmitted to Google. DEPLOY.md says how to set it up.`);
  process.exit(0);
}
let account;
try { account = JSON.parse(raw); } catch { die("GSC_SERVICE_ACCOUNT_JSON isn't valid JSON. Paste the whole key file into the secret."); }
if (!account.client_email || !account.private_key) die('GSC_SERVICE_ACCOUNT_JSON has no client_email or private_key. It should be a service account key file.');
secrets = [account.client_email, account.project_id, account.private_key_id].filter(Boolean);
if (inActions) for (const s of secrets) console.log('::add-mask::' + s);

// A JWT signed with the account's key, traded for an access token (Google's OAuth for service accounts).
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 600 });
let signature;
try { signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.private_key).toString('base64url'); }
catch { die("The private_key in GSC_SERVICE_ACCOUNT_JSON isn't a usable key."); }

const tokenRes = await fetch(TOKEN_URL, {
  method: 'POST',
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  signal: AbortSignal.timeout(30000),
});
const token = await tokenRes.json().catch(() => ({}));
if (!tokenRes.ok || !token.access_token) {
  die(`Google didn't accept the service account key (${tokenRes.status}: ${token.error_description || token.error || 'no details'}). Is the key still active?`);
}
if (inActions) console.log('::add-mask::' + token.access_token);

const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}/sitemaps/${encodeURIComponent(SITEMAP)}`;
const res = await fetch(url, { method: 'PUT', headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(30000) });
if (!res.ok) {
  const err = await res.json().catch(() => ({}));
  const hint = res.status === 403 ? ' Check that the Search Console API is on in the Google Cloud project and the service account is a user on the property.' : '';
  die(`Search Console didn't take the sitemap (${res.status}: ${err.error?.message || 'no details'}).${hint}`);
}
console.log(`Resubmitted ${SITEMAP} to Google Search Console.`);
