// Single source of truth for Checkpoint self-serve pricing.
//
// These are the numbers the /pricing page renders and the interactive
// configurator computes from. They intentionally mirror the shape the
// owner console's PartnerPrices list already models (per-module, per-year,
// AUD) — see public/owner/owner.js. When you change a number here, also
// update the matching row in the owner console's Prices tab so the
// revenue board and a client's actual invoice agree. (They live in two
// different runtime contexts — a build-time Astro page and the in-browser
// owner app — so there is no automatic sync; this file is the canonical
// published price, the Prices tab is what revenue is computed against.)
//
// Pricing rationale (starting position, not gospel): a hands-on framework
// programme delivered as consulting is realistically 15–30+ days at
// $2,000/day = $30k–$60k. Self-serve Checkpoint lets a team do that work
// themselves in the tool for a fraction of that — the price should
// feel like an obvious alternative to hiring it out, not a rounding error.

export const CURRENCY = 'AUD';
export const TRIAL_DAYS = 7;

// Self-serve checkout wiring. Empty by default = disabled, exactly like
// config.js's signingEndpoint: the /pricing page and /start configurator
// stay fully functional (browse prices, build a quote) and the trial CTA
// simply falls back to booking a call instead of opening Paddle. Fill
// these in once the one-time infrastructure is set up (see
// SELF-SERVE-SETUP.md) and the same buttons start real trials.
//   - paddleToken:      Paddle.js client-side token (starts "live_" or "test_")
//   - paddleEnv:        'production' | 'sandbox'
//   - priceIds:         { [moduleId]: 'pri_...' } Paddle price id per module/tier
//                       (keyed moduleId + '_' + tierId, e.g. 'iso27001_micro')
//   - activateUrl:      where Paddle sends them after checkout to sign in with
//                       Microsoft and provision their tenant (the Checkpoint app)
export const SELF_SERVE = {
  // LIVE as of the production go-live: production client-side token,
  // paddleEnv:'production', and the production catalogue's price ids
  // below (sandbox and production catalogues are separate — these are
  // NOT the same ids as sandbox testing used). To resume SANDBOX testing
  // on a preview/localhost, temporarily restore
  //   paddleToken: 'test_cd7d07682016fd3a1bb1c6401c2', paddleEnv:'sandbox',
  //   priceIds: { ...the sandbox ids... }
  // (see git history for this file for the exact sandbox block).
  paddleToken: 'live_fc4782b247aa1e3974a7ed9e240',
  paddleEnv: 'production',
  // All 6 self-serve framework modules + the AI add-on are priced.
  // Keep this in sync BY HAND with lambda/provision.js's and
  // lambda/webhook.js's PRICE_TO_MODULE whenever a price changes — see
  // this file's own top-of-file note on why they're duplicated rather
  // than shared.
  priceIds: {
    iso27001_micro: 'pri_01kyvv172apb8wfj72y06vh8gh',
    iso27001_growth: 'pri_01kyvv4ah3nrwpx8bgdhzxqbh3',
    iso27701_micro: 'pri_01kyvvt4z6xymmk3327byyj60z',
    iso27701_growth: 'pri_01kyvvvthspye2gcc2k4c8mkrz',
    iso42001_micro: 'pri_01kyvvngp1t2w23csct3jthk9p',
    iso42001_growth: 'pri_01kyvvqgapg42pkc7frxd3nqy5',
    soc2_micro: 'pri_01kyvvafz0rjmx93fknmh5shqe',
    soc2_growth: 'pri_01kyvvbwjk49d86sv92paytdrk',
    essential8_micro: 'pri_01kyvvedm0at83vabz57dax7q4',
    essential8_growth: 'pri_01kyvvjpbzmm31ypek8gxgcw0s',
    nistcsf_micro: 'pri_01kyvvxxq9bxpacjnav5d3j7ec',
    nistcsf_growth: 'pri_01kyvvzxfr78bx69grc818jt99',
    ai: 'pri_01kyvw1edqna8qn220c4rpkafg'
  },
  activateUrl: '/checkpoint/?activate=1',
  // Where the trial CTA points when checkout isn't configured yet.
  fallbackBookingUrl: 'https://outlook.office.com/book/Compliance3652@compliance365.com.au/?ismsaljsauthenabled'
};

export function isSelfServeLive() {
  return !!(SELF_SERVE.paddleToken && Object.keys(SELF_SERVE.priceIds).length);
}

// Headcount tiers. `max` is inclusive; null = no upper bound (custom).
export const TIERS = [
  { id: 'micro',  label: 'Micro',  blurb: 'Under 50 staff',   max: 49 },
  { id: 'growth', label: 'Growth', blurb: '50–250 staff',      max: 250 },
  { id: 'enterprise', label: 'Enterprise', blurb: '250+ staff', max: null, custom: true }
];

// Self-serve framework catalogue. Prices are annual, per module, in AUD,
// keyed by tier id. `enterprise` is always custom (null → "Talk to us").
// Government-sector frameworks (IS18, DISP/IRAP) are deliberately NOT
// self-serve — they involve government sponsorship, security vetting and
// scoping that a card-and-go flow can't responsibly handle — so they route
// to a consulting conversation instead (see CONTACT_FRAMEWORKS below).
// 2026-07 repricing: standard frameworks lifted from $3,500/$5,500 to
// $7,000/$9,999 (roughly 2x — the tool was priced well under what a
// normal internal-audit-equivalent programme costs) and SOC 2 lifted
// from $6,000/$8,000 to $8,999/$12,999, preserving SOC 2's premium over
// the standard frameworks (it's the "Most in demand" / highest-intent
// module) rather than letting the standard-framework increase invert
// that ordering. NOTE: these numbers are DISPLAY ONLY here — actual
// checkout amounts come from SELF_SERVE.priceIds' Paddle Price objects,
// which still point at the OLD amounts until new Paddle Prices are
// created and priceIds/provision.js/webhook.js are updated to match
// (see SELF_SERVE's own comment above). Until that happens, this page
// will show the new numbers but Paddle will charge the old ones.
export const MODULES = [
  { id: 'iso27001', name: 'ISO 27001',      tag: 'Information security', prices: { micro: 7000, growth: 9999, enterprise: null } },
  { id: 'soc2',     name: 'SOC 2',          tag: 'Enterprise procurement', premium: true, prices: { micro: 8999, growth: 12999, enterprise: null } },
  { id: 'essential8', name: 'Essential Eight', tag: 'ACSC maturity',      prices: { micro: 7000, growth: 9999, enterprise: null } },
  { id: 'iso42001', name: 'ISO 42001',      tag: 'AI governance',         prices: { micro: 7000, growth: 9999, enterprise: null } },
  { id: 'iso27701', name: 'ISO 27701',      tag: 'Privacy (PIMS)',        prices: { micro: 7000, growth: 9999, enterprise: null } },
  { id: 'nistcsf',  name: 'NIST CSF',       tag: 'Cyber risk framework',  prices: { micro: 7000, growth: 9999, enterprise: null } }
];

// Optional add-on, flat price regardless of headcount tier.
export const ADDONS = [
  { id: 'ai', name: 'AI assistant', tag: 'Compliance copilot, mock auditor, questionnaire assistant', price: 1200 }
];

// Published Enterprise (250+ staff) pricing — deliberately NOT wired into
// computeQuote()/checkout. Headcount above 250 is open-ended, so a flat
// self-serve price per framework is the wrong instrument here regardless
// of how it's disclosed; the actual annual fee is scoped to headcount,
// entity count and support level and confirmed in a written quote before
// anything is invoiced. This object exists purely to PUBLISH that
// starting point on the pricing page — a per-processor requirement
// (Paddle) that buyers can see real pricing, billing period and features
// for every plan without having to talk to sales first, same reasoning
// as the self-serve tiers above.
//
// "startingPrice" figures are anchors, not a formula: growth-tier price
// plus roughly the same proportional step micro→growth already takes.
// Update alongside MODULES/growth if those change, so Enterprise never
// reads as cheaper than Growth.
export const ENTERPRISE = {
  billingPeriod: 'Annual, invoiced (PO and multi-year terms available)',
  startingPrice: 14999,       // per framework/year, standard frameworks
  startingPriceSoc2: 17999,   // SOC 2 carries the same premium over standard as it does at Micro/Growth
  addonPrice: ADDONS.find((a) => a.id === 'ai').price,
  features: [
    'The full Checkpoint experience for every framework — control set, continuous evidence, posture scanning, reports and AI tools',
    'Multiple Microsoft 365 tenants or legal entities under one engagement',
    'Sign-in via your organisation’s existing Microsoft Entra ID — no separate credentials or directory to manage',
    'Dedicated onboarding session with a named Compliance365 contact',
    'Priority support with a defined response-time commitment',
    'Annual invoicing with purchase-order support, and a custom Master Service Agreement / Data Processing Agreement on request'
  ]
};

// Consulting-led / not self-serve — shown on the page as "Contact us".
export const CONTACT_FRAMEWORKS = [
  { id: 'is18', name: 'IS18 (QGEA)', tag: 'Queensland Government' },
  { id: 'rffr', name: 'RFFR', tag: 'DEWR Employment Services' },
  { id: 'dispirap', name: 'DISP / ISM / IRAP', tag: 'Defence & government' }
];

// Volume discount on the combined annual price when a client licenses
// more than one module. Applied to the subtotal of all selected modules
// (add-ons excluded). Highest qualifying threshold wins.
//
// Deliberately empty for now (paused, not deleted) — going live without
// a matching Paddle Discount object would have shown a discount here
// that Paddle's checkout never actually applied, charging the full
// undiscounted total instead. Re-add entries here (and create the
// matching recurring % Discount in Paddle, then pass its id at checkout
// in src/pages/start/index.astro) whenever bundle pricing is offered.
export const BUNDLE_DISCOUNTS = [];

// Pure pricing math — exported so the configurator UI and any test use
// the exact same computation. `selectedModuleIds` / `selectedAddonIds`
// are arrays of ids; `tierId` one of TIERS. Returns a fully itemised
// quote, or flags `custom: true` if the tier or any module has no listed
// price (→ the UI shows "Talk to us" instead of a total).
export function computeQuote(selectedModuleIds, selectedAddonIds, tierId) {
  const modules = MODULES.filter((m) => selectedModuleIds.includes(m.id));
  const addons = ADDONS.filter((a) => selectedAddonIds.includes(a.id));
  const custom = tierId === 'enterprise' || modules.some((m) => m.prices[tierId] == null);

  const moduleLines = modules.map((m) => ({ id: m.id, name: m.name, price: m.prices[tierId] }));
  const subtotal = moduleLines.reduce((s, l) => s + (l.price || 0), 0);

  const discount = BUNDLE_DISCOUNTS.find((d) => modules.length >= d.minModules) || null;
  const discountAmount = discount ? Math.round(subtotal * discount.rate) : 0;

  const addonLines = addons.map((a) => ({ id: a.id, name: a.name, price: a.price }));
  const addonTotal = addonLines.reduce((s, l) => s + l.price, 0);

  const total = subtotal - discountAmount + addonTotal;

  return {
    custom,
    tierId,
    moduleLines,
    addonLines,
    subtotal,
    discount: discount ? { rate: discount.rate, label: discount.label, amount: discountAmount } : null,
    addonTotal,
    total
  };
}

// AUD money formatting, whole dollars (these are annual list prices, never
// sub-dollar). Kept here so page and configurator format identically.
export function fmtAud(n) {
  return '$' + Number(n || 0).toLocaleString('en-AU');
}
