// Adds a SHA-256 fingerprint for every inline <script> to the
// Content-Security-Policy <meta> Astro emits (security.csp in
// astro.config.mjs). Astro fingerprints the scripts it bundles but not
// is:inline ones, and the policy has no 'unsafe-inline', so without this
// step those scripts would not run.
//
// Runs on the built site (dist/), after `astro build`. Fails the build if
// a page carries an inline event-handler attribute (onclick= etc.), which
// the policy blocks: use addEventListener or a data- attribute instead.
//
// Usage: node scripts/csp-inline-hashes.mjs [dist]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// Astro writes the attribute value in lower case; the hand-written
// policies in public/ (Checkpoint, owner console) use
// "Content-Security-Policy", so this case-sensitive match leaves them alone.
const META = /<meta http-equiv="content-security-policy" content="([^"]*)">/;
const SCRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
const HANDLER = /<[a-z][^>]*\son[a-z]+\s*=\s*["'][^>]*>/gi;

/* Executable inline scripts: no src, and a JavaScript type (or none).
   JSON-LD and other data blocks are never run, so need no fingerprint. */
export function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(SCRIPT)) {
    const attrs = m[1] || '';
    if (/\ssrc\s*=/.test(attrs)) continue;
    const type = (/\stype\s*=\s*"([^"]*)"/.exec(attrs) || [])[1];
    if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type)) continue;
    out.push(m[2]);
  }
  return out;
}

export function hashOf(text) {
  return "'sha256-" + createHash('sha256').update(text, 'utf8').digest('base64') + "'";
}

/* Returns the page with every inline script's fingerprint in script-src,
   or null if the page has no Astro CSP meta (public/ files such as the
   Checkpoint app carry their own policy and are left alone). */
export function addInlineHashes(html) {
  const m = META.exec(html);
  if (!m) return null;
  const directives = m[1].split(';').map((d) => d.trim()).filter(Boolean);
  const i = directives.findIndex((d) => d.startsWith('script-src '));
  if (i < 0) throw new Error('CSP meta has no script-src');
  if (/'unsafe-inline'/.test(directives[i])) throw new Error("script-src must not allow 'unsafe-inline'");
  const have = new Set(directives[i].split(/\s+/));
  for (const s of inlineScripts(html)) have.add(hashOf(s));
  directives[i] = [...have].join(' ');
  /* A <meta> policy only governs what comes after it, and Astro puts it at
     the end of <head>, after the layout's own inline scripts. Move it to
     straight after <meta charset>, ahead of every script. */
  const meta = `<meta http-equiv="content-security-policy" content="${directives.join('; ')}">`;
  const without = html.replace(META, '');
  const charset = /<meta charset="[^"]*"\s*\/?>/i.exec(without);
  if (!charset) throw new Error('page has no <meta charset> to place the policy after');
  const at = charset.index + charset[0].length;
  return without.slice(0, at) + meta + without.slice(at);
}

/* True when no executable script appears before the policy. */
export function policyFirst(html) {
  const at = html.search(META);
  return at >= 0 && inlineScripts(html.slice(0, at)).length === 0 && !/<script[^>]*\ssrc=/.test(html.slice(0, at));
}

export function inlineHandlers(html) {
  // Ignore text inside scripts (template strings may mention onclick=).
  const bare = html.replace(SCRIPT, '<script></script>');
  return [...bare.matchAll(HANDLER)].map((m) => m[0].slice(0, 120));
}

function htmlFiles(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (n.endsWith('.html')) out.push(p);
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const dist = process.argv[2] || 'dist';
  let pages = 0;
  const problems = [];
  for (const f of htmlFiles(dist)) {
    const html = readFileSync(f, 'utf8');
    const next = addInlineHashes(html);
    if (next == null) continue;
    pages++;
    for (const h of inlineHandlers(html)) problems.push(`${f}: ${h}`);
    if (!policyFirst(next)) problems.push(`${f}: a script comes before the policy`);
    writeFileSync(f, next);
  }
  if (problems.length) {
    console.error('csp-inline-hashes: pages the Content Security Policy would break (inline event handlers are blocked):\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  if (!pages) { console.error('csp-inline-hashes: no page carries the Astro CSP meta; is security.csp still on?'); process.exit(1); }
  console.log(`csp-inline-hashes: fingerprinted inline scripts on ${pages} pages.`);
}
