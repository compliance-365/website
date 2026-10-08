/* Checkpoint — monthly security review for the scheduled monitor.
 * The functions below are copied verbatim from public/checkpoint/lib.js:
 * the Function and the browser bundle share no module, so
 * test/security-review-cadence.test.mjs compares each function's source
 * and fails if they ever differ. Change one, change the other.
 */
'use strict';
  var DONE_ACTION = function (a) { return a && (a.status === 'Done' || a.status === 'Cancelled'); };
  var SECURITY_REVIEW_AGENDA = [
    { key: 'actions', title: 'Actions from last meeting', min: 5, lead: 'owner', clause: '9.3.2 a, 10.1' },
    { key: 'posture', title: 'Security posture', min: 10, lead: 'owner', clause: '9.1' },
    { key: 'incidents', title: 'Incidents and near misses', min: 10, lead: 'owner', clause: 'A.5.24 to A.5.27' },
    { key: 'risks', title: 'Risks', min: 10, lead: 'chair', clause: '6.1.2, 6.1.3, 8.2, 8.3' },
    { key: 'certification', title: 'Certification progress', min: 10, lead: 'facilitator', clause: '9.1, 7.5' },
    { key: 'people', title: 'People and suppliers', min: 5, lead: 'owner', clause: 'A.5.19 to A.5.23, A.6.1 to A.6.5' },
    { key: 'changes', title: 'Changes coming', min: 5, lead: 'chair', clause: '4.1, 4.2, 6.3' },
    { key: 'decisions', title: 'Decisions and actions', min: 5, lead: 'chair', clause: '9.3.3' }
  ];
  var SECURITY_REVIEW_QUARTERLY = [
    { key: 'access', title: 'Access review results', min: 5, lead: 'owner', clause: 'A.5.15, A.5.18, A.8.2' },
    { key: 'suppliers', title: 'Supplier and AI provider reviews', min: 5, lead: 'owner', clause: 'A.5.22' },
    { key: 'objectives', title: 'Security objectives', min: 3, lead: 'chair', clause: '6.2, 9.1' },
    { key: 'training', title: 'Awareness and policy acknowledgement', min: 2, lead: 'owner', clause: '7.2, 7.3' }
  ];
  var SECURITY_REVIEW_KICKOFF = [
    { key: 'tor', title: 'Purpose and terms of reference', min: 5, lead: 'facilitator', clause: '5.1' },
    { key: 'roles', title: 'Roles and responsibilities', min: 5, lead: 'chair', clause: '5.3' },
    { key: 'scope', title: 'Scope and exclusions', min: 5, lead: 'facilitator', clause: '4.3, 6.1.3 d' },
    { key: 'baseline', title: 'Baseline: where we start', min: 10, lead: 'owner', clause: '9.1' },
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
      if (p.actions.prior.length) f.push(p.actions.prior.filter(function (a) { return DONE_ACTION(a) || a.status === 'Closed'; }).length + ' of ' + plural(p.actions.prior.length, 'action') + ' from last meeting done');
      f.push(plural(p.actions.open, 'action') + ' open, ' + p.actions.overdue + ' overdue');
      p.actions.overdueList.slice(0, 4).forEach(function (a) { f.push('Overdue: ' + a.id + ' ' + a.title + (a.owner ? ' (' + a.owner + ')' : '')); });
    } else if (key === 'posture') {
      f.push(p.posture.score == null ? 'No posture scan yet: run one before the meeting' : 'Posture score ' + p.posture.score + '/100' + (p.posture.prev != null ? ' (' + (p.posture.score >= p.posture.prev ? '+' : '') + (p.posture.score - p.posture.prev) + ' since ' + srDate(p.since) + ')' : ''));
      if (p.posture.failing != null) f.push(plural(p.posture.failing, 'check') + ' failing');
    } else if (key === 'incidents') {
      f.push(plural(p.incidents.count, 'incident') + ' logged since ' + srDate(p.since) + ', ' + p.incidents.open + ' open');
      p.incidents.since.slice(0, 4).forEach(function (n) { f.push(n.id + ' ' + n.title + (n.severity ? ' (' + n.severity + ')' : '')); });
    } else if (key === 'risks') {
      f.push(plural(p.risks.open, 'open risk') + (p.risks.aboveAppetite == null ? '' : ', ' + p.risks.aboveAppetite + ' above appetite'));
      f.push(p.risks.added + ' added and ' + p.risks.changed + ' updated since ' + srDate(p.since));
      if (p.risks.aboveList.length) f.push('Above appetite: ' + p.risks.aboveList.join(', '));
    } else if (key === 'certification') {
      if (p.certification.readiness != null) f.push('Control readiness ' + p.certification.readiness + '%');
      f.push(plural(p.certification.docsAwaiting, 'document') + ' awaiting approval');
      if (p.certification.nextAudit) f.push('Next audit: ' + p.certification.nextAudit);
    } else if (key === 'people') {
      f.push(p.people.handovers + ' leaver hand-over' + (p.people.handovers === 1 ? '' : 's') + ', ' + p.people.retired + ' asset' + (p.people.retired === 1 ? '' : 's') + ' retired, ' + p.people.vendorsAdded + ' supplier' + (p.people.vendorsAdded === 1 ? '' : 's') + ' added');
      if (p.people.certsExpiring.length) f.push('Supplier certificates expiring within 60 days: ' + p.people.certsExpiring.join(', '));
    } else if (key === 'changes') {
      f.push('New products or AI features, customer contract terms, regulation, team changes');
    } else if (key === 'decisions') {
      f.push('Each decision recorded with an owner and a due date');
    } else if (key === 'access') {
      f.push(p.quarterly.accessReview ? 'Last access review completed ' + srDate(p.quarterly.accessReview) : 'No access review recorded yet');
    } else if (key === 'suppliers') {
      f.push(plural(p.quarterly.suppliersDue, 'supplier review') + ' due within 30 days');
    } else if (key === 'objectives') {
      f.push(plural(p.quarterly.objectives.open, 'objective') + ' in progress, ' + p.quarterly.objectives.atRisk + ' at risk');
    } else if (key === 'training') {
      f.push(p.quarterly.attestPct == null ? 'No policy acknowledgement campaign yet' : 'Latest policy acknowledgement: ' + p.quarterly.attestPct + '% of staff');
    } else if (key === 'baseline') {
      f.push('Record today\u2019s posture, risks, open actions and documents as the starting point');
    } else if (key === 'mr') {
      f.push('All seven Clause 9.3.2 inputs, pre-filled in Checkpoint; decisions on improvements, changes to the ISMS and resources recorded as 9.3.3 outputs');
    }
    return f;
  }
  function securityReviewAgenda(setup, n, pack, rec) {
    var s = setup || {}, r = rec || {};
    var kind = securityReviewKind(n, s.mrEvery);
    var custom = (s.customItems || []).filter(function (i) { return i && i.title && (i.every !== 'quarterly' || kind === 'quarterly' || kind === 'mr'); });
    var items = [];
    if (kind === 'kickoff') items = items.concat(SECURITY_REVIEW_KICKOFF);
    items = items.concat(SECURITY_REVIEW_AGENDA.slice(0, -1), custom);
    if (kind === 'quarterly' || kind === 'mr') items = items.concat(SECURITY_REVIEW_QUARTERLY);
    if (kind === 'mr') items.push({ key: 'mr', title: 'Management review (Clause 9.3)', min: 15, lead: 'chair', clause: '9.3' });
    items = items.concat((r.extra || []).map(function (x) { return { key: x.key, title: x.title, min: x.min || 5, lead: x.lead || 'owner', clause: '', added: x.by || true }; }));
    var skip = r.skip || [];
    items = items.filter(function (i) { return skip.indexOf(i.key) === -1; });
    if (r.order && r.order.length) {
      var pos = function (k) { var i = r.order.indexOf(k); return i === -1 ? 999 : i; };
      items = items.map(function (it, i) { return { it: it, i: i }; }).sort(function (a, b) { return (pos(a.it.key) - pos(b.it.key)) || (a.i - b.i); }).map(function (x) { return x.it; });
    }
    items.push(SECURITY_REVIEW_AGENDA[SECURITY_REVIEW_AGENDA.length - 1]);
    var who = { chair: s.chair || 'Chair', owner: s.owner || 'ISMS owner', facilitator: s.facilitator || s.owner || 'ISMS owner' };
    var t = 0;
    var mmss = function (m) { return Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); };
    var out = items.map(function (it) {
      var row = { key: it.key, title: it.title, start: mmss(t), end: mmss(t + it.min), min: it.min, lead: who[it.lead] || it.lead, clause: it.clause || '', facts: securityReviewFacts(it.key, pack), custom: !!it.custom, added: it.added || '' };
      t += it.min;
      return row;
    });
    return { n: Number(n) || 1, kind: kind, label: SECURITY_REVIEW_KIND_LABEL[kind], minutes: t, items: out };
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
  function securityReviewEmailHtml(agenda, meta) {
    var e = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var m = meta || {};
    var safeLink = /^https:\/\//i.test(m.teamsLink || '') ? m.teamsLink : '';
    return '<div style="font-family:Arial,sans-serif;color:#222;max-width:680px">' +
      '<h2 style="margin-bottom:4px">' + e(m.org || 'Security') + ' security review ' + agenda.n + ': ' + e(agenda.label) + '</h2>' +
      '<p style="color:#666;font-size:13px;margin-top:0">' + e(m.date) + (m.time ? ' at ' + e(m.time) : '') + ', ' + agenda.minutes + ' minutes' + (safeLink ? ' \u00b7 <a href="' + e(safeLink) + '">Join on Teams</a>' : '') + '</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
      agenda.items.map(function (i) {
        return '<tr><td style="padding:8px 6px;border-bottom:1px solid #eee;white-space:nowrap;color:#666;vertical-align:top">' + e(i.start) + '</td>' +
          '<td style="padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top"><b>' + e(i.title) + '</b> <span style="color:#888">(' + e(i.lead) + ')</span>' +
          (i.facts.length ? '<ul style="margin:4px 0 0 16px;padding:0;color:#444">' + i.facts.map(function (f) { return '<li>' + e(f) + '</li>'; }).join('') + '</ul>' : '') + '</td>' +
          '<td style="padding:8px 6px;border-bottom:1px solid #eee;color:#999;font-size:11px;white-space:nowrap;vertical-align:top">' + e(i.clause) + '</td></tr>';
      }).join('') + '</table>' +
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
  srDate, addDaysIso, securityReviewKind, securityReviewDayIn, nextSecurityReviewDate, workingDaysBefore, securityReviewFacts, securityReviewAgenda, securityReviewDue, securityReviewEmailHtml, securityReviewIcs, wallTimeToUtc,
  SECURITY_REVIEW_AGENDA, SECURITY_REVIEW_QUARTERLY, SECURITY_REVIEW_KICKOFF, SECURITY_REVIEW_KIND_LABEL, DONE_ACTION
};
