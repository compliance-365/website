/* ============================================================
   Checkpoint — self-test (pure-logic regression checks)
   ------------------------------------------------------------
   window.CheckpointSelfTest.run() exercises the pieces of Checkpoint
   that are pure logic — no Graph, no SharePoint, no DOM — and returns
   an array of { group, name, pass, detail } results. Two callers:

   1. The hidden in-app diagnostics view (app.js's renderSelfTest(),
      reachable via ?selftest=1 in demo mode only — see SETUP.md) runs
      this in the browser against whatever window.FRAMEWORKS/GUIDANCE/
      CheckpointLib/ReportEngine this page actually loaded, and renders
      a pass/fail table. Useful for a practitioner or this session's
      own pre-pilot acceptance pass to sanity-check a specific build
      without opening devtools.
   2. test/selftest.test.mjs requires this file the same way every
      other plain-script test does (stub window, require store.js/
      guidance.js/lib.js/report.js first) and asserts every check
      passes — wiring this into `npm test`/CI per ACCEPTANCE.md §2.

   This is NOT a substitute for ACCEPTANCE.md's manual tenant pass —
   it can't touch Graph, SharePoint, MSAL, or anything that requires a
   real signed-in session. It exists to catch a regression between
   releases in the parts that don't need one: the registry itself,
   the scoring/residual math, the entitlement crypto, the six report
   charts, and CSV escaping.

   Every check is synchronous-or-awaited and side-effect-free — no
   check ever writes to window.FRAMEWORKS or any other shared global,
   so run() is safe to call repeatedly (e.g. every time the diagnostics
   view re-renders) without state leaking between calls. */
(function () {
  function ok(group, name, detail) { return { group: group, name: name, pass: true, detail: detail || '' }; }
  function fail(group, name, detail) { return { group: group, name: name, pass: false, detail: detail || '' }; }

  /* ---- 1. Registry integrity ------------------------------------
     Checked against whatever this page ACTUALLY has loaded, not the
     full paid registries — a premium framework is legitimately an
     empty stub in an unlicensed/demo session (see the content-pack
     split in SETUP.md §7b), so only non-empty frameworks are held to
     the "every control has a code/title, no dupes, no dangling map
     refs" standard. FRAMEWORK_ORDER<->FRAMEWORKS consistency and the
     allControlSeeds() count check apply regardless of what's
     populated. */
  function registryChecks() {
    var out = [];
    var FRAMEWORKS = window.FRAMEWORKS || {};
    var ORDER = window.FRAMEWORK_ORDER || [];
    var parseMapTokens = (window.CheckpointLib || {}).parseMapTokens;

    var missingFromFrameworks = ORDER.filter(function (fw) { return !FRAMEWORKS[fw]; });
    out.push(missingFromFrameworks.length
      ? fail('Registry', 'FRAMEWORK_ORDER <-> FRAMEWORKS consistency', 'FRAMEWORK_ORDER references unknown framework(s): ' + missingFromFrameworks.join(', '))
      : ok('Registry', 'FRAMEWORK_ORDER <-> FRAMEWORKS consistency', ORDER.length + ' framework(s)'));

    var populated = ORDER.filter(function (fw) { return FRAMEWORKS[fw] && FRAMEWORKS[fw].controls && FRAMEWORKS[fw].controls.length; });

    var seenCodes = {}, dupes = [];
    populated.forEach(function (fw) {
      FRAMEWORKS[fw].controls.forEach(function (c) {
        if (seenCodes[c.code]) dupes.push(c.code); else seenCodes[c.code] = fw;
      });
    });
    out.push(dupes.length
      ? fail('Registry', 'No duplicate control codes', 'duplicate(s): ' + dupes.join(', '))
      : ok('Registry', 'No duplicate control codes', Object.keys(seenCodes).length + ' code(s) across ' + populated.length + ' populated framework(s)'));

    var badTitleOrCode = [];
    populated.forEach(function (fw) {
      FRAMEWORKS[fw].controls.forEach(function (c) {
        if (!c.code || !String(c.code).trim() || !c.t || !String(c.t).trim()) badTitleOrCode.push(fw + '|' + (c.code || '(no code)'));
      });
    });
    out.push(badTitleOrCode.length
      ? fail('Registry', 'Every control has a non-empty code and title', badTitleOrCode.join(', '))
      : ok('Registry', 'Every control has a non-empty code and title'));

    if (parseMapTokens) {
      /* Only checked against frameworks that are ACTUALLY populated
         right now — a reference from iso27001 to (say) soc2|CC1.1 is
         not "dangling" just because soc2 happens to be an unlicensed
         empty stub in this session (see the content-pack split,
         SETUP.md §7b); it's simply not verifiable without that data
         loaded. Only a reference whose target framework IS populated
         but doesn't contain the referenced code is a real defect. */
      var populatedSet = {};
      populated.forEach(function (fw) { populatedSet[fw] = true; });
      var codesByFw = {};
      populated.forEach(function (fw) { codesByFw[fw] = {}; FRAMEWORKS[fw].controls.forEach(function (c) { codesByFw[fw][c.code] = true; }); });
      var dangling = [];
      populated.forEach(function (fw) {
        FRAMEWORKS[fw].controls.forEach(function (c) {
          parseMapTokens(c.map).forEach(function (ref) {
            if (populatedSet[ref.fw] && !codesByFw[ref.fw][ref.code]) dangling.push(fw + '|' + c.code + ' -> ' + ref.fw + '|' + ref.code);
          });
        });
      });
      out.push(dangling.length
        ? fail('Registry', 'Every internal map reference resolves (against populated frameworks)', dangling.join(', '))
        : ok('Registry', 'Every internal map reference resolves (against populated frameworks)', populated.length + ' populated framework(s) checked'));
    }

    if (typeof window.allControlSeeds === 'function') {
      var seeds = window.allControlSeeds();
      var expected = ORDER.reduce(function (n, fw) { return n + ((FRAMEWORKS[fw] && FRAMEWORKS[fw].controls) || []).length; }, 0);
      out.push(seeds.length === expected
        ? ok('Registry', 'allControlSeeds() count matches FRAMEWORKS', seeds.length + ' seed row(s)')
        : fail('Registry', 'allControlSeeds() count matches FRAMEWORKS', 'got ' + seeds.length + ', expected ' + expected));
    }

    return out;
  }

  /* ---- 2. Scoring math -------------------------------------------
     band()/score()/readinessPct() against fixed fixtures — the exact
     same thresholds test/lib.test.mjs asserts, run here as a live
     smoke check against whatever CheckpointLib this build shipped. */
  function scoringChecks() {
    var out = [];
    var L = window.CheckpointLib;
    if (!L) return [fail('Scoring', 'window.CheckpointLib is loaded', 'CheckpointLib is missing')];

    var bandCases = [[4, 'Low'], [9, 'Medium'], [14, 'High'], [24, 'Critical']];
    var bandBad = bandCases.filter(function (c) { return L.band(c[0]) !== c[1]; });
    out.push(bandBad.length
      ? fail('Scoring', 'band() thresholds', JSON.stringify(bandBad))
      : ok('Scoring', 'band() thresholds', '4->Low, 9->Medium, 14->High, 24->Critical'));

    var readiness = L.readinessPct([{ app: true, st: 'Implemented' }, { app: true, st: 'Not started' }, { app: false, st: 'Not started' }]);
    out.push(readiness === 50
      ? ok('Scoring', 'readinessPct() ignores non-applicable controls', '50%')
      : fail('Scoring', 'readinessPct() ignores non-applicable controls', 'got ' + readiness + ', expected 50'));

    var CHECK_DEFS = [{ id: 'a', scored: true }, { id: 'b', scored: true }, { id: 'c', scored: false }];
    var ctx = { lastResults: { a: 'pass', b: 'fail' } };
    var scoreVal = L.score(CHECK_DEFS, ctx);
    out.push(scoreVal === 50
      ? ok('Scoring', 'score() weights pass/fail and excludes scored:false', '50')
      : fail('Scoring', 'score() weights pass/fail and excludes scored:false', 'got ' + scoreVal + ', expected 50'));

    return out;
  }

  /* ---- 3. Residual risk calculation -------------------------------
     Completed treatment actions shave likelihood (floor 1); impact
     only drops once every linked action is done (also floor 1) — the
     same fixture test/lib.test.mjs's residual() suite asserts. */
  function residualChecks() {
    var out = [];
    var L = window.CheckpointLib;
    if (!L) return [fail('Residual', 'window.CheckpointLib is loaded', 'CheckpointLib is missing')];

    var r = { L: 3, I: 5, actions: ['ACT-001', 'ACT-002', 'ACT-003'] };
    var actions = [{ id: 'ACT-001', status: 'Done' }, { id: 'ACT-002', status: 'Done' }, { id: 'ACT-003', status: 'Open' }];
    var q = L.residual(r, actions);
    out.push((q.L === 1 && q.I === 5)
      ? ok('Residual', '2 of 3 actions done reduces L, leaves I unchanged', 'L=1, I=5')
      : fail('Residual', '2 of 3 actions done reduces L, leaves I unchanged', 'got L=' + q.L + ' I=' + q.I));

    var rAllDone = { L: 2, I: 3, actions: ['ACT-001', 'ACT-002'] };
    var allDone = [{ id: 'ACT-001', status: 'Done' }, { id: 'ACT-002', status: 'Done' }];
    var q2 = L.residual(rAllDone, allDone);
    out.push((q2.L === 1 && q2.I === 2)
      ? ok('Residual', 'every linked action done also reduces I, floored at 1', 'L=1, I=2')
      : fail('Residual', 'every linked action done also reduces I, floored at 1', 'got L=' + q2.L + ' I=' + q2.I));

    return out;
  }

  /* ---- 4. Entitlement verification fixtures -----------------------
     A full sign -> verify -> evaluate round trip with an ephemeral
     Ed25519 keypair (generated fresh every run — never a fixed key
     committed anywhere) covering the three outcomes a real activation
     file can produce: valid, expired, tenant mismatch. */
  async function entitlementChecks() {
    var out = [];
    var L = window.CheckpointLib;
    if (!L || typeof crypto === 'undefined' || !crypto.subtle) {
      return [fail('Entitlement', 'WebCrypto is available', 'crypto.subtle is missing in this context')];
    }
    try {
      var kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
      var pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
      var pubB64 = (typeof Buffer !== 'undefined') ? Buffer.from(pubRaw).toString('base64') : btoa(String.fromCharCode.apply(null, pubRaw));

      var payload = { tenantId: 't-selftest', frameworks: ['iso27001', 'soc2'], issuedAt: '2026-01-01', expiry: '2027-01-01', graceDays: 14 };
      var sig = await L.signEntitlementPayload(crypto.subtle, kp.privateKey, payload);
      var sigOk = await L.verifyEntitlementSignature(crypto.subtle, pubB64, payload, sig);
      out.push(sigOk
        ? ok('Entitlement', 'Ed25519 sign -> verify round trip')
        : fail('Entitlement', 'Ed25519 sign -> verify round trip', 'signature did not verify'));

      var tampered = Object.assign({}, payload, { frameworks: ['iso27001', 'soc2', 'essential8'] });
      var tamperedOk = await L.verifyEntitlementSignature(crypto.subtle, pubB64, tampered, sig);
      out.push(!tamperedOk
        ? ok('Entitlement', 'a tampered payload fails signature verification')
        : fail('Entitlement', 'a tampered payload fails signature verification', 'verified when it should not have'));

      var valid = L.evaluateEntitlement(payload, 't-selftest', '2026-06-01');
      out.push(valid.status === 'valid'
        ? ok('Entitlement', 'evaluateEntitlement() — not yet expired -> valid')
        : fail('Entitlement', 'evaluateEntitlement() — not yet expired -> valid', 'got status=' + valid.status));

      var expired = L.evaluateEntitlement(payload, 't-selftest', '2027-06-01');
      out.push(expired.status === 'expired'
        ? ok('Entitlement', 'evaluateEntitlement() — past expiry + grace -> expired')
        : fail('Entitlement', 'evaluateEntitlement() — past expiry + grace -> expired', 'got status=' + expired.status));

      var mismatch = L.evaluateEntitlement(payload, 'some-other-tenant', '2026-06-01');
      out.push(mismatch.status === 'mismatch'
        ? ok('Entitlement', 'evaluateEntitlement() — wrong tenant -> mismatch')
        : fail('Entitlement', 'evaluateEntitlement() — wrong tenant -> mismatch', 'got status=' + mismatch.status));
    } catch (e) {
      out.push(fail('Entitlement', 'entitlement fixture ran without throwing', (e && e.message) || String(e)));
    }
    return out;
  }

  /* ---- 5. Chart functions with fixture data -----------------------
     Structural checks only (no NaN/undefined/script tags, a real
     <svg> root, graceful placeholder on empty input) — exhaustive
     exact-output snapshot testing already lives in
     test/report-charts.test.mjs; this just confirms the six chart
     functions this build shipped still run without throwing or
     leaking a broken value into markup. */
  function chartChecks() {
    var out = [];
    var C = (window.ReportEngine || {}).charts;
    if (!C) return [fail('Charts', 'window.ReportEngine.charts is loaded', 'ReportEngine.charts is missing')];

    var cases = [
      ['donut', function () { return C.donut({ implemented: 6, inProgress: 2, notStarted: 1, notApplicable: 1 }); }],
      ['donut (empty)', function () { return C.donut({ implemented: 0, inProgress: 0, notStarted: 0, notApplicable: 0 }); }],
      ['trend', function () { return C.trend([{ dateLabel: '1 Jun', score: 40 }, { dateLabel: '1 Jul', score: 60 }], 80); }],
      ['trend (empty)', function () { return C.trend([]); }],
      ['stackedBars', function () { return C.stackedBars([{ label: 'Row', values: [3, 1, 1, 0] }], [{ label: 'A', color: '#3A7A3A' }, { label: 'B', color: '#B57F2A' }, { label: 'C', color: '#8B877D', hatch: true }, { label: 'D', color: '#D9D4C8' }]); }],
      ['riskHeatmap', function () { return C.riskHeatmap([{ L: 3, I: 4 }]); }],
      ['riskHeatmap (empty)', function () { return C.riskHeatmap([]); }],
      ['evidenceGauge', function () { return C.evidenceGauge({ autoCaptured: 4, manual: 2, total: 8 }); }],
      ['kpiStrip', function () { return C.kpiStrip([{ value: '82', label: 'Posture score', trend: 'up', trendGood: true }]); }]
    ];
    cases.forEach(function (c) {
      var name = c[0], fn = c[1];
      try {
        var svg = fn();
        /* word-boundary matches only — a plain /i substring match on
           "NaN" false-positives inside unrelated words like the CSS
           property "dominant-baseline" (contains "nan"). */
        var bad = /\bNaN\b/.test(svg) || /\bundefined\b/.test(svg) || /<script/i.test(svg) || svg.indexOf('<svg ') !== 0;
        out.push(bad
          ? fail('Charts', name + '() renders a clean <svg>', svg.slice(0, 120))
          : ok('Charts', name + '() renders a clean <svg>'));
      } catch (e) {
        out.push(fail('Charts', name + '() renders a clean <svg>', (e && e.message) || String(e)));
      }
    });
    return out;
  }

  /* ---- 6. CSV export escaping -------------------------------------
     toCsv() must quote a field containing a comma, a doubled quote for
     an embedded quote, and pass a newline through inside a quoted
     field — the same escaping test/lib.test.mjs's toCsv() suite
     asserts. */
  function csvChecks() {
    var out = [];
    var L = window.CheckpointLib;
    if (!L) return [fail('CSV export', 'window.CheckpointLib is loaded', 'CheckpointLib is missing')];

    var commaCase = L.toCsv([['a,b', 'c']]);
    out.push(commaCase === '"a,b",c'
      ? ok('CSV export', 'a field containing a comma is quoted')
      : fail('CSV export', 'a field containing a comma is quoted', 'got ' + JSON.stringify(commaCase)));

    var quoteCase = L.toCsv([['say "hi"']]);
    out.push(quoteCase === '"say ""hi"""'
      ? ok('CSV export', 'an embedded quote is doubled')
      : fail('CSV export', 'an embedded quote is doubled', 'got ' + JSON.stringify(quoteCase)));

    var newlineCase = L.toCsv([['line1\nline2']]);
    out.push(newlineCase === '"line1\nline2"'
      ? ok('CSV export', 'a field containing a newline is quoted, newline preserved')
      : fail('CSV export', 'a field containing a newline is quoted, newline preserved', 'got ' + JSON.stringify(newlineCase)));

    return out;
  }

  async function run() {
    var results = [].concat(
      registryChecks(),
      scoringChecks(),
      residualChecks(),
      await entitlementChecks(),
      chartChecks(),
      csvChecks()
    );
    return results;
  }

  window.CheckpointSelfTest = { run: run };
})();
