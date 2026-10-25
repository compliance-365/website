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
  // The first 6 self-serve framework modules + the AI add-on are priced;
  // Privacy Act is waiting on its Paddle prices (see MODULES below).
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
  // Paddle Discount id ('dsc_...') for the bundle in BUNDLE_DISCOUNTS.
  // Empty = not created yet; see BUNDLE_DISCOUNTS below.
  bundleDiscountId: '',
  // Currencies checkout may charge in. A currency belongs here only once
  // every price in SELF_SERVE.priceIds carries its Paddle
  // unit_price_override (run tools/paddle-price-overrides.mjs, then add
  // the code here). Until then /pricing still SHOWS that currency's list
  // prices, and /start/ offers a call or an AUD checkout instead of
  // opening a checkout that would charge a different amount from the one
  // the visitor was quoted. AUD is the catalogue's base currency.
  liveCurrencies: ['AUD'],
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
// that ordering. Paddle's Price objects were moved to these amounts
// (confirmed October 2026), so checkout charges what this page shows.
// Change a price here only together with its Paddle Price.
export const MODULES = [
  { id: 'iso27001', name: 'ISO 27001',      tag: 'Information security', prices: { micro: 7000, growth: 9999, enterprise: null } },
  { id: 'soc2',     name: 'SOC 2',          tag: 'Enterprise procurement', premium: true, prices: { micro: 8999, growth: 12999, enterprise: null } },
  { id: 'essential8', name: 'Essential Eight', tag: 'ACSC maturity',      prices: { micro: 7000, growth: 9999, enterprise: null } },
  { id: 'iso42001', name: 'ISO 42001',      tag: 'AI governance',         prices: { micro: 7000, growth: 9999, enterprise: null } },
  { id: 'iso27701', name: 'ISO 27701',      tag: 'Privacy (PIMS)',        prices: { micro: 7000, growth: 9999, enterprise: null } },
  { id: 'nistcsf',  name: 'NIST CSF',       tag: 'Cyber risk framework',  prices: { micro: 7000, growth: 9999, enterprise: null } },
  // The 13 APPs and the Notifiable Data Breaches scheme: a smaller control
  // set and no certification audit, so it is priced below the others.
  // Until its two Paddle prices exist (privacyact_micro / privacyact_growth
  // in SELF_SERVE.priceIds and PRICE_TO_MODULE in lambda/provision.js and
  // lambda/webhook.js; steps in tools/SELF-SERVE-SETUP.md), /start/ shows
  // the "talk to us" fallback for any selection that includes it, the
  // same as any module without a price id.
  { id: 'privacyact', name: 'Privacy Act', tag: 'Australian Privacy Principles', prices: { micro: 4999, growth: 6999, enterprise: null } }
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

// Compliance365 consulting day rate, AUD ex GST: for clients who run
// Checkpoint themselves and buy days as they need them (the internal
// audit, set-up help, audit-day support). Used by the pricing page and
// the cost estimator.
export const CONSULTING_DAY_RATE = 2000;

// Consulting-led / not self-serve — shown on the page as "Contact us".
// `detail` is what scoping covers, shown on the card.
export const CONTACT_FRAMEWORKS = [
  { id: 'is18', name: 'IS18 (QGEA)', tag: 'Queensland Government', detail: 'Scoped to your agency, systems in scope and the assurance report you need before anything is quoted.' },
  { id: 'rffr', name: 'RFFR', tag: 'DEWR Employment Services', detail: 'Scoped to your provider arrangements and accreditation timeline before anything is quoted.' },
  { id: 'dispirap', name: 'DISP / ISM / IRAP', tag: 'Defence & government', detail: 'Scoped to your sponsorship, vetting and classification requirements before anything is quoted.' },
  { id: 'cps234', name: 'APRA CPS 234', tag: 'APRA-regulated entities', detail: 'For banks, insurers and super funds. Scoped to your information assets, third parties and board reporting before anything is quoted.' }
];

// Volume discount on the combined annual price when a client licenses
// more than one module. Applied to the subtotal of all selected modules
// (add-ons excluded). Highest qualifying threshold wins, so keep this
// list ordered from the largest minModules down.
//
// Checkout only applies it once SELF_SERVE.bundleDiscountId names the
// matching recurring 10% Discount in Paddle (restricted to the framework
// prices, not the AI add-on; steps in tools/SELF-SERVE-SETUP.md). Until
// then /start/ sends any selection that qualifies to a call instead of
// opening a checkout that would charge more than the quote it shows.
export const BUNDLE_DISCOUNTS = [
  { minModules: 3, rate: 0.10, label: 'Bundle: 10% off 3 or more frameworks' }
];
export const BUNDLE_MIN_MODULES = Math.min(...BUNDLE_DISCOUNTS.map((d) => d.minModules));
export const BUNDLE_RATE_PCT = Math.round(BUNDLE_DISCOUNTS[BUNDLE_DISCOUNTS.length - 1].rate * 100);

// Published list prices in other currencies. AUD lives on MODULES /
// ADDONS / ENTERPRISE above; everything here is the same catalogue,
// priced for that market rather than converted at today's rate — round
// local numbers that hold still when the exchange rate moves.
//
// Paddle charges these through unit_price_overrides on the SAME price
// ids (one override per currency, for the countries listed), so the
// Lambdas' PRICE_TO_MODULE maps need nothing new.
// tools/paddle-price-overrides.mjs writes exactly these amounts to
// Paddle; change a number here, re-run it, and checkout follows.
//
// `countries` is who Paddle charges in that currency. Anyone outside
// every list is charged the AUD base price (Paddle may show it in their
// local currency at the day's rate), so detectCurrency() quotes them AUD.
// `tax` is the suffix the pages print after a price.
//
// Consulting (CONSULTING_DAY_RATE) is not here: it is delivered from
// Australia and quoted in AUD wherever the client is.
export const EUROZONE = ['AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES'];

export const CURRENCIES = [
  { code: 'AUD', label: 'AUD $', locale: 'en-AU', tax: 'ex GST', countries: ['AU'] },
  { code: 'USD', label: 'USD $', locale: 'en-US', tax: 'plus applicable sales tax', countries: ['US'] },
  { code: 'GBP', label: 'GBP £', locale: 'en-GB', tax: 'ex VAT', countries: ['GB', 'IM', 'JE', 'GG'] },
  { code: 'EUR', label: 'EUR €', locale: 'en-IE', tax: 'ex VAT', countries: EUROZONE },
  { code: 'NZD', label: 'NZD $', locale: 'en-NZ', tax: 'ex GST', countries: ['NZ'] }
];
export const BASE_CURRENCY = CURRENCY;

// Same shape for every currency, so a missing number is a failing test
// (test/pricing.test.mjs) rather than a "$0" on the page. Starting
// position, not gospel: roughly the AUD prices at a market rate, rounded
// to local price points, keeping every ordering the AUD list has (SOC 2
// above standard, Growth above Micro, Enterprise above Growth).
export const PRICE_BOOK = {
  USD: {
    modules: {
      iso27001: { micro: 4500, growth: 6500 },
      soc2: { micro: 5900, growth: 8500 },
      essential8: { micro: 4500, growth: 6500 },
      iso42001: { micro: 4500, growth: 6500 },
      iso27701: { micro: 4500, growth: 6500 },
      nistcsf: { micro: 4500, growth: 6500 },
      privacyact: { micro: 3200, growth: 4500 }
    },
    addons: { ai: 790 },
    enterprise: { startingPrice: 9900, startingPriceSoc2: 11900 }
  },
  GBP: {
    modules: {
      iso27001: { micro: 3600, growth: 5200 },
      soc2: { micro: 4700, growth: 6800 },
      essential8: { micro: 3600, growth: 5200 },
      iso42001: { micro: 3600, growth: 5200 },
      iso27701: { micro: 3600, growth: 5200 },
      nistcsf: { micro: 3600, growth: 5200 },
      privacyact: { micro: 2600, growth: 3600 }
    },
    addons: { ai: 620 },
    enterprise: { startingPrice: 7900, startingPriceSoc2: 9400 }
  },
  EUR: {
    modules: {
      iso27001: { micro: 4200, growth: 6000 },
      soc2: { micro: 5500, growth: 7900 },
      essential8: { micro: 4200, growth: 6000 },
      iso42001: { micro: 4200, growth: 6000 },
      iso27701: { micro: 4200, growth: 6000 },
      nistcsf: { micro: 4200, growth: 6000 },
      privacyact: { micro: 3000, growth: 4200 }
    },
    addons: { ai: 720 },
    enterprise: { startingPrice: 9200, startingPriceSoc2: 10900 }
  },
  NZD: {
    modules: {
      iso27001: { micro: 7700, growth: 10999 },
      soc2: { micro: 9900, growth: 14299 },
      essential8: { micro: 7700, growth: 10999 },
      iso42001: { micro: 7700, growth: 10999 },
      iso27701: { micro: 7700, growth: 10999 },
      nistcsf: { micro: 7700, growth: 10999 },
      privacyact: { micro: 5499, growth: 7699 }
    },
    addons: { ai: 1320 },
    enterprise: { startingPrice: 16499, startingPriceSoc2: 19799 }
  }
};

export function currencyInfo(code) {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
}

export function isCurrency(code) {
  return CURRENCIES.some((c) => c.code === code);
}

// One module's annual price for a tier in a currency. null = custom
// (enterprise), exactly like MODULES' own prices.
export function modulePrice(moduleId, tierId, currency = BASE_CURRENCY) {
  const m = MODULES.find((x) => x.id === moduleId);
  if (!m || m.prices[tierId] == null) return null;
  if (currency === BASE_CURRENCY) return m.prices[tierId];
  const book = PRICE_BOOK[currency];
  return book && book.modules[moduleId] ? book.modules[moduleId][tierId] ?? null : null;
}

export function addonPrice(addonId, currency = BASE_CURRENCY) {
  const a = ADDONS.find((x) => x.id === addonId);
  if (!a) return null;
  if (currency === BASE_CURRENCY) return a.price;
  const book = PRICE_BOOK[currency];
  return book ? book.addons[addonId] ?? null : null;
}

export function enterprisePrices(currency = BASE_CURRENCY) {
  if (currency === BASE_CURRENCY || !PRICE_BOOK[currency]) {
    return { startingPrice: ENTERPRISE.startingPrice, startingPriceSoc2: ENTERPRISE.startingPriceSoc2, addonPrice: ENTERPRISE.addonPrice };
  }
  const book = PRICE_BOOK[currency];
  return { ...book.enterprise, addonPrice: book.addons.ai };
}

export function currencyForCountry(countryCode) {
  const cc = String(countryCode || '').toUpperCase();
  const hit = CURRENCIES.find((c) => c.countries.includes(cc));
  return hit ? hit.code : BASE_CURRENCY;
}

// Best guess at the visitor's billing country from what the browser
// already knows — no IP lookup, no third party. Time zone first: an
// Australian on an en-US browser is still in Australia/Sydney. The
// language region only breaks ties where the zone says nothing (UTC).
// A guess picks the default only; the visitor can always switch.
const ZONE_COUNTRY = {
  'Europe/London': 'GB', 'Europe/Belfast': 'GB', 'Europe/Isle_of_Man': 'IM', 'Europe/Jersey': 'JE', 'Europe/Guernsey': 'GG',
  'Pacific/Auckland': 'NZ', 'Pacific/Chatham': 'NZ',
  'Europe/Vienna': 'AT', 'Europe/Brussels': 'BE', 'Europe/Zagreb': 'HR', 'Asia/Nicosia': 'CY', 'Europe/Nicosia': 'CY',
  'Europe/Tallinn': 'EE', 'Europe/Helsinki': 'FI', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Athens': 'GR',
  'Europe/Dublin': 'IE', 'Europe/Rome': 'IT', 'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT', 'Europe/Luxembourg': 'LU',
  'Europe/Malta': 'MT', 'Europe/Amsterdam': 'NL', 'Europe/Lisbon': 'PT', 'Atlantic/Madeira': 'PT', 'Atlantic/Azores': 'PT',
  'Europe/Bratislava': 'SK', 'Europe/Ljubljana': 'SI', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES'
};
const US_ZONES = /^(America\/(New_York|Detroit|Chicago|Denver|Phoenix|Boise|Los_Angeles|Anchorage|Juneau|Sitka|Nome|Adak|Metlakatla|Yakutat|Menominee|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu)$/;

export function guessCountry(timeZone, languages = []) {
  const tz = String(timeZone || '');
  if (tz.startsWith('Australia/') || tz === 'Antarctica/Macquarie') return 'AU';
  if (ZONE_COUNTRY[tz]) return ZONE_COUNTRY[tz];
  if (US_ZONES.test(tz)) return 'US';
  if (tz && tz !== 'UTC' && tz !== 'Etc/UTC') return '';
  for (const lang of languages) {
    const region = String(lang).split('-')[1];
    if (region && region.length === 2) return region.toUpperCase();
  }
  return '';
}

export function detectCurrency(timeZone, languages) {
  return currencyForCountry(guessCountry(timeZone, languages));
}

// Pure pricing math — exported so the configurator UI and any test use
// the exact same computation. `selectedModuleIds` / `selectedAddonIds`
// are arrays of ids; `tierId` one of TIERS. Returns a fully itemised
// quote, or flags `custom: true` if the tier or any module has no listed
// price (→ the UI shows "Talk to us" instead of a total).
export function computeQuote(selectedModuleIds, selectedAddonIds, tierId, currency = BASE_CURRENCY) {
  const modules = MODULES.filter((m) => selectedModuleIds.includes(m.id));
  const addons = ADDONS.filter((a) => selectedAddonIds.includes(a.id));
  const moduleLines = modules.map((m) => ({ id: m.id, name: m.name, price: modulePrice(m.id, tierId, currency) }));
  const custom = tierId === 'enterprise' || moduleLines.some((l) => l.price == null);

  const subtotal = moduleLines.reduce((s, l) => s + (l.price || 0), 0);

  const discount = BUNDLE_DISCOUNTS.find((d) => modules.length >= d.minModules) || null;
  const discountAmount = discount ? Math.round(subtotal * discount.rate) : 0;

  const addonLines = addons.map((a) => ({ id: a.id, name: a.name, price: addonPrice(a.id, currency) || 0 }));
  const addonTotal = addonLines.reduce((s, l) => s + l.price, 0);

  const total = subtotal - discountAmount + addonTotal;

  return {
    custom,
    tierId,
    currency,
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

// Any currency in CURRENCIES, whole units. AUD and NZD both print "$"
// on their own pages, so a non-base dollar gets its code ("US$", "NZ$")
// to stay unambiguous next to the AUD figures elsewhere on the site.
const SYMBOL = { AUD: '$', USD: 'US$', NZD: 'NZ$', GBP: '£', EUR: '€' };
export function fmtMoney(n, currency = BASE_CURRENCY) {
  const c = currencyInfo(currency);
  return (SYMBOL[c.code] || c.code + ' ') + Number(n || 0).toLocaleString(c.locale);
}
