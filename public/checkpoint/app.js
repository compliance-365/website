/* ============================================================
   Checkpoint — Portfolio
   A practitioner-side view across every client tenant. Deliberately
   isolated from the main app/Graph modules: it creates its own
   throwaway MSAL instance per sync (sessionStorage cache, never the
   shared localStorage session), so syncing a client's summary can
   never overwrite or corrupt whichever tenant is currently signed in
   for the rest of the console. Nothing here is stored centrally —
   the client list itself is bookkeeping in *your* browser, and every
   number synced is read live, at click-time, from that client's own
   tenant.
   ============================================================ */
window.Portfolio = (function () {
  var KEY = 'checkpoint-portfolio-v1';
  var CONFIG = window.CHECKPOINT_CONFIG;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{"clients":[]}'); } catch (e) { return { clients: [] }; }
  }
  function save(data) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { } }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function fmtDate(d) { if (!d) return 'Never'; return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }

  /* RAG status at a glance — so a practitioner managing many clients can
     scan for "who needs attention" instead of reading every card. */
  function statusOf(c) {
    if (c.error) return { color: 'var(--fail)', label: 'Sync error' };
    if (!c.lastSynced) return { color: 'var(--paper-faint)', label: 'Not synced yet' };
    if (c.onboarded === false) return { color: 'var(--paper-faint)', label: 'Not yet onboarded' };
    var crit = c.criticalRisks || 0;
    if (crit >= 3 || (c.score != null && c.score < 40)) return { color: 'var(--fail)', label: 'Needs attention' };
    if (crit >= 1 || (c.score != null && c.score < 70)) return { color: 'var(--warn)', label: 'Watch' };
    return { color: 'var(--pass)', label: 'Healthy' };
  }

  /* trend vs this client's previous sync (not "previous scan" — Portfolio
     only has whatever it captured last time it synced this client) */
  function trend(cur, prev, higherIsBetter) {
    if (cur == null || prev == null || cur === prev) return '';
    var up = cur > prev;
    var good = higherIsBetter ? up : !up;
    return ' <span style="font-size:10px;font-weight:800;color:' + (good ? 'var(--pass)' : 'var(--fail)') + '">' + (up ? '▲' : '▼') + Math.abs(cur - prev) + '</span>';
  }

  function render() {
    var data = load();
    var wrap = document.getElementById('portfolioCards');
    if (!wrap) return;
    if (!data.clients.length) {
      wrap.innerHTML = '<p style="color:var(--paper-faint);font-size:13px">No clients added yet. Add one above, then click Sync to pull their live summary.</p>';
      return;
    }
    wrap.innerHTML = data.clients.map(function (c) {
      var st = statusOf(c);
      var statusLine = c.error ? '<span style="color:var(--fail)">' + esc(c.error) + '</span>'
        : c.lastSynced ? (c.onboarded === false
          ? '<span style="color:var(--paper-faint)">Signed in, but Checkpoint not yet set up in this tenant</span>'
          : (c.score != null ? c.score + '/100 posture' + trend(c.score, c.prevScore, true) + ' · ' : '') +
            (c.readiness != null ? c.readiness + '% readiness' + trend(c.readiness, c.prevReadiness, true) + ' · ' : '') +
            (c.criticalRisks != null ? c.criticalRisks + ' high/critical risk(s)' + trend(c.criticalRisks, c.prevCriticalRisks, false) : ''))
        : '<span style="color:var(--paper-faint)">Not synced yet</span>';
      return '<div class="card portfolio-card">' +
        '<div class="portfolio-card-head"><b><i class="dot" style="background:' + st.color + ';margin-right:7px;vertical-align:middle" title="' + esc(st.label) + '"></i>' + esc(c.name) + '</b><button class="btn ghost sm" data-action="Portfolio.remove" data-id="' + esc(c.id) + '">Remove</button></div>' +
        '<div class="src" style="margin:4px 0 12px">' + esc(c.tenantId) + ' · <span style="color:' + st.color + '">' + esc(st.label) + '</span></div>' +
        '<div class="portfolio-stat">' + statusLine + '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">' +
        '<span class="src">Last synced: ' + fmtDate(c.lastSynced) + '</span>' +
        '<button class="btn sm" data-action="Portfolio.sync" data-id="' + esc(c.id) + '" id="sync-' + c.id + '">Sync now</button>' +
        '</div></div>';
    }).join('');
  }

  function add(name, tenantId) {
    var data = load();
    data.clients.push({ id: 'c' + Date.now(), name: name, tenantId: tenantId, lastSynced: null });
    save(data);
    render();
  }

  function remove(id) {
    if (!confirm('Remove this client from your portfolio view? This only removes it from your local list — nothing in their tenant is affected.')) return;
    var data = load();
    data.clients = data.clients.filter(function (c) { return c.id !== id; });
    save(data);
    render();
  }

  /* Isolated Graph fetch for a single sync — its own MSAL instance,
     its own sessionStorage cache, torn down after use. Never touches
     window.Graph's account/token state. */
  async function fetchSummary(tenantId) {
    if (!CONFIG.clientId) throw new Error('No app registration configured');
    var msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: CONFIG.clientId,
        authority: 'https://login.microsoftonline.com/' + tenantId,
        redirectUri: location.origin + location.pathname
      },
      cache: { cacheLocation: 'sessionStorage' }
    });
    await msalApp.initialize();
    var scopes = ['User.Read', 'Sites.Read.All', 'SecurityEvents.Read.All'];
    var res = await msalApp.loginPopup({ scopes: scopes, prompt: 'select_account' });
    var token = res.accessToken;

    async function g(path) {
      var r = await fetch('https://graph.microsoft.com/v1.0' + path, { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) { var e = new Error('Graph ' + r.status); e.status = r.status; throw e; }
      return r.json();
    }

    var out = { name: '', score: null, readiness: null, criticalRisks: null, onboarded: false };
    try { var org = await g('/organization?$select=displayName'); out.name = (org.value && org.value[0] && org.value[0].displayName) || tenantId; } catch (e) { }
    try {
      var scores = await g('/security/secureScores?$top=1');
      var ss = (scores.value || [])[0];
      if (ss) out.score = Math.round(ss.currentScore / ss.maxScore * 100);
    } catch (e) { }

    /* best-effort: read the Checkpoint lists if this tenant has already
       been onboarded. A 404 on the list lookup just means "not yet". */
    try {
      var site = await g('/sites/root?$select=id');
      var lists = await g('/sites/' + site.id + '/lists?$select=id,displayName&$top=200');
      var ctlList = (lists.value || []).find(function (l) { return l.displayName === CONFIG.listPrefix + ' Controls'; });
      var riskList = (lists.value || []).find(function (l) { return l.displayName === CONFIG.listPrefix + ' Risks'; });
      if (ctlList) {
        out.onboarded = true;
        var ctlItems = await g('/sites/' + site.id + '/lists/' + ctlList.id + '/items?$expand=fields&$top=200');
        var iso = (ctlItems.value || []).filter(function (i) { return (i.fields.Framework || 'iso27001') === 'iso27001' && i.fields.Applicable; });
        if (iso.length) out.readiness = Math.round(iso.filter(function (i) { return i.fields.Status === 'Implemented'; }).length / iso.length * 100);
      }
      if (riskList) {
        var riskItems = await g('/sites/' + site.id + '/lists/' + riskList.id + '/items?$expand=fields&$top=200');
        out.criticalRisks = (riskItems.value || []).filter(function (i) {
          var f = i.fields;
          if (f.Status === 'Closed') return false;
          var score = Math.max(1, f.Likelihood || 1) * Math.max(1, f.Impact || 1);
          return score >= 10;
        }).length;
      }
    } catch (e) { /* Checkpoint not provisioned here yet — leave onboarded:false */ }

    try { await msalApp.clearCache(); } catch (e) { }
    return out;
  }

  async function sync(id) {
    var data = load();
    var client = data.clients.find(function (c) { return c.id === id; });
    if (!client) return;
    var btn = document.getElementById('sync-' + id);
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
    try {
      var summary = await fetchSummary(client.tenantId);
      client.prevScore = client.score;
      client.prevReadiness = client.readiness;
      client.prevCriticalRisks = client.criticalRisks;
      client.name = summary.name || client.name;
      client.score = summary.score;
      client.readiness = summary.readiness;
      client.criticalRisks = summary.criticalRisks;
      client.onboarded = summary.onboarded;
      client.lastSynced = new Date().toISOString();
      delete client.error;
    } catch (e) {
      client.error = e.errorCode === 'user_cancelled' ? 'Sign-in cancelled' : ('Sync failed: ' + (e.message || e));
      client.lastSynced = new Date().toISOString();
    }
    save(data);
    render();
  }

  function promptAdd() {
    var name = prompt('Client name:');
    if (!name || !name.trim()) return;
    var tenantId = prompt('Their tenant ID or a verified domain (e.g. contoso.onmicrosoft.com):');
    if (!tenantId || !tenantId.trim()) return;
    add(name.trim(), tenantId.trim());
  }

  function clearAll() {
    if (!confirm('Clear all Portfolio data from this browser? This only removes the local client list and last-synced summary numbers — nothing in any client\'s tenant is affected, and this can\'t be undone from here (you\'d need to re-add each client).')) return;
    try { localStorage.removeItem(KEY); } catch (e) { }
    render();
  }

  return { render: render, add: add, remove: remove, sync: sync, promptAdd: promptAdd, clearAll: clearAll };
})();

/* ============================================================
   Checkpoint — application
   Views, rendering and actions. Data comes from window.Store
   (DemoStore or SpStore — same interface).
   ============================================================ */
(function () {
  var S = null;          /* in-memory state, loaded from Store */
  var Store = null;      /* active store */
  var CONFIG = window.CHECKPOINT_CONFIG;

  /* Templates: a failed / review check proposes this risk + actions.
     Nothing enters the register without practitioner approval. */
  var TPL = {
    'legacy': {
      risk: { title: 'Legacy authentication protocols allow credential-stuffing & MFA bypass', cat: 'Access', L: 5, I: 4, controls: ['A.8.5', 'A.5.15'] },
      actions: [{ t: 'Block legacy authentication via Conditional Access policy', pr: 'Critical', days: 14, control: 'A.8.5' }]
    },
    'wdac': {
      risk: { title: 'Unhardened endpoints permit untrusted code execution across the fleet', cat: 'Ops', L: 4, I: 4, controls: ['A.8.7', 'A.8.19'] },
      actions: [{ t: 'Deploy WDAC application control baseline via Intune', pr: 'High', days: 30, control: 'A.8.7' }, { t: 'Stand up pilot ring & exception process for app control', pr: 'Medium', days: 45, control: 'A.8.19' }]
    },
    'mfa-priv': {
      risk: { title: 'Privileged accounts protected by phishable MFA methods', cat: 'Access', L: 4, I: 5, controls: ['A.8.2', 'A.8.5'] },
      actions: [{ t: 'Enforce FIDO2/passkey sign-in for all privileged roles', pr: 'Critical', days: 21, control: 'A.8.2' }]
    },
    'admins': {
      risk: { title: 'Excess Global Administrator assignments widen the blast radius', cat: 'Access', L: 3, I: 5, controls: ['A.8.2'] },
      actions: [{ t: 'Reduce Global Admins to ≤4; move others to PIM-eligible roles', pr: 'High', days: 14, control: 'A.8.2' }]
    },
    'patch': {
      risk: { title: 'Patch latency leaves known vulnerabilities exploitable', cat: 'Ops', L: 4, I: 4, controls: ['A.8.8'] },
      actions: [{ t: 'Tighten Intune update rings to 7-day deferral with compliance gate', pr: 'High', days: 21, control: 'A.8.8' }]
    },
    'backup': {
      risk: { title: 'Backup coverage unverified for business-critical workloads', cat: 'Data', L: 3, I: 5, controls: ['A.8.13'] },
      actions: [{ t: 'Enable & verify M365 backup for Exchange/SharePoint/OneDrive', pr: 'High', days: 21, control: 'A.8.13' }]
    },
    'pim': {
      risk: { title: 'Privileged directory roles held as permanent assignments rather than time-bound, approved elevation', cat: 'Access', L: 3, I: 4, controls: ['A.8.2', 'A.5.18'] },
      actions: [{ t: 'Convert permanent privileged role assignments to PIM-eligible with approval workflow', pr: 'High', days: 30, control: 'A.8.2' }]
    },
    'riskyusers': {
      risk: { title: 'Risky sign-ins and risky user flags in Identity Protection are not being triaged', cat: 'Access', L: 4, I: 4, controls: ['A.5.25', 'A.5.26'] },
      actions: [{ t: 'Establish a weekly Identity Protection risky-user triage & remediation process', pr: 'High', days: 21, control: 'A.5.26' }]
    },
    'riskyapps': {
      risk: { title: 'Third-party OAuth app grants with high-privilege scopes have not been reviewed', cat: 'Supplier', L: 3, I: 4, controls: ['A.5.21', 'A.8.3'] },
      actions: [{ t: 'Review and revoke unnecessary high-privilege OAuth application consents', pr: 'Medium', days: 30, control: 'A.5.21' }]
    }
  };

  /* ================= helpers ================= */
  function daysFrom(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function band(sc) { return sc >= 15 ? 'Critical' : sc >= 10 ? 'High' : sc >= 5 ? 'Medium' : 'Low'; }
  function risk(id) { return S.risks.find(function (r) { return r.id === id; }); }
  function residual(r) {
    var done = r.actions.filter(function (a) { var x = S.actions.find(function (q) { return q.id === a; }); return x && x.status === 'Done'; }).length;
    var all = r.actions.length > 0 && done === r.actions.length;
    return { L: Math.max(1, r.L - done), I: all ? Math.max(1, r.I - 1) : r.I };
  }
  function checkResult(c) {
    /* No Graph signal exists for these at all — always "manual",
       regardless of whether a scan has run. */
    if (c.scored === false) return 'manual';
    if (!S.lastResults) return null;
    var base = S.lastResults[c.id];
    /* In demo mode, completing all remediation actions flips the check */
    if (Store.kind === 'demo' && c.tpl) {
      var made = S.risks.find(function (r) { return r.tpl === c.tpl; });
      if (made) {
        var allDone = made.actions.every(function (a) { var x = S.actions.find(function (q) { return q.id === a; }); return x && x.status === 'Done'; });
        if (allDone) return 'pass';
      }
    }
    return base;
  }
  function score() {
    /* Only scored:true checks (real Graph signal) feed the numeric
       score — manual/unautomatable checks are a separate checklist and
       must never drag the score down just for being honestly flagged. */
    var scored = window.CHECK_DEFS.filter(function (c) { return c.scored !== false; });
    if (!scored.length) return 100;
    var pts = scored.reduce(function (sum, c) {
      var r = checkResult(c);
      return sum + (r === 'pass' ? 1 : r === 'review' ? 0.5 : 0);
    }, 0);
    return Math.max(5, Math.round(pts / scored.length * 100));
  }
  function toast(msg) {
    var t = document.getElementById('toast'); t.innerHTML = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 3400);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  /* evidence links render as real <a href> — reject javascript: and other
     non-http(s) schemes so a pasted link can never become an XSS vector */
  function isSafeUrl(u) { return /^https?:\/\//i.test(u); }
  function fmtDate(d) { if (!d) return '—'; return new Date(d + 'T00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); }
  function overdue(a) { return a.status !== 'Done' && a.due && a.due < new Date().toISOString().slice(0, 10); }
  function entitledFrameworks() {
    return window.FRAMEWORK_ORDER.filter(function (fw) { return S.entitlements && S.entitlements[fw]; });
  }
  function fwName(fw) { return (window.FRAMEWORKS[fw] || {}).name || fw; }
  /* default to ON if a key isn't present yet (older tenants provisioned
     before this feature existed shouldn't have things silently vanish) */
  function featureOn(key) { return !(S.settings && S.settings[key] === 'false'); }
  function overdueDays(a) {
    if (a.status === 'Done' || !a.due) return 0;
    var today = new Date().toISOString().slice(0, 10);
    if (a.due >= today) return 0;
    return Math.floor((new Date(today) - new Date(a.due)) / 86400000);
  }
  var SEV_RANK = { Low: 1, Medium: 2, High: 3, Critical: 4 };
  /* fixed RAG severity scale for the risk heatmap — status colors, not an
     arbitrary hue ramp, so a cell's color always means the same thing
     regardless of how many risks happen to land in it */
  var SEV_RGB = { Low: '12,163,12', Medium: '250,178,25', High: '236,131,90', Critical: '208,59,59' };
  var SEV_TEXT = { Low: '#eafbea', Medium: '#2a1c00', High: '#2a1200', Critical: '#fdeceb' };
  function daysSince(dateStr) {
    if (!dateStr) return Infinity;
    return Math.floor((new Date(new Date().toISOString().slice(0, 10)) - new Date(dateStr)) / 86400000);
  }
  /* generic trend badge vs a previous snapshot. higherIsBetter flips which
     direction counts as "good" (green) — a rising posture score is good, a
     rising risk/overdue count is not. */
  function trendBadge(current, previous, higherIsBetter) {
    if (previous === undefined || previous === null || current === previous) return '';
    var up = current > previous;
    var good = higherIsBetter ? up : !up;
    return '<span class="trend" style="color:' + (good ? 'var(--pass)' : 'var(--fail)') + '">' + (up ? '▲' : '▼') + Math.abs(current - previous) + '</span>';
  }
  function busy(on) { document.getElementById('busy').style.display = on ? 'flex' : 'none'; }
  function log(msg) { S.activity.unshift({ t: new Date().toISOString().slice(0, 10), msg: msg }); Store.logActivity(msg).catch(warn); }
  function warn(e) { console.error(e); toast('<b>Sync issue:</b> ' + esc(e.message || e)); }

  /* ================= render ================= */
  function renderNavCounts() {
    document.getElementById('nRisks').textContent = S.risks.filter(function (r) { return r.status !== 'Closed'; }).length;
    document.getElementById('nActions').textContent = S.actions.filter(function (a) { return a.status !== 'Done'; }).length;
    var p = S.proposed.length; var el = document.getElementById('nScan');
    el.textContent = p || ''; el.style.display = p ? 'inline-block' : 'none';

    var today = new Date().toISOString().slice(0, 10);
    var overdueAudits = (S.audits || []).filter(function (a) { return a.status === 'Planned' && a.planned && a.planned < today; }).length;
    var aEl = document.getElementById('nAudits');
    aEl.textContent = overdueAudits || ''; aEl.style.display = overdueAudits ? 'inline-block' : 'none';

    var lastReview = (S.reviews || [])[S.reviews.length - 1];
    var reviewOverdue = lastReview && lastReview.nextDue && lastReview.nextDue < today;
    var rEl = document.getElementById('nReviews');
    rEl.textContent = reviewOverdue ? '!' : ''; rEl.style.display = reviewOverdue ? 'inline-block' : 'none';

    var overdueCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done' && c.nextDue && c.nextDue < today; }).length;
    var cEl = document.getElementById('nCalendar');
    cEl.textContent = overdueCal || ''; cEl.style.display = overdueCal ? 'inline-block' : 'none';
  }

  function renderDash() {
    var openActs = S.actions.filter(function (a) { return a.status !== 'Done'; });
    var odActs = S.actions.filter(function (a) { return overdueDays(a) > 0; });
    var b1 = odActs.filter(function (a) { return overdueDays(a) <= 7; }).length;
    var b2 = odActs.filter(function (a) { var d = overdueDays(a); return d > 7 && d <= 30; }).length;
    var b3 = odActs.filter(function (a) { return overdueDays(a) > 30; }).length;
    var od = odActs.length;
    var crit = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
    var last = S.scans[S.scans.length - 1];
    var prevScan = S.scans[S.scans.length - 2];

    /* posture score tile — trend vs last scan + pass/review/fail breakdown,
       not just a bare number with a date */
    var scoreTrendHtml = last && prevScan ? trendBadge(last.score, prevScan.score, true) : '';
    var scoreBreakdownHtml = 'No scan yet — run one from the sidebar';
    if (last) {
      if (S.lastResults) {
        var scoredDefs = window.CHECK_DEFS.filter(function (c) { return c.scored !== false; });
        var passN = 0, reviewN = 0, failN = 0;
        scoredDefs.forEach(function (c) {
          var r = checkResult(c);
          if (r === 'pass') passN++; else if (r === 'review') reviewN++; else if (r === 'fail') failN++;
        });
        scoreBreakdownHtml = '<i class="dot" style="background:var(--pass)"></i>' + passN + ' &nbsp; <i class="dot" style="background:var(--warn)"></i>' + reviewN + ' &nbsp; <i class="dot" style="background:var(--fail)"></i>' + failN + ' &nbsp; ' + daysSince(last.date) + 'd ago';
      } else {
        scoreBreakdownHtml = 'Last scan ' + fmtDate(last.date);
      }
    }

    /* risks/overdue-actions trend vs the counts snapshotted at the last scan
       (scan-to-scan is the natural cadence here, same as the score tile —
       not every render, which would just show noise from mid-session edits) */
    var critTrendHtml = prevScan ? trendBadge(crit, prevScan.critRisks, false) : '';
    var odTrendHtml = prevScan ? trendBadge(od, prevScan.overdueActions, false) : '';

    /* one readiness tile per purchased framework, each with its own trend
       vs the per-framework readiness snapshotted at the last scan */
    var fwTiles = entitledFrameworks().map(function (fw) {
      var applicable = S.controls.filter(function (c) { return c.fw === fw && c.app; });
      var impl = applicable.filter(function (c) { return c.st === 'Implemented'; }).length;
      var ready = applicable.length ? Math.round(impl / applicable.length * 100) : 0;
      var prevReady = prevScan && prevScan.readinessByFw ? prevScan.readinessByFw[fw] : undefined;
      return '<div class="card kpi"><div class="kpi-num"><b>' + ready + '<small>%</small></b>' + trendBadge(ready, prevReady, true) + '</div><span>Audit readiness — ' + esc(fwName(fw)) + '</span><div class="sub">' + impl + ' of ' + applicable.length + ' applicable controls implemented</div></div>';
    }).join('');
    document.getElementById('kpiRow').innerHTML = fwTiles +
      '<div class="card kpi"><div class="kpi-num"><b>' + (last ? last.score : '—') + (last ? '<small>/100</small>' : '') + '</b>' + scoreTrendHtml + '</div><span>Posture score</span><div class="sub">' + scoreBreakdownHtml + '</div></div>' +
      '<div class="card kpi"><div class="kpi-num"><b>' + crit + '</b>' + critTrendHtml + '</div><span>High / critical residual risks</span><div class="sub">' + S.risks.filter(function (r) { return r.status !== 'Closed'; }).length + ' open risks total</div></div>' +
      '<div class="card kpi"><div class="kpi-num"><b style="color:' + (od ? 'var(--fail)' : 'var(--gold-light)') + '">' + od + '</b>' + odTrendHtml + '</div><span>Overdue actions</span><div class="sub">' + (od ? ('0–7d: ' + b1 + ' · 8–30d: ' + b2 + ' · 30+d: ' + b3) : openActs.length + ' open actions') + '</div></div>';

    /* risk appetite breach banner */
    var appetite = (S.settings && S.settings.riskAppetite) || 'Medium';
    var appetiteRank = SEV_RANK[appetite] || 2;
    var breaches = S.risks.filter(function (r) {
      if (r.status === 'Closed') return false;
      var q = residual(r);
      return SEV_RANK[band(q.L * q.I)] > appetiteRank;
    });
    var bannerEl = document.getElementById('appetiteBanner');
    if (bannerEl) {
      var appetiteFeatOn = featureOn('featAppetite');
      bannerEl.innerHTML = (appetiteFeatOn && breaches.length)
        ? '<b>' + breaches.length + ' risk' + (breaches.length > 1 ? 's' : '') + ' exceed' + (breaches.length > 1 ? '' : 's') + ' your risk appetite (' + appetite + ')</b> — ' + breaches.slice(0, 3).map(function (r) { return r.id; }).join(', ') + (breaches.length > 3 ? ' and ' + (breaches.length - 3) + ' more' : '') + '. <a href="#" data-action="App.go" data-id="risks" style="color:inherit;text-decoration:underline">Review the risk register →</a>'
        : '';
      bannerEl.style.display = (appetiteFeatOn && breaches.length) ? 'block' : 'none';
    }

    /* posture scan due — no backend means nothing runs itself while the
       tab is closed, so this is a nudge on load rather than a real
       schedule. See SETUP.md for wiring a Power Automate flow instead. */
    var scanDueEl = document.getElementById('scanDueBanner');
    if (scanDueEl) {
      var cadence = parseInt((S.settings && S.settings.scanCadenceDays) || '30', 10) || 30;
      var sinceLast = last ? daysSince(last.date) : Infinity;
      var due = sinceLast >= cadence;
      scanDueEl.innerHTML = due
        ? '<b>Posture scan is overdue</b> — ' + (last ? 'last run ' + sinceLast + ' days ago' : 'none has ever been run') + ' (reminder set to every ' + cadence + ' days). <a href="#" data-action="App.go" data-id="scan" style="color:inherit;text-decoration:underline">Run it now →</a>'
        : '';
      scanDueEl.style.display = due ? 'block' : 'none';
    }

    /* governance card — internal audit programme + management review cadence */
    var govEl = document.getElementById('governanceCard');
    if (govEl) {
      var audits = S.audits || [], reviews = S.reviews || [];
      var lastAudit = audits.filter(function (a) { return a.status === 'Completed'; }).sort(function (a, b) { return (b.completed || '').localeCompare(a.completed || ''); })[0];
      var nextAudit = audits.filter(function (a) { return a.status === 'Planned'; }).sort(function (a, b) { return (a.planned || '').localeCompare(b.planned || ''); })[0];
      var lastReview = reviews[reviews.length - 1];
      var reviewOverdue = lastReview && lastReview.nextDue && lastReview.nextDue < new Date().toISOString().slice(0, 10);
      var today2 = new Date().toISOString().slice(0, 10);
      var upcomingCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); })[0];
      var calOverdue = upcomingCal && upcomingCal.nextDue && upcomingCal.nextDue < today2;
      govEl.innerHTML =
        '<div class="d-kv"><span>Last internal audit</span><b>' + (lastAudit ? fmtDate(lastAudit.completed) + ' — ' + esc(lastAudit.scope) : 'None recorded') + '</b></div>' +
        '<div class="d-kv"><span>Next internal audit</span><b>' + (nextAudit ? fmtDate(nextAudit.planned) + ' — ' + esc(nextAudit.scope) : 'None scheduled') + '</b></div>' +
        '<div class="d-kv"><span>Last management review</span><b>' + (lastReview ? fmtDate(lastReview.date) : 'None recorded') + '</b></div>' +
        '<div class="d-kv"><span>Next review due</span><b style="' + (reviewOverdue ? 'color:var(--fail)' : '') + '">' + (lastReview && lastReview.nextDue ? fmtDate(lastReview.nextDue) + (reviewOverdue ? ' ⚑ overdue' : '') : 'Not set') + '</b></div>' +
        '<div class="d-kv"><span>Next ISMS activity</span><b style="' + (calOverdue ? 'color:var(--fail)' : '') + '">' + (upcomingCal ? fmtDate(upcomingCal.nextDue) + ' — ' + esc(upcomingCal.title) + (calOverdue ? ' ⚑' : '') : 'None scheduled') + '</b></div>';
    }

    /* certification roadmap — primary entitled framework */
    var roadmapCard = document.getElementById('roadmapCard');
    var roadmapEl = document.getElementById('roadmap');
    if (roadmapCard) roadmapCard.style.display = featureOn('featRoadmap') ? '' : 'none';
    if (roadmapEl && featureOn('featRoadmap')) {
      var entitled = entitledFrameworks();
      if (!entitled.length) {
        roadmapEl.innerHTML = '<p style="color:var(--paper-faint);font-size:13px">Enable a framework to see its certification roadmap.</p>';
      } else {
        var primaryFw = entitled.indexOf('iso27001') > -1 ? 'iso27001' : entitled[0];
        var pApp = S.controls.filter(function (c) { return c.fw === primaryFw && c.app; });
        var pImpl = pApp.filter(function (c) { return c.st === 'Implemented'; });
        var implPct = pApp.length ? Math.round(pImpl.length / pApp.length * 100) : 0;
        /* same denominator as Implement (all applicable controls), so
           Evidence can never read higher than Implement — a proper funnel */
        var evidencedCount = pImpl.filter(function (c) { return c.verified || c.evidenceUrl; }).length;
        var evidencedPct = pApp.length ? Math.round(evidencedCount / pApp.length * 100) : 0;
        var certifyPct = (implPct === 100 && evidencedPct === 100) ? 100 : 0;
        var phases = [
          { name: 'Assess', pct: 100 },
          { name: 'Implement', pct: implPct },
          { name: 'Evidence', pct: evidencedPct },
          { name: 'Certify', pct: certifyPct }
        ];
        roadmapEl.innerHTML = '<div class="roadmap-label">' + esc(fwName(primaryFw)) + '</div><div class="roadmap-track">' +
          phases.map(function (p, i) {
            return '<div class="roadmap-phase' + (p.pct === 100 ? ' done' : p.pct > 0 ? ' active' : '') + '"><div class="roadmap-fill" style="width:' + p.pct + '%"></div><span>' + (i + 1) + '. ' + p.name + '</span><b>' + p.pct + '%</b></div>';
          }).join('') + '</div>';
      }
    }

    /* heatmap — colored by the cell's own severity band (fixed RAG scale,
       same meaning everywhere) with fill strength showing risk count,
       not a single hue whose only signal is density */
    var counts = {};
    S.risks.forEach(function (r) { if (r.status === 'Closed') return; var q = residual(r); var k = q.L + '-' + q.I; counts[k] = (counts[k] || 0) + 1; });
    var h = '<div class="lab"></div>';
    for (var L = 1; L <= 5; L++) h += '<div class="lab">L' + L + '</div>';
    for (var I = 5; I >= 1; I--) {
      h += '<div class="lab">I' + I + '</div>';
      for (var L2 = 1; L2 <= 5; L2++) {
        var n = counts[L2 + '-' + I] || 0;
        var sev = band(L2 * I);
        var rgb = SEV_RGB[sev];
        var alpha = n === 0 ? 0.12 : n === 1 ? 0.42 : n === 2 ? 0.62 : 0.82;
        var textColor = n === 0 ? 'var(--paper-faint)' : SEV_TEXT[sev];
        h += '<div class="cell" style="background:rgba(' + rgb + ',' + alpha + ');color:' + textColor + '" title="Likelihood ' + L2 + ' × Impact ' + I + ' — ' + sev + (n ? ' — ' + n + ' risk' + (n > 1 ? 's' : '') : '') + '">' + (n || '') + '</div>';
      }
    }
    document.getElementById('heat').innerHTML = h;
    var legendEl = document.getElementById('heatLegend');
    if (legendEl) {
      legendEl.innerHTML = ['Low', 'Medium', 'High', 'Critical'].map(function (sev) {
        return '<span><i style="background:rgba(' + SEV_RGB[sev] + ',.75)"></i>' + sev + '</span>';
      }).join('');
    }
    /* spark — posture score (gold) + control readiness (light gold), where
       recorded. The svg stretches non-uniformly (preserveAspectRatio="none")
       so text inside it would distort — value/date labels live in the HTML
       caption above it instead. */
    var sparkCapEl = document.getElementById('sparkCaption');
    if (S.scans.length) {
      var n2 = S.scans.length;
      var firstScan = S.scans[0], lastScan = S.scans[n2 - 1];
      if (sparkCapEl) {
        if (n2 > 1) {
          var deltaAll = lastScan.score - firstScan.score;
          sparkCapEl.innerHTML =
            '<span>' + fmtDate(firstScan.date) + ' · <b>' + firstScan.score + '</b></span>' +
            '<span style="color:' + (deltaAll >= 0 ? 'var(--pass)' : 'var(--fail)') + ';font-weight:800">' + (deltaAll > 0 ? '▲' : deltaAll < 0 ? '▼' : '—') + (deltaAll ? Math.abs(deltaAll) : '') + ' over ' + n2 + ' scan' + (n2 > 1 ? 's' : '') + '</span>' +
            '<span>' + fmtDate(lastScan.date) + ' · <b class="gold-t">' + lastScan.score + '</b></span>';
        } else {
          sparkCapEl.innerHTML = '<span>First scan — <b class="gold-t">' + lastScan.score + '/100</b> (' + fmtDate(lastScan.date) + ')</span>';
        }
      }
      var trendFeatOn = featureOn('featTrend');
      var readinessScans = S.scans.filter(function (s) { return typeof s.readiness === 'number'; });
      if (n2 > 1) {
        var pts = S.scans.map(function (s, i) { return [(i / (n2 - 1)) * 292 + 4, 60 - (s.score / 100) * 56]; });
        var line = pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
        var lastP = pts[pts.length - 1], firstP = pts[0];
        var area = '<polygon points="' + line + ' ' + lastP[0] + ',60 ' + firstP[0] + ',60" fill="rgba(169,129,46,.12)"/>';
        var readyLine = '';
        if (trendFeatOn && readinessScans.length > 1) {
          var rPts = S.scans.map(function (s, i) {
            var r = typeof s.readiness === 'number' ? s.readiness : null;
            return r === null ? null : [(i / (n2 - 1)) * 292 + 4, 60 - (r / 100) * 56];
          }).filter(Boolean);
          readyLine = '<polyline points="' + rPts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="rgba(216,186,120,.55)" stroke-width="1.5" stroke-dasharray="3,3"/>';
        }
        document.getElementById('spark').innerHTML = area + readyLine +
          '<polyline points="' + line + '" fill="none" stroke="#A9812E" stroke-width="2"/>' +
          '<circle cx="' + firstP[0] + '" cy="' + firstP[1] + '" r="3" fill="rgba(216,186,120,.5)"/>' +
          '<circle cx="' + lastP[0] + '" cy="' + lastP[1] + '" r="4" fill="#D8BA78"/>';
        document.getElementById('sparkLegend').style.display = (trendFeatOn && readinessScans.length > 1) ? 'flex' : 'none';
      } else {
        document.getElementById('spark').innerHTML = '<circle cx="150" cy="' + (60 - (lastScan.score / 100) * 56) + '" r="4" fill="#D8BA78"/>';
        document.getElementById('sparkLegend').style.display = 'none';
      }
    } else {
      if (sparkCapEl) sparkCapEl.innerHTML = '<span>No scans yet — run one from the sidebar</span>';
      document.getElementById('spark').innerHTML = '';
    }
    /* feed */
    document.getElementById('feed').innerHTML = S.activity.slice(0, 10).map(function (a) {
      return '<li><time>' + fmtDate(a.t) + '</time>' + a.msg + '</li>';
    }).join('') || '<li style="color:var(--paper-faint)">No activity yet.</li>';
  }

  function renderScanChecks(instant) {
    var el = document.getElementById('checkList');
    var areas = [], byArea = {};
    window.CHECK_DEFS.forEach(function (c) {
      if (!byArea[c.area]) { byArea[c.area] = []; areas.push(c.area); }
      byArea[c.area].push(c);
    });
    el.innerHTML = areas.map(function (area) {
      return '<div class="check-area">' + esc(area) + '</div>' + byArea[area].map(function (c) {
        var r = checkResult(c);
        var cls = r === 'pass' ? 'st-Implemented' : r === 'review' ? 'st-Intreatment' : r === 'fail' ? 'st-Open' : r === 'manual' ? 'st-Proposed' : 'st-Notstarted';
        var lbl = r === 'pass' ? 'Pass' : r === 'review' ? 'Review' : r === 'fail' ? 'Fail' : r === 'manual' ? 'Manual — verify' : 'Not scanned';
        var note = (S.lastNotes && S.lastNotes[c.id]) ? '<div class="src" style="margin-top:2px">' + esc(S.lastNotes[c.id]) + '</div>' : '';
        return '<div class="check-row' + (instant ? ' show' : '') + '"><span class="lbl">' + c.label + note + '</span><span class="chip ' + cls + '">' + lbl + '</span></div>';
      }).join('');
    }).join('');
  }

  function renderProposed() {
    var w = document.getElementById('proposedWrap');
    if (!S.proposed.length) {
      w.innerHTML = S.lastResults ? '<div class="card" style="color:var(--paper-dim);font-size:13px">No new findings require risk treatment. Existing register covers current posture.</div>' : '';
      return;
    }
    w.innerHTML = '<div class="card"><h3>Proposed for the register — practitioner approval required</h3>' + S.proposed.map(function (p) {
      var t = TPL[p];
      return '<div class="proposed-card"><h4>' + esc(t.risk.title) + '</h4>' +
        '<div class="meta">Inherent <b>' + t.risk.L + ' × ' + t.risk.I + ' — ' + band(t.risk.L * t.risk.I) + '</b> · Controls <b>' + t.risk.controls.join(', ') + '</b> · ' + t.actions.length + ' remediation action' + (t.actions.length > 1 ? 's' : '') + ' will be created and assigned</div>' +
        '<button class="btn sm" data-action="App.approve" data-id="' + p + '">Approve → register</button> ' +
        '<button class="btn ghost sm" data-action="App.dismiss" data-id="' + p + '">Dismiss</button></div>';
    }).join('') + '</div>';
  }

  function renderRisks() {
    var f = window._riskF || 'All';
    document.getElementById('riskFilters').innerHTML = ['All', 'Critical', 'High', 'Medium', 'Low'].map(function (x) {
      return '<button class="f-pill' + (f === x ? ' on' : '') + '" data-action="App.filterRisk" data-id="' + x + '">' + x + '</button>';
    }).join('');
    var rows = S.risks.filter(function (r) {
      if (f === 'All') return true; var q = residual(r); return band(q.L * q.I) === f;
    }).map(function (r) {
      var q = residual(r), ib = band(r.L * r.I), rb = band(q.L * q.I);
      return '<tr data-id="' + r.id + '" data-action="App.openRisk"><td class="id-t">' + r.id + '</td><td style="color:var(--paper)">' + esc(r.title) + '</td><td>' + esc(r.cat) + '</td><td class="src">' + esc(r.src) + '</td>' +
        '<td><span class="chip sev-' + ib + '">' + (r.L * r.I) + ' ' + ib + '</span></td><td><span class="chip sev-' + rb + '">' + (q.L * q.I) + ' ' + rb + '</span></td>' +
        '<td>' + esc(r.owner) + '</td><td><span class="chip st-' + r.status.replace(/ /g, '') + '">' + r.status + '</span></td></tr>';
    }).join('');
    document.getElementById('riskRows').innerHTML = rows || '<tr><td colspan="8" style="color:var(--paper-faint)">No risks in this band. The register builds as scans are approved and workshops are captured.</td></tr>';
  }

  var ACTION_TYPES = ['Action', 'Non-conformity (Major)', 'Non-conformity (Minor)', 'Observation'];
  function typeCls(t) {
    if (t === 'Non-conformity (Major)') return 'sev-Critical';
    if (t === 'Non-conformity (Minor)') return 'sev-Medium';
    if (t === 'Observation') return 'sev-Low';
    return 'st-Notstarted';
  }

  function renderActions() {
    var f = window._actF || 'Open';
    var tf = window._actTypeF || 'All';
    document.getElementById('actFilters').innerHTML = ['Open', 'Overdue', 'Done', 'All'].map(function (x) {
      return '<button class="f-pill' + (f === x ? ' on' : '') + '" data-action="App.filterAct" data-id="' + x + '">' + x + '</button>';
    }).join('');
    document.getElementById('actTypeFilters').innerHTML = ['All'].concat(ACTION_TYPES).map(function (x) {
      return '<button class="f-pill' + (tf === x ? ' on' : '') + '" data-action="App.filterActType" data-id="' + x + '">' + x + '</button>';
    }).join('');
    var rows = S.actions.filter(function (a) {
      if (tf !== 'All' && (a.type || 'Action') !== tf) return false;
      if (f === 'All') return true; if (f === 'Done') return a.status === 'Done';
      if (f === 'Overdue') return overdue(a); return a.status !== 'Done';
    }).map(function (a) {
      var od = overdue(a);
      var days = overdueDays(a);
      var type = a.type || 'Action';
      var evidenceCell = (a.evidenceUrl && isSafeUrl(a.evidenceUrl))
        ? '<a href="' + esc(a.evidenceUrl) + '" target="_blank" rel="noopener" class="evidence-link">Evidence ↗</a>'
        : '<button class="btn ghost sm" data-action="App.setActionEvidence" data-id="' + a.id + '">Link</button>';
      return '<tr data-id="' + a.id + '"><td class="id-t">' + a.id + '</td><td style="color:var(--paper)">' + esc(a.title) + '</td>' +
        '<td><span class="chip ' + typeCls(type) + '">' + esc(type) + '</span></td>' +
        '<td class="id-t">' + esc(a.risk || '—') + '</td><td class="id-t">' + esc(a.control || '—') + '</td>' +
        '<td><span class="chip sev-' + (a.pr === 'Critical' ? 'Critical' : a.pr) + '">' + a.pr + '</span></td><td>' + esc(a.owner) + '</td>' +
        '<td style="color:' + (od ? 'var(--fail)' : 'inherit') + '">' + fmtDate(a.due) + (od ? ' ⚑ ' + days + 'd' : '') + '</td>' +
        '<td><span class="chip st-' + a.status.replace(/ /g, '') + '">' + a.status + '</span></td>' +
        '<td>' + evidenceCell + '</td>' +
        '<td>' + (a.status !== 'Done' ? '<button class="btn sm" data-action="App.complete" data-id="' + a.id + '">Complete</button>' : '<span class="src">Done ✓</span>') + '</td></tr>';
    }).join('');
    document.getElementById('actRows').innerHTML = rows || '<tr><td colspan="11" style="color:var(--paper-faint)">Nothing here. Actions are created when scan findings are approved, risks are treated, or added manually above.</td></tr>';
  }

  function renderSoa() {
    var entitled = entitledFrameworks();
    if (!entitled.length) {
      document.getElementById('soaFwTabs').innerHTML = '';
      document.getElementById('soaPct').textContent = '—';
      document.getElementById('soaBarFill').style.width = '0%';
      document.getElementById('soaRows').innerHTML = '<tr><td colspan="6" style="color:var(--paper-faint)">No frameworks purchased yet. Enable one from the <a href="#" data-action="App.go" data-id="frameworks" style="color:var(--gold-light)">Frameworks</a> view.</td></tr>';
      return;
    }
    if (!window._soaFw || entitled.indexOf(window._soaFw) === -1) window._soaFw = entitled[0];
    var activeFw = window._soaFw;

    document.getElementById('soaFwTabs').innerHTML = entitled.map(function (fw) {
      return '<button class="f-pill' + (fw === activeFw ? ' on' : '') + '" data-action="App.setSoaFw" data-id="' + fw + '">' + esc(fwName(fw)) + '</button>';
    }).join('');

    var rows = S.controls.filter(function (c) { return c.fw === activeFw; });
    var app = rows.filter(function (c) { return c.app; });
    var impl = app.filter(function (c) { return c.st === 'Implemented'; }).length;
    var pct = app.length ? Math.round(impl / app.length * 100) : 0;
    document.getElementById('soaPct').textContent = impl + ' / ' + app.length + ' — ' + pct + '%';
    document.getElementById('soaBarFill').style.width = pct + '%';
    document.getElementById('soaRows').innerHTML = rows.map(function (c) {
      var maps = String(c.map || '').split('·').map(function (m) { return m.trim(); }).filter(Boolean);
      var key = c.fw + '|' + c.id;
      var stale = c.st === 'Implemented' && daysSince(c.verified) > 90;
      var verifiedCell = !c.app ? '—'
        : c.st !== 'Implemented' ? '<span class="src">—</span>'
        : c.verified ? '<span class="' + (stale ? 'verify-stale' : 'verify-ok') + '">' + fmtDate(c.verified) + (stale ? ' ⚑' : '') + '</span>' + (c.verifiedBy ? '<div class="src">by ' + esc(c.verifiedBy) + '</div>' : '') + '<button class="btn ghost sm" style="margin-top:4px" data-action="App.verifyControl" data-id="' + key + '">Re-verify</button>'
        : '<button class="btn sm" data-action="App.verifyControl" data-id="' + key + '">Verify now</button>';
      var evidenceCell = (c.evidenceUrl && isSafeUrl(c.evidenceUrl))
        ? '<a href="' + esc(c.evidenceUrl) + '" target="_blank" rel="noopener" class="evidence-link">Evidence ↗</a><br><button class="btn ghost sm" style="margin-top:4px" data-action="App.setControlEvidence" data-id="' + key + '">Edit</button>'
        : '<button class="btn ghost sm" data-action="App.setControlEvidence" data-id="' + key + '">Link evidence</button>';
      return '<tr data-id="' + key + '"><td class="id-t">' + c.id + '</td><td style="color:var(--paper)">' + esc(c.t) + (c.just ? '<div class="src" style="margin-top:4px">Justification: ' + esc(c.just) + '</div>' : '') + '</td>' +
        '<td><button class="toggle' + (c.app ? ' on' : '') + '" data-action="App.toggleApp" data-id="' + key + '"></button></td>' +
        '<td>' + (c.app ? '<select class="mini" data-change-action="App.setSt" data-id="' + key + '">' + ['Not started', 'In progress', 'Implemented'].map(function (s) { return '<option' + (c.st === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' : '<span class="chip st-Notstarted">N/A</span>') + '</td>' +
        '<td><div class="fw-chips">' + maps.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div></td><td>' + esc(c.own) + '</td>' +
        '<td>' + verifiedCell + '</td><td>' + evidenceCell + '</td></tr>';
    }).join('');
  }

  function fmtSize(n) {
    if (!n) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderDocuments() {
    var rows = document.getElementById('docRows');
    if (!rows) return;
    var catSelect = document.getElementById('docCategory');
    if (catSelect && !catSelect.options.length) {
      catSelect.innerHTML = window.DOC_CATEGORIES.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    }
    if (Store.kind === 'demo') {
      document.getElementById('docCatFilters').innerHTML = '';
      rows.innerHTML = '<tr><td colspan="5" style="color:var(--paper-faint)">Demo mode has no real tenant to store files in — sign in to a real tenant to use Documents.</td></tr>';
      return;
    }
    rows.innerHTML = '<tr><td colspan="5" style="color:var(--paper-faint)">Loading…</td></tr>';
    Store.listDocuments().then(function (docs) {
      window._docs = docs;
      var cf = window._docCatF || 'All';
      document.getElementById('docCatFilters').innerHTML = ['All'].concat(window.DOC_CATEGORIES).map(function (c) {
        return '<button class="f-pill' + (cf === c ? ' on' : '') + '" data-action="App.filterDocCat" data-id="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('');
      var filtered = cf === 'All' ? docs : docs.filter(function (d) { return d.category === cf; });
      if (!filtered.length) {
        rows.innerHTML = '<tr><td colspan="5" style="color:var(--paper-faint)">No documents' + (cf === 'All' ? ' yet. Upload the ISMS manual, policies, risk treatment plan or training records above.' : ' in this category yet.') + '</td></tr>';
        return;
      }
      rows.innerHTML = filtered.map(function (d) {
        return '<tr><td style="color:var(--paper)">' + esc(d.name) + '</td><td class="src">' + esc(d.category || '—') + '</td><td>' + fmtDate(d.modified) + '</td><td>' + fmtSize(d.size) + '</td>' +
          '<td><a href="' + esc(d.url) + '" target="_blank" rel="noopener" class="evidence-link">Open ↗</a></td></tr>';
      }).join('');
    }).catch(function (e) {
      warn(e);
      rows.innerHTML = '<tr><td colspan="5" style="color:var(--paper-faint)">Could not load documents.</td></tr>';
    });
  }

  function renderAudits() {
    var wrap = document.getElementById('auditRows');
    if (!wrap) return;
    var fwSelect = document.getElementById('naAuditFw');
    if (fwSelect && !fwSelect.options.length) {
      fwSelect.innerHTML = window.FRAMEWORK_ORDER.map(function (fw) { return '<option value="' + fw + '">' + esc(fwName(fw)) + '</option>'; }).join('');
    }
    var audits = S.audits || [];
    if (!audits.length) {
      wrap.innerHTML = '<tr><td colspan="7" style="color:var(--paper-faint)">No internal audits scheduled yet. ISO 27001 clause 9.2 expects a recurring internal audit programme, independent of certification audits.</td></tr>';
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    wrap.innerHTML = audits.slice().reverse().map(function (a) {
      var overdue = a.status === 'Planned' && a.planned && a.planned < today;
      return '<tr><td class="id-t">' + a.id + '</td><td>' + esc(fwName(a.fw)) + '</td><td style="color:var(--paper)">' + esc(a.scope) + '</td><td>' + esc(a.auditor) + '</td>' +
        '<td style="color:' + (overdue ? 'var(--fail)' : 'inherit') + '">' + fmtDate(a.planned) + (overdue ? ' ⚑' : '') + '</td>' +
        '<td><span class="chip ' + (a.status === 'Completed' ? 'st-Implemented' : 'st-Notstarted') + '">' + a.status + '</span></td>' +
        '<td>' + (a.status === 'Planned' ? '<button class="btn sm" data-action="App.completeAudit" data-id="' + a.id + '">Mark complete</button>' : '<button class="btn ghost sm" data-action="App.openAudit" data-id="' + a.id + '">View</button>') + '</td></tr>';
    }).join('');
  }

  function renderReviews() {
    var wrap = document.getElementById('reviewRows');
    if (!wrap) return;
    var reviews = S.reviews || [];
    if (!reviews.length) {
      wrap.innerHTML = '<tr><td colspan="5" style="color:var(--paper-faint)">No management reviews recorded yet. ISO 27001 clause 9.3 expects top management to review the ISMS at planned intervals.</td></tr>';
      return;
    }
    wrap.innerHTML = reviews.slice().reverse().map(function (r) {
      return '<tr><td class="id-t">' + r.id + '</td><td>' + fmtDate(r.date) + '</td><td style="color:var(--paper)">' + esc(r.attendees) + '</td><td>' + (r.nextDue ? fmtDate(r.nextDue) : '—') + '</td>' +
        '<td><button class="btn ghost sm" data-action="App.openReview" data-id="' + r.id + '">View</button></td></tr>';
    }).join('');
  }

  function renderCalendar() {
    var wrap = document.getElementById('calRows');
    if (!wrap) return;
    var catSelect = document.getElementById('naCalCategory');
    if (catSelect && !catSelect.options.length) catSelect.innerHTML = window.CALENDAR_CATEGORIES.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    var freqSelect = document.getElementById('naCalFreq');
    if (freqSelect && !freqSelect.options.length) freqSelect.innerHTML = window.CALENDAR_FREQUENCIES.map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('');
    var items = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; });
    if (!items.length) {
      wrap.innerHTML = '<tr><td colspan="8" style="color:var(--paper-faint)">No recurring activities tracked yet. Add access control reviews, BCP/DR tests, supplier reviews and more above.</td></tr>';
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    wrap.innerHTML = items.slice().sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); }).map(function (c) {
      var isOverdue = c.nextDue && c.nextDue < today;
      return '<tr data-id="' + c.id + '"><td class="id-t">' + c.id + '</td><td style="color:var(--paper)">' + esc(c.title) + (c.notes ? '<div class="src" style="margin-top:4px">' + esc(c.notes) + '</div>' : '') + '</td><td class="src">' + esc(c.category) + '</td><td class="src">' + esc(c.freq) + '</td><td>' + esc(c.owner) + '</td>' +
        '<td style="color:' + (isOverdue ? 'var(--fail)' : 'inherit') + '">' + fmtDate(c.nextDue) + (isOverdue ? ' ⚑' : '') + '</td>' +
        '<td>' + (c.lastCompleted ? fmtDate(c.lastCompleted) : '—') + '</td>' +
        '<td><button class="btn sm" data-action="App.completeCalItem" data-id="' + c.id + '">Complete</button></td></tr>';
    }).join('');
  }

  function renderBoard() {
    var heroEl = document.getElementById('boardHero');
    if (!heroEl) return;
    var last = S.scans[S.scans.length - 1];
    var prevScan = S.scans[S.scans.length - 2];
    var entitled = entitledFrameworks();
    var primaryFw = entitled.indexOf('iso27001') > -1 ? 'iso27001' : entitled[0];
    var pApp = primaryFw ? S.controls.filter(function (c) { return c.fw === primaryFw && c.app; }) : [];
    var implCount = pApp.filter(function (c) { return c.st === 'Implemented'; }).length;
    var readyPct = pApp.length ? Math.round(implCount / pApp.length * 100) : 0;
    var crit = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
    var od = S.actions.filter(overdue).length;
    var scoreTrend = last && prevScan ? trendBadge(last.score, prevScan.score, true) : '';

    heroEl.innerHTML =
      '<div class="card board-tile"><b>' + (last ? last.score : '—') + '<small>/100</small> ' + scoreTrend + '</b><span>Posture score</span></div>' +
      '<div class="card board-tile"><b>' + readyPct + '<small>%</small></b><span>' + (primaryFw ? esc(fwName(primaryFw)) : 'No framework') + ' readiness</span></div>' +
      '<div class="card board-tile"><b style="color:' + (crit ? 'var(--fail)' : 'var(--gold-light)') + '">' + crit + '</b><span>High / critical risks</span></div>' +
      '<div class="card board-tile"><b style="color:' + (od ? 'var(--fail)' : 'var(--gold-light)') + '">' + od + '</b><span>Overdue actions</span></div>';

    var roadmapEl = document.getElementById('boardRoadmap');
    if (roadmapEl) {
      if (!primaryFw) {
        roadmapEl.innerHTML = '<p style="color:var(--paper-faint);font-size:13px">Enable a framework to see its certification roadmap.</p>';
      } else {
        var evidencedCount = pApp.filter(function (c) { return c.st === 'Implemented' && (c.verified || c.evidenceUrl); }).length;
        var evidencedPct = pApp.length ? Math.round(evidencedCount / pApp.length * 100) : 0;
        var certifyPct = (readyPct === 100 && evidencedPct === 100) ? 100 : 0;
        var phases = [{ name: 'Assess', pct: 100 }, { name: 'Implement', pct: readyPct }, { name: 'Evidence', pct: evidencedPct }, { name: 'Certify', pct: certifyPct }];
        roadmapEl.innerHTML = '<div class="roadmap-track">' + phases.map(function (p, i) {
          return '<div class="roadmap-phase' + (p.pct === 100 ? ' done' : p.pct > 0 ? ' active' : '') + '"><div class="roadmap-fill" style="width:' + p.pct + '%"></div><span>' + (i + 1) + '. ' + p.name + '</span><b>' + p.pct + '%</b></div>';
        }).join('') + '</div>';
      }
    }

    var risksEl = document.getElementById('boardRisks');
    if (risksEl) {
      var topRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; }).slice()
        .sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 3);
      risksEl.innerHTML = topRisks.length ? topRisks.map(function (r) {
        var q = residual(r), rb = band(q.L * q.I);
        return '<div class="d-kv"><span>' + esc(r.title) + '</span><b><span class="chip sev-' + rb + '">' + rb + '</span></b></div>';
      }).join('') : '<p style="color:var(--paper-faint);font-size:13px">No open risks.</p>';
    }

    var msEl = document.getElementById('boardMilestones');
    if (msEl) {
      var today = new Date().toISOString().slice(0, 10);
      var nextAudit = (S.audits || []).filter(function (a) { return a.status === 'Planned'; }).sort(function (a, b) { return (a.planned || '').localeCompare(b.planned || ''); })[0];
      var lastReview = (S.reviews || [])[S.reviews.length - 1];
      var upcomingCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); })[0];
      msEl.innerHTML =
        '<div class="d-kv"><span>Next internal audit</span><b>' + (nextAudit ? fmtDate(nextAudit.planned) + ' — ' + esc(nextAudit.scope) : 'None scheduled') + '</b></div>' +
        '<div class="d-kv"><span>Next management review</span><b>' + (lastReview && lastReview.nextDue ? fmtDate(lastReview.nextDue) : 'Not set') + '</b></div>' +
        '<div class="d-kv"><span>Next ISMS activity</span><b>' + (upcomingCal ? fmtDate(upcomingCal.nextDue) + ' — ' + esc(upcomingCal.title) : 'None scheduled') + '</b></div>';
    }
  }

  /* ================= global search ================= */
  function buildSearchIndex(q) {
    var out = [];
    S.risks.forEach(function (r) {
      if (r.id.toLowerCase().indexOf(q) > -1 || r.title.toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Risk', id: r.id, label: r.id + ' — ' + r.title, view: 'risks' });
      }
    });
    S.actions.forEach(function (a) {
      if (a.id.toLowerCase().indexOf(q) > -1 || a.title.toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Action', id: a.id, label: a.id + ' — ' + a.title, view: 'actions' });
      }
    });
    S.controls.forEach(function (c) {
      if (c.id.toLowerCase().indexOf(q) > -1 || c.t.toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Control', id: c.fw + '|' + c.id, label: c.id + ' — ' + c.t + ' (' + fwName(c.fw) + ')', view: 'soa', fw: c.fw });
      }
    });
    (S.audits || []).forEach(function (a) {
      if (a.id.toLowerCase().indexOf(q) > -1 || (a.scope || '').toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Audit', id: a.id, label: a.id + ' — ' + a.scope, view: 'audits' });
      }
    });
    (S.reviews || []).forEach(function (r) {
      if (r.id.toLowerCase().indexOf(q) > -1 || (r.attendees || '').toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Review', id: r.id, label: r.id + ' — ' + fmtDate(r.date) + ' (' + r.attendees + ')', view: 'reviews' });
      }
    });
    (S.calendar || []).forEach(function (c) {
      if (c.id.toLowerCase().indexOf(q) > -1 || c.title.toLowerCase().indexOf(q) > -1 || c.category.toLowerCase().indexOf(q) > -1) {
        out.push({ type: 'Calendar', id: c.id, label: c.id + ' — ' + c.title, view: 'calendar' });
      }
    });
    return out.slice(0, 20);
  }

  function scrollToRow(tbodyId, dataId) {
    setTimeout(function () {
      var row = document.querySelector('#' + tbodyId + ' tr[data-id="' + dataId + '"]');
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('flash');
        setTimeout(function () { row.classList.remove('flash'); }, 1800);
      }
    }, 80);
  }

  function renderFrameworksAdmin() {
    var wrap = document.getElementById('fwAdminRows');
    if (!wrap) return;
    wrap.innerHTML = window.FRAMEWORK_ORDER.map(function (fw) {
      var f = window.FRAMEWORKS[fw];
      var on = !!(S.entitlements && S.entitlements[fw]);
      return '<div class="card fw-admin-row"><div><b>' + esc(f.name) + '</b><span class="fw-admin-tag">' + esc(f.tag) + '</span><p>' + esc(f.blurb) + '</p></div><button class="toggle' + (on ? ' on' : '') + '" data-action="App.toggleEntitlement" data-id="' + fw + '"></button></div>';
    }).join('');

    var appetiteEl = document.getElementById('riskAppetiteRow');
    if (appetiteEl) {
      var current = (S.settings && S.settings.riskAppetite) || 'Medium';
      appetiteEl.innerHTML = '<div><b>Risk appetite</b><p>Any residual risk scoring above this level is flagged on the Dashboard and in reports as exceeding tolerance.</p></div>' +
        '<select class="mini" data-change-action="App.setRiskAppetite">' +
        ['Low', 'Medium', 'High', 'Critical'].map(function (s) { return '<option' + (current === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select>';
    }

    var cadenceEl = document.getElementById('scanCadenceRow');
    if (cadenceEl) {
      var cadenceCurrent = (S.settings && S.settings.scanCadenceDays) || '30';
      cadenceEl.innerHTML = '<div><b>Posture scan reminder</b><p>The Dashboard flags a scan as overdue after this many days. There\'s no backend to run scans unattended — this is a nudge on load, not a schedule. See SETUP.md for wiring real automation via Power Automate.</p></div>' +
        '<select class="mini" data-change-action="App.setScanCadence">' +
        ['7', '14', '30', '60', '90'].map(function (s) { return '<option' + (cadenceCurrent === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select>';
    }

    var featWrap = document.getElementById('featureRows');
    if (featWrap) {
      featWrap.innerHTML = window.FEATURE_DEFS.map(function (f) {
        var on = featureOn(f.key);
        return '<div class="card fw-admin-row"><div><b>' + esc(f.label) + '</b><p>' + esc(f.desc) + '</p></div><button class="toggle' + (on ? ' on' : '') + '" data-action="App.toggleFeature" data-id="' + f.key + '"></button></div>';
      }).join('');
    }
  }

  function renderFeatureVisibility() {
    var portfolioNav = document.querySelector('.nav-item[data-v="portfolio"]');
    if (!portfolioNav) return;
    var on = featureOn('featPortfolio');
    portfolioNav.style.display = on ? '' : 'none';
    /* don't strand the user on a view whose nav item just vanished */
    if (!on && portfolioNav.classList.contains('on')) App.go('dash');
  }

  function renderAll() { renderNavCounts(); renderDash(); renderScanChecks(true); renderProposed(); renderRisks(); renderActions(); renderSoa(); renderFrameworksAdmin(); renderFeatureVisibility(); }

  function renderGaugeFromLast() {
    var last = S.scans[S.scans.length - 1], C = 2 * Math.PI * 52;
    var arc = document.getElementById('gArc');
    arc.style.strokeDasharray = C;
    if (last) {
      arc.style.strokeDashoffset = C * (1 - last.score / 100);
      document.getElementById('gNum').textContent = last.score;
      document.getElementById('gCap').textContent = 'Last scan ' + fmtDate(last.date);
    } else {
      arc.style.strokeDashoffset = C;
      document.getElementById('gNum').textContent = '—';
      document.getElementById('gCap').textContent = 'No scan yet';
    }
  }

  /* ================= app actions ================= */
  window.App = {
    go: function (v) {
      document.querySelectorAll('.view').forEach(function (x) { x.classList.remove('on'); });
      document.getElementById('v-' + v).classList.add('on');
      document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.toggle('on', n.dataset.v === v); });
      window.scrollTo(0, 0);
      if (v === 'portfolio') Portfolio.render();
      if (v === 'documents') renderDocuments();
      if (v === 'audits') renderAudits();
      if (v === 'reviews') renderReviews();
      if (v === 'calendar') renderCalendar();
      if (v === 'board') renderBoard();
    },

    searchInput: function (q) {
      var wrap = document.getElementById('gsearchResults');
      var query = (q || '').trim().toLowerCase();
      if (!query) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
      var results = buildSearchIndex(query);
      window._searchResults = results;
      wrap.innerHTML = results.length
        ? results.map(function (r, i) { return '<div class="gsearch-row" data-mousedown-action="App.goToSearchResult" data-id="' + i + '"><span class="gs-type">' + esc(r.type) + '</span><span class="gs-label">' + esc(r.label) + '</span></div>'; }).join('')
        : '<div class="gsearch-empty">No matches for "' + esc(q) + '"</div>';
      wrap.style.display = 'block';
    },

    closeSearch: function () {
      document.getElementById('gsearchResults').style.display = 'none';
    },

    goToSearchResult: function (i) {
      var r = (window._searchResults || [])[i];
      if (!r) return;
      document.getElementById('gsearchInput').value = '';
      App.closeSearch();
      App.go(r.view);
      if (r.type === 'Risk') { setTimeout(function () { App.openRisk(r.id); }, 60); return; }
      if (r.type === 'Audit') { setTimeout(function () { App.openAudit(r.id); }, 60); return; }
      if (r.type === 'Review') { setTimeout(function () { App.openReview(r.id); }, 60); return; }
      if (r.type === 'Action') {
        window._actF = 'All'; window._actTypeF = 'All';
        renderActions();
        scrollToRow('actRows', r.id);
        return;
      }
      if (r.type === 'Control') {
        App.setSoaFw(r.fw);
        scrollToRow('soaRows', r.id);
        return;
      }
      if (r.type === 'Calendar') {
        scrollToRow('calRows', r.id);
        return;
      }
    },

    runScanFromDash: function () { App.go('scan'); App.runScan(); },

    runScan: async function () {
      var rows = document.querySelectorAll('#checkList .check-row');
      rows.forEach(function (r) { r.classList.remove('show'); });
      document.getElementById('gCap').textContent = Store.kind === 'demo'
        ? 'Scanning demo tenant…' : 'Scanning tenant via Microsoft Graph…';

      if (Store.kind === 'sharepoint') {
        try {
          var out = await Graph.runPostureChecks();
          S.lastResults = out.results;
          S.lastNotes = out.notes;
        } catch (e) { warn(e); document.getElementById('gCap').textContent = 'Scan failed'; return; }
      }
      /* demo mode keeps its stored lastResults (with remediation flips via checkResult) */

      renderScanChecks(false);
      var rows2 = document.querySelectorAll('#checkList .check-row');
      rows2.forEach(function (r, i) { setTimeout(function () { r.classList.add('show'); }, 300 + i * 220); });

      var target = score();
      var arc = document.getElementById('gArc'), C = 2 * Math.PI * 52;
      arc.style.strokeDasharray = C; arc.style.strokeDashoffset = C;
      var t0 = null;
      function fr(ts) {
        if (!t0) t0 = ts; var p = Math.min((ts - t0) / 1800, 1), e = 1 - Math.pow(1 - p, 3);
        document.getElementById('gNum').textContent = Math.round(target * e);
        arc.style.strokeDashoffset = C * (1 - (target / 100) * e);
        if (p < 1) requestAnimationFrame(fr); else document.getElementById('gCap').textContent = 'Scan complete — ' + new Date().toLocaleDateString('en-AU');
      }
      requestAnimationFrame(fr);

      /* queue proposals for unhandled fail/review templated checks */
      S.proposed = [];
      window.CHECK_DEFS.forEach(function (c) {
        if (!c.tpl) return;
        var r = checkResult(c);
        if (r === 'pass' || r === null) return;
        if (S.handledTpl.indexOf(c.tpl) > -1) return;
        S.proposed.push(c.tpl);
      });

      var today = new Date().toISOString().slice(0, 10);
      var lastScan = S.scans[S.scans.length - 1];

      /* snapshot control-implementation readiness (primary framework, for
         the sparkline overlay, plus every entitled framework so its own
         KPI tile can trend), and the risk/overdue counts driving the other
         Dashboard tiles — so every tile can show a real vs-last-scan delta
         instead of a static number */
      var entitledNow = entitledFrameworks();
      var primaryFw = entitledNow.indexOf('iso27001') > -1 ? 'iso27001' : entitledNow[0];
      var readiness = null;
      var readinessByFw = {};
      entitledNow.forEach(function (fw) {
        var rApp = S.controls.filter(function (c) { return c.fw === fw && c.app; });
        readinessByFw[fw] = rApp.length ? Math.round(rApp.filter(function (c) { return c.st === 'Implemented'; }).length / rApp.length * 100) : 0;
      });
      if (primaryFw) readiness = readinessByFw[primaryFw];
      var critNow = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
      var odNow = S.actions.filter(overdue).length;

      /* re-snapshot if anything a Dashboard tile trends against has moved,
         not just the score — otherwise completing an action or closing a
         risk between two same-day, same-score scans would leave every
         other tile's trend badge silently stuck */
      if (!lastScan || lastScan.date !== today || lastScan.score !== target ||
          lastScan.critRisks !== critNow || lastScan.overdueActions !== odNow) {
        var detail = JSON.stringify({ results: S.lastResults, notes: S.lastNotes, readiness: readiness, readinessByFw: readinessByFw, critRisks: critNow, overdueActions: odNow });
        Store.addScan({ date: today, score: target, detail: detail, readiness: readiness, readinessByFw: readinessByFw, critRisks: critNow, overdueActions: odNow }).catch(warn);
      }
      log('Posture scan completed — score <b>' + target + '</b>. ' + (S.proposed.length ? S.proposed.length + ' finding(s) proposed for the risk register.' : 'No new findings.'));
      Store.saveScanState().catch(warn);
      setTimeout(function () {
        renderProposed(); renderNavCounts(); renderDash();
        if (S.proposed.length) toast('<b>' + S.proposed.length + ' proposed risk' + (S.proposed.length > 1 ? 's' : '') + '</b> awaiting your approval below');
      }, 2600);
    },

    approve: async function (tpl) {
      var t = TPL[tpl];
      var maxR = S.risks.reduce(function (m, r) { var n = parseInt(String(r.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var maxA = S.actions.reduce(function (m, a) { var n = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var rid = 'R-' + String(maxR + 1).padStart(3, '0');
      var owner = (Graph.getAccount() && Graph.getAccount().name) || 'Practitioner';
      var actIds = t.actions.map(function (_, i) { return 'ACT-' + String(maxA + 1 + i).padStart(3, '0'); });
      busy(true);
      try {
        var newRisk = { id: rid, title: t.risk.title, cat: t.risk.cat, src: 'Posture scan', L: t.risk.L, I: t.risk.I, controls: t.risk.controls, owner: owner, status: 'Open', treat: 'Mitigate', actions: actIds, tpl: tpl };
        await Store.addRisk(newRisk);
        for (var i = 0; i < t.actions.length; i++) {
          var a = t.actions[i];
          await Store.addAction({ id: actIds[i], title: a.t, risk: rid, control: a.control, pr: a.pr, owner: owner, due: daysFrom(a.days), status: 'Open', src: 'Posture scan' });
        }
        S.handledTpl.push(tpl);
        S.proposed = S.proposed.filter(function (p) { return p !== tpl; });
        log('Risk <b>' + rid + '</b> approved into register from posture scan, with ' + actIds.length + ' action(s) assigned.');
        toast('<b>' + rid + '</b> added to risk register · ' + actIds.length + ' action(s) created');
      } catch (e) { warn(e); }
      busy(false);
      renderAll();
    },

    dismiss: function (tpl) {
      S.handledTpl.push(tpl);
      S.proposed = S.proposed.filter(function (p) { return p !== tpl; });
      log('Scan finding dismissed by practitioner (' + tpl + ') — recorded with rationale.');
      renderAll();
    },

    complete: async function (id) {
      var a = S.actions.find(function (x) { return x.id === id; });
      var ev = prompt('Evidence note for the audit trail (e.g. "CA policy export saved to Evidence/A.8.5"):', 'Configuration export captured to Evidence library');
      if (ev === null) return;
      a.status = 'Done'; a.evidence = ev;
      var r = risk(a.risk);
      busy(true);
      try {
        await Store.updateAction(a);
        if (r) {
          var q = residual(r);
          var allDone = r.actions.every(function (x) { var y = S.actions.find(function (z) { return z.id === x; }); return y && y.status === 'Done'; });
          if (allDone && r.status !== 'Closed') { r.status = 'Monitored'; }
          else if (r.status === 'Open') { r.status = 'In treatment'; }
          await Store.updateRisk(r);
          log('Action <b>' + id + '</b> completed. Evidence captured. Risk ' + r.id + ' residual now <b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b>.');
          toast('Evidence captured · <b>' + r.id + '</b> residual recalculated to ' + (q.L * q.I) + ' (' + band(q.L * q.I) + ')');
        } else {
          log('Action <b>' + id + '</b> completed. Evidence captured.');
          toast('Evidence captured for <b>' + id + '</b>');
        }
      } catch (e) { warn(e); }
      busy(false);
      renderAll();
    },

    openRisk: function (id) {
      var r = risk(id), q = residual(r);
      var acts = r.actions.map(function (a) { return S.actions.find(function (x) { return x.id === a; }); }).filter(Boolean);
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">×</button>' +
        '<div class="id-t">' + r.id + ' · ' + esc(r.cat) + ' · Source: ' + esc(r.src) + '</div><h2>' + esc(r.title) + '</h2>' +
        '<div class="d-sec"><h4>Scoring</h4><div class="score-pair">' +
        '<div class="score-box"><b style="color:var(--paper-dim)">' + (r.L * r.I) + '</b><span>Inherent — ' + band(r.L * r.I) + '</span></div>' +
        '<div class="score-box" style="border-color:rgba(216,186,120,.4)"><b class="gold-t">' + (q.L * q.I) + '</b><span>Residual — ' + band(q.L * q.I) + '</span></div></div>' +
        '<div class="d-kv"><span>Treatment</span><b>' + r.treat + '</b></div><div class="d-kv"><span>Owner</span><b>' + esc(r.owner) + '</b></div><div class="d-kv"><span>Status</span><b>' + r.status + '</b></div></div>' +
        '<div class="d-sec"><h4>Linked controls (SoA)</h4>' + r.controls.map(function (c) {
          /* risk.controls store bare codes (e.g. "A.5.2"), and different
             frameworks legitimately reuse the same Annex A numbering —
             every risk in this app is ISO 27001-anchored, so prefer that
             framework's control to disambiguate. */
          var ctl = S.controls.find(function (x) { return x.id === c && x.fw === 'iso27001'; }) ||
                    S.controls.find(function (x) { return x.id === c; });
          return '<div class="d-kv"><span>' + c + ' — ' + (ctl ? esc(ctl.t) : '') + '</span><b>' + (ctl ? ctl.st : '') + '</b></div>';
        }).join('') + '</div>' +
        '<div class="d-sec"><h4>Treatment actions</h4>' + (acts.length ? acts.map(function (a) {
          return '<div class="d-kv"><span>' + a.id + ' — ' + esc(a.title) + '</span><b><span class="chip st-' + a.status.replace(/ /g, '') + '">' + a.status + '</span></b></div>';
        }).join('') : '<div class="d-kv"><span>None yet</span></div>') + '</div>' +
        '<div class="d-sec"><h4>Audit trail</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' +
        (Store.kind === 'sharepoint'
          ? 'Every change to this risk is versioned in this tenant\'s SharePoint list history — scoring changes, treatment decisions and evidence links are automatically audit-ready.'
          : 'In a connected tenant, every change is versioned in SharePoint list history — automatically audit-ready.') + '</p></div>';
      document.getElementById('drawer').classList.add('open');
      document.getElementById('overlay').classList.add('open');
    },

    closeDrawer: function () {
      document.getElementById('drawer').classList.remove('open');
      document.getElementById('overlay').classList.remove('open');
    },

    filterRisk: function (f) { window._riskF = f; renderRisks(); },
    filterAct: function (f) { window._actF = f; renderActions(); },
    filterActType: function (t) { window._actTypeF = t; renderActions(); },

    toggleAddAction: function () {
      var panel = document.getElementById('addActionPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        ['naTitle', 'naControl', 'naOwner'].forEach(function (id) { document.getElementById(id).value = ''; });
        document.getElementById('naDue').value = daysFrom(14);
      }
    },

    addManualAction: async function () {
      var title = document.getElementById('naTitle').value.trim();
      if (!title) { toast('Enter a title or finding description first'); return; }
      var maxA = S.actions.reduce(function (m, a) { var n = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var a = {
        id: 'ACT-' + String(maxA + 1).padStart(3, '0'),
        title: title,
        type: document.getElementById('naType').value,
        risk: '',
        control: document.getElementById('naControl').value.trim(),
        pr: document.getElementById('naPriority').value,
        owner: document.getElementById('naOwner').value.trim() || 'Unassigned',
        due: document.getElementById('naDue').value || daysFrom(14),
        status: 'Open',
        evidenceUrl: '',
        src: document.getElementById('naSource').value
      };
      busy(true);
      try {
        await Store.addAction(a);
        log('<b>' + a.id + '</b> (' + esc(a.type) + ') added from ' + esc(a.src) + ': ' + esc(a.title));
        toast('<b>' + a.id + '</b> added');
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddAction();
      renderActions(); renderNavCounts();
    },
    setSoaFw: function (fw) { window._soaFw = fw; renderSoa(); },

    toggleApp: async function (key) {
      var parts = key.split('|'), c = S.controls.find(function (x) { return x.fw === parts[0] && x.id === parts[1]; });
      if (!c) return;
      c.app = !c.app;
      if (!c.app) { c.st = 'Not applicable'; } else if (c.st === 'Not applicable') { c.st = 'Not started'; }
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      renderSoa(); renderDash();
    },

    setSt: async function (key, v) {
      var parts = key.split('|'), c = S.controls.find(function (x) { return x.fw === parts[0] && x.id === parts[1]; });
      if (!c) return;
      if (v === 'Implemented' && !c.evidenceUrl) {
        var proceed = confirm('Marking this Implemented with no linked evidence. Auditors typically require evidence for every implemented control — continue anyway?');
        if (!proceed) { renderSoa(); return; } /* reset the <select> back to the real value */
      }
      c.st = v;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      log('<b>' + c.id + '</b> ' + esc(c.t) + ' → ' + v + '.');
      renderSoa(); renderDash();
    },

    verifyControl: async function (key) {
      var parts = key.split('|'), c = S.controls.find(function (x) { return x.fw === parts[0] && x.id === parts[1]; });
      if (!c) return;
      if (!c.evidenceUrl) {
        var proceed = confirm('This control has no linked evidence. Auditors typically require evidence for every implemented control — verify anyway?');
        if (!proceed) return;
      }
      var attester = (typeof Graph !== 'undefined' && Graph.getAccount() && Graph.getAccount().name) || 'Practitioner';
      c.verified = new Date().toISOString().slice(0, 10);
      c.verifiedBy = attester;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      log('<b>' + c.id + '</b> re-verified as ' + esc(c.st) + ' by <b>' + esc(attester) + '</b>.');
      toast('<b>' + c.id + '</b> verified by ' + esc(attester));
      renderSoa();
    },

    setControlEvidence: async function (key) {
      var parts = key.split('|'), c = S.controls.find(function (x) { return x.fw === parts[0] && x.id === parts[1]; });
      if (!c) return;
      var url = prompt('Link to evidence (SharePoint/OneDrive URL):', c.evidenceUrl || '');
      if (url === null) return;
      url = url.trim();
      if (url && !isSafeUrl(url)) { toast('Evidence link must start with http:// or https://'); return; }
      c.evidenceUrl = url;
      try { await Store.updateControl(c); } catch (e) { warn(e); }
      renderSoa();
    },

    setActionEvidence: async function (id) {
      var a = S.actions.find(function (x) { return x.id === id; });
      if (!a) return;
      var url = prompt('Link to evidence (SharePoint/OneDrive URL):', a.evidenceUrl || '');
      if (url === null) return;
      url = url.trim();
      if (url && !isSafeUrl(url)) { toast('Evidence link must start with http:// or https://'); return; }
      a.evidenceUrl = url;
      try { await Store.updateAction(a); } catch (e) { warn(e); }
      renderActions();
    },

    uploadDocument: async function () {
      var input = document.getElementById('docFileInput');
      var file = input.files && input.files[0];
      if (!file) { toast('Choose a file first'); return; }
      var category = document.getElementById('docCategory').value || 'Other';
      busy(true);
      try {
        await Store.uploadDocument(file, category);
        log('Document uploaded to <b>' + esc(category) + '</b>: <b>' + esc(file.name) + '</b>.');
        toast('<b>' + esc(file.name) + '</b> uploaded');
        input.value = '';
      } catch (e) { warn(e); }
      busy(false);
      renderDocuments();
    },

    filterDocCat: function (c) { window._docCatF = c; renderDocuments(); },

    emailStatusUpdate: async function () {
      if (Store.kind === 'demo') { toast('Sending email isn\'t available in demo mode — sign in to a real tenant to use this.'); return; }
      var to = prompt('Send status update to (comma-separated email addresses):');
      if (!to || !to.trim()) return;
      busy(true);
      try {
        var last = S.scans[S.scans.length - 1];
        var entitled = entitledFrameworks();
        var primaryFw = entitled.indexOf('iso27001') > -1 ? 'iso27001' : entitled[0];
        var pApp = primaryFw ? S.controls.filter(function (c) { return c.fw === primaryFw && c.app; }) : [];
        var implCount = pApp.filter(function (c) { return c.st === 'Implemented'; }).length;
        var readyPct = pApp.length ? Math.round(implCount / pApp.length * 100) : 0;
        var crit = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
        var od = S.actions.filter(overdue).length;
        var topRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; }).slice()
          .sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 3);
        var nextAudit = (S.audits || []).filter(function (a) { return a.status === 'Planned'; }).sort(function (a, b) { return (a.planned || '').localeCompare(b.planned || ''); })[0];
        var lastReview = (S.reviews || [])[S.reviews.length - 1];
        var upcomingCal = (S.calendar || []).filter(function (c) { return c.status !== 'Done'; }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); })[0];
        var clientLabel = document.getElementById('clientName').textContent;
        var today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

        var body = '<div style="font-family:Arial,sans-serif;color:#222;max-width:600px">' +
          '<h2 style="margin-bottom:4px">Checkpoint status update — ' + esc(clientLabel) + '</h2>' +
          '<p style="color:#666;font-size:12px;margin-top:0">' + today + '</p>' +
          '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">' +
          '<tr><td style="padding:8px;border:1px solid #ddd"><b>Posture score</b></td><td style="padding:8px;border:1px solid #ddd">' + (last ? last.score + '/100' : 'No scan yet') + '</td></tr>' +
          '<tr><td style="padding:8px;border:1px solid #ddd"><b>' + (primaryFw ? esc(fwName(primaryFw)) : 'Framework') + ' readiness</b></td><td style="padding:8px;border:1px solid #ddd">' + readyPct + '%</td></tr>' +
          '<tr><td style="padding:8px;border:1px solid #ddd"><b>High/critical risks</b></td><td style="padding:8px;border:1px solid #ddd">' + crit + '</td></tr>' +
          '<tr><td style="padding:8px;border:1px solid #ddd"><b>Overdue actions</b></td><td style="padding:8px;border:1px solid #ddd">' + od + '</td></tr>' +
          '</table>' +
          '<h3 style="font-size:14px">Top risks</h3><ul style="font-size:13px">' + (topRisks.length ? topRisks.map(function (r) { var q = residual(r); return '<li>' + esc(r.title) + ' — <b>' + band(q.L * q.I) + '</b></li>'; }).join('') : '<li>No open risks</li>') + '</ul>' +
          '<h3 style="font-size:14px">Upcoming milestones</h3><ul style="font-size:13px">' +
          '<li>Next internal audit: ' + (nextAudit ? fmtDate(nextAudit.planned) + ' — ' + esc(nextAudit.scope) : 'None scheduled') + '</li>' +
          '<li>Next management review: ' + (lastReview && lastReview.nextDue ? fmtDate(lastReview.nextDue) : 'Not set') + '</li>' +
          '<li>Next ISMS activity: ' + (upcomingCal ? fmtDate(upcomingCal.nextDue) + ' — ' + esc(upcomingCal.title) : 'None scheduled') + '</li>' +
          '</ul>' +
          '<p style="color:#999;font-size:11px;margin-top:24px">Sent from Checkpoint by Compliance365.</p>' +
          '</div>';

        await Graph.sendMail(to.trim(), 'Checkpoint status update — ' + clientLabel, body);
        log('Status update emailed to <b>' + esc(to.trim()) + '</b>.');
        toast('Status update sent to <b>' + esc(to.trim()) + '</b>');
      } catch (e) { warn(e); }
      busy(false);
    },

    toggleAddAudit: function () {
      var panel = document.getElementById('addAuditPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        document.getElementById('naAuditScope').value = '';
        document.getElementById('naAuditAuditor').value = '';
        document.getElementById('naAuditDate').value = daysFrom(30);
      }
    },

    addAudit: async function () {
      var scope = document.getElementById('naAuditScope').value.trim();
      if (!scope) { toast('Enter a scope first'); return; }
      var maxA = (S.audits || []).reduce(function (m, a) { var n = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var a = {
        id: 'AUD-' + String(maxA + 1).padStart(3, '0'),
        fw: document.getElementById('naAuditFw').value,
        scope: scope,
        auditor: document.getElementById('naAuditAuditor').value.trim() || 'Unassigned',
        planned: document.getElementById('naAuditDate').value || daysFrom(30),
        completed: '', status: 'Planned', summary: '', findingRefs: []
      };
      busy(true);
      try {
        await Store.addAudit(a);
        log('<b>' + a.id + '</b> internal audit scheduled: ' + esc(a.scope) + ' (' + fmtDate(a.planned) + ').');
        toast('<b>' + a.id + '</b> scheduled');
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddAudit();
      renderAudits(); renderNavCounts();
    },

    completeAudit: async function (id) {
      var a = (S.audits || []).find(function (x) { return x.id === id; });
      if (!a) return;
      var summary = prompt('Audit outcome / findings summary:', a.summary || '');
      if (summary === null) return;
      var refs = prompt('Action/finding IDs raised from this audit, comma-separated (optional — add them in the Actions register first, source "Internal audit"):', (a.findingRefs || []).join(', '));
      a.summary = summary.trim();
      a.findingRefs = refs ? refs.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
      a.completed = new Date().toISOString().slice(0, 10);
      a.status = 'Completed';
      try { await Store.updateAudit(a); } catch (e) { warn(e); }
      log('<b>' + a.id + '</b> internal audit completed.' + (a.findingRefs.length ? ' Findings: ' + esc(a.findingRefs.join(', ')) + '.' : ''));
      toast('<b>' + a.id + '</b> marked complete');
      renderAudits(); renderNavCounts(); renderDash();
    },

    openAudit: function (id) {
      var a = (S.audits || []).find(function (x) { return x.id === id; });
      if (!a) return;
      var refActions = (a.findingRefs || []).map(function (ref) { return S.actions.find(function (x) { return x.id === ref; }); }).filter(Boolean);
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">×</button>' +
        '<div class="id-t">' + a.id + ' · ' + esc(fwName(a.fw)) + '</div><h2>' + esc(a.scope) + '</h2>' +
        '<div class="d-sec"><h4>Details</h4>' +
        '<div class="d-kv"><span>Auditor</span><b>' + esc(a.auditor) + '</b></div>' +
        '<div class="d-kv"><span>Planned</span><b>' + fmtDate(a.planned) + '</b></div>' +
        '<div class="d-kv"><span>Status</span><b>' + a.status + '</b></div>' +
        (a.completed ? '<div class="d-kv"><span>Completed</span><b>' + fmtDate(a.completed) + '</b></div>' : '') + '</div>' +
        (a.summary ? '<div class="d-sec"><h4>Outcome</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + esc(a.summary) + '</p></div>' : '') +
        '<div class="d-sec"><h4>Findings raised</h4>' + (refActions.length ? refActions.map(function (x) {
          return '<div class="d-kv"><span>' + x.id + ' — ' + esc(x.title) + '</span><b><span class="chip ' + typeCls(x.type || 'Action') + '">' + esc(x.type || 'Action') + '</span></b></div>';
        }).join('') : '<div class="d-kv"><span>None</span></div>') + '</div>';
      document.getElementById('drawer').classList.add('open');
      document.getElementById('overlay').classList.add('open');
    },

    toggleAddReview: function () {
      var panel = document.getElementById('addReviewPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        document.getElementById('naReviewDate').value = new Date().toISOString().slice(0, 10);
        document.getElementById('naReviewNextDue').value = daysFrom(90);
        document.getElementById('naReviewAttendees').value = '';
        document.getElementById('naReviewDecisions').value = '';
        document.getElementById('naReviewInputs').value = App.snapshotInputs();
      }
    },

    snapshotInputs: function () {
      var last = S.scans[S.scans.length - 1];
      var openActs = S.actions.filter(function (a) { return a.status !== 'Done'; });
      var od = S.actions.filter(overdue).length;
      var crit = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
      var openNCs = S.actions.filter(function (a) { return a.status !== 'Done' && a.type && a.type.indexOf('Non-conformity') === 0; }).length;
      var primaryFw = entitledFrameworks().indexOf('iso27001') > -1 ? 'iso27001' : entitledFrameworks()[0];
      var readiness = '';
      if (primaryFw) {
        var pApp = S.controls.filter(function (c) { return c.fw === primaryFw && c.app; });
        var pImpl = pApp.filter(function (c) { return c.st === 'Implemented'; }).length;
        readiness = (pApp.length ? Math.round(pImpl / pApp.length * 100) : 0) + '% ' + fwName(primaryFw) + ' control readiness.';
      }
      var lastAuditRec = (S.audits || []).filter(function (a) { return a.status === 'Completed'; }).sort(function (a, b) { return (b.completed || '').localeCompare(a.completed || ''); })[0];
      return 'Posture score: ' + (last ? last.score + '/100' : 'no scan run') + '. ' +
        openActs.length + ' open action(s), ' + od + ' overdue. ' +
        crit + ' High/Critical residual risk(s) open. ' +
        openNCs + ' open non-conformit' + (openNCs === 1 ? 'y' : 'ies') + '. ' +
        readiness +
        (lastAuditRec ? ' Last internal audit ' + fmtDate(lastAuditRec.completed) + ' (' + esc(lastAuditRec.scope) + ').' : ' No internal audit on record.');
    },

    recordReview: async function () {
      var attendees = document.getElementById('naReviewAttendees').value.trim();
      if (!attendees) { toast('Enter attendees first'); return; }
      var maxR = (S.reviews || []).reduce(function (m, r) { var n = parseInt(String(r.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var r = {
        id: 'MR-' + String(maxR + 1).padStart(3, '0'),
        date: document.getElementById('naReviewDate').value || new Date().toISOString().slice(0, 10),
        attendees: attendees,
        inputs: document.getElementById('naReviewInputs').value,
        decisions: document.getElementById('naReviewDecisions').value.trim(),
        nextDue: document.getElementById('naReviewNextDue').value || ''
      };
      busy(true);
      try {
        await Store.addReview(r);
        log('<b>' + r.id + '</b> management review recorded (' + fmtDate(r.date) + ').');
        toast('<b>' + r.id + '</b> saved');
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddReview();
      renderReviews(); renderNavCounts(); renderDash();
    },

    openReview: function (id) {
      var r = (S.reviews || []).find(function (x) { return x.id === id; });
      if (!r) return;
      document.getElementById('drawer').innerHTML =
        '<button class="x" data-action="App.closeDrawer">×</button>' +
        '<div class="id-t">' + r.id + '</div><h2>Management review — ' + fmtDate(r.date) + '</h2>' +
        '<div class="d-sec"><h4>Attendees</h4><p style="font-size:12px;color:var(--paper-dim)">' + esc(r.attendees) + '</p></div>' +
        '<div class="d-sec"><h4>Inputs at time of review</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + esc(r.inputs) + '</p></div>' +
        '<div class="d-sec"><h4>Decisions & actions agreed</h4><p style="font-size:12px;color:var(--paper-dim);line-height:1.7">' + (r.decisions ? esc(r.decisions) : 'None recorded') + '</p></div>' +
        '<div class="d-sec"><h4>Next review due</h4><p style="font-size:12px;color:var(--paper-dim)">' + (r.nextDue ? fmtDate(r.nextDue) : 'Not set') + '</p></div>';
      document.getElementById('drawer').classList.add('open');
      document.getElementById('overlay').classList.add('open');
    },

    toggleAddCalItem: function () {
      var panel = document.getElementById('addCalPanel');
      var showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) {
        document.getElementById('naCalTitle').value = '';
        document.getElementById('naCalOwner').value = '';
        document.getElementById('naCalNextDue').value = daysFrom(30);
      }
    },

    addCalItem: async function () {
      var title = document.getElementById('naCalTitle').value.trim();
      if (!title) { toast('Enter an activity title first'); return; }
      var maxC = (S.calendar || []).reduce(function (m, c) { var n = parseInt(String(c.id).replace(/\D/g, ''), 10) || 0; return Math.max(m, n); }, 0);
      var c = {
        id: 'CAL-' + String(maxC + 1).padStart(3, '0'),
        title: title,
        category: document.getElementById('naCalCategory').value,
        freq: document.getElementById('naCalFreq').value,
        nextDue: document.getElementById('naCalNextDue').value || daysFrom(30),
        lastCompleted: '', owner: document.getElementById('naCalOwner').value.trim() || 'Unassigned',
        notes: '', status: 'Active'
      };
      busy(true);
      try {
        await Store.addCalendarItem(c);
        log('<b>' + c.id + '</b> added to the compliance calendar: ' + esc(c.title) + '.');
        toast('<b>' + c.id + '</b> added');
      } catch (e) { warn(e); }
      busy(false);
      App.toggleAddCalItem();
      renderCalendar(); renderNavCounts();
    },

    completeCalItem: async function (id) {
      var c = (S.calendar || []).find(function (x) { return x.id === id; });
      if (!c) return;
      c.lastCompleted = new Date().toISOString().slice(0, 10);
      var advanceDays = { Annual: 365, Biannual: 182, Quarterly: 91, Monthly: 30 }[c.freq];
      if (advanceDays) {
        c.nextDue = daysFrom(advanceDays);
      } else {
        c.status = 'Done';
      }
      try { await Store.updateCalendarItem(c); } catch (e) { warn(e); }
      log('<b>' + c.id + '</b> completed: ' + esc(c.title) + (advanceDays ? '. Next due ' + fmtDate(c.nextDue) + '.' : ' (one-off — marked done).'));
      toast('<b>' + c.id + '</b> marked complete');
      renderCalendar(); renderNavCounts(); renderDash();
    },

    setRiskAppetite: async function (level) {
      S.settings.riskAppetite = level;
      try { await Store.setSetting('riskAppetite', level); } catch (e) { warn(e); }
      log('Risk appetite set to <b>' + esc(level) + '</b>.');
      toast('Risk appetite set to <b>' + esc(level) + '</b>');
      renderDash(); renderFrameworksAdmin();
    },

    setScanCadence: async function (days) {
      S.settings.scanCadenceDays = days;
      try { await Store.setSetting('scanCadenceDays', days); } catch (e) { warn(e); }
      toast('Scan reminder set to every <b>' + esc(days) + '</b> days');
      renderDash();
    },

    toggleFeature: async function (key) {
      var next = !featureOn(key);
      var value = next ? 'true' : 'false';
      S.settings[key] = value;
      try { await Store.setSetting(key, value); } catch (e) { warn(e); }
      var label = (window.FEATURE_DEFS.find(function (f) { return f.key === key; }) || {}).label || key;
      toast('<b>' + esc(label) + '</b> ' + (next ? 'enabled' : 'disabled'));
      renderFrameworksAdmin(); renderDash(); renderFeatureVisibility();
    },

    toggleEntitlement: async function (fw) {
      var next = !(S.entitlements && S.entitlements[fw]);
      busy(true);
      try {
        await Store.setEntitlement(fw, next);
        log(next ? '<b>' + esc(fwName(fw)) + '</b> activated — control set now available in the Statement of Applicability.'
                  : '<b>' + esc(fwName(fw)) + '</b> deactivated.');
        toast(next ? '<b>' + esc(fwName(fw)) + '</b> enabled' : '<b>' + esc(fwName(fw)) + '</b> disabled');
      } catch (e) { warn(e); }
      busy(false);
      if (!window._soaFw || !S.entitlements[window._soaFw]) window._soaFw = entitledFrameworks()[0];
      renderFrameworksAdmin(); renderDash(); renderSoa();
    },

    reset: async function () {
      if (Store.kind !== 'demo') { toast('Reset is available in demo mode only — client data is never bulk-deleted from the console.'); return; }
      if (confirm('Reset all demo data?')) {
        S = await Store.reset();
        window._riskF = 'All'; window._actF = 'Open'; window._actTypeF = 'All';
        renderAll(); renderGaugeFromLast(); toast('Demo data reset');
      }
    },

    signIn: async function () {
      /* Graph.signIn() navigates the whole page to Entra's sign-in screen
         and doesn't meaningfully return — the continuation happens in
         this file's bottom init() IIFE, on the page load Entra redirects
         back to (handleRedirectPromise() picks the account back up there,
         then calls startLive() itself, same as the "returning session"
         path already below). */
      try {
        busy(true);
        await Graph.signIn();
      } catch (e) {
        busy(false);
        if (e.errorCode !== 'user_cancelled') toast('<b>Sign-in failed:</b> ' + esc(e.message || e));
      }
    },

    signOut: function () { Graph.signOut(); },

    startDemo: async function () {
      Store = window.DemoStore;
      S = await Store.load();
      bootUi('Demo mode — sample data, stored only in this browser', S.client);
    },

    report: function (type) {
      var activeFw = window._soaFw || entitledFrameworks()[0] || 'iso27001';
      var fwLabel = fwName(activeFw);
      var fwControls = S.controls.filter(function (c) { return c.fw === activeFw; });
      var app = fwControls.filter(function (c) { return c.app; });
      var impl = app.filter(function (c) { return c.st === 'Implemented'; }).length;
      var today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
      var clientLabel = document.getElementById('clientName').textContent;
      var head = '<div class="mast"><div class="lk"><svg width="30" height="30" viewBox="0 0 200 200" fill="none"><path d="M176.2,56 A88,88 0 1,0 176.2,144" stroke="#0B0B0C" stroke-width="16" stroke-linecap="round"/><circle cx="188" cy="100" r="14" fill="#A9812E"/></svg><span class="w1">COMPLIANCE</span><span class="w2">365</span></div><div class="mr">Checkpoint · Generated ' + today + '<br>' + esc(clientLabel) + '</div></div>';
      var body = '', title = '';
      if (type === 'soa') {
        title = 'Statement of Applicability — ' + fwLabel;
        body = '<p class="intro">Controls assessed for applicability with implementation status and cross-framework mapping. Justifications recorded for all exclusions. Evidence references resolve to the tenant Evidence library.</p><table><tr><th>Control</th><th>Title</th><th>Applicable</th><th>Status</th><th>Also satisfies</th></tr>' +
          fwControls.map(function (c) { return '<tr><td class="idc">' + c.id + '</td><td>' + esc(c.t) + (c.just ? '<div class="just">Exclusion justification: ' + esc(c.just) + '</div>' : '') + '</td><td>' + (c.app ? 'Yes' : 'No') + '</td><td>' + c.st + '</td><td>' + esc(c.map) + '</td></tr>'; }).join('') + '</table>';
      }
      if (type === 'risk') {
        title = 'Risk Register Snapshot';
        body = '<p class="intro">' + S.risks.length + ' risks under management. Residual scores computed from completed treatment actions as at report date.</p><table><tr><th>ID</th><th>Risk</th><th>Category</th><th>Inherent</th><th>Residual</th><th>Treatment</th><th>Owner</th><th>Status</th></tr>' +
          S.risks.map(function (r) { var q = residual(r); return '<tr><td class="idc">' + r.id + '</td><td>' + esc(r.title) + '</td><td>' + esc(r.cat) + '</td><td>' + (r.L * r.I) + ' — ' + band(r.L * r.I) + '</td><td><b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b></td><td>' + r.treat + '</td><td>' + esc(r.owner) + '</td><td>' + r.status + '</td></tr>'; }).join('') + '</table>';
      }
      if (type === 'ready') {
        var od = S.actions.filter(overdue).length;
        var openRisks = S.risks.filter(function (r) { return r.status !== 'Closed'; });
        var crit = openRisks.filter(function (r) { var q = residual(r); return (q.L * q.I) >= 10; }).length;
        var lastScan = S.scans[S.scans.length - 1];
        var applicableCount = app.length;
        var pct = applicableCount ? Math.round(impl / applicableCount * 100) : 0;
        var notImpl = fwControls.filter(function (c) { return c.app && c.st !== 'Implemented'; });
        var practitioner = (typeof Graph !== 'undefined' && Graph.getAccount() && Graph.getAccount().name) || 'Practitioner';

        var readinessBand = pct >= 90 ? 'Certification-ready' : pct >= 70 ? 'On track — minor gaps remain' : pct >= 50 ? 'Material gaps — a remediation plan is required before audit' : 'Significant uplift required before audit can be scheduled';

        /* per-theme breakdown — only ISO 27001's control codes carry a
           natural theme prefix (A.5 Organizational / A.6 People /
           A.7 Physical / A.8 Technological) */
        var themedHtml = '';
        if (activeFw === 'iso27001') {
          var THEMES = [['A.5', 'Organizational controls'], ['A.6', 'People controls'], ['A.7', 'Physical controls'], ['A.8', 'Technological controls']];
          themedHtml = '<h2>Control implementation by theme</h2><table><tr><th>Theme</th><th>Applicable</th><th>Implemented</th><th>%</th></tr>' +
            THEMES.map(function (t) {
              var group = fwControls.filter(function (c) { return c.id.indexOf(t[0] + '.') === 0; });
              var gApp = group.filter(function (c) { return c.app; });
              var gImpl = gApp.filter(function (c) { return c.st === 'Implemented'; }).length;
              var gPct = gApp.length ? Math.round(gImpl / gApp.length * 100) : 0;
              return '<tr><td>' + t[1] + '</td><td>' + gApp.length + '</td><td>' + gImpl + '</td><td><b>' + gPct + '%</b></td></tr>';
            }).join('') + '</table>';
        }

        var gapsHtml = notImpl.length
          ? '<h2>Open control gaps (' + notImpl.length + ')</h2><table><tr><th>Control</th><th>Title</th><th>Status</th></tr>' +
            notImpl.map(function (c) { return '<tr><td class="idc">' + c.id + '</td><td>' + esc(c.t) + '</td><td>' + c.st + '</td></tr>'; }).join('') + '</table>'
          : '<h2>Open control gaps</h2><p class="intro">None — every applicable control is marked Implemented.</p>';

        /* the honesty gap: self-reported "Implemented" with no evidence
           on file is exactly what an auditor will challenge first */
        var unevidenced = app.filter(function (c) { return c.st === 'Implemented' && !c.evidenceUrl; });
        var unevidencedHtml = unevidenced.length
          ? '<h2>Implemented without linked evidence (' + unevidenced.length + ')</h2><p class="intro">Self-reported as Implemented, but no evidence document is linked. This is the first thing a certification auditor will test — attach evidence or downgrade the status before audit.</p><table><tr><th>Control</th><th>Title</th></tr>' +
            unevidenced.map(function (c) { return '<tr><td class="idc">' + c.id + '</td><td>' + esc(c.t) + '</td></tr>'; }).join('') + '</table>'
          : '';

        var topRisks = openRisks.slice().sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 5);
        var riskHtml = '<h2>Risk register position</h2><p class="intro">' + openRisks.length + ' risk(s) under active management' + (crit ? ', ' + crit + ' scoring High or Critical residual' : '') + '.</p>' +
          (topRisks.length ? '<table><tr><th>ID</th><th>Risk</th><th>Residual</th><th>Owner</th><th>Status</th></tr>' +
            topRisks.map(function (r) { var q = residual(r); return '<tr><td class="idc">' + r.id + '</td><td>' + esc(r.title) + '</td><td><b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b></td><td>' + esc(r.owner) + '</td><td>' + r.status + '</td></tr>'; }).join('') + '</table>' : '');

        var openNCs = S.actions.filter(function (a) { return a.status !== 'Done' && a.type && a.type.indexOf('Non-conformity') === 0; });
        var recs = [];
        if (notImpl.length) recs.push('Close the ' + notImpl.length + ' open control gap' + (notImpl.length > 1 ? 's' : '') + ' listed above before scheduling the certification audit.');
        if (unevidenced.length) recs.push('Attach evidence for the ' + unevidenced.length + ' control' + (unevidenced.length > 1 ? 's' : '') + ' marked Implemented without it — self-reported status alone will not satisfy an auditor.');
        if (openNCs.length) recs.push('Close out the ' + openNCs.length + ' open non-conformit' + (openNCs.length > 1 ? 'ies' : 'y') + ' in the Actions register before the next surveillance audit.');
        if (crit) recs.push('Treat the ' + crit + ' open High/Critical residual risk' + (crit > 1 ? 's' : '') + ' — auditors will ask for documented risk-acceptance sign-off on anything left at Medium or above.');
        if (od) recs.push('Clear the ' + od + ' overdue action' + (od > 1 ? 's' : '') + ' — auditors read overdue remediation as a control-effectiveness concern, not just a project-management one.');
        recs.push('Generate the Management Review Pack each quarter to keep the management-review requirement satisfied continuously, not assembled the week before audit.');
        var recsHtml = '<h2>Recommendations</h2><ul>' + recs.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>';

        title = 'Audit Readiness Report — ' + fwLabel;
        body = '<h2>Executive summary</h2><p class="intro"><b>' + readinessBand + '.</b> ' + pct + '% of ' + applicableCount + ' applicable ' + fwLabel + ' controls are implemented (' + impl + '/' + applicableCount + '). ' +
          crit + ' high/critical residual risk' + (crit === 1 ? '' : 's') + ' remain open, with ' + od + ' overdue action' + (od === 1 ? '' : 's') + ' against the remediation plan. Latest posture scan scored ' + (lastScan ? lastScan.score + '/100' : 'not yet run') + '.</p>' +
          '<div class="stats"><div><b>' + pct + '%</b><span>Controls implemented (' + impl + '/' + applicableCount + ')</span></div><div><b>' + crit + '</b><span>High/critical residual risks open</span></div><div><b>' + od + '</b><span>Overdue actions</span></div><div><b>' + (lastScan ? lastScan.score + '/100' : '—') + '</b><span>Latest posture score</span></div></div>' +
          themedHtml + gapsHtml + unevidencedHtml + riskHtml +
          '<h2>What the auditor will ask</h2><ul>' +
          fwControls.filter(function (c) { return !c.app && c.just; }).map(function (c) {
            return '<li>Exclusion justification for ' + c.id + ' (' + esc(c.t) + ') — recorded: ' + esc(c.just) + '</li>';
          }).join('') +
          '<li>Evidence of management review — generate the Management Review Pack quarterly to satisfy this directly.</li>' +
          (activeFw === 'iso27001' ? '<li>Restore-test evidence for A.8.13 — ' + (S.actions.find(function (a) { return a.control === 'A.8.13' && a.status !== 'Done'; }) ? '⚠ open action outstanding' : '✓ no open actions') + '.</li>' : '') +
          '<li>Residual-risk acceptance sign-off for all risks scoring Medium+ after treatment.</li></ul>' +
          recsHtml +
          '<h2>Sign-off</h2><div class="stats"><div><b style="font-size:15px">' + esc(practitioner) + '</b><span>Prepared by</span></div><div><b style="font-size:15px">' + today + '</b><span>Report date</span></div><div><b style="font-size:15px">' + esc(clientLabel) + '</b><span>Client</span></div></div>';
      }
      if (type === 'exec') {
        var lastSc = S.scans[S.scans.length - 1];
        var prevSc = S.scans[S.scans.length - 2];
        var trendArrow = (lastSc && prevSc) ? (lastSc.score > prevSc.score ? '▲' : lastSc.score < prevSc.score ? '▼' : '—') : '';
        var trendColor = (lastSc && prevSc && lastSc.score > prevSc.score) ? '#2e7d32' : (lastSc && prevSc && lastSc.score < prevSc.score) ? '#b91c1c' : '#6b675e';
        var pctExec = app.length ? Math.round(impl / app.length * 100) : 0;
        var critExec = S.risks.filter(function (r) { if (r.status === 'Closed') return false; var q = residual(r); return band(q.L * q.I) === 'Critical' || band(q.L * q.I) === 'High'; }).length;
        var topRisks3 = S.risks.filter(function (r) { return r.status !== 'Closed'; }).slice().sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 3);
        var entitledExec = entitledFrameworks();
        var nextPhase = 'Certify';
        (function () {
          var iPct = app.length ? Math.round(impl / app.length * 100) : 0;
          var ePct = app.length ? Math.round(app.filter(function (c) { return c.st === 'Implemented' && (c.verified || c.evidenceUrl); }).length / app.length * 100) : 0;
          nextPhase = iPct < 100 ? 'Implement (' + iPct + '% complete)' : ePct < 100 ? 'Evidence (' + ePct + '% complete)' : 'Certify — ready for external audit';
        })();
        title = 'Executive Summary — ' + fwLabel;
        body = '<div class="stats" style="margin-top:0"><div><b style="font-size:34px">' + (lastSc ? lastSc.score : '—') + '</b><span>Posture score' + (trendArrow ? ' <span style="color:' + trendColor + '">' + trendArrow + '</span>' : '') + '</span></div><div><b style="font-size:34px">' + pctExec + '%</b><span>Controls implemented</span></div><div><b style="font-size:34px">' + critExec + '</b><span>High/critical risks open</span></div></div>' +
          '<h2>Next milestone</h2><p class="intro" style="font-size:15px">' + esc(nextPhase) + '</p>' +
          '<h2>Top risks</h2>' + (topRisks3.length ? '<table><tr><th>Risk</th><th>Residual</th><th>Owner</th></tr>' +
            topRisks3.map(function (r) { var q = residual(r); return '<tr><td>' + esc(r.title) + '</td><td><b>' + band(q.L * q.I) + '</b></td><td>' + esc(r.owner) + '</td></tr>'; }).join('') + '</table>'
            : '<p class="intro">No open risks.</p>') +
          '<h2>Frameworks in scope</h2><p class="intro">' + entitledExec.map(fwName).join(', ') + '</p>';
      }
      if (type === 'mgmt') {
        title = 'Management Review Pack — ' + fwLabel + (activeFw === 'iso27001' ? ' Clause 9.3' : '');
        var doneQ = S.actions.filter(function (a) { return a.status === 'Done'; }).length;
        var lastS = S.scans[S.scans.length - 1];
        body = '<p class="intro">Prepared for the quarterly management review. Inputs per clause 9.3.2; minutes and decisions to be appended as the record of review.</p>' +
          '<div class="stats"><div><b>' + (lastS ? lastS.score : '—') + '</b><span>Posture score (trend: ' + (S.scans.map(function (s) { return s.score; }).join(' → ') || 'no scans') + ')</span></div><div><b>' + doneQ + '/' + S.actions.length + '</b><span>Actions completed</span></div><div><b>' + (app.length ? Math.round(impl / app.length * 100) : 0) + '%</b><span>Control implementation</span></div></div>' +
          '<h2>Top residual risks</h2><table><tr><th>ID</th><th>Risk</th><th>Residual</th><th>Owner</th></tr>' +
          S.risks.slice().sort(function (a, b) { var qa = residual(a), qb = residual(b); return (qb.L * qb.I) - (qa.L * qa.I); }).slice(0, 5).map(function (r) { var q = residual(r); return '<tr><td class="idc">' + r.id + '</td><td>' + esc(r.title) + '</td><td><b>' + (q.L * q.I) + ' — ' + band(q.L * q.I) + '</b></td><td>' + esc(r.owner) + '</td></tr>'; }).join('') + '</table>' +
          '<h2>Recommendations</h2><ul><li>Close open identity-related scan findings before the surveillance window.</li><li>Schedule the A.8.13 restore test; evidence auto-captures on completion.</li><li>Confirm risk acceptance for residual Medium risks with the executive sponsor.</li></ul>';
      }
      var w = window.open('', '_blank', 'noopener');
      w.document.write('<!DOCTYPE html><html><head><title>' + title + '</title><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet"><style>' +
        'body{font-family:Manrope,sans-serif;background:#FAF7F1;color:#0B0B0C;padding:48px;max-width:900px;margin:0 auto;font-size:13px;line-height:1.6}' +
        '.mast{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0B0B0C;padding-bottom:18px;margin-bottom:8px}' +
        '.lk{display:flex;align-items:center;gap:10px}.w1{font-weight:300;letter-spacing:.13em}.w2{font-weight:800;color:#A9812E}' +
        '.mr{text-align:right;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6b675e}' +
        'h1{font-family:Fraunces,serif;font-weight:500;font-size:30px;margin:26px 0 4px}h2{font-family:Fraunces,serif;font-weight:500;font-size:19px;margin:30px 0 12px}' +
        '.gr{width:26px;height:1px;background:#A9812E;margin:14px 0 18px}' +
        '.intro{color:#4b473e;max-width:70ch}' +
        'table{width:100%;border-collapse:collapse;margin-top:18px}th{font-size:9px;letter-spacing:.16em;text-transform:uppercase;text-align:left;padding:9px 10px;border-bottom:1px solid #0B0B0C;color:#6b675e}' +
        'td{padding:10px;border-bottom:1px solid rgba(11,11,12,.12);vertical-align:top}.idc{font-weight:800;font-size:11px;white-space:nowrap}' +
        '.just{font-size:11px;color:#6b675e;font-style:italic;margin-top:4px}' +
        '.stats{display:flex;gap:0;border-top:1px solid rgba(11,11,12,.2);border-bottom:1px solid rgba(11,11,12,.2);margin:20px 0}' +
        '.stats div{flex:1;padding:16px;border-right:1px solid rgba(11,11,12,.12)}.stats div:last-child{border-right:none}' +
        '.stats b{display:block;font-size:26px;font-weight:800;color:#A9812E}.stats span{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6b675e}' +
        'ul{margin:10px 0 0 18px}li{margin-bottom:8px}' +
        '.pf{margin-top:40px;padding-top:14px;border-top:1px solid rgba(11,11,12,.2);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8b877d;display:flex;justify-content:space-between}' +
        '@media print{.noprint{display:none}}' +
        '</style></head><body>' + head + '<h1>' + title + '</h1><div class="gr"></div>' + body +
        '<div class="pf"><span>Compliance365 — Checkpoint</span><span>Generated from live tenant data · ' + today + '</span></div>' +
        '<p class="noprint" style="margin-top:24px"><button onclick="window.print()" style="background:#A9812E;color:#fff;border:none;padding:12px 24px;border-radius:3px;font-family:Manrope;font-weight:700;letter-spacing:.05em;cursor:pointer">PRINT / SAVE AS PDF</button></p></body></html>');
      w.document.close();
      log('Generated report: <b>' + title + '</b>.');
      renderDash();
    }
  };

  /* ================= boot ================= */
  function bootUi(modeLabel, clientLabel) {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('appShell').style.display = 'grid';
    document.getElementById('modeChip').textContent = Store.kind === 'demo' ? 'Demo' : 'Live';
    document.getElementById('modeChip').className = 'chip ' + (Store.kind === 'demo' ? 'st-Intreatment' : 'st-Implemented');
    document.getElementById('clientName').textContent = clientLabel || 'Connected tenant';
    document.getElementById('modeNote').textContent = modeLabel;
    document.getElementById('btnReset').style.display = Store.kind === 'demo' ? '' : 'none';
    document.getElementById('btnSignOut').style.display = Store.kind === 'sharepoint' ? '' : 'none';
    window._riskF = 'All'; window._actF = 'Open'; window._actTypeF = 'All';
    renderAll();
    renderGaugeFromLast();
    busy(false);
  }

  async function startLive() {
    Store = window.SpStore;
    busy(true);
    var status = document.getElementById('busyMsg');
    S = await Store.load(function (m) { if (status) status.textContent = m; });
    var name = await Graph.tenantName();
    S.client = name || (Graph.getAccount() && Graph.getAccount().username) || 'Connected tenant';
    bootUi('Live — records stored as SharePoint lists in this tenant', S.client);
  }

  document.querySelectorAll('.nav-item').forEach(function (n) {
    n.addEventListener('click', function () { App.go(n.dataset.v); });
  });

  /* ================= event delegation =================
     No inline on*="" attributes anywhere in this app's markup — needed
     to run script-src without 'unsafe-inline' in the CSP. Dynamically
     rendered rows/cards carry data-action (+ optionally data-id)
     instead of onclick="..."; these listeners resolve the dotted path
     to the same App.foo()/Portfolio.foo() functions the markup used to call
     directly, so every render function's call sites are unchanged in
     spirit — only how the call gets wired up changed. */
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

  /* mousedown, not click — search results must select before the
     search input's blur handler closes the results dropdown */
  document.addEventListener('mousedown', function (e) {
    var el = e.target.closest('[data-mousedown-action]');
    if (!el) return;
    var fn = resolvePath(el.dataset.mousedownAction);
    if (fn) fn(el.dataset.id);
  });

  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change-action]');
    if (!el) return;
    var fn = resolvePath(el.dataset.changeAction);
    if (!fn) return;
    if (el.dataset.id !== undefined) fn(el.dataset.id, el.value);
    else fn(el.value);
  });

  var gsearchInput = document.getElementById('gsearchInput');
  if (gsearchInput) {
    gsearchInput.addEventListener('input', function () { App.searchInput(this.value); });
    gsearchInput.addEventListener('focus', function () { App.searchInput(this.value); });
    gsearchInput.addEventListener('keydown', function (e) { if (e.key === 'Escape') App.closeSearch(); });
    gsearchInput.addEventListener('blur', function () { setTimeout(App.closeSearch, 150); });
  }

  (async function init() {
    var demoParam = /[?&]demo/.test(location.search);
    var hasMsal = typeof msal !== 'undefined';
    var configured = !!CONFIG.clientId && hasMsal;

    if (!configured || demoParam) {
      if (!configured) document.getElementById('gateNote').textContent =
        'No app registration configured yet — demo mode only. See SETUP.md to connect real tenants.';
      if (demoParam) { await App.startDemo(); return; }
    }

    if (configured) {
      var ok = await Graph.init();
      if (ok && Graph.getAccount()) {
        /* returning session — go straight to live */
        try { await startLive(); return; } catch (e) { console.error(e); busy(false); }
      }
      document.getElementById('btnGateSignIn').style.display = '';
    }
    document.getElementById('gate').style.display = 'flex';
  })();
})();
