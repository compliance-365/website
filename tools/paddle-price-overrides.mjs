#!/usr/bin/env node
/* Compliance365 — Paddle local-currency prices
 * ------------------------------------------------------------
 * Writes src/data/pricing.js's PRICE_BOOK to Paddle as
 * unit_price_overrides on the prices checkout already sells
 * (SELF_SERVE.priceIds). An override charges a different amount, in a
 * different currency, to buyers in the listed countries — on the SAME
 * price id, so lambda/provision.js and lambda/webhook.js map it to the
 * same module with nothing changed there.
 *
 * pricing.js is the source of truth: the /pricing page shows PRICE_BOOK,
 * this tool makes Paddle charge it. Change a number there, re-run this.
 *
 * Paddle replaces a price's whole unit_price_overrides list on every
 * update, so each run writes every currency in PRICE_BOOK together.
 * Overrides added by hand in the Paddle dashboard are overwritten.
 *
 * Usage:
 *   node tools/paddle-price-overrides.mjs            dry run: prints what
 *                                                    would be written
 *   PADDLE_API_KEY=pdl_... node tools/paddle-price-overrides.mjs --apply
 *                                                    writes production
 *   PADDLE_API_KEY=pdl_sdbx_... node tools/paddle-price-overrides.mjs --apply \
 *     --env sandbox --ids sandbox-price-ids.json     writes sandbox; the
 *                                                    file maps the same
 *                                                    keys as priceIds
 *                                                    ("iso27001_micro",
 *                                                    "ai", ...) to
 *                                                    sandbox ids
 *
 * After a production --apply, open one checkout per currency (a VPN or
 * the billing-country field) to see the amount, then add the codes to
 * SELF_SERVE.liveCurrencies in pricing.js so /start/ offers checkout in
 * them. The API key needs the "Prices: write" permission (Paddle →
 * Developer tools → Authentication).
 */
import { readFileSync } from 'node:fs';
import {
  SELF_SERVE, PRICE_BOOK, CURRENCIES, BASE_CURRENCY, modulePrice, addonPrice
} from '../src/data/pricing.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const apply = flag('--apply');
const env = opt('--env') || 'production';
if (!['production', 'sandbox'].includes(env)) fail('--env must be production or sandbox');
if (env === 'sandbox' && !opt('--ids')) fail('--env sandbox needs --ids <file>: pricing.js only holds production ids');
const priceIds = opt('--ids') ? JSON.parse(readFileSync(opt('--ids'), 'utf8')) : SELF_SERVE.priceIds;
const api = env === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';

function fail(msg) { console.error('Error: ' + msg); process.exit(1); }

/* Every currency in PRICE_BOOK this price can be sold in. Paddle takes
   amounts as strings in the smallest unit; all five currencies here
   have two decimal places. */
function overridesFor(key) {
  const [id, tier] = key === 'ai' ? ['ai', null] : key.split('_');
  const out = [];
  for (const code of Object.keys(PRICE_BOOK)) {
    if (code === BASE_CURRENCY) continue;
    const amount = tier ? modulePrice(id, tier, code) : addonPrice(id, code);
    if (amount == null) fail(`PRICE_BOOK.${code} has no price for ${key}`);
    const countries = CURRENCIES.find((c) => c.code === code).countries;
    out.push({ country_codes: countries, unit_price: { amount: String(Math.round(amount * 100)), currency_code: code } });
  }
  return out;
}

async function paddle(method, path, body) {
  const res = await fetch(api + path, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.PADDLE_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.error ? json.error.detail || json.error.code : ''}`);
  return json.data;
}

if (apply && !process.env.PADDLE_API_KEY) fail('--apply needs PADDLE_API_KEY');

let failed = 0;
for (const [key, priceId] of Object.entries(priceIds)) {
  const overrides = overridesFor(key);
  const summary = overrides.map((o) => `${o.unit_price.currency_code} ${(Number(o.unit_price.amount) / 100).toLocaleString('en-AU')}`).join(', ');
  if (!apply) {
    console.log(`${key.padEnd(18)} ${priceId}  ${summary}`);
    continue;
  }
  try {
    /* Paddle rejects an override in the price's own currency; a base
       price that isn't AUD means this table no longer matches Paddle. */
    const current = await paddle('GET', '/prices/' + priceId);
    if (current.unit_price.currency_code !== BASE_CURRENCY) {
      throw new Error(`base currency is ${current.unit_price.currency_code}, expected ${BASE_CURRENCY}`);
    }
    await paddle('PATCH', '/prices/' + priceId, { unit_price_overrides: overrides });
    console.log(`updated ${key.padEnd(18)} ${priceId}  ${summary}`);
  } catch (e) {
    failed++;
    console.error(`FAILED  ${key.padEnd(18)} ${priceId}  ${e.message}`);
  }
}

if (!apply) console.log(`\nDry run against ${env}. Re-run with --apply and PADDLE_API_KEY to write these overrides.`);
if (failed) { console.error(`\n${failed} price(s) not updated.`); process.exit(1); }
