// astro.config.mjs
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://www.compliance365.com.au',
  trailingSlash: 'always',
  outDir: 'dist',
  output: 'hybrid',          // static site + API routes together
  adapter: netlify(),
  build: { format: 'directory' },
  redirects: {
    '/blog/iso27001-vs-iso27701':       '/blog/iso-27001-vs-iso-27701-australia/',
    '/blog/iso42001-ai-governance':     '/blog/ai-governance-iso42001-playbook/',
  },
  integrations: [
    sitemap({
      entryLimit: 50000,
      changefreq: 'weekly',
      priority: 0.8,
      i18n: false,
    }),
  ],
});
