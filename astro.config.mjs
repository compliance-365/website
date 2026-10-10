// astro.config.mjs
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { lastmodFor } from './scripts/page-lastmod.mjs';

// Pages excluded from the sitemap:
// - noindex pages (legal, utility) — submitting them wastes crawl budget
// - redirect source URLs — Astro creates physical HTML redirect files that the
//   sitemap plugin picks up, causing Google to discover and queue them needlessly
const SITEMAP_EXCLUDE = [
  // noindex utility pages
  'https://www.compliance365.com.au/privacy/',
  'https://www.compliance365.com.au/privacy-summary/',
  'https://www.compliance365.com.au/terms/',
  'https://www.compliance365.com.au/cookies/',
  'https://www.compliance365.com.au/thank-you/',
  'https://www.compliance365.com.au/404/',
  'https://www.compliance365.com.au/search/',
  // old redirect source slugs
  'https://www.compliance365.com.au/blog/iso27001-vs-iso27701/',
  'https://www.compliance365.com.au/blog/iso42001-ai-governance/',
  'https://www.compliance365.com.au/blog/iso27701-2025-alignment/',
  'https://www.compliance365.com.au/blog/iso27701-2025',
  'https://www.compliance365.com.au/thirdpartyrisk.html',
  'https://www.compliance365.com.au/E8.html',
  'https://www.compliance365.com.au/ismsupdate-blog.html',
  'https://www.compliance365.com.au/savings.html',
  'https://www.compliance365.com.au/signup.html',
  'https://www.compliance365.com.au/iso27001.html',
  'https://www.compliance365.com.au/pentest.html',
  'https://www.compliance365.com.au/services.html',
  'https://www.compliance365.com.au/about.html',
  'https://www.compliance365.com.au/resources/readiness-checklist/',
];

export default defineConfig({
  site: 'https://www.compliance365.com.au',
  trailingSlash: 'always',
  outDir: 'dist',
  output: 'static',
  build: { format: 'directory' },
  // Fetch the next page when a visitor hovers or focuses a link, so
  // navigation feels instant. Same-origin only; nothing runs until the
  // visitor actually navigates.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  // Content Security Policy, emitted as a <meta> on every page (static
  // hosting has no response headers). Astro fingerprints the scripts it
  // bundles; scripts/csp-inline-hashes.mjs adds the is:inline ones after
  // the build. Origins: cdnjs (hero 3D ring); jsdelivr (jsPDF, Fuse.js);
  // *.clarity.ms (Clarity: the loader fetches its engine and sends data
  // across several subdomains, after cookie consent); assets.apollo.io +
  // aplo-evnt.com (Apollo company identification); googletagmanager.com /
  // google-analytics.com (GA4, cookieless until consent); Microsoft
  // login/Graph (posture scan); the execute-api Lambdas (chat, forms);
  // formspree.io (forms); Outlook (Bookings iframe); Paddle (/start only).
  // Styles keep 'unsafe-inline': pages use thousands of style=""
  // attributes, which fingerprints cannot cover.
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "font-src 'self'",
        "img-src 'self' data: https:",
        "connect-src 'self' https://*.clarity.ms https://assets.apollo.io https://aplo-evnt.com https://login.microsoftonline.com https://graph.microsoft.com https://*.execute-api.ap-southeast-2.amazonaws.com https://formspree.io https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://*.paddle.com",
        "frame-src https://outlook.office365.com https://outlook.office.com https://*.paddle.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://formspree.io",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://*.clarity.ms', 'https://assets.apollo.io', 'https://www.googletagmanager.com', 'https://cdn.paddle.com'],
      },
      styleDirective: {
        resources: ["'self'", "'unsafe-inline'", 'https://*.paddle.com'],
      },
    },
  },
  redirects: {
    // Old site legacy URLs
    '/thirdpartyrisk.html':            '/services/iso27001/',
    '/E8.html':                        '/services/essential-eight/',
    '/ismsupdate-blog.html':           '/blog/',
    '/savings.html':                   '/',
    '/blog/iso27701-2025-alignment/':  '/services/iso27701/',
    '/blog/iso27701-2025':             '/services/iso27701/',
    '/signup.html':                    '/book/',
    '/iso27001.html':                  '/services/iso27001/',
    '/pentest.html':                   '/services/',
    '/services.html':                  '/services/',
    '/about.html':                     '/about/',
    // Old blog slug redirects
    '/blog/iso27001-vs-iso27701':      '/blog/iso-27001-vs-iso-27701-australia/',
    '/blog/iso42001-ai-governance':    '/blog/ai-governance-iso42001-playbook/',
    // A generic 10-question check with no links to it, superseded by the
    // per-framework checklists; Search Console listed it as crawled but
    // not indexed.
    '/resources/readiness-checklist':  '/checklist/',
  },
  // No code blocks on the site; Shiki's inline styles conflict with the CSP.
  markdown: { syntaxHighlight: false },
  integrations: [
    sitemap({
      filter: (page) => !SITEMAP_EXCLUDE.includes(page),
      // <lastmod> from the last git commit that touched each page's source, so
      // Google can tell a genuinely updated page from an untouched one.
      serialize: (item) => {
        const lastmod = lastmodFor(new URL(item.url).pathname);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
});
