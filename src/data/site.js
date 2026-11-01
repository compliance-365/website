/**
 * site.js
 * =======
 * One place for which site is being built, and how its pages relate to
 * the other site's for search engines.
 *
 * The same code builds two sites:
 *   - au   (default) https://www.compliance365.com.au: the full site.
 *   - intl (SITE_VARIANT=intl) https://www.compliance365.io: the country
 *     pages for the US, UK and UAE, plus a "choose your region" home.
 *     Every other path on .io is a redirect stub to the same path on
 *     .com.au (scripts/finalize-intl.mjs), so Checkpoint, Microsoft
 *     sign-in, the forms and their CORS allowlists only ever run on
 *     .com.au, and no page exists twice.
 *
 * hreflang ties the Australian home page to the three country pages.
 * The .com.au side only emits it once INTL_LIVE is true, i.e. once
 * www.compliance365.io serves the international build. Until then .io
 * forwards to .com.au, and pointing Google at it would describe a loop.
 */

export const AU_ORIGIN = 'https://www.compliance365.com.au';
export const INTL_ORIGIN = 'https://www.compliance365.io';

// Flip to true in the same PR as the DNS switch for www.compliance365.io.
export const INTL_LIVE = false;

const env = (typeof process !== 'undefined' && process.env) || {};
export const VARIANT = env.SITE_VARIANT === 'intl' ? 'intl' : 'au';
export const SITE_ORIGIN = VARIANT === 'intl' ? INTL_ORIGIN : AU_ORIGIN;

/* The country pages. `hreflang` is what Google reads; `ogLocale` is the
   closest Open Graph locale (there is no en_AE, and the UAE uses British
   English). */
export const REGIONS = {
  us: { name: 'United States', short: 'US', hreflang: 'en-US', ogLocale: 'en_US' },
  uk: { name: 'United Kingdom', short: 'UK', hreflang: 'en-GB', ogLocale: 'en_GB' },
  ae: { name: 'United Arab Emirates', short: 'UAE', hreflang: 'en-AE', ogLocale: 'en_GB' },
};

/* Paths that are real pages on .io. The "choose your region" page is
   built at /world/ and moved to / by scripts/finalize-intl.mjs. */
export const INTL_PATHS = ['/', ...Object.keys(REGIONS).map((r) => `/${r}/`)];
export const isIntlPath = (path) => INTL_PATHS.includes(path);

/** Canonical URL for a path in the site being built. */
export function canonicalFor(path) {
  const p = path === '/world/' ? '/' : path;
  return VARIANT === 'intl' && isIntlPath(p) ? INTL_ORIGIN + p : AU_ORIGIN + p;
}

/** The hreflang cluster: Australian home, the three country pages, and
 *  the region chooser as x-default. */
export function hreflangCluster() {
  return [
    { hreflang: 'en-AU', href: AU_ORIGIN + '/' },
    ...Object.entries(REGIONS).map(([k, r]) => ({ hreflang: r.hreflang, href: `${INTL_ORIGIN}/${k}/` })),
    { hreflang: 'x-default', href: INTL_ORIGIN + '/' },
  ];
}

/** hreflang links a page should carry (empty for most pages). */
export function hreflangFor(path) {
  const p = path === '/world/' ? '/' : path;
  if (VARIANT === 'intl') return isIntlPath(p) ? hreflangCluster() : [];
  return INTL_LIVE && p === '/' ? hreflangCluster() : [];
}

/** Page language and Open Graph locale for a path. */
export function localeFor(path) {
  if (VARIANT === 'intl') {
    const region = REGIONS[path.split('/')[1]];
    if (region) return { lang: region.hreflang, og: region.ogLocale };
    if (path === '/' || path === '/world/') return { lang: 'en', og: 'en_US' };
  }
  return { lang: 'en-AU', og: 'en_AU' };
}
