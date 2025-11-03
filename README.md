# Compliance365 — Site & SEO Ops

Astro + GitHub Pages static site for Compliance365. This repo contains service pages, Insights (blog), and structured SEO metadata (sitemap, robots, OG/Twitter cards, JSON-LD).

---

## 🔧 Tech Stack

- **Astro** 4.x
- GitHub Pages deployment (`deploy.yml`)
- `@astrojs/sitemap`
- Bing **Clarity**, Google **Search Console**, Google **Analytics 4**
- Optional: Apollo tracker (website analytics)

---

## 🚀 Deploy

- Push to `main` → GitHub Actions builds to `dist` and deploys to Pages.
- Sitemap auto-generates at build: `/sitemap.xml` or `/sitemap-index.xml`.

---

## 🧭 Monthly SEO Optimisation Checklist

**Frequency:** Run these once per month.

### 1) Crawl & Index

- **Google Search Console → Sitemaps**  
  Ensure `https://www.compliance365.com.au/sitemap-index.xml` shows **Success**.
- **GSC → Indexing → Pages**  
  Investigate any “Excluded” URLs (404, “Duplicate without canonical”, etc.).
- **Robots**  
  `https://www.compliance365.com.au/robots.txt` → references sitemap and allows crawling.
- **AI.txt**  
  `https://www.compliance365.com.au/ai.txt` → syntax valid and up-to-date.

### 2) Performance & Technical

- **PageSpeed Insights** (Core Web Vitals): ≥ 90 desktop / ≥ 80 mobile
- **Lighthouse** (Chrome DevTools): resolve Accessibility/SEO warnings.
- **Titles & Descriptions**: unique per page; titles ≤ 60 chars; descriptions ≤ 155 chars.
- **Schema** (Rich Results Test): 0 errors / warnings.

### 3) Content & Keywords

- **GSC → Performance**: note new keywords; prioritise those with impressions > 50.
- Optimise **low-CTR** pages (high impressions, low clicks) with better titles/descriptions.
- Add **internal links** across Insights (e.g., ISO 27001 ↔ ISO 27701 ↔ ISO 42001).
- Publish **1–2 new Insights** per month (consistent format + meta).
- Add **FAQs** (expanders) for snippet eligibility.

### 4) Backlinks & Local Presence (bi-monthly)

- Share new posts on **LinkedIn** (company + personal).  
- Submit/refresh listings on reputable AU directories (cyber/security).  
- Keep **Google Business Profile** updated (service area).

### 5) Analytics & Behaviour (monthly)

- **GA4 → Engagement rate**: target > 55%.
- **Clarity → Recordings/Heatmaps**: check scroll depth & CTA clicks.
- **Avg read time** per Insight: target > 60s.
- **Conversions** (“Book a call”): aim > 3% from Insight traffic.

---

## 📊 Optional: SEO Audit via CI

Create `.github/workflows/seo-audit.yml` (manual run) to produce quick reports:

```yaml
name: SEO Audit
on:
  workflow_dispatch:

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Lighthouse
        run: npm i -g lighthouse

      - name: Run Lighthouse (homepage)
        run: |
          mkdir -p reports
          lighthouse https://www.compliance365.com.au \
            --quiet --chrome-flags="--headless" \
            --output=json --output-path=./reports/lighthouse-home.json

      - name: Upload reports
        uses: actions/upload-artifact@v4
        with:
          name: seo-reports
          path: reports
