# Compliance365 Site Audit

Scope: full source read of `src/pages`, `src/components`, `src/layouts`, `content/`, `public/`, `netlify.toml`, plus a local production build (`npm run build`) served on `localhost:8899` and tested with Lighthouse (desktop preset) against 5 representative pages.

**No code changes were made as part of this audit.** Findings are ordered credibility bugs → UX issues → polish, per the request.

---

## 1. Credibility bugs (fix before anything else)

### 1.1 Footer ABN is 12 digits — invalid ABN format
- **File:** `content/globals/footer.json:3`, rendered by `src/components/Footer.astro:38` (`{abn && <p class="meta">ABN {abn}</p>}`)
- **Current value:** `"abn": "686779523591"` — 12 digits.
- **Australian Business Numbers are always 11 digits.** This renders on every page footer, site-wide, on a *compliance* consultancy's site — one of the first things a skeptical visitor (or an auditor doing their own due diligence) would check.
- **Fix:** change `content/globals/footer.json` → `"abn": "68677952359"` (the real 11-digit ABN supplied by the site owner). One-line JSON edit, footer already renders whatever string is in the field.

### 1.2 Homepage links to `/results/`, which does not exist — dead link, no redirect
- **File:** `src/pages/index.astro:702` — `<a href={`${base}results/`}>See all case studies →</a>`
- The primary nav (`src/components/Header.astro:115`) links the same destination content as **`/case-studies/`** (`Results` nav item), and the footer (`src/components/Footer.astro:90`) also links `/case-studies/` ("Client results"). Only the case-study dossier block on the homepage points at `/results/` instead.
- There is no `src/pages/results/` page, and `netlify.toml` has no redirect rule mapping `/results/` → `/case-studies/`. In the built site this link **404s**.
- **Fix:** change `href={`${base}results/`}` to `href={`${base}case-studies/`}` at index.astro:702 (or add a `/results/ → /case-studies/` redirect in `netlify.toml` if `/results/` is meant to be a permanent public URL — the direct link fix is simpler and matches nav/footer).

### 1.3 Blog post slugs contain literal `.html`, producing malformed URLs
- Confirmed via `npm run build` output: the blog generates routes `/blog/E8.html/`, `/blog/ismsupdate-blog.html/`, `/blog/savings.html/`, `/blog/signup.html/`, `/blog/thirdpartyrisk.html/` (built as `E8.html/index.html` etc. under `dist/blog/`).
- These come from markdown front-matter `slug` values in `src/content/blog/*.md` that still carry a trailing `.html` from an old flat-HTML site structure. The resulting live URLs (e.g. `compliance365.com.au/blog/E8.html/`) look broken/copy-pasted to users, and are an SEO smell (a URL that reads as a filename, doubly so once trailing-slashed to `.html/`).
- **Fix:** rename the `slug` front-matter field on these posts to clean slugs (`e8`, `isms-update`, `savings`, `signup`, `third-party-risk`) and add 301 redirects from the old `.html` slugs in `netlify.toml` to avoid breaking any already-indexed/backlinked URLs.

### 1.4 Three `href="#"` links strand crawlers and no-JS users at a dead end
- **File:** `src/pages/index.astro`
  - Line 119: hero 3D "ring stage" chip — `<a id="fwLink" href="#">Explore framework →</a>`
  - Line 743: framework-finder quiz result — `<a class="btn-hdk-primary" id="frLink" href="#">Explore this path →</a>`
  - Line 974: framework-explorer tab panel — `<a class="exp-cta" id="expLink" href="#">Explore this framework →</a>`
- All three are populated client-side (`.href = d.u` / `.href = url`) once JavaScript runs and a framework is selected/computed. With JS disabled, or for a crawler that doesn't execute the click-driven logic, these render as literal `href="#"` — a link that goes nowhere and is announced by screen readers as a generic, purposeless link.
- Also found: `src/pages/posture-scan/index.astro:508` — `<a id="ps-consent-btn" href="#" target="_blank" rel="noopener">` (consent-gated download/report link, same pattern).
- **Fix:** give each anchor a sensible default `href` at render time (e.g. default to `services/iso27001/` for the framework links, since it's first in the data list) so the no-JS/pre-hydration state is a real link, not a dead stub; JS still overwrites it once the user interacts.

### 1.5 Homepage depends on an unpinned third-party CDN script for its hero visual, with no CSP anywhere on the main site
- **File:** `src/pages/index.astro:1408-1413` loads `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` with no Subresource Integrity hash, no `crossorigin` fallback beyond `.crossOrigin='anonymous'`, and no CSP restricting what else could be injected.
- `src/layouts/BaseLayout.astro` (used by every page) has **no `Content-Security-Policy` meta tag or header** at all, and `netlify.toml` has no global CSP header block either — this is inconsistent with the CSP discipline already used on `public/checkpoint/index.html` and `public/marketing/index.html` elsewhere in this repo.
- The same layout also loads Google Fonts CSS from `fonts.googleapis.com`, Microsoft Clarity, Google Tag Manager, and Apollo.io's visitor-deanonymization tracker — all unrestricted by any CSP.
- In this sandboxed audit, every one of these cross-origin requests failed to resolve (network policy blocked them — see §5), which means the homepage's 3D hero silently fell back to the static SVG ring (there is a working `s.onerror` fallback, which is good), but it also means the Lighthouse "performance" numbers below are **not representative of a real network** — Three.js r128 is ~600 KB unminified-equivalent and isn't reflected in the measured JS weight.
- **Fix:** add a CSP (`script-src 'self' https://cdnjs.cloudflare.com https://www.clarity.ms https://www.googletagmanager.com https://assets.apollo.io; ...`) to `BaseLayout.astro`, and consider self-hosting Three.js (or dropping the CDN dependency, since the codebase already has an SVG fallback that is visually reasonable on its own) to remove the availability/security risk of an unpinned third-party script controlling the hero of the homepage.

---

## 2. UX issues

### 2.1 Duplicated KPI/stat row appears twice on the homepage, verbatim
Two separate blocks render the identical four stats with the identical wording, ~450px apart in the DOM:

| | Block 1 — `.proof-ledger` | Block 2 — `.stat-ledger` |
|---|---|---|
| Location | `index.astro:94-99`, inside the hero | `index.astro:552-562`, its own full-width section right after the brand-explainer video |
| Content | `100% · First-time pass`, `8–14 · Weeks to audit-ready`, `60–80% · Below Big 4`, `$0 · Platform licences` | `8–14 · Weeks to audit-ready`, `100% · First-time pass rate`, `60–80% · Lower than Big 4`, `$0 · New platform licences` |

Same four numbers, same claims, reworded labels, two different visual treatments (compact inline ledger in the hero vs. a full-bleed stat band). A visitor sees the same "100% / 8–14 weeks / 60–80% / $0" pitch twice within the first two scroll-lengths of the page, before reaching any of the nine other homepage sections.
- **Recommendation:** keep one. The hero `.proof-ledger` earns its place (above the fold, next to the CTA); the standalone `.stat-ledger` section (with its count-up JS) is the one to cut, or repurpose that slot for something not already said 400px above it — it currently adds height and JS work (two `IntersectionObserver`s + `requestAnimationFrame` count-up) for zero new information.

### 2.2 Nav dropdown icons are raw emoji with no `aria-hidden`
- **File:** `src/components/Header.astro:57-111` — every Services and Free Resources dropdown item is preceded by `<span class="dd-icon">🔒</span>`, `🛡️`, `🤖`, `🇦🇺`, `✅`, `🏛️`, `📋`, `🎁`, `⚡`, `📝`, `📚`, `💡`. None of the eleven `dd-icon` spans carry `aria-hidden="true"`.
- Screen readers will announce the Unicode name of each glyph before the link text — e.g. "lock, ISO 27001 — Security" / "flag Australia, Essential Eight" / "robot, ISO 42001 — AI Governance". This is pure noise on every single nav item, on every page, for screen-reader users — the exact "emoji-as-icons in nav links (screen-reader noise)" the audit asked about.
- The floating messaging launcher in `BaseLayout.astro` has the same pattern but is less severe since the buttons already carry `aria-label` (`aria-label="Open messaging options"`, `aria-label="Call Compliance365"`) — the emoji glyph inside (💬, 📞, 👔, 📱, ✉️) is still read as content in some screen readers because `aria-label` on the parent doesn't always suppress descendant text in every AT/browser combination, but the practical impact there is smaller than the un-labelled nav case.
- **Fix:** add `aria-hidden="true"` to all 11 `.dd-icon` spans in `Header.astro`, and to the emoji spans in `BaseLayout.astro`'s messaging launcher.

### 2.3 Cookie banner: contrast + no explicit keyboard trap protection, but otherwise sound
- **File:** `src/components/CookieBanner.astro`
- The banner is a plain `<div role="dialog">` fixed to the bottom of the viewport, `display:none` until JS toggles it. It is **not** a modal — it doesn't trap focus, doesn't set `aria-modal="true"`, and doesn't move focus into itself when it appears. That's actually the *safer* choice for a non-blocking banner (an unexpected focus trap on page load is itself an accessibility bug), so this is not a defect, but it should be a deliberate choice, not an accident — worth confirming that's intended, since it's declared `role="dialog"` (which normally implies modal semantics to some AT) without `aria-modal`.
- Both buttons (`#banner-accept`, `#banner-reject`) are real `<button>` elements — they get native keyboard focus/activation for free. No issue there.
- Lighthouse flagged `#banner-accept` (`background: #A9812E` gold-on-white, with white text) under `color-contrast` on the homepage scan (see §5) — confirm the exact ratio; `#A9812E` on white is ~2.9:1, below the 4.5:1 text-contrast minimum for the button's white label text.
- **Fix:** darken the accept-button background (or use the darker `#8B6820` hover shade as the resting state) to clear 4.5:1 against white text; decide/document whether `role="dialog"` should become `role="region"` given it isn't modal.

### 2.4 Dim/muted text fails contrast in ~30 places on the homepage alone
Lighthouse's `color-contrast` audit failed 30 distinct elements on the homepage (desktop scan), overwhelmingly the same pattern: white text at `rgba(250,247,241,.45)`–`.62` opacity set directly on dark (`#0B0B0C`/`#141416`) backgrounds — e.g.:
- `.comp-card p` (comparison-card sub-labels) — `rgba(250,247,241,.45)` on `#1B1B1D`
- `.stage-hint`, `.hdk-cue span` (hero micro-copy) — same low-opacity white on `#0B0B0C`
- `.phase p`, `.phase-deliver` in the "365 Cycle" method section
- `.pull-quote footer` (testimonial attribution lines)
- `p.muted` used repeatedly across light-background sections (`color:#6B6860`) — also flagged
- The cookie-policy link inside the cookie banner (`color:#A9812E` on white) and the announcement-bar CTA (`<a href="/services/iso42001/">Learn more →</a>` on `#0B0B0C`) were additionally flagged for `link-in-text-block` — the link is distinguished from surrounding text by colour alone, with no underline until `:hover`.
- **Recommendation:** raise the opacity floor for body/caption text on dark backgrounds (`.62` → closer to `.72–.78`, `.45` is too low for anything meant to be read rather than glanced at), and add a permanent underline (not hover-only) to inline text links like the announcement bar CTA. This is a systemic pattern (the same low-opacity-white convention repeats in a dozen components), so a single design-token fix (e.g. redefine the "muted-on-dark" custom property to a higher-contrast value) will resolve most of the 30 flagged nodes at once rather than needing 30 individual edits.

### 2.5 `label-content-name-mismatch` on the AI chat launcher
- **File:** likely `src/components/AIChat.astro` (button id `c365-launcher`) — Lighthouse flagged the button's visible label text not matching its `aria-label="Ask Compliance365 AI"`. Screen-reader users who navigate by voice command ("click Ask Compliance365 AI") may not match what's visually printed on the button. Worth a quick look at `AIChat.astro` to align the accessible name with the visible label (or vice versa).

### 2.6 Footer `<h4>` headings break document heading order
- Lighthouse's `heading-order` audit flagged `footer.footer nav.f-col h4.col-heading` (e.g. "Services", "Resources", "Company", "Get started"). Depending on what `<h2>`/`<h3>` precede it in the page, footer headings jumping straight to `<h4>` (or skipping a level from whatever the last in-page heading was) breaks the logical outline screen-reader users rely on to skim a page via the headings list.
- **Fix:** confirm the footer's heading level against the last `<h2>`/`<h3>` used in-page and adjust — likely needs to stay `<h4>` only if a `<h3>` genuinely precedes it (e.g. inside a labelled `<nav>` region), otherwise bump to match.

### 2.7 Duplicate/dead component files with literal colons in their filenames
- `ls -la src/components/` shows three files whose filenames on disk end in a literal `:` character: `Breadcrumbs.astro:`, `Clarity.astro:`, `CookieConsent.astro:` (confirmed with `file`, not a terminal-formatting artifact).
- None of these three files are imported anywhere in `src/` (`grep -r "CookieConsent"` returns zero matches; the trailing-colon filenames can't be `import`-ed by any normal Astro/JS specifier, so they are dead weight left over from a bad copy/rename). `CookieBanner.astro` (no colon) is the file actually wired into `BaseLayout.astro` and is the real cookie-consent implementation.
- **Fix:** delete the three colon-suffixed files (or rename and wire them up if `Breadcrumbs.astro` / `Clarity.astro` were meant to be used — `Breadcrumbs` in particular sounds like it should be used on the deep content pages for SEO breadcrumb markup, worth checking whether that was the intent before deleting).

---

## 3. Claims inventory — every quantified claim and where it needs substantiation

| Claim | Where it appears | Substantiation needed |
|---|---|---|
| **100% first-time pass rate** | Hero (`index.astro:87,95`), stat ledger (`:557`), "How we compare" boutique card (`:865`), 365-cycle "Certify" phase (`:927`) | Repeated 4× on the homepage alone. This is the single highest-stakes claim on the site — needs a defined denominator ("100% of N completed certification engagements since [date]") and ideally a named/verifiable source (even an aggregate count, "47/47 engagements"), or it reads as an unfalsifiable marketing number. FTC/ACCC-style honesty-in-advertising risk if it can't be substantiated on request. |
| **8–14 weeks to audit-ready** | Hero, stat ledger, meta description, `Base` `<meta description>`, footer CTA blurb | Needs to map to a defined scope (which framework? which company size?) — the ScopingWidget's own JS (`ScopingWidget.astro:381-388`) shows framework-specific ranges of 6–16 weeks depending on framework/size, which is more precise and *narrower per-scenario* than the blanket "8–14 weeks" headline — worth reconciling so the headline claim doesn't contradict the tool's own output. |
| **60–80% below/lower than Big 4** | Hero, stat ledger, "How we compare" Big-4 card (`:841`) | No baseline cited — "60–80% below" what specific Big-4 fee benchmark? Needs either a citable rate-card comparison or softening to "typically" language with a methodology footnote. |
| **$0 platform licences** | Hero, stat ledger | Literally true if the engagement model has no recurring SaaS fee — lowest-risk claim on the page, but still worth a footnote since "platform tax calculator" below models the *avoided* cost, implying $0 is about licences specifically, not total cost. |
| **$45–180k saved (GRC platform licences, 3 years)** | "How we compare" GRC-platform card (`:852`) | This is a *range*, and the interactive "Platform tax calculator" (`index.astro:1303-1332`) computes its own figures live from hard-coded formulas (`licence = 25000 + emp*80`, `c365 = 40000 + emp*90`) that are **not visibly sourced** — the calculator's `calc-note` does say "illustrative modelling," which is good practice, but the static $45–180k claim elsewhere on the page doesn't carry the same disclaimer. Reconcile: either caption the static claim the same way ("illustrative, see calculator below") or verify $45–180k is the calculator's actual min/max output range across its slider bounds (10–500 staff, 1–5 years) — a quick check: at 10 staff/1yr the calculator computes plat≈$80.8k, c365≈$40.9k (saving ≈$40k); at 500 staff/5yr plat≈$465k, c365≈$85k (saving ≈$380k) — so the calculator's own range at its slider extremes is **roughly $40k–$380k saved**, not $45–180k. The static claim and the interactive tool do not agree with each other. |
| **Case study: $130k over three years (platform + consulting quote)** | Case-study dossier, "Constraint" row (`:692`) | Single anonymized case study, no way to verify — standard practice to keep case studies anonymized, but "$35k/yr licence + $60k consulting" arithmetic ($35k×3 + $60k = $165k, not $130k as stated) doesn't add up as written — re-check the numbers themselves regardless of verifiability. |
| **Case study: Type II readiness in 10 weeks** | Same dossier (`:694`) | Anonymized, unverifiable from source alone — same as above, standard for case studies but flag that there's no aggregate/portfolio-level backing metric alongside the single example. |
| **Three testimonials** (Canberra gov, Sydney SaaS medical, Brisbane defence) | Testimonials section (`:1017-1038`) | Attributed only to role + company type + city, no company names, no link to a review platform (LinkedIn, Clutch, Google) — cannot be verified by a prospective buyer at all. Consider linking at least one to a public LinkedIn recommendation or named reference (with permission) to make the proof checkable. |
| **"Panel-ready in eleven weeks" / "10 weeks" / "under 3 months"** (per-testimonial timelines) | Testimonials (`:1023,1028,1033`) | Same anonymization issue — three different timeframes across three testimonials, none tied to the "8–14 weeks" headline range (11 weeks and "under 3 months" ≈ 13 weeks both fit; "10 weeks" fits too — these are at least internally consistent with the headline range, which is good). |

**Priority for substantiation:** the **100% first-time pass rate** (repeated 4×, strongest unfalsifiable-sounding claim) and the **$45–180k vs. calculator-computed $40k–$380k mismatch** are the two claims most likely to draw scrutiny and should be reconciled first.

---

## 4. Internal URL map & redirect gaps

Built from every `src/pages/**/*.astro` route plus every internal `href` found in `Header.astro`, `Footer.astro`, and `index.astro`.

**Confirmed working, consistent destinations:** `/`, `/about/`, `/contact/`, `/services/`, `/services/{iso27001,iso27701,iso42001,essential-eight,soc2,disp-ism-irap,nist-csf}/`, `/checkpoint-console/`, `/how-we-work/`, `/checklist/` (+ 5 checklist sub-pages), `/resources/` (+ 9 resource sub-pages), `/blog/`, `/case-studies/` (+ dynamic slugs), `/locations/` (+ 6 city pages), `/posture-scan/`, `/free-roadmap/`, `/book/`, `/privacy/`, `/privacy-summary/`, `/terms/`, `/cookies/`, `/thank-you/`, `/search/`, `/404/`.

**Gaps found:**
1. **`/results/`** — linked once (index.astro:702), no page, no redirect. **404 in production.** (See §1.2.)
2. **Blog slugs with `.html` in them** — `/blog/E8.html/`, `/blog/ismsupdate-blog.html/`, `/blog/savings.html/`, `/blog/signup.html/`, `/blog/thirdpartyrisk.html/` — valid (non-404) but malformed-looking URLs. (See §1.3.)
3. **`netlify.toml` trailing-slash redirects** cover `blog`, `services`, `checklist`, `resources`, `case-studies`, `locations`, and `posture-scan` — but **not** `checkpoint-console`, `free-roadmap`, or `book`. If any inbound link ever omits the trailing slash for those three (e.g. `/book` instead of `/book/`), Netlify's *implicit* redirect will handle it, but it won't get the clean, forced 301 the other sections get — low-severity inconsistency, worth adding for completeness/parity.
4. **`/brand-explainer.html`** (item 2's specific ask): confirmed this is **only ever referenced as an `<iframe src>`** (`index.astro:526,534`), never as a clickable `<a href="/brand-explainer.html">`. So it does render as an embedded player, not a raw file-path link — **no bug here**, the audit's hypothesis wasn't confirmed. Worth noting for completeness: `public/brand-explainer.html` and `public/brand-explainer-vertical.html` are standalone HTML files with their own design system (navy/blue palette, different gold value, own Google Fonts `<link>` tags) that bypass `BaseLayout.astro` entirely — no CSP, no shared nav/footer, so if either is ever visited directly (its URL is public and crawlable even though nothing links to it as a page) it looks like a different, unbranded site. Low-priority polish item, not a "credibility bug" since it's presented as an embedded video, not a page.

---

## 5. Homepage widget load & Lighthouse

### Interactive widgets on the homepage (index.astro)
Counted by distinct, independently-scripted interactive units embedded on `/`:

1. **3D framework ring** (`#ring-stage`) — Three.js WebGL scene, drag-to-rotate, click-to-select, loaded via `<script>` injection targeting `cdnjs.cloudflare.com` at runtime (§1.5).
2. **Scoping estimator** (`<ScopingWidget />`) — 3-question button-select tool with a live cost/TCO calculation (own `<script is:inline>` block, ~300 lines).
3. **Posture-scan live demo** (`#scanCard`) — animated gauge + staggered "check rows," replay button, `IntersectionObserver`-triggered.
4. **Case-study dossier** — static content, not interactive (no widget).
5. **Framework finder quiz** (`#finder`) — 3-question click-through with a rule-based recommendation engine (~40-line if/else in inline JS).
6. **Platform tax calculator** (`#calculator`) — range slider + year-toggle buttons, live-recomputed cost bars.
7. **365-cycle scroll-driven diagram** (`#method`) — scroll-position-linked SVG progress arc + phase highlighting.
8. **Framework explorer** (`#frameworks`) — tabbed panel (7 tabs) with animated overlap bars, separate from #1's ring (duplicates some of the same framework data — `DATA` object at `:1227` vs. `FW` object at `:1401`, two separately-maintained copies of overlapping framework metadata).
9. **AI chat widget** (`<AIChat />`, sitewide via `BaseLayout.astro`) — floating launcher + chat panel.
10. **Cookie consent banner** (`<CookieBanner />`, sitewide) — not really a "content" widget but is interactive JS with its own consent-mode logic.

That's **8 homepage-specific interactive widgets** (1–8) plus **2 sitewide ones** present on every page including the homepage (9–10) — a genuinely heavy single-page interactive load, and two of them (#1 and #8) independently hard-code overlapping framework/timeline data that could drift out of sync (e.g. ISO 27001 is "8–12 weeks" in `DATA` at `:1230` but "8–14 weeks" in the page's own headline stat — a minor internal inconsistency).

### Lighthouse — desktop preset, local production build, top 5 pages

| Page | Performance | Accessibility | Best Practices | SEO | Total transfer |
|---|---|---|---|---|---|
| `/` (home) | 100 | 92 | 96 | 100 | 229 KB |
| `/services/iso27001/` | 100 | 95 | 96 | 100 | 142 KB |
| `/checkpoint-console/` | 100 | 95 | 96 | 100 | 103 KB |
| `/posture-scan/` | 99 | 95 | 96 | 100 | 539 KB (367 KB JS) |
| `/case-studies/` | 100 | 95 | 96 | 100 | 108 KB |

**Important caveat — these performance numbers are not trustworthy as-is.** The audit environment's network policy blocked every third-party request the homepage makes at runtime: Google Fonts CSS, Microsoft Clarity, Google Tag Manager, Apollo.io's tracker, and — critically — the `cdnjs.cloudflare.com` Three.js library that powers the homepage's 3D hero all returned network failures (`statusCode: -1`) during the scan. That means:
- The measured 229 KB homepage weight **excludes** Three.js r128 (typically ~600 KB min+gzip) entirely, because it never loaded.
- Real-world performance depends on `cdnjs.cloudflare.com` actually being reachable and fast for every visitor — any slowness or blocking there (corporate proxies, ad-blockers, cdnjs outages) either delays the hero or (thanks to the existing `onerror` fallback) silently degrades it to the static SVG ring.
- A true performance measurement needs to run against the live site over a real network, or with the CDN allow-listed in this sandbox, to get an honest JS-weight and Core Web Vitals number for the homepage specifically. Treat "100 performance" here as "100, assuming Three.js and every analytics script fail to load" — not a real-world result.

`/posture-scan/`'s 367 KB of JS (the only page where third-party JS actually loaded in this sandbox — worth checking what's different there) is the heaviest of the five and worth a closer look outside this audit's scope.

**Accessibility (92–95/100)** — driven almost entirely by the `color-contrast` failures cataloged in §2.4, plus the `heading-order` (§2.6) and `label-content-name-mismatch` (§2.5) issues. None of the 5 pages hit 100.

---

## 6. Summary — priority order

1. **Fix the ABN** (`content/globals/footer.json`) — one-line change, highest credibility risk, site-wide. *(§1.1)*
2. **Fix the `/results/` dead link** on the homepage case-study CTA. *(§1.2)*
3. **Clean up the `.html`-suffixed blog slugs** with redirects for the old URLs. *(§1.3)*
4. **Reconcile the $45–180k static claim against the calculator's own $40k–$380k output**, and audit the "$130k over 3 years" arithmetic in the case study. *(§3)*
5. **Give the three JS-populated `href="#"` links real default targets.** *(§1.4)*
6. Add a CSP to `BaseLayout.astro`; consider self-hosting or dropping the Three.js CDN dependency. *(§1.5)*
7. Consolidate the duplicated KPI stat row. *(§2.1)*
8. `aria-hidden` the decorative nav-dropdown emoji; fix the AI-chat launcher's `label-content-name-mismatch`; fix footer `heading-order`. *(§2.2, §2.5, §2.6)*
9. Raise the "muted-on-dark" text-opacity design token to clear contrast; underline inline text links permanently, not just on hover; verify the cookie-banner accept button meets 4.5:1. *(§2.4, §2.3)*
10. Delete (or rewire) the three dead colon-suffixed component files; substantiate or soften the "100% first-time pass rate" claim; add named/linked testimonial sourcing where possible. *(§2.7, §3)*
