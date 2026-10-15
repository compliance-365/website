// Essential Eight automation from Defender: application control from
// device events, macro and attack surface reduction rules from the
// secure configuration assessment, patching split into applications and
// operating systems with end-of-support software, and scan suggestions
// on each maturity level rather than only the target.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CheckpointLib from '../public/checkpoint/lib.js';

const { isOsSoftware, eosSoftwareResult, patchKindResult, appControlResult, secureConfigResult, e8LevelSuggestions } = CheckpointLib;
const NOW = Date.parse('2026-10-15T00:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

describe('application control (E8.1)', () => {
  test('no App Control event anywhere is not evidence of anything: null, so the scan falls back', () => {
    assert.equal(appControlResult({ Devices: 0 }, 40), null);
    assert.equal(appControlResult(undefined, 40), null);
  });
  test('audit events with no block is audit mode, which ML1 does not accept', () => {
    const r = appControlResult({ Devices: 40, Enforced: 0, AuditOnly: 40, LoadedOnly: 0 }, 40);
    assert.equal(r.result, 'review');
  });
  test('enforcing on at least 90% of workstations, none auditing, passes', () => {
    assert.equal(appControlResult({ Devices: 38, Enforced: 30, AuditOnly: 0, LoadedOnly: 7 }, 40).result, 'pass');
  });
  test('enforcing on too few workstations is a review, not a pass', () => {
    const r = appControlResult({ Devices: 10, Enforced: 10, AuditOnly: 0, LoadedOnly: 0 }, 40);
    assert.equal(r.coveragePct, 25);
    assert.equal(r.result, 'review');
  });
  test('one device still in audit mode holds the pass back', () => {
    assert.equal(appControlResult({ Devices: 40, Enforced: 39, AuditOnly: 1, LoadedOnly: 0 }, 40).result, 'review');
  });
});

describe('secure configuration: macros (E8.3) and attack surface reduction rules (E8.4)', () => {
  const rows = [
    { ConfigurationName: 'Block all Office applications from creating child processes', Applicable: 50, Compliant: 48 },
    { ConfigurationName: 'Block Office applications from injecting code into other processes', Applicable: 50, Compliant: 30 },
    { ConfigurationName: 'Block Adobe Reader from creating child processes', Applicable: 20, Compliant: 20 },
    { ConfigurationName: 'Block Win32 API calls from Office macros', Applicable: 50, Compliant: 0 },
    { ConfigurationName: 'Disable VBA macros in Office documents from the internet', Applicable: 50, Compliant: 50 },
    { ConfigurationName: 'Block JavaScript or VBScript from launching downloaded executable content', Applicable: 50, Compliant: 0 }
  ];
  test('ASR takes the Office and PDF reader rules only, and its worst one', () => {
    const r = secureConfigResult(rows, 'asr');
    assert.deepEqual(r.configs.map((c) => c.name).sort(), [
      'Block Adobe Reader from creating child processes',
      'Block Office applications from injecting code into other processes',
      'Block all Office applications from creating child processes'
    ]);
    assert.equal(r.result, 'review');
    assert.equal(r.configs[0].pct, 60);
  });
  test('macros ignore the Win32 API rule (beyond these levels) and pass on the rest', () => {
    const r = secureConfigResult(rows, 'macro');
    assert.deepEqual(r.configs.map((c) => c.name), ['Disable VBA macros in Office documents from the internet']);
    assert.equal(r.result, 'pass');
  });
  test('under half the devices compliant fails', () => {
    assert.equal(secureConfigResult([{ ConfigurationName: 'Block Office applications from creating executable content', Applicable: 10, Compliant: 4 }], 'asr').result, 'fail');
  });
  test('nothing matching, or nothing applicable, is null so the check says Manual — verify', () => {
    assert.equal(secureConfigResult([], 'asr'), null);
    assert.equal(secureConfigResult([{ ConfigurationName: 'Block Office applications from creating child processes', Applicable: 0, Compliant: 0 }], 'asr'), null);
  });
});

describe('patching split into applications (E8.2) and operating systems (E8.6)', () => {
  test('Defender software names: the OS family is the OS, everything else an application', () => {
    ['windows_11', 'windows_server_2022', 'macos', 'ubuntu_linux', 'linux_kernel'].forEach((n) => assert.ok(isOsSoftware(n), n));
    ['office', 'chrome', 'edge', 'acrobat_reader'].forEach((n) => assert.ok(!isOsSoftware(n), n));
  });
  const tvm = [
    { CveId: 'CVE-A', Severity: 'Critical', SoftwareName: 'chrome', Devices: 5, PublishedDate: daysAgo(40) },
    { CveId: 'CVE-B', Severity: 'High', SoftwareName: 'windows_11', Devices: 9, PublishedDate: daysAgo(3) }
  ];
  test('an overdue critical in an application fails E8.2 and leaves E8.6 alone', () => {
    assert.equal(patchKindResult(tvm, [], 'app', 14, NOW).result, 'fail');
    assert.equal(patchKindResult(tvm, [], 'os', 14, NOW).result, 'pass');
  });
  test('end-of-support software fails its strategy even with no open CVE', () => {
    const eos = [{ SoftwareName: 'windows_10', SoftwareVendor: 'microsoft', EndOfSupportStatus: 'EOS Software', Devices: 12 }];
    const r = patchKindResult([], eos, 'os', 14, NOW);
    assert.equal(r.result, 'fail');
    assert.equal(r.eos.products, 1);
    assert.equal(patchKindResult([], eos, 'app', 14, NOW).result, 'pass');
  });
  test('upcoming end of support is a warning, not a gap', () => {
    assert.equal(eosSoftwareResult([{ SoftwareName: 'office', EndOfSupportStatus: 'Upcoming EOS Version', Devices: 3 }]).result, 'pass');
  });
});

describe('suggestions on each maturity level', () => {
  const full = { 'mfa-all': ['E8.7-ML1'], legacy: ['E8.7-ML1'], wdac: ['E8.1-ML1'], macro: ['E8.3'] };
  const partial = { 'mfa-priv': ['E8.7-ML2', 'E8.7-ML3'], wdac: ['E8.1-ML2'] };
  const labels = { 'mfa-all': 'MFA all', legacy: 'Legacy', 'mfa-priv': 'MFA admins', wdac: 'WDAC', macro: 'Macros' };
  test('a level-mapped check suggests on its own level, not only the target', () => {
    const s = e8LevelSuggestions(full, partial, { 'mfa-all': 'pass', legacy: 'pass' }, 2, labels);
    assert.equal(s['E8.7-ML1'].st, 'Implemented');
    assert.deepEqual(s['E8.7-ML1'].labels, ['MFA all', 'Legacy']);
  });
  test('a strategy-mapped check still lands on the target level', () => {
    const s = e8LevelSuggestions(full, partial, { macro: 'pass' }, 2, labels);
    assert.equal(s['E8.3-ML2'].st, 'Implemented');
    assert.ok(!s['E8.3-ML1']);
  });
  test('a check that covers a level only in part never suggests Implemented there', () => {
    const s = e8LevelSuggestions(full, partial, { wdac: 'pass', 'mfa-priv': 'pass' }, 2, labels);
    assert.equal(s['E8.1-ML1'].st, 'Implemented');
    assert.equal(s['E8.1-ML2'].st, 'In progress');
    assert.equal(s['E8.7-ML2'].st, 'In progress');
  });
  test('levels above the target get nothing', () => {
    const s = e8LevelSuggestions(full, partial, { 'mfa-priv': 'pass' }, 2, labels);
    assert.ok(!s['E8.7-ML3']);
    assert.ok(e8LevelSuggestions(full, partial, { 'mfa-priv': 'pass' }, 3, labels)['E8.7-ML3']);
  });
  test('the worst check on a level wins, and a fail is never softened by "in part"', () => {
    const s = e8LevelSuggestions(full, partial, { 'mfa-all': 'pass', legacy: 'fail', wdac: 'fail' }, 2, labels);
    assert.equal(s['E8.7-ML1'].st, 'Not started');
    assert.equal(s['E8.1-ML2'].st, 'Not started');
  });
  test('manual and unscanned checks suggest nothing', () => {
    assert.deepEqual(e8LevelSuggestions(full, partial, { wdac: 'manual' }, 2, labels), {});
  });
});

describe('the How this works panel reads both maps', () => {
  test('a check shows the levels it speaks to, in full and in part', () => {
    const rows = CheckpointLib.e8Automation([{ code: 'E8.1', t: 'App control' }, { code: 'E8.4', t: 'Hardening' }],
      { wdac: ['E8.1-ML1'] }, [{ id: 'wdac', label: 'WDAC' }, { id: 'asr', label: 'ASR' }], { wdac: 'pass', asr: 'review' }, { wdac: ['E8.1-ML2'], asr: ['E8.4-ML2'] });
    assert.deepEqual(rows[0].checks[0].levels, [1]);
    assert.deepEqual(rows[0].checks[0].partialLevels, [2]);
    assert.equal(rows[1].mode, 'scan', 'E8.4 is scan-suggested once asr is mapped');
  });
});
