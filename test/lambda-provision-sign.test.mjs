// Unit coverage for the safe hardening added to lambda/provision.js and
// lambda/sign.js after a security review found provision.js trusted
// `tenantId` from the request body with no verification it belongs to
// the caller (isValidTenantIdentifier() below is the FORMAT check that
// review added; the actual caller-binding fix — resolveCallerTenantId(),
// which verifies the request against Microsoft Graph itself — landed
// later and is covered separately in test/provision-tenant-auth.test.mjs),
// and that lambda/sign.js's VALID_FRAMEWORKS/FRAMEWORK_BUNDLES
// had silently drifted out of sync with tools/issue-entitlement.mjs's
// canonical copy (missing 'rffr' entirely, silently blocking the owner
// console's "sign via endpoint" fast path for it with no clear error).
//
// tools/issue-entitlement.mjs can't be imported directly — it's a CLI
// whose main() runs unconditionally at module scope with no
// run-only-if-executed-directly guard (see test/issue-entitlement-cli.
// test.mjs's own comment on why it shells out instead) — so the drift
// check below reads its source as text and extracts the two array/object
// literals, rather than importing and triggering main()'s
// process.exit().
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isValidTenantIdentifier as provisionIsValidTenantIdentifier } from '../lambda/provision.js';
import { VALID_FRAMEWORKS as signValidFrameworks, FRAMEWORK_BUNDLES as signFrameworkBundles } from '../lambda/sign.js';
import CheckpointLib from '../public/checkpoint/lib.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_SRC = readFileSync(join(HERE, '..', 'tools', 'issue-entitlement.mjs'), 'utf8');

function extractArrayLiteral(src, constName) {
  const m = src.match(new RegExp('const ' + constName + ' = (\\[[^\\]]*\\]);'));
  assert.ok(m, constName + ' not found in tools/issue-entitlement.mjs as a single-line array literal — this extraction needs updating, not skipping');
  return JSON.parse(m[1].replace(/'/g, '"'));
}

function extractBundlesObject(src) {
  const start = src.indexOf('const FRAMEWORK_BUNDLES = {');
  assert.ok(start > -1, 'FRAMEWORK_BUNDLES not found in tools/issue-entitlement.mjs');
  // Walk braces to find the matching close — the object spans multiple
  // lines with comments, so a single-line regex (as used for
  // VALID_FRAMEWORKS above) won't capture it.
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > -1, 'could not find the closing brace of FRAMEWORK_BUNDLES');
  const body = src.slice(src.indexOf('{', start), end + 1);
  // Strip comments (the object's array values are on their own lines
  // interleaved with /* ... */ blocks) before JSON-parsing key: [values].
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '');
  const bundles = {};
  const entryRe = /(\w+):\s*(\[[^\]]*\])/g;
  let em;
  while ((em = entryRe.exec(stripped))) {
    bundles[em[1]] = JSON.parse(em[2].replace(/'/g, '"'));
  }
  return bundles;
}

describe('lambda/sign.js\'s framework list stays in sync with tools/issue-entitlement.mjs\'s canonical one', () => {
  const cliFrameworks = extractArrayLiteral(CLI_SRC, 'VALID_FRAMEWORKS');
  const cliBundles = extractBundlesObject(CLI_SRC);

  test('every framework the CLI can issue, lambda/sign.js can also issue (this caught a real gap: rffr was missing)', () => {
    const missing = cliFrameworks.filter((f) => !signValidFrameworks.includes(f));
    assert.deepEqual(missing, [], 'lambda/sign.js/VALID_FRAMEWORKS is missing framework(s) the CLI supports — the owner console\'s "sign via endpoint" fast path will reject them with no clear reason why');
  });

  test('lambda/sign.js never claims to support a framework the CLI does not (the reverse drift, equally a defect)', () => {
    // 'ai' is sign.js/provision.js-only — an add-on, not a compliance
    // framework, and CLI issuance of it goes through a different flag
    // entirely (see issue-entitlement.mjs's own ADDON_MODULES-shaped
    // handling) — excluded here rather than failing on a false positive.
    const extra = signValidFrameworks.filter((f) => f !== 'ai' && !cliFrameworks.includes(f));
    assert.deepEqual(extra, []);
  });

  test('every framework bundle (is18, rffr) matches exactly between the CLI and the signing endpoint', () => {
    assert.deepEqual(signFrameworkBundles, cliBundles);
  });
});

describe('isValidTenantIdentifier() — provision.js\'s copy stays behaviourally identical to lib.js\'s original', () => {
  const vectors = [
    ['a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789', true, 'a real Entra tenant GUID'],
    ['A1B2C3D4-E5F6-4789-A012-B3C4D5E6F789', true, 'a GUID in uppercase'],
    ['contoso.onmicrosoft.com', true, 'a verified domain'],
    ['contoso.com', true, 'a custom verified domain'],
    ['', false, 'empty string'],
    [null, false, 'null'],
    [undefined, false, 'undefined'],
    ['not-a-tenant-id', false, 'free text with no dot and not GUID-shaped'],
    ['<script>alert(1)</script>', false, 'markup injection attempt'],
    ['a1b2c3d4-e5f6-4789-a012-b3c4d5e6f78', false, 'a GUID missing one hex digit'],
    ['   contoso.onmicrosoft.com   ', true, 'a legitimate value with surrounding whitespace (trimmed)']
  ];

  for (const [input, expected, label] of vectors) {
    test(label + ' -> ' + expected, () => {
      assert.equal(provisionIsValidTenantIdentifier(input), expected);
      // The two implementations must never quietly diverge — that would
      // mean provision.js accepts something lib.js's own verification
      // path (or another Lambda) would reject, or vice versa.
      assert.equal(provisionIsValidTenantIdentifier(input), CheckpointLib.isValidTenantIdentifier(input),
        'provision.js\'s copy disagrees with lib.js\'s original for ' + JSON.stringify(input));
    });
  }
});
