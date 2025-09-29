import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://compliance-365.github.io/website/', // NOTE: trailing slash
  base: '/website/',                                   // <— REQUIRED for project pages
  outDir: 'dist',
  build: { format: 'directory' },
  integrations: [sitemap()],
});
