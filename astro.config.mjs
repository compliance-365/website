// astro.config.mjs
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
    sitemap(),
  ],
});
