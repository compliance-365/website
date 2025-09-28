# Compliance365 Lead-Gen Website (Free on GitHub Pages)

A sleek, fast, **edit‑once** site focused on your service offerings and lead capture. Built with Astro; deploys via GitHub Actions to **GitHub Pages**.

## Edit once (content model)
- `content/globals/*.json` — nav, footer, CTAs, trust bar
- `content/snippets/*.md` — reusable blocks (e.g., Automated Evidence Collection)
- `content/services/*.md` — service pages (ISO 27001/42001/27701, SOC 2, Essential Eight, IRAP)

## Deploy (step‑by‑step)
1. Create a GitHub repo and upload these files.
2. Edit `astro.config.mjs` → set `site` to your Pages URL:
   - User page: `https://<USERNAME>.github.io`
   - Project page: `https://<USERNAME>.github.io/<REPO_NAME>`
3. Go to **Settings → Pages**, set Source = **GitHub Actions**.
4. Commit any change to `main` — the included workflow builds & publishes.

## Custom domain
Add your domain in **Settings → Pages**, then follow the DNS instructions. HTTPS is automatic.

## Contact form
Uses Formspree. Replace `your-form-id` in `src/pages/contact.astro` with your real ID.

## Local preview (optional)
- Install Node 20
- `npm i`
- `npm run dev`

## Next steps
- Update CTAs & contact details in `/content/globals`
- Fill each service page with real copy & outcomes
- Add case studies under `/src/pages/case-studies` (or create markdown files and list them similarly)
- Add analytics (GA4/Clarity) by inserting the tag in `src/layouts/BaseLayout.astro`