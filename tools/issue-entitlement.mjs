#!/usr/bin/env node
/* Compliance365 — activation file issuance CLI
 * ------------------------------------------------------------
 * Generates the Ed25519 keypair Checkpoint verifies activation files
 * against, and issues signed activation files for clients: a small
 * JSON document naming which tenant it activates, which frameworks
 * that tenant is licensed for, an expiry date, a grace period, and an
 * Ed25519 signature over all of it. A valid, current activation now
 * licenses the WHOLE app for a real tenant — Checkpoint refuses to
 * provision a brand-new tenant, and goes read-only for an existing
 * one whose activation has expired past its grace period, without
 * one (see SETUP.md §7a and ISSUANCE.md). Checkpoint's own client-side
 * verification lives in public/checkpoint/lib.js
 * (verifyEntitlementSignature/evaluateEntitlement/canonicalJson) —
 * this tool signs over the exact same canonicalJson() encoding so a
 * file this CLI produces always verifies in the app, and vice versa;
 * never re-implement the signing bytes separately here.
 *
 * This tool is for US (Compliance365), run against OUR private key —
 * it never runs in a client's browser and ships nowhere near the
 * deployed app. The private key it generates is the one secret this
 * whole scheme depends on: anyone holding it can issue activation
 * files for any tenant, so treat entitlement-private.json exactly like
 * a code-signing key — see ISSUANCE.md for the full key-handling
 * recommendation (Azure Key Vault) and issuing/renewing/revoking
 * workflow, including the client-facing email template.
 *
 * Usage:
 *   node tools/issue-entitlement.mjs keygen [--out-dir DIR]
 *     Generates a new Ed25519 keypair. Writes entitlement-private.json
 *     (keep secret) and prints the raw public key (base64) to paste
 *     into config.js's entitlementPublicKey.
 *
 *   node tools/issue-entitlement.mjs keygen-modules [--modules soc2,essential8,ai,...] [--out FILE] [--force]
 *     Generates one AES-256 key per premium module (every framework
 *     except iso27001, PLUS non-framework add-ons like "ai" — see
 *     ADDON_MODULES below) — the content scripts/build-content-packs.mjs
 *     encrypts into dist/checkpoint/packs/*.pack.json. Writes tools/module-
 *     keys.json (keep secret — this is what decrypts every premium
 *     pack; see ISSUANCE.md). --modules defaults to every premium
 *     module id. Re-running without --modules only fills in any
 *     module that doesn't already have a key — pass --force to
 *     regenerate ALL of them (this invalidates every pack built with
 *     the old keys and every entitlement file that embeds them; see
 *     ISSUANCE.md's rotation section).
 *
 *   node tools/issue-entitlement.mjs issue
 *     --tenant <Entra tenant ID or a verified domain>
 *     --frameworks iso27001,soc2,essential8
 *     --expiry 2027-01-01
 *     [--grace-days 14]
 *     [--type client|partner|demo]
 *     --key entitlement-private.json
 *     [--module-keys tools/module-keys.json]
 *     --out acme-corp-activation.json
 *     [--record] [--partner-tenant organizations] [--client-id GUID]
 *     Issues a signed activation file for one client tenant. --tenant
 *     accepts either the client's Entra tenant ID (a GUID, from the
 *     Entra admin center's Overview page) or one of their verified
 *     domains (e.g. contoso.com, contoso.onmicrosoft.com) — Checkpoint
 *     matches against whichever the signed-in tenant answers to.
 *     --frameworks also accepts "ai" (the AI assistant add-on — not a
 *     compliance framework, gated the same way; see AI-SETUP.md). For
 *     every premium framework/module in --frameworks, the matching AES key
 *     from --module-keys is embedded in the signed payload — that key
 *     is what lets Checkpoint decrypt exactly (and only) the modules
 *     this tenant is licensed for; iso27001 needs no key, it never
 *     ships as a pack.
 *
 *     --type defaults to 'client' — today's behaviour, and what every
 *     activation issued before this flag existed is treated as (see
 *     lib.js's normalizeEntitlementType()). Two other types:
 *       --type partner   Every framework + module key, regardless of
 *                         --frameworks (a note is printed if you passed
 *                         one anyway — it's ignored). Unlocks the
 *                         Partner Console in the app — meant for OUR
 *                         OWN tenant only, never a client's. Refuses to
 *                         run without --i-know, a deliberate speed bump
 *                         against issuing this by accident.
 *       --type demo       Same "every framework + module key" grant as
 *                         partner, but for a PROSPECT tenant during a
 *                         sales trial — the app shows a persistent
 *                         "Trial — N days remaining" banner instead of
 *                         partner-only UI, and follows the exact same
 *                         read-only degradation as any other type once
 *                         it expires (no special leniency). --expiry
 *                         defaults to 30 days out if you don't pass one
 *                         (still overridable — pass --expiry yourself
 *                         for a longer or shorter trial). See
 *                         ISSUANCE.md for the trial -> paying-client
 *                         reissue flow once they convert.
 *
 *     --record   Optional. After writing the activation file, signs
 *                you (the practitioner) in via the OAuth2 device-code
 *                flow against OUR OWN tenant and appends this issuance
 *                as a row in the "Checkpoint Partner PartnerEntitlements"
 *                SharePoint list — the same list the app's Partner
 *                Console reads, so the register stays up to date
 *                without a manual step. Prints a URL + one-time code to
 *                complete in a browser. --client-id defaults to
 *                whatever's in public/checkpoint/config.js;
 *                --partner-tenant defaults to 'organizations' (pass a
 *                specific tenant ID to skip the account picker). If
 *                --record is omitted, or the sign-in/write fails for
 *                any reason (list not yet provisioned, consent
 *                declined, network error), this prints the row as
 *                JSON instead — paste it into the Partner Console's
 *                "+ Record entitlement" form by hand. See ISSUANCE.md.
 *
 *   node tools/issue-entitlement.mjs verify
 *     --file acme-corp-activation.json
 *     --pubkey <base64 public key>
 *     Locally verifies a file this tool (or an impostor) produced —
 *     the same check Checkpoint runs client-side, useful before
 *     emailing a file to a client. Also lists which modules carry a
 *     key in the file (never prints the key values themselves), and
 *     for a demo-type file, how many days remain until expiry.
 *
 * No dependencies beyond Node's own built-ins (node:crypto's WebCrypto
 * implementation, node:fs, node:path) — nothing to npm install.
 */
import { webcrypto } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import CheckpointLib from '../public/checkpoint/lib.js';

const { signEntitlementPayload, verifyEntitlementSignature, evaluateEntitlement, bytesToBase64, addDaysToDateStr, normalizeEntitlementType, canonicalJson, sha256Hex } = CheckpointLib;
const ENTITLEMENT_TYPES = ['client', 'partner', 'demo'];
const DEMO_DEFAULT_TRIAL_DAYS = 30;

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID_FRAMEWORKS = ['iso27001', 'soc2', 'essential8', 'is18', 'iso42001', 'iso27701', 'dispirap', 'nistcsf', 'rffr'];
/* Framework ids that BUNDLE other frameworks: granting the key implies
   granting every id it lists. is18 (Queensland Government IS18:2018 /
   QGEA) is, by the policy's own definition, an ISO 27001-aligned ISMS
   plus Essential Eight uplift and reporting — an IS18 client without
   those two would see an IS18 register full of cross-references into
   frameworks they can't open. The CLI adds the bundled ids
   automatically (with a printed note) rather than failing, so the
   quoted/sold module list stays "is18" while the issued file grants
   the working set. */
const FRAMEWORK_BUNDLES = {
  is18: ['iso27001', 'essential8'],
  /* RFFR (Right Fit For Risk) is, by DEWR's own model, an ISM-based
     Statement of Applicability built on an ISO 27001 ISMS with Essential
     Eight uplift — a Category 1 provider certifies to ISO 27001 and every
     RFFR/ISM control cross-references the ISMS backbone and the E8
     strategies. Granting rffr therefore implies iso27001 + essential8, so
     the SoA's cross-references all resolve to openable registers. */
  rffr: ['iso27001', 'essential8']
};
/* Purchasable add-ons that are NOT compliance frameworks (no SoA, no
   report section) but are granted/gated the exact same way — an id in
   the same --frameworks flag and payload.frameworks array, checked in
   the app as S.entitlements.<id> — see public/checkpoint/store.js's
   window.ADDON_MODULES comment. 'ai' unlocks the AI assistant. */
const ADDON_MODULES = ['ai'];
/* The full set of ids --frameworks/--type partner|demo will accept —
   compliance frameworks plus add-on modules, one namespace. */
const GRANTABLE_IDS = VALID_FRAMEWORKS.concat(ADDON_MODULES);
/* Every framework except the included baseline, PLUS every add-on
   module, ships as an encrypted content pack and needs a module key —
   see scripts/build-content-packs.mjs. */
const PREMIUM_FRAMEWORKS = VALID_FRAMEWORKS.filter(function (f) { return f !== 'iso27001'; }).concat(ADDON_MODULES);

/* Flags that are just switches, never followed by a value — everything
   else assumes the NEXT token is this flag's value and consumes it.
   Without this list, a boolean flag placed anywhere but last on the
   command line (e.g. "--type partner --i-know --expiry 2030-01-01")
   would silently swallow the next real flag as its own "value" and
   desync the rest of the parse — --i-know specifically is likely to
   appear mid-command, unlike --force which every existing example
   already happens to place last. */
const BOOLEAN_FLAGS = new Set(['force', 'i-know', 'record']);
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2);
    if (BOOLEAN_FLAGS.has(name)) { out[name] = true; continue; }
    out[name] = argv[i + 1]; i++;
  }
  return out;
}

function fail(msg) {
  console.error('Error: ' + msg);
  process.exit(1);
}

async function cmdKeygen(args) {
  const outDir = args['out-dir'] || HERE;
  const privPath = join(outDir, 'entitlement-private.json');
  if (existsSync(privPath) && !args.force) {
    fail(privPath + ' already exists — pass --force to overwrite (this invalidates every entitlement file signed with the old key: config.js\'s entitlementPublicKey and every issued client file would need reissuing).');
  }
  const kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const jwkPriv = await webcrypto.subtle.exportKey('jwk', kp.privateKey);
  const pubRaw = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  const pubBase64 = bytesToBase64(pubRaw);

  writeFileSync(privPath, JSON.stringify(jwkPriv, null, 2) + '\n', { mode: 0o600 });
  console.log('Private key written to: ' + privPath);
  console.log('Keep this file secret — never commit it, never send it to a client.');
  console.log('');
  console.log('Public key (paste into public/checkpoint/config.js as entitlementPublicKey):');
  console.log('');
  console.log('  ' + pubBase64);
  console.log('');
}

async function cmdKeygenModules(args) {
  const outPath = args.out || join(HERE, 'module-keys.json');
  const modules = (args.modules ? args.modules.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : PREMIUM_FRAMEWORKS);
  const bad = modules.filter(function (m) { return PREMIUM_FRAMEWORKS.indexOf(m) === -1; });
  if (bad.length) fail('Unknown module id(s): ' + bad.join(', ') + '. Valid premium modules: ' + PREMIUM_FRAMEWORKS.join(', '));

  var existing = {};
  if (existsSync(outPath)) existing = JSON.parse(readFileSync(outPath, 'utf8'));

  const generated = [], kept = [];
  for (const moduleId of modules) {
    if (existing[moduleId] && !args.force) { kept.push(moduleId); continue; }
    const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
    existing[moduleId] = bytesToBase64(rawKey);
    generated.push(moduleId);
  }

  writeFileSync(outPath, JSON.stringify(existing, null, 2) + '\n', { mode: 0o600 });
  console.log('Module keys written to: ' + outPath);
  console.log('Keep this file secret — never commit it (it decrypts every premium content pack).');
  if (generated.length) console.log('Generated: ' + generated.join(', '));
  if (kept.length) console.log('Already present, left unchanged (pass --force to regenerate): ' + kept.join(', '));
  console.log('');
  console.log('Rebuild the app (npm run build) to encrypt fresh packs with these keys, and');
  console.log('re-issue any client activation that names a module whose key just changed —');
  console.log('see ISSUANCE.md\'s rotation section.');
}

async function loadPrivateKey(path) {
  if (!existsSync(path)) fail('Private key file not found: ' + path + ' — run "keygen" first.');
  const jwk = JSON.parse(readFileSync(path, 'utf8'));
  return webcrypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
}

function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

/* Dependency-free OAuth2 device-code flow against Microsoft's identity
   platform (Node's global fetch only) — signs in as the practitioner
   running this CLI, not as any service principal. Polls at the
   server-dictated interval, backing off on 'slow_down' same as any
   MSAL client would, until the user completes sign-in in a browser or
   the code expires. */
async function deviceCodeSignIn(clientId, tenant, scopes) {
  const base = 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0';
  const dcRes = await fetch(base + '/devicecode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: scopes.join(' ') })
  });
  const dc = await dcRes.json();
  if (!dcRes.ok) throw new Error('Device code request failed: ' + (dc.error_description || dc.error || dcRes.status));
  console.log('');
  console.log(dc.message);
  console.log('');

  const deadline = Date.now() + (dc.expires_in || 900) * 1000;
  let intervalMs = (dc.interval || 5) * 1000;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const tokRes = await fetch(base + '/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: dc.device_code
      })
    });
    const tok = await tokRes.json();
    if (tokRes.ok) return tok.access_token;
    if (tok.error === 'authorization_pending') continue;
    if (tok.error === 'slow_down') { intervalMs += 5000; continue; }
    throw new Error('Sign-in failed: ' + (tok.error_description || tok.error));
  }
  throw new Error('Device code expired before sign-in completed.');
}

async function graphFetch(token, path, opts) {
  opts = opts || {};
  const res = await fetch('https://graph.microsoft.com/v1.0' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + token }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) throw new Error('Graph ' + res.status + ': ' + (await res.text()));
  if (res.status === 204) return null;
  return res.json();
}

/* Best-effort read of public/checkpoint/config.js's clientId, without
   evaluating the file as script (it assigns to `window`, which doesn't
   exist here) — just enough of a regex to save re-typing a value this
   CLI's caller already put in config.js for the app itself. */
function readConfigClientId() {
  const configPath = join(HERE, '..', 'public', 'checkpoint', 'config.js');
  if (!existsSync(configPath)) return null;
  const m = readFileSync(configPath, 'utf8').match(/clientId:\s*'([^']*)'/);
  return (m && m[1]) || null;
}

/* Appends this issuance to OUR OWN tenant's PartnerEntitlements list
   (see public/checkpoint/store.js's PARTNER_DEFS — same list the
   Partner Console reads) via a delegated device-code sign-in as the
   practitioner. Never touches a client's tenant. Throws on any
   failure; the caller falls back to printing the row as JSON. */
async function recordEntitlementIssuance(payload, args) {
  const clientId = args['client-id'] || readConfigClientId();
  if (!clientId) throw new Error('no --client-id given and none found in public/checkpoint/config.js');
  const tenant = args['partner-tenant'] || 'organizations';
  const scopes = ['https://graph.microsoft.com/Sites.Manage.All', 'offline_access', 'openid', 'profile'];
  console.log('Recording this issuance to PartnerEntitlements — sign in as the practitioner:');
  const token = await deviceCodeSignIn(clientId, tenant, scopes);

  const site = await graphFetch(token, '/sites/root?$select=id');
  const listName = 'Checkpoint Partner PartnerEntitlements';
  const listsRes = await graphFetch(token, '/sites/' + site.id + '/lists?$select=id,displayName&$top=200');
  const list = (listsRes.value || []).find(function (l) { return l.displayName === listName; });
  if (!list) throw new Error('list "' + listName + '" not found — open Partner Console in the app at least once first (it provisions this list automatically)');

  const hash = await sha256Hex(webcrypto.subtle, new TextEncoder().encode(canonicalJson(payload)));
  const fields = {
    Title: payload.tenantId, TenantId: payload.tenantId, Type: payload.type,
    Modules: payload.frameworks.join(','), IssuedAt: payload.issuedAt, Expiry: payload.expiry,
    EntitlementHash: hash
  };
  await graphFetch(token, '/sites/' + site.id + '/lists/' + list.id + '/items', { method: 'POST', body: { fields: fields } });
  return fields;
}

async function cmdIssue(args) {
  const tenant = args.tenant;
  const frameworksArg = args.frameworks;
  var expiry = args.expiry;
  const graceDaysArg = args['grace-days'];
  const keyPath = args.key || join(HERE, 'entitlement-private.json');
  const outPath = args.out;
  const type = args.type === undefined ? 'client' : args.type;
  if (!tenant) fail('--tenant is required — the client\'s Entra tenant ID (Directory ID in the Entra admin center) OR one of their verified domains (e.g. contoso.com, contoso.onmicrosoft.com). Checkpoint accepts either at verification time.');
  if (!outPath) fail('--out is required (path to write the signed activation JSON file to).');
  if (graceDaysArg !== undefined && (!/^\d+$/.test(graceDaysArg))) fail('--grace-days must be a non-negative whole number of days.');
  if (ENTITLEMENT_TYPES.indexOf(type) === -1) fail('--type must be one of: ' + ENTITLEMENT_TYPES.join(', ') + ' (omit it for the default, "client").');

  /* partner is for OUR OWN tenant, never a client's — every module
     unlocked plus internal-only UI (the Partner Console).
     --i-know is a deliberate speed bump: nothing about the command
     line otherwise distinguishes "issuing a normal client file" from
     "unlocking everything Compliance365 sells, for free, forever" —
     a single missed --tenant-vs-other-flag typo shouldn't be able to
     produce the latter silently. */
  if (type === 'partner' && !args['i-know']) {
    fail('--type partner unlocks every framework plus internal-only UI (the Partner Console) and is meant for OUR OWN tenant only — never issue one for a client. Pass --i-know to confirm that\'s what you mean to do.');
  }

  var frameworks;
  if (type === 'partner' || type === 'demo') {
    if (frameworksArg) console.log('Note: --type ' + type + ' always grants every framework and add-on module — the --frameworks you passed is ignored.');
    frameworks = GRANTABLE_IDS.slice();
  } else {
    if (!frameworksArg) fail('--frameworks is required (comma-separated, e.g. iso27001,soc2 — add-on modules like "ai" go in this same list).');
    frameworks = frameworksArg.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    const bad = frameworks.filter(function (f) { return GRANTABLE_IDS.indexOf(f) === -1; });
    if (bad.length) fail('Unknown framework/module id(s): ' + bad.join(', ') + '. Valid ids: ' + GRANTABLE_IDS.join(', '));
    if (frameworks.indexOf('iso27001') === -1) {
      console.log('Note: iso27001 is the included baseline and stays enabled in Checkpoint regardless of what this file grants — adding it to --frameworks is optional, purely for the file\'s own record-keeping.');
    }
    Object.keys(FRAMEWORK_BUNDLES).forEach(function (bundleId) {
      if (frameworks.indexOf(bundleId) === -1) return;
      FRAMEWORK_BUNDLES[bundleId].forEach(function (dep) {
        if (frameworks.indexOf(dep) === -1) {
          frameworks.push(dep);
          console.log('Note: ' + bundleId + ' bundles ' + dep + ' — added it to this activation automatically.');
        }
      });
    });
  }

  /* A demo (sales trial) activation defaults to a 30-day expiry if you
     don't name one — still overridable, e.g. for a longer proof-of-
     concept. client/partner always require an explicit --expiry;
     there's no sensible universal default for either (a client's term
     comes from their contract, and a partner grant's whole point is
     supporting a long, deliberately-chosen expiry). */
  const issuedAtToday = new Date().toISOString().slice(0, 10);
  if (!expiry && type === 'demo') {
    expiry = addDaysToDateStr(issuedAtToday, DEMO_DEFAULT_TRIAL_DAYS);
    console.log('No --expiry given for this demo activation — defaulting to ' + DEMO_DEFAULT_TRIAL_DAYS + ' days out (' + expiry + ').');
  }
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) fail('--expiry is required, format YYYY-MM-DD.');

  const premiumRequested = frameworks.filter(function (f) { return f !== 'iso27001'; });
  var moduleKeys = {};
  if (premiumRequested.length) {
    const moduleKeysPath = args['module-keys'] || join(HERE, 'module-keys.json');
    if (!existsSync(moduleKeysPath)) fail('No module keys file found at ' + moduleKeysPath + ' — run "keygen-modules" first (needed to embed decryption keys for: ' + premiumRequested.join(', ') + ').');
    const allModuleKeys = JSON.parse(readFileSync(moduleKeysPath, 'utf8'));
    const missingKeys = premiumRequested.filter(function (f) { return !allModuleKeys[f]; });
    if (missingKeys.length) fail('Module key(s) missing from ' + moduleKeysPath + ' for: ' + missingKeys.join(', ') + ' — run "keygen-modules' + (type === 'partner' || type === 'demo' ? '' : ' --modules ' + missingKeys.join(',')) + '" first.');
    premiumRequested.forEach(function (f) { moduleKeys[f] = allModuleKeys[f]; });
  }

  const privateKey = await loadPrivateKey(keyPath);
  const payload = {
    tenantId: tenant,
    type: type,
    frameworks: frameworks,
    issuedAt: issuedAtToday,
    expiry: expiry,
    /* Days after expiry Checkpoint keeps operating normally (grace)
       before forcing read-only. Compliance365's standard is 14 days —
       matches lib.js's evaluateEntitlement() default when this field is
       omitted, so leaving --grace-days off is equivalent to 14, this
       just makes the number explicit in the issued file. Applies
       identically regardless of type — a demo trial gets no special
       leniency past its own expiry, same standard degradation as any
       other type (see SETUP.md §7a). */
    graceDays: graceDaysArg !== undefined ? parseInt(graceDaysArg, 10) : 14,
    /* One AES-256 key per premium framework in `frameworks` — what
       actually lets Checkpoint decrypt that module's content pack.
       iso27001 never has one; it isn't packed. Embedded directly in
       this Ed25519-signed payload, same as tenantId/frameworks/expiry
       — tampering with a key here is caught by the same signature
       check as tampering with anything else in the file. See
       ISSUANCE.md for what this does and doesn't protect against. */
    moduleKeys: moduleKeys
  };
  const signature = await signEntitlementPayload(webcrypto.subtle, privateKey, payload);
  const file = { payload: payload, signature: signature };
  writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
  console.log('Activation file written to: ' + outPath);
  console.log('Tenant: ' + tenant + '  Type: ' + type);
  console.log('Frameworks: ' + frameworks.join(', ') + (premiumRequested.length ? ' (module keys embedded for: ' + premiumRequested.join(', ') + ')' : ''));
  console.log('Expiry: ' + expiry + '  Grace period: ' + payload.graceDays + ' day(s)');
  console.log('');
  if (type === 'partner') {
    console.log('This is a partner activation — unlocks the Partner Console. Use it for Compliance365\'s own tenant only.');
  } else if (type === 'demo') {
    console.log('This is a demo/trial activation — the client sees a "Trial — N days remaining" banner until it expires, then standard read-only degradation. See ISSUANCE.md for reissuing as \'client\' once they purchase.');
  }
  console.log('Send this file to the client\'s practitioner — see ISSUANCE.md for the email template — to upload in Checkpoint\'s onboarding wizard (new tenant) or Frameworks view (renewal).');

  function printFallbackRow() {
    console.log(JSON.stringify({
      tenantId: payload.tenantId, type: payload.type, modules: payload.frameworks,
      issuedAt: payload.issuedAt, expiry: payload.expiry
    }, null, 2));
  }
  console.log('');
  if (args.record) {
    try {
      await recordEntitlementIssuance(payload, args);
      console.log('Recorded in PartnerEntitlements.');
    } catch (e) {
      console.log('Could not record automatically (' + (e.message || e) + ') — enter this row into Partner Console\'s "+ Record entitlement" form by hand:');
      printFallbackRow();
    }
  } else {
    console.log('--record was not passed — enter this row into Partner Console\'s "+ Record entitlement" form by hand, or re-run with --record:');
    printFallbackRow();
  }
}

async function cmdVerify(args) {
  const filePath = args.file;
  const pubkey = args.pubkey;
  if (!filePath) fail('--file is required.');
  if (!pubkey) fail('--pubkey is required (base64 — the same value in config.js\'s entitlementPublicKey).');
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!raw.payload || !raw.signature) fail('Not a valid activation file — missing payload/signature.');
  const ok = await verifyEntitlementSignature(webcrypto.subtle, pubkey, raw.payload, raw.signature);
  if (!ok) fail('Signature does NOT verify — this file is corrupt, tampered, or wasn\'t signed with this key.');
  console.log('Signature verifies.');
  const today = new Date().toISOString().slice(0, 10);
  const evalResult = evaluateEntitlement(raw.payload, raw.payload.tenantId, today);
  console.log('Tenant: ' + raw.payload.tenantId + '  Type: ' + normalizeEntitlementType(raw.payload.type) + (raw.payload.type === undefined ? ' (no type field — an older file, treated as client)' : ''));
  console.log('Frameworks: ' + raw.payload.frameworks.join(', '));
  console.log('Issued: ' + raw.payload.issuedAt + '  Expiry: ' + raw.payload.expiry + '  Grace: ' + (raw.payload.graceDays == null ? 14 : raw.payload.graceDays) + ' day(s)');
  console.log('Status (as of ' + today + '): ' + evalResult.status + (evalResult.graceUntil ? ' (grace ends ' + evalResult.graceUntil + ')' : ''));
  if (evalResult.type === 'demo' && evalResult.status === 'valid') {
    console.log('Trial: ' + evalResult.daysRemaining + ' day(s) remaining — this is what the client\'s "Trial — N days remaining" banner will show.');
  }
  var keyedModules = Object.keys(raw.payload.moduleKeys || {});
  console.log('Module keys present for: ' + (keyedModules.length ? keyedModules.join(', ') : 'none') + ' (values never printed).');
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  if (cmd === 'keygen') return cmdKeygen(args);
  if (cmd === 'keygen-modules') return cmdKeygenModules(args);
  if (cmd === 'issue') return cmdIssue(args);
  if (cmd === 'verify') return cmdVerify(args);
  console.log('Usage:');
  console.log('  node tools/issue-entitlement.mjs keygen [--out-dir DIR] [--force]');
  console.log('  node tools/issue-entitlement.mjs keygen-modules [--modules soc2,essential8,...] [--out FILE] [--force]');
  console.log('  node tools/issue-entitlement.mjs issue --tenant ID-OR-DOMAIN --frameworks a,b,c --expiry YYYY-MM-DD [--grace-days 14] [--type client|partner|demo] [--i-know] --key entitlement-private.json [--module-keys tools/module-keys.json] --out FILE.json [--record] [--partner-tenant organizations] [--client-id GUID]');
  console.log('  node tools/issue-entitlement.mjs verify --file FILE.json --pubkey BASE64');
  process.exit(cmd ? 1 : 0);
}

main();
