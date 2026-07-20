// Pings IndexNow (Bing, Yandex, and others) with the site's canonical URLs
// after each deploy so search engines re-crawl changed pages fast.
//
// Runs as the last step of the Netlify build. Two hard rules:
//   1. It reads the URL list from the freshly-built sitemap, so it can
//      never go stale as pages are added/removed (the sitemap only ever
//      contains canonical, indexable URLs — no redirect slugs).
//   2. It can NEVER fail the deploy. A search-engine ping is best-effort;
//      a transient network error reaching IndexNow must not take the whole
//      site offline. Everything is wrapped so the process always exits 0.
import { readFileSync } from 'node:fs';

const HOST = 'www.compliance365.com.au';
const KEY  = 'e47ea977dfd9435994c74feee9df576a';

async function main() {
  // Pull canonical URLs straight from the generated sitemap.
  let urls = [];
  try {
    const xml = readFileSync('dist/sitemap-0.xml', 'utf8');
    urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  } catch (e) {
    console.warn(`IndexNow: could not read dist/sitemap-0.xml (${e.message}) — skipping submission.`);
    return;
  }
  if (!urls.length) {
    console.warn('IndexNow: sitemap contained no URLs — skipping submission.');
    return;
  }

  const body = JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList: urls,
  });

  console.log(`IndexNow: submitting ${urls.length} URLs…`);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
  });
  console.log(`IndexNow: response ${res.status} ${res.statusText}`);
  if (res.status >= 400) {
    const text = await res.text().catch(() => '');
    console.warn(`IndexNow: non-success response — ${text}`);
  }
}

// Best-effort: swallow ALL errors (network, DNS, timeout, non-2xx) so the
// deploy is never failed by the ping. Always exit 0.
try {
  await main();
} catch (e) {
  console.warn(`IndexNow: submission failed, continuing anyway — ${e && e.message ? e.message : e}`);
}
process.exit(0);
