/* Checkpoint — monthly security review for the scheduled monitor.
 * The functions below are copied verbatim from public/checkpoint/lib.js:
 * the Function and the browser bundle share no module, so
 * test/security-review-cadence.test.mjs compares each function's source
 * and fails if they ever differ. Change one, change the other.
 */
'use strict';
  var DONE_ACTION = function (a) { return a && (a.status === 'Done' || a.status === 'Cancelled'); };
  var SECURITY_REVIEW_LENGTH = { kickoff: 50, monthly: 30, quarterly: 45, mr: 60 };
  var SECURITY_REVIEW_AGENDA = [
    { key: 'actions', title: 'Actions', min: 5, lead: 'owner', clause: '9.3.2 a, 10.1' },
    { key: 'risks', title: 'Risks', min: 8, lead: 'chair', clause: '6.1.2, 6.1.3, 8.2, 8.3' },
    { key: 'incidents', title: 'Incidents', min: 7, lead: 'owner', clause: 'A.5.24 to A.5.27' },
    { key: 'posture', title: 'Security posture', min: 5, lead: 'owner', clause: '9.1' },
    { key: 'certification', title: 'Certification progress', min: 5, lead: 'facilitator', clause: '9.1, 7.5', optional: true },
    { key: 'people', title: 'People and suppliers', min: 5, lead: 'owner', clause: 'A.5.19 to A.5.23, A.6.1 to A.6.5', optional: true },
    { key: 'decisions', title: 'Decisions and any other business', min: 5, lead: 'chair', clause: '9.3.3' }
  ];
  var SECURITY_REVIEW_QUARTERLY = [
    { key: 'access', title: 'Access review results', min: 5, lead: 'owner', clause: 'A.5.15, A.5.18, A.8.2' },
    { key: 'suppliers', title: 'Supplier and AI provider reviews', min: 5, lead: 'owner', clause: 'A.5.22' },
    { key: 'objectives', title: 'Security objectives and awareness', min: 5, lead: 'chair', clause: '6.2, 7.3, 9.1' }
  ];
  var SECURITY_REVIEW_KICKOFF = [
    { key: 'tor', title: 'Purpose of the meeting and roles', min: 5, lead: 'facilitator', clause: '5.1, 5.3' },
    { key: 'scope', title: 'Scope and exclusions', min: 5, lead: 'facilitator', clause: '4.3, 6.1.3 d' },
    { key: 'baseline', title: 'Where we start', min: 5, lead: 'owner', clause: '9.1' },
    { key: 'path', title: 'Path to certification', min: 5, lead: 'facilitator', clause: '9.2, 9.3' }
  ];
  var SECURITY_REVIEW_KIND_LABEL = { kickoff: 'Kick-off', monthly: 'Monthly', quarterly: 'Quarterly', mr: 'Management review (Clause 9.3)' };
  function srDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? Number(m[3]) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1] + ' ' + m[1] : String(iso || '');
  }
  function addDaysIso(iso, days) {
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(d)) return '';
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function securityReviewKind(n, mrEvery) {
    n = Number(n) || 1;
    var every = [3, 6, 12].indexOf(Number(mrEvery)) !== -1 ? Number(mrEvery) : 12;
    if (n === 1) return 'kickoff';
    if (n % every === 0) return 'mr';
    if (n % 3 === 0) return 'quarterly';
    return 'monthly';
  }
  function securityReviewQuiet(key, p) {
    if (!p) return '';
    if (key === 'incidents' && !p.incidents.count && !p.incidents.open) return 'No incidents since ' + srDate(p.since);
    if (key === 'risks' && !p.risks.added && !p.risks.changed && !p.risks.aboveAppetite) return 'No new or changed risks, none above appetite';
    if (key === 'actions' && !p.actions.overdue && !(p.actions.prior || []).length) return 'No actions overdue';
    if (key === 'posture' && p.posture.score != null && p.posture.prev === p.posture.score && !(p.posture.failingTop || []).length) return 'Posture score unchanged at ' + p.posture.score + '/100';
    if (key === 'certification' && p.certification.certified) return 'skip';
    if (key === 'certification' && !p.certification.nextAudit && !p.certification.docsAwaiting && (p.certification.readiness == null || p.certification.readiness >= 100)) return 'skip';
    if (key === 'people' && !p.people.handovers && !p.people.retired && !p.people.vendorsAdded && !p.people.certsExpiring.length) return 'No leavers, retired assets or supplier changes';
    return '';
  }
  function securityReviewStatus(p) {
    if (!p) return [];
    var out = [];
    var add = function (key, label, rag, headline) { out.push({ key: key, label: label, rag: rag, headline: headline }); };
    var od = p.actions.overdue, prior = p.actions.prior || [];
    var priorOpen = prior.filter(function (a) { return !DONE_ACTION(a) && a.status !== 'Closed'; }).length;
    add('actions', 'Actions', od >= 3 ? 'red' : od || priorOpen ? 'amber' : 'green',
      od ? od + ' overdue' + (p.actions.overdueList.length ? ', oldest ' + p.actions.overdueList[0].id + (p.actions.overdueList[0].owner ? ' (' + p.actions.overdueList[0].owner + ')' : '') : '') : prior.length ? (prior.length - priorOpen) + ' of ' + prior.length + ' decisions from last meeting done' : 'Nothing overdue');
    var above = p.risks.aboveAppetite;
    add('risks', 'Risks', above != null && above >= 3 ? 'red' : above || p.risks.added ? 'amber' : 'green',
      above ? above + ' above appetite' : p.risks.added ? p.risks.added + ' new since last meeting' : 'None above appetite');
    var serious = (p.incidents.since || []).filter(function (n) { return /high|critical/i.test(n.severity || '') && !/closed/i.test(n.status || ''); }).length;
    add('incidents', 'Incidents', serious ? 'red' : p.incidents.count || p.incidents.open ? 'amber' : 'green',
      p.incidents.count ? p.incidents.count + ' since last meeting' + (serious ? ', ' + serious + ' serious and open' : '') : p.incidents.open ? p.incidents.open + ' still open' : 'None');
    if (p.posture.score != null) {
      var delta = p.posture.prev != null ? p.posture.score - p.posture.prev : 0;
      add('posture', 'Security posture', delta <= -5 ? 'red' : delta < 0 || p.posture.score < 60 ? 'amber' : 'green',
        p.posture.score + '/100' + (p.posture.prev != null ? (delta >= 0 ? ', up ' + delta : ', down ' + (-delta)) : ''));
    }
    if (!p.certification.certified && (p.certification.nextAudit || p.certification.docsAwaiting || p.certification.readiness != null)) {
      add('certification', 'Certification', p.certification.docsAwaiting || (p.certification.readiness != null && p.certification.readiness < 80) ? 'amber' : 'green',
        (p.certification.readiness != null ? p.certification.readiness + '% ready' : '') + (p.certification.docsAwaiting ? (p.certification.readiness != null ? ', ' : '') + p.certification.docsAwaiting + ' document' + (p.certification.docsAwaiting === 1 ? '' : 's') + ' to approve' : '') || 'On track');
    }
    return out;
  }
  function securityReviewFollowUps(reviews, actions, today) {
    var held = (reviews || []).filter(function (r) { return r && r.status === 'Held' && r.date; }).sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
    if (!held || held.followUpSent || today < addDaysIso(held.date, 7)) return null;
    var by = {}, order = [];
    (held.actions || []).forEach(function (id) {
      var a = (actions || []).find(function (x) { return x.id === id; });
      if (!a || a.status !== 'Open' || !a.owner || /^unassigned$/i.test(a.owner)) return;
      var k = a.owner.toLowerCase();
      if (!by[k]) { by[k] = { owner: a.owner, email: a.ownerEmail || '', items: [] }; order.push(k); }
      by[k].items.push({ id: a.id, title: a.title, due: a.due || '' });
    });
    return { review: held, owners: order.map(function (k) { return by[k]; }) };
  }
  function securityReviewFollowUpHtml(o, review, meta) {
    var e = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var m = meta || {};
    return '<div style="font-family:Arial,sans-serif;color:#222;max-width:600px"><p>Hi ' + e(o.owner) + ',</p>' +
      '<p>At the security review on ' + e(srDate(review.date)) + ' you took on ' + (o.items.length === 1 ? 'this action' : 'these actions') + '. ' + (o.items.length === 1 ? 'It is' : 'They are') + ' still marked Open:</p><ul>' +
      o.items.map(function (i) { return '<li><b>' + e(i.id) + '</b> ' + e(i.title) + (i.due ? ' (due ' + e(srDate(i.due)) + ')' : '') + '</li>'; }).join('') + '</ul>' +
      '<p>Update ' + (o.items.length === 1 ? 'it' : 'them') + ' before the next meeting, even if only to say what is in the way.' + (/^https:\/\//i.test(m.appUrl || '') ? ' <a href="' + e(m.appUrl) + '">Open Checkpoint</a>.' : '') + '</p>' +
      '<p style="color:#999;font-size:11px;margin-top:24px">Sent by Checkpoint for ' + e(m.org || 'your organisation') + '.</p></div>';
  }
  function securityReviewDayIn(year, month, setup) {
    var wd = Number(setup && setup.weekday) || 2, week = (setup && setup.week) || 2;
    if (week === 'last') {
      var d = new Date(Date.UTC(year, month + 1, 0));
      while (((d.getUTCDay() + 6) % 7) + 1 !== wd) d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    }
    var first = new Date(Date.UTC(year, month, 1));
    var off = (wd - (((first.getUTCDay() + 6) % 7) + 1) + 7) % 7;
    first.setUTCDate(1 + off + 7 * (Math.min(4, Math.max(1, Number(week) || 1)) - 1));
    return first.toISOString().slice(0, 10);
  }
  function nextSecurityReviewDate(setup, from) {
    var f = String(from).slice(0, 10), y = Number(f.slice(0, 4)), m = Number(f.slice(5, 7)) - 1;
    for (var i = 0; i < 3; i++) {
      var d = securityReviewDayIn(y + Math.floor((m + i) / 12), (m + i) % 12, setup);
      if (d >= f) return d;
    }
    return '';
  }
  function workingDaysBefore(date, days) {
    var d = new Date(String(date).slice(0, 10) + 'T00:00:00Z'), n = 0;
    if (isNaN(d)) return '';
    while (n < days) { d.setUTCDate(d.getUTCDate() - 1); var w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return d.toISOString().slice(0, 10);
  }
  function securityReviewFacts(key, p) {
    var f = [];
    var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
    if (!p) return f;
    if (key === 'actions') {
      var prior = p.actions.prior || [];
      if (prior.length) f.push('Decisions from last meeting: ' + prior.filter(function (a) { return DONE_ACTION(a) || a.status === 'Closed'; }).length + ' of ' + prior.length + ' done');
      f.push(p.actions.overdue ? plural(p.actions.overdue, 'action') + ' overdue' + (p.actions.overdue > 3 ? ', the three oldest:' : '') : 'Nothing overdue; ' + plural(p.actions.open, 'action') + ' open');
      p.actions.overdueList.slice(0, 3).forEach(function (a) { f.push(a.id + ' ' + a.title + (a.owner ? ' (' + a.owner + ')' : '')); });
    } else if (key === 'posture') {
      f.push(p.posture.score == null ? 'No posture scan yet: run one before the meeting' : 'Posture score ' + p.posture.score + '/100' + (p.posture.prev != null ? ' (' + (p.posture.score >= p.posture.prev ? '+' : '') + (p.posture.score - p.posture.prev) + ' since ' + srDate(p.since) + ')' : ''));
      (p.posture.failingTop || []).forEach(function (c) { f.push('Failing: ' + c); });
    } else if (key === 'incidents') {
      f.push(plural(p.incidents.count, 'incident') + ' since ' + srDate(p.since) + (p.incidents.open ? ', ' + p.incidents.open + ' still open' : ''));
      p.incidents.since.slice(0, 3).forEach(function (n) { f.push(n.id + ' ' + n.title + (n.severity ? ' (' + n.severity + ')' : '')); });
    } else if (key === 'risks') {
      if (p.risks.aboveAppetite != null && p.risks.aboveAppetite) f.push(plural(p.risks.aboveAppetite, 'risk') + ' above appetite' + (p.risks.aboveList.length ? ': ' + p.risks.aboveList.slice(0, 3).join(', ') + (p.risks.aboveList.length > 3 ? ' and more' : '') : ''));
      if (p.risks.added || p.risks.changed) f.push(p.risks.added + ' added and ' + p.risks.changed + ' updated since ' + srDate(p.since));
      if (!f.length) f.push(plural(p.risks.open, 'open risk') + ', none above appetite');
    } else if (key === 'certification') {
      if (p.certification.nextAudit) f.push('Next audit: ' + p.certification.nextAudit);
      if (p.certification.readiness != null) f.push('Control readiness ' + p.certification.readiness + '%');
      if (p.certification.docsAwaiting) f.push(plural(p.certification.docsAwaiting, 'document') + ' awaiting approval');
    } else if (key === 'people') {
      var bits = [];
      if (p.people.handovers) bits.push(plural(p.people.handovers, 'leaver hand-over'));
      if (p.people.retired) bits.push(plural(p.people.retired, 'asset') + ' retired');
      if (p.people.vendorsAdded) bits.push(plural(p.people.vendorsAdded, 'supplier') + ' added');
      if (bits.length) f.push(bits.join(', '));
      if (p.people.certsExpiring.length) f.push('Supplier certificates expiring soon: ' + p.people.certsExpiring.slice(0, 3).join(', '));
    } else if (key === 'decisions') {
      f.push('Each decision gets an owner and a due date. Any other business: new products or AI features, customer or contract changes, team changes');
    } else if (key === 'access') {
      f.push(p.quarterly.accessReview ? 'Last access review completed ' + srDate(p.quarterly.accessReview) : 'No access review recorded yet');
    } else if (key === 'suppliers') {
      f.push(plural(p.quarterly.suppliersDue, 'supplier review') + ' due within 30 days');
    } else if (key === 'objectives') {
      f.push(plural(p.quarterly.objectives.open, 'objective') + ' in progress, ' + p.quarterly.objectives.atRisk + ' at risk' + (p.quarterly.attestPct == null ? '' : '; policy acknowledgement ' + p.quarterly.attestPct + '%'));
    } else if (key === 'baseline') {
      f.push('Today\u2019s posture, risks, open actions and documents, recorded as the starting point');
    } else if (key === 'mr') {
      f.push('The Clause 9.3 inputs are pre-filled in Checkpoint; read them beforehand and agree any changes to the ISMS, its resources and its objectives');
    }
    return f;
  }
  function securityReviewAgenda(setup, n, pack, rec) {
    var s = setup || {}, r = rec || {};
    var kind = securityReviewKind(n, s.mrEvery);
    var custom = (s.customItems || []).filter(function (i) { return i && i.title && (i.every !== 'quarterly' || kind === 'quarterly' || kind === 'mr'); });
    var core = SECURITY_REVIEW_AGENDA.slice(0, -1);
    var items = [];
    if (kind === 'kickoff') items = items.concat(SECURITY_REVIEW_KICKOFF);
    items = items.concat(core, custom);
    if (kind === 'quarterly' || kind === 'mr') items = items.concat(SECURITY_REVIEW_QUARTERLY);
    if (kind === 'mr') items.push({ key: 'mr', title: 'Management review sign-off', min: 15, lead: 'chair', clause: '9.3' });
    items = items.concat((r.extra || []).map(function (x) { return { key: x.key, title: x.title, min: x.min || 5, lead: x.lead || 'owner', clause: '', added: x.by || true }; }));
    var skip = r.skip || [];
    var quiet = [];
    items = items.filter(function (i) {
      if (skip.indexOf(i.key) !== -1) return false;
      if (kind === 'kickoff' && i.key === 'certification') return false;
      var q = securityReviewQuiet(i.key, pack);
      if (q === 'skip') return false;
      if (q && kind !== 'kickoff') { quiet.push(q); return false; }
      return true;
    });
    if (r.order && r.order.length) {
      var pos = function (k) { var i = r.order.indexOf(k); return i === -1 ? 999 : i; };
      items = items.map(function (it, i) { return { it: it, i: i }; }).sort(function (a, b) { return (pos(a.it.key) - pos(b.it.key)) || (a.i - b.i); }).map(function (x) { return x.it; });
    }
    items.push(SECURITY_REVIEW_AGENDA[SECURITY_REVIEW_AGENDA.length - 1]);
    /* Fit the time: the kind's length, scaled by the monthly setting. */
    var target = Math.round((SECURITY_REVIEW_LENGTH[kind] || 30) * ([30, 45, 60].indexOf(Number(s.length)) !== -1 ? Number(s.length) : 30) / 30);
    var natural = items.reduce(function (m, it) { return m + it.min; }, 0);
    var fixed = items.filter(function (it) { return it.added; }).reduce(function (m, it) { return m + it.min; }, 0);
    var scale = natural > fixed && target > fixed ? (target - fixed) / (natural - fixed) : 1;
    if (scale > 1.5) scale = 1.5;
    var mins = items.map(function (it) { return it.added ? it.min : Math.max(3, Math.round(it.min * scale)); });
    var diff = Math.round(Math.min(target, natural * scale + 0.5)) - mins.reduce(function (m, x) { return m + x; }, 0);
    if (diff && Math.abs(diff) <= 3) mins[mins.length - 1] = Math.max(3, mins[mins.length - 1] + diff);
    var who = { chair: s.chair || 'Chair', owner: s.owner || 'ISMS owner', facilitator: s.facilitator || s.owner || 'ISMS owner' };
    var t = 0;
    var mmss = function (m) { return Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); };
    var out = items.map(function (it, idx) {
      var row = { key: it.key, title: it.title, start: mmss(t), end: mmss(t + mins[idx]), min: mins[idx], lead: who[it.lead] || it.lead, clause: it.clause || '', facts: securityReviewFacts(it.key, pack), custom: !!it.custom, added: it.added || '' };
      t += mins[idx];
      return row;
    });
    return { n: Number(n) || 1, kind: kind, label: SECURITY_REVIEW_KIND_LABEL[kind], minutes: t, items: out, quiet: quiet,
      evidences: kind === 'mr' ? 'ISO/IEC 27001 Clauses 9.1 and 9.3 (management review)' : 'ISO/IEC 27001 Clause 9.1 (monitoring, measurement, analysis and evaluation)' };
  }
  function securityReviewDue(setup, reviews, today) {
    if (!setup) return null;
    var list = reviews || [];
    var open = list.filter(function (r) { return r.status !== 'Held'; }).sort(function (a, b) { return a.date.localeCompare(b.date); })[0];
    var n = open ? open.n : list.reduce(function (m, r) { return Math.max(m, r.n || 0); }, 0) + 1;
    var from = setup.startDate && setup.startDate > today ? setup.startDate : today;
    var date = open ? open.date : nextSecurityReviewDate(setup, from);
    if (!date) return null;
    var prepareOn = workingDaysBefore(date, 2);
    return {
      n: n, date: date, rec: open || null, prepareOn: prepareOn,
      prepare: !open && today >= prepareOn && today <= date,
      send: today >= prepareOn && today <= date && setup.autoSend === 'true' && (!open || open.status === 'Prepared'),
      remindMinutes: !!open && today > date && !open.minutesReminded
    };
  }
  function securityReviewEmailHtml(agenda, meta, status) {
    var e = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var m = meta || {};
    var safeLink = /^https:\/\//i.test(m.teamsLink || '') ? m.teamsLink : '';
    var dot = { red: '#c0392b', amber: '#d68910', green: '#1e8449' };
    var word = { red: 'Needs attention', amber: 'Watch', green: 'On track' };
    return '<div style="font-family:Arial,sans-serif;color:#222;max-width:680px">' +
      '<h2 style="margin-bottom:4px">' + e(m.org || 'Security') + ' security review ' + agenda.n + (agenda.kind === 'monthly' ? '' : ': ' + e(agenda.label)) + '</h2>' +
      '<p style="color:#666;font-size:13px;margin-top:0">' + e(m.date) + (m.time ? ' at ' + e(m.time) : '') + ', ' + agenda.minutes + ' minutes' + (safeLink ? ' \u00b7 <a href="' + e(safeLink) + '">Join on Teams</a>' : '') + '</p>' +
      ((status || []).length ? '<h3 style="font-size:14px;margin:18px 0 6px">At a glance</h3><table style="width:100%;border-collapse:collapse;font-size:13px">' + status.map(function (x) {
        return '<tr><td style="padding:6px;border-bottom:1px solid #eee;width:12px"><span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:' + (dot[x.rag] || '#999') + '"></span></td>' +
          '<td style="padding:6px;border-bottom:1px solid #eee;white-space:nowrap"><b>' + e(x.label) + '</b></td><td style="padding:6px;border-bottom:1px solid #eee">' + e(x.headline) + '</td>' +
          '<td style="padding:6px;border-bottom:1px solid #eee;color:#888;font-size:12px;white-space:nowrap">' + e(word[x.rag] || '') + '</td></tr>';
      }).join('') + '</table>' : '') +
      '<h3 style="font-size:14px;margin:18px 0 6px">Agenda</h3><table style="width:100%;border-collapse:collapse;font-size:13px">' +
      agenda.items.map(function (i) {
        return '<tr><td style="padding:8px 6px;border-bottom:1px solid #eee;white-space:nowrap;color:#666;vertical-align:top">' + e(i.start) + '</td>' +
          '<td style="padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top"><b>' + e(i.title) + '</b> <span style="color:#888">(' + e(i.lead) + ')</span>' +
          (i.facts.length ? '<ul style="margin:4px 0 0 16px;padding:0;color:#444">' + i.facts.map(function (f) { return '<li>' + e(f) + '</li>'; }).join('') + '</ul>' : '') + '</td></tr>';
      }).join('') + '</table>' +
      ((agenda.quiet || []).length ? '<p style="font-size:13px;color:#555;margin-top:12px"><b>Nothing to report:</b> ' + agenda.quiet.map(e).join('; ') + '.</p>' : '') +
      (/^https:\/\//i.test(m.appUrl || '') ? '<p style="margin-top:16px"><a href="' + e(m.appUrl) + '">Open Checkpoint</a> for the detail behind each figure.</p>' : '') +
      '<p style="color:#999;font-size:11px;margin-top:24px">Prepared by Checkpoint from live ISMS data' + (agenda.asOf ? ' on ' + e(srDate(agenda.asOf)) : '') + '.</p></div>';
  }
  function securityReviewIcs(meta) {
    var m = meta || {};
    var stamp = function (iso) { return String(iso).replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z'; };
    var esc = function (s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); };
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Compliance365//Checkpoint//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + esc(m.uid || 'checkpoint-security-review'), 'DTSTAMP:' + stamp(m.stampUtc || m.startUtc), 'DTSTART:' + stamp(m.startUtc), 'DTEND:' + stamp(m.endUtc),
      'SUMMARY:' + esc(m.summary), 'DESCRIPTION:' + esc(m.description), m.location ? 'LOCATION:' + esc(m.location) : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  }
  function wallTimeToUtc(dateIso, hhmm, tz) {
    var base = Date.parse(String(dateIso).slice(0, 10) + 'T' + (hhmm || '10:00') + ':00Z');
    if (isNaN(base)) return '';
    if (!tz) return new Date(base).toISOString();
    var offsetAt = function (ms) {
      try {
        var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
        var v = {};
        parts.forEach(function (x) { v[x.type] = x.value; });
        return Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour % 24, +v.minute, +v.second) - ms;
      } catch (e) { return 0; }
    };
    var guess = base - offsetAt(base);
    guess = base - offsetAt(guess);
    return new Date(guess).toISOString();
  }

module.exports = {
  srDate, addDaysIso, securityReviewKind, securityReviewQuiet, securityReviewStatus, securityReviewFollowUps, securityReviewFollowUpHtml, securityReviewDayIn, nextSecurityReviewDate, workingDaysBefore, securityReviewFacts, securityReviewAgenda, securityReviewDue, securityReviewEmailHtml, securityReviewIcs, wallTimeToUtc,
  SECURITY_REVIEW_LENGTH, SECURITY_REVIEW_AGENDA, SECURITY_REVIEW_QUARTERLY, SECURITY_REVIEW_KICKOFF, SECURITY_REVIEW_KIND_LABEL, DONE_ACTION
};
