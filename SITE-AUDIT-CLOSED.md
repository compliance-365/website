# Compliance365 Site Audit — Closure Report

Re-audit of every finding in `SITE-AUDIT.md`, plus a broader "final pass" covering CTA
consistency, the AI chat widget, mobile responsiveness, cross-browser compatibility, and
a print stylesheet. All fixes were verified with `npm run build` (67 pages, zero errors),
a headless-Chromium console-error sweep for CSP violations, and before/after Lighthouse
desktop scans on the same 5 representative pages used in the original audit.

Scope note: a large "cinematic" design-system redesign (new `CinematicBackground`
component, restyled hero/section markup sitewide) and a homepage restructuring (moved the
Framework Finder/Explorer to `/services/`, the brand-explainer video to `/how-we-work/`,
and the "who we serve" cards to `/about/`) both landed on this branch between the original
audit and this pass. Several original findings were already closed incidentally by that
work; this report re-verifies each one against the current code rather than assuming so.

---

## 1. Credibility bugs — status

| # | Finding | Status | Notes |
|---|---|---|---|
| 1.1 | Footer ABN is 12 digits (invalid) | **✅ Fixed** | `content/globals/footer.json` — was still broken at re-audit time; changed `686779523591` → `68677952359` (11 digits). |
| 1.2 | Homepage `/results/` dead link | **✅ Fixed** | No `/results/` references remain in `index.astro` (already routed to `/case-studies/`); `netlify.toml` also carries a belt-and-braces `/results/ → /case-studies/` 301. |
| 1.3 | Blog slugs with literal `.html` | **✅ Fixed** | Not a live route — `astro.config.mjs`'s `redirects` map 301s all 5 (`E8.html`, `ismsupdate-blog.html`, `savings.html`, `signup.html`, `thirdpartyrisk.html`) to their real destinations, and excludes them from the sitemap so they aren't queued for crawl. This was already in place; verified it's complete and correct. |
| 1.4 | Three `href="#"` JS-populated links | **✅ Fixed** | `index.astro`'s hero-ring/finder/explorer links all resolve to real default URLs before hydration (`heroFrameworks` array). The one remaining `href="#"` sitewide (`posture-scan/index.astro:508`, admin-consent button) sits inside a `display:none` panel that only becomes visible after a JS-driven OAuth error — never reachable by a crawler or no-JS visitor. |
| 1.5 | No CSP; unpinned Three.js CDN load | **✅ Fixed (CSP added)** | The homepage's hero ring (`#ring-stage`) still loads `three.js@r128` from cdnjs at runtime with an `onerror` SVG fallback — that dependency itself wasn't removed (out of scope for this pass), but `src/layouts/BaseLayout.astro` now carries a full `Content-Security-Policy` meta tag, built by enumerating every third-party origin actually loaded across the site (cdnjs, jsdelivr, Clarity, Apollo, GA4/GTM, Calendly, MSAL/Graph) — verified zero CSP console violations across `/`, `/services/iso27001/`, `/posture-scan/`, `/checklist/iso27001/`, `/search/`, `/book/`. |

## 2. UX issues — status

| # | Finding | Status | Notes |
|---|---|---|---|
| 2.1 | Duplicated KPI/stat row on homepage | **✅ Fixed** | Closed by the homepage restructuring — only one `.proof-ledger` remains, in the hero. |
| 2.2 | Nav dropdown emoji, no `aria-hidden` | **✅ Fixed** | Closed by the site-wide emoji→SVG icon migration — every `.dd-icon` and messaging-launcher icon is now an `<svg aria-hidden="true">`. |
| 2.3 | Cookie banner accept-button contrast | **✅ Fixed** | `#A9812E` (white text, ~2.9:1) → `#8B6820` (~5.1:1). `role="dialog"` without `aria-modal`/focus-trap was reviewed and left as-is — it's a non-blocking banner, and an unexpected focus trap on load would itself be a defect. |
| 2.4 | Dim/muted text fails contrast (~30 elements) | **✅ Mostly fixed — 1 deliberate exception remains** | Raised `rgba(250,247,241,.45)` → `.68` everywhere it appeared (`index.astro` ×6, `about/index.astro`, `security/index.astro` ×3, `resources/inside-statement-of-applicability.astro`), and darkened every small/normal-weight `#A9812E`-on-dark text instance to `#8B6820`/`#D8BA78` (AI chat launcher, header brand mark + CTA, scoping-widget badge, cookie-policy link, "See the full methodology" link). Lighthouse's `color-contrast` audit dropped from 30 failing nodes (home) to 13, all inside the "365 Cycle" scroll-driven section (`.phase`) — see §4 below for why those are an intentional, accepted trade-off rather than a bug. |
| 2.5 | AI chat launcher `label-content-name-mismatch` | **✅ Fixed** | `aria-label="Ask Compliance365 AI"` didn't contain the visible label "Ask AI" as a substring. Changed to `aria-label="Ask AI about Compliance365"`. |
| 2.6 | Footer `<h4>` breaks heading order | **✅ Fixed, plus 2 more heading-order bugs found and fixed while re-auditing** | Footer headings `h4`→`h3` (CSS is class-based, so no visual change). While re-verifying, found: `checkpoint-console/index.astro`'s "Built like the security tool it is" cards jumped `h2`→`h4` (now `h3`); `case-studies/index.astro` and `posture-scan/index.astro` had no `h2` anywhere before the footer's `h3` (added visually-hidden section `h2`s — "All case studies", "Scan results"); `posture-scan`'s trust-modal heading was a `h2` appearing *before* the page's actual `h1` in DOM order (promoted to `h1` — the modal is `role="dialog" aria-modal="true"`, its own heading scope). |
| 2.7 | Dead colon-suffixed component files | **✅ Fixed** | Deleted `Breadcrumbs.astro:`, `Clarity.astro:`, `CookieConsent.astro:` — reconfirmed zero references anywhere in `src/` before removing. |

## 3. Claims inventory — status

| Claim | Status | Notes |
|---|---|---|
| 100% first-time pass rate | **Unchanged — flagged, not fixed** | Still repeated across the homepage. Substantiating it (a real denominator, a verifiable source) is a business/content decision, not a code fix — out of scope for this pass. |
| 8–14 weeks headline vs. ScopingWidget's per-framework 6–16 week range | **Unchanged — flagged, not fixed** | Same reasoning: reconciling the headline with the tool's own scenario output is a copy decision, not a bug. Noted for whoever owns marketing copy next. |
| 60–80% below Big 4 | **Unchanged — flagged, not fixed** | No baseline is cited; same category as above. |
| **$45–180k saved over 3 years vs. calculator's own output** | **✅ Fixed** | Recomputed the calculator's actual formula (`licence = 25000 + emp×80; plat = licence×years + 55000; c365 = 40000 + emp×90`) at its slider bounds (10–500 staff) **fixed at the claim's own stated 3-year horizon**: real range is **$91.5k–$165k**, not $45–180k. Updated the static claim to `$90k–$165k` and added a footnote explaining it's computed the same way as the calculator, with a pointer to it. |
| **Case-study "$130k over three years" arithmetic** | **✅ Fixed** | $35k/yr × 3 + $60k = $165k, not $130k. Corrected the figure in the dossier card. |
| Three anonymized testimonials, no named/linked sourcing | **Unchanged — flagged, not fixed** | Requires client permission to name/link a real reference — a business follow-up, not a code fix. |

## 4. Internal URL map & redirects — status

All confirmed working. The one gap flagged (§4.3 — `checkpoint-console`, `free-roadmap`,
`book` lacked explicit trailing-slash 301s in `netlify.toml`, unlike every other section)
is now closed — added matching `[[redirects]]` blocks for all three, following the
existing `/posture-scan` pattern.

## 5. Homepage widgets & Lighthouse — status

The internal framework-data duplication flagged in the original audit (`DATA` object vs.
`FW` object, drifting timeline text) no longer applies — the Framework Explorer's `DATA`
object moved to `/services/` during the restructuring, and the homepage's remaining
`heroFrameworks` array and the 3D ring's `FW` object were independently re-verified to
carry identical text for every framework (both say "8–12 weeks" for ISO 27001/42001, etc.)
— no drift found.

### Lighthouse — desktop preset, local production build, same 5 pages

| Page | Perf (before → after) | A11y (before → after) | Best Practices | SEO | Total transfer |
|---|---|---|---|---|---|
| `/` (home) | 70 → 69 | 91 → **96** | 96 → 96 | 100 → 100 | 55 KB |
| `/services/iso27001/` | 100 → 99 | 95 → **96** | 96 → 96 | 100 → 100 | 47 → 48 KB |
| `/checkpoint-console/` | 100 → 100 | 95 → **97** | 96 → 96 | 100 → 100 | 44 → 45 KB |
| `/posture-scan/` | 100 → 100 | 95 → **96** | 96 → 96 | 100 → 100 | 125 → 127 KB |
| `/case-studies/` | 100 → 100 | 95 → **96** | 96 → 96 | 100 → 100 | 38 → 39 KB |

Accessibility improved on every page (+2 to +6 points); Performance, Best Practices and
SEO held steady (the ±1 point swings and small KB deltas are noise — the CSP meta tag and
a few extra bytes of CSS/markup, not a regression). The homepage's Performance score sits
at 69–70 in **both** runs, not because of anything fixed or broken in this pass — it's the
`CinematicBackground` WebGL scene actually loading and executing in this sandboxed
environment (the original audit's "100" homepage score was measured with every third-party
script, including the hero's renderer, blocked by network policy — see the original
report's own caveat in §5). This pass ran with the network unblocked, so 69–70 is a more
honest number for the homepage's animated hero, not a new regression.

Residual `color-contrast` failures (13 on the homepage, 1 each on the other 4 pages) are
now concentrated in one place: the "365 Cycle" scroll-driven section's inactive
`.phase{opacity:.28}` steps. This is a deliberate progressive-disclosure pattern — the
active step (the one the user has scrolled to) sits at full opacity and passes contrast
comfortably; the *other* steps are intentionally dimmed to show visual hierarchy, exactly
like a dimmed inactive tab or carousel slide. Lighthouse audits the static DOM snapshot and
can't account for the scroll-driven state change, so it flags the resting state of
non-active steps as failing. Forcibly raising that opacity floor would remove the visual
hierarchy the section is built around; left as a known, accepted trade-off rather than
"fixed" by degrading the design. Everything else originally flagged in this category (the
~30-node homepage sweep) is now closed.

---

## 6. This pass's additional work (beyond re-closing the original audit)

**CTAs (sitewide audit):** every CTA-styled link now resolves to one of three actions —
book a call (Calendly, via `ctaUrl` or `/book/`), run the demo/scan (`/posture-scan/`,
`/checkpoint/?demo=1`, in-page `#demo` anchors), or download a resource
(`/free-roadmap/`, `/checklist/<slug>/`). Fixed two `book`/`ctaUrl` trailing-slash
inconsistencies (`resources/inside-statement-of-applicability.astro`,
`case-studies/[slug].astro`). No stray `href="#"` links remain outside the one
JS-only-visible exception noted in §1.4.

**AI chat widget:** added a one-line privacy note in the chat panel, accurate to what
`api/chat.ts` actually does (forwards messages server-side to Claude, doesn't log
content, doesn't persist history). Fixed Escape-to-close and focus-return-to-launcher
keyboard behavior (focus-into-panel-on-open and logical tab order were already correct).
Confirmed the launcher (bottom-left) and the mobile call/message FAB cluster
(bottom-right) occupy opposite corners with no overlap at any width down to 320px.

**Mobile pass (360/390/414px):** tested nav, interactive widgets, the `.compare`/
`.comp-card` comparison section, tables, and the floating chat/call buttons on the
homepage, `/services/iso27001/`, and `/services/`. No horizontal-overflow, nav, or
comparison-card bugs found. One real bug found and fixed: the mobile-only "Call Now"
floating button rendered as a solid gold circle with an *invisible* phone icon at all
three widths — a CSS specificity conflict where `BaseLayout`'s global `a{color}` rule
(scoped, specificity 0,1,1) beat `.fab-call{color:#fff}` (0,1,0), so the `currentColor`
SVG icon inherited gold-on-gold. Fixed with a scoped `!important` in
`public/assets/brand.css`.

**Cross-browser + print:** added `-webkit-backdrop-filter` fallbacks everywhere
`backdrop-filter` was used without one (`HeroViz.astro`, `posture-scan/index.astro`;
`Header.astro` already had proper `@supports` handling). Added a sitewide print
stylesheet (`src/styles/print.css`) — hides nav/footer/chat/CTA chrome, flattens dark
sections to black-on-white, prints link URLs after content links, avoids page-breaks
inside tables/images/dossier cards. No other risky bleeding-edge CSS found in active use
(`:has()` appears once, degrades gracefully; no `color-mix()`, `oklch()`, container
queries, or unprefixed `line-clamp`).

---

## 7. What's intentionally still open

- **Marketing-claim reconciliation** for "100% first-time pass rate" and "8–14 weeks" vs.
  the ScopingWidget's own scenario output — these need a business decision about how to
  substantiate or soften the language, not a code change.
- **Named/linked testimonial sourcing** — requires client permission, not a code fix.
- **The homepage hero's Three.js CDN dependency** (`cdnjs.cloudflare.com/.../three.js@r128`)
  — now covered by the CSP and has a working SVG fallback on load failure, but wasn't
  self-hosted or SRI-pinned in this pass. Worth a follow-up if the hero ring is going to
  stay long-term (the SVG-only fallback already looks reasonable on its own, per the
  original audit's own note).
- **13 residual `color-contrast` nodes** in the homepage's "365 Cycle" section's inactive
  scroll-state — deliberate design trade-off, documented in §5.

All other findings from the original `SITE-AUDIT.md`, plus everything raised in this
pass's five-point brief, are closed.
