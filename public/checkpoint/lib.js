/* Pure, dependency-free scoring/threshold logic shared between app.js
   (browser) and the test suite (Node's built-in test runner). Nothing in
   here touches S/Store/DOM/window — every input is a parameter — so
   behaviour can be verified in isolation without booting the app.
   Exposed as window.CheckpointLib in the browser and via module.exports
   under Node; same functions either way, never two implementations to
   keep in sync. */
(function (factory) {
  var lib = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof window !== 'undefined') window.CheckpointLib = lib;
})(function () {

  /* Risk severity band — used for both inherent and residual scores. */
  function band(sc) {
    return sc >= 15 ? 'Critical' : sc >= 10 ? 'High' : sc >= 5 ? 'Medium' : 'Low';
  }

  /* Residual likelihood/impact for a risk: each completed treatment
     action shaves a point off likelihood (floor 1); impact drops by one
     (floor 1) only once every linked action is done. `actions` is the
     full actions register (or any array of {id, status} objects) — the
     risk itself only stores action id references. */
  function residual(r, actions) {
    var done = r.actions.filter(function (id) {
      var a = actions.find(function (x) { return x.id === id; });
      return a && a.status === 'Done';
    }).length;
    var all = r.actions.length > 0 && done === r.actions.length;
    return { L: Math.max(1, r.L - done), I: all ? Math.max(1, r.I - 1) : r.I };
  }

  /* Posture-check contract: 'pass' | 'review' | 'fail' | 'manual' | null.
     - scored:false checks have no Graph signal at all -> always 'manual'.
     - No scan has ever run -> null (distinct from 'manual': a manual
       check is inherently unautomatable; null just means "not scanned
       yet" and could still resolve to a real result after one runs).
     - ctx.isDemo + a template-linked check: demo mode has no real Graph
       signal to flip a check from fail/review to pass, so completing
       every remediation action tied to that check's proposed risk
       simulates the same outcome a real re-scan would show.
     ctx: { lastResults: {checkId: result} | null, isDemo: bool,
            risks: [...], actions: [...] } */
  function checkResult(c, ctx) {
    if (c.scored === false) return 'manual';
    if (!ctx.lastResults) return null;
    var base = ctx.lastResults[c.id];
    if (ctx.isDemo && c.tpl) {
      var made = (ctx.risks || []).find(function (r) { return r.tpl === c.tpl; });
      if (made) {
        var allDone = made.actions.every(function (id) {
          var a = (ctx.actions || []).find(function (x) { return x.id === id; });
          return a && a.status === 'Done';
        });
        if (allDone) return 'pass';
      }
    }
    return base;
  }

  /* Overall posture score (0-100, floor 5 once any scan has run). Only
     scored:true checks feed the number — manual/unautomatable checks are
     a separate checklist and must never drag the score down just for
     being honestly flagged. A scored:true check can still come back
     'manual' for a given scan (e.g. a Secure Score check with no
     confident control-name match this time) — excluded from the
     denominator too, same reason: "we couldn't measure it" must never
     count as "it failed". checkResultFn defaults to checkResult itself;
     overridable for tests that want to stub per-check outcomes directly
     instead of building a full ctx. */
  function score(checkDefs, ctx, checkResultFn) {
    checkResultFn = checkResultFn || function (c) { return checkResult(c, ctx); };
    var scored = checkDefs.filter(function (c) { return c.scored !== false; });
    var measured = scored.filter(function (c) { return checkResultFn(c) !== 'manual'; });
    if (!measured.length) return 100;
    var pts = measured.reduce(function (sum, c) {
      var r = checkResultFn(c);
      return sum + (r === 'pass' ? 1 : r === 'review' ? 0.5 : 0);
    }, 0);
    return Math.max(5, Math.round(pts / measured.length * 100));
  }

  /* % of applicable controls marked Implemented, for a single
     framework's control rows (caller filters by fw first). */
  function readinessPct(controls) {
    var applicable = controls.filter(function (c) { return c.app; });
    var impl = applicable.filter(function (c) { return c.st === 'Implemented'; }).length;
    return applicable.length ? Math.round(impl / applicable.length * 100) : 0;
  }

  /* Suggested vendor criticality from the data-access categories ticked
     on its record (VENDOR_DATA_CATEGORIES in store.js). A suggestion,
     never an override — the practitioner can always set criticality
     themselves; this just stops "Medium by default" being the silent
     answer for a vendor holding health records. Highest-sensitivity
     category wins. */
  function suggestVendorCriticality(categories) {
    var cats = categories || [];
    var has = function (c) { return cats.indexOf(c) > -1; };
    if (has('Health information') || has('Credentials & secrets') || has('Production system access')) return 'Critical';
    if (has('Customer PII') || has('Financial / payment data')) return 'High';
    if (has('Employee data') || has('Company confidential')) return 'Medium';
    return 'Low';
  }

  /* Parses a control's "Also satisfies" map string (e.g. "SOC2 CC6.1 ·
     NIST PR.AC · DISP.16") into { fw, code } pairs pointing at internal
     framework ids and that framework's own control codes. Three token
     shapes: "FWNAME CODE" for most frameworks; a bare self-identifying
     code (DISP.n, E8.n or E8.n-MLx) for the two frameworks whose own
     code format needs no separate prefix; and a bare code with NO
     recognisable prefix at all, which continues the framework of the
     immediately preceding prefixed token in the same string — the
     shorthand this codebase uses for citing two codes from the same
     framework, e.g. "ISO27001 A.5.29 · A.5.30" is two ISO 27001 codes,
     not one ISO 27001 code plus an unresolvable second reference. A
     bare token is only treated as an external reference (e.g. "EU AI
     Act Art.9") when there's no preceding internal token to inherit
     from, or when it doesn't even look like a control-code shape. */
  function parseMapTokens(mapStr) {
    if (!mapStr) return [];
    var MAP_FW = { SOC2: 'soc2', NIST: 'nistcsf', ISO42001: 'iso42001', ISO27701: 'iso27701', ISO27001: 'iso27001' };
    var lastFw = null;
    return mapStr.split('·').map(function (s) { return s.trim(); }).filter(Boolean).map(function (tok) {
      var m = tok.match(/^(SOC2|NIST|ISO42001|ISO27701|ISO27001)\s+(.+)$/);
      if (m) { lastFw = MAP_FW[m[1]]; return { fw: lastFw, code: m[2] }; }
      if (/^DISP\.\d+/.test(tok)) { lastFw = 'dispirap'; return { fw: 'dispirap', code: tok }; }
      if (/^E8\.\d+/.test(tok)) { lastFw = 'essential8'; return { fw: 'essential8', code: tok }; }
      if (lastFw && /^[A-Za-z]{1,4}\.?\d/.test(tok)) return { fw: lastFw, code: tok };
      lastFw = null; /* prose like "EU AI Act Art.9" resets the chain */
      return null;
    }).filter(Boolean);
  }

  /* RFC 4182-ish CSV serialisation for a client-side export — `rows` is
     an array of arrays (row 0 conventionally the header), each cell
     coerced to a string. A cell is quoted only when it contains a
     comma, quote or newline (quotes doubled inside); everything else is
     written bare, matching how Excel/Numbers/Google Sheets round-trip
     a CSV. CRLF line endings throughout, since that's what every major
     spreadsheet app expects from a CSV regardless of platform. No BOM
     here — that's an output-encoding concern for whatever wraps this
     string in a Blob, not part of "build correct CSV text". */
  function toCsv(rows) {
    function cell(v) {
      var s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    return rows.map(function (row) { return row.map(cell).join(','); }).join('\r\n');
  }

  /* Minimal ZIP writer — STORE method (no compression), no external
     dependency. Just enough of PKZIP's format to produce a file every
     major unzip tool (Windows Explorer, macOS Archive Utility, 7-Zip,
     Python's zipfile) opens correctly: a local file header + raw bytes
     per entry, a central directory, and the end-of-central-directory
     record. `files` is an array of {name, content} (content: a string,
     UTF-8 encoded here); returns a Uint8Array, not a Blob — wrapping it
     in one is a DOM/window concern for whatever downloads it, kept out
     of this dependency-free module same as everywhere else in this
     file. `date` (optional, defaults to now) sets every entry's
     modified-time field — exposed as a parameter purely so tests can
     pass a fixed date instead of asserting against the clock. */
  var CRC_TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
  function dosDateTime(d) {
    return {
      time: ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1F),
      date: (((Math.max(0, d.getFullYear() - 1980)) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F)
    };
  }
  function buildZip(files, date) {
    var dt = dosDateTime(date || new Date());
    var enc = new TextEncoder();
    var localEntries = [], centralEntries = [], offset = 0;
    files.forEach(function (f) {
      var nameBytes = Array.from(enc.encode(f.name));
      var dataBytes = Array.from(enc.encode(f.content));
      var crc = crc32(dataBytes);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(dt.time), u16(dt.date),
        u32(crc), u32(dataBytes.length), u32(dataBytes.length),
        u16(nameBytes.length), u16(0), nameBytes, dataBytes
      );
      localEntries.push(local);
      centralEntries.push([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(dt.time), u16(dt.date),
        u32(crc), u32(dataBytes.length), u32(dataBytes.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
      ));
      offset += local.length;
    });
    var centralBytes = [].concat.apply([], centralEntries);
    var eocd = [].concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralBytes.length), u32(offset), u16(0)
    );
    return Uint8Array.from([].concat.apply([], localEntries).concat(centralBytes, eocd));
  }

  /* ==========================================================
     Signed entitlement files — verification logic shared between the
     browser (app.js, via window.crypto.subtle) and tools/issue-
     entitlement.mjs (Node, via require('node:crypto').webcrypto.subtle)
     AND the test suite, so "what bytes get signed" and "what bytes get
     verified" can never silently drift apart between the CLI that
     issues a file and the app that checks it — the single real risk in
     any signed-artifact scheme. SubtleCrypto itself is passed in as a
     parameter rather than referenced globally, since neither this file
     nor its Node caller should assume which global (window.crypto vs.
     require('node:crypto').webcrypto) is present. */

  /* Deterministic JSON — sorts object keys recursively so the exact
     same payload always serialises to the exact same bytes regardless
     of property insertion order, which is what both the signer and the
     verifier must sign/check over. Not a general canonical-JSON
     implementation (no float/whitespace edge cases to handle — every
     entitlement field is a string or an array of strings), just enough
     determinism for this one artifact shape. */
  function canonicalJson(v) {
    if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonicalJson(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v);
  }

  function base64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  /* Verifies an entitlement file's Ed25519 signature over its own
     canonicalised payload. Returns true/false — never throws for a
     malformed signature/key (WebCrypto's own verify() already resolves
     false rather than rejecting for a bad signature; a genuinely
     malformed base64/key still rejects, left to the caller to catch,
     since that's an "this file is garbage" case worth surfacing
     distinctly from "this file is tampered"). */
  async function verifyEntitlementSignature(subtle, publicKeyBase64, payload, signatureBase64) {
    var key = await subtle.importKey('raw', base64ToBytes(publicKeyBase64), { name: 'Ed25519' }, false, ['verify']);
    var data = new TextEncoder().encode(canonicalJson(payload));
    return subtle.verify('Ed25519', key, base64ToBytes(signatureBase64), data);
  }

  /* Signs a payload with an Ed25519 private CryptoKey — the CLI-side
     counterpart to verifyEntitlementSignature(), kept here so signing
     and verifying share the exact same canonicalJson() call. Returns
     the signature as base64. */
  async function signEntitlementPayload(subtle, privateKey, payload) {
    var data = new TextEncoder().encode(canonicalJson(payload));
    var sig = await subtle.sign('Ed25519', privateKey, data);
    return bytesToBase64(new Uint8Array(sig));
  }

  /* Business-rule evaluation of an ALREADY signature-verified payload —
     tenant match and expiry — kept separate from the crypto step so it
     stays synchronous and trivially testable. `now` is a YYYY-MM-DD
     string parameter (never Date.now()/new Date() internally) so a
     test can assert against a fixed date instead of the real clock.
     'expired' still returns the granted frameworks list (not an empty
     one) — the caller decides what to do with an expired-but-signed
     grant (Checkpoint's own app.js keeps expired frameworks visible
     with a renewal banner rather than yanking them away — see the
     READONLY-style comment in app.js next to where this is called). */
  function evaluateEntitlement(payload, tenantId, now) {
    if (!payload || !payload.tenantId || payload.tenantId !== tenantId) {
      return { status: 'mismatch', frameworks: [], tenantId: payload && payload.tenantId };
    }
    var expired = !!payload.expiry && payload.expiry < now;
    return { status: expired ? 'expired' : 'valid', frameworks: (payload.frameworks || []).slice(), expiry: payload.expiry, issuedAt: payload.issuedAt, tenantId: payload.tenantId };
  }

  return {
    band: band, residual: residual, checkResult: checkResult, score: score, readinessPct: readinessPct,
    suggestVendorCriticality: suggestVendorCriticality, parseMapTokens: parseMapTokens,
    toCsv: toCsv, buildZip: buildZip,
    canonicalJson: canonicalJson, base64ToBytes: base64ToBytes, bytesToBase64: bytesToBase64,
    verifyEntitlementSignature: verifyEntitlementSignature, signEntitlementPayload: signEntitlementPayload,
    evaluateEntitlement: evaluateEntitlement
  };
});
