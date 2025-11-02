// astro.config.mjs
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  site: 'https://www.compliance365.com.au',
  outDir: 'dist',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      entryLimit: 50000,   // single file
      changefreq: 'weekly',
      priority: 0.8,
      i18n: false,
    }),
  ],
})
