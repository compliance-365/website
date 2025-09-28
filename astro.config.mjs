import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://<YOUR_GITHUB_USERNAME>.github.io',
  outDir: 'dist',
  integrations: [sitemap()],
  build: { format: 'directory' }
});