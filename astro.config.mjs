import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://compliance-365.github.io/website',
  outDir: 'dist',
  integrations: [sitemap()],
  build: { format: 'directory' }
});
