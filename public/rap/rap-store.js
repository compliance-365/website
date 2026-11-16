/* RAP Tracker — where records live.
   - DemoStore: sample data in this browser only (localStorage).
   - SpStore: SharePoint lists on the RAP site, through Microsoft Graph
     with the signed-in user's own delegated access, the same way
     Checkpoint stores its registers. It reuses Checkpoint's Entra app
     registration, so /rap/ must be added to that registration's
     single-page-application redirect URIs. */
(function () {
  'use strict';
  var L = window.RapLib, CFG = window.CHECKPOINT_CONFIG || {};
  var KINDS = ['plans', 'deliverables', 'dates', 'members', 'meetings'];

  /* ---------------- demo ---------------- */
  var DEMO_KEY = 'rap-demo-v1';
  function seed() {
    var start = '2026-03-01', end = L.defaultEnd('innovate', start);
    var del = L.buildDeliverables('innovate', start, end);
    var owners = ['A. Williams', 'J. Nguyen', 'S. Patel', 'K. Brown'];
    del.forEach(function (d, i) {
      d.id = 'd' + (i + 1);
      d.owner = owners[i % owners.length];
      if (d.due < '2026-08-01') { d.status = 'Complete'; d.completed = d.due; d.notes = 'Done on time.'; }
      else if (d.due < '2026-12-31') d.status = i % 3 === 0 ? 'Not started' : 'In progress';
    });
    var late = del.find(function (d) { return d.status === 'Complete' && d.area === 'Respect'; });
    if (late) { late.status = 'In progress'; late.completed = ''; late.notes = 'Waiting on the training provider.'; }
    return {
      plans: [{ id: 'p1', name: 'Demo Pty Ltd Innovate RAP', type: 'innovate', start: start, end: end, status: 'Live', endorsed: '2026-02-10', link: '' }],
      deliverables: del,
      dates: [{ id: 'k1', title: 'Leadership briefing on the RAP', date: '2026-12-04', notes: '' }],
      members: [
        { id: 'm1', name: 'A. Williams', role: 'RAP Champion (chair)', email: '', joined: '2025-11-01' },
        { id: 'm2', name: 'J. Nguyen', role: 'Member', email: '', joined: '2025-11-01' },
        { id: 'm3', name: 'S. Patel', role: 'Member', email: '', joined: '2026-01-15' },
        { id: 'm4', name: 'K. Brown', role: 'Executive sponsor', email: '', joined: '2025-11-01' }
      ],
      meetings: [
        { id: 'g1', title: 'RWG meeting', date: '2026-03-12', attendees: 'A. Williams, J. Nguyen, S. Patel', minutes: 'Agreed Terms of Reference.', decisions: 'Meet quarterly.' },
        { id: 'g2', title: 'RWG meeting', date: '2026-06-18', attendees: 'A. Williams, J. Nguyen, K. Brown', minutes: 'Reviewed NRW activity.', decisions: '' },
        { id: 'g3', title: 'RWG meeting', date: '2026-09-17', attendees: 'A. Williams, S. Patel', minutes: 'Prepared the impact survey.', decisions: '' }
      ]
    };
  }
  function DemoStore() {
    var data;
    try { data = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { data = null; }
    if (!data) data = seed();
    var save = function () { try { localStorage.setItem(DEMO_KEY, JSON.stringify(data)); } catch (e) { /* private window */ } };
    var n = Date.now();
    return {
      kind: 'demo',
      label: 'Demo data in this browser',
      load: function () { return Promise.resolve(JSON.parse(JSON.stringify(data))); },
      create: function (kind, rec) { rec = Object.assign({}, rec, { id: 'n' + (n++) }); data[kind].push(rec); save(); return Promise.resolve(rec); },
      update: function (kind, rec) { var i = data[kind].findIndex(function (r) { return r.id === rec.id; }); if (i > -1) data[kind][i] = Object.assign({}, data[kind][i], rec); save(); return Promise.resolve(); },
      remove: function (kind, id) { data[kind] = data[kind].filter(function (r) { return r.id !== id; }); save(); return Promise.resolve(); },
      createMany: function (kind, recs) { var self = this; return recs.reduce(function (p, r) { return p.then(function () { return self.create(kind, r); }); }, Promise.resolve()); },
      reset: function () { data = seed(); save(); }
    };
  }

  /* ---------------- SharePoint ---------------- */
  var msalApp = null;
  var SCOPES = ['Sites.Manage.All'];
  function redirectUri() { return location.origin + location.pathname; }
  async function authInit() {
    if (!CFG.clientId || !window.msal) return null;
    if (msalApp) return msalApp.getActiveAccount();
    msalApp = new msal.PublicClientApplication({
      auth: { clientId: CFG.clientId, authority: CFG.authority, redirectUri: redirectUri() },
      cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false }
    });
    await msalApp.initialize();
    var res = await msalApp.handleRedirectPromise();
    if (res && res.account) msalApp.setActiveAccount(res.account);
    var acct = msalApp.getActiveAccount() || msalApp.getAllAccounts()[0] || null;
    if (acct) msalApp.setActiveAccount(acct);
    return acct;
  }
  function signIn() { return msalApp.loginRedirect({ scopes: SCOPES.concat(['User.Read']) }); }
  function signOut() { return msalApp.logoutRedirect({ postLogoutRedirectUri: redirectUri() }); }
  async function token() {
    var account = msalApp.getActiveAccount();
    try { return (await msalApp.acquireTokenSilent({ scopes: SCOPES, account: account })).accessToken; }
    catch (e) { await msalApp.acquireTokenRedirect({ scopes: SCOPES, account: account }); throw e; }
  }
  async function graph(method, path, body) {
    var res = await fetch('https://graph.microsoft.com/v1.0' + path, {
      method: method,
      headers: Object.assign({ Authorization: 'Bearer ' + await token() }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 204) return null;
    var json = await res.json().catch(function () { return null; });
    if (!res.ok) throw new Error((json && json.error && json.error.message) || ('Microsoft Graph returned ' + res.status));
    return json;
  }
  function columnDef(c) {
    var d = { name: c.name };
    if (c.type === 'text') d.text = {};
    else if (c.type === 'note') d.text = { allowMultipleLines: true, linesForEditing: 6 };
    else if (c.type === 'choice') d.choice = { choices: c.choices, displayAs: 'dropDownMenu' };
    return d;
  }

  function SpStore(siteUrl) {
    var ref = L.siteRef(siteUrl), siteId = null, listIds = {};
    async function ensure(progress) {
      if (!ref) throw new Error('That is not a SharePoint site address. It should look like https://contoso.sharepoint.com/sites/RAPHub');
      var site = await graph('GET', '/sites/' + ref.host + ':' + ref.path + '?$select=id,displayName');
      siteId = site.id;
      var existing = await graph('GET', '/sites/' + siteId + '/lists?$select=id,displayName&$top=200');
      var byName = {}; (existing.value || []).forEach(function (l) { byName[l.displayName] = l.id; });
      for (var i = 0; i < KINDS.length; i++) {
        var k = KINDS[i], def = L.LISTS[k];
        if (byName[def.title]) { listIds[k] = byName[def.title]; continue; }
        if (progress) progress('Creating the ' + def.title + ' list');
        var made = await graph('POST', '/sites/' + siteId + '/lists', { displayName: def.title, columns: def.columns.map(columnDef), list: { template: 'genericList' } });
        listIds[k] = made.id;
      }
      return site.displayName;
    }
    async function items(kind) {
      var out = [], path = '/sites/' + siteId + '/lists/' + listIds[kind] + '/items?expand=fields&$top=999';
      while (path) {
        var page = await graph('GET', path);
        (page.value || []).forEach(function (it) { out.push(L.fromFields(kind, it.fields || {}, it.id)); });
        path = page['@odata.nextLink'] ? page['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
      }
      return out;
    }
    return {
      kind: 'sharepoint',
      label: siteUrl,
      ensure: ensure,
      load: async function () {
        var data = {};
        for (var i = 0; i < KINDS.length; i++) data[KINDS[i]] = await items(KINDS[i]);
        return data;
      },
      create: async function (kind, rec) {
        var fields = L.toFields(kind, rec); Object.keys(fields).forEach(function (k) { if (fields[k] === '') delete fields[k]; });
        var made = await graph('POST', '/sites/' + siteId + '/lists/' + listIds[kind] + '/items', { fields: fields });
        return Object.assign({}, rec, { id: String(made.id) });
      },
      update: function (kind, rec) { return graph('PATCH', '/sites/' + siteId + '/lists/' + listIds[kind] + '/items/' + rec.id + '/fields', L.toFields(kind, rec)); },
      remove: function (kind, id) { return graph('DELETE', '/sites/' + siteId + '/lists/' + listIds[kind] + '/items/' + id); },
      createMany: async function (kind, recs, progress) {
        for (var i = 0; i < recs.length; i++) {
          if (progress) progress('Adding deliverable ' + (i + 1) + ' of ' + recs.length);
          await this.create(kind, recs[i]);
        }
      }
    };
  }

  window.RapStore = { DemoStore: DemoStore, SpStore: SpStore, authInit: authInit, signIn: signIn, signOut: signOut, hasAuth: function () { return !!(CFG.clientId && window.msal); } };
})();
