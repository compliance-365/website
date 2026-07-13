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
  async function writeClientSettingsEntitlementFile(clientSiteId, cached, raw) {
    if (!cached || !cached.listId) throw new Error('This tenant has no "Checkpoint Settings" list yet — nothing to sync into (that list is only ever created by the client app\'s own onboarding).');
    if (cached.rowId) {
      await Graph.g('/sites/' + clientSiteId + '/lists/' + cached.listId + '/items/' + cached.rowId + '/fields', { method: 'PATCH', body: { SettingValue: raw }, scopes: CONFIG.scopesProvision });
    } else {
      await Graph.g('/sites/' + clientSiteId + '/lists/' + cached.listId + '/items', { method: 'POST', body: { fields: { Title: 'entitlementFile', SettingKey: 'entitlementFile', SettingValue: raw } }, scopes: CONFIG.scopesProvision });
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
      { name: 'ScoreHistory', text: { allowMultipleLines: true } } /* JSON array of {date, score}, capped at the last 3 syncs */
    ],
    PartnerEntitlements: [
      { name: 'TenantId', text: {} }, { name: 'Type', text: {} }, { name: 'Modules', text: {} },
      { name: 'IssuedAt', text: {} }, { name: 'Expiry', text: {} }, { name: 'EntitlementHash', text: {} },
      /* Owner-set — never inferred, never overwritten by a sync (a sync
         only ever touches PartnerClients, never these two fields). */
      { name: 'ManualStatus', text: {} } /* '' | 'Renewed' | 'In discussion' | 'At risk' */,
      { name: 'RenewedBy', text: {} } /* SharePoint item id of the superseding entitlement, once "prepare renewal" records one */
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
      scoreHistory: Array.isArray(scoreHistory) ? scoreHistory : []
    };
  }
  function mapPartnerEntitlement(i) {
    var f = i.fields;
    return {
      _sp: i.id, tenantId: f.TenantId || '', type: f.Type || 'client', modules: uncsv(f.Modules),
      issuedAt: f.IssuedAt || '', expiry: f.Expiry || '', hash: f.EntitlementHash || '',
      manualStatus: f.ManualStatus || '', renewedBy: f.RenewedBy || ''
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
    c._sp = await addItem('PartnerClients', { Title: c.name, ClientName: c.name, TenantId: c.tenantId, Status: c.status || 'Prospect', ContactName: c.contactName || '', ContactEmail: c.contactEmail || '', Notes: c.notes || '' });
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
      ScoreHistory: JSON.stringify(c.scoreHistory || [])
    });
  }
  async function deletePartnerClient(c) {
    await Graph.g('/sites/' + siteId + '/lists/' + lists.PartnerClients + '/items/' + c._sp, { method: 'DELETE', scopes: CONFIG.scopesProvision });
  }
  async function addPartnerEntitlementRecord(e) {
    e._sp = await addItem('PartnerEntitlements', {
      Title: e.tenantId, TenantId: e.tenantId, Type: e.type, Modules: csv(e.modules), IssuedAt: e.issuedAt, Expiry: e.expiry,
      EntitlementHash: e.hash || '', ManualStatus: e.manualStatus || '', RenewedBy: e.renewedBy || ''
    });
  }
  async function updatePartnerEntitlementRecord(e) {
    await patchItem('PartnerEntitlements', e._sp, { ManualStatus: e.manualStatus || '', RenewedBy: e.renewedBy || '' });
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
    return window.CheckpointLib.computeClientHealth({
      syncError: c.syncError, lastSynced: c.lastSynced, lastScanDate: c.lastScanDate,
      score: c.score, driftAlerts: c.driftAlerts,
      entitlementStatus: ent ? (ent.expiry && ent.expiry < today ? 'expired' : 'valid') : null,
      entitlementExpiry: ent ? ent.expiry : null,
      manualStatus: ent ? ent.manualStatus : ''
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
      var value = (ent.modules || []).reduce(function (sum, m) { return sum + (Number(prices[m]) || 0); }, 0);
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

  /* Re-renders every view against the current in-memory PARTNER_DATA —
     called after any mutation (add/remove/sync/record/reprice) so
     every insight view always reflects the latest data, not just the
     one tab currently visible (a background tab re-rendered now costs
     nothing and never shows stale numbers when the practitioner
     switches to it). */
  function refreshInsightViews() {
    renderPartnerClientRows();
    renderModuleMatrix();
    renderRevenueBoard();
    renderRenewalsRunway();
    renderClientHealthStrip();
    renderPartnerPrices();
  }

  async function renderConsole() {
    var rowsEl = document.getElementById('partnerClientRows');
    if (!rowsEl) return;
    rowsEl.innerHTML = skeletonRows(3, 6);
    try {
      await migrateLegacyPortfolioIfNeeded();
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
        fields: [
          { id: 'contactName', label: 'Contact name', value: c.contactName },
          { id: 'contactEmail', label: 'Contact email', value: c.contactEmail, type: 'email' },
          { id: 'notes', label: 'Notes', value: c.notes, type: 'textarea' }
        ],
        confirmText: 'Save',
        validate: function (v) { return (v.contactEmail && !isValidEmail(v.contactEmail)) ? 'Enter a valid contact email, or leave it blank.' : null; }
      });
      if (!v) return;
      c.contactName = v.contactName; c.contactEmail = v.contactEmail; c.notes = v.notes;
      try { await updatePartnerClient(c); } catch (e) { warn(e); toast('Could not save'); return; }
      audit('Partner client details edited', 'PartnerClient', id, '', c.contactName);
      closeDrawerUi();
      toast('Saved');
      renderPartnerClientRows();
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
      var readinessRows = Object.keys(c.readinessByFw || {}).map(function (fw) {
        return '<div class="d-kv"><span>' + esc(fwName(fw)) + '</span><b>' + c.readinessByFw[fw] + '%</b></div>';
      }).join('') || '<div class="d-kv"><span>No synced readiness data yet</span></div>';
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="OwnerApp.closeDrawer">' + icon('close') + '</button>' +
        '<div class="id-t">' + esc(c.tenantId) + '</div><h2>' + esc(c.name) + '</h2>' +
        '<div class="d-sec"><h4>Licence</h4>' +
        '<div class="d-kv"><span>Status</span><b>' + esc(c.status) + '</b></div>' +
        (ent ? '<div class="d-kv"><span>Type</span><b>' + esc(ent.type) + '</b></div><div class="d-kv"><span>Expiry</span><b>' + fmtDate(ent.expiry) + '</b></div>'
          : '<div class="d-kv"><span>Entitlement record</span><b>None — record one from the console or via the CLI\'s --record flag</b></div>') +
        '<div class="d-kv"><span>Modules licensed</span><b>' + partnerModuleChips(ent ? ent.modules : []) + '</b></div>' +
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

    /* "Prepare renewal" — pre-fills the exact CLI invocation from this
       entitlement's own terms (this console never holds the Ed25519
       private key, so it can never sign a file itself — see
       tools/ISSUANCE.md). Confirming records the NEW entitlement (the
       terms actually issued, which the practitioner can adjust before
       running the command) and links it back via RenewedBy on the OLD
       entitlement, so the revenue board stops counting the old one as
       "at risk" the moment this is confirmed — same as `--record`
       would once the real file is generated and applied. */
    partnerPrepareRenewal: async function (entId) {
      var e = (PARTNER_DATA.entitlements || []).find(function (x) { return x._sp === entId; });
      if (!e) return;
      var client = (PARTNER_DATA.clients || []).find(function (x) { return x.tenantId === e.tenantId; });
      var suggestedExpiry = window.CheckpointLib.addDaysToDateStr(e.expiry, 365);
      var command = 'node tools/issue-entitlement.mjs issue --tenant ' + e.tenantId +
        ' --frameworks ' + (e.modules || []).join(',') +
        ' --expiry ' + suggestedExpiry +
        (e.type !== 'client' ? ' --type ' + e.type : '') +
        ' --key entitlement-private.json --module-keys tools/module-keys.json' +
        ' --out ' + e.tenantId.replace(/[^a-z0-9.-]/gi, '-') + '-activation.json --record';
      var v = await showModal({
        title: 'Prepare renewal — ' + (client ? client.name : e.tenantId),
        message: 'This console cannot sign an activation file itself (the private key lives offline — see tools/ISSUANCE.md). Copy the command below, run it, and send the resulting file to the client. Confirming here records the new entitlement in this register and marks the old one as renewed — it does NOT run the command or apply anything to the client\'s tenant for you.',
        fields: [
          { id: 'command', label: 'Run this locally (copy it) — adjust before running if needed', type: 'textarea', value: command },
          { id: 'expiry', label: 'Expiry this will actually record (match whatever you run)', type: 'date', value: suggestedExpiry }
        ],
        confirmText: 'Record renewal',
        validate: function (v) { return v.expiry ? null : 'Enter the expiry date the renewal will actually use.'; }
      });
      if (!v) return;
      var renewed = { tenantId: e.tenantId, type: e.type, modules: (e.modules || []).slice(), issuedAt: todayStr(), expiry: v.expiry, manualStatus: '', renewedBy: '' };
      try { await addPartnerEntitlementRecord(renewed); } catch (ex) { warn(ex); toast('Could not record the renewal: ' + esc(ex.message || ex)); return; }
      PARTNER_DATA.entitlements.push(renewed);
      e.manualStatus = 'Renewed'; e.renewedBy = renewed._sp;
      try { await updatePartnerEntitlementRecord(e); } catch (ex) { warn(ex); }
      audit('Renewal prepared and recorded', 'PartnerEntitlement', renewed._sp, e.expiry, 'Renews ' + e.tenantId + ' through ' + v.expiry);
      toast('Renewal recorded — run the command shown to actually issue the file.');
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
