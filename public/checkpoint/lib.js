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

  /* Deterministic per-control "theme" key for the Control Constellation
     view — grouping is derived purely from the control code's own
     string shape, never from a `cat`/`domain` field, because live
     S.controls rows (SharePoint-backed) don't persist one. Every
     framework's code format is documented at each seed site (see
     store.js's ISO 27001 seed and the checkpoint-content/*.json packs
     for the others): ISO 27001/42001/27701 codes are dot-segmented
     (e.g. "A.5.29", "AI.3.2", "P.7.2.8") and the first two segments are
     the theme; SOC 2 codes are a letter prefix + number run together
     (e.g. "CC6.1", "A1.2", "PI1.3") so the leading letters are the
     theme; Essential Eight codes share a "<strategy>-MLx" suffix
     pattern, so splitting on "-" gives the parent strategy; NIST CSF
     codes are "FUNCTION.CATEGORY" (e.g. "GV.OC", "PR.AA") and the
     function (first segment) is the theme; DISP/IRAP codes ("DISP.n")
     have no further sub-structure in this app, so every control
     shares one flat theme. */
  function constellationTheme(fw, code) {
    code = String(code || '');
    if (fw === 'iso27001' || fw === 'iso42001' || fw === 'iso27701') {
      var segs = code.split('.');
      return segs.length > 1 ? segs.slice(0, 2).join('.') : (code || fw);
    }
    if (fw === 'soc2') {
      var m = code.match(/^[A-Za-z]+/);
      return m ? m[0] : (code || fw);
    }
    if (fw === 'essential8') return code.split('-')[0] || fw;
    if (fw === 'nistcsf') return code.split('.')[0] || fw;
    return fw;
  }

  /* Edge list for the Control Constellation: cross-references a
     control's own `map` field (via parseMapTokens above) against the
     set of nodes actually present, so an edge only ever exists when
     BOTH endpoints are real, currently-rendered controls. `nodes` is
     an array of {fw, id, map} (any extra fields are ignored). Returns
     deduped, unordered-pair edges {a, b} where a/b are "fw|id" keys
     with a < b, so the same relationship is never emitted twice even
     if both controls happen to cite each other. */
  function constellationEdges(nodes) {
    var present = {};
    (nodes || []).forEach(function (n) { present[n.fw + '|' + n.id] = true; });
    var seen = {};
    var edges = [];
    (nodes || []).forEach(function (n) {
      var aKey = n.fw + '|' + n.id;
      parseMapTokens(n.map).forEach(function (tok) {
        var bKey = tok.fw + '|' + tok.code;
        if (bKey === aKey || !present[bKey]) return;
        var lo = aKey < bKey ? aKey : bKey;
        var hi = aKey < bKey ? bKey : aKey;
        var pairKey = lo + '' + hi;
        if (seen[pairKey]) return;
        seen[pairKey] = true;
        edges.push({ a: lo, b: hi });
      });
    });
    return edges;
  }

  /* Deterministic radial-by-framework layout for the Control
     Constellation — no physics simulation, no iterative relaxation:
     every position is computed once, straight from each control's own
     framework/theme/code, so the same node set always lands in the
     same place. The circle is divided into one angular sector per
     framework (in `fwOrder`'s order, with a fixed gap between
     sectors); each sector is then subdivided into per-theme wedges
     sized proportionally to how many of that framework's controls
     share the theme; and within a wedge, controls are laid out in
     concentric rings (a compact "polar grid", perRing ~= sqrt(count))
     rather than one long spoke, so even a 37-control theme (ISO
     27001's Organizational controls) stays inside the sector instead
     of running off the edge. `nodes` is an array of {fw, id, theme};
     returns a plain object keyed by "fw|id" -> {x, y, angle, radius}. */
  function constellationLayout(nodes, fwOrder, opts) {
    opts = opts || {};
    var cx = opts.cx != null ? opts.cx : 500;
    var cy = opts.cy != null ? opts.cy : 500;
    var innerR = opts.innerR != null ? opts.innerR : 70;
    var outerR = opts.outerR != null ? opts.outerR : 470;
    var sectorGap = opts.sectorGap != null ? opts.sectorGap : 0.05;
    var positions = {};
    var fws = (fwOrder || []).filter(function (fw) {
      return (nodes || []).some(function (n) { return n.fw === fw; });
    });
    var n = fws.length;
    if (!n) return positions;
    var sectorSpan = (2 * Math.PI - sectorGap * n) / n;
    fws.forEach(function (fw, fi) {
      var sectorStart = fi * (sectorSpan + sectorGap) - Math.PI / 2;
      var fwNodes = nodes.filter(function (nd) { return nd.fw === fw; })
        .slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
      var themeMap = {};
      fwNodes.forEach(function (nd) { (themeMap[nd.theme] = themeMap[nd.theme] || []).push(nd); });
      var themeKeys = Object.keys(themeMap).sort();
      var total = fwNodes.length;
      var cursor = sectorStart;
      themeKeys.forEach(function (theme) {
        var group = themeMap[theme];
        var wedgeSpan = sectorSpan * (group.length / total);
        var wedgeStart = cursor;
        cursor += wedgeSpan;
        var gn = group.length;
        var perRing = Math.max(1, Math.ceil(Math.sqrt(gn)));
        var numRings = Math.ceil(gn / perRing);
        var ringStep = numRings > 1 ? (outerR - innerR) / numRings : 0;
        group.forEach(function (nd, i) {
          var ring = Math.floor(i / perRing);
          var ringStartIdx = ring * perRing;
          var ringCount = Math.min(perRing, gn - ringStartIdx);
          var idxInRing = i - ringStartIdx;
          var angle = wedgeStart + ((idxInRing + 0.5) / ringCount) * wedgeSpan;
          var radius = numRings > 1 ? innerR + ring * ringStep : (innerR + outerR) / 2;
          positions[nd.fw + '|' + nd.id] = {
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
            angle: angle,
            radius: radius,
            theme: theme
          };
        });
      });
    });
    return positions;
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

  /* Adds `days` calendar days to a YYYY-MM-DD string, in UTC, with no
     dependency on the ambient clock (the date to add to is always a
     parameter). Used to compute a grace-period cutoff, and (in
     tools/issue-entitlement.mjs) a demo activation's default 30-day
     expiry. */
  function addDaysToDateStr(dateStr, days) {
    var d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /* Whole calendar days from one YYYY-MM-DD string to another, UTC,
     no ambient clock dependency — negative once `to` is in the past
     relative to `from`. Used only for the "Trial — N days remaining"
     banner a demo-type activation shows while still valid. */
  function daysBetweenDateStr(from, to) {
    var a = new Date(from + 'T00:00:00Z'), b = new Date(to + 'T00:00:00Z');
    return Math.round((b - a) / 86400000);
  }

  var ENTITLEMENT_TYPES = ['client', 'partner', 'demo'];
  /* payload.type didn't exist before this feature — every activation
     issued earlier has no `type` field at all, and must keep behaving
     exactly as it always did. Normalising an absent/unrecognised value
     to 'client' (today's only behaviour) is what makes that backward
     compatible, rather than a validation error breaking every
     already-issued file the moment this ships. */
  function normalizeEntitlementType(t) {
    return ENTITLEMENT_TYPES.indexOf(t) === -1 ? 'client' : t;
  }

  /* Business-rule evaluation of an ALREADY signature-verified payload —
     tenant match, expiry and grace period — kept separate from the
     crypto step so it stays synchronous and trivially testable. `now`
     is a YYYY-MM-DD string parameter (never Date.now()/new Date()
     internally) so a test can assert against a fixed date instead of
     the real clock.

     `acceptTenantIds` accepts either a single string or an array —
     this activation now licenses the whole app (not just which
     framework toggles are on), and a client's own tenant identity can
     legitimately be presented to us as either their Entra tenant ID
     (a GUID) or one of their verified domains, so the caller passes
     every identifier this signed-in tenant answers to and a match on
     ANY of them (case-insensitive) counts as a match. No match at all
     -> 'mismatch', frameworks empty, regardless of expiry.

     Three post-match statuses:
       - 'valid'   — today is on or before payload.expiry.
       - 'grace'   — today is within payload.graceDays (default 14,
                     Compliance365's standard grace window) after
                     expiry. Still returns the full frameworks list;
                     the caller decides what "grace" means for the UI
                     (Checkpoint's app.js keeps the app fully
                     operational during grace, with a countdown
                     banner, per SETUP.md).
       - 'expired' — past the grace cutoff. Still returns the granted
                     frameworks list (never an empty one) — the caller
                     decides what to do with an expired-but-signed
                     grant (Checkpoint's app.js forces read-only rather
                     than yanking the data away — it's the client's own
                     data in their own tenant).

     `type` — 'client' | 'partner' | 'demo', normalised from
     payload.type (see normalizeEntitlementType() above). Every type
     goes through the exact same status/expiry/grace logic above —
     'partner' and 'demo' aren't a different licensing STATE machine,
     just a different issuance-time grant (see
     tools/issue-entitlement.mjs: both force every framework + module
     key; only their intended audience, --i-know requirement and
     default expiry differ) and a different app.js UI on top (the
     Partner Console for 'partner', a "Trial — N days remaining" banner
     for 'demo'). `daysRemaining` is always computed (whole calendar
     days from `now` to expiry, negative once past it) — every caller
     that isn't 'demo' simply never reads it. */
  function evaluateEntitlement(payload, acceptTenantIds, now) {
    var ids = (Array.isArray(acceptTenantIds) ? acceptTenantIds : [acceptTenantIds])
      .filter(Boolean).map(function (s) { return String(s).toLowerCase(); });
    var payloadId = payload && payload.tenantId ? String(payload.tenantId).toLowerCase() : '';
    if (!payload || !payloadId || ids.indexOf(payloadId) === -1) {
      return { status: 'mismatch', type: normalizeEntitlementType(payload && payload.type), frameworks: [], tenantId: payload && payload.tenantId };
    }
    var graceDays = (payload.graceDays === undefined || payload.graceDays === null) ? 14 : Number(payload.graceDays);
    var isPastExpiry = !!payload.expiry && payload.expiry < now;
    var graceUntil = payload.expiry ? addDaysToDateStr(payload.expiry, graceDays) : null;
    var status = 'valid';
    if (isPastExpiry) status = now <= graceUntil ? 'grace' : 'expired';
    return {
      status: status, type: normalizeEntitlementType(payload.type), frameworks: (payload.frameworks || []).slice(), expiry: payload.expiry,
      issuedAt: payload.issuedAt, tenantId: payload.tenantId, graceDays: graceDays,
      graceUntil: isPastExpiry ? graceUntil : null,
      daysRemaining: payload.expiry ? daysBetweenDateStr(now, payload.expiry) : null,
      /* One AES-256 key per premium module this activation grants,
         base64 raw bytes — see decryptPack() below. Passed straight
         through unmodified; this function only handles the licensing
         decision, not decryption itself. '' -> {} so callers never have
         to null-check. */
      moduleKeys: payload.moduleKeys || {}
    };
  }

  /* The local-development bypass's ONE piece of testable logic — see
     public/checkpoint/devflag.js and scripts/hash-checkpoint-assets.mjs
     for the rest of the design. Requires BOTH a truthy dev flag AND a
     localhost-family hostname; neither alone is enough, so a flag that
     somehow survives into a real deployment still grants nothing
     unless that deployment is also, somehow, served from localhost —
     which a real client tenant never is. Pure and synchronous so it's
     trivially testable without touching window/location directly. */
  function isDevBypassActive(devFlag, hostname) {
    return devFlag === true && (hostname === 'localhost' || hostname === '127.0.0.1');
  }

  /* ==========================================================
     Content packs — the premium framework registries (soc2,
     essential8, iso42001, iso27701, dispirap, nistcsf) don't ship in
     this app's JS bundle at all; they're fetched as small,
     AES-256-GCM-encrypted static JSON files (checkpoint-content/*.json
     source -> scripts/build-content-packs.mjs -> dist/checkpoint/
     packs/*.pack.json) and decrypted in the browser using the module
     key embedded in the signed activation payload above. Hosting the
     ciphertext publicly alongside the app is fine — without the right
     key (i.e. without a valid activation naming that module) a pack
     file decrypts to nothing.
     Same WebCrypto-everywhere principle as the Ed25519 signing above:
     one implementation, shared by the browser (via window.crypto.subtle)
     and scripts/build-content-packs.mjs (Node, via
     require('node:crypto').webcrypto.subtle) and the test suite, so
     "what gets encrypted" and "what gets decrypted" can never drift
     apart. */

  /* SHA-256 hex digest of a byte buffer (Uint8Array/ArrayBuffer) — the
     manifest-hash integrity check on a fetched pack file, independent
     of AES-GCM's own built-in authentication (defence in depth: catches
     a corrupted/substituted file before ever attempting to decrypt it,
     with a clearer error than a decrypt failure would give). */
  async function sha256Hex(subtle, bytes) {
    var digest = await subtle.digest('SHA-256', bytes);
    return Array.prototype.map.call(new Uint8Array(digest), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  /* Encrypts a plaintext pack object with AES-256-GCM under the given
     raw key (base64). `iv` is optional — pass a fixed 12-byte Uint8Array
     only for deterministic tests; the build script always omits it so
     every build gets a fresh random IV. Returns the on-disk pack shape:
     {moduleId, version, iv, ciphertext} (iv/ciphertext both base64). */
  async function encryptPack(subtle, moduleKeyBase64, moduleId, version, plaintextObj, iv) {
    var key = await subtle.importKey('raw', base64ToBytes(moduleKeyBase64), { name: 'AES-GCM' }, false, ['encrypt']);
    var ivBytes = iv || crypto.getRandomValues(new Uint8Array(12));
    var data = new TextEncoder().encode(JSON.stringify(plaintextObj));
    var ctBuf = await subtle.encrypt({ name: 'AES-GCM', iv: ivBytes }, key, data);
    return { moduleId: moduleId, version: version, iv: bytesToBase64(ivBytes), ciphertext: bytesToBase64(new Uint8Array(ctBuf)) };
  }

  /* Decrypts a fetched pack file with the module key an activation
     granted. Throws (never returns a partial/garbage result) on a wrong
     key or tampered ciphertext — AES-GCM's authentication tag makes the
     two indistinguishable, which is exactly right here: the caller
     (app.js's mergeLicensedPacks()) treats any throw here as "this
     module isn't available," the same clear, safe fallback whether the
     cause was a bad key, a corrupted file, or a mismatched pack. */
  async function decryptPack(subtle, moduleKeyBase64, pack) {
    var key = await subtle.importKey('raw', base64ToBytes(moduleKeyBase64), { name: 'AES-GCM' }, false, ['decrypt']);
    var iv = base64ToBytes(pack.iv);
    var ct = base64ToBytes(pack.ciphertext);
    var ptBuf = await subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(ptBuf));
  }

  /* Structural validation for a just-decrypted pack — cheap sanity
     checks that catch "this decrypted to something, but not a real
     pack" (e.g. a version mismatch, or moduleKeys mixed up between two
     modules that both happen to produce syntactically valid JSON)
     before any of it is merged into window.FRAMEWORKS/GUIDANCE. Returns
     an error string, or null if the pack looks right. */
  function validatePackShape(moduleId, content) {
    if (!content || typeof content !== 'object') return 'decrypted content is not an object';
    if (!content.framework || content.framework.id !== moduleId) return 'framework.id does not match the expected module';
    if (!Array.isArray(content.framework.controls)) return 'framework.controls is not an array';
    if (content.guidance && typeof content.guidance !== 'object') return 'guidance is not an object';
    return null;
  }

  return {
    band: band, residual: residual, checkResult: checkResult, score: score, readinessPct: readinessPct,
    suggestVendorCriticality: suggestVendorCriticality, parseMapTokens: parseMapTokens,
    constellationTheme: constellationTheme, constellationEdges: constellationEdges, constellationLayout: constellationLayout,
    toCsv: toCsv, buildZip: buildZip,
    canonicalJson: canonicalJson, base64ToBytes: base64ToBytes, bytesToBase64: bytesToBase64,
    verifyEntitlementSignature: verifyEntitlementSignature, signEntitlementPayload: signEntitlementPayload,
    evaluateEntitlement: evaluateEntitlement, addDaysToDateStr: addDaysToDateStr,
    daysBetweenDateStr: daysBetweenDateStr, normalizeEntitlementType: normalizeEntitlementType,
    isDevBypassActive: isDevBypassActive,
    sha256Hex: sha256Hex, encryptPack: encryptPack, decryptPack: decryptPack, validatePackShape: validatePackShape
  };
});
