/* RAP Tracker prototype — screens. One current RAP at a time: the
   newest plan that is not Complete. */
(function () {
  'use strict';
  var L = window.RapLib, S = window.RapStore;
  var store = null, data = null, view = 'dashboard', filters = { area: '', status: '', q: '' };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var today = function () { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  var fmt = function (s) { if (!s) return ''; var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return Number(s.slice(8, 10)) + ' ' + m[Number(s.slice(5, 7)) - 1] + ' ' + s.slice(0, 4); };
  var pill = function (st) { return '<span class="pill st-' + esc(String(st).replace(/ /g, '-')) + '">' + esc(st) + '</span>'; };

  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 3200); }
  function busy(msg) { $('busy').hidden = !msg; if (msg) $('busyMsg').textContent = msg; }
  async function run(msg, fn) {
    busy(msg);
    try { return await fn(function (m) { busy(m); }); }
    catch (e) { console.error(e); toast('Something went wrong: ' + (e.message || e)); }
    finally { busy(''); }
  }
  function currentRap() {
    var live = (data.plans || []).filter(function (p) { return p.status !== 'Complete'; });
    return live.sort(function (a, b) { return a.start < b.start ? 1 : -1; })[0] || null;
  }

  /* ---------- start ---------- */
  async function boot() {
    if (S.hasAuth()) {
      $('gateSp').hidden = false;
      var acct = await S.authInit().catch(function (e) { console.error(e); return null; });
      var pending = sessionStorage.getItem('rap-site');
      if (acct && pending) return connect(pending);
    }
    $('gate').hidden = false;
  }
  async function startDemo() { store = S.DemoStore(); await open(); }
  async function connect(url) {
    sessionStorage.setItem('rap-site', url);
    var acct = await S.authInit();
    if (!acct) { await S.signIn(); return; }
    var sp = S.SpStore(url);
    var name = await run('Connecting to SharePoint', function (p) { return sp.ensure(p); });
    if (!name) { $('gate').hidden = false; return; }
    store = sp;
    await open(name);
  }
  async function open(siteName) {
    data = await run('Loading', function () { return store.load(); });
    if (!data) return;
    $('gate').hidden = true; $('shell').hidden = false;
    $('storeLabel').textContent = store.kind === 'demo' ? 'Demo data, kept in this browser only.' : 'Saved to ' + (siteName || 'SharePoint') + '.';
    go(currentRap() ? 'dashboard' : 'setup');
  }
  async function reload() { data = await store.load(); render(); }

  function go(v) {
    view = v;
    document.querySelectorAll('.nav').forEach(function (n) { n.classList.toggle('on', n.dataset.view === v); });
    render();
    $('main').focus();
  }
  function render() {
    var rap = currentRap();
    var m = $('main');
    if (!rap && view !== 'setup') view = 'setup';
    m.innerHTML = ({ dashboard: dashboard, deliverables: deliverables, calendar: calendar, group: group, reports: reports, setup: setup })[view](rap);
  }

  /* ---------- dashboard ---------- */
  function dashboard(rap) {
    var t = today(), s = L.summary(data.deliverables, t), term = L.termProgress(rap, t);
    var next = L.keyDates(rap, data.dates).filter(function (d) { return (d.end || d.date) >= t; }).slice(0, 5);
    var list = function (rows, empty) {
      return rows.length ? '<table><tbody>' + rows.slice(0, 6).map(function (d) {
        return '<tr class="click" data-edit="' + esc(d.id) + '"><td>' + esc(d.ref) + '</td><td>' + esc(d.deliverable) + '</td><td class="nw ' + (d.due < t ? 'late' : '') + '">' + fmt(d.due) + '</td><td>' + esc(d.owner || 'No owner') + '</td></tr>';
      }).join('') + '</tbody></table>' + (rows.length > 6 ? '<p class="small muted">and ' + (rows.length - 6) + ' more</p>' : '') : '<p class="empty">' + empty + '</p>';
    };
    return '<div class="vhead"><h1>' + esc(rap.name) + '</h1><p>' + esc(L.RAP_TYPES[rap.type] ? L.RAP_TYPES[rap.type].name : rap.type) + ' RAP, ' + fmt(rap.start) + ' to ' + fmt(rap.end) + ' · ' + esc(rap.status) + '</p></div>' +
      '<div class="grid g4">' +
      '<div class="card kpi"><b>' + s.pct + '%</b><span>' + s.done + ' of ' + s.total + ' deliverables complete</span></div>' +
      '<div class="card kpi"><b>' + (term ? term.pct + '%' : '–') + '</b><span>of the RAP term gone' + (term ? ', ' + Math.max(0, term.daysLeft) + ' days left' : '') + '</span></div>' +
      '<div class="card kpi"><b class="' + (s.overdue.length ? 'late' : '') + '">' + s.overdue.length + '</b><span>overdue</span></div>' +
      '<div class="card kpi"><b>' + s.dueSoon.length + '</b><span>due in the next 30 days</span></div>' +
      '</div>' +
      '<div class="grid g2" style="margin-top:14px">' +
      '<div class="card"><h3>Progress by area</h3>' + s.areas.map(function (a) {
        return '<div class="area-row"><div class="top"><span>' + a.area + '</span><span class="muted">' + a.done + ' of ' + a.total + '</span></div><div class="bar"><i style="width:' + a.pct + '%"></i></div></div>';
      }).join('') + '</div>' +
      '<div class="card"><h3>Coming up</h3>' + (next.length ? '<table><tbody>' + next.map(function (d) {
        return '<tr><td>' + fmt(d.date) + (d.end && d.end !== d.date ? ' to ' + fmt(d.end) : '') + '</td><td>' + esc(d.title) + (d.estimate ? ' <span class="est">date to confirm</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="empty">Nothing scheduled.</p>') + '</div>' +
      '</div>' +
      '<div class="card" style="margin-top:14px"><h3>Overdue</h3>' + list(s.overdue, 'Nothing is overdue.') + '</div>' +
      '<div class="card" style="margin-top:14px"><h3>Due in the next 30 days</h3>' + list(s.dueSoon, 'Nothing is due in the next 30 days.') + '</div>' +
      (s.noOwner.length ? '<div class="card" style="margin-top:14px"><h3>No owner yet</h3>' + list(s.noOwner, '') + '</div>' : '');
  }

  /* ---------- deliverables ---------- */
  function deliverables() {
    var t = today(), q = filters.q.toLowerCase();
    var rows = data.deliverables.filter(function (d) {
      return (!filters.area || d.area === filters.area) && (!filters.status || d.status === filters.status) &&
        (!q || (d.deliverable + ' ' + d.action + ' ' + d.owner + ' ' + d.ref).toLowerCase().indexOf(q) > -1);
    }).sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
    var opt = function (vals, cur, all) { return '<option value="">' + all + '</option>' + vals.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join(''); };
    return '<div class="vhead"><h1>Deliverables</h1><p>Every deliverable in the current RAP. Select one to update its status, owner, notes and evidence.</p></div>' +
      '<div class="filters"><select data-filter="area" aria-label="Area">' + opt(L.AREAS, filters.area, 'All areas') + '</select>' +
      '<select data-filter="status" aria-label="Status">' + opt(L.STATUSES, filters.status, 'All statuses') + '</select>' +
      '<input data-filter="q" type="search" placeholder="Search" value="' + esc(filters.q) + '" aria-label="Search deliverables">' +
      '<button class="btn ghost sm" data-act="add-deliverable">Add a deliverable</button></div>' +
      '<div class="card"><table><thead><tr><th>Ref</th><th>Area</th><th>Deliverable</th><th>Due</th><th>Owner</th><th>Status</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (d) {
        return '<tr class="click" data-edit="' + esc(d.id) + '"><td>' + esc(d.ref) + '</td><td>' + esc(d.area) + '</td><td>' + esc(d.deliverable) + (d.evidence ? ' <span class="small muted">· evidence</span>' : '') + '</td><td class="nw ' + (L.isOpen(d) && d.due < t ? 'late' : '') + '">' + fmt(d.due) + '</td><td>' + esc(d.owner || '') + '</td><td>' + pill(d.status) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="empty">No deliverables match.</td></tr>') + '</tbody></table></div>';
  }
  function editDeliverable(id) {
    var d = id ? data.deliverables.find(function (x) { return x.id === id; }) : { ref: 'D-' + String(data.deliverables.length + 1).padStart(3, '0'), area: 'Relationships', action: '', deliverable: '', due: today(), role: '', owner: '', status: 'Not started', notes: '', evidence: '' };
    if (!d) return;
    var sel = function (name, vals, cur) { return '<select name="' + name + '">' + vals.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select>'; };
    modal('<h2 id="modalTitle">' + esc(d.ref) + (id ? '' : ' (new)') + '</h2>' +
      '<form id="dForm">' +
      '<label>Deliverable</label><textarea name="deliverable" required>' + esc(d.deliverable) + '</textarea>' +
      '<label>Action it belongs to</label><textarea name="action">' + esc(d.action) + '</textarea>' +
      '<div class="grid g2"><div><label>Area</label>' + sel('area', L.AREAS, d.area) + '</div><div><label>Status</label>' + sel('status', L.STATUSES, d.status) + '</div>' +
      '<div><label>Due</label><input type="date" name="due" value="' + esc(d.due) + '"></div><div><label>Owner</label><input name="owner" value="' + esc(d.owner) + '"></div></div>' +
      '<label>Responsible role</label><input name="role" value="' + esc(d.role) + '">' +
      '<label>Progress notes</label><textarea name="notes">' + esc(d.notes) + '</textarea>' +
      '<label>Evidence links (one per line, e.g. a SharePoint link to photos, minutes or a report)</label><textarea name="evidence">' + esc(d.evidence) + '</textarea>' +
      '<div class="row-actions"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" data-act="close">Cancel</button>' +
      (id ? '<button class="lnk" type="button" data-act="delete-deliverable" data-id="' + esc(id) + '" style="margin-left:auto">Delete</button>' : '') + '</div></form>');
    $('dForm').onsubmit = function (e) {
      e.preventDefault();
      var f = new FormData(e.target), rec = Object.assign({}, d);
      ['deliverable', 'action', 'area', 'status', 'due', 'owner', 'role', 'notes', 'evidence'].forEach(function (k) { rec[k] = String(f.get(k) || '').trim(); });
      if (rec.status === 'Complete' && d.status !== 'Complete') rec.completed = today();
      if (rec.status !== 'Complete') rec.completed = '';
      closeModal();
      run('Saving', async function () { if (id) await store.update('deliverables', rec); else await store.create('deliverables', rec); await reload(); toast('Saved.'); });
    };
  }

  /* ---------- key dates ---------- */
  function calendar(rap) {
    var t = today(), rows = L.keyDates(rap, data.dates);
    return '<div class="vhead"><h1>Key dates</h1><p>National Reconciliation Week, NAIDOC Week and the RAP Impact Survey for every year of the RAP, its end date, and your own dates. Dates marked "to confirm" are estimates: check them each year.</p></div>' +
      '<div class="card"><table><thead><tr><th>Date</th><th>What</th><th></th></tr></thead><tbody>' + rows.map(function (d) {
        return '<tr' + ((d.end || d.date) < t ? ' class="muted"' : '') + '><td>' + fmt(d.date) + (d.end && d.end !== d.date ? ' to ' + fmt(d.end) : '') + '</td><td>' + esc(d.title) + (d.estimate ? ' <span class="est">date to confirm</span>' : '') + (d.notes ? '<div class="small muted">' + esc(d.notes) + '</div>' : '') + '</td><td>' + (d.fixed ? '' : '<button class="lnk" data-act="delete-date" data-id="' + esc(d.id) + '">Remove</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="card" style="margin-top:14px"><h3>Add a date</h3><form id="kForm" class="grid g2"><div><label>What</label><input name="title" required></div><div><label>Date</label><input type="date" name="date" required></div><div style="grid-column:1/-1"><label>Notes</label><input name="notes"></div><div><button class="btn" type="submit">Add</button></div></form></div>';
  }

  /* ---------- working group ---------- */
  function group() {
    var t = today(), yearAgo = L.addMonths(t, -12);
    var held = data.meetings.filter(function (m) { return m.date >= yearAgo && m.date <= t; }).length;
    return '<div class="vhead"><h1>Working Group</h1><p>Who is on the RAP Working Group, and a record of every meeting. ' + held + ' meeting' + (held === 1 ? '' : 's') + ' in the last 12 months' + (held < 4 ? ', below the four a year the RAP commits to.' : '.') + '</p></div>' +
      '<div class="card"><h3>Members</h3><table><thead><tr><th>Name</th><th>Role</th><th>Joined</th><th></th></tr></thead><tbody>' +
      (data.members.length ? data.members.map(function (m) { return '<tr><td>' + esc(m.name) + '</td><td>' + esc(m.role) + '</td><td>' + fmt(m.joined) + '</td><td><button class="lnk" data-act="delete-member" data-id="' + esc(m.id) + '">Remove</button></td></tr>'; }).join('') : '<tr><td colspan="4" class="empty">No members yet.</td></tr>') +
      '</tbody></table><form id="mForm" class="grid g4" style="margin-top:10px;align-items:end"><div><label>Name</label><input name="name" required></div><div><label>Role</label><input name="role" placeholder="e.g. Chair"></div><div><label>Joined</label><input type="date" name="joined"></div><div><button class="btn sm" type="submit">Add member</button></div></form></div>' +
      '<div class="card" style="margin-top:14px"><h3>Meetings</h3><table><thead><tr><th>Date</th><th>Attendees</th><th>Minutes and decisions</th></tr></thead><tbody>' +
      (data.meetings.length ? data.meetings.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (m) { return '<tr><td>' + fmt(m.date) + '</td><td>' + esc(m.attendees) + '</td><td>' + esc(m.minutes) + (m.decisions ? '<div class="small muted">Decided: ' + esc(m.decisions) + '</div>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="3" class="empty">No meetings recorded yet.</td></tr>') +
      '</tbody></table><form id="gForm" style="margin-top:10px"><div class="grid g2"><div><label>Date</label><input type="date" name="date" required></div><div><label>Attendees</label><input name="attendees"></div></div><label>Minutes</label><textarea name="minutes"></textarea><label>Decisions</label><input name="decisions"><div class="row-actions"><button class="btn sm" type="submit">Record meeting</button></div></form></div>';
  }

  /* ---------- reports ---------- */
  function reports(rap) {
    var t = today(), sec = L.progressReport(rap, data.deliverables, data.meetings, t);
    return '<div class="vhead no-print"><h1>Reports</h1><p>A progress report for leadership, built from the deliverables and meetings as they stand today. Use it for internal reporting and as the starting point for the annual RAP Impact Survey.</p><div class="row-actions"><button class="btn" data-act="print">Print or save as PDF</button></div></div>' +
      '<div class="report"><h2>' + esc(rap.name) + ': progress report</h2><p>As at ' + fmt(t) + '.</p>' + sec.map(function (s) {
        return '<h3>' + esc(s.heading) + '</h3>' + (s.lines.length > 1 ? '<ul>' + s.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '<p>' + esc(s.lines[0]) + '</p>');
      }).join('') + '</div>';
  }

  /* ---------- set-up ---------- */
  function setup(rap) {
    var types = L.TYPE_ORDER.map(function (k) { return '<option value="' + k + '">' + L.RAP_TYPES[k].name + '</option>'; }).join('');
    var form = '<form id="pForm"><div class="grid g2"><div><label>RAP name</label><input name="name" required placeholder="e.g. 2Ways Consulting Innovate RAP"></div><div><label>RAP type</label><select name="type" id="pType">' + types + '</select></div>' +
      '<div><label>Starts</label><input type="date" name="start" id="pStart" required value="' + today() + '"></div><div><label>Ends</label><input type="date" name="end" id="pEnd" required value="' + L.defaultEnd('reflect', today()) + '"></div></div>' +
      '<p class="small muted" id="pBlurb">' + esc(L.RAP_TYPES.reflect.blurb) + '</p>' +
      '<label><input type="checkbox" name="template" checked style="width:auto"> Add the sample deliverables for this RAP type (you can edit or delete any of them)</label>' +
      '<div class="row-actions"><button class="btn" type="submit">Create the RAP</button></div></form>';
    if (!rap) return '<div class="vhead"><h1>Set up your RAP</h1><p>Choose the RAP type and its dates. The deliverables, key dates and reporting follow from them.</p></div><div class="card">' + form + '</div>';
    var st = L.RAP_STATUSES.map(function (v) { return '<option' + (v === rap.status ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
    return '<div class="vhead"><h1>RAP set-up</h1><p>Details of the current RAP. Its deliverables are on the Deliverables screen.</p></div>' +
      '<div class="card"><form id="eForm"><div class="grid g2"><div><label>RAP name</label><input name="name" value="' + esc(rap.name) + '" required></div><div><label>Status</label><select name="status">' + st + '</select></div>' +
      '<div><label>Starts</label><input type="date" name="start" value="' + esc(rap.start) + '"></div><div><label>Ends</label><input type="date" name="end" value="' + esc(rap.end) + '"></div>' +
      '<div><label>Endorsed by Reconciliation Australia on</label><input type="date" name="endorsed" value="' + esc(rap.endorsed) + '"></div><div><label>Link to the published RAP</label><input name="link" value="' + esc(rap.link) + '"></div></div>' +
      '<div class="row-actions"><button class="btn" type="submit">Save</button></div></form></div>' +
      (store.kind === 'demo' ? '<div class="card" style="margin-top:14px"><h3>Demo data</h3><p class="small muted">Everything here is sample data kept in this browser.</p><button class="btn ghost sm" data-act="reset-demo">Reset the demo</button></div>' : '');
  }

  /* ---------- modal ---------- */
  function modal(html) { $('modalCard').innerHTML = html; $('modal').hidden = false; var f = $('modalCard').querySelector('input,textarea,select'); if (f) f.focus(); }
  function closeModal() { $('modal').hidden = true; $('modalCard').innerHTML = ''; }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var nav = e.target.closest('[data-view]'); if (nav) return go(nav.dataset.view);
    var row = e.target.closest('[data-edit]'); if (row) return editDeliverable(row.dataset.edit);
    var a = e.target.closest('[data-act]'); if (!a) { if (e.target === $('modal')) closeModal(); return; }
    var id = a.dataset.id;
    switch (a.dataset.act) {
      case 'demo': return startDemo();
      case 'connect': return connect($('siteUrl').value.trim());
      case 'leave': sessionStorage.removeItem('rap-site'); return location.reload();
      case 'close': return closeModal();
      case 'print': return window.print();
      case 'add-deliverable': return editDeliverable(null);
      case 'delete-deliverable': if (!confirm('Delete this deliverable?')) return; closeModal(); return run('Deleting', async function () { await store.remove('deliverables', id); await reload(); });
      case 'delete-date': return run('Removing', async function () { await store.remove('dates', id); await reload(); });
      case 'delete-member': return run('Removing', async function () { await store.remove('members', id); await reload(); });
      case 'reset-demo': if (!confirm('Reset all demo data?')) return; store.reset(); return reload().then(function () { go('dashboard'); });
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });
  document.addEventListener('input', function (e) {
    var f = e.target.dataset && e.target.dataset.filter;
    if (!f) return;
    filters[f] = e.target.value;
    if (f !== 'q') return render();
    clearTimeout(filters._t); filters._t = setTimeout(function () { render(); var q = document.querySelector('[data-filter="q"]'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250);
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'pType' || e.target.id === 'pStart') {
      var type = $('pType').value, start = $('pStart').value;
      if (start) $('pEnd').value = L.defaultEnd(type, start);
      $('pBlurb').textContent = L.RAP_TYPES[type].blurb;
    }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target, v = Object.fromEntries(new FormData(f).entries());
    if (f.id === 'pForm') {
      e.preventDefault();
      if (v.end <= v.start) return toast('The end date must be after the start date.');
      return run('Creating the RAP', async function (p) {
        await store.create('plans', { name: v.name, type: v.type, start: v.start, end: v.end, status: 'Drafting', endorsed: '', link: '' });
        if (v.template) await store.createMany('deliverables', L.buildDeliverables(v.type, v.start, v.end), p);
        await reload(); go('dashboard'); toast('RAP created.');
      });
    }
    if (f.id === 'eForm') {
      e.preventDefault();
      var rap = currentRap();
      return run('Saving', async function () { await store.update('plans', Object.assign({}, rap, v)); await reload(); toast('Saved.'); });
    }
    if (f.id === 'kForm') { e.preventDefault(); return run('Adding', async function () { await store.create('dates', v); await reload(); }); }
    if (f.id === 'mForm') { e.preventDefault(); return run('Adding', async function () { await store.create('members', Object.assign({ email: '' }, v)); await reload(); }); }
    if (f.id === 'gForm') { e.preventDefault(); return run('Saving', async function () { await store.create('meetings', Object.assign({ title: 'RWG meeting' }, v)); await reload(); }); }
  });

  boot();
})();
