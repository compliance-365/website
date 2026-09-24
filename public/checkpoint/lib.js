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

  /* Residual likelihood/impact for a risk.

     Two sources, in priority order.

     1. AN ASSESSED RESIDUAL, when the risk carries one. ISO/IEC 27005
        determines residual risk by RE-ASSESSING likelihood and impact
        with the treatment in place — a judgement a practitioner makes,
        not a number a formula derives. resL/resI hold that judgement,
        alongside who recorded it and when (resBy/resDate), and this
        function returns it unchanged. Set through the risk drawer's
        "Record assessed residual"; absent until someone does.

     2. OTHERWISE THE DERIVED ESTIMATE, unchanged from what this function
        always did: each completed treatment action shaves a point off
        likelihood (floor 1), and impact drops by one (floor 1) only once
        every linked action is done.

     The estimate stays the default deliberately. A register where every
     untouched risk shows a blank residual is worse than one showing a
     rough one, and the derived number is a reasonable proxy for "some
     treatment has landed". But it assumes every action reduces
     likelihood by exactly one, which is a property of the arithmetic
     rather than of the controls — three weak actions move a risk further
     than one strong one. So it is a starting point that a practitioner
     can overrule with an actual assessment, and `derived` on the result
     says which of the two the caller is looking at, so the UI can label
     an estimate as an estimate.

     `actions` is the full actions register (or any array of
     {id, status} objects) — the risk itself only stores action id
     references. */
  function residual(r, actions) {
    if (typeof r.resL === 'number' && typeof r.resI === 'number') {
      return { L: Math.max(1, r.resL), I: Math.max(1, r.resI), derived: false };
    }
    var done = r.actions.filter(function (id) {
      var a = actions.find(function (x) { return x.id === id; });
      return a && a.status === 'Done';
    }).length;
    var all = r.actions.length > 0 && done === r.actions.length;
    return { L: Math.max(1, r.L - done), I: all ? Math.max(1, r.I - 1) : r.I, derived: true };
  }

  /* Whether a risk is overdue for review.

     ISO/IEC 27001 clause 8.2 requires risk assessments at planned
     intervals or on significant change, and Checkpoint's own Risk
     Management Framework template commits to reviewing residual risk
     "at least quarterly and after any material change" — which the app
     had no way to evidence, having never recorded when a risk was last
     looked at.

     Deliberately mirrors controlReviewStatus() rather than
     documentReviewState(): a risk has no natural per-item next-review
     date the way a controlled document does, so this is "last reviewed
     plus the tenant's cadence", one setting for the whole register.

     A risk that has NEVER been reviewed reads as due with
     neverReviewed: true, so the UI can say that instead of a day count
     computed from nothing — same convention controlReviewStatus() uses
     for a control that was never verified. Closed risks are never
     chased. `today` is a YYYY-MM-DD string parameter, never the ambient
     clock, so tests pin it. */
  function riskReviewStatus(risk, today, cadenceDays) {
    var r = risk || {};
    var cadence = (cadenceDays == null || cadenceDays === '') ? 90 : Number(cadenceDays);
    if (isNaN(cadence)) cadence = 90;
    if (r.status === 'Closed') return { due: false, neverReviewed: false, daysOverdue: 0 };
    if (!r.lastReviewed) return { due: true, neverReviewed: true, daysOverdue: null };
    var days = daysBetweenDateStr(r.lastReviewed, today);
    var over = days - cadence;
    return { due: over > 0, neverReviewed: false, daysOverdue: over > 0 ? over : 0 };
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

  /* ── Entra sign-in logs: was legacy authentication actually USED? ──
     graph.js's 'legacy-auth-observed' check.

     The existing 'legacy' check reads Conditional Access policy and
     answers "is legacy authentication blocked by configuration". That
     is the control, and it is the right thing to check — but it is a
     statement of intent, and an auditor's next question is always
     whether the intent held. A CA policy scoped to a group somebody has
     since been excluded from, a policy in report-only state, an
     Exchange-level override: each of those leaves the config check
     passing while IMAP4 and Authenticated SMTP keep working.

     This is the evidence half, and only the sign-in log can give it.
     Scored on OUTCOME, not attempts:

       fail    at least one legacy sign-in SUCCEEDED in the window. The
               protocol is not merely permitted, it is in live use, and
               the account using it has no MFA in front of it.
       review  legacy attempts occurred but every one was blocked or
               failed. The control is holding; somebody should still
               know, because it usually means a real mail client or
               service account is still configured for it and will
               break — or be re-enabled by a helpdesk exception — the
               moment a user complains.
       pass    no legacy sign-ins at all in the window.

     Attempts alone are deliberately NOT a fail. A blocked attempt is
     the control working, and grading it the same as a successful one
     would mean the only way to score 'pass' is for the internet to
     stop scanning you. */
  function legacyAuthObservedResult(signIns) {
    var rows = (signIns || []).filter(function (r) { return r && typeof r === 'object'; });
    var succeeded = rows.filter(function (r) {
      /* Entra reports success as status.errorCode === 0. Anything else
         — including an absent status, which we cannot interpret — is
         NOT counted as a successful sign-in: inventing a fail out of a
         field we could not read is how a posture score loses its
         credibility (same rule as incidentTriageResult's unparseable
         dates). */
      return r.status && r.status.errorCode === 0;
    });
    var byApp = {};
    rows.forEach(function (r) {
      var app = r.clientAppUsed || 'Unknown client';
      if (!byApp[app]) byApp[app] = { attempts: 0, succeeded: 0 };
      byApp[app].attempts++;
      if (r.status && r.status.errorCode === 0) byApp[app].succeeded++;
    });
    var users = {};
    succeeded.forEach(function (r) { if (r.userPrincipalName) users[r.userPrincipalName] = true; });
    return {
      result: succeeded.length ? 'fail' : (rows.length ? 'review' : 'pass'),
      attempts: rows.length,
      succeeded: succeeded.length,
      byApp: byApp,
      users: Object.keys(users).sort()
    };
  }

  /* ── Entra directory audit log: privileged role changes in a window ──
     graph.js's 'priv-role-changes' check.

     Deliberately never returns 'fail'. A directory role being granted
     is not a defect — it is how an organisation staffs itself, and a
     check that fails every time somebody is promoted would be switched
     off within a month. What ISO 27001 A.5.15/A.5.18 and Essential
     Eight's restrict-admin-privileges actually require is that
     privileged access changes are AUTHORISED and REVIEWED, which no API
     can decide. So:

       review  one or more privileged role changes in the window — here
               is the list, confirm each was authorised.
       pass    none in the window.

     The value is not the grade, it is the note: an auditor asking
     "show me every privileged role change last quarter, and who made
     it" gets that answer from this check's evidence rather than from
     somebody exporting a CSV by hand the week before the audit.

     Self-service PIM ACTIVATIONS are excluded. A user elevating into a
     role they are already eligible for is the control working as
     designed — the very thing the 'pim' check scores a tenant for
     having — and folding routine activations in would bury the
     assignments that actually change who holds what. Permanent
     assignment changes, eligibility grants and role deletions all
     count. */
  var PRIV_ROLE_ACTIVITY_EXCLUDE = /^add member to role completed \(pim activation\)$|^add member to role requested \(pim activation\)$|^remove member from role \(pim activation\)$|pim activation/i;
  function privRoleChangeResult(auditRecords) {
    var changes = (auditRecords || []).filter(function (r) {
      if (!r || typeof r !== 'object') return false;
      return !PRIV_ROLE_ACTIVITY_EXCLUDE.test(r.activityDisplayName || '');
    }).map(function (r) {
      var actor = '';
      if (r.initiatedBy) {
        if (r.initiatedBy.user) actor = r.initiatedBy.user.userPrincipalName || r.initiatedBy.user.displayName || '';
        else if (r.initiatedBy.app) actor = r.initiatedBy.app.displayName || '';
      }
      /* The role is the targetResource whose type is 'Role'; the person
         it was granted to is the 'User' one. Entra orders these
         inconsistently across activity types, so pick by type rather
         than by position. */
      var targets = r.targetResources || [];
      var roleT = targets.find(function (t) { return t && t.type === 'Role'; });
      var subjectT = targets.find(function (t) { return t && (t.type === 'User' || t.type === 'ServicePrincipal'); });
      return {
        activity: r.activityDisplayName || 'Role change',
        date: r.activityDateTime || '',
        actor: actor,
        role: (roleT && (roleT.displayName || roleT.id)) || '',
        subject: (subjectT && (subjectT.userPrincipalName || subjectT.displayName || subjectT.id)) || ''
      };
    });
    changes.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var actors = {};
    changes.forEach(function (c) { if (c.actor) actors[c.actor] = true; });
    return {
      result: changes.length ? 'review' : 'pass',
      count: changes.length,
      changes: changes,
      actors: Object.keys(actors).sort()
    };
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

  /* ===== Statement of Applicability: the summary tiles ARE the filter =====
     Each tile on the SoA answers a question ("2 overdue for review") and
     clicking it should show exactly those rows. That promise only holds
     if the number and the list come from one predicate, so they do:
     app.js counts soaFocusRows(...).length for the tile and renders
     soaFocusRows(...) for the table. Deriving the count one way and the
     rows another is precisely how a tile ends up promising 2 and
     delivering 3.

     Every slice is defined over ONE input — the framework's visible rows
     — and narrows to the applicable subset itself where that is what the
     slice means. The distinction is not cosmetic: implemented, in
     progress, not started and overdue are all statements about
     APPLICABLE controls, while "excluded" and "exclusions missing
     justification" are by definition about the ones that are not. Taking
     the base set as a second argument would let a caller pair a slice
     with the wrong one; it cannot here.

     'notstarted' mirrors controlStatusCounts()'s own else-branch rather
     than testing for a 'Not started' string: anything applicable that is
     neither Implemented nor In progress counts, so a row with an empty,
     legacy or unexpected status is surfaced instead of vanishing from
     every slice at once. */
  var SOA_FOCUS_SLICES = {
    implemented: 'Implemented',
    inprogress: 'In progress',
    notstarted: 'Not started',
    excluded: 'Excluded as not applicable',
    overdue: 'Overdue for review',
    unjustified: 'Exclusions missing justification'
  };
  function soaFocusLabel(key) { return SOA_FOCUS_SLICES[key] || ''; }
  function soaFocusRows(key, visRows, opts) {
    if (!SOA_FOCUS_SLICES[key]) return [];
    var rows = Array.isArray(visRows) ? visRows : [];
    var o = opts || {};
    var applicable = rows.filter(function (c) { return c && c.app; });
    if (key === 'implemented') return applicable.filter(function (c) { return c.st === 'Implemented'; });
    if (key === 'inprogress') return applicable.filter(function (c) { return c.st === 'In progress'; });
    if (key === 'notstarted') return applicable.filter(function (c) { return c.st !== 'Implemented' && c.st !== 'In progress'; });
    if (key === 'excluded') return rows.filter(function (c) { return c && !c.app; });
    if (key === 'unjustified') return rows.filter(function (c) { return c && !c.app && !c.just; });
    /* Same cadence/today the rest of the app measures review staleness
       with — passed in rather than read here, so this stays pure and a
       test can pin "today". */
    return applicable.filter(function (c) { return controlReviewStatus(c, o.today, o.cadenceDays).due; });
  }

  /* ===== Training register summary, and the slices behind it =====
     Same shape and the same guarantee as soaFocusRows() above: the
     number on a tile is the length of the list that tile opens, because
     both come from here.

     'Outstanding' is anything not yet Completed and not Exempt —
     matching the existing Outstanding filter pill rather than testing
     for an 'Assigned' string, so a record with an empty or unexpected
     status is still chased instead of disappearing from the register's
     own summary. 'Overdue' is the subset of those past their due date,
     which is the figure an auditor actually asks for; a record with no
     due date is outstanding but never overdue, since nothing was
     promised. Exempt is counted but deliberately not tiled — it is an
     accepted state, not work. */
  function trainingFocusRows(key, records, opts) {
    var rows = (Array.isArray(records) ? records : []).filter(Boolean);
    var today = (opts && opts.today) || '';
    function open(t) { return t.status !== 'Completed' && t.status !== 'Exempt'; }
    if (key === 'Completed') return rows.filter(function (t) { return t.status === 'Completed'; });
    if (key === 'Exempt') return rows.filter(function (t) { return t.status === 'Exempt'; });
    if (key === 'Outstanding') return rows.filter(open);
    if (key === 'Overdue') return rows.filter(function (t) { return open(t) && t.due && today && t.due < today; });
    if (key === 'All') return rows.slice();
    return [];
  }
  function trainingSummary(records, opts) {
    return {
      total: trainingFocusRows('All', records, opts).length,
      completed: trainingFocusRows('Completed', records, opts).length,
      outstanding: trainingFocusRows('Outstanding', records, opts).length,
      overdue: trainingFocusRows('Overdue', records, opts).length,
      exempt: trainingFocusRows('Exempt', records, opts).length
    };
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

  /* The documents behind one tile of the register summary above. Every
     slice is defined by re-walking documentRegisterSummary()'s own
     branches in the same order, rather than by re-deriving the rules —
     so the number on a tile and the rows it opens cannot disagree, and
     a change to what "controlled" or "overdue" means only has to be
     made once.

     Note the two early returns that summary makes and this must match:
     a document that is not controlled is in no slice at all, and a
     Superseded one counts toward `controlled` but is excluded from
     every review/completeness slice — it has been withdrawn, so
     chasing its review date would be noise. */
  function documentFocusRows(key, docs, today, opts) {
    var o = opts || {};
    var controlledCats = o.controlledCategories || [];
    var warn = o.warnDays;
    var out = [];
    (docs || []).forEach(function (d) {
      if (!d) return;
      var isControlled = !!d.status || controlledCats.indexOf(d.category) > -1;
      if (!isControlled) return;
      if (key === 'controlled') { out.push(d); return; }
      if (key === 'approved') { if (d.status === 'Approved') out.push(d); return; }
      if (key === 'draft') { if (d.status === 'Draft' || d.status === 'In review') out.push(d); return; }
      if (d.status === 'Superseded') return;
      if (key === 'incomplete') { if (!d.version || !d.owner || !d.nextReview) out.push(d); return; }
      var rv = documentReviewState(d, today, warn);
      if (key === 'overdue' && rv.state === 'overdue') out.push(d);
      else if (key === 'due' && rv.state === 'due') out.push(d);
    });
    return out;
  }
  var DOC_FOCUS_LABELS = {
    controlled: 'Controlled documents', approved: 'Approved', draft: 'Draft / in review',
    overdue: 'Review overdue', due: 'Due for review soon', incomplete: 'Incomplete register entry'
  };
  function documentFocusLabel(key) { return DOC_FOCUS_LABELS[key] || ''; }

  /* De-duplicates a resolved audience (attestation campaign OR training
     assignment -- both funnel through app.js's resolveAudience(), this
     is the one place that fixes both) by UPN, case-insensitively, same
     comparison outstandingAttestationsFor() uses. Graph's
     transitiveMembers endpoint -- what listGroupMembers() calls -- can
     return the same person more than once when they're reachable
     through more than one nested-group path, and nothing downstream of
     it ever checked for that: a person resolved twice got two
     attestation rows, two emails, and (for training) two assignments,
     all for one person. First occurrence wins; a row with no UPN at all
     is dropped rather than kept, since it can't be matched against
     anything a person would actually receive. */
  function dedupeAudience(users) {
    var seen = {};
    var out = [];
    (Array.isArray(users) ? users : []).forEach(function (u) {
      if (!u) return;
      var key = String(u.upn || '').toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(u);
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

  /* Register-wide summary strip and the rows behind each of its tiles —
     same shape and the same guarantee as trainingFocusRows()/
     trainingSummary() above: the number on a tile is the length of the
     list that tile opens, because both are read from here, and
     renderAttestationRecords()'s own "Outstanding" filter pill uses this
     too so all three can never disagree.

     There is no due-date field on an attestation record (unlike
     Training), so there is no Overdue slice to add — Outstanding /
     Acknowledged / Exempt is the complete, mutually exclusive partition,
     and 'All' is every row regardless of status. An unrecognised status
     falls into Outstanding, matching outstandingAttestationsFor()'s own
     rule: a row an auditor is going to count must never simply vanish
     from the register because its status string doesn't match. */
  function attestationFocusRows(key, records) {
    var rows = (Array.isArray(records) ? records : []).filter(Boolean);
    if (key === 'All') return rows.slice();
    if (key === 'Acknowledged') return rows.filter(function (r) { return r.status === 'Acknowledged'; });
    if (key === 'Exempt') return rows.filter(function (r) { return r.status === 'Exempt'; });
    if (key === 'Outstanding') return rows.filter(function (r) { return r.status !== 'Acknowledged' && r.status !== 'Exempt'; });
    return [];
  }
  function attestationSummary(records) {
    return {
      total: attestationFocusRows('All', records).length,
      outstanding: attestationFocusRows('Outstanding', records).length,
      acknowledged: attestationFocusRows('Acknowledged', records).length,
      exempt: attestationFocusRows('Exempt', records).length
    };
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

  /* Intune device check-in staleness (graph.js's 'device-checkin').

     Distinct from the compliance-percentage check, and deliberately so:
     a fleet can read 100% compliant precisely BECAUSE the
     non-compliant devices stopped checking in and their last-known
     state froze. A device that has not contacted Intune in weeks is not
     receiving policy, configuration or updates, and its compliance
     state is stale evidence rather than current evidence.

     This uses lastSyncDateTime, which is added to the existing
     managedDevices $select — no new Graph permission, no new licence,
     so it works on every tenant that already has the device check.

     A device with no lastSyncDateTime at all counts as 'never', which
     is worse than stale, not better. That differs from the
     missing-date rule elsewhere in this file (where an unparseable
     date is never counted against a tenant) because the semantics are
     opposite: an incident with no creation date tells us nothing about
     its age, but a managed device with no sync date has demonstrably
     never reported in. */
  /* Leaver hygiene — A.5.11 (return of assets), A.6.5 (responsibilities
     after termination) and A.5.18 (access rights removal). These were
     entirely self-reported: Checkpoint has no HR feed, so it cannot know
     who left, and "show me your leaver checklist" is not something Graph
     can answer.

     What it CAN see is the end state of an offboarding, and two parts of
     that end state say different things:

     A disabled account still holding a PRIVILEGED DIRECTORY ROLE is an
     unambiguous failure. There is no legitimate reason to leave a
     departed administrator's role assignment in place — re-enabling the
     account restores privilege instantly, and the assignment itself is
     what an auditor tests. This is the only condition here that fails.

     A disabled account still holding a PAID LICENCE is a review, never a
     failure, and that distinction matters. Plenty of organisations
     deliberately keep a leaver licensed for a retention period — legal
     hold, or delegating the mailbox to a manager — and that is good
     practice, not a gap. Graph does not expose WHEN an account was
     disabled, so Checkpoint genuinely cannot tell a deliberate 30-day
     retention from an offboarding everyone forgot two years ago.
     Reporting it as a failure would be guessing; reporting it as a list
     to confirm is honest and still useful.

     Guests are excluded throughout — a guest's lifecycle is governed by
     the external-sharing and guest-count checks, not by an employment
     termination process. */
  function leaverHygieneResult(users, privilegedUserIds) {
    var members = (users || []).filter(function (u) { return u && u.userType !== 'Guest'; });
    var disabled = members.filter(function (u) { return u.accountEnabled === false; });
    if (!disabled.length) {
      return { disabled: 0, licensed: 0, privileged: 0, result: 'pass' };
    }
    var priv = privilegedUserIds || {};
    var stillPrivileged = disabled.filter(function (u) { return u.id && priv[u.id]; });
    var stillLicensed = disabled.filter(function (u) {
      return Array.isArray(u.assignedLicenses) && u.assignedLicenses.length > 0;
    });
    return {
      disabled: disabled.length,
      licensed: stillLicensed.length,
      privileged: stillPrivileged.length,
      result: stillPrivileged.length ? 'fail' : (stillLicensed.length ? 'review' : 'pass')
    };
  }

  /* A.5.3 — segregation of duties, mined from Entra directory role
     membership (the same per-role /members data the leaver check
     already gathers, extended here to keep per-user role names rather
     than a flat privileged/not-privileged set).

     Deliberately narrow: ISO 27001 A.5.3 is about conflicting duties
     in general, and there is no single fixed list of which role PAIRS
     conflict — Microsoft's own answer (Entra ID Governance's
     "incompatible access" feature) is "you define that for your
     organisation," not a built-in list. Inventing one here would be a
     guess dressed up as a finding. The one pairing that IS genuinely
     defensible without a tenant-supplied list: Privileged Role
     Administrator can grant itself, or anyone, any other directory
     role — so holding PRA alongside ANY other privileged role is
     inherently self-escalating the moment both are held by the same
     person, regardless of which second role it happens to be. That is
     a structural fact about what PRA can do, not a judgement call
     about which roles are sensitive.

     roleMembersByUser: { userId: { name, roles: [roleDisplayName,...] } }. */
  function segregationOfDutiesResult(roleMembersByUser) {
    var PRA = 'Privileged Role Administrator';
    var byUser = roleMembersByUser || {};
    var offenders = [];
    Object.keys(byUser).forEach(function (id) {
      var u = byUser[id] || {};
      var roles = u.roles || [];
      if (roles.indexOf(PRA) === -1) return;
      var others = roles.filter(function (r) { return r !== PRA; });
      if (others.length) offenders.push({ name: u.name || id, roles: others });
    });
    if (!offenders.length) return { result: 'pass', note: 'No Privileged Role Administrator also holds another directory role.', offenders: [] };
    var shown = offenders.slice(0, 5).map(function (o) { return o.name + ' (also: ' + o.roles.join(', ') + ')'; }).join('; ');
    return {
      result: 'fail',
      note: offenders.length + ' Privileged Role Administrator' + (offenders.length === 1 ? '' : 's') + ' also hold another directory role — self-escalating, since Privileged Role Administrator can grant itself any other role: ' + shown + (offenders.length > 5 ? ', +' + (offenders.length - 5) + ' more' : ''),
      offenders: offenders
    };
  }

  /* caDeviceComplianceResult() / caRiskBasedResult() — mined from the
     SAME Conditional Access policy array graph.js already fetches for
     mfa-all/legacy/mfa-priv. No new Graph call, no new scope: the
     policies were already on the wire, these two checks just read
     fields of the response nothing was previously looking at.

     caDeviceComplianceResult() asks whether cloud app access is gated
     on a compliant or hybrid-joined device — the CA-enforced half of
     endpoint control, distinct from the 'device' check which reads
     Intune's own compliance-policy evaluation. A policy requiring the
     control for only some apps is a review, not a pass: the gap is
     real, just narrower than "no control at all". */
  function caDeviceComplianceResult(policies) {
    var enabled = (policies || []).filter(function (p) { return p && p.state === 'enabled'; });
    var deviceGate = function (p) {
      var grants = (p.grantControls && p.grantControls.builtInControls) || [];
      return grants.indexOf('compliantDevice') > -1 || grants.indexOf('domainJoinedDevice') > -1;
    };
    var coversAllApps = enabled.some(function (p) {
      var apps = (p.conditions && p.conditions.applications && p.conditions.applications.includeApplications) || [];
      return apps.indexOf('All') > -1 && deviceGate(p);
    });
    if (coversAllApps) {
      return { result: 'pass', note: 'A Conditional Access policy requires a compliant or hybrid-joined device for all cloud apps' };
    }
    var coversSomeApps = enabled.some(deviceGate);
    if (coversSomeApps) {
      return { result: 'review', note: 'Device compliance is required by at least one Conditional Access policy, but not for all cloud apps' };
    }
    return { result: 'fail', note: 'No Conditional Access policy requires a compliant or hybrid-joined device for cloud app access' };
  }

  /* Risk-based CA (Entra ID Protection's signInRiskLevels/userRiskLevels
     conditions) is gated at the call site behind the same
     identityProtection capability probe the 'riskyusers' check already
     uses (Entra ID P2) — a tenant without the licence sees 'manual'
     here exactly as it does there, never an invented failure. */
  function caRiskBasedResult(policies) {
    var enabled = (policies || []).filter(function (p) { return p && p.state === 'enabled'; });
    var signInRisk = enabled.some(function (p) {
      var levels = (p.conditions && p.conditions.signInRiskLevels) || [];
      var grants = (p.grantControls && p.grantControls.builtInControls) || [];
      return levels.length > 0 && (grants.indexOf('block') > -1 || grants.indexOf('mfa') > -1);
    });
    var userRisk = enabled.some(function (p) {
      var levels = (p.conditions && p.conditions.userRiskLevels) || [];
      var grants = (p.grantControls && p.grantControls.builtInControls) || [];
      return levels.length > 0 && (grants.indexOf('block') > -1 || grants.indexOf('passwordChange') > -1);
    });
    if (signInRisk && userRisk) {
      return { result: 'pass', note: 'Conditional Access enforces both sign-in-risk and user-risk based access controls' };
    }
    if (signInRisk || userRisk) {
      return { result: 'review', note: (signInRisk ? 'Sign-in-risk' : 'User-risk') + ' is enforced by Conditional Access, but not both' };
    }
    return { result: 'fail', note: 'No Conditional Access policy enforces sign-in-risk or user-risk based access controls' };
  }

  /* caSignInFrequencyResult() / caTermsOfUseResult() mine two more
     fields off the SAME Conditional Access policy array — sessionControls
     and grantControls.termsOfUse — that ca-device/ca-risk did not touch.
     Still no new Graph call, no new scope.

     Sign-in frequency forces re-authentication after an interval rather
     than trusting a session token indefinitely. For privileged roles
     specifically, that bounds how long a stolen or persisted admin
     session stays useful — the same reasoning as mfa-priv, applied to
     session lifetime instead of the initial credential. Only presence
     is graded, not the configured interval itself: Checkpoint has no
     principled way to say "24 hours is fine but 30 days is not"
     without a tenant-specific policy to compare against, so grading the
     value would be inventing a threshold nobody agreed to. */
  function caSignInFrequencyResult(policies) {
    var enabled = (policies || []).filter(function (p) { return p && p.state === 'enabled'; });
    var covers = enabled.some(function (p) {
      var roles = (p.conditions && p.conditions.users && p.conditions.users.includeRoles) || [];
      var sif = p.sessionControls && p.sessionControls.signInFrequency;
      return roles.length > 0 && !!(sif && sif.isEnabled);
    });
    if (covers) {
      return { result: 'pass', note: 'A Conditional Access policy enforces periodic re-authentication (sign-in frequency) for privileged directory roles' };
    }
    return { result: 'fail', note: 'No Conditional Access policy enforces sign-in frequency for privileged directory roles — a stolen or persisted admin session can remain valid indefinitely' };
  }

  /* Terms of Use is a click-through acknowledgment enforced technically
     at sign-in, not a policy document nobody can prove was read. Unlike
     the security controls above, though, an organisation's acceptable-use
     acknowledgment commonly runs through an HR or onboarding system
     Checkpoint has no visibility into — so absence here is 'review', not
     'fail': a real gap Checkpoint cannot see is indistinguishable from
     no gap at all, and only one of those deserves a finding. */
  function caTermsOfUseResult(policies) {
    var enabled = (policies || []).filter(function (p) { return p && p.state === 'enabled'; });
    var covers = enabled.some(function (p) {
      var tou = (p.grantControls && p.grantControls.termsOfUse) || [];
      return tou.length > 0;
    });
    if (covers) {
      return { result: 'pass', note: 'A Conditional Access policy requires Terms of Use acceptance at sign-in' };
    }
    return { result: 'review', note: 'No Conditional Access policy requires Terms of Use acceptance — confirm acceptable-use acknowledgment is captured another way (e.g. HR onboarding, a signed policy register)' };
  }

  /* A.5.23 — governing which cloud services staff can use. Mines a
     fourth field off the SAME Conditional Access policy array —
     sessionControls.cloudAppSecurity — that ca-device/ca-sif/ca-tou did
     not touch. No new Graph call, no new scope.

     An enabled CA policy applying Defender for Cloud Apps session
     control IS cloud-app governance technically enforced at sign-in,
     which is exactly what A.5.23's guidance asks for. Like
     caTermsOfUseResult(), absence is 'review' rather than 'fail':
     Defender for Cloud Apps is its own licence, and plenty of tenants
     govern cloud service adoption through a supplier-review process
     instead of a technical control Checkpoint can see — a real gap here
     is indistinguishable from a governed-elsewhere tenant, and only one
     of those deserves a finding. */
  function caCloudAppSecurityResult(policies) {
    var enabled = (policies || []).filter(function (p) { return p && p.state === 'enabled'; });
    var covers = enabled.some(function (p) {
      var cas = p.sessionControls && p.sessionControls.cloudAppSecurity;
      return !!(cas && cas.isEnabled);
    });
    if (covers) {
      return { result: 'pass', note: 'A Conditional Access policy applies Defender for Cloud Apps session control, governing cloud app usage' };
    }
    return { result: 'review', note: 'No Conditional Access policy applies Defender for Cloud Apps session control — confirm cloud service adoption is governed another way (e.g. a supplier-review gate, or Defender for Cloud Apps discovery run separately)' };
  }

  /* oauthConsentRiskResult() mines a field the 'riskyapps' check already
     fetches and selects — oauth2PermissionGrants' consentType — but has
     never scored on. riskyapps treats every high-privilege grant the
     same regardless of who approved it; this check separates out the
     ones nobody with authority reviewed at all.

     consentType 'AllPrincipals' means an admin consented for the whole
     tenant — reviewed, deliberate, whatever else it is. 'Principal'
     means a single end user clicked "Accept" on an OAuth consent
     screen themselves, no admin in the loop. For a high-privilege scope
     (mail, files, directory write) that is exactly the shape of an
     illicit-consent-grant attack, and it is invisible inside riskyapps'
     combined count. No new Graph call, no new scope: consentType was
     already on the wire. */
  function oauthConsentRiskResult(grants) {
    var HIGH_PRIV = ['Directory.ReadWrite.All', 'Mail.ReadWrite', 'Mail.Send', 'Files.ReadWrite.All', 'Sites.FullControl.All', 'User.ReadWrite.All'];
    var isHighPriv = function (g) {
      var scopes = (g.scope || '').split(' ');
      return scopes.some(function (s) { return HIGH_PRIV.indexOf(s) > -1; });
    };
    var list = (grants || []).filter(function (g) { return g; });
    var userConsented = list.filter(function (g) { return isHighPriv(g) && g.consentType === 'Principal'; });
    var adminConsented = list.filter(function (g) { return isHighPriv(g) && g.consentType === 'AllPrincipals'; });
    return {
      userConsented: userConsented.length,
      adminConsented: adminConsented.length,
      result: userConsented.length === 0 ? 'pass' : userConsented.length === 1 ? 'review' : 'fail'
    };
  }

  /* describeServicePrincipal() formats one resolved servicePrincipal
     into the label riskyapps/oauth-consent show next to a grant — a
     bare clientId GUID otherwise. Pulled out as pure, testable logic;
     the actual /servicePrincipals/{id} lookups (one per distinct risky
     clientId, under the Directory.Read.All this app already holds — no
     new scope) live in graph.js, wrapped so a failed lookup is skipped,
     never invented: a missing name falls back to the id, not a guess. */
  function describeServicePrincipal(sp) {
    if (!sp || !sp.displayName) return null;
    var verified = sp.verifiedPublisher && sp.verifiedPublisher.displayName;
    return sp.displayName + (verified ? ' (verified: ' + verified + ')' : ' (unverified publisher)');
  }

  /* lifecycleWorkflowsResult() scores Entra ID Governance's Lifecycle
     Workflows — read-only visibility into whether joiner/leaver
     automation is actually configured and turned on, never provisioning
     a workflow itself (Checkpoint reads, a practitioner acts, same as
     every other check).

     Only joiner and leaver drive the result. Mover is real and worth
     surfacing in the note, but it is the least universally adopted of
     the three and gating a pass on it would penalize tenants for not
     automating a lower-stakes HR event (an internal transfer) the same
     way as failing to automate offboarding. A workflow that exists but
     is disabled (isEnabled: false — the common "built it, never flipped
     it on" state) does not count; a draft nobody activated protects
     nobody. */
  function lifecycleWorkflowsResult(workflows) {
    var list = (workflows || []).filter(function (w) { return w; });
    var enabled = list.filter(function (w) { return w.isEnabled === true; });
    var hasEnabledCategory = function (cat) { return enabled.some(function (w) { return w.category === cat; }); };
    var joiner = hasEnabledCategory('joiner');
    var leaver = hasEnabledCategory('leaver');
    var mover = hasEnabledCategory('mover');
    return {
      total: list.length, enabled: enabled.length, joiner: joiner, leaver: leaver, mover: mover,
      result: (joiner && leaver) ? 'pass' : (joiner || leaver) ? 'review' : 'fail'
    };
  }

  function deviceCheckinResult(devices, staleDays, nowMs) {
    var list = (devices || []).filter(function (d) { return d; });
    if (!list.length) return { total: 0, stale: 0, never: 0, result: 'review' };
    var limit = (typeof staleDays === 'number' && staleDays > 0 ? staleDays : 30) * 86400000;
    var never = list.filter(function (d) { return !d.lastSyncDateTime; });
    var stale = list.filter(function (d) {
      if (!d.lastSyncDateTime) return true;
      var t = Date.parse(d.lastSyncDateTime);
      return !isNaN(t) && (nowMs - t) > limit;
    });
    /* Proportional, not absolute: one stale laptop in a fleet of 500 is
       housekeeping, while a fifth of the fleet silently unmanaged is a
       real finding. */
    var pct = stale.length / list.length;
    return {
      total: list.length, stale: stale.length, never: never.length,
      result: pct === 0 ? 'pass' : (pct <= 0.1 ? 'review' : 'fail')
    };
  }

  /* ── Endpoint security state, mined from the device list ──────────
     The three checks above (device / device-checkin / device-config)
     between them ask whether a policy EXISTS, whether devices are
     still talking to Intune, and whether Intune's own compliance
     engine is happy. None of them read the security state of the
     endpoint itself. These two do, from exactly the same
     /deviceManagement/managedDevices response the compliance check
     already fetches — two more fields on the $select, no new call and
     no new permission.

     Disk encryption. Essential Eight and ISO 27001 A.8.24 both land
     here, and it is the first question asked after a laptop goes
     missing: was the data on it readable. Intune's own compliance
     state does NOT answer it — a tenant whose compliance policy never
     required encryption reports 100% compliant with an unencrypted
     fleet, which is precisely the gap worth closing.

     Devices that do not report the field at all are excluded from the
     denominator and counted separately, never scored as unencrypted.
     isEncrypted is not populated for every platform and management
     mode, and manufacturing a failure out of a field we could not read
     is how a posture score loses its credibility (same rule as
     incidentTriageResult's unparseable dates). If NOTHING reports it,
     the answer is 'manual' — we did not check, rather than we checked
     and found nothing wrong. */
  function deviceEncryptionResult(devices, passPct, reviewPct) {
    var list = (devices || []).filter(function (d) { return d; });
    var known = list.filter(function (d) { return typeof d.isEncrypted === 'boolean'; });
    var unknown = list.length - known.length;
    if (!known.length) {
      return { result: 'manual', total: list.length, known: 0, encrypted: 0, unencrypted: 0, unknown: unknown, pct: null, unencryptedNames: [] };
    }
    var encrypted = known.filter(function (d) { return d.isEncrypted === true; });
    var bare = known.filter(function (d) { return d.isEncrypted === false; });
    var pct = Math.round(encrypted.length / known.length * 100);
    var pass = typeof passPct === 'number' ? passPct : 100;
    var review = typeof reviewPct === 'number' ? reviewPct : 95;
    return {
      result: pct >= pass ? 'pass' : (pct >= review ? 'review' : 'fail'),
      total: list.length, known: known.length, encrypted: encrypted.length,
      unencrypted: bare.length, unknown: unknown, pct: pct,
      unencryptedNames: bare.map(function (d) { return d.deviceName || d.id; }).filter(Boolean).sort()
    };
  }

  /* Jailbroken / rooted mobile devices. A rooted phone that Intune
     reports as compliant is worse than an unmanaged one: the controls
     the compliance state is asserting can all be defeated locally, so
     the tenant is being told a device is safe precisely when it is not.

     Scoped to iOS and Android only, and 'manual' when the fleet has no
     mobile devices — a Windows-only tenant has no jailbreak exposure,
     and a permanently green check for a question that does not apply is
     as misleading as a permanently red one. Graph reports jailBroken as
     a STRING ("True"/"False"/"Unknown"), not a boolean, so the parse is
     deliberately explicit; a fleet where every mobile device answers
     "Unknown" is also 'manual', for the same reason as above. */
  function jailbrokenDeviceResult(devices) {
    var mobile = (devices || []).filter(function (d) {
      return d && /^(ios|ipados|android)$/i.test(String(d.operatingSystem || '').trim());
    });
    if (!mobile.length) {
      return { result: 'manual', mobile: 0, known: 0, jailbroken: 0, unknown: 0, names: [] };
    }
    var yes = mobile.filter(function (d) { return /^true$/i.test(String(d.jailBroken || '').trim()); });
    var no = mobile.filter(function (d) { return /^false$/i.test(String(d.jailBroken || '').trim()); });
    var known = yes.length + no.length;
    if (!known) {
      return { result: 'manual', mobile: mobile.length, known: 0, jailbroken: 0, unknown: mobile.length, names: [] };
    }
    return {
      result: yes.length ? 'fail' : 'pass',
      mobile: mobile.length, known: known, jailbroken: yes.length, unknown: mobile.length - known,
      names: yes.map(function (d) { return d.deviceName || d.id; }).filter(Boolean).sort()
    };
  }

  /* ── Dormant accounts ─────────────────────────────────────────────
     graph.js's 'dormant-accounts' check.

     The existing 'leaver' check looks at accounts somebody already
     DISABLED and asks whether the rest of the offboarding finished.
     This is the other half, and the more common failure: the account
     nobody disabled at all. An enabled account that has not signed in
     for a quarter is either an offboarding that was never done, a
     service account nobody owns, or a contractor whose engagement
     ended — every one of them a live credential with no one watching
     it.

     Never-signed-in accounts are counted alongside dormant ones rather
     than separately graded, because they are the same finding seen
     earlier. They are reported as their own number in the note, though,
     because break-glass accounts legitimately live in exactly that
     bucket and a practitioner needs to recognise theirs.

     Graded by COUNT against a threshold, not proportionally, and
     deliberately allowed to fail: a handful is housekeeping and
     genuinely may be deliberate, but a directory with dozens of
     untouched enabled accounts is not a tenant with many break-glass
     accounts, it is an unmanaged directory. */
  function dormantAccountResult(users, dormantDays, reviewMax, nowMs) {
    var enabled = (users || []).filter(function (u) { return u && u.accountEnabled === true; });
    var limit = (typeof dormantDays === 'number' && dormantDays > 0 ? dormantDays : 90) * 86400000;
    var max = typeof reviewMax === 'number' && reviewMax >= 0 ? reviewMax : 5;
    var dormant = [], never = 0, guests = 0;
    enabled.forEach(function (u) {
      var act = u.signInActivity || {};
      var last = act.lastSignInDateTime || act.lastNonInteractiveSignInDateTime || null;
      var t = last ? Date.parse(last) : NaN;
      /* An unparseable timestamp is treated as "no data", i.e. the same
         as never — not as a recent sign-in. Reading it as recent would
         hide exactly the accounts this check exists to surface. */
      var isNever = !last || isNaN(t);
      if (!isNever && (nowMs - t) <= limit) return;
      if (isNever) never++;
      if (String(u.userType || '').toLowerCase() === 'guest') guests++;
      dormant.push({
        name: u.displayName || u.userPrincipalName || u.id,
        upn: u.userPrincipalName || '',
        lastSignIn: isNever ? null : last,
        guest: String(u.userType || '').toLowerCase() === 'guest'
      });
    });
    dormant.sort(function (a, b) { return (a.lastSignIn || '').localeCompare(b.lastSignIn || ''); });
    return {
      result: dormant.length === 0 ? 'pass' : (dormant.length <= max ? 'review' : 'fail'),
      enabled: enabled.length, dormant: dormant.length, never: never, guests: guests, accounts: dormant
    };
  }

  /* ── MFA registration coverage ────────────────────────────────────
     graph.js's 'mfa-registration' check, and the evidence half of
     'mfa-all' in the same way legacy-auth-observed is the evidence half
     of 'legacy'.

     'mfa-all' reads Conditional Access and answers "is MFA required".
     This reads the registration report and answers "could these people
     actually complete it". The two come apart constantly: a tenant with
     a flawless tenant-wide MFA policy and forty users who have never
     registered a method has not protected those accounts, it has
     arranged for them to be locked out — and in practice what follows
     is a CA exclusion group that quietly undoes the policy.

     Scored on isMfaCapable rather than isMfaRegistered: registered says
     a method exists on the account, capable says the method is one the
     tenant's policy will actually accept. Capable is the one that
     predicts whether the sign-in succeeds.

     An ADMIN who is not MFA-capable fails the check outright, whatever
     the overall percentage. Averaging a Global Administrator into a
     fleet-wide coverage figure is how the single most valuable account
     in the tenant gets rounded away. */
  function mfaRegistrationResult(rows, reviewPct) {
    var list = (rows || []).filter(function (r) { return r && typeof r === 'object'; });
    if (!list.length) return { result: 'manual', total: 0, capable: 0, notCapable: 0, pct: null, admins: 0, adminsNotCapable: 0, gaps: [], adminGaps: [] };
    var notCapable = list.filter(function (r) { return r.isMfaCapable !== true; });
    var admins = list.filter(function (r) { return r.isAdmin === true; });
    var adminGaps = notCapable.filter(function (r) { return r.isAdmin === true; });
    var pct = Math.round((list.length - notCapable.length) / list.length * 100);
    var review = typeof reviewPct === 'number' ? reviewPct : 95;
    var result;
    if (adminGaps.length) result = 'fail';
    else if (!notCapable.length) result = 'pass';
    else result = pct >= review ? 'review' : 'fail';
    function names(rs) { return rs.map(function (r) { return r.userPrincipalName || r.id; }).filter(Boolean).sort(); }
    return {
      result: result, total: list.length, capable: list.length - notCapable.length,
      notCapable: notCapable.length, pct: pct, admins: admins.length, adminsNotCapable: adminGaps.length,
      gaps: names(notCapable), adminGaps: names(adminGaps)
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
     Defender & Purview depth — direct reads replacing Secure Score
     name-matching where a GA v1.0 Graph signal exists.
     ------------------------------------------------------------
     Four pure scorers behind graph.js's advanced-hunting, attack-
     simulation and sensitivity-label reads. Same contract as every
     scorer above: each takes the shape Graph returned and says what it
     means, and none of them ever turns missing data into a finding. */

  /* Defender Vulnerability Management exposure — the direct signal
     behind the 'patch' check when advanced hunting is readable. Input is
     one row per CVE from graph.js's hunting query: { CveId, Severity,
     Devices, PublishedDate }, already filtered to CVEs with a known
     public exploit.

     Scored on EXPLOITABLE vulnerabilities older than the patch window,
     not on vulnerability count. Every real fleet carries some CVEs; what
     Essential Eight and ISO 27001 A.8.8 test is whether the ones that
     are being exploited get fixed inside the committed timeframe.

     PublishedDate is when the CVE was published, not when a given
     device became exposed — so "older than the window" means "known
     about for longer than the window". That is the honest reading of
     what the table holds, and it is the question an assessor asks. An
     unparseable date is never counted as overdue. */
  function tvmExposureResult(rows, windowDays, nowMs) {
    var list = (rows || []).filter(function (r) { return r && r.CveId; });
    var winMs = (typeof windowDays === 'number' && windowDays >= 0 ? windowDays : 14) * 86400000;
    function overdue(r) {
      var p = Date.parse(r.PublishedDate || '');
      return !isNaN(p) && (nowMs - p) > winMs;
    }
    var sev = function (r) { return String(r.Severity || r.VulnerabilitySeverityLevel || '').toLowerCase(); };
    var critical = list.filter(function (r) { return sev(r) === 'critical'; });
    var high = list.filter(function (r) { return sev(r) === 'high'; });
    var criticalOverdue = critical.filter(overdue);
    var highOverdue = high.filter(overdue);
    var devices = list.reduce(function (m, r) { return Math.max(m, Number(r.Devices) || 0); }, 0);
    return {
      exploitable: list.length, critical: critical.length, high: high.length,
      criticalOverdue: criticalOverdue.length, highOverdue: highOverdue.length,
      maxDevicesOnOneCve: devices,
      worst: criticalOverdue.concat(highOverdue).slice(0, 5).map(function (r) { return r.CveId; }),
      result: criticalOverdue.length ? 'fail' : (highOverdue.length ? 'review' : 'pass')
    };
  }

  /* Defender for Endpoint sensor coverage, from one summarised
     advanced-hunting row: { Onboarded, CanBeOnboarded, Inactive }.

     "Can be onboarded" devices are machines Defender's own device
     discovery has SEEN on the network that run no sensor — the gap an
     EDR coverage claim quietly skips over. Inactive sensors are
     onboarded devices that have stopped reporting, which protect
     nothing. Both count against coverage.

     With device discovery switched off, Defender never reports a
     "can be onboarded" device and coverage reads as complete; the note
     in graph.js says so rather than letting the pass speak for itself. */
  function edrCoverageResult(row, reviewPct) {
    if (!row) return { onboarded: 0, unprotected: 0, inactive: 0, coveragePct: null, result: 'manual' };
    var onboarded = Number(row.Onboarded) || 0;
    var unprotected = Number(row.CanBeOnboarded) || 0;
    var inactive = Number(row.Inactive) || 0;
    var denom = onboarded + unprotected;
    /* No onboarded device and nothing discovered: Defender for Endpoint
       is licensed but not deployed. Nothing measured is not a pass. */
    if (!denom) return { onboarded: 0, unprotected: 0, inactive: 0, coveragePct: null, result: 'fail' };
    var healthy = Math.max(0, onboarded - inactive);
    var pct = Math.floor(healthy / denom * 1000) / 10;
    var floor = typeof reviewPct === 'number' ? reviewPct : 90;
    return {
      onboarded: onboarded, unprotected: unprotected, inactive: inactive, coveragePct: pct,
      result: (unprotected === 0 && inactive === 0) ? 'pass' : (pct >= floor ? 'review' : 'fail')
    };
  }

  /* Attack simulation training (Defender for Office 365 P2) — evidence
     for A.6.3 that awareness is TESTED, not just delivered.

     Deliberately never 'fail'. No standard Checkpoint maps to requires
     phishing simulation specifically — A.6.3 asks for awareness,
     education and training, which the Training register already scores.
     A tenant that has the licence and has never run one gets 'review'
     (a nudge that the evidence is there for the taking), not a failed
     control. */
  var SIM_DONE = { succeeded: 1, recentlyArchived: 1, fullyArchived: 1 };
  function attackSimulationResult(sims, cadenceDays, maxCompromisePct, nowMs) {
    var done = (sims || []).filter(function (s) { return s && SIM_DONE[s.status] && !isNaN(Date.parse(s.completionDateTime || '')); });
    done.sort(function (a, b) { return Date.parse(b.completionDateTime) - Date.parse(a.completionDateTime); });
    var running = (sims || []).filter(function (s) { return s && s.status === 'running'; }).length;
    var latest = done[0] || null;
    var cadMs = (typeof cadenceDays === 'number' && cadenceDays > 0 ? cadenceDays : 180) * 86400000;
    var out = { completed: done.length, running: running, latestId: latest ? latest.id : null,
      latestName: latest ? (latest.displayName || '') : '', latestCompleted: latest ? latest.completionDateTime : null,
      daysSince: latest ? Math.floor((nowMs - Date.parse(latest.completionDateTime)) / 86400000) : null,
      compromisedRate: null, result: 'review' };
    if (!latest) return out;
    if (nowMs - Date.parse(latest.completionDateTime) > cadMs) return out;
    var rate = latest.report && latest.report.overview && latest.report.overview.simulationEventsContent
      ? latest.report.overview.simulationEventsContent.compromisedRate : null;
    if (typeof rate === 'number' && !isNaN(rate)) {
      out.compromisedRate = Math.round(rate * 10) / 10;
      var cap = typeof maxCompromisePct === 'number' ? maxCompromisePct : 20;
      out.result = rate > cap ? 'review' : 'pass';
    } else {
      /* Ran recently, report not readable: the campaign itself is the
         evidence A.6.3 needs; the rate is a bonus, not a precondition. */
      out.result = 'pass';
    }
    return out;
  }

  /* Sensitivity labels that APPLY PROTECTION (encryption / rights
     management) — the direct signal behind the 'encryption' check, from
     /security/dataSecurityAndGovernance/sensitivityLabels' hasProtection.

     Measures that encryption is AVAILABLE to users through a label, not
     how much content carries it — Graph cannot count labelled items.
     No protecting label is 'review' rather than 'fail': Purview Message
     Encryption via transport rule, or a third-party product, can meet
     the same control without a label, which this endpoint cannot see. */
  function labelProtectionResult(labels) {
    var flat = [];
    (function walk(list) {
      (list || []).forEach(function (l) { if (!l) return; flat.push(l); if (l.sublabels) walk(l.sublabels); });
    })(labels);
    var protecting = flat.filter(function (l) { return l.hasProtection === true; });
    return {
      total: flat.length, protecting: protecting.length,
      names: protecting.slice(0, 5).map(function (l) { return l.displayName || l.name || l.id; }),
      result: protecting.length ? 'pass' : 'review'
    };
  }
  /* ============================================================
     Security questionnaire responder
     ------------------------------------------------------------
     Answers inbound customer security questionnaires (a buyer's own
     spreadsheet, CAIQ, SIG-style questions) from what this tenant can
     actually SHOW: its Statement of Applicability, its latest posture
     scan, and answers a practitioner has already approved.

     Deliberately deterministic and AI-free, so it works on every
     tenant. The AI add-on, where entitled, drafts prose on top of the
     same evidence pack this produces (see ai.js's 'questionEvidence'
     section) — it never replaces it, and it never sees more than it.

     The honesty rule every scorer in this file follows applies here
     too, and matters more, because the output leaves the building: a
     draft answer is only ever written when the evidence says "yes".
     Mixed or failing evidence produces a verdict and the facts behind
     it, never a sentence claiming the control is in place.

     Topic sentences are tool-neutral on purpose. The evidence behind a
     "yes" may be a Microsoft signal, an AWS one, a GitHub one or only a
     practitioner's SoA status, and a sentence naming the wrong product
     would be an inaccurate statement to a customer. */
  var QUESTION_TOPICS = [
    { key: 'mfa', label: 'Multi-factor authentication', re: /\bmfa\b|multi[- ]?factor|two[- ]?factor|\b2fa\b|strong authentication/i,
      controls: ['A.8.5', 'A.5.17'], checks: ['mfa-all', 'mfa-priv', 'mfa-registration', 'aws-user-mfa', 'aws-root-mfa', 'gh-org-2fa'],
      yes: 'Multi-factor authentication is required for user access, including all privileged accounts.' },
    { key: 'access', label: 'Access control & least privilege', re: /access control|least[- ]privilege|role[- ]based|\brbac\b|privileged (access|accounts?)|admin(istrator|istrative)? (access|rights|accounts?)|need[- ]to[- ]know/i,
      controls: ['A.5.15', 'A.8.2'], checks: ['admins', 'pim', 'sod'],
      yes: 'Access is granted on a least-privilege, role basis, and privileged access is restricted to named individuals.' },
    { key: 'accessreview', label: 'Access reviews', re: /access reviews?|review(s|ed)? (of )?(user )?access|recertif|entitlement review/i,
      controls: ['A.5.18'], checks: ['access-review'],
      yes: 'User access rights are reviewed at planned intervals.' },
    { key: 'offboarding', label: 'Joiners & leavers', re: /offboard|onboard|leavers?|joiners?|terminat\w* (of )?(employ|staff|user|contract)|revok\w* access|departing|staff (exit|departure)/i,
      controls: ['A.5.11', 'A.5.16', 'A.6.5'], checks: ['leaver', 'lifecycle-workflows', 'dormant-accounts'],
      yes: 'Access is provisioned through a defined joiner process and revoked promptly when staff leave.' },
    { key: 'password', label: 'Passwords & authentication information', re: /password|passphrase|credential (policy|management)/i,
      controls: ['A.5.17'], checks: ['mfa-registration', 'legacy'],
      yes: 'Authentication information is managed under a documented policy, and passwords are never the only factor for access.' },
    { key: 'encryptrest', label: 'Encryption at rest', re: /at[- ]rest|disk encryption|bitlocker|filevault|full[- ]disk|(storage|database|laptop|device)s? (are |is )?encrypt/i,
      controls: ['A.8.24'], checks: ['device-encryption', 'aws-ebs-encryption', 'aws-rds-encryption'],
      yes: 'Data is encrypted at rest.' },
    { key: 'encrypttransit', label: 'Encryption in transit', re: /in[- ]transit|\btls\b|\bssl\b|\bhttps\b|transport (layer )?(security|encryption)/i,
      controls: ['A.8.24', 'A.5.14'], checks: [],
      yes: 'Data is encrypted in transit using current TLS.' },
    { key: 'encryption', label: 'Encryption & key management', re: /encrypt|cryptograph|key management|\bkms\b|\bhsm\b/i,
      controls: ['A.8.24'], checks: ['encryption', 'device-encryption'],
      yes: 'Sensitive information is protected with encryption under a documented cryptography policy.' },
    { key: 'backup', label: 'Backup & restore', re: /back[- ]?ups?\b|restore test|recovery point|\brpo\b/i,
      controls: ['A.8.13'], checks: ['backup'],
      yes: 'Data is backed up regularly, and restores are tested.' },
    { key: 'bcp', label: 'Business continuity & disaster recovery', re: /business continuity|disaster recovery|\bbcp\b|\bdrp?\b|recovery time|\brto\b|resilien|failover/i,
      controls: ['A.5.29', 'A.5.30'], checks: ['bcp'],
      yes: 'A business continuity and disaster recovery plan is documented and tested.' },
    { key: 'incident', label: 'Incident response', re: /incident|breach (notification|response)|notify (you|customers|clients)|security events?/i,
      controls: ['A.5.24', 'A.5.25', 'A.5.26', 'A.6.8'], checks: ['xdr-incidents', 'incident-lessons'],
      yes: 'A documented incident response process is in place; security incidents are triaged, responded to within defined timeframes and reviewed afterwards.' },
    { key: 'logging', label: 'Logging & monitoring', re: /\blog(s|ging)?\b|audit (log|trail)s?|monitor|\bsiem\b|security operations|\bsoc\b(?!\s*[12])|alert/i,
      controls: ['A.8.15', 'A.8.16'], checks: ['logging', 'alerts', 'xdr-incidents', 'aws-cloudtrail', 'aws-guardduty', 'edr-coverage'],
      yes: 'Security-relevant activity is logged, and security alerts are monitored and triaged.' },
    { key: 'malware', label: 'Malware protection & EDR', re: /anti[- ]?virus|anti[- ]?malware|malware|endpoint (detection|protection|security)|\bedr\b|\bxdr\b|\bav\b/i,
      controls: ['A.8.7'], checks: ['edr-coverage', 'wdac', 'macro'],
      yes: 'Endpoints run managed anti-malware protection with endpoint detection and response.' },
    { key: 'vuln', label: 'Vulnerability & patch management', re: /patch|vulnerabilit|security updates?|\bcves?\b/i,
      controls: ['A.8.8'], checks: ['patch', 'gh-dependabot'],
      yes: 'Vulnerabilities are identified and remediated within defined timeframes based on severity.' },
    { key: 'pentest', label: 'Penetration testing', re: /penetration test|pen[- ]?test|ethical hack|red[- ]team/i,
      controls: ['A.8.8', 'A.8.29'], checks: [],
      yes: 'Independent penetration testing is performed, and findings are tracked to remediation.' },
    { key: 'devices', label: 'Device management', re: /mobile devices?|\bmdm\b|device management|managed devices?|laptops?|workstations?|endpoint (management|compliance)|\bbyod\b|bring your own/i,
      controls: ['A.8.1'], checks: ['device', 'compliance-policy', 'device-checkin', 'device-encryption'],
      yes: 'Company devices are centrally managed and must meet a security baseline to access company data.' },
    { key: 'sdlc', label: 'Secure development', re: /secure (software )?development|\bsdlc\b|code reviews?|peer review|pull requests?|secure coding|\bowasp\b|static (code )?analysis|\bsast\b|\bdast\b|security testing/i,
      controls: ['A.8.25', 'A.8.28', 'A.8.29'], checks: ['gh-branch-review', 'gh-status-checks', 'gh-code-scanning'],
      yes: 'Software is built under a secure development life cycle: every change is peer-reviewed before merge, and automated security testing gates release.' },
    { key: 'change', label: 'Change management', re: /change (management|control|approval)|changes to production|release (management|process)/i,
      controls: ['A.8.32'], checks: ['gh-branch-review'],
      yes: 'Changes to production systems follow a documented change management process, with approval before release.' },
    { key: 'secrets', label: 'Secrets & credentials in code', re: /secrets?\b|hard[- ]?coded|api keys?|access keys?|credential leak/i,
      controls: ['A.5.17', 'A.8.24'], checks: ['gh-secret-scanning', 'gh-secret-alerts', 'aws-key-age'],
      yes: 'Secrets and keys are held in managed secret stores and rotated, and source code is scanned to prevent credential leaks.' },
    { key: 'dependencies', label: 'Third-party code & dependencies', re: /open[- ]source|dependenc|software composition|\bsca\b|third[- ]party (libraries|components|packages|code)/i,
      controls: ['A.8.28'], checks: ['gh-dependabot'],
      yes: 'Third-party and open-source dependencies are monitored for known vulnerabilities and kept up to date.' },
    { key: 'vendor', label: 'Supplier & vendor management', re: /vendors?|suppliers?|third[- ]part(y|ies)(?! (libraries|components|packages|code))|sub[- ]?processors?|outsourc|supply chain/i,
      controls: ['A.5.19', 'A.5.20', 'A.5.21', 'A.5.22'], checks: ['supplier'],
      yes: 'Suppliers are assessed for security before engagement and reviewed periodically, with security obligations set in contracts.' },
    { key: 'training', label: 'Security awareness training', re: /training|awareness|educat/i,
      controls: ['A.6.3'], checks: ['training', 'phish-sim'],
      yes: 'All staff complete security awareness training at induction and at least annually.' },
    { key: 'phishing', label: 'Phishing & social engineering', re: /phish|social engineering|simulat/i,
      controls: ['A.6.3'], checks: ['phish-sim', 'training'],
      yes: 'Staff awareness of phishing is tested with simulated phishing campaigns, followed by targeted training.' },
    { key: 'screening', label: 'Personnel screening', re: /background (check|screening)|screening|vetting|criminal (history|record)|reference checks?/i,
      controls: ['A.6.1'], checks: [],
      yes: 'Personnel are screened before employment, proportionate to the role and the information they will access.' },
    { key: 'nda', label: 'Confidentiality agreements', re: /\bndas?\b|non[- ]disclosure|confidentiality (agreement|undertaking)/i,
      controls: ['A.6.6'], checks: [],
      yes: 'Staff and contractors sign confidentiality agreements.' },
    { key: 'policy', label: 'Security policies', re: /security polic(y|ies)|\bisms\b|polic(y|ies) (is |are )?(documented|reviewed|approved|in place)|written polic/i,
      controls: ['A.5.1'], checks: ['policy'],
      yes: 'A documented information security policy set is approved by management, communicated to staff and reviewed at least annually.' },
    { key: 'risk', label: 'Risk management', re: /risk (assessment|management|register|treatment)|assess\w* (security )?risks?/i,
      controls: [], checks: [], register: 'risks',
      yes: 'Information security risks are assessed, recorded in a risk register and treated, with residual risk accepted by management.' },
    { key: 'audit', label: 'Independent review & certification', re: /certif|iso ?27001|soc ?2|\bsoc 1\b|attestation|independent (audit|review|assessment)|external audit|internal audit/i,
      controls: ['A.5.35', 'A.5.36'], checks: ['audit-review'], caution: 'Certification and audit-report status must be stated by you. Checkpoint never claims an audit outcome.',
      yes: 'Information security is independently reviewed at planned intervals, and compliance with policies is checked.' },
    { key: 'classification', label: 'Data classification & labelling', re: /classif|labell?ing|sensitivity labels?|data handling/i,
      controls: ['A.5.12', 'A.5.13'], checks: ['labels'],
      yes: 'Information is classified and labelled according to its sensitivity.' },
    { key: 'dlp', label: 'Data loss prevention', re: /data loss|\bdlp\b|exfiltrat|data leak/i,
      controls: ['A.8.12'], checks: ['dlp'],
      yes: 'Data loss prevention controls monitor and restrict the movement of sensitive information.' },
    { key: 'retention', label: 'Retention & secure deletion', re: /retention|retain|delet(e|ion)|dispos(e|al)|destroy|destruction|purg(e|ing)|sanitis|sanitiz/i,
      controls: ['A.8.10', 'A.5.33'], checks: ['retention'],
      yes: 'Information is retained and securely deleted according to a defined retention schedule.' },
    { key: 'privacy', label: 'Privacy & personal information', re: /privacy|personal (data|information)|\bpii\b|\bgdpr\b|data subjects?|subject (access|rights)/i,
      controls: ['A.5.34'], checks: ['privacy-srr', 'retention'],
      yes: 'Personal information is handled in line with applicable privacy law, and requests from individuals are answered within statutory deadlines.' },
    { key: 'physical', label: 'Physical security', re: /physical (security|access)|data ?cent(er|re)s?|office (access|security)|\bcctv\b|visitors?/i,
      controls: ['A.7.1', 'A.7.2'], checks: [],
      yes: 'Physical access to facilities that hold information is controlled.' },
    { key: 'network', label: 'Network security', re: /firewall|network (security|segmentation|segregation|controls)|\bvpn\b|intrusion|\bids\b|\bips\b|open ports?/i,
      controls: ['A.8.20', 'A.8.21', 'A.8.22'], checks: ['aws-sg-open'],
      yes: 'Networks are protected and segmented, and no administrative service is exposed to the internet.' },
    { key: 'sharing', label: 'External sharing & guest access', re: /external sharing|file sharing|share\w* (files|documents|data) (externally|with third)|guest (users|access|accounts)/i,
      controls: ['A.5.14', 'A.5.16'], checks: ['sharing', 'guests'],
      yes: 'External sharing is restricted, and guest access is governed and reviewed.' },
    { key: 'hosting', label: 'Hosting & data location', re: /hosted|hosting|data (residency|location|sovereignty)|where (is|will) (your|our|the|my|customer) data|cloud (provider|service)s?|which region/i,
      controls: ['A.5.23'], checks: ['ca-cas'], caution: 'Data location and hosting provider are facts only you can state. Checkpoint cannot see where your product is hosted.',
      yes: 'Cloud services are selected, used and exited under a documented cloud security process.' },
    { key: 'ai', label: 'Use of AI', re: /artificial intelligence|\bai\b|machine learning|\bllms?\b|generative|large language model/i,
      controls: [], checks: [], register: 'aiSystems', caution: 'Say whether customer data is used to train models. Checkpoint cannot infer that.',
      yes: 'AI systems in use are inventoried and governed under a documented AI policy.' }
  ];

  var Q_STOP = { the: 1, a: 1, an: 1, and: 1, or: 1, of: 1, to: 1, in: 1, on: 1, for: 1, is: 1, are: 1, do: 1, does: 1, you: 1, your: 1, we: 1, our: 1, it: 1, this: 1, that: 1, with: 1, by: 1, be: 1, have: 1, has: 1, any: 1, all: 1, please: 1, describe: 1, provide: 1, explain: 1, what: 1, how: 1, which: 1, if: 1, so: 1, as: 1, at: 1, from: 1, there: 1, yes: 1, no: 1, organisation: 1, organization: 1, company: 1 };
  function questionTokens(text) {
    var out = {};
    String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).forEach(function (w) {
      if (!w || w.length < 2 || Q_STOP[w]) return;
      out[w.replace(/(ing|ed|es|s)$/, '') || w] = 1;
    });
    return Object.keys(out);
  }
  /* Dice coefficient over normalised tokens: 1 = same words. */
  function questionSimilarity(a, b) {
    var ta = questionTokens(a), tb = questionTokens(b);
    if (!ta.length || !tb.length) return 0;
    var setB = {}; tb.forEach(function (t) { setB[t] = 1; });
    var shared = ta.filter(function (t) { return setB[t]; }).length;
    return 2 * shared / (ta.length + tb.length);
  }

  function matchQuestionTopics(question) {
    var q = String(question || '');
    return QUESTION_TOPICS.filter(function (t) { return t.re.test(q); });
  }

  /* Splits pasted text or a CSV export into questions. Accepts one
     question per line, or CSV where the question column is named
     (Question / Control question / Requirement…) or is the longest
     text column. Numbering like "1.", "Q3)" or "A.2.1 -" is stripped. */
  function parseQuestionnaireInput(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    function splitCsv(line) {
      var out = [], cur = '', q = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur);
      return out.map(function (s) { return s.trim(); });
    }
    var looksCsv = lines.length > 1 && lines.slice(0, 5).every(function (l) { return l.indexOf(',') > -1; }) &&
      splitCsv(lines[0]).length > 1 && splitCsv(lines[0]).length === splitCsv(lines[1]).length;
    var raw;
    if (looksCsv) {
      var header = splitCsv(lines[0]).map(function (h) { return h.toLowerCase(); });
      var col = header.findIndex(function (h) { return /question|requirement|control (text|description)|query/.test(h); });
      var body = lines.slice(1).map(splitCsv);
      if (col < 0) {
        /* No named column: take the column with the longest average text. */
        var avg = header.map(function (_, i) { return body.reduce(function (s, r) { return s + String(r[i] || '').length; }, 0) / (body.length || 1); });
        col = avg.indexOf(Math.max.apply(null, avg));
        if (!/[a-z]{4,}/i.test(header[col] || '') || header[col].length > 40) body.unshift(splitCsv(lines[0]));
      }
      raw = body.map(function (r) { return r[col] || ''; });
    } else {
      raw = lines;
    }
    return raw.map(function (s) {
      return String(s).replace(/^\s*(q(uestion)?\s*)?[a-z]{0,3}\.?\d+(\.\d+)*\s*[.):\-]?\s+/i, '').replace(/^\s*[-•*]\s+/, '').trim();
    }).filter(function (s) { return s.length > 3; });
  }

  /* Builds one question's evidence pack and verdict.
     ctx = {
       controls:   [{ id, t, app, st, evidenceUrl, verified }]  — ISO 27001 SoA rows
       results:    { checkId: 'pass'|'review'|'fail'|'manual' } — latest scan
       notes:      { checkId: note }
       checkLabels:{ checkId: label }
       scanDate:   'YYYY-MM-DD' | ''
       registers:  { risks: n, aiSystems: n }
       library:    [{ id, question, answer, verdict, approvedBy, approvedDate }]
     }
     Verdicts: 'Yes' | 'Partial' | 'No' | 'Not evidenced'. */
  function assessQuestion(question, ctx) {
    ctx = ctx || {};
    var topics = matchQuestionTopics(question);
    var controlsById = {};
    (ctx.controls || []).forEach(function (c) { controlsById[c.id] = c; });
    var results = ctx.results || {};
    var seenC = {}, seenK = {};
    var controls = [], checks = [], registers = [], cautions = [];
    topics.forEach(function (t) {
      t.controls.forEach(function (code) {
        if (seenC[code]) return; seenC[code] = 1;
        var c = controlsById[code];
        if (c) controls.push({ code: code, title: c.t || '', applicable: c.app !== false, status: c.st || 'Not started', evidenced: !!c.evidenceUrl });
      });
      t.checks.forEach(function (id) {
        if (seenK[id]) return; seenK[id] = 1;
        var r = results[id];
        /* An unmeasured check (never run, licence-gated, collector not
           deployed) is not evidence either way — left out entirely. */
        if (r && r !== 'manual') checks.push({ id: id, label: (ctx.checkLabels || {})[id] || id, result: r, note: (ctx.notes || {})[id] || '' });
      });
      if (t.register) {
        var n = Number((ctx.registers || {})[t.register]) || 0;
        registers.push({ key: t.register, count: n });
      }
      if (t.caution && cautions.indexOf(t.caution) < 0) cautions.push(t.caution);
    });

    var applicable = controls.filter(function (c) { return c.applicable; });
    var implemented = applicable.filter(function (c) { return c.status === 'Implemented'; });
    var started = applicable.filter(function (c) { return c.status === 'Implemented' || c.status === 'In progress' || c.status === 'Partially implemented'; });
    var pass = checks.filter(function (k) { return k.result === 'pass'; });
    var fail = checks.filter(function (k) { return k.result === 'fail'; });
    var regHits = registers.filter(function (r) { return r.count > 0; });
    var signals = applicable.length + checks.length + registers.length;

    var verdict;
    if (!topics.length || !signals) verdict = 'Not evidenced';
    else if ((!applicable.length || implemented.length === applicable.length) && !fail.length && pass.length === checks.length &&
             (implemented.length || pass.length || regHits.length) && regHits.length === registers.length) verdict = 'Yes';
    else if (!implemented.length && !pass.length && !regHits.length && !started.length) verdict = 'No';
    else verdict = 'Partial';

    /* Every applicable control the topics name was marked not
       applicable in the SoA: say so, rather than "Not evidenced". */
    var allExcluded = controls.length && !applicable.length && !checks.length && !registers.length;
    if (allExcluded) verdict = 'Not applicable';

    var lib = null, best = 0;
    (ctx.library || []).forEach(function (e) {
      var s = questionSimilarity(question, e.question);
      if (s > best) { best = s; lib = e; }
    });
    if (best < 0.6) lib = null;

    var draft = '', source = 'none';
    if (lib) { draft = lib.answer || ''; source = 'library'; }
    else if (verdict === 'Yes') {
      draft = topics.map(function (t) { return t.yes; }).filter(function (s, i, a) { return a.indexOf(s) === i; }).slice(0, 2).join(' ');
      source = 'evidence';
    }
    /* A reused answer approved under different evidence is the drift a
       reviewer most needs to see: the words say yes, the tenant no
       longer does. */
    var evidenceChanged = !!(lib && lib.verdict && lib.verdict !== verdict && verdict !== 'Not evidenced');

    var confidence = 'Low';
    if (lib && best >= 0.8 && !evidenceChanged) confidence = 'High';
    else if (verdict === 'Yes' && pass.length) confidence = 'High';
    else if (lib || verdict === 'Yes' || verdict === 'Partial') confidence = 'Medium';

    var evidence = [];
    applicable.forEach(function (c) { evidence.push(c.code + ' ' + c.title + ': ' + c.status + (c.evidenced ? ' (evidence linked)' : '')); });
    checks.forEach(function (k) { evidence.push('Posture check "' + k.label + '": ' + k.result + (ctx.scanDate ? ' (scan ' + ctx.scanDate + ')' : '') + (k.result !== 'pass' && k.note ? ' — ' + k.note : '')); });
    registers.forEach(function (r) { evidence.push((r.key === 'risks' ? 'Risk register' : r.key === 'aiSystems' ? 'AI systems register' : r.key) + ': ' + r.count + ' record(s)'); });
    controls.filter(function (c) { return !c.applicable; }).forEach(function (c) { evidence.push(c.code + ' ' + c.title + ': marked not applicable in the SoA'); });

    return {
      question: String(question || ''),
      topics: topics.map(function (t) { return t.label; }),
      verdict: verdict, draft: draft, source: source, confidence: confidence,
      libraryId: lib ? lib.id : null, librarySimilarity: lib ? Math.round(best * 100) / 100 : 0,
      evidenceChanged: evidenceChanged,
      controls: controls, checks: checks, evidence: evidence, cautions: cautions,
      failing: fail.map(function (k) { return k.label; })
    };
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

  /* A.5.35 — independent review of the ISMS. Scored from Checkpoint's own
     internal audit programme (the Audits register) rather than a Graph
     signal — its own guidance text already points here, and a completed
     audit entry IS the independent review record an auditor wants.
     Mirrors backupCheckResult()'s recency logic: a PLANNED audit is not
     a review that happened, so only a COMPLETED one counts, and it has
     to be within cadence (default annual) to still be current. */
  function independentReviewResult(audits, today, cadenceDays) {
    cadenceDays = cadenceDays > 0 ? cadenceDays : 365;
    var list = (audits || []).filter(function (a) { return a; });
    if (!list.length) {
      return { result: 'manual', note: 'No internal audits recorded in Checkpoint\'s audit programme — schedule one, or keep independent-review evidence in whatever system you use.' };
    }
    var completed = list.filter(function (a) { return a.status === 'Completed' && a.completed; });
    if (!completed.length) {
      return { result: 'review', note: list.length + ' internal audit(s) scheduled, but none completed yet.' };
    }
    var mostRecent = completed.reduce(function (m, a) { return !m || a.completed > m.completed ? a : m; }, null);
    var age = daysBetweenDateStr(mostRecent.completed, today);
    if (age > cadenceDays) {
      return { result: 'fail', note: 'The most recent completed internal audit was ' + age + ' days ago (' + mostRecent.completed + ') — independent review is not current (target ≤' + cadenceDays + ' days).' };
    }
    return { result: 'pass', note: completed.length + ' internal audit(s) completed, most recently ' + age + ' day(s) ago, within the ' + cadenceDays + '-day review cadence.' };
  }

  /* A.5.27 (learning from incidents) and A.5.28 (evidence collection) —
     scored from Checkpoint's own Incidents register. A closed incident
     with no recorded root cause or lessons learned was closed without a
     post-incident review, which is exactly the finding both controls
     test for. Severity decides whether that is a fail or a review, the
     same way supplierCheckResult() treats a lapsed critical supplier
     differently from a lapsed low-criticality one — a Low-severity
     incident closed without a write-up is a process gap; a High one is
     a control failure. */
  function incidentLessonsResult(incidents) {
    var list = (incidents || []).filter(function (n) { return n; });
    var closed = list.filter(function (n) { return n.status === 'Closed'; });
    if (!closed.length) {
      return {
        result: 'manual',
        note: list.length
          ? list.length + ' incident(s) recorded, none closed out yet — this scores once at least one is.'
          : 'No incidents recorded in Checkpoint\'s incident register — nothing to review yet.'
      };
    }
    var missing = closed.filter(function (n) { return !n.rootCause || !n.lessonsLearned; });
    var missingHigh = missing.filter(function (n) { return n.severity === 'Critical' || n.severity === 'High'; });
    if (missingHigh.length) {
      return { result: 'fail', note: missingHigh.length + ' Critical/High-severity closed incident(s) have no recorded root cause or lessons learned, of ' + closed.length + ' closed.' };
    }
    if (missing.length) {
      return { result: 'review', note: missing.length + ' lower-severity closed incident(s) have no recorded root cause or lessons learned, of ' + closed.length + ' closed.' };
    }
    return { result: 'pass', note: 'All ' + closed.length + ' closed incident(s) have a recorded root cause and lessons learned.' };
  }

  /* Clause 6.2 — information security objectives, and Clause 9.1's
     requirement to monitor progress against them. Scored from
     Checkpoint's own Objectives register: a Missed objective past its
     due date with nothing decided about it is the clause failing in
     practice, not just an unmet target — 9.1 expects the organisation
     to have SEEN it and decided what happens next, not just missed
     quietly. Same fail/review/pass shape as policyCheckResult(). */
  function objectivesCheckResult(objectives, today) {
    var list = (objectives || []).filter(function (o) { return o; });
    if (!list.length) {
      return { result: 'manual', note: 'No information security objectives recorded in Checkpoint\'s register — set at least one measurable objective, or keep them in whatever system you use.' };
    }
    var missed = list.filter(function (o) { return o.status === 'Missed'; });
    if (missed.length) {
      return { result: 'fail', note: missed.length + ' of ' + list.length + ' objective(s) missed their target.' };
    }
    var overdueUnresolved = list.filter(function (o) {
      return o.status !== 'Achieved' && o.due && o.due < today;
    });
    var noMetric = list.filter(function (o) { return !o.metric || !o.target; });
    if (overdueUnresolved.length || noMetric.length) {
      var gaps = [];
      if (overdueUnresolved.length) gaps.push(overdueUnresolved.length + ' past due with no outcome recorded');
      if (noMetric.length) gaps.push(noMetric.length + ' with no metric or target set — not yet measurable');
      return { result: 'review', note: list.length + ' objective(s) recorded, but ' + gaps.join(', ') + '.' };
    }
    return { result: 'pass', note: 'All ' + list.length + ' objective(s) measurable, owned and on track or achieved.' };
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
      /* Privacy Act — APP and NDB codes are self-prefixed too, and
         "APP11.1" matches the bare-code shape just like CPS234 does. */
      if (/^APP\d+\.\w+/.test(tok) || /^NDB\.\d+/.test(tok)) { lastFw = 'privacyact'; return { fw: 'privacyact', code: tok }; }
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

  /* ===== Configuration drift between two scans =====
     scanResultsChanged() above answers "did anything move" for the
     snapshot decision. This answers WHICH checks moved and in which
     direction, which is a different question with a different reader:
     a practitioner asking "what changed in the tenant since I last
     looked".

     Every scan already records its full per-check result map in the
     scan row's Detail JSON, so this needs no new Graph call, no new
     scope and no schema change — the evidence has been accumulating
     all along with nothing reading it back.

     Direction is judged on a deliberate ordering rather than
     alphabetically or by a raw !==: pass is better than review, review
     than fail. 'manual' sits OUTSIDE that order entirely and is
     reported as neither an improvement nor a regression, because it
     does not mean "worse" — it means the signal stopped being readable
     (a licence lapsed, a scan account lost a role, a service was
     turned off). Scoring that as a regression would put a licensing
     change in the same list as MFA being switched off, and the
     practitioner would learn to skim the list. It gets its own bucket
     so it can be said plainly: this check stopped answering.

     'appeared' and 'vanished' cover a check entering or leaving the
     definition set between releases — a new check shipping is not
     tenant drift and must not read as one. */
  var DRIFT_RANK = { fail: 0, review: 1, pass: 2 };
  function scanDrift(prevResults, nextResults) {
    var out = { improved: [], regressed: [], wentManual: [], cameBack: [], appeared: [], vanished: [], changed: 0, compared: 0 };
    if (!prevResults || !nextResults) return out;
    var seen = {};
    Object.keys(prevResults).forEach(function (k) { seen[k] = true; });
    Object.keys(nextResults).forEach(function (k) { seen[k] = true; });
    Object.keys(seen).sort().forEach(function (id) {
      var before = prevResults[id];
      var after = nextResults[id];
      if (before === undefined) { out.appeared.push({ id: id, to: after }); return; }
      if (after === undefined) { out.vanished.push({ id: id, from: before }); return; }
      out.compared++;
      if (before === after) return;
      out.changed++;
      var entry = { id: id, from: before, to: after };
      if (after === 'manual') { out.wentManual.push(entry); return; }
      if (before === 'manual') { out.cameBack.push(entry); return; }
      var b = DRIFT_RANK[before], a = DRIFT_RANK[after];
      /* An unranked value on either side (a result string this version
         does not know) is reported as changed but not graded — same
         reasoning as 'manual': inventing a direction from a value we
         cannot order is worse than saying only that it moved. */
      if (b === undefined || a === undefined) { out.cameBack.push(entry); return; }
      if (a > b) out.improved.push(entry); else out.regressed.push(entry);
    });
    return out;
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

  /* Turns the Cross-framework mapping view's node/edge set (same data a
     former radial SVG graph used to plot — see app.js's buildConstellation())
     into ranked table rows. That graph's whole value proposition was
     "which controls satisfy more than one framework," but it hid the
     answer behind hovering individual unlabeled dots one at a time, and
     rendered zero visible edges at all for the common case of a tenant
     with only one framework entitled. A table needs no interaction to
     answer the same question: rank by how much cross-framework credit a
     control earns, so the highest-leverage not-yet-implemented work
     surfaces at the top by default. Pure: nodes/edges in, ranked rows
     out, no DOM. `nodes`: [{fw, id, t, st, app, evidenceUrl, ...}].
     `edges`: [{a, b}] "fw|id" pairs, as returned by constellationEdges(). */
  function constellationTableRows(nodes, edges) {
    var list = Array.isArray(nodes) ? nodes : [];
    var byKey = {};
    list.forEach(function (n) { byKey[n.fw + '|' + n.id] = n; });
    var adjacency = {};
    (Array.isArray(edges) ? edges : []).forEach(function (e) {
      (adjacency[e.a] = adjacency[e.a] || []).push(e.b);
      (adjacency[e.b] = adjacency[e.b] || []).push(e.a);
    });
    var rows = list.map(function (n) {
      var key = n.fw + '|' + n.id;
      var mappedTo = (adjacency[key] || [])
        .map(function (k) { return byKey[k]; })
        .filter(Boolean)
        .map(function (p) { return { fw: p.fw, id: p.id, t: p.t }; });
      return {
        fw: n.fw, id: n.id, t: n.t, st: n.st, app: n.app, own: n.own,
        evidenceUrl: n.evidenceUrl, leverageCount: mappedTo.length, mappedTo: mappedTo
      };
    });
    /* Highest leverage first; within a tie, an applicable control not yet
       implemented ("do this next") outranks one already done or N/A —
       there's nothing actionable left to say about those. Final
       fw+id tiebreak only for a stable, reproducible order. */
    rows.sort(function (a, b) {
      if (a.leverageCount !== b.leverageCount) return b.leverageCount - a.leverageCount;
      var aActionable = a.app && a.st !== 'Implemented';
      var bActionable = b.app && b.st !== 'Implemented';
      if (aActionable !== bActionable) return aActionable ? -1 : 1;
      var ka = a.fw + '|' + a.id, kb = b.fw + '|' + b.id;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return rows;
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
    /* Knuth's method multiplies uniforms until the product drops below
       exp(-lambda). Past lambda ~745 that threshold underflows to
       exactly 0, no product of positive uniforms ever reaches it, and
       the loop never terminates — a hung browser tab, not a slow one.
       The default bands top out at 12 events/year so this was
       unreachable until per-risk overrides became settable; now that a
       practitioner can type a frequency in, it is one fat-fingered
       zero away. Capped rather than thrown: a frequency that high is
       already far outside what this order-of-magnitude model can say
       anything useful about, and refusing to draw would take the whole
       portfolio simulation down over one bad input.

       POISSON_LAMBDA_CAP is exported so the UI can warn at the point
       of entry rather than silently modelling something other than
       what was typed. */
    if (lambda > POISSON_LAMBDA_CAP) lambda = POISSON_LAMBDA_CAP;
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= rand(); } while (p > L);
    return k - 1;
  }

  /* Above this, exp(-lambda) underflows to 0 and Knuth's loop cannot
     terminate. 700 keeps exp(-lambda) representable (~1e-305) with
     room to spare, and is ~58x the highest default band. */
  var POISSON_LAMBDA_CAP = 700;

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
    /* Float64Array rather than a plain Array, and the reason is the
       SORT that every consumer of this result performs, not the
       allocation. Array.prototype.sort needs a (a,b)=>a-b comparator
       for numbers — a JS function call per comparison — while a typed
       array sorts numerically with no comparator at all. Measured over
       80 arrays of 10,000: 197ms with the comparator, 49ms without.
       The allocation itself was never the cost (3ms of the 197).

       This matters because the per-risk table sorts once PER RISK: at
       80 open risks the summaries alone were 195ms of blocked main
       thread, on top of the simulation, every time the view opened,
       the board report ran, or a scan recorded its snapshot. */
    var losses = new Float64Array(trials);
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
    /* Same reasoning as simulateRiskLosses() above; Float64Array is
       zero-filled on construction, so the .fill(0) goes too. */
    var portfolioTotals = new Float64Array(trials);
    var perRisk = risks.map(function (r, i) {
      var inputs = riskFinancialInputs(r.L, r.I, r.overrides);
      var losses = simulateRiskLosses(inputs, trials, (baseSeed + (i + 1) * 2654435761) >>> 0);
      for (var t = 0; t < trials; t++) portfolioTotals[t] += losses[t];
      return { id: r.id, inputs: inputs, losses: losses };
    });
    return { perRisk: perRisk, portfolioTotals: portfolioTotals };
  }

  /* An ascending-sorted Float64Array copy of a loss set, whether the
     caller handed us a typed array (what the simulator now returns) or
     a plain one (any other caller, and every existing test).

     Always a typed array, because a typed-array sort needs no
     comparator: Array.prototype.sort on numbers costs a JS function
     call per comparison, and over 80 arrays of 10,000 that was the
     difference between 197ms and 49ms. Sorting a COPY, not in place —
     both consumers here are read-only views over a result the caller
     still owns, and quietly reordering their data would be a nasty
     thing to do to anyone holding a reference to it. */
  /* Array.isArray() is FALSE for a Float64Array, so the two functions
     below cannot use it to decide whether they were handed a usable
     trial set: doing so discards a typed array entirely and returns an
     all-zero summary — every financial figure in the app silently
     becoming $0, with no error anywhere. This accepts anything
     array-like with a numeric length, which covers both the typed
     arrays the simulator returns and the plain arrays every other
     caller (and every existing test) passes. */
  function lossCount(losses) {
    return (losses && typeof losses.length === 'number' && losses.length > 0) ? losses.length : 0;
  }

  function sortedCopy(losses, n) {
    var out = new Float64Array(n);
    for (var i = 0; i < n; i++) out[i] = Number(losses[i]) || 0;
    out.sort();
    return out;
  }

  /* Summary statistics for one array of simulated annual-loss trials —
     mean (the textbook Annualized Loss Expectancy), median, and the
     percentiles a board actually asks for (P90/P95/P99 — "how bad is
     the bad-but-plausible year"). Percentiles use the nearest-rank
     method (sorted array, index = round(p*(n-1))) rather than
     interpolation — simpler, and exact for the trial counts this
     feature runs at (1,000+). */
  function summarizeLossDistribution(losses) {
    var n = lossCount(losses);
    if (!n) return { mean: 0, median: 0, p10: 0, p90: 0, p95: 0, p99: 0, es95: 0, es99: 0, min: 0, max: 0, count: 0 };
    var sorted = sortedCopy(losses, n);
    function pct(p) { return sorted[Math.max(0, Math.min(n - 1, Math.round(p * (n - 1))))]; }
    /* Expected shortfall (a.k.a. TVaR / conditional VaR): the MEAN of
       the worst (1-p) share of years, not the single value at that
       percentile.

       This exists because `max` — the single worst trial — is not a
       statistic about the risk at all. It is a statistic about how
       many times you rolled the dice: it grows without bound as trials
       increase (measured on a 7-risk portfolio: $18.1M at 1,000 trials,
       $20.6M at 10,000, $24.5M at 100,000, $27.9M at 400,000) and it
       swings by a third between two runs at the same trial count.
       Presenting it as "worst year" invites a board to treat a
       sampling artefact as a planning figure, and to ask why it moved
       when nothing about the risk did.

       Expected shortfall answers the question `max` was standing in
       for — "how bad is a genuinely bad year" — and, unlike `max`,
       converges: it averages a growing tail sample rather than taking
       its extreme. It is also the tail measure regulators moved to
       (Basel III replaced VaR with ES for exactly this reason), and it
       is sensitive to tail SHAPE in a way a percentile is not: two
       portfolios can share a P99 while one has a far heavier tail
       beyond it. `max` stays on the object — removing it would be a
       breaking change for any caller, and it is still the honest thing
       to show in an "observed range" context — it just stops being a
       headline number. */
    function es(p) {
      var from = Math.max(0, Math.min(n - 1, Math.ceil(p * n)));
      var tail = 0, cnt = 0;
      for (var j = from; j < n; j++) { tail += sorted[j]; cnt++; }
      return cnt ? tail / cnt : sorted[n - 1];
    }
    var sum = 0;
    for (var i = 0; i < n; i++) sum += sorted[i];
    return {
      mean: sum / n, median: pct(0.5), p10: pct(0.1), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99),
      es95: es(0.95), es99: es(0.99),
      min: sorted[0], max: sorted[n - 1], count: n
    };
  }

  /* A seed derived from the register's own CONTENT, so the same set of
     risks always simulates to the same figures.

     Both the Financial risk view and the board report used to seed from
     Date.now(), independently. That meant the report generated straight
     after reading the screen disagreed with it — on a 7-risk portfolio,
     by ~3% on the mean, 6.5% on P99 and 33% on the worst trial — for a
     register that had not changed at all. Nobody can defend a board
     figure that moves when they press refresh, and "it is a simulation"
     is not the answer: the simulation should move when the RISKS move,
     which is exactly what this makes it do.

     Hashed over each risk's id and the inputs that actually drive the
     model (residual L, I, and any overrides), sorted by id so register
     ordering cannot change the result. Add, remove, re-score or
     override a risk and the numbers move; open the view twice and they
     do not. FNV-1a: not cryptographic, and does not need to be — this
     picks a starting point in a PRNG stream, it does not protect
     anything. */
  function portfolioSeed(risks) {
    var parts = (Array.isArray(risks) ? risks : []).map(function (r) {
      var o = (r && r.overrides) || {};
      return [r && r.id, r && r.L, r && r.I,
        o.freqMin, o.freqLikely, o.freqMax, o.lossMin, o.lossLikely, o.lossMax
      ].map(function (v) { return v == null ? '' : String(v); }).join('|');
    }).sort();
    var str = parts.join('\n');
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    /* A zero seed is legal for mulberry32 but makes an empty register
       and a hash collision-to-zero indistinguishable in a debug trace;
       nudging it off zero costs nothing. */
    return h === 0 ? 1 : h;
  }

  /* Loss exceedance curve — P(annual loss > x) at each of `points`
   x-values evenly spaced from 0 to the trial set's own max (so the
   curve always spans its real data range, never an arbitrarily-guessed
   axis). This is the standard FAIR/quantitative-risk chart: the
   further right a given probability holds, the fatter the tail. */
  function lossExceedanceCurve(losses, points) {
    points = Math.max(2, Math.round(Number(points) || 40));
    var n = lossCount(losses);
    if (!n) return [];
    var max = 0;
    for (var mi = 0; mi < n; mi++) { var mv = Number(losses[mi]) || 0; if (mv > max) max = mv; }
    if (max <= 0) return [{ x: 0, p: 0 }];
    var sorted = sortedCopy(losses, n);
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
     record. `files` is an array of {name, content} or {name, bytes} —
     `content` is a string, UTF-8 encoded here; `bytes` is a
     Uint8Array/byte array stored as-is, for an entry that is already
     binary (e.g. a .docx being nested inside this zip — running it
     through TextEncoder as if it were a "binary string" would corrupt
     any byte outside the ASCII range). Returns a Uint8Array, not a
     Blob — wrapping it in one is a DOM/window concern for whatever
     downloads it, kept out of this dependency-free module same as
     everywhere else in this file. `date` (optional, defaults to now)
     sets every entry's modified-time field — exposed as a parameter
     purely so tests can pass a fixed date instead of asserting against
     the clock. */
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
      var dataBytes = f.bytes ? Array.from(f.bytes) : Array.from(enc.encode(f.content));
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
     Real .docx (OOXML) export for a generated policy document.

     Word export used to be an HTML document saved with a .doc
     extension — Word's compatibility importer opens it, but it isn't a
     real Word document (no native styles, no paragraph/table model
     Word's own editor understands). This builds an actual OOXML
     package: a handful of plain-text XML parts zipped together with
     buildZip() above, same dependency-free approach as everywhere else
     in this file rather than pulling in a docx-generation library for
     it.

     Deliberately not a byte-for-byte port of buildTemplateHtml()'s
     output in app.js — some of what that HTML template does has no
     sane OOXML equivalent (the hand-drawn SVG section icons; the
     rotated ghost "DRAFT" watermark) or would cost a whole extra XML
     part for comparatively little (true numbered/bulleted lists need
     word/numbering.xml; this uses a plain "•  "/"N.  " text prefix
     instead, which reads identically in Word). The content itself —
     every section, every field of the document-control block, the
     brand accent colour — carries over in full; only the decoration
     is thinner. The client logo also isn't embedded (v1: client name
     as text, same fallback the HTML template uses when no logo is
     set) — that's an image part + relationship this can grow into
     later without changing the shape of what's here.

     opts.layout ('standard'/'formal'/'minimal', default 'standard')
     selects one of three fonts/colours/border treatments — the same
     three layoutCss() gives buildTemplateHtml()'s HTML output, adapted
     to what OOXML direct formatting can actually express (no per-
     character colour within a run the way CSS could style a nested
     span, hence docxStatement()'s two-run split for 'formal'/'minimal'
     rather than a literal port of the HTML's separate badge element).
     See DOCX_LAYOUT_STYLES and each of docxBullet()/docxStatement()/
     docxTable()'s layout branches below. */

  function docxEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  var DOCX_ACCENT_FALLBACK = 'BE4A1E';
  function docxAccentHex(c) {
    return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c.slice(1).toUpperCase() : DOCX_ACCENT_FALLBACK;
  }
  /* A light wash of the accent over the warm-paper background, for the
     "what this means for you" callout shading — mirrors the HTML
     template's rgba(accent,.07) over #FAF7F1, computed here since
     OOXML shading is an opaque fill, not a translucent overlay. */
  function docxTint(hex, weight) {
    var bg = { r: 0xFA, g: 0xF7, b: 0xF1 };
    var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    function mix(a, c) { return Math.round(a * (1 - weight) + c * weight); }
    function h2(n) { return ('0' + n.toString(16)).slice(-2).toUpperCase(); }
    return h2(mix(bg.r, r)) + h2(mix(bg.g, g)) + h2(mix(bg.b, b));
  }
  function docxRun(text, r) {
    r = r || {};
    var rPr = [];
    if (r.bold) rPr.push('<w:b/>');
    if (r.italic) rPr.push('<w:i/>');
    if (r.color) rPr.push('<w:color w:val="' + r.color + '"/>');
    if (r.sz) rPr.push('<w:sz w:val="' + r.sz + '"/>');
    var rPrXml = rPr.length ? '<w:rPr>' + rPr.join('') + '</w:rPr>' : '';
    return '<w:r>' + rPrXml + '<w:t xml:space="preserve">' + docxEsc(text) + '</w:t></w:r>';
  }
  /* `textOrRuns` is either a plain string (rendered as one run, `r` its
     rProps — the original shape, still how most callers work) or an
     array of {text, ...rProps} for a paragraph that needs more than one
     run — e.g. a statement number in the accent colour followed by the
     rule text in ink, which a single-colour run can't express. Layouts
     that need only one colour per line keep using the string form;
     nothing about it changed. */
  function docxP(textOrRuns, p, r) {
    p = p || {};
    /* CT_PPr is schema-ordered — Word/LibreOffice reject an otherwise
       well-formed document.xml if these appear out of sequence:
       pStyle, then pBdr/shd, then spacing/ind/jc. A single <w:pBdr>
       holds every edge it uses (top/left/bottom, whichever are set) —
       a paragraph can have only one, and CT_PBdr's own child order is
       top, left, bottom, right. */
    var pPr = [];
    if (p.style) pPr.push('<w:pStyle w:val="' + p.style + '"/>');
    if (p.borderTop || p.borderLeft || p.borderBottom) {
      var edges = '';
      if (p.borderTop) edges += '<w:top w:val="single" w:sz="' + p.borderTop.sz + '" w:space="4" w:color="' + p.borderTop.color + '"/>';
      if (p.borderLeft) edges += '<w:left w:val="single" w:sz="' + p.borderLeft.sz + '" w:space="4" w:color="' + p.borderLeft.color + '"/>';
      if (p.borderBottom) edges += '<w:bottom w:val="single" w:sz="' + p.borderBottom.sz + '" w:space="4" w:color="' + p.borderBottom.color + '"/>';
      pPr.push('<w:pBdr>' + edges + '</w:pBdr>');
    }
    if (p.shade) pPr.push('<w:shd w:val="clear" w:color="auto" w:fill="' + p.shade + '"/>');
    if (p.before != null || p.after != null) pPr.push('<w:spacing w:before="' + (p.before || 0) + '" w:after="' + (p.after || 0) + '"/>');
    if (p.indent) pPr.push('<w:ind w:left="' + p.indent + '"/>');
    if (p.jc) pPr.push('<w:jc w:val="' + p.jc + '"/>');
    var pPrXml = pPr.length ? '<w:pPr>' + pPr.join('') + '</w:pPr>' : '';
    var runsXml = Array.isArray(textOrRuns)
      ? textOrRuns.map(function (run) { return docxRun(run.text, run); }).join('')
      : docxRun(textOrRuns, r);
    return '<w:p>' + pPrXml + runsXml + '</w:p>';
  }
  function docxHeading(text) { return docxP(text, { style: 'Heading2', before: 280, after: 100 }); }
  /* Bullet character varies by layout the same way the HTML template's
     three stylesheets do — a plain dash reads as "restrained", the
     round bullet as the app's own default look. Purely a glyph choice;
     the list still has no real OOXML numbering definition (see this
     file's header comment on buildPolicyDocx for why), in any layout. */
  function docxBullet(text, layout) {
    var prefix = layout === 'formal' ? '—  ' : layout === 'minimal' ? '–  ' : '•  ';
    var rProps = layout === 'minimal' ? { color: '666666' } : {};
    return docxP(prefix + text, { indent: 360, before: 40, after: 40 }, rProps);
  }
  /* Three distinct treatments, matching layoutCss()'s HTML statement
     styles as closely as OOXML's per-run (not per-character) styling
     allows: 'standard' keeps the original single-run, whole-line
     accent+bold (unchanged, so nothing already shipped regresses);
     'formal'/'minimal' split the number and the rule into two runs
     (docxP's array form) so the number alone carries colour/weight and
     the rule reads as plain body text — closer to a "badge" than
     "the whole sentence is coloured". */
  function docxStatement(n, rule, because, accent, layout) {
    var xml;
    if (layout === 'formal') {
      xml = docxP([{ text: n + '.  ', bold: true, color: accent }, { text: rule, bold: true, color: '1A1A1A' }],
        { before: 160, after: because ? 20 : 120 });
    } else if (layout === 'minimal') {
      xml = docxP([{ text: n + '   ', color: '999999' }, { text: rule, color: '111111' }],
        { before: 200, after: because ? 20 : 160 });
    } else {
      xml = docxP(n + '.  ' + rule, { before: 160, after: because ? 20 : 120 }, { bold: true, color: accent });
    }
    if (because) xml += docxP(because, { after: 120, indent: 240 }, { italic: true, color: '6B675E' });
    return xml;
  }
  /* Plain bordered table, direct per-cell formatting rather than a
     named table style — one fewer XML concept for the same visual
     result, since nothing here needs a table style reused elsewhere.
     `opts.borderColor` and `opts.headerShade` (shades only the first
     column, matching the document-control table's label column) are
     both layout-driven; a caller that wants no header shading (the
     roles table, in every layout) simply omits headerShade. */
  function docxTable(rows, colWidths, opts) {
    opts = opts || {};
    var borderColor = opts.borderColor || 'D9D5CB';
    var borders = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (edge) {
      return '<w:' + edge + ' w:val="single" w:sz="4" w:space="0" w:color="' + borderColor + '"/>';
    }).join('') + '</w:tblBorders>';
    var grid = colWidths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('');
    var body = rows.map(function (cells) {
      return '<w:tr>' + cells.map(function (c, i) {
        var shd = (opts.headerShade && i === 0) ? '<w:shd w:val="clear" w:color="auto" w:fill="' + opts.headerShade + '"/>' : '';
        return '<w:tc><w:tcPr><w:tcW w:w="' + colWidths[i] + '" w:type="dxa"/>' + shd + '</w:tcPr><w:p>' + docxRun(c, i === 0 ? { bold: true } : {}) + '</w:p></w:tc>';
      }).join('') + '</w:tr>';
    }).join('');
    return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + borders + '</w:tblPr><w:tblGrid>' + grid + '</w:tblGrid>' + body + '</w:tbl>';
  }
  /* Per-layout table border colour, shared by both the document-control
     and roles tables — kept as one lookup rather than repeating the
     three-way branch at every call site. */
  function docxTableBorderColor(layout) {
    if (layout === 'formal') return '1A1A1A';
    if (layout === 'minimal') return 'EEEEEE';
    return 'D9D5CB';
  }
  /* Shared by "What this means for you" and the leadership-commitment
     section below — both are a block of \n\n-separated paragraphs that
     want the same three-way tinted-box/left-rule/plain treatment
     layoutCss() gives the HTML .callout class. Pulled out once both
     needed it rather than copied twice. */
  function docxCalloutParagraphs(paragraphs, accent, layout) {
    var tint = layout === 'standard' ? docxTint(accent, 0.08) : null;
    return paragraphs.map(function (p) {
      if (layout === 'formal') return docxP(p, { borderLeft: { sz: 12, color: '1A1A1A' }, indent: 200, before: 40, after: 40 }, { italic: true });
      if (layout === 'minimal') return docxP(p, { before: 40, after: 40 });
      return docxP(p, { shade: tint, before: 40, after: 40 });
    }).join('');
  }

  /* `t` is an effective policy template's content (title, purpose,
     scope, policyStatements, roles, exceptions, nonCompliance,
     relatedDocuments, reviewCadence, controls, whyItMatters,
     inPractice — the same shape app.js's buildTemplateHtml() takes).
     `opts.generatedDate`/`opts.reviewDate` are expected already
     formatted for display (same convention buildTemplateHtml() uses
     for generatedDate) — this function does no date parsing, so it has
     no locale/timezone opinion of its own. `opts.banner`, if set, is
     rendered as a bold red strip at the very top (the "uncontrolled
     copy" warning callers already attach to every export). */
  function buildPolicyDocxBody(t, opts) {
    var accent = docxAccentHex(opts.brandColor);
    var layout = opts.layout || 'standard';
    var tableBorder = docxTableBorderColor(layout);
    var parts = [];
    if (opts.banner) {
      parts.push(docxP(opts.banner, { shade: 'B91C1C', jc: 'center', after: 240 }, { bold: true, color: 'FFFFFF', sz: 18 }));
    }
    if (!opts.approved) {
      parts.push(docxP('DRAFT — REVIEW AND APPROVE. NOT YET CONFIRMED BY A PRACTITIONER AS READY FOR USE.',
        { shade: 'B91C1C', jc: 'center', after: 240 }, { bold: true, color: 'FFFFFF', sz: 18 }));
    }
    parts.push(docxP(opts.clientLabel || 'This organisation', { style: 'ClientName', after: 20 }));
    /* The masthead's own bottom rule — dropped for 'minimal', same as
       layoutCss()'s .mast{border-bottom:none} for that layout. */
    parts.push(docxP(('Policy document · Generated ' + (opts.generatedDate || '')).toUpperCase(),
      { style: 'Meta', after: 160, borderBottom: layout === 'minimal' ? null : { sz: 16, color: '0B0B0C' } }));
    parts.push(docxP(t.title, { style: 'Title', before: 200 }));
    parts.push(docxP('', { borderBottom: { sz: layout === 'formal' ? 12 : 8, color: layout === 'formal' ? '1A1A1A' : accent }, after: 200 }));

    var dctlRows = [
      ['Organisation', opts.clientLabel || ''],
      ['Document owner', opts.owner || ''],
      ['Version', opts.version || (opts.approved ? '1.0' : '0.1')],
      ['Status', opts.approved ? 'Approved' : 'Draft'],
      ['Approved by', opts.approved ? (opts.approvedBy || '—') : 'Not yet approved'],
      [opts.approved ? 'Approval date' : 'Generated', opts.generatedDate || ''],
      ['Next review due', opts.reviewDate || '—'],
      ['Classification', opts.classification || 'Internal']
    ];
    parts.push(docxTable(dctlRows, [2600, 6800], { borderColor: tableBorder, headerShade: layout === 'formal' ? 'F7F5F2' : null }));
    parts.push(docxP('', { after: 160 }));

    /* A leadership-authored foreword, distinct from the staff-facing
       "What this means for you" below it — placed right after the
       document-control table so it reads before anything else, the way
       a foreword does. Deliberately reuses opts.approvedBy/generatedDate
       as the signature line rather than adding a second name/date field
       to the document register: when the person who approves THIS
       document is the person the commitment is written for (a CEO), the
       existing approval already IS the signature — see app.js's
       leadershipHtml for the identical reasoning on the HTML side. No
       signature line renders on an unapproved draft; there is nothing
       true to sign yet. */
    if (t.leadershipCommitment) {
      parts.push(docxHeading('A message from leadership'));
      parts.push(docxCalloutParagraphs(t.leadershipCommitment.split('\n\n'), accent, layout));
      if (opts.approved && opts.approvedBy) {
        parts.push(docxP(opts.approvedBy, { before: 80 }, { bold: true }));
        parts.push(docxP(opts.generatedDate || '', { after: 160 }, { color: '6B675E', sz: 16 }));
      }
    }

    if (opts.aiAssisted) {
      parts.push(docxP('AI-assisted draft — the purpose/scope/policy text below was tailored with AI assistance from the standard template and reviewed by ' + (opts.aiReviewer || 'a practitioner') + ' before generation.', { after: 160 }, { italic: true }));
    }

    /* The reader-facing callout: a tinted box for 'standard' (matching
       the HTML template's rgba(accent,.07) treatment), a left rule only
       for 'formal' (a shaded box reads as web UI, not a printed report,
       for that layout), and plain text for 'minimal' — same three
       treatments layoutCss() gives the HTML .callout class. */
    if (t.whyItMatters) {
      parts.push(docxHeading('What this means for you'));
      parts.push(docxCalloutParagraphs(t.whyItMatters.split('\n\n'), accent, layout));
    }
    if (t.inPractice && t.inPractice.length) {
      parts.push(docxHeading('In practice'));
      t.inPractice.forEach(function (p) { parts.push(docxBullet(p, layout)); });
    }

    parts.push(docxHeading('Purpose'));
    parts.push(docxP(t.purpose || '', { after: 120 }));
    parts.push(docxHeading('Scope'));
    parts.push(docxP(t.scope || '', { after: 120 }));

    parts.push(docxHeading('Policy'));
    (t.policyStatements || []).forEach(function (s, i) {
      var rule = typeof s === 'string' ? s : s.rule;
      var because = typeof s === 'string' ? '' : (s.because || '');
      parts.push(docxStatement(i + 1, rule, because, accent, layout));
    });

    if (t.roles && t.roles.length) {
      parts.push(docxHeading('Who is responsible'));
      parts.push(docxTable(t.roles.map(function (r) { return [r.role, r.responsibility]; }), [2600, 6800], { borderColor: tableBorder }));
      parts.push(docxP('', { after: 160 }));
    }
    if (t.exceptions) { parts.push(docxHeading('Exceptions')); parts.push(docxP(t.exceptions, { after: 120 })); }
    if (t.nonCompliance) { parts.push(docxHeading('If this policy is not followed')); parts.push(docxP(t.nonCompliance, { after: 120 })); }
    if (t.relatedDocuments && t.relatedDocuments.length) {
      parts.push(docxHeading('Related documents'));
      t.relatedDocuments.forEach(function (d) { parts.push(docxBullet(d, layout)); });
    }

    parts.push(docxHeading('Review'));
    parts.push(docxP(t.reviewCadence || '', { after: 120 }));
    if (t.controls && t.controls.length) {
      parts.push(docxHeading('Helps satisfy'));
      parts.push(docxP(t.controls.join('; '), { after: 120 }));
    }

    parts.push(docxP('Compliance365 — Checkpoint · ' + (opts.approved ? 'Approved' : 'Draft') + ' · ' + (opts.generatedDate || ''),
      { style: 'Meta', before: 320, borderTop: layout === 'minimal' ? null : { sz: 6, color: '999489' } }));
    return parts.join('');
  }

  /* Font/size/weight per layout, for the four named styles below —
     'formal'/'minimal' deliberately reference system fonts Word already
     ships (Times New Roman, Calibri) rather than a custom font, same
     reasoning layoutCss() gives for its own system font stacks: those
     looks are supposed to be built on what's already there, not a
     substitute for a missing brand font. */
  var DOCX_LAYOUT_STYLES = {
    standard: { bodyFont: 'Manrope', headingFont: 'Bricolage Grotesque', titleSz: '48', clientSz: '32', metaSz: '16', headingSz: '27', headingColorMode: 'accent', headingCaps: false, headingBold: false },
    formal: { bodyFont: 'Times New Roman', headingFont: 'Times New Roman', titleSz: '44', clientSz: '30', metaSz: '17', headingSz: '24', headingColorMode: 'ink', headingCaps: false, headingBold: true },
    minimal: { bodyFont: 'Calibri', headingFont: 'Calibri', titleSz: '52', clientSz: '20', metaSz: '15', headingSz: '18', headingColorMode: 'ink', headingCaps: true, headingBold: true }
  };
  function buildDocxStylesXml(accent, layout) {
    var cfg = DOCX_LAYOUT_STYLES[layout] || DOCX_LAYOUT_STYLES.standard;
    var headingColor = cfg.headingColorMode === 'accent' ? accent : '0B0B0C';
    /* rPr child order again — rFonts, b, caps, color, sz, same sequence
       docxRun()/docxP() already follow, just built by hand here since
       these are named styles, not per-run formatting. */
    var headingRpr = '<w:rFonts w:ascii="' + cfg.headingFont + '" w:hAnsi="' + cfg.headingFont + '"/>' +
      (cfg.headingBold ? '<w:b/>' : '') + (cfg.headingCaps ? '<w:caps/>' : '') +
      '<w:color w:val="' + headingColor + '"/><w:sz w:val="' + cfg.headingSz + '"/>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + cfg.bodyFont + '" w:hAnsi="' + cfg.bodyFont + '"/><w:color w:val="0B0B0C"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="' + cfg.headingFont + '" w:hAnsi="' + cfg.headingFont + '"/><w:sz w:val="' + cfg.titleSz + '"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="ClientName"><w:name w:val="Client Name"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="' + cfg.headingFont + '" w:hAnsi="' + cfg.headingFont + '"/><w:sz w:val="' + cfg.clientSz + '"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="6B675E"/><w:sz w:val="' + cfg.metaSz + '"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr>' + headingRpr + '</w:rPr></w:style>' +
      '</w:styles>';
  }
  function buildDocxCoreXml(t, opts) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<dc:title>' + docxEsc(t.title) + '</dc:title>' +
      '<dc:creator>Compliance365 — Checkpoint</dc:creator>' +
      '<cp:lastModifiedBy>' + docxEsc(opts.owner || '') + '</cp:lastModifiedBy>' +
      '<cp:version>' + docxEsc(opts.version || '') + '</cp:version>' +
      '</cp:coreProperties>';
  }
  var DOCX_CONTENT_TYPES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
  var DOCX_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
  var DOCX_DOCUMENT_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';
  var DOCX_APP_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Checkpoint</Application></Properties>';

  function buildPolicyDocx(t, opts) {
    opts = opts || {};
    var bodyXml = buildPolicyDocxBody(t, opts) +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + bodyXml + '</w:body></w:document>';
    return buildZip([
      { name: '[Content_Types].xml', content: DOCX_CONTENT_TYPES_XML },
      { name: '_rels/.rels', content: DOCX_RELS_XML },
      { name: 'word/document.xml', content: documentXml },
      { name: 'word/_rels/document.xml.rels', content: DOCX_DOCUMENT_RELS_XML },
      { name: 'word/styles.xml', content: buildDocxStylesXml(docxAccentHex(opts.brandColor), opts.layout || 'standard') },
      { name: 'docProps/core.xml', content: buildDocxCoreXml(t, opts) },
      { name: 'docProps/app.xml', content: DOCX_APP_XML }
    ]);
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

    /* Ranked on three keys, in this order. Latest-issuedAt alone was
       the original rule and is still the last word, but on its own it
       silently destroyed partner licences.

       Why that mattered: the caller does not merely READ the winner,
       it MIRRORS it — app.js's mirrorActivationStores() writes
       winner.raw into BOTH localStorage and the tenant Settings list,
       overwriting whatever each held. And /checkpoint/ and /owner/
       compute the same localStorage key on the same origin. So a
       partner who completed a self-serve checkout in their own tenant
       got a 'demo' activation issued today, which outranked their
       partner licence on issuedAt, and was then written over it in
       both stores — permanently locking them out of the owner console,
       which only opens when the winner's type is 'partner'.

       1. usable — 'valid' or 'grace' beats 'expired'. A live grant
          should govern over a dead one whatever its issue date, and
          this is also what stops key 2 from letting a LAPSED partner
          licence outrank a paid-up subscription. (Expired candidates
          reach here: verifyActivationRaw() returns ok:true for them,
          reserving ok:false for a bad signature or the wrong tenant.)
       2. partner — a partner licence and a client/demo entitlement are
          different KINDS of grant, not two versions of one thing, so
          the newer must not displace the other. A partner licence
          already grants every framework, so preferring it costs the
          holder nothing; the self-serve activation is simply discarded
          on the next load, while the Paddle subscription and its
          roster row are untouched.
       3. issuedAt — the original rule, and still correct for what it
          was written for: two stores holding the same lineage, where
          the later issuance is the renewal.

       Candidates with no evalResult.status/type (every pre-existing
       caller and test) tie on keys 1 and 2 and fall through to 3, so
       this is a no-op for everything except the cross-type case. */
    function rankOf(c) {
      var e = c.evalResult || {};
      return {
        usable: (e.status === 'valid' || e.status === 'grace') ? 1 : 0,
        partner: e.type === 'partner' ? 1 : 0,
        issuedAt: String(e.issuedAt || '')
      };
    }
    var winner = verified.slice().sort(function (a, b) {
      var ra = rankOf(a), rb = rankOf(b);
      if (ra.usable !== rb.usable) return rb.usable - ra.usable;
      if (ra.partner !== rb.partner) return rb.partner - ra.partner;
      return rb.issuedAt.localeCompare(ra.issuedAt);
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

  /* ── Roster-wide sync: what to sync, in what order ────────────────
     The owner console syncs a client by signing in to that client's
     tenant and reading their Checkpoint lists, one interactive
     sign-in at a time. A partner with fourteen clients therefore had
     to click Sync fourteen times, which in practice means the roster
     is only ever as current as the last time somebody sat and did
     that. "Sync all" walks the roster instead; this decides what it
     walks.

     Ordered STALEST FIRST — never-synced clients, then oldest
     lastSynced. A bulk run over client tenants is interruptible by
     things outside our control (a browser blocking the second popup,
     an expired session, somebody closing the sign-in window), so the
     order has to be one where stopping early still leaves the roster
     better than it was. Alphabetical or roster order would spend the
     run on the clients that least needed it.

     Clients with no tenant identifier are skipped rather than
     attempted: there is nothing to sign in to, and a failure row
     against them would read as a problem with the client rather than
     as a roster row nobody finished filling in. */
  function syncAllQueue(clients) {
    var list = (Array.isArray(clients) ? clients : []).filter(function (c) { return c && typeof c === 'object'; });
    var queue = [], skipped = [];
    list.forEach(function (c) {
      if (!String(c.tenantId || '').trim()) skipped.push({ id: c._sp, name: c.name || '(unnamed client)', reason: 'No tenant ID on the roster row' });
      else queue.push(c);
    });
    queue.sort(function (a, b) {
      var as = String(a.lastSynced || ''), bs = String(b.lastSynced || '');
      /* Never-synced sorts ahead of everything, then oldest first.
         Ties broken by name so the order is stable between runs
         rather than depending on however the list arrived. */
      if (!as && bs) return -1;
      if (as && !bs) return 1;
      if (as !== bs) return as < bs ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return { queue: queue, skipped: skipped };
  }

  /* Turns a finished (or abandoned) run into the one line a partner
     reads afterwards. Kept separate from the runner so the wording is
     testable without a browser, and so "stopped early" is always
     stated rather than a partial run quietly looking complete. */
  function syncAllSummary(results, queued, skipped) {
    var r = Array.isArray(results) ? results : [];
    var ok = r.filter(function (x) { return x && x.ok; }).length;
    var failed = r.filter(function (x) { return x && !x.ok; }).length;
    var total = typeof queued === 'number' ? queued : r.length;
    var skip = typeof skipped === 'number' ? skipped : 0;
    var attempted = ok + failed;
    var stoppedEarly = attempted < total;
    var parts = [ok + ' synced'];
    if (failed) parts.push(failed + ' failed');
    if (skip) parts.push(skip + ' skipped (no tenant ID)');
    if (stoppedEarly) parts.push((total - attempted) + ' not attempted');
    return {
      ok: ok, failed: failed, skipped: skip, total: total,
      attempted: attempted, stoppedEarly: stoppedEarly,
      complete: !stoppedEarly && !failed,
      message: parts.join(' · ')
    };
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
     Clause 10.2 — react/correct, find the root cause, act, then verify
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

  /* ============================================================
     Next best action — "what should I actually do today?"

     Every other view in this app answers "what is my current state"
     (a score, a heatmap, a register). None of them answer the question
     a non-expert actually has after their first scan: given a dozen
     open actions, which ones matter most right now? This ranks them.

     Deliberately conservative about what it claims. It does NOT invent
     a "+3% readiness" number — simulating the effect of one action on
     the overall score would require assumptions this file has no
     business making (which OTHER checks might also move, whether the
     fix is even correctly implemented). What it CAN honestly say: does
     this action's linked control currently sit behind a FAILING or
     REVIEW-grade live check? That is real, present-tense evidence that
     finishing this action is worth more than finishing one whose check
     already passes (or has no live check behind it at all).

     Ranking, highest first:
       1. The action's control maps to a currently FAILING check.
       2. ...to a REVIEW-grade check.
       3. Critical/High priority, or overdue, with no live-failing
          check behind it (still worth doing, just not provably
          moving a check right now).
       4. Everything else.
     Ties within a tier break on priority, then overdue days, then due
     date (soonest first) — never on scan order or insertion order,
     which would make the same open register produce a different "top
     3" depending on when each row happened to be created. */
  var CHECK_RESULT_URGENCY = { fail: 3, review: 2, manual: 1, pass: 0 };
  var ACTION_PRIORITY_RANK = { Critical: 3, High: 2, Medium: 1, Low: 0 };

  /* Reverse of CHECK_CONTROLS (checkId -> [controlCode,...]): every
     control code mapped to the check id(s) that speak to it. A control
     can be evidenced by more than one check (A.8.5 by both mfa-priv and
     legacy, say), so this returns an array per code. */
  function controlToCheckIds(checkControls) {
    var out = {};
    Object.keys(checkControls || {}).forEach(function (checkId) {
      (checkControls[checkId] || []).forEach(function (code) {
        (out[code] = out[code] || []).push(checkId);
      });
    });
    return out;
  }

  /* One open action's ranking: the worst (most urgent) live result among
     every check that speaks to its linked control, via checkResultsById
     (checkId -> 'pass'|'review'|'fail'|'manual'|null, the caller's job
     to compute — this file never calls checkResult() itself, staying a
     pure function of data the caller already has). No linked control, or
     a control no check speaks to, reads as 'manual' — "no live signal
     either way", the same neutral reading checkResult() itself gives an
     unscored check. */
  function actionCheckUrgency(action, controlToChecks, checkResultsById) {
    var checkIds = (controlToChecks || {})[action.control] || [];
    if (!checkIds.length) return { result: null, checkId: null };
    var worst = null, worstId = null;
    checkIds.forEach(function (id) {
      var r = (checkResultsById || {})[id];
      var rank = CHECK_RESULT_URGENCY[r];
      if (rank === undefined) return;
      if (worst === null || rank > CHECK_RESULT_URGENCY[worst]) { worst = r; worstId = id; }
    });
    return { result: worst, checkId: worstId };
  }

  /* Returns the top `limit` (default 3) open actions to do next, each
     with a plain-language `reason` a non-expert can act on without
     first learning what "A.5.3" means. `actions`: S.actions.
     `checkControls`: window.CHECK_CONTROLS. `checkResultsById`:
     {checkId: result}, the caller's current scan results run through
     checkResult() for every CHECK_DEFS entry. `checkLabelsById`:
     {checkId: label}, for the reason text — optional, falls back to the
     checkId itself if omitted. Excludes Done/Cancelled actions; an empty
     open register returns []. */
  function nextBestActions(actions, checkControls, checkResultsById, checkLabelsById, limit) {
    limit = limit > 0 ? Math.round(limit) : 3;
    var controlToChecks = controlToCheckIds(checkControls);
    var labels = checkLabelsById || {};
    var open = (actions || []).filter(function (a) { return a && a.status !== 'Done' && a.status !== 'Cancelled'; });

    var ranked = open.map(function (a) {
      var urgency = actionCheckUrgency(a, controlToChecks, checkResultsById);
      var prRank = ACTION_PRIORITY_RANK[a.pr] != null ? ACTION_PRIORITY_RANK[a.pr] : 0;
      var od = overdueDaysOf(a);
      /* Tier is the primary sort key — a failing-check action always
         outranks a passing-check one regardless of priority, because
         "will this move a live signal" is a stronger claim than a
         priority label someone typed in. Priority/overdue only break
         ties inside the same tier. */
      var tier = urgency.result === 'fail' ? 3 : urgency.result === 'review' ? 2 : (prRank >= 2 || od > 0) ? 1 : 0;
      var reason;
      if (urgency.result === 'fail') {
        reason = 'Clears a currently failing check' + (labels[urgency.checkId] ? ' — ' + labels[urgency.checkId] : '') + '.';
      } else if (urgency.result === 'review') {
        reason = 'Addresses a check flagged for review' + (labels[urgency.checkId] ? ' — ' + labels[urgency.checkId] : '') + '.';
      } else if (od > 0) {
        reason = (a.pr || 'Medium') + ' priority, ' + od + ' day' + (od === 1 ? '' : 's') + ' overdue.';
      } else {
        reason = (a.pr || 'Medium') + ' priority.';
      }
      return { action: a, tier: tier, prRank: prRank, overdueDays: od, checkId: urgency.checkId, checkResult: urgency.result, reason: reason };
    });

    ranked.sort(function (x, y) {
      if (y.tier !== x.tier) return y.tier - x.tier;
      if (y.prRank !== x.prRank) return y.prRank - x.prRank;
      if (y.overdueDays !== x.overdueDays) return y.overdueDays - x.overdueDays;
      var xd = x.action.due || '9999-99-99', yd = y.action.due || '9999-99-99';
      return xd < yd ? -1 : xd > yd ? 1 : 0;
    });

    return ranked.slice(0, limit);
  }

  /* Whole days an action is overdue by (today implied — this file has
     no ambient clock, so it derives "today" from the caller's own
     Date.now() rather than taking a second parameter every caller has
     to remember to pass). 0 or negative (not yet due, or no due date)
     reads as not overdue. */
  function overdueDaysOf(action) {
    var a = action || {};
    if (!a.due || a.status === 'Done' || a.status === 'Cancelled') return 0;
    var due = Date.parse(a.due + 'T00:00:00Z');
    if (isNaN(due)) return 0;
    var days = Math.floor((Date.now() - due) / 86400000);
    return days > 0 ? days : 0;
  }

  /* Continuous-monitoring in-app setup guidance — the scheduled Azure
     Function's own application-permission list and its Sites.Selected
     grant request, surfaced inline in the Dashboard instead of a "see
     SETUP.md" pointer. MONITOR_APP_PERMISSIONS must be kept in sync BY
     HAND with azure/README.md's own permission table (§2) — nothing
     enforces that automatically, same caveat as the monitor's own
     hand-mirrored check logic against lib.js. */
  var MONITOR_APP_PERMISSIONS = [
    'Policy.Read.All', 'RoleManagement.Read.Directory', 'User.Read.All',
    'Directory.Read.All', 'IdentityRiskyUser.Read.All', 'AccessReview.Read.All',
    'DeviceManagementManagedDevices.Read.All', 'DeviceManagementConfiguration.Read.All',
    'SecurityEvents.Read.All', 'Sites.Selected', 'SecurityIncident.Read.All',
    'SubjectRightsRequest.Read.All', 'LifecycleWorkflows.Read.All'
  ];

  /* The exact HTTP request (README.md §3) a tenant admin runs once, from
     Graph Explorer, to grant the monitor's app registration write access
     to the one SharePoint site it needs — with siteId/clientId filled in
     wherever Checkpoint already knows them, so a practitioner isn't
     hand-assembling this from a markdown snippet. Falls back to a
     placeholder for whichever value isn't known yet, so the snippet is
     always valid to display (never throws on missing input). */
  function monitorGrantSnippet(siteId, clientId, appDisplayName) {
    var body = {
      roles: ['write'],
      grantedToIdentities: [{
        application: {
          id: clientId || '<clientId from step 1>',
          displayName: appDisplayName || 'Checkpoint Posture Monitor'
        }
      }]
    };
    return 'POST https://graph.microsoft.com/v1.0/sites/' + (siteId || '<siteId — see the Site ID value above>') +
      '/permissions\nContent-Type: application/json\n\n' + JSON.stringify(body, null, 2);
  }

  /* Findings ready to close — a risk whose originating check
     (CHECK_DEFS' `tpl`, which every check def sets equal to its own
     `id`) now scores 'pass' on the latest scan, having been proposed
     into the register on an earlier scan when it failed or needed
     review. The underlying issue clearing is real evidence, not a
     guess — but closing the risk and marking its actions Done is still
     a decision only a practitioner makes (nothing here writes
     anything); this just identifies the candidates. A risk a
     practitioner has already said "not yet" to
     (resolutionDismissed) is excluded until its check state changes —
     see the ResolutionDismissed column comment in store.js for how
     that one-way flag behaves if the check later regresses. Risks with
     no `tpl` (workshop-captured, not scan-derived) never match, since
     there's no check to have "resolved" them. */
  function resolvableFindings(risks, actions, checkResultsById) {
    var actionsById = {};
    (actions || []).forEach(function (a) { if (a && a.id) actionsById[a.id] = a; });
    var out = [];
    (risks || []).forEach(function (r) {
      if (!r || r.status === 'Closed' || !r.tpl || r.resolutionDismissed) return;
      if ((checkResultsById || {})[r.tpl] !== 'pass') return;
      var openActionIds = (r.actions || []).filter(function (aid) {
        var a = actionsById[aid];
        return a && a.status !== 'Done' && a.status !== 'Cancelled';
      });
      out.push({ risk: r, openActionIds: openActionIds });
    });
    return out;
  }

  /* Whether a Graph HTTP status is a throttling/transient-availability
     signal worth retrying automatically, rather than surfacing straight
     to the caller as a failure. 429 is Graph's explicit "you're being
     throttled" response; 503/504 are transient service-unavailability
     Graph itself expects a client to retry the same way. Every other
     4xx/5xx (400 malformed request, 403 missing consent, 404 not found,
     ...) is a real failure retrying would only repeat. */
  function isRetryableGraphStatus(status) {
    return status === 429 || status === 503 || status === 504;
  }

  /* How long to wait before retrying a throttled/transient Graph call.
     Honours the server's own Retry-After header (seconds, per RFC 9110)
     when present and parseable — Graph tells you exactly how long it
     wants; guessing our own backoff instead would either wait too
     little (retried too soon, throttled again) or too long (a needless
     delay when Graph would have accepted a retry sooner). Falls back to
     capped exponential backoff with jitter only when the header is
     absent, non-numeric, or negative. `attempt` is 0-indexed (0 = the
     first retry, after the original request). Jitter keeps many
     concurrent calls hitting the same throttled endpoint (a posture
     scan fires dozens in quick succession) from all retrying in
     lockstep and re-triggering the same throttle together. */
  function graphRetryDelayMs(retryAfterHeader, attempt) {
    var fromHeader = parseInt(retryAfterHeader, 10);
    if (!isNaN(fromHeader) && fromHeader >= 0) return fromHeader * 1000;
    var base = Math.min(1000 * Math.pow(2, attempt), 16000);
    var jitter = Math.random() * base * 0.25;
    return Math.round(base + jitter);
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

  /* ================= Vendor security/privacy/AI questionnaire =================
     Deliberately short — a handful of questions a vendor can answer in a
     few minutes, not a full SIG/CAIQ-length assessment. Security and
     Privacy are new question sets; the three AI questions deliberately
     reuse AI_ACT_QUESTIONS' own ids (directInteraction,
     essentialServicesAccess, syntheticContent) where the question means
     the same thing, so a vendor's AI answers can feed classifyAiActRisk()
     directly — see vendorAiActAnswers() below — instead of this being a
     second, unrelated AI-risk model to maintain.

     `dependsOn`, where set, is a UI hint only (skip/grey out until the
     named question is answered Yes) — nothing here enforces it, so a
     transcribed answer for a "conditional" question when the gate
     question is No is tolerated, not rejected: a practitioner
     transcribing a vendor's free-text reply shouldn't be blocked by a
     structural rule the vendor's own reply didn't respect either. */
  var VENDOR_QUESTIONNAIRE = {
    security: {
      label: 'Security',
      questions: [
        { id: 'certification', label: 'Current independent security certification (SOC 2, ISO 27001, or equivalent)?', type: 'yesno' },
        { id: 'certificationDetail', label: 'Which certification, and when does it expire?', type: 'text', dependsOn: 'certification' },
        { id: 'encryption', label: 'Is our data encrypted at rest and in transit?', type: 'yesno' },
        { id: 'mfa', label: 'Is MFA enforced for staff who can access our data?', type: 'yesno' },
        { id: 'incidentResponse', label: 'Documented incident response process, and will you notify us of an incident affecting our data?', type: 'yesno' }
      ]
    },
    privacy: {
      label: 'Privacy',
      questions: [
        { id: 'dataLocation', label: 'Where is our data stored and processed (country/region)?', type: 'text' },
        { id: 'subProcessors', label: 'Do you use third-party sub-processors to handle our data?', type: 'yesno' },
        { id: 'subProcessorsDetail', label: 'If yes, who — can you list them?', type: 'text', dependsOn: 'subProcessors' },
        { id: 'dataAtContractEnd', label: 'What happens to our data when the contract ends (deletion/return)?', type: 'text' }
      ]
    },
    ai: {
      label: 'AI',
      questions: [
        { id: 'usesAi', label: 'Does your product/service use AI or machine learning to process our data, or to make decisions that affect us or our customers?', type: 'yesno' },
        { id: 'directInteraction', label: 'Does it interact directly with people (e.g. a chatbot) who might not realise it’s AI?', type: 'yesno', dependsOn: 'usesAi' },
        { id: 'essentialServicesAccess', label: 'Does it help decide access to things like credit, employment, insurance or other essential services?', type: 'yesno', dependsOn: 'usesAi' },
        { id: 'syntheticContent', label: 'Does it generate synthetic content (text, image, audio, video) that could be mistaken for human-made?', type: 'yesno', dependsOn: 'usesAi' }
      ]
    }
  };
  var VENDOR_QUESTIONNAIRE_SECTIONS = ['security', 'privacy', 'ai'];

  /* Pulls the subset of a vendor's questionnaire answers that map onto
     AI_ACT_QUESTIONS ids, converting this questionnaire's 'Yes'/'No'/
     'Unknown' strings to the booleans classifyAiActRisk() expects.
     'Unknown' reads as false (not triggering an obligation) rather than
     true (over-claiming one) — an unanswered question is a gap to chase
     with the vendor, not a licence to assume the worse-and-safer
     interpretation on their behalf. Returns {} (Minimal tier) if the
     vendor hasn't answered usesAi as Yes at all, same as any AI system
     with no boxes ticked. */
  function vendorAiActAnswers(answers) {
    answers = answers || {};
    if (answers.usesAi !== 'Yes') return {};
    var out = {};
    ['directInteraction', 'essentialServicesAccess', 'syntheticContent'].forEach(function (id) {
      if (answers[id] === 'Yes') out[id] = true;
    });
    return out;
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

  /* Threat intel — "customised for industry and technical stack" (see
     the Threat intel view in app.js) happens entirely here, client-side.
     lambda/threat-intel.js only tags each CISA KEV entry with a small,
     generic set of topic tags (independently, since Node can't require()
     this browser-oriented module); this is what turns those tags into
     "relevant to you" using facts the Lambda never sees — a tenant's
     declared industry (orgIndustry) and self-declared tech stack
     (orgTechStack). Nothing about either is ever sent to the Lambda: the
     browser fetches the same feed every tenant gets, then re-sorts it
     locally. */
  var THREAT_INTEL_INDUSTRY_TAGS = {
    saas: ['identity', 'microsoft', 'browser'],
    healthcare: ['microsoft', 'identity'],
    finserv: ['network-edge', 'identity', 'microsoft'],
    government: ['network-edge', 'identity', 'ics-ot', 'microsoft'],
    defence: ['network-edge', 'identity', 'ics-ot', 'microsoft'],
    education: ['identity', 'microsoft', 'browser'],
    'critical-infra': ['ics-ot', 'network-edge', 'microsoft'],
    proserv: ['identity', 'microsoft', 'browser'],
    notforprofit: ['identity', 'microsoft'],
    other: ['microsoft', 'identity']
  };

  /* Pure — exported so both the sort order below and a standalone
     "why is this flagged" badge can be tested without a DOM. */
  function threatIntelRelevance(item, opts) {
    opts = opts || {};
    var tags = (item && Array.isArray(item.tags)) ? item.tags : [];
    var stackTags = Array.isArray(opts.stackTags) ? opts.stackTags : [];
    var industryTags = THREAT_INTEL_INDUSTRY_TAGS[opts.industryId] || [];
    var matchedStack = tags.some(function (t) { return stackTags.indexOf(t) !== -1; });
    var matchedIndustry = tags.some(function (t) { return industryTags.indexOf(t) !== -1; });
    return { matchedStack: matchedStack, matchedIndustry: matchedIndustry, relevant: matchedStack || matchedIndustry };
  }

  /* Re-sorts (never filters — nothing is hidden, only reordered) a
     threat-intel item list so entries matching the tenant's declared
     tech stack come first, then entries matching its industry, then
     everything else, each group newest-first by dateAdded. A tenant
     that never fills in either simply sees the feed in its original
     (already newest-first) order, unrelevance-annotated. */
  function rankThreatIntelItems(items, opts) {
    var list = Array.isArray(items) ? items : [];
    return list.map(function (item) {
      var r = threatIntelRelevance(item, opts);
      var withFlags = {};
      for (var k in item) if (Object.prototype.hasOwnProperty.call(item, k)) withFlags[k] = item[k];
      withFlags.matchedStack = r.matchedStack;
      withFlags.matchedIndustry = r.matchedIndustry;
      withFlags.relevant = r.relevant;
      return withFlags;
    }).sort(function (a, b) {
      if (a.matchedStack !== b.matchedStack) return a.matchedStack ? -1 : 1;
      if (a.matchedIndustry !== b.matchedIndustry) return a.matchedIndustry ? -1 : 1;
      return String(b.dateAdded || '').localeCompare(String(a.dateAdded || ''));
    });
  }

  /* The sort above reorders but never filters, so when a tenant ticks a
     stack option that nothing in the current feed matches, the list is
     byte-identical to what it showed before. There is no error state to
     render, nothing failed, and the control is working exactly as
     designed — but from the user's chair it is indistinguishable from a
     dead checkbox, which is precisely how it was reported ("whenever I
     select an option it returns the same results"). Five of the seven
     options shipped at the time matched zero items in a live 40-item
     feed, so that was the common case rather than the edge one.

     This states the outcome in words instead: how many advisories the
     declared stack and industry actually account for, and — the part
     that matters — an explicit sentence when the answer is none.
     Returns null when the tenant has declared neither, since "0 of 40
     match" is noise for someone who has not told us anything yet. */
  function threatIntelMatchSummary(ranked, opts) {
    opts = opts || {};
    var list = Array.isArray(ranked) ? ranked : [];
    var hasStack = !!opts.hasStack;
    var hasIndustry = !!opts.hasIndustry;
    if (!hasStack && !hasIndustry) return null;

    var stackCount = list.filter(function (i) { return i.matchedStack; }).length;
    var industryCount = list.filter(function (i) { return i.matchedIndustry && !i.matchedStack; }).length;
    var total = list.length;
    var relevant = stackCount + industryCount;

    var message;
    if (!total) {
      message = '';
    } else if (hasStack && stackCount === 0 && industryCount === 0) {
      message = 'Nothing in the current ' + total + '-advisory feed affects the technology you have ticked, so the list stays in date order. That is a good result, not a missing one.';
    } else if (hasStack && stackCount === 0) {
      message = 'No advisory matches the technology you have ticked. ' + industryCount + ' of ' + total + ' are sorted to the top as typical for your industry instead.';
    } else if (!hasStack) {
      message = relevant + ' of ' + total + ' advisories are typical for your industry and are sorted to the top. Tick your technology above to sharpen this.';
    } else {
      message = stackCount + ' of ' + total + ' advisories affect technology you have ticked and are sorted to the top' +
        (industryCount ? ', followed by ' + industryCount + ' more typical for your industry' : '') + '.';
    }
    return { stackCount: stackCount, industryCount: industryCount, total: total, relevant: relevant, message: message };
  }

  /* Normalises anything a date field might hold into a bare YYYY-MM-DD,
     or '' when there is no usable date in it.

     Exists because both app.js's and owner.js's fmtDate() render a date
     by appending 'T00:00' to force local-midnight rather than UTC. That
     is correct for a date-only string and silently catastrophic for a
     full ISO timestamp: '2026-09-16T05:12:33.123Z' + 'T00:00' parses to
     Invalid Date, and "Invalid Date" is what the owner console printed
     in its Last sync column for EVERY synced client, because lastSynced
     is always stored as new Date().toISOString(). Not an edge case —
     the primary path, in four places.

     app.js had been living with the same trap by remembering to
     .slice(0, 10) at its one timestamp call site. Putting the rule here
     means neither file has to remember. */
  function normaliseDateInput(value) {
    if (!value) return '';
    var s = String(value);
    // Already a date-only string, or an ISO timestamp whose first ten
    // characters are exactly that date — take them verbatim rather than
    // round-tripping through Date(), which would shift the day for any
    // timestamp whose UTC and local dates differ.
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  /* Clause 4 drafting — turns the scope & context questionnaire's
     plain-English answers (ORG_CONTEXT_QUESTIONS in templates.js) into
     first-draft text for the ISO 27001 Clause 4 facts: external and
     internal issues (4.1), interested parties' requirements (4.2), the
     climate change determination (4.1/4.2 as amended in 2024),
     interfaces and dependencies (4.3 c) and a one-sentence scope
     statement of the kind a certification body prints on the
     certificate.

     Deliberately a draft, never a finished answer: the wizard shows
     every string for editing before anything is saved, and the output
     only ever contains what the answers support — an unanswered
     question contributes nothing rather than a guess. `answers` holds
     the question ids below plus the free-text scope fields; `preset`
     is the matching INDUSTRY_PROFILES entry (its externalIssues line
     is the sector-specific part no generic rule can supply). */
  function buildOrgContextDraft(answers, preset, orgName) {
    var a = answers || {};
    var p = preset || {};
    function sentenceList(items) {
      items = items.filter(Boolean);
      if (!items.length) return '';
      var s = items.length === 1 ? items[0] : items.slice(0, -1).join('; ') + '; and ' + items[items.length - 1];
      return s.charAt(0).toUpperCase() + s.slice(1) + '.';
    }
    var sensitive = a.personalData === 'sensitive';
    var customerPii = a.personalData === 'customers' || sensitive;
    var msp = a.itModel === 'msp' || a.itModel === 'mixed';

    var external = [
      p.externalIssues || '',
      'a persistent threat landscape — ransomware, business email compromise and credential phishing aimed at Microsoft 365 accounts'
    ];
    if (a.cloud === 'm365') external.push('reliance on Microsoft 365 for email, collaboration and file storage, which makes the security of that tenant central to the ISMS');
    if (a.cloud === 'saas' || a.cloud === 'iaas') external.push('dependence on third-party SaaS applications that hold organisation data outside the Microsoft 365 tenant');
    if (a.cloud === 'iaas') external.push('hosted infrastructure in public cloud (such as Azure or AWS) under the provider’s shared-responsibility model');
    if (msp) external.push('dependence on a managed service provider for IT operations, which makes that provider’s own security part of the organisation’s');
    if (a.customerDemand === 'often') external.push('customers increasingly asking for evidence of security, such as completed security questionnaires, before they buy');
    if (a.customerDemand === 'contract') external.push('customers requiring specific security controls, breach notification or independent certification as a condition of contract');
    if (customerPii) external.push('regulatory and public expectations for protecting personal information, including mandatory notification of eligible data breaches');
    if (a.ai === 'tools' || a.ai === 'builds') external.push('rapid adoption of generative AI, and emerging regulation and customer expectations about how it is used');

    var internal = [];
    if (a.size === 'micro') internal.push('a small team in which security responsibilities are held alongside other roles, which limits dedicated security capacity and segregation of duties');
    if (a.size === 'small') internal.push('a growing organisation formalising processes that previously relied on the knowledge of a few individuals');
    if (a.size === 'medium' || a.size === 'large') internal.push('several teams and management layers, which calls for consistent application of policy across the organisation');
    if (a.workModel === 'hybrid') internal.push('a hybrid workforce that accesses information both from the office and from homes and other locations outside the organisation’s physical control');
    if (a.workModel === 'remote') internal.push('a fully remote workforce, so every working location is outside the organisation’s physical control');
    if (a.itModel === 'inhouse') internal.push('an in-house IT capability whose time is shared between day-to-day operations and security improvement');
    if (msp) internal.push('reliance on external IT expertise, which requires a clear division of security responsibilities with the provider');
    if (a.develops === 'yes') internal.push('in-house software development, which brings secure development, change control and protection of source code into scope');
    if (sensitive) internal.push('processing of sensitive personal information (such as health or financial information), which raises the impact of any breach');
    if (a.ai === 'builds') internal.push('development of AI capabilities within the organisation’s own products or services');
    if (a.change === 'growing') internal.push('rapid growth, with people, systems and suppliers being added faster than controls are usually updated');
    if (a.change === 'major') internal.push('significant organisational change underway, such as a restructure, merger or major system migration');
    if (internal.length) internal.push('a security programme being formalised against ISO/IEC 27001, with existing controls at varying levels of maturity');

    var reqs = [];
    var custReq = 'customers expect their information to be kept confidential and services to be available';
    if (a.customerDemand === 'often') custReq += ', and increasingly ask for evidence of this through security questionnaires';
    if (a.customerDemand === 'contract') custReq += ', and contractually require specific security controls, prompt breach notification and in some cases independent certification';
    reqs.push(custReq);
    reqs.push('regulators require compliance with the legal and regulatory obligations recorded in this profile' + (customerPii ? ', including notification of eligible data breaches' : ''));
    reqs.push('employees expect their own personal information to be protected and clear guidance on their security responsibilities');
    reqs.push('owners and the board expect information risk to be managed within appetite and reported to them');
    if (msp || a.cloud) reqs.push('suppliers and service providers require clearly defined, contractually agreed access and security responsibilities');
    if (a.ai === 'builds') reqs.push('users of AI-enabled products and services expect transparency about AI use and fair, reliable outcomes');

    var climate = '';
    if (a.climate === 'relevant') climate = 'Climate change has been considered and determined to be a relevant issue: the effect of extreme weather on facilities, power, connectivity and key suppliers is addressed through business continuity and supplier planning, and is revisited at each management review.';
    if (a.climate === 'not-relevant') climate = 'Climate change has been considered and determined not to be a material issue for the information security management system at present. The determination is revisited at each management review.';

    var interfaces = [];
    if (a.cloud) interfaces.push('Microsoft 365, where Microsoft operates the underlying platform and the organisation is responsible for its tenant configuration, identities and data');
    if (a.cloud === 'saas' || a.cloud === 'iaas') interfaces.push('third-party SaaS applications, each governed through the Supplier Security Policy');
    if (a.cloud === 'iaas') interfaces.push('public cloud infrastructure, where the provider secures the physical and virtualisation layers and the organisation secures its workloads, identities and configuration');
    if (a.itModel === 'msp') interfaces.push('the managed service provider, which administers the organisation’s IT under contract with defined security responsibilities');
    if (a.itModel === 'mixed') interfaces.push('the managed service provider, which administers part of the organisation’s IT under contract with defined security responsibilities');
    if (a.workModel === 'hybrid' || a.workModel === 'remote') interfaces.push('home and other remote working environments, which are not under the organisation’s physical control');
    if (interfaces.length) interfaces.push('customers and partners with whom information is exchanged');

    function or(v, d) { return (v && String(v).trim()) || d; }
    var scopeStatement = 'The information security management system of ' + or(orgName, 'the organisation') +
      ' covering ' + or(a.services, 'the services it delivers') +
      ', provided by ' + or(a.businessUnits, 'all of its business units and teams') +
      ' from ' + or(a.locations, 'all of its locations') +
      ', in accordance with the current Statement of Applicability.';

    return {
      externalIssues: sentenceList(external),
      internalIssues: sentenceList(internal),
      partyRequirements: sentenceList(reqs),
      climate: climate,
      interfaces: sentenceList(interfaces),
      scopeStatement: scopeStatement
    };
  }

  /* ISO 42001 Clause 4 drafting — the AI management system counterpart
     of buildOrgContextDraft(), from the same questionnaire answers plus
     the tenant's AI system register. Same rules: a draft for review,
     never more than the inputs support. `aiSystems` is the register
     ([{ name, purpose }]); when it is empty the systems line falls back
     to what the AI-use answer says, and to nothing at all if that was
     not answered either. */
  function buildAimsContextDraft(answers, aiSystems, orgName) {
    var a = answers || {};
    var systems = (aiSystems || []).filter(function (x) { return x && x.name; });
    function sentenceList(items) {
      items = items.filter(Boolean);
      if (!items.length) return '';
      var s = items.length === 1 ? items[0] : items.slice(0, -1).join('; ') + '; and ' + items[items.length - 1];
      return s.charAt(0).toUpperCase() + s.slice(1) + '.';
    }
    function lowerFirst(t) { t = String(t || '').trim().replace(/\.\s*$/, ''); return t.charAt(0).toLowerCase() + t.slice(1); }

    var systemsText = '';
    if (systems.length) {
      systemsText = sentenceList(systems.map(function (x) { return x.name + (x.purpose ? ' (' + lowerFirst(x.purpose) + ')' : ''); }));
    } else if (a.ai === 'tools') {
      systemsText = 'Generative AI tools used by staff in their work, such as Microsoft 365 Copilot and approved AI assistants.';
    } else if (a.ai === 'builds') {
      systemsText = 'AI capabilities built into the organisation’s own products and services; and generative AI tools used by staff in their work.';
    }

    var role = '';
    if (a.ai === 'tools') role = 'The organisation is a user (deployer) of AI systems provided by others; it does not develop or supply AI systems to third parties.';
    if (a.ai === 'builds') role = 'The organisation is both a provider of AI systems, through the AI capabilities in its own products and services, and a user (deployer) of AI systems provided by others.';

    var issues = [];
    if (a.ai === 'tools' || a.ai === 'builds') {
      issues.push('emerging AI regulation and guidance, including the EU AI Act where the organisation’s AI reaches EU markets, and customer expectations about responsible AI use');
      issues.push('dependence on third-party model and platform providers whose models, terms and data handling can change without notice');
    }
    if (a.ai === 'tools') issues.push('staff adopting AI tools faster than they can be assessed, including tools that have not been approved');
    if (a.ai === 'builds') issues.push('the organisation’s obligations as a provider — transparency to users, testing for accuracy and bias, and monitoring AI systems after release');
    if ((a.ai === 'tools' || a.ai === 'builds') && (a.personalData === 'customers' || a.personalData === 'sensitive')) issues.push('personal information' + (a.personalData === 'sensitive' ? ', including sensitive information,' : '') + ' that may be entered into or processed by AI systems');
    if (a.ai === 'builds' && a.develops === 'yes') issues.push('in-house development and change of AI capabilities, which brings data quality, model evaluation and life-cycle controls into scope');

    function or(v, d) { return (v && String(v).trim()) || d; }
    var scopeStatement = 'The AI management system of ' + or(orgName, 'the organisation') +
      ' covering ' + (a.ai === 'builds' ? 'the development, provision and use of AI systems' : 'the use of AI systems') +
      ' in support of ' + or(a.services, 'the services it delivers') +
      ', across ' + or(a.businessUnits, 'all of its business units and teams') + '.';

    return { aiSystems: systemsText, aiRole: role, aiIssues: sentenceList(issues), aimsScopeStatement: scopeStatement };
  }

  /* The clause-register changes one generated document makes (see
     CLAUSE_DOCUMENT_MAP in templates.js). `stage` is 'generated' (a
     DRAFT was just saved) or 'approved'. Returns [{ clause, set }] for
     the rows that actually change — `set` holds only changed fields.

     Rules, in order of what they protect:
     - Never downgrade: an Implemented clause keeps its status (it only
       gains this document as evidence if it had none), and nothing ever
       moves backwards.
     - Never overwrite someone else's evidence: a clause already linked
       to a DIFFERENT document keeps that link and its status — the
       practitioner chose that evidence deliberately.
     - A draft is progress, not implementation: 'generated' links the
       document and moves Not started → In progress, never further.
     - 'approved' marks Implemented only where the mapping says the
       document itself satisfies the clause; process clauses stop at
       In progress until their records exist. */
  function clauseUpdatesForDocument(mapping, clauses, docUrl, stage) {
    var out = [];
    (mapping || []).forEach(function (m) {
      var c = (clauses || []).find(function (x) { return (x.fw || 'iso27001') === m.fw && x.id === m.code; });
      if (!c || !docUrl) return;
      if (c.evidenceUrl && c.evidenceUrl !== docUrl) return;
      /* Already Implemented: never changed — except that one with NO
         evidence gets this document linked, closing exactly the
         "Implemented without linked evidence" gap the readiness report
         flags. */
      if (c.st === 'Implemented') {
        if (!c.evidenceUrl) out.push({ clause: c, set: { evidenceUrl: docUrl } });
        return;
      }
      var set = {};
      if (!c.evidenceUrl) set.evidenceUrl = docUrl;
      if (stage === 'approved' && m.implements) set.st = 'Implemented';
      else if (c.st === 'Not started') set.st = 'In progress';
      if (Object.keys(set).length) out.push({ clause: c, set: set });
    });
    return out;
  }

  /* Whether the RECORDS a process clause needs exist — the half of a
     clause an approved procedure cannot supply on its own (see
     CLAUSE_DOCUMENT_MAP's `implements: false` entries). Reads the
     registers Checkpoint already keeps, reusing the same check
     functions the posture scan scores them with, so a clause and its
     related check can never disagree. Returns { met, note }; a clause
     with no rule here returns { met: false, note: '' } and is left for
     the practitioner to judge. `d` = { risks, training, audits, reviews,
     objectives, actions, aiSystems, docs, scans, reviewCadenceDays }. */
  function clauseOperatingEvidence(fw, code, d, today) {
    d = d || {};
    function ok(note) { return { met: true, note: note }; }
    function no(note) { return { met: false, note: note || '' }; }
    var openRisks = (d.risks || []).filter(function (r) { return r.status !== 'Closed'; });
    var fwAudits = (d.audits || []).filter(function (a) {
      return fw === 'iso42001' ? a.fw === 'iso42001' : a.fw !== 'iso42001';
    });
    var lastReview = (d.reviews || []).filter(function (r) { return r.date && r.decisions; })
      .reduce(function (m, r) { return !m || r.date > m.date ? r : m; }, null);
    var reviewCurrent = lastReview && daysBetweenDateStr(lastReview.date, today) <= 365;
    switch (code) {
      case '6.1.2':
        if (fw === 'iso42001') return no();
        if (!openRisks.length) return no('No open risks recorded.');
        return openRisks.every(function (r) { return r.L && r.I && r.owner; })
          ? ok(openRisks.length + ' open risk(s) assessed for likelihood and impact, each with an owner.')
          : no('Some open risks have no likelihood, impact or owner.');
      case '6.1.3':
        if (fw === 'iso42001') return no();
        if (!openRisks.length) return no('No open risks recorded.');
        return openRisks.every(function (r) { return r.treat; })
          ? ok('Every open risk has a recorded treatment decision.')
          : no('Some open risks have no treatment decision.');
      case '6.1.4':
        if (fw !== 'iso42001') return no();
        var ai = d.aiSystems || [];
        if (!ai.length) return no('No AI systems registered.');
        return ai.every(function (a) { return a.impactAssessmentStatus === 'Completed'; })
          ? ok('Impact assessments completed for all ' + ai.length + ' registered AI system(s).')
          : no('Some registered AI systems have no completed impact assessment.');
      case '6.2':
        var obj = objectivesCheckResult(d.objectives || [], today);
        return obj.result === 'pass' ? ok(obj.note) : no(obj.note);
      case '9.1':
        var obj91 = objectivesCheckResult(d.objectives || [], today);
        var recentScan = (d.scans || []).some(function (x) { return x.date && daysBetweenDateStr(String(x.date).slice(0, 10), today) <= 90; });
        return obj91.result === 'pass' && recentScan
          ? ok('Objectives measured and on track, and a posture scan has run within 90 days.')
          : no('Needs objectives on track and a posture scan within 90 days.');
      case '7.2':
      case '7.3':
        var tr = trainingCheckResult(d.training || [], today);
        return tr.result === 'pass' ? ok(tr.note) : no(tr.note);
      case '7.5.2':
      case '7.5.3':
        var pol = policyCheckResult(d.docs || [], today);
        return pol.result === 'pass' ? ok(pol.note) : no(pol.note);
      case '9.2':
        var aud = independentReviewResult(fwAudits, today, d.auditCadenceDays);
        return aud.result === 'pass' ? ok(aud.note) : no(aud.note);
      case '9.3':
      case '10.1':
        return reviewCurrent
          ? ok('Management review held ' + lastReview.date + ' with recorded decisions.')
          : no('No management review with recorded decisions in the last 12 months.');
      case '10.2':
        var ncs = (d.actions || []).filter(function (a) { return a.type && a.type.indexOf('Non-conformity') === 0; });
        var late = ncs.filter(function (a) { return !capaStatus(a).complete && a.due && a.due < today; });
        return late.length
          ? no(late.length + ' nonconformit' + (late.length > 1 ? 'ies are' : 'y is') + ' past due with the corrective-action loop still open.')
          : ok(ncs.length ? 'All ' + ncs.length + ' nonconformities are closed out or within their due date.' : 'No nonconformities raised; the corrective-action procedure is approved and ready.');
      default:
        return no();
    }
  }

  /* The automatic half of the clause register. For every clause whose
     linked evidence is an APPROVED, in-date generated document for that
     clause (CLAUSE_DOCUMENT_MAP), decides whether it is met:
     - `implements: true` — the approved document is the requirement;
     - otherwise — the approved procedure AND its records
       (clauseOperatingEvidence()).
     A met clause is marked Implemented if it is not already, and
     re-verified today (by "Checkpoint (automated)") so it never goes
     stale while its evidence stays current — the same way posture-scan
     controls re-verify themselves every scan. It never downgrades: when
     records lapse the verification simply stops being renewed, and the
     clause turns overdue for re-verification on the register and in the
     readiness report, where a person decides.
     Returns [{ clause, set, note }] for rows that change. */
  function clauseAutomationUpdates(map, clauses, docs, data, today) {
    var docByUrl = {};
    (docs || []).forEach(function (x) { if (x && x.url) docByUrl[x.url] = x; });
    var out = [];
    Object.keys(map || {}).forEach(function (tplId) {
      map[tplId].forEach(function (m) {
        var c = (clauses || []).find(function (x) { return (x.fw || 'iso27001') === m.fw && x.id === m.code; });
        if (!c || !c.evidenceUrl) return;
        var doc = docByUrl[c.evidenceUrl];
        if (!doc || doc.status !== 'Approved' || doc.tplId !== tplId) return;
        if (documentReviewState(doc, today).state === 'overdue') return;
        var ev = m.implements ? { met: true, note: 'Approved ' + (doc.name || 'document') + ' is the requirement.' } : clauseOperatingEvidence(m.fw, m.code, data, today);
        if (!ev.met) return;
        var set = {};
        if (c.st !== 'Implemented') set.st = 'Implemented';
        if (c.verified !== today) { set.verified = today; set.verifiedBy = 'Checkpoint (automated)'; }
        if (Object.keys(set).length) out.push({ clause: c, set: set, note: ev.note });
      });
    });
    return out;
  }

  /* The write guard behind "no save fails silently" (see the comment
     above wrapStoreWrites() in app.js for why). Pure apart from timers:
     no DOM, no S — so the retry/queue semantics are unit-tested.
     createWriteGuard({ methods, onChange, retryDelayMs }) returns
       wrap(store)  — replaces each named method with a guarded one
       pending()    — [{ key, label, error, at }]
       count()      — number of queued unsaved writes
       retryAll()   — re-attempts every queued write; resolves to the
                      number still failing
     A guarded method retries a transient failure (no HTTP status,
     408, 429, 5xx) once, then queues it keyed by method + record id
     (a later failure on the same record replaces the earlier one) and
     re-throws, so callers' own error handling is unchanged. Any later
     success for the same key clears it. */
  function createWriteGuard(opts) {
    opts = opts || {};
    var methods = opts.methods || [];
    var onChange = opts.onChange || function () {};
    var delay = opts.retryDelayMs == null ? 1500 : opts.retryDelayMs;
    var queue = {};
    function keyOf(method, args) {
      var a = args[0];
      var id = a && typeof a === 'object' ? (a._sp || a.spId || a.id || '') : (a == null ? '' : String(a));
      return method + '|' + (id || JSON.stringify(a === undefined ? null : a).slice(0, 80));
    }
    function labelOf(method, args) {
      var a = args[0];
      var what = method.replace(/^(add|update|delete|set|clear|save)/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase() || method;
      var id = a && typeof a === 'object' ? (a.id || a.name || a.title || '') : (typeof a === 'string' ? a : '');
      return what + (id ? ' ' + id : '');
    }
    function transient(e) {
      var st = e && e.status;
      if (!st) return true;
      return st === 408 || st === 429 || st >= 500;
    }
    function clear(key) { if (queue[key]) { delete queue[key]; onChange(); } }
    function wrap(store) {
      if (!store || store.__writesGuarded) return store;
      store.__writesGuarded = true;
      methods.forEach(function (name) {
        var orig = store[name];
        if (typeof orig !== 'function') return;
        store[name] = function () {
          var self = this, args = Array.prototype.slice.call(arguments);
          var key = keyOf(name, args);
          var attempt = function () { return Promise.resolve().then(function () { return orig.apply(self, args); }); };
          return attempt().then(function (r) { clear(key); return r; }, function (e) {
            var retried = transient(e)
              ? new Promise(function (res) { setTimeout(res, delay); }).then(attempt)
              : Promise.reject(e);
            return retried.then(function (r) { clear(key); return r; }, function (err) {
              queue[key] = { key: key, label: labelOf(name, args), error: (err && err.message) || String(err), at: new Date(), retry: attempt };
              onChange();
              throw err;
            });
          });
        };
      });
      return store;
    }
    function pending() { return Object.keys(queue).map(function (k) { return queue[k]; }); }
    function retryAll() {
      var keys = Object.keys(queue);
      return keys.reduce(function (p, k) {
        return p.then(function () {
          var item = queue[k];
          if (!item) return;
          return item.retry().then(function () { delete queue[k]; }, function (e) { item.error = (e && e.message) || String(e); item.at = new Date(); });
        });
      }, Promise.resolve()).then(function () { onChange(); return Object.keys(queue).length; });
    }
    return { wrap: wrap, pending: pending, count: function () { return Object.keys(queue).length; }, retryAll: retryAll };
  }

  /* ============================================================
     Information asset register (ISO 27001 A.5.9)
     ------------------------------------------------------------
     A.5.9 asks for an inventory of information AND other associated
     assets, with owners. Microsoft 365 can discover the "associated"
     half — Intune devices, Entra enterprise applications, SharePoint
     sites — and the Vendor register already lists the external
     services. What no system can discover is the information itself
     (the customer database, HR records, source code), which is why the
     register takes manual entries alongside synced ones and why an
     Intune-only list would not satisfy an auditor.

     mergeDiscoveredAssets() is the re-sync rule, and the part worth
     testing: discovered rows are keyed by source + sourceId so a second
     sync updates rather than duplicates; only the fields the SOURCE owns
     (name, location, the device's primary user as owner) are refreshed;
     everything a person set — classification, criticality, notes, an
     owner typed over a blank — is left alone; and a synced asset that
     has disappeared from its source is flagged, never deleted, because
     a device missing from Intune is itself something to look into. */
  var ASSET_TYPES = ['Information', 'Application', 'Cloud service', 'Device', 'Information location', 'Other'];
  var ASSET_CLASSIFICATIONS = ['Public', 'Internal', 'Confidential', 'Restricted'];

  function mergeDiscoveredAssets(existing, discovered, today) {
    var list = existing || [];
    var byKey = {};
    list.forEach(function (a) { if (a && a.source && a.source !== 'Manual' && a.sourceId) byKey[a.source + '|' + a.sourceId] = a; });
    var seen = {}, toAdd = [], toUpdate = [];
    (discovered || []).forEach(function (d) {
      if (!d || !d.source || !d.sourceId) return;
      var key = d.source + '|' + d.sourceId;
      if (seen[key]) return;
      seen[key] = 1;
      var cur = byKey[key];
      if (!cur) {
        toAdd.push({ name: d.name, type: d.type, owner: d.owner || '', classification: d.classification || '', criticality: d.criticality || '',
          location: d.location || '', source: d.source, sourceId: d.sourceId, status: 'Active', lastSynced: today, lastReviewed: '', notes: d.notes || '' });
        return;
      }
      var changed = false;
      function set(field, v) { if (v !== undefined && v !== null && v !== '' && cur[field] !== v) { cur[field] = v; changed = true; } }
      set('name', d.name);
      set('location', d.location);
      /* A device's owner is its Intune primary user — the source owns it.
         For every other source a synced owner only fills a blank. */
      if (d.source === 'Intune') set('owner', d.owner);
      else if (!cur.owner) set('owner', d.owner);
      if (cur.status !== 'Active') { cur.status = 'Active'; changed = true; }
      if (cur.lastSynced !== today) { cur.lastSynced = today; changed = true; }
      if (changed) toUpdate.push(cur);
    });
    /* Only sources that were actually read this time can mark an asset
       missing — a failed SharePoint read must not flag every site. */
    var readSources = {};
    (discovered || []).forEach(function (d) { if (d && d.source) readSources[d.source] = 1; });
    var missing = list.filter(function (a) {
      return a && a.source && a.source !== 'Manual' && readSources[a.source] && a.status === 'Active' && !seen[a.source + '|' + a.sourceId];
    });
    missing.forEach(function (a) { a.status = 'Not found in last sync'; toUpdate.push(a); });
    return { toAdd: toAdd, toUpdate: toUpdate, missing: missing.length };
  }

  /* What the register can honestly claim for A.5.9, and what is still
     missing. Retired assets are history, not inventory. */
  function assetRegisterSummary(assets, today, reviewDays) {
    var live = (assets || []).filter(function (a) { return a && a.status !== 'Retired'; });
    var noOwner = live.filter(function (a) { return !String(a.owner || '').trim(); });
    var unclassified = live.filter(function (a) { return (a.type === 'Information' || a.type === 'Information location') && !a.classification; });
    var info = live.filter(function (a) { return a.type === 'Information'; });
    var missing = live.filter(function (a) { return a.status === 'Not found in last sync'; });
    var days = typeof reviewDays === 'number' ? reviewDays : 365;
    var stale = live.filter(function (a) {
      if (!a.lastReviewed) return true;
      return today && daysBetweenDateStr(String(a.lastReviewed).slice(0, 10), today) > days;
    });
    var byType = {};
    live.forEach(function (a) { byType[a.type || 'Other'] = (byType[a.type || 'Other'] || 0) + 1; });
    return {
      total: live.length, information: info.length, noOwner: noOwner.length, unclassified: unclassified.length,
      missing: missing.length, unreviewed: stale.length, byType: byType,
      /* Ready for an auditor: at least one INFORMATION asset (a device
         list alone is not an A.5.9 inventory), and every live asset owned. */
      ready: info.length > 0 && noOwner.length === 0
    };
  }

  /* ============================================================
     Legal, statutory, regulatory and contractual requirements
     (ISO 27001 A.5.31, and Clause 4.2's "requirements of interested
     parties")
     ------------------------------------------------------------
     A starting set for an Australian organisation. Each row is a
     PROMPT for the practitioner, not a legal conclusion: the ones whose
     applicability depends on the organisation (turnover, sector, state)
     start as "To confirm", never "Yes", because Checkpoint cannot know
     whether the small-business exemption applies or which state's
     health records law is in play. Nothing here is legal advice, and
     the view says so. */
  var LEGAL_BASELINE_AU = [
    { title: 'Privacy Act 1988 (Cth) — Australian Privacy Principles', type: 'Legislation', jurisdiction: 'Australia (Cth)', applies: 'To confirm',
      requirement: 'Handle personal information in line with the 13 APPs. Applies to organisations with annual turnover over $3 million, and to health service providers and certain other entities regardless of turnover.',
      controls: ['A.5.34', 'A.5.31'] },
    { title: 'Notifiable Data Breaches scheme (Privacy Act Part IIIC)', type: 'Legislation', jurisdiction: 'Australia (Cth)', applies: 'To confirm',
      requirement: 'Assess a suspected eligible data breach within 30 days, and notify affected individuals and the OAIC as soon as practicable once one is confirmed.',
      controls: ['A.5.24', 'A.5.26', 'A.5.34'] },
    { title: 'Cyber Security Act 2024 (Cth) — ransomware payment reporting', type: 'Legislation', jurisdiction: 'Australia (Cth)', applies: 'To confirm',
      requirement: 'Report a ransomware or cyber extortion payment to the Australian Signals Directorate within 72 hours of making it (businesses above the turnover threshold, and critical infrastructure entities).',
      controls: ['A.5.24', 'A.5.26'] },
    { title: 'Spam Act 2003 (Cth)', type: 'Legislation', jurisdiction: 'Australia (Cth)', applies: 'To confirm',
      requirement: 'Commercial electronic messages need consent, must identify the sender and must include a working unsubscribe facility.',
      controls: ['A.5.31'] },
    { title: 'Corporations Act 2001 (Cth) s 286 — financial records', type: 'Legislation', jurisdiction: 'Australia (Cth)', applies: 'To confirm',
      requirement: 'Keep written financial records that explain transactions and financial position, and retain them for 7 years.',
      controls: ['A.5.33'] },
    { title: 'Fair Work Act 2009 (Cth) — employee records', type: 'Legislation', jurisdiction: 'Australia (Cth)', applies: 'To confirm',
      requirement: 'Keep prescribed employee records (pay, hours, leave) for 7 years, and protect them.',
      controls: ['A.5.33', 'A.6.1'] },
    { title: 'Copyright Act 1968 (Cth) and software licence terms', type: 'Legislation', jurisdiction: 'Australia (Cth)', applies: 'To confirm',
      requirement: 'Use software and third-party content only as licensed.',
      controls: ['A.5.32'] },
    { title: 'Security of Critical Infrastructure Act 2018 (Cth)', type: 'Legislation', jurisdiction: 'Australia (Cth)', applies: 'To confirm',
      requirement: 'Only if the organisation owns or operates a critical infrastructure asset: register the asset, report cyber incidents, and maintain a critical infrastructure risk management program.',
      controls: ['A.5.31', 'A.5.24'] },
    { title: 'State or territory health records and privacy law', type: 'Legislation', jurisdiction: 'State / territory', applies: 'To confirm',
      requirement: 'For example the Health Records Act 2001 (Vic) or the Health Records and Information Privacy Act 2002 (NSW), if health information is handled in that jurisdiction.',
      controls: ['A.5.34'] },
    { title: 'Customer contracts — security, confidentiality and breach notification clauses', type: 'Contract', jurisdiction: 'Contractual', applies: 'Yes',
      requirement: 'List the security obligations your customer agreements impose (for example certification, notification windows, data location, right to audit).',
      controls: ['A.5.20', 'A.5.31'] }
  ];
  var LEGAL_TYPES = ['Legislation', 'Regulation', 'Contract', 'Standard', 'Other'];
  var LEGAL_APPLIES = ['Yes', 'No', 'To confirm'];

  function legalRegisterSummary(reqs, today, reviewDays) {
    var list = reqs || [];
    var applying = list.filter(function (r) { return r.applies === 'Yes'; });
    var toConfirm = list.filter(function (r) { return r.applies === 'To confirm'; });
    var days = typeof reviewDays === 'number' ? reviewDays : 365;
    var stale = list.filter(function (r) {
      if (r.applies === 'No') return false;
      return !r.lastReviewed || (today && daysBetweenDateStr(String(r.lastReviewed).slice(0, 10), today) > days);
    });
    var noOwner = applying.filter(function (r) { return !String(r.owner || '').trim(); });
    return { total: list.length, applying: applying.length, toConfirm: toConfirm.length, stale: stale.length, noOwner: noOwner.length,
      ready: applying.length > 0 && toConfirm.length === 0 && noOwner.length === 0 };
  }

  /* ============================================================
     Statement of Applicability — justification for INCLUSION
     ------------------------------------------------------------
     ISO 27001 6.1.3 d) requires the SoA to state, for every control,
     the justification for including it as well as for excluding it.
     A SoA that only justifies exclusions is a common Stage 1 finding.
     The honest justification for an included control is traceable in
     Checkpoint already — the risks it treats, the legal or contractual
     requirements it meets, the posture checks that monitor it — so it
     is derived rather than typed. The Justification field is NOT used
     here: it holds the EXCLUSION reason and survives a control being
     toggled back to applicable, so reading it would cite a reason for
     leaving a control out as the reason for putting it in. To cite a
     specific reason, link the control to a risk or a requirement.
     ctx = { risks:[{id,title,controls,status}], obligations:[{id,title,controls,applies}],
             checkLabelsByControl: { code: [label] } } */
  function soaInclusionReasons(control, ctx) {
    ctx = ctx || {};
    if (!control || !control.app) return [];
    var code = control.id || control.code;
    var out = [];
    var risks = (ctx.risks || []).filter(function (r) { return r.status !== 'Closed' && (r.controls || []).indexOf(code) !== -1; });
    if (risks.length) out.push('Risk treatment: ' + risks.slice(0, 4).map(function (r) { return r.id; }).join(', ') + (risks.length > 4 ? ' +' + (risks.length - 4) : ''));
    var obs = (ctx.obligations || []).filter(function (o) { return o.applies === 'Yes' && (o.controls || []).indexOf(code) !== -1; });
    if (obs.length) out.push('Legal / contractual: ' + obs.slice(0, 3).map(function (o) { return o.id + ' ' + o.title.split(' — ')[0]; }).join('; '));
    var checks = (ctx.checkLabelsByControl || {})[code] || [];
    if (checks.length) out.push('Monitored by posture check: ' + checks.slice(0, 2).join('; ') + (checks.length > 2 ? ' +' + (checks.length - 2) : ''));
    if (!out.length) out.push('Baseline: adopted as good practice (ISO/IEC 27002) — no specific risk or requirement recorded yet');
    return out;
  }

  /* ============================================================
     Mandatory documented information — the Stage 1 checklist
     ------------------------------------------------------------
     What ISO/IEC 27001:2022 explicitly requires to exist as documented
     information (Clauses 4-10), plus the Annex A records an auditor
     samples first. Each item resolves from real data: an approved
     template, or the register that IS the record. Status 'done' means
     the evidence exists; 'partial' means it exists but is not yet in a
     state an auditor accepts (a draft, an unowned asset, a stale
     review); 'missing' means there is nothing to show.
     s = { docs:[{tplId,status}], soa:{applicable,notStarted,unjustified}, risks, objectives,
           training, audits, reviews, lastScanDate, actions, assets:{summary}, legal:{summary}, today } */
  var MANDATORY_DOCS = [
    { ref: '4.3', item: 'ISMS scope', tpl: 'isms-scope' },
    { ref: '4.2', item: 'Interested parties and their requirements', tpl: 'context-interested-parties' },
    { ref: '5.2', item: 'Information security policy', tpl: 'infosec-policy' },
    { ref: '5.3', item: 'Roles, responsibilities and authorities', tpl: 'roles-responsibilities' },
    { ref: '6.1.2', item: 'Risk assessment process', tpl: 'risk-management-framework' },
    { ref: '6.1.3', item: 'Risk treatment process', tpl: 'risk-management-framework' },
    { ref: '6.1.3 d)', item: 'Statement of Applicability', record: 'soa' },
    { ref: '6.1.3 e)', item: 'Risk treatment plan', record: 'rtp' },
    { ref: '6.2', item: 'Information security objectives', tpl: 'infosec-objectives-metrics', record: 'objectives' },
    { ref: '7.2', item: 'Evidence of competence', record: 'training' },
    { ref: '7.5', item: 'Control of documented information', tpl: 'document-control-procedure' },
    { ref: '8.2', item: 'Results of information security risk assessments', record: 'riskAssessment' },
    { ref: '8.3', item: 'Results of information security risk treatment', record: 'riskTreatment' },
    { ref: '9.1', item: 'Monitoring and measurement results', record: 'monitoring' },
    { ref: '9.2', item: 'Internal audit programme and results', tpl: 'internal-audit-procedure', record: 'audit' },
    { ref: '9.3', item: 'Management review results', tpl: 'management-review-procedure', record: 'review' },
    { ref: '10.2', item: 'Nonconformities and corrective actions', tpl: 'nonconformity-corrective-action' },
    { ref: 'A.5.9', item: 'Inventory of information and other associated assets', record: 'assets' },
    { ref: 'A.5.10', item: 'Acceptable use of information and assets', tpl: 'acceptable-use-policy' },
    { ref: 'A.5.15', item: 'Access control policy', tpl: 'access-control-policy' },
    { ref: 'A.5.19', item: 'Supplier security policy', tpl: 'supplier-security-policy' },
    { ref: 'A.5.24', item: 'Incident management plan', tpl: 'incident-response-plan' },
    { ref: 'A.5.29', item: 'Business continuity and ICT readiness plan', tpl: 'bcp-dr-plan' },
    { ref: 'A.5.31', item: 'Legal, statutory, regulatory and contractual requirements', tpl: 'legal-regulatory-policy', record: 'legal' }
  ];

  function mandatoryDocumentation(s) {
    s = s || {};
    var today = s.today;
    var byTpl = {};
    (s.docs || []).forEach(function (d) { if (d && d.tplId) byTpl[d.tplId] = d; });
    var within = function (d, days) { return d && today && daysBetweenDateStr(String(d).slice(0, 10), today) <= days; };
    var openRisks = (s.risks || []).filter(function (r) { return r.status !== 'Closed'; });
    function record(kind) {
      switch (kind) {
        case 'soa':
          if (!s.soa || !s.soa.applicable) return { st: 'missing', note: 'No applicable controls recorded' };
          if (s.soa.notStarted || s.soa.unjustified) return { st: 'partial', note: (s.soa.notStarted ? s.soa.notStarted + ' control(s) not started' : '') + (s.soa.notStarted && s.soa.unjustified ? '; ' : '') + (s.soa.unjustified ? s.soa.unjustified + ' exclusion(s) without a justification' : '') };
          return { st: 'done', note: s.soa.applicable + ' applicable controls, inclusions and exclusions justified' };
        case 'rtp':
          if (!openRisks.length) return { st: 'missing', note: 'No risks in the register' };
          var untreated = openRisks.filter(function (r) { return !(r.treat && r.owner); }).length;
          return untreated ? { st: 'partial', note: untreated + ' risk(s) without a treatment or owner' } : { st: 'done', note: 'Every open risk has a treatment and an owner (Risk treatment plan report)' };
        case 'objectives':
          return (s.objectives || []).some(function (o) { return o.metric && o.target; }) ? { st: 'done', note: 'Measurable objectives in the Objectives register' } : { st: 'missing', note: 'No measurable objective recorded' };
        case 'training':
          var done = (s.training || []).filter(function (t) { return t.status === 'Completed' || t.completedDate || t.completed; }).length;
          if (!(s.training || []).length) return { st: 'missing', note: 'No training assigned' };
          return done ? { st: 'done', note: done + ' completion record(s)' } : { st: 'partial', note: 'Training assigned, none completed yet' };
        case 'riskAssessment':
          if (!openRisks.length) return { st: 'missing', note: 'No risk assessment results' };
          var reviewed = openRisks.filter(function (r) { return within(r.lastReviewed, 365); }).length;
          return reviewed === openRisks.length ? { st: 'done', note: openRisks.length + ' risk(s), all reviewed in the last 12 months' } : { st: 'partial', note: (openRisks.length - reviewed) + ' of ' + openRisks.length + ' risk(s) not reviewed in the last 12 months' };
        case 'riskTreatment':
          var withActions = openRisks.filter(function (r) { return (r.actions || []).length || r.treat === 'Tolerate' || r.acceptedBy; }).length;
          if (!openRisks.length) return { st: 'missing', note: 'No risk treatment results' };
          return withActions === openRisks.length ? { st: 'done', note: 'Every open risk has actions or a recorded acceptance' } : { st: 'partial', note: (openRisks.length - withActions) + ' risk(s) with no action and no acceptance' };
        case 'monitoring':
          return within(s.lastScanDate, 90) ? { st: 'done', note: 'Posture scan within 90 days, plus objective progress' } : (s.lastScanDate ? { st: 'partial', note: 'Last posture scan more than 90 days ago' } : { st: 'missing', note: 'No monitoring results yet' });
        case 'audit':
          return (s.audits || []).some(function (a) { return a.status === 'Completed' && within(a.completed, 365); }) ? { st: 'done', note: 'Internal audit completed in the last 12 months' } : ((s.audits || []).length ? { st: 'partial', note: 'Audit planned, none completed in the last 12 months' } : { st: 'missing', note: 'No internal audit recorded' });
        case 'review':
          return (s.reviews || []).some(function (r) { return r.decisions && within(r.date, 365); }) ? { st: 'done', note: 'Management review with decisions in the last 12 months' } : { st: 'missing', note: 'No management review in the last 12 months' };
        case 'assets':
          var a = s.assets || {};
          if (!a.total) return { st: 'missing', note: 'Asset register is empty' };
          if (!a.information) return { st: 'partial', note: a.total + ' asset(s), but no information assets — a device list alone is not an A.5.9 inventory' };
          return a.noOwner ? { st: 'partial', note: a.noOwner + ' asset(s) without an owner' } : { st: 'done', note: a.total + ' asset(s), all owned' };
        case 'legal':
          var l = s.legal || {};
          if (!l.total) return { st: 'missing', note: 'Legal and regulatory register is empty' };
          if (l.toConfirm || l.noOwner) return { st: 'partial', note: (l.toConfirm ? l.toConfirm + ' requirement(s) still to confirm' : '') + (l.toConfirm && l.noOwner ? '; ' : '') + (l.noOwner ? l.noOwner + ' without an owner' : '') };
          return { st: 'done', note: l.applying + ' applicable requirement(s), all owned' };
      }
      return { st: 'missing', note: '' };
    }
    var rank = { missing: 0, partial: 1, done: 2 };
    return MANDATORY_DOCS.map(function (m) {
      var parts = [];
      if (m.tpl) {
        var d = byTpl[m.tpl];
        parts.push(!d ? { st: 'missing', note: 'Document not generated' } : d.status === 'Approved' ? { st: 'done', note: 'Approved document' } : { st: 'partial', note: 'Document in ' + (d.status || 'Draft') });
      }
      if (m.record) parts.push(record(m.record));
      /* An item is only as good as its weakest part: an approved audit
         procedure with no audit ever run is not done. */
      var worst = parts.reduce(function (w, p) { return rank[p.st] < rank[w.st] ? p : w; }, parts[0]);
      return { ref: m.ref, item: m.item, tpl: m.tpl || null, record: m.record || null, status: worst.st,
        note: parts.map(function (p) { return p.note; }).filter(Boolean).join('; ') };
    });
  }

  /* The guided path to certification — the ordered things a client has
     to do, from answering the scope questionnaire to booking the
     certification audit, each with its done-state derived from real
     register data (never a tick-box someone sets). Rendered by
     renderGettingStarted() in app.js, which also maps each step id to
     the action that does it. `s` is a plain snapshot:
       { entitled:[fw], scopeStatement, scans, docs:[{tplId,status}],
         pathTemplates:[tplId], risks, appControls:[{st}], objectives,
         training, vendors, aiSystems, audits, reviews, clauses:[{st}],
         calendar, today }
     Returns [{ id, phase, label, why, done, detail }] in order. */
  function certificationPathSteps(s) {
    s = s || {};
    var today = s.today;
    var docs = s.docs || [];
    var byTpl = {};
    docs.forEach(function (d) { if (d && d.tplId) byTpl[d.tplId] = d; });
    var tpls = s.pathTemplates || [];
    var generated = tpls.filter(function (id) { return byTpl[id]; });
    var approved = generated.filter(function (id) { return byTpl[id].status === 'Approved'; });
    var openRisks = (s.risks || []).filter(function (r) { return r.status !== 'Closed'; });
    var notStarted = (s.appControls || []).filter(function (c) { return c.st === 'Not started'; }).length;
    var within = function (d) { return d && today && daysBetweenDateStr(String(d).slice(0, 10), today) <= 365; };
    var auditDone = (s.audits || []).some(function (a) { return a.status === 'Completed' && within(a.completed); });
    var reviewDone = (s.reviews || []).some(function (r) { return r.decisions && within(r.date); });
    var openClauses = (s.clauses || []).filter(function (c) { return c.st !== 'Implemented'; }).length;
    var ai = s.aiSystems || [];
    var booked = !!s.certified || (s.calendar || []).some(function (c) { return /certif|external audit|stage 1|stage 2/i.test((c.title || '') + ' ' + (c.category || '')); });

    var steps = [
      { id: 'scope', phase: 'Set up', label: 'Answer the scope & context questionnaire',
        why: 'Ten plain-English questions about the organisation. The answers write the ISMS scope and the Clause 4 context for you.',
        done: !!s.scopeStatement },
      { id: 'scan', phase: 'Set up', label: 'Run the first posture scan',
        why: 'Checks the Microsoft 365 tenant automatically and proposes the first risks and control statuses.',
        done: (s.scans || 0) > 0 },
      { id: 'docs', phase: 'Document', label: 'Generate the policies and procedures',
        why: 'One click drafts every document the frameworks need, linked to the clauses and controls they evidence.',
        done: tpls.length > 0 && generated.length === tpls.length,
        detail: tpls.length ? generated.length + ' of ' + tpls.length + ' generated' : '' },
      { id: 'approve', phase: 'Document', label: 'Approve the document set',
        why: 'Management reviews and approves the drafts in one sitting. An approved document is what counts as evidence.',
        done: tpls.length > 0 && approved.length === tpls.length,
        detail: generated.length ? approved.length + ' of ' + tpls.length + ' approved' : '' },
      { id: 'risks', phase: 'Assess', label: 'Review and treat the risks',
        why: 'Approve the risks the scan proposed, add any it could not see, and record how each will be treated.',
        done: openRisks.length > 0 && openRisks.every(function (r) { return r.treat && r.owner; }),
        detail: openRisks.length ? openRisks.filter(function (r) { return !(r.treat && r.owner); }).length + ' without a treatment or owner' : '' },
      { id: 'soa', phase: 'Assess', label: 'Complete the Statement of Applicability',
        why: 'Every applicable control gets a status. It is the document the certification auditor works from.',
        done: (s.appControls || []).length > 0 && notStarted === 0,
        detail: notStarted ? notStarted + ' control' + (notStarted === 1 ? '' : 's') + ' not started' : '' },
      { id: 'objectives', phase: 'Operate', label: 'Set security objectives',
        why: 'At least one measurable objective with a target and an owner (Clause 6.2).',
        done: (s.objectives || []).some(function (o) { return o.metric && o.target; }) },
      { id: 'training', phase: 'Operate', label: 'Assign security awareness training',
        why: 'Every person completes awareness training — Checkpoint tracks completion (Clause 7.3).',
        done: (s.training || []).length > 0 },
      { id: 'suppliers', phase: 'Operate', label: 'Record the key suppliers',
        why: 'The suppliers that hold or can reach the organisation’s information, so their security can be reviewed.',
        done: (s.vendors || []).length > 0 }
    ];
    /* ISO 27001 only: the two registers an auditor samples first
       (A.5.9, A.5.31) and the Stage 1 documented-information checklist. */
    var iso = (s.entitled || []).indexOf('iso27001') !== -1;
    if (iso) {
      var as = s.assets || {}, lg = s.legal || {};
      /* Before risk treatment: the risk assessment draws on both. */
      steps.splice(steps.findIndex(function (x) { return x.id === 'risks'; }), 0,
        { id: 'assets', phase: 'Assess', label: 'Build the asset register',
          why: 'Sync devices, applications and sites from Microsoft 365, then add the information assets themselves, each with an owner (A.5.9).',
          done: !!as.ready,
          detail: as.total ? (!as.information ? 'no information assets yet' : as.noOwner ? as.noOwner + ' without an owner' : '') : '' },
        { id: 'legal', phase: 'Assess', label: 'Record legal and contractual requirements',
          why: 'Which laws, regulations and customer contracts apply, who owns each, and the controls they drive (A.5.31, Clause 4.2).',
          done: !!lg.ready,
          detail: lg.total ? (lg.toConfirm ? lg.toConfirm + ' still to confirm' : lg.noOwner ? lg.noOwner + ' without an owner' : '') : '' });
    }
    if ((s.entitled || []).indexOf('iso42001') !== -1) {
      steps.push({ id: 'ai', phase: 'Operate', label: 'Register AI systems and assess their impact',
        why: 'Each AI system in use, with a completed impact assessment (ISO 42001 6.1.4).',
        done: ai.length > 0 && ai.every(function (a) { return a.impactAssessmentStatus === 'Completed'; }),
        detail: ai.length ? ai.filter(function (a) { return a.impactAssessmentStatus !== 'Completed'; }).length + ' assessment(s) outstanding' : '' });
    }
    steps.push(
      { id: 'audit', phase: 'Check', label: 'Run an internal audit',
        why: 'An independent check that the management system works, completed within the last year (Clause 9.2).',
        done: auditDone },
      { id: 'review', phase: 'Check', label: 'Hold a management review',
        why: 'Leadership reviews the results and records decisions (Clause 9.3). Checkpoint builds the pack.',
        done: reviewDone },
      { id: 'clauses', phase: 'Certify', label: 'Close the remaining clause gaps',
        why: 'Most clauses complete themselves as the steps above are done — this shows what is left.',
        done: (s.clauses || []).length > 0 && openClauses === 0,
        detail: openClauses ? openClauses + ' clause' + (openClauses === 1 ? '' : 's') + ' still open' : '' },
      { id: 'mandatory', phase: 'Certify', label: 'Complete the mandatory documented information',
        why: 'Every document and record ISO 27001 itself requires, checked against your registers — the first thing a Stage 1 auditor asks for.',
        done: !!(s.mandatory && s.mandatory.length && s.mandatory.every(function (m) { return m.status === 'done'; })),
        detail: s.mandatory ? s.mandatory.filter(function (m) { return m.status !== 'done'; }).length + ' of ' + s.mandatory.length + ' not yet in place' : '' },
      { id: 'book', phase: 'Certify', label: 'Book the certification audit',
        why: 'Add the certification body’s Stage 1 and Stage 2 dates to the compliance calendar.',
        done: booked }
    );
    return iso ? steps : steps.filter(function (x) { return x.id !== 'mandatory'; });
  }

  /* ── Certification lifecycle ─────────────────────────────────────
     An ISO certificate runs a three-year cycle: surveillance audits in
     years one and two, then a recertification audit that must be
     completed before the certificate expires. ISO/IEC 17021-1 requires
     the first surveillance audit within 12 months of the certification
     decision and at least one surveillance audit in each calendar year;
     "within 12 / 24 months of issue" and "before expiry" are the dates
     a certification body works to in practice, so they are what is
     shown. The body's own dates always win: a recorded audit date
     replaces the computed one. */
  function addMonthsIso(iso, months) {
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(d)) return '';
    var day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d.toISOString().slice(0, 10);
  }

  /* cert = { fw, body, number, scope, issued, expires,
              audits: { s1: { date, result }, s2: {...}, recert: {...} } }
     Returns { milestones: [{ key, label, dueBy, done, doneDate, result,
     state, days }], next, expiresDays, cycleStart }. state is 'done',
     'overdue', 'due-soon' (within 90 days) or 'upcoming'. */
  function certificationCycle(cert, today) {
    var c = cert || {};
    var issued = c.issued || '';
    var expires = c.expires || (issued ? addMonthsIso(issued, 36) : '');
    var audits = c.audits || {};
    var defs = [
      { key: 's1', label: 'Surveillance audit 1', dueBy: issued ? addMonthsIso(issued, 12) : '' },
      { key: 's2', label: 'Surveillance audit 2', dueBy: issued ? addMonthsIso(issued, 24) : '' },
      { key: 'recert', label: 'Recertification audit', dueBy: expires }
    ];
    var milestones = defs.map(function (m) {
      var rec = audits[m.key] || {};
      var done = !!rec.date;
      var days = m.dueBy && today ? daysBetweenDateStr(today, m.dueBy) : null;
      var state = done ? 'done' : (days === null ? 'upcoming' : days < 0 ? 'overdue' : days <= 90 ? 'due-soon' : 'upcoming');
      return { key: m.key, label: m.label, dueBy: m.dueBy, done: done, doneDate: rec.date || '', result: rec.result || '', state: state, days: days };
    });
    return {
      milestones: milestones,
      next: milestones.filter(function (m) { return !m.done; })[0] || null,
      expires: expires,
      expiresDays: expires && today ? daysBetweenDateStr(today, expires) : null,
      cycleStart: issued
    };
  }

  /* Which management-system clauses (4-10) and Annex A themes (A.5-A.8)
     the COMPLETED internal audits since `since` covered, read from each
     audit's own scope text — the Audits register has no structured
     coverage field, and scopes are written like "Clauses 4-10" or
     "Access control (Annex A.5, A.8)". Recognised: "Clause 9",
     "Clauses 4-6" / "4 to 6", "A.5" / "A.5.15" (its theme), "Annex A"
     with no theme (all four), and "full ISMS" / "all clauses" (all
     clauses). Anything else is ignored rather than guessed at, so
     coverage is never overstated. Returns { clauses:{n:bool},
     themes:{t:bool}, missing:[labels], pct }. */
  var COVERAGE_CLAUSES = ['4', '5', '6', '7', '8', '9', '10'];
  var COVERAGE_THEMES = ['A.5', 'A.6', 'A.7', 'A.8'];
  /* What an internal audit's free-text scope covers, in the forms the
     programme writes and people naturally type: "Clauses 4-10",
     "clause 9", "Annex A.5 and A.8", "full ISMS", or a bare "Annex A"
     meaning every theme. Wording it can't read covers nothing, so
     coverage is never overstated. */
  function parseAuditScope(scope) {
    var text = String(scope || ''), clauses = {}, themes = {};
    if (/\b(full|entire|whole)\s+(isms|aims|management system)\b|\ball clauses\b/i.test(text)) {
      COVERAGE_CLAUSES.forEach(function (n) { clauses[n] = true; });
    }
    var re = /\bclauses?\s+(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?/gi, m;
    while ((m = re.exec(text))) {
      var from = parseInt(m[1], 10), to = m[2] ? parseInt(m[2], 10) : from;
      for (var n = from; n <= to; n++) if (COVERAGE_CLAUSES.indexOf(String(n)) !== -1) clauses[String(n)] = true;
    }
    var themeRe = /\bA\.(5|6|7|8)\b/g, t, anyTheme = false;
    while ((t = themeRe.exec(text))) { themes['A.' + t[1]] = true; anyTheme = true; }
    var allControls = /\bannex a\b|\ball controls\b/i.test(text);
    if (!anyTheme && allControls) COVERAGE_THEMES.forEach(function (x) { themes[x] = true; });
    return {
      clauses: COVERAGE_CLAUSES.filter(function (n) { return clauses[n]; }),
      themes: COVERAGE_THEMES.filter(function (x) { return themes[x]; }),
      allControls: allControls && !anyTheme
    };
  }

  function internalAuditCoverage(audits, fw, since) {
    var clauses = {}, themes = {};
    COVERAGE_CLAUSES.forEach(function (n) { clauses[n] = false; });
    COVERAGE_THEMES.forEach(function (t) { themes[t] = false; });
    (audits || []).forEach(function (a) {
      if (!a || a.status !== 'Completed' || !a.completed) return;
      if (since && a.completed < since) return;
      if (fw && a.fw && a.fw !== fw) return;
      var sc = parseAuditScope(a.scope);
      sc.clauses.forEach(function (n) { clauses[n] = true; });
      sc.themes.forEach(function (x) { themes[x] = true; });
    });
    var missing = COVERAGE_CLAUSES.filter(function (n) { return !clauses[n]; }).map(function (n) { return 'Clause ' + n; })
      .concat(COVERAGE_THEMES.filter(function (x) { return !themes[x]; }).map(function (x) { return 'Annex ' + x; }));
    var total = COVERAGE_CLAUSES.length + COVERAGE_THEMES.length;
    return { clauses: clauses, themes: themes, missing: missing, pct: Math.round((total - missing.length) / total * 100) };
  }

  /* What an internal auditor examines under each management-system
     clause. ISO 27001 and ISO 42001 share the Harmonized Structure, so
     one set of prompts serves both; "the management system" covers the
     ISMS and the AIMS alike. */
  var CLAUSE_AUDIT_PROMPTS = {
    '4': 'Is the scope documented with its boundaries and interfaces? Are internal and external issues and interested parties\u2019 requirements recorded, and reviewed since the last audit?',
    '5': 'Is top management visibly directing the management system (management review minutes, resourcing decisions)? Is the policy approved, current and communicated? Are roles assigned and understood?',
    '6': 'Does the risk assessment follow the documented method and reflect current risks? Do risk owners approve treatment plans and residual risk? Is the Statement of Applicability consistent with the treatment plan? Are objectives measurable and tracked?',
    '7': 'Are competence records held for people in key roles? Are staff aware of the policy and their responsibilities? Is documented information approved, versioned and reviewed on schedule?',
    '8': 'Are risk assessments repeated at planned intervals and on significant change? Is the treatment plan being delivered on time? Are outsourced processes controlled?',
    '9': 'Are monitoring and measurement results recorded and analysed? Is the internal audit programme running as planned? Does the latest management review cover every required input and record decisions?',
    '10': 'Do nonconformities have a recorded root cause, a corrective action and an effectiveness check? Is there evidence of continual improvement since the last audit?'
  };

  /* A pre-filled internal audit checklist for one audit: every clause
     and control its scope covers, the evidence already linked in
     Checkpoint, and what an auditor should look at first. The auditor
     still does the audit; this removes the preparation. */
  function auditWorkpack(audit, data, today) {
    var a = audit || {}, d = data || {};
    var fw = a.fw || 'iso27001';
    var clauseFw = fw === 'iso27701' ? 'iso27001' : fw;
    var scope = parseAuditScope(a.scope);
    var yearAgo = addMonthsIso(today, -12);
    var cadence = d.cadenceDays;
    /* Clause 9.2.2: auditors must not audit their own work. */
    var auditor = String(a.auditor || '').trim().toLowerCase();
    var ownsIt = function (row) { return !!auditor && auditor !== 'unassigned' && String(row.own || '').trim().toLowerCase() === auditor; };
    var OWN_WORK = 'Auditor owns this \u2014 needs another auditor';
    var openActions = (d.actions || []).filter(function (x) { return x && x.status !== 'Done' && x.status !== 'Closed' && x.status !== 'Cancelled'; });

    var clauses = (d.clauses || []).filter(function (c) {
      return c.fw === clauseFw && scope.clauses.indexOf(String(c.id).split('.')[0]) !== -1;
    }).map(function (c) {
      var flags = [];
      if (c.st !== 'Implemented') flags.push('Not implemented');
      if (!c.evidenceUrl) flags.push('No evidence linked');
      else if (c.verified && c.verified < yearAgo) flags.push('Evidence not re-verified in 12 months');
      if (ownsIt(c)) flags.push(OWN_WORK);
      return { id: c.id, title: c.t, status: c.st, owner: c.own || '', evidenceUrl: c.evidenceUrl || '', verified: c.verified || '', flags: flags };
    });

    var inScope = function (c) {
      if (!c.app) return false;
      if (scope.allControls) return true;
      if (fw !== 'iso27001' && fw !== 'iso27701') return false;
      return scope.themes.some(function (t) { return String(c.id).indexOf(t + '.') === 0; });
    };
    var highRiskControls = {};
    (d.risks || []).forEach(function (r) {
      if (!r || r.status === 'Closed') return;
      var q = residual({ L: r.L, I: r.I, resL: r.resL, resI: r.resI, actions: r.actions || [] }, d.actions || []);
      if (q.L * q.I < 10) return;
      (r.controls || []).forEach(function (id) { highRiskControls[id] = true; });
    });
    var controls = (d.controls || []).filter(function (c) { return c.fw === fw && inScope(c); }).map(function (c) {
      var flags = [];
      if (c.st !== 'Implemented') flags.push('Not implemented');
      if (!c.evidenceUrl) flags.push('No evidence linked');
      var rv = controlReviewStatus(c, today, cadence);
      if (c.st === 'Implemented' && rv.due) flags.push(rv.neverVerified ? 'Never verified' : 'Verification overdue');
      if (highRiskControls[c.id]) flags.push('Treats a high risk');
      var acts = openActions.filter(function (x) { return x.control === c.id; }).map(function (x) { return x.id; });
      if (acts.length) flags.push('Open action ' + acts.join(', '));
      if (ownsIt(c)) flags.push(OWN_WORK);
      return { id: c.id, title: c.t, status: c.st, owner: c.own || '', evidenceUrl: c.evidenceUrl || '', verified: c.verified || '', flags: flags, priority: flags.length > 0 };
    });
    controls.sort(function (x, y) { return (y.priority ? 1 : 0) - (x.priority ? 1 : 0); });

    var followUps = (d.actions || []).filter(function (x) {
      return x && (x.src === 'Internal audit' || /^Certification audit/.test(x.src || '')) && x.status !== 'Done' && x.status !== 'Closed' && x.status !== 'Cancelled';
    }).map(function (x) { return { id: x.id, title: x.title, type: x.type || 'Action', due: x.due || '', src: x.src }; });

    var previous = (d.audits || []).filter(function (x) {
      return x && x.id !== a.id && x.status === 'Completed' && (x.fw === fw || (clauseFw === 'iso27001' && x.fw === 'iso27001'));
    }).sort(function (x, y) { return String(y.completed || '').localeCompare(String(x.completed || '')); })[0] || null;

    return {
      scope: scope,
      prompts: scope.clauses.map(function (n) { return { clause: n, prompt: CLAUSE_AUDIT_PROMPTS[n] }; }),
      clauses: clauses,
      controls: controls,
      followUps: followUps,
      previous: previous ? { id: previous.id, completed: previous.completed, summary: previous.summary || '', scope: previous.scope } : null,
      readable: scope.clauses.length > 0 || scope.themes.length > 0 || scope.allControls
    };
  }

  /* A three-year internal audit programme that covers everything before
     recertification: the management-system clauses every year (the
     Internal Audit Procedure template commits to that), and one or two
     Annex A themes each year so all four are covered once per cycle.
     Scopes are written in the exact form internalAuditCoverage() reads.
     Dates sit two months before each certification body audit, so
     findings can be closed first. */
  function internalAuditProgramme(cert) {
    var issued = (cert && cert.issued) || '';
    if (!issued) return [];
    var plan = [
      { year: 1, theme: 'Annex A.5 (organisational controls)', before: 12 },
      { year: 2, theme: 'Annex A.6 and A.7 (people and physical controls)', before: 24 },
      { year: 3, theme: 'Annex A.8 (technological controls)', before: 33 }
    ];
    var out = [];
    plan.forEach(function (p) {
      var planned = addMonthsIso(issued, p.before - 2);
      out.push({ year: p.year, planned: planned, scope: 'Clauses 4-10 (management system), year ' + p.year + ' of the certification cycle' });
      out.push({ year: p.year, planned: planned, scope: p.theme + ', year ' + p.year + ' of the certification cycle' });
    });
    return out;
  }

  return {
    normaliseDateInput: normaliseDateInput,
    band: band, residual: residual, residualAcceptanceStale: residualAcceptanceStale, checkResult: checkResult, activeDisposition: activeDisposition, score: score, incidentTriageResult: incidentTriageResult, alertTriageResult: alertTriageResult, deviceCheckinResult: deviceCheckinResult, leaverHygieneResult: leaverHygieneResult, caDeviceComplianceResult: caDeviceComplianceResult, caRiskBasedResult: caRiskBasedResult, caSignInFrequencyResult: caSignInFrequencyResult, caTermsOfUseResult: caTermsOfUseResult, caCloudAppSecurityResult: caCloudAppSecurityResult, oauthConsentRiskResult: oauthConsentRiskResult, describeServicePrincipal: describeServicePrincipal, lifecycleWorkflowsResult: lifecycleWorkflowsResult, subjectRightsResult: subjectRightsResult, retentionLabelResult: retentionLabelResult, tvmExposureResult: tvmExposureResult, edrCoverageResult: edrCoverageResult, attackSimulationResult: attackSimulationResult, labelProtectionResult: labelProtectionResult, QUESTION_TOPICS: QUESTION_TOPICS, matchQuestionTopics: matchQuestionTopics, questionSimilarity: questionSimilarity, parseQuestionnaireInput: parseQuestionnaireInput, assessQuestion: assessQuestion, ASSET_TYPES: ASSET_TYPES, ASSET_CLASSIFICATIONS: ASSET_CLASSIFICATIONS, mergeDiscoveredAssets: mergeDiscoveredAssets, assetRegisterSummary: assetRegisterSummary, LEGAL_BASELINE_AU: LEGAL_BASELINE_AU, LEGAL_TYPES: LEGAL_TYPES, LEGAL_APPLIES: LEGAL_APPLIES, legalRegisterSummary: legalRegisterSummary, soaInclusionReasons: soaInclusionReasons, MANDATORY_DOCS: MANDATORY_DOCS, mandatoryDocumentation: mandatoryDocumentation, readinessPct: readinessPct,
    suggestVendorCriticality: suggestVendorCriticality, parseMapTokens: parseMapTokens,
    sharedEvidenceClosure: sharedEvidenceClosure, crossFrameworkStatusSuggestions: crossFrameworkStatusSuggestions,
    controlsForCheck: controlsForCheck, operatingEffectiveness: operatingEffectiveness,
    scanResultsChanged: scanResultsChanged, scanDrift: scanDrift,
    legacyAuthObservedResult: legacyAuthObservedResult, privRoleChangeResult: privRoleChangeResult,
    deviceEncryptionResult: deviceEncryptionResult, jailbrokenDeviceResult: jailbrokenDeviceResult,
    dormantAccountResult: dormantAccountResult, mfaRegistrationResult: mfaRegistrationResult,
    PRIV_ROLE_ACTIVITY_EXCLUDE: PRIV_ROLE_ACTIVITY_EXCLUDE,
    constellationTheme: constellationTheme, constellationEdges: constellationEdges, constellationTableRows: constellationTableRows,
    fingerprintFromRows: fingerprintFromRows, remediationVelocityProjection: remediationVelocityProjection,
    weeklyActivityGrid: weeklyActivityGrid, riskBubblePoint: riskBubblePoint, riskBubbleLayout: riskBubbleLayout,
    relLuminance: relLuminance, contrastRatio: contrastRatio, compositeOverBg: compositeOverBg, pickReadableRgb: pickReadableRgb,
    mulberry32: mulberry32, portfolioSeed: portfolioSeed, POISSON_LAMBDA_CAP: POISSON_LAMBDA_CAP, sampleTriangular: sampleTriangular, samplePoisson: samplePoisson,
    riskFinancialInputs: riskFinancialInputs, simulateRiskLosses: simulateRiskLosses,
    simulatePortfolioLosses: simulatePortfolioLosses, summarizeLossDistribution: summarizeLossDistribution,
    lossExceedanceCurve: lossExceedanceCurve, RISK_FINANCIAL_BANDS: RISK_FINANCIAL_BANDS,
    toCsv: toCsv, buildZip: buildZip, buildPolicyDocx: buildPolicyDocx,
    canonicalJson: canonicalJson, base64ToBytes: base64ToBytes, bytesToBase64: bytesToBase64,
    verifyEntitlementSignature: verifyEntitlementSignature, signEntitlementPayload: signEntitlementPayload,
    evaluateEntitlement: evaluateEntitlement, reconcileActivationSources: reconcileActivationSources, addDaysToDateStr: addDaysToDateStr,
    latestEntitlementsByTenant: latestEntitlementsByTenant, computePartnerRevenue: computePartnerRevenue,
    entitlementAnnualValue: entitlementAnnualValue, computePaymentStatus: computePaymentStatus,
    computeNextBestModule: computeNextBestModule, computeClientHealth: computeClientHealth,
    rankUpsellOpportunities: rankUpsellOpportunities,
    syncAllQueue: syncAllQueue, syncAllSummary: syncAllSummary,
    daysBetweenDateStr: daysBetweenDateStr, normalizeEntitlementType: normalizeEntitlementType,
    addMonthsToDateStr: addMonthsToDateStr, isValidTenantIdentifier: isValidTenantIdentifier,
    findDuplicateTenantClient: findDuplicateTenantClient, buildClientIssuancePlan: buildClientIssuancePlan,
    computeClientChecklist: computeClientChecklist, controlReviewStatus: controlReviewStatus,
    riskReviewStatus: riskReviewStatus,
    buildAdminConsentUrl: buildAdminConsentUrl,
    documentReviewState: documentReviewState, documentRegisterSummary: documentRegisterSummary,
    attestationCampaigns: attestationCampaigns, outstandingAttestationsFor: outstandingAttestationsFor,
    attestationFocusRows: attestationFocusRows, attestationSummary: attestationSummary,
    trainingCheckResult: trainingCheckResult, usersMissingInduction: usersMissingInduction,
    segregationOfDutiesResult: segregationOfDutiesResult,
    recurringActivityState: recurringActivityState, backupCheckResult: backupCheckResult,
    bcpCheckResult: bcpCheckResult, supplierCheckResult: supplierCheckResult, policyCheckResult: policyCheckResult,
    independentReviewResult: independentReviewResult, incidentLessonsResult: incidentLessonsResult,
    objectivesCheckResult: objectivesCheckResult,
    capaStatus: capaStatus, MR_INPUT_SECTIONS: MR_INPUT_SECTIONS,
    nextBestActions: nextBestActions, controlToCheckIds: controlToCheckIds, overdueDaysOf: overdueDaysOf,
    MONITOR_APP_PERMISSIONS: MONITOR_APP_PERMISSIONS, monitorGrantSnippet: monitorGrantSnippet,
    resolvableFindings: resolvableFindings,
    isRetryableGraphStatus: isRetryableGraphStatus, graphRetryDelayMs: graphRetryDelayMs,
    parseReviewInputs: parseReviewInputs, serializeReviewInputs: serializeReviewInputs,
    isDevBypassActive: isDevBypassActive,
    controlAssurance: controlAssurance, assuranceSummary: assuranceSummary,
    evaluateSegregation: evaluateSegregation,
    parseCsv: parseCsv, normaliseHeader: normaliseHeader, planCsvImport: planCsvImport,
    sha256Hex: sha256Hex, canonicalAuditEntry: canonicalAuditEntry, auditEntryHash: auditEntryHash, verifyAuditChain: verifyAuditChain,
    encryptPack: encryptPack, decryptPack: decryptPack, validatePackShape: validatePackShape,
    incidentAssessmentState: incidentAssessmentState, incidentRegisterSummary: incidentRegisterSummary,
    classifyAiActRisk: classifyAiActRisk, AI_ACT_QUESTIONS: AI_ACT_QUESTIONS,
    VENDOR_QUESTIONNAIRE: VENDOR_QUESTIONNAIRE, VENDOR_QUESTIONNAIRE_SECTIONS: VENDOR_QUESTIONNAIRE_SECTIONS, vendorAiActAnswers: vendorAiActAnswers,
    threatIntelRelevance: threatIntelRelevance, rankThreatIntelItems: rankThreatIntelItems,
    threatIntelMatchSummary: threatIntelMatchSummary,
    soaFocusRows: soaFocusRows, soaFocusLabel: soaFocusLabel,
    trainingFocusRows: trainingFocusRows, trainingSummary: trainingSummary,
    documentFocusRows: documentFocusRows, documentFocusLabel: documentFocusLabel,
    dedupeAudience: dedupeAudience,
    THREAT_INTEL_INDUSTRY_TAGS: THREAT_INTEL_INDUSTRY_TAGS,
    buildOrgContextDraft: buildOrgContextDraft, buildAimsContextDraft: buildAimsContextDraft,
    clauseUpdatesForDocument: clauseUpdatesForDocument,
    parseAuditScope: parseAuditScope, auditWorkpack: auditWorkpack, CLAUSE_AUDIT_PROMPTS: CLAUSE_AUDIT_PROMPTS,
    clauseOperatingEvidence: clauseOperatingEvidence, clauseAutomationUpdates: clauseAutomationUpdates,
    createWriteGuard: createWriteGuard, certificationPathSteps: certificationPathSteps,
    addMonthsIso: addMonthsIso, certificationCycle: certificationCycle, internalAuditCoverage: internalAuditCoverage, internalAuditProgramme: internalAuditProgramme
  };
});
