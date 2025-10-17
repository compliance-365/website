// astro.config.mjs
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  site: 'https://www.compliance365.com.au', // your public URL
  // base: '/'  // don't set a project base for root-domain hosting
  outDir: 'dist',
  build: { format: 'directory' },
  integrations: [sitemap()],
})
