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
 *   node tools/issue-entitlement.mjs issue
 *     --tenant <Entra tenant ID or a verified domain>
 *     --frameworks iso27001,soc2,essential8
 *     --expiry 2027-01-01
 *     [--grace-days 14]
 *     --key entitlement-private.json
 *     --out acme-corp-activation.json
 *     Issues a signed activation file for one client tenant. --tenant
 *     accepts either the client's Entra tenant ID (a GUID, from the
 *     Entra admin center's Overview page) or one of their verified
 *     domains (e.g. contoso.com, contoso.onmicrosoft.com) — Checkpoint
 *     matches against whichever the signed-in tenant answers to.
 *
 *   node tools/issue-entitlement.mjs verify
 *     --file acme-corp-activation.json
 *     --pubkey <base64 public key>
 *     Locally verifies a file this tool (or an impostor) produced —
 *     the same check Checkpoint runs client-side, useful before
 *     emailing a file to a client.
 *
 * No dependencies beyond Node's own built-ins (node:crypto's WebCrypto
 * implementation, node:fs, node:path) — nothing to npm install.
 */
import { webcrypto } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import CheckpointLib from '../public/checkpoint/lib.js';

const { signEntitlementPayload, verifyEntitlementSignature, evaluateEntitlement, bytesToBase64 } = CheckpointLib;

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID_FRAMEWORKS = ['iso27001', 'soc2', 'essential8', 'iso42001', 'iso27701', 'dispirap', 'nistcsf'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { out[a.slice(2)] = argv[i + 1]; i++; }
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

async function loadPrivateKey(path) {
  if (!existsSync(path)) fail('Private key file not found: ' + path + ' — run "keygen" first.');
  const jwk = JSON.parse(readFileSync(path, 'utf8'));
  return webcrypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
}

async function cmdIssue(args) {
  const tenant = args.tenant;
  const frameworksArg = args.frameworks;
  const expiry = args.expiry;
  const graceDaysArg = args['grace-days'];
  const keyPath = args.key || join(HERE, 'entitlement-private.json');
  const outPath = args.out;
  if (!tenant) fail('--tenant is required — the client\'s Entra tenant ID (Directory ID in the Entra admin center) OR one of their verified domains (e.g. contoso.com, contoso.onmicrosoft.com). Checkpoint accepts either at verification time.');
  if (!frameworksArg) fail('--frameworks is required (comma-separated, e.g. iso27001,soc2).');
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) fail('--expiry is required, format YYYY-MM-DD.');
  if (!outPath) fail('--out is required (path to write the signed activation JSON file to).');
  if (graceDaysArg !== undefined && (!/^\d+$/.test(graceDaysArg))) fail('--grace-days must be a non-negative whole number of days.');

  const frameworks = frameworksArg.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  const bad = frameworks.filter(function (f) { return VALID_FRAMEWORKS.indexOf(f) === -1; });
  if (bad.length) fail('Unknown framework id(s): ' + bad.join(', ') + '. Valid ids: ' + VALID_FRAMEWORKS.join(', '));
  if (frameworks.indexOf('iso27001') === -1) {
    console.log('Note: iso27001 is the included baseline and stays enabled in Checkpoint regardless of what this file grants — adding it to --frameworks is optional, purely for the file\'s own record-keeping.');
  }

  const privateKey = await loadPrivateKey(keyPath);
  const payload = {
    tenantId: tenant,
    frameworks: frameworks,
    issuedAt: new Date().toISOString().slice(0, 10),
    expiry: expiry,
    /* Days after expiry Checkpoint keeps operating normally (grace)
       before forcing read-only. Compliance365's standard is 14 days —
       matches lib.js's evaluateEntitlement() default when this field is
       omitted, so leaving --grace-days off is equivalent to 14, this
       just makes the number explicit in the issued file. */
    graceDays: graceDaysArg !== undefined ? parseInt(graceDaysArg, 10) : 14
  };
  const signature = await signEntitlementPayload(webcrypto.subtle, privateKey, payload);
  const file = { payload: payload, signature: signature };
  writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
  console.log('Activation file written to: ' + outPath);
  console.log('Tenant: ' + tenant);
  console.log('Frameworks: ' + frameworks.join(', '));
  console.log('Expiry: ' + expiry + '  Grace period: ' + payload.graceDays + ' day(s)');
  console.log('');
  console.log('Send this file to the client\'s practitioner — see ISSUANCE.md for the email template — to upload in Checkpoint\'s onboarding wizard (new tenant) or Frameworks view (renewal).');
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
  console.log('Tenant: ' + raw.payload.tenantId);
  console.log('Frameworks: ' + raw.payload.frameworks.join(', '));
  console.log('Issued: ' + raw.payload.issuedAt + '  Expiry: ' + raw.payload.expiry + '  Grace: ' + (raw.payload.graceDays == null ? 14 : raw.payload.graceDays) + ' day(s)');
  console.log('Status (as of ' + today + '): ' + evalResult.status + (evalResult.graceUntil ? ' (grace ends ' + evalResult.graceUntil + ')' : ''));
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  if (cmd === 'keygen') return cmdKeygen(args);
  if (cmd === 'issue') return cmdIssue(args);
  if (cmd === 'verify') return cmdVerify(args);
  console.log('Usage:');
  console.log('  node tools/issue-entitlement.mjs keygen [--out-dir DIR] [--force]');
  console.log('  node tools/issue-entitlement.mjs issue --tenant ID-OR-DOMAIN --frameworks a,b,c --expiry YYYY-MM-DD [--grace-days 14] --key entitlement-private.json --out FILE.json');
  console.log('  node tools/issue-entitlement.mjs verify --file FILE.json --pubkey BASE64');
  process.exit(cmd ? 1 : 0);
}

main();
