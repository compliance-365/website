// astro.config.mjs
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
  'https://www.compliance365.com.au/thirdpartyrisk.html',
  'https://www.compliance365.com.au/E8.html',
  'https://www.compliance365.com.au/ismsupdate-blog.html',
  'https://www.compliance365.com.au/savings.html',
  'https://www.compliance365.com.au/signup.html',
];

export default defineConfig({
  site: 'https://www.compliance365.com.au',
  trailingSlash: 'always',
  outDir: 'dist',
  output: 'static',
  build: { format: 'directory' },
  redirects: {
    // Old site legacy URLs
    '/thirdpartyrisk.html':            '/services/iso27001/',
    '/E8.html':                        '/services/essential-eight/',
    '/ismsupdate-blog.html':           '/blog/',
    '/savings.html':                   '/',
    '/blog/iso27701-2025-alignment/':  '/services/iso27701/',
    '/signup.html':                    '/book/',
    // Old blog slug redirects
    '/blog/iso27001-vs-iso27701':      '/blog/iso-27001-vs-iso-27701-australia/',
    '/blog/iso42001-ai-governance':    '/blog/ai-governance-iso42001-playbook/',
  },
  integrations: [
    sitemap({
      filter: (page) => !SITEMAP_EXCLUDE.includes(page),
    }),
  ],
});
