// Every control and clause code a client tenant can currently hold a
// record against — ISO 27001 and the NIST CSF subcategories from
// store.js, clause codes from CLAUSE_DEFS, and each premium framework
// from its content pack when checkpoint-content/ is present. Shared by
// the stability test and scripts/snapshot-control-codes.mjs so the two
// can never read codes differently.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function currentCodes() {
  global.window = global.window || {};
  window.CHECKPOINT_CONFIG = window.CHECKPOINT_CONFIG || { scopesProvision: [] };
  require('../../public/checkpoint/store.js');
  const frameworks = {};
  const add = (fw, code) => { (frameworks[fw] = frameworks[fw] || new Set()).add(code); };
  window.FRAMEWORKS.iso27001.controls.forEach((c) => add('iso27001', c.code));
  (window.NIST_SUBCATEGORIES || []).forEach((c) => add('nistcsf', c.code));
  const dir = new URL('../../checkpoint-content/', import.meta.url);
  const contentAvailable = existsSync(new URL('nistcsf.json', dir));
  if (contentAvailable) {
    readdirSync(dir).filter((f) => f.endsWith('.json')).forEach((f) => {
      const pack = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
      const fw = (pack.framework && pack.framework.id) || f.replace(/\.json$/, '');
      ((pack.framework && pack.framework.controls) || []).forEach((c) => add(fw, c.code));
      // NIST CSF subcategories are seeded into a tenant's Controls list on
      // demand (ensureNistSubcategories), so they are client-keyed too.
      ((pack.extra && pack.extra.subcategories) || []).forEach((c) => add(fw, c.code));
    });
  }
  const out = {};
  Object.keys(frameworks).sort().forEach((fw) => { out[fw] = [...frameworks[fw]].sort(); });
  return {
    contentAvailable,
    frameworks: out,
    clauses: window.CLAUSE_DEFS.map((c) => c.fw + '|' + c.code).sort()
  };
}
