// astro.config.mjs
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  site: 'https://www.compliance365.com.au',
  outDir: 'dist',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      i18n: false, // skip language variations
      changefreq: 'weekly', // signal how often pages are likely to change
      priority: 0.8,        // give main pages more SEO weight
      serialize(item) {
        // Add <lastmod> from front-matter or fallback to build date
        const lastmod = item?.lastmod ?? new Date().toISOString()
        return {
          url: item.url,
          lastmod,
          changefreq: item.changefreq ?? 'weekly',
          priority: item.priority ?? 0.8,
        }
      }
    })
  ],
})
