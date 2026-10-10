// schema.org SoftwareApplication for Checkpoint, priced from pricing.js so
// search results can show the real price. Used on the Checkpoint page
// (every self-serve module) and on each framework page (that module only).
import { MODULES, TIERS, CURRENCY, TRIAL_DAYS } from './pricing.js';

const SITE = 'https://www.compliance365.com.au';

function offersFor(moduleIds: string[]) {
  const offers: any[] = [];
  for (const m of MODULES.filter((x: any) => moduleIds.includes(x.id))) {
    for (const t of TIERS.filter((x: any) => !x.custom)) {
      const price = (m as any).prices[t.id];
      if (price == null) continue;
      offers.push({
        '@type': 'Offer',
        name: `${m.name}, ${t.blurb.toLowerCase()}`,
        price: String(price),
        priceCurrency: CURRENCY,
        url: `${SITE}/pricing/`,
        availability: 'https://schema.org/InStock',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: String(price), priceCurrency: CURRENCY,
          billingDuration: 'P1Y', unitText: 'per framework per year, ex GST',
        },
      });
    }
  }
  return offers;
}

export function checkpointSoftwareSchema(opts: { moduleIds?: string[]; url?: string; name?: string; description?: string } = {}) {
  const ids = opts.moduleIds || MODULES.map((m: any) => m.id);
  const offers = offersFor(ids);
  const prices = offers.map((o) => Number(o.price));
  return {
    '@type': 'SoftwareApplication',
    '@id': (opts.url || `${SITE}/checkpoint-console/`) + '#software',
    name: opts.name || 'Checkpoint',
    description: opts.description || 'Compliance console that runs in your own Microsoft 365 tenant: posture scanning, risk register, Statement of Applicability, audits and reports, stored as SharePoint lists.',
    url: opts.url || `${SITE}/checkpoint-console/`,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Governance, risk and compliance',
    operatingSystem: 'Web browser; requires Microsoft 365',
    publisher: { '@id': `${SITE}/#org` },
    isAccessibleForFree: false,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: CURRENCY,
      lowPrice: String(Math.min(...prices)),
      highPrice: String(Math.max(...prices)),
      offerCount: String(offers.length),
      offers,
    },
    potentialAction: { '@type': 'ViewAction', name: 'Try the live demo', target: `${SITE}/checkpoint-console/demo/` },
    featureList: [
      'Records stored as SharePoint lists in your own Microsoft 365 tenant',
      '49 Microsoft 365 posture checks via Microsoft Graph, read-only',
      `${TRIAL_DAYS}-day free trial and a public demo with no sign-up`,
    ],
  };
}
