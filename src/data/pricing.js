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
// themselves in the tool for roughly a tenth of that — the price should
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
  // paddleToken empty on the LIVE site until Paddle production verification
  // completes — an empty token makes isSelfServeLive() false, so /start
  // shows the safe "book a call" fallback instead of exposing real
  // visitors to a sandbox "Test Mode" checkout that can't actually
  // transact. To go live: paste the PRODUCTION client-side token (live_...)
  // and set paddleEnv:'production' (and swap priceIds below for the
  // production price ids — sandbox and production catalogues are separate).
  // To resume SANDBOX testing on a preview/localhost, temporarily restore
  //   paddleToken: 'test_cd7d07682016fd3a1bb1c6401c2', paddleEnv:'sandbox'
  // (the sandbox price ids below already match that catalogue).
  paddleToken: '',
  paddleEnv: 'sandbox',
  // All 6 self-serve framework modules are priced in sandbox now. AI
  // add-on has no price yet — /start's per-selection check (see
  // src/pages/start/index.astro) still falls back to "book a call" for
  // anyone who selects the add-on until it's added here.
  priceIds: {
    iso27001_micro: 'pri_01ky2560831rv9zzdmcxjgv82f',
    iso27001_growth: 'pri_01ky254skh5vtwkj34b9eczb1a',
    iso27701_micro: 'pri_01ky24ktbrq0gy7bm2mk72k8sa',
    iso27701_growth: 'pri_01ky24f8vydtar052488baj4rh',
    iso42001_micro: 'pri_01ky24a5ey37g7sty7b99ehp5x',
    iso42001_growth: 'pri_01ky244htj7qexa370250f3hfp',
    soc2_micro: 'pri_01ky253bfd3xtnd81y4sv7vw4x',
    soc2_growth: 'pri_01ky251skf7qxjdtbnqxgw8thd',
    essential8_micro: 'pri_01ky250323b6yve29w3fpm6eby',
    essential8_growth: 'pri_01ky24yrnfzjqtzfc8zhdwv1vk',
    nistcsf_micro: 'pri_01ky24x1mc2tgaf5dp9e6qv74b',
    nistcsf_growth: 'pri_01ky24vq2nyh4y9hd2kth79fdf',
    ai: 'pri_01ky25w0y4m7zeas4p5ksvwex3'
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
export const MODULES = [
  { id: 'iso27001', name: 'ISO 27001',      tag: 'Information security', prices: { micro: 3500, growth: 5500, enterprise: null } },
  { id: 'soc2',     name: 'SOC 2',          tag: 'Enterprise procurement', premium: true, prices: { micro: 6000, growth: 8000, enterprise: null } },
  { id: 'essential8', name: 'Essential Eight', tag: 'ACSC maturity',      prices: { micro: 3500, growth: 5500, enterprise: null } },
  { id: 'iso42001', name: 'ISO 42001',      tag: 'AI governance',         prices: { micro: 3500, growth: 5500, enterprise: null } },
  { id: 'iso27701', name: 'ISO 27701',      tag: 'Privacy (PIMS)',        prices: { micro: 3500, growth: 5500, enterprise: null } },
  { id: 'nistcsf',  name: 'NIST CSF',       tag: 'Cyber risk framework',  prices: { micro: 3500, growth: 5500, enterprise: null } }
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
  startingPrice: 7500,       // per framework/year, standard frameworks
  startingPriceSoc2: 11000,  // SOC 2 carries the same premium over standard as it does at Micro/Growth
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
export const BUNDLE_DISCOUNTS = [
  { minModules: 4, rate: 0.25, label: '4+ frameworks — 25% off' },
  { minModules: 2, rate: 0.15, label: '2+ frameworks — 15% off' }
];

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
