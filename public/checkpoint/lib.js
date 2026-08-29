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

  /* Whether a recorded residual-risk acceptance (App.acceptRisk() —
     ISO 27001 6.1.3/8.3 sign-off) is still current.

     acceptRisk() snapshots the residual score (L*I) at the MOMENT of
     acceptance into r.acceptedScore, alongside who accepted it and
     when. Nothing else in this app clears acceptedBy/acceptedDate when
     the risk moves afterwards — editing the risk's inherent L/I, or
     reopening a treatment action that had already brought the residual
     down — because acceptedBy is a historical fact (X accepted the risk
     ON THAT DATE) that erasing would itself be dishonest, not a live
     claim to keep synced. What the app must never do is go on
     PRESENTING that historical acceptance as if it still covers
     whatever the residual score happens to be today.

     Returns true only when there IS a recorded acceptance (an
     unaccepted risk is a different, already-handled case — see the
     "Not accepted" chip this sits alongside) and its snapshotted score
     no longer matches the current one. r.acceptedScore is nullable —
     older risks accepted before this field existed have no snapshot to
     compare against, so they read as not-stale rather than always
     staling out retroactively. */
  function residualAcceptanceStale(r, currentScore) {
    if (!r || !r.acceptedBy) return false;
    if (typeof r.acceptedScore !== 'number') return false;
    return r.acceptedScore !== currentScore;
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
  /* The disposition currently in force for a check, or null.

     Null covers four different situations that all mean "score this
     check from the Microsoft signal as normal": no row at all (the
     default for nearly every check), a row with an unrecognised
     disposition value, and a row whose ReviewDue has passed.

     That last one is the point of the whole mechanism. An override with
     no expiry is a permanent hole in the posture score that nobody ever
     revisits, and an auditor will find it long before the tenant does.
     Lapsing it here — rather than trusting a UI reminder — means the
     real scan result comes back automatically the day the review falls
     due, and the check starts failing again until someone re-confirms
     the alternative control is still in place.

     A row with no ReviewDue at all stays active indefinitely. The UI
     requires the field, so this is a defensive path rather than an
     expected one, and lapsing on missing data would silently revert a
     legitimate disposition over a blank field — a worse failure than
     leaving it active and visibly flagged in the disposition list.

     Dates are compared as ISO strings, the same way scanResultHistory()
     and the calendar registers already compare theirs. */
  function activeDisposition(checkId, dispositions, today) {
    if (!checkId || !dispositions || !dispositions.length) return null;
    var d = dispositions.find(function (x) { return x && x.checkId === checkId; });
    if (!d) return null;
    if (d.disposition !== 'alternative' && d.disposition !== 'notApplicable') return null;
    if (d.reviewDue && today && d.reviewDue < today) return null;
    return d;
  }

  function checkResult(c, ctx) {
    if (c.scored === false) return 'manual';
    if (!ctx.lastResults) return null;

    /* Deliberately after the lastResults guard: before any scan has run
       there is nothing to override, and a tenant claiming an alternative
       control still shouldn't read as a pass on a tenant nobody has
       scanned yet. Deliberately before the demo remediation flip below,
       because a disposition is the stronger statement — it says this
       check is not scored from Microsoft signal at all, which makes the
       flip moot.

       'alternative' scores as a pass: the control is in place, just not
       via Microsoft. 'notApplicable' returns 'manual', which score()
       already excludes from its denominator — the check neither helps
       nor hurts, exactly like a check that could not be measured.

       Neither can reach 'demonstrated' assurance on a mapped control:
       app.js's assuranceForControl() drops dispositioned checks from
       the observation set entirely, so the control falls back to
       whatever human evidence supports it (evidenced or asserted).
       Checkpoint observed nothing here and must not imply it did. */
    var disp = activeDisposition(c.id, ctx.checkDispositions, ctx.today);
    if (disp) return disp.disposition === 'alternative' ? 'pass' : 'manual';

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
    /* A check the scan never wrote a result for was NOT measured, and
       must read as 'manual' rather than falling through as undefined.
       score() below excludes 'manual' from its denominator but treats
       anything else as a scored outcome, so an undefined result would
       be counted as a hard zero -- i.e. adding a CHECK_DEFS entry that
       the current scan does not populate would silently drop every
       existing tenant's posture score. Verified against live data that
       nothing is absent today, so this changes no current score; it
       exists so that adding a new check (an AWS collector's, say)
       cannot quietly rewrite history for tenants that do not run it. */
    return base === undefined ? 'manual' : base;
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

  /* Scores the Defender XDR incident queue (graph.js's 'xdr-incidents'
     check). Pure so the compliance-meaningful part is testable without
     a Graph call — the query that feeds it lives in graph.js.

     Scored on the AGE of unresolved high-severity incidents, never on
     incident count. A tenant with many incidents is not less compliant
     than one with none — often the reverse, since it means detection is
     working and people are looking. What ISO 27001 A.5.26 and CPS 234
     actually ask is whether the serious ones get worked within a
     timeframe the organisation has committed to, which is what this
     measures.

     An unassigned high-severity incident is a 'review' even inside the
     triage window: nobody owning it is precisely how it becomes overdue,
     and flagging that before the deadline is the point of a posture
     check rather than an autopsy.

     Filters on status here as well as in the Graph query — the function
     has to be honest about its own inputs, and a caller passing an
     unfiltered queue must not silently score resolved incidents as open
     ones. */
  function incidentTriageResult(incidents, triageDays, nowMs) {
    var active = (incidents || []).filter(function (i) { return i && i.status === 'active'; });
    var highOpen = active.filter(function (i) { return i.severity === 'high'; });
    var overdueMs = (typeof triageDays === 'number' && triageDays >= 0 ? triageDays : 5) * 86400000;
    var overdue = highOpen.filter(function (i) {
      var created = Date.parse(i.createdDateTime || '');
      /* An unparseable createdDateTime is NOT counted as overdue. We
         cannot tell how old it is, and inventing a fail from missing
         data is how a posture score loses its credibility. */
      return !isNaN(created) && (nowMs - created) > overdueMs;
    });
    var unassigned = highOpen.filter(function (i) { return !i.assignedTo; });
    return {
      active: active.length, highOpen: highOpen.length,
      overdue: overdue.length, unassigned: unassigned.length,
      result: overdue.length ? 'fail' : (unassigned.length ? 'review' : 'pass')
    };
  }

  /* % of applicable controls marked Implemented, for a single
     framework's control rows (caller filters by fw first). */
  function readinessPct(controls) {
    var applicable = controls.filter(function (c) { return c.app; });
    var impl = applicable.filter(function (c) { return c.st === 'Implemented'; }).length;
    if (!applicable.length) return 0;
    /* Math.round(), not floor: 99.5%+ rounds up to 100 while at least
       one applicable control still isn't Implemented (reachable once a
       framework has ~200+ applicable controls and exactly one is
       outstanding) — a generated report claiming "100% of applicable
       controls implemented" while its own open-gaps table still lists
       one is an internally inconsistent document, and "100%" is a
       claim this app should only ever make when it's exactly true. */
    return impl === applicable.length ? 100 : Math.min(99, Math.round(impl / applicable.length * 100));
  }

  /* Whether an Implemented control is overdue for re-verification —
     the "Verified" column's stale flag (app.js's renderSoaRow) and the
     Dashboard/Audit Readiness Report counts it feeds, pulled out into
     one pure, tested function instead of three copies of the same
     `daysSince(c.verified) > N` arithmetic. Only meaningful for a
     control that's both applicable and actually claiming Implemented —
     "Not started"/"In progress"/N-A controls have nothing to go stale,
     they're just not done yet (a different, already-covered gap). A
     control that's never been verified at all (`verified` empty) is
     always due — same as `daysSince()`'s own Infinity-for-empty
     convention elsewhere in this app, just made explicit here so the
     caller can render "never verified" instead of a meaningless day
     count. cadenceDays comes from the tenant's own
     controlReviewCadenceDays setting (store.js's THRESHOLD_DEFS,
     default 90 — unchanged from what this was hardcoded to before it
     became configurable). */
  function controlReviewStatus(control, today, cadenceDays) {
    var c = control || {};
    var cadence = (cadenceDays == null || cadenceDays === '') ? 90 : Number(cadenceDays);
    if (isNaN(cadence)) cadence = 90;
    if (!c.app || c.st !== 'Implemented') return { due: false, neverVerified: false, daysOverdue: 0 };
    if (!c.verified) return { due: true, neverVerified: true, daysOverdue: null };
    var days = daysBetweenDateStr(c.verified, today);
    var over = days - cadence;
    return { due: over > 0, neverVerified: false, daysOverdue: over > 0 ? over : 0 };
  }

  /* Review state of one document-control register row (ISO 27001
     Clause 7.5.2 c) — "review and approval for suitability and
     adequacy" on a defined cadence.

     Deliberately driven by the document's own DocNextReview date
     rather than a tenant-wide cadence like controlReviewStatus()
     uses: policies genuinely differ (an incident response plan is
     often reviewed six-monthly while an acceptable-use policy is
     annual), and the review date is already printed on the face of
     every document Checkpoint generates, so the register and the
     document itself must agree.

     States:
       'none'      — no review date set. Not a failure for evidence
                     files (a Conditional Access export is a point-in-
                     time artefact, not a controlled document); IS a
                     gap for a policy, which the caller decides based
                     on status/category rather than this function.
       'superseded'— withdrawn from the live set, so never chased.
       'current'   — review date is further out than warnDays.
       'due'       — inside the warning window, not yet passed.
       'overdue'   — the review date has passed.

     `today` is a YYYY-MM-DD string parameter, never read from the
     ambient clock, so tests pin it. */
  function documentReviewState(doc, today, warnDays) {
    var d = doc || {};
    var warn = (warnDays == null || warnDays === '') ? 30 : Number(warnDays);
    if (isNaN(warn)) warn = 30;
    if (d.status === 'Superseded') return { state: 'superseded', days: null };
    if (!d.nextReview) return { state: 'none', days: null };
    var days = daysBetweenDateStr(today, d.nextReview);
    if (days < 0) return { state: 'overdue', days: days };
    if (days <= warn) return { state: 'due', days: days };
    return { state: 'current', days: days };
  }

  /* Register-wide roll-up for the Documents header strip, the dashboard
     tile and the automated monitor — one pass, so all three agree by
     construction rather than by three separate filters staying in sync.

     `controlled` counts only documents that are actually under document
     control: anything with a status set, or living in a category the
     caller marks controlled. An auto-captured evidence export isn't a
     controlled document and shouldn't drag the register's numbers down.

     `unversioned` and `unowned` are the two register gaps an auditor
     spots immediately — a controlled document with no version or no
     named owner fails Clause 7.5.2 a)/b) on its face. */
  function documentRegisterSummary(docs, today, opts) {
    var o = opts || {};
    var controlledCats = o.controlledCategories || [];
    var warn = o.warnDays;
    var out = {
      total: 0, controlled: 0, approved: 0, draft: 0, inReview: 0, superseded: 0,
      overdue: 0, due: 0, noReviewDate: 0, unversioned: 0, unowned: 0, overdueDocs: [], dueDocs: []
    };
    (docs || []).forEach(function (d) {
      out.total++;
      var isControlled = !!d.status || controlledCats.indexOf(d.category) > -1;
      if (!isControlled) return;
      out.controlled++;
      if (d.status === 'Approved') out.approved++;
      else if (d.status === 'Draft') out.draft++;
      else if (d.status === 'In review') out.inReview++;
      else if (d.status === 'Superseded') out.superseded++;
      if (d.status === 'Superseded') return;
      if (!d.version) out.unversioned++;
      if (!d.owner) out.unowned++;
      var rv = documentReviewState(d, today, warn);
      if (rv.state === 'overdue') { out.overdue++; out.overdueDocs.push(d); }
      else if (rv.state === 'due') { out.due++; out.dueDocs.push(d); }
      else if (rv.state === 'none') out.noReviewDate++;
    });
    return out;
  }

  /* ============================================================
     Policy attestation roll-ups (A.5.1 / A.6.3, SOC 2 CC1.4, CC2.2)
     ============================================================ */

  /* Groups per-person attestation rows into per-campaign progress.
     Rows carrying an unknown status are counted as outstanding rather
     than dropped: an attestation register whose totals don't add up to
     the number of people asked is worse than useless as evidence.

     `pct` is deliberately over the CHASEABLE population (assigned +
     acknowledged), excluding exemptions — a campaign where three of
     twenty staff are formally exempt is 100% complete once the other
     seventeen respond, not 85% forever. A campaign of nothing but
     exemptions is reported as complete with pct 100 rather than
     dividing by zero. */
  function attestationCampaigns(rows) {
    var byCampaign = {};
    (rows || []).forEach(function (r) {
      var key = r.campaign || '(none)';
      var c = byCampaign[key] || (byCampaign[key] = {
        id: key, docName: r.docName || '', docVersion: r.docVersion || '', docUrl: r.docUrl || '',
        total: 0, acknowledged: 0, exempt: 0, outstanding: 0,
        launched: '', lastAcknowledged: '', outstandingRows: []
      });
      c.total++;
      if (r.status === 'Acknowledged') {
        c.acknowledged++;
        if ((r.acknowledged || '') > c.lastAcknowledged) c.lastAcknowledged = r.acknowledged || '';
      } else if (r.status === 'Exempt') {
        c.exempt++;
      } else {
        c.outstanding++;
        c.outstandingRows.push(r);
      }
      if (r.assigned && (!c.launched || r.assigned < c.launched)) c.launched = r.assigned;
    });
    return Object.keys(byCampaign).map(function (k) {
      var c = byCampaign[k];
      var chaseable = c.acknowledged + c.outstanding;
      c.pct = chaseable === 0 ? 100 : Math.round((c.acknowledged / chaseable) * 100);
      c.complete = c.outstanding === 0;
      return c;
    }).sort(function (a, b) { return (b.launched || '').localeCompare(a.launched || ''); });
  }

  /* What one signed-in person still owes. Matched on UPN
     case-insensitively — Entra treats UPNs as case-insensitive and the
     casing Graph returns for the signed-in account does not always
     match the casing stored when the campaign was created, which would
     otherwise silently show an employee an empty list while the
     practitioner's chase list still names them. */
  function outstandingAttestationsFor(rows, upn) {
    var want = String(upn || '').toLowerCase();
    if (!want) return [];
    return (rows || []).filter(function (r) {
      return String(r.upn || '').toLowerCase() === want && r.status !== 'Acknowledged' && r.status !== 'Exempt';
    });
  }

  /* Posture result for the 'training' check (A.6.3 / SOC 2 CC1.4 /
     NIST PR.AT), which until now was scored:false with no signal at
     all — Checkpoint could not tell a client whether awareness
     training was actually happening.

     Returns 'manual' when there are no training records, and that is
     deliberate rather than a soft option. The app's rule everywhere
     else is that "we couldn't measure it" must never be scored as "it
     failed" (see score() above) — and a client running awareness
     training in a separate LMS is doing the control properly while
     leaving no trace here. Once they use the module it becomes
     genuinely measurable, and then it is scored honestly.

     Exempt records leave the denominator, same as attestation
     campaigns. An overdue incomplete assignment is worse than one
     merely outstanding, so it caps the result at 'fail' regardless of
     the percentage: a 95%-complete course where the remaining people
     are past their due date is not a passing control. */
  function trainingCheckResult(rows, today, opts) {
    var o = opts || {};
    var passPct = o.passPct == null ? 90 : o.passPct;
    var reviewPct = o.reviewPct == null ? 70 : o.reviewPct;
    var list = (rows || []).filter(function (t) { return t.status !== 'Exempt'; });
    if (!list.length) {
      return { result: 'manual', note: 'No training records in Checkpoint — assign a course here, or keep completion evidence in whatever system you use.', pct: null, completed: 0, total: 0, overdue: 0 };
    }
    var completed = list.filter(function (t) { return t.status === 'Completed'; }).length;
    var overdue = list.filter(function (t) {
      return t.status !== 'Completed' && t.due && t.due < today;
    }).length;
    var pct = Math.round((completed / list.length) * 100);
    var result = pct >= passPct ? 'pass' : pct >= reviewPct ? 'review' : 'fail';
    if (overdue) result = 'fail';
    var note = completed + ' of ' + list.length + ' assigned training records complete (' + pct + '%)' +
      (overdue ? ' — ' + overdue + ' past their due date' : '') + '.';
    return { result: result, note: note, pct: pct, completed: completed, total: list.length, overdue: overdue };
  }

  /* Scores the Defender XDR alert queue (graph.js's 'alerts' check when
     Defender XDR is available). Sibling to incidentTriageResult().

     Alerts and incidents are not the same signal and are not scored the
     same way. An incident groups related alerts and is meant to be
     worked; alerts are high-volume and mostly auto-resolve, so scoring
     on "any unresolved alert" would produce a permanently red check
     that everyone learns to ignore — the opposite of useful.

     What matters is alerts NOBODY HAS LOOKED AT. Status 'newAlert'
     means untouched; 'inProgress' means someone is on it. A
     high-severity alert still sitting at newAlert days later is a
     genuine gap in the triage process, and that is what this measures.

     Same missing-date rule as incidents: an alert whose createdDateTime
     will not parse is never counted as stale. */
  function alertTriageResult(alerts, triageDays, nowMs) {
    var list = (alerts || []).filter(function (a) {
      return a && (a.status === 'newAlert' || a.status === 'inProgress');
    });
    var highNew = list.filter(function (a) { return a.severity === 'high' && a.status === 'newAlert'; });
    var staleMs = (typeof triageDays === 'number' && triageDays >= 0 ? triageDays : 5) * 86400000;
    var stale = highNew.filter(function (a) {
      var created = Date.parse(a.createdDateTime || '');
      return !isNaN(created) && (nowMs - created) > staleMs;
    });
    return {
      open: list.length, highUntouched: highNew.length, stale: stale.length,
      result: stale.length ? 'fail' : (highNew.length ? 'review' : 'pass')
    };
  }

  /* Subject rights requests (Microsoft Priva) — the privacy equivalent
     of incident triage, and the one privacy obligation that comes with
     a statutory clock rather than a policy one.

     Australian Privacy Act APP 12 gives 30 days to respond to an access
     request; GDPR Article 12 gives one month. Priva carries a
     dueDateTime per request, so this scores against the tenant's OWN
     recorded deadline rather than assuming a jurisdiction — a request
     past its due date is a live compliance breach, not a housekeeping
     item, and is the only thing here that can fail.

     Zero requests is a PASS, not 'manual', and that is a deliberate
     difference from the register-derived checks. An empty Priva queue
     is a real, readable answer from a system the tenant demonstrably
     has (the capability probe succeeded) — "no outstanding requests" is
     genuinely compliant. An empty Checkpoint register, by contrast,
     tells you nothing about whether the activity happens elsewhere. */
  function subjectRightsResult(requests, today) {
    var list = (requests || []).filter(function (r) {
      return r && r.status !== 'closed' && r.status !== 'Closed';
    });
    if (!list.length) return { open: 0, overdue: 0, dueSoon: 0, result: 'pass' };
    var overdue = list.filter(function (r) {
      var d = (r.dueDateTime || '').slice(0, 10);
      return d && d < today;
    });
    var soon = list.filter(function (r) {
      var d = (r.dueDateTime || '').slice(0, 10);
      return d && d >= today && daysBetweenDateStr(today, d) <= 7;
    });
    return {
      open: list.length, overdue: overdue.length, dueSoon: soon.length,
      result: overdue.length ? 'fail' : (soon.length ? 'review' : 'pass')
    };
  }

  /* Retention labels (Microsoft Purview records management) — A.5.33
     protection of records and A.8.10 information deletion, plus APP 11.2
     which requires destroying or de-identifying personal information no
     longer needed.

     Scored on whether retention is CONFIGURED and PUBLISHED, not on
     coverage: Graph can list the labels but cannot tell how much
     content carries them, so claiming a coverage percentage would be
     inventing a number. A published label set is the honest ceiling for
     what this endpoint can demonstrate.

     A tenant with the licence and no labels at all fails: retention is
     not optional under either the standard or the Act, and unlike the
     register checks there is no "maybe they do it elsewhere" — Purview
     records management IS the place this is done in a Microsoft
     tenant. */
  function retentionLabelResult(labels) {
    var list = (labels || []).filter(function (l) { return l; });
    if (!list.length) {
      return { total: 0, published: 0, withDisposition: 0, result: 'fail' };
    }
    /* A label that exists but was never published applies to nothing.
       Graph exposes this inconsistently across tenants, so treat an
       absent flag as published rather than inventing a failure. */
    var published = list.filter(function (l) {
      return l.labelStatus === undefined || l.labelStatus === null || l.labelStatus === 'published' || l.labelStatus === 'InUse';
    });
    var withDisposition = list.filter(function (l) {
      return l.actionAfterRetentionPeriod && l.actionAfterRetentionPeriod !== 'none';
    });
    if (!published.length) {
      return { total: list.length, published: 0, withDisposition: withDisposition.length, result: 'fail' };
    }
    /* Retention with no end action keeps content forever, which fails
       the deletion half of A.8.10 and APP 11.2 just as surely as having
       no labels fails the retention half. */
    if (!withDisposition.length) {
      return { total: list.length, published: published.length, withDisposition: 0, result: 'review' };
    }
    return { total: list.length, published: published.length, withDisposition: withDisposition.length, result: 'pass' };
  }

  /* ============================================================
     Register-derived posture checks
     ------------------------------------------------------------
     Four checks that used to be permanently 'manual' — backup, bcp,
     supplier and policy — scored from Checkpoint's OWN registers
     instead. Same idea as trainingCheckResult() above, and the same
     honesty rule:

       AN EMPTY REGISTER IS 'manual', NEVER 'fail'.

     Checkpoint cannot tell "this organisation does not test its
     backups" from "this organisation tests its backups and records it
     somewhere else". Scoring the second as a failure would be inventing
     a finding, and score() excludes 'manual' from its denominator
     precisely so an honest "we cannot see this" costs a tenant nothing.

     What makes these worth automating is that they need no Graph scope
     and no licence: every tenant has these registers the moment it has
     Checkpoint, so unlike the Defender and Purview reads these work at
     E3, at Business Premium, everywhere. The store.js note saying
     backup "stays self-reported until a live Graph signal exists" was
     looking in the wrong place — the evidence an auditor wants for
     A.8.13 is a restore TEST, and that is a Calendar row, not a Graph
     endpoint.
     ============================================================ */

  /* Shared shape for the two checks that are really "is this recurring
     assurance activity actually being done?" — backup restore tests and
     BCP/DR failover tests. Returns null when the tenant has no such
     activity scheduled at all, so each caller can decide what silence
     means for its own control. */
  function recurringActivityState(calendar, category, today) {
    var rows = (calendar || []).filter(function (c) {
      return c && c.category === category && c.status !== 'Retired' && c.status !== 'Inactive';
    });
    if (!rows.length) return null;
    var overdue = rows.filter(function (c) { return c.nextDue && c.nextDue < today; });
    var neverDone = rows.filter(function (c) { return !c.lastCompleted; });
    return { total: rows.length, overdue: overdue.length, neverDone: neverDone.length, rows: rows };
  }

  /* A.8.13 — backup. Scored on whether restore tests happen on
     schedule, not on whether backups are configured: an untested backup
     is the single most common audit finding in this control, and a
     configured-but-never-restored backup is exactly what it catches. */
  function backupCheckResult(calendar, today) {
    var st = recurringActivityState(calendar, 'Backup restore test', today);
    if (!st) {
      return { result: 'manual', note: 'No backup restore test scheduled in Checkpoint\'s calendar — add one, or keep restore-test evidence in whatever system you use.' };
    }
    if (st.overdue) {
      return { result: 'fail', note: st.overdue + ' of ' + st.total + ' scheduled backup restore test(s) overdue — an untested backup is not a demonstrated one.' };
    }
    if (st.neverDone) {
      return { result: 'review', note: st.total + ' backup restore test(s) scheduled, but ' + st.neverDone + ' has never been completed.' };
    }
    return { result: 'pass', note: st.total + ' scheduled backup restore test(s), all completed within cadence.' };
  }

  /* A.5.29/A.5.30 — ICT readiness for business continuity. Two signals,
     because either alone is a half-answer: a plan document that exists
     and is in review cadence, AND a failover test actually performed.
     An untested plan is the classic finding here, so a current plan
     with an overdue test still fails. */
  function bcpCheckResult(calendar, docs, today) {
    var st = recurringActivityState(calendar, 'BCP/DR test', today);
    var plan = (docs || []).filter(function (d) {
      return d && d.tplId === 'bcp-dr-plan' && d.status !== 'Superseded';
    });
    var planApproved = plan.filter(function (d) { return d.status === 'Approved'; });
    var planOverdue = planApproved.filter(function (d) { return d.nextReview && d.nextReview < today; });

    if (!st && !plan.length) {
      return { result: 'manual', note: 'No BCP/DR plan document and no failover test scheduled in Checkpoint — add them, or keep continuity evidence in whatever system you use.' };
    }
    if (st && st.overdue) {
      return { result: 'fail', note: st.overdue + ' BCP/DR failover test(s) overdue' + (planApproved.length ? ' (the plan itself is approved — an untested plan is the finding here)' : ' and no approved plan document') + '.' };
    }
    if (plan.length && !planApproved.length) {
      return { result: 'fail', note: 'A BCP/DR plan exists but is not approved — a draft plan is not an operative one.' };
    }
    if (planOverdue.length) {
      return { result: 'fail', note: 'The BCP/DR plan is past its review date.' };
    }
    if (!st) {
      return { result: 'review', note: 'A BCP/DR plan is approved and current, but no failover test is scheduled — the plan is untested.' };
    }
    if (st.neverDone) {
      return { result: 'review', note: 'A BCP/DR failover test is scheduled but has never been completed.' };
    }
    if (!planApproved.length) {
      return { result: 'review', note: 'Failover tests are current, but there is no approved BCP/DR plan document in the register.' };
    }
    return { result: 'pass', note: 'BCP/DR plan approved and in review cadence, with failover testing current.' };
  }

  /* A.5.19-A.5.22 — supplier relationships. Scored from the Vendor
     register rather than the calendar, because the register carries
     criticality: an overdue review of a critical supplier holding
     production data is a materially different finding from an overdue
     review of the office stationery account, and a check that treats
     them identically trains people to ignore it. */
  function supplierCheckResult(vendors, today) {
    var list = (vendors || []).filter(function (v) { return v; });
    if (!list.length) {
      return { result: 'manual', note: 'No suppliers recorded in Checkpoint\'s vendor register — add them, or keep supplier assurance evidence in whatever system you use.' };
    }
    var overdue = list.filter(function (v) { return v.nextReviewDue && v.nextReviewDue < today; });
    var keyOverdue = overdue.filter(function (v) { return v.criticality === 'Critical' || v.criticality === 'High'; });
    var neverReviewed = list.filter(function (v) { return !v.lastReviewed; });
    var keyNeverReviewed = neverReviewed.filter(function (v) { return v.criticality === 'Critical' || v.criticality === 'High'; });

    if (keyOverdue.length || keyNeverReviewed.length) {
      var n = keyOverdue.length || keyNeverReviewed.length;
      return { result: 'fail', note: n + ' critical/high-criticality supplier(s) ' + (keyOverdue.length ? 'overdue for review' : 'never reviewed') + ', of ' + list.length + ' recorded.' };
    }
    if (overdue.length || neverReviewed.length) {
      return { result: 'review', note: (overdue.length || neverReviewed.length) + ' lower-criticality supplier(s) ' + (overdue.length ? 'overdue for review' : 'never reviewed') + ', of ' + list.length + ' recorded.' };
    }
    return { result: 'pass', note: 'All ' + list.length + ' recorded supplier(s) reviewed within cadence.' };
  }

  /* A.5.1 and Clause 7.5 — the policy set exists, is approved, and is
     being reviewed. Deliberately counts only APPROVED documents as
     satisfying the control: a policy sitting in Draft has not been
     issued, and Clause 5.2 asks for a policy that is communicated, not
     one that has been written. */
  function policyCheckResult(docs, today, opts) {
    var o = opts || {};
    var summary = documentRegisterSummary(docs, today, { controlledCategories: o.controlledCategories || ['Policies & Procedures'], warnDays: o.warnDays });
    if (!summary.controlled) {
      return { result: 'manual', note: 'No controlled documents in Checkpoint\'s register — generate or upload your policy set here, or keep it in whatever system you use.' };
    }
    if (!summary.approved) {
      return { result: 'fail', note: summary.controlled + ' controlled document(s), none approved — an unapproved policy has not been issued.' };
    }
    if (summary.overdue) {
      return { result: 'fail', note: summary.overdue + ' of ' + summary.approved + ' approved document(s) past their review date.' };
    }
    if (summary.noReviewDate || summary.unversioned || summary.unowned) {
      var gaps = [];
      if (summary.noReviewDate) gaps.push(summary.noReviewDate + ' with no review date');
      if (summary.unversioned) gaps.push(summary.unversioned + ' unversioned');
      if (summary.unowned) gaps.push(summary.unowned + ' with no named owner');
      return { result: 'review', note: summary.approved + ' approved document(s), but ' + gaps.join(', ') + ' — each fails Clause 7.5.2 on its face.' };
    }
    return { result: 'pass', note: 'All ' + summary.approved + ' approved document(s) versioned, owned and within review cadence.' };
  }

  /* Who is missing induction training entirely. Distinct from the
     re-assignment rule a recurring campaign uses: a campaign skips
     anyone with an OPEN record (so an annual refresh reaches people who
     completed last year), whereas induction skips anyone who has EVER
     held this course, so re-running it only ever picks up genuine new
     starters. Matched on UPN case-insensitively, for the same reason
     outstandingAttestationsFor() is. */
  function usersMissingInduction(users, rows, courseId) {
    var seen = {};
    (rows || []).forEach(function (t) {
      if (t.courseId === courseId) seen[String(t.upn || '').toLowerCase()] = true;
    });
    return (users || []).filter(function (u) { return !seen[String(u.upn || '').toLowerCase()]; });
  }

  /* ============================================================
     Incident register — ISO 27001 A.5.24-A.5.28
     ============================================================ */

  /* Where a privacy-breach assessment sits relative to its deadline.
     Mirrors documentReviewState()'s shape/naming deliberately — this is
     the same idea (a clock running against a date) applied to a
     different obligation, and consistency here means the UI can reuse
     the same verify-ok/verify-stale visual treatment rather than
     inventing a second one. Assessment is 'closed' the moment either
     notification flag is set OR assessmentComplete is explicitly set —
     recording "we assessed this and it does not meet the threshold" is
     itself completing the assessment, not a step before it. Deliberately
     NOT inferred from assessmentNote being non-empty: a note recording
     that the assessment is still in progress is not itself a completed
     assessment, so completion needs its own explicit flag rather than
     "a note exists" standing in for it. */
  function incidentAssessmentState(incident, today) {
    var n = incident || {};
    if (!n.isPrivacyBreach) return { state: 'n/a', days: null };
    if (n.notifiedRegulator || n.notifiedIndividuals || n.assessmentComplete) {
      return { state: 'closed', days: null };
    }
    if (!n.assessmentDueDate) return { state: 'none', days: null };
    var days = daysBetweenDateStr(today, n.assessmentDueDate);
    if (days < 0) return { state: 'overdue', days: days };
    if (days <= 7) return { state: 'due', days: days };
    return { state: 'open', days: days };
  }

  /* Register-wide roll-up for the Dashboard governance card and the
     scheduled monitor, same one-pass-so-every-consumer-agrees reasoning
     as documentRegisterSummary(). Counts open/closed by the incident's
     own Status field (a practitioner's call — an incident can stay
     administratively "Open" for reasons unrelated to its privacy
     assessment), and separately tracks assessment health, since the
     two are genuinely independent facts about the same record. */
  function incidentRegisterSummary(incidents, today) {
    var out = { total: 0, open: 0, closed: 0, privacyBreaches: 0, assessmentOverdue: 0, assessmentDue: 0, overdueList: [] };
    (incidents || []).forEach(function (n) {
      out.total++;
      if (n.status === 'Closed') out.closed++; else out.open++;
      if (!n.isPrivacyBreach) return;
      out.privacyBreaches++;
      var a = incidentAssessmentState(n, today);
      if (a.state === 'overdue') { out.assessmentOverdue++; out.overdueList.push(n); }
      else if (a.state === 'due') out.assessmentDue++;
    });
    return out;
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
      /* IS18 must be tested BEFORE the bare-token inheritance rule
         below: "IS18.4.1" also happens to match the bare-code shape
         ([A-Za-z]{1,4} then a digit), so without this line it would be
         mis-attributed to whatever framework preceded it in the chain
         (e.g. "ISO27001 A.5.36 · IS18.7.1" would read the second token
         as an ISO 27001 code). Self-prefixed, same as DISP./E8. */
      if (/^IS18\.\d+/.test(tok)) { lastFw = 'is18'; return { fw: 'is18', code: tok }; }
      if (/^E8\.\d+/.test(tok)) { lastFw = 'essential8'; return { fw: 'essential8', code: tok }; }
      /* CPS234 — same self-prefixed treatment, and for the same reason
         as IS18 above: "CPS234.13" matches the bare-code shape too. */
      if (/^CPS234\.\d+/.test(tok)) { lastFw = 'cps234'; return { fw: 'cps234', code: tok }; }
      if (lastFw && /^[A-Za-z]{1,4}\.?\d/.test(tok)) return { fw: lastFw, code: tok };
      lastFw = null; /* prose like "EU AI Act Art.9" resets the chain */
      return null;
    }).filter(Boolean);
  }

  /* Every control a given posture check's evidence satisfies: its
     canonical ISO 27001 control(s) from checkControls (app.js's global
     CHECK_CONTROLS), plus — for every OTHER framework the client
     actually has entitled — whatever control that ISO 27001 control's
     own cross-mapping (its `map` field, via parseMapTokens) resolves to
     exactly. Never invents a mapping; a token that doesn't resolve to a
     real control row in an entitled framework is silently skipped.

     ISO 27001's 93 control rows are seeded into every tenant's Controls
     list unconditionally — they're baked into store.js, not a licensed
     content pack, so they exist in `controls` (S.controls in app.js)
     regardless of entitlements.iso27001. The entitlements.iso27001 check
     below therefore only gates whether iso27001's OWN row is included in
     the result — it must NOT gate the cross-reference walk to other
     frameworks, or a tenant on any standalone single-module purchase
     (Essential Eight only, SOC 2 only, etc. — every module in
     src/data/pricing.js's MODULES is independently purchasable) would
     get zero results for every check, not just for iso27001, since this
     function is the sole source captureAutoEvidence() (app.js) uses to
     decide which controls get an auto-evidence file/verifiedBy stamp. An
     earlier version got this backwards — checked entitlements.iso27001
     before even looking up the row, short-circuiting the whole function
     for any tenant without that one specific entitlement.

     ctx: { checkControls: {checkId: [isoCode,...]}, controls: [...],
            entitlements: {fw: bool} } */
  function controlsForCheck(checkId, ctx) {
    var codes = (ctx.checkControls && ctx.checkControls[checkId]) || [];
    var out = [];
    codes.forEach(function (code) {
      var iso = ctx.controls.find(function (c) { return c.fw === 'iso27001' && c.id === code; });
      if (!iso) return;
      if (ctx.entitlements.iso27001) out.push(iso);
      parseMapTokens(iso.map).forEach(function (ref) {
        if (!ctx.entitlements[ref.fw]) return;
        var match = ctx.controls.find(function (c) { return c.fw === ref.fw && c.id === ref.code; });
        if (match) out.push(match);
      });
    });
    var seen = {};
    return out.filter(function (c) {
      var k = c.fw + '|' + c.id;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  /* Every control across every ENTITLED framework that shares the same
     real-world evidence as `start`. Walks the cross-mapping graph in
     BOTH directions — forward (start's own "Also satisfies" map field)
     and backward (any other control whose map field points at start) —
     because the seed data isn't consistently bidirectional: ISO 27001
     A.5.15 maps to SOC 2 CC6.1, but CC6.1's own map field also reaches
     Essential Eight E8.7 and NIST PR.AA that A.5.15 never mentions
     directly. A one-hop lookup would under-report real matches.
     Breadth-first over a small (~250-control) graph, so a plain queue is
     more than fast enough.

     `start` is always included, first. Controls in frameworks this
     tenant hasn't bought are never traversed or returned — an
     unlicensed framework's control set must stay invisible.

     ctx: { controls: [...], entitlements: {fw: bool} } */
  function sharedEvidenceClosure(start, ctx) {
    if (!start) return [];
    var controls = (ctx && ctx.controls) || [];
    var entitlements = (ctx && ctx.entitlements) || {};
    var key = function (c) { return c.fw + '|' + c.id; };
    var visited = {};
    visited[key(start)] = true;
    var queue = [start], result = [start];
    while (queue.length) {
      var cur = queue.shift();
      parseMapTokens(cur.map).forEach(function (ref) {
        if (!entitlements[ref.fw]) return;
        var m = controls.find(function (c) { return c.fw === ref.fw && c.id === ref.code; });
        if (m && !visited[key(m)]) { visited[key(m)] = true; result.push(m); queue.push(m); }
      });
      controls.forEach(function (other) {
        if (!entitlements[other.fw] || visited[key(other)]) return;
        var pointsToCur = parseMapTokens(other.map).some(function (e) { return e.fw === cur.fw && e.code === cur.id; });
        if (pointsToCur) { visited[key(other)] = true; result.push(other); queue.push(other); }
      });
    }
    return result;
  }

  /* Cross-framework propagation: having just recorded real work against
     one control, which controls in OTHER entitled frameworks are the
     same real-world control and haven't caught up?

     This is the multi-framework client's biggest multiplier. Checks
     already propagate — a posture check's evidence lands on every mapped
     control (controlsForCheck) — but a practitioner's own work did not:
     marking ISO 27001 A.5.15 Implemented with evidence said nothing
     about SOC 2 CC6.1 or Essential Eight E8.7, which are the same
     control, so the same job was done up to eight times.

     Deliberately narrow, for the same reason the scan's own suggestions
     are:
       - Only ever proposes the SOURCE control's status, and only when
         the target is BEHIND it (rank-wise). Never downgrades anything,
         never touches a target already at or past the source.
       - Only from a source that is genuinely evidenced — Implemented
         with an evidence link. "I ticked a dropdown" is not grounds to
         tick seven more.
       - Skips non-applicable targets: a control excluded from a
         framework's scope with a justification is a deliberate decision,
         not a gap to fill.
       - Returns proposals only. Nothing is written until a practitioner
         confirms, same contract as every other suggestion in this app.

     ctx: { controls, entitlements } — same shape sharedEvidenceClosure
     takes. Returns [{ fw, code, title, from, to, viaFw, viaCode }]. */
  var PROPAGATION_ST_RANK = { 'Not started': 0, 'In progress': 1, 'Implemented': 2 };
  function crossFrameworkStatusSuggestions(source, ctx) {
    var s = source || {};
    if (!s.app || s.st !== 'Implemented' || !s.evidenceUrl) return [];
    var out = [];
    sharedEvidenceClosure(s, ctx).forEach(function (c) {
      /* Cross-framework ONLY — never propagate within the source's own
         framework. The mapping graph means two different things
         depending on which side of a framework boundary you cross: A.5.15
         mapping to SOC 2 CC6.1 means "the same real-world control
         expressed in two standards", so one piece of evidence genuinely
         serves both. A.5.15 cross-referencing ISO 27001 A.8.5 means
         "these are related requirements of the same standard" — an
         auditor tests them separately, and carrying a status across
         would be over-claiming inside the very standard being audited.
         Same-framework relationships still show in the Shared evidence
         view (which reports, and never writes); only propagation is
         restricted. */
      if (c.fw === s.fw) return;
      if (!c.app) return;
      var from = PROPAGATION_ST_RANK[c.st];
      if (typeof from !== 'number' || from >= PROPAGATION_ST_RANK[s.st]) return;
      out.push({ fw: c.fw, code: c.id, title: c.t || '', from: c.st, to: s.st, viaFw: s.fw, viaCode: s.id });
    });
    return out;
  }

  /* SOC 2 Type II operating-effectiveness — did a posture check keep
     passing CONSISTENTLY across every scan in an observation window, or
     did it dip at some point? Type I only ever asks "is this control
     correctly designed right now" (the latest scan, which is what every
     SoA in this app already shows); Type II requires evidence the
     control actually operated that way over a period, which is what
     this answers — from data every scan already records (each scan's
     own dated per-check results), not a new signal.

     scanHistory: [{ date: 'YYYY-MM-DD', results: {checkId: 'pass'|
       'review'|'fail'|'manual'} }, ...] — the CALLER parses each scan's
     stored Detail JSON into this shape (app.js's job, since that JSON
     lives in S.scans/Store, not lib.js's concern) and passes it in
     already-decoded; this function never touches storage or JSON
     parsing itself, staying as dependency-free as everything else here.
     sinceDate: an ISO date string (observation start) — scans before it
     are excluded — or '' to use the entire scan history supplied.

     A scan where this checkId is simply absent from `results` (an older
     scan predating the check, or one where the underlying capability
     was unavailable that run) is silently excluded — there's no
     observation to report for that date, not a failed one. A 'manual'
     result IS counted as an observation (the scan happened, on that
     date, for this check) but tracked separately from pass/exception:
     it means no live Graph signal existed on that specific scan date,
     which the practitioner still needs manual evidence for — very
     different from an exception, which means the live signal existed
     and came back negative.

     Deliberately reports raw counts and dates, never a canned "this is
     sufficient Type II evidence" verdict — sample-size and coverage
     adequacy over an observation period is an auditor's judgement call
     this app has no business making for them. noExceptionsFound is the
     narrowest true/false fact — every real (non-manual) observation in
     the window passed, and there was at least one — not a claim about
     how many observations is "enough". */
  function operatingEffectiveness(checkId, scanHistory, sinceDate) {
    var inWindow = (scanHistory || []).filter(function (s) {
      return s && s.date && s.results && (!sinceDate || s.date >= sinceDate);
    }).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    var observations = [];
    inWindow.forEach(function (s) {
      var r = s.results[checkId];
      if (r === undefined) return;
      observations.push({ date: s.date, result: r });
    });

    var exceptions = observations.filter(function (o) { return o.result === 'fail' || o.result === 'review'; });
    var manual = observations.filter(function (o) { return o.result === 'manual'; });
    var passed = observations.filter(function (o) { return o.result === 'pass'; });

    return {
      totalObservations: observations.length,
      passCount: passed.length,
      manualCount: manual.length,
      exceptions: exceptions,
      firstObservedDate: observations.length ? observations[0].date : null,
      lastObservedDate: observations.length ? observations[observations.length - 1].date : null,
      noExceptionsFound: observations.length > 0 && exceptions.length === 0 && passed.length > 0
    };
  }

  /* ================= Control assurance =================
     operatingEffectiveness() above answers "did this check pass, over
     this window" for ONE check. This answers the question a level-4
     ISMS actually gets asked, for a CONTROL: how much do we really
     know that this control works, and on what basis?

     The distinction matters because "Implemented" in a Statement of
     Applicability is an ASSERTION. Someone ticked a box. An auditor —
     and APRA CPS 234's testing-effectiveness requirement explicitly —
     wants to know what is behind that tick. Three very different
     things get reported identically today:

       - a control a live Graph check has passed on every scan for six
         months (strong: continuously demonstrated),
       - a control with an evidence link somebody attached once
         (moderate: evidenced at a point in time),
       - a control someone marked Implemented with nothing attached at
         all (weak: an unsupported claim).

     Ranking them is the whole point. Precedence runs strongest-first,
     because the strongest available basis is the honest answer: a
     control with BOTH passing automated observations and an evidence
     link is 'demonstrated', not double-counted.

     `effectiveness` is the roll-up of operatingEffectiveness() across
     every check feeding this control, or null when no check feeds it
     at all — a control with no live signal is not thereby failing, it
     simply has no automated basis and must stand on evidence.

     Flags are computed INDEPENDENTLY of level, not folded into it, so
     the two most valuable findings stay visible rather than being
     collapsed into a single label:

       exceptions — the paperwork says implemented and the live signal
       disagrees. This is the finding an auditor most wants and the one
       a status-only SoA can never surface.

       stale — the control's own verification has aged past the review
       cadence, whatever its basis. A control demonstrated by automation
       is not stale just because nobody re-attested it, so this is
       reported alongside the level rather than degrading it.

     Deliberately returns a basis and raw counts, never a score out of
     100. How much assurance is "enough" for a given control is a risk
     judgement belonging to the practitioner and their auditor, exactly
     as operatingEffectiveness() refuses to declare a sample size
     sufficient. */
  function controlAssurance(o) {
    o = o || {};
    var c = o.control || {};
    var eff = o.effectiveness || null;
    var cadence = typeof o.cadenceDays === 'number' && o.cadenceDays > 0 ? o.cadenceDays : 365;

    var exceptionCount = eff && eff.exceptions ? eff.exceptions.length : 0;
    var observations = eff ? (eff.totalObservations || 0) : 0;
    var passCount = eff ? (eff.passCount || 0) : 0;

    /* Days since the control was last verified by a person. null (not
       0) when it never has been — "never verified" and "verified today"
       must not be arithmetically confusable. */
    var staleDays = null;
    if (c.lastVerified && o.today) {
      var then = Date.parse(c.lastVerified + 'T00:00:00Z');
      var now = Date.parse(o.today + 'T00:00:00Z');
      if (!isNaN(then) && !isNaN(now)) staleDays = Math.floor((now - then) / 86400000);
    }
    var stale = staleDays === null ? true : staleDays > cadence;

    var level, basis;
    if (c.applicable === false) {
      level = 'excluded';
      basis = 'Excluded from scope.';
    } else if (c.st !== 'Implemented') {
      level = 'not-implemented';
      basis = 'Not yet implemented.';
    } else if (observations > 0 && passCount > 0 && exceptionCount === 0) {
      level = 'demonstrated';
      basis = passCount + ' automated observation' + (passCount === 1 ? '' : 's') + ' passed, no exceptions.';
    } else if (c.evidenceUrl) {
      level = 'evidenced';
      basis = 'Evidence attached' + (exceptionCount ? ', but automated checks show ' + exceptionCount + ' exception' + (exceptionCount === 1 ? '' : 's') + '.' : '.');
    } else if (c.lastVerified) {
      level = 'asserted';
      basis = 'Verified by a person, no evidence attached' + (exceptionCount ? '; automated checks show ' + exceptionCount + ' exception' + (exceptionCount === 1 ? '' : 's') + '.' : '.');
    } else {
      level = 'unsupported';
      basis = 'Marked implemented with no evidence, no verification and no automated signal.';
    }

    return {
      level: level, basis: basis,
      observations: observations, passCount: passCount, exceptionCount: exceptionCount,
      staleDays: staleDays, stale: stale && level !== 'excluded' && level !== 'not-implemented',
      lastObservedDate: eff ? (eff.lastObservedDate || null) : null
    };
  }

  /* Portfolio roll-up: how many controls sit at each assurance level.
     This is the number a board paper or a CPS 234 attestation actually
     needs — "68% implemented" says nothing about how much of that is
     an unsupported claim. Counts only applicable controls, since an
     excluded control is not a gap. */
  function assuranceSummary(assurances) {
    var out = { demonstrated: 0, evidenced: 0, asserted: 0, unsupported: 0, notImplemented: 0, excluded: 0, stale: 0, withExceptions: 0, applicable: 0 };
    (assurances || []).forEach(function (a) {
      if (!a) return;
      if (a.level === 'excluded') { out.excluded++; return; }
      out.applicable++;
      if (a.level === 'demonstrated') out.demonstrated++;
      else if (a.level === 'evidenced') out.evidenced++;
      else if (a.level === 'asserted') out.asserted++;
      else if (a.level === 'unsupported') out.unsupported++;
      else if (a.level === 'not-implemented') out.notImplemented++;
      if (a.stale) out.stale++;
      if (a.exceptionCount > 0) out.withExceptions++;
    });
    return out;
  }

  /* Did this scan's per-check results move at all against the ones the
     previous scan recorded? app.js's runScan() only writes a new Scan
     row when something a Dashboard tile trends against has changed
     (date, score, critical-risk count, overdue-action count) — but two
     checks can swap places (one pass -> fail, another fail -> pass) on
     the same day for an identical score and identical counts. Without
     this, that scan was never persisted: the practitioner saw the new
     results on screen, and the next page load silently restored the
     PREVIOUS scan's results from its stored Detail JSON, losing both
     the corrected posture and the SOC 2 Type II observation of the
     check that dipped.

     Compares the union of both sides' keys, so a check appearing for
     the first time (a capability that only became readable this run)
     or disappearing (one that stopped being readable) both count as
     movement. Either side missing entirely is "no movement" — the
     caller decides what to do when there is nothing to compare
     against, since a first-ever scan is already handled by its own
     branch. */
  function scanResultsChanged(prevResults, nextResults) {
    if (!prevResults || !nextResults) return false;
    var seen = {};
    Object.keys(prevResults).forEach(function (k) { seen[k] = true; });
    Object.keys(nextResults).forEach(function (k) { seen[k] = true; });
    return Object.keys(seen).some(function (k) { return prevResults[k] !== nextResults[k]; });
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
    if (fw === 'iso27001' || fw === 'iso42001' || fw === 'iso27701' || fw === 'is18') {
      /* is18 codes are dot-segmented the same way ("IS18.4.1" ->
         theme "IS18.4" — its Essential Eight section), so it shares
         the ISO-style first-two-segments theming. */
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

  /* Groups applicable-control rows into concentric "rings" for the
     Compliance Fingerprint — one ring per theme (reuses whatever theme
     key the caller attaches to each row, typically constellationTheme()
     above), each ring's completion % = implemented/total within that
     theme. `rows`: [{ theme, implemented: bool, evidenced: bool }].
     Pure aggregation — the caller decides what counts as "applicable"
     before calling this, same division of responsibility as
     readinessPct() elsewhere in this file. */
  function fingerprintFromRows(rows) {
    rows = Array.isArray(rows) ? rows : [];
    var themeMap = {};
    rows.forEach(function (r) {
      var key = r.theme || '—';
      (themeMap[key] = themeMap[key] || []).push(r);
    });
    var rings = Object.keys(themeMap).sort().map(function (theme) {
      var arr = themeMap[theme];
      var implemented = arr.filter(function (r) { return !!r.implemented; }).length;
      return { key: theme, label: theme, total: arr.length, implemented: implemented, pct: arr.length ? Math.round(implemented / arr.length * 100) : 0 };
    });
    var total = rows.length;
    var implementedTotal = rows.filter(function (r) { return !!r.implemented; }).length;
    var evidencedTotal = rows.filter(function (r) { return !!r.evidenced; }).length;
    return {
      rings: rings,
      total: total,
      centerPct: total ? Math.round(implementedTotal / total * 100) : 0,
      evidencePct: total ? Math.round(evidencedTotal / total * 100) : 0
    };
  }

  /* The Certification Journey's projected audit-ready date — the one
     number in this file that gets quoted to a board, so it is
     deliberately conservative and honest rather than clever:
       - `events`: one ISO date per control the moment it became
         Implemented (from the audit log's "Control status changed"
         entries, deduped to each control's most recent transition, or
         its LastVerified date as a fallback — the caller's job, this
         function only ever sees plain date strings).
       - Velocity is measured ONLY inside the trailing 8-week window
         ending `today` — a control implemented 4 months ago says
         nothing about whether the team is still moving, so it must
         not prop up a stalled team's projection.
       - Under 3 weeks of history, or zero velocity in that window,
         returns 'insufficient-history' — never a fabricated date.
       - The projection is a straight line (remaining controls ÷
         weekly velocity), clamped at 10 years out so a near-zero
         velocity can't produce an absurd or Date-overflowing result;
         still returned as a real (if distant) projected date, not a
         second "insufficient" excuse — a slow team deserves an honest
         "years away" over a hidden number. */
  function remediationVelocityProjection(opts) {
    opts = opts || {};
    var today = opts.today;
    var todayMs = Date.parse(today);
    var applicableTotal = Math.max(0, Math.round(Number(opts.applicableTotal) || 0));
    var implementedNow = Math.max(0, Math.min(applicableTotal, Math.round(Number(opts.implementedNow) || 0)));
    var remaining = applicableTotal - implementedNow;
    if (!isFinite(todayMs)) return { status: 'insufficient-history' };
    if (remaining <= 0) return { status: 'complete' };

    var events = (opts.events || [])
      .map(function (e) { return Date.parse(e); })
      .filter(function (ms) { return isFinite(ms) && ms <= todayMs; })
      .sort(function (a, b) { return a - b; });
    if (!events.length) return { status: 'insufficient-history' };

    var DAY_MS = 86400000, WEEK_DAYS = 7, WINDOW_WEEKS = 8;
    var historyDays = (todayMs - events[0]) / DAY_MS;
    if (historyDays < WEEK_DAYS * 3) return { status: 'insufficient-history' };

    var windowStartMs = todayMs - WINDOW_WEEKS * WEEK_DAYS * DAY_MS;
    var windowEvents = events.filter(function (ms) { return ms >= windowStartMs; });
    var windowSpanDays = Math.min(WINDOW_WEEKS * WEEK_DAYS, historyDays);
    var velocityPerWeek = windowSpanDays > 0 ? windowEvents.length / (windowSpanDays / WEEK_DAYS) : 0;
    if (velocityPerWeek <= 0) return { status: 'insufficient-history' };

    var MAX_WEEKS = 520; /* 10-year clamp — see header comment */
    var weeksNeeded = Math.min(MAX_WEEKS, remaining / velocityPerWeek);
    var projectedMs = todayMs + weeksNeeded * WEEK_DAYS * DAY_MS;
    return {
      status: 'projected',
      date: new Date(projectedMs).toISOString().slice(0, 10),
      clamped: remaining / velocityPerWeek > MAX_WEEKS,
      velocityPerWeek: Math.round(velocityPerWeek * 100) / 100,
      weeksNeeded: Math.round(weeksNeeded * 10) / 10,
      remaining: remaining
    };
  }

  /* Buckets a flat list of activity events into `weeks` trailing 7-day
     windows ending `todayIso`, for the Assurance Pulse grid. `events`:
     [{ date: isoDate, type: 'scan'|'evidence'|'attestation'|'review'|
     'audit' }] — the caller (app.js) is responsible for turning
     S.scans/S.auditLog/S.reviews/S.audits into this flat shape; this
     function only ever aggregates. Bucket 0 is the OLDEST week, bucket
     `weeks-1` is the most recent (ending today) — left-to-right reads
     oldest-to-newest, matching how the grid renders. An event whose
     date can't be parsed, or falls outside the window, or carries an
     unrecognised type, is silently dropped rather than mis-bucketed —
     same "degrade safely, never throw" posture as the rest of this
     file's caller-data functions. */
  function weeklyActivityGrid(events, weeks, todayIso) {
    weeks = weeks > 0 ? Math.round(weeks) : 26;
    var todayMs = Date.parse(todayIso);
    var DAY_MS = 86400000, WEEK_MS = 7 * DAY_MS;
    var TYPES = ['scan', 'evidence', 'attestation', 'review', 'audit'];
    var buckets = [];
    for (var w = 0; w < weeks; w++) {
      var weeksAgo = weeks - 1 - w;
      var endMs = isFinite(todayMs) ? todayMs - weeksAgo * WEEK_MS : NaN;
      var startMs = endMs - WEEK_MS + DAY_MS;
      var counts = {};
      TYPES.forEach(function (t) { counts[t] = 0; });
      buckets.push({
        weekIndex: w,
        start: isFinite(startMs) ? new Date(startMs).toISOString().slice(0, 10) : null,
        end: isFinite(endMs) ? new Date(endMs).toISOString().slice(0, 10) : null,
        counts: counts,
        total: 0
      });
    }
    if (!isFinite(todayMs)) return buckets;
    (events || []).forEach(function (e) {
      if (!e) return;
      var ms = Date.parse(e.date);
      if (!isFinite(ms) || ms > todayMs) return;
      var weeksAgo = Math.floor((todayMs - ms) / WEEK_MS);
      var idx = weeks - 1 - weeksAgo;
      if (idx < 0 || idx >= weeks) return;
      if (TYPES.indexOf(e.type) === -1) return;
      buckets[idx].counts[e.type]++;
      buckets[idx].total++;
    });
    return buckets;
  }

  /* A single risk bubble's deterministic position for the Risk
     Landscape — seeded by the risk's own id (never Math.random()), so
     the same risk always lands in the same spot within its L×I cell
     (small jitter only, to separate risks that share a cell) and a
     "previous quarter" trail point computed with the risk's OLD L/I
     via this same function lines up with its current bubble's jitter
     automatically, since both calls hash the same id. */
  function riskBubblePoint(id, L, I, opts) {
    opts = opts || {};
    var size = opts.size != null ? opts.size : 300;
    var margin = opts.margin != null ? opts.margin : 30;
    var cell = (size - 2 * margin) / 5;
    L = Math.max(1, Math.min(5, Math.round(Number(L) || 1)));
    I = Math.max(1, Math.min(5, Math.round(Number(I) || 1)));
    function hash(s) {
      var h = 0;
      s = String(s);
      for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return h >>> 0;
    }
    function unit(h) { return (h % 1000) / 1000; } /* deterministic 0..1 */
    var jx = (unit(hash(id + '|x')) - 0.5) * cell * 0.55;
    var jy = (unit(hash(id + '|y')) - 0.5) * cell * 0.55;
    return {
      x: Math.round((margin + (L - 0.5) * cell + jx) * 100) / 100,
      y: Math.round((size - margin - (I - 0.5) * cell + jy) * 100) / 100,
      L: L, I: I
    };
  }

  /* Full bubble layout for the Risk Landscape: every risk over
     `opts.maxIndividual` (default 50) — the busiest tenants can have
     more open risks than a field can show as distinct, clickable
     bubbles — is dropped from individual layout and rolled into
     `overflowCount` instead, so the caller can render a single "+N"
     cluster badge rather than either crashing or drawing 200
     unreadable overlapping circles. The most severe risks (by residual
     score) are always the ones kept individual. `risks`: [{ id, L, I }]
     (residual L/I — the caller computes residual() before calling
     this, same division of responsibility as fingerprintFromRows()). */
  function riskBubbleLayout(risks, opts) {
    opts = opts || {};
    var maxIndividual = opts.maxIndividual != null ? opts.maxIndividual : 50;
    var minR = opts.minR != null ? opts.minR : 6;
    var maxR = opts.maxR != null ? opts.maxR : 22;
    risks = Array.isArray(risks) ? risks : [];
    var sorted = risks.slice().sort(function (a, b) {
      var sa = (Number(a.L) || 0) * (Number(a.I) || 0), sb = (Number(b.L) || 0) * (Number(b.I) || 0);
      return sb - sa || String(a.id).localeCompare(String(b.id));
    });
    var shown = sorted.slice(0, maxIndividual);
    var overflow = sorted.slice(maxIndividual);
    var bubbles = shown.map(function (r) {
      var p = riskBubblePoint(r.id, r.L, r.I, opts);
      var score = p.L * p.I;
      var radius = minR + (maxR - minR) * Math.sqrt(score / 25);
      return { id: r.id, x: p.x, y: p.y, r: Math.round(radius * 100) / 100, L: p.L, I: p.I, score: score, band: band(score) };
    });
    return { bubbles: bubbles, overflowCount: overflow.length, size: opts.size != null ? opts.size : 300, margin: opts.margin != null ? opts.margin : 30 };
  }

  /* WCAG relative-luminance/contrast-ratio primitives — used to pick a
     readable text color for the residual risk heatmap's cells, whose
     background is a severity hue alpha-blended over whichever theme
     (dark ink or light paper) is currently showing through. A fixed
     per-severity text color (the old approach) can't be right for
     both: the same "Critical" cell is mostly background at low risk
     counts and mostly the saturated hue at high counts, and dark vs
     light theme flips which end of that range needs light vs dark
     text. Computing it from the actual composited color is the only
     way to stay correct across every theme × alpha combination. */
  function relLuminance(rgb) {
    var a = rgb.map(function (v) {
      v = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrastRatio(rgbA, rgbB) {
    var lA = relLuminance(rgbA), lB = relLuminance(rgbB);
    var lighter = Math.max(lA, lB), darker = Math.min(lA, lB);
    return (lighter + 0.05) / (darker + 0.05);
  }
  /* Alpha-composites `fgRgb` over `bgRgb` (both [r,g,b], 0-255) — the
     same math the browser does for `rgba()`, just resolved in JS so a
     resulting solid color can be contrast-checked. */
  function compositeOverBg(fgRgb, alpha, bgRgb) {
    alpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    return [0, 1, 2].map(function (i) { return fgRgb[i] * alpha + bgRgb[i] * (1 - alpha); });
  }
  /* Picks whichever of `lightRgb`/`darkRgb` has the higher contrast
     against `bgRgb` — the standard "auto" readable-text-color
     technique, resolved via real contrast math rather than a
     luminance-midpoint guess (which mis-picks for saturated hues where
     perceived vs. measured brightness diverge). Ties (a bg exactly as
     readable either way) favor `darkRgb`. */
  function pickReadableRgb(bgRgb, lightRgb, darkRgb) {
    var lightContrast = contrastRatio(lightRgb, bgRgb);
    var darkContrast = contrastRatio(darkRgb, bgRgb);
    return darkContrast >= lightContrast ? darkRgb : lightRgb;
  }

  /* ============================================================
     Financial risk quantification — Monte Carlo simulation over the
     existing ordinal risk register (Likelihood × Impact, 1-5), so a
     board sees a simulated annual-loss distribution instead of just
     "High" or "12". Nothing here needs a new data-entry field: every
     input is derived from a risk's own residual L/I via a documented,
     overridable mapping (RISK_FINANCIAL_BANDS below) — the whole point
     is that this runs automatically, with no separate FAIR-style
     interview per risk required before it's useful.

     Deliberately simple, named distributions rather than a full FAIR/
     Beta-PERT model: a TRIANGULAR distribution for loss magnitude and
     event frequency (closed-form inverse CDF — exact, fast, and a
     standard, industry-accepted stand-in for PERT in lightweight
     quantitative risk tools — see Hubbard, "How to Measure Anything in
     Cybersecurity Risk"), and a POISSON count of loss events per
     trial-year driven by that trial's sampled frequency. This is an
     order-of-magnitude planning tool, not a certified actuarial model
     — every UI surface that shows its output says so.

     Determinism: real use always seeds from crypto/Date-derived
     entropy (the caller's job — this file never calls Math.random()
     itself, so every function here stays a pure, seed-in/numbers-out
     function safe to unit-test bit-for-bit). mulberry32() is the
     seeded PRNG used both by production (seeded fresh per run) and by
     tests (a fixed seed reproduces an exact trial sequence). */
  function mulberry32(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) | 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Samples a triangular(min, likely, max) distribution given a
     uniform draw `u` in [0,1) — the standard closed-form inverse CDF,
     so the same `u` always yields the same, hand-verifiable sample.
     Degenerates to a point mass at `min` if max<=min (a risk with no
     real range given). */
  function sampleTriangular(min, likely, max, u) {
    min = Number(min) || 0; max = Number(max) || 0; likely = Number(likely) || 0;
    if (max <= min) return min;
    likely = Math.max(min, Math.min(max, likely));
    var c = (likely - min) / (max - min);
    if (u < c) return min + Math.sqrt(u * (max - min) * (likely - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - likely));
  }

  /* Knuth's algorithm for a Poisson(lambda) draw, given a `rand()`
     source of uniform [0,1) draws — the number of independent events
     in one trial-year at that trial's own sampled frequency. lambda<=0
     always returns 0 (a year with an effectively-zero event rate has
     no loss events, not a negative or fractional one). */
  function samplePoisson(lambda, rand) {
    lambda = Number(lambda) || 0;
    if (lambda <= 0) return 0;
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= rand(); } while (p > L);
    return k - 1;
  }

  /* The only assumption this whole feature makes: illustrative loss-
     magnitude (USD) and annual-event-frequency ranges per residual L/I
     score, min/likely/max for each of the 5 ordinal levels. These are
     starting points, not measured data — deliberately documented and
     exported so the UI can show them next to every result, and so a
     tenant with real loss history or actuarial data can override
     specific risks rather than trusting the illustrative default. */
  var RISK_FINANCIAL_BANDS = {
    lossUsd: {
      1: { min: 1000, likely: 5000, max: 15000 },
      2: { min: 5000, likely: 20000, max: 60000 },
      3: { min: 20000, likely: 75000, max: 250000 },
      4: { min: 75000, likely: 300000, max: 1000000 },
      5: { min: 300000, likely: 1200000, max: 5000000 }
    },
    eventsPerYear: {
      1: { min: 0.05, likely: 0.1, max: 0.3 },
      2: { min: 0.1, likely: 0.3, max: 0.8 },
      3: { min: 0.3, likely: 0.8, max: 2 },
      4: { min: 0.8, likely: 2, max: 5 },
      5: { min: 2, likely: 5, max: 12 }
    }
  };

  /* One risk's default financial inputs, derived from its own L
     (frequency) and I (loss magnitude) — clamped into 1..5 so an out-
     of-range or missing score never throws. `overrides` (optional)
     lets a caller substitute a risk-specific {lossMin,lossLikely,
     lossMax,freqMin,freqLikely,freqMax} for any subset of these
     fields, without needing a full alternate code path. */
  function riskFinancialInputs(L, I, overrides) {
    overrides = overrides || {};
    var li = Math.max(1, Math.min(5, Math.round(Number(L) || 1)));
    var ii = Math.max(1, Math.min(5, Math.round(Number(I) || 1)));
    var freq = RISK_FINANCIAL_BANDS.eventsPerYear[li];
    var loss = RISK_FINANCIAL_BANDS.lossUsd[ii];
    return {
      freqMin: overrides.freqMin != null ? overrides.freqMin : freq.min,
      freqLikely: overrides.freqLikely != null ? overrides.freqLikely : freq.likely,
      freqMax: overrides.freqMax != null ? overrides.freqMax : freq.max,
      lossMin: overrides.lossMin != null ? overrides.lossMin : loss.min,
      lossLikely: overrides.lossLikely != null ? overrides.lossLikely : loss.likely,
      lossMax: overrides.lossMax != null ? overrides.lossMax : loss.max
    };
  }

  /* Runs `trials` Monte Carlo years for one risk: each trial samples a
     frequency from the triangular(freqMin,freqLikely,freqMax) range,
     draws a Poisson-distributed count of loss events at that sampled
     rate, then sums a fresh triangular(lossMin,lossLikely,lossMax)
     draw per event — so a trial with 3 events sums 3 independent loss
     draws, not one draw multiplied by 3 (a materially different, more
     realistic tail: many small years and occasional very bad ones,
     rather than a smooth scaling of the "average" year). Returns the
     plain array of `trials` annual-loss totals — summarize with
     summarizeLossDistribution() below. */
  function simulateRiskLosses(inputs, trials, seed) {
    trials = Math.max(1, Math.round(Number(trials) || 1000));
    var rand = mulberry32(seed >>> 0);
    var losses = new Array(trials);
    for (var t = 0; t < trials; t++) {
      var freq = sampleTriangular(inputs.freqMin, inputs.freqLikely, inputs.freqMax, rand());
      var events = samplePoisson(freq, rand);
      var total = 0;
      for (var e = 0; e < events; e++) total += sampleTriangular(inputs.lossMin, inputs.lossLikely, inputs.lossMax, rand());
      losses[t] = total;
    }
    return losses;
  }

  /* Runs the whole open-risk portfolio in one pass and returns both
     each risk's own loss array AND the portfolio total per trial (the
     same trial index summed across every risk) — the portfolio total
     is NOT the sum of each risk's independent percentiles (percentiles
     don't add), it has to be simulated jointly, trial by trial, which
     is exactly what this does. `risks`: [{ id, L, I, overrides? }].
     Each risk gets its own seed (derived from the portfolio seed + its
     index) so risks don't share a draw sequence and accidentally
     correlate. */
  function simulatePortfolioLosses(risks, trials, seed) {
    risks = Array.isArray(risks) ? risks : [];
    trials = Math.max(1, Math.round(Number(trials) || 1000));
    var baseSeed = (Number(seed) || 0) >>> 0;
    var portfolioTotals = new Array(trials).fill(0);
    var perRisk = risks.map(function (r, i) {
      var inputs = riskFinancialInputs(r.L, r.I, r.overrides);
      var losses = simulateRiskLosses(inputs, trials, (baseSeed + (i + 1) * 2654435761) >>> 0);
      for (var t = 0; t < trials; t++) portfolioTotals[t] += losses[t];
      return { id: r.id, inputs: inputs, losses: losses };
    });
    return { perRisk: perRisk, portfolioTotals: portfolioTotals };
  }

  /* Summary statistics for one array of simulated annual-loss trials —
     mean (the textbook Annualized Loss Expectancy), median, and the
     percentiles a board actually asks for (P90/P95/P99 — "how bad is
     the bad-but-plausible year"). Percentiles use the nearest-rank
     method (sorted array, index = round(p*(n-1))) rather than
     interpolation — simpler, and exact for the trial counts this
     feature runs at (1,000+). */
  function summarizeLossDistribution(losses) {
    losses = Array.isArray(losses) ? losses : [];
    var n = losses.length;
    if (!n) return { mean: 0, median: 0, p10: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, count: 0 };
    var sorted = losses.slice().sort(function (a, b) { return a - b; });
    function pct(p) { return sorted[Math.max(0, Math.min(n - 1, Math.round(p * (n - 1))))]; }
    var sum = 0;
    for (var i = 0; i < n; i++) sum += sorted[i];
    return {
      mean: sum / n, median: pct(0.5), p10: pct(0.1), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99),
      min: sorted[0], max: sorted[n - 1], count: n
    };
  }

  /* Loss exceedance curve — P(annual loss > x) at each of `points`
   x-values evenly spaced from 0 to the trial set's own max (so the
   curve always spans its real data range, never an arbitrarily-guessed
   axis). This is the standard FAIR/quantitative-risk chart: the
   further right a given probability holds, the fatter the tail. */
  function lossExceedanceCurve(losses, points) {
    losses = Array.isArray(losses) ? losses : [];
    points = Math.max(2, Math.round(Number(points) || 40));
    var n = losses.length;
    if (!n) return [];
    var max = losses.reduce(function (m, v) { return Math.max(m, v); }, 0);
    if (max <= 0) return [{ x: 0, p: 0 }];
    var sorted = losses.slice().sort(function (a, b) { return a - b; });
    function exceedanceProb(x) {
      // count of losses > x, via binary search on the sorted array (upper bound)
      var lo = 0, hi = n;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (sorted[mid] <= x) lo = mid + 1; else hi = mid; }
      return (n - lo) / n;
    }
    var curve = [];
    for (var i = 0; i < points; i++) {
      var x = (max / (points - 1)) * i;
      curve.push({ x: x, p: exceedanceProb(x) });
    }
    return curve;
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

  /* ================= Segregation of duties =================
     ISO 27001 A.5.3 asks that conflicting duties be separated so that
     no single person can both perform and authorise the same act. The
     two places that matters most in Checkpoint are approving a policy
     document and accepting a residual risk: in both, one person is
     recording a decision that is supposed to have been made by someone
     with the authority to make it.

     This function decides only ONE thing: is the person authorising
     this the same person who originated it? It is deliberately pure
     and returns a finding rather than a verdict, because what the app
     does about a conflict (warn and record, or refuse) is a policy
     choice the client makes in Settings, not something to bake in
     here.

     Identity is matched on the Entra account id first, which is stable
     and unambiguous. Display name is only a fallback for entries that
     predate actorId being recorded, or for demo mode, where there is
     no real account -- and it is reported separately, because a name
     match is weaker evidence than an id match and an auditor reading
     this should be able to tell which one it was. */
  function evaluateSegregation(o) {
    o = o || {};
    function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
    var authorId = norm(o.authorId), approverId = norm(o.approverId);
    var authorName = norm(o.authorName), approverName = norm(o.approverName);

    /* No recorded originator at all -- an imported record, or one made
       before this was tracked. Silence is not a conflict; claiming one
       would train people to click through the warning. */
    if (!authorId && !authorName) return { conflict: false, matchedOn: null, reason: '' };

    if (authorId && approverId && authorId === approverId) {
      return { conflict: true, matchedOn: 'id', reason: 'The signed-in account that originated this is the one authorising it.' };
    }
    /* Only fall back to names when at least one side has no id to
       compare -- two different accounts that happen to share a display
       name are a real possibility, but if both ids are present and
       differ, they ARE different people and the names do not matter. */
    if ((!authorId || !approverId) && authorName && approverName && authorName === approverName) {
      return { conflict: true, matchedOn: 'name', reason: 'The name recorded as originating this matches the name authorising it.' };
    }
    return { conflict: false, matchedOn: null, reason: '' };
  }

  /* ================= CSV import =================
     The export half of the story has existed since the beginning; the
     import half did not, which meant an enterprise arriving with a risk
     register in a spreadsheet -- or migrating off another GRC tool --
     hand-keyed it. That is the difference between a one-day and a
     three-week onboarding.

     Everything here is deliberately pure and side-effect free: parse,
     map, validate, and REPORT. Nothing in this module writes. The
     caller runs the plan past a human first, because this is the only
     feature in Checkpoint that bulk-writes into a client's real
     compliance register, and the failure mode of getting it wrong is
     somebody's risk register quietly filling with junk.

     parseCsv() is the exact inverse of toCsv() above: RFC 4180 quoting,
     "" for a literal quote inside a quoted field, and embedded commas
     and newlines preserved. A Checkpoint export therefore round-trips
     through it unchanged, which is the cheapest possible way for a
     practitioner to check the format -- export, edit in Excel,
     re-import. */
  function parseCsv(text) {
    var rows = [], row = [], field = '', inQuotes = false;
    var src = String(text == null ? '' : text);
    /* A BOM is what Excel writes on "Save as CSV UTF-8", and left in
       place it corrupts the very first header name -- which then fails
       to match any known column and silently drops that column. */
    if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
    for (var i = 0; i < src.length; i++) {
      var c = src[i];
      if (inQuotes) {
        if (c === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
        continue;
      }
      if (c === '"') { inQuotes = true; continue; }
      if (c === ',') { row.push(field); field = ''; continue; }
      if (c === '\r') { if (src[i + 1] === '\n') i++; rows.push(row.concat(field)); row = []; field = ''; continue; }
      if (c === '\n') { rows.push(row.concat(field)); row = []; field = ''; continue; }
      field += c;
    }
    /* A trailing newline must not manufacture a phantom empty row. */
    if (field !== '' || row.length) rows.push(row.concat(field));
    return rows;
  }

  /* Header matching is forgiving on presentation and strict on meaning:
     case, surrounding whitespace and non-alphanumerics are ignored, so
     "Due date", "due_date" and "DUE DATE" all match, but an unrecognised
     column is reported rather than guessed at. */
  function normaliseHeader(h) {
    return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /* Builds an import plan WITHOUT applying it. `spec` describes the
     target register: its columns (each {key, aliases, required,
     validate}) and a `label`. Returns every row classified, so the
     caller can show a human exactly what would happen before anything
     is written. */
  function planCsvImport(text, spec) {
    var rows = parseCsv(text).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
    var out = { label: spec.label, columns: [], unknownColumns: [], ready: [], skipped: [], totalRows: 0 };
    if (!rows.length) { out.error = 'The file is empty.'; return out; }

    var headerRow = rows[0].map(normaliseHeader);
    var byIndex = {};
    headerRow.forEach(function (h, i) {
      var col = spec.columns.find(function (c) {
        return normaliseHeader(c.key) === h || (c.aliases || []).some(function (a) { return normaliseHeader(a) === h; });
      });
      if (col) { byIndex[i] = col; out.columns.push(col.key); }
      else if (h) out.unknownColumns.push(rows[0][i]);
    });

    var missingRequired = spec.columns.filter(function (c) { return c.required && out.columns.indexOf(c.key) === -1; });
    if (missingRequired.length) {
      out.error = 'The file is missing required column' + (missingRequired.length === 1 ? '' : 's') + ': ' +
        missingRequired.map(function (c) { return c.key; }).join(', ') + '.';
      return out;
    }

    out.totalRows = rows.length - 1;
    for (var r = 1; r < rows.length; r++) {
      var raw = rows[r], rec = {}, problems = [];
      Object.keys(byIndex).forEach(function (idx) {
        var col = byIndex[idx];
        rec[col.key] = String(raw[idx] == null ? '' : raw[idx]).trim();
      });
      spec.columns.forEach(function (col) {
        var v = rec[col.key] || '';
        if (col.required && !v) { problems.push(col.key + ' is required'); return; }
        if (v && col.validate) {
          var err = col.validate(v, rec);
          if (err) problems.push(err);
        }
      });
      /* Row number is the line a human sees in Excel: header is row 1. */
      var lineNo = r + 1;
      if (problems.length) out.skipped.push({ line: lineNo, reason: problems.join('; '), raw: rec });
      else out.ready.push({ line: lineNo, rec: rec });
    }
    return out;
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
     default expiry differ) and different UI built on top elsewhere
     ('partner' unlocks the separate owner console in public/owner/; a
     "Trial — N days remaining" banner in the client app for 'demo').
     `daysRemaining` is always computed (whole calendar days from `now`
     to expiry, negative once past it) — every caller that isn't
     'demo' simply never reads it. */
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

  /* Picks which of zero-or-more ALREADY-VERIFIED activation candidates
     should govern this session, and which of the stores they came from
     are now stale and need to be brought in line with the winner.

     Each candidate is the caller's own record of one independent store
     (typically `{ source: 'local', raw, ok, evalResult }` for this
     browser's localStorage and `{ source: 'tenant', raw, ok,
     evalResult }` for the tenant's shared Settings-list cache) AFTER
     that store's raw text has already been run through
     verifyEntitlementSignature()+evaluateEntitlement() (async, needs
     WebCrypto — done by the caller, not here). This function itself is
     pure/sync: it only ever compares `evalResult.issuedAt` strings
     (YYYY-MM-DD, so a plain string compare sorts correctly) between
     candidates that already passed signature+tenant+expiry checks —
     never re-verifies anything, never touches storage.

     No verified candidates -> no winner, nothing to reconcile (every
     store this tenant/browser has is either empty or invalid — up to
     the caller to report that as "missing" or "rejected"). Exactly one
     verified candidate -> it wins trivially, and every OTHER store
     (empty or invalid) counts as stale so the caller can (re)populate
     it. Two or more verified candidates -> the one with the latest
     issuedAt wins; every candidate whose raw text differs from the
     winner's is reported stale (including a candidate that verified
     fine but is simply an older issuance) so the caller can mirror the
     winner over it. Byte-identical raw text across candidates is never
     reported stale, even if compared to itself, since nothing would
     change by "fixing" it. */
  function reconcileActivationSources(candidates) {
    var verified = (candidates || []).filter(function (c) { return c && c.ok; });
    if (!verified.length) return { winner: null, staleSources: [] };
    var winner = verified.slice().sort(function (a, b) {
      var ai = String((a.evalResult && a.evalResult.issuedAt) || '');
      var bi = String((b.evalResult && b.evalResult.issuedAt) || '');
      return bi.localeCompare(ai);
    })[0];
    var staleSources = verified
      .filter(function (c) { return c.raw !== winner.raw; })
      .map(function (c) { return c.source; });
    return { winner: winner, staleSources: staleSources };
  }

  /* ==========================================================
     Owner console analytics — pure functions shared between
     public/owner/owner.js (browser) and the test suite (Node), same
     "pure logic here, DOM/Graph orchestration in the caller" split as
     everything else in this file. Every function takes its inputs as
     plain parameters (a `today` YYYY-MM-DD string, never Date.now()
     internally) so a test can assert against a fixed date. ========== */

  /* Picks the single governing entitlement per tenant — the one with
     the latest issuedAt, same "later issuedAt wins" rule
     reconcileActivationSources() already uses for the two-store
     activation design. An issuance history naturally accumulates one
     row per renewal for the same tenant; only the latest one is ever
     "the" entitlement for revenue/renewal purposes — counting every
     row would double- (or triple-, or more-) count a client who has
     renewed a few times. Returns a plain { [tenantId]: entitlement }
     map, not an array, so callers never have to search it. */
  function latestEntitlementsByTenant(entitlements) {
    var byTenant = {};
    (entitlements || []).forEach(function (e) {
      if (!e || !e.tenantId) return;
      var existing = byTenant[e.tenantId];
      if (!existing || String(e.issuedAt || '').localeCompare(String(existing.issuedAt || '')) > 0) {
        byTenant[e.tenantId] = e;
      }
    });
    return byTenant;
  }

  /* Revenue math over PartnerEntitlements x PartnerPrices, as of
     `today`. `entitlements`: [{tenantId, type, modules, issuedAt,
     expiry, renewedBy}] (renewedBy: truthy once a superseding
     entitlement has been recorded against this one — see owner.js's
     "prepare renewal" flow). `prices`: { [moduleId]: annualPrice } —
     a module with no price on file contributes 0, never throws (a
     missing price is a PartnerPrices data-entry gap to fix, not a
     reason to crash the revenue board).

     Only the LATEST entitlement per tenant counts (via
     latestEntitlementsByTenant() above) — a superseded old entitlement
     contributes nothing, even if its own `expiry` hasn't technically
     passed yet, since its tenant's real current terms are whatever the
     latest entitlement says.

     'client'-type entitlements drive activeAnnualRevenue/revenueByModule
     /committedNext12Months/expiringUnrenewed/expiringIn30Days — actual
     contracted revenue. 'demo'-type entitlements drive
     trialPipelineValue only — POTENTIAL revenue if the trial converts,
     kept entirely separate so it's never double-counted as booked
     revenue. 'partner'-type entitlements (Compliance365's own) are
     never revenue and are ignored here entirely.

     committedNext12Months + expiringUnrenewed always sums to exactly
     activeAnnualRevenue — every active client entitlement falls into
     exactly one bucket: still-committed for the full next 12 months
     (>=365 days to expiry, OR already renewed) or genuinely at risk
     this year (renews within 365 days AND nothing recorded against it
     yet). expiringIn30Days is the same "at risk, not yet renewed" test
     narrowed to a 30-day window — the cash-flow number: revenue that
     lapses within the month unless someone acts on it right now. */
  /* Sum of a set of modules' annual list prices — the one-line calc
     behind every per-client "annual value" figure the owner console
     shows (Renewals runway, Client costs). Missing prices count as $0,
     same convention as computePartnerRevenue() below. */
  function entitlementAnnualValue(modules, prices) {
    prices = prices || {};
    return (modules || []).reduce(function (sum, m) { return sum + (Number(prices[m]) || 0); }, 0);
  }

  function computePartnerRevenue(entitlements, prices, today) {
    prices = prices || {};
    var byTenant = latestEntitlementsByTenant((entitlements || []).filter(function (e) { return e && e.type === 'client'; }));
    var demoByTenant = latestEntitlementsByTenant((entitlements || []).filter(function (e) { return e && e.type === 'demo'; }));

    function entitlementValue(e) {
      return (e.modules || []).reduce(function (sum, m) { return sum + (Number(prices[m]) || 0); }, 0);
    }
    function isActive(e) { return !!e.expiry && e.expiry >= today; }

    var activeAnnualRevenue = 0;
    var revenueByModule = {};
    var committedNext12Months = 0;
    var expiringUnrenewed = 0;
    var expiringIn30Days = 0;

    Object.keys(byTenant).forEach(function (tenantId) {
      var e = byTenant[tenantId];
      if (!isActive(e)) return;
      var value = entitlementValue(e);
      activeAnnualRevenue += value;
      (e.modules || []).forEach(function (m) { revenueByModule[m] = (revenueByModule[m] || 0) + (Number(prices[m]) || 0); });

      var daysToExpiry = daysBetweenDateStr(today, e.expiry);
      var renewed = !!e.renewedBy;
      if (daysToExpiry >= 365 || renewed) {
        committedNext12Months += value;
      } else {
        expiringUnrenewed += value;
        if (daysToExpiry <= 30) expiringIn30Days += value;
      }
    });

    var trialPipelineValue = 0;
    Object.keys(demoByTenant).forEach(function (tenantId) {
      var e = demoByTenant[tenantId];
      if (!isActive(e)) return;
      trialPipelineValue += entitlementValue(e);
    });

    return {
      activeAnnualRevenue: activeAnnualRevenue,
      revenueByModule: revenueByModule,
      committedNext12Months: committedNext12Months,
      expiringUnrenewed: expiringUnrenewed,
      expiringIn30Days: expiringIn30Days,
      trialPipelineValue: trialPipelineValue
    };
  }

  /* "Next best module" — the unlicensed framework a client is already
     closest to being ready for, based on cross-mapped controls from
     what they've actually implemented in a framework they DO have.
     Reuses the exact same control cross-reference data the client
     app's own Control Constellation draws from (each control's
     `MapsTo` field, parsed by parseMapTokens() above) — the owner
     console never needs the full framework/control registry itself,
     just this one string per synced control row.

     `controlRows`: this client's own last-synced Controls rows,
     [{applicable, status, mapsTo}] (fw of the SOURCE control is
     irrelevant here — only where each one's MapsTo tokens point).
     `licensedModules`: framework ids this client is already licensed
     for (a target framework they already have is never a "next"
     anything). `minSample` (default 3) guards against a single stray
     cross-reference producing a misleading 100% — a target framework
     needs at least this many of the client's own applicable, mapped
     controls before it's considered at all.

     Returns { moduleId, pct, sampleSize } for the highest-percentage
     qualifying target, or null if nothing meets minSample. Ties break
     on larger sample size, then lower moduleId string, so the result
     is always deterministic. */
  function computeNextBestModule(controlRows, licensedModules, minSample) {
    minSample = minSample || 3;
    var licensed = {};
    (licensedModules || []).forEach(function (m) { licensed[m] = true; });
    var totals = {}; /* moduleId -> { total, implemented } */
    (controlRows || []).forEach(function (c) {
      if (!c || !c.applicable) return;
      parseMapTokens(c.mapsTo).forEach(function (tok) {
        if (licensed[tok.fw]) return;
        var bucket = totals[tok.fw] || (totals[tok.fw] = { total: 0, implemented: 0 });
        bucket.total++;
        if (c.status === 'Implemented') bucket.implemented++;
      });
    });
    var best = null;
    Object.keys(totals).sort().forEach(function (moduleId) {
      var bucket = totals[moduleId];
      if (bucket.total < minSample) return;
      var pct = Math.round((bucket.implemented / bucket.total) * 100);
      if (!best || pct > best.pct || (pct === best.pct && bucket.total > best.sampleSize)) {
        best = { moduleId: moduleId, pct: pct, sampleSize: bucket.total };
      }
    });
    return best;
  }

  /* Composite Red/Amber/Green health for one client, as of `today` —
     drives the Client Health Strip's sort order (worst-first) and its
     summary card ("2 clients red…"). Every rule is checked in order;
     the FIRST one that matches wins, so precedence is: never synced
     (nothing to base health on at all — 'unknown', never fabricated)
     > confirmed problems (sync error, expired activation, owner-flagged
     "At risk", drift+low score, imminent unrenewed expiry) > confirmed
     caution (dormant, mediocre score, expiry within 60 days unrenewed)
     > green. `input`: {syncError, lastSynced, lastScanDate, score,
     driftAlerts, entitlementStatus, entitlementExpiry, manualStatus}
     — every field optional/nullable; a missing one just can't trigger
     the rules that need it. Returns {color: 'red'|'amber'|'green'|
     'unknown', reason}. `color` also defines sort order via
     CLIENT_HEALTH_RANK below (unknown sorts after red/amber — it isn't
     confirmed bad, but it's less trustworthy than a confirmed green). */
  var CLIENT_HEALTH_RANK = { red: 0, amber: 1, unknown: 2, green: 3 };
  function computeClientHealth(input, today) {
    input = input || {};
    if (!input.lastSynced) return { color: 'unknown', reason: 'Never synced — no health data available' };
    if (input.syncError) return { color: 'red', reason: 'Sync error: ' + input.syncError };
    if (input.entitlementStatus === 'expired') return { color: 'red', reason: 'Activation expired' };
    if (input.paymentOverdue) return { color: 'red', reason: 'Payment overdue' + (input.paymentOverdueDays ? ' (' + input.paymentOverdueDays + ' day(s))' : '') };
    if (input.manualStatus === 'At risk') return { color: 'red', reason: 'Flagged "At risk" by the owner' };
    if ((input.driftAlerts || 0) >= 1 && input.score != null && input.score < 40) {
      return { color: 'red', reason: input.driftAlerts + ' drift alert(s), score ' + input.score };
    }
    var daysToExpiry = input.entitlementExpiry ? daysBetweenDateStr(today, input.entitlementExpiry) : null;
    if (daysToExpiry != null && daysToExpiry <= 30 && input.manualStatus !== 'Renewed') {
      return { color: 'red', reason: 'Renewal due in ' + daysToExpiry + ' day(s), not yet renewed' };
    }
    var dormant = !input.lastScanDate || daysBetweenDateStr(input.lastScanDate, today) > 30;
    if (dormant) return { color: 'amber', reason: input.lastScanDate ? 'No scan activity in 30+ days' : 'No scan on record yet' };
    if (daysToExpiry != null && daysToExpiry <= 60 && input.manualStatus !== 'Renewed') {
      return { color: 'amber', reason: 'Renewal due in ' + daysToExpiry + ' day(s)' };
    }
    if (input.score != null && input.score < 70) return { color: 'amber', reason: 'Posture score ' + input.score };
    return { color: 'green', reason: 'Healthy' };
  }

  /* Ranks upsell candidates across a partner's whole client roster —
     each client's own nextBestModule/nextBestModulePct (computeNextBestModule's
     result from their last sync, denormalised onto the roster row) against
     a minimum confidence threshold, so a lone stray cross-mapped control
     doesn't produce a misleading suggestion next to a genuinely strong
     90%-ready near-miss. Sorted by dollar opportunity first (what's it
     actually worth chasing), falling back to readiness % when the
     module has no PartnerPrices row on file — never fabricates a $0,
     same honesty rule as owner.js's priceGaps(): `value` is null, not
     zero, when the price is simply unknown, and null-value rows always
     sort after priced ones regardless of pct. */
  function rankUpsellOpportunities(clients, prices, minPct) {
    minPct = minPct == null ? 50 : minPct;
    var priceMap = prices || {};
    return (clients || [])
      .filter(function (c) { return c.nextBestModule && (c.nextBestModulePct || 0) >= minPct; })
      .map(function (c) {
        var hasPrice = Object.prototype.hasOwnProperty.call(priceMap, c.nextBestModule);
        return {
          tenantId: c.tenantId, name: c.name, moduleId: c.nextBestModule,
          pct: c.nextBestModulePct, value: hasPrice ? priceMap[c.nextBestModule] : null
        };
      })
      .sort(function (a, b) {
        if ((a.value == null) !== (b.value == null)) return a.value == null ? 1 : -1;
        if (a.value != null && b.value != null && b.value !== a.value) return b.value - a.value;
        return b.pct - a.pct;
      });
  }

  /* Payment status for a client-type entitlement — "Overdue" is always
     DERIVED from today vs. the recorded invoice due date, never a
     separate hand-flipped flag that can silently go stale. The owner
     only ever sets two things: paymentStatus ('' | 'Invoiced' | 'Paid')
     and invoiceDueDate, the same "mark it when you see the money land"
     workflow as every other owner-set field in this console (compare
     ManualStatus on entitlements). Reconciling means periodically
     checking this against the actual accounting/invoicing tool and
     clicking "Mark paid" on what's cleared — this console has no
     integration with one. Returns { status, overdue, daysOverdue }
     where status is one of 'Not invoiced' | 'Invoiced' | 'Overdue' |
     'Paid'. Once marked Paid, stays Paid regardless of how late it
     was — paying late isn't the same as still owing. */
  function computePaymentStatus(entitlement, today) {
    var e = entitlement || {};
    if (e.paymentStatus === 'Paid') return { status: 'Paid', overdue: false, daysOverdue: 0 };
    if (e.paymentStatus === 'Invoiced') {
      if (e.invoiceDueDate) {
        var days = daysBetweenDateStr(e.invoiceDueDate, today);
        if (days > 0) return { status: 'Overdue', overdue: true, daysOverdue: days };
      }
      return { status: 'Invoiced', overdue: false, daysOverdue: 0 };
    }
    return { status: 'Not invoiced', overdue: false, daysOverdue: 0 };
  }

  /* Adds whole calendar months to a YYYY-MM-DD string, UTC, no ambient
     clock dependency — used to turn a 12/24/36-month issuance term into
     an expiry date (owner console's "New client" form). Relies on
     JS Date's own month-overflow rollover (setUTCMonth) rather than a
     hand-rolled calendar, same "don't reinvent it" principle as
     addDaysToDateStr above; the one edge case worth naming is a
     day-of-month that doesn't exist in the target month (e.g. Jan 31 +
     1 month), which Date rolls forward into the following month rather
     than clamping — acceptable here since this only ever feeds a
     12/24/36-month term, never a single-month add where that edge case
     would actually bite in practice. */
  function addMonthsToDateStr(dateStr, months) {
    var d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  /* A tenant identifier is either an Entra tenant GUID or a verified
     domain — the same two shapes evaluateEntitlement()/tenantIdsFor()
     already accept at verification time (see SETUP.md §7a). This is
     purely a form-level sanity check ("did I paste something that
     LOOKS like a tenant id/domain") — it can't and doesn't confirm the
     tenant actually exists or that this domain is actually verified for
     it; only a live activation/`--tenant` issuance against the real
     tenant does that. */
  /* The Entra admin-consent URL a client's Global Administrator opens
     to approve Checkpoint's Graph permissions for their whole tenant in
     one click — used by the owner console's client drawer and New
     client form.

     Pinning to the client's own tenant (rather than the generic
     /organizations/ path, which means "whichever tenant the signer
     happens to be in right now") matters specifically for a consultant
     or MSP signed into several tenants at once: the generic form will
     silently consent whichever one the browser picks, and undoing that
     means hunting down and removing an enterprise application from a
     tenant nobody meant to touch. An empty/missing tenantId falls back
     to the generic path rather than producing a broken URL — there is
     nothing to pin to yet, which is itself informative to whoever is
     looking at it. */
  function buildAdminConsentUrl(clientId, tenantId, redirectUri) {
    var tenant = String(tenantId || '').trim() || 'organizations';
    return 'https://login.microsoftonline.com/' + encodeURIComponent(tenant) +
      '/adminconsent?client_id=' + encodeURIComponent(clientId) +
      '&redirect_uri=' + encodeURIComponent(redirectUri);
  }

  function isValidTenantIdentifier(s) {
    if (!s) return false;
    var v = String(s).trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
    return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(v);
  }

  /* Case-insensitive, trimmed match against an existing PartnerClients
     roster — the owner console's "New client" form warns rather than
     blocks on a hit (a tenant might legitimately be re-added after
     being removed, or the match might be a coincidence worth a second
     look rather than a hard stop) — see buildClientIssuancePlan()'s
     caller in owner.js. Returns the matching client, or null. */
  function findDuplicateTenantClient(tenantId, clients) {
    var needle = String(tenantId || '').trim().toLowerCase();
    if (!needle) return null;
    return (clients || []).find(function (c) { return String(c.tenantId || '').trim().toLowerCase() === needle; }) || null;
  }

  /* Builds everything the owner console's "New client" form needs from
     one submission — the exact issue-entitlement.mjs CLI invocation
     (this console never holds the Ed25519 private key, see
     tools/ISSUANCE.md, so it can never sign a file itself), and the
     PartnerEntitlements row to record once that command has actually
     been run (or, if CONFIG.signingEndpoint is configured, once that
     endpoint has signed it instead — see ISSUANCE.md's "signing
     endpoint" section for the trade-off between the two paths).
     `input`: { tenantId, modules: [...], termMonths: 12|24|36,
     type: 'client'|'trial', renewsEntitlementId (optional, SharePoint
     item id of the entitlement this issuance renews) }. `today`:
     YYYY-MM-DD, passed in rather than read from the ambient clock so
     this stays a pure, fixture-testable function. A 'trial' form type
     maps to the payload/CLI's 'demo' type — the CLI and signed payload
     have never used the word "trial"; the form uses the client-facing
     word, this is the one place the translation happens. */
  function buildClientIssuancePlan(input, today) {
    input = input || {};
    var type = input.type === 'trial' ? 'demo' : 'client';
    var modules = (input.modules || []).slice().sort();
    var termMonths = Number(input.termMonths) || 12;
    var issuedAt = today;
    var expiry = addMonthsToDateStr(issuedAt, termMonths);
    var outFile = String(input.tenantId || 'client').replace(/[^a-z0-9.-]/gi, '-') + '-activation.json';
    var command = [
      'node tools/issue-entitlement.mjs issue',
      '--tenant ' + input.tenantId,
      '--frameworks ' + modules.join(','),
      '--expiry ' + expiry,
      type === 'demo' ? '--type demo' : '',
      '--key entitlement-private.json --module-keys tools/module-keys.json',
      '--out ' + outFile,
      '--record'
    ].filter(Boolean).join(' ');
    return {
      type: type, modules: modules, issuedAt: issuedAt, expiry: expiry, termMonths: termMonths,
      command: command, outFile: outFile,
      entitlementRecord: {
        tenantId: input.tenantId, type: type, modules: modules, issuedAt: issuedAt, expiry: expiry,
        manualStatus: '', renewedBy: '', renewsEntitlementId: input.renewsEntitlementId || ''
      }
    };
  }

  /* Post-purchase progress, purely derived from fields the roster
     already carries (plus one new one, packSentAt) — never a separate
     hand-maintained status enum that could drift from what actually
     happened. "Activated" reads c.onboarded (set true the moment a
     sync finds this tenant's own Controls list — which can only exist
     if that tenant's provisioning gate, itself gated on a verified
     activation, already opened; see store.js's
     assertActivationAuthorizesProvisioning()), not a separate
     unverifiable "did they apply the file" flag. Each stage's `at`
     is the timestamp/date that made it true, or '' if not reached yet
     — the owner console renders '' as "not yet", never a guessed date.
     Order matters (pack sent -> activated -> first scan -> synced) but
     stages are independently derived, not a strict state machine — e.g.
     a client who pastes an old activation file straight in without
     ever receiving "the pack" from this console can still show
     activated/scanned/synced with packSent still false, and that's
     honest, not a bug. */
  function computeClientChecklist(client) {
    var c = client || {};
    return [
      { key: 'packSent', label: 'Welcome pack sent', done: !!c.packSentAt, at: c.packSentAt || '' },
      { key: 'activated', label: 'Activated', done: !!c.onboarded, at: c.onboarded ? (c.lastSynced || '') : '' },
      { key: 'firstScan', label: 'First scan', done: !!c.lastScanDate, at: c.lastScanDate || '' },
      { key: 'synced', label: 'Synced', done: !!c.lastSynced, at: c.lastSynced || '' },
      /* Wizard step 8 ("Who can use Checkpoint?") sets up SharePoint
         group membership directly in the client's own tenant — nothing
         this console can read or verify from here. rolesConfiguredAt is
         therefore a manual, owner-set confirmation (partnerMarkRolesConfigured
         in owner.js), same honesty rule as packSent: absent just means
         "not confirmed yet", not "not done". */
      { key: 'rolesConfigured', label: 'Roles configured (Practitioner/Viewer)', done: !!c.rolesConfiguredAt, at: c.rolesConfiguredAt || '' }
    ];
  }

  /* Corrective-action (CAPA) state for a nonconformity, per ISO 27001
     Clause 10.1 — react/correct, find the root cause, act, then verify
     effectiveness. A plain Action (not a nonconformity) is trivially
     "complete" here — CAPA rigour only applies to Major/Minor NCs. Pure
     so the register indicators, the report, and the tests all read the
     exact same state. `nextStep` is the single next thing owed on an
     open CAPA, or '' when it's fully closed out (or not an NC). */
  function capaStatus(action) {
    var a = action || {};
    var isNc = !!(a.type && String(a.type).indexOf('Non-conformity') === 0);
    var hasCorrection = !!(a.correction && String(a.correction).trim());
    var hasRootCause = !!(a.rootCause && String(a.rootCause).trim());
    var effectivenessReviewed = !!(a.effectivenessReview && String(a.effectivenessReview).trim());
    var isDone = a.status === 'Done';
    if (!isNc) return { isNc: false, hasCorrection: hasCorrection, hasRootCause: hasRootCause, effectivenessReviewed: effectivenessReviewed, complete: true, nextStep: '' };
    var nextStep = !hasCorrection ? 'Record the immediate correction'
      : !hasRootCause ? 'Determine and record the root cause'
      : !isDone ? 'Complete the corrective action'
      : !effectivenessReviewed ? 'Review effectiveness of the corrective action'
      : '';
    return {
      isNc: true, hasCorrection: hasCorrection, hasRootCause: hasRootCause,
      effectivenessReviewed: effectivenessReviewed,
      complete: hasCorrection && hasRootCause && isDone && effectivenessReviewed,
      nextStep: nextStep
    };
  }

  /* The seven management-review inputs ISO 27001 Clause 9.3.2 requires
     the review to consider. Drives both the structured capture form and
     the Management Review Pack report, so the two can never list a
     different set. */
  var MR_INPUT_SECTIONS = [
    { key: 'priorActions', clause: '9.3.2 a', label: 'Status of actions from previous management reviews' },
    { key: 'issues', clause: '9.3.2 b', label: 'Changes in external and internal issues relevant to the ISMS' },
    { key: 'interestedParties', clause: '9.3.2 c', label: 'Changes in needs and expectations of interested parties' },
    { key: 'performance', clause: '9.3.2 d', label: 'Security performance: nonconformities & corrective actions, monitoring & measurement, audit results, fulfilment of objectives' },
    { key: 'feedback', clause: '9.3.2 e', label: 'Feedback from interested parties' },
    { key: 'riskStatus', clause: '9.3.2 f', label: 'Results of risk assessment and status of the risk treatment plan' },
    { key: 'improvement', clause: '9.3.2 g', label: 'Opportunities for continual improvement' }
  ];
  /* A review's Inputs field holds a JSON object keyed by the sections
     above once captured through the structured form. Reviews recorded
     before that existed hold free text instead — surfaced as { legacy }
     so nothing that reads them has to guess. */
  function parseReviewInputs(str) {
    if (!str) return {};
    try {
      var o = JSON.parse(str);
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch (e) { /* not JSON — a pre-structured free-text review */ }
    return { legacy: String(str) };
  }
  function serializeReviewInputs(obj) {
    obj = obj || {};
    var out = {};
    MR_INPUT_SECTIONS.forEach(function (s) { if (obj[s.key] && String(obj[s.key]).trim()) out[s.key] = String(obj[s.key]).trim(); });
    return JSON.stringify(out);
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

  /* EU AI Act risk classification — Article 5 prohibited practices,
     Annex III high-risk categories, Article 50 transparency triggers.
     Every question maps to one specific published clause rather than a
     vague "is this risky" judgement call, so a practitioner (or their
     lawyer) can see exactly why a system landed on its tier and
     challenge any single answer. This is a screening aid over the Act's
     own published text, not legal advice — carve-outs the Act itself
     allows (e.g. narrow law-enforcement or medical exceptions to the
     Article 5 bans) are fact-specific and deliberately NOT modelled
     here; a "yes" flags the practice and leaves the carve-out judgement
     to counsel rather than guessing at it. */
  var AI_ACT_QUESTIONS = [
    { id: 'subliminalManipulation', tier: 'Prohibited', clause: 'Article 5(1)(a)', label: 'Uses subliminal, manipulative or deceptive techniques to materially distort behaviour and cause harm' },
    { id: 'exploitsVulnerabilities', tier: 'Prohibited', clause: 'Article 5(1)(b)', label: 'Exploits vulnerabilities of a specific group (age, disability, social or economic situation) to cause harm' },
    { id: 'socialScoring', tier: 'Prohibited', clause: 'Article 5(1)(c)', label: 'Social scoring — evaluates or classifies people over time and applies unrelated or disproportionate treatment' },
    { id: 'criminalRiskProfiling', tier: 'Prohibited', clause: 'Article 5(1)(d)', label: 'Predicts an individual’s risk of committing a criminal offence based solely on profiling' },
    { id: 'facialScraping', tier: 'Prohibited', clause: 'Article 5(1)(e)', label: 'Untargeted scraping of facial images (internet or CCTV) to build or expand a facial recognition database' },
    { id: 'emotionInferenceWorkEducation', tier: 'Prohibited', clause: 'Article 5(1)(f)', label: 'Infers emotions in the workplace or in education, outside the Act’s narrow medical/safety exceptions' },
    { id: 'biometricCategorySensitive', tier: 'Prohibited', clause: 'Article 5(1)(g)', label: 'Biometric categorisation inferring race, political opinion, religion, trade union membership or sexual orientation' },
    { id: 'realtimeBiometricLawEnforcement', tier: 'Prohibited', clause: 'Article 5(1)(h)', label: 'Real-time remote biometric identification in publicly accessible spaces for law enforcement' },

    { id: 'biometricIdentification', tier: 'High', clause: 'Annex III(1)', label: 'Biometric identification or categorisation of natural persons (non-prohibited use)' },
    { id: 'criticalInfrastructure', tier: 'High', clause: 'Annex III(2)', label: 'Safety component in the management or operation of critical infrastructure (energy, water, digital infra, traffic)' },
    { id: 'educationVocational', tier: 'High', clause: 'Annex III(3)', label: 'Determines access to education/vocational training, or evaluates learning outcomes or exam integrity' },
    { id: 'employmentWorkerManagement', tier: 'High', clause: 'Annex III(4)', label: 'Recruitment or candidate screening, or task allocation, monitoring or evaluation of workers' },
    { id: 'essentialServicesAccess', tier: 'High', clause: 'Annex III(5)', label: 'Eligibility for essential public/private services — credit scoring, insurance pricing, public benefits' },
    { id: 'lawEnforcement', tier: 'High', clause: 'Annex III(6)', label: 'Used by or on behalf of law enforcement (non-prohibited use, e.g. evaluating evidence reliability)' },
    { id: 'migrationAsylumBorder', tier: 'High', clause: 'Annex III(7)', label: 'Migration, asylum or border control management (e.g. visa or asylum application assessment)' },
    { id: 'justiceAndDemocracy', tier: 'High', clause: 'Annex III(8)', label: 'Assists judicial authorities in researching or interpreting facts and law, or influences elections/referenda' },

    { id: 'directInteraction', tier: 'Limited', clause: 'Article 50(1)', label: 'Interacts directly with natural persons (e.g. a chatbot) who may not otherwise realise it’s AI' },
    { id: 'syntheticContent', tier: 'Limited', clause: 'Article 50(2)', label: 'Generates or manipulates synthetic audio, image, video or text content, including deepfakes' },
    { id: 'emotionOrBiometricNonProhibited', tier: 'Limited', clause: 'Article 50(3)', label: 'Emotion recognition or biometric categorisation, in a context not covered by the prohibited practices above' }
  ];

  var AI_ACT_TIER_ORDER = { Prohibited: 3, High: 2, Limited: 1, Minimal: 0 };

  var AI_ACT_OBLIGATIONS = {
    Prohibited: [
      'This use case falls under an EU AI Act Article 5 prohibited practice — it cannot lawfully be placed on the market or put into service in the EU. Do not deploy; escalate to legal counsel immediately rather than relying on this screening alone.'
    ],
    High: [
      'Risk management system across the system’s lifecycle (Article 9)',
      'Data governance — relevant, representative, error-checked training/validation/testing data (Article 10)',
      'Technical documentation kept current (Article 11, Annex IV)',
      'Automatic event logging and record-keeping (Article 12)',
      'Instructions for use and transparency to deployers (Article 13)',
      'Human oversight measures a person can actually exercise (Article 14)',
      'Accuracy, robustness and cybersecurity appropriate to the risk (Article 15)',
      'Conformity assessment before market placement, and EU database registration (Articles 43, 49)',
      'Post-market monitoring plan (Article 72)'
    ],
    Limited: [
      'Disclose to users that they are interacting with an AI system, unless that’s obvious from the context (Article 50(1))',
      'Label AI-generated or manipulated audio/image/video/text content as such, machine-readably where feasible (Article 50(2))'
    ],
    Minimal: [
      'No mandatory EU AI Act obligations for this use case as classified — voluntary codes of conduct (Article 95) are still worth adopting.'
    ]
  };

  /* answers: { [questionId]: boolean }. The tier is the single highest
     severity triggered (Prohibited beats High beats Limited beats
     Minimal); the reasons/obligations are cumulative across every
     matched question at High/Limited, since those obligations stack —
     a high-risk system that also talks to users directly still owes
     Article 50 transparency on top of its Annex III obligations, not
     instead of them. A Prohibited match short-circuits everything else:
     there's nothing to add obligations for once a system can't lawfully
     be deployed at all. */
  function classifyAiActRisk(answers) {
    answers = answers || {};
    var matched = AI_ACT_QUESTIONS.filter(function (q) { return !!answers[q.id]; });
    if (!matched.length) return { tier: 'Minimal', reasons: [], obligations: AI_ACT_OBLIGATIONS.Minimal };

    var tier = matched.reduce(function (best, q) {
      return AI_ACT_TIER_ORDER[q.tier] > AI_ACT_TIER_ORDER[best] ? q.tier : best;
    }, 'Limited');

    if (tier === 'Prohibited') {
      var prohibitedReasons = matched.filter(function (q) { return q.tier === 'Prohibited'; })
        .map(function (q) { return q.clause + ' — ' + q.label; });
      return { tier: 'Prohibited', reasons: prohibitedReasons, obligations: AI_ACT_OBLIGATIONS.Prohibited };
    }

    var reasons = matched.map(function (q) { return q.tier + ' — ' + q.clause + ': ' + q.label; });
    var obligations = [];
    if (matched.some(function (q) { return q.tier === 'High'; })) obligations = obligations.concat(AI_ACT_OBLIGATIONS.High);
    if (matched.some(function (q) { return q.tier === 'Limited'; })) obligations = obligations.concat(AI_ACT_OBLIGATIONS.Limited);
    return { tier: tier, reasons: reasons, obligations: obligations };
  }

  /* ================= Audit-log integrity chain =================
     Each audit entry carries the hash of the entry before it, so the
     log is a chain rather than a bag of independent rows. Altering or
     deleting a historical entry breaks every hash after it, which is
     what turns "here is our audit trail" into "here is our audit
     trail, and here is proof it has not been edited" -- the question a
     Defence, government or financial-services assessor actually asks.

     Deliberately NOT a claim of immutability. Anyone with SharePoint
     access can still edit the list; what they cannot do is edit it
     *undetectably*, because they would have to recompute every
     subsequent hash, and the exported chain an auditor already holds
     would no longer match. That is the same guarantee a git history
     gives, and it is worth stating plainly rather than overselling.

     canonicalAuditEntry() fixes the field order so the same entry
     always hashes identically regardless of key insertion order --
     the same reasoning as canonicalJson() in the entitlement signing
     chain. */
  function canonicalAuditEntry(e) {
    e = e || {};
    return JSON.stringify([
      String(e.actor || ''), String(e.actorId || ''), String(e.action || ''),
      String(e.targetType || ''), String(e.targetId || ''),
      String(e.before == null ? '' : e.before), String(e.after == null ? '' : e.after),
      String(e.entryDateTime || '')
    ]);
  }

  /* Hash of one entry, bound to its predecessor. The genesis entry
     chains from the empty string, so a tenant's first ever entry is
     still verifiable rather than being a special case with no hash. */
  async function auditEntryHash(subtle, entry, prevHash) {
    var payload = String(prevHash || '') + '|' + canonicalAuditEntry(entry);
    return sha256Hex(subtle, new TextEncoder().encode(payload));
  }

  /* Walks a chronological (oldest-first) list of audit entries and
     classifies what it finds. Three outcomes are deliberately kept
     apart, because they mean very different things to an assessor:

       unchained  an entry predating this feature, carrying no hash at
                  all. NOT evidence of tampering -- evidence only that
                  the chain started later. Reported so the honest
                  statement is "verified from <date>", never a silent
                  implication that the whole history is proven.
       altered    the entry's own content no longer hashes to the hash
                  stored against it: its text was edited after the fact.
       forked     two entries claim the same predecessor. Almost always
                  two practitioners appending in the same instant
                  rather than foul play, so it is surfaced as its own
                  category instead of being reported as tampering.
       broken     an entry names a predecessor hash that no earlier
                  entry produced -- the shape a DELETED row leaves.

     Returns counts plus the first index of each problem, so the UI can
     say exactly where verification stops rather than only that it did. */
  async function verifyAuditChain(subtle, entries) {
    var list = Array.isArray(entries) ? entries : [];
    var out = { total: list.length, chained: 0, unchained: 0, altered: [], forked: [], broken: [], ok: true, verifiedFrom: null };
    var seenHashes = Object.create(null);
    var claimedPrev = Object.create(null);
    var prevHash = '';
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.entryHash) { out.unchained++; prevHash = ''; continue; }
      /* A predecessor that no earlier entry produced is the fingerprint
         of a removed row (or of a chain that starts mid-list). The
         genesis entry legitimately claims '' as its predecessor. */
      var claims = String(e.prevHash || '');
      if (claims !== '' && !seenHashes[claims]) out.broken.push(i);
      else if (claims !== '' && claimedPrev[claims]) out.forked.push(i);
      if (claims !== '') claimedPrev[claims] = true;

      var expected = await auditEntryHash(subtle, e, claims);
      if (expected !== e.entryHash) out.altered.push(i);
      else {
        out.chained++;
        if (out.verifiedFrom == null) out.verifiedFrom = e.entryDateTime || null;
      }
      seenHashes[e.entryHash] = true;
      prevHash = e.entryHash;
    }
    out.ok = !out.altered.length && !out.broken.length;
    return out;
  }

  return {
    band: band, residual: residual, residualAcceptanceStale: residualAcceptanceStale, checkResult: checkResult, activeDisposition: activeDisposition, score: score, incidentTriageResult: incidentTriageResult, alertTriageResult: alertTriageResult, subjectRightsResult: subjectRightsResult, retentionLabelResult: retentionLabelResult, readinessPct: readinessPct,
    suggestVendorCriticality: suggestVendorCriticality, parseMapTokens: parseMapTokens,
    sharedEvidenceClosure: sharedEvidenceClosure, crossFrameworkStatusSuggestions: crossFrameworkStatusSuggestions,
    controlsForCheck: controlsForCheck, operatingEffectiveness: operatingEffectiveness,
    scanResultsChanged: scanResultsChanged,
    constellationTheme: constellationTheme, constellationEdges: constellationEdges, constellationLayout: constellationLayout,
    fingerprintFromRows: fingerprintFromRows, remediationVelocityProjection: remediationVelocityProjection,
    weeklyActivityGrid: weeklyActivityGrid, riskBubblePoint: riskBubblePoint, riskBubbleLayout: riskBubbleLayout,
    relLuminance: relLuminance, contrastRatio: contrastRatio, compositeOverBg: compositeOverBg, pickReadableRgb: pickReadableRgb,
    mulberry32: mulberry32, sampleTriangular: sampleTriangular, samplePoisson: samplePoisson,
    riskFinancialInputs: riskFinancialInputs, simulateRiskLosses: simulateRiskLosses,
    simulatePortfolioLosses: simulatePortfolioLosses, summarizeLossDistribution: summarizeLossDistribution,
    lossExceedanceCurve: lossExceedanceCurve, RISK_FINANCIAL_BANDS: RISK_FINANCIAL_BANDS,
    toCsv: toCsv, buildZip: buildZip,
    canonicalJson: canonicalJson, base64ToBytes: base64ToBytes, bytesToBase64: bytesToBase64,
    verifyEntitlementSignature: verifyEntitlementSignature, signEntitlementPayload: signEntitlementPayload,
    evaluateEntitlement: evaluateEntitlement, reconcileActivationSources: reconcileActivationSources, addDaysToDateStr: addDaysToDateStr,
    latestEntitlementsByTenant: latestEntitlementsByTenant, computePartnerRevenue: computePartnerRevenue,
    entitlementAnnualValue: entitlementAnnualValue, computePaymentStatus: computePaymentStatus,
    computeNextBestModule: computeNextBestModule, computeClientHealth: computeClientHealth,
    rankUpsellOpportunities: rankUpsellOpportunities,
    daysBetweenDateStr: daysBetweenDateStr, normalizeEntitlementType: normalizeEntitlementType,
    addMonthsToDateStr: addMonthsToDateStr, isValidTenantIdentifier: isValidTenantIdentifier,
    findDuplicateTenantClient: findDuplicateTenantClient, buildClientIssuancePlan: buildClientIssuancePlan,
    computeClientChecklist: computeClientChecklist, controlReviewStatus: controlReviewStatus,
    buildAdminConsentUrl: buildAdminConsentUrl,
    documentReviewState: documentReviewState, documentRegisterSummary: documentRegisterSummary,
    attestationCampaigns: attestationCampaigns, outstandingAttestationsFor: outstandingAttestationsFor,
    trainingCheckResult: trainingCheckResult, usersMissingInduction: usersMissingInduction,
    recurringActivityState: recurringActivityState, backupCheckResult: backupCheckResult,
    bcpCheckResult: bcpCheckResult, supplierCheckResult: supplierCheckResult, policyCheckResult: policyCheckResult,
    capaStatus: capaStatus, MR_INPUT_SECTIONS: MR_INPUT_SECTIONS,
    parseReviewInputs: parseReviewInputs, serializeReviewInputs: serializeReviewInputs,
    isDevBypassActive: isDevBypassActive,
    controlAssurance: controlAssurance, assuranceSummary: assuranceSummary,
    evaluateSegregation: evaluateSegregation,
    parseCsv: parseCsv, normaliseHeader: normaliseHeader, planCsvImport: planCsvImport,
    sha256Hex: sha256Hex, canonicalAuditEntry: canonicalAuditEntry, auditEntryHash: auditEntryHash, verifyAuditChain: verifyAuditChain,
    encryptPack: encryptPack, decryptPack: decryptPack, validatePackShape: validatePackShape,
    incidentAssessmentState: incidentAssessmentState, incidentRegisterSummary: incidentRegisterSummary,
    classifyAiActRisk: classifyAiActRisk, AI_ACT_QUESTIONS: AI_ACT_QUESTIONS
  };
});
