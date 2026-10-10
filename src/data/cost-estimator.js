// Cost estimator data and arithmetic, shared by the estimator on each
// service page and the ISO 27001 cost guide, and by its test.
//
// Where the numbers come from (all already published on this site):
//   - consulting ranges: each service page's FAQ ("from $Xk for
//     under-50-staff scope to $Yk for 500+ staff enterprise scope"), and
//     the ISO 27001 cost guide's mid-market range ($25k–$85k for 50–500);
//   - audit fees: the service pages (ISO 27001 certification body
//     $8k–$25k; SOC 2 Type I $10k–$30k, Type II $20k–$60k) and the cost
//     guide (ISO 27001 surveillance $4k–$10k a year);
//   - Checkpoint licences: src/data/pricing.js;
//   - GRC platform licences: the ISO 27001 and SOC 2 pages ($15k–$60k a
//     year).
// `published` holds each published range. The per-headcount `bands` sit
// inside it and are our split of that range by organisation size: the
// test checks they never go outside what is published. Change a band
// only together with the page that publishes its range.
import { MODULES, TIERS, ENTERPRISE, CONSULTING_DAY_RATE } from './pricing.js';

/* Day choices for "Checkpoint plus consulting days". The visitor picks
   the number; we do not claim how many days any piece of work takes. */
export const DAY_OPTIONS = [2, 5, 10, 20];
export const DEFAULT_DAYS = 5;
export { CONSULTING_DAY_RATE };

export const SIZES = [
  { id: 's', label: 'Under 50 staff', tier: 'micro' },
  { id: 'm', label: '50–250 staff', tier: 'growth' },
  { id: 'l', label: '250–500 staff', tier: 'enterprise' },
  { id: 'xl', label: '500+ staff', tier: 'enterprise' },
];

const GRC_PLATFORM_PER_YEAR = [15000, 60000];

export const FRAMEWORKS = {
  iso27001: {
    name: 'ISO 27001', module: 'iso27001', page: 'services/iso27001/',
    scopes: [{ id: 'cert', label: 'Certification', published: [25000, 130000],
      bands: { s: [25000, 40000], m: [35000, 70000], l: [55000, 85000], xl: [80000, 130000] } }],
    audit: { label: 'Certification body: Stage 1 and Stage 2 audit', published: [8000, 25000],
      bands: { s: [8000, 12000], m: [10000, 16000], l: [14000, 22000], xl: [20000, 25000] } },
    later: { label: 'Surveillance audits, years 2 and 3', perYear: true, published: [4000, 10000],
      bands: { s: [4000, 6000], m: [5000, 8000], l: [6000, 10000], xl: [8000, 10000] } },
    grcPlatform: true,
    notes: [
      'Recertification at the end of year 3 is a full audit again, similar in cost to the initial Stage 2.',
      'Internal time is extra: typically $30k–$80k of staff hours for a mid-sized organisation.',
    ],
  },
  soc2: {
    name: 'SOC 2', module: 'soc2', page: 'services/soc2/',
    scopes: [{ id: 'readiness', label: 'Readiness and Type I', published: [22000, 115000],
      bands: { s: [22000, 35000], m: [32000, 60000], l: [50000, 85000], xl: [75000, 115000] } }],
    audit: { label: 'CPA firm: Type I report', published: [10000, 30000],
      bands: { s: [10000, 15000], m: [12000, 20000], l: [18000, 26000], xl: [24000, 30000] } },
    later: { label: 'CPA firm: Type II reports, years 2 and 3', perYear: true, published: [20000, 60000],
      bands: { s: [20000, 28000], m: [25000, 38000], l: [35000, 50000], xl: [45000, 60000] } },
    grcPlatform: true,
    notes: ['The CPA firm is engaged and paid directly by you.'],
  },
  essential8: {
    name: 'Essential Eight', module: 'essential8', page: 'services/essential-eight/',
    scopes: [
      { id: 'uplift', label: 'Maturity Level 2 uplift', published: [22000, 120000],
        bands: { s: [22000, 35000], m: [32000, 60000], l: [50000, 90000], xl: [80000, 120000] } },
      { id: 'assess', label: 'Assessment only', published: [8000, 18000],
        bands: { s: [8000, 10000], m: [9000, 13000], l: [12000, 16000], xl: [15000, 18000] } },
    ],
    notes: ['Essential Eight has no certification audit; you assess and report against the maturity model.'],
  },
  iso42001: {
    name: 'ISO 42001', module: 'iso42001', page: 'services/iso42001/',
    scopes: [{ id: 'cert', label: 'Certification', published: [18000, 100000],
      bands: { s: [18000, 28000], m: [25000, 50000], l: [45000, 75000], xl: [65000, 100000] } }],
    hasIso27001: { label: 'Already certified to ISO 27001', factor: [0.6, 0.7] },
    auditQuoted: 'Certification body fees are quoted by your certification body and are not included.',
    notes: [],
  },
  iso27701: {
    name: 'ISO 27701', module: 'iso27701', page: 'services/iso27701/',
    scopes: [
      { id: 'combined', label: 'ISO 27001 and ISO 27701 together', published: [40000, 160000],
        bands: { s: [40000, 60000], m: [55000, 95000], l: [85000, 125000], xl: [115000, 160000] } },
      { id: 'extension', label: 'Extension to an existing ISO 27001', published: [15000, 60000],
        bands: { s: [15000, 22000], m: [20000, 35000], l: [30000, 48000], xl: [42000, 60000] } },
    ],
    auditQuoted: 'Certification body fees are quoted by your certification body and are not included.',
    notes: [],
  },
  nistcsf: {
    name: 'NIST CSF', module: 'nistcsf', page: 'services/nist-csf/',
    scopes: [
      { id: 'full', label: 'Current and Target Profile with roadmap', published: [12000, 35000],
        bands: { s: [12000, 18000], m: [16000, 25000], l: [22000, 30000], xl: [28000, 35000] } },
      { id: 'current', label: 'Current Profile assessment', published: [6000, 12000],
        bands: { s: [6000, 8000], m: [7000, 10000], l: [9000, 12000], xl: [10000, 12000] } },
    ],
    notes: ['NIST CSF has no certification audit.'],
  },
};

/* Checkpoint's annual licence for a framework at a size, from pricing.js.
   `from` is true where the published price is a starting point. */
export function checkpointLicence(fw, sizeId) {
  const size = SIZES.find((s) => s.id === sizeId);
  const mod = MODULES.find((m) => m.id === FRAMEWORKS[fw].module);
  if (size.tier === 'enterprise') {
    return { amount: mod.id === 'soc2' ? ENTERPRISE.startingPriceSoc2 : ENTERPRISE.startingPrice, from: true };
  }
  return { amount: mod.prices[size.tier], from: false };
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const times = (a, n) => [a[0] * n, a[1] * n];
const round = (a) => [Math.round(a[0] / 500) * 500, Math.round(a[1] / 500) * 500];

/* One estimate. opts: { fw, size, scope, approach: 'consulting' | 'days' | 'selfserve', days, hasIso27001 }.
   Returns line items for year 1 and years 2–3 and the totals. */
export function estimate(opts) {
  const f = FRAMEWORKS[opts.fw];
  const scope = f.scopes.find((s) => s.id === opts.scope) || f.scopes[0];
  const lic = checkpointLicence(opts.fw, opts.size);
  const year1 = [], later = [];
  if (opts.approach === 'consulting') {
    let fee = scope.bands[opts.size];
    if (f.hasIso27001 && opts.hasIso27001) fee = [fee[0] * f.hasIso27001.factor[0], fee[1] * f.hasIso27001.factor[1]];
    year1.push({ label: `Compliance365 fixed-price engagement: ${scope.label.toLowerCase()}`, range: round(fee), note: 'Checkpoint included' });
  } else {
    year1.push({ label: 'Checkpoint licence, year 1', range: [lic.amount, lic.amount], from: lic.from });
    if (opts.approach === 'days') {
      const days = DAY_OPTIONS.includes(Number(opts.days)) ? Number(opts.days) : DEFAULT_DAYS;
      const fee = days * CONSULTING_DAY_RATE;
      year1.push({ label: `Compliance365 consulting: ${days} days at ${aud(CONSULTING_DAY_RATE)} a day`, range: [fee, fee] });
    }
  }
  if (f.audit) year1.push({ label: f.audit.label, range: f.audit.bands[opts.size] });
  if (f.later) later.push({ label: f.later.label, range: times(f.later.bands[opts.size], 2) });
  later.push({ label: 'Checkpoint licence, years 2 and 3', range: [lic.amount * 2, lic.amount * 2], from: lic.from });
  const sum = (items) => items.reduce((t, i) => add(t, i.range), [0, 0]);
  const y1 = sum(year1);
  return {
    year1, later,
    year1Total: y1,
    threeYearTotal: add(y1, sum(later)),
    // "from" only where a line is a starting price (Enterprise licences).
    year1From: year1.some((i) => i.from),
    threeYearFrom: year1.concat(later).some((i) => i.from),
    grcPlatform: f.grcPlatform ? times(GRC_PLATFORM_PER_YEAR, 3) : null,
    auditQuoted: f.auditQuoted || null,
    notes: opts.approach === 'days'
      ? f.notes.concat('Consulting days in years 2 and 3 are booked as you need them and are not included above.')
      : f.notes,
  };
}

export const aud = (n) => '$' + Math.round(n).toLocaleString('en-AU');
export const audRange = (r) => (r[0] === r[1] ? aud(r[0]) : `${aud(r[0])}–${aud(r[1])}`);
export { TIERS };
