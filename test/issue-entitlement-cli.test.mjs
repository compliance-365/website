// Black-box tests for tools/issue-entitlement.mjs's `issue` command and its
// --record flag (Partner Console task). The CLI has no module exports to
// import — it's a script whose only public surface is argv/stdout/exit
// code — so these run it as a real child process, same as a practitioner
// would, and assert on what it printed. Covers: the fallback JSON row
// printed when --record is omitted, the graceful fallback when --record's
// device-code sign-in fails (no real Entra app registration available in
// CI), and that --record (a boolean switch) doesn't swallow the next flag
// when placed mid-command — the same BOOLEAN_FLAGS class of bug --i-know
// was already guarding against.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'tools', 'issue-entitlement.mjs');

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'entitlement-cli-test-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

function run(args, cwd) {
  try {
    return { code: 0, out: execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8', timeout: 20000 }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

function issueOnce(dir, extraArgs) {
  run(['keygen', '--out-dir', dir], dir);
  run(['keygen-modules', '--modules', 'soc2', '--out', join(dir, 'module-keys.json')], dir);
  return run([
    'issue', '--tenant', 'contoso.onmicrosoft.com', '--frameworks', 'iso27001,soc2',
    '--expiry', '2027-01-01', '--key', join(dir, 'entitlement-private.json'),
    '--module-keys', join(dir, 'module-keys.json'), '--out', join(dir, 'activation.json'),
    ...extraArgs
  ], dir);
}

describe('issue-entitlement.mjs issue — PartnerEntitlements register (--record)', () => {
  test('without --record, prints the fallback JSON row for manual entry', () => {
    withTempDir((dir) => {
      const { code, out } = issueOnce(dir, []);
      assert.equal(code, 0);
      assert.match(out, /--record was not passed/);
      assert.match(out, /"tenantId": "contoso\.onmicrosoft\.com"/);
      assert.match(out, /"type": "client"/);
      assert.match(out, /"modules": \[\s*"iso27001",\s*"soc2"\s*\]/);
      assert.match(out, /"expiry": "2027-01-01"/);
      assert.ok(existsSync(join(dir, 'activation.json')), 'still writes the activation file even without --record');
    });
  });

  test('--record placed before other flags does not swallow the next flag (BOOLEAN_FLAGS)', () => {
    withTempDir((dir) => {
      const { out } = issueOnce(dir, ['--record', '--client-id', '00000000-0000-0000-0000-000000000000']);
      // If --record had swallowed '--client-id' as its own value, --out
      // would never have been reached correctly and the command would
      // fail before ever printing the recording attempt.
      assert.match(out, /Recording this issuance to PartnerEntitlements/);
    });
  });

  test('--record falls back to the JSON row when the device-code sign-in fails', () => {
    withTempDir((dir) => {
      const { code, out } = issueOnce(dir, ['--record', '--client-id', '00000000-0000-0000-0000-000000000000']);
      assert.equal(code, 0, 'a failed --record must not crash the CLI or change its exit code');
      assert.match(out, /Could not record automatically/);
      assert.match(out, /"tenantId": "contoso\.onmicrosoft\.com"/);
    });
  });
});
