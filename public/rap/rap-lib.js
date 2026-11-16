/* RAP Tracker — pure logic (no DOM, no network), shared by the app and
   the tests. A prototype modelled on Checkpoint: one Reconciliation
   Action Plan (RAP) at a time, of one type, with its deliverables,
   key dates, Working Group and reporting.

   The deliverable templates below are SAMPLES organised the way
   Reconciliation Australia's RAP templates are (four areas, a
   deliverable, a timeline and a responsible role). They are written
   from general knowledge, not copied from the current templates:
   every client replaces them with the wording of their own endorsed
   RAP, and they must be checked against Reconciliation Australia's
   current templates before this goes beyond a prototype. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RapLib = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RAP_TYPES = {
    reflect: { name: 'Reflect', months: 18, blurb: 'Scoping: set up the RAP Working Group, build relationships and decide your vision for reconciliation.' },
    innovate: { name: 'Innovate', months: 24, blurb: 'Develop and test initiatives, and set commitments for the future.' },
    stretch: { name: 'Stretch', months: 36, blurb: 'Embed reconciliation in business as usual, with measurable targets.' },
    elevate: { name: 'Elevate', months: 36, blurb: 'By invitation from Reconciliation Australia: leadership and advocacy beyond your own organisation.' }
  };
  var TYPE_ORDER = ['reflect', 'innovate', 'stretch', 'elevate'];
  var AREAS = ['Relationships', 'Respect', 'Opportunities', 'Governance'];
  var STATUSES = ['Not started', 'In progress', 'Complete', 'Deferred'];
  var RAP_STATUSES = ['Drafting', 'With Reconciliation Australia', 'Endorsed', 'Live', 'Complete'];

  /* Template rows. `types` = which RAP types include it; `due` = months
     after the RAP starts, or `annual` = once a year at that event. */
  var TEMPLATE = [
    { area: 'Relationships', action: 'Establish and maintain mutually beneficial relationships with Aboriginal and Torres Strait Islander stakeholders and organisations.', deliverable: 'Identify Aboriginal and Torres Strait Islander stakeholders and organisations within our local area or sphere of influence.', due: 3, role: 'RAP Champion', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Relationships', action: 'Establish and maintain mutually beneficial relationships with Aboriginal and Torres Strait Islander stakeholders and organisations.', deliverable: 'Develop and implement an engagement plan to work with Aboriginal and Torres Strait Islander stakeholders and organisations.', due: 6, role: 'RAP Champion', types: ['innovate', 'stretch', 'elevate'] },
    { area: 'Relationships', action: 'Build relationships through celebrating National Reconciliation Week (NRW).', deliverable: 'Circulate Reconciliation Australia’s NRW resources and reconciliation materials to our staff.', annual: 'nrw', role: 'Communications lead', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Relationships', action: 'Build relationships through celebrating National Reconciliation Week (NRW).', deliverable: 'RAP Working Group members to participate in an external NRW event.', annual: 'nrw', role: 'RAP Working Group', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Relationships', action: 'Promote reconciliation through our sphere of influence.', deliverable: 'Communicate our commitment to reconciliation to all staff.', due: 2, role: 'CEO', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Relationships', action: 'Promote positive race relations through anti-discrimination strategies.', deliverable: 'Research best practice and policies in areas of race relations and anti-discrimination.', due: 6, role: 'People and culture lead', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Relationships', action: 'Promote positive race relations through anti-discrimination strategies.', deliverable: 'Develop, implement and communicate an anti-discrimination policy for our organisation.', due: 9, role: 'People and culture lead', types: ['innovate', 'stretch', 'elevate'] },
    { area: 'Respect', action: 'Increase understanding, value and recognition of Aboriginal and Torres Strait Islander cultures, histories, knowledge and rights through cultural learning.', deliverable: 'Conduct a review of cultural learning needs within our organisation.', due: 4, role: 'People and culture lead', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Respect', action: 'Increase understanding, value and recognition of Aboriginal and Torres Strait Islander cultures, histories, knowledge and rights through cultural learning.', deliverable: 'Develop and implement a cultural learning strategy for our staff.', due: 9, role: 'People and culture lead', types: ['innovate', 'stretch', 'elevate'] },
    { area: 'Respect', action: 'Demonstrate respect to Aboriginal and Torres Strait Islander peoples by observing cultural protocols.', deliverable: 'Develop an understanding of the local Traditional Owners or Custodians of the lands and waters within our operational area.', due: 3, role: 'RAP Working Group', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Respect', action: 'Demonstrate respect to Aboriginal and Torres Strait Islander peoples by observing cultural protocols.', deliverable: 'Increase staff understanding of the purpose and significance behind Acknowledgement of Country and Welcome to Country protocols.', due: 6, role: 'RAP Working Group', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Respect', action: 'Build respect for Aboriginal and Torres Strait Islander cultures and histories by celebrating NAIDOC Week.', deliverable: 'Raise awareness and share information among our staff about the meaning of NAIDOC Week.', annual: 'naidoc', role: 'Communications lead', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Respect', action: 'Build respect for Aboriginal and Torres Strait Islander cultures and histories by celebrating NAIDOC Week.', deliverable: 'Review HR policies and procedures to remove barriers to staff participating in NAIDOC Week.', due: 4, role: 'People and culture lead', types: ['innovate', 'stretch', 'elevate'] },
    { area: 'Opportunities', action: 'Improve employment outcomes by increasing Aboriginal and Torres Strait Islander recruitment, retention and professional development.', deliverable: 'Develop a business case for Aboriginal and Torres Strait Islander employment within our organisation.', due: 9, role: 'People and culture lead', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Opportunities', action: 'Improve employment outcomes by increasing Aboriginal and Torres Strait Islander recruitment, retention and professional development.', deliverable: 'Set and track a measurable target for Aboriginal and Torres Strait Islander employment.', due: 12, role: 'People and culture lead', types: ['stretch', 'elevate'] },
    { area: 'Opportunities', action: 'Increase Aboriginal and Torres Strait Islander supplier diversity to support improved economic and social outcomes.', deliverable: 'Investigate Supply Nation membership and develop a list of Aboriginal and Torres Strait Islander businesses we could procure from.', due: 6, role: 'Procurement lead', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Opportunities', action: 'Increase Aboriginal and Torres Strait Islander supplier diversity to support improved economic and social outcomes.', deliverable: 'Set and track a measurable target for procurement from Aboriginal and Torres Strait Islander businesses.', due: 12, role: 'Procurement lead', types: ['stretch', 'elevate'] },
    { area: 'Governance', action: 'Establish and maintain an effective RAP Working Group (RWG) to drive governance of the RAP.', deliverable: 'Form a RWG, including Aboriginal and Torres Strait Islander representation, and agree its Terms of Reference.', due: 1, role: 'RAP Champion', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Governance', action: 'Establish and maintain an effective RAP Working Group (RWG) to drive governance of the RAP.', deliverable: 'Meet at least four times a year to drive and monitor RAP implementation.', annual: 'rwg', role: 'RAP Champion', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Governance', action: 'Provide appropriate support for effective implementation of RAP commitments.', deliverable: 'Engage our senior leaders in the delivery of RAP commitments, and appoint a senior leader to champion the RAP.', due: 2, role: 'CEO', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Governance', action: 'Build accountability and transparency through reporting RAP achievements, challenges and learnings.', deliverable: 'Complete and submit the annual RAP Impact Survey to Reconciliation Australia.', annual: 'survey', role: 'RAP Champion', types: ['reflect', 'innovate', 'stretch', 'elevate'] },
    { area: 'Governance', action: 'Build accountability and transparency through reporting RAP achievements, challenges and learnings.', deliverable: 'Publicly report our RAP achievements, challenges and learnings each year.', annual: 'survey', role: 'RAP Champion', types: ['stretch', 'elevate'] },
    { area: 'Governance', action: 'Continue our reconciliation journey by developing our next RAP.', deliverable: 'Begin developing our next RAP and contact Reconciliation Australia about its review.', endOffset: -6, role: 'RAP Champion', types: ['reflect', 'innovate', 'stretch', 'elevate'] }
  ];

  /* ---------- dates (ISO yyyy-mm-dd strings, UTC, no time zone drift) ---------- */
  function iso(d) { return d.toISOString().slice(0, 10); }
  function parse(s) { return new Date(String(s).slice(0, 10) + 'T00:00:00Z'); }
  function addMonths(s, n) {
    var d = parse(s), day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return iso(d);
  }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function defaultEnd(type, start) { return addMonths(start, (RAP_TYPES[type] || RAP_TYPES.innovate).months); }

  /* The dates each annual event falls on in a given year. NRW runs 27 May
     to 3 June every year. NAIDOC Week's dates are set each year by the
     National NAIDOC Committee: it usually starts on the first Sunday in
     July, used here as an estimate. The RAP Impact Survey date is an
     estimate too (30 September), to be confirmed with Reconciliation
     Australia each year. */
  function eventDates(kind, year) {
    if (kind === 'nrw') return { start: year + '-05-27', end: year + '-06-03', estimate: false };
    if (kind === 'naidoc') {
      var d = new Date(Date.UTC(year, 6, 1));
      while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
      var e = new Date(d); e.setUTCDate(e.getUTCDate() + 7);
      return { start: iso(d), end: iso(e), estimate: true };
    }
    if (kind === 'survey') return { start: year + '-09-30', end: year + '-09-30', estimate: true };
    if (kind === 'rwg') return { start: year + '-12-31', end: year + '-12-31', estimate: false };
    return null;
  }
  var EVENT_NAMES = { nrw: 'National Reconciliation Week', naidoc: 'NAIDOC Week', survey: 'RAP Impact Survey due', rwg: 'RWG meetings for the year' };

  /* Every occurrence of an annual event inside [start, end]. */
  function occurrences(kind, start, end) {
    var out = [], y0 = parse(start).getUTCFullYear(), y1 = parse(end).getUTCFullYear();
    for (var y = y0; y <= y1; y++) {
      var ev = eventDates(kind, y);
      if (ev.end >= start && ev.start <= end) out.push(ev);
    }
    return out;
  }

  /* Deliverables for a RAP of `type` running start..end, from the
     template: one row per deliverable, one per year for annual ones. */
  function buildDeliverables(type, start, end) {
    var rows = [], n = 0;
    TEMPLATE.forEach(function (t) {
      if (t.types.indexOf(type) === -1) return;
      var dues = [];
      if (t.annual) occurrences(t.annual, start, end).forEach(function (ev) { dues.push({ due: ev.end, year: ev.end.slice(0, 4) }); });
      else if (t.endOffset) dues.push({ due: addMonths(end, t.endOffset) });
      else dues.push({ due: addMonths(start, t.due) });
      dues.forEach(function (d) {
        n++;
        rows.push({
          ref: 'D-' + String(n).padStart(3, '0'),
          area: t.area, action: t.action,
          deliverable: t.deliverable + (d.year ? ' (' + d.year + ')' : ''),
          due: d.due, role: t.role, owner: '', status: 'Not started', notes: '', evidence: ''
        });
      });
    });
    return rows.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  }

  /* The calendar: annual events inside the RAP's term, its end date, the
     point to start the next RAP, and any custom dates the group added. */
  function keyDates(rap, custom) {
    if (!rap || !rap.start || !rap.end) return (custom || []).slice();
    var out = [];
    ['nrw', 'naidoc', 'survey'].forEach(function (k) {
      occurrences(k, rap.start, rap.end).forEach(function (ev) {
        out.push({ date: ev.start, end: ev.end, title: EVENT_NAMES[k], kind: k, estimate: ev.estimate, fixed: true });
      });
    });
    out.push({ date: addMonths(rap.end, -6), title: 'Start drafting the next RAP', kind: 'renewal', fixed: true });
    out.push({ date: rap.end, title: 'RAP ends', kind: 'end', fixed: true });
    (custom || []).forEach(function (c) { out.push(c); });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  function isOpen(d) { return d.status !== 'Complete' && d.status !== 'Deferred'; }

  /* Dashboard numbers. `today` is an ISO date. */
  function summary(deliverables, today) {
    var list = deliverables || [];
    var byStatus = {}; STATUSES.forEach(function (s) { byStatus[s] = 0; });
    list.forEach(function (d) { byStatus[d.status] = (byStatus[d.status] || 0) + 1; });
    var counted = list.filter(function (d) { return d.status !== 'Deferred'; });
    var areas = AREAS.map(function (a) {
      var inArea = counted.filter(function (d) { return d.area === a; });
      var done = inArea.filter(function (d) { return d.status === 'Complete'; }).length;
      return { area: a, total: inArea.length, done: done, pct: inArea.length ? Math.round(100 * done / inArea.length) : 0 };
    });
    var done = byStatus.Complete || 0;
    var overdue = list.filter(function (d) { return isOpen(d) && d.due && d.due < today; });
    var soon = list.filter(function (d) { return isOpen(d) && d.due && d.due >= today && daysBetween(today, d.due) <= 30; });
    var noOwner = list.filter(function (d) { return isOpen(d) && !String(d.owner || '').trim(); });
    return {
      total: list.length, done: done,
      pct: counted.length ? Math.round(100 * done / counted.length) : 0,
      byStatus: byStatus, areas: areas,
      overdue: overdue, dueSoon: soon, noOwner: noOwner
    };
  }

  /* Where the RAP is in its term. */
  function termProgress(rap, today) {
    if (!rap || !rap.start || !rap.end) return null;
    var total = daysBetween(rap.start, rap.end), gone = daysBetween(rap.start, today);
    return { pct: Math.max(0, Math.min(100, Math.round(100 * gone / Math.max(1, total)))), daysLeft: daysBetween(today, rap.end) };
  }

  /* A progress report for leadership, as headed sections of plain
     sentences (the app prints it; a Word export can come later). */
  function progressReport(rap, deliverables, meetings, today) {
    var s = summary(deliverables, today), t = termProgress(rap, today) || { pct: 0, daysLeft: 0 };
    var type = (RAP_TYPES[rap.type] || {}).name || rap.type;
    var sections = [];
    sections.push({ heading: 'Where we are', lines: [
      rap.name + ' is ' + (/^[AEIOU]/.test(type) ? 'an ' : 'a ') + type + ' RAP running from ' + rap.start + ' to ' + rap.end + '.',
      s.done + ' of ' + s.total + ' deliverables are complete (' + s.pct + '%), ' + t.pct + '% of the way through the RAP term.',
      s.overdue.length ? s.overdue.length + ' deliverable' + (s.overdue.length === 1 ? ' is' : 's are') + ' overdue.' : 'No deliverables are overdue.'
    ] });
    sections.push({ heading: 'Progress by area', lines: s.areas.map(function (a) { return a.area + ': ' + a.done + ' of ' + a.total + ' complete (' + a.pct + '%).'; }) });
    var yearAgo = addMonths(today, -12);
    var recent = (deliverables || []).filter(function (d) { return d.status === 'Complete' && (!d.completed || d.completed >= yearAgo); });
    sections.push({ heading: 'Achievements', lines: recent.length ? recent.map(function (d) { return d.ref + ': ' + d.deliverable + (d.notes ? ' Note: ' + d.notes : ''); }) : ['No deliverables have been completed yet.'] });
    sections.push({ heading: 'Overdue and at risk', lines: s.overdue.length ? s.overdue.map(function (d) { return d.ref + ': ' + d.deliverable + ' Due ' + d.due + ', ' + (d.owner ? 'owner ' + d.owner : 'no owner') + '.'; }) : ['Nothing is overdue.'] });
    var mtgs = (meetings || []).filter(function (m) { return m.date >= yearAgo && m.date <= today; });
    sections.push({ heading: 'RAP Working Group', lines: [mtgs.length + ' meeting' + (mtgs.length === 1 ? '' : 's') + ' held in the last 12 months' + (mtgs.length < 4 ? ', below the four a year the RAP commits to.' : '.')] });
    return sections;
  }

  /* SharePoint lists the app creates on the RAP site. Column types map to
     Graph columnDefinition facets in rap-store.js. Dates are stored as
     ISO text (yyyy-mm-dd), as Checkpoint does: a SharePoint date-only
     column is kept as midnight in the site's time zone and read back in
     UTC, which moves an Australian date back a day. ISO text sorts
     correctly in SharePoint views too. */
  var LISTS = {
    plans: { title: 'RAP Plans', columns: [
      { name: 'RapType', type: 'choice', choices: TYPE_ORDER.map(function (k) { return RAP_TYPES[k].name; }) },
      { name: 'StartDate', type: 'text' }, { name: 'EndDate', type: 'text' },
      { name: 'RapStatus', type: 'choice', choices: RAP_STATUSES },
      { name: 'EndorsedDate', type: 'text' }, { name: 'PublishedLink', type: 'text' }
    ] },
    deliverables: { title: 'RAP Deliverables', columns: [
      { name: 'Ref', type: 'text' }, { name: 'Area', type: 'choice', choices: AREAS },
      { name: 'RapAction', type: 'note' }, { name: 'DueDate', type: 'text' },
      { name: 'ResponsibleRole', type: 'text' }, { name: 'Owner', type: 'text' },
      { name: 'Status', type: 'choice', choices: STATUSES },
      { name: 'CompletedDate', type: 'text' },
      { name: 'ProgressNotes', type: 'note' }, { name: 'EvidenceLinks', type: 'note' }
    ] },
    dates: { title: 'RAP Key Dates', columns: [
      { name: 'EventDate', type: 'text' }, { name: 'Notes', type: 'note' }
    ] },
    members: { title: 'RAP Working Group', columns: [
      { name: 'MemberRole', type: 'text' }, { name: 'Email', type: 'text' }, { name: 'JoinedDate', type: 'text' }
    ] },
    meetings: { title: 'RAP Meetings', columns: [
      { name: 'MeetingDate', type: 'text' }, { name: 'Attendees', type: 'note' },
      { name: 'Minutes', type: 'note' }, { name: 'Decisions', type: 'note' }
    ] }
  };

  /* Record <-> SharePoint fields, one pair per list. */
  var MAP = {
    plans: { name: 'Title', type: 'RapType', start: 'StartDate', end: 'EndDate', status: 'RapStatus', endorsed: 'EndorsedDate', link: 'PublishedLink' },
    deliverables: { deliverable: 'Title', ref: 'Ref', area: 'Area', action: 'RapAction', due: 'DueDate', role: 'ResponsibleRole', owner: 'Owner', status: 'Status', completed: 'CompletedDate', notes: 'ProgressNotes', evidence: 'EvidenceLinks' },
    dates: { title: 'Title', date: 'EventDate', notes: 'Notes' },
    members: { name: 'Title', role: 'MemberRole', email: 'Email', joined: 'JoinedDate' },
    meetings: { title: 'Title', date: 'MeetingDate', attendees: 'Attendees', minutes: 'Minutes', decisions: 'Decisions' }
  };
  var DATE_KEYS = { start: 1, end: 1, endorsed: 1, due: 1, completed: 1, date: 1, joined: 1 };
  function toFields(kind, rec) {
    var m = MAP[kind], f = {};
    Object.keys(m).forEach(function (k) {
      if (rec[k] === undefined) return;
      var v = rec[k];
      if (kind === 'plans' && k === 'type') v = (RAP_TYPES[v] || {}).name || v;
      f[m[k]] = v;
    });
    return f;
  }
  function fromFields(kind, fields, id) {
    var m = MAP[kind], rec = { id: String(id) };
    Object.keys(m).forEach(function (k) {
      var v = fields[m[k]];
      if (v == null) v = '';
      if (DATE_KEYS[k] && v) v = String(v).slice(0, 10);
      if (kind === 'plans' && k === 'type') v = String(v).toLowerCase();
      rec[k] = v;
    });
    return rec;
  }

  /* "https://x.sharepoint.com/sites/RAPHub/..." -> Graph site path. */
  function siteRef(url) {
    var m = /^https:\/\/([a-z0-9-]+\.sharepoint\.com)(\/(?:sites|teams)\/[^/?#]+)/i.exec(String(url || '').trim());
    return m ? { host: m[1].toLowerCase(), path: m[2] } : null;
  }

  return {
    RAP_TYPES: RAP_TYPES, TYPE_ORDER: TYPE_ORDER, AREAS: AREAS, STATUSES: STATUSES, RAP_STATUSES: RAP_STATUSES,
    TEMPLATE: TEMPLATE, LISTS: LISTS, MAP: MAP,
    addMonths: addMonths, daysBetween: daysBetween, defaultEnd: defaultEnd, eventDates: eventDates,
    buildDeliverables: buildDeliverables, keyDates: keyDates, summary: summary, termProgress: termProgress,
    progressReport: progressReport, toFields: toFields, fromFields: fromFields, siteRef: siteRef, isOpen: isOpen
  };
}));
