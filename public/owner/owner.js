function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

/* Keyboard focus trap for a dialog-like container (the modal box, the
   drawer) — identical to the client app's own copy (public/checkpoint/
   app.js). Small and self-contained enough that duplicating it here
   (rather than reaching into the client bundle) is the right call —
   see the top of owner.js for why this bundle shares no code/state
   with app.js at all. */
function trapFocusKeydown(e, container) {
  if (e.key !== 'Tab') return;
  var focusables = container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
  if (!focusables.length) { e.preventDefault(); return; }
  var first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* Same modal helper as the client app's app.js — copied, not shared,
   deliberately (see the file-level comment below). */
var _modalFieldIdSeq = 0;
function showModal(opts) {
  return new Promise(function (resolve) {
    var overlay = document.getElementById('modalOverlay');
    var box = document.getElementById('modalBox');
    var hasFields = !!(opts.fields && opts.fields.length);
    var returnFocus = document.activeElement;
    box.innerHTML = '';

    var titleId = 'modalTitle' + (++_modalFieldIdSeq);
    var h3 = document.createElement('h3');
    h3.id = titleId;
    h3.textContent = opts.title || '';
    box.appendChild(h3);
    box.setAttribute('aria-labelledby', titleId);
    box.removeAttribute('aria-describedby');

    if (opts.message) {
      var msgId = 'modalMsg' + _modalFieldIdSeq;
      var msg = document.createElement('p');
      msg.id = msgId;
      msg.className = 'm-msg';
      msg.textContent = opts.message;
      box.appendChild(msg);
      box.setAttribute('aria-describedby', msgId);
    }

    var inputs = {};
    (opts.fields || []).forEach(function (f) {
      var wrap = document.createElement('div');
      wrap.className = 'm-field';
      var fieldId = 'modalField' + (++_modalFieldIdSeq);
      var label = document.createElement('label');
      label.textContent = f.label;
      label.setAttribute('for', fieldId);
      wrap.appendChild(label);
      var el = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
      el.id = fieldId;
      if (f.type && f.type !== 'textarea') el.type = f.type === 'email' ? 'email' : f.type;
      el.value = f.value || '';
      if (f.placeholder) el.placeholder = f.placeholder;
      wrap.appendChild(el);
      box.appendChild(wrap);
      inputs[f.id] = el;
    });

    var errorEl = document.createElement('div');
    errorEl.className = 'm-error';
    errorEl.setAttribute('role', 'alert');
    box.appendChild(errorEl);

    var btnRow = document.createElement('div');
    btnRow.className = 'm-btns';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn ghost sm';
    cancelBtn.textContent = opts.cancelText || 'Cancel';
    var confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn sm';
    confirmBtn.textContent = opts.confirmText || 'OK';
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    box.appendChild(btnRow);

    function close(result) {
      overlay.classList.remove('open');
      box.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      if (returnFocus && document.body.contains(returnFocus)) returnFocus.focus();
      resolve(result);
    }
    function cancelResult() { return hasFields ? null : false; }
    function tryConfirm() {
      var values = {};
      Object.keys(inputs).forEach(function (id) { values[id] = inputs[id].value.trim(); });
      var err = opts.validate ? opts.validate(values) : null;
      if (err) { errorEl.textContent = err; errorEl.classList.add('show'); return; }
      close(hasFields ? values : true);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(cancelResult()); return; }
      trapFocusKeydown(e, box);
      if (e.key === 'Enter' && e.target === cancelBtn) { e.preventDefault(); close(cancelResult()); }
      else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); tryConfirm(); }
    }
    cancelBtn.addEventListener('click', function () { close(cancelResult()); });
    confirmBtn.addEventListener('click', tryConfirm);
    document.addEventListener('keydown', onKey);

    overlay.classList.add('open');
    box.classList.add('open');
    var firstField = box.querySelector('input,textarea');
    if (firstField) { firstField.focus(); if (firstField.select) firstField.select(); }
    else confirmBtn.focus();
  });
}

/* ============================================================
   Checkpoint — owner console (internal-only)
   ------------------------------------------------------------
   Everything that used to be the client bundle's "Partner Console" —
   the client roster, renewals, module-licensing matrix, per-client
   sync, and the partner-prefixed SharePoint lists behind it — lives
   here now, in its own bundle, loaded only by public/owner/index.html
   (served at /owner/). public/checkpoint/app.js (the client-facing
   bundle) contains none of it.

   Shares config.js/version.js/graph.js/lib.js/devflag.js/
   msal-browser.min.js/styles.css with the client app — same physical
   files, referenced via a relative "../checkpoint/" path (see
   owner/index.html and scripts/hash-checkpoint-assets.mjs) — but talks
   to Microsoft Graph directly (window.Graph.g()/gAll(), the exact
   primitives store.js itself is built on) rather than sharing store.js
   or any of its private state. store.js/app.js/ai.js/report.js/
   guidance.js/templates.js/changelog.js/selftest.js are never loaded
   here at all.

   OPERATIONAL NOTE for whoever deploys this: MSAL's redirect URI is
   computed from the current page's own URL (graph.js's init()/signIn()
   — `location.origin + location.pathname`), so this tenant's Entra app
   registration needs BOTH .../checkpoint/ and .../owner/ listed as
   allowed SPA redirect URIs, not just the former. See SETUP.md.

   Access gate: this whole console only ever renders once a Compliance365
   activation for THIS tenant verifies AND its `type` is 'partner' — a
   signed-in user without one sees nothing but the activation screen
   (#activationGate below), identically to how a client tenant's app.js
   shows #notActivated. There is no separate authorization layer beyond
   that signed, Ed25519-verified file — same trust model as the client
   app, same reasoning (see tools/ISSUANCE.md). */
(function () {
  var CONFIG = window.CHECKPOINT_CONFIG;
  var ENTITLEMENT_STATE = null;
  var siteId = null;
  var lists = {}; /* partner list key -> SharePoint list id, this session */
  var provisionOpts = { scopes: CONFIG.scopesProvision };

  /* Minimal id -> display-name lookup — NOT the full window.FRAMEWORKS
     registry (control sets, blurbs, content-pack wiring) the client
     bundle carries; this console only ever needs a name for a chip/
     column header, never a control list, so duplicating the full
     registry here would be pure bloat working against the whole point
     of a separate, smaller bundle. Keep in sync with store.js's
     FRAMEWORK_ORDER/FRAMEWORKS names by hand if a framework is ever
     added/renamed — a handful of ids, not a maintenance burden. */
  var FRAMEWORK_NAMES = {
    iso27001: 'ISO 27001', soc2: 'SOC 2', essential8: 'Essential Eight',
    iso42001: 'ISO 42001', iso27701: 'ISO 27701', dispirap: 'DISP / IRAP', nistcsf: 'NIST CSF',
    ai: 'AI assistant'
  };
  var FRAMEWORK_ORDER = ['iso27001', 'soc2', 'essential8', 'iso42001', 'iso27701', 'dispirap', 'nistcsf'];
  function fwName(fw) { return FRAMEWORK_NAMES[fw] || fw; }

  /* ================= small DOM helpers (same shapes as app.js's) ================= */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function fmtDate(d) { if (!d) return '—'; return new Date(d + 'T00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); }
  function toast(msg) {
    var t = document.getElementById('toast'); t.innerHTML = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 3400);
  }
  function busy(on) { var el = document.getElementById('busy'); if (el) el.style.display = on ? 'flex' : 'none'; }
  function warn(e) { console.error(e); toast('<b>Sync issue:</b> ' + esc(e.message || e)); }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function revealRows(container) {
    if (!container) return;
    var rows = container.children;
    if (!rows.length) return;
    if (prefersReducedMotion()) { for (var j = 0; j < rows.length; j++) rows[j].classList.remove('row-reveal'); return; }
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.add('row-reveal');
      rows[i].style.transitionDelay = Math.min(i * 30, 400) + 'ms';
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (var k = 0; k < rows.length; k++) rows[k].classList.add('show');
      });
    });
  }
  function skeletonRows(n, cols) {
    var cells = [];
    for (var c = 0; c < cols; c++) cells.push('<td><div class="skeleton">&nbsp;</div></td>');
    var row = '<tr class="skeleton-row">' + cells.join('') + '</tr>';
    return new Array(n + 1).join(row);
  }

  /* Same count-up KPI animation as the client app's app.js (identical
     implementation, duplicated rather than shared — see this file's
     own top comment on why nothing is imported from app.js). Build
     markup with data-count="N", call runCountUps(container) once right
     after setting innerHTML. .kpi b already has tabular-nums in the
     shared stylesheet, so numbers never jitter width mid-animation. */
  function countUp(el, target) {
    var n = typeof target === 'number' ? target : parseFloat(target);
    if (!el || isNaN(n) || !isFinite(n)) return;
    var tail = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 1) tail += el.childNodes[i].outerHTML;
    }
    if (prefersReducedMotion()) { el.innerHTML = n + tail; return; }
    var start = null, duration = 1200;
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      el.innerHTML = Math.round(n * eased) + tail;
      if (t < 1) requestAnimationFrame(frame);
      else el.innerHTML = n + tail;
    }
    requestAnimationFrame(frame);
  }
  function runCountUps(root) {
    (root || document).querySelectorAll('[data-count]').forEach(function (el) {
      countUp(el, el.getAttribute('data-count'));
      el.removeAttribute('data-count');
    });
  }

  /* Compact currency formatting for the revenue board's KPI tiles —
     $12.3K/$1.2M style, same rounding convention as the client app's
     fmtUsdCompact(), just currency-aware (PartnerPrices rows can be in
     any currency string; AUD is the only one this console assumes a
     "$" prefix reads naturally for — anything else shows its ISO code
     instead of guessing a symbol). */
  function fmtMoneyCompact(n, currency) {
    n = Math.max(0, Number(n) || 0);
    var prefix = (!currency || currency === 'AUD' || currency === 'USD') ? '$' : (currency + ' ');
    if (n >= 1000000) return prefix + (Math.round(n / 100000) / 10) + 'M';
    if (n >= 1000) return prefix + Math.round(n / 1000) + 'K';
    return prefix + Math.round(n);
  }
  function fmtMoneyFull(n, currency) {
    n = Math.max(0, Number(n) || 0);
    var prefix = (!currency || currency === 'AUD' || currency === 'USD') ? '$' : (currency + ' ');
    return prefix + Math.round(n).toLocaleString('en-AU');
  }

  /* "As at" timestamp — every computed figure in this console names its
     data source AND when it was computed (req: "never render a stale
     number without saying so"), rather than a bare number that looks
     live but might be minutes or days old. */
  function fmtAsAt(d) {
    d = d || new Date();
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  }

  /* Tiny 3-point sparkline (readiness trend) — a handful of SVG line
     segments, no dependency on report.js's chart engine (deliberately
     not loaded here — see this file's top comment). Flat "—" text
     (never a fabricated line) when there's fewer than 2 points. */
  function sparkline(points) {
    if (!points || points.length < 2) return '<span style="color:var(--paper-faint)">—</span>';
    var w = 60, h = 20, pad = 2;
    var max = Math.max(100, Math.max.apply(null, points.map(function (p) { return p.score || 0; })));
    var min = 0;
    var step = (w - pad * 2) / (points.length - 1);
    var coords = points.map(function (p, i) {
      var x = pad + i * step;
      var y = h - pad - ((p.score - min) / (max - min || 1)) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var last = points[points.length - 1];
    var trendColor = points.length > 1 && last.score >= points[0].score ? 'var(--pass)' : 'var(--warn)';
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><polyline points="' + coords.join(' ') + '" fill="none" stroke="' + trendColor + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  var ICONS = {
    check: '<path d="M2.5 7.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  };
  function icon(name, opts) {
    opts = opts || {};
    var size = opts.size || 14;
    var style = 'display:inline-block;vertical-align:-2px;flex:none' + (opts.style ? ';' + opts.style : '');
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 14 14" style="' + style + '" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  function emptyState(opts) {
    var body = '<div style="text-align:center;padding:34px 12px"><p style="color:var(--paper-faint);font-size:var(--fs-2);max-width:42ch;margin:0 auto">' + esc(opts.text) + '</p>' +
      (opts.cta ? '<button class="btn sm" data-action="' + opts.cta.action + '" style="margin-top:14px">' + esc(opts.cta.label) + '</button>' : '') + '</div>';
    return opts.asRow ? '<tr><td colspan="' + opts.colspan + '">' + body + '</td></tr>' : body;
  }

  var _drawerReturnFocus = null, _drawerKeyHandler = null;
  function openDrawerUi(label) {
    var drawer = document.getElementById('drawer');
    var overlay = document.getElementById('overlay');
    drawer.setAttribute('aria-label', label || 'Details');
    drawer.classList.add('open');
    overlay.classList.add('open');
    _drawerReturnFocus = document.activeElement;
    if (_drawerKeyHandler) document.removeEventListener('keydown', _drawerKeyHandler);
    _drawerKeyHandler = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); OwnerApp.closeDrawer(); return; }
      trapFocusKeydown(e, drawer);
    };
    document.addEventListener('keydown', _drawerKeyHandler);
    var firstFocusable = drawer.querySelector('button,a[href],input,select,textarea');
    (firstFocusable || drawer).focus();
  }
  function closeDrawerUi() {
    var drawer = document.getElementById('drawer');
    var overlay = document.getElementById('overlay');
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    if (_drawerKeyHandler) { document.removeEventListener('keydown', _drawerKeyHandler); _drawerKeyHandler = null; }
    if (_drawerReturnFocus && document.body.contains(_drawerReturnFocus)) _drawerReturnFocus.focus();
    _drawerReturnFocus = null;
  }

  /* ================= activation persistence (7.2's dual-store design, identically) ================= */
  function tenantStorageKey() {
    var acc = Graph.getAccount();
    return (acc && (acc.tenantId || acc.homeAccountId)) || 'default';
  }
  function activationStorageKey() { return 'cpActivation:v1:' + tenantStorageKey(); }
  function readLocalActivation() {
    try { return localStorage.getItem(activationStorageKey()); } catch (e) { return null; }
  }
  function writeLocalActivation(rawText) {
    try { localStorage.setItem(activationStorageKey(), rawText); return true; }
    catch (e) { console.error(e); return false; }
  }
  function removeLocalActivation() {
    try { localStorage.removeItem(activationStorageKey()); return true; }
    catch (e) { console.error(e); return false; }
  }

  var LICENSE_PERSIST_WARNING = null;
  function reportPersistenceFailure(store, message) {
    LICENSE_PERSIST_WARNING = { store: store, message: message };
    toast('<b>Could not save your licence' + (store === 'local' ? ' to this browser' : ' to this tenant\'s Settings list') + ':</b> ' + esc(message) + ' — it is NOT durably saved' + (store === 'tenant' ? ' for your colleagues' : ' in this browser') + ' yet.');
    renderLicensePanel();
  }
  function clearPersistenceFailure(store) {
    if (LICENSE_PERSIST_WARNING && LICENSE_PERSIST_WARNING.store === store) LICENSE_PERSIST_WARNING = null;
  }

  function tenantIdsFor(tenantInfo) {
    if (!tenantInfo) return [];
    return [tenantInfo.id].concat(tenantInfo.verifiedDomains || []).filter(Boolean);
  }

  /* Identical in every respect to app.js's own verifyActivationRaw() —
     same lib.js primitives, same failure messages, deliberately kept a
     byte-for-byte match so the two bundles never disagree about what a
     valid activation file is. Duplicated rather than imported because
     app.js is never loaded here (that's the whole point of this file). */
  async function verifyActivationRaw(rawText, acceptTenantIds) {
    var parsed;
    try { parsed = JSON.parse(rawText); } catch (e) {
      return { ok: false, reason: 'This doesn\'t look like a valid activation file (not valid JSON).' };
    }
    if (!parsed || !parsed.payload || !parsed.signature) {
      return { ok: false, reason: 'Missing payload/signature — this doesn\'t look like a Compliance365 activation file.' };
    }
    var sigOk = false;
    try {
      sigOk = await window.CheckpointLib.verifyEntitlementSignature(crypto.subtle, CONFIG.entitlementPublicKey, parsed.payload, parsed.signature);
    } catch (e) {
      return { ok: false, reason: 'Could not verify signature: ' + (e.message || e) };
    }
    if (!sigOk) {
      return { ok: false, reason: 'Signature verification failed — this file may have been altered, or wasn\'t issued by Compliance365.' };
    }
    var ids = Array.isArray(acceptTenantIds) ? acceptTenantIds : (acceptTenantIds ? [acceptTenantIds] : []);
    if (!ids.filter(Boolean).length) {
      return {
        ok: false,
        reason: 'Could not confirm this tenant\'s identity via Microsoft Graph just now — this may be a transient error, or Directory.Read.All hasn\'t finished consenting. Try again in a moment before assuming this file is wrong.',
        tenantLookupFailed: true
      };
    }
    var today = new Date().toISOString().slice(0, 10);
    var evalResult = window.CheckpointLib.evaluateEntitlement(parsed.payload, ids, today);
    if (evalResult.status === 'mismatch') {
      return { ok: false, reason: 'This activation file is issued for a different tenant.' };
    }
    return { ok: true, raw: rawText, evalResult: evalResult };
  }

  /* Same reconciliation shape as app.js's resolveBestActivation(), with
     one difference: the "tenant" candidate here is read from the
     regular client-facing 'Checkpoint Settings' list IF it happens to
     exist in this tenant (readClientSettingsEntitlementFile() below,
     read-only, never provisions it) — this console never creates that
     list; provisioning the client-facing lists is app.js's/its
     onboarding wizard's job, out of scope here. If it doesn't exist,
     the tenant leg is simply absent, same as app.js's own design when
     a Settings list can't be read. */
  async function resolveBestActivation(acceptTenantIds, tenantRaw) {
    var localRaw = readLocalActivation();
    var candidates = [];
    if (localRaw) candidates.push({ source: 'local', raw: localRaw });
    if (tenantRaw) candidates.push({ source: 'tenant', raw: tenantRaw });
    var checked = [];
    for (var i = 0; i < candidates.length; i++) {
      var result = await verifyActivationRaw(candidates[i].raw, acceptTenantIds);
      checked.push({ source: candidates[i].source, raw: candidates[i].raw, ok: result.ok, evalResult: result.evalResult, reason: result.reason });
    }
    var reconciled = window.CheckpointLib.reconcileActivationSources(checked);
    return { winner: reconciled.winner, staleSources: reconciled.staleSources, checked: checked, hadAnyCandidate: candidates.length > 0 };
  }

  /* Resolves the site this tenant's Checkpoint (the client app) uses —
     read-only, respects the SAME 'cpSite:<tenant>' localStorage
     preference app.js's applyStoredSitePreference() writes (this is
     genuinely shared: localStorage is per-ORIGIN, not per-path, so a
     choice made in the client app at /checkpoint/ is already visible
     here at /owner/ with no extra plumbing). Falls back to config.js's
     default ('root') exactly like the client app does. */
  async function resolveClientSite() {
    var pref = null;
    try { pref = localStorage.getItem('cpSite:' + tenantStorageKey()); } catch (e) { /* ignore */ }
    var path = pref || CONFIG.site;
    if (path === 'root') return (await Graph.g('/sites/root?$select=id', provisionOpts)).id;
    var host = (await Graph.g('/sites/root?$select=siteCollection,webUrl', provisionOpts)).webUrl.replace(/^https:\/\//, '').split('/')[0];
    return (await Graph.g('/sites/' + host + ':' + path + '?$select=id', provisionOpts)).id;
  }

  /* Read-only lookup of the regular 'Checkpoint Settings' list's
     entitlementFile value, if that list exists at all in this tenant.
     Never creates anything — provisioning the client-facing lists
     belongs to app.js's onboarding wizard, not this console. */
  async function readClientSettingsEntitlementFile(clientSiteId) {
    try {
      var existing = await Graph.gAll('/sites/' + clientSiteId + '/lists?$select=id,displayName&$top=200', provisionOpts);
      var settingsList = existing.find(function (l) { return l.displayName === CONFIG.listPrefix + ' Settings'; });
      if (!settingsList) return null;
      var rows = await Graph.gAll('/sites/' + clientSiteId + '/lists/' + settingsList.id + '/items?$expand=fields&$top=200', provisionOpts);
      var row = rows.find(function (i) { return i.fields.SettingKey === 'entitlementFile'; });
      return { listId: settingsList.id, rowId: row && row.id, raw: (row && row.fields.SettingValue) || null };
    } catch (e) { return null; }
  }
  /* Self-heals a text column a tenant provisioned before this list's
     schema moved to allowMultipleLines (see store.js's own comment on
     the Settings list) — SharePoint's default single-line text caps at
     255 characters, too small for a partner-type activation file with
     every module's key embedded. Widening it via Graph's own columns
     endpoint means no tenant needs a manual SharePoint edit the first
     time a large value overflows it. Returns false (nothing to heal) if
     the column is already wide or wasn't found. */
  async function widenTextColumnIfNarrow(clientSiteId, listId, columnName) {
    var cols = await Graph.gAll('/sites/' + clientSiteId + '/lists/' + listId + '/columns?$select=id,name,text', provisionOpts);
    var col = cols.find(function (c) { return c.name === columnName; });
    if (!col || (col.text && col.text.allowMultipleLines)) return false;
    await Graph.g('/sites/' + clientSiteId + '/lists/' + listId + '/columns/' + col.id, {
      method: 'PATCH', body: { text: { allowMultipleLines: true } }, scopes: CONFIG.scopesProvision
    });
    return true;
  }
  async function writeClientSettingsEntitlementFile(clientSiteId, cached, raw) {
    if (!cached || !cached.listId) throw new Error('This tenant has no "Checkpoint Settings" list yet — nothing to sync into (that list is only ever created by the client app\'s own onboarding).');
    async function write() {
      if (cached.rowId) {
        await Graph.g('/sites/' + clientSiteId + '/lists/' + cached.listId + '/items/' + cached.rowId + '/fields', { method: 'PATCH', body: { SettingValue: raw }, scopes: CONFIG.scopesProvision });
      } else {
        await Graph.g('/sites/' + clientSiteId + '/lists/' + cached.listId + '/items', { method: 'POST', body: { fields: { Title: 'entitlementFile', SettingKey: 'entitlementFile', SettingValue: raw } }, scopes: CONFIG.scopesProvision });
      }
    }
    try {
      await write();
    } catch (e) {
      /* One self-heal attempt, then one retry — see
         widenTextColumnIfNarrow()'s own comment above. If the column
         was already wide, widening failed, or the retry still fails,
         the ORIGINAL error propagates unchanged (surfaced by the
         caller's reportPersistenceFailure, same as before this fix). */
      var healed = false;
      try { healed = await widenTextColumnIfNarrow(clientSiteId, cached.listId, 'SettingValue'); } catch (e2) { /* best-effort only */ }
      if (!healed) throw e;
      await write();
    }
  }

  /* Mirrors the winning raw text into whichever store is stale —
     same principle as app.js's mirrorActivationStores(), simplified
     since the tenant leg here is read-only-unless-already-provisioned
     (see readClientSettingsEntitlementFile()'s own comment). */
  async function mirrorActivationStores(resolved, clientSiteId, clientSettingsCache) {
    if (!resolved || !resolved.winner) return;
    var winner = resolved.winner;
    if (readLocalActivation() !== winner.raw) {
      if (writeLocalActivation(winner.raw)) clearPersistenceFailure('local');
      else reportPersistenceFailure('local', 'This browser\'s storage could not be written (private browsing, or storage is full).');
    } else {
      clearPersistenceFailure('local');
    }
    if (clientSettingsCache && clientSettingsCache.listId && (clientSettingsCache.raw || '') !== winner.raw) {
      try {
        await writeClientSettingsEntitlementFile(clientSiteId, clientSettingsCache, winner.raw);
        clientSettingsCache.raw = winner.raw;
        clearPersistenceFailure('tenant');
      } catch (e) {
        reportPersistenceFailure('tenant', e.message || String(e));
      }
    }
  }

  /* ================= Licence panel (same shape as app.js's) ================= */
  /* Two containers share this markup — #licensePanel (the main console)
     and #licensePanelGate (the activation-gate screen, shown to a
     signed-in user without a verified partner activation yet) — two
     DISTINCT ids, never the same id twice in the DOM, so both can be
     kept in sync with one render call regardless of which screen is
     currently visible. */
  var _clientSiteIdForPanel = null, _clientSettingsCacheForPanel = null;
  function renderLicensePanel() {
    var targets = ['licensePanel', 'licensePanelGate'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!targets.length) return;
    var localRaw = readLocalActivation();
    var tenantRaw = (_clientSettingsCacheForPanel && _clientSettingsCacheForPanel.raw) || '';
    var inLocal = !!localRaw, inTenant = !!tenantRaw, same = inLocal && inTenant && localRaw === tenantRaw;
    var where = !inLocal && !inTenant ? 'Not stored anywhere yet'
      : (inLocal && inTenant) ? (same ? 'This browser + the tenant\'s Settings list (in sync)' : 'This browser AND the tenant\'s Settings list — <b style="color:var(--warn)">they differ</b>, will reconcile on next successful load')
      : inLocal ? 'This browser only — not yet saved to the tenant\'s Settings list'
      : 'The tenant\'s Settings list only — not yet cached in this browser';
    var warnBanner = '';
    if (LICENSE_PERSIST_WARNING) {
      warnBanner = '<div class="appetite-banner" style="display:block;margin-bottom:10px"><b>Persistence problem:</b> could not save to ' +
        (LICENSE_PERSIST_WARNING.store === 'local' ? 'this browser\'s storage' : 'the tenant\'s Settings list') + ' — ' + esc(LICENSE_PERSIST_WARNING.message) + '.</div>';
    }
    var html;
    if (!ENTITLEMENT_STATE) {
      html = warnBanner + '<p style="color:var(--paper-faint);font-size:12.5px">No activation currently held for this tenant. Stored: ' + where + '.</p>' +
        (inLocal || inTenant ? '<button class="btn ghost sm" data-action="OwnerApp.removeLocalLicense" style="margin-top:8px">Remove licence from this browser</button>' : '');
    } else {
      var note = '';
      if (ENTITLEMENT_STATE.status === 'expired') {
        note = '<div class="appetite-banner" style="display:block;margin-top:10px"><b>Activation expired ' + fmtDate(ENTITLEMENT_STATE.expiry) + '</b> — renew to keep this console usable.</div>';
      } else if (ENTITLEMENT_STATE.status === 'grace') {
        note = '<div class="appetite-banner" style="display:block;margin-top:10px"><b>Activation expired ' + fmtDate(ENTITLEMENT_STATE.expiry) + '</b> — in its grace period until <b>' + fmtDate(ENTITLEMENT_STATE.graceUntil) + '</b>.</div>';
      } else if (ENTITLEMENT_STATE.type !== 'partner') {
        note = '<div class="appetite-banner" style="display:block;margin-top:10px"><b>This activation is not type "partner"</b> — the owner console stays locked until a partner-type file is applied.</div>';
      }
      html = warnBanner +
        '<div class="d-kv"><span>Type</span><b>' + esc(ENTITLEMENT_STATE.type) + '</b></div>' +
        '<div class="d-kv"><span>Tenant</span><b>' + esc(ENTITLEMENT_STATE.tenantId) + '</b></div>' +
        '<div class="d-kv"><span>Frameworks granted</span><b>' + esc((ENTITLEMENT_STATE.frameworks || []).map(fwName).join(', ') || '—') + '</b></div>' +
        '<div class="d-kv"><span>Issued</span><b>' + fmtDate(ENTITLEMENT_STATE.issuedAt) + '</b></div>' +
        '<div class="d-kv"><span>Expiry</span><b style="' + (ENTITLEMENT_STATE.status === 'valid' ? '' : 'color:var(--fail)') + '">' + fmtDate(ENTITLEMENT_STATE.expiry) + '</b></div>' +
        '<div class="d-kv"><span>Verification</span><b>' + esc(ENTITLEMENT_STATE.status) + '</b></div>' +
        '<div class="d-kv"><span>Stored</span><b>' + where + '</b></div>' +
        note +
        '<button class="btn ghost sm" data-action="OwnerApp.removeLocalLicense" style="margin-top:10px">Remove licence from this browser</button>';
    }
    targets.forEach(function (el) { el.innerHTML = html; });
  }

  /* ================= partner-prefixed list provisioning (owner-only) ================= */
  /* Same shape/columns as the client bundle used to carry in store.js's
     PARTNER_DEFS, plus PartnerPrices (new) and this console's own
     AuditLog (new — previously owner actions were logged into the
     TENANT'S regular audit log; now they get their own, matching the
     "plus our own audit log" requirement). */
  var PARTNER_DEFS = {
    PartnerClients: [
      { name: 'ClientName', text: {} }, { name: 'TenantId', text: {} }, { name: 'Status', text: {} },
      { name: 'ContactName', text: {} }, { name: 'ContactEmail', text: {} }, { name: 'Notes', text: { allowMultipleLines: true } },
      { name: 'Modules', text: {} }, { name: 'LastSynced', text: {} }, { name: 'LastSyncedBy', text: {} },
      { name: 'Onboarded', boolean: {} }, { name: 'PostureScore', number: {} }, { name: 'LastScanDate', text: {} },
      { name: 'Readiness', text: { allowMultipleLines: true } }, { name: 'AppVersion', text: {} },
      { name: 'DriftAlerts', number: {} }, { name: 'SyncError', text: { allowMultipleLines: true } },
      /* --- computed at sync time, from this same sync's own data — see partnerSyncClient() --- */
      { name: 'NextBestModule', text: {} } /* unlicensed framework id with the highest cross-mapped readiness, or blank */,
      { name: 'NextBestModulePct', number: {} },
      { name: 'ScoreHistory', text: { allowMultipleLines: true } } /* JSON array of {date, score}, capped at the last 3 syncs */,
      { name: 'PackSentAt', text: {} } /* ISO datetime the welcome pack email was last sent, or blank — the one input to computeClientChecklist() not already derived from a sync */,
      { name: 'RolesConfiguredAt', text: {} } /* ISO datetime the owner last confirmed the client's SharePoint Practitioner/Viewer groups (wizard step 8, SETUP.md §5a) are set up — manual, since this console can't read the client tenant's own SharePoint permissions */,
      /* Licensing scope — owner-set, never inferred from a sync. Feeds
         the Client costs tab alongside PartnerEntitlements/PartnerPrices.
         New columns → added to already-provisioned tenants via
         reconcilePartnerColumns() below, no re-provisioning needed. */
      { name: 'Headcount', number: {} } /* people in scope, for licensing/quoting */,
      { name: 'Locations', number: {} } /* sites/offices in scope */,
      { name: 'ScopeNotes', text: { allowMultipleLines: true } } /* anything else pertinent to licensing — cloud/on-prem mix, subsidiaries, systems in scope, etc. */
    ],
    PartnerEntitlements: [
      { name: 'TenantId', text: {} }, { name: 'Type', text: {} }, { name: 'Modules', text: {} },
      { name: 'IssuedAt', text: {} }, { name: 'Expiry', text: {} }, { name: 'EntitlementHash', text: {} },
      /* Owner-set — never inferred, never overwritten by a sync (a sync
         only ever touches PartnerClients, never these fields). */
      { name: 'ManualStatus', text: {} } /* '' | 'Renewed' | 'In discussion' | 'At risk' */,
      { name: 'RenewedBy', text: {} } /* SharePoint item id of the superseding entitlement, once "prepare renewal" records one */,
      /* Payment tracking — see computePaymentStatus() in lib.js.
         PaymentStatus is only ever '' | 'Invoiced' | 'Paid'; "Overdue" is
         always derived from InvoiceDueDate vs. today, never stored, so
         it can never go stale from being forgotten. PaidDate is a
         record-of-fact once marked Paid, not used in any computation. */
      { name: 'PaymentStatus', text: {} }, { name: 'InvoiceDueDate', text: {} }, { name: 'PaidDate', text: {} }
    ],
    /* Price book for what each module is actually billed. Read ONLY by
       the owner console's own revenue math (computePartnerRevenue() in
       lib.js) — never by a client tenant, never provisioned or read
       anywhere in public/checkpoint/. Editable in-app (the "Prices"
       tab) rather than only-in-SharePoint now that the revenue board
       depends on it being current. */
    PartnerPrices: [
      { name: 'ModuleId', text: {} }, { name: 'AnnualPrice', number: {} },
      { name: 'Currency', text: {} }, { name: 'Notes', text: { allowMultipleLines: true } }
    ],
    AuditLog: [
      { name: 'Actor', text: {} }, { name: 'ActorId', text: {} }, { name: 'Action', text: {} },
      { name: 'TargetType', text: {} }, { name: 'TargetId', text: {} },
      { name: 'Before', text: { allowMultipleLines: true } }, { name: 'After', text: { allowMultipleLines: true } },
      { name: 'EntryDateTime', text: {} }
    ]
  };
  function partnerListName(k) { return 'Checkpoint Partner ' + k; }

  async function addItem(listKey, fields) {
    var j = await Graph.g('/sites/' + siteId + '/lists/' + lists[listKey] + '/items', { method: 'POST', body: { fields: fields }, scopes: CONFIG.scopesProvision });
    return j.id;
  }
  async function patchItem(listKey, itemId, fields) {
    await Graph.g('/sites/' + siteId + '/lists/' + lists[listKey] + '/items/' + itemId + '/fields', { method: 'PATCH', body: fields, scopes: CONFIG.scopesProvision });
  }
  async function items(listKey) {
    return Graph.gAll('/sites/' + siteId + '/lists/' + lists[listKey] + '/items?$expand=fields&$top=200', provisionOpts);
  }
  function csv(a) { return (a || []).join(','); }
  function uncsv(s) { return s ? String(s).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : []; }

  /* Read-only — which of PARTNER_DEFS' lists already exist in THIS
     (Compliance365's own) tenant. Never creates anything; the caller
     decides whether to offer one-click provisioning. */
  async function findExistingPartnerLists() {
    siteId = siteId || await Graph.g('/sites/root?$select=id', provisionOpts).then(function (s) { return s.id; });
    var existing = await Graph.gAll('/sites/' + siteId + '/lists?$select=id,displayName&$top=200', provisionOpts);
    var found = {};
    for (var k in PARTNER_DEFS) {
      var match = existing.find(function (l) { return l.displayName === partnerListName(k); });
      if (match) { lists[k] = match.id; found[k] = true; }
    }
    return found;
  }

  /* One-click provisioning — the bootstrap flow (task point 2). Only
     ever called after a verified partner activation is already held
     (checked by the caller), reusing the exact same idempotent
     create-if-missing shape store.js's own ensureLists()/
     ensurePartnerLists() used. */
  async function provisionPartnerLists(onStatus) {
    var existing = await Graph.gAll('/sites/' + siteId + '/lists?$select=id,displayName&$top=200', provisionOpts);
    for (var k in PARTNER_DEFS) {
      var name = partnerListName(k);
      var found = existing.find(function (l) { return l.displayName === name; });
      if (found) { lists[k] = found.id; continue; }
      if (onStatus) onStatus('Creating list “' + name + '”…');
      var created = await Graph.g('/sites/' + siteId + '/lists', {
        method: 'POST', body: { displayName: name, columns: PARTNER_DEFS[k], list: { template: 'genericList' } }, scopes: CONFIG.scopesProvision
      });
      lists[k] = created.id;
    }
  }

  /* Lists whose PARTNER_DEFS schema has grown columns since early
     tenants provisioned the owner console — each is added to an
     existing list if missing, same self-heal idea (and same reasoning)
     as store.js's reconcileColumns() for the client-facing lists. Add a
     list/column here whenever PARTNER_DEFS gains one. */
  var PARTNER_COLUMN_RECONCILE = {
    PartnerClients: ['Headcount', 'Locations', 'ScopeNotes', 'RolesConfiguredAt'],
    PartnerEntitlements: ['PaymentStatus', 'InvoiceDueDate', 'PaidDate']
  };
  async function reconcilePartnerColumns(onStatus) {
    for (var k in PARTNER_COLUMN_RECONCILE) {
      if (!lists[k]) continue;
      var want = PARTNER_COLUMN_RECONCILE[k];
      var cols;
      try { cols = await Graph.gAll('/sites/' + siteId + '/lists/' + lists[k] + '/columns?$select=name', provisionOpts); }
      catch (e) { continue; /* can't read columns — leave it; a later write to a missing field surfaces the real error */ }
      var have = {};
      cols.forEach(function (c) { have[c.name] = true; });
      var missing = want.filter(function (n) { return !have[n]; });
      if (!missing.length) continue;
      for (var i = 0; i < missing.length; i++) {
        var def = PARTNER_DEFS[k].find(function (d) { return d.name === missing[i]; });
        if (!def) continue;
        if (onStatus) onStatus('Adding “' + missing[i] + '” to ' + partnerListName(k) + '…');
        try { await Graph.g('/sites/' + siteId + '/lists/' + lists[k] + '/columns', { method: 'POST', body: def, scopes: CONFIG.scopesProvision }); }
        catch (e) { /* best-effort — a genuine failure surfaces when a write to that field later fails */ }
      }
    }
  }

  function mapPartnerClient(i) {
    var f = i.fields;
    var readiness = {}, scoreHistory = [];
    try { readiness = JSON.parse(f.Readiness || '{}'); } catch (e) { }
    try { scoreHistory = JSON.parse(f.ScoreHistory || '[]'); } catch (e) { }
    return {
      _sp: i.id, name: f.ClientName || f.Title || '', tenantId: f.TenantId || '', status: f.Status || 'Prospect',
      contactName: f.ContactName || '', contactEmail: f.ContactEmail || '', notes: f.Notes || '',
      modules: uncsv(f.Modules), lastSynced: f.LastSynced || '', lastSyncedBy: f.LastSyncedBy || '',
      onboarded: !!f.Onboarded, score: typeof f.PostureScore === 'number' ? f.PostureScore : null,
      lastScanDate: f.LastScanDate || '', readinessByFw: readiness, appVersion: f.AppVersion || '',
      driftAlerts: typeof f.DriftAlerts === 'number' ? f.DriftAlerts : 0, syncError: f.SyncError || '',
      nextBestModule: f.NextBestModule || '', nextBestModulePct: typeof f.NextBestModulePct === 'number' ? f.NextBestModulePct : null,
      scoreHistory: Array.isArray(scoreHistory) ? scoreHistory : [], packSentAt: f.PackSentAt || '',
      headcount: typeof f.Headcount === 'number' ? f.Headcount : null,
      locations: typeof f.Locations === 'number' ? f.Locations : null,
      scopeNotes: f.ScopeNotes || '',
      rolesConfiguredAt: f.RolesConfiguredAt || ''
    };
  }
  function mapPartnerEntitlement(i) {
    var f = i.fields;
    return {
      _sp: i.id, tenantId: f.TenantId || '', type: f.Type || 'client', modules: uncsv(f.Modules),
      issuedAt: f.IssuedAt || '', expiry: f.Expiry || '', hash: f.EntitlementHash || '',
      manualStatus: f.ManualStatus || '', renewedBy: f.RenewedBy || '',
      paymentStatus: f.PaymentStatus || '', invoiceDueDate: f.InvoiceDueDate || '', paidDate: f.PaidDate || ''
    };
  }
  function mapPartnerPrice(i) {
    var f = i.fields;
    return { _sp: i.id, moduleId: f.ModuleId || '', annualPrice: typeof f.AnnualPrice === 'number' ? f.AnnualPrice : 0, currency: f.Currency || 'AUD', notes: f.Notes || '' };
  }

  async function loadPartnerConsoleData() {
    var clientItems = await items('PartnerClients');
    var entItems = await items('PartnerEntitlements');
    var priceItems = await items('PartnerPrices');
    return { clients: clientItems.map(mapPartnerClient), entitlements: entItems.map(mapPartnerEntitlement), prices: priceItems.map(mapPartnerPrice) };
  }
  async function addPartnerClient(c) {
    c._sp = await addItem('PartnerClients', { Title: c.name, ClientName: c.name, TenantId: c.tenantId, Status: c.status || 'Prospect', ContactName: c.contactName || '', ContactEmail: c.contactEmail || '', Notes: c.notes || '', Headcount: c.headcount, Locations: c.locations, ScopeNotes: c.scopeNotes || '' });
  }
  async function updatePartnerClient(c) {
    await patchItem('PartnerClients', c._sp, {
      Title: c.name, ClientName: c.name, TenantId: c.tenantId, Status: c.status || 'Prospect',
      ContactName: c.contactName || '', ContactEmail: c.contactEmail || '', Notes: c.notes || '',
      Modules: csv(c.modules), LastSynced: c.lastSynced || '', LastSyncedBy: c.lastSyncedBy || '',
      Onboarded: !!c.onboarded, PostureScore: c.score, LastScanDate: c.lastScanDate || '',
      Readiness: JSON.stringify(c.readinessByFw || {}), AppVersion: c.appVersion || '',
      DriftAlerts: c.driftAlerts || 0, SyncError: c.syncError || '',
      NextBestModule: c.nextBestModule || '', NextBestModulePct: c.nextBestModulePct,
      ScoreHistory: JSON.stringify(c.scoreHistory || []), PackSentAt: c.packSentAt || '',
      Headcount: c.headcount, Locations: c.locations, ScopeNotes: c.scopeNotes || '',
      RolesConfiguredAt: c.rolesConfiguredAt || ''
    });
  }
  async function deletePartnerClient(c) {
    await Graph.g('/sites/' + siteId + '/lists/' + lists.PartnerClients + '/items/' + c._sp, { method: 'DELETE', scopes: CONFIG.scopesProvision });
  }
  async function addPartnerEntitlementRecord(e) {
    e._sp = await addItem('PartnerEntitlements', {
      Title: e.tenantId, TenantId: e.tenantId, Type: e.type, Modules: csv(e.modules), IssuedAt: e.issuedAt, Expiry: e.expiry,
      EntitlementHash: e.hash || '', ManualStatus: e.manualStatus || '', RenewedBy: e.renewedBy || '',
      PaymentStatus: e.paymentStatus || '', InvoiceDueDate: e.invoiceDueDate || '', PaidDate: e.paidDate || ''
    });
  }
  async function updatePartnerEntitlementRecord(e) {
    await patchItem('PartnerEntitlements', e._sp, {
      ManualStatus: e.manualStatus || '', RenewedBy: e.renewedBy || '',
      PaymentStatus: e.paymentStatus || '', InvoiceDueDate: e.invoiceDueDate || '', PaidDate: e.paidDate || ''
    });
  }
  async function addPartnerPrice(p) {
    p._sp = await addItem('PartnerPrices', { Title: p.moduleId, ModuleId: p.moduleId, AnnualPrice: p.annualPrice || 0, Currency: p.currency || 'AUD', Notes: p.notes || '' });
  }
  async function updatePartnerPrice(p) {
    await patchItem('PartnerPrices', p._sp, { Title: p.moduleId, ModuleId: p.moduleId, AnnualPrice: p.annualPrice || 0, Currency: p.currency || 'AUD', Notes: p.notes || '' });
  }
  async function deletePartnerPrice(p) {
    await Graph.g('/sites/' + siteId + '/lists/' + lists.PartnerPrices + '/items/' + p._sp, { method: 'DELETE', scopes: CONFIG.scopesProvision });
  }

  /* This console's OWN audit log — "plus our own audit log" (task point
     2) — distinct from the tenant's regular 'Checkpoint AuditLog' list
     (which tracks THIS tenant's own compliance activity in the client
     app, if it runs the client app on itself). Every owner-console
     action (client added/removed/synced, entitlement recorded,
     activation applied/renewed/removed) lands here instead. Never
     blocks the action it's recording — a logging failure is a
     non-blocking toast, same convention as the client app's own
     audit(). */
  function audit(action, targetType, targetId, before, after) {
    var acc = Graph.getAccount();
    var entry = {
      Title: action, Actor: (acc && (acc.name || acc.username)) || 'Practitioner', ActorId: (acc && (acc.homeAccountId || acc.localAccountId)) || '',
      Action: action, TargetType: targetType, TargetId: String(targetId || ''),
      Before: before === undefined || before === null ? '' : String(before),
      After: after === undefined || after === null ? '' : String(after),
      EntryDateTime: new Date().toISOString()
    };
    if (!lists.AuditLog) return; /* not provisioned yet — nothing to write to */
    Graph.g('/sites/' + siteId + '/lists/' + lists.AuditLog + '/items', { method: 'POST', body: { fields: entry }, scopes: CONFIG.scopesProvision })
      .catch(function (e) { console.error(e); toast('<b>Audit log entry not recorded:</b> ' + esc(e.message || e)); });
  }

  /* ================= legacy migration (task point 3) ================= */
  /* The only genuine "old storage" left to migrate: 'checkpoint-portfolio-
     v1', a browser-local relic from BEFORE the Partner Console existed at
     all (a standalone "Portfolio" view). Everything the Partner Console
     itself ever stored already lives in these same 'Checkpoint Partner
     ...' SharePoint lists (same list names, provisioned by the OLD
     in-app console with the identical shape) — there is nothing else to
     migrate for that. Naturally idempotent: once the legacy key is
     migrated and removed, there's nothing left to find on a later
     load, in this or any other browser (localStorage was always
     per-browser, so no OTHER browser ever had this key to begin with). */
  async function migrateLegacyPortfolioIfNeeded() {
    var raw;
    try { raw = localStorage.getItem('checkpoint-portfolio-v1'); } catch (e) { raw = null; }
    if (!raw) return;
    var data = null;
    try { data = JSON.parse(raw); } catch (e) { data = null; }
    var oldClients = (data && data.clients) || [];
    for (var i = 0; i < oldClients.length; i++) {
      var old = oldClients[i];
      var c = {
        name: old.name || old.tenantId, tenantId: old.tenantId,
        status: old.lastSynced ? (old.onboarded === false ? 'Prospect' : 'Active') : 'Prospect',
        contactName: '', contactEmail: '', notes: 'Migrated from the old Portfolio view.',
        modules: [], lastSynced: old.lastSynced || '', lastSyncedBy: '', onboarded: !!old.onboarded,
        score: typeof old.score === 'number' ? old.score : null, lastScanDate: '',
        readinessByFw: typeof old.readiness === 'number' ? { iso27001: old.readiness } : {},
        appVersion: '', driftAlerts: old.criticalRisks || 0, syncError: old.error || ''
      };
      try { await addPartnerClient(c); } catch (e) { warn(e); }
    }
    try { localStorage.removeItem('checkpoint-portfolio-v1'); } catch (e) { /* private browsing etc. — not fatal */ }
    if (oldClients.length) audit('Legacy Portfolio data migrated', 'PartnerClient', '', '', oldClients.length + ' client(s) migrated');
  }

  /* ================= rendering: the console itself ================= */
  var PARTNER_DATA = null;
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function partnerModuleChips(moduleIds) {
    if (!moduleIds || !moduleIds.length) return '<span style="color:var(--paper-faint);font-size:11px">None</span>';
    return '<span class="fw-chips">' + moduleIds.map(function (fw) { return '<span>' + esc(fwName(fw)) + '</span>'; }).join('') + '</span>';
  }
  /* Payment status chip + its one relevant next action — Not invoiced ->
     "Mark invoiced", Invoiced/Overdue -> "Mark paid", Paid -> "Reset"
     (for correcting a mistake). See computePaymentStatus() in lib.js —
     "Overdue" is always derived from the due date, never a separate
     flag this console could forget to update. No entitlement at all
     (never billed, or a trial) renders as "—", never a fabricated
     status. */
  function renderPaymentCell(ent) {
    if (!ent) return '<span class="src">—</span>';
    var p = window.CheckpointLib.computePaymentStatus(ent, todayStr());
    var cls = p.status === 'Paid' ? 'st-Implemented' : p.status === 'Overdue' ? 'st-Open' : p.status === 'Invoiced' ? 'st-Intreatment' : 'st-Notstarted';
    var label = p.status === 'Overdue' ? p.status + ' · ' + p.daysOverdue + 'd' : p.status;
    var actionBtn = p.status === 'Paid'
      ? '<button class="btn ghost sm" data-action="OwnerApp.partnerResetPayment" data-id="' + esc(ent._sp) + '">Reset</button>'
      : (p.status === 'Not invoiced'
        ? '<button class="btn ghost sm" data-action="OwnerApp.partnerMarkInvoiced" data-id="' + esc(ent._sp) + '">Mark invoiced</button>'
        : '<button class="btn sm" data-action="OwnerApp.partnerMarkPaid" data-id="' + esc(ent._sp) + '">Mark paid</button>');
    return '<span class="chip ' + cls + '">' + esc(label) + '</span><div style="margin-top:6px">' + actionBtn + '</div>';
  }
  function partnerDaysUntil(dateStr) {
    if (!dateStr) return null;
    return window.CheckpointLib.daysBetweenDateStr(todayStr(), dateStr);
  }
  function partnerRenewalFlag(days) {
    if (days == null) return { color: 'var(--paper-faint)', label: 'No record' };
    if (days < 0) return { color: 'var(--fail)', label: 'Expired ' + Math.abs(days) + 'd ago' };
    if (days <= 30) return { color: 'var(--fail)', label: days + 'd remaining' };
    if (days <= 60) return { color: 'var(--warn)', label: days + 'd remaining' };
    if (days <= 90) return { color: 'var(--gold-light)', label: days + 'd remaining' };
    return { color: 'var(--paper-dim)', label: days + 'd remaining' };
  }
  function partnerLatestEntitlementFor(tenantId) {
    var matches = (PARTNER_DATA.entitlements || []).filter(function (e) { return e.tenantId === tenantId; });
    if (!matches.length) return null;
    return matches.slice().sort(function (a, b) { return (b.issuedAt || '').localeCompare(a.issuedAt || ''); })[0];
  }
  /* No ring-gauge glyph here (that's report.js's ReportEngine.charts.
     fingerprint(), deliberately not loaded in this bundle — pulling in
     the whole report engine for one small chart would defeat the point
     of a separate, smaller console) — just the plain average percentage. */
  function partnerAvgReadiness(c) {
    var vals = Object.keys(c.readinessByFw || {}).map(function (fw) { return Number(c.readinessByFw[fw]) || 0; });
    if (!vals.length) return null;
    return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
  }

  /* { [moduleId]: annualPrice } for computePartnerRevenue() — modules
     used by any entitlement but with NO PartnerPrices row at all (as
     opposed to a deliberate $0 price) are flagged separately by
     priceGaps() below so the revenue board can say so honestly rather
     than silently treating "no price on file" the same as "free". */
  function pricesMap() {
    var map = {};
    (PARTNER_DATA.prices || []).forEach(function (p) { if (p.moduleId) map[p.moduleId] = p.annualPrice; });
    return map;
  }
  function priceGaps() {
    var known = {};
    (PARTNER_DATA.prices || []).forEach(function (p) { known[p.moduleId] = true; });
    var used = {};
    (PARTNER_DATA.entitlements || []).forEach(function (e) { (e.modules || []).forEach(function (m) { used[m] = true; }); });
    return Object.keys(used).filter(function (m) { return !known[m]; });
  }

  /* Composite health for one client — thin wrapper around lib.js's
     computeClientHealth(), assembling its input from this client's own
     PartnerClients snapshot plus their latest PartnerEntitlements
     record. Used by the roster row dot, the Module Adoption Matrix's
     dormancy check, the Client Health Strip, and the summary card, so
     all four always agree with each other. */
  function clientHealthFor(c) {
    var ent = partnerLatestEntitlementFor(c.tenantId);
    var today = todayStr();
    /* Payment status only means something for a real client-type
       entitlement — a trial/demo has nothing to invoice. */
    var pay = (ent && ent.type === 'client') ? window.CheckpointLib.computePaymentStatus(ent, today) : null;
    return window.CheckpointLib.computeClientHealth({
      syncError: c.syncError, lastSynced: c.lastSynced, lastScanDate: c.lastScanDate,
      score: c.score, driftAlerts: c.driftAlerts,
      entitlementStatus: ent ? (ent.expiry && ent.expiry < today ? 'expired' : 'valid') : null,
      entitlementExpiry: ent ? ent.expiry : null,
      manualStatus: ent ? ent.manualStatus : '',
      paymentOverdue: pay ? pay.overdue : false,
      paymentOverdueDays: pay ? pay.daysOverdue : 0
    }, today);
  }
  var HEALTH_COLOR_VAR = { red: 'var(--fail)', amber: 'var(--warn)', green: 'var(--pass)', unknown: 'var(--paper-faint)' };

  async function renderPartnerClientRows() {
    var tbody = document.getElementById('partnerClientRows');
    if (!tbody) return;
    var clients = (PARTNER_DATA && PARTNER_DATA.clients) || [];
    if (!clients.length) { tbody.innerHTML = emptyState({ asRow: true, colspan: 6, text: 'No clients yet.', cta: { label: '+ Add client', action: 'OwnerApp.partnerPromptAddClient' } }); return; }
    tbody.innerHTML = clients.map(function (c) {
      var ent = partnerLatestEntitlementFor(c.tenantId);
      var days = ent ? partnerDaysUntil(ent.expiry) : null;
      var flag = partnerRenewalFlag(days);
      var health = clientHealthFor(c);
      var avg = partnerAvgReadiness(c);
      return '<tr>' +
        '<td class="id-t"><button class="lnk" data-action="OwnerApp.partnerOpenClientDrawer" data-id="' + esc(c._sp) + '" style="font-weight:700;font-size:var(--fs-2)">' + esc(c.name) + '</button>' +
        '<div class="src">' + esc(c.tenantId) + '</div></td>' +
        '<td>' + (avg == null ? '<span style="color:var(--paper-faint)">—</span>' : '<b>' + avg + '%</b> avg') + '</td>' +
        '<td><select class="mini" data-change-action="OwnerApp.partnerSetClientStatus" data-id="' + esc(c._sp) + '">' +
        ['Prospect', 'Trial', 'Active', 'Expired', 'Churned'].map(function (s) { return '<option' + (c.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></td>' +
        '<td>' + partnerModuleChips(c.modules) + '</td>' +
        '<td style="color:' + flag.color + ';white-space:nowrap">' + (ent ? esc(fmtDate(ent.expiry)) : 'No record') + (ent ? '<div class="src" style="color:' + flag.color + '">' + esc(flag.label) + '</div>' : '') + '</td>' +
        '<td><i class="dot" style="background:' + HEALTH_COLOR_VAR[health.color] + ';margin-right:6px;vertical-align:middle" title="' + esc(health.reason) + '"></i>' + (c.lastSynced ? esc(fmtDate(c.lastSynced)) + (c.lastSyncedBy ? '<div class="src">by ' + esc(c.lastSyncedBy) + '</div>' : '') : 'Never synced') + '</td>' +
        '<td style="white-space:nowrap"><button class="btn sm" data-action="OwnerApp.partnerSyncClient" data-id="' + esc(c._sp) + '" id="partnerSync-' + esc(c._sp) + '">Sync</button> <button class="btn ghost sm" data-action="OwnerApp.partnerRemoveClient" data-id="' + esc(c._sp) + '">Remove</button></td>' +
        '</tr>';
    }).join('');
    revealRows(tbody);
  }

  /* ================= View 1: Revenue board ================= */
  /* Works from PartnerEntitlements x PartnerPrices alone — issuance
     records, never sync data — so this view is always fully computable
     even for a client that's never been synced (task req). */
  function renderRevenueBoard() {
    var el = document.getElementById('revenueBoardWrap');
    if (!el) return;
    var prices = pricesMap();
    var rev = window.CheckpointLib.computePartnerRevenue(PARTNER_DATA.entitlements, prices, todayStr());
    var gaps = priceGaps();
    var moduleIds = Object.keys(rev.revenueByModule).sort(function (a, b) { return rev.revenueByModule[b] - rev.revenueByModule[a]; });
    var maxModuleRev = Math.max(1, moduleIds.reduce(function (m, k) { return Math.max(m, rev.revenueByModule[k]); }, 0));
    var barsHtml = moduleIds.length ? moduleIds.map(function (m) {
      var val = rev.revenueByModule[m];
      var pct = Math.round(val / maxModuleRev * 100);
      return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">' +
        '<div style="width:110px;flex:none;font-size:12.5px;color:var(--paper-dim)">' + esc(fwName(m)) + '</div>' +
        '<div style="flex:1;height:14px;background:var(--line);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:var(--gold);border-radius:4px"></div></div>' +
        '<div style="width:70px;flex:none;text-align:right;font-weight:700;font-variant-numeric:tabular-nums">' + esc(fmtMoneyCompact(val)) + '</div>' +
        '</div>';
    }).join('') : '<p style="color:var(--paper-faint);font-size:12.5px">No active client revenue yet — add clients and record entitlements to see it here.</p>';

    el.innerHTML =
      '<div class="src" style="margin-bottom:14px">Source: PartnerEntitlements × PartnerPrices, latest entitlement per tenant only — as at ' + esc(fmtAsAt()) + '.' +
      (gaps.length ? ' <b style="color:var(--warn)">No price on file for: ' + esc(gaps.map(fwName).join(', ')) + '</b> — counted as $0 until priced in the Prices tab.' : '') + '</div>' +
      '<div class="grid kpis" style="margin-bottom:24px">' +
      '<div class="card kpi"><div class="kpi-num"><b>' + esc(fmtMoneyCompact(rev.activeAnnualRevenue)) + '</b></div><span>Active annualised revenue</span><div class="sub">Unexpired client entitlements, latest per tenant</div></div>' +
      '<div class="card kpi"><div class="kpi-num"><b style="color:var(--pass)">' + esc(fmtMoneyCompact(rev.committedNext12Months)) + '</b></div><span>Committed next 12 months</span><div class="sub">Not expiring within a year, or already renewed</div></div>' +
      '<div class="card kpi"><div class="kpi-num"><b style="color:var(--warn)">' + esc(fmtMoneyCompact(rev.expiringUnrenewed)) + '</b></div><span>Expiring, unrenewed</span><div class="sub">Renews within 12 months, nothing recorded yet</div></div>' +
      '<div class="card kpi"><div class="kpi-num"><b style="color:var(--gold-light)">' + esc(fmtMoneyCompact(rev.trialPipelineValue)) + '</b></div><span>Trial pipeline value</span><div class="sub">Active demo entitlements × list price</div></div>' +
      '</div>' +
      '<h3 style="margin-bottom:10px">Revenue by module</h3>' +
      '<div class="card" style="padding:18px">' + barsHtml + '</div>';
  }

  /* ================= View 2: Renewals runway ================= */
  function renderRenewalsRunway() {
    var el = document.getElementById('renewalsRunwayWrap');
    if (!el) return;
    var prices = pricesMap();
    var rev = window.CheckpointLib.computePartnerRevenue(PARTNER_DATA.entitlements, prices, todayStr());
    var byTenant = window.CheckpointLib.latestEntitlementsByTenant((PARTNER_DATA.entitlements || []).filter(function (e) { return e.type === 'client'; }));
    var clientsByTenant = {};
    (PARTNER_DATA.clients || []).forEach(function (c) { clientsByTenant[c.tenantId] = c; });

    var items = Object.keys(byTenant).map(function (tenantId) {
      var ent = byTenant[tenantId];
      var days = partnerDaysUntil(ent.expiry);
      if (days == null || days > 365) return null;
      var client = clientsByTenant[tenantId];
      var value = window.CheckpointLib.entitlementAnnualValue(ent.modules, prices);
      return { tenantId: tenantId, client: client, ent: ent, days: days, value: value };
    }).filter(Boolean).sort(function (a, b) { return a.days - b.days; });

    var timelineHtml = items.length ? '<div style="position:relative;height:36px;margin-bottom:18px;background:var(--line);border-radius:4px">' +
      [30, 60, 90].map(function (band) {
        var leftPct = Math.min(100, band / 365 * 100);
        return '<div style="position:absolute;left:' + leftPct.toFixed(2) + '%;top:0;bottom:0;width:1px;background:rgba(255,255,255,.18)"></div>';
      }).join('') +
      items.map(function (it) {
        var flag = partnerRenewalFlag(it.days);
        var leftPct = Math.min(100, Math.max(0, it.days / 365 * 100));
        return '<div title="' + esc((it.client ? it.client.name : it.tenantId) + ' — ' + it.days + 'd') + '" style="position:absolute;left:' + leftPct.toFixed(2) + '%;top:50%;transform:translate(-50%,-50%);width:11px;height:11px;border-radius:50%;background:' + flag.color + ';border:2px solid var(--ink-2);cursor:pointer" data-action="OwnerApp.partnerOpenClientDrawerByTenant" data-id="' + esc(it.tenantId) + '"></div>';
      }).join('') +
      '</div><div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--paper-faint);margin-bottom:20px"><span>Today</span><span>30d</span><span>60d</span><span>90d</span><span>12 months</span></div>'
      : '';

    var rowsHtml = items.length ? items.map(function (it) {
      var flag = partnerRenewalFlag(it.days);
      var status = it.ent.manualStatus || '';
      return '<tr>' +
        '<td class="id-t"><button class="lnk" data-action="OwnerApp.partnerOpenClientDrawerByTenant" data-id="' + esc(it.tenantId) + '" style="font-weight:700">' + esc(it.client ? it.client.name : it.tenantId) + '</button><div class="src">' + esc(it.tenantId) + '</div></td>' +
        '<td>' + partnerModuleChips(it.ent.modules) + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + esc(fmtMoneyFull(it.value)) + '</td>' +
        '<td style="color:' + flag.color + ';font-weight:700;white-space:nowrap">' + esc(flag.label) + '<div class="src" style="color:' + flag.color + '">' + esc(fmtDate(it.ent.expiry)) + '</div></td>' +
        '<td><select class="mini" data-change-action="OwnerApp.partnerSetManualStatus" data-id="' + esc(it.ent._sp) + '">' +
        ['', 'In discussion', 'Renewed', 'At risk'].map(function (s) { return '<option value="' + esc(s) + '"' + (status === s ? ' selected' : '') + '>' + (s || '—') + '</option>'; }).join('') +
        '</select></td>' +
        '<td style="white-space:nowrap"><button class="btn sm" data-action="OwnerApp.partnerPrepareRenewal" data-id="' + esc(it.ent._sp) + '">Prepare renewal</button></td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="6">' + emptyState({ text: 'Nothing expiring in the next 12 months.' }) + '</td></tr>';

    el.innerHTML =
      '<div class="src" style="margin-bottom:14px">Source: PartnerEntitlements, latest per tenant — as at ' + esc(fmtAsAt()) + '.</div>' +
      '<div class="grid kpis" style="margin-bottom:20px">' +
      '<div class="card kpi"><div class="kpi-num"><b style="color:' + (rev.expiringIn30Days > 0 ? 'var(--fail)' : 'var(--pass)') + '">' + esc(fmtMoneyCompact(rev.expiringIn30Days)) + '</b></div><span>Expiring in 30 days, unrenewed</span><div class="sub">The cash-flow number — act on this now</div></div>' +
      '</div>' +
      timelineHtml +
      '<div class="card" style="padding:0 10px;overflow-x:auto"><table><thead><tr><th scope="col">Client</th><th scope="col">Modules</th><th scope="col">Annual value</th><th scope="col">Days left</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
  }

  /* ================= Client costs — per-client cost + licensing scope ================= */
  /* One row per client on the roster: which frameworks they're
     subscribed to, what that costs annually (from the latest client-type
     entitlement × PartnerPrices), and the licensing scope you've
     recorded for them (headcount, locations, free-text scope notes) —
     everything relevant to what you're billing/licensing them for, in
     one place. A client whose latest entitlement is a trial (demo-type)
     shows those modules with $0 booked cost and a Trial chip, rather
     than being hidden or mixed in with real revenue. */
  function renderClientCosts() {
    var el = document.getElementById('clientCostsWrap');
    if (!el || !PARTNER_DATA) return;
    var prices = pricesMap();
    var clientEnts = window.CheckpointLib.latestEntitlementsByTenant((PARTNER_DATA.entitlements || []).filter(function (e) { return e.type === 'client'; }));
    var demoEnts = window.CheckpointLib.latestEntitlementsByTenant((PARTNER_DATA.entitlements || []).filter(function (e) { return e.type === 'demo'; }));

    var rows = (PARTNER_DATA.clients || []).map(function (c) {
      var ent = clientEnts[c.tenantId];
      var trial = !ent && demoEnts[c.tenantId];
      var modules = ent ? ent.modules : (trial ? trial.modules : []);
      var value = ent ? window.CheckpointLib.entitlementAnnualValue(ent.modules, prices) : 0;
      var expiry = ent ? ent.expiry : (trial ? trial.expiry : '');
      return { c: c, ent: ent, trial: !!trial, modules: modules || [], value: value, expiry: expiry };
    }).sort(function (a, b) { return b.value - a.value; });

    var totalValue = rows.reduce(function (s, r) { return s + r.value; }, 0);
    var billedCount = rows.filter(function (r) { return r.ent; }).length;
    var gaps = priceGaps();
    var overdueRows = rows.filter(function (r) { return r.ent && window.CheckpointLib.computePaymentStatus(r.ent, todayStr()).overdue; });
    var overdueTotal = overdueRows.reduce(function (s, r) { return s + r.value; }, 0);

    var rowsHtml = rows.map(function (r) {
      var c = r.c;
      return '<tr>' +
        '<td class="id-t"><button class="lnk" data-action="OwnerApp.partnerOpenClientDrawer" data-id="' + esc(c._sp) + '" style="font-weight:700">' + esc(c.name) + '</button><div class="src">' + esc(c.tenantId) + '</div></td>' +
        '<td>' + (r.modules.length ? partnerModuleChips(r.modules) : '<span class="src">None</span>') + (r.trial ? ' <span class="chip st-Intreatment">Trial</span>' : '') + '</td>' +
        '<td style="font-variant-numeric:tabular-nums;font-weight:700">' + (r.ent ? esc(fmtMoneyFull(r.value)) : '<span class="src">—</span>') + '</td>' +
        '<td>' + renderPaymentCell(r.ent) + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + (c.headcount != null ? c.headcount : '<span class="src">—</span>') + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + (c.locations != null ? c.locations : '<span class="src">—</span>') + '</td>' +
        '<td>' + (r.expiry ? fmtDate(r.expiry) : '<span class="src">—</span>') + '</td>' +
        '<td style="max-width:220px"><span title="' + esc(c.scopeNotes || '') + '" style="font-size:12px;color:var(--paper-dim);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.scopeNotes || '—') + '</span></td>' +
        '<td><button class="btn ghost sm" data-action="OwnerApp.partnerEditClient" data-id="' + esc(c._sp) + '">Edit scope</button></td>' +
        '</tr>';
    }).join('');

    el.innerHTML =
      '<div class="src" style="margin-bottom:14px">Source: PartnerClients × PartnerEntitlements (latest client-type per tenant) × PartnerPrices — as at ' + esc(fmtAsAt()) + '. Payment status is owner-set (no accounting integration) — "Overdue" is computed from the invoice due date you record, never a separate flag to forget.' +
      (gaps.length ? ' <b style="color:var(--warn)">No price on file for: ' + esc(gaps.map(fwName).join(', ')) + '</b> — counted as $0 until priced in the Prices tab.' : '') + '</div>' +
      '<div class="grid kpis" style="margin-bottom:20px">' +
      '<div class="card kpi"><div class="kpi-num"><b>' + esc(fmtMoneyCompact(totalValue)) + '</b></div><span>Total annual cost across all clients</span><div class="sub">' + billedCount + ' client(s) with a booked entitlement, of ' + rows.length + ' on the roster</div></div>' +
      '<div class="card kpi"><div class="kpi-num"><b style="color:' + (overdueRows.length ? 'var(--fail)' : 'var(--pass)') + '">' + esc(fmtMoneyCompact(overdueTotal)) + '</b></div><span>Overdue payments</span><div class="sub">' + overdueRows.length + ' client(s) past their invoice due date, unpaid</div></div>' +
      '</div>' +
      (rows.length
        ? '<div class="card" style="padding:0 10px;overflow-x:auto"><table><thead><tr><th scope="col">Client</th><th scope="col">Frameworks subscribed</th><th scope="col">Annual cost</th><th scope="col">Payment</th><th scope="col">Headcount</th><th scope="col">Locations</th><th scope="col">Renewal</th><th scope="col">Scope notes</th><th scope="col">Actions</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
        : emptyState({ text: 'No clients on the roster yet.', cta: { label: '+ Add client', action: 'OwnerApp.partnerPromptAddClient' } }));
    var tbody = el.querySelector('tbody');
    if (tbody) revealRows(tbody);
  }

  /* ================= View 3: Module adoption matrix ================= */
  /* Three states per cell: Licensed+Active (recent scan activity),
     Licensed+Dormant (licensed, but no scan in 30+ days), Not licensed.
     A licensed module for a client that's NEVER been synced gets its
     own fourth, explicitly-labelled state ("Licensed — never synced")
     rather than being guessed as either Active or Dormant (task req:
     never fabricate activity that was never observed). */
  function renderModuleMatrix() {
    var el = document.getElementById('partnerMatrixWrap');
    if (!el) return;
    var clients = (PARTNER_DATA && PARTNER_DATA.clients) || [];
    if (!clients.length) { el.innerHTML = '<p style="color:var(--paper-faint);font-size:12.5px;padding:16px">No clients yet.</p>'; return; }
    el.innerHTML =
      '<div class="src" style="margin-bottom:10px">Source: last-synced Entitlements/Controls per client — as at each client\'s own "Last synced" date (shown per row). "Dormant" = no scan activity in 30+ days.</div>' +
      '<table><thead><tr><th scope="col">Client</th>' + FRAMEWORK_ORDER.map(function (fw) { return '<th scope="col" style="text-align:center">' + esc(fwName(fw)) + '</th>'; }).join('') + '<th scope="col">Next best module</th></tr></thead><tbody>' +
      clients.map(function (c) {
        var ent = partnerLatestEntitlementFor(c.tenantId);
        var licensed = ent ? ent.modules : c.modules;
        var neverSynced = !c.lastSynced;
        var dormant = !neverSynced && (!c.lastScanDate || window.CheckpointLib.daysBetweenDateStr(c.lastScanDate, todayStr()) > 30);
        var cells = FRAMEWORK_ORDER.map(function (fw) {
          if (licensed.indexOf(fw) === -1) return '<td style="text-align:center;color:var(--paper-faint)" title="Not licensed">—</td>';
          if (neverSynced) return '<td style="text-align:center;color:var(--paper-faint)" title="Licensed, but this client has never been synced — activity unknown">◌</td>';
          return dormant
            ? '<td style="text-align:center;color:var(--warn);font-weight:800" title="Licensed, but no scan activity in 30+ days — churn risk">◐</td>'
            : '<td style="text-align:center;color:var(--pass);font-weight:800" title="Licensed and recently active">●</td>';
        }).join('');
        var nextBestCell = c.nextBestModule
          ? '<span title="Based on cross-mapped readiness from their last sync">' + esc(fwName(c.nextBestModule)) + ' <b>(' + c.nextBestModulePct + '%)</b></span>'
          : (neverSynced ? '<span style="color:var(--paper-faint)">Never synced</span>' : '<span style="color:var(--paper-faint)">—</span>');
        return '<tr><td><b>' + esc(c.name) + '</b><div class="src">' + (neverSynced ? 'Never synced' : 'Synced ' + esc(fmtDate(c.lastSynced))) + '</div></td>' + cells + '<td>' + nextBestCell + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p style="font-size:11px;color:var(--paper-faint);margin-top:10px">● Licensed &amp; active &nbsp; ◐ Licensed &amp; dormant (churn risk) &nbsp; ◌ Licensed, never synced &nbsp; — Not licensed</p>';
  }

  /* ================= View 4: Client health strip ================= */
  function renderClientHealthStrip() {
    var el = document.getElementById('clientHealthStripWrap');
    if (!el) return;
    var clients = (PARTNER_DATA && PARTNER_DATA.clients) || [];
    var RANK = { red: 0, amber: 1, unknown: 2, green: 3 };
    var rows = clients.map(function (c) {
      var ent = partnerLatestEntitlementFor(c.tenantId);
      var health = clientHealthFor(c);
      var days = ent ? partnerDaysUntil(ent.expiry) : null;
      return { c: c, ent: ent, health: health, days: days };
    }).sort(function (a, b) { return RANK[a.health.color] - RANK[b.health.color]; });

    if (!rows.length) { el.innerHTML = '<p style="color:var(--paper-faint);font-size:12.5px;padding:16px">No clients yet.</p>'; return; }

    el.innerHTML =
      '<div class="src" style="margin-bottom:10px">Source: last sync per client (or "Never synced" if none) × latest PartnerEntitlements record — as at ' + esc(fmtAsAt()) + '. Sorted worst-first.</div>' +
      '<div class="card" style="padding:0 10px;overflow-x:auto"><table><thead><tr><th scope="col">Client</th><th scope="col">R/A/G</th><th scope="col">Readiness trend</th><th scope="col">Last scan</th><th scope="col">Drift alerts</th><th scope="col">Renewal</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' +
          '<td class="id-t"><button class="lnk" data-action="OwnerApp.partnerOpenClientDrawer" data-id="' + esc(r.c._sp) + '" style="font-weight:700">' + esc(r.c.name) + '</button></td>' +
          '<td><i class="dot" style="background:' + HEALTH_COLOR_VAR[r.health.color] + ';margin-right:6px;vertical-align:middle"></i>' + esc(r.health.reason) + '</td>' +
          '<td>' + sparkline(r.c.scoreHistory) + '</td>' +
          '<td>' + (r.c.lastScanDate ? esc(fmtDate(r.c.lastScanDate)) : (r.c.lastSynced ? 'Never scanned' : 'Never synced')) + '</td>' +
          '<td style="' + ((r.c.driftAlerts || 0) > 0 ? 'color:var(--fail);font-weight:700' : '') + '">' + (r.c.lastSynced ? (r.c.driftAlerts || 0) : '—') + '</td>' +
          '<td>' + (r.ent ? r.days + 'd (' + esc(fmtDate(r.ent.expiry)) + ')' : 'No record') + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>';

    renderHealthSummaryCard(rows);
  }

  /* Compact summary at the top of the portal — "2 clients red, 3
     renewals in 60 days worth $X" — computed from the SAME rows the
     full health strip just built, so the two never disagree. */
  function renderHealthSummaryCard(rows) {
    var el = document.getElementById('healthSummaryCard');
    if (!el) return;
    var prices = pricesMap();
    var redCount = rows.filter(function (r) { return r.health.color === 'red'; }).length;
    var unknownCount = rows.filter(function (r) { return r.health.color === 'unknown'; }).length;
    var renewals60 = rows.filter(function (r) { return r.days != null && r.days <= 60 && r.days >= 0 && r.ent && r.ent.manualStatus !== 'Renewed'; });
    var renewals60Value = renewals60.reduce(function (sum, r) {
      return sum + (r.ent.modules || []).reduce(function (s, m) { return s + (Number(prices[m]) || 0); }, 0);
    }, 0);
    el.innerHTML =
      '<span class="chip" style="' + (redCount ? 'color:var(--fail);border-color:var(--fail)' : '') + '"><b data-count="' + redCount + '">0</b> client' + (redCount === 1 ? '' : 's') + ' red</span> ' +
      '<span class="chip">' + renewals60.length + ' renewal' + (renewals60.length === 1 ? '' : 's') + ' in 60 days worth ' + esc(fmtMoneyCompact(renewals60Value)) + '</span> ' +
      (unknownCount ? '<span class="chip" style="color:var(--paper-faint)">' + unknownCount + ' never synced</span>' : '');
    runCountUps(el);
  }

  /* ================= Prices settings (task point 1) ================= */
  function renderPartnerPrices() {
    var tbody = document.getElementById('partnerPriceRows');
    if (!tbody) return;
    var prices = (PARTNER_DATA && PARTNER_DATA.prices) || [];
    if (!prices.length) { tbody.innerHTML = emptyState({ asRow: true, colspan: 5, text: 'No prices on file yet — the revenue board treats every module as $0 until priced.', cta: { label: '+ Add price', action: 'OwnerApp.partnerPromptAddPrice' } }); return; }
    tbody.innerHTML = prices.slice().sort(function (a, b) { return a.moduleId.localeCompare(b.moduleId); }).map(function (p) {
      return '<tr>' +
        '<td><b>' + esc(fwName(p.moduleId)) + '</b><div class="src">' + esc(p.moduleId) + '</div></td>' +
        '<td style="font-variant-numeric:tabular-nums">' + esc(fmtMoneyFull(p.annualPrice, p.currency)) + '</td>' +
        '<td>' + esc(p.currency) + '</td>' +
        '<td style="color:var(--paper-dim)">' + esc(p.notes || '—') + '</td>' +
        '<td style="white-space:nowrap"><button class="btn ghost sm" data-action="OwnerApp.partnerEditPrice" data-id="' + esc(p._sp) + '">Edit</button> <button class="btn ghost sm" data-action="OwnerApp.partnerRemovePrice" data-id="' + esc(p._sp) + '">Remove</button></td>' +
        '</tr>';
    }).join('');
    revealRows(tbody);
  }

  /* ================= New client (post-purchase issuance flow) =================
     One form for the whole "we just closed a deal" workflow: pick
     modules/term/type, generate the exact issue-entitlement.mjs command
     (this console never holds the Ed25519 private key — see
     tools/ISSUANCE.md — so it can never sign a file itself), record the
     resulting entitlement + roster row, then send a welcome pack. The
     SAME form (not a separate one) also handles "prepare renewal" (task
     7.4/7.5) — partnerPrepareRenewal() below just pre-fills it and sets
     NEW_CLIENT_PREFILL.renewsEntitlementId before switching to this tab. */
  var NEW_CLIENT_MODULE_IDS = FRAMEWORK_ORDER.concat(['ai']);
  /* { renewsEntitlementId, tenantId, modules, type, termMonths,
     clientName, previousIssuedAt } while preparing a renewal; null for a
     brand-new client. */
  var NEW_CLIENT_PREFILL = null;
  /* The plan built by the last "Generate" click (window.CheckpointLib.
     buildClientIssuancePlan()'s return value, plus the form's own
     client/contact/notes fields) — awaiting either a CLI run + manual
     "Record entitlement" confirmation, or a signing-endpoint round trip.
     Cleared once recorded or the form is reset. */
  var NEW_CLIENT_PLAN = null;
  /* { tenantId, json, outFile } once the signing endpoint has produced a
     real signed file for THIS plan's tenant — tenant-tagged so a stale
     file from a previous client's session can never be attached to the
     wrong welcome pack. null on the CLI-only path. */
  var NEW_CLIENT_SIGNED_FILE = null;

  function issuanceFieldVal(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function checkedModuleIds() {
    return Array.prototype.slice.call(document.querySelectorAll('.nc-module:checked')).map(function (cb) { return cb.value; });
  }
  function issuanceTotalFromSet(set, prices) {
    return Object.keys(set).reduce(function (sum, m) { return sum + (Number(prices[m]) || 0); }, 0);
  }
  function issuanceTotal() { return issuanceTotalFromSet(checkedModuleIds().reduce(function (s, m) { s[m] = true; return s; }, {}), pricesMap()); }

  function renderNewClientForm() {
    var el = document.getElementById('newClientWrap');
    if (!el || !PARTNER_DATA) return;
    var prefill = NEW_CLIENT_PREFILL;
    var prices = pricesMap();
    var existing = prefill ? (PARTNER_DATA.clients || []).find(function (c) { return c.tenantId === prefill.tenantId; }) : null;
    var checkedSet = {};
    (prefill ? prefill.modules : ['iso27001']).forEach(function (m) { checkedSet[m] = true; });
    var labelStyle = 'display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--paper-faint);margin-bottom:6px';

    var moduleRowsHtml = NEW_CLIENT_MODULE_IDS.map(function (id) {
      var price = prices[id];
      var priceHtml = price == null ? '<span style="color:var(--warn);font-weight:400">no price on file</span>' : esc(fmtMoneyCompact(price));
      return '<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);cursor:pointer">' +
        '<input type="checkbox" class="nc-module" value="' + esc(id) + '"' + (checkedSet[id] ? ' checked' : '') + ' data-change-action="OwnerApp.partnerRecalcIssuanceTotal">' +
        '<span style="flex:1">' + esc(fwName(id)) + '</span>' +
        '<b style="font-variant-numeric:tabular-nums">' + priceHtml + '</b>' +
        '</label>';
    }).join('');

    el.innerHTML =
      (prefill ? '<div class="card" style="margin-bottom:16px;border-color:var(--gold)">' +
        '<b>Preparing a renewal' + (existing ? ' for ' + esc(existing.name) : ' for ' + esc(prefill.tenantId)) + '</b>' +
        '<p style="font-size:12.5px;color:var(--paper-dim);margin:6px 0 0">Confirming below records a new entitlement and marks the one issued ' + fmtDate(prefill.previousIssuedAt) + ' as renewed.' +
        ' <button class="btn ghost sm" data-action="OwnerApp.newClientReset" style="margin-left:6px">Cancel, start a new client instead</button></p></div>'
        : '') +
      '<div class="card" style="max-width:720px;padding:22px">' +
      '<div style="margin-bottom:14px"><label style="' + labelStyle + '" for="ncName">Client name</label><input class="mini" id="ncName" style="width:100%" value="' + esc((existing && existing.name) || (prefill && prefill.clientName) || '') + '"></div>' +
      '<div style="margin-bottom:4px"><label style="' + labelStyle + '" for="ncTenantId">Tenant ID or verified domain</label><input class="mini" id="ncTenantId" style="width:100%" value="' + esc((prefill && prefill.tenantId) || '') + '"' + (prefill ? ' disabled' : ' data-change-action="OwnerApp.partnerCheckDuplicateTenant"') + '></div>' +
      '<div id="ncDupWarning" style="font-size:12px;margin-bottom:14px"></div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px">' +
      '<div style="flex:1;min-width:200px"><label style="' + labelStyle + '" for="ncContactName">Contact name (optional)</label><input class="mini" id="ncContactName" style="width:100%" value="' + esc((existing && existing.contactName) || '') + '"></div>' +
      '<div style="flex:1;min-width:200px"><label style="' + labelStyle + '" for="ncContactEmail">Contact email (optional)</label><input class="mini" id="ncContactEmail" type="email" style="width:100%" value="' + esc((existing && existing.contactEmail) || '') + '"></div>' +
      '</div>' +
      '<div style="margin-bottom:14px"><label style="' + labelStyle + '">Modules</label>' + moduleRowsHtml +
      '<div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:700"><span>Total (annual, client)</span><span id="ncTotal" style="font-variant-numeric:tabular-nums">' + esc(fmtMoneyFull(issuanceTotalFromSet(checkedSet, prices))) + '</span></div>' +
      '<p style="font-size:11.5px;color:var(--paper-dim);margin-top:8px">A trial activation technically unlocks every module for the trial period regardless of what\'s ticked here — ticked modules are recorded as this prospect\'s pipeline of interest for the Revenue board.</p>' +
      '</div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px">' +
      '<div style="flex:1;min-width:160px"><label style="' + labelStyle + '" for="ncTerm">Term</label><select class="mini" id="ncTerm" style="width:100%">' +
      [12, 24, 36].map(function (m) { return '<option value="' + m + '"' + ((prefill ? prefill.termMonths : 12) === m ? ' selected' : '') + '>' + m + ' months</option>'; }).join('') +
      '</select></div>' +
      '<div style="flex:1;min-width:160px"><label style="' + labelStyle + '" for="ncType">Type</label><select class="mini" id="ncType" style="width:100%">' +
      '<option value="client"' + (!prefill || prefill.type !== 'demo' ? ' selected' : '') + '>Client</option>' +
      '<option value="trial"' + (prefill && prefill.type === 'demo' ? ' selected' : '') + '>Trial</option>' +
      '</select></div>' +
      '</div>' +
      '<div style="margin-bottom:18px"><label style="' + labelStyle + '" for="ncNotes">Notes (optional)</label><textarea class="mini" id="ncNotes" style="width:100%;min-height:60px">' + esc((existing && existing.notes) || '') + '</textarea></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-action="OwnerApp.partnerGenerateIssuance">Generate</button>' +
      (prefill ? '' : '<button class="btn ghost" data-action="OwnerApp.newClientReset">Reset</button>') + '</div>' +
      '</div>' +
      '<div id="ncResult" style="max-width:720px;margin-top:18px"></div>';

    if (NEW_CLIENT_PLAN) renderIssuanceResult();
  }

  function renderIssuanceResult() {
    var resEl = document.getElementById('ncResult');
    if (!resEl || !NEW_CLIENT_PLAN) return;
    var plan = NEW_CLIENT_PLAN;
    var hasEndpoint = !!(CONFIG.signingEndpoint && CONFIG.signingEndpoint.url);
    var signedForThisTenant = NEW_CLIENT_SIGNED_FILE && NEW_CLIENT_SIGNED_FILE.tenantId === plan.entitlementRecord.tenantId;
    resEl.innerHTML =
      '<div class="card" style="padding:20px">' +
      '<h3 style="margin-bottom:10px">Run this locally to issue the signed file</h3>' +
      '<p style="font-size:12.5px;color:var(--paper-dim);margin-bottom:10px">This console never holds the Ed25519 private key (see tools/ISSUANCE.md) — copy this command, run it wherever the key lives, then confirm below. <code>--record</code> already registers the entitlement automatically if that succeeds; use "Record entitlement" here if you\'d rather confirm it from this console instead (or <code>--record</code> failed).</p>' +
      '<textarea class="mini" id="ncCommand" readonly style="width:100%;min-height:70px;font-family:monospace;font-size:12px">' + esc(plan.command) + '</textarea>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">' +
      '<button class="btn ghost sm" data-action="OwnerApp.partnerCopyIssuanceCommand">Copy command</button>' +
      '<button class="btn sm" data-action="OwnerApp.partnerRecordIssuance">Record entitlement' + (NEW_CLIENT_PREFILL ? ' (renewal)' : '') + '</button>' +
      (hasEndpoint ? '<button class="btn ghost sm" data-action="OwnerApp.partnerSignViaEndpoint">Sign automatically via endpoint</button>' : '') +
      '</div>' +
      (signedForThisTenant ? '<div style="margin-top:12px;color:var(--pass);font-size:12.5px">Signed via the endpoint. <button class="btn ghost sm" data-action="OwnerApp.partnerDownloadSignedFile" style="margin-left:8px">Download signed activation file</button></div>' : '') +
      '</div>';
  }

  /* ================= Welcome pack (task point 3) =================
     A styled, self-contained HTML document — report.js's own
     ReportEngine is deliberately not loaded in this bundle (see this
     file's top comment), so this borrows its VISUAL identity (ink/
     charcoal/gold headers, a light print-friendly body) rather than its
     code. Sent as a real email attachment the recipient can open in any
     browser and print to PDF exactly the way Checkpoint's own reports
     work (SETUP.md §8b) — not a fabricated binary PDF this bundle has no
     way to actually produce without vendoring a PDF library. */
  function buildQuickStartGuideHtml(clientName, onboardingLink, bookingLink) {
    var steps = [
      ['Sign in & grant admin consent (2 minutes)', 'Open the onboarding link below and sign in with a Microsoft 365 <b>Global Administrator</b> or <b>Application Administrator</b> account. You\'ll see one consent screen listing exactly the read-only permissions Checkpoint needs to run its first posture scan — nothing is granted beyond that until a specific feature (SharePoint storage, email, the AI assistant) actually asks for it, the first time it\'s used.'],
      ['Run the 15-minute setup wizard', 'Checks what Checkpoint can read in your tenant, applies the activation file attached to this email (or pasted in by hand), chooses where your records live in SharePoint (your root site by default), and lets you pick which frameworks to start with.'],
      ['First scan & results', 'Checkpoint runs its first posture scan automatically and shows a readiness summary and suggested next actions — nothing you need to configure.'],
      ['Who can use Checkpoint', 'The wizard\'s last step explains the Practitioner/Viewer roles and links straight to where you set them up in SharePoint.']
    ];
    var stepsHtml = steps.map(function (s, i) {
      return '<tr><td style="padding:10px 14px;border-bottom:1px solid #e5e0d5;font-weight:700;color:#0B0B0C;width:28px">' + (i + 1) + '</td>' +
        '<td style="padding:10px 14px;border-bottom:1px solid #e5e0d5"><b style="color:#0B0B0C">' + esc(s[0]) + '</b><br><span style="color:#4a4a4a;font-size:13px">' + s[1] + '</span></td></tr>';
    }).join('');
    return '<!doctype html><html><head><meta charset="utf-8"><title>Checkpoint quick-start guide — ' + esc(clientName) + '</title></head>' +
      '<body style="margin:0;padding:0;background:#fff;font-family:Georgia,\'Times New Roman\',serif;color:#0B0B0C">' +
      '<div style="max-width:640px;margin:0 auto;padding:48px 32px">' +
      '<div style="border-bottom:3px solid #A9812E;padding-bottom:18px;margin-bottom:28px">' +
      '<div style="font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#A9812E;font-weight:700">Compliance365</div>' +
      '<h1 style="font-size:26px;margin:10px 0 4px">Quick-start guide</h1>' +
      '<p style="margin:0;color:#4a4a4a">Prepared for ' + esc(clientName) + '</p>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:28px">' + stepsHtml + '</table>' +
      '<div style="background:#f7f4ec;border-radius:4px;padding:18px 20px;margin-bottom:24px">' +
      '<b style="color:#0B0B0C">Start here</b><br>' +
      '<a href="' + esc(onboardingLink) + '" style="color:#A9812E">' + esc(onboardingLink) + '</a>' +
      '</div>' +
      (bookingLink ? '<p style="color:#4a4a4a;font-size:13px">Prefer a walkthrough first? <a href="' + esc(bookingLink) + '" style="color:#A9812E">Book time with us</a>.</p>' : '') +
      '<p style="color:#8a8a8a;font-size:11px;margin-top:36px">This guide opens in any browser — use your browser\'s Print → Save as PDF for a PDF copy, the same way every Checkpoint report is produced.</p>' +
      '</div></body></html>';
  }

  function buildWelcomeEmailHtml(clientName, onboardingLink, bookingLink, hasActivationFile) {
    return '<div style="font-family:Georgia,\'Times New Roman\',serif;color:#0B0B0C;max-width:600px">' +
      '<p>Hi ' + esc(clientName) + ' team,</p>' +
      '<p>Welcome to Compliance365. Setting Checkpoint up in your own Microsoft 365 tenant takes about 15 minutes end to end — a plain-English quick-start guide is attached.</p>' +
      '<p><b>1. Admin consent.</b> The person running setup needs to be a Global Administrator or Application Administrator the first time — you\'ll see one consent screen listing exactly the read-only permissions Checkpoint needs for its first scan. Nothing beyond that is ever requested until a specific feature needs it.</p>' +
      '<p><b>2. The setup wizard (~15 minutes).</b> ' + (hasActivationFile ? 'Your signed activation file is attached — upload or paste it in the wizard\'s Activation step.' : 'Your Compliance365 practitioner will send your signed activation file separately — paste it into the wizard\'s Activation step when it arrives.') + ' From there the wizard checks what Checkpoint can read in your tenant, lets you choose where records live in SharePoint, and picks your starting frameworks.</p>' +
      '<p><b>3. Get started:</b> <a href="' + esc(onboardingLink) + '">' + esc(onboardingLink) + '</a></p>' +
      (bookingLink ? '<p>Prefer a walkthrough first? <a href="' + esc(bookingLink) + '">Book time with us</a>.</p>' : '') +
      '<p>Any questions, just reply to this email.</p>' +
      '</div>';
  }

  function buildWelcomeAttachments(clientName, signedFileJson, outFile) {
    var atts = [{
      '@odata.type': '#microsoft.graph.fileAttachment', name: 'quick-start-guide.html', contentType: 'text/html',
      contentBytes: window.CheckpointLib.bytesToBase64(new TextEncoder().encode(buildQuickStartGuideHtml(clientName, new URL('../checkpoint/', location.href).href, CONFIG.bookingLink || '')))
    }];
    if (signedFileJson) {
      atts.push({
        '@odata.type': '#microsoft.graph.fileAttachment', name: outFile || 'activation.json', contentType: 'application/json',
        contentBytes: window.CheckpointLib.bytesToBase64(new TextEncoder().encode(signedFileJson))
      });
    }
    return atts;
  }

  /* Re-renders every view against the current in-memory PARTNER_DATA —
     called after any mutation (add/remove/sync/record/reprice) so
     every insight view always reflects the latest data, not just the
     one tab currently visible (a background tab re-rendered now costs
     nothing and never shows stale numbers when the practitioner
     switches to it). */
  function refreshInsightViews() {
    renderPartnerClientRows();
    renderClientCosts();
    renderModuleMatrix();
    renderRevenueBoard();
    renderRenewalsRunway();
    renderClientHealthStrip();
    renderPartnerPrices();
    renderNewClientForm();
  }

  async function renderConsole() {
    var rowsEl = document.getElementById('partnerClientRows');
    if (!rowsEl) return;
    rowsEl.innerHTML = skeletonRows(3, 6);
    try {
      await migrateLegacyPortfolioIfNeeded();
      try { await reconcilePartnerColumns(); } catch (e) { /* best-effort — see reconcilePartnerColumns()'s own comment */ }
      PARTNER_DATA = await loadPartnerConsoleData();
    } catch (e) {
      warn(e);
      rowsEl.innerHTML = '<tr><td colspan="6" style="color:var(--fail)">Could not load console data: ' + esc(e.message || e) + '</td></tr>';
      return;
    }
    refreshInsightViews();
  }

  /* Delegated sign-in TO THE CLIENT TENANT, read-only, reading their own
     Checkpoint lists — identical logic to what used to be app.js's
     partnerFetchClientSummary(). Its own throwaway MSAL instance
     (sessionStorage cache) never touches this console's own signed-in
     session. */
  async function partnerFetchClientSummary(tenantId) {
    if (!CONFIG.clientId) throw new Error('No app registration configured');
    var msalApp = new msal.PublicClientApplication({
      auth: { clientId: CONFIG.clientId, authority: 'https://login.microsoftonline.com/' + tenantId, redirectUri: location.origin + location.pathname },
      cache: { cacheLocation: 'sessionStorage' }
    });
    await msalApp.initialize();
    var res = await msalApp.loginPopup({ scopes: ['User.Read', 'Sites.Read.All'], prompt: 'select_account' });
    var token = res.accessToken;
    var signedInAs = (res.account && (res.account.username || res.account.name)) || 'Unknown';

    async function g(path) {
      var r = await fetch('https://graph.microsoft.com/v1.0' + path, { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) { var e = new Error('Graph ' + r.status); e.status = r.status; throw e; }
      return r.json();
    }

    var out = { name: '', onboarded: false, modules: [], score: null, scanDate: null, readinessByFw: {}, driftAlerts: 0, appVersion: '', signedInAs: signedInAs, controlRows: [] };
    try { var org = await g('/organization?$select=displayName'); out.name = (org.value && org.value[0] && org.value[0].displayName) || tenantId; } catch (e) { /* keep tenantId as the display name */ }

    try {
      var site = await g('/sites/root?$select=id');
      var siteLists = (await g('/sites/' + site.id + '/lists?$select=id,displayName&$top=200')).value || [];
      function findList(suffix) { return siteLists.find(function (l) { return l.displayName === CONFIG.listPrefix + ' ' + suffix; }); }
      var ctlList = findList('Controls'), entList = findList('Entitlements'), scanList = findList('Scans'), setList = findList('Settings'), alertList = findList('Alerts');

      if (ctlList) {
        out.onboarded = true;
        var ctlItems = (await g('/sites/' + site.id + '/lists/' + ctlList.id + '/items?$expand=fields&$top=400')).value || [];
        var byFw = {};
        ctlItems.forEach(function (i) {
          var f = i.fields, fw = f.Framework || 'iso27001';
          if (!f.Applicable) return;
          (byFw[fw] = byFw[fw] || []).push(f.Status === 'Implemented');
        });
        Object.keys(byFw).forEach(function (fw) {
          var arr = byFw[fw];
          out.readinessByFw[fw] = arr.length ? Math.round(arr.filter(Boolean).length / arr.length * 100) : 0;
        });
        /* Just enough per-control data for lib.js's computeNextBestModule()
           — applicable/status/mapsTo, never the control text/registry
           itself (this bundle never loads that at all — see owner.js's
           file-level comment). */
        out.controlRows = ctlItems.map(function (i) {
          return { applicable: !!i.fields.Applicable, status: i.fields.Status || '', mapsTo: i.fields.MapsTo || '' };
        });
      }
      if (entList) {
        var entItems = (await g('/sites/' + site.id + '/lists/' + entList.id + '/items?$expand=fields&$top=200')).value || [];
        out.modules = entItems.filter(function (i) { return i.fields.Enabled; }).map(function (i) { return i.fields.FrameworkId; }).filter(Boolean);
      }
      if (scanList) {
        var scanItems = (await g('/sites/' + site.id + '/lists/' + scanList.id + '/items?$expand=fields&$top=200')).value || [];
        scanItems.sort(function (a, b) { return (a.fields.ScanDate || '').localeCompare(b.fields.ScanDate || ''); });
        var last = scanItems[scanItems.length - 1];
        if (last) { out.score = last.fields.Score || 0; out.scanDate = last.fields.ScanDate || null; }
      }
      if (setList) {
        var setItems = (await g('/sites/' + site.id + '/lists/' + setList.id + '/items?$expand=fields&$top=200')).value || [];
        var verRow = setItems.find(function (i) { return i.fields.SettingKey === 'lastSeenVersion'; });
        out.appVersion = (verRow && verRow.fields.SettingValue) || '';
      }
      if (alertList) {
        var alertItems = (await g('/sites/' + site.id + '/lists/' + alertList.id + '/items?$expand=fields&$top=200')).value || [];
        out.driftAlerts = alertItems.filter(function (i) { return !i.fields.Acknowledged; }).length;
      }
    } catch (e) { /* Checkpoint not provisioned in this tenant yet (or a specific list read failed) */ }

    try { await msalApp.clearCache(); } catch (e) { /* best-effort teardown only */ }
    return out;
  }

  /* ================= bootstrap ================= */
  function showScreen(id) {
    ['gate', 'activationGate', 'provisionGate', 'appShell'].forEach(function (s) {
      var el = document.getElementById(s);
      if (el) el.style.display = s === id ? 'flex' : 'none';
    });
  }

  function simulatedDevBypass() {
    return window.CheckpointLib.isDevBypassActive(window.CHECKPOINT_DEV_BYPASS, location.hostname);
  }

  async function afterSignIn() {
    busy(true);
    var tenantInfo = await Graph.tenantInfo();
    var acceptIds = tenantIdsFor(tenantInfo);

    _clientSiteIdForPanel = await resolveClientSite().catch(function () { return null; });
    _clientSettingsCacheForPanel = _clientSiteIdForPanel ? await readClientSettingsEntitlementFile(_clientSiteIdForPanel) : null;
    var tenantRaw = _clientSettingsCacheForPanel && _clientSettingsCacheForPanel.raw;

    var resolved = await resolveBestActivation(acceptIds, tenantRaw);
    var verified = !!(resolved.winner && resolved.winner.evalResult.type === 'partner');

    /* Local-dev-only preview (never in a real build — see devflag.js) —
       lets a developer see this console's UI on a real test tenant
       without a genuine signed partner file lying around. */
    if (!verified && simulatedDevBypass()) {
      ENTITLEMENT_STATE = { status: 'valid', type: 'partner', frameworks: [], tenantId: (tenantInfo && tenantInfo.id) || 'dev', issuedAt: new Date().toISOString().slice(0, 10), expiry: '2099-01-01' };
      verified = true;
    } else if (resolved.winner) {
      ENTITLEMENT_STATE = resolved.winner.evalResult;
      await mirrorActivationStores(resolved, _clientSiteIdForPanel, _clientSettingsCacheForPanel);
    } else {
      ENTITLEMENT_STATE = null;
    }

    renderLicensePanel();
    busy(false);

    if (!verified) { showScreen('activationGate'); return; }

    busy(true);
    var found = await findExistingPartnerLists().catch(function () { return {}; });
    var allProvisioned = Object.keys(PARTNER_DEFS).every(function (k) { return found[k]; });
    busy(false);
    if (!allProvisioned) { showScreen('provisionGate'); return; }

    showScreen('appShell');
    await renderConsole();
  }

  window.OwnerApp = {
    signIn: async function () {
      try { busy(true); await Graph.signIn(); }
      catch (e) { busy(false); if (e.errorCode !== 'user_cancelled') toast('<b>Sign-in failed:</b> ' + esc(e.message || e)); }
    },

    backToClientConsole: function () { location.href = '../checkpoint/'; },

    /* Tab switching between the four insight views + roster + prices —
       same .view/.on toggle convention as the client app's own
       App.go(), just flat tabs instead of a sidebar (this console has
       one screen's worth of navigation, not dozens of views). */
    go: function (id) {
      document.querySelectorAll('.owner-tab').forEach(function (t) {
        var on = t.dataset.ov === id;
        t.classList.toggle('on', on);
        if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
      });
      document.querySelectorAll('#appShell .view').forEach(function (v) { v.classList.toggle('on', v.id === 'ov-' + id); });
    },

    /* The one-click provisioning action (task point 2) — only ever
       reachable once afterSignIn() has already confirmed a verified
       'partner' activation, per showScreen('provisionGate') above. */
    provisionLists: async function () {
      var msgEl = document.getElementById('provisionMsg');
      busy(true);
      try {
        await provisionPartnerLists(function (m) { if (msgEl) msgEl.textContent = m; });
        audit('Owner console provisioned', 'PartnerConsole', '', '', 'PartnerClients/PartnerEntitlements/PartnerPrices/AuditLog created');
        showScreen('appShell');
        await renderConsole();
      } catch (e) {
        warn(e);
        if (msgEl) msgEl.innerHTML = 'Something went wrong: ' + esc(e.message || e) + '.<br><button class="btn ghost sm" data-action="OwnerApp.provisionLists" style="margin-top:14px">Try again</button>';
      }
      busy(false);
    },

    applyActivationFile: async function () {
      var fileInput = document.getElementById('actFileInput');
      var textInput = document.getElementById('actPasteInput');
      var statusEl = document.getElementById('actStatus');
      var file = fileInput && fileInput.files && fileInput.files[0];
      var rawText;
      if (file) { rawText = await file.text(); }
      else if (textInput && textInput.value.trim()) { rawText = textInput.value.trim(); }
      else { toast('Choose a file or paste the activation JSON first.'); return; }

      busy(true);
      var tenantInfo = await Graph.tenantInfo();
      var acceptIds = tenantIdsFor(tenantInfo);
      var result = await verifyActivationRaw(rawText, acceptIds);
      if (!result.ok) {
        busy(false);
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--fail)">Activation rejected: ' + esc(result.reason) + '</span>';
        return;
      }
      if (result.evalResult.type !== 'partner') {
        busy(false);
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--fail)">This activation verifies, but its type is "' + esc(result.evalResult.type) + '", not "partner" — it cannot unlock the owner console.</span>';
        return;
      }
      /* Durable local persistence FIRST, before any network write —
         same ordering, same reasoning, as app.js's own fix. */
      if (writeLocalActivation(result.raw)) clearPersistenceFailure('local');
      else reportPersistenceFailure('local', 'This browser\'s storage could not be written (private browsing, or storage is full).');
      ENTITLEMENT_STATE = result.evalResult;
      audit('Activation applied', 'Activation', 'file', '', result.evalResult.status + ' until ' + result.evalResult.expiry);
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--pass)">Verified.</span>';
      renderLicensePanel();
      toast('Activation verified — loading the owner console…');
      busy(false);
      await afterSignIn();
    },

    removeLocalLicense: function () {
      removeLocalActivation();
      clearPersistenceFailure('local');
      audit('Activation removed', 'Activation', 'file', ENTITLEMENT_STATE ? ENTITLEMENT_STATE.expiry : '', 'Removed from this browser\'s local storage only.');
      toast('Licence removed from this browser. The tenant\'s own copy (if any) is unaffected.');
      renderLicensePanel();
    },

    partnerRefresh: async function () { PARTNER_DATA = null; await renderConsole(); },

    partnerPromptAddClient: async function () {
      var v = await showModal({
        title: 'Add client',
        fields: [
          { id: 'name', label: 'Client name', placeholder: 'e.g. Meridian Health SaaS' },
          { id: 'tenantId', label: 'Their tenant ID or a verified domain', placeholder: 'e.g. contoso.onmicrosoft.com' },
          { id: 'contactName', label: 'Contact name (optional)' },
          { id: 'contactEmail', label: 'Contact email (optional)', type: 'email' }
        ],
        confirmText: 'Add',
        validate: function (v) {
          if (!v.name) return 'Enter a client name.';
          if (!v.tenantId) return 'Enter their tenant ID or a verified domain.';
          if (v.contactEmail && !isValidEmail(v.contactEmail)) return 'Enter a valid contact email, or leave it blank.';
          return null;
        }
      });
      if (!v) return;
      var c = { name: v.name, tenantId: v.tenantId, status: 'Prospect', contactName: v.contactName || '', contactEmail: v.contactEmail || '', notes: '', modules: [], lastSynced: '', lastSyncedBy: '', onboarded: false, score: null, lastScanDate: '', readinessByFw: {}, appVersion: '', driftAlerts: 0, syncError: '' };
      try { await addPartnerClient(c); } catch (e) { warn(e); toast('Could not add client: ' + esc(e.message || e)); return; }
      PARTNER_DATA.clients.push(c);
      audit('Partner client added', 'PartnerClient', c._sp, '', c.name + ' (' + c.tenantId + ')');
      toast('<b>' + esc(c.name) + '</b> added');
      refreshInsightViews();
    },

    partnerRemoveClient: async function (id) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var ok = await showModal({ title: 'Remove client?', message: 'Remove ' + c.name + ' from the owner console? This only removes the roster row and cached snapshot in OUR tenant — nothing in their tenant is affected.', confirmText: 'Remove' });
      if (!ok) return;
      try { await deletePartnerClient(c); } catch (e) { warn(e); toast('Could not remove client: ' + esc(e.message || e)); return; }
      PARTNER_DATA.clients = PARTNER_DATA.clients.filter(function (x) { return x._sp !== id; });
      audit('Partner client removed', 'PartnerClient', id, c.name, '');
      toast('Removed');
      refreshInsightViews();
    },

    partnerSetClientStatus: async function (id, status) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var before = c.status;
      c.status = status;
      try { await updatePartnerClient(c); } catch (e) { warn(e); c.status = before; toast('Could not save status'); renderPartnerClientRows(); return; }
      audit('Partner client status changed', 'PartnerClient', id, before, status);
    },

    partnerEditClient: async function (id) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var v = await showModal({
        title: 'Edit client',
        message: 'Contact details and licensing scope — headcount, locations and anything else relevant to what you\'re licensing/billing this client for.',
        fields: [
          { id: 'contactName', label: 'Contact name', value: c.contactName },
          { id: 'contactEmail', label: 'Contact email', value: c.contactEmail, type: 'email' },
          { id: 'headcount', label: 'Headcount (people in scope)', value: c.headcount != null ? c.headcount : '', type: 'number' },
          { id: 'locations', label: 'Locations (sites/offices in scope)', value: c.locations != null ? c.locations : '', type: 'number' },
          { id: 'scopeNotes', label: 'Scope notes (cloud/on-prem, subsidiaries, systems in scope, etc.)', value: c.scopeNotes, type: 'textarea' },
          { id: 'notes', label: 'Notes', value: c.notes, type: 'textarea' }
        ],
        confirmText: 'Save',
        validate: function (v) {
          if (v.contactEmail && !isValidEmail(v.contactEmail)) return 'Enter a valid contact email, or leave it blank.';
          if (v.headcount && (isNaN(Number(v.headcount)) || Number(v.headcount) < 0)) return 'Headcount must be a non-negative number, or left blank.';
          if (v.locations && (isNaN(Number(v.locations)) || Number(v.locations) < 0)) return 'Locations must be a non-negative number, or left blank.';
          return null;
        }
      });
      if (!v) return;
      c.contactName = v.contactName; c.contactEmail = v.contactEmail; c.notes = v.notes;
      c.headcount = v.headcount ? Number(v.headcount) : null;
      c.locations = v.locations ? Number(v.locations) : null;
      c.scopeNotes = v.scopeNotes;
      try { await updatePartnerClient(c); } catch (e) { warn(e); toast('Could not save'); return; }
      audit('Partner client details edited', 'PartnerClient', id, '', c.contactName);
      closeDrawerUi();
      toast('Saved');
      refreshInsightViews();
    },

    partnerPromptAddEntitlement: async function () {
      var v = await showModal({
        title: 'Record an entitlement',
        message: 'Use this only if an activation was issued without --record, or automatic recording failed — the CLI prints this same row as JSON for exactly this situation (see tools/ISSUANCE.md).',
        fields: [
          { id: 'tenantId', label: 'Tenant ID or domain' },
          { id: 'type', label: 'Type (client / partner / demo)', value: 'client' },
          { id: 'modules', label: 'Modules (comma-separated)', placeholder: 'iso27001,soc2' },
          { id: 'issuedAt', label: 'Issued', type: 'date' },
          { id: 'expiry', label: 'Expiry', type: 'date' }
        ],
        confirmText: 'Record',
        validate: function (v) {
          if (!v.tenantId) return 'Enter a tenant ID or domain.';
          if (['client', 'partner', 'demo'].indexOf(v.type) === -1) return 'Type must be client, partner or demo.';
          if (!v.expiry) return 'Enter an expiry date.';
          return null;
        }
      });
      if (!v) return;
      var e = { tenantId: v.tenantId, type: v.type, modules: v.modules.split(',').map(function (s) { return s.trim(); }).filter(Boolean), issuedAt: v.issuedAt || new Date().toISOString().slice(0, 10), expiry: v.expiry };
      try { await addPartnerEntitlementRecord(e); } catch (ex) { warn(ex); toast('Could not record entitlement: ' + esc(ex.message || ex)); return; }
      PARTNER_DATA.entitlements.push(e);
      audit('Partner entitlement recorded', 'PartnerEntitlement', e._sp, '', v.tenantId + ' — ' + v.type + ' until ' + v.expiry);
      toast('Entitlement recorded');
      refreshInsightViews();
    },

    partnerSyncClient: async function (id) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var btn = document.getElementById('partnerSync-' + id);
      if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
      try {
        var summary = await partnerFetchClientSummary(c.tenantId);
        c.name = summary.name || c.name;
        c.modules = summary.modules; c.lastSynced = new Date().toISOString(); c.lastSyncedBy = summary.signedInAs;
        c.onboarded = summary.onboarded; c.score = summary.score; c.lastScanDate = summary.scanDate || '';
        c.readinessByFw = summary.readinessByFw; c.appVersion = summary.appVersion; c.driftAlerts = summary.driftAlerts;
        c.syncError = '';
        /* Next-best-module and readiness trend are both computed HERE,
           from this same sync's own fetched data, then persisted as
           plain summary fields — never recomputed from stale data
           later, and never touching the full framework/control
           registry this bundle deliberately doesn't carry (see
           computeNextBestModule()'s own comment in lib.js). */
        var nextBest = window.CheckpointLib.computeNextBestModule(summary.controlRows, summary.modules);
        c.nextBestModule = nextBest ? nextBest.moduleId : '';
        c.nextBestModulePct = nextBest ? nextBest.pct : null;
        var history = (c.scoreHistory || []).slice();
        history.push({ date: new Date().toISOString().slice(0, 10), score: summary.score });
        c.scoreHistory = history.slice(-3);
        await updatePartnerClient(c);
        audit('Partner client synced', 'PartnerClient', id, '', (summary.name || c.name) + ' — score ' + summary.score + ', synced by ' + summary.signedInAs);
        toast('Synced <b>' + esc(c.name) + '</b>');
      } catch (e) {
        c.syncError = e.errorCode === 'user_cancelled' ? 'Sign-in cancelled' : ('Sync failed: ' + (e.message || e));
        c.lastSynced = new Date().toISOString();
        try { await updatePartnerClient(c); } catch (e2) { warn(e2); }
        audit('Partner client sync failed', 'PartnerClient', id, '', c.syncError);
        toast('<b>Sync failed:</b> ' + esc(c.syncError));
      }
      refreshInsightViews();
    },

    partnerOpenClientDrawer: function (id) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var ent = partnerLatestEntitlementFor(c.tenantId);
      var annualCost = ent && ent.type === 'client' ? window.CheckpointLib.entitlementAnnualValue(ent.modules, pricesMap()) : null;
      var readinessRows = Object.keys(c.readinessByFw || {}).map(function (fw) {
        return '<div class="d-kv"><span>' + esc(fwName(fw)) + '</span><b>' + c.readinessByFw[fw] + '%</b></div>';
      }).join('') || '<div class="d-kv"><span>No synced readiness data yet</span></div>';
      var checklist = window.CheckpointLib.computeClientChecklist(c);
      var checklistRows = checklist.map(function (s) {
        return '<div class="d-kv"><span>' + (s.done ? '<span style="color:var(--pass)">✓</span> ' : '<span style="color:var(--paper-faint)">○</span> ') + esc(s.label) + '</span><b>' + (s.done && s.at ? fmtDate(s.at.slice(0, 10)) : (s.done ? 'Done' : 'Not yet')) + '</b></div>';
      }).join('');
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="OwnerApp.closeDrawer">' + icon('close') + '</button>' +
        '<div class="id-t">' + esc(c.tenantId) + '</div><h2>' + esc(c.name) + '</h2>' +
        '<div class="d-sec"><h4>Onboarding progress</h4>' + checklistRows + '</div>' +
        '<div class="d-sec"><h4>Licence</h4>' +
        '<div class="d-kv"><span>Status</span><b>' + esc(c.status) + '</b></div>' +
        (ent ? '<div class="d-kv"><span>Type</span><b>' + esc(ent.type) + '</b></div><div class="d-kv"><span>Expiry</span><b>' + fmtDate(ent.expiry) + '</b></div>'
          : '<div class="d-kv"><span>Entitlement record</span><b>None — record one from the console or via the CLI\'s --record flag</b></div>') +
        '<div class="d-kv"><span>Modules licensed (frameworks subscribed)</span><b>' + partnerModuleChips(ent ? ent.modules : []) + '</b></div>' +
        (annualCost != null ? '<div class="d-kv"><span>Annual cost</span><b>' + esc(fmtMoneyFull(annualCost)) + '</b></div>' : '') +
        (ent && ent.type === 'client' ? '<div class="d-kv"><span>Payment</span><b>' + renderPaymentCell(ent) + '</b></div>' : '') +
        '</div>' +
        '<div class="d-sec"><h4>Licensing scope</h4>' +
        '<div class="d-kv"><span>Headcount</span><b>' + (c.headcount != null ? c.headcount : '—') + '</b></div>' +
        '<div class="d-kv"><span>Locations</span><b>' + (c.locations != null ? c.locations : '—') + '</b></div>' +
        (c.scopeNotes ? '<p style="font-size:12px;color:var(--paper-dim);margin-top:8px;line-height:1.6">' + esc(c.scopeNotes) + '</p>' : '<div class="src">No scope notes on file — add via Edit.</div>') +
        '</div>' +
        '<div class="d-sec"><h4>Health (as of last sync)</h4>' +
        '<div class="d-kv"><span>Last synced</span><b>' + (c.lastSynced ? fmtDate(c.lastSynced) : 'Never') + '</b></div>' +
        (c.lastSyncedBy ? '<div class="d-kv"><span>Synced by</span><b>' + esc(c.lastSyncedBy) + '</b></div>' : '') +
        '<div class="d-kv"><span>Last scan</span><b>' + (c.lastScanDate ? fmtDate(c.lastScanDate) : '—') + '</b></div>' +
        '<div class="d-kv"><span>Posture score</span><b>' + (c.score != null ? c.score + '/100' : '—') + '</b></div>' +
        '<div class="d-kv"><span>App version last seen</span><b>' + esc(c.appVersion || '—') + '</b></div>' +
        '<div class="d-kv"><span>Drift alerts outstanding</span><b style="' + (c.driftAlerts ? 'color:var(--fail)' : '') + '">' + c.driftAlerts + '</b></div>' +
        (c.syncError ? '<div class="d-kv"><span>Last sync error</span><b style="color:var(--fail)">' + esc(c.syncError) + '</b></div>' : '') +
        '</div>' +
        '<div class="d-sec"><h4>Readiness by framework</h4>' + readinessRows + '</div>' +
        (c.notes ? '<div class="d-sec"><h4>Notes</h4><p style="font-size:13px;color:var(--paper-dim)">' + esc(c.notes) + '</p></div>' : '') +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">' +
        '<button class="btn sm" data-action="OwnerApp.partnerSyncClient" data-id="' + esc(c._sp) + '">Sync now</button>' +
        '<button class="btn ghost sm" data-action="OwnerApp.partnerEditClient" data-id="' + esc(c._sp) + '">Edit</button>' +
        '<button class="btn ghost sm" data-action="OwnerApp.partnerPromptWelcomePack" data-id="' + esc(c._sp) + '">Send welcome pack</button>' +
        (c.rolesConfiguredAt
          ? '<button class="btn ghost sm" data-action="OwnerApp.partnerResetRolesConfigured" data-id="' + esc(c._sp) + '">Roles configured ✓ (undo)</button>'
          : '<button class="btn ghost sm" data-action="OwnerApp.partnerMarkRolesConfigured" data-id="' + esc(c._sp) + '">Mark roles configured</button>') +
        '</div>';
      openDrawerUi(c.name);
    },

    /* The Renewals Runway's timeline dots and rows key by tenantId
       (an entitlement, not a client roster row), so this looks the
       client up by tenantId first — a no-op toast if this tenant has
       no roster row yet (an entitlement can exist before its client is
       added to the roster; nothing to open a drawer for). */
    partnerOpenClientDrawerByTenant: function (tenantId) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x.tenantId === tenantId; });
      if (!c) { toast('No client roster entry for this tenant yet — add one from the roster tab.'); return; }
      OwnerApp.partnerOpenClientDrawer(c._sp);
    },

    partnerSetManualStatus: async function (entId, status) {
      var e = (PARTNER_DATA.entitlements || []).find(function (x) { return x._sp === entId; });
      if (!e) return;
      var before = e.manualStatus;
      e.manualStatus = status;
      try { await updatePartnerEntitlementRecord(e); } catch (ex) { warn(ex); e.manualStatus = before; toast('Could not save status'); return; }
      audit('Renewal status changed', 'PartnerEntitlement', entId, before, status);
      renderRenewalsRunway();
      renderClientHealthStrip();
    },

    /* ================= Payment tracking (owner-set, no accounting integration) =================
       Reconciling means periodically checking this against whatever you
       actually invoice through and clicking the one relevant action —
       there's no Xero/QuickBooks/Stripe connection here (see
       computePaymentStatus()'s own comment in lib.js for why this
       console stays at "mark it when you see it" rather than pulling in
       a second API surface and, likely, a backend to hold its
       credentials). "Overdue" itself is never set by hand — it's always
       derived from today vs. the due date you record here, so it can't
       go stale from being forgotten. */
    partnerMarkInvoiced: async function (entId) {
      var e = (PARTNER_DATA.entitlements || []).find(function (x) { return x._sp === entId; });
      if (!e) return;
      var v = await showModal({
        title: 'Mark invoiced',
        message: 'This console has no accounting integration — recording a due date here is what lets it work out "Overdue" for you later. Mark it Paid yourself once you see the payment land.',
        fields: [{ id: 'dueDate', label: 'Invoice due date', type: 'date', value: e.invoiceDueDate || window.CheckpointLib.addDaysToDateStr(todayStr(), 14) }],
        confirmText: 'Mark invoiced',
        validate: function (v) { return v.dueDate ? null : 'Enter the invoice due date.'; }
      });
      if (!v) return;
      var before = e.paymentStatus || 'Not invoiced';
      e.paymentStatus = 'Invoiced'; e.invoiceDueDate = v.dueDate; e.paidDate = '';
      try { await updatePartnerEntitlementRecord(e); } catch (ex) { warn(ex); e.paymentStatus = before; toast('Could not save'); return; }
      audit('Entitlement marked invoiced', 'PartnerEntitlement', entId, before, 'Invoiced, due ' + v.dueDate);
      toast('Marked invoiced — due ' + esc(fmtDate(v.dueDate)));
      refreshInsightViews();
    },

    partnerMarkPaid: async function (entId) {
      var e = (PARTNER_DATA.entitlements || []).find(function (x) { return x._sp === entId; });
      if (!e) return;
      var before = e.paymentStatus || 'Not invoiced';
      e.paymentStatus = 'Paid'; e.paidDate = todayStr();
      try { await updatePartnerEntitlementRecord(e); } catch (ex) { warn(ex); e.paymentStatus = before; e.paidDate = ''; toast('Could not save'); return; }
      audit('Entitlement marked paid', 'PartnerEntitlement', entId, before, 'Paid ' + e.paidDate);
      toast('Marked paid');
      refreshInsightViews();
    },

    /* Correcting a mistake — clears back to "Not invoiced" rather than
       leaving a wrong Paid/Invoiced/due-date on record. */
    partnerResetPayment: async function (entId) {
      var e = (PARTNER_DATA.entitlements || []).find(function (x) { return x._sp === entId; });
      if (!e) return;
      var ok = await showModal({ title: 'Reset payment status?', message: 'Clears the payment status for this entitlement back to "Not invoiced".', confirmText: 'Reset', cancelText: 'Cancel' });
      if (!ok) return;
      var before = e.paymentStatus || 'Not invoiced';
      e.paymentStatus = ''; e.invoiceDueDate = ''; e.paidDate = '';
      try { await updatePartnerEntitlementRecord(e); } catch (ex) { warn(ex); e.paymentStatus = before; toast('Could not save'); return; }
      audit('Payment status reset', 'PartnerEntitlement', entId, before, 'Not invoiced');
      toast('Payment status reset');
      refreshInsightViews();
    },

    /* "Prepare renewal" — pre-fills the SAME "New client" form (task
       7.5) with this entitlement's own terms and a 12-month-out term,
       rather than its own bespoke dialog. Generating + recording from
       there links the new entitlement back via RenewedBy on the OLD one
       — see partnerRecordIssuance() below. */
    partnerPrepareRenewal: function (entId) {
      var e = (PARTNER_DATA.entitlements || []).find(function (x) { return x._sp === entId; });
      if (!e) return;
      var client = (PARTNER_DATA.clients || []).find(function (x) { return x.tenantId === e.tenantId; });
      NEW_CLIENT_PREFILL = {
        renewsEntitlementId: e._sp, tenantId: e.tenantId, modules: (e.modules || []).slice(),
        type: e.type, termMonths: 12, clientName: client ? client.name : e.tenantId, previousIssuedAt: e.issuedAt
      };
      NEW_CLIENT_PLAN = null; NEW_CLIENT_SIGNED_FILE = null;
      OwnerApp.go('newclient');
      toast('Renewal pre-filled from the existing entitlement — review and Generate below.');
    },

    /* ================= New client form actions (task point 1-2) ================= */
    newClientReset: function () {
      NEW_CLIENT_PREFILL = null; NEW_CLIENT_PLAN = null; NEW_CLIENT_SIGNED_FILE = null;
      renderNewClientForm();
    },

    partnerRecalcIssuanceTotal: function () {
      var el = document.getElementById('ncTotal');
      if (el) el.textContent = fmtMoneyFull(issuanceTotal());
    },

    partnerCheckDuplicateTenant: function (value) {
      var el = document.getElementById('ncDupWarning');
      if (!el) return;
      var v = (value || '').trim();
      if (!v) { el.innerHTML = ''; return; }
      if (!window.CheckpointLib.isValidTenantIdentifier(v)) {
        el.innerHTML = '<span style="color:var(--warn)">Doesn\'t look like a tenant GUID or a verified domain (e.g. contoso.onmicrosoft.com) — double check before generating.</span>';
        return;
      }
      var dup = window.CheckpointLib.findDuplicateTenantClient(v, PARTNER_DATA.clients);
      el.innerHTML = dup ? '<span style="color:var(--warn)">Already on the roster as <b>' + esc(dup.name) + '</b> — generating adds another entitlement for the same tenant (e.g. a renewal), not a duplicate client row.</span>' : '';
    },

    partnerGenerateIssuance: function () {
      var prefill = NEW_CLIENT_PREFILL;
      var name = issuanceFieldVal('ncName');
      var tenantId = prefill ? prefill.tenantId : issuanceFieldVal('ncTenantId');
      var contactName = issuanceFieldVal('ncContactName');
      var contactEmail = issuanceFieldVal('ncContactEmail');
      var notes = issuanceFieldVal('ncNotes');
      var modules = checkedModuleIds();
      var termMonths = Number(issuanceFieldVal('ncTerm')) || 12;
      var type = issuanceFieldVal('ncType') || 'client';

      if (!name) { toast('Enter a client name.'); return; }
      if (!window.CheckpointLib.isValidTenantIdentifier(tenantId)) { toast('Enter a valid tenant ID (GUID) or verified domain.'); return; }
      if (contactEmail && !isValidEmail(contactEmail)) { toast('Enter a valid contact email, or leave it blank.'); return; }
      if (!modules.length) { toast('Select at least one module.'); return; }

      var plan = window.CheckpointLib.buildClientIssuancePlan({
        tenantId: tenantId, modules: modules, termMonths: termMonths, type: type,
        renewsEntitlementId: prefill ? prefill.renewsEntitlementId : ''
      }, todayStr());
      plan.clientName = name; plan.contactName = contactName; plan.contactEmail = contactEmail; plan.notes = notes;
      NEW_CLIENT_PLAN = plan;
      renderIssuanceResult();
    },

    partnerCopyIssuanceCommand: function () {
      if (!NEW_CLIENT_PLAN) return;
      if (!navigator.clipboard) { toast('Select the command text and copy it manually.'); return; }
      navigator.clipboard.writeText(NEW_CLIENT_PLAN.command)
        .then(function () { toast('Command copied.'); })
        .catch(function () { toast('Could not copy — select the text and copy manually.'); });
    },

    /* Records the plan built by "Generate": creates/updates the
       PartnerClients roster row (Prospect -> Active), adds the
       PartnerEntitlements row, and — for a renewal — marks the
       superseded entitlement's ManualStatus/RenewedBy. Never signs or
       applies anything to the client's own tenant; that only ever
       happens once the CLI command (or the signing endpoint) has
       actually produced a file and the client applies it themselves. */
    partnerRecordIssuance: async function () {
      if (!NEW_CLIENT_PLAN) return;
      var plan = NEW_CLIENT_PLAN;
      var prefill = NEW_CLIENT_PREFILL;
      busy(true);
      try {
        var c = (PARTNER_DATA.clients || []).find(function (x) { return x.tenantId === plan.entitlementRecord.tenantId; });
        if (!c) {
          c = {
            name: plan.clientName, tenantId: plan.entitlementRecord.tenantId, status: 'Prospect',
            contactName: plan.contactName || '', contactEmail: plan.contactEmail || '', notes: plan.notes || '',
            modules: [], lastSynced: '', lastSyncedBy: '', onboarded: false, score: null, lastScanDate: '',
            readinessByFw: {}, appVersion: '', driftAlerts: 0, syncError: '', packSentAt: '', rolesConfiguredAt: ''
          };
          await addPartnerClient(c);
          PARTNER_DATA.clients.push(c);
        } else {
          if (plan.contactName) c.contactName = plan.contactName;
          if (plan.contactEmail) c.contactEmail = plan.contactEmail;
          if (plan.notes) c.notes = plan.notes;
        }
        c.status = 'Active';
        await updatePartnerClient(c);

        var e = {
          tenantId: plan.entitlementRecord.tenantId, type: plan.entitlementRecord.type, modules: plan.entitlementRecord.modules,
          issuedAt: plan.entitlementRecord.issuedAt, expiry: plan.entitlementRecord.expiry, manualStatus: '', renewedBy: ''
        };
        await addPartnerEntitlementRecord(e);
        PARTNER_DATA.entitlements.push(e);

        if (prefill && prefill.renewsEntitlementId) {
          var old = (PARTNER_DATA.entitlements || []).find(function (x) { return x._sp === prefill.renewsEntitlementId; });
          if (old) {
            old.manualStatus = 'Renewed'; old.renewedBy = e._sp;
            try { await updatePartnerEntitlementRecord(old); } catch (ex) { warn(ex); }
          }
        }

        audit(prefill ? 'Renewal issued' : 'Entitlement issued', 'PartnerEntitlement', e._sp, prefill ? prefill.previousIssuedAt : '', e.tenantId + ' — ' + e.type + ' until ' + e.expiry);
        toast('<b>' + esc(c.name) + '</b> recorded — run the command shown (if you haven\'t already) to actually issue the signed file.');
        NEW_CLIENT_PLAN = null; NEW_CLIENT_PREFILL = null;
        refreshInsightViews();
      } catch (ex) {
        warn(ex);
        toast('Could not record: ' + esc(ex.message || ex));
      }
      busy(false);
    },

    /* The optional fast path (task point 2's "small signing endpoint") —
       only ever shown/usable when CONFIG.signingEndpoint.url is
       configured. Verifies the response against our own public key
       before trusting it, exactly as if it were a pasted activation
       file — never blindly trusts a network response, even from our own
       endpoint. */
    partnerSignViaEndpoint: async function () {
      if (!NEW_CLIENT_PLAN) return;
      if (!CONFIG.signingEndpoint || !CONFIG.signingEndpoint.url) { toast('No signing endpoint configured — see tools/ISSUANCE.md.'); return; }
      var plan = NEW_CLIENT_PLAN;
      busy(true);
      try {
        var t = await Graph.signingToken();
        var res = await fetch(CONFIG.signingEndpoint.url, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: plan.entitlementRecord.tenantId, frameworks: plan.entitlementRecord.modules,
            expiry: plan.entitlementRecord.expiry, type: plan.entitlementRecord.type
          })
        });
        if (!res.ok) throw new Error('Signing endpoint returned HTTP ' + res.status);
        var file = await res.json();
        if (!file || !file.payload || !file.signature) throw new Error('Signing endpoint response was not a valid activation file.');
        var ok = await window.CheckpointLib.verifyEntitlementSignature(crypto.subtle, CONFIG.entitlementPublicKey, file.payload, file.signature);
        if (!ok) throw new Error('The returned file did not verify against our own public key — refusing to use it.');
        NEW_CLIENT_SIGNED_FILE = { tenantId: plan.entitlementRecord.tenantId, json: JSON.stringify(file, null, 2), outFile: plan.outFile };
        toast('Signed successfully.');
        renderIssuanceResult();
      } catch (e) {
        warn(e);
        toast('Could not sign automatically: ' + esc(e.message || e) + ' — use the CLI command instead.');
      }
      busy(false);
    },

    partnerDownloadSignedFile: function () {
      if (!NEW_CLIENT_SIGNED_FILE) return;
      var blob = new Blob([NEW_CLIENT_SIGNED_FILE.json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = NEW_CLIENT_SIGNED_FILE.outFile || 'activation.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    /* ================= Welcome pack (task point 3) ================= */
    partnerPromptWelcomePack: async function (id) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      if (!c.contactEmail) { toast('Add a contact email for this client first (Edit on the roster row).'); return; }
      var onboardingLink = new URL('../checkpoint/', location.href).href;
      var signedForThisTenant = NEW_CLIENT_SIGNED_FILE && NEW_CLIENT_SIGNED_FILE.tenantId === c.tenantId;
      var v = await showModal({
        title: 'Send welcome pack — ' + c.name,
        message: 'Sends from your own mailbox via Mail.Send, with a quick-start guide' + (signedForThisTenant ? ' and the signed activation file' : '') + ' attached. Review before sending.',
        fields: [
          { id: 'to', label: 'To', value: c.contactEmail, type: 'email' },
          { id: 'subject', label: 'Subject', value: 'Welcome to Compliance365 — setting up ' + c.name },
          { id: 'bookingLink', label: 'Booking link (optional)', value: CONFIG.bookingLink || '' }
        ],
        confirmText: 'Send',
        validate: function (v) { return isValidEmail(v.to) ? null : 'Enter a valid recipient email address.'; }
      });
      if (!v) return;
      busy(true);
      try {
        var body = buildWelcomeEmailHtml(c.name, onboardingLink, v.bookingLink, !!signedForThisTenant);
        var attachments = buildWelcomeAttachments(c.name, signedForThisTenant ? NEW_CLIENT_SIGNED_FILE.json : null, signedForThisTenant ? NEW_CLIENT_SIGNED_FILE.outFile : null);
        await Graph.sendMail(v.to, v.subject, body, attachments);
        c.packSentAt = new Date().toISOString();
        await updatePartnerClient(c);
        audit('Welcome pack sent', 'PartnerClient', c._sp, '', v.to);
        toast('Welcome pack sent to ' + esc(v.to));
        refreshInsightViews();
      } catch (e) {
        warn(e);
        toast('Could not send: ' + esc(e.message || e));
      }
      busy(false);
    },

    /* Manual confirmation that the client's own SharePoint Practitioner/
       Viewer groups (wizard step 8, SETUP.md §5a) are set up — this
       console has no permission to read another tenant's SharePoint
       site permissions, so it can never detect this itself. Shown as a
       checklist item (computeClientChecklist() in lib.js) alongside the
       rest of onboarding progress. */
    partnerMarkRolesConfigured: async function (id) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var ok = await showModal({
        title: 'Mark roles configured — ' + c.name,
        message: 'Confirms the "Checkpoint Practitioners" and "Checkpoint Viewers" SharePoint groups (SETUP.md §5a) are set up in this client\'s own tenant, with the right people in each. This console can\'t verify that itself — only tick this once you or the client has actually done it.',
        confirmText: 'Confirm', cancelText: 'Cancel'
      });
      if (!ok) return;
      var before = c.rolesConfiguredAt || '';
      c.rolesConfiguredAt = new Date().toISOString();
      try { await updatePartnerClient(c); } catch (e) { warn(e); c.rolesConfiguredAt = before; toast('Could not save'); return; }
      audit('Roles configured (confirmed)', 'PartnerClient', c._sp, before, c.rolesConfiguredAt);
      closeDrawerUi();
      toast('Marked roles configured for ' + esc(c.name));
      refreshInsightViews();
    },

    /* Correcting a mistake — clears back to "not confirmed" rather than
       leaving a wrong confirmation on record. */
    partnerResetRolesConfigured: async function (id) {
      var c = (PARTNER_DATA.clients || []).find(function (x) { return x._sp === id; });
      if (!c) return;
      var before = c.rolesConfiguredAt || '';
      c.rolesConfiguredAt = '';
      try { await updatePartnerClient(c); } catch (e) { warn(e); c.rolesConfiguredAt = before; toast('Could not save'); return; }
      audit('Roles configured reset', 'PartnerClient', c._sp, before, '');
      closeDrawerUi();
      toast('Reset');
      refreshInsightViews();
    },

    /* ================= Prices (task point 1) ================= */
    partnerPromptAddPrice: async function () {
      var v = await showModal({
        title: 'Add a module price',
        fields: [
          { id: 'moduleId', label: 'Module id', placeholder: 'iso27001, soc2, essential8, iso42001, iso27701, dispirap, nistcsf, or ai' },
          { id: 'annualPrice', label: 'Annual price', type: 'number', placeholder: '5000' },
          { id: 'currency', label: 'Currency', value: 'AUD' },
          { id: 'notes', label: 'Notes (optional)', type: 'textarea' }
        ],
        confirmText: 'Add',
        validate: function (v) {
          if (!v.moduleId) return 'Enter a module id.';
          if ((PARTNER_DATA.prices || []).some(function (p) { return p.moduleId === v.moduleId; })) return 'A price for "' + v.moduleId + '" already exists — edit it instead.';
          if (!v.annualPrice || isNaN(Number(v.annualPrice))) return 'Enter a numeric annual price.';
          return null;
        }
      });
      if (!v) return;
      var p = { moduleId: v.moduleId, annualPrice: Number(v.annualPrice), currency: v.currency || 'AUD', notes: v.notes || '' };
      try { await addPartnerPrice(p); } catch (e) { warn(e); toast('Could not add price: ' + esc(e.message || e)); return; }
      PARTNER_DATA.prices.push(p);
      audit('Partner price added', 'PartnerPrice', p._sp, '', p.moduleId + ' = ' + p.annualPrice + ' ' + p.currency);
      toast('Price added');
      renderPartnerPrices();
      renderRevenueBoard();
      renderRenewalsRunway();
    },

    partnerEditPrice: async function (id) {
      var p = (PARTNER_DATA.prices || []).find(function (x) { return x._sp === id; });
      if (!p) return;
      var v = await showModal({
        title: 'Edit price — ' + fwName(p.moduleId),
        fields: [
          { id: 'annualPrice', label: 'Annual price', type: 'number', value: p.annualPrice },
          { id: 'currency', label: 'Currency', value: p.currency },
          { id: 'notes', label: 'Notes', value: p.notes, type: 'textarea' }
        ],
        confirmText: 'Save',
        validate: function (v) { return (!v.annualPrice || isNaN(Number(v.annualPrice))) ? 'Enter a numeric annual price.' : null; }
      });
      if (!v) return;
      var before = p.annualPrice;
      p.annualPrice = Number(v.annualPrice); p.currency = v.currency || 'AUD'; p.notes = v.notes || '';
      try { await updatePartnerPrice(p); } catch (e) { warn(e); toast('Could not save'); return; }
      audit('Partner price changed', 'PartnerPrice', id, before, p.annualPrice + ' ' + p.currency);
      toast('Saved');
      renderPartnerPrices();
      renderRevenueBoard();
      renderRenewalsRunway();
    },

    partnerRemovePrice: async function (id) {
      var p = (PARTNER_DATA.prices || []).find(function (x) { return x._sp === id; });
      if (!p) return;
      var ok = await showModal({ title: 'Remove price?', message: 'Remove the price on file for ' + fwName(p.moduleId) + '? The revenue board will treat it as $0 until re-priced.', confirmText: 'Remove' });
      if (!ok) return;
      try { await deletePartnerPrice(p); } catch (e) { warn(e); toast('Could not remove price: ' + esc(e.message || e)); return; }
      PARTNER_DATA.prices = PARTNER_DATA.prices.filter(function (x) { return x._sp !== id; });
      audit('Partner price removed', 'PartnerPrice', id, p.moduleId, '');
      toast('Removed');
      renderPartnerPrices();
      renderRevenueBoard();
      renderRenewalsRunway();
    },

    closeDrawer: function () { closeDrawerUi(); }
  };

  document.querySelectorAll('.owner-tab').forEach(function (t) {
    t.addEventListener('click', function () { OwnerApp.go(t.dataset.ov); });
  });

  /* ================= event delegation (same pattern as app.js) ================= */
  function resolvePath(path) {
    var parts = path.split('.'), obj = window;
    for (var i = 0; i < parts.length; i++) { if (!obj) return null; obj = obj[parts[i]]; }
    return typeof obj === 'function' ? obj : null;
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var fn = resolvePath(el.dataset.action);
    if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    fn(el.dataset.id);
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change-action]');
    if (!el) return;
    var fn = resolvePath(el.dataset.changeAction);
    if (!fn) return;
    if (el.dataset.id !== undefined) fn(el.dataset.id, el.value);
    else fn(el.value);
  });

  (async function init() {
    var hasMsal = typeof msal !== 'undefined';
    if (!CONFIG.clientId || !hasMsal) {
      var note = document.getElementById('gateNote');
      if (note) note.textContent = 'No app registration configured yet — see SETUP.md to connect a tenant.';
      showScreen('gate');
      return;
    }
    var ok = await Graph.init();
    if (ok && Graph.getAccount()) {
      try { await afterSignIn(); return; } catch (e) { console.error(e); busy(false); }
    }
    var signInBtn = document.getElementById('btnGateSignIn');
    if (signInBtn) signInBtn.style.display = '';
    showScreen('gate');
  })();
})();
