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
    { key: 'escalations', title: 'Needs a decision', min: 5, lead: 'chair', clause: '9.3.3, 10.1', optional: true },
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
  /* Topics leadership looks at once a year, or sooner when the register
     behind them changes: they join whichever meeting they fall due at,
     with their own time, instead of filling every month. */
  var SECURITY_REVIEW_PERIODIC = [
    { key: 'context', title: 'Interested parties and legal requirements', min: 8, lead: 'owner', clause: '4.2, 9.3.2 c and e, A.5.31' },
    { key: 'issues', title: 'Internal and external issues, and scope', min: 6, lead: 'chair', clause: '4.1, 4.3, 9.3.2 b' },
    { key: 'audits', title: 'Audit results', min: 6, lead: 'owner', clause: '9.2, 9.3.2 d' },
    { key: 'resources', title: 'Resources', min: 5, lead: 'chair', clause: '7.1, 9.3.3' }
  ];
  /* Clause 9.3.2 a to g, and the agenda items that cover each. "all"
     means every listed item must have been covered in the cycle. */
  var SECURITY_REVIEW_COVERAGE = [
    { letter: 'a', label: 'Actions from previous reviews', keys: ['actions'] },
    { letter: 'b', label: 'Internal and external issues', keys: ['issues', 'scope'] },
    { letter: 'c', label: 'Interested parties\u2019 needs', keys: ['context'] },
    { letter: 'd', label: 'Performance: incidents, monitoring, audits, objectives', keys: ['incidents', 'posture', 'audits', 'objectives'], all: true },
    { letter: 'e', label: 'Feedback from interested parties', keys: ['context'] },
    { letter: 'f', label: 'Risks and risk treatment', keys: ['risks'] },
    { letter: 'g', label: 'Opportunities for improvement', keys: ['decisions'] }
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
    if (key === 'escalations' && !(p && p.actions && (p.actions.stuck || []).length)) return 'skip';
    if (!p) return '';
    if (key === 'incidents' && !p.incidents.count && !p.incidents.open) return 'No incidents since ' + srDate(p.since);
    if (key === 'risks' && !p.risks.added && !p.risks.changed && !p.risks.aboveAppetite) return 'No new or changed risks, none above appetite';
    if (key === 'actions' && !p.actions.overdue && !(p.actions.prior || []).length && !(p.actions.dueSoon || []).length) return 'No actions overdue or due soon';
    if (key === 'posture' && p.posture.score != null && p.posture.prev === p.posture.score && !(p.posture.failingTop || []).length && !(p.threat && (p.threat.remediationOpen || p.threat.awaiting))) return 'Posture score unchanged at ' + p.posture.score + '/100';
    if (key === 'certification' && p.certification.certified) return 'skip';
    if (key === 'certification' && !p.certification.nextAudit && !p.certification.docsAwaiting && (p.certification.readiness == null || p.certification.readiness >= 100)) return 'skip';
    if (key === 'people' && !p.people.handovers && !p.people.retired && !p.people.vendorsAdded && !p.people.certsExpiring.length && !(p.people.supplierGaps || []).length) return 'No leavers, retired assets or supplier changes';
    return '';
  }
  /* The agenda keys a held meeting covered. Meetings recorded before
     1.144.0 hold no list: their standing items are assumed, and a
     management review meeting then covered every input. */
  function securityReviewCovered(rec, mrEvery) {
    if (rec && Array.isArray(rec.covered)) return rec.covered;
    var kind = securityReviewKind(rec && rec.n, mrEvery);
    var k = ['actions', 'risks', 'incidents', 'posture', 'decisions'];
    if (kind === 'kickoff') k.push('scope');
    if (kind === 'quarterly' || kind === 'mr') k.push('objectives');
    if (kind === 'mr') k = k.concat(['context', 'issues', 'audits', 'resources', 'mr']);
    return k;
  }
  /* The last date each agenda key was covered: held meetings, plus
     management reviews recorded on their own (which cover everything). */
  function securityReviewLastCovered(meetings, reviews, mrEvery) {
    var last = {};
    var mark = function (k, date, ref) { if (date && (!last[k] || date > last[k].date)) last[k] = { date: date, ref: ref }; };
    (meetings || []).filter(function (r) { return r && r.status === 'Held' && r.date; }).forEach(function (r) {
      securityReviewCovered(r, mrEvery).forEach(function (k) { mark(k, String(r.date).slice(0, 10), r.id); });
    });
    var every = ['actions', 'risks', 'incidents', 'posture', 'decisions', 'scope', 'objectives', 'context', 'issues', 'audits', 'resources', 'mr'];
    (reviews || []).filter(function (r) { return r && r.date; }).forEach(function (r) {
      every.forEach(function (k) { mark(k, String(r.date).slice(0, 10), r.id); });
    });
    return last;
  }
  /* Which yearly topics are due at the next meeting: not covered for
     about a year (350 days, so the yearly meeting catches them and the
     one before it does not), or their register changed since they were.
     changes = { key: { date, what } }; facts = { key: [lines] }. A topic
     never covered waits for the management review meeting (never). */
  function securityReviewPeriodic(meetings, reviews, today, mrEvery, changes, facts) {
    var last = securityReviewLastCovered(meetings, reviews, mrEvery), ch = changes || {}, fx = facts || {};
    var cutoff = addDaysIso(today, -350), out = [];
    SECURITY_REVIEW_PERIODIC.forEach(function (i) {
      var l = last[i.key] || (i.key === 'issues' ? last.scope : null), c = ch[i.key];
      var reason = '';
      if (c && c.date && (!l || c.date > l.date)) reason = (c.what || 'The register changed') + ' on ' + srDate(c.date) + (l ? ', last reviewed ' + srDate(l.date) : '');
      else if (!l) reason = 'Not reviewed by leadership yet';
      else if (l.date <= cutoff) reason = 'Last reviewed ' + srDate(l.date) + ': due once a year';
      if (reason) out.push({ key: i.key, reason: reason, never: !l && !(c && c.date), facts: (fx[i.key] || []).slice(0, 4) });
    });
    return out;
  }
  /* Clause 9.3.2 a to g over the last 12 months, and the conclusion. */
  function securityReviewCoverage(meetings, reviews, today, mrEvery) {
    var last = securityReviewLastCovered(meetings, reviews, mrEvery), from = addDaysIso(today, -365);
    var ok = function (k) { return last[k] && last[k].date > from; };
    var rows = SECURITY_REVIEW_COVERAGE.map(function (c) {
      var hit = c.keys.filter(ok), missing = c.all ? c.keys.filter(function (k) { return !ok(k); }) : hit.length ? [] : c.keys.slice(0, 1);
      var dates = hit.map(function (k) { return last[k].date; }).sort();
      return { letter: c.letter, label: c.label, ok: !missing.length, last: c.all ? (missing.length ? '' : dates[0]) : dates[dates.length - 1] || '', missing: missing };
    });
    var concl = ok('mr') ? last.mr : null;
    return { rows: rows, conclusion: concl ? { ok: true, last: concl.date, ref: concl.ref } : { ok: false, last: last.mr ? last.mr.date : '' }, complete: rows.every(function (r) { return r.ok; }) && !!concl, since: from };
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
    var th = p.threat;
    if (th && (th.affected || th.awaiting)) {
      add('threat', 'Threat intel', th.pastDue || th.ransomwareOpen ? 'red' : th.remediationOpen || th.awaiting ? 'amber' : 'green',
        th.awaiting ? th.awaiting + ' relevant to assess' + (th.pastDue ? ', ' + th.pastDue + ' past fix-by date' : '') : th.remediationOpen ? th.remediationOpen + ' remediation' + (th.remediationOpen === 1 ? '' : 's') + ' open' : 'Affected advisories remediated');
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
      '<p>At the leadership security meeting on ' + e(srDate(review.date)) + ' you took on ' + (o.items.length === 1 ? 'this action' : 'these actions') + '. ' + (o.items.length === 1 ? 'It is' : 'They are') + ' still marked Open:</p><ul>' +
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
    var per = (p.periodic || []).filter(function (x) { return x && x.key === key; })[0];
    if (per) { f.push(per.reason); (per.facts || []).forEach(function (x) { f.push(x); }); return f; }
    if (key === 'actions') {
      var prior = p.actions.prior || [];
      if (prior.length) f.push('Decisions from last meeting: ' + prior.filter(function (a) { return DONE_ACTION(a) || a.status === 'Closed'; }).length + ' of ' + prior.length + ' done');
      var stuckIds = (p.actions.stuck || []).map(function (a) { return a.id; });
      var rest = p.actions.overdueList.filter(function (a) { return stuckIds.indexOf(a.id) === -1; });
      f.push(p.actions.overdue ? plural(p.actions.overdue, 'action') + ' overdue' + (stuckIds.length ? ' (' + stuckIds.length + ' for a decision below)' : '') + (rest.length > 3 ? ', the three oldest:' : rest.length && stuckIds.length ? ', the others:' : '') : 'Nothing overdue; ' + plural(p.actions.open, 'action') + ' open');
      rest.slice(0, 3).forEach(function (a) { f.push(a.id + ' ' + a.title + (a.owner ? ' (' + a.owner + ')' : '')); });
      var soonA = p.actions.dueSoon || [];
      if (soonA.length) f.push(plural(soonA.length, 'action') + ' due in the next two weeks: ' + soonA.slice(0, 3).map(function (a) { return a.id + (a.owner ? ' (' + a.owner + ')' : ''); }).join(', ') + (soonA.length > 3 ? ' and more' : ''));
    } else if (key === 'escalations') {
      (p.actions.stuck || []).forEach(function (a) { f.push(a.id + ' ' + a.title + (a.owner ? ' (' + a.owner + ')' : '') + ', overdue since ' + srDate(a.due) + ': extend, reassign or accept the risk'); });
    } else if (key === 'posture') {
      f.push(p.posture.score == null ? 'No posture scan yet: run one before the meeting' : 'Posture score ' + p.posture.score + '/100' + (p.posture.prev != null ? ' (' + (p.posture.score >= p.posture.prev ? '+' : '') + (p.posture.score - p.posture.prev) + ' since ' + srDate(p.since) + ')' : ''));
      (p.posture.failingTop || []).forEach(function (c) { f.push('Failing: ' + c); });
      var th = p.threat;
      if (th && th.affected) f.push('Threat intel: ' + plural(th.affected, 'exploited vulnerability', 'exploited vulnerabilities') + ' affect' + (th.affected === 1 ? 's' : '') + ' us' + (th.remediationOpen ? ', ' + th.remediationOpen + ' remediation action' + (th.remediationOpen === 1 ? '' : 's') + ' open' : ', all remediated'));
      if (th && th.awaiting) f.push('Threat intel: ' + plural(th.awaiting, 'advisory', 'advisories') + ' relevant to us not yet assessed' + (th.pastDue ? ', ' + th.pastDue + ' past CISA\u2019s fix-by date' : ''));
    } else if (key === 'incidents') {
      f.push(plural(p.incidents.count, 'incident') + ' since ' + srDate(p.since) + (p.incidents.open ? ', ' + p.incidents.open + ' still open' : ''));
      p.incidents.since.slice(0, 3).forEach(function (n) { f.push(n.id + ' ' + n.title + (n.severity ? ' (' + n.severity + ')' : '') + ((n.risks || []).length ? ': risk ' + n.risks.join(', ') : '')); });
      if (p.incidents.unlinked) f.push(plural(p.incidents.unlinked, 'incident') + ' not linked to a risk: is the risk in the register, and is its likelihood still right?');
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
      var sg = p.people.supplierGaps || [];
      if (sg.length) f.push('Questionnaire gaps not yet treated: ' + sg.slice(0, 3).map(function (g) { return g.name + ' (' + g.count + ')'; }).join(', ') + (sg.length > 3 ? ' and more' : ''));
    } else if (key === 'decisions') {
      var att = p.attendance || {};
      if (att.lastQuorum === false) f.push('The last meeting was held without the chair or the ISMS owner: confirm its decisions');
      (att.missedTwice || []).forEach(function (x) { f.push('Attendance: ' + x + ' missed the last two meetings'); });
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
      f.push('The chair concludes whether the ISMS is still suitable, adequate and effective, and records any changes needed to it and its resources. This meeting is the Clause 9.3 management review');
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
    var due = kind === 'kickoff' ? [] : ((pack && pack.periodic) || []).filter(function (x) { return x && (!x.never || kind === 'mr'); }).map(function (x) { return x.key; });
    items = items.concat(SECURITY_REVIEW_PERIODIC.filter(function (i) { return due.indexOf(i.key) !== -1; }).map(function (i) { return { key: i.key, title: i.title, min: i.min, lead: i.lead, clause: i.clause, periodic: true }; }));
    if (kind === 'mr') items.push({ key: 'mr', title: 'Is the ISMS suitable, adequate and effective?', min: 15, lead: 'chair', clause: '9.3' });
    items = items.concat((r.extra || []).map(function (x) { return { key: x.key, title: x.title, min: x.min || 5, lead: x.lead || 'owner', clause: '', added: x.by || true }; }));
    var skip = r.skip || [];
    var quiet = [], quietKeys = [];
    items = items.filter(function (i) {
      if (skip.indexOf(i.key) !== -1) return false;
      if (kind === 'kickoff' && i.key === 'certification') return false;
      var q = securityReviewQuiet(i.key, pack);
      if (q === 'skip') return false;
      if (q && kind !== 'kickoff') { quiet.push(q); quietKeys.push(i.key); return false; }
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
    var own = function (it) { return it.added || it.periodic; };
    var fixed = items.filter(own).reduce(function (m, it) { return m + it.min; }, 0);
    target += fixed - items.filter(function (it) { return it.added; }).reduce(function (m, it) { return m + it.min; }, 0);
    var scale = natural > fixed && target > fixed ? (target - fixed) / (natural - fixed) : 1;
    if (scale > 1.5) scale = 1.5;
    var mins = items.map(function (it) { return own(it) ? it.min : Math.max(3, Math.round(it.min * scale)); });
    var diff = Math.round(Math.min(target, natural * scale + 0.5)) - mins.reduce(function (m, x) { return m + x; }, 0);
    if (diff && Math.abs(diff) <= 3) {
      var big = mins.length - 1;
      mins.forEach(function (m, i) { if (!own(items[i]) && (own(items[big]) || m > mins[big])) big = i; });
      mins[big] = Math.max(3, mins[big] + diff);
    }
    var who = { chair: s.chair || 'Chair', owner: s.owner || 'ISMS owner', facilitator: s.facilitator || s.owner || 'ISMS owner' };
    var t = 0;
    var mmss = function (m) { return Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); };
    var out = items.map(function (it, idx) {
      var row = { key: it.key, title: it.key === 'escalations' ? 'Needs a decision from ' + (s.chair || 'the chair') : it.title, start: mmss(t), end: mmss(t + mins[idx]), min: mins[idx], lead: who[it.lead] || it.lead, clause: it.clause || '', facts: securityReviewFacts(it.key, pack), custom: !!it.custom, added: it.added || '' };
      t += mins[idx];
      return row;
    });
    return { n: Number(n) || 1, kind: kind, label: SECURITY_REVIEW_KIND_LABEL[kind], minutes: t, items: out, quiet: quiet, quietKeys: quietKeys,
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
      '<h2 style="margin-bottom:4px">' + e(m.org || 'Security') + ' leadership security meeting ' + agenda.n + (agenda.kind === 'monthly' ? '' : ': ' + e(agenda.label)) + '</h2>' +
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
    var esc = function (s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); };
    var octets = function (ch) { var c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };
    var fold = function (line) {
      var out = [], cur = '', n = 0, max = 75;
      Array.from(line).forEach(function (ch) {
        var w = octets(ch);
        if (n + w > max) { out.push(cur); cur = ' '; n = 1; max = 75; }
        cur += ch; n += w;
      });
      out.push(cur);
      return out.join('\r\n');
    };
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Compliance365//Checkpoint//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + esc(m.uid || 'checkpoint-security-review'), 'DTSTAMP:' + stamp(m.stampUtc || m.startUtc), 'DTSTART:' + stamp(m.startUtc), 'DTEND:' + stamp(m.endUtc),
      'SUMMARY:' + esc(m.summary), 'DESCRIPTION:' + esc(m.description), m.html ? 'X-ALT-DESC;FMTTYPE=text/html:' + esc(m.html) : '', m.location ? 'LOCATION:' + esc(m.location) : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).map(fold).join('\r\n');
  }
  function securityReviewInviteText(agenda, status, meta) {
    var m = meta || {};
    var word = { red: 'Needs attention', amber: 'Watch', green: 'On track' };
    var mark = { red: '\u25cf', amber: '\u25d0', green: '\u25cb' };
    var lines = [];
    if ((status || []).length) {
      lines.push('AT A GLANCE');
      status.forEach(function (x) { lines.push(mark[x.rag] + ' ' + x.label + ': ' + x.headline + ' (' + word[x.rag] + ')'); });
      lines.push('');
    }
    lines.push('AGENDA (' + agenda.minutes + ' minutes)');
    agenda.items.forEach(function (i) {
      lines.push(i.start + '  ' + i.title + ' (' + i.lead + ')');
      i.facts.forEach(function (f) { lines.push('      - ' + f); });
    });
    if ((agenda.quiet || []).length) { lines.push(''); lines.push('Nothing to report: ' + agenda.quiet.join('; ') + '.'); }
    if (/^https:\/\//i.test(m.teamsLink || '')) { lines.push(''); lines.push('Join on Teams: ' + m.teamsLink); }
    if (/^https:\/\//i.test(m.appUrl || '')) { lines.push(''); lines.push('Detail behind each figure: ' + m.appUrl); }
    return lines.join('\n');
  }
  function srNamePresent(name, present) {
    var p = String(present || '').toLowerCase(), n = String(name || '').toLowerCase().trim();
    if (!n) return true;
    if (p.indexOf(n) !== -1) return true;
    var parts = n.split(/\s+/).filter(function (x) { return x.length >= 3; });
    var last = parts[parts.length - 1];
    return !!last && parts.length > 1 && new RegExp('(^|[^a-z])' + last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(p);
  }
  function securityReviewAttendance(present, setup) {
    var s = setup || {}, seen = {}, expected = [];
    [['chair', 'Chair'], ['owner', 'ISMS owner'], ['facilitator', 'Facilitator']].forEach(function (r) {
      var name = String(s[r[0]] || '').trim();
      if (!name || seen[name.toLowerCase()]) return;
      seen[name.toLowerCase()] = true;
      expected.push({ role: r[1], key: r[0], name: name, present: srNamePresent(name, present) });
    });
    var missing = function (k) { return expected.some(function (e) { return e.key === k && !e.present; }); };
    return { expected: expected, absent: expected.filter(function (e) { return !e.present; }).map(function (e) { return e.name + ' (' + e.role.toLowerCase() + ')'; }),
      quorum: !missing('chair') && !missing('owner') };
  }
  function securityReviewAbsences(reviews, setup) {
    var held = (reviews || []).filter(function (r) { return r && r.status === 'Held'; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
    var out = { missedTwice: [], lastQuorum: true };
    if (!held.length) return out;
    var a0 = securityReviewAttendance(held[0].present, setup);
    out.lastQuorum = a0.quorum;
    if (held.length < 2) return out;
    var a1 = securityReviewAttendance(held[1].present, setup);
    out.missedTwice = a0.absent.filter(function (x) { return a1.absent.indexOf(x) !== -1; });
    return out;
  }
  function securityReviewTrend(reviews) {
    return (reviews || []).filter(function (r) { return r && r.pack && r.date; }).slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (r) {
      var p = r.pack;
      return { n: r.n, date: r.date, score: p.posture ? p.posture.score : null, overdue: p.actions ? p.actions.overdue : null, aboveAppetite: p.risks ? p.risks.aboveAppetite : null, incidents: p.incidents ? p.incidents.count : null };
    });
  }
  function chairSummary(p, extra) {
    var x = extra || {}, well = [], decide = [], trend = [];
    if (!p) return { well: well, decide: decide, trend: trend };
    var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
    if (!p.actions.overdue) well.push('No security actions are overdue.');
    if (p.actions.closedSince) well.push(plural(p.actions.closedSince, 'action') + ' finished since the last meeting.');
    if (!p.incidents.count) well.push('No security incidents since ' + srDate(p.since) + '.');
    if (p.posture.score != null && p.posture.prev != null && p.posture.score > p.posture.prev) well.push('The Microsoft 365 security score rose from ' + p.posture.prev + ' to ' + p.posture.score + ' out of 100.');
    if (!p.risks.aboveAppetite && p.risks.aboveAppetite != null) well.push('No risk is above the level you have agreed to accept.');
    (p.actions.stuck || []).forEach(function (a) { decide.push(a.title + (a.owner ? ' (' + a.owner + ')' : '') + ' has been overdue since ' + srDate(a.due) + ': give it more time, give it to someone else, or accept the risk.'); });
    if (p.risks.aboveAppetite) decide.push(plural(p.risks.aboveAppetite, 'risk is', 'risks are') + ' above the level you have agreed to accept: decide whether to reduce or accept ' + (p.risks.aboveAppetite === 1 ? 'it' : 'them') + '.');
    (x.approvals || []).forEach(function (n) { decide.push(String(n).replace(/\.html$/i, '') + ' is waiting for your approval.'); });
    var serious = (p.incidents.since || []).filter(function (n) { return /high|critical/i.test(n.severity || '') && !/closed/i.test(n.status || ''); });
    serious.forEach(function (n) { decide.push('A serious incident is still open: ' + n.title + '.'); });
    (x.gaps || []).filter(function (g) { return g.severity === 'fail'; }).slice(0, 3).forEach(function (g) { decide.push(g.title + ': ' + g.issue.charAt(0).toLowerCase() + g.issue.slice(1) + '.'); });
    if (p.posture.score != null) trend.push('Microsoft 365 security score ' + p.posture.score + ' out of 100' + (p.posture.prev != null && p.posture.prev !== p.posture.score ? (p.posture.score > p.posture.prev ? ', up ' : ', down ') + Math.abs(p.posture.score - p.posture.prev) + ' since last month' : ', unchanged') + '.');
    var t = (x.trend || []).filter(function (r) { return r && r.overdue != null; });
    if (t.length >= 2) trend.push('Overdue actions ' + (t[t.length - 1].overdue < t[0].overdue ? 'down' : t[t.length - 1].overdue > t[0].overdue ? 'up' : 'steady') + ' from ' + t[0].overdue + ' to ' + t[t.length - 1].overdue + ' over ' + t.length + ' months.');
    else trend.push(plural(p.actions.overdue, 'action') + ' overdue now, of ' + p.actions.open + ' open.');
    if (p.certification && !p.certification.certified && p.certification.readiness != null) trend.push('Ready for certification: ' + p.certification.readiness + '%.');
    if (x.health && typeof x.health.score === 'number') trend.push('Overall health of the security programme: ' + x.health.score + ' out of 100.');
    if (x.changes && x.changes.total) {
      var areas = x.changes.groups.slice().sort(function (a, b) { return b.count - a.count; }).slice(0, 3).map(function (g) { return g.label.toLowerCase(); });
      trend.push(plural(x.changes.total, 'change') + ' to the security programme this month, mostly ' + areas.join(', ') + '.');
    }
    return { well: well, decide: decide, trend: trend };
  }
  function chairSummaryHtml(sum, meta) {
    var e = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var m = meta || {};
    var list = function (title, items, empty) { return '<h3 style="font-size:15px;margin:20px 0 6px">' + e(title) + '</h3>' + (items.length ? '<ul style="margin:0 0 0 18px;padding:0;font-size:14px;line-height:1.6">' + items.map(function (i) { return '<li>' + e(i) + '</li>'; }).join('') + '</ul>' : '<p style="font-size:14px;color:#555;margin:0">' + e(empty) + '</p>'); };
    return '<div style="font-family:Arial,sans-serif;color:#222;max-width:640px">' +
      '<h2 style="margin-bottom:4px">' + e(m.org || 'Security') + ': the month in brief</h2>' +
      '<p style="color:#666;font-size:13px;margin-top:0">For ' + e(m.chair || 'top management') + (m.date ? ', ' + e(m.date) : '') + '</p>' +
      list('Needs your decision', sum.decide, 'Nothing needs your decision this month.') +
      list('Going well', sum.well, 'Nothing to highlight this month.') +
      list('Direction of travel', sum.trend, 'Not enough history yet.') +
      (/^https:\/\//i.test(m.appUrl || '') ? '<p style="margin-top:18px;font-size:14px"><a href="' + e(m.appUrl) + '">Open Checkpoint</a> for the detail.</p>' : '') +
      '<p style="color:#999;font-size:11px;margin-top:24px">Prepared by Checkpoint from the live records.</p></div>';
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
  srDate, addDaysIso, securityReviewCovered, securityReviewLastCovered, securityReviewPeriodic, securityReviewCoverage, SECURITY_REVIEW_PERIODIC, SECURITY_REVIEW_COVERAGE, securityReviewKind, securityReviewQuiet, securityReviewStatus, securityReviewFollowUps, securityReviewFollowUpHtml, securityReviewDayIn, nextSecurityReviewDate, workingDaysBefore, securityReviewFacts, securityReviewAgenda, securityReviewDue, securityReviewEmailHtml, securityReviewIcs, securityReviewInviteText, srNamePresent, securityReviewAttendance, securityReviewAbsences, securityReviewTrend, chairSummary, chairSummaryHtml, wallTimeToUtc,
  SECURITY_REVIEW_LENGTH, SECURITY_REVIEW_AGENDA, SECURITY_REVIEW_QUARTERLY, SECURITY_REVIEW_KICKOFF, SECURITY_REVIEW_KIND_LABEL, DONE_ACTION
};
