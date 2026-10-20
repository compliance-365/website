# Google Ads — landing pages and campaign setup

Four landing pages, one per campaign. The content lives in
`src/data/ad-landing-pages.js` and the template in `src/pages/lp/[slug].astro`.

| Campaign | Final URL |
|---|---|
| ISO 27001 | `https://www.compliance365.com.au/lp/iso27001/` |
| ISO 42001 | `https://www.compliance365.com.au/lp/iso42001/` |
| Essential Eight | `https://www.compliance365.com.au/lp/essential-eight/` |
| IS18 (Queensland) | `https://www.compliance365.com.au/lp/is18/` |

The pages are `noindex` and excluded from the sitemap. The `/services/` pages
are the ones meant to rank in organic search, and these pages would only
compete with them.

## 1. Conversion tracking (do this before spending)

A sent enquiry form fires the GA4 event **`generate_lead`** with the
parameters `form=ad_landing`, `framework` and `company_size`. Two more events
show where people drop out of the form:

- `lp_form_start`: the visitor clicked into the form.
- `cta_book_call_click`: the visitor opened the booking calendar. This event
  already fires site-wide.

Setup steps:

1. **GA4 → Admin → Events:** mark `generate_lead` as a **key event**. You can
   optionally mark `cta_book_call_click` as well.
2. **Google Ads → Goals → Conversions → Import → Google Analytics 4:**
   import `generate_lead` and set it as the **primary** conversion.
   - Import `cta_book_call_click` as a **secondary** conversion. Secondary
     means it is reported but not used for bidding.
3. **Google Ads → Admin → Linked accounts:** link GA4 and turn on
   **auto-tagging**. Every enquiry email then shows
   "(Google Ads click)" and the campaign in its "How they found us" footer.
4. Add a final URL suffix of
   `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}`.
   The keyword then appears in the enquiry email and in HubSpot.

GA4 (and so Google Ads) only records visitors who accept analytics cookies.
That means Google Ads will under-count conversions. For a true count, check
the enquiries in HubSpot, where every lead from these pages has the form
`Ad landing: <framework>`.

## 2. Starting structure

- One **Search** campaign per page. Turn off the Display Network and Search
  Partners.
- Location: **Australia**, set to "Presence" (people in Australia, not people
  interested in it).
  - IS18: target **Queensland** only.
- Bidding: start on **Maximise clicks** with a max CPC cap of about $40.
  Switch to **Maximise conversions** once you have about 15–20 conversions.
- Budget: about $2,000–2,500/month across all campaigns. Put most of it on
  ISO 27001 and Essential Eight.
- Ad schedule: business hours, Monday to Friday. Expand later once the data
  supports it.

## 3. Keywords

Use phrase match (`"..."`) and exact match (`[...]`). Don't use broad match
until conversion data exists.

**ISO 27001**
- `"iso 27001 consultant"`, `"iso 27001 consultants"`
- `"iso 27001 certification"` + `australia`, `brisbane`, `sydney`, `melbourne`
- `[iso 27001 implementation]`, `"iso 27001 gap assessment"`
- `"iso 27001 cost"`, `"iso 27001 certification cost"`
- `"isms consultant"`

**ISO 42001**
- `"iso 42001"`, `"iso 42001 certification"`, `"iso 42001 consultant"`
- `"ai governance consultant"`, `"ai management system"`
- `"ai governance framework australia"`

**Essential Eight**
- `"essential eight assessment"`, `"essential 8 assessment"`
- `"essential eight consultant"`, `"essential eight maturity level 2"`, `"e8 ml2"`
- `"essential eight compliance"`, `"essential eight audit"`

**IS18**
- `"is18"`, `"is18 compliance"`, `"is18 qld"`
- `"queensland government information security policy"`
- `"qgea is18"`, `"is18 annual return"`

**Shared negative keywords** (apply to every campaign): `jobs`, `job`,
`salary`, `course`, `training`, `free`, `pdf`, `template`, `download`, `lead
auditor`, `exam`, `certification course`, `udemy`, `what is`, `definition`,
`wiki`, `iso 9001`, `iso 14001`, `iso 45001`.

Remove `training` and `course` from the list if you later want to advertise
the training pages.

## 4. Responsive search ads (one per campaign to start)

Headline limit is 30 characters; description limit is 90 characters.

**ISO 27001**
- Headlines:
  - ISO 27001 in 10–14 Weeks
  - Fixed-Price ISO 27001
  - 100% First-Time Pass Rate
  - No GRC Platform Licence
  - Built in Your Microsoft 365
  - Australian ISO 27001 Experts
  - Get a Fixed Quote Today
  - Starting From $7,000/yr
- Descriptions:
  - Senior consultants build your ISMS inside Microsoft 365. No Vanta or Drata needed.
  - Gap assessment to certificate in 10–14 weeks. Free 30-minute scoping call.

**ISO 42001**
- Headlines:
  - ISO 42001 in 8–12 Weeks
  - AI Governance, Fixed Price
  - Answer AI Questionnaires
  - Built in Your Microsoft 365
  - 30–40% Less with ISO 27001
  - Get a Fixed Quote Today
- Descriptions:
  - An AI management system your customers and insurers accept. Starting from $7,000/yr.
  - AI inventory, risk assessment and oversight in Microsoft 365. Free scoping call.

**Essential Eight**
- Headlines:
  - Essential Eight Assessment
  - E8 Assessment in 2–3 Weeks
  - Reach ML2 in 12–16 Weeks
  - Use the M365 You Already Own
  - Starting From $7,000/yr
  - ASD-Mapped Evidence Packs
- Descriptions:
  - Know your real Essential Eight maturity in 2–3 weeks, then reach ML2 at a fixed price.
  - On M365 E5, most ML2 controls are already licensed. We configure and evidence them.

**IS18**
- Headlines:
  - IS18 Compliance Experts
  - IS18 Gap Assessment 3–4 Wks
  - Brisbane-Based Team
  - For QLD Agencies & Suppliers
  - Data Stays in Your Tenant
  - Annual Return, Done Right
- Descriptions:
  - ISO 27001-aligned ISMS, Essential Eight and the 30 September return, in one programme.
  - Helped a Queensland agency lift IS18 readiness from 48% to 82% in four weeks.

**Assets to add**
- Sitelinks:
  - Pricing → `/pricing/`
  - Case studies → `/case-studies/`
  - Free readiness checklist → `/checklist/`
  - Book a call → `/book/`
- Call asset: `0468 752 243`, shown during business hours.
- Callouts: "Fixed price", "Senior consultants", "Brisbane-based", "Remote across Australia".

## 5. When to review (and when to stop)

- **Weekly:** check the Search terms report. Add irrelevant searches as
  negative keywords.
- **After 30 days:** pause any keyword that has more than $300 spend and no
  enquiries.
- **After 90 days:** if a campaign's cost per **qualified** enquiry is above
  about $1,500, or it has produced no qualified enquiries, rework the page
  and ads, or stop the campaign.

## Pricing on the pages

Each page leads with the **starting-from** price: the Checkpoint licence for
under 50 staff. The pricing section then shows all three ways to buy:

1. Checkpoint on its own.
2. Checkpoint plus consulting days.
3. A fully managed fixed-price engagement.

The Checkpoint licence and the day rate are read from `src/data/pricing.js`,
so they always match `/pricing/` and checkout. When Paddle prices change, the
ads must change with them: update the "Starting From $7,000/yr" headlines
above.

## Keeping the pages accurate

Timelines, the pass rate and the fixed-price engagement figures are copied
from the FAQ on the matching `/services/` page. When a figure changes, update
the service page first, then `ad-landing-pages.js`.

The form asks how hands-on the visitor wants us to be. The answer appears in
the enquiry email as "Approach" and is sent to GA4 as the `approach`
parameter on `generate_lead`.
