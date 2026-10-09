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
  /* Which parts of an ISO/IEC 27005:2022 risk scenario a risk has not
     recorded yet. A scenario can be asset-based (the assets, the threat
     and the vulnerability it exploits) or event-based (the risk source
     and the consequence); 27005 accepts either, so a risk is complete
     with a threat or risk source, a consequence, and either assets or a
     vulnerability. Returns the missing parts in plain words. */
  function riskScenarioGaps(r) {
    r = r || {};
    var has = function (v) { return !!String(v || '').trim(); };
    var out = [];
    if (!has(r.threat)) out.push('threat or risk source');
    if (!has(r.consequence)) out.push('consequence');
    if (!(r.assetRefs || []).length && !has(r.vulnerability)) out.push('assets affected or vulnerability');
    if (!(r.cia || []).length) out.push('confidentiality, integrity or availability it threatens');
    return out;
  }

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
  /* The ISMS operating rhythm: the recurring activities whose records an
     auditor samples to see that Annex A controls are operating, not just
     documented. Each becomes a compliance-calendar item carrying a
     [rhythm:key] marker in its notes; completing one with evidence
     links that evidence to the controls listed here and records the
     verification (rhythmCompletionUpdates). Categories reuse the
     calendar's own, so the existing backup and BCP checks
     (recurringActivityState) read these items too. firstDueDays
     staggers the first round so it does not all land in one week. */
  var OPERATING_RHYTHM = [
    { key: 'access-review', title: 'Access review: user, guest and admin accounts', category: 'Access control review', freq: 'Quarterly', firstDueDays: 30,
      controls: ['A.5.15', 'A.5.18', 'A.8.2'],
      evidence: 'An export of users, guests and admin role holders (Entra ID), each account confirmed or removed, signed off by the reviewer.' },
    { key: 'log-review', title: 'Security log and alert review', category: 'Log and alert review', freq: 'Monthly', firstDueDays: 14,
      controls: ['A.8.15', 'A.8.16'],
      evidence: 'The month’s risky sign-ins, Defender alerts and audit-log anomalies reviewed, with anything notable raised as an incident or action.' },
    { key: 'vuln-review', title: 'Vulnerability and patch review', category: 'Vulnerability review', freq: 'Monthly', firstDueDays: 21,
      controls: ['A.8.7', 'A.8.8'],
      evidence: 'The Defender exposure or vulnerability report and device update compliance, with overdue critical items actioned.' },
    { key: 'threat-intel', title: 'Threat intelligence review', category: 'Threat intelligence review', freq: 'Quarterly', firstDueDays: 45,
      controls: ['A.5.6', 'A.5.7'],
      evidence: 'A summary of the quarter’s advisories (ACSC, Microsoft, key suppliers) and the actions raised from them, and the special interest group memberships confirmed current.' },
    { key: 'backup-restore', title: 'Backup restore test', category: 'Backup restore test', freq: 'Biannual', firstDueDays: 45,
      controls: ['A.8.13'],
      evidence: 'A record of data restored from backup: what was restored, when, how long it took, and that it was intact.' },
    { key: 'asset-review', title: 'Asset register review', category: 'Asset register review', freq: 'Biannual', firstDueDays: 60,
      controls: ['A.5.9', 'A.5.11'],
      evidence: 'The asset register checked against Intune and Entra, owners confirmed, and leavers’ devices returned.' },
    { key: 'supplier-review', title: 'Supplier security review', category: 'Supplier security review', freq: 'Annual', firstDueDays: 60,
      controls: ['A.5.19', 'A.5.22'],
      evidence: 'For each critical supplier: its certification or assurance report reviewed, contract security terms checked, and subprocessor changes noted.' },
    { key: 'awareness', title: 'Security awareness training refresher', category: 'Security awareness training', freq: 'Annual', firstDueDays: 30,
      controls: ['A.6.3'],
      evidence: 'Completion records for everyone in scope, from Checkpoint’s Training register.' },
    { key: 'ir-exercise', title: 'Incident response exercise', category: 'Incident response exercise', freq: 'Annual', firstDueDays: 75,
      controls: ['A.5.24', 'A.5.26', 'A.5.27'],
      evidence: 'The tabletop exercise record: scenario, who took part, decisions made, and lessons learned fed back into the plan.' },
    { key: 'bcp-test', title: 'Business continuity and disaster recovery test', category: 'BCP/DR test', freq: 'Annual', firstDueDays: 90,
      controls: ['A.5.29', 'A.5.30'],
      evidence: 'The exercise record: scenario, who took part, recovery times achieved against the targets, and actions raised.' },
    { key: 'legal-review', title: 'Legal and contractual requirements review', category: 'Legal register review', freq: 'Annual', firstDueDays: 90,
      controls: ['A.5.31'],
      evidence: 'The legal register reviewed: new laws and contract obligations added, owners confirmed.' }
  ];

  function rhythmKeyOf(cal) {
    var m = /\[rhythm:([a-z0-9-]+)\]/.exec((cal && cal.notes) || '');
    return m ? m[1] : '';
  }
  /* Compliance calendar statuses. Active is still being done; Completed
     (stored as 'Done', the value one-off items have always used),
     Closed and Retired are not, so they drop out of everything that
     counts what is due. */
  var CALENDAR_STATUSES = [{ value: 'Active', label: 'Active' }, { value: 'Done', label: 'Completed' }, { value: 'Closed', label: 'Closed' }, { value: 'Retired', label: 'Retired (no longer done)' }];
  function calendarItemLive(c) {
    return !!c && ['Done', 'Closed', 'Retired', 'Inactive'].indexOf(c.status) === -1;
  }
  function rhythmDef(key) {
    return OPERATING_RHYTHM.find(function (r) { return r.key === key; }) || null;
  }
  /* The rhythm activity a calendar item performs: by its marker, or,
     for an item someone added by hand, by its category. Either way its
     completion captures evidence for the same controls. */
  function rhythmDefFor(cal) {
    return rhythmDef(rhythmKeyOf(cal)) || OPERATING_RHYTHM.find(function (r) { return cal && r.category === cal.category; }) || null;
  }
  /* Notes without the marker or the stored evidence line, for display. */
  function rhythmNotesText(notes) {
    return String(notes || '').replace(/\[rhythm:[a-z0-9-]+\]\s*/g, '').replace(/(^|\s)Last evidence: \S+( \(\d{4}-\d{2}-\d{2}\))?/g, '').trim();
  }
  function rhythmLastEvidence(notes) {
    var m = /Last evidence: (\S+)/.exec(String(notes || ''));
    return m ? m[1] : '';
  }

  /* Frequencies the documents state, each read from where the
     organisation actually sets it, so a document says what the
     organisation does instead of prescribing a number:
       calendar  an operating-rhythm activity (its calendar item's
                 frequency, whatever the organisation chose)
       setting   a Checkpoint setting, in days or months
     Templates write {{cadence:key}} (a clause: "at the interval the
     organisation has set (currently quarterly)") or {{Interval:key}}
     (a heading phrase: "Annually"). Change the calendar or the
     setting, regenerate, and the document follows. */
  var CADENCES = {
    'access-review': { label: 'Access review', calendar: 'access-review' },
    'log-review': { label: 'Security log and alert review', calendar: 'log-review' },
    'vuln-review': { label: 'Vulnerability and patch review', calendar: 'vuln-review' },
    'threat-intel': { label: 'Threat intelligence review', calendar: 'threat-intel' },
    'backup-restore': { label: 'Backup restore test', calendar: 'backup-restore' },
    'asset-review': { label: 'Asset register review', calendar: 'asset-review' },
    'supplier-review': { label: 'Supplier security review', calendar: 'supplier-review' },
    'awareness': { label: 'Security awareness training', calendar: 'awareness' },
    'ir-exercise': { label: 'Incident response exercise', calendar: 'ir-exercise' },
    'bcp-test': { label: 'Continuity and recovery test', calendar: 'bcp-test' },
    'legal-review': { label: 'Legal register review', calendar: 'legal-review' },
    'risk-review': { label: 'Risk review', setting: 'riskReviewCadenceDays', unit: 'days', def: 90 },
    'dormant-account': { label: 'Inactive account period', setting: 'dormantAccountDays', unit: 'days', def: 90, period: true },
    'document-review': { label: 'Document review', setting: 'documentReviewMonths', unit: 'months', def: 12 },
    'management-review': { label: 'Management review', setting: 'managementReviewMonths', unit: 'months', def: 12 },
    'internal-audit': { label: 'Internal audit of the management system clauses', setting: 'internalAuditMonths', unit: 'months', def: 12 }
  };
  var FREQ_PHRASE = { Monthly: 'monthly', Quarterly: 'quarterly', Biannual: 'every six months', Annual: 'annually' };
  function daysPhrase(n) {
    if (n === 30 || n === 31) return 'monthly';
    if (n >= 89 && n <= 92) return 'quarterly';
    if (n >= 180 && n <= 184) return 'every six months';
    if (n === 365 || n === 366) return 'annually';
    return 'every ' + n + ' days';
  }
  function monthsPhrase(n) {
    return { 1: 'monthly', 3: 'quarterly', 6: 'every six months', 12: 'annually', 24: 'every two years' }[n] || ('every ' + n + ' months');
  }
  /* The organisation's current value for a cadence: { value, phrase }.
     value is what a document records at generation, to notice later
     that practice moved on; phrase is '' while nothing is scheduled. */
  function cadenceCurrent(key, state) {
    var c = CADENCES[key];
    if (!c) return { value: '', phrase: '' };
    state = state || {};
    if (c.calendar) {
      var item = (state.calendar || []).find(function (x) {
        if (!calendarItemLive(x)) return false;
        var d = rhythmDefFor(x);
        return d && d.key === c.calendar;
      });
      var ph = item && FREQ_PHRASE[item.freq];
      return ph ? { value: item.freq, phrase: ph } : { value: '', phrase: '' };
    }
    var raw = parseInt(((state.settings || {})[c.setting]), 10);
    var n = raw > 0 ? raw : c.def;
    if (c.period) return { value: n + ' ' + c.unit, phrase: n + ' ' + c.unit };
    return { value: n + ' ' + c.unit, phrase: c.unit === 'days' ? daysPhrase(n) : monthsPhrase(n) };
  }
  /* {{cadence:key}} and {{Interval:key}}, resolved. */
  function resolveCadenceTokens(str, state) {
    if (typeof str !== 'string' || str.indexOf('{{') === -1) return str;
    return str.replace(/\{\{(cadence|Interval):([a-z-]+)\}\}/g, function (whole, kind, key) {
      var c = CADENCES[key];
      if (!c) return '';
      var cur = cadenceCurrent(key, state);
      if (kind === 'Interval') {
        var p = cur.phrase || 'at planned intervals';
        return p.charAt(0).toUpperCase() + p.slice(1);
      }
      if (c.period) return 'longer than the period the organisation has set (currently ' + cur.phrase + ')';
      return cur.phrase
        ? 'at the interval the organisation has set (currently ' + cur.phrase + ')'
        : 'at an interval the organisation sets and records in its compliance calendar';
    });
  }
  /* Every cadence key a piece of (unresolved) content refers to. */
  function cadenceKeysIn(content) {
    var json = typeof content === 'string' ? content : JSON.stringify(content || '');
    var out = [];
    var re = /\{\{(?:cadence|Interval):([a-z-]+)\}\}/g, m;
    while ((m = re.exec(json))) if (CADENCES[m[1]] && out.indexOf(m[1]) === -1) out.push(m[1]);
    return out;
  }
  /* What a document records at generation: { key: value } for each
     cadence it states. */
  function cadenceSnapshot(keys, state) {
    var out = {};
    (keys || []).forEach(function (k) { out[k] = cadenceCurrent(k, state).value; });
    return out;
  }

  /* Policy versus practice: where a generated document no longer says
     what the organisation does, or says it does something it is not
     doing. For each live generated document (not the organisation's own
     upload, not Superseded):
       legacy       generated before frequencies came from the
                    organisation's settings, so it may state a fixed one
       changed      a frequency it states has since been changed
       unscheduled  approved, commits to a recurring activity that is
                    not in the compliance calendar
       overdue      approved, and that activity is overdue
     s = { docs:[{ id, name, category, tplId, origin, status, cadences }],
           templates:[template], calendar, settings, today }. */
  function policyPracticeGaps(s) {
    s = s || {};
    var state = { calendar: s.calendar || [], settings: s.settings || {} };
    var tpls = {};
    (s.templates || []).forEach(function (t) { tpls[t.id] = t; });
    var out = [];
    (s.docs || []).forEach(function (d) {
      if (!d || !d.tplId || d.origin === 'own' || String(d.status || '') === 'Superseded' || !d.status) return;
      var t = tpls[d.tplId];
      if (!t) return;
      var keys = cadenceKeysIn(t);
      if (!keys.length) return;
      var snap = null;
      try { snap = d.cadences ? JSON.parse(d.cadences) : null; } catch (e) { snap = null; }
      if (!snap) {
        out.push({ kind: 'legacy', doc: d, keys: keys });
      } else {
        Object.keys(snap).forEach(function (k) {
          if (!CADENCES[k]) return;
          var now = cadenceCurrent(k, state).value;
          if (now !== snap[k]) out.push({ kind: 'changed', doc: d, key: k, was: snap[k], now: now });
        });
      }
      if (d.status !== 'Approved') return;
      keys.forEach(function (k) {
        var c = CADENCES[k];
        if (!c.calendar) return;
        var item = (state.calendar || []).find(function (x) {
          if (!calendarItemLive(x)) return false;
          var def = rhythmDefFor(x);
          return def && def.key === c.calendar;
        });
        if (!item) out.push({ kind: 'unscheduled', doc: d, key: k });
        else if (item.nextDue && s.today && item.nextDue < s.today) out.push({ kind: 'overdue', doc: d, key: k, item: item });
      });
    });
    return out;
  }

  /* A statement may carry `when: { orgKey: [values] }`: it applies only
     where the scope & context answer is one of those values. An
     unanswered question keeps the statement, so nothing is dropped on a
     guess; the approver still confirms it applies. */
  function statementApplies(stmt, profile) {
    /* whenApplicable: drop the statement once every control it puts
       into practice has been excluded in the Statement of Applicability
       (profile.__excluded, a map of excluded control ids). */
    if (stmt && stmt.whenApplicable && profile && profile.__excluded && stmt.whenApplicable.every(function (id) { return profile.__excluded[id]; })) return false;
    if (!stmt || typeof stmt !== 'object' || !stmt.when) return true;
    var p = profile || {};
    return Object.keys(stmt.when).every(function (k) {
      var v = p[k];
      return !v || stmt.when[k].indexOf(v) !== -1;
    });
  }

  /* Which rhythm activities a tenant does not yet run. An activity is
     already covered by an item carrying its marker, or by any active
     item in the same calendar category (a backup restore test someone
     added by hand counts). Returns the calendar items to add, with
     first due dates from `today`. */
  function planOperatingRhythm(calendar, today) {
    var active = (calendar || []).filter(calendarItemLive);
    return OPERATING_RHYTHM.filter(function (r) {
      return !active.some(function (c) { return rhythmKeyOf(c) === r.key || c.category === r.category; });
    }).map(function (r) {
      return { key: r.key, title: r.title, category: r.category, freq: r.freq, nextDue: addDaysToDateStr(today, r.firstDueDays),
        notes: '[rhythm:' + r.key + '] Evidence: ' + r.evidence, controls: r.controls.slice() };
    });
  }

  /* What completing a rhythm activity does to its linked controls
     (ISO 27001 rows, applicable only). With evidence: the evidence is
     linked where the control has none, the control is verified today
     by the attester, and its status moves to In progress, or to
     Implemented when markImplemented (the activity IS the control
     operating). Without evidence nothing changes: a completion nobody
     can show is not evidence. Pure; returns [{ control, set }]. */
  function rhythmCompletionUpdates(def, controls, evidenceUrl, today, attester, markImplemented) {
    if (!def || !evidenceUrl) return [];
    var out = [];
    (def.controls || []).forEach(function (code) {
      var c = (controls || []).find(function (x) { return x.fw === 'iso27001' && x.id === code; });
      if (!c || !c.app) return;
      var set = { verified: today, verifiedBy: attester || 'Practitioner' };
      if (!c.evidenceUrl) set.evidenceUrl = evidenceUrl;
      if (markImplemented && c.st !== 'Implemented') set.st = 'Implemented';
      else if (c.st === 'Not started') set.st = 'In progress';
      out.push({ control: c, set: set });
    });
    return out;
  }

  function recurringActivityState(calendar, category, today) {
    var rows = (calendar || []).filter(function (c) {
      return calendarItemLive(c) && c.category === category;
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
     (e.g. "A.5.29", "AI.3.2", "A.1.2.9") and the first two segments are
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
  /* opts (all optional):
       mapping  — { columnKey: headerIndex } chosen by the person when the
                  file's headings do not match; overrides the aliases for
                  that column. -1 means "not in this file".
       existing — names/titles already in the register, for duplicates.
     spec.dupKey names the column compared for duplicates. A duplicate is
     held back (out.duplicates), not skipped as invalid: it is a
     judgement, and the person can choose to import it anyway. */
  function importDupKey(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function planCsvImport(text, spec, opts) {
    opts = opts || {};
    var rows = parseCsv(text).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
    var out = { label: spec.label, columns: [], unknownColumns: [], ready: [], skipped: [], duplicates: [], totalRows: 0, headers: [], missingRequired: [] };
    if (!rows.length) { out.error = 'The file is empty.'; return out; }

    out.headers = rows[0].map(function (h) { return String(h == null ? '' : h).trim(); });
    var headerRow = rows[0].map(normaliseHeader);
    var byIndex = {};
    var mapping = opts.mapping || {};
    var mappedIdx = {};
    Object.keys(mapping).forEach(function (k) {
      var i = parseInt(mapping[k], 10);
      var col = spec.columns.find(function (c) { return c.key === k; });
      if (col && i >= 0 && i < headerRow.length) { byIndex[i] = col; mappedIdx[i] = true; }
    });
    headerRow.forEach(function (h, i) {
      if (mappedIdx[i]) return;
      var col = spec.columns.find(function (c) {
        if (Object.prototype.hasOwnProperty.call(mapping, c.key)) return false;
        return normaliseHeader(c.key) === h || (c.aliases || []).some(function (a) { return normaliseHeader(a) === h; });
      });
      if (col) byIndex[i] = col;
      else if (h) out.unknownColumns.push(rows[0][i]);
    });
    Object.keys(byIndex).sort(function (a, b) { return a - b; }).forEach(function (i) {
      if (out.columns.indexOf(byIndex[i].key) === -1) out.columns.push(byIndex[i].key);
    });

    var missingRequired = spec.columns.filter(function (c) { return c.required && out.columns.indexOf(c.key) === -1; });
    if (missingRequired.length) {
      out.missingRequired = missingRequired.map(function (c) { return c.key; });
      out.error = 'The file is missing required column' + (missingRequired.length === 1 ? '' : 's') + ': ' +
        missingRequired.map(function (c) { return c.key; }).join(', ') + '.';
      return out;
    }
    var seen = {};
    (opts.existing || []).forEach(function (v) { var k = importDupKey(v); if (k) seen[k] = 'existing'; });

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
      if (problems.length) { out.skipped.push({ line: lineNo, reason: problems.join('; '), raw: rec }); continue; }
      var dk = spec.dupKey ? importDupKey(rec[spec.dupKey]) : '';
      if (dk && seen[dk]) {
        out.duplicates.push({ line: lineNo, rec: rec, reason: seen[dk] === 'existing' ? 'already in the register' : 'repeats line ' + seen[dk] + ' of this file' });
        continue;
      }
      if (dk) seen[dk] = lineNo;
      out.ready.push({ line: lineNo, rec: rec });
    }
    return out;
  }

  /* Best guess for each column the file did not name exactly: the file
     heading that contains the column's name or one of its aliases.
     Used to pre-select the mapping dropdowns, never applied silently. */
  function guessImportMapping(headers, spec) {
    var used = {}, out = {};
    spec.columns.forEach(function (c) {
      var names = [c.key].concat(c.aliases || []).map(normaliseHeader).filter(Boolean);
      var hit = -1;
      (headers || []).forEach(function (h, i) {
        if (hit !== -1 || used[i]) return;
        var nh = normaliseHeader(h);
        if (!nh) return;
        if (names.some(function (n) { return nh === n || nh.indexOf(n) !== -1 || (nh.length > 2 && n.indexOf(nh) !== -1); })) hit = i;
      });
      if (hit !== -1) used[hit] = true;
      out[c.key] = hit;
    });
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

    /* Reference tables (a risk framework's scales and matrix), the same
       ones buildTemplateHtml() renders after the statements. The
       9400-twip text width is shared evenly; the header row is bold. */
    (t.tables || []).forEach(function (tb) {
      var cols = (tb.head || []).length || ((tb.rows || [])[0] || []).length || 1;
      var w = Math.floor(9400 / cols);
      var widths = []; for (var k = 0; k < cols; k++) widths.push(w);
      parts.push(docxHeading(tb.title || ''));
      if (tb.intro) parts.push(docxP(tb.intro, { after: 80 }));
      var head = tb.head ? '<w:tr>' + tb.head.map(function (h, i) {
        return '<w:tc><w:tcPr><w:tcW w:w="' + widths[i] + '" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1EEE8"/></w:tcPr><w:p>' + docxRun(h, { bold: true }) + '</w:p></w:tc>';
      }).join('') + '</w:tr>' : '';
      var tbl = docxTable(tb.rows || [], widths, { borderColor: tableBorder });
      parts.push(head ? tbl.replace('</w:tblGrid>', '</w:tblGrid>' + head) : tbl);
      if (tb.note) parts.push(docxP(tb.note, { before: 60, after: 120 }, { sz: 18 }));
      else parts.push(docxP('', { after: 120 }));
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
  function entitlementAnnualValue(modules, prices, agreedPrice) {
    /* A price agreed with this client (a package or discount) replaces
       the price-list sum outright — consultancy pricing is rarely the
       sum of module list prices. null/undefined means "use the list". */
    if (isAgreedPrice(agreedPrice)) return Number(agreedPrice);
    prices = prices || {};
    return (modules || []).reduce(function (sum, m) { return sum + (Number(prices[m]) || 0); }, 0);
  }
  function isAgreedPrice(v) {
    return v !== null && v !== undefined && v !== '' && isFinite(Number(v)) && Number(v) >= 0;
  }
  /* Splits one entitlement's value across its modules for the revenue-
     by-module view: in proportion to list prices when there are any,
     evenly when there are none. Always sums to the entitlement value. */
  function moduleRevenueShares(modules, prices, agreedPrice) {
    var mods = modules || [];
    var out = {};
    if (!mods.length) return out;
    prices = prices || {};
    if (!isAgreedPrice(agreedPrice)) {
      mods.forEach(function (m) { out[m] = (out[m] || 0) + (Number(prices[m]) || 0); });
      return out;
    }
    var total = Number(agreedPrice);
    var listSum = mods.reduce(function (s, m) { return s + (Number(prices[m]) || 0); }, 0);
    mods.forEach(function (m) {
      var share = listSum > 0 ? total * (Number(prices[m]) || 0) / listSum : total / mods.length;
      out[m] = (out[m] || 0) + share;
    });
    return out;
  }

  function computePartnerRevenue(entitlements, prices, today) {
    prices = prices || {};
    var byTenant = latestEntitlementsByTenant((entitlements || []).filter(function (e) { return e && e.type === 'client'; }));
    var demoByTenant = latestEntitlementsByTenant((entitlements || []).filter(function (e) { return e && e.type === 'demo'; }));

    function entitlementValue(e) {
      return entitlementAnnualValue(e.modules, prices, e.agreedPrice);
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
      var shares = moduleRevenueShares(e.modules, prices, e.agreedPrice);
      Object.keys(shares).forEach(function (m) { revenueByModule[m] = (revenueByModule[m] || 0) + shares[m]; });

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
    /* setupStatus/setupReason/lastSeen come from the tenant's own
       setup-health report (lambda/report-error.js health branch) — it
       arrives whether or not anyone has synced this client, so either
       source is enough to know something. */
    if (!input.lastSynced && !input.lastSeen) return { color: 'unknown', reason: 'Never synced — no health data available' };
    if (input.syncError) return { color: 'red', reason: 'Sync error: ' + input.syncError };
    if (input.setupStatus === 'failing') return { color: 'red', reason: 'Setup problem: ' + (input.setupReason || 'see the client\'s Setup health') };
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
    if (input.setupStatus === 'warning') return { color: 'amber', reason: 'Setup: ' + (input.setupReason || 'needs attention') };
    if (input.lastSeen && daysBetweenDateStr(String(input.lastSeen).slice(0, 10), today) > 30) return { color: 'amber', reason: 'Checkpoint not opened in 30+ days' };
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
  /* A SharePoint site as the owner console stores it: a server-relative
     path such as /sites/compliance, '' for the root site. Accepts what
     people actually paste — a full URL copied from the browser (with
     /SitePages/Home.aspx and a query string on the end), stray trailing
     punctuation, a missing leading slash. Returns null for something
     that cannot be a site path. */
  function normaliseSitePath(input) {
    var s = String(input == null ? '' : input).trim();
    if (!s || /^root$/i.test(s)) return '';
    s = s.replace(/^https?:\/\/[^/]+/i, '');
    s = s.split(/[?#]/)[0];
    var m = s.match(/^\/?((?:sites|teams)\/[^/\s]+)/i);
    if (m) s = '/' + m[1];
    else if (s.charAt(0) !== '/') s = '/' + s;
    s = s.replace(/[\s.,;:/\\]+$/, '');
    if (!s || s === '/') return '';
    return /^\/[^\s]+$/.test(s) ? s : null;
  }

  /* The client-facing setup steps for a welcome pack — the email and the
     quick-start PDF both render these, and they follow the setup wizard
     in its real order: consent (only when not yet granted), sign in,
     capability check, activation, where records live, frameworks.
     o: { consentDone, hasActivationFile, activationFileName, sitePath,
     frameworks: [display names] }. Plain text throughout; each renderer
     escapes for its own format. */
  function welcomeGuideContent(o) {
    o = o || {};
    var fws = (o.frameworks || []).filter(Boolean);
    var fwText = fws.length === 0 ? 'your frameworks'
      : fws.length === 1 ? fws[0]
      : fws.slice(0, -1).join(', ') + ' and ' + fws[fws.length - 1];
    var steps = [];
    if (!o.consentDone) {
      steps.push(['Grant admin consent', 'A Global Administrator opens the setup link and approves Checkpoint\'s access once for the whole organisation. The consent screen lists exactly what is requested.']);
    }
    steps.push(['Sign in', 'Open the setup link and sign in with your work account.']);
    steps.push(['Capability check', 'Checkpoint shows which Microsoft 365 features your licences include. Anything not included is simply checked manually. Click Continue.']);
    steps.push(['Upload your activation file', o.hasActivationFile
      ? 'Upload the activation file attached to this email' + (o.activationFileName ? ' (' + o.activationFileName + ')' : '') + '.'
      : 'Upload the activation file we send you separately.']);
    steps.push(['Choose where your records live', o.sitePath
      ? 'Choose the existing SharePoint site ' + o.sitePath + '.'
      : 'Choose the SharePoint site for your compliance records. We recommend a dedicated site.']);
    steps.push(['Confirm your frameworks', 'Confirm ' + fwText + '. Checkpoint then creates your registers, document library and evidence folders, and runs your first posture scan.']);
    var before = (o.consentDone ? 'You\'ll need your work account' : 'You\'ll need a Global Administrator for the first step, then your work account')
      + (o.sitePath ? ', owner access to the ' + o.sitePath + ' SharePoint site' : ', owner access to the SharePoint site your records will live in')
      + ' and about 15 minutes.';
    return {
      before: before,
      steps: steps,
      after: 'Once you\'re in, open Settings, then Setup health, for an overview of your setup, and look over your first scan results on the Dashboard.'
    };
  }

  /* A tenant's SharePoint hostname from its verified domains: the
     initial contoso.onmicrosoft.com domain maps to contoso.sharepoint.com.
     '' when there is no initial .onmicrosoft.com domain to go on. */
  function sharePointHostFromDomains(domains) {
    var list = domains || [];
    var initial = list.find(function (d) { return d && d.isInitial; });
    var name = initial ? initial.name : ((list.find(function (d) { return d && /\.onmicrosoft\.com$/i.test(d.name) && !/\.mail\.onmicrosoft\.com$/i.test(d.name); }) || {}).name);
    var m = String(name || '').toLowerCase().match(/^([a-z0-9-]+)\.onmicrosoft\.com$/);
    return m ? m[1] + '.sharepoint.com' : '';
  }

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
    /* Trials run in days (7/14/30), paid terms in months. termDays wins
       when given, so a trial can never silently become a 12-month file. */
    var termDays = Number(input.termDays) > 0 ? Number(input.termDays) : null;
    var termMonths = termDays ? null : (Number(input.termMonths) || 12);
    var issuedAt = today;
    var expiry = termDays ? addDaysToDateStr(issuedAt, termDays) : addMonthsToDateStr(issuedAt, termMonths);
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
      type: type, modules: modules, issuedAt: issuedAt, expiry: expiry, termMonths: termMonths, termDays: termDays,
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
  /* Risks a Microsoft 365 scan cannot see, suggested from the scope &
     context questionnaire's answers (ORG_CONTEXT_QUESTIONS, stored as
     org* Settings). Same shape as the scan's risk templates in app.js
     (risk + actions), proposed into the same approve-or-dismiss queue,
     so nothing enters the register without a practitioner deciding.
     `when(p)` reads the answers; `why(p)` says which answer raised it.
     Keys are 'ctx-' prefixed and never collide with a check id. */
  var CONTEXT_RISKS = [
    { key: 'ctx-bec', when: function () { return true; },
      why: function () { return 'Applies to every organisation using email.'; },
      risk: { title: 'Business email compromise leads to a fraudulent payment or data theft', cat: 'People', cia: ['C', 'I'], L: 4, I: 4, controls: ['A.6.3', 'A.5.14', 'A.8.5'] },
      actions: [
        { t: 'Require call-back verification on a known number for any new or changed payment details, and record it in the finance procedure', pr: 'High', days: 30, control: 'A.5.14' },
        { t: 'Cover payment fraud and impersonation in the next awareness training round', pr: 'Medium', days: 45, control: 'A.6.3' }] },
    { key: 'ctx-leaver-access', when: function () { return true; },
      why: function () { return 'Applies to every organisation with staff or contractors.'; },
      risk: { title: 'Former staff or contractors keep access to systems or data after they leave', cat: 'Access', cia: ['C', 'I'], L: 3, I: 4, controls: ['A.5.18', 'A.6.5', 'A.5.11'] },
      actions: [
        { t: 'Adopt a leaver checklist: disable the account on the last day, remove app and shared-mailbox access, recover devices, and record it', pr: 'High', days: 30, control: 'A.6.5' },
        { t: 'Reconcile active accounts against the staff and contractor list in the quarterly access review', pr: 'Medium', days: 60, control: 'A.5.18' }] },
    { key: 'ctx-backup', when: function () { return true; },
      why: function () { return 'Cloud services keep data available, but deletion, ransomware or account compromise can still destroy it.'; },
      risk: { title: 'Information in cloud services cannot be recovered after deletion, ransomware or provider failure', cat: 'Resilience', cia: ['I', 'A'], L: 3, I: 5, controls: ['A.8.13', 'A.5.30'] },
      actions: [
        { t: 'Confirm what is backed up (Microsoft 365, product data, source code), the retention, and who can restore it', pr: 'High', days: 30, control: 'A.8.13' },
        { t: 'Run and record a restore test for each critical data set', pr: 'High', days: 45, control: 'A.8.13' }] },
    { key: 'ctx-key-person', when: function (p) { return p.orgSize === 'micro' || p.orgSize === 'small'; },
      why: function () { return 'You told us the organisation is small.'; },
      risk: { title: 'One or two people hold all administrative access and knowledge, with no cover if they are unavailable', cat: 'Resilience', cia: ['A'], L: 3, I: 4, controls: ['A.5.3', 'A.5.37', 'A.8.2'] },
      actions: [
        { t: 'Keep a tested emergency (break-glass) admin account with its credentials held securely, and document how it is used', pr: 'High', days: 30, control: 'A.8.2' },
        { t: 'Document the critical admin procedures so a second person or the IT provider can follow them', pr: 'Medium', days: 60, control: 'A.5.37' }] },
    { key: 'ctx-lost-device', when: function (p) { return p.orgWorkModel === 'remote' || p.orgWorkModel === 'hybrid'; },
      why: function (p) { return p.orgWorkModel === 'remote' ? 'You told us people work fully remotely.' : 'You told us people work partly from home or remotely.'; },
      risk: { title: 'A lost or stolen laptop or phone exposes company or customer information', cat: 'Endpoint', cia: ['C'], L: 3, I: 4, controls: ['A.8.1', 'A.7.9', 'A.8.24'] },
      actions: [
        { t: 'Enrol every company laptop and phone in Intune with encryption and a screen lock enforced', pr: 'High', days: 30, control: 'A.8.1' },
        { t: 'Confirm a lost device can be wiped remotely, and add the reporting step to the incident procedure', pr: 'Medium', days: 45, control: 'A.7.9' }] },
    { key: 'ctx-msp-access', when: function (p) { return p.orgItModel === 'msp' || p.orgItModel === 'mixed'; },
      why: function () { return 'You told us a managed service provider runs some or all of your IT.'; },
      risk: { title: 'The IT provider’s privileged access is misused, or their systems are compromised and used to reach ours', cat: 'Supplier', cia: ['C', 'I', 'A'], L: 3, I: 5, controls: ['A.5.19', 'A.5.20', 'A.8.2'] },
      actions: [
        { t: 'List the IT provider’s admin accounts and permissions, remove standing access that is not needed, and require MFA on all of them', pr: 'High', days: 30, control: 'A.8.2' },
        { t: 'Check the IT provider contract covers security obligations, breach notification and access logging', pr: 'Medium', days: 60, control: 'A.5.20' }] },
    { key: 'ctx-saas-supplier', when: function (p) { return p.orgCloud === 'saas' || p.orgCloud === 'iaas'; },
      why: function () { return 'You told us your information is held in SaaS applications beyond Microsoft 365.'; },
      risk: { title: 'A cloud or SaaS provider holding our information is breached, or changes how it handles it without our knowledge', cat: 'Supplier', cia: ['C', 'A'], L: 3, I: 4, controls: ['A.5.19', 'A.5.21', 'A.5.23'] },
      actions: [
        { t: 'Record each SaaS application holding company or customer data in the supplier register, with its assurance (ISO 27001 or SOC 2) and data location', pr: 'Medium', days: 45, control: 'A.5.23' },
        { t: 'Enable single sign-on and MFA on each of those applications where available', pr: 'Medium', days: 60, control: 'A.5.19' }] },
    { key: 'ctx-cloud-misconfig', when: function (p) { return p.orgCloud === 'iaas'; },
      why: function () { return 'You told us you run your own workloads in Azure, AWS or similar.'; },
      risk: { title: 'Cloud infrastructure is misconfigured, exposing data, services or management interfaces to the internet', cat: 'Cloud', cia: ['C', 'I', 'A'], L: 3, I: 5, controls: ['A.8.9', 'A.8.20', 'A.8.22'] },
      actions: [
        { t: 'Turn on the cloud provider’s security posture tooling (Defender for Cloud or AWS Security Hub) and work its high findings', pr: 'High', days: 30, control: 'A.8.9' },
        { t: 'Document the network boundaries: what is internet-facing, how production is separated, and who can change it', pr: 'Medium', days: 60, control: 'A.8.22' }] },
    { key: 'ctx-source-code', when: function (p) { return p.orgDevelops === 'yes' || p.orgDevelops === 'outsourced'; },
      why: function () { return 'You told us the organisation develops software.'; },
      risk: { title: 'Source code, secrets or the build pipeline are exposed through over-broad repository access', cat: 'Development', cia: ['C', 'I'], L: 3, I: 5, controls: ['A.8.4', 'A.8.25', 'A.5.32'] },
      actions: [
        { t: 'Review who has access to each code repository, remove anyone who does not need it, and require MFA and branch protection', pr: 'High', days: 30, control: 'A.8.4' },
        { t: 'Scan repositories for committed secrets and move any found into a secrets store, rotating them', pr: 'High', days: 30, control: 'A.8.25' }] },
    { key: 'ctx-release-testing', when: function (p) { return p.orgDevelops === 'yes' || p.orgDevelops === 'outsourced'; },
      why: function () { return 'You told us the organisation develops software.'; },
      risk: { title: 'A security flaw reaches production because changes are not reviewed and tested before release', cat: 'Development', cia: ['C', 'I', 'A'], L: 3, I: 4, controls: ['A.8.29', 'A.8.32', 'A.8.31'] },
      actions: [
        { t: 'Require peer review and automated dependency and security scanning on every change before it is merged', pr: 'High', days: 45, control: 'A.8.29' },
        { t: 'Confirm production is separate from development and test, and that production data is not used in test without masking', pr: 'Medium', days: 60, control: 'A.8.31' }] },
    { key: 'ctx-outsourced-dev', when: function (p) { return p.orgDevelops === 'outsourced'; },
      why: function () { return 'You told us software is developed by an external development partner.'; },
      risk: { title: 'The external development partner introduces vulnerabilities, mishandles our code or data, or keeps access after the engagement', cat: 'Supplier', cia: ['C', 'I'], L: 3, I: 5, controls: ['A.8.30', 'A.5.20', 'A.5.19'] },
      actions: [
        { t: 'Confirm the development agreement covers secure coding, IP ownership, confidentiality, vulnerability disclosure and return of code and data', pr: 'High', days: 30, control: 'A.8.30' },
        { t: 'Give the partner named accounts with least-privilege access to repositories and environments, reviewed quarterly', pr: 'High', days: 30, control: 'A.8.30' }] },
    { key: 'ctx-privacy-breach', when: function (p) { return p.orgPersonalData === 'customers' || p.orgPersonalData === 'sensitive'; },
      why: function (p) { return p.orgPersonalData === 'sensitive' ? 'You told us you hold sensitive personal information.' : 'You told us you hold personal information about customers or the public.'; },
      risk: { title: 'Personal information is disclosed or mishandled, triggering notifiable data breach obligations', cat: 'Privacy', cia: ['C'], L: 3, I: 5, controls: ['A.5.34', 'A.5.33', 'A.8.12'] },
      actions: [
        { t: 'Map where personal information is held and who can access it, and record it in the asset register', pr: 'High', days: 45, control: 'A.5.34' },
        { t: 'Add the notifiable data breach assessment (30-day test, OAIC notification) to the incident procedure', pr: 'High', days: 30, control: 'A.5.34' }] },
    { key: 'ctx-ai-tools', when: function (p) { return p.orgAiUse === 'tools' || p.orgAiUse === 'builds'; },
      why: function () { return 'You told us staff use AI tools.'; },
      risk: { title: 'Staff put confidential or personal information into unapproved AI tools', cat: 'People', cia: ['C'], L: 4, I: 3, controls: ['A.5.10', 'A.8.12', 'A.5.23'] },
      actions: [
        { t: 'Publish the list of approved AI tools and what may not be entered into them, in the acceptable use rules', pr: 'Medium', days: 30, control: 'A.5.10' },
        { t: 'Block or warn on unapproved AI sites with Defender for Cloud Apps or web filtering', pr: 'Medium', days: 60, control: 'A.8.12' }] },
    { key: 'ctx-ai-product', when: function (p) { return p.orgAiUse === 'builds'; },
      why: function () { return 'You told us you build AI into your products or services.'; },
      risk: { title: 'AI features in our product leak customer data across customers, or produce harmful or incorrect output that is relied on', cat: 'Development', cia: ['C', 'I'], L: 3, I: 5, controls: ['A.8.26', 'A.8.25', 'A.5.34'] },
      actions: [
        { t: 'Define security and privacy requirements for AI features: tenant isolation, what data the model provider receives, and retention', pr: 'High', days: 45, control: 'A.8.26' },
        { t: 'Test AI features for prompt injection and cross-customer data exposure before each major release', pr: 'High', days: 60, control: 'A.8.25' }] },
    { key: 'ctx-rapid-change', when: function (p) { return p.orgChange === 'growing' || p.orgChange === 'major'; },
      why: function (p) { return p.orgChange === 'major' ? 'You told us the organisation is going through major change.' : 'You told us the organisation is growing quickly.'; },
      risk: { title: 'Rapid change introduces systems, suppliers or access that bypass security review', cat: 'Governance', cia: ['C', 'I', 'A'], L: 3, I: 4, controls: ['A.5.8', 'A.8.32', 'A.5.18'] },
      actions: [
        { t: 'Add a security check to new projects, systems and suppliers before they go live', pr: 'Medium', days: 45, control: 'A.5.8' }] },
    { key: 'ctx-contract-obligations', when: function (p) { return p.orgCustomerDemand === 'contract'; },
      why: function () { return 'You told us security or certification is written into your customer contracts.'; },
      risk: { title: 'We fail a contractual security obligation or certification commitment, putting key customer contracts at risk', cat: 'Compliance', cia: ['C', 'I', 'A'], L: 2, I: 5, controls: ['A.5.31', 'A.5.36', 'A.5.20'] },
      actions: [
        { t: 'Record each customer’s contractual security obligations in the legal register with an owner, and check them at each management review', pr: 'High', days: 45, control: 'A.5.31' }] }
  ];

  /* The context risks to propose now: those whose answers apply, that
     are not already in the register (risk.tpl) or dismissed. */
  function contextRiskSuggestions(profile, risks, dismissed) {
    var p = profile || {};
    var inRegister = {};
    (risks || []).forEach(function (r) { if (r && r.tpl) inRegister[r.tpl] = true; ((r && r.findings) || []).forEach(function (f) { inRegister[f] = true; }); });
    var gone = {};
    (dismissed || []).forEach(function (k) { gone[k] = true; });
    var answered = ['orgSize', 'orgWorkModel', 'orgItModel', 'orgCloud', 'orgDevelops', 'orgPersonalData', 'orgAiUse', 'orgChange', 'orgCustomerDemand'].some(function (k) { return !!p[k]; });
    if (!answered) return [];
    return CONTEXT_RISKS.filter(function (c) { return !inRegister[c.key] && !gone[c.key] && c.when(p); })
      .map(function (c) { return { key: c.key, why: c.why(p), risk: c.risk, actions: c.actions }; });
  }

  /* ============================================================
     Business risks
     ------------------------------------------------------------
     A certification body reads the risk register as a business
     document: "too technical" is what an auditor says of a register
     that holds one risk per failed setting. Every scan finding and
     every scope & context suggestion maps to one of these business
     risks (at most 15); the findings become its vulnerabilities and
     their fixes its treatment actions. One risk per business outcome,
     however many settings feed it. */
  var BUSINESS_RISKS = [
    { key: 'biz-account-takeover', cat: 'Access', cia: ['C', 'I'], controls: ['A.5.17', 'A.8.5'],
      title: 'Staff accounts are taken over through phishing, stolen passwords or weak sign-in controls, exposing information or enabling fraud',
      threat: 'External attacker using phishing, password spraying or stolen credentials',
      consequence: 'Unauthorised access to email, files and customer information; fraudulent payments; loss of customer trust' },
    { key: 'biz-privileged-access', cat: 'Access', cia: ['C', 'I', 'A'], controls: ['A.8.2', 'A.5.15'],
      title: 'Administrator access is misused or compromised, giving control of the whole environment',
      threat: 'Attacker or insider with administrator rights, including the IT provider',
      consequence: 'Tenant-wide data exposure, deletion or lock-out; long recovery' },
    { key: 'biz-access-not-removed', cat: 'Access', cia: ['C'], controls: ['A.5.18', 'A.5.16'],
      title: 'People keep access they no longer need, including former staff and unused accounts',
      threat: 'Former staff, contractors or an attacker using an unattended account',
      consequence: 'Information accessed by people with no right to it, unnoticed' },
    { key: 'biz-device', cat: 'Devices', cia: ['C', 'I'], controls: ['A.8.1', 'A.8.7'],
      title: 'A lost, stolen or insecure laptop or phone exposes company or customer information',
      threat: 'Theft or loss of a device, or malware on an unmanaged device',
      consequence: 'Information on or reachable from the device is exposed' },
    { key: 'biz-attack-undetected', cat: 'Operations', cia: ['C', 'I', 'A'], controls: ['A.8.8', 'A.8.16', 'A.5.26'],
      title: 'A cyber attack or known weakness is not detected, fixed or contained in time',
      threat: 'Malware, ransomware or exploitation of an unpatched weakness',
      consequence: 'Disruption to services, data loss or exposure, and cost of recovery' },
    { key: 'biz-data-exposure', cat: 'Data', cia: ['C'], controls: ['A.5.12', 'A.5.14', 'A.8.12'],
      title: 'Information is shared more widely or kept longer than it should be',
      threat: 'Over-broad sharing links, unlabelled information, unmanaged cloud apps',
      consequence: 'Confidential or personal information reaches the wrong people' },
    { key: 'biz-third-party', cat: 'Suppliers', cia: ['C', 'I', 'A'], controls: ['A.5.19', 'A.5.21', 'A.5.22'],
      title: 'A supplier or connected third-party app is breached or has more access than it should',
      threat: 'Compromise or misuse at a cloud provider, SaaS supplier or consented app',
      consequence: 'Our information exposed through someone else’s systems' },
    { key: 'biz-insecure-product', cat: 'Development', cia: ['C', 'I', 'A'], controls: ['A.8.25', 'A.8.28', 'A.8.32'],
      title: 'Security flaws, exposed secrets or misconfiguration reach our product or platform',
      threat: 'Unreviewed changes, vulnerable dependencies, leaked keys, misconfigured cloud services',
      consequence: 'Customer data exposed or service compromised through our own product' },
    { key: 'biz-recovery', cat: 'Continuity', cia: ['A'], controls: ['A.8.13', 'A.5.29', 'A.5.30'],
      title: 'Information or services cannot be recovered quickly after an incident, outage or loss of key people',
      threat: 'Ransomware, accidental deletion, provider outage, unavailability of key staff',
      consequence: 'Extended outage, permanent data loss, failure to meet customer commitments' },
    { key: 'biz-privacy', cat: 'Privacy', cia: ['C'], controls: ['A.5.34', 'A.5.24'],
      title: 'Personal information is mishandled, breaching privacy law or a notifiable data breach obligation',
      threat: 'Disclosure, misuse or slow handling of personal information',
      consequence: 'Regulatory action, notification obligations and harm to individuals' },
    { key: 'biz-people', cat: 'People', cia: ['C', 'I'], controls: ['A.6.3', 'A.5.10'],
      title: 'Staff do not follow security rules because they are unaware of them or never tested',
      threat: 'Human error, social engineering',
      consequence: 'Incidents caused by avoidable mistakes' },
    { key: 'biz-ai', cat: 'AI', cia: ['C', 'I'], controls: ['A.5.10', 'A.5.19'],
      title: 'AI tools or AI features leak information or produce harmful output that is relied on',
      threat: 'Confidential data entered into AI tools; AI apps with broad access; model errors',
      consequence: 'Information disclosed to AI providers or other customers; wrong decisions' },
    { key: 'biz-isms', cat: 'Governance', cia: ['C', 'I', 'A'], controls: ['A.5.1', 'A.5.35', 'A.5.27'],
      title: 'Security is not managed as documented, so weaknesses and change go unnoticed',
      threat: 'Out-of-date policies, no independent review, lessons not learned, change outpacing review',
      consequence: 'Controls drift from what is documented; nonconformities at audit' },
    { key: 'biz-contract', cat: 'Compliance', cia: ['C', 'I', 'A'], controls: ['A.5.31', 'A.5.36'],
      title: 'We fail a customer contract or certification commitment, putting key customer contracts at risk',
      threat: 'Security obligations not tracked or met',
      consequence: 'Loss of contracts, revenue and certification' }
  ];
  var BUSINESS_RISK_OF = {
    'legacy': 'biz-account-takeover', 'legacy-auth-observed': 'biz-account-takeover', 'mfa-registration': 'biz-account-takeover',
    'ca-risk': 'biz-account-takeover', 'riskyusers': 'biz-account-takeover', 'ctx-bec': 'biz-account-takeover', 'gh-secret-alerts': 'biz-insecure-product',
    'mfa-priv': 'biz-privileged-access', 'ca-sif': 'biz-privileged-access', 'admins': 'biz-privileged-access', 'pim': 'biz-privileged-access',
    'sod': 'biz-privileged-access', 'ctx-msp-access': 'biz-privileged-access',
    'dormant-accounts': 'biz-access-not-removed', 'leaver': 'biz-access-not-removed', 'lifecycle-workflows': 'biz-access-not-removed',
    'access-review': 'biz-access-not-removed', 'ctx-leaver-access': 'biz-access-not-removed',
    'device-encryption': 'biz-device', 'device-jailbroken': 'biz-device', 'wdac': 'biz-device', 'ca-device': 'biz-device',
    'device-checkin': 'biz-device', 'ctx-lost-device': 'biz-device',
    'patch': 'biz-attack-undetected', 'edr-coverage': 'biz-attack-undetected', 'xdr-incidents': 'biz-attack-undetected',
    'sharing': 'biz-data-exposure', 'labels': 'biz-data-exposure', 'retention': 'biz-data-exposure', 'ca-cas': 'biz-data-exposure',
    'riskyapps': 'biz-third-party', 'oauth-consent': 'biz-third-party', 'supplier': 'biz-third-party', 'ctx-saas-supplier': 'biz-third-party',
    'gh-branch-review': 'biz-insecure-product', 'gh-dependabot': 'biz-insecure-product', 'ctx-source-code': 'biz-insecure-product',
    'ctx-release-testing': 'biz-insecure-product', 'ctx-outsourced-dev': 'biz-insecure-product', 'ctx-cloud-misconfig': 'biz-insecure-product',
    'backup': 'biz-recovery', 'bcp': 'biz-recovery', 'ctx-backup': 'biz-recovery', 'ctx-key-person': 'biz-recovery',
    'privacy-srr': 'biz-privacy', 'ctx-privacy-breach': 'biz-privacy',
    'phish-sim': 'biz-people', 'ca-tou': 'biz-people',
    'ctx-ai-tools': 'biz-ai', 'ctx-ai-product': 'biz-ai',
    'policy': 'biz-isms', 'audit-review': 'biz-isms', 'incident-lessons': 'biz-isms', 'ctx-rapid-change': 'biz-isms',
    'ctx-contract-obligations': 'biz-contract'
  };
  function businessRiskKeyFor(tpl) {
    if (!tpl) return null;
    if (/^ai-risk-/.test(tpl)) return 'biz-ai';
    return BUSINESS_RISK_OF[tpl] || null;
  }
  function businessRiskDef(key) { return BUSINESS_RISKS.find(function (b) { return b.key === key; }) || null; }
  function isBusinessRisk(r) { return !!(r && r.tpl && businessRiskDef(r.tpl)); }
  /* The finding templates a risk record covers: a business risk's
     findings list, else its own template. */
  function riskFindings(r) {
    if (!r) return [];
    if (r.findings && r.findings.length) return r.findings.slice();
    return r.tpl && !businessRiskDef(r.tpl) ? [r.tpl] : [];
  }
  function uniq(list) { var seen = {}, out = []; (list || []).forEach(function (x) { if (x && !seen[x]) { seen[x] = true; out.push(x); } }); return out; }
  /* Groups proposed finding templates under their business risk.
     templates = { tpl: { risk: {title, L, I, controls, cia}, actions: [{t,...}] } };
     risks = the register (an open business risk already there gets the
     findings added rather than a second copy). An unmapped template
     stays on its own. Returns groups, most severe first:
     { key, biz, tpls, target, L, I, score, controls, cia, actions }. */
  function groupProposals(proposed, templates, risks) {
    var groups = {}, order = [];
    (proposed || []).forEach(function (tpl) {
      var t = (templates || {})[tpl];
      if (!t) return;
      var key = businessRiskKeyFor(tpl) || tpl;
      if (!groups[key]) { groups[key] = { key: key, biz: businessRiskDef(key), tpls: [] }; order.push(key); }
      groups[key].tpls.push(tpl);
    });
    var open = (risks || []).filter(function (r) { return r && r.status !== 'Closed' && r.type !== 'Opportunity'; });
    return order.map(function (key) {
      var g = groups[key];
      var worst = null;
      g.tpls.forEach(function (tpl) { var r = templates[tpl].risk; if (!worst || r.L * r.I > worst.L * worst.I) worst = r; });
      var seenAct = {};
      var actions = [];
      g.tpls.forEach(function (tpl) {
        (templates[tpl].actions || []).forEach(function (a) {
          var k = String(a.t).toLowerCase();
          if (seenAct[k]) return;
          seenAct[k] = true;
          actions.push(Object.assign({ fromTpl: tpl }, a));
        });
      });
      var target = g.biz ? open.find(function (r) { return r.tpl === key; }) || null : null;
      return {
        key: key, biz: g.biz, tpls: g.tpls, target: target,
        L: worst.L, I: worst.I, score: worst.L * worst.I,
        title: g.biz ? g.biz.title : templates[g.tpls[0]].risk.title,
        controls: uniq([].concat.apply((g.biz ? g.biz.controls : []).slice(), g.tpls.map(function (tpl) { return templates[tpl].risk.controls || []; }))),
        cia: uniq([].concat.apply((g.biz ? g.biz.cia : []).slice(), g.tpls.map(function (tpl) { return templates[tpl].risk.cia || []; }))),
        actions: actions
      };
    }).sort(function (a, b) { return b.score - a.score; });
  }
  /* Existing risks that are really findings of one business risk: open
     threats raised from a scan or a scope suggestion (risk.tpl) that are
     not business risks themselves. Grouped for a reviewed merge: the
     findings move under the business risk (an existing one in the
     register, or a new one), their actions with them, and the old
     records close with a note pointing to where they went. A risk
     entered by hand has no template and is never touched. */
  function groupExistingRisks(risks) {
    var open = (risks || []).filter(function (r) { return r && r.status !== 'Closed' && r.type !== 'Opportunity'; });
    var groups = {}, order = [];
    open.forEach(function (r) {
      if (isBusinessRisk(r) || !r.tpl) return;
      var key = businessRiskKeyFor(r.tpl);
      if (!key) return;
      if (!groups[key]) { groups[key] = { key: key, biz: businessRiskDef(key), risks: [] }; order.push(key); }
      groups[key].risks.push(r);
    });
    return order.map(function (key) {
      var g = groups[key];
      var target = open.find(function (r) { return r.tpl === key; }) || null;
      var worst = g.risks.reduce(function (w, r) { return !w || r.L * r.I > w.L * w.I ? r : w; }, null);
      return {
        key: key, biz: g.biz, risks: g.risks, target: target,
        L: worst.L, I: worst.I, owner: worst.owner || '',
        findings: uniq(g.risks.map(function (r) { return r.tpl; })),
        actions: uniq([].concat.apply([], g.risks.map(function (r) { return r.actions || []; }))),
        controls: uniq([].concat.apply(g.biz.controls.slice(), g.risks.map(function (r) { return r.controls || []; }))),
        cia: uniq([].concat.apply(g.biz.cia.slice(), g.risks.map(function (r) { return r.cia || []; })))
      };
    }).sort(function (a, b) { return b.L * b.I - a.L * a.I; });
  }
  /* How many risks the register would hold after grouping. */
  function registerSizeAfterGrouping(risks) {
    var open = (risks || []).filter(function (r) { return r && r.status !== 'Closed' && r.type !== 'Opportunity'; });
    var gs = groupExistingRisks(risks);
    var moved = gs.reduce(function (n, g) { return n + g.risks.length; }, 0);
    var created = gs.filter(function (g) { return !g.target; }).length;
    return { now: open.length, after: open.length - moved + created };
  }

  /* ============================================================
     Evidence check
     ------------------------------------------------------------
     Every evidence link on a control, clause or completed action, and
     what its probe found: the file no longer there, or older than the
     review cycle. Plus implemented controls and clauses with no
     evidence at all. probes = { url: { ok: true|false, modified } }; a
     link with no probe (not SharePoint, or the check could not reach
     it) is never reported as missing. */
  function evidenceTargets(d) {
    d = d || {};
    var out = [];
    (d.controls || []).forEach(function (c) { if (c && c.app) out.push({ kind: 'control', key: c.fw + '|' + c.id, label: c.id + ' ' + (c.t || ''), url: c.evidenceUrl || '', implemented: c.st === 'Implemented' }); });
    (d.clauses || []).forEach(function (c) { if (c) out.push({ kind: 'clause', key: (c.fw || 'iso27001') + '|' + c.id, label: 'Clause ' + c.id + ' ' + (c.t || ''), url: c.evidenceUrl || '', implemented: c.st === 'Implemented' }); });
    (d.actions || []).forEach(function (a) { if (a && a.status === 'Done') out.push({ kind: 'action', key: a.id, label: a.id + ' ' + (a.title || ''), url: a.evidenceUrl || '', implemented: true }); });
    return out;
  }
  /* validityFor(target) (optional) = { days, freq, activity } for a
     control whose evidence comes from a recurring activity: that
     interval replaces maxAgeDays for it. */
  function evidenceCheckIssues(targets, probes, today, maxAgeDays, validityFor) {
    maxAgeDays = maxAgeDays || 365;
    var out = [];
    (targets || []).forEach(function (t) {
      if (!t.url) {
        if (t.implemented && t.kind !== 'action') out.push({ kind: t.kind, key: t.key, label: t.label, issue: 'none' });
        return;
      }
      var p = (probes || {})[t.url];
      if (!p) return;
      if (p.ok === false) out.push({ kind: t.kind, key: t.key, label: t.label, issue: 'missing', url: t.url });
      else if (p.modified) {
        var v = validityFor ? validityFor(t) : null;
        var limit = v ? v.days : maxAgeDays;
        var mod = String(p.modified).slice(0, 10);
        if (daysBetweenDateStr(mod, today) > limit) {
          var row = { kind: t.kind, key: t.key, label: t.label, issue: 'stale', url: t.url, modified: mod, validUntil: addDaysIso(mod, limit) };
          if (v) { row.freq = v.freq; row.activity = v.activity; }
          out.push(row);
        }
      }
    });
    return out;
  }
  function isSharePointUrl(u) { return /^https:\/\/[a-z0-9-]+(-my)?\.sharepoint\.com\//i.test(String(u || '')); }

  /* ============================================================
     Mock audit
     ------------------------------------------------------------
     Checkpoint as the certification auditor: a sample of controls,
     risks and actions, plus the records every audit opens (scope,
     policy, internal audit, management review), each tested the way an
     auditor tests it. Deterministic for a given seed, so the same
     sample can be re-run after fixing. Findings are graded Major
     (the management system is missing something required), Minor (a
     requirement is not met for one item) or Observation. */
  function seededPick(list, n, seed) {
    var h = 2166136261;
    String(seed || '').split('').forEach(function (ch) { h ^= ch.charCodeAt(0); h = (h * 16777619) >>> 0; });
    var arr = (list || []).slice(), out = [];
    while (arr.length && out.length < n) {
      h = (h * 1103515245 + 12345) >>> 0;
      out.push(arr.splice(h % arr.length, 1)[0]);
    }
    return out;
  }
  function mockAudit(d, today, seed) {
    d = d || {};
    var F = [];
    var add = function (sev, area, ref, text, fix) { F.push({ severity: sev, area: area, ref: ref || '', text: text, fix: fix || null }); };
    var within = function (dt, days) { return dt && daysBetweenDateStr(String(dt).slice(0, 10), today) <= days; };
    /* The records every audit opens. */
    if (!String(d.scopeStatement || '').trim()) add('Major', 'Scope', '4.3', 'No ISMS scope statement is recorded.', { action: 'App.orgProfileWizard', label: 'Answer the scope questions' });
    var policy = (d.docs || []).find(function (x) { return /information security policy/i.test(x.name || ''); });
    if (!policy) add('Major', 'Policy', '5.2', 'There is no information security policy.', { action: 'App.go', id: 'documents', label: 'Generate it' });
    else if (policy.status !== 'Approved') add('Major', 'Policy', '5.2', 'The information security policy is not approved.', { action: 'App.go', id: 'documents', label: 'Request approval' });
    var audit = (d.audits || []).filter(function (a) { return a && a.status === 'Completed' && within(a.completed, 365); })
      .sort(function (a, b) { return String(b.completed).localeCompare(String(a.completed)); })[0];
    if (!audit) add('Major', 'Internal audit', '9.2', 'No internal audit has been completed in the last 12 months.', { action: 'App.go', id: 'audits', label: 'Plan the internal audit' });
    var review = (d.reviews || []).filter(function (r) { return r && within(r.date, 365); }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0];
    if (!review) add('Major', 'Management review', '9.3', 'No management review has been held in the last 12 months.', { action: 'App.go', id: 'reviews', label: 'Hold the management review' });
    else if (!review.decisions) add('Minor', 'Management review', '9.3.3', 'The latest management review (' + review.date + ') records no decisions or outputs.', { action: 'App.go', id: 'reviews', label: 'Record the outputs' });
    else if (audit && review.date < audit.completed) add('Observation', 'Management review', '9.3.2', 'The latest management review was held before the latest internal audit, so it could not consider its results.', { action: 'App.go', id: 'reviews', label: 'Review the audit results' });
    var openNc = (d.actions || []).filter(function (a) { return a && a.type === 'Non-conformity (Major)' && a.status !== 'Done' && a.status !== 'Cancelled'; });
    if (openNc.length) add('Major', 'Corrective action', '10.2', openNc.length + ' major nonconformit' + (openNc.length === 1 ? 'y is' : 'ies are') + ' still open (' + openNc.map(function (a) { return a.id; }).join(', ') + ').', { action: 'App.openAction', id: openNc[0].id, label: 'Open it' });
    /* The sample. Implemented controls first, as an auditor tests what
       is claimed. */
    var ctrls = (d.controls || []).filter(function (c) { return c && c.app; });
    var claimed = ctrls.filter(function (c) { return c.st === 'Implemented'; });
    var sampleC = seededPick(claimed, Math.min(7, claimed.length), seed + 'c').concat(seededPick(ctrls.filter(function (c) { return c.st !== 'Implemented'; }), 3, seed + 'n'));
    sampleC.forEach(function (c) {
      var key = c.fw + '|' + c.id;
      if (c.st === 'Implemented') {
        if (!c.evidenceUrl) add('Minor', 'Control', c.id, c.id + ' ' + (c.t || '') + ' is marked Implemented with no evidence.', { action: 'App.setControlEvidence', id: key, label: 'Link evidence' });
        else if (c.verified && !within(c.verified, 365)) add('Observation', 'Control', c.id, c.id + ' was last verified on ' + c.verified + ', over a year ago.', { action: 'App.verifyControl', id: key, label: 'Re-verify' });
        var ex = (d.expiredEvidence || {})[key];
        if (c.evidenceUrl && ex) add('Minor', 'Control', c.id, c.id + ' evidence is out of date: last changed ' + srDate(ex.modified) + ', current only until ' + srDate(ex.validUntil) + (ex.freq ? ' for a ' + String(ex.freq).toLowerCase() + ' activity' : '') + '.', { action: 'App.addControlEvidenceFiles', id: key, label: 'Add current evidence' });
        if (!c.own) add('Observation', 'Control', c.id, c.id + ' has no owner.', { action: 'App.setControlOwner', id: key, label: 'Set owner' });
      } else {
        add('Observation', 'Control', c.id, c.id + ' ' + (c.t || '') + ' is applicable but ' + String(c.st || 'Not started').toLowerCase() + '; the auditor will ask for the plan and date.', { action: 'App.openControlGuidance', id: key, label: 'Open' });
      }
    });
    var risks = (d.risks || []).filter(function (r) { return r && r.status !== 'Closed' && r.type !== 'Opportunity'; });
    var sampleR = seededPick(risks, 3, seed + 'r');
    sampleR.forEach(function (r) {
      if (!String(r.owner || '').trim()) add('Minor', 'Risk', r.id, r.id + ' has no risk owner (6.1.2 c).', { action: 'App.openRisk', id: r.id, label: 'Open' });
      var mine = (d.actions || []).filter(function (a) { return a && ((r.actions || []).indexOf(a.id) !== -1 || a.risk === r.id); });
      if ((r.treat || 'Treat') === 'Treat' && !mine.length) add('Minor', 'Risk', r.id, r.id + ' is being treated but has no treatment actions (6.1.3).', { action: 'App.openRisk', id: r.id, label: 'Add treatment' });
      if ((d.reviewOverdue || []).indexOf(r.id) !== -1) add('Observation', 'Risk', r.id, r.id + ' is overdue for review.', { action: 'App.openRisk', id: r.id, label: 'Review it' });
      if ((d.aboveAppetite || []).indexOf(r.id) !== -1 && !r.acceptedBy) add('Minor', 'Risk', r.id, r.id + ' is above the risk appetite with no residual risk acceptance recorded (6.1.3 f).', { action: 'App.openRisk', id: r.id, label: 'Open' });
    });
    var sampleA = seededPick((d.actions || []).filter(Boolean), 3, seed + 'a');
    sampleA.forEach(function (a) {
      var st = capaStatus(a);
      if (st.isNc && !st.complete) add(a.type === 'Non-conformity (Major)' ? 'Major' : 'Minor', 'Action', a.id, a.id + ' (' + a.type + '): ' + st.nextStep.toLowerCase() + '.', { action: 'App.openAction', id: a.id, label: 'Open' });
      else if (a.status === 'Done' && !a.evidenceUrl) add('Observation', 'Action', a.id, a.id + ' is completed with no evidence link.', { action: 'App.openAction', id: a.id, label: 'Open' });
      else if (a.status !== 'Done' && a.status !== 'Cancelled' && a.due && a.due < today) add('Observation', 'Action', a.id, a.id + ' is overdue (due ' + a.due + ').', { action: 'App.openAction', id: a.id, label: 'Open' });
    });
    /* Exclusions (6.1.3 d): an auditor reads every one, so these are
       not sampled. Unjustified, or relied on by a risk, is minor. */
    exclusionConflicts({ controls: d.controls, risks: d.risks, actions: d.actions, profile: d.profile }).forEach(function (x) {
      if (x.kind === 'unjustified' || x.kind === 'risk') add('Minor', 'Exclusion', x.id, x.text, { action: 'App.openControlGuidance', id: x.key, label: 'Open' });
    });
    /* Disposals (A.7.14): two assets retired in the last year, each
       needing its record complete. */
    var recentRetired = retiredAssets(d.assets || [], today, 365).rows.filter(function (x) { return x.recent; }).map(function (x) { return x.asset; });
    var sampleD = seededPick(recentRetired, 2, seed + 'd');
    sampleD.forEach(function (a) {
      var g = retirementGaps(a);
      if (g.length) add('Minor', 'Asset', a.id, a.id + ' (' + a.name + ') was retired with an incomplete disposal record: ' + g.join(', ') + ' (A.7.14).', { action: 'App.retireAsset', id: a.id, label: 'Complete record' });
    });
    var n = { Major: 0, Minor: 0, Observation: 0 };
    F.forEach(function (f) { n[f.severity]++; });
    var score = Math.max(0, 100 - 25 * n.Major - 8 * n.Minor - 2 * n.Observation);
    var verdict = n.Major ? 'Not ready: a certification auditor would raise a major nonconformity' : n.Minor > 2 ? 'Nearly ready: close the minor findings first' : 'Ready, with the observations noted';
    var rank = { Major: 0, Minor: 1, Observation: 2 };
    F.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });
    return {
      findings: F, counts: n, score: score, verdict: verdict,
      sample: { controls: sampleC.map(function (c) { return c.id; }), risks: sampleR.map(function (r) { return r.id; }), actions: sampleA.map(function (a) { return a.id; }), assets: sampleD.map(function (a) { return a.id; }), audit: audit ? audit.id || audit.completed : '', review: review ? review.date : '' }
    };
  }


  /* Stage 2: the ISMS operating. A Stage 2 auditor samples what
     happened over the period and asks for the record of each: leavers,
     new starters, incidents, document changes, recurring activities,
     treated risks and corrective actions. Same shape as mockAudit, so
     it is shown the same way. d = { auditLog, training, attestations,
     incidents, docs:[{name,status,approvedBy,approvedDate,nextReview}],
     calendar, risks, actions, lastResults } */
  function stage2DryRun(d, today, seed) {
    d = d || {};
    var F = [], sample = {};
    var add = function (sev, area, ref, text, fix) { F.push({ severity: sev, area: area, ref: ref || '', text: text, fix: fix || null }); };
    var since = addDaysIso(today, -365);
    var inYear = function (dt) { return dt && String(dt).slice(0, 10) >= since && String(dt).slice(0, 10) <= today; };
    /* Leavers: the hand-over, and access removed (dormant accounts check). */
    var leavers = (d.auditLog || []).filter(function (e) { return e && /^Leaver hand-over/.test(e.action || '') && inYear(e.entryDateTime); });
    var sl = seededPick(leavers, 3, seed + 'l');
    sample.leavers = sl.map(function (e) { return e.targetId || ''; });
    if (sl.length && (d.lastResults || {})['dormant-accounts'] === 'fail') add('Minor', 'Leavers', 'A.5.18', 'Leavers were handed over, but the last posture scan found enabled accounts nobody uses: show that each sampled leaver\u2019s access was removed (' + sample.leavers.join(', ') + ').', { action: 'App.go', id: 'scan', label: 'Open the scan' });
    if (!leavers.length) add('Observation', 'Leavers', 'A.6.5', 'No leavers recorded in the last 12 months. If anyone left, the auditor will ask for their offboarding record.', { action: 'App.go', id: 'actions', label: 'Open actions' });
    /* New starters: induction training and policy acknowledgement. */
    var firstSeen = {};
    (d.training || []).concat(d.attestations || []).forEach(function (t) { var u = String((t && t.upn) || '').toLowerCase(); if (u && t.assigned && (!firstSeen[u] || t.assigned < firstSeen[u])) firstSeen[u] = t.assigned; });
    var starters = Object.keys(firstSeen).filter(function (u) { return inYear(firstSeen[u]); });
    var ss = seededPick(starters, 3, seed + 's');
    sample.starters = ss;
    ss.forEach(function (u) {
      var trained = (d.training || []).some(function (t) { return String(t.upn || '').toLowerCase() === u && t.status === 'Completed'; });
      var acked = (d.attestations || []).some(function (t) { return String(t.upn || '').toLowerCase() === u && t.status === 'Acknowledged'; });
      if (!trained) add('Minor', 'New starters', 'A.6.3', u + ' has no completed awareness training.', { action: 'App.go', id: 'training', label: 'Open training' });
      if (!acked) add('Minor', 'New starters', 'A.5.10', u + ' has not acknowledged the policies.', { action: 'App.go', id: 'attestations', label: 'Open acknowledgements' });
    });
    /* Incidents: handled, with root cause and lessons. */
    var inc = (d.incidents || []).filter(function (n) { return n && inYear(n.detected || n.occurred); });
    var si = seededPick(inc, 3, seed + 'i');
    sample.incidents = si.map(function (n) { return n.id; });
    si.forEach(function (n) {
      if (n.status !== 'Closed') { if (daysBetweenDateStr(String(n.detected || n.occurred).slice(0, 10), today) > 30) add('Minor', 'Incidents', 'A.5.26', n.id + ' has been open for over 30 days.', { action: 'App.openIncident', id: n.id, label: 'Open' }); return; }
      if (!String(n.rootCause || '').trim()) add('Minor', 'Incidents', 'A.5.27', n.id + ' was closed with no root cause.', { action: 'App.openIncident', id: n.id, label: 'Open' });
      if (!String(n.lessonsLearned || '').trim()) add('Observation', 'Incidents', 'A.5.27', n.id + ' was closed with no lessons learned.', { action: 'App.openIncident', id: n.id, label: 'Open' });
      if (n.isPrivacyBreach && !n.assessmentComplete) add('Minor', 'Incidents', 'A.5.34', n.id + ' involved personal information and its breach assessment is not complete.', { action: 'App.openIncident', id: n.id, label: 'Open' });
    });
    /* Document changes: approved, by whom, and reviewed on time. */
    var docs = (d.docs || []).filter(function (x) { return x && x.status === 'Approved'; });
    var sd = seededPick(docs, 3, seed + 'd');
    sample.documents = sd.map(function (x) { return x.name; });
    sd.forEach(function (x) {
      if (!x.approvedBy) add('Minor', 'Documents', '7.5.2', String(x.name).replace(/\.html$/i, '') + ' is approved with no approver recorded.', { action: 'App.go', id: 'documents', label: 'Open documents' });
      if (x.nextReview && x.nextReview < today) add('Minor', 'Documents', '7.5.3', String(x.name).replace(/\.html$/i, '') + ' is past its review date (' + srDate(x.nextReview) + ').', { action: 'App.go', id: 'documents', label: 'Open documents' });
    });
    /* Recurring activities: done on time, with evidence. */
    var acts = (d.calendar || []).filter(function (c) { return c && calendarItemLive(c) && rhythmDefFor(c); });
    var sc = seededPick(acts, 3, seed + 'c');
    sample.activities = sc.map(function (c) { return c.id; });
    sc.forEach(function (c) {
      if (!c.lastCompleted || !inYear(c.lastCompleted)) add('Minor', 'Operating rhythm', (rhythmDefFor(c).controls || [])[0] || '', c.title + ' has not been done in the last 12 months.', { action: 'App.editCalItem', id: c.id, label: 'Open' });
      else if (!rhythmLastEvidence(c.notes)) add('Observation', 'Operating rhythm', (rhythmDefFor(c).controls || [])[0] || '', c.title + ' was done on ' + srDate(c.lastCompleted) + ' with no evidence recorded.', { action: 'App.editCalItem', id: c.id, label: 'Open' });
      if (c.nextDue && c.nextDue < today) add('Observation', 'Operating rhythm', '', c.title + ' was due on ' + srDate(c.nextDue) + '.', { action: 'App.editCalItem', id: c.id, label: 'Open' });
    });
    /* Treated risks: the treatment is happening. */
    var treated = (d.risks || []).filter(function (r) { return r && r.status !== 'Closed' && /treat/i.test(r.treat || ''); });
    var sr = seededPick(treated, 3, seed + 'r');
    sample.risks = sr.map(function (r) { return r.id; });
    sr.forEach(function (r) {
      var mine = (d.actions || []).filter(function (a) { return a && ((r.actions || []).indexOf(a.id) !== -1 || a.risk === r.id); });
      if (!mine.length) add('Minor', 'Risk treatment', '8.3', r.id + ' is being treated but has no treatment actions.', { action: 'App.openRisk', id: r.id, label: 'Open' });
      else if (mine.some(function (a) { return DONE_ACTION(a) && a.status === 'Done' && !a.evidenceUrl; })) add('Observation', 'Risk treatment', '8.3', r.id + ' has completed treatment actions with no evidence.', { action: 'App.openRisk', id: r.id, label: 'Open' });
    });
    /* Corrective actions: effectiveness checked. */
    var ncs = (d.actions || []).filter(function (a) { return a && /^Non-conformity/.test(a.type || '') && (a.status === 'Done' || a.status === 'Closed'); });
    var sn = seededPick(ncs, 2, seed + 'n');
    sample.corrective = sn.map(function (a) { return a.id; });
    sn.forEach(function (a) {
      if (!String(a.rootCause || '').trim()) add('Minor', 'Corrective action', '10.2', a.id + ' was closed with no root cause.', { action: 'App.openAction', id: a.id, label: 'Open' });
      if (!String(a.effectivenessReview || '').trim()) add('Minor', 'Corrective action', '10.2', a.id + ' was closed with no check that the action worked.', { action: 'App.openAction', id: a.id, label: 'Open' });
    });
    var n = { Major: 0, Minor: 0, Observation: 0 };
    F.forEach(function (f) { n[f.severity]++; });
    var score = Math.max(0, 100 - 25 * n.Major - 8 * n.Minor - 2 * n.Observation);
    var verdict = n.Minor > 4 ? 'Not ready for Stage 2: the operating records have gaps an auditor will find' : n.Minor ? 'Nearly ready: close the minor findings before Stage 2' : 'Ready for Stage 2, with the observations noted';
    var rank = { Major: 0, Minor: 1, Observation: 2 };
    F.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });
    return { findings: F, counts: n, score: score, verdict: verdict, sample: sample, kind: 'stage2' };
  }

  /* ============================================================
     Annex A exclusions (ISO 27001 Clause 6.1.3 d)
     ------------------------------------------------------------
     Exclusions the scope answers support, each with a justification
     an auditor can accept, and the controls that stay applicable
     however remote the organisation is. Proposals only: nothing is
     excluded until a practitioner confirms it. */
  var NO_PREMISES_JUST = 'The organisation has no premises of its own: everyone works remotely and information is held in cloud services. Physical security of the providers’ facilities is assured through supplier controls (A.5.19 to A.5.23).';
  var EXCLUSION_RULES = [
    { key: 'no-premises', fw: 'iso27001',
      when: function (p) { return p.orgPremises === 'none' || (!p.orgPremises && p.orgWorkModel === 'remote'); },
      why: function (p) { return p.orgPremises === 'none' ? 'You told us the organisation has no premises of its own.' : 'You told us people work fully remotely. Confirm there is no office before excluding these.'; },
      controls: ['A.7.1', 'A.7.2', 'A.7.3', 'A.7.4', 'A.7.6', 'A.7.11', 'A.7.12'],
      justification: NO_PREMISES_JUST },
    { key: 'no-secure-areas', fw: 'iso27001',
      when: function (p) { return p.orgPremises === 'office'; },
      why: function () { return 'You told us the organisation has an office but no server room or other secure area.'; },
      controls: ['A.7.6'],
      justification: 'The organisation’s office has no secure areas such as a server room or data centre; information processing equipment is held by cloud providers, assured through supplier controls (A.5.19 to A.5.23).' },
    { key: 'no-development', fw: 'iso27001',
      when: function (p) { return p.orgDevelops === 'no'; },
      why: function () { return 'You told us the organisation does not develop its own software.'; },
      controls: ['A.8.25', 'A.8.28', 'A.8.31'],
      justification: 'The organisation does not develop software; it uses commercial and SaaS products. Security requirements for acquired applications are covered by A.8.26 and the supplier controls.' },
    { key: 'no-outsourced-development', fw: 'iso27001',
      when: function (p) { return p.orgDevelops === 'no' || p.orgDevelops === 'yes'; },
      why: function (p) { return p.orgDevelops === 'yes' ? 'You told us development is done by your own developers, not outsourced.' : 'You told us the organisation does not develop software.'; },
      controls: ['A.8.30'],
      justification: 'The organisation does not outsource software development.' }
  ];
  /* Controls that still apply to people working from home or on the
     move. Excluding one of these in a remote or hybrid organisation is
     the exclusion an auditor challenges. */
  var REMOTE_APPLICABLE = {
    'A.6.7': 'remote working is how this organisation works',
    'A.7.5': 'home offices still face fire, flood and power loss',
    'A.7.7': 'clear desk and screen applies at home and in shared spaces',
    'A.7.8': 'equipment at home still has to be sited and protected',
    'A.7.9': 'laptops and phones are assets used off-premises',
    'A.7.10': 'USB drives, printouts and other media still exist',
    'A.7.13': 'laptops still need maintaining',
    'A.7.14': 'laptops are still disposed of or re-issued'
  };
  function remoteApplicableReason(id, profile) {
    var p = profile || {};
    if (p.orgWorkModel !== 'remote' && p.orgWorkModel !== 'hybrid' && p.orgPremises !== 'none') return '';
    return REMOTE_APPLICABLE[id] || '';
  }
  /* Groups whose controls are still in scope. controls: the tenant's
     control rows; dismissed: rule keys set aside. */
  function suggestedExclusions(profile, controls, dismissed) {
    var p = profile || {}, gone = {};
    (dismissed || []).forEach(function (k) { gone[k] = 1; });
    var byKey = {};
    (controls || []).forEach(function (c) { if (c) byKey[c.fw + '|' + c.id] = c; });
    return EXCLUSION_RULES.filter(function (r) { return !gone[r.key] && r.when(p); }).map(function (r) {
      var open = r.controls.map(function (id) { return byKey[r.fw + '|' + id]; }).filter(function (c) { return c && c.app; });
      return { key: r.key, why: r.why(p), justification: r.justification, controls: open };
    }).filter(function (g) { return g.controls.length; });
  }
  /* The justification a rule would give this control, if any. */
  function suggestedJustification(c, profile) {
    var p = profile || {};
    var r = EXCLUSION_RULES.find(function (x) { return x.fw === (c && c.fw) && x.controls.indexOf(c.id) !== -1 && x.when(p); });
    return r ? r.justification : '';
  }
  /* Exclusions that contradict the rest of the system. d = { controls,
     risks, actions, profile }. One entry per problem, worst first. */
  function exclusionConflicts(d) {
    var out = [];
    var risks = (d.risks || []).filter(function (r) { return r && r.status !== 'Closed'; });
    var acts = (d.actions || []).filter(function (a) { return a && ['Done', 'Closed', 'Cancelled'].indexOf(a.status) === -1; });
    (d.controls || []).forEach(function (c) {
      if (!c || c.app) return;
      var key = c.fw + '|' + c.id;
      var add = function (kind, sev, text) { out.push({ key: key, id: c.id, fw: c.fw, kind: kind, severity: sev, text: text }); };
      if (!String(c.just || '').trim()) add('unjustified', 'Minor', c.id + ' is excluded with no justification (Clause 6.1.3 d).');
      if (c.fw === 'iso27001') {
        var rs = risks.filter(function (r) { return (r.controls || []).indexOf(c.id) !== -1; });
        if (rs.length) add('risk', 'Minor', c.id + ' is excluded, but ' + rs.map(function (r) { return r.id; }).join(', ') + ' relies on it to treat ' + (rs.length === 1 ? 'a risk' : 'risks') + '.');
        var as = acts.filter(function (a) { return a.control === c.id; });
        if (as.length) add('action', 'Observation', c.id + ' is excluded, but ' + as.map(function (a) { return a.id; }).join(', ') + ' (open) ' + (as.length === 1 ? 'is' : 'are') + ' implementing it.');
        var remote = remoteApplicableReason(c.id, d.profile);
        if (remote) add('remote', 'Observation', c.id + ' is excluded, but it usually applies to remote and home working: ' + remote + '.');
      }
      if (c.evidenceUrl) add('evidence', 'Observation', c.id + ' is excluded but has evidence linked, which suggests it is operating. Include it, or remove the link.');
    });
    var rank = { Minor: 0, Observation: 1 };
    out.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });
    return out;
  }
  /* The exclusions as one sentence for the scope document: controls
     sharing a justification are listed together. */
  function exclusionsStatement(controls, fw) {
    var ex = (controls || []).filter(function (c) { return c && !c.app && (!fw || c.fw === fw); });
    if (!ex.length) return 'none — every Annex A control is applicable.';
    var groups = [], byJust = {};
    ex.forEach(function (c) {
      var j = String(c.just || '').trim() || pendingMarker('exclusion justification in the Statement of Applicability');
      if (!byJust[j]) { byJust[j] = { just: j, ids: [] }; groups.push(byJust[j]); }
      byJust[j].ids.push(c.id);
    });
    return groups.map(function (g) { return g.ids.join(', ') + ': ' + g.just.replace(/\.\s*$/, ''); }).join('; ') + '.';
  }


  /* ============================================================
     Monthly security review
     ------------------------------------------------------------
     A standing monthly meeting where leadership oversees the ISMS
     (Clauses 5.1 and 9.1). Every third meeting adds the quarterly
     items; the twelfth is held as the Clause 9.3 management review.
     The agenda is generated from a pack of live figures, so the
     meeting reviews numbers rather than collects them.
     setup = { chair, owner, facilitator, attendees, emails, week (1-4
     or 'last'), weekday (1 = Monday), time 'HH:MM', minutes, teamsLink,
     autoSend 'true' }. */
  /* The monthly meeting covers what leadership needs to steer: actions,
     risks, incidents and the security posture, then decisions. An item
     with nothing new is reported in one line, not given time.
     Certification progress appears only until the certificate is
     issued; people and suppliers only when something changed. The
     clause each item evidences is kept for the evidence document, not
     shown on the agenda people read. */
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
  /* Base length by meeting kind, in minutes, for a 30-minute monthly
     setting; a longer setting scales every meeting with it. */
  var SECURITY_REVIEW_LENGTH = { kickoff: 50, monthly: 30, quarterly: 45, mr: 60 };
  /* mrEvery: how often (in meetings, so months) the meeting is held as
     the Clause 9.3 management review: 3, 6 or 12. */
  function securityReviewKind(n, mrEvery) {
    n = Number(n) || 1;
    var every = [3, 6, 12].indexOf(Number(mrEvery)) !== -1 ? Number(mrEvery) : 12;
    if (n === 1) return 'kickoff';
    if (n % every === 0) return 'mr';
    if (n % 3 === 0) return 'quarterly';
    return 'monthly';
  }
  var SECURITY_REVIEW_KIND_LABEL = { kickoff: 'Kick-off', monthly: 'Monthly', quarterly: 'Quarterly', mr: 'Management review (Clause 9.3)' };
  /* Extra standing items, one per line: "title | minutes | lead | quarterly". */
  function parseSecurityReviewItems(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line, i) {
      var p = line.split('|').map(function (x) { return x.trim(); });
      if (!p[0]) return;
      var min = Math.max(1, Math.min(60, parseInt(p[1], 10) || 5));
      out.push({ key: 'c' + (i + 1) + '-' + p[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24), title: p[0].slice(0, 120), min: min, lead: p[2] || 'owner', clause: '', every: /quarter/i.test(p[3] || '') ? 'quarterly' : 'monthly', custom: true });
    });
    return out;
  }
  function securityReviewItemsText(items) {
    return (items || []).map(function (i) { return [i.title, i.min, i.lead || 'owner'].concat(i.every === 'quarterly' ? ['quarterly'] : []).join(' | '); }).join('\n');
  }
  /* A wall-clock time in an IANA time zone, as a UTC instant (ISO). The
     meeting slot is set in the client's local time; the scheduled
     function runs in UTC and must send the same invite. */
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
  /* The meeting day in a month: the nth weekday (week 1-4) or the last. */
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
  /* The next meeting date on or after `from`. */
  function nextSecurityReviewDate(setup, from) {
    var f = String(from).slice(0, 10), y = Number(f.slice(0, 4)), m = Number(f.slice(5, 7)) - 1;
    for (var i = 0; i < 3; i++) {
      var d = securityReviewDayIn(y + Math.floor((m + i) / 12), (m + i) % 12, setup);
      if (d >= f) return d;
    }
    return '';
  }
  /* `days` working days before a date (weekends skipped). */
  function workingDaysBefore(date, days) {
    var d = new Date(String(date).slice(0, 10) + 'T00:00:00Z'), n = 0;
    if (isNaN(d)) return '';
    while (n < days) { d.setUTCDate(d.getUTCDate() - 1); var w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return d.toISOString().slice(0, 10);
  }
  /* The figures each agenda item is answered from. d = { today, since,
     scans, actions, prevActionIds, incidents, risks, aboveAppetite,
     auditLog, vendors, docs, readiness, nextAudit, objectives, calendar,
     attestPct, failing, lastHeld }. lastHeld = the date of the last
     meeting held: an action already overdue then and still overdue now
     is put to the chair. Lists are capped: a pack is read, not mined. */
  function buildSecurityReviewPack(d) {
    var today = d.today, since = d.since || addDaysIso(today, -31);
    var scans = (d.scans || []).filter(function (s) { return s && typeof s.score === 'number'; }).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var last = scans[scans.length - 1] || null;
    var prev = scans.filter(function (s) { return String(s.date).slice(0, 10) <= since; }).pop() || (scans.length > 1 ? scans[0] : null);
    var acts = d.actions || [];
    var openA = acts.filter(function (a) { return a && !DONE_ACTION(a) && a.status !== 'Closed'; });
    var overdueA = openA.filter(function (a) { return a.due && a.due < today; }).sort(function (a, b) { return a.due.localeCompare(b.due); });
    var log = (d.auditLog || []).filter(function (e) { return String(e.entryDateTime || '').slice(0, 10) >= since; });
    var countLog = function (re, type) { return log.filter(function (e) { return (!type || e.targetType === type) && re.test(e.action || ''); }).length; };
    var short = function (a) { return { id: a.id, title: a.title, owner: a.owner || '', due: a.due || '', status: a.status }; };
    var inc = (d.incidents || []).filter(function (n) { return String(n.detected || n.occurred || '').slice(0, 10) >= since; });
    var openRisks = (d.risks || []).filter(function (r) { return r && r.status !== 'Closed'; });
    var soon = addDaysIso(today, 60);
    var q = d.calendar || [];
    var access = q.filter(function (c) { var r = rhythmDefFor(c); return r && r.key === 'access-review'; }).map(function (c) { return c.lastCompleted || ''; }).sort().pop() || '';
    var vend = d.vendors || [];
    var obj = (d.objectives || []).filter(function (o) { return o && o.status !== 'Achieved' && o.status !== 'Closed'; });
    return {
      today: today, since: since,
      attendance: { missedTwice: ((d.absences || {}).missedTwice || []).slice(0, 4), lastQuorum: (d.absences || {}).lastQuorum !== false },
      posture: { score: last ? last.score : null, prev: prev && prev !== last ? prev.score : null, failing: typeof d.failing === 'number' ? d.failing : null, failingTop: (d.failingTop || []).slice(0, 3) },
      actions: { open: openA.length, overdue: overdueA.length, closedSince: countLog(/^Action (completed|closed)|^Corrective action/i, 'Action'),
        overdueList: overdueA.slice(0, 8).map(short),
        stuck: d.lastHeld ? overdueA.filter(function (a) { return a.due < d.lastHeld; }).slice(0, 6).map(short) : [],
        prior: (d.prevActionIds || []).map(function (id) { return acts.find(function (a) { return a.id === id; }); }).filter(Boolean).map(short) },
      incidents: { since: inc.slice(0, 8).map(function (n) { return { id: n.id, title: n.title, severity: n.severity || '', status: n.status || '' }; }), count: inc.length,
        open: (d.incidents || []).filter(function (n) { return n.status && n.status !== 'Closed'; }).length },
      risks: { open: openRisks.length, aboveAppetite: (d.aboveAppetite || []).length, aboveList: (d.aboveAppetite || []).slice(0, 6),
        added: countLog(/added|approved|raised|created/i, 'Risk'), changed: countLog(/scor|residual|reviewed|treatment|accepted/i, 'Risk') },
      certification: { readiness: typeof d.readiness === 'number' ? d.readiness : null, docsAwaiting: (d.docs || []).filter(function (x) { return x.status && x.status !== 'Approved'; }).length, nextAudit: d.nextAudit || '', certified: !!d.certified },
      people: { handovers: countLog(/^Leaver hand-over/), retired: countLog(/^Asset retired/), vendorsAdded: countLog(/^Vendor added/),
        certsExpiring: vend.filter(function (v) { return v.certExpiryDate && v.certExpiryDate >= today && v.certExpiryDate <= soon; }).map(function (v) { return v.name; }).slice(0, 6) },
      quarterly: { accessReview: access, suppliersDue: vend.filter(function (v) { return vendorNextReview(v, today) <= addDaysIso(today, 30); }).length,
        objectives: { open: obj.length, atRisk: obj.filter(function (o) { return /risk|behind|off/i.test(o.status || ''); }).length },
        attestPct: typeof d.attestPct === 'number' ? d.attestPct : null }
    };
  }
  /* One line or two per item: what the meeting is asked to look at. */
  function srDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? Number(m[3]) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1] + ' ' + m[1] : String(iso || '');
  }
  function securityReviewFacts(key, p) {
    var f = [];
    var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
    if (!p) return f;
    if (key === 'actions') {
      var prior = p.actions.prior || [];
      if (prior.length) f.push('Decisions from last meeting: ' + prior.filter(function (a) { return DONE_ACTION(a) || a.status === 'Closed'; }).length + ' of ' + prior.length + ' done');
      var stuckIds = (p.actions.stuck || []).map(function (a) { return a.id; });
      var rest = p.actions.overdueList.filter(function (a) { return stuckIds.indexOf(a.id) === -1; });
      f.push(p.actions.overdue ? plural(p.actions.overdue, 'action') + ' overdue' + (stuckIds.length ? ' (' + stuckIds.length + ' for a decision below)' : '') + (rest.length > 3 ? ', the three oldest:' : rest.length && stuckIds.length ? ', the others:' : '') : 'Nothing overdue; ' + plural(p.actions.open, 'action') + ' open');
      rest.slice(0, 3).forEach(function (a) { f.push(a.id + ' ' + a.title + (a.owner ? ' (' + a.owner + ')' : '')); });
    } else if (key === 'escalations') {
      (p.actions.stuck || []).forEach(function (a) { f.push(a.id + ' ' + a.title + (a.owner ? ' (' + a.owner + ')' : '') + ', overdue since ' + srDate(a.due) + ': extend, reassign or accept the risk'); });
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
      f.push('The Clause 9.3 inputs are pre-filled in Checkpoint; read them beforehand and agree any changes to the ISMS, its resources and its objectives');
    }
    return f;
  }
  /* "Nothing to report" for an item with nothing new; '' when it needs time. */
  function securityReviewQuiet(key, p) {
    if (key === 'escalations' && !(p && p.actions && (p.actions.stuck || []).length)) return 'skip';
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
  /* The timed agenda for meeting n. rec (optional) = the meeting's own
     changes: extra (items added for this meeting), skip (keys dropped)
     and order (keys, in order). Items with nothing new are listed under
     `quiet` instead of being timed; the time scales to the meeting
     length set (setup.length: 30, 45 or 60 for a monthly meeting). */
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
    if (diff && Math.abs(diff) <= 3) {
      var big = mins.length - 1;
      mins.forEach(function (m, i) { if (!items[i].added && (items[big].added || m > mins[big])) big = i; });
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
    return { n: Number(n) || 1, kind: kind, label: SECURITY_REVIEW_KIND_LABEL[kind], minutes: t, items: out, quiet: quiet,
      evidences: kind === 'mr' ? 'ISO/IEC 27001 Clauses 9.1 and 9.3 (management review)' : 'ISO/IEC 27001 Clause 9.1 (monitoring, measurement, analysis and evaluation)' };
  }
  /* A traffic light per area, for the one-page pre-read. */
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
  /* A week after a meeting: the owners of its decisions that have not
     moved (still Open). reviews = meeting records; actions = register. */
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
  /* The meeting the schedule is on, and what is due for it today:
     prepare (two working days before), send, and a reminder to record
     the minutes the day after. Shared by the browser and the scheduled
     function so both decide the same way. */
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
  /* The agenda and pack as an email. meta = { org, date, time, teamsLink, appUrl }. */
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
  /* A calendar invite. startUtc / endUtc = ISO instants. description =
     plain text; html (optional) = the same as formatted text, which
     Outlook and Teams show in the invite body. Lines are folded at 75
     octets as RFC 5545 requires. */
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
  /* The invite's own text: the traffic lights and the agenda, so the
     pre-read is in Outlook and Teams without opening the email. */
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
  /* The minutes as an email: notes and decisions against each item. */
  function securityReviewMinutesHtml(agenda, rec, actions, meta) {
    var e = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var m = meta || {}, r = rec || {}, notes = r.itemNotes || {}, by = r.decisionItem || {};
    var acts = actions || [];
    return '<div style="font-family:Arial,sans-serif;color:#222;max-width:680px">' +
      '<h2 style="margin-bottom:4px">Minutes: ' + e(m.org || 'Security') + ' security review ' + agenda.n + '</h2>' +
      '<p style="color:#666;font-size:13px;margin-top:0">' + e(m.date) + ' \u00b7 ' + e(agenda.label) + ' \u00b7 Present: ' + e(r.present || 'not recorded') + '</p>' +
      ((r.attendance && r.attendance.absent && r.attendance.absent.length) ? '<p style="color:#666;font-size:13px;margin-top:0">Absent: ' + e(r.attendance.absent.join(', ')) + (r.attendance.quorum === false ? ' \u00b7 <b style="color:#c0392b">held without the chair or the ISMS owner</b>' : '') + '</p>' : '') +
      (r.outcome ? '<p style="font-size:15px;margin:12px 0;padding:10px 12px;background:#f4f6f8;border-left:3px solid #2e86c1"><b>Outcome:</b> ' + e(r.outcome) + '</p>' : '') +
      agenda.items.map(function (i) {
        var mine = acts.filter(function (a) { return by[a.id] === i.key; });
        var esc8 = i.key === 'escalations' ? securityReviewEscalationLines(r) : [];
        if (!notes[i.key] && !mine.length && !esc8.length) return '';
        return '<h3 style="font-size:14px;margin:16px 0 4px">' + e(i.title) + '</h3>' +
          (esc8.length ? '<ul style="font-size:13px;margin:0 0 6px 16px;padding:0">' + esc8.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>' : '') +
          (notes[i.key] ? '<p style="font-size:13px;margin:0;white-space:pre-wrap">' + e(notes[i.key]) + '</p>' : '') +
          (mine.length ? '<ul style="font-size:13px;margin:6px 0 0 16px;padding:0">' + mine.map(function (a) { return '<li><b>' + e(a.id) + '</b> ' + e(a.title) + ' \u2014 ' + e(a.owner || 'unassigned') + (a.due ? ', due ' + e(a.due) : '') + '</li>'; }).join('') + '</ul>' : '');
      }).join('') +
      (acts.length ? '<h3 style="font-size:14px;margin:20px 0 4px">All actions agreed</h3><table style="width:100%;border-collapse:collapse;font-size:13px">' + acts.map(function (a) { return '<tr><td style="padding:6px;border-bottom:1px solid #eee"><b>' + e(a.id) + '</b></td><td style="padding:6px;border-bottom:1px solid #eee">' + e(a.title) + '</td><td style="padding:6px;border-bottom:1px solid #eee">' + e(a.owner || '') + '</td><td style="padding:6px;border-bottom:1px solid #eee;white-space:nowrap">' + e(a.due || '') + '</td></tr>'; }).join('') + '</table>' : '<p style="font-size:13px">No actions agreed.</p>') +
      (/^https:\/\//i.test(m.appUrl || '') ? '<p style="margin-top:16px"><a href="' + e(m.appUrl) + '">Open Checkpoint</a> to update your actions.</p>' : '') +
      '<p style="color:#999;font-size:11px;margin-top:24px">Recorded in Checkpoint.</p></div>';
  }
  /* The chair's decision on each action put to them: one line each. */
  function securityReviewEscalationLines(rec) {
    var x = (rec && rec.escalations) || {};
    return Object.keys(x).map(function (id) {
      var d = x[id] || {};
      return id + ' ' + (d.title || '') + ': ' + (d.choice === 'extend' ? 'extended to ' + srDate(d.due) : d.choice === 'reassign' ? 'reassigned to ' + (d.owner || '') + (d.due ? ', due ' + srDate(d.due) : '') : 'risk accepted' + (d.risk ? ' on ' + d.risk : '') + (d.reason ? ' (' + d.reason + ')' : '') + (d.reviewBy ? ', look again by ' + srDate(d.reviewBy) : '')) + (d.by ? ', by ' + d.by : '');
    });
  }
  /* Who was expected (the roles set in the review settings) and who was
     there. A name counts as present when the attendance text names it,
     or its surname. Quorum = the chair and the ISMS owner both there. */
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
  /* People expected at both of the last two meetings held and at
     neither: raised at the next meeting. */
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
  /* What top management did over a period, for Clause 5.1 and 9.3:
     meetings chaired, outcomes, decisions on stuck actions, residual
     risks accepted and management reviews held. */
  function topManagementRecord(d) {
    var since = d.since || '', setup = d.setup || {};
    var held = (d.reviews || []).filter(function (r) { return r && r.status === 'Held' && (!since || r.date >= since); }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    var meetings = held.map(function (r) {
      var at = securityReviewAttendance(r.present, setup);
      var chair = at.expected.find(function (e) { return e.key === 'chair'; });
      return { id: r.id, n: r.n, date: r.date, kind: r.kind || '', outcome: r.outcome || '', chairPresent: chair ? chair.present : null, quorum: at.quorum,
        absent: at.absent, decisions: (r.actions || []).length, escalations: securityReviewEscalationLines(r), reviewId: r.reviewId || '' };
    });
    var accepted = (d.risks || []).filter(function (r) { return r && r.acceptedBy && (!since || String(r.acceptedDate || '') >= since); })
      .map(function (r) { return { id: r.id, title: r.title || '', by: r.acceptedBy, date: r.acceptedDate || '', note: r.acceptanceNote || '', score: r.acceptedScore == null ? null : r.acceptedScore }; })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var mrs = (d.managementReviews || []).filter(function (m) { return m && (!since || String(m.date || '') >= since); }).map(function (m) { return { id: m.id, date: m.date, attendees: m.attendees || '' }; })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var chaired = meetings.filter(function (m) { return m.chairPresent; }).length;
    var decisions = meetings.reduce(function (n, m) { return n + m.escalations.length; }, 0);
    return { since: since, meetings: meetings, accepted: accepted, managementReviews: mrs,
      summary: meetings.length ? meetings.length + ' security review' + (meetings.length === 1 ? '' : 's') + ' held' + (setup.chair ? ', ' + chaired + ' chaired by ' + setup.chair : '') +
        '; ' + decisions + ' decision' + (decisions === 1 ? '' : 's') + ' on overdue actions; ' + accepted.length + ' residual risk' + (accepted.length === 1 ? '' : 's') + ' accepted; ' +
        mrs.length + ' management review' + (mrs.length === 1 ? '' : 's') + '.' : 'No security reviews held in this period.' };
  }
  /* Clauses whose recurring obligation has lapsed: what an auditor
     finds first. d = { today, audits, managementReviews, auditMonths,
     mrMonths, risks, training, scans, securityReviews, securityReviewOn,
     docs:[{name,status,nextReview}], actions, clausesOverdue:[labels] }.
     Returns [{ clause, title, issue, view, fix, severity }], the most
     serious first. */
  function clauseCadenceGaps(d) {
    var today = d.today, out = [];
    var add = function (clause, title, issue, view, fix, severity) { out.push({ clause: clause, title: title, issue: issue, view: view, fix: fix, severity: severity || 'warn' }); };
    var ago = function (n) { return addDaysIso(today, -n); };
    var last = function (list, key) { return (list || []).map(function (x) { return String((x && x[key]) || '').slice(0, 10); }).filter(Boolean).sort().pop() || ''; };
    var auditMonths = Number(d.auditMonths) || 12, mrMonths = Number(d.mrMonths) || 12;
    var la = last((d.audits || []).filter(function (a) { return a && a.status === 'Completed' && (!a.fw || a.fw === 'iso27001'); }), 'completed');
    if (!la) add('9.2', 'Internal audit', 'No internal audit completed yet', 'audits', 'Plan the internal audit', 'fail');
    else if (addMonthsIso(la, auditMonths) < today) add('9.2', 'Internal audit', 'Overdue: last completed ' + srDate(la) + ', due every ' + auditMonths + ' months', 'audits', 'Plan the next internal audit', 'fail');
    var lm = last(d.managementReviews, 'date');
    if (!lm) add('9.3', 'Management review', 'No management review recorded yet', 'reviews', 'Hold the management review', 'fail');
    else if (addMonthsIso(lm, mrMonths) < today) add('9.3', 'Management review', 'Overdue: last held ' + srDate(lm) + ', due every ' + mrMonths + ' months', 'reviews', 'Hold the management review', 'fail');
    var open = (d.risks || []).filter(function (r) { return r && r.status !== 'Closed'; });
    if (!open.length) add('6.1.2', 'Risk assessment', 'No risks in the register', 'risks', 'Assess the risks', 'fail');
    else {
      var stale = open.filter(function (r) { return String(r.lastReviewed || '').slice(0, 10) < ago(365); }).length;
      if (stale) add('6.1.2', 'Risk assessment', stale + ' of ' + open.length + ' open risk' + (open.length === 1 ? '' : 's') + ' not reviewed in the last 12 months', 'risks', 'Review the risks', stale === open.length ? 'fail' : 'warn');
    }
    var tr = (d.training || []);
    var lt = last(tr.filter(function (t) { return t && t.status === 'Completed'; }), 'completed');
    if (!tr.length) add('7.3', 'Awareness', 'No awareness training recorded', 'training', 'Assign awareness training', 'warn');
    else if (!lt || lt < ago(365)) add('7.3', 'Awareness', 'No awareness training completed in the last 12 months', 'training', 'Run this year\u2019s awareness training', 'warn');
    var ls = last(d.scans, 'date');
    if (!ls) add('9.1', 'Monitoring', 'No posture scan yet', 'scan', 'Run a posture scan', 'warn');
    else if (ls < ago(45)) add('9.1', 'Monitoring', 'No posture scan since ' + srDate(ls), 'scan', 'Run a posture scan', 'warn');
    if (d.securityReviewOn) {
      var lsr = last((d.securityReviews || []).filter(function (r) { return r && r.status === 'Held'; }), 'date');
      if (lsr && lsr < ago(45)) add('9.1', 'Monitoring', 'No security review held since ' + srDate(lsr), 'reviews', 'Hold this month\u2019s security review', 'warn');
    }
    var pol = (d.docs || []).filter(function (x) { return x && /information security policy/i.test(x.name || '') && !/topic|specific/i.test(x.name || ''); });
    var approved = pol.filter(function (x) { return x.status === 'Approved'; });
    if (!approved.length) add('5.2', 'Information security policy', pol.length ? 'Not approved by top management' : 'No information security policy', 'documents', pol.length ? 'Request approval' : 'Generate the policy', 'fail');
    else if (approved.every(function (x) { return x.nextReview && x.nextReview < today; })) add('5.2', 'Information security policy', 'Review overdue since ' + srDate(approved.map(function (x) { return x.nextReview; }).sort().pop()), 'documents', 'Review the policy', 'warn');
    var nc = (d.actions || []).filter(function (a) { return a && /^Non-conformity/.test(a.type || '') && !DONE_ACTION(a) && a.status !== 'Closed' && a.due && a.due < today; }).length;
    if (nc) add('10.2', 'Nonconformity and corrective action', nc + ' nonconformit' + (nc === 1 ? 'y' : 'ies') + ' past due', 'actions', 'Close the corrective actions', 'fail');
    var co = d.clausesOverdue || [];
    if (co.length) add('', 'Clause verification', co.length + ' implemented clause' + (co.length === 1 ? '' : 's') + ' not verified within the review cadence: ' + co.slice(0, 4).join(', ') + (co.length > 4 ? ' and more' : ''), 'clauses', 'Verify the clauses', 'warn');
    return out.sort(function (a, b) { return (a.severity === 'fail' ? 0 : 1) - (b.severity === 'fail' ? 0 : 1); });
  }
  /* What a certification auditor typically asks, clause by clause and
     for the Annex A controls most often sampled. Answered from the
     records Checkpoint holds (auditorQuestionBank), so the
     organisation can rehearse with its own evidence. */
  var AUDITOR_QUESTIONS = {
    '4.1': ['How did you decide which internal and external issues matter to your ISMS?', 'How do you keep them current?'],
    '4.2': ['Who are your interested parties and what do they require of you?', 'Which of those requirements does the ISMS address?'],
    '4.3': ['Show me the scope of the ISMS. What is outside it, and why?', 'How do interfaces and dependencies with others affect the scope?'],
    '4.4': ['How do the ISMS processes fit together and with the rest of the business?'],
    '5.1': ['How does top management lead the ISMS in practice?', 'How are security requirements built into business processes?'],
    '5.2': ['Show me the information security policy. Who approved it, and how was it communicated?'],
    '5.3': ['Who is responsible for the ISMS, and for reporting its performance to top management?'],
    '6.1.1': ['How did you plan actions to address risks and opportunities?'],
    '6.1.2': ['Walk me through your risk assessment method. How are likelihood and consequence decided?', 'Who owns each risk?'],
    '6.1.3': ['How did you choose the controls? Show me the Statement of Applicability and why each exclusion is justified.', 'Who approved the risk treatment plan and accepted the residual risks?'],
    '6.2': ['What are your security objectives, how are they measured, and who is responsible for each?'],
    '6.3': ['How do you plan changes to the ISMS?'],
    '7.1': ['How did you decide and provide the resources the ISMS needs?'],
    '7.2': ['How do you know the people doing ISMS work are competent? Show me the records.'],
    '7.3': ['How do staff know the policy, their part in the ISMS and what happens if they do not follow it?'],
    '7.4': ['What do you communicate about security, to whom, when and by whom?'],
    '7.5': ['How do you control documents: approval, versions, review and access?'],
    '8.1': ['How do you plan and control the processes that meet security requirements, including outsourced ones?'],
    '8.2': ['When did you last assess the risks, and what makes you assess them again?'],
    '8.3': ['Show me the risk treatment plan being carried out, and its results.'],
    '9.1': ['What do you monitor and measure, how often, and who analyses the results?'],
    '9.2': ['Show me the internal audit programme and the last audit report. How was the auditor\u2019s independence assured?'],
    '9.3': ['Show me the last management review: who attended, what was considered and what was decided.'],
    '10.1': ['Give me an example of an improvement to the ISMS in the last year.'],
    '10.2': ['Show me a nonconformity: the correction, the root cause and how you checked the action worked.'],
    'A.5.1': ['Show me the topic-specific policies, who approved them and when they were last reviewed.'],
    'A.5.9': ['Show me the asset inventory. How do you know it is complete, and who owns each asset?'],
    'A.5.15': ['How is access granted, changed and removed? Show me an example.'],
    'A.5.18': ['When were access rights last reviewed, and what changed as a result?'],
    'A.5.19': ['How do you assess a supplier\u2019s security before you use them?'],
    'A.5.23': ['How did you choose and secure your cloud services, and how would you exit one?'],
    'A.5.24': ['Show me the incident response plan and the last time it was used or tested.'],
    'A.5.29': ['How does security continue during a disruption? When was this last tested?'],
    'A.6.1': ['What checks do you carry out before someone joins, including contractors?'],
    'A.6.3': ['Show me the awareness training records. Who has not completed it?'],
    'A.8.1': ['How are laptops and phones protected, and how do you know every device is?'],
    'A.8.5': ['How do people sign in? Show me multi-factor authentication enforced, including for administrators.'],
    'A.8.7': ['How is malware prevented and detected on every device?'],
    'A.8.8': ['How do you find and fix vulnerabilities, and how quickly are critical ones patched?'],
    'A.8.13': ['Show me a backup being restored, and when that was last tested.'],
    'A.8.15': ['What is logged, for how long, and who looks at the logs?']
  };
  /* d = { clauses:[{ code, title, status, evidenceUrl, checklist:{ items } }],
           controls:[{ id, title, status, owner, evidenceUrl, applicable, justification, currentUntil }] }
     Returns { clauses:[...], controls:[...] }, each { ref, title,
     questions, holds:[lines], gaps:[lines], evidenceUrl, ready }. */
  function auditorQuestionBank(d) {
    var clauses = (d.clauses || []).filter(function (c) { return AUDITOR_QUESTIONS[c.code]; }).map(function (c) {
      var items = (c.checklist && c.checklist.items) || [];
      var holds = items.filter(function (i) { return i.status === 'met'; }).map(function (i) { return i.text + (i.note ? ': ' + i.note : ''); });
      var gaps = items.filter(function (i) { return i.status !== 'met'; }).map(function (i) { return i.text + (i.note ? ' (' + i.note + ')' : ''); });
      return { ref: c.code, title: c.title || '', status: c.status || '', questions: AUDITOR_QUESTIONS[c.code], holds: holds, gaps: gaps, evidenceUrl: c.evidenceUrl || '', ready: !gaps.length && !!c.evidenceUrl };
    });
    var controls = (d.controls || []).filter(function (c) { return AUDITOR_QUESTIONS[c.id]; }).map(function (c) {
      var holds = [], gaps = [];
      if (!c.applicable) holds.push('Excluded from the Statement of Applicability' + (c.justification ? ': ' + c.justification : ''));
      else {
        holds.push('Status: ' + (c.status || 'Not started') + (c.owner ? '; owner ' + c.owner : ''));
        if (c.status !== 'Implemented') gaps.push('Not yet implemented');
        if (!c.owner) gaps.push('No owner named');
        if (!c.evidenceUrl) gaps.push('No evidence linked');
        else if (c.currentUntil) (c.currentUntil < (d.today || '') ? gaps : holds).push((c.currentUntil < (d.today || '') ? 'Evidence out of date since ' : 'Evidence current until ') + srDate(c.currentUntil));
      }
      return { ref: c.id, title: c.title || '', status: c.applicable ? (c.status || '') : 'Excluded', questions: AUDITOR_QUESTIONS[c.id], holds: holds, gaps: gaps, evidenceUrl: c.evidenceUrl || '', ready: !gaps.length };
    });
    return { clauses: clauses, controls: controls };
  }
  /* One figure for how well the ISMS is running, for the partner
     console: 100 less points for what has lapsed. d = { gaps (from
     clauseCadenceGaps), staleEvidence, overdueActions, openActions,
     missedReviews }. Each factor is capped so no single one sinks it. */
  function ismsHealthScore(d) {
    d = d || {};
    var factors = [];
    var add = function (label, points) { if (points > 0) factors.push({ label: label, points: Math.round(points) }); };
    var gaps = d.gaps || [];
    var fails = gaps.filter(function (g) { return g.severity === 'fail'; }).length, warns = gaps.length - fails;
    add(gaps.length + ' lapsed requirement' + (gaps.length === 1 ? '' : 's'), Math.min(40, fails * 12 + warns * 5));
    var se = Number(d.staleEvidence) || 0;
    add(se + ' control' + (se === 1 ? '' : 's') + ' with out-of-date evidence', Math.min(15, se * 2));
    var od = Number(d.overdueActions) || 0, open = Math.max(Number(d.openActions) || 0, od);
    add(od + ' overdue action' + (od === 1 ? '' : 's'), open ? Math.min(25, 25 * od / open + Math.min(5, od)) : 0);
    var mr = Number(d.missedReviews) || 0;
    add(mr + ' security review' + (mr === 1 ? '' : 's') + ' missed', Math.min(20, mr * 10));
    var score = Math.max(0, 100 - factors.reduce(function (n, f) { return n + f.points; }, 0));
    return { score: score, band: score >= 75 ? 'good' : score >= 50 ? 'watch' : 'poor', factors: factors.sort(function (a, b) { return b.points - a.points; }) };
  }
  /* Security reviews that should have been held and were not: meetings
     whose date passed over a week ago with no minutes, and, once the
     review is running, a gap of more than 45 days since the last one. */
  function securityReviewsMissed(reviews, setup, today) {
    if (!setup) return 0;
    var list = reviews || [];
    var unminuted = list.filter(function (r) { return r && r.status !== 'Held' && r.date && addDaysIso(r.date, 7) < today; }).length;
    var held = list.filter(function (r) { return r && r.status === 'Held'; }).map(function (r) { return r.date; }).sort().pop();
    var gap = held && held < addDaysIso(today, -45) && !unminuted ? Math.floor(daysBetweenDateStr(held, today) / 31) : 0;
    return unminuted + gap;
  }
  /* The next 12 months of internal audits, weighted to risk: the
     management-system clauses first, then each Annex A theme in order of
     how much risk and past trouble sits in it, so the riskiest areas are
     audited soonest. Each audit names the controls to focus on and why.
     d = { start, controls:[{id,t,app}], risks:[{id,controls,score,status}],
           findings:[{control}], every (months between audits, default 3) } */
  var AUDIT_THEMES = [
    { key: 'A.5', label: 'Annex A.5 (organisational controls)' },
    { key: 'A.6', label: 'Annex A.6 (people controls)' },
    { key: 'A.7', label: 'Annex A.7 (physical controls)' },
    { key: 'A.8', label: 'Annex A.8 (technological controls)' }
  ];
  function riskWeightedAuditPlan(d) {
    d = d || {};
    var every = Number(d.every) || 3, start = d.start;
    var weight = {}, why = {};
    var note = function (id, w, reason) { weight[id] = (weight[id] || 0) + w; (why[id] = why[id] || []).push(reason); };
    (d.risks || []).forEach(function (r) {
      if (!r || r.status === 'Closed') return;
      (r.controls || []).forEach(function (c) { note(c, Number(r.score) || 0, r.id + ' (risk ' + (Number(r.score) || 0) + ')'); });
    });
    (d.findings || []).forEach(function (f) { if (f && f.control) note(f.control, 8, 'past finding' + (f.id ? ' ' + f.id : '')); });
    var app = (d.controls || []).filter(function (c) { return c && c.app; });
    var themes = AUDIT_THEMES.map(function (t) {
      var ctrls = app.filter(function (c) { return String(c.id).indexOf(t.key + '.') === 0; });
      var total = ctrls.reduce(function (n, c) { return n + (weight[c.id] || 0); }, 0);
      return { key: t.key, label: t.label, controls: ctrls, weight: total };
    }).filter(function (t) { return t.controls.length; });
    /* A small theme (people, physical) shares an audit with the other one. */
    var small = themes.filter(function (t) { return (t.key === 'A.6' || t.key === 'A.7') && t.controls.length < 12; });
    if (small.length === 2) {
      themes = themes.filter(function (t) { return small.indexOf(t) === -1; }).concat([{ key: 'A.6+A.7', label: 'Annex A.6 and A.7 (people and physical controls)', controls: small[0].controls.concat(small[1].controls), weight: small[0].weight + small[1].weight }]);
    }
    themes.sort(function (a, b) { return b.weight - a.weight; });
    var focus = function (ctrls) {
      return ctrls.filter(function (c) { return weight[c.id]; }).sort(function (a, b) { return weight[b.id] - weight[a.id]; }).slice(0, 5)
        .map(function (c) { return { id: c.id, t: c.t || '', why: why[c.id].slice(0, 2).join(', ') }; });
    };
    var out = [{ planned: addMonthsIso(start, 1), scope: 'Clauses 4-10 (management system)', focus: [], weight: null }];
    themes.forEach(function (t, i) {
      var f = focus(t.controls);
      out.push({ planned: addMonthsIso(start, 1 + every * (i + 1)), scope: t.label + (f.length ? ': focus on ' + f.map(function (x) { return x.id; }).join(', ') : ''), focus: f, weight: t.weight, controls: t.controls.length });
    });
    return out.filter(function (a) { return a.planned <= addMonthsIso(start, 12); });
  }
  /* Supplier certificate renewal through the supplier's own link: the
     request, the supplier's reply and its acceptance are dated marker
     lines in the vendor's Notes. Kept identical to
     azure/lib/vendorRenewal.js. */
  /* Notes without the renewal marker lines, for display. */
  function vendorNotesText(notes) { return String(notes || '').split('\n').filter(function (l) { return !/^\[renewal-(requested|submitted|accepted) \d{4}-\d{2}-\d{2}\]/.test(l); }).join('\n').trim(); }
  function vendorRenewalState(notes, today) {
    var text = String(notes || '');
    var last = function (re) { var m, out = null; re.lastIndex = 0; while ((m = re.exec(text))) out = m; return out; };
    var req = last(/\[renewal-requested (\d{4}-\d{2}-\d{2})\]/g);
    var sub = last(/\[renewal-submitted (\d{4}-\d{2}-\d{2})\] valid until (\d{4}-\d{2}-\d{2})(?:; ([^;\n]*))?(?:; report (https:\/\/[^\s;]+))?(?:; ([^\n]*))?/g);
    var acc = last(/\[renewal-accepted (\d{4}-\d{2}-\d{2})\]/g);
    var requested = req ? req[1] : '', submitted = sub ? sub[1] : '', accepted = acc ? acc[1] : '';
    var pending = !!submitted && (!accepted || accepted < submitted);
    var recent = function (d) { return d && today && (Date.parse(today) - Date.parse(d)) / 86400000 < 30; };
    return {
      requested: requested, submitted: submitted, accepted: accepted, pending: pending,
      submission: pending ? { validUntil: sub[2], certifications: (sub[3] || '').trim(), reportUrl: sub[4] || '', note: (sub[5] || '').trim() } : null,
      canRequest: !pending && !recent(requested)
    };
  }
  function validateVendorRenewal(body, today) {
    var r = (body || {}).renewal;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, error: 'renewal must be an object' };
    var d = String(r.validUntil || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) return { ok: false, error: 'Give the date the new certificate or report is valid until.' };
    var days = (Date.parse(d) - Date.parse(today)) / 86400000;
    if (days <= 0) return { ok: false, error: 'That date has already passed.' };
    if (days > 5 * 366) return { ok: false, error: 'That date is more than five years away.' };
    var url = String(r.reportUrl || '').trim();
    if (url && (!/^https:\/\/[^\s;]+$/i.test(url) || url.length > 500)) return { ok: false, error: 'The link must start with https:// and contain no spaces.' };
    var clean = function (v, n) { return String(v || '').replace(/[\r\n;\[\]]+/g, ' ').trim().slice(0, n); };
    return { ok: true, renewal: { validUntil: d, certifications: clean(r.certifications, 200), reportUrl: url, note: clean(r.note, 300) } };
  }
  function vendorRenewalNote(r, today) {
    return '[renewal-submitted ' + today + '] valid until ' + r.validUntil + '; ' + (r.certifications || '') + (r.reportUrl ? '; report ' + r.reportUrl : '') + (r.note ? '; ' + r.note : '');
  }

  /* The month for top management in plain English: what is going
     well, what needs their decision, and the direction of travel. No
     clause numbers or control codes. Built from the review pack, so the
     browser and the scheduled function say the same. extra = {
     approvals:[document names awaiting the chair], gaps:[from
     clauseCadenceGaps], health:{score}, trend:[{score, overdue}] } */
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
  /* ---- Weekly backup (A.8.13, A.5.33, Clause 7.5.3) ----
     A dated copy of every register, the settings and an index of the
     evidence, written into the client's own SharePoint so a deleted
     list, a bad import or an offboarding never loses the record. The
     scheduled monitor writes one a week; "Back up now" writes one on
     demand. The same builder is copied into azure/lib/backup.js. */
  var BACKUP_ROOT = 'Checkpoint backups';
  var BACKUP_SECRET_RE = /secret|token|password|api.?key|webhook|credential/i;
  function backupStrip(v) {
    if (Array.isArray(v)) return v.map(backupStrip);
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) { if (k.charAt(0) !== '_' && k.charAt(0) !== '@') o[k] = backupStrip(v[k]); });
      return o;
    }
    return v;
  }
  function backupSafeSettings(settings) {
    var out = {}, s = settings || {};
    Object.keys(s).forEach(function (k) { if (!BACKUP_SECRET_RE.test(k)) out[k] = s[k]; });
    return out;
  }
  function backupFileName(today, kind) {
    return 'checkpoint-backup-' + String(today).slice(0, 10) + (kind === 'manual' ? '-manual' : '') + '.zip';
  }
  /* d = { created, appVersion, client, source: 'scheduled'|'manual',
     registers: { name: [records] }, settings, evidence: [{ framework,
     ref, title, status, url, verified }], csvs: [{ name, content }] } */
  function buildBackupFiles(d) {
    d = d || {};
    var regs = d.registers || {}, counts = {};
    Object.keys(regs).forEach(function (k) { counts[k] = (regs[k] || []).length; });
    var json = {
      format: 'checkpoint-backup', formatVersion: 1, created: d.created || '', source: d.source || 'manual',
      appVersion: d.appVersion || '', client: d.client || '', counts: counts,
      registers: backupStrip(regs), settings: backupSafeSettings(d.settings)
    };
    var ev = (d.evidence || []).filter(function (e) { return e && e.ref; });
    var withUrl = ev.filter(function (e) { return e.url; }).length;
    var readme = [
      'Checkpoint backup — ' + (d.client || 'your organisation'),
      'Created ' + (d.created || '') + (d.source === 'scheduled' ? ' by the weekly scheduled backup' : ' by "Back up now"') + (d.appVersion ? ', Checkpoint ' + d.appVersion : '') + '.',
      '',
      'What is in it:',
      '  checkpoint-backup.json  every register record and the settings, in full (secrets such as webhook URLs and API keys are left out).',
      '  evidence-index.csv      each control and clause with its evidence link (' + withUrl + ' of ' + ev.length + ' have one). The files themselves stay in SharePoint.',
      (d.csvs || []).length ? '  *.csv                   each register as a spreadsheet, the same as Export all.' : '',
      '',
      'Restoring:',
      '  Risks, actions, vendors and assets can be re-imported with Import CSV on each register.',
      '  For a full restore of every register from checkpoint-backup.json, contact Compliance365 support.',
      '',
      'Record counts: ' + Object.keys(counts).map(function (k) { return k + ' ' + counts[k]; }).join(', ')
    ].filter(function (l, i, a) { return l !== '' || a[i - 1] !== ''; }).join('\r\n');
    var files = [
      { name: 'README.txt', content: readme },
      { name: 'checkpoint-backup.json', content: JSON.stringify(json, null, 1) },
      { name: 'evidence-index.csv', content: toCsv([['Framework', 'Control or clause', 'Title', 'Status', 'Evidence link', 'Last verified']].concat(ev.map(function (e) { return [e.framework || '', e.ref, e.title || '', e.status || '', e.url || '', e.verified || '']; }))) }
    ];
    return files.concat(d.csvs || []);
  }
  /* Which backup files to delete: the dated backups beyond the newest
     `keep` (13 = a quarter of weekly copies). keep 0 keeps everything.
     Files that are not Checkpoint backups are never touched. */
  function backupsToPrune(names, keep) {
    var k = keep == null ? 13 : Number(keep);
    if (!(k > 0)) return [];
    var dated = (names || []).filter(function (n) { return /^checkpoint-backup-\d{4}-\d{2}-\d{2}(-manual)?\.zip$/.test(n); })
      .sort(function (a, b) { return b.localeCompare(a); });
    return dated.slice(k);
  }
  function backupDue(settings, today) {
    var s = settings || {};
    if (s.backupEnabled === 'false') return false;
    var last = String(s.backupLastRun || '').slice(0, 10);
    if (!last) return true;
    return (Date.parse(String(today).slice(0, 10)) - Date.parse(last)) / 86400000 >= 7;
  }

  /* ---- Guided build ----
     The certification path in the order an ISMS is actually built: the
     clauses in sequence, but with Annex A chosen during risk treatment
     (Clause 6.1.3), where the Statement of Applicability comes from,
     and the checking clauses (9, 10) last, once there is something to
     check. Each stage names the clauses it completes, says in plain
     words what it is for, and marks the decisions that belong to top
     management. Items are the existing path steps plus a few checks
     the path did not have (`extra`). */
  var BUILD_STAGES = [
    { key: 'context', title: 'Scope and context', clauses: ['4.1', '4.2', '4.3', '4.4'],
      plain: 'What the organisation does, who cares about its information and what they expect, and where the management system starts and stops. Everything after this builds on it.',
      items: ['scope', 'legal'] },
    { key: 'leadership', title: 'Leadership', clauses: ['5.1', '5.2', '5.3'],
      plain: 'Top management sets the direction: approves the information security policy, names who runs the system, and commits to supporting it.',
      items: ['roles', 'docs', 'approve'] },
    { key: 'riskframe', title: 'Risk framework', clauses: ['6.1.1', '6.1.2'],
      plain: 'Agree how risks are judged before judging any: how likely and how bad, and how much risk the business is willing to accept. This is a top management decision.',
      items: ['appetite', 'riskmethod'] },
    { key: 'assess', title: 'Risk assessment', clauses: ['6.1.2', '8.2'],
      plain: 'Find what needs protecting and what could go wrong: the information and systems, the Microsoft 365 security check, and the risks that come out of both.',
      items: ['assets', 'scan', 'risks'] },
    { key: 'treat', title: 'Risk treatment and Annex A', clauses: ['6.1.3', '8.3'],
      plain: 'Decide what to do about each risk, then choose the Annex A security controls that do it. That choice is the Statement of Applicability, the document a certification auditor reads first. Risks the business decides to live with are accepted by top management.',
      items: ['treated', 'accepted', 'soa'] },
    { key: 'objectives', title: 'Objectives', clauses: ['6.2'],
      plain: 'A few measurable goals for the year, each with an owner and a date, agreed by top management.',
      items: ['objectives'] },
    { key: 'support', title: 'People and documents', clauses: ['7.1', '7.2', '7.3', '7.4', '7.5'],
      plain: 'Make sure people know their part: training, every policy read and acknowledged, and the documents kept under control.',
      items: ['training', 'ack'] },
    { key: 'operate', title: 'Run it', clauses: ['8.1'],
      plain: 'Switch on the routine: the recurring checks that prove controls work, supplier reviews, and evidence collected as it happens. Clauses 9 and 10 need a few weeks of this.',
      items: ['rhythm', 'suppliers', 'ai'] },
    { key: 'check', title: 'Check it works', clauses: ['9.1', '9.2', '9.3'],
      plain: 'An internal audit checks the system works, and top management reviews the results and decides what to change.',
      items: ['audit', 'review'] },
    { key: 'certify', title: 'Improve and certify', clauses: ['10.1', '10.2'],
      plain: 'Close what the audit and review found, finish the remaining clauses and the documents a Stage 1 auditor asks for, then book the certification audit.',
      items: ['clauses', 'mandatory', 'book'] }
  ];
  /* Items only top management can do. */
  var BUILD_TOP_ITEMS = { approve: true, roles: true, appetite: true, accepted: true, objectives: true, review: true };
  /* steps = certificationPathSteps(); extra = { id: { label, why, done,
     detail } } for the checks the path does not have. Items for which
     neither exists (an ISO 42001 step for a 27001-only client) are left
     out, and a stage with no items left is dropped. Returns { stages:[{
     key, n, title, clauses, plain, items:[{ id, label, why, detail,
     done, top }], done, doneCount }], current (index), pct }. */
  function guidedBuild(steps, extra) {
    var byId = {};
    (steps || []).forEach(function (st) { byId[st.id] = st; });
    var x = extra || {};
    var stages = BUILD_STAGES.map(function (st) {
      var items = st.items.map(function (id) {
        var it = x[id] || byId[id];
        if (!it) return null;
        return { id: id, label: it.label, why: it.why || '', detail: it.done ? '' : (it.detail || ''), done: !!it.done, top: !!BUILD_TOP_ITEMS[id] };
      }).filter(Boolean);
      return { key: st.key, title: st.title, clauses: st.clauses, plain: st.plain, items: items, done: items.length > 0 && items.every(function (i) { return i.done; }), doneCount: items.filter(function (i) { return i.done; }).length };
    }).filter(function (st) { return st.items.length; });
    stages.forEach(function (st, i) { st.n = i + 1; });
    var cur = stages.findIndex(function (st) { return !st.done; });
    var all = stages.reduce(function (n, st) { return n + st.items.length; }, 0), done = stages.reduce(function (n, st) { return n + st.doneCount; }, 0);
    return { stages: stages, current: cur === -1 ? stages.length - 1 : cur, complete: cur === -1, pct: all ? Math.round(done / all * 100) : 0 };
  }

  /* ---- Who does what (Clause 5.3) ----
     Everyone named as responsible for something in the ISMS, built from
     the owners already recorded across the registers plus the meeting
     roles. d = { areas: { key: [{ owner, open, overdue }] }, roles: [{
     name, role }], known: [names, lower case] | null (the directory,
     to flag owners who are no longer in it) }. Area keys are labelled
     by WHO_AREAS. Returns { people:[{ name, roles, areas:{ key: n },
     total, overdue, unknown }], unowned:{ key: n } }. */
  var WHO_AREAS = { risks: ['risk', 'risks'], actions: ['open action', 'open actions'], controls: ['control', 'controls'], clauses: ['clause', 'clauses'], documents: ['document', 'documents'], vendors: ['supplier', 'suppliers'], assets: ['asset', 'assets'], objectives: ['objective', 'objectives'], calendar: ['recurring activity', 'recurring activities'], legal: ['legal requirement', 'legal requirements'], aiSystems: ['AI system', 'AI systems'] };
  function whoDoesWhat(d) {
    d = d || {};
    var byKey = {}, people = [], unowned = {};
    var blank = function (o) { var t = String(o || '').trim(); return !t || /^(unassigned|tbc|tbd|-|—|none)$/i.test(t); };
    var person = function (name) {
      var k = String(name).trim().toLowerCase();
      if (!byKey[k]) { byKey[k] = { name: String(name).trim(), roles: [], areas: {}, total: 0, overdue: 0, unknown: false }; people.push(byKey[k]); }
      return byKey[k];
    };
    (d.roles || []).forEach(function (r) { if (r && !blank(r.name)) { var p = person(r.name); if (p.roles.indexOf(r.role) === -1) p.roles.push(r.role); } });
    Object.keys(d.areas || {}).forEach(function (area) {
      (d.areas[area] || []).forEach(function (x) {
        if (!x || x.open === false) return;
        if (blank(x.owner)) { unowned[area] = (unowned[area] || 0) + 1; return; }
        var p = person(x.owner);
        p.areas[area] = (p.areas[area] || 0) + 1;
        p.total++;
        if (x.overdue) p.overdue++;
      });
    });
    /* Only someone who holds records can have left with them; a meeting
       role naming a firm (the facilitating partner) is not flagged. */
    if (Array.isArray(d.known) && d.known.length) people.forEach(function (p) { p.unknown = p.total > 0 && d.known.indexOf(p.name.toLowerCase()) === -1; });
    people.sort(function (a, b) { return b.roles.length - a.roles.length || b.total - a.total || a.name.localeCompare(b.name); });
    return { people: people, unowned: unowned };
  }
  function whoAreaText(areas) {
    return Object.keys(WHO_AREAS).filter(function (k) { return areas[k]; }).map(function (k) { return areas[k] + ' ' + WHO_AREAS[k][areas[k] === 1 ? 0 : 1]; }).join(', ');
  }

  /* ---- What is this page? ----
     One plain-English line per page: what it is, and what the person
     looking at it is expected to do there, by role (top, staff, viewer;
     anyone else gets `you`). `terms` names the jargon on the page,
     explained from GLOSSARY. */
  var GLOSSARY = {
    'ISMS': 'Information security management system: the policies, people and routines an organisation uses to manage information security. ISO 27001 certifies it.',
    'ISO 27001': 'The international standard for managing information security. Certification means an independent auditor has checked the ISMS works.',
    'Statement of Applicability': 'The list of the 93 security controls in ISO 27001 Annex A, saying which apply to you, why, and how each is met. The auditor reads it first.',
    'Annex A': 'The 93 security controls listed at the back of ISO 27001, from access control to backups. You choose which apply.',
    'Control': 'A safeguard that reduces a risk, such as multi-factor sign-in, backups or a supplier review.',
    'Clause': 'One of the requirements in the main body of ISO 27001 (Clauses 4 to 10): how the management system itself is run.',
    'Evidence': 'A record that shows something is done: a report, screenshot, approved document or minutes. Auditors ask to see it.',
    'Risk appetite': 'How much risk the business is willing to accept. Risks above it must be reduced, or accepted by top management.',
    'Residual risk': 'The risk that is left after the controls are in place.',
    'Inherent risk': 'The risk before any controls are applied.',
    'Risk treatment': 'What is being done about a risk: reduce it, avoid it, share it (for example insurance) or accept it.',
    'Nonconformity': 'Something that does not meet a requirement, found by an audit or a review. Major ones stop certification until fixed.',
    'Corrective action': 'The fix for a nonconformity, including why it happened, so it does not happen again.',
    'Internal audit': 'Your own check that the ISMS works, done before the certification auditor does theirs.',
    'Management review': 'A meeting where top management reviews how the ISMS is going and records decisions. Required at least once a year.',
    'Stage 1': 'The certification body’s first visit: they check the ISMS is documented and ready.',
    'Stage 2': 'The certification audit itself: they check the ISMS is working, by sampling records and talking to people.',
    'Posture scan': 'Checkpoint’s automatic check of your Microsoft 365 security settings.',
    'Attestation': 'A person’s confirmation that they have read and accepted a policy.',
    'Objective': 'A measurable security goal for the year, with an owner and a due date.'
  };
  var PAGE_GUIDE = {
    dash: { what: 'The overview: how ready you are for certification, what needs attention and what to do next.', you: 'Start with Do next.', top: 'Read Next for you and the month in brief. Everything else is for the ISMS owner.', staff: 'Next for you shows anything waiting on you.', terms: ['ISMS', 'ISO 27001'] },
    mytasks: { what: 'Everything assigned to you by name, each with the one button that does it.', you: 'Work down the list. Checkpoint emails you when something new arrives.', terms: [] },
    scan: { what: 'The automatic check of your Microsoft 365 security settings, with what passes, what fails and how to fix it.', you: 'Fix what fails, starting at the top. Each failure becomes a risk or an action.', top: 'Nothing for you to do here: the score is reported to you each month.', terms: ['Posture scan', 'Control'] },
    risks: { what: 'The risks to the organisation’s information, how serious each is and what is being done about it.', you: 'Keep each risk owned and treated; review them when something changes.', top: 'Risks above the appetite need your decision: reduce them, or accept them in writing.', terms: ['Risk appetite', 'Inherent risk', 'Residual risk', 'Risk treatment'] },
    actions: { what: 'Every fix and improvement someone has agreed to do, with an owner and a due date.', you: 'Update an action when it is done, with the evidence.', top: 'Overdue actions come to the monthly review for a decision.', terms: ['Nonconformity', 'Corrective action'] },
    vendors: { what: 'The suppliers that hold or can reach your information, and how they have been checked.', you: 'Review critical and high suppliers each year and keep their certificates current.', terms: [] },
    assets: { what: 'The information and systems the organisation needs to protect, each with an owner.', you: 'Add the information itself (customer data, HR records); devices and apps sync from Microsoft 365.', terms: [] },
    soa: { what: 'The 93 ISO 27001 security controls: which apply, why, and how each is met.', you: 'For each applicable control, record how it is met and attach the evidence.', top: 'Nothing for you to do here; the auditor reads it first.', terms: ['Statement of Applicability', 'Annex A', 'Control', 'Evidence'] },
    clauses: { what: 'The requirements for running the management system itself (ISO 27001 Clauses 4 to 10).', you: 'Open a clause and use Finish this clause to close what is left.', top: 'Several of these are yours (leadership, policy, review); Checkpoint brings them to you.', terms: ['Clause', 'Evidence'] },
    documents: { what: 'The organisation’s policies and procedures, with their version, owner, approval and review date.', you: 'Generate, edit and approve documents; review each by its date.', top: 'Policies waiting for your approval appear in Next for you.', terms: [] },
    attestations: { what: 'Who has read and accepted each policy.', you: 'Send each new policy version to staff; Checkpoint chases anyone outstanding.', staff: 'Acknowledge any policy listed under My attestations.', terms: ['Attestation'] },
    training: { what: 'Security awareness training and who has completed it.', you: 'Assign the courses each year; Checkpoint chases anyone outstanding.', staff: 'Complete any course assigned to you; each takes about 20 minutes.', terms: [] },
    certification: { what: 'The certification audits: what each stage needs, the bookings and, once certified, the three-year cycle.', you: 'Work through the gate checklist, then book Stage 1 and Stage 2.', top: 'The dates and whether you are ready are shown here.', terms: ['Stage 1', 'Stage 2'] },
    audits: { what: 'Your internal audits: the plan, the checklists and the findings.', you: 'Run each planned audit and record its findings.', terms: ['Internal audit', 'Nonconformity'] },
    incidents: { what: 'Security incidents: what happened, how it was handled and what was learned.', you: 'Log every incident, however small, and record the lessons.', staff: 'Tell the ISMS owner straight away about anything suspicious.', terms: [] },
    reviews: { what: 'The monthly security review and the management reviews, with their agendas, minutes and decisions.', you: 'Checkpoint prepares each meeting; record the minutes afterwards.', top: 'You chair these. Read the agenda before the meeting; decisions become actions automatically.', terms: ['Management review'] },
    objectives: { what: 'This year’s measurable security goals, who owns each and how they are going.', you: 'Keep each objective measured and updated.', top: 'You agree these each year; progress comes to the monthly review.', terms: ['Objective'] },
    legal: { what: 'The laws, regulations and contracts that set security requirements for you.', you: 'Confirm which apply, give each an owner and link the controls that meet them.', terms: [] },
    calendar: { what: 'Every recurring security activity and when it is next due.', you: 'Complete each when due and attach the record.', terms: [] },
    reports: { what: 'Reports and packs to share with top management, auditors and customers.', you: 'Generate what you need; most can be filed as evidence in one click.', terms: [] },
    settings: { what: 'How Checkpoint is set up for this organisation.', you: 'Fix anything the setup health check flags; most settings are set once.', terms: [] },
    integrations: { what: 'Where Checkpoint gets its evidence from, and whether each source is reporting.', you: 'Set up the sources you use; each card has the steps.', terms: [] },
    build: { what: 'The management system built one stage at a time, in the order it is actually done, with the clauses each stage completes.', you: 'Work through the current stage; each item has the button that does it.', top: 'Items marked Top management decides are yours; the rest are done for you.', terms: ['ISMS', 'Clause', 'Annex A', 'Risk appetite'] },
    whodoes: { what: 'Who is responsible for what in the management system.', you: 'Check every area has an owner; reassign anything held by someone who has left.', top: 'Everyone’s part at a glance.', terms: ['ISMS'] }
  };
  function pageGuide(view, role) {
    var g = PAGE_GUIDE[view];
    if (!g) return null;
    return { what: g.what, you: (role && g[role]) || g.you, terms: (g.terms || []).filter(function (t) { return GLOSSARY[t]; }).map(function (t) { return { term: t, def: GLOSSARY[t] }; }) };
  }

  /* ---- First-time welcome ----
     Three short screens the first time someone signs in: what Checkpoint
     is, what is expected of them, and where their things are. Worded for
     who they are: top management, the person running the ISMS, someone
     with view-only access, or anyone else (their own tasks only). */
  function welcomeScreens(role, ctx) {
    ctx = ctx || {};
    var org = ctx.org || 'your organisation';
    var helper = ctx.partner || 'Compliance365';
    var what = {
      title: 'Welcome to Checkpoint',
      lines: [
        'Checkpoint runs ' + org + '’s information security management system: the policies, risks, security controls, evidence and meetings a certification auditor checks for ISO 27001.',
        'Everything is kept in ' + org + '’s own Microsoft 365. ' + helper + ' helps run it with you.',
        'You do not need to know the standard. Checkpoint tells you what is needed, when, and why.'
      ]
    };
    var expected = {
      top: { title: 'What is expected of you', lines: [
        'ISO 27001 asks top management for four things, and Checkpoint brings each to you when it is needed:',
        '1. Approve the policies, so they carry the organisation’s authority.',
        '2. Agree the security objectives and how much risk the business is willing to accept.',
        '3. Chair a short monthly security review and make the decisions only you can make.',
        '4. Make sure the people and budget are there.',
        'Usually about an hour a month. The rest is run by ' + (ctx.owner || 'the ISMS owner') + ' and ' + helper + '.'] },
      practitioner: { title: 'What is expected of you', lines: [
        'You keep the management system running: risks, controls, evidence, documents and actions.',
        'Checkpoint does most of the routine work itself, such as the security scan, reminders and meeting packs. Do next on the dashboard always shows the most useful thing to do.',
        'Each page starts with a line saying what it is for.'] },
      viewer: { title: 'What is expected of you', lines: [
        'You have view-only access: you can read everything, but not change it.',
        'If you have been asked to check something, everything is linked from the dashboard and the menu.'] },
      staff: { title: 'What is expected of you', lines: [
        'Only a few things, and only when they come up:',
        '• Read and acknowledge the policies that apply to you.',
        '• Complete short security training once a year.',
        '• Anything assigned to you by name, such as an action or a piece of evidence.',
        'Usually a few minutes at a time.'] }
    }[role] || null;
    var where = { title: 'Where your things are', lines: [
      '• Next for you, at the top of the dashboard, shows the one thing to do now, why it matters and how long it takes.',
      '• My tasks lists everything assigned to you, each with the one button that does it.',
      '• Checkpoint emails you when something new needs you, so you do not need to check in.',
      '• How this works, at the bottom of the menu, brings these screens back.'] };
    return [what, expected, where].filter(Boolean);
  }

  /* ---- The next thing for you ----
     One item for the person signed in, with why it matters in plain
     words and roughly how long it takes, so someone who is not a
     compliance specialist knows what to do when they open Checkpoint.
     items = My tasks items ({ kind, ref, title, due, overdue }), already
     sorted most urgent first. opts.fallback = the practitioner's top
     "Do next" item ({ title, why, action, id, button }) when nothing is
     assigned to them by name; opts.upcoming = [{ label, date }] for the
     "nothing to do" state. */
  var NEXT_KIND_GUIDE = {
    'Approve document': { why: 'Top management approves each policy so it carries the organisation’s authority. Read it, and approve it if it says what you want.', mins: 10 },
    'Acknowledge policy': { why: 'Everyone confirms they have read the policies that apply to them. An auditor checks a sample of people.', mins: 5 },
    'Training': { why: 'Short security awareness training everyone completes once a year, ending in a few questions.', mins: 20 },
    'Security review': { why: 'The monthly meeting where leadership looks at how security is going and makes the decisions only it can make.', mins: 30 },
    'Action': { why: 'Something you agreed to fix, from a risk, an audit or a meeting. Update it when it is done.', mins: 15 },
    'Activity': { why: 'A regular check that shows a security control is working, such as reviewing who has access. Do it and attach the record.', mins: 15 },
    'Evidence requested': { why: 'An auditor will ask to see proof that this control works. Upload the screenshot, report or document that shows it.', mins: 10 },
    'Document review': { why: 'Documents are reviewed on a schedule so they stay accurate. Read it, change anything out of date and confirm.', mins: 15 },
    'Objective': { why: 'Say how the security objective you own is going, so leadership can see progress.', mins: 5 },
    'Decision': { why: 'A decision only top management can make, needed for the current stage of building the management system.', mins: 10 }
  };
  function nextForYou(items, opts) {
    opts = opts || {};
    var list = items || [];
    if (list.length) {
      var i = list[0];
      var key = Object.keys(NEXT_KIND_GUIDE).find(function (k) { return k === i.kind || (k === 'Objective' && /^Objective/.test(i.kind || '')); });
      var g = NEXT_KIND_GUIDE[key] || { why: '', mins: 10 };
      var recordMinutes = i.kind === 'Security review' && /^Record/.test(i.title || '');
      return { kind: i.kind, item: i, title: (i.kind === 'Approve document' ? 'Approve ' : i.kind === 'Acknowledge policy' ? 'Read and acknowledge ' : i.kind === 'Evidence requested' ? 'Upload evidence for ' : '') + String(i.title || '').replace(/\.html$/i, ''),
        why: recordMinutes ? 'Record what the meeting decided, so the decisions become actions with owners and dates.' : g.why, minutes: recordMinutes ? 15 : g.mins, overdue: !!i.overdue, due: i.due || '', more: list.length - 1 };
    }
    if (opts.fallback) return Object.assign({ kind: 'Do next', minutes: null, more: 0 }, opts.fallback);
    var up = (opts.upcoming || []).filter(function (u) { return u && u.date; }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })[0] || null;
    return { none: true, next: up };
  }

  /* ---- Top management readiness interview (Clause 5) ----
     The questions a certification auditor asks top management, each
     with what a good answer covers and a check against the records, so
     an answer that the records would contradict is caught before the
     auditor catches it. d = { policyApproved, objectives:[{ title,
     status }], appetite, aboveAppetite (count of risks above appetite
     without acceptance), ismsOwner, lastReview (date), incidents (count
     in 12 months), correctiveWithCause (count), changes (count since
     last review), resourcesStated (bool), today }. */
  var TOP_MGMT_QUESTIONS = [
    { id: 'policy', clause: '5.2', q: 'What is the information security policy trying to achieve for the business?', listen: 'Why security matters to the business, in their own words; that they approved the policy and it is communicated.',
      fact: function (d) { return d.policyApproved ? { ok: true, text: 'The information security policy is approved.' } : { ok: false, text: 'The information security policy is not approved yet: approve it before the interview.' }; } },
    { id: 'objectives', clause: '6.2', q: 'What are this year’s security objectives, and how are they going?', listen: 'Two or three objectives by name, roughly where each stands, and what happens when one slips.',
      fact: function (d) { var o = (d.objectives || []).filter(function (x) { return x && x.status !== 'Achieved'; }); var risk = o.filter(function (x) { return /risk|behind|off/i.test(x.status || ''); }); return !o.length ? { ok: false, text: 'No open objectives in the register.' } : { ok: !risk.length, text: o.length + ' open objective' + (o.length === 1 ? '' : 's') + ': ' + o.slice(0, 3).map(function (x) { return x.title; }).join('; ') + (risk.length ? '. ' + risk.length + ' at risk: the answer should say what is being done about it.' : '.') }; } },
    { id: 'risk', clause: '6.1', q: 'What are the biggest information security risks, and how much risk are you willing to accept?', listen: 'The top two or three risks in business terms, and the appetite stated the same way the register states it.',
      fact: function (d) { return d.aboveAppetite ? { ok: false, text: d.aboveAppetite + ' risk' + (d.aboveAppetite === 1 ? ' is' : 's are') + ' above the ' + (d.appetite || 'set') + ' appetite without a recorded acceptance. Saying "we accept nothing above ' + (d.appetite || 'it') + '" would contradict the register.' } : { ok: true, text: 'Risk appetite is ' + (d.appetite || 'not set') + ' and every risk above it is accepted or treated.' }; } },
    { id: 'roles', clause: '5.3', q: 'Who runs information security day to day, and who do they report to?', listen: 'A named person, their authority to act, and that they report to top management.',
      fact: function (d) { return d.ismsOwner ? { ok: true, text: 'The ISMS owner on record is ' + d.ismsOwner + '.' } : { ok: false, text: 'No ISMS owner is recorded: set up the monthly security review with an owner.' }; } },
    { id: 'resources', clause: '7.1', q: 'What resources have you given information security this year?', listen: 'People’s time, budget or tools, and how they decide when more is needed.',
      fact: function (d) { return d.resourcesStated ? { ok: true, text: 'The objectives plan states the resources for each objective.' } : { ok: false, text: 'No resources are stated against the objectives: the answer will have nothing to point at.' }; } },
    { id: 'review', clause: '9.3', q: 'When did you last review the ISMS, and what did you decide?', listen: 'The date of the last management review and one or two decisions it made.',
      fact: function (d) { if (!d.lastReview) return { ok: false, text: 'No management review is recorded.' }; var age = daysBetweenDateStr(String(d.lastReview).slice(0, 10), d.today); return { ok: age <= 365, text: 'Last management review ' + String(d.lastReview).slice(0, 10) + (age > 365 ? ': over a year ago.' : '.') }; } },
    { id: 'improve', clause: '10', q: 'Tell me about a security problem and what changed because of it.', listen: 'A real incident, audit finding or near miss, its cause, and the change it led to.',
      fact: function (d) { return d.correctiveWithCause || d.incidents ? { ok: true, text: (d.incidents || 0) + ' incident(s) in the last 12 months; ' + (d.correctiveWithCause || 0) + ' corrective action(s) with a root cause recorded.' } : { ok: false, text: 'No incidents or corrective actions with a root cause recorded: pick an example from an audit finding or a posture scan fix.' }; } },
    { id: 'change', clause: '4.1', q: 'What has changed in the business this year that affects security?', listen: 'New systems, suppliers, people or customers, and how the ISMS was adjusted.',
      fact: function (d) { return { ok: true, text: (d.changes || 0) + ' change(s) to the management system recorded since the last review (see the ISMS change log).' }; } }
  ];
  /* Each question with its records check and the recorded answer.
     flagged = the records have a gap the answer has to address, or no
     answer yet. */
  function topManagementInterview(d, answers) {
    d = d || {}; answers = answers || {};
    var rows = TOP_MGMT_QUESTIONS.map(function (q) {
      var f = q.fact(d), a = String(answers[q.id] || '').trim();
      return { id: q.id, clause: q.clause, q: q.q, listen: q.listen, records: f.text, recordsOk: f.ok, answer: a, flagged: !a || !f.ok };
    });
    return { rows: rows, answered: rows.filter(function (r) { return r.answer; }).length, flagged: rows.filter(function (r) { return r.flagged; }).length, total: rows.length };
  }

  /* ---- ISMS change log (Clause 9.3.2 b, 6.3) ----
     What changed in the management system over a period, in the words
     top management reads: scope, policies, risks, suppliers, people,
     incidents, audits. Built from the audit log alone, so it is only
     ever what was actually recorded. Housekeeping (exports, reminders,
     reports, settings noise) is left out on purpose. */
  var ISMS_CHANGE_AREAS = [
    { key: 'scope', label: 'Scope and context', re: /^(Scope answer changed|Organisation profile updated|Applicability toggled|Control applicability changed|Exclusion justification changed)$/ },
    { key: 'policies', label: 'Policies and documents', re: /^(Policy document approved|Own document uploaded|Document approval request completed)$/, docs: true },
    { key: 'risks', label: 'Risks and opportunities', re: /^(Risk added manually|Business risk approved from findings|Risk closed|Risk closed — resolution approved|Residual risk accepted|Risk reopened|Opportunity added|Risk deleted)$/ },
    { key: 'suppliers', label: 'Suppliers', re: /^(Vendor added|Supplier certificate renewed|Vendor reviewed)$/ },
    { key: 'people', label: 'People and ownership', re: /^(Leaver hand-over|Ownership handed over|Control owner changed|Clause owner changed)$/ },
    { key: 'assets', label: 'Assets and AI systems', re: /^(Asset added|Asset retired|Asset register synced|AI system added)$/ },
    { key: 'incidents', label: 'Incidents', re: /^(Incident logged|Incident closed)$/ },
    { key: 'assurance', label: 'Audits, reviews and certification', re: /^(Internal audit completed|Audit finding raised|Certification body finding raised|Certification audit recorded|Certificate recorded|Management review recorded|Security review held)$/ },
    { key: 'objectives', label: 'Objectives', re: /^(Objective added|Objective status measured)$/ }
  ];
  function ismsChangeLog(auditLog, since, until) {
    var from = String(since || '').slice(0, 10), to = String(until || '9999-12-31').slice(0, 10);
    var groups = ISMS_CHANGE_AREAS.map(function (a) { return { key: a.key, label: a.label, count: 0, items: [] }; });
    var total = 0;
    (auditLog || []).forEach(function (e) {
      if (!e) return;
      var day = String(e.entryDateTime || '').slice(0, 10);
      if (!day || day < from || day > to) return;
      var act = String(e.action || '');
      var area = -1;
      ISMS_CHANGE_AREAS.forEach(function (a, i) { if (area === -1 && a.re.test(act)) area = i; });
      /* A document marked Superseded or Approved by hand is a policy change too. */
      if (area === -1 && act === 'Document details changed' && /\| (Approved|Superseded) \|/.test(' ' + (e.after || '') + ' ')) area = 1;
      if (area === -1) return;
      var g = groups[area];
      g.count++; total++;
      var after = String(e.after || '').replace(/\s+/g, ' ').trim();
      if (after.length > 90) after = after.slice(0, 87) + '…';
      g.items.push({ date: day, action: act, target: String(e.targetId || ''), text: act + ': ' + String(e.targetId || '').replace(/\.html$/i, '') + (after && after !== e.targetId ? ' (' + after + ')' : '') });
    });
    groups.forEach(function (g) { g.items.sort(function (a, b) { return b.date.localeCompare(a.date); }); });
    return { since: from, until: to === '9999-12-31' ? '' : to, total: total, groups: groups.filter(function (g) { return g.count; }) };
  }
  /* One line per area, for the management review "changes" input and
     the chair's summary. */
  function ismsChangeLines(log, perArea) {
    return ((log && log.groups) || []).map(function (g) {
      var names = [];
      g.items.forEach(function (it) { var n = it.target.replace(/\.html$/i, ''); if (n && names.indexOf(n) === -1) names.push(n); });
      var k = perArea || 3;
      return g.label + ': ' + g.count + ' change' + (g.count === 1 ? '' : 's') + (names.length ? ' (' + names.slice(0, k).join(', ') + (names.length > k ? ' and ' + (names.length - k) + ' more' : '') + ')' : '');
    });
  }

  /* ---- Policy acknowledgement nudges (A.5.1, A.6.3, Clause 7.3/7.4) ----
     An approved policy whose current version has never been sent for
     acknowledgement. reason = 'new' (never sent) or 'changed' (an older
     version was sent; staff acknowledged something that is no longer
     the policy). docs = approved controlled policies only. */
  function policiesNeedingAcknowledgement(docs, attestations) {
    var rows = attestations || [];
    return (docs || []).filter(function (d) { return d && d.name; }).map(function (d) {
      var mine = rows.filter(function (r) { return r.docName === d.name; });
      var current = mine.filter(function (r) { return String(r.docVersion || '') === String(d.version || ''); });
      if (current.length) return null;
      var older = mine.map(function (r) { return String(r.docVersion || ''); }).filter(Boolean).sort().pop() || '';
      return { id: d.id, name: d.name, version: d.version || '', url: d.url || '', reason: mine.length ? 'changed' : 'new', previousVersion: older, approvalDate: d.approvalDate || '' };
    }).filter(Boolean).sort(function (a, b) { return String(b.approvalDate).localeCompare(String(a.approvalDate)); });
  }
  /* Who to chase this week: per campaign, the people still outstanding
     after `afterDays` (7) since assignment, when the campaign was not
     already chased in the last `everyDays` (7). lastChased = { campaignId: 'YYYY-MM-DD' }.
     A campaign that reached 100% drops out on its own. */
  function attestationsToChase(rows, today, lastChased, afterDays, everyDays) {
    var after = afterDays == null ? 7 : afterDays, every = everyDays == null ? 7 : everyDays;
    var chased = lastChased || {};
    return attestationCampaigns(rows || []).filter(function (c) {
      if (!c.outstanding || !c.launched) return false;
      if (c.launched > addDaysIso(today, -after)) return false;
      var last = chased[c.id];
      return !last || last <= addDaysIso(today, -every);
    }).map(function (c) {
      return { campaign: c.id, docName: c.docName, docVersion: c.docVersion, docUrl: c.docUrl, pct: c.pct, outstanding: c.outstandingRows.map(function (r) { return { id: r.id, upn: r.upn, userName: r.userName }; }) };
    });
  }

  /* The dashboard's one "Do next" list: at most five things, ranked
     across every source that used to have its own list (the next path
     step, lapsed clause obligations, approvals waiting for you, risks
     above appetite and the actions holding the posture back). d = {
     nextStep:{label,why,action,id,label2}, gaps, approvals:[{name,key}],
     aboveAppetite:[ids], actions:[{title,reason,id,tier}] } */
  function dashDoNext(d, max) {
    d = d || {};
    var out = [];
    var add = function (weight, kind, title, why, action, id, button) { out.push({ weight: weight, kind: kind, title: title, why: why || '', action: action, id: id || '', button: button }); };
    (d.approvals || []).forEach(function (r) { add(88, 'Approval', 'Approve ' + String(r.name || '').replace(/\.html$/i, ''), 'Waiting for your approval', 'App.approveRequested', r.key, 'Review and approve'); });
    (d.gaps || []).forEach(function (g) { add(g.severity === 'fail' ? 90 : 52, 'Requirement', (g.clause ? 'Clause ' + g.clause + ' ' : '') + g.title, g.issue, 'App.go', g.view, g.fix); });
    var above = d.aboveAppetite || [];
    if (above.length) add(80, 'Risk', above.length + ' risk' + (above.length === 1 ? ' is' : 's are') + ' above your risk appetite', above.slice(0, 3).join(', ') + (above.length > 3 ? ' and ' + (above.length - 3) + ' more' : '') + ': treat or accept ' + (above.length === 1 ? 'it' : 'them'), 'App.go', 'risks', 'Review the risks');
    var ack = d.ackWaiting || [];
    if (ack.length) add(66, 'Policy', ack.length + ' approved polic' + (ack.length === 1 ? 'y has' : 'ies have') + ' not been sent to staff', ack.slice(0, 2).map(function (n) { return String(n).replace(/\.html$/i, ''); }).join(', ') + (ack.length > 2 ? ' and ' + (ack.length - 2) + ' more' : '') + ': staff must acknowledge the current version', 'App.go', 'attestations', 'Send for acknowledgement');
    if (d.nextStep) add(70, 'Next step', d.nextStep.label, d.nextStep.why, d.nextStep.action, d.nextStep.id, d.nextStep.button || 'Start');
    (d.actions || []).forEach(function (r) { add(r.tier >= 2 ? 76 : r.tier === 1 ? 62 : 48, 'Action', r.title, r.reason, 'App.openAction', r.id, 'Open'); });
    var seen = {};
    return out.filter(function (x) { var k = x.kind + '|' + x.title; if (seen[k]) return false; seen[k] = true; return true; })
      .sort(function (a, b) { return b.weight - a.weight; }).slice(0, max || 5);
  }
  /* Frameworks the client is actually working towards, for the
     readiness strip: the primary one, any with progress, and any marked
     as a target. The rest wait behind "Show all frameworks". stats =
     { fw: { pct, clausePct } } */
  function pursuedFrameworks(fws, stats, targets) {
    var t = targets || [], st = stats || {};
    var list = (fws || []).filter(function (fw) {
      var x = st[fw] || {};
      return fw === 'iso27001' || t.indexOf(fw) !== -1 || (x.pct || 0) > 0 || (x.clausePct || 0) > 0;
    });
    return list.length ? list : (fws || []).slice(0, 1);
  }
  /* What the assurance pulse says in words: how many of the weeks saw
     compliance work, whether it has gone quiet, and the longest gap. */
  function pulseSummary(grid) {
    var weeks = grid || [], active = 0, quietNow = 0, longest = 0, run = 0, totals = {};
    weeks.forEach(function (w) {
      if (w.total > 0) { active++; run = 0; } else { run++; if (run > longest) longest = run; }
      Object.keys(w.counts || {}).forEach(function (k) { totals[k] = (totals[k] || 0) + w.counts[k]; });
    });
    for (var i = weeks.length - 1; i >= 0 && !weeks[i].total; i--) quietNow++;
    var top = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; })[0];
    var label = { scan: 'posture scans', evidence: 'evidence added', attestation: 'controls verified', review: 'management reviews', audit: 'internal audits' };
    var lines = [];
    lines.push('Compliance work happened in ' + active + ' of the last ' + weeks.length + ' weeks.');
    if (quietNow >= 2) lines.push('Nothing recorded for the last ' + quietNow + ' weeks: an auditor looks for steady activity, not bursts.');
    else if (longest >= 4) lines.push('The longest quiet spell was ' + longest + ' weeks.');
    if (top && totals[top]) lines.push('Most of it: ' + label[top] + ' (' + totals[top] + ').');
    var missing = ['review', 'audit'].filter(function (k) { return !totals[k]; });
    if (missing.length) lines.push('No ' + missing.map(function (k) { return label[k]; }).join(' or ') + ' in this period.');
    return { activeWeeks: active, weeks: weeks.length, quietNow: quietNow, longestQuiet: longest, totals: totals, text: lines };
  }
  /* Month by month, from the packs of meetings held. */
  function securityReviewTrend(reviews) {
    return (reviews || []).filter(function (r) { return r && r.pack && r.date; }).slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (r) {
      var p = r.pack;
      return { n: r.n, date: r.date, score: p.posture ? p.posture.score : null, overdue: p.actions ? p.actions.overdue : null, aboveAppetite: p.risks ? p.risks.aboveAppetite : null, incidents: p.incidents ? p.incidents.count : null };
    });
  }
  /* What the year's monthly meetings add to the Clause 9.3.2 inputs. */
  function securityReviewYearSummary(reviews, since) {
    var held = (reviews || []).filter(function (r) { return r && r.status === 'Held' && (!since || r.date >= since); }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (!held.length) return null;
    var tr = securityReviewTrend(held);
    var first = tr[0] || {}, last = tr[tr.length - 1] || {};
    var move = function (k, label) { return first[k] != null && last[k] != null && tr.length > 1 ? label + ' ' + first[k] + ' to ' + last[k] : ''; };
    var decisions = held.reduce(function (n, r) { return n + ((r.actions || []).length); }, 0);
    var outcomes = held.filter(function (r) { return r.outcome; }).slice(-12).map(function (r) { return { n: r.n, date: r.date, outcome: r.outcome }; });
    return {
      held: held.length, decisions: decisions, outcomes: outcomes,
      outcomeText: outcomes.map(function (o) { return srDate(o.date) + ': ' + o.outcome; }).join('; '),
      performance: [move('score', 'posture score'), move('overdue', 'overdue actions'), move('incidents', 'incidents a month')].filter(Boolean).join('; '),
      risk: move('aboveAppetite', 'risks above appetite'),
      text: held.length + ' monthly security review' + (held.length === 1 ? '' : 's') + ' held since ' + srDate(held[0].date) + ', with ' + decisions + ' decision' + (decisions === 1 ? '' : 's') + ' recorded as actions.'
    };
  }

  /* ============================================================
     Register fundamentals
     ------------------------------------------------------------ */
  var DONE_ACTION = function (a) { return a && (a.status === 'Done' || a.status === 'Cancelled'); };
  /* A risk's treatment: how many of its actions are finished, the next
     open due date, and how many are overdue. */
  function riskTreatmentProgress(r, actions, today) {
    var mine = (actions || []).filter(function (a) { return a && ((r.actions || []).indexOf(a.id) !== -1 || a.risk === r.id); });
    var open = mine.filter(function (a) { return !DONE_ACTION(a); });
    var dues = open.map(function (a) { return a.due; }).filter(Boolean).sort();
    return {
      total: mine.length, done: mine.length - open.length, open: open.length,
      nextDue: dues[0] || '', overdue: open.filter(function (a) { return a.due && a.due < today; }).length
    };
  }
  /* Every treatment action is finished but the residual is still the
     arithmetic estimate, or was assessed before the last one closed:
     time to reassess. */
  function riskNeedsReassessment(r, actions, updates) {
    if (!r || r.status === 'Closed' || r.type === 'Opportunity') return false;
    var mine = (actions || []).filter(function (a) { return a && ((r.actions || []).indexOf(a.id) !== -1 || a.risk === r.id); });
    if (!mine.length || !mine.every(DONE_ACTION)) return false;
    if (typeof r.resL !== 'number' || typeof r.resI !== 'number' || !r.resDate) return true;
    var ids = mine.map(function (a) { return a.id; });
    var lastClosed = (updates || []).filter(function (u) { return u && ids.indexOf(u.action) !== -1 && (u.status === 'Done' || u.status === 'Cancelled'); })
      .map(function (u) { return String(u.date || '').slice(0, 10); }).sort().pop() || '';
    return !!lastClosed && lastClosed > r.resDate;
  }

  /* What needs tidying in a register, each item with the filter that
     shows it. kind: 'risks' | 'actions' | 'vendors' | 'assets' | 'legal'.
     ctx = { actions, today, users } (users optional: owners not found
     in the Microsoft 365 directory are listed when it is given). */
  function registerTidy(kind, rows, ctx) {
    ctx = ctx || {};
    var today = ctx.today || '';
    var live, out = [];
    var add = function (key, list, one, many) { if (list.length) out.push({ key: key, n: list.length, label: list.length === 1 ? one : list.length + ' ' + many, ids: list.map(function (x) { return x.id; }) }); };
    var noOwner = function (x) { return !String(x.owner || '').trim(); };
    var unknownOwner = function (x) { return ctx.users && String(x.owner || '').trim() && !x.ownerEmail && !matchOwnerToUser(x.owner, ctx.users); };
    if (kind === 'risks') {
      live = (rows || []).filter(function (r) { return r && r.status !== 'Closed' && r.type !== 'Opportunity'; });
      add('noOwner', live.filter(noOwner), '1 risk without an owner', 'risks without an owner');
      add('noControls', live.filter(function (r) { return !(r.controls || []).length; }), '1 risk without linked controls', 'risks without linked controls');
      add('noActions', live.filter(function (r) { return (r.treat || 'Treat') === 'Treat' && !riskTreatmentProgress(r, ctx.actions, today).total; }), '1 risk being treated with no actions', 'risks being treated with no actions');
      add('reassess', live.filter(function (r) { return riskNeedsReassessment(r, ctx.actions, ctx.updates); }), '1 risk to reassess (treatment finished)', 'risks to reassess (treatment finished)');
      add('unknownOwner', live.filter(unknownOwner), '1 owner to link to Microsoft 365', 'owners to link to Microsoft 365');
    } else if (kind === 'actions') {
      live = (rows || []).filter(function (a) { return a && !DONE_ACTION(a); });
      add('noDue', live.filter(function (a) { return !a.due; }), '1 action without a due date', 'actions without a due date');
      add('noOwner', live.filter(noOwner), '1 action without an owner', 'actions without an owner');
      add('unlinked', live.filter(function (a) { return !a.risk && !a.control; }), '1 action not linked to a risk or control', 'actions not linked to a risk or control');
      add('unknownOwner', live.filter(unknownOwner), '1 owner to link to Microsoft 365', 'owners to link to Microsoft 365');
    } else if (kind === 'vendors') {
      live = (rows || []).filter(Boolean);
      add('noOwner', live.filter(noOwner), '1 vendor without an owner', 'vendors without an owner');
      add('noReview', live.filter(function (v) { return !v.nextReviewDue; }), '1 vendor without a review date', 'vendors without a review date');
      add('certExpired', live.filter(function (v) { return v.certExpiryDate && v.certExpiryDate < today; }), '1 vendor whose certification has expired', 'vendors whose certification has expired');
      add('noDpa', live.filter(function (v) { return vendorHandlesPersonalData(v) && !v.dpa; }), '1 vendor with personal information and no data processing agreement', 'vendors with personal information and no data processing agreement');
      add('unknownOwner', live.filter(unknownOwner), '1 owner to link to Microsoft 365', 'owners to link to Microsoft 365');
    } else if (kind === 'assets') {
      live = (rows || []).filter(function (a) { return a && a.status !== 'Retired' && a.status !== 'Missing'; });
      add('noOwner', live.filter(noOwner), '1 asset without an owner', 'assets without an owner');
      add('noClass', live.filter(function (a) { return !a.classification; }), '1 asset not classified', 'assets not classified');
      add('notFound', live.filter(function (a) { return a.status === 'Not found in last sync'; }), '1 asset not found in the last sync', 'assets not found in the last sync');
      add('retiredGaps', (rows || []).filter(function (a) { return a && a.status === 'Retired' && retirementGaps(a).length; }), '1 retired asset with an incomplete disposal record', 'retired assets with incomplete disposal records');
    } else if (kind === 'legal') {
      live = (rows || []).filter(function (l) { return l && l.applies !== 'No'; });
      add('noOwner', live.filter(noOwner), '1 requirement without an owner', 'requirements without an owner');
      add('noControls', live.filter(function (l) { return !(l.controls || []).length; }), '1 requirement not linked to controls', 'requirements not linked to controls');
    }
    return out;
  }

  /* Vendors. */
  function vendorHandlesPersonalData(v) {
    if (!v) return false;
    if (v.tier && v.tier.personal) return true;
    return (v.dataCategories || []).some(function (c) { return /personal|PII|health|employee|customer/i.test(c); });
  }
  /* Four tiering questions set the criticality: production access with
     sensitive data, or three of the four, is Critical; production access
     or two is High; one is Medium; none is Low. */
  function vendorCriticalityFromTier(t) {
    t = t || {};
    var n = ['prod', 'personal', 'confidential', 'hard'].filter(function (k) { return !!t[k]; }).length;
    if ((t.prod && (t.personal || t.confidential)) || n >= 3) return 'Critical';
    if (t.prod || n === 2) return 'High';
    return n === 1 ? 'Medium' : 'Low';
  }
  var VENDOR_REVIEW_MONTHS = { Critical: 12, High: 12, Medium: 24, Low: 36 };
  /* When a vendor is next due for review: its cadence from the last
     review (or today), brought forward to the certification or report
     expiry when that comes first, since an expired report is the moment
     the assurance runs out. */
  function vendorNextReview(v, today) {
    var months = VENDOR_REVIEW_MONTHS[(v && v.criticality) || 'Medium'] || 24;
    var from = (v && v.lastReviewed) || today;
    var due = addMonthsIso(String(from).slice(0, 10), months);
    if (v && v.certExpiryDate && v.certExpiryDate < due) due = v.certExpiryDate;
    return due;
  }
  function normaliseVendorName(n) {
    return String(n || '').toLowerCase().replace(/\b(inc|llc|ltd|pty|limited|corp|corporation|co|gmbh|plc)\b\.?/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  /* Third-party applications in the tenant as proposed vendors, one per
     publisher. apps = [{ id, name, publisher }]. Skips any already in
     the register (by vendor or app name) or dismissed. */
  function vendorCandidates(apps, vendors, dismissed) {
    var known = {};
    (vendors || []).forEach(function (v) { known[normaliseVendorName(v.name)] = true; (v.apps || []).forEach(function (a) { known[normaliseVendorName(a)] = true; }); });
    var gone = {};
    (dismissed || []).forEach(function (d) { gone[normaliseVendorName(d)] = true; });
    /* "Zoom" and "Zoom Video" are the same supplier: a whole-word prefix
       either way counts as known. */
    var knownKeys = Object.keys(known);
    var isKnown = function (k) { return !!k && (known[k] || knownKeys.some(function (n) { return n.indexOf(k + ' ') === 0 || k.indexOf(n + ' ') === 0; })); };
    var byPub = {}, order = [];
    (apps || []).forEach(function (a) {
      if (!a || !a.name) return;
      var vendor = a.publisher || a.name;
      var k = normaliseVendorName(vendor);
      if (!k || gone[k] || isKnown(k) || isKnown(normaliseVendorName(a.name))) return;
      if (!byPub[k]) { byPub[k] = { key: k, name: vendor, apps: [] }; order.push(k); }
      if (byPub[k].apps.indexOf(a.name) === -1) byPub[k].apps.push(a.name);
    });
    return order.map(function (k) { return byPub[k]; }).sort(function (a, b) { return b.apps.length - a.apps.length || a.name.localeCompare(b.name); });
  }

  /* Owners: who each free-text owner is in the directory. Returns
     { matched: [{ owner, user }], unmatched: [owner] } over the distinct
     owners given. */
  function matchOwners(owners, users) {
    var seen = {}, matched = [], unmatched = [];
    (owners || []).forEach(function (o) {
      var k = String(o || '').trim();
      if (!k || seen[k.toLowerCase()]) return;
      seen[k.toLowerCase()] = true;
      var u = matchOwnerToUser(k, users) || fuzzyOwnerMatch(k, users);
      if (u) matched.push({ owner: k, user: u }); else unmatched.push(k);
    });
    return { matched: matched, unmatched: unmatched };
  }
  /* "K. Patel" or "Kim P" against display names: an initial plus the
     surname, only when exactly one person fits. */
  function fuzzyOwnerMatch(owner, users) {
    var parts = String(owner).toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    var first = parts[0], last = parts[parts.length - 1];
    var hits = (users || []).filter(function (u) {
      var n = String(u.displayName || u.name || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (n.length < 2) return false;
      var uf = n[0], ul = n[n.length - 1];
      return ul === last && (uf === first || (first.length === 1 && uf.charAt(0) === first)) ||
        uf === first && last.length === 1 && ul.charAt(0) === last;
    });
    return hits.length === 1 ? hits[0] : null;
  }

  /* ============================================================
     Posture scan presentation
     ------------------------------------------------------------ */
  /* The one-line result for a check row: the note's first clause, cut
     at a word boundary. The full note shows when the row is opened. */
  function checkHeadline(note, max) {
    max = max || 90;
    var s = String(note || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    var cut = s.search(/ — |\. |; /);
    if (cut > 0) s = s.slice(0, cut);
    s = s.replace(/\.$/, '');
    if ((s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length) s = s.slice(0, s.lastIndexOf('(')).trim();
    if (s.length <= max) return s;
    var sp = s.lastIndexOf(' ', max - 1);
    return s.slice(0, sp > max / 2 ? sp : max - 1) + '…';
  }
  /* What to fix first: failing checks, most severe first (by the
     inherent score of the risk each would raise), then review-grade.
     checks = [{ id, label, rag, score }]. */
  function scanFixFirst(checks, n) {
    var rank = { red: 0, amber: 1 };
    return (checks || []).filter(function (c) { return c && (c.rag === 'red' || c.rag === 'amber'); })
      .sort(function (a, b) { return rank[a.rag] - rank[b.rag] || (b.score || 0) - (a.score || 0) || String(a.label).localeCompare(String(b.label)); })
      .slice(0, n || 5);
  }

  function resolvableFindings(risks, actions, checkResultsById) {
    var actionsById = {};
    (actions || []).forEach(function (a) { if (a && a.id) actionsById[a.id] = a; });
    var out = [];
    (risks || []).forEach(function (r) {
      if (!r || r.status === 'Closed' || r.resolutionDismissed) return;
      /* A business risk covers several findings: ready to close only
         when every one of them now passes. Context-only findings have
         no check, so a risk holding one is never closed by a scan. */
      var fs = riskFindings(r);
      if (!fs.length || !fs.every(function (f) { return (checkResultsById || {})[f] === 'pass'; })) return;
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

  /* Actions agreed at a management review, one per line:
     "what; owner; due date" (also "what - owner - due" or "what | owner | due").
     Owner and date are optional; a line with no date is due in 90 days. */
  function parseReviewActionLines(text, today) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var l = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
      if (!l) return;
      var parts = l.split(/\s*(?:;|\|| — | – | - )\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
      var due = '', owner = '';
      for (var i = parts.length - 1; i > 0; i--) {
        var p = parts[i], d = '';
        var au = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(p);
        if (/^\d{4}-\d{2}-\d{2}$/.test(p)) d = p;
        else if (au) d = au[3] + '-' + ('0' + au[2]).slice(-2) + '-' + ('0' + au[1]).slice(-2);
        else if (/^\d{1,2} [A-Za-z]{3,9} \d{4}$/.test(p)) d = normaliseDateInput(p + ' UTC');
        if (!due && d) { due = d; parts.splice(i, 1); continue; }
      }
      if (parts.length > 1) owner = parts.pop();
      var title = parts.join(' - ');
      if (!title) return;
      var dd = new Date(String(today).slice(0, 10) + 'T00:00:00Z');
      if (!due && !isNaN(dd)) { dd.setUTCDate(dd.getUTCDate() + 90); due = dd.toISOString().slice(0, 10); }
      out.push({ title: title, owner: owner, due: due });
    });
    return out;
  }

  /* The register snapshot that is the evidence for each record-based
     clause, filed into that clause's evidence folder: { code: [report types] }.
     Reports are the ones Checkpoint already builds. */
  var CLAUSE_SNAPSHOTS = {
    '6.1.2': ['risk'], '8.2': ['risk'],
    '6.1.3': ['rtp', 'soa'], '8.3': ['rtp'],
    '6.2': ['objectives'], '9.1': ['objectives'],
    '7.2': ['training'],
    '10.2': ['capa']
  };

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
  /* Fetches one premium pack's ciphertext, surviving a deploy. Pack file
     names are content-hashed and change on every build (AES-GCM uses a
     fresh IV each time), so a manifest the browser still holds from the
     previous deploy names files that no longer exist: a 404. On a 404
     the manifest is re-read straight from the server (loadManifest(true))
     and the fetch retried once against the new file name. A 5xx (a
     hosting blip) is retried once as-is. Returns { text, entry,
     manifest } with the entry actually used, since the caller hash-checks
     against it; throws with the final HTTP status otherwise. */
  async function fetchPackText(fetchFn, moduleId, manifest, loadManifest) {
    var entry = manifest && manifest[moduleId];
    if (!entry) throw new Error('no pack published for this module');
    var resp = await fetchFn('packs/' + entry.file);
    if (!resp.ok && resp.status === 404 && loadManifest) {
      manifest = await loadManifest(true);
      entry = manifest && manifest[moduleId];
      if (!entry) throw new Error('no pack published for this module');
      resp = await fetchFn('packs/' + entry.file);
    } else if (!resp.ok && resp.status >= 500) {
      resp = await fetchFn('packs/' + entry.file);
    }
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' fetching pack file');
    return { text: await resp.text(), entry: entry, manifest: manifest };
  }

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
    if (a.develops === 'outsourced') internal.push('software development carried out wholly or partly by an external development partner, which brings outsourced development, secure development, change control and protection of source code into scope');
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

    /* The climate change determination (Clause 4.1) and whether any
       interested party has climate-related requirements (the 4.2 note),
       both from Amendment 1 (2024). Only what was answered: an
       unanswered question drafts nothing, so the document shows a
       "to be completed" marker rather than a determination nobody made. */
    var climateParts = [];
    if (a.climate === 'relevant') climateParts.push('Climate change has been determined to be a relevant issue: the effects of extreme weather on facilities, power, connectivity and key suppliers are assessed in the risk register and addressed through business continuity and supplier arrangements.');
    if (a.climate === 'not-relevant') climateParts.push('Climate change has been determined not to be a material issue for the management system at present, because the organisation\u2019s information and services do not depend materially on sites, power or suppliers exposed to climate-related disruption.');
    if (a.climateReqs === 'yes') climateParts.push('Some interested parties have climate-related requirements, such as services that withstand extreme weather or climate reporting; these are recorded with their other requirements and addressed through continuity and supplier arrangements.');
    if (a.climateReqs === 'no') climateParts.push('No interested party has been identified with climate-related requirements; this is rechecked whenever interested parties\u2019 requirements are reviewed.');
    if (climateParts.length) climateParts.push('The determination is revisited at each management review.');
    var climate = climateParts.join(' ');
    if (a.climateReqs === 'yes') reqs.push('some customers, regulators or other parties have climate-related requirements, such as services that withstand extreme weather or climate reporting');

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
    if (a.ai === 'builds' && (a.develops === 'yes' || a.develops === 'outsourced')) issues.push('in-house development and change of AI capabilities, which brings data quality, model evaluation and life-cycle controls into scope');

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
     a device missing from Intune is itself something to look into. A
     synced asset someone has retired stays retired on every later sync. */
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
      /* Retired is a person's decision (a laptop disposed of, or a synced
         app that is sign-in plumbing rather than an asset), so a sync that
         still finds it leaves it retired instead of reviving it. */
      if (cur && cur.status === 'Retired') return;
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
      retired: (assets || []).filter(function (a) { return a && a.status === 'Retired'; }).length,
      /* Ready for an auditor: at least one INFORMATION asset (a device
         list alone is not an A.5.9 inventory), and every live asset owned. */
      ready: info.length > 0 && noOwner.length === 0
    };
  }

  /* ============================================================
     Asset retirement and disposal (ISO 27001 A.5.11, A.7.10, A.7.14)
     ------------------------------------------------------------
     Retiring an asset is a record, not a status flip: an auditor
     samples recent disposals and asks when, why, how the data was
     dealt with, and who signed it off. a.retirement holds
     { date, reason, method, evidenceUrl, by, note }. */
  var ASSET_RETIRE_REASONS = ['Disposed of', 'Returned by a leaver', 'Sold or given away', 'Replaced', 'No longer used', 'Returned to the supplier'];
  var ASSET_DISPOSAL_METHODS = ['Wiped and reissued', 'Wiped (certificate or report)', 'Destroyed (certificate)', 'Returned to the supplier', 'Data deleted from the service', 'No data held'];
  /* Methods whose claim rests on proof someone else holds. */
  var DISPOSAL_NEEDS_EVIDENCE = { 'Wiped (certificate or report)': 1, 'Destroyed (certificate)': 1, 'Data deleted from the service': 1 };
  function retirementGaps(a) {
    var r = (a && a.retirement) || {};
    var gaps = [];
    if (!r.date) gaps.push('no retirement date');
    if (!r.reason) gaps.push('no reason');
    if (!r.method && (a && a.type) !== 'Other') gaps.push('no disposal method');
    if (r.method && DISPOSAL_NEEDS_EVIDENCE[r.method] && !String(r.evidenceUrl || '').trim()) gaps.push('no wipe or destruction evidence');
    if (!String(r.by || '').trim()) gaps.push('not signed off');
    return gaps;
  }
  /* Retired assets, newest first, each with its gaps. A record with no
     date sorts last: it is the one most likely to need attention. */
  function retiredAssets(assets, today, days) {
    var since = today ? addDaysIso(today, -(typeof days === 'number' ? days : 365)) : '';
    var rows = (assets || []).filter(function (a) { return a && a.status === 'Retired'; }).map(function (a) {
      var d = (a.retirement && a.retirement.date) || '';
      return { asset: a, date: d, gaps: retirementGaps(a), recent: !!(d && since && d >= since) };
    });
    rows.sort(function (x, y) { return x.date === y.date ? String(x.asset.id).localeCompare(String(y.asset.id)) : (x.date < y.date ? 1 : -1); });
    return {
      rows: rows, total: rows.length,
      recent: rows.filter(function (r) { return r.recent; }).length,
      withGaps: rows.filter(function (r) { return r.gaps.length; }).length
    };
  }
  /* Parses the stored Retirement column; tolerant of blanks and junk. */
  function parseRetirement(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { var o = JSON.parse(raw); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
  }

  /* ============================================================
     Owners who have left (ISO 27001 A.5.11, A.6.5)
     ------------------------------------------------------------
     records = [{ kind, id, title, owner }] across every register.
     active = enabled directory users; disabled = disabled member
     accounts. An owner matching an active person is fine. One matching
     only a disabled account has left. One matching nobody is listed
     separately and softly: it may be a team ("Legal", "IT"), so it is
     offered, never assumed. Teams by name are skipped outright. */
  var TEAM_WORDS = /\b(team|group|board|committee|management|department|dept|function|office|services|it|hr|legal|finance|operations|ops|security|leadership|executive|everyone|all staff)\b/i;
  function departedOwners(records, active, disabled) {
    var byOwner = {}, order = [];
    (records || []).forEach(function (r) {
      var o = String((r && r.owner) || '').trim();
      if (!o) return;
      var k = o.toLowerCase();
      if (!byOwner[k]) { byOwner[k] = { owner: o, items: [] }; order.push(k); }
      byOwner[k].items.push(r);
    });
    /* "R. Morgan", "r.morgan@…" and "Riley Morgan" are one person who
       left: grouped under the account they match. */
    var out = [], byUser = {};
    order.forEach(function (k) {
      var g = byOwner[k];
      if (matchOwnerToUser(g.owner, active) || fuzzyOwnerMatch(g.owner, active)) return;
      var gone = matchOwnerToUser(g.owner, disabled) || fuzzyOwnerMatch(g.owner, disabled);
      if (gone) {
        var uk = String(gone.upn || gone.mail || gone.name || gone.displayName).toLowerCase();
        if (byUser[uk]) { byUser[uk].items = byUser[uk].items.concat(g.items); byUser[uk].aliases.push(g.owner); return; }
        byUser[uk] = { owner: gone.name || gone.displayName || g.owner, status: 'left', user: gone, items: g.items.slice(), aliases: [g.owner] };
        out.push(byUser[uk]);
        return;
      }
      if (!(active || []).length || TEAM_WORDS.test(g.owner)) return;
      out.push({ owner: g.owner, status: 'not found', user: null, items: g.items, aliases: [g.owner] });
    });
    out.sort(function (a, b) { return a.status === b.status ? b.items.length - a.items.length : (a.status === 'left' ? -1 : 1); });
    return out;
  }

  /* ============================================================
     Annual register review
     ------------------------------------------------------------
     Every record a policy says is "reviewed at least annually" and
     that has not been: assets, suppliers (on their criticality's own
     schedule), legal requirements and risks. Oldest first, never
     reviewed before everything else. */
  function registerReviewQueue(d, today, days) {
    var limit = addDaysIso(today, -(typeof days === 'number' ? days : 365));
    var q = [];
    var stale = function (x) { return !x.lastReviewed || String(x.lastReviewed).slice(0, 10) < limit; };
    (d.assets || []).forEach(function (a) { if (a && a.status !== 'Retired' && stale(a)) q.push({ kind: 'asset', id: a.id, title: a.name, owner: a.owner || '', lastReviewed: a.lastReviewed || '' }); });
    (d.vendors || []).forEach(function (v) { if (v && v.status !== 'Retired' && v.status !== 'Offboarded' && (!v.lastReviewed || vendorNextReview(v, today) <= today)) q.push({ kind: 'vendor', id: v.id, title: v.name, owner: v.owner || '', lastReviewed: v.lastReviewed || '' }); });
    (d.legal || []).forEach(function (r) { if (r && r.applies !== 'No' && stale(r)) q.push({ kind: 'legal', id: r.id, title: r.title, owner: r.owner || '', lastReviewed: r.lastReviewed || '' }); });
    (d.risks || []).forEach(function (r) { if (r && r.status !== 'Closed' && stale(r)) q.push({ kind: 'risk', id: r.id, title: r.title, owner: r.owner || '', lastReviewed: r.lastReviewed || '' }); });
    q.sort(function (a, b) { return a.lastReviewed === b.lastReviewed ? 0 : (a.lastReviewed < b.lastReviewed ? -1 : 1); });
    var count = {};
    q.forEach(function (x) { count[x.kind] = (count[x.kind] || 0) + 1; });
    return { items: q, total: q.length, byKind: count };
  }

  /* ============================================================
     A record's own history, from the hash-chained audit log
     ------------------------------------------------------------
     ids: every id the record has been logged under (a control is
     "iso27001|A.5.15" in newer entries and "A.5.15" in older ones). */
  function recordHistory(log, targetType, ids, limit) {
    var want = {};
    (Array.isArray(ids) ? ids : [ids]).forEach(function (i) { if (i != null && i !== '') want[String(i)] = 1; });
    var rows = (log || []).filter(function (e) { return e && e.targetType === targetType && want[String(e.targetId)]; });
    rows = rows.slice().sort(function (a, b) { return String(a.entryDateTime || '') < String(b.entryDateTime || '') ? 1 : -1; });
    return typeof limit === 'number' ? rows.slice(0, limit) : rows;
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

  /* ============================================================
     Clause requirement checklists — what each management-system
     clause actually asks for
     ------------------------------------------------------------
     A clause row on its own is one status a practitioner sets. An
     auditor does not test "Clause 6.1.2": they test each thing it
     requires, one by one, and ask to see evidence for each. These
     lists break every clause into those requirements, in our own
     words (never ISO's text), each with the evidence an auditor
     expects to see.

     A requirement is met one of two ways:
     - `auto`: Checkpoint can see it met in the tenant's own data — an
       approved document, a profile answer, or a register that holds
       the record (the same rules as the Stage 1 checklist,
       mandatoryDocumentation() above). 'partial' means the record
       exists but is not yet in a state an auditor accepts.
     - confirmed: someone records where the evidence is. Used for the
       requirements no register can see (leadership behaviour,
       resourcing, what a management review discussed).

     ISO 27001 and ISO 42001 share the Harmonized Structure, so one
     list serves both. `auto` is ISO 27001's source and `auto42` ISO
     42001's; a requirement with no source for a framework must be
     confirmed. `text42`/`evidence42` replace the wording where the AI
     management system differs, `only` limits a requirement to one
     framework, and CLAUSE_REQUIREMENTS_42 adds the clauses only ISO
     42001 has.

     Sources: { doc: tplId } an approved document; { docs: [..] } all
     of them; { profile: [keys] } scope & context answers recorded;
     { md: ref } that Stage 1 checklist item; { record: kind } a
     register rule in clauseRecordStatus() below. */
  var CLAUSE_REQUIREMENTS = {
    '4.1': [
      { id: 'issues', text: 'Determine the external and internal issues that are relevant to the purpose of the management system and affect its ability to achieve its intended outcomes.',
        evidence: 'An approved context document listing the external and internal issues, specific to this organisation.',
        auto: { docs: ['context-interested-parties'], profile: ['orgExternalIssues', 'orgInternalIssues'] },
        auto42: { docs: ['aims-scope'], profile: ['orgAiIssues'] } },
      { id: 'climate', text: 'Determine whether climate change is a relevant issue, and record the determination and the reasoning behind it (Amendment 1, 2024).',
        text701: 'Determine whether climate change is a relevant issue, and record the determination and the reasoning behind it (part of the 2025 edition’s Clause 4.1).',
        evidence: 'The recorded climate change determination in the context document. If it is relevant, the risks, continuity or supplier arrangements that address it.',
        auto: { docs: ['context-interested-parties'], profile: ['orgClimate'] },
        auto42: { docs: ['aims-scope'], profile: ['orgClimate'] } },
      { id: 'ai-role', only: 'iso42001', text: 'Determine the organisation’s role for each AI system (for example provider, developer or user) and the intended purpose of the AI systems it develops, provides or uses.',
        evidence: 'The AI system register and the AI Management System Scope recording each system’s role and purpose.',
        auto42: { docs: ['aims-scope'], profile: ['orgAiRole', 'orgAiSystems'], record: 'aiRegister' } },
      { id: 'pii-role', only: 'iso27701', text: 'Determine the organisation’s role for each processing of personal information (PII): PII controller (including joint controller), PII processor, or both.',
        evidence: 'The role recorded in the scope & context profile and, activity by activity, in the record of processing activities.',
        auto701: { profile: ['orgPiiRole'], doc: 'ropa-data-handling-procedure' } },
      { id: 'current', text: 'Keep the issues current: review them when the organisation or its environment changes, and at each management review.',
        evidence: 'Management review minutes that record changes in external and internal issues.',
        auto: { record: 'mrIssues' }, auto42: { record: 'mrIssues' } }
    ],
    '4.2': [
      { id: 'parties', text: 'Identify the interested parties that are relevant to the management system.',
        evidence: 'The list of interested parties in the approved context document.',
        auto: { docs: ['context-interested-parties'], profile: ['orgInterestedParties'] },
        auto42: { docs: ['aims-scope'], profile: ['orgInterestedParties'] } },
      { id: 'pii-principals', only: 'iso27701', text: 'Include the PII principals (the people the personal information is about) among the interested parties, with the privacy obligations owed to them under applicable law, regulation and contracts.',
        evidence: 'PII principals named in the context document, and the privacy laws that apply (for example the Privacy Act 1988) in the legal and regulatory register.',
        auto701: { docs: ['context-interested-parties'], record: 'legalPrivacy' } },
      { id: 'requirements', text: 'Determine what those interested parties require, including legal, regulatory and contractual obligations.',
        evidence: 'The recorded requirements of each party, and the legal and regulatory register.',
        auto: { docs: ['context-interested-parties'], profile: ['orgPartyRequirements', 'orgRegulatory'], md: 'A.5.31' },
        auto42: { docs: ['aims-scope'], profile: ['orgPartyRequirements', 'orgRegulatory'], md: 'A.5.31' } },
      { id: 'climate-reqs', text: 'Consider whether interested parties have requirements related to climate change (Amendment 1, 2024).',
        text701: 'Consider whether interested parties have requirements related to climate change (part of the 2025 edition’s Clause 4.2).',
        evidence: 'A recorded answer on climate-related requirements (for example customers expecting services to withstand extreme weather, or climate disclosure obligations), carried into the context document.',
        auto: { profile: ['orgClimatePartyReqs'] }, auto42: { profile: ['orgClimatePartyReqs'] } },
      { id: 'addressed', text: 'Decide which of those requirements the management system will address, and where each is met (a policy, a control, a contract or an objective).',
        evidence: 'A traceable link from each requirement to what meets it: the legal register’s linked controls, and the context document recording where each party’s requirements are addressed.',
        auto: { docs: ['context-interested-parties'], record: 'legalTraced' }, auto42: { docs: ['aims-scope'], record: 'legalTraced' } }
    ],
    '4.3': [
      { id: 'boundaries', text: 'Determine the boundaries and applicability of the management system and document its scope.',
        evidence: 'The approved scope document with a scope statement naming the legal entity, and the business units, people, locations, services and technology it covers.',
        auto: { docs: ['isms-scope'], profile: ['orgScopeStatement', 'orgLegalName', 'orgBusinessUnits', 'orgPeople', 'orgLocations', 'orgServices', 'orgTechnology'] },
        auto42: { docs: ['aims-scope'], profile: ['orgAimsScopeStatement'] } },
      { id: 'context', text: 'Take the issues (4.1) and the interested parties’ requirements (4.2) into account when setting the scope.',
        evidence: 'The scope document drawing on the approved context document.',
        auto: { docs: ['isms-scope', 'context-interested-parties'] }, auto42: { docs: ['aims-scope'] } },
      { id: 'interfaces', text: 'Consider the interfaces and dependencies between the organisation’s activities and those performed by others, such as cloud providers and IT suppliers.',
        evidence: 'The interfaces and dependencies recorded in the scope document.',
        evidence42: 'Dependencies on third-party AI systems, models and providers recorded in the AI Management System Scope and the AI system register.',
        auto: { docs: ['isms-scope'], profile: ['orgInterfaces'] }, auto42: { docs: ['aims-scope'], record: 'aiRegister' } },
      { id: 'pii-scope', only: 'iso27701', text: 'Include the processing of personal information in the scope, and state the role(s) the organisation takes for it.',
        evidence: 'The scope document and the record of processing activities covering the processing in scope and the organisation’s role for each.',
        auto701: { docs: ['isms-scope', 'ropa-data-handling-procedure'], profile: ['orgPiiRole'] } },
      { id: 'exclusions', text: 'Record anything excluded from the scope and why, or that nothing is excluded.',
        evidence: 'The exclusions statement in the scope document, with a reason for each exclusion.',
        auto: { docs: ['isms-scope'] }, auto42: { docs: ['aims-scope'] } }
    ],
    '4.4': [
      { id: 'system', text: 'Establish, implement, maintain and continually improve the management system, including the processes it needs and how they interact.',
        evidence: 'The documents the standard requires, approved, and the registers in active use: risks, actions, objectives, audits and management reviews.',
        evidence42: 'The AI scope, policy, risk framework and impact assessment procedure approved, and the AI system register in active use.',
        auto: { record: 'mandatoryAll' }, auto42: { record: 'aimsCore' } }
    ],
    '5.1': [
      { id: 'direction', text: 'Top management ensures the policy and objectives are set and fit the organisation’s strategic direction.',
        evidence: 'The policy approved by a named member of top management, and approved objectives.',
        auto: { docs: ['infosec-policy'], md: '6.2' }, auto42: { docs: ['ai-policy', 'ai-objectives-metrics'] } },
      { id: 'integration', text: 'The management system’s requirements are built into the organisation’s business processes, not run alongside them.',
        evidence: 'Security steps inside everyday processes: onboarding and offboarding (HR security policy), procurement (supplier security policy), change (change management policy) and planning and delivery (operational planning and control), each approved and run through Checkpoint.',
        auto: { docs: ['operational-planning-control', 'hr-security-policy', 'supplier-security-policy', 'change-management-policy'] },
        auto42: { docs: ['ai-policy', 'ai-lifecycle-policy'] } },
      { id: 'resources', text: 'Top management makes the resources the management system needs available.',
        evidence: 'Resourcing decisions recorded in management review, or a budget and named roles with time allocated.',
        auto: { record: 'mrResources' }, auto42: { record: 'mrResources' } },
      { id: 'communicates', text: 'Top management communicates why effective security and conformity with the management system matter.',
        evidence: 'The policy, approved by a named member of top management, distributed to staff and acknowledged by them. A leadership message (an all-staff email, a town hall, an induction message) strengthens it.',
        auto: { doc: 'infosec-policy', record: 'policyAcknowledged' }, auto42: { doc: 'ai-policy', record: 'policyAcknowledged' } },
      { id: 'outcomes', text: 'Top management ensures the management system achieves its intended outcomes, directs and supports the people contributing to it, promotes continual improvement, and supports other managers to show leadership in their own areas.',
        evidence: 'A management review attended by top management, with decisions recorded.',
        auto: { md: '9.3' }, auto42: { md: '9.3' } }
    ],
    '5.2': [
      { id: 'policy', text: 'Establish a policy that suits the organisation’s purpose, includes objectives or a framework for them, and commits to meeting applicable requirements and to continual improvement.',
        evidence: 'The approved policy containing those commitments.',
        text42: 'Establish an AI policy that suits the organisation’s purpose, provides a framework for AI objectives, and commits to meeting applicable requirements and to continual improvement.',
        text701: 'Establish a privacy policy that suits the organisation’s purpose, provides a framework for privacy objectives, and commits to meeting applicable privacy requirements and to continual improvement.',
        auto: { doc: 'infosec-policy' }, auto42: { doc: 'ai-policy' } },
      { id: 'communicated', text: 'Make the policy available as documented information, communicate it within the organisation, and make it available to interested parties as appropriate.',
        evidence: 'The approved policy published, and staff acknowledgements from a policy attestation campaign.',
        auto: { doc: 'infosec-policy', record: 'policyAcknowledged' }, auto42: { doc: 'ai-policy', record: 'policyAcknowledged' } }
    ],
    '5.3': [
      { id: 'assigned', text: 'Assign and communicate the responsibilities and authorities for roles relevant to the management system.',
        evidence: 'The approved roles and responsibilities register, and how it was communicated.',
        auto: { doc: 'roles-responsibilities' }, auto42: { doc: 'roles-responsibilities' } },
      { id: 'reporting', text: 'Assign someone the responsibility and authority to ensure the management system conforms, and to report on its performance to top management.',
        evidence: 'A named management-system owner in the approved roles register, reporting to a management review.',
        auto: { doc: 'roles-responsibilities', md: '9.3' }, auto42: { doc: 'roles-responsibilities', md: '9.3' } }
    ],
    '6.1.1': [
      { id: 'determine', text: 'Determine the risks and opportunities that need addressing, drawing on the issues (4.1) and requirements (4.2).',
        evidence: 'The risk register reviewed within the last 12 months, and opportunities recorded with an owner (the register\u2019s Opportunities section).',
        evidence42: 'AI risks in the risk register (AI Governance) reviewed within the last 12 months, and opportunities recorded with an owner.',
        auto: { md: '8.2', record: 'opportunities' }, auto42: { record: ['riskReviewed', 'opportunities'] } },
      { id: 'plan', text: 'Plan actions to address those risks and opportunities, build them into the management system’s processes, and evaluate whether they work.',
        evidence: 'The risk treatment plan, with actions, owners and due dates.',
        auto: { md: '6.1.3 e)' }, auto42: { record: 'riskTreated' } }
    ],
    '6.1.2': [
      { id: 'criteria', text: 'Define a risk assessment process, including risk acceptance criteria and criteria for performing assessments.',
        evidence: 'The approved risk management framework, with likelihood and impact scales and acceptance criteria.',
        text42: 'Define an AI risk assessment process, including criteria for acceptable risk and for when assessments are carried out.',
        text701: 'Define a privacy risk assessment process that considers the risks to PII principals as well as to the organisation, including criteria for acceptable risk and for when assessments are carried out.',
        evidence701: 'The approved risk management framework and the approved data protection impact assessment (DPIA) process.',
        auto701: { docs: ['risk-management-framework', 'privacy-impact-assessment-process'] },
        auto: { doc: 'risk-management-framework' }, auto42: { doc: 'ai-risk-framework' } },
      { id: 'consistent', text: 'Make sure repeated assessments produce consistent, valid and comparable results.',
        evidence: 'The same scales applied throughout the risk register, as defined in the framework.',
        auto: { doc: 'risk-management-framework', record: 'riskRated' }, auto42: { doc: 'ai-risk-framework', record: 'riskRated' } },
      { id: 'identify', text: 'Identify the risks of losing confidentiality, integrity and availability of information within the scope, and name an owner for each.',
        evidence: 'Risks in the register, each with an owner.',
        text42: 'Identify the risks that could prevent the AI management system achieving its objectives, and name an owner for each.',
        text701: 'Identify the privacy risks related to the processing of personal information within the scope, including risks to PII principals, and name an owner for each.',
        evidence701: 'Privacy risks in the register (category Privacy, or linked to an ISO 27701 control), each with an owner.',
        evidence42: 'AI risks in the register (AI Governance), each with an owner.',
        auto: { record: 'riskOwners' }, auto42: { record: 'riskOwners' } },
      { id: 'analyse', text: 'Analyse each risk: the realistic likelihood, the consequences if it happens, and the resulting risk level.',
        evidence: 'A likelihood and impact rating on every risk.',
        auto: { record: 'riskRated' }, auto42: { record: 'riskRated' } },
      { id: 'evaluate', text: 'Evaluate each risk against the acceptance criteria and set priorities for treatment.',
        evidence: 'A treatment decision on every open risk, prioritised by risk level.',
        auto: { md: '6.1.3 e)' }, auto42: { record: 'riskTreated' } },
      { id: 'documented', text: 'Keep documented information about the risk assessment process.',
        evidence: 'The approved risk management framework.',
        auto: { doc: 'risk-management-framework' }, auto42: { doc: 'ai-risk-framework' } }
    ],
    '6.1.3': [
      { id: 'options', text: 'Select appropriate treatment options for each risk (reduce, accept, avoid or transfer).',
        evidence: 'The treatment recorded on every open risk.',
        auto: { md: '6.1.3 e)' }, auto42: { record: 'riskTreated' } },
      { id: 'controls', text: 'Determine the controls needed to put the chosen treatments in place, and compare them with Annex A so nothing necessary is missed.',
        evidence: 'Controls linked to risks, and the Statement of Applicability covering every Annex A control.',
        auto: { md: '6.1.3 d)' }, auto42: { record: 'soa' } },
      { id: 'soa', text: 'Produce a Statement of Applicability: the necessary controls, why each is included, whether it is implemented, and why any Annex A control is excluded.',
        evidence: 'The Statement of Applicability with a justification for every inclusion and exclusion.',
        text42: 'Produce a statement of applicability for the ISO 42001 Annex A controls: which apply, why, whether each is implemented, and why any is excluded.',
        text701: 'Produce a statement of applicability for the ISO 27701 Annex A controls (Table A.1 for PII controllers, A.2 for PII processors, A.3 information security): which apply for the organisation’s role, why, whether each is implemented, and why any is excluded.',
        auto: { md: '6.1.3 d)' }, auto42: { record: 'soa' } },
      { id: 'plan', text: 'Formulate a risk treatment plan.',
        evidence: 'The risk treatment plan report: every open risk with its treatment, actions and owner.',
        auto: { md: '6.1.3 e)' }, auto42: { record: 'riskTreated' } },
      { id: 'owners', text: 'Get the risk owners’ approval of the treatment plan and their acceptance of the residual risks.',
        evidence: 'A recorded acceptance by the risk owner on every open risk.',
        auto: { record: 'riskAccepted' }, auto42: { record: 'riskAccepted' } },
      { id: 'documented', text: 'Keep documented information about the risk treatment process.',
        evidence: 'The approved risk management framework.',
        auto: { doc: 'risk-management-framework' }, auto42: { doc: 'ai-risk-framework' } }
    ],
    '6.2': [
      { id: 'objectives', text: 'Set objectives at relevant functions and levels that are consistent with the policy, measurable where practicable, take requirements and risk results into account, are monitored, communicated and updated, and are kept as documented information.',
        evidence: 'Objectives with a metric and a target, in the objectives register.',
        auto: { md: '6.2' }, auto42: { doc: 'ai-objectives-metrics', record: 'objectivePlans' } },
      { id: 'planning', text: 'Plan how each objective will be achieved: what will be done, the resources, who is responsible, when it will be completed and how results will be evaluated.',
        evidence: 'Each objective with an owner and a due date, and how progress is measured.',
        auto: { record: 'objectivePlans' }, auto42: { record: 'objectivePlans' } }
    ],
    '6.3': [
      { id: 'planned', text: 'Carry out changes to the management system in a planned way.',
        evidence: 'The approved change planning procedure, and records of changes made to the management system.',
        auto: { doc: 'isms-change-planning' }, auto42: { doc: 'isms-change-planning' } }
    ],
    '7.1': [
      { id: 'resources', text: 'Determine and provide the resources needed to establish, run and improve the management system.',
        evidence: 'Resourcing decisions recorded in management review, or named roles with time allocated, budget and tools.',
        auto: { record: 'mrResources' }, auto42: { record: 'mrResources' } }
    ],
    '7.2': [
      { id: 'determine', text: 'Determine the competence needed by people whose work affects the management system’s performance.',
        evidence: 'The approved competence and awareness plan, with required competence per role.',
        auto: { doc: 'competence-awareness-plan' }, auto42: { doc: 'competence-awareness-plan' } },
      { id: 'ensure', text: 'Make sure those people are competent through education, training or experience, act where they are not, and check that the action worked.',
        evidence: 'Assigned training at least 90% complete, with none overdue.',
        evidence42: 'The AI use and oversight course at least 90% complete, with none overdue.',
        auto: { record: 'trainingCurrent' }, auto42: { record: 'trainingCurrent' } },
      { id: 'records', text: 'Keep records as evidence of competence.',
        evidence: 'Training and competence records held in Checkpoint or the HR system.',
        auto: { md: '7.2' }, auto42: { record: 'trainingCurrent' } }
    ],
    '7.3': [
      { id: 'aware', text: 'Make sure people are aware of the policy, how they contribute to the management system, and what happens if they do not follow it.',
        evidence: 'Completed awareness training and policy acknowledgements.',
        auto: { record: 'trainingCurrent', md: '7.2' }, auto42: { record: 'trainingCurrent' } }
    ],
    '7.4': [
      { id: 'plan', text: 'Determine what the organisation communicates about the management system, internally and externally: what, when, to whom and how.',
        evidence: 'The approved communication plan.',
        auto: { doc: 'communication-plan' }, auto42: { doc: 'communication-plan' } }
    ],
    '7.5.1': [
      { id: 'required', text: 'Hold the documented information the standard requires, plus whatever else the organisation decides it needs for the management system to work.',
        evidence: 'Every item on the Stage 1 mandatory documents checklist in place.',
        evidence42: 'The AI scope, policy, risk framework and impact assessment procedure approved, and the AI system register in use.',
        auto: { record: 'mandatoryAll' }, auto42: { record: 'aimsCore' } }
    ],
    '7.5.2': [
      { id: 'identify', text: 'When documents are created or updated, give each proper identification (title, date, author or reference), a suitable format and media, and a review and approval for suitability and adequacy.',
        evidence: 'The document control procedure, and approved documents showing version, owner, approver and next review date.',
        auto: { doc: 'document-control-procedure', record: 'policyCurrent' }, auto42: { doc: 'document-control-procedure', record: 'policyCurrent' } }
    ],
    '7.5.3': [
      { id: 'available', text: 'Control documented information so it is available where and when it is needed and adequately protected.',
        evidence: 'The document control procedure, and documents held in a controlled SharePoint library with appropriate permissions.',
        auto: { doc: 'document-control-procedure', record: 'policyCurrent' }, auto42: { doc: 'document-control-procedure', record: 'policyCurrent' } },
      { id: 'lifecycle', text: 'Control distribution, access, retrieval and use; storage and preservation, including legibility; changes (version control); and retention and disposal. Identify and control documents of external origin.',
        evidence: 'The document control procedure, plus the controlled register Checkpoint keeps: every document versioned in SharePoint, with an owner, an approver and a review date; external documents uploaded as your own versions or linked from the register.',
        auto: { doc: 'document-control-procedure', record: 'policyCurrent' }, auto42: { doc: 'document-control-procedure', record: 'policyCurrent' } }
    ],
    '8.1': [
      { id: 'operate', text: 'Plan, run and control the processes needed to meet the management system’s requirements and carry out the actions from Clause 6, with criteria for each process.',
        evidence: 'The processes visibly running: a posture scan within 90 days, risks reviewed within 12 months, and no treatment action more than 30 days overdue.',
        evidence42: 'The AI system register reviewed within 12 months, AI risks reviewed, and no treatment action more than 30 days overdue.',
        auto: { docs: ['operational-planning-control'], record: 'operating' }, auto42: { record: 'operating' } },
      { id: 'records', text: 'Keep enough documented information to be confident the processes have been carried out as planned.',
        evidence: 'Dated records in the registers and the tamper-evident audit log, with activity in the last 90 days.',
        auto: { record: 'auditLog' }, auto42: { record: 'auditLog' } },
      { id: 'change', text: 'Control planned changes, and review the consequences of unintended ones.',
        evidence: 'The change planning procedure and change records.',
        auto: { doc: 'isms-change-planning' }, auto42: { doc: 'isms-change-planning' } },
      { id: 'external', text: 'Control externally provided processes, products and services that are relevant to the management system.',
        evidence: 'The supplier security policy and the vendor register with assessments.',
        evidence42: 'Third-party AI systems recorded with their vendor in the AI system register, governed through the supplier security policy.',
        auto: { md: 'A.5.19' }, auto42: { md: 'A.5.19', record: 'aiRegister' } }
    ],
    '8.2': [
      { id: 'repeat', text: 'Carry out risk assessments at planned intervals and when significant changes happen, and keep the results.',
        evidence: 'Every open risk reviewed within the last 12 months, and reassessment after significant change.',
        text42: 'Carry out AI risk assessments at planned intervals and when significant changes happen, and keep the results.',
        text701: 'Carry out privacy risk assessments, including data protection impact assessments where processing is high risk, at planned intervals and when significant changes happen, and keep the results.',
        auto: { md: '8.2' }, auto42: { record: 'riskReviewed' } }
    ],
    '8.3': [
      { id: 'implement', text: 'Put the risk treatment plan into effect, and keep the results.',
        evidence: 'Treatment actions completed or progressing, and every open risk with actions or a recorded acceptance.',
        text42: 'Put the AI risk treatment plan into effect, and keep the results.',
        text701: 'Put the privacy risk treatment plan into effect, and keep the results.',
        auto: { md: '8.3' }, auto42: { record: 'riskActioned' } }
    ],
    '9.1': [
      { id: 'determine', text: 'Determine what is monitored and measured, how, when, by whom, and when the results are analysed and evaluated.',
        evidence: 'The approved objectives and metrics document.',
        auto: { doc: 'infosec-objectives-metrics' }, auto42: { doc: 'ai-objectives-metrics' } },
      { id: 'evaluate', text: 'Keep the monitoring results, and evaluate the security performance and effectiveness of the management system.',
        evidence: 'A posture scan within 90 days, and every objective measurable and on track or achieved.',
        evidence42: 'Every AI objective measurable and on track or achieved, and the AI system register reviewed within 12 months.',
        auto: { record: 'kpis' }, auto42: { record: 'kpis' } }
    ],
    '9.2': [
      { id: 'conduct', text: 'Carry out internal audits at planned intervals to check the management system conforms to the organisation’s own requirements and the standard, and is effectively implemented.',
        evidence: 'A completed internal audit within the last 12 months.',
        auto: { record: 'auditDone' }, auto42: { record: 'auditDone' } },
      { id: 'programme', text: 'Plan and maintain an audit programme covering frequency, methods, responsibilities, planning requirements and reporting, taking account of the importance of the processes and previous results.',
        evidence: 'The approved internal audit procedure and the audit programme in the audits register.',
        auto: { doc: 'internal-audit-procedure', record: 'auditsPlanned' }, auto42: { doc: 'internal-audit-procedure', record: 'auditsPlanned' } },
      { id: 'impartial', text: 'Set the criteria and scope of each audit, choose auditors who are objective and impartial (never auditing their own work), and report the results to management.',
        evidence: 'Each audit’s scope, auditor and summary recorded, and the auditor not the owner of any clause the audit covered.',
        auto: { record: 'auditImpartial' }, auto42: { record: 'auditImpartial' } },
      { id: 'records', text: 'Keep evidence of the audit programme and the audit results.',
        evidence: 'Audit reports and findings recorded in the audits register.',
        auto: { md: '9.2' }, auto42: { record: 'auditDone' } }
    ],
    '9.3': [
      { id: 'held', text: 'Top management reviews the management system at planned intervals to ensure it remains suitable, adequate and effective.',
        evidence: 'A management review within the last 12 months, attended by top management.',
        auto: { md: '9.3' }, auto42: { md: '9.3' } },
      { id: 'inputs', text: 'The review covers every required input: actions from previous reviews; changes in issues and in interested parties’ needs; performance (nonconformities, monitoring results, audit results, objectives); interested party feedback; risk assessment results and the treatment plan; and opportunities for improvement.',
        evidence: 'The latest management review, recorded in the structured form, with every input section completed.',
        auto: { record: 'mrInputs' }, auto42: { record: 'mrInputs' } },
      { id: 'outputs', text: 'The review records decisions on improvement opportunities and any changes needed to the management system.',
        evidence: 'Decisions and actions recorded in the management review.',
        auto: { md: '9.3' }, auto42: { md: '9.3' } }
    ],
    '10.1': [
      { id: 'improve', text: 'Continually improve how suitable, adequate and effective the management system is.',
        evidence: 'A management review within 12 months that considered improvement opportunities and recorded decisions.',
        auto: { record: 'improvement' }, auto42: { record: 'improvement' } }
    ],
    '10.2': [
      { id: 'react', text: 'When a nonconformity occurs, act to control and correct it and deal with its consequences.',
        evidence: 'Each nonconformity in the actions register with its immediate correction.',
        auto: { record: 'capaCorrection' }, auto42: { record: 'capaCorrection' } },
      { id: 'cause', text: 'Decide whether action is needed to remove the cause: review it, find the root cause, and check whether similar nonconformities exist or could occur.',
        evidence: 'A root cause recorded on each nonconformity.',
        auto: { record: 'capaRootCause' }, auto42: { record: 'capaRootCause' } },
      { id: 'effective', text: 'Carry out corrective action proportionate to the effects of the nonconformity, review whether it was effective, and change the management system if needed.',
        evidence: 'A completed corrective action and an effectiveness review on each nonconformity.',
        auto: { record: 'capaEffective' }, auto42: { record: 'capaEffective' } },
      { id: 'records', text: 'Keep evidence of the nonconformities, the actions taken and their results.',
        evidence: 'The nonconformity and corrective action procedure, and the corrective-action records.',
        auto: { md: '10.2' }, auto42: { md: '10.2' } }
    ]
  };

  /* The two requirements only ISO 42001 has. */
  var CLAUSE_REQUIREMENTS_42 = {
    '6.1.4': [
      { id: 'process', text: 'Define a process for assessing the potential consequences of AI systems for individuals, groups and society.',
        evidence: 'The approved AI impact assessment procedure.',
        auto42: { doc: 'ai-impact-assessment' } },
      { id: 'results', text: 'Document the impact assessment results and take them into account in the AI risk assessment.',
        evidence: 'A completed impact assessment for every AI system in the register, and AI risks in the risk register.',
        auto42: { record: ['aiImpact', 'riskOwners'] } }
    ],
    '8.4': [
      { id: 'repeat', text: 'Carry out AI system impact assessments at planned intervals and when significant changes happen, and keep the results.',
        evidence: 'A completed impact assessment for every AI system, each system reviewed within the last 12 months.',
        auto42: { record: ['aiImpact', 'aiRegister'] } }
    ]
  };

  /* ISO 27701 shares the Harmonized Structure with ISO 27001, and most
     of its management-system requirements are met by the same
     procedures and registers. Where a requirement has no `auto701` of
     its own, its ISO 27001 source is carried over: documents that serve
     both (their templates list iso27701) stay, the Information Security
     Policy becomes the Privacy Policy, Stage 1 checklist items that
     count every risk or audit become the privacy-scoped register rules,
     and the ISMS core becomes the PIMS core. */
  var DOC_701 = { 'infosec-policy': 'privacy-policy-skeleton' };
  var MD_701 = { '8.2': 'riskReviewed', '8.3': 'riskActioned', '6.1.3 e)': 'riskTreated', '6.1.3 d)': 'soa', '9.2': 'auditDone', '9.1': 'kpis' };
  var MD_SHARED_701 = ['9.3', '6.2', '7.2', '7.5', '10.2', 'A.5.31', 'A.5.19'];
  function autoFor701(src) {
    if (!src) return null;
    var out = {}, records = [].concat(src.record || []).map(function (k) { return k === 'mandatoryAll' ? 'pimsCore' : k; });
    var docs = (src.docs || (src.doc ? [src.doc] : [])).map(function (d) { return DOC_701[d] || d; });
    if (docs.length) out.docs = docs;
    if (src.profile) out.profile = src.profile;
    if (src.md) {
      if (MD_SHARED_701.indexOf(src.md) !== -1) out.md = src.md;
      else if (MD_701[src.md] && records.indexOf(MD_701[src.md]) === -1) records.push(MD_701[src.md]);
    }
    if (records.length) out.record = records;
    return Object.keys(out).length ? out : null;
  }
  function clauseRequirementsFor(fw, code) {
    var is42 = fw === 'iso42001', is701 = fw === 'iso27701';
    var list = (is42 && CLAUSE_REQUIREMENTS_42[code]) || CLAUSE_REQUIREMENTS[code] || [];
    return list.filter(function (r) { return !r.only || r.only === fw; }).map(function (r) {
      return {
        id: r.id,
        text: (is42 && r.text42) || (is701 && r.text701) || r.text,
        evidence: (is42 && r.evidence42) || (is701 && r.evidence701) || r.evidence,
        auto: is42 ? (r.auto42 || null) : is701 ? (r.auto701 !== undefined ? r.auto701 : autoFor701(r.auto)) : (r.auto || null)
      };
    });
  }

  /* The AI risks in the shared risk register: those categorised as AI
     Governance, or treated by an ISO 42001 Annex A control. */
  function isAiRisk(r) {
    return !!r && (r.cat === 'AI Governance' || (r.controls || []).some(function (c) { return /^AI\./.test(String(c)); }));
  }
  /* The privacy risks: categorised as Privacy, or treated by an ISO
     27701 Annex A control (P.* codes). */
  function isPrivacyRisk(r) {
    return !!r && (r.cat === 'Privacy' || (r.controls || []).some(function (c) { return /^A\.[123]\.\d/.test(String(c)); }));
  }

  /* Register rules for `record` sources. Same shape as the Stage 1
     checklist: { st: 'done'|'partial'|'missing', note }. Each reuses the
     register checks the posture scan already scores with where one
     exists, so a clause and its related check can never disagree. For
     ISO 42001 the risk rules read the AI risks only, training reads the
     AI use course, and audits read ISO 42001 audits. */
  var AI_TRAINING_COURSE = 'ai-use-oversight';
  var PRIVACY_TRAINING_COURSE = 'privacy-awareness';
  function clauseRecordStatus(kind, s) {
    var fw = s.fw || 'iso27001';
    var is42 = fw === 'iso42001', is701 = fw === 'iso27701';
    var today = s.today || new Date().toISOString().slice(0, 10);
    var within = function (d, days) { return !!d && daysBetweenDateStr(String(d).slice(0, 10), today) <= days; };
    var riskWord = is42 ? 'AI risk' : is701 ? 'privacy risk' : 'risk';
    var openRisks = (s.risks || []).filter(function (r) { return r && r.status !== 'Closed' && (is42 ? isAiRisk(r) : is701 ? isPrivacyRisk(r) : true); });
    var noRisks = { st: 'missing', note: is42 ? 'No AI risks in the register (category AI Governance)' : is701 ? 'No privacy risks in the register (category Privacy)' : 'No risks in the register' };
    var ncs = (s.actions || []).filter(function (a) { return a && a.type && String(a.type).indexOf('Non-conformity') === 0; });
    var fwAudits = (s.audits || []).filter(function (a) { return a && (is42 || is701 ? a.fw === fw : a.fw !== 'iso42001' && a.fw !== 'iso27701'); });
    var auditsDone = fwAudits.filter(function (a) { return a.status === 'Completed' && within(a.completed, 365); });
    var reviews = (s.reviews || []).filter(function (r) { return r && r.date; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var lastReview = reviews[0] && within(reviews[0].date, 365) ? reviews[0] : null;
    var lastInputs = lastReview ? parseReviewInputs(lastReview.inputs) : {};
    var noReview = { st: 'missing', note: 'No management review in the last 12 months' };
    var ai = s.aiSystems || [];
    function share(n, total, what, whatNot) {
      return n === total ? { st: 'done', note: what } : { st: 'partial', note: (total - n) + ' of ' + total + ' ' + whatNot };
    }
    function capa(test, what) {
      if (!ncs.length) return { st: 'missing', note: 'No nonconformity recorded yet — confirm how one would be handled, with the procedure as evidence' };
      var short = ncs.filter(function (a) { return !test(capaStatus(a), a); }).length;
      return short ? { st: 'partial', note: short + ' of ' + ncs.length + ' nonconformit' + (ncs.length > 1 ? 'ies' : 'y') + ' without ' + what } : { st: 'done', note: 'Every nonconformity has ' + what };
    }
    function fromCheck(r, missingNote) {
      if (!r || r.result === 'manual') return { st: 'missing', note: missingNote || (r && r.note) || '' };
      return { st: r.result === 'pass' ? 'done' : 'partial', note: r.note };
    }
    var lastScan = (s.scans || []).reduce(function (m, x) { return x && x.date && String(x.date) > m ? String(x.date).slice(0, 10) : m; }, '');
    switch (kind) {
      case 'risks':
        return openRisks.length ? { st: 'done', note: openRisks.length + ' ' + riskWord + '(s) assessed on the same scales' } : noRisks;
      case 'riskOwners':
        if (!openRisks.length) return noRisks;
        return share(openRisks.filter(function (r) { return String(r.owner || '').trim(); }).length, openRisks.length, openRisks.length + ' ' + riskWord + '(s), each with an owner', riskWord + '(s) without an owner');
      case 'riskRated':
        if (!openRisks.length) return noRisks;
        return share(openRisks.filter(function (r) { return Number(r.L) > 0 && Number(r.I) > 0; }).length, openRisks.length, 'Every ' + riskWord + ' rated for likelihood and impact on the framework’s scales', riskWord + '(s) without a likelihood and impact');
      case 'riskReviewed':
        if (!openRisks.length) return noRisks;
        return share(openRisks.filter(function (r) { return within(r.lastReviewed, 365); }).length, openRisks.length, openRisks.length + ' ' + riskWord + '(s), all reviewed in the last 12 months', riskWord + '(s) not reviewed in the last 12 months');
      case 'riskTreated':
        if (!openRisks.length) return noRisks;
        return share(openRisks.filter(function (r) { return r.treat && String(r.owner || '').trim(); }).length, openRisks.length, 'Every ' + riskWord + ' has a treatment decision and an owner', riskWord + '(s) without a treatment decision or owner');
      case 'riskActioned':
        if (!openRisks.length) return noRisks;
        return share(openRisks.filter(function (r) { return (r.actions || []).length || r.treat === 'Tolerate' || String(r.acceptedBy || '').trim(); }).length, openRisks.length, 'Every ' + riskWord + ' has treatment actions or a recorded acceptance', riskWord + '(s) with no action and no acceptance');
      case 'riskAccepted':
        if (!openRisks.length) return noRisks;
        return share(openRisks.filter(function (r) { return String(r.acceptedBy || '').trim(); }).length, openRisks.length, 'Residual risk accepted by the owner on every open ' + riskWord, riskWord + '(s) without the owner’s recorded acceptance of the residual risk');
      case 'objectivePlans':
        var objs = (s.objectives || []).filter(function (o) { return o && o.metric && o.target; });
        if (!objs.length) return { st: 'missing', note: 'No measurable objective recorded' };
        return share(objs.filter(function (o) { return String(o.owner || '').trim() && o.due; }).length, objs.length, objs.length + ' objective(s), each with an owner and a due date', 'objective(s) without an owner or due date');
      case 'kpis':
        var ob = fromCheck(objectivesCheckResult(s.objectives || [], today), 'No measurable objectives recorded');
        var second = is42
          ? (ai.length && ai.every(function (x) { return within(x.lastReviewed, 365); }) ? { st: 'done', note: 'AI system register reviewed within 12 months' } : { st: ai.length ? 'partial' : 'missing', note: 'AI system register not reviewed within 12 months' })
          : (within(lastScan, 90) ? { st: 'done', note: 'Posture scan on ' + lastScan } : { st: lastScan ? 'partial' : 'missing', note: lastScan ? 'Last posture scan more than 90 days ago' : 'No posture scan yet' });
        return ob.st === 'done' && second.st === 'done' ? { st: 'done', note: ob.note + ' ' + second.note + '.' }
          : { st: ob.st === 'missing' && second.st === 'missing' ? 'missing' : 'partial', note: [ob, second].filter(function (p) { return p.st !== 'done'; }).map(function (p) { return p.note; }).join('; ') };
      case 'trainingCurrent':
        var rows = (s.training || []).filter(function (t) { return is42 ? t.courseId === AI_TRAINING_COURSE : is701 ? t.courseId === PRIVACY_TRAINING_COURSE : true; });
        return fromCheck(trainingCheckResult(rows, today), is42 ? 'The AI use and oversight course has not been assigned' : is701 ? 'The privacy and personal information course has not been assigned' : 'No training assigned in Checkpoint');
      case 'policyAcknowledged':
        var title = is42 ? /\bAI Policy\b/i : is701 ? /\bPrivacy Policy\b/i : /Information Security Policy/i;
        var policyName = is42 ? 'AI Policy' : is701 ? 'Privacy Policy' : 'Information Security Policy';
        var camp = attestationCampaigns((s.attestations || []).filter(function (r) { return title.test(r.docName || ''); }))[0];
        if (!camp) return { st: 'missing', note: 'No acknowledgement campaign for the ' + policyName + ' yet' };
        return camp.pct >= 90 ? { st: 'done', note: camp.acknowledged + ' of ' + (camp.acknowledged + camp.outstanding) + ' staff acknowledged the policy (' + camp.pct + '%)' }
          : { st: 'partial', note: 'Policy acknowledged by ' + camp.pct + '% of staff (target 90%)' };
      case 'policyCurrent':
        return fromCheck(policyCheckResult(s.docsFull || [], today), 'No controlled documents in the register');
      case 'legalTraced':
        var applying = (s.legal || []).filter(function (l) { return l && l.applies === 'Yes'; });
        if (!applying.length) return { st: 'missing', note: 'No applicable requirements in the legal and regulatory register' };
        return share(applying.filter(function (l) { return (l.controls || []).length; }).length, applying.length, 'Every applicable legal, regulatory and contractual requirement is linked to the controls that meet it', 'applicable requirement(s) not linked to any control');
      case 'mrIssues':
        if (!lastReview) return noReview;
        return lastInputs.issues ? { st: 'done', note: 'Management review of ' + lastReview.date + ' recorded changes in issues' } : { st: 'partial', note: 'The latest management review has no recorded input on changes in issues' };
      case 'mrResources':
        if (!lastReview) return noReview;
        return /resourc|budget|fund|hire|recruit|headcount|allocat|time for/i.test(String(lastReview.decisions || '') + ' ' + String(lastReview.inputs || ''))
          ? { st: 'done', note: 'Management review of ' + lastReview.date + ' records a resourcing decision' }
          : { st: 'partial', note: 'The latest management review records no resourcing decision' };
      case 'mrInputs':
        if (!lastReview) return noReview;
        if (lastInputs.legacy) return { st: 'partial', note: 'The latest management review was recorded as free text — record it in the structured form so each input is shown' };
        var missingInputs = MR_INPUT_SECTIONS.filter(function (x) { return !String(lastInputs[x.key] || '').trim(); });
        return missingInputs.length ? { st: 'partial', note: missingInputs.length + ' of ' + MR_INPUT_SECTIONS.length + ' required inputs not recorded (' + missingInputs.map(function (x) { return x.clause; }).join(', ') + ')' }
          : { st: 'done', note: 'Management review of ' + lastReview.date + ' covers every required input' };
      case 'improvement':
        if (!lastReview) return noReview;
        return lastReview.decisions && String(lastInputs.improvement || '').trim() ? { st: 'done', note: 'Management review of ' + lastReview.date + ' considered improvement opportunities and recorded decisions' }
          : { st: 'partial', note: 'The latest management review records no improvement opportunities or decisions' };
      case 'auditDone':
        if (auditsDone.length) return { st: 'done', note: auditsDone.length + ' internal audit(s) completed in the last 12 months' };
        return fwAudits.length ? { st: 'partial', note: 'Audit planned, none completed in the last 12 months' } : { st: 'missing', note: is42 ? 'No ISO 42001 internal audit recorded' : is701 ? 'No ISO 27701 internal audit recorded' : 'No internal audit recorded' };
      case 'auditsPlanned':
        return fwAudits.length ? { st: 'done', note: fwAudits.length + ' audit(s) in the programme' } : { st: 'missing', note: is42 ? 'No ISO 42001 audits in the audits register' : is701 ? 'No ISO 27701 audits in the audits register' : 'No audits planned in the audits register' };
      case 'auditImpartial':
        if (!auditsDone.length) return { st: 'missing', note: 'No completed internal audit in the last 12 months' };
        var problems = [];
        auditsDone.forEach(function (a) {
          if (!String(a.auditor || '').trim() || !String(a.scope || '').trim() || !String(a.summary || '').trim()) { problems.push(a.id + ' is missing its auditor, scope or summary'); return; }
          var who = String(a.auditor).trim().toLowerCase();
          var sc = parseAuditScope(a.scope);
          var own = (s.clauses || []).filter(function (c) {
            return (c.fw || 'iso27001') === fw && sc.clauses.indexOf(String(c.id).split('.')[0]) !== -1 && String(c.own || '').trim().toLowerCase() === who;
          });
          if (own.length) problems.push(a.id + ': the auditor owns Clause ' + own.map(function (c) { return c.id; }).join(', '));
        });
        return problems.length ? { st: 'partial', note: problems.join('; ') } : { st: 'done', note: 'Every completed audit has its scope, auditor and summary recorded, and no auditor audited a clause they own' };
      case 'operating':
        var overdue = (s.actions || []).filter(function (a) { return a && a.status !== 'Done' && a.status !== 'Closed' && a.status !== 'Cancelled' && a.due && daysBetweenDateStr(a.due, today) > 30; }).length;
        var parts = [];
        if (is42) {
          if (!(ai.length && ai.every(function (x) { return within(x.lastReviewed, 365); }))) parts.push('AI system register not reviewed within 12 months');
        } else if (!within(lastScan, 90)) parts.push(lastScan ? 'last posture scan more than 90 days ago' : 'no posture scan yet');
        if (!openRisks.length) parts.push(is42 ? 'no AI risks recorded' : 'no risks recorded');
        else if (!openRisks.every(function (r) { return within(r.lastReviewed, 365); })) parts.push(riskWord + 's not all reviewed in 12 months');
        if (overdue) parts.push(overdue + ' action(s) more than 30 days overdue');
        return parts.length ? { st: 'partial', note: parts.join('; ') } : { st: 'done', note: is42 ? 'AI register and AI risks reviewed within 12 months, no action more than 30 days overdue' : 'Posture scan within 90 days, risks reviewed within 12 months, no action more than 30 days overdue' };
      case 'auditLog':
        var recent = (s.auditLog || []).filter(function (e) { return within(e.entryDateTime, 90); }).length;
        return recent ? { st: 'done', note: recent + ' dated audit log entries in the last 90 days' } : { st: 'missing', note: 'No recorded activity in the last 90 days' };
      case 'soa':
        var sa = (s.soaByFw || {})[fw];
        if (!sa || !sa.applicable) return { st: 'missing', note: 'No applicable controls recorded' };
        if (sa.notStarted || sa.unjustified) return { st: 'partial', note: (sa.notStarted ? sa.notStarted + ' control(s) not started' : '') + (sa.notStarted && sa.unjustified ? '; ' : '') + (sa.unjustified ? sa.unjustified + ' exclusion(s) without a justification' : '') };
        return { st: 'done', note: sa.applicable + ' applicable controls, inclusions and exclusions justified' };
      case 'aiRegister':
        if (!ai.length) return { st: 'missing', note: 'No AI systems in the AI system register' };
        return share(ai.filter(function (x) { return String(x.owner || '').trim() && String(x.purpose || '').trim() && within(x.lastReviewed, 365); }).length, ai.length, ai.length + ' AI system(s), each with an owner and purpose, reviewed within 12 months', 'AI system(s) without an owner, a purpose or a review in the last 12 months');
      case 'aiImpact':
        if (!ai.length) return { st: 'missing', note: 'No AI systems in the AI system register' };
        return share(ai.filter(function (x) { return x.impactAssessmentStatus === 'Completed'; }).length, ai.length, 'Impact assessment completed for all ' + ai.length + ' AI system(s)', 'AI system(s) without a completed impact assessment');
      case 'aimsCore':
        var need = ['aims-scope', 'ai-policy', 'ai-risk-framework', 'ai-impact-assessment'];
        var approved = {};
        (s.docs || []).forEach(function (d) { if (d && d.status === 'Approved') approved[d.tplId] = true; });
        var gaps = need.filter(function (id) { return !approved[id]; }).length;
        if (!ai.length) gaps++;
        return gaps ? { st: gaps > need.length ? 'missing' : 'partial', note: gaps + ' of ' + (need.length + 1) + ' core AI management system items not yet in place (scope, policy, risk framework, impact assessment procedure, AI system register)' }
          : { st: 'done', note: 'AI scope, policy, risk framework and impact assessment procedure approved, and the AI system register in use' };
      case 'opportunities':
        var opps = (s.opportunities || []).filter(function (o) { return o && o.status !== 'Closed'; });
        if (!opps.length) return { st: 'missing', note: 'No opportunities recorded \u2014 Clause 6.1.1 asks for risks and opportunities' };
        return share(opps.filter(function (o) { return String(o.owner || '').trim() && within(o.lastReviewed, 365); }).length, opps.length, opps.length + ' opportunit' + (opps.length > 1 ? 'ies' : 'y') + ' recorded, each owned and reviewed within 12 months', 'opportunit' + 'ies without an owner or a review in the last 12 months');
      case 'legalPrivacy':
        var privacyLaws = (s.legal || []).filter(function (l) { return l && l.applies === 'Yes' && /privacy|personal (information|data)|data protection|gdpr|\bapps?\b|health records/i.test((l.title || '') + ' ' + (l.requirement || '')); });
        return privacyLaws.length ? { st: 'done', note: privacyLaws.length + ' privacy law or obligation(s) recorded as applying, in the legal and regulatory register' }
          : { st: 'missing', note: 'No privacy law recorded as applying in the legal and regulatory register' };
      case 'pimsCore':
        var needP = ['privacy-policy-skeleton', 'ropa-data-handling-procedure', 'pii-principal-rights-procedure', 'privacy-impact-assessment-process'];
        var approvedP = {};
        (s.docs || []).forEach(function (d) { if (d && d.status === 'Approved') approvedP[d.tplId] = true; });
        var gapsP = needP.filter(function (id) { return !approvedP[id]; }).length;
        var sp = (s.soaByFw || {}).iso27701;
        if (!(sp && sp.applicable)) gapsP++;
        return gapsP ? { st: gapsP > needP.length ? 'missing' : 'partial', note: gapsP + ' of ' + (needP.length + 1) + ' core privacy management system items not yet in place (privacy policy, record of processing activities, PII principal rights procedure, DPIA process, ISO 27701 statement of applicability)' }
          : { st: 'done', note: 'Privacy policy, record of processing activities, PII principal rights procedure and DPIA process approved, and the ISO 27701 statement of applicability in place' };
      case 'mandatoryAll':
        var md = (s.md || []).filter(function (m) { return /^\d/.test(m.ref); });
        if (!md.length) return { st: 'missing', note: 'Stage 1 checklist not available' };
        var notDone = md.filter(function (m) { return m.status !== 'done'; }).length;
        return notDone ? { st: notDone === md.length ? 'missing' : 'partial', note: notDone + ' of ' + md.length + ' required items not yet in place (Stage 1 checklist)' } : { st: 'done', note: 'Every required item on the Stage 1 checklist is in place' };
      case 'capaCorrection': return capa(function (c) { return c.hasCorrection; }, 'an immediate correction');
      case 'capaRootCause': return capa(function (c) { return c.hasRootCause; }, 'a root cause');
      case 'capaEffective': return capa(function (c, a) { return c.effectivenessReviewed && a.status === 'Done'; }, 'a completed action and an effectiveness review');
    }
    return { st: 'missing', note: '' };
  }
  var CLAUSE_RECORD_KINDS = ['risks', 'riskOwners', 'riskRated', 'riskReviewed', 'riskTreated', 'riskActioned', 'riskAccepted',
    'objectivePlans', 'kpis', 'trainingCurrent', 'policyAcknowledged', 'policyCurrent', 'legalTraced', 'mrIssues', 'mrResources',
    'mrInputs', 'improvement', 'auditDone', 'auditsPlanned', 'auditImpartial', 'operating', 'auditLog', 'soa', 'aiRegister',
    'aiImpact', 'aimsCore', 'opportunities', 'legalPrivacy', 'pimsCore', 'mandatoryAll', 'capaCorrection', 'capaRootCause', 'capaEffective'];

  /* One clause's checklist, resolved against the tenant's data.
     s = { fw, code, today, docs:[{tplId,status}], docsFull:[register rows], settings:{key:value},
           md:[mandatoryDocumentation() rows], risks, objectives, audits, actions, reviews, training,
           attestations, legal, aiSystems, scans, auditLog, clauses, soaByFw:{ fw:{ applicable, notStarted, unjustified } },
           confirmed:{ reqId:{ by, date, note } } }
     Returns { items:[{ id, text, evidence, status:'met'|'partial'|'open', how:'auto'|'confirmed'|'', note }],
               met, total, complete }. A confirmation always wins: it is a
     named person saying where the evidence is. */
  function clauseChecklist(s) {
    s = s || {};
    var rank = { missing: 0, partial: 1, done: 2 };
    var docs = {};
    (s.docs || []).forEach(function (d) { if (d && d.tplId && (!docs[d.tplId] || d.status === 'Approved')) docs[d.tplId] = d; });
    var md = {};
    (s.md || []).forEach(function (m) { md[m.ref] = m; });
    var settings = s.settings || {};
    var confirmed = s.confirmed || {};
    function docPart(id) {
      var d = docs[id];
      return !d ? { st: 'missing', note: 'Document not generated' } : d.status === 'Approved' ? { st: 'done', note: 'Approved document' } : { st: 'partial', note: 'Document in ' + (d.status || 'Draft') };
    }
    function autoStatus(src) {
      var parts = [];
      (src.docs || (src.doc ? [src.doc] : [])).forEach(function (id) { var p = docPart(id); p.gap = { kind: 'doc', id: id, st: p.st }; parts.push(p); });
      if (src.profile) {
        var blank = src.profile.filter(function (k) { return !String(settings[k] || '').trim(); });
        parts.push(blank.length ? { st: 'missing', note: 'Scope & context questionnaire not answered', gap: { kind: 'profile' } } : { st: 'done', note: 'Recorded in the scope & context profile' });
      }
      if (src.md) {
        var m = md[src.md];
        var mdGaps = [];
        if (!m || m.status !== 'done') {
          /* Name the part that is missing: the document, the record, or both. */
          var def = MANDATORY_DOCS.find(function (x) { return x.ref === src.md; });
          if (def && def.tpl) { var dp = docPart(def.tpl); if (dp.st !== 'done') mdGaps.push({ kind: 'doc', id: def.tpl, st: dp.st }); }
          if (def && def.record && MD_RECORD_FIX[def.record] && clauseRecordStatus(MD_RECORD_FIX[def.record], s).st !== 'done') mdGaps.push({ kind: 'record', id: MD_RECORD_FIX[def.record] });
          if (!mdGaps.length) mdGaps.push({ kind: 'md', id: src.md });
        }
        parts.push(m ? { st: m.status, note: m.note, gaps: mdGaps } : { st: 'missing', note: 'Not yet recorded', gaps: mdGaps });
      }
      [].concat(src.record || []).forEach(function (k) { var p = clauseRecordStatus(k, s); p.gap = { kind: 'record', id: k }; parts.push(p); });
      if (!parts.length) return null;
      var worst = parts.reduce(function (w, p) { return rank[p.st] < rank[w.st] ? p : w; }, parts[0]);
      return { st: worst.st, gaps: parts.filter(function (p) { return p.st !== 'done'; }).reduce(function (a, p) { return a.concat(p.gaps || [p.gap]); }, []),
        note: parts.filter(function (p) { return p.st !== 'done'; }).map(function (p) { return p.note; }).filter(Boolean).join('; ') || parts.map(function (p) { return p.note; }).filter(Boolean).join('; ') };
    }
    var items = clauseRequirementsFor(s.fw || 'iso27001', s.code).map(function (r) {
      var conf = confirmed[r.id];
      if (conf && String(conf.note || '').trim()) {
        return { id: r.id, text: r.text, evidence: r.evidence, auto: !!r.auto, status: 'met', how: 'confirmed', note: conf.note, by: conf.by || '', date: conf.date || '' };
      }
      var a = r.auto ? autoStatus(r.auto) : null;
      if (a && a.st === 'done') return { id: r.id, text: r.text, evidence: r.evidence, auto: true, status: 'met', how: 'auto', note: a.note };
      return { id: r.id, text: r.text, evidence: r.evidence, auto: !!a, status: a && a.st === 'partial' ? 'partial' : 'open', how: '', note: a ? a.note : '', gaps: a ? a.gaps : [] };
    });
    var met = items.filter(function (i) { return i.status === 'met'; }).length;
    return { items: items, met: met, total: items.length, complete: items.length > 0 && met === items.length };
  }

  /* ============================================================
     Clause autopilot
     ------------------------------------------------------------
     Clauses 4-10 are the management system: Checkpoint runs it, so
     every unmet requirement maps to the one thing that meets it. `by`
     says who does it: 'checkpoint' (one click, Checkpoint produces
     the record), 'meeting' (Checkpoint prepares everything, top
     management or the auditor still has to sit down) or 'you' (a
     judgement only the organisation can make). Annex A is the
     client's to deliver; these fixes never cover it. */
  var CLAUSE_RECORD_FIXES = {
    risks: { by: 'checkpoint', key: 'risks', label: 'Run the posture scan and add the suggested risks from your scope & context', action: 'App.fixRisks' },
    riskOwners: { by: 'you', key: 'riskOwners', label: 'Name an owner for every open risk', action: 'App.go', arg: 'risks' },
    riskRated: { by: 'you', key: 'riskRated', label: 'Rate every open risk', action: 'App.go', arg: 'risks' },
    riskReviewed: { by: 'you', key: 'riskReviewed', label: 'Review the risks that are due', action: 'App.go', arg: 'risks' },
    riskTreated: { by: 'you', key: 'riskTreated', label: 'Choose a treatment for every open risk', action: 'App.go', arg: 'risks' },
    riskActioned: { by: 'you', key: 'riskActioned', label: 'Raise treatment actions or record acceptance for each risk', action: 'App.go', arg: 'risks' },
    riskAccepted: { by: 'meeting', key: 'riskAccepted', label: 'Risk owners accept their residual risk (one sitting, from the risk register)', action: 'App.go', arg: 'risks' },
    objectivePlans: { by: 'checkpoint', key: 'objectives', label: 'Adopt the suggested objectives, measured by Checkpoint', action: 'App.adoptSuggestedObjectives' },
    kpis: { by: 'checkpoint', key: 'objectives', label: 'Adopt the suggested objectives, measured by Checkpoint', action: 'App.adoptSuggestedObjectives' },
    opportunities: { by: 'checkpoint', key: 'opportunities', label: 'Add the suggested opportunities from your scope & context', action: 'App.adoptSuggestedOpportunities' },
    trainingCurrent: { by: 'checkpoint', key: 'training', label: 'Assign awareness training to everyone in the directory', action: 'App.assignInductionTraining' },
    policyAcknowledged: { by: 'checkpoint', key: 'acknowledge', label: 'Send the policy to staff to acknowledge', action: 'App.startPolicyCampaign' },
    policyCurrent: { by: 'you', key: 'policyCurrent', label: 'Review the documents that are due', action: 'App.go', arg: 'documents' },
    legalTraced: { by: 'checkpoint', key: 'legal', label: 'Add the legal and regulatory starting set, already linked to controls', action: 'App.seedLegalBaseline' },
    legalPrivacy: { by: 'checkpoint', key: 'legal', label: 'Add the legal and regulatory starting set, already linked to controls', action: 'App.seedLegalBaseline' },
    mrIssues: { by: 'meeting', key: 'review', label: 'Hold the management review: Checkpoint fills in every input', action: 'App.startManagementReview' },
    mrResources: { by: 'meeting', key: 'review', label: 'Hold the management review: Checkpoint fills in every input', action: 'App.startManagementReview' },
    mrInputs: { by: 'meeting', key: 'review', label: 'Hold the management review: Checkpoint fills in every input', action: 'App.startManagementReview' },
    improvement: { by: 'meeting', key: 'review', label: 'Hold the management review: Checkpoint fills in every input', action: 'App.startManagementReview' },
    auditsPlanned: { by: 'checkpoint', key: 'auditPlan', label: 'Schedule the internal audit programme', action: 'App.planAuditProgramme' },
    auditDone: { by: 'meeting', key: 'auditRun', label: 'Run the scheduled internal audit with its workpack', action: 'App.go', arg: 'audits' },
    auditImpartial: { by: 'meeting', key: 'auditRun', label: 'Run the scheduled internal audit with its workpack', action: 'App.go', arg: 'audits' },
    auditLog: { by: 'checkpoint', key: 'rhythm', label: 'Schedule the operating rhythm and run the posture scan', action: 'App.setupOperatingRhythm' },
    operating: { by: 'checkpoint', key: 'rhythm', label: 'Schedule the operating rhythm and run the posture scan', action: 'App.setupOperatingRhythm' },
    soa: { by: 'you', key: 'soa', label: 'Annex A: decide and progress each control in the Statement of Applicability', action: 'App.go', arg: 'soa' },
    aiRegister: { by: 'you', key: 'aiRegister', label: 'Record each AI system with its owner and purpose', action: 'App.go', arg: 'aisystems' },
    aiImpact: { by: 'you', key: 'aiImpact', label: 'Complete the impact assessment for each AI system', action: 'App.go', arg: 'aisystems' },
    capaCorrection: { by: 'you', key: 'capa', label: 'Complete the corrective action record for each nonconformity', action: 'App.go', arg: 'actions' },
    capaRootCause: { by: 'you', key: 'capa', label: 'Complete the corrective action record for each nonconformity', action: 'App.go', arg: 'actions' },
    capaEffective: { by: 'you', key: 'capa', label: 'Complete the corrective action record for each nonconformity', action: 'App.go', arg: 'actions' }
  };
  /* Mandatory-documentation records, mapped to the same fixes. */
  var MD_RECORD_FIX = { objectives: 'objectivePlans', training: 'trainingCurrent', riskAssessment: 'riskReviewed', riskTreatment: 'riskActioned',
    monitoring: 'operating', audit: 'auditDone', review: 'mrInputs', soa: 'soa', rtp: 'riskTreated', legal: 'legalTraced' };

  function docFix(id, titles, st) {
    return { by: 'checkpoint', key: 'doc:' + id, doc: id, docSt: st || 'missing', label: (st === 'partial' ? 'Approve the ' : 'Generate and approve the ') + ((titles && titles[id]) || id), action: 'App.fixGenerateDocument', arg: id };
  }
  /* The fixes for one checklist item (an item from clauseChecklist):
     deduplicated, Checkpoint's own first. `ctx.docs` is [{tplId,status}],
     `ctx.titles` maps template ids to names. */
  function clauseRequirementFixes(item, ctx) {
    ctx = ctx || {};
    if (!item || item.status === 'met') return [];
    var approved = {};
    (ctx.docs || []).forEach(function (d) { if (d && d.status === 'Approved') approved[d.tplId] = true; });
    var out = [], seen = {};
    function add(f) { if (f && !seen[f.key]) { seen[f.key] = true; out.push(f); } }
    (item.gaps || []).forEach(function (g) {
      if (g.kind === 'doc') add(docFix(g.id, ctx.titles, g.st));
      else if (g.kind === 'profile') add({ by: 'you', key: 'profile', label: 'Answer the scope & context questionnaire', action: 'App.orgProfileWizard' });
      else if (g.kind === 'record') {
        if (g.id === 'mandatoryAll' || g.id === 'pimsCore' || g.id === 'aimsCore') add({ by: 'checkpoint', key: 'stage1', label: 'Work through the Stage 1 checklist', action: 'App.go', arg: 'certification' });
        else add(CLAUSE_RECORD_FIXES[g.id]);
      } else if (g.kind === 'md') {
        var m = MANDATORY_DOCS.find(function (x) { return x.ref === g.id; });
        if (!m) return;
        if (m.tpl && !approved[m.tpl]) add(docFix(m.tpl, ctx.titles, (ctx.docs || []).some(function (d) { return d && d.tplId === m.tpl; }) ? 'partial' : 'missing'));
        if (m.record && MD_RECORD_FIX[m.record]) add(CLAUSE_RECORD_FIXES[MD_RECORD_FIX[m.record]]);
      }
    });
    var order = { checkpoint: 0, meeting: 1, you: 2 };
    return out.sort(function (a, b) { return order[a.by] - order[b.by]; });
  }
  /* What evidence each ISO 27001 clause expects, so a linked file can be
     checked for being the right kind and current, not just present.
     kind 'document' = an approved controlled document; 'record' = a
     dated record of the activity (minutes, report, register snapshot),
     no older than maxAge days. words = what its name usually contains. */
  var CLAUSE_EVIDENCE_EXPECT = {
    '4.1': { kind: 'document', what: 'the context of the organisation (internal and external issues)', words: /context|issue|scope/i },
    '4.2': { kind: 'document', what: 'the interested parties and their requirements', words: /interested|parties|stakeholder|legal|context|scope/i },
    '4.3': { kind: 'document', what: 'the ISMS scope', words: /scope/i },
    '4.4': { kind: 'document', what: 'the ISMS description or manual', words: /isms|manual|management system|policy/i },
    '5.1': { kind: 'record', maxAge: 365, what: 'a record of top management directing the ISMS (review minutes, approvals)', words: /review|minutes|meeting|leadership|management|approv/i },
    '5.2': { kind: 'document', what: 'the approved information security policy', words: /polic/i },
    '5.3': { kind: 'document', what: 'roles, responsibilities and authorities', words: /role|responsib|raci|organi/i },
    '6.1.2': { kind: 'record', maxAge: 365, what: 'the risk assessment, as carried out', words: /risk/i },
    '6.1.3': { kind: 'record', maxAge: 365, what: 'the risk treatment plan and Statement of Applicability', words: /risk|treatment|applicability|soa/i },
    '6.2': { kind: 'document', what: 'the information security objectives and plans', words: /objective/i },
    '6.3': { kind: 'record', maxAge: 365, what: 'a record of planned changes to the ISMS', words: /change/i },
    '7.2': { kind: 'record', maxAge: 365, what: 'records of competence and training', words: /train|competen|skill|qualif/i },
    '7.3': { kind: 'record', maxAge: 365, what: 'records of awareness (training, policy acknowledgement)', words: /aware|train|acknowledg|attest/i },
    '7.5': { kind: 'document', what: 'the document control procedure', words: /document|control|record/i },
    '8.1': { kind: 'record', maxAge: 365, what: 'records that processes are carried out as planned', words: /operat|record|log|activit|review/i },
    '8.2': { kind: 'record', maxAge: 365, what: 'the results of the latest risk assessment', words: /risk/i },
    '8.3': { kind: 'record', maxAge: 365, what: 'the results of risk treatment', words: /risk|treatment/i },
    '9.1': { kind: 'record', maxAge: 365, what: 'monitoring and measurement results', words: /monitor|measure|scan|posture|metric|kpi|objective|dashboard/i },
    '9.2': { kind: 'record', maxAge: 365, what: 'the internal audit programme and report', words: /audit/i },
    '9.3': { kind: 'record', maxAge: 365, what: 'the management review minutes', words: /review|minutes/i },
    '10.1': { kind: 'record', maxAge: 365, what: 'records of continual improvement', words: /improv|opportunit|action/i },
    '10.2': { kind: 'record', maxAge: 365, what: 'nonconformities and corrective actions', words: /nonconform|corrective|action|capa|finding/i }
  };
  /* ev = { url, doc: { name, status, category, nextReview, modified } |
     null (the register document the link points at), folder: { names,
     latest, count } | null (the clause's evidence folder, when the link
     is it) }. Returns { level: 'ok'|'warn'|'fail'|'none'|'unknown',
     issues:[], expects }. 'unknown' = a link Checkpoint cannot open
     (outside SharePoint); never treated as a failure. */
  function clauseEvidenceFit(code, ev, today) {
    var x = CLAUSE_EVIDENCE_EXPECT[code];
    ev = ev || {};
    if (!x) return { level: ev.url ? 'ok' : 'none', issues: [], expects: '' };
    var out = { level: 'ok', issues: [], expects: x.what };
    var fail = function (t) { out.issues.push(t); out.level = 'fail'; };
    var warnIt = function (t) { out.issues.push(t); if (out.level === 'ok') out.level = 'warn'; };
    if (!ev.url) { out.level = 'none'; out.issues.push('No evidence linked: this clause needs ' + x.what + '.'); return out; }
    var names = [], latest = '';
    if (ev.doc) {
      names = [ev.doc.name || ''];
      latest = String(ev.doc.modified || '').slice(0, 10);
      var isPolicy = /polic|procedure/i.test(ev.doc.category || '') && !/minutes|report|record|snapshot|register/i.test(ev.doc.name || '');
      if (x.kind === 'record' && isPolicy) fail('The linked file is a policy or procedure (' + String(ev.doc.name).replace(/\.(html|docx?|pdf)$/i, '') + '). This clause needs ' + x.what + ': a record that it was done, not the document saying it will be.');
      if (x.kind === 'document' && ev.doc.status && ev.doc.status !== 'Approved') fail('The linked document is ' + String(ev.doc.status).toLowerCase() + ', not approved.');
      if (x.kind === 'document' && ev.doc.nextReview && String(ev.doc.nextReview).slice(0, 10) < today) warnIt('The linked document was due for review on ' + String(ev.doc.nextReview).slice(0, 10) + '.');
    } else if (ev.folder) {
      names = ev.folder.names || [];
      latest = String(ev.folder.latest || '').slice(0, 10);
      if (!ev.folder.count) { fail('The evidence folder is empty: add ' + x.what + '.'); return out; }
    } else {
      out.level = 'unknown';
      out.issues.push('Checkpoint cannot open this link to check it. Make sure it shows ' + x.what + '.');
      return out;
    }
    if (x.kind === 'record' && x.maxAge && latest && daysBetweenDateStr(latest, today) > x.maxAge) fail('The newest evidence is from ' + latest + ', over ' + Math.round(x.maxAge / 30) + ' months old. An auditor expects ' + x.what + ' from the last 12 months.');
    if (names.length && !names.some(function (n) { return x.words.test(n); })) warnIt('Nothing linked is named like ' + x.what + '. Check it is the right file.');
    return out;
  }

  /* "Finish this clause": everything left on one clause, in the order
     to do it. Checkpoint's own steps first (documents, records), then
     what only the organisation can record, then the owner, the evidence
     link and finally marking it Implemented. Each step names the
     requirements it meets. clause = { id, own, evidenceUrl, st }, key =
     the app's clause key (fw|code). Returns { steps:[{ key, label, why,
     action, arg, by }], left, done }. */
  function clauseFinishSteps(checklist, clause, key, ctx) {
    var cl = checklist || { items: [] }, c = clause || {};
    var steps = [], byKey = {};
    (cl.items || []).forEach(function (i) {
      if (i.status === 'met') return;
      var fixes = clauseRequirementFixes(i, ctx);
      if (!fixes.length) fixes = [{ by: 'you', key: 'confirm:' + i.id, label: 'Record where the evidence is', action: 'App.confirmClauseRequirement', arg: key + '#' + i.id }];
      fixes.forEach(function (f) {
        if (!byKey[f.key]) { byKey[f.key] = { key: f.key, label: f.label, action: f.action, arg: f.arg || '', by: f.by, reqs: [] }; steps.push(byKey[f.key]); }
        if (byKey[f.key].reqs.indexOf(i.text) === -1) byKey[f.key].reqs.push(i.text);
      });
    });
    var order = { checkpoint: 0, meeting: 1, you: 2 };
    steps.sort(function (a, b) { return order[a.by] - order[b.by]; });
    steps.forEach(function (st) { st.why = 'Meets: ' + st.reqs.join('; '); });
    if (!String(c.own || '').trim()) steps.push({ key: 'owner', by: 'you', label: 'Name the owner of this clause', why: 'An auditor asks who is responsible for each requirement (Clause 5.3).', action: 'App.setClauseOwner', arg: key });
    var fit = ctx && ctx.evidenceFit;
    if (!c.evidenceUrl) steps.push({ key: 'evidence', by: 'you', label: 'Link the evidence to the clause', why: fit && fit.expects ? 'It needs ' + fit.expects + '.' : 'The record the auditor opens first: the approved document, minutes or register snapshot.', action: 'App.setClauseEvidence', arg: key });
    else if (fit && fit.level === 'fail') steps.push({ key: 'evidence', by: 'you', label: 'Replace the evidence: it is not what an auditor will accept', why: fit.issues.join(' '), action: 'App.setClauseEvidence', arg: key });
    if (c.st !== 'Implemented') steps.push({ key: 'implement', by: 'you', label: 'Mark the clause Implemented', why: steps.length ? 'Once the steps above are done.' : 'Every requirement is met and the evidence is linked.', action: 'App.markClauseImplemented', arg: key, final: true });
    return { steps: steps, left: steps.length, done: !steps.length };
  }

  /* Every outstanding fix across a set of checklists, each with the
     requirements it would meet: [{ fix, reqs:[{ clause, text }] }].
     Documents collapse into two steps, generate the missing set and
     approve the drafts, rather than one row per document. */
  function clauseAutopilot(checklists, ctx) {
    var byKey = {}, list = [];
    var titles = (ctx && ctx.titles) || {};
    var docSets = {
      missing: { by: 'checkpoint', key: 'docs:missing', docs: [], action: 'App.generateDocumentSet' },
      partial: { by: 'checkpoint', key: 'docs:draft', docs: [], action: 'App.approveDraftSet' }
    };
    (checklists || []).forEach(function (cl) {
      (cl.items || []).forEach(function (i) {
        clauseRequirementFixes(i, ctx).map(function (f) {
          if (!f.doc) return f;
          var set = docSets[f.docSt === 'partial' ? 'partial' : 'missing'];
          if (set.docs.indexOf(f.doc) === -1) set.docs.push(f.doc);
          return set;
        }).forEach(function (f) {
          if (!byKey[f.key]) { byKey[f.key] = { fix: f, reqs: [] }; list.push(byKey[f.key]); }
          byKey[f.key].reqs.push({ clause: cl.label || cl.code || '', text: i.text });
        });
      });
    });
    function names(d) { var n = d.map(function (id) { return titles[id] || id; }); return n.length > 4 ? n.slice(0, 4).join(', ') + ' and ' + (n.length - 4) + ' more' : n.join(', '); }
    docSets.missing.label = 'Generate the ' + docSets.missing.docs.length + ' document' + (docSets.missing.docs.length === 1 ? '' : 's') + ' the clauses need (' + names(docSets.missing.docs) + '), then approve them';
    docSets.partial.label = 'Approve the ' + docSets.partial.docs.length + ' draft document' + (docSets.partial.docs.length === 1 ? '' : 's') + ' (' + names(docSets.partial.docs) + ')';
    var order = { checkpoint: 0, meeting: 1, you: 2 };
    return list.sort(function (a, b) { return order[a.fix.by] - order[b.fix.by] || b.reqs.length - a.reqs.length; });
  }

  /* Objectives Checkpoint can propose and then measure from its own
     data (Clause 6.2: measurable, monitored, owned, with a due date).
     A suggestion already in the register (same title) is left out. */
  /* `starter`: the balanced first set (C, I and A each covered, all
     measured by Checkpoint) pre-ticked when a client adopts objectives.
     `resources`: what Clause 6.2 b) asks the plan to state. */
  var SUGGESTED_OBJECTIVES = [
    { key: 'obj-posture', resources: 'Checkpoint posture scan (included); time to fix failing checks', fws: ['iso27001'], cia: ['C', 'I', 'A'], title: 'Keep our Microsoft 365 security configuration strong', metric: 'Checkpoint posture score', target: 'At least 80 out of 100 at every scan', risks: [] },
    { key: 'obj-mfa', resources: 'Microsoft 365 Conditional Access (already licensed); about a day to enforce and register users', starter: true, fws: ['iso27001'], cia: ['C'], title: 'Only the right people can sign in to our systems', metric: 'Accounts protected by multi-factor authentication', target: '100% of accounts, confirmed at every scan', risks: ['ctx-bec', 'ctx-leaver-access', 'mfa-all', 'mfa-priv', 'mfa-registration'] },
    { key: 'obj-training', resources: 'Checkpoint training courses; about 30 minutes per person per year', starter: true, fws: ['iso27001'], cia: ['C', 'I'], title: 'Everyone knows their security responsibilities', metric: 'Staff with current security awareness training', target: 'At least 95%', risks: ['ctx-bec'] },
    { key: 'obj-policy', resources: 'Checkpoint attestation campaign; a few minutes per person', fws: ['iso27001'], cia: ['C', 'I', 'A'], title: 'Everyone has read and accepted the information security policy', metric: 'Staff acknowledgement of the current policy', target: 'At least 90%', risks: [] },
    { key: 'obj-risk', resources: 'Risk owners\' time, as agreed at management review', starter: true, fws: ['iso27001'], cia: ['C', 'I', 'A'], title: 'Treat high and critical risks on time', metric: 'High and critical risks with treatment actions on schedule', target: '100%, no treatment action more than 30 days overdue', risks: [] },
    { key: 'obj-actions', resources: 'Action owners\' time; weekly owner reminders', fws: ['iso27001'], cia: ['I'], title: 'Close corrective and improvement actions when we said we would', metric: 'Actions closed by their due date', target: 'At least 90%', risks: [] },
    { key: 'obj-restore', resources: 'Existing backup tooling; about two hours per restore test', starter: true, fws: ['iso27001'], cia: ['A', 'I'], title: 'We can recover our information when we need to', metric: 'Backup restore tests completed successfully on schedule', target: 'Every scheduled restore test done, none overdue', risks: ['ctx-backup', 'backup'] },
    { key: 'obj-incident', resources: 'The incident response plan and the contacts named in it', starter: true, fws: ['iso27001'], cia: ['A', 'I'], title: 'Handle security incidents quickly and learn from them', metric: 'Incidents triaged within one business day, with lessons recorded', target: '100%', risks: [] },
    { key: 'obj-ai-impact', resources: 'AI system owners\' time; Checkpoint impact assessment template', fws: ['iso42001'], cia: ['I'], title: 'Every AI system is assessed before use and kept under review', metric: 'AI systems with a completed impact assessment, reviewed within 12 months', target: '100%', risks: ['ctx-ai-tools', 'ctx-ai-product'] },
    { key: 'obj-ai-training', resources: 'Checkpoint AI use and oversight course; about 30 minutes per person', fws: ['iso42001'], cia: ['C', 'I'], title: 'Everyone using AI knows how to use it responsibly', metric: 'Staff with current AI use and oversight training', target: 'At least 95%', risks: ['ctx-ai-tools'] },
    { key: 'obj-privacy-rights', resources: 'Privacy officer\'s time; the PII principal rights procedure', fws: ['iso27701', 'privacyact'], cia: ['C'], title: 'Answer privacy requests on time', metric: 'Requests from individuals answered within the legal time limit', target: '100%', risks: ['ctx-privacy-breach'] }
  ];
  /* `risks` (optional): open risks from the register. A suggestion
     aimed at one of them carries `why` naming it and comes first, so the
     objectives follow the organisation's own top risks. */
  function suggestedObjectives(frameworks, objectives, risks) {
    var fws = frameworks || ['iso27001'];
    var have = {};
    (objectives || []).forEach(function (o) { if (o && o.title) have[String(o.title).trim().toLowerCase()] = true; });
    var open = (risks || []).filter(function (r) { return r && r.status !== 'Closed' && r.type !== 'Opportunity'; });
    return SUGGESTED_OBJECTIVES.filter(function (o) {
      return o.fws.some(function (f) { return fws.indexOf(f) !== -1; }) && !have[o.title.toLowerCase()];
    }).map(function (o) {
      var hit = open.filter(function (r) { return r.tpl && o.risks.indexOf(r.tpl) !== -1; })[0];
      return hit ? Object.assign({}, o, { why: 'Targets ' + hit.id + ': ' + hit.title }) : o;
    }).sort(function (a, b) { return (b.why ? 1 : 0) - (a.why ? 1 : 0); });
  }
  /* The objectives as the policy states them, at generation time. */
  function objectivesStatement(objectives) {
    var list = (objectives || []).filter(function (o) { return o && o.title && o.status !== 'Achieved' && o.status !== 'Missed'; });
    if (!list.length) return 'set each year in the objectives register and approved by top management';
    return list.map(function (o) {
      var def = SUGGESTED_OBJECTIVES.find(function (x) { return x.metric.toLowerCase() === String(o.metric || '').trim().toLowerCase(); });
      var cia = def ? ' [' + def.cia.join(', ') + ']' : '';
      return o.title + (o.target ? ' (' + o.target + (o.due ? ', by ' + o.due : '') + ')' : '') + (o.owner && o.owner !== 'Unassigned' ? ', owned by ' + o.owner : '') + cia;
    }).join('; ');
  }

  /* Measures an objective from Checkpoint's own records, when its
     metric is one Checkpoint suggested (matched by metric text, so an
     objective the client wrote themselves is left to them).
     d = { scans, training, attestations, risks, actions, incidents, aiSystems }.
     Returns null when Checkpoint cannot measure it, else
     { key, value (0-100), display, met, status }. Status follows the
     measurement: met → On track (Achieved once the due date passes),
     not met → At risk (Missed once the due date passes). */
  function measureObjective(o, d, today) {
    if (!o) return null;
    d = d || {};
    var def = SUGGESTED_OBJECTIVES.find(function (x) { return String(o.metric || '').trim().toLowerCase() === x.metric.toLowerCase(); });
    if (!def) return null;
    var within = function (dt, days) { return dt && daysBetweenDateStr(String(dt).slice(0, 10), today) <= days; };
    var pctOf = function (n, total) { return total ? Math.round(n / total * 100) : null; };
    var value = null, display = '', threshold = 100;
    var openRisks = (d.risks || []).filter(function (r) { return r && r.status !== 'Closed' && r.type !== 'Opportunity'; });
    var actionsById = {};
    (d.actions || []).forEach(function (a) { if (a && a.id) actionsById[a.id] = a; });
    switch (def.key) {
      case 'obj-posture':
        var scans = (d.scans || []).filter(function (x) { return typeof x.score === 'number'; });
        if (!scans.length) return null;
        value = scans[scans.length - 1].score; threshold = 80; display = value + '/100 at the last scan';
        break;
      case 'obj-training':
      case 'obj-ai-training':
        var rows = (d.training || []).filter(function (t) { return def.key === 'obj-ai-training' ? t.courseId === AI_TRAINING_COURSE : t.courseId !== AI_TRAINING_COURSE && t.courseId !== PRIVACY_TRAINING_COURSE; });
        var tr = trainingCheckResult(rows, today);
        if (tr.pct == null) return null;
        value = tr.pct; threshold = 95; display = tr.completed + ' of ' + tr.total + ' completed (' + value + '%)';
        break;
      case 'obj-policy':
        var camp = attestationCampaigns((d.attestations || []).filter(function (r) { return /Information Security Policy/i.test(r.docName || ''); }))[0];
        if (!camp) return null;
        value = camp.pct; threshold = 90; display = value + '% acknowledged';
        break;
      case 'obj-risk':
        var high = openRisks.filter(function (r) { var q = residual(r, d.actions || []); var b = band(q.L * q.I); return b === 'High' || b === 'Critical'; });
        if (!high.length) { value = 100; display = 'No high or critical risks open'; break; }
        var onTime = high.filter(function (r) {
          var acts = (r.actions || []).map(function (id) { return actionsById[id]; }).filter(Boolean);
          if (!acts.length) return !!String(r.acceptedBy || '').trim();
          return !acts.some(function (a) { return a.status !== 'Done' && a.status !== 'Cancelled' && a.due && daysBetweenDateStr(a.due, today) > 30; });
        }).length;
        value = pctOf(onTime, high.length); display = onTime + ' of ' + high.length + ' high or critical risks on schedule';
        break;
      case 'obj-actions':
        var due = (d.actions || []).filter(function (a) { return a && a.due && a.due <= today && a.status !== 'Cancelled'; });
        if (!due.length) return null;
        var closed = due.filter(function (a) { return a.status === 'Done' || a.status === 'Closed'; }).length;
        value = pctOf(closed, due.length); threshold = 90; display = closed + ' of ' + due.length + ' actions due so far are closed (' + value + '%)';
        break;
      case 'obj-incident':
        var inc = (d.incidents || []).filter(function (n) { return within(n.detected, 365); });
        if (!inc.length) { value = 100; display = 'No incidents in the last 12 months'; break; }
        var handled = inc.filter(function (n) { return n.status !== 'Closed' || String(n.lessonsLearned || '').trim(); }).length;
        value = pctOf(handled, inc.length); display = handled + ' of ' + inc.length + ' incidents handled with lessons recorded';
        break;
      case 'obj-mfa':
        var r = d.lastResults || null;
        var ids = ['mfa-all', 'mfa-registration'].filter(function (id) { return r && r[id] && r[id] !== 'manual'; });
        if (!ids.length) return null;
        var passing = ids.filter(function (id) { return r[id] === 'pass'; }).length;
        value = pctOf(passing, ids.length); display = passing === ids.length ? 'MFA checks passing at the last scan' : (ids.length - passing) + ' MFA check(s) not passing at the last scan';
        break;
      case 'obj-restore':
        var tests = (d.calendar || []).filter(function (c) { var rd = calendarItemLive(c) && rhythmDefFor(c); return rd && rd.key === 'backup-restore'; });
        if (!tests.length) return null;
        var onTime = tests.filter(function (c) { return c.lastCompleted && (!c.nextDue || c.nextDue >= today); }).length;
        value = pctOf(onTime, tests.length); display = onTime + ' of ' + tests.length + ' restore test schedule(s) done and not overdue';
        break;
      case 'obj-ai-impact':
        var ai = d.aiSystems || [];
        if (!ai.length) return null;
        var ok = ai.filter(function (x) { return x.impactAssessmentStatus === 'Completed' && within(x.lastReviewed, 365); }).length;
        value = pctOf(ok, ai.length); display = ok + ' of ' + ai.length + ' AI systems assessed and reviewed';
        break;
      default:
        return null;
    }
    var met = value >= threshold;
    var past = o.due && o.due < today;
    return { key: def.key, cia: def.cia, value: value, display: display, met: met, status: past ? (met ? 'Achieved' : 'Missed') : (met ? 'On track' : 'At risk') };
  }

  /* ============================================================
     Annex A plan
     ------------------------------------------------------------
     The organisation delivers Annex A; Checkpoint tells it, control by
     control, the one next step, and does the steps it can. Each
     applicable control that is not finished gets exactly one step,
     checked in this order:
       justify   — excluded with no justification (you)
       scan      — every mapped posture check passes and the scan has
                   captured evidence: mark Implemented (Checkpoint)
       scanFix   — a mapped posture check fails (you, from the scan)
       doc       — a document written for it is not yet approved
                   (Checkpoint generates, you approve)
       rhythm    — a recurring activity covers it but is not scheduled
                   (Checkpoint)
       rhythmRun — the activity is scheduled but has never been
                   completed with evidence (you)
       evidence  — record how it is done and link the evidence (you)
       reverify  — Implemented, but its review is overdue (you)
     d = { fw, today, docs:[{tplId,status}], templates:[{id,title,controls,frameworks}],
           checkControls:{checkId:[code]}, lastResults:{checkId:result}, calendar:[], reviewCadenceDays } */
  var ANNEX_STEPS = {
    justify: { by: 'you', label: 'Record why each excluded control does not apply', action: 'App.annexFocus', arg: 'justify' },
    scan: { by: 'checkpoint', label: 'Mark the controls the posture scan proves as Implemented (evidence already captured)', action: 'App.annexAcceptScanProven' },
    scanFix: { by: 'you', label: 'Fix the failing posture checks behind these controls', action: 'App.go', arg: 'scan' },
    doc: { by: 'checkpoint', label: 'Generate and approve the documents written for these controls', action: 'App.annexDocuments' },
    rhythm: { by: 'checkpoint', label: 'Schedule the recurring activities that operate these controls', action: 'App.setupOperatingRhythm' },
    rhythmRun: { by: 'meeting', label: 'Complete the scheduled activities with their evidence', action: 'App.go', arg: 'calendar' },
    evidence: { by: 'you', label: 'Record how each control is done and link its evidence', action: 'App.annexFocus', arg: 'evidence' },
    reverify: { by: 'you', label: 'Re-verify the controls whose review is overdue', action: 'App.annexFocus', arg: 'reverify' }
  };
  function annexAPlan(controls, d) {
    d = d || {};
    var fw = d.fw || 'iso27001', today = d.today;
    var approved = {}, generated = {};
    (d.docs || []).forEach(function (x) { if (!x) return; generated[x.tplId] = true; if (x.status === 'Approved') approved[x.tplId] = true; });
    var checksFor = {};
    Object.keys(d.checkControls || {}).forEach(function (id) {
      (d.checkControls[id] || []).forEach(function (code) { (checksFor[code] = checksFor[code] || []).push(id); });
    });
    var tplFor = {};
    (d.templates || []).forEach(function (t) {
      if (t.frameworks && t.frameworks.indexOf(fw) === -1 && !(fw === 'iso27701' && t.frameworks.indexOf('iso27001') !== -1)) return;
      (t.controls || []).forEach(function (code) { (tplFor[code] = tplFor[code] || []).push(t); });
    });
    var rhythmFor = {};
    OPERATING_RHYTHM.forEach(function (r) { r.controls.forEach(function (code) { (rhythmFor[code] = rhythmFor[code] || []).push(r); }); });
    var scheduled = {}, completed = {};
    (d.calendar || []).forEach(function (cal) {
      if (!calendarItemLive(cal)) return;
      var r = rhythmDefFor(cal);
      if (!r) return;
      scheduled[r.key] = true;
      if (cal.lastCompleted) completed[r.key] = true;
    });
    var results = d.lastResults || null;
    var out = [];
    (controls || []).forEach(function (c) {
      if (!c || (c.fw || 'iso27001') !== fw) return;
      var step = null, why = '';
      if (!c.app) {
        if (!String(c.just || '').trim()) { step = 'justify'; why = 'Excluded with no justification'; }
      } else if (c.st === 'Implemented') {
        if (!c.evidenceUrl) { step = 'evidence'; why = 'Implemented, but no evidence linked'; }
        else if (controlReviewStatus(c, today, d.reviewCadenceDays).due) { step = 'reverify'; why = 'Review overdue'; }
      } else {
        var checks = fw === 'iso27001' || fw === 'iso27701' ? (checksFor[c.id] || []) : [];
        var res = results ? checks.map(function (id) { return results[id]; }).filter(function (r) { return r && r !== 'manual'; }) : [];
        var docs = (tplFor[c.id] || []).filter(function (t) { return !approved[t.id]; });
        var rh = (rhythmFor[c.id] || []);
        if (res.length && res.some(function (r) { return r === 'fail' || r === 'review'; })) { step = 'scanFix'; why = 'A posture check for it is not passing'; }
        else if (res.length && res.every(function (r) { return r === 'pass'; }) && c.evidenceUrl) { step = 'scan'; why = 'Every posture check for it passes, evidence captured'; }
        else if (docs.length) { step = 'doc'; why = (generated[docs[0].id] ? 'Approve the ' : 'Generate the ') + docs[0].title; }
        else if (rh.length && rh.some(function (r) { return !scheduled[r.key]; })) { step = 'rhythm'; why = 'Schedule: ' + rh.filter(function (r) { return !scheduled[r.key]; })[0].title; }
        else if (rh.length && !rh.some(function (r) { return completed[r.key]; })) { step = 'rhythmRun'; why = 'Complete: ' + rh[0].title; }
        else { step = 'evidence'; why = c.evidenceUrl ? 'Evidence linked: confirm it is in place and mark Implemented' : 'Record how it is done and link evidence'; }
      }
      if (step) out.push({ control: c, step: step, why: why });
    });
    return out;
  }
  /* The plan grouped by step: [{ step, fix, controls:[{control, why}] }],
     Checkpoint's steps first. */
  function annexAPlanGroups(plan) {
    var by = {}, list = [];
    (plan || []).forEach(function (p) {
      if (!by[p.step]) { by[p.step] = { step: p.step, fix: ANNEX_STEPS[p.step], controls: [] }; list.push(by[p.step]); }
      by[p.step].controls.push({ control: p.control, why: p.why });
    });
    var order = { checkpoint: 0, meeting: 1, you: 2 };
    return list.sort(function (a, b) { return order[a.fix.by] - order[b.fix.by] || b.controls.length - a.controls.length; });
  }

  /* ============================================================
     Owner reminders
     ------------------------------------------------------------
     What each named owner has due, so "do what you document" does not
     depend on anyone opening Checkpoint. Pure: the browser app and the
     scheduled Azure Function (azure/lib/ownerDigest.js, kept identical
     and tested against this one) both build the same lists.
     d = { actions:[{id,title,owner,ownerEmail,due,status}],
           calendar:[{id,title,owner,nextDue,status}],
           docs:[{name,owner,nextReview,status}],
           objectives:[{id,title,owner,status}],
           evidence:[{control,title,owner,email,requested}],
           approvals:[{name,approver,approverEmail,requested}] }
     Returns [{ owner, email, items:[{ kind, ref, title, due, overdue }] }],
     owners with something overdue first. Nothing due → not listed. */
  function ownerWorkItems(d, today, horizonDays) {
    d = d || {};
    var h = horizonDays == null ? 14 : horizonDays;
    var limit = (function () { var x = new Date(String(today).slice(0, 10) + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + h); return x.toISOString().slice(0, 10); })();
    var docLimit = (function () { var x = new Date(String(today).slice(0, 10) + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 30); return x.toISOString().slice(0, 10); })();
    var by = {}, order = [];
    function add(owner, email, item) {
      var name = String(owner || '').trim();
      if (!name || /^unassigned$/i.test(name)) return;
      var k = name.toLowerCase();
      if (!by[k]) { by[k] = { owner: name, email: '', items: [] }; order.push(k); }
      if (email && !by[k].email) by[k].email = String(email).trim();
      by[k].items.push(item);
    }
    var closed = { Done: 1, Closed: 1, Cancelled: 1 };
    (d.actions || []).forEach(function (a) {
      if (!a || closed[a.status] || !a.due || a.due > limit) return;
      add(a.owner, a.ownerEmail, { kind: 'Action', ref: a.id || '', title: a.title || '', due: a.due, overdue: a.due < today });
    });
    (d.calendar || []).forEach(function (c) {
      if (!c || c.status === 'Retired' || c.status === 'Done' || c.status === 'Closed' || !c.nextDue || c.nextDue > limit) return;
      add(c.owner, '', { kind: 'Activity', ref: c.id || '', title: c.title || '', due: c.nextDue, overdue: c.nextDue < today });
    });
    (d.docs || []).forEach(function (x) {
      if (!x || x.status !== 'Approved' || !x.nextReview || x.nextReview > docLimit) return;
      add(x.owner, '', { kind: 'Document review', ref: '', title: String(x.name || '').replace(/\.html$/i, ''), due: x.nextReview, overdue: x.nextReview < today });
    });
    (d.objectives || []).forEach(function (o) {
      if (!o || (o.status !== 'At risk' && o.status !== 'Missed')) return;
      add(o.owner, '', { kind: 'Objective ' + String(o.status).toLowerCase(), ref: o.id || '', title: o.title || '', due: '', overdue: o.status === 'Missed' });
    });
    (d.evidence || []).forEach(function (e) {
      if (!e) return;
      add(e.owner, e.email, { kind: 'Evidence requested', ref: e.control || '', title: e.title || '', due: e.requested || '', overdue: false });
    });
    (d.approvals || []).forEach(function (r) {
      if (!r) return;
      add(r.approver, r.approverEmail, { kind: 'Approval requested', ref: '', title: r.name || '', due: r.requested || '', overdue: false });
    });
    return order.map(function (k) {
      var o = by[k];
      o.items.sort(function (a, b) { return (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || String(a.due || '9999').localeCompare(String(b.due || '9999')); });
      return o;
    }).sort(function (a, b) {
      var ao = a.items.filter(function (i) { return i.overdue; }).length, bo = b.items.filter(function (i) { return i.overdue; }).length;
      return bo - ao || a.owner.localeCompare(b.owner);
    });
  }
  /* Evidence requests: the controls waiting on evidence, grouped by
     owner, each with what to provide (window.GUIDANCE evidence text)
     and where to put it. items = [{ control, folderUrl }].
     Returns { byOwner:[{ owner, controls:[{ key, id, title, evidence, folderUrl }] }], unowned:[ids] }. */
  function evidenceRequestsByOwner(items, guidance) {
    var by = {}, order = [], unowned = [];
    (items || []).forEach(function (it) {
      var c = it && it.control;
      if (!c) return;
      var owner = String(c.own || '').trim();
      if (!owner || /^unassigned$/i.test(owner)) { unowned.push(c.id); return; }
      var k = owner.toLowerCase();
      if (!by[k]) { by[k] = { owner: owner, controls: [] }; order.push(k); }
      var g = (guidance || {})[c.id] || {};
      by[k].controls.push({ key: (c.fw || 'iso27001') + '|' + c.id, id: c.id, title: c.t || '', evidence: g.evidence || 'Evidence that this control is in place and operating: a record, export, screenshot or signed-off review.', folderUrl: it.folderUrl || '' });
    });
    return { byOwner: order.map(function (k) { return by[k]; }), unowned: unowned };
  }
  function evidenceRequestHtml(entry, clientLabel, appUrl) {
    var e = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    return '<div style="font-family:Arial,sans-serif;color:#222;max-width:640px">' +
      '<h2 style="margin-bottom:4px">Evidence needed — ' + e(clientLabel) + '</h2>' +
      '<p style="font-size:13px">Hi ' + e(entry.owner) + ', you own ' + entry.controls.length + ' security control' + (entry.controls.length === 1 ? '' : 's') + ' that need evidence for the certification audit. For each, please add the evidence described below.</p>' +
      entry.controls.map(function (c) {
        return '<div style="border-top:1px solid #eee;padding:10px 0;font-size:13px"><b>' + e(c.id) + ' ' + e(c.title) + '</b><br><span style="color:#444">What to provide: ' + e(c.evidence) + '</span><br>' +
          (c.folderUrl ? '<a href="' + e(c.folderUrl) + '">Add it to this control’s evidence folder</a>' : (appUrl ? '<a href="' + e(appUrl) + '">Open Checkpoint</a> › Statement of Applicability › ' + e(c.id) + ' › Add evidence' : '')) + '</div>';
      }).join('') +
      '<p style="color:#999;font-size:11px;margin-top:24px">Sent from Checkpoint by Compliance365. Files you add are picked up automatically and linked to the control.</p></div>';
  }

  /* Matches an owner as written in a register (a name, an email or a
     UPN) to a directory user. Exact matches only, case-insensitive:
     a near-miss sends someone else's list to the wrong person. */
  /* How a person wants to hear about new work: 'immediate' (an email
     as it happens) or 'weekly' (only in the weekly digest). prefs =
     { 'name or email, lower case': 'weekly' }. Weekly only counts while
     the weekly digest is switched on, or nothing would reach them. */
  function notifyPref(prefs, owner, email, digestOn) {
    if (!digestOn) return 'immediate';
    var p = prefs || {};
    var keys = [owner, email].filter(Boolean).map(function (k) { return String(k).trim().toLowerCase(); });
    for (var i = 0; i < keys.length; i++) if (p[keys[i]] === 'weekly') return 'weekly';
    return 'immediate';
  }
  function matchOwnerToUser(owner, users) {
    var o = String(owner || '').trim().toLowerCase();
    if (!o) return null;
    var hits = (users || []).filter(function (u) {
      return u && [u.displayName, u.mail, u.userPrincipalName, u.upn, u.name].some(function (v) { return v && String(v).trim().toLowerCase() === o; });
    });
    return hits.length === 1 ? hits[0] : null;
  }
  function ownerDigestHtml(entry, clientLabel, appUrl) {
    var e = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var od = entry.items.filter(function (i) { return i.overdue; }).length;
    return '<div style="font-family:Arial,sans-serif;color:#222;max-width:600px">' +
      '<h2 style="margin-bottom:4px">Your security tasks — ' + e(clientLabel) + '</h2>' +
      '<p style="color:#666;font-size:13px;margin-top:0">Hi ' + e(entry.owner) + ', here is what is assigned to you in the information security management system' + (od ? ', including ' + od + ' overdue' : '') + '.</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
      entry.items.map(function (i) {
        return '<tr><td style="padding:6px;border-bottom:1px solid #eee;white-space:nowrap;color:#666">' + e(i.kind) + '</td><td style="padding:6px;border-bottom:1px solid #eee">' + (i.ref ? '<b>' + e(i.ref) + '</b> ' : '') + e(i.title) + '</td>' +
          '<td style="padding:6px;border-bottom:1px solid #eee;white-space:nowrap;' + (i.overdue ? 'color:#b00020;font-weight:bold' : '') + '">' + (i.due ? (i.overdue ? 'Overdue: ' : (i.kind === 'Evidence requested' || i.kind === 'Approval requested' ? 'Requested ' : 'Due ')) + e(i.due) : '') + '</td></tr>';
      }).join('') + '</table>' +
      (appUrl ? '<p style="margin-top:16px"><a href="' + e(appUrl) + '">Open Checkpoint</a> to complete them and attach evidence.</p>' : '') +
      '<p style="color:#999;font-size:11px;margin-top:24px">Sent from Checkpoint by Compliance365. You receive this because you are named as an owner.</p></div>';
  }

  /* ============================================================
     Certification body application
     ------------------------------------------------------------
     The answers a certification body's application form asks for
     (BSI PF142 and its equivalents), drawn from what the ISMS already
     records, so the application matches the ISMS the auditor will see.
     The ISO/IEC 27006-1 complexity factors set the audit time; each is
     rated from the organisation's own data with the reason, never
     rounded up "to be safe" (that only buys audit days) or down (the
     body re-rates at Stage 1 and re-quotes).
     d = { profile:{org* answers}, vendors, legal, audits, reviews, onboardedDate,
           readyDate, today, consultant }. */
  function certApplicationAnswers(d) {
    d = d || {};
    var p = d.profile || {}, today = d.today;
    var txt = function (k) { return String(p[k] || '').trim(); };
    var services = txt('orgServices').split(/\n|;|,(?![^(]*\))/).map(function (x) { return x.trim(); }).filter(Boolean);
    var software = /software|saas|platform|app|product/i.test(txt('orgServices') + ' ' + txt('orgScopeStatement'));
    var critical = (d.vendors || []).filter(function (v) { return v && (v.criticality === 'Critical' || v.criticality === 'High'); });
    var within = function (dt, days) { return dt && today && daysBetweenDateStr(String(dt).slice(0, 10), today) <= days; };
    var certified = function (v) { return /27001|soc ?2|iso|csa star|irap/i.test(v.certifications || ''); };
    var reviewed = function (v) { return within(v.lastReviewed, 365); };
    var applying = (d.legal || []).filter(function (l) { return l && l.applies === 'Yes'; });
    var ageDays = d.onboardedDate && today ? daysBetweenDateStr(String(d.onboardedDate).slice(0, 10), today) : 0;
    var regulatedIndustry = /bank|insur|financ|health|hospital|defen[cs]e|government|energy|utilit|telecom|critical infrastructure/i.test(txt('orgIndustry'));
    var availability = p.orgCustomerDemand === 'contract' || (software && p.orgDevelops && p.orgDevelops !== 'no') ? 2 : 1;

    var f = function (factor, level, options, why) { return { factor: factor, level: level, answer: options[level - 1], why: why }; };
    var factors = [
      f('Complexity of processes', services.length > 4 ? 2 : 1,
        ['Standard processes with standard and repetitive tasks, few products or services', 'Standard but non-repetitive processes, with high number of products or services', 'Complex processes, high number of products and services'],
        services.length ? services.length + ' product or service line(s) in scope' + (services.length > 4 ? '' : ': few products or services') : 'Products and services not yet recorded in the scope & context answers'),
      f('Type of business', regulatedIndustry ? 3 : (p.orgCustomerDemand === 'contract' || p.orgPersonalData === 'sensitive' || applying.length) ? 2 : 1,
        ['Non-critical / non-regulated', 'Critical business customers / some regulation', 'Critical business operation / highly regulated'],
        regulatedIndustry ? 'The organisation itself operates in a highly regulated sector' : (p.orgCustomerDemand === 'contract' || applying.length) ? 'Customers require security in contracts, or legal requirements apply, but the organisation is not itself a regulated operator' : 'No sector regulation or contractual security requirements recorded'),
      f('Information confidentiality', p.orgPersonalData === 'sensitive' ? 3 : p.orgPersonalData === 'customers' ? 2 : 1,
        ['Only little sensitive or confidential information or few critical assets', 'Some sensitive / confidential information or some critical assets', 'Higher amount of sensitive or confidential information or many critical assets'],
        p.orgPersonalData === 'sensitive' ? 'Sensitive personal information (health, financial) is held' : p.orgPersonalData === 'customers' ? 'Personal information about customers or the public is held, not sensitive categories' : 'Personal information only about staff'),
      f('Virtual organisation', p.orgWorkModel === 'remote' ? 1 : p.orgWorkModel === 'hybrid' ? 2 : 2,
        ['No employees assigned to an office, fully cloud-based, third parties manage employee PII and assets', 'Partially cloud-based, or a shared workspace with minimal infrastructure', 'Assets set up and managed by the organisation, or employee PII managed in-house'],
        p.orgWorkModel === 'remote' ? 'Fully remote and cloud-based' : 'People work from an office at least part of the time'),
      f('Previous knowledge of the organisation', 3,
        ['Certified with this body, same scope / integrated management system', 'Certified with this body, combined management system', 'No certification associated with the ISMS scope'],
        d.onboardedDate ? 'ISMS operating since ' + String(d.onboardedDate).slice(0, 10) + ' (' + Math.round(ageDays / 30) + ' months)' : 'First certification'),
      f('IT infrastructure complexity', p.orgCloud === 'iaas' ? 2 : 1,
        ['Few or highly standardised IT platforms, servers, operating systems, databases, networks', 'Several different IT platforms, servers, operating systems, databases, networks', 'Many different IT platforms, servers, operating systems, databases, networks'],
        p.orgCloud === 'iaas' ? 'Runs its own servers or databases in a cloud platform' : 'Managed cloud and SaaS services only: no servers, operating systems or networks of its own to run'),
      f('Availability requirements', availability,
        ['Low availability requirements', 'Higher availability requirements (disruption of business)', 'High availability requirements (non-stop operation, 24 x 7 contracts)'],
        availability === 2 ? 'Customers rely on the service; no contracted 24 x 7 availability recorded' : 'No customer-facing service availability requirement recorded'),
      f('Development', !p.orgDevelops || p.orgDevelops === 'no' ? 1 : software ? 3 : 2,
        ['No in-house system / application development', 'Some in-house or outsourced development for some important business purposes', 'Extensive in-house or outsourced development for important business purposes'],
        !p.orgDevelops || p.orgDevelops === 'no' ? 'No software development' : software ? 'Software is the product: development is core to the business' : 'Some development supports the business'),
      (function () {
        if (!(d.vendors || []).length) return f('Outsourcing and third parties', 3,
          ['Well-defined, managed and monitored outsourcing; outsourcers have a certified ISMS', 'Several partly managed outsourcing arrangements', 'High dependency, unknown extent, or unmanaged outsourcing'],
          'No suppliers recorded in the supplier register yet: record them before applying, or this reads as unknown');
        var bad = critical.filter(function (v) { return !(reviewed(v) && certified(v)); });
        var lvl = !bad.length ? 1 : bad.length < critical.length ? 2 : 2;
        return f('Outsourcing and third parties', lvl,
          ['Well-defined, managed and monitored outsourcing; outsourcers have a certified ISMS', 'Several partly managed outsourcing arrangements', 'High dependency, unknown extent, or unmanaged outsourcing'],
          !bad.length ? 'Every critical or high supplier is reviewed within 12 months and holds ISO 27001, SOC 2 or similar' : bad.length + ' critical or high supplier(s) not yet reviewed or without a recorded certification: ' + bad.map(function (v) { return v.name; }).join(', '));
      })(),
      f('Disaster recovery sites', availability > 1 ? 2 : 1,
        ['Low availability requirements and no or one alternative DR site', 'Medium or high availability requirements and no or one alternative DR site', 'High availability, several DR sites or data centres'],
        'Recovery relies on the cloud providers’ redundancy and backups; no DR sites of its own')
    ];

    var vendorsLine = (d.vendors || []).map(function (v) { return v.name + (v.service ? ' (' + v.service + ')' : '') + (v.certifications ? ', ' + v.certifications : ''); }).join('; ');
    var completedAudit = (d.audits || []).some(function (a) { return a.status === 'Completed' && within(a.completed, 365); });
    var review = (d.reviews || []).some(function (r) { return r.decisions && within(r.date, 365); });
    var answers = [
      { q: 'Company name to appear on the certificate', a: txt('orgLegalName'), src: 'Scope & context: legal name' },
      { q: 'Proposed scope statement', a: txt('orgScopeStatement'), src: 'Scope & context: scope statement (also the ISMS Scope document)' },
      { q: 'People in the scope of certification', a: txt('orgPeople'), src: 'Scope & context: people in scope. Count everyone who does work within the scope, including contractors' },
      { q: 'Locations in scope', a: txt('orgLocations'), src: 'Scope & context: locations in scope. List the head office even when staff work remotely' },
      { q: 'Outsourced activities and suppliers', a: vendorsLine, src: 'Supplier register' },
      { q: 'Specific legal or regulatory requirements applicable to the scope?', a: applying.length ? 'Yes: ' + applying.map(function (l) { return l.title; }).join('; ') : 'No applicable requirement recorded', src: 'Legal and regulatory register' },
      { q: 'How long have you been operating your ISMS?', a: d.onboardedDate ? 'Since ' + String(d.onboardedDate).slice(0, 10) : 'Implementation under way', src: 'Checkpoint set-up date' },
      { q: 'When are you planning the certification audit?', a: d.readyDate ? 'Stage 1 from ' + d.readyDate + ', Stage 2 once the internal audit and management review are complete' : '', src: 'Your path to certification (dated plan)' },
      { q: 'Has a consultancy been used?', a: d.consultant ? 'Yes: ' + d.consultant : '', src: 'Who supports the ISMS' }
    ];
    var warnings = [];
    answers.forEach(function (x) { if (!x.a) warnings.push('No answer recorded for: ' + x.q); });
    if (!applying.length) warnings.push('No legal or regulatory requirement is recorded as applying. Most organisations holding personal information have at least privacy law and customer contracts: check the legal register before answering "No".');
    if (!completedAudit || !review) warnings.push('Stage 2 needs a completed internal audit' + (review ? '' : ' and management review') + ' first: book Stage 2 after ' + (!completedAudit && !review ? 'both are' : 'it is') + ' done.');
    factors.forEach(function (x) { if (/not yet|No suppliers|not yet recorded/i.test(x.why)) warnings.push(x.factor + ': ' + x.why + '.'); });
    return { answers: answers, factors: factors, warnings: warnings };
  }

  /* Whether the organisation is ready to book Stage 1 and Stage 2.
     Stage 1 reviews the documented ISMS; Stage 2 audits it operating, so
     it needs a completed internal audit of Clauses 4-10 and a
     management review after it, with no major nonconformity open.
     d = { scopeStatement, md:[mandatoryDocumentation rows], risks, soa:{ applicable, notStarted, unjustified },
           audits, reviews, actions, onboardedDate, today }.
     Returns { stage1:{ ok, missing:[] }, stage2:{ ok, missing:[] }, advice:[] }. */
  function certificationBookingReadiness(d) {
    d = d || {};
    var today = d.today;
    var s1 = [], s2 = [], advice = [], checks = [];
    /* Every check, passed or not, with where to fix it: the gate
       checklist. blocking:false = advice the body will raise, not a bar. */
    var check = function (stage, label, ok, detail, fix, blocking) { checks.push({ stage: stage, label: label, ok: !!ok, detail: detail || '', fix: fix || null, blocking: blocking !== false }); };
    var scopeOk = !!String(d.scopeStatement || '').trim();
    if (!scopeOk) s1.push('the ISMS scope statement (scope & context questionnaire)');
    check(1, 'ISMS scope statement written', scopeOk, scopeOk ? '' : 'Answer the scope & context questionnaire', { action: 'App.orgProfileWizard', label: 'Answer it' });
    var docRows = (d.md || []).filter(function (m) { return /^\d/.test(m.ref) && m.status !== 'done'; });
    if (docRows.length) s1.push(docRows.length + ' Stage 1 checklist item(s): ' + docRows.map(function (m) { return m.ref + ' ' + m.item; }).join('; '));
    if ((d.md || []).length) check(1, 'Mandatory documented information in place', !docRows.length, docRows.length ? docRows.length + ' missing: ' + docRows.slice(0, 3).map(function (m) { return m.ref + ' ' + m.item; }).join('; ') + (docRows.length > 3 ? ' and more' : '') : '', { action: 'App.go', id: 'documents', label: 'Open documents' });
    var open = (d.risks || []).filter(function (r) { return r && r.status !== 'Closed' && r.type !== 'Opportunity'; });
    var untreated = open.filter(function (r) { return !(r.treat && r.owner); }).length;
    if (!open.length) s1.push('a risk assessment (no risks in the register)');
    else if (untreated) s1.push(untreated + ' risk(s) without a treatment or owner');
    check(1, 'Risks assessed, each with a treatment and an owner', open.length && !untreated, !open.length ? 'No risks in the register' : untreated ? untreated + ' without a treatment or owner' : open.length + ' risks', { action: 'App.go', id: 'risks', label: 'Open risks' });
    var soa = d.soa || {};
    if (!soa.applicable) s1.push('the Statement of Applicability');
    else if (soa.unjustified) s1.push(soa.unjustified + ' Statement of Applicability exclusion(s) without a justification');
    check(1, 'Statement of Applicability complete, exclusions justified', soa.applicable && !soa.unjustified, !soa.applicable ? 'Not started' : soa.unjustified ? soa.unjustified + ' exclusion(s) without a justification' : '', { action: 'App.go', id: 'soa', label: 'Open the SoA' });
    if (Array.isArray(d.clauseEvidenceWrong)) check(1, 'Clause evidence is the right kind and current', !d.clauseEvidenceWrong.length, d.clauseEvidenceWrong.length ? 'Clause' + (d.clauseEvidenceWrong.length === 1 ? ' ' : 's ') + d.clauseEvidenceWrong.join(', ') + ': a policy where a record is needed, a draft, or a record over a year old' : '', { action: 'App.go', id: 'clauses', label: 'Open clauses' }, false);
    if (typeof d.evidenceIssues === 'number') check(1, 'Evidence links checked and working', !d.evidenceIssues, d.evidenceIssues ? d.evidenceIssues + ' broken, missing or out-of-date link(s)' : '', { action: 'App.go', id: 'soa', label: 'See the issues' }, false);

    var within = function (dt) { return dt && today && daysBetweenDateStr(String(dt).slice(0, 10), today) <= 365; };
    var full = (d.audits || []).filter(function (a) {
      if (!a || a.status !== 'Completed' || !within(a.completed)) return false;
      return parseAuditScope(a.scope).clauses.length === 7;
    }).sort(function (a, b) { return String(b.completed).localeCompare(String(a.completed)); })[0];
    if (!full) s2.push('a completed internal audit of Clauses 4-10');
    check(2, 'Internal audit of Clauses 4 to 10 completed', !!full, full ? 'Completed ' + full.completed : 'Not in the last 12 months', { action: 'App.go', id: 'audits', label: 'Plan or run it' });
    var review = (d.reviews || []).filter(function (r) { return r && r.decisions && within(r.date) && (!full || r.date >= full.completed); })[0];
    if (!review) s2.push(full ? 'a management review held after the internal audit of ' + full.completed : 'a management review after the internal audit');
    check(2, 'Management review held after the internal audit', !!review, review ? 'Held ' + review.date : full ? 'None since the audit of ' + full.completed : 'Needs the internal audit first', { action: 'App.go', id: 'reviews', label: 'Open management review' });
    var majors = (d.actions || []).filter(function (a) { return a && a.type === 'Non-conformity (Major)' && a.status !== 'Done' && a.status !== 'Cancelled'; });
    if (majors.length) s2.push('closing ' + majors.length + ' open major nonconformit' + (majors.length === 1 ? 'y' : 'ies') + ' (' + majors.map(function (a) { return a.id; }).join(', ') + ')');
    check(2, 'No major nonconformity open', !majors.length, majors.length ? majors.map(function (a) { return a.id; }).join(', ') : '', { action: 'App.go', id: 'actions', label: 'Open actions' });
    if (soa.notStarted) s2.push(soa.notStarted + ' applicable control(s) still not started');
    check(2, 'Every applicable control at least in progress', !soa.notStarted, soa.notStarted ? soa.notStarted + ' not started' : '', { action: 'App.go', id: 'soa', label: 'Open the SoA' });
    var age = d.onboardedDate && today ? daysBetweenDateStr(String(d.onboardedDate).slice(0, 10), today) : null;
    if (age !== null && age < 90) advice.push('The ISMS has been running for ' + Math.max(0, Math.round(age / 30)) + ' month(s). Certification bodies expect records of it operating, typically about three months, before Stage 2.');
    if (age !== null) check(2, 'About three months of records of the ISMS operating', age >= 90, age >= 90 ? 'Running since ' + String(d.onboardedDate).slice(0, 10) : 'Running for ' + Math.max(0, Math.round(age / 30)) + ' month(s)', null, false);
    var stage2Missing = s1.concat(s2);
    return { stage1: { ok: !s1.length, missing: s1 }, stage2: { ok: !stage2Missing.length, missing: stage2Missing }, advice: advice, checks: checks };
  }

  /* Auditor access windows: the state of each, and whether the signed-in
     person is one of them. entries = [{ name, email, from, to, removed }]. */
  function auditorAccessState(entries, email, today) {
    var e = String(email || '').trim().toLowerCase();
    var list = (entries || []).map(function (a) {
      var st = a.removed ? 'removed' : (a.to && a.to < today) ? 'expired' : (a.from && a.from > today) ? 'upcoming' : 'active';
      return Object.assign({}, a, { state: st });
    });
    var mine = e ? list.filter(function (a) { return String(a.email || '').trim().toLowerCase() === e; })
      .sort(function (a, b) { return String(b.to || '').localeCompare(String(a.to || '')); })[0] || null : null;
    return { list: list, me: mine, overdueRemoval: list.filter(function (a) { return a.state === 'expired'; }) };
  }

  /* Keeping the certification scope proportionate: what to look at
     before submitting the scope statement. Pure advice, from the
     profile, so every client gets the same discipline. */
  function scopeAdvice(profile) {
    var p = profile || {}, out = [];
    var stmt = String(p.orgScopeStatement || '');
    if (/business operations|all (activities|operations)|entire|whole (company|organisation)/i.test(stmt)) out.push('The scope statement includes general business operations. Scope it to the products and services customers ask about; supporting functions stay in the ISMS as interfaces, not as certified activities.');
    if ((stmt.match(/,/g) || []).length > 5) out.push('The scope statement lists many activities. A certificate scope is one sentence about what you deliver; detail belongs in the ISMS Scope document.');
    if (p.orgDevelops === 'outsourced') out.push('A development company you engage is a supplier, controlled through supplier management (A.5.19-A.5.22, A.8.30); its staff are not counted. Individual contractors who work as part of your own team are counted as people in scope.');
    out.push('Count only people who do work within the scope. Directors and contractors who work on the product are in; a bookkeeper or a marketing contractor with no access to customer data can be left out.');
    out.push('Name the head office as the one location. Remote staff are covered by the remote working controls, not as separate sites.');
    out.push('Rate each complexity factor on the facts. Rounding up "to be safe" only adds audit days; the body re-rates at Stage 1 either way.');
    return out;
  }

  /* Opportunities (Clause 6.1.1) drawn from the scope & context
     answers, the counterpart of CONTEXT_RISKS. */
  var CONTEXT_OPPORTUNITIES = [
    { key: 'opp-certification', when: function () { return true; },
      why: function (p) { return p.orgCustomerDemand === 'contract' || p.orgCustomerDemand === 'often' ? 'You told us customers ask for evidence of your security.' : 'Applies to every organisation seeking certification.'; },
      opp: { title: 'Certification shortens customer security reviews and opens tenders that require it', cat: 'Market', benefit: 'Faster sales cycles and access to customers who require certification', L: 4, I: 4 } },
    { key: 'opp-questionnaires', when: function (p) { return p.orgCustomerDemand === 'often' || p.orgCustomerDemand === 'contract'; },
      why: function () { return 'You told us customers often ask for security evidence.'; },
      opp: { title: 'Reuse one evidence set to answer customer security questionnaires', cat: 'Efficiency', benefit: 'Less time answering questionnaires; consistent answers', L: 4, I: 3 } },
    { key: 'opp-consolidate', when: function (p) { return p.orgCloud === 'saas' || p.orgCloud === 'iaas' || p.orgItModel === 'internal' || p.orgItModel === 'mixed'; },
      why: function () { return 'Your Microsoft 365 licensing already includes security tools that may replace separate products.'; },
      opp: { title: 'Use the security features already in our Microsoft 365 licence to retire separate tools', cat: 'Technology', benefit: 'Lower cost and fewer systems to secure and monitor', L: 3, I: 3 } },
    { key: 'opp-automation', when: function () { return true; },
      why: function () { return 'Applies to every organisation running the management system in Checkpoint.'; },
      opp: { title: 'Automate evidence collection so the management system runs with little manual effort', cat: 'Efficiency', benefit: 'Audit-ready evidence all year rather than a scramble before each audit', L: 4, I: 3 } },
    { key: 'opp-ai', when: function (p) { return p.orgAiUse === 'tools' || p.orgAiUse === 'builds'; },
      why: function () { return 'You told us the organisation uses AI.'; },
      opp: { title: 'Adopt AI safely to improve productivity, with clear rules that customers can trust', cat: 'Technology', benefit: 'Productivity gains without data leakage, and a story customers trust', L: 3, I: 4 } },
    { key: 'opp-privacy-trust', when: function (p) { return p.orgPersonalData === 'customers' || p.orgPersonalData === 'sensitive'; },
      why: function () { return 'You told us you hold personal information about customers.'; },
      opp: { title: 'Show customers how we protect their personal information, as a point of difference', cat: 'Market', benefit: 'Customer trust and fewer privacy objections in sales', L: 3, I: 3 } },
    { key: 'opp-growth', when: function (p) { return p.orgChange === 'growing' || p.orgChange === 'major'; },
      why: function () { return 'You told us the organisation is changing.'; },
      opp: { title: 'Build security into new processes and systems while they are being set up, rather than retrofitting', cat: 'Organisation', benefit: 'Lower cost of security as the organisation grows', L: 3, I: 3 } }
  ];
  function contextOpportunitySuggestions(profile, opportunities) {
    var p = profile || {};
    var have = {};
    (opportunities || []).forEach(function (o) { if (o) { if (o.tpl) have[o.tpl] = true; if (o.title) have[String(o.title).trim().toLowerCase()] = true; } });
    return CONTEXT_OPPORTUNITIES.filter(function (c) { return c.when(p) && !have[c.key] && !have[c.opp.title.toLowerCase()]; })
      .map(function (c) { return { key: c.key, why: c.why(p), opp: c.opp }; });
  }

  /* Before certification there is no cycle to spread audits over, but
     Stage 2 expects one full internal audit and the management review
     that follows it: the management-system clauses, then Annex A,
     far enough ahead of Stage 2 for findings to be closed. */
  function addDaysIso(iso, days) {
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(d)) return '';
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function preCertificationAudits(today, fw, existing) {
    var fwLabel = fw === 'iso42001' ? 'Annex A (AI controls)' : 'Annex A (all themes)';
    var have = {};
    (existing || []).forEach(function (a) { if (a && a.scope) have[a.scope] = true; });
    return [
      { planned: addDaysIso(today, 30), scope: 'Clauses 4-10 (management system), pre-certification internal audit' },
      { planned: addDaysIso(today, 45), scope: fwLabel + ', pre-certification internal audit' }
    ].filter(function (p) { return !have[p.scope]; });
  }

  /* Whether a clause may be marked Implemented: every requirement met,
     and evidence linked to the clause itself. `reasons` says what is
     missing, in the order to fix it. */
  function clauseImplementGate(checklist, clause) {
    var reasons = [];
    var open = (checklist && checklist.items || []).filter(function (i) { return i.status !== 'met'; });
    if (open.length) reasons.push(open.length + ' of ' + checklist.total + ' requirement' + (checklist.total > 1 ? 's' : '') + ' not yet met');
    if (!(clause && clause.evidenceUrl)) reasons.push('no evidence linked to the clause');
    return { ok: reasons.length === 0, reasons: reasons, open: open };
  }

  /* Parses the Requirements column: { reqId: { by, date, note } }. */
  function parseClauseConfirmations(json) {
    if (!json) return {};
    if (typeof json === 'object') return json;
    try {
      var o = JSON.parse(json);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
  }

  /* ============================================================
     Unanswered profile fields in generated documents
     ------------------------------------------------------------
     A required scope & context answer left blank renders as a visible
     marker, never as generic wording that claims the work was done.
     A document still carrying a marker cannot be approved. */
  var PENDING_MARKER_PREFIX = '[To be completed: ';
  function pendingMarker(label) { return PENDING_MARKER_PREFIX + String(label || 'answer') + ']'; }
  function pendingMarkersIn(value) {
    var text;
    try { text = typeof value === 'string' ? value : JSON.stringify(value || ''); } catch (e) { text = ''; }
    var out = [], i = 0, start;
    while ((start = text.indexOf(PENDING_MARKER_PREFIX, i)) !== -1) {
      var end = text.indexOf(']', start);
      if (end === -1) break;
      var label = text.slice(start + PENDING_MARKER_PREFIX.length, end);
      if (out.indexOf(label) === -1) out.push(label);
      i = end + 1;
    }
    return out;
  }

  /* ============================================================
     Evidence folders — one SharePoint folder per applicable control
     and per clause, under Documents/Evidence/<framework>/, so the
     client can drop files where they already work (SharePoint, Teams,
     a synced OneDrive folder) and Checkpoint links them without anyone
     pasting a URL. These helpers are the pure half: naming, planning
     and the link rule. graph.js/store.js do the Graph calls.
     ============================================================ */
  var EVIDENCE_ROOT = 'Evidence';

  /* SharePoint rejects " * : < > ? / \ | in a name and misbehaves with
     # and % in URLs, leading/trailing spaces and trailing dots. Long
     control titles are cut so the full path stays well inside
     SharePoint's 400-character limit however deep the library sits. */
  function evidenceFolderSegment(s, max) {
    var out = String(s || '').replace(/["*:<>?\/\\|#%\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim();
    max = max || 80;
    if (out.length > max) out = out.slice(0, max).trim();
    return out.replace(/[.\s]+$/, '') || '-';
  }

  function evidenceFolderName(item, kind) {
    var code = evidenceFolderSegment(item.id, 40);
    var title = evidenceFolderSegment(item.t || '', 70);
    var base = title && title !== '-' ? code + ' ' + title : code;
    return kind === 'clause' ? 'Clause ' + base : base;
  }

  /* The inverse, and the only thing matching relies on: a folder is
     recognised by its CODE, never its full name, so a title that was
     reworded in a later release (or a folder a client renamed after
     the code) still maps to the same control. */
  function evidenceFolderCode(name) {
    var n = String(name || '').trim();
    var kind = 'control';
    if (/^clause\s+/i.test(n)) { kind = 'clause'; n = n.replace(/^clause\s+/i, ''); }
    var code = n.split(/\s+/)[0] || '';
    return code ? { kind: kind, code: code } : null;
  }

  function evidenceKey(kind, fw, id) { return kind + ':' + fw + '|' + id; }

  /* One entry per framework in scope: its folder name and the folders
     that should exist inside it — every APPLICABLE control (an
     excluded control needs a justification, not evidence) and every
     clause. frameworks is [{ fw, name }]. */
  function planEvidenceFolders(frameworks, controls, clauses) {
    return (frameworks || []).map(function (f) {
      var items = [];
      (controls || []).forEach(function (c) {
        if (c.fw !== f.fw || !c.app) return;
        items.push({ key: evidenceKey('control', c.fw, c.id), kind: 'control', fw: c.fw, id: c.id, name: evidenceFolderName(c, 'control') });
      });
      (clauses || []).forEach(function (c) {
        if ((c.fw || 'iso27001') !== f.fw) return;
        items.push({ key: evidenceKey('clause', f.fw, c.id), kind: 'clause', fw: f.fw, id: c.id, name: evidenceFolderName(c, 'clause') });
      });
      return { fw: f.fw, folder: evidenceFolderSegment(f.name || f.fw, 60), items: items };
    }).filter(function (p) { return p.items.length; });
  }

  /* Which planned folders already exist (matched by code) and which
     still need creating. existing is the framework folder's children:
     [{ name, id, webUrl, childCount }]. */
  function diffEvidenceFolders(planned, existing) {
    var byCode = {};
    (existing || []).forEach(function (e) {
      var p = evidenceFolderCode(e.name);
      if (!p) return;
      var k = p.kind + '|' + p.code;
      if (!byCode[k]) byCode[k] = e;
    });
    var found = [], missing = [];
    (planned || []).forEach(function (item) {
      var e = byCode[item.kind + '|' + item.id];
      if (e) found.push({ item: item, folder: e }); else missing.push(item);
    });
    return { found: found, missing: missing };
  }

  /* Summarises one folder's files. Folders inside it are ignored (a
     client may organise within it, but only files are evidence). */
  function evidenceFolderSummary(files) {
    var real = (files || []).filter(function (f) { return f && f.name && !f.folder; });
    var latest = real.reduce(function (m, f) { var d = String(f.lastModifiedDateTime || f.modified || '').slice(0, 10); return d > m ? d : m; }, '');
    return { count: real.length, latest: latest, names: real.map(function (f) { return f.name; }).slice(0, 5) };
  }

  /* The link rule, applied to controls and clauses alike: a record
     with files in its folder and no evidence link yet gets the folder
     linked. A link a person set, or scan evidence, is never replaced.
     "Not started" moves to "In progress" (a file is progress), never to
     "Implemented" — whether the evidence is sufficient is a human's
     call. folders maps evidenceKey -> { url, count }. */
  function evidenceFolderLinkUpdates(records, kind, folders) {
    var out = [];
    (records || []).forEach(function (r) {
      var f = folders && folders[evidenceKey(kind, r.fw || 'iso27001', r.id)];
      if (!f || !f.count || !f.url || r.evidenceUrl) return;
      if (kind === 'control' && !r.app) return;
      var set = { evidenceUrl: f.url };
      if (r.st === 'Not started') set.st = 'In progress';
      out.push({ record: r, set: set });
    });
    return out;
  }

  /* Freshness of a folder's newest file against the review cadence —
     an ISMS whose only evidence for a control is two years old is the
     finding an auditor writes up. */
  function evidenceFolderFreshness(latest, today, cadenceDays) {
    if (!latest) return { stale: false, ageDays: null };
    var age = Math.round((Date.parse(today) - Date.parse(latest)) / 86400000);
    var limit = parseInt(cadenceDays, 10) || 365;
    return { stale: age > limit, ageDays: age, validUntil: addDaysIso(String(latest).slice(0, 10), limit) };
  }
  /* How long a control's evidence stays current: the interval of the
     operating-rhythm activity that produces it (the organisation's own
     frequency on its calendar item, else the activity's default), plus
     a quarter of that interval to allow for the activity running a
     little late. Null when no activity covers the control: the review
     cadence then applies. */
  var EVIDENCE_FREQ_DAYS = { Weekly: 7, Monthly: 31, Quarterly: 92, Biannual: 183, 'Six-monthly': 183, Annual: 365, Annually: 365 };
  function evidenceValidity(controlId, calendar) {
    var best = null;
    OPERATING_RHYTHM.forEach(function (def) {
      if ((def.controls || []).indexOf(controlId) === -1) return;
      var item = (calendar || []).find(function (c) { return calendarItemLive(c) && rhythmDefFor(c) === def; });
      var freq = (item && EVIDENCE_FREQ_DAYS[item.freq]) ? item.freq : def.freq;
      var days = EVIDENCE_FREQ_DAYS[freq];
      if (!days) return;
      var total = days + Math.round(days / 4);
      if (!best || total < best.days) best = { days: total, freq: freq, activity: def.title };
    });
    return best;
  }
  /* ============================================================
     Setup health — is this tenant's Checkpoint set up the way it
     should be? Pure: app.js gathers the facts (lists and columns in
     SharePoint, granted permissions, activation, content packs,
     evidence folders, last scan) and this turns them into checks, each
     pass / warn / fail / info with a fix action where one exists. The
     same summary is what the tenant reports to the owner console, so
     the two can never disagree.
     A fact that could not be read (null) is 'info', never a guessed
     pass or fail.
     ============================================================ */
  var SETUP_CHECK_IDS = ['activation', 'permissions', 'lists', 'library', 'packs', 'evidence', 'scan', 'capabilities'];

  function setupHealthChecks(input, today) {
    input = input || {};
    var out = [];
    /* input.fmtDate (optional) formats an ISO date for display; the
       rules themselves always work on ISO strings. */
    var fd = typeof input.fmtDate === 'function' ? input.fmtDate : function (d) { return d; };
    function add(id, label, status, detail, fix) { out.push({ id: id, label: label, status: status, detail: detail, fix: fix || null }); }
    function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

    var a = input.activation;
    if (!a) add('activation', 'Activation', 'info', 'Not checked yet.');
    else if (a.status === 'expired') add('activation', 'Activation', 'fail', 'Expired' + (a.expiry ? ' on ' + fd(a.expiry) : '') + '. Checkpoint is read-only until a renewed activation is applied.', 'openActivation');
    else if (a.status === 'mismatch' || a.status === 'invalid' || a.status === 'none') add('activation', 'Activation', 'fail', 'No valid activation for this tenant.', 'openActivation');
    else if (a.status === 'grace') add('activation', 'Activation', 'warn', 'Expired' + (a.expiry ? ' on ' + fd(a.expiry) : '') + ' and in its grace period' + (a.graceUntil ? ' until ' + fd(a.graceUntil) : '') + '. Apply the renewed activation before then.', 'openActivation');
    else {
      var left = a.expiry && today ? daysBetweenDateStr(today, a.expiry) : null;
      if (left != null && left <= 30) add('activation', 'Activation', 'warn', 'Valid, but expires in ' + plural(left, 'day') + ' (' + fd(a.expiry) + ').', 'openActivation');
      else add('activation', 'Activation', 'pass', 'Valid' + (a.expiry ? ' until ' + fd(a.expiry) : '') + '.');
    }

    var p = input.permissions;
    if (!p || !Array.isArray(p.granted)) add('permissions', 'Microsoft Graph permissions', 'info', 'Could not read which permissions are granted in this session.');
    else {
      var have = {};
      p.granted.forEach(function (s) { have[String(s).toLowerCase()] = true; });
      var missing = (p.required || []).filter(function (s) { return !have[String(s).toLowerCase()]; });
      var missingOpt = (p.optional || []).filter(function (s) { return !have[String(s).toLowerCase()]; });
      var names = function (arr) { return arr.slice(0, 6).join(', ') + (arr.length > 6 ? ' and ' + (arr.length - 6) + ' more' : ''); };
      if (missing.length) add('permissions', 'Microsoft Graph permissions', 'fail', plural(missing.length, 'permission') + ' not granted: ' + names(missing) + '. A Global Administrator needs to grant admin consent again.', 'openAdminConsent');
      else if (missingOpt.length) add('permissions', 'Microsoft Graph permissions', 'warn', 'Not granted: ' + missingOpt.join(', ') + ' (needed only for sending email from Checkpoint).', 'openAdminConsent');
      else add('permissions', 'Microsoft Graph permissions', 'pass', 'All ' + ((p.required || []).length + (p.optional || []).length) + ' permissions granted.');
    }

    var l = input.lists;
    if (!l) add('lists', 'SharePoint lists', 'info', 'Not checked yet.');
    else if (l.error) add('lists', 'SharePoint lists', 'fail', 'Could not read the Checkpoint site: ' + l.error, 'repairSetup');
    else {
      var cols = (l.columnsMissing || []).reduce(function (n, x) { return n + (x.columns || []).length; }, 0);
      if ((l.missing || []).length || cols) {
        var bits = [];
        if (l.missing.length) bits.push(plural(l.missing.length, 'list') + ' missing (' + l.missing.slice(0, 4).join(', ') + (l.missing.length > 4 ? ', …' : '') + ')');
        if (cols) bits.push(plural(cols, 'column') + ' missing across ' + plural(l.columnsMissing.length, 'list'));
        add('lists', 'SharePoint lists', 'fail', bits.join('; ') + '. Saving to these registers can fail until repaired.', 'repairSetup');
      } else add('lists', 'SharePoint lists', 'pass', 'All ' + (l.total || 0) + ' lists present with every column.');
    }

    var lib = input.library;
    if (!lib) add('library', 'Documents library', 'info', 'Not checked yet.');
    else if (!lib.present) add('library', 'Documents library', 'fail', 'The Checkpoint Documents library is missing, so documents and evidence cannot be stored.', 'repairSetup');
    else if (!lib.driveReady) add('library', 'Documents library', 'warn', 'The library exists but its storage was not ready this session. It usually is on the next load.', 'repairSetup');
    else if ((lib.columnsMissing || []).length) add('library', 'Documents library', 'warn', plural(lib.columnsMissing.length, 'document-control column') + ' missing (' + lib.columnsMissing.slice(0, 4).join(', ') + ').', 'repairSetup');
    else add('library', 'Documents library', 'pass', 'Present, with the document-control columns.');

    var k = input.packs;
    if (!k) add('packs', 'Framework content', 'info', 'Not checked yet.');
    else {
      var failed = Object.keys(k.errors || {});
      if (failed.length) add('packs', 'Framework content', 'fail', 'Could not load: ' + failed.map(function (m) { return m + ' (' + k.errors[m] + ')'; }).join('; ') + '. Those frameworks are unavailable until this is fixed. Contact Compliance365.');
      else add('packs', 'Framework content', 'pass', (k.licensed || []).length ? 'All ' + plural(k.licensed.length, 'licensed framework') + ' loaded.' : 'ISO 27001 only, no premium frameworks licensed.');
    }

    var e = input.evidence;
    if (!e || !e.checked) add('evidence', 'Evidence folders', 'info', e && e.busy ? 'Checking…' : 'Not checked yet this session.', 'syncEvidenceFolders');
    else if ((e.errors || []).length) add('evidence', 'Evidence folders', 'warn', 'Some folders could not be read or created: ' + e.errors.join('; '), 'syncEvidenceFolders');
    else if (e.planned > e.found) add('evidence', 'Evidence folders', 'warn', plural(e.planned - e.found, 'folder') + ' not created yet (a read-only session cannot create them).', 'syncEvidenceFolders');
    else add('evidence', 'Evidence folders', 'pass', plural(e.found, 'folder') + ' in place, one per applicable control and clause.');

    var s = input.scan;
    if (!s) add('scan', 'Posture scan', 'info', 'Not checked yet.');
    else if (!s.lastDate) add('scan', 'Posture scan', 'warn', 'No posture scan has been run yet.', 'runScan');
    else {
      var cadence = parseInt(s.cadenceDays, 10) || 30;
      var age = today ? daysBetweenDateStr(s.lastDate, today) : 0;
      if (age > cadence) add('scan', 'Posture scan', 'warn', 'Last scan ' + fd(s.lastDate) + ', ' + plural(age, 'day') + ' ago, longer than the ' + cadence + '-day cadence.', 'runScan');
      else add('scan', 'Posture scan', 'pass', 'Last scan ' + fd(s.lastDate) + '.');
    }

    var c = input.capabilities;
    if (!c) add('capabilities', 'Microsoft 365 capabilities', 'info', 'Not checked yet.');
    else if ((c.unavailable || []).length) add('capabilities', 'Microsoft 365 capabilities', 'info', plural(c.unavailable.length, 'area') + ' not available in this tenant\'s licensing (' + c.unavailable.slice(0, 4).join(', ') + (c.unavailable.length > 4 ? ', …' : '') + '). Checks there are marked manual, not failed.');
    else add('capabilities', 'Microsoft 365 capabilities', 'pass', 'Every capability area is available.');

    return out;
  }

  /* One status for the whole setup plus a flag per check — the only
     part that leaves the tenant (see app.js reportSetupHealth()). */
  function setupHealthSummary(checks) {
    var fail = (checks || []).filter(function (c) { return c.status === 'fail'; });
    var warn = (checks || []).filter(function (c) { return c.status === 'warn'; });
    var flags = {};
    (checks || []).forEach(function (c) { flags[c.id] = c.status; });
    return {
      status: fail.length ? 'failing' : warn.length ? 'warning' : 'healthy',
      failing: fail.length, warnings: warn.length, flags: flags,
      headline: fail.length ? fail.map(function (c) { return c.label; }).join(', ')
        : warn.length ? warn.map(function (c) { return c.label; }).join(', ') : 'Healthy'
    };
  }

  /* The latest setup-health report for one owner-console roster row.
     The roster may hold a tenant as its GUID or as a domain (either is
     accepted when adding a client), and reports always carry the GUID
     plus the tenant's verified domains, so either matches. */
  /* Site discovery for a browser that has never opened this tenant's
     Checkpoint before. The site a client chose in the wizard is only
     remembered in the browser that ran the wizard, so a second computer
     (or a colleague) used to fall back to the root site, find nothing,
     and walk the wizard again, asking for the licence as it went.
     Microsoft Search returns lists matching the Settings list's name;
     this turns those hits into server-relative site paths ('/sites/x',
     or 'root' for the tenant root site), keeping only exact name
     matches on the tenant's own host, de-duplicated in order. */
  function sitePathsFromSearchHits(hits, listDisplayName, host) {
    var want = String(listDisplayName || '').toLowerCase();
    var out = [];
    (hits || []).forEach(function (h) {
      var r = (h && (h.resource || h)) || {};
      var name = String(r.displayName || r.name || '').toLowerCase();
      if (!want || name !== want) return;
      var m = /^https:\/\/([^\/]+)(\/.*)?$/i.exec(String(r.webUrl || ''));
      if (!m) return;
      if (host && m[1].toLowerCase() !== String(host).toLowerCase()) return;
      var path = decodeURIComponent(m[2] || '/');
      var at = path.search(/\/lists\//i);
      var site = at === -1 ? null : path.slice(0, at);
      if (site === null) return;
      var p = site === '' ? 'root' : site;
      if (out.indexOf(p) === -1) out.push(p);
    });
    return out;
  }

  /* The progress snapshot a client's Checkpoint saves to its own
     Settings list (key 'progressSnapshot') for the owner console's Sync
     to read. Setup health says whether the app works; this says how far
     the client has got: the path to certification, the management
     system clauses (4-10) and the Annex A controls as two separate
     measures, documents, the registers, and the scope statement so the
     partner can review it. Built from what the client's own dashboard
     shows, so the two always agree. Counts and short labels only, plus
     the scope statement, capped. */
  /* Clause (4-10) readiness: the share of clause requirements met,
     from each clause's checklist ({met, total}). The management-system
     counterpart of readinessPct(), which measures Annex A controls; the
     two are shown side by side because an auditor tests them apart
     (the clauses mostly at stage 1, the controls operating at stage 2).
     Same rounding rule: 100 only when every requirement is met. */
  function clauseReadiness(rows) {
    var met = 0, total = 0;
    (rows || []).forEach(function (r) { met += (r && r.met) || 0; total += (r && r.total) || 0; });
    var pct = !total ? 0 : met === total ? 100 : Math.min(99, Math.round(met / total * 100));
    return { met: met, total: total, pct: pct };
  }

  var PROGRESS_SNAPSHOT_VERSION = 1;
  function buildProgressSnapshot(s) {
    s = s || {};
    var steps = s.pathSteps || [];
    var next = steps.filter(function (x) { return !x.done; })[0] || null;
    var phases = [];
    steps.forEach(function (x) {
      var ph = phases.filter(function (p) { return p.phase === x.phase; })[0];
      if (!ph) { ph = { phase: x.phase, done: 0, total: 0 }; phases.push(ph); }
      ph.total++; if (x.done) ph.done++;
    });
    var clauses = {};
    Object.keys(s.clausesByFw || {}).forEach(function (fw) {
      var rows = s.clausesByFw[fw] || [];
      clauses[fw] = {
        clauses: rows.length,
        implemented: rows.filter(function (r) { return r.status === 'Implemented'; }).length,
        complete: rows.filter(function (r) { return r.total > 0 && r.met === r.total; }).length,
        reqMet: rows.reduce(function (n, r) { return n + (r.met || 0); }, 0),
        reqTotal: rows.reduce(function (n, r) { return n + (r.total || 0); }, 0),
        pct: clauseReadiness(rows).pct
      };
    });
    var annexA = {};
    Object.keys(s.controlsByFw || {}).forEach(function (fw) {
      var app = (s.controlsByFw[fw] || []).filter(function (c) { return c && c.app; });
      var impl = app.filter(function (c) { return c.st === 'Implemented'; }).length;
      var notStarted = app.filter(function (c) { return !c.st || c.st === 'Not started'; }).length;
      annexA[fw] = { applicable: app.length, implemented: impl, inProgress: app.length - impl - notStarted, notStarted: notStarted, pct: readinessPct(app) };
    });
    var docs = s.docs || [];
    var today = s.today || '';
    var actions = s.actions || [];
    var assets = s.assets || {};
    return {
      v: PROGRESS_SNAPSHOT_VERSION,
      path: { done: steps.filter(function (x) { return x.done; }).length, total: steps.length, next: next ? { label: next.label, phase: next.phase } : null, phases: phases },
      clauses: clauses,
      annexA: annexA,
      docs: { generated: docs.length, approved: docs.filter(function (d) { return d.status === 'Approved'; }).length },
      registers: {
        assets: assets.total || 0, assetsNoOwner: assets.noOwner || 0,
        openRisks: (s.risks || []).filter(function (r) { return r && r.status !== 'Closed'; }).length,
        overdueActions: actions.filter(function (a) { return a && a.status !== 'Done' && a.status !== 'Cancelled' && a.due && today && a.due < today; }).length
      },
      scope: { statement: String(s.scopeStatement || '').slice(0, 2000) },
      /* Delivery: what the partner console needs to see where a client is
         against plan. Counts and dates only. */
      delivery: s.delivery ? {
        plan: s.delivery.plan || null,
        bookings: s.delivery.bookings || {},
        certs: s.delivery.certs || {},
        objectives: { total: (s.delivery.objectives || []).length, atRisk: (s.delivery.objectives || []).filter(function (o) { return o && (o.status === 'At risk' || o.status === 'Missed'); }).length },
        ownersOverdue: s.delivery.ownersOverdue || 0,
        lastActivity: s.delivery.lastActivity || '',
        aiUse: s.delivery.aiUse || '',
        stage1Ready: !!s.delivery.stage1Ready, stage2Ready: !!s.delivery.stage2Ready,
        auditorOverdue: s.delivery.auditorOverdue || 0,
        health: s.delivery.health ? { score: s.delivery.health.score, band: s.delivery.health.band, factors: (s.delivery.health.factors || []).slice(0, 4) } : null
      } : null
    };
  }
  /* ============================================================
     Partner console: delivery across the portfolio
     ------------------------------------------------------------
     Each sync's headline numbers are kept (capped) so the console can
     show a client's trend and the date progress last moved. */
  function progressHeadline(p) {
    if (!p || !p.path) return null;
    var first = function (o) { var k = Object.keys(o || {}); return k.indexOf('iso27001') !== -1 ? o.iso27001 : (k.length ? o[k[0]] : null); };
    var cl = first(p.clauses), an = first(p.annexA);
    return {
      path: p.path.total ? Math.round(p.path.done / p.path.total * 100) : 0,
      clauses: cl && typeof cl.pct === 'number' ? cl.pct : null,
      annexA: an && typeof an.pct === 'number' ? an.pct : null
    };
  }
  /* history = [{ d, path, clauses, annexA }], oldest first. Returns
     { history, changedAt }: a new point only when a headline number
     moved (or the first sync), at most 26 points. */
  function mergeProgressHistory(history, snap, today) {
    var h = (history || []).slice();
    var head = progressHeadline(snap);
    if (head) {
      var last = h[h.length - 1];
      var same = last && last.path === head.path && last.clauses === head.clauses && last.annexA === head.annexA;
      if (!same) h.push({ d: today, path: head.path, clauses: head.clauses, annexA: head.annexA });
    }
    if (h.length > 26) h = h.slice(h.length - 26);
    return { history: h, changedAt: h.length ? h[h.length - 1].d : '' };
  }
  /* Where a client is: Certified, or the phase of their next step. */
  function clientStage(p) {
    var d = p && p.delivery;
    if (d && d.certs && Object.keys(d.certs).some(function (k) { return d.certs[k] && d.certs[k].issued; })) return 'Certified';
    if (!p || !p.path) return 'Not started';
    if (p.path.next) return p.path.next.phase;
    return p.path.total ? 'Ready to certify' : 'Not started';
  }
  /* What needs the partner's attention for one client. c = { name, modules,
     progress, progressHistory, lastSynced }. Returns [{ level:'red'|'amber'|'info', key, text }]. */
  function clientAttentionFlags(c, today) {
    c = c || {};
    var out = [];
    var p = c.progress, d = p && p.delivery;
    var days = function (from) { return from ? daysBetweenDateStr(String(from).slice(0, 10), today) : null; };
    var stage = clientStage(p);
    var hist = c.progressHistory || [];
    var moved = hist.length ? hist[hist.length - 1].d : '';
    var syncAge = days(c.lastSynced);
    if (syncAge === null) out.push({ level: 'amber', key: 'nosync', text: 'Never synced' });
    else if (syncAge > 14) out.push({ level: 'amber', key: 'stale-sync', text: 'Not synced for ' + syncAge + ' days' });
    if (p && stage !== 'Certified') {
      var still = days(moved);
      if (still !== null && still > 14) out.push({ level: still > 30 ? 'red' : 'amber', key: 'stalled', text: 'No progress for ' + still + ' days' });
      var act = d && days(d.lastActivity);
      if (act !== null && act > 14) out.push({ level: 'amber', key: 'inactive', text: 'Nobody has worked in Checkpoint for ' + act + ' days' });
    }
    if (d && d.health && typeof d.health.score === 'number' && d.health.score < 60) out.push({ level: d.health.score < 40 ? 'red' : 'amber', key: 'health', text: 'ISMS health ' + d.health.score + '/100' + (d.health.factors && d.health.factors[0] ? ': ' + d.health.factors[0].label : '') });
    if (d && d.plan && d.plan.behind) out.push({ level: d.plan.behind > 3 ? 'red' : 'amber', key: 'behind', text: d.plan.behind + ' step(s) behind plan (week ' + d.plan.week + ')' });
    if (stage !== 'Certified' && d && d.plan && d.plan.target && d.plan.atRisk) out.push({ level: 'red', key: 'target', text: 'Stage 1 target ' + d.plan.target + ' at risk' + (d.plan.milestonesLate && d.plan.milestonesLate.length ? ': ' + d.plan.milestonesLate.join(', ') + ' late' : '') });
    if (stage !== 'Certified' && d && d.bookings && d.bookings.stage2 && !d.stage2Ready && -days(d.bookings.stage2) >= 0) {
      var to = -days(d.bookings.stage2);
      out.push({ level: to <= 30 ? 'red' : 'amber', key: 'stage2', text: 'Stage 2 booked for ' + d.bookings.stage2 + ' but not yet ready' });
    }
    if (stage !== 'Certified' && d && d.bookings && d.bookings.stage1 && !d.stage1Ready && -days(d.bookings.stage1) >= 0 && -days(d.bookings.stage1) <= 30) out.push({ level: 'red', key: 'stage1', text: 'Stage 1 on ' + d.bookings.stage1 + ' and the documented ISMS is not complete' });
    Object.keys((d && d.certs) || {}).forEach(function (fw) {
      var ce = d.certs[fw];
      if (!ce || !ce.issued) return;
      var exp = ce.expires ? -days(ce.expires) : null;
      if (exp !== null && exp <= 120 && !ce.booked) out.push({ level: exp <= 60 ? 'red' : 'amber', key: 'expiry-' + fw, text: fw.toUpperCase().replace('ISO', 'ISO ') + ' certificate expires ' + ce.expires + ': recertification not booked' });
      var nd = ce.nextDue ? -days(ce.nextDue) : null;
      if (nd !== null && nd < 0) out.push({ level: 'red', key: 'overdue-' + fw, text: (ce.nextAudit || 'Certification audit') + ' overdue' });
    });
    if (p && p.registers && p.registers.overdueActions > 5) out.push({ level: 'amber', key: 'actions', text: p.registers.overdueActions + ' overdue actions' });
    if (d && d.objectives && d.objectives.atRisk) out.push({ level: 'amber', key: 'objectives', text: d.objectives.atRisk + ' objective(s) at risk' });
    if (d && d.auditorOverdue) out.push({ level: 'red', key: 'auditor', text: 'Auditor access window ended but not removed' });
    var mods = c.modules || [];
    if (stage === 'Certified' && d && d.certs && d.certs.iso27001 && d.certs.iso27001.issued && mods.indexOf('iso42001') === -1 && (d.aiUse === 'tools' || d.aiUse === 'builds')) {
      out.push({ level: 'info', key: 'iso42001', text: 'Certified to ISO 27001 and ' + (d.aiUse === 'builds' ? 'builds AI into its products' : 'uses AI tools') + ': ready for an ISO 42001 conversation' });
    }
    return out;
  }
  /* A short, plain-English progress note for the client, for the partner
     to review and send. No upsell, nothing internal. */
  function clientStatusNote(c, today) {
    c = c || {};
    var p = c.progress;
    var name = c.contactName ? String(c.contactName).split(' ')[0] : 'there';
    if (!p) return 'Hi ' + name + ',\n\nWe have not yet received progress from Checkpoint. Could someone open Checkpoint this week so we can see where things stand?\n\nKind regards,';
    var d = p.delivery || {};
    var stage = clientStage(p);
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var dt = function (iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1] : (iso || ''); };
    var lines = ['Hi ' + name + ',', '', 'Here is where ' + (c.name || 'your organisation') + ' is up to with certification.', ''];
    if (stage === 'Certified') lines.push('You are certified. ' + Object.keys(d.certs || {}).filter(function (k) { return d.certs[k] && d.certs[k].issued; }).map(function (k) { var ce = d.certs[k]; return (ce.nextAudit ? 'The next audit is the ' + ce.nextAudit.toLowerCase() + (ce.nextDue ? ', due by ' + dt(ce.nextDue) : '') : 'The certificate runs until ' + dt(ce.expires)) + '.'; }).join(' '));
    else lines.push('Progress: ' + p.path.done + ' of ' + p.path.total + ' steps on the path to certification are done.' + (d.plan && d.plan.readyBy ? ' On the current plan you will be ready for Stage 1 by ' + dt(d.plan.readyBy) + '.' : ''));
    var cl = p.clauses && (p.clauses.iso27001 || p.clauses[Object.keys(p.clauses)[0]]);
    var an = p.annexA && (p.annexA.iso27001 || p.annexA[Object.keys(p.annexA)[0]]);
    if (cl || an) lines.push('Management system (Clauses 4-10): ' + (cl ? cl.pct + '%' : 'n/a') + '. Controls (Annex A): ' + (an ? an.implemented + ' of ' + an.applicable + ' in place' : 'n/a') + '.');
    if (d.bookings && (d.bookings.stage1 || d.bookings.stage2)) lines.push('Audits booked: ' + [d.bookings.stage1 ? 'Stage 1 on ' + dt(d.bookings.stage1) : '', d.bookings.stage2 ? 'Stage 2 on ' + dt(d.bookings.stage2) : ''].filter(Boolean).join(', ') + '.');
    lines.push('');
    var todo = [];
    if (p.path.next && stage !== 'Certified') todo.push(p.path.next.label);
    if (d.plan && d.plan.behind) todo.push('catch up on ' + d.plan.behind + ' step(s) that are behind plan');
    if (p.registers && p.registers.overdueActions) todo.push('close the ' + p.registers.overdueActions + ' overdue action(s)');
    if (d.ownersOverdue) todo.push(d.ownersOverdue + ' person(s) have overdue tasks: they can see them under My tasks');
    if (d.objectives && d.objectives.atRisk) todo.push('look at the ' + d.objectives.atRisk + ' objective(s) at risk');
    if (todo.length) { lines.push('Over the next fortnight:'); todo.forEach(function (t) { lines.push('- ' + t.charAt(0).toUpperCase() + t.slice(1)); }); }
    else lines.push('Nothing is outstanding right now. Keep the scheduled activities going and we will check in again soon.');
    lines.push('', 'Everything is in Checkpoint, and each person can see their own tasks under My tasks. Happy to talk any of it through.', '', 'Kind regards,');
    return lines.join('\n');
  }

  /* Parses a stored snapshot defensively: a missing, malformed or
     newer-than-understood value reads as null, never throws. */
  function parseProgressSnapshot(raw) {
    if (!raw) return null;
    try {
      var o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return o && typeof o === 'object' && o.v === PROGRESS_SNAPSHOT_VERSION && o.path ? o : null;
    } catch (e) { return null; }
  }

  /* Free-text questionnaire answers go straight into approved
     documents, so stray punctuation left when an answer was edited
     ("Canada.," or "Australia ." or doubled spaces) is tidied before it
     is written into one. Wording is never changed. */
  function tidyProfileAnswer(v) {
    return String(v || '').trim()
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/\.\s*,/g, ',')
      .replace(/,\s*\./g, '.')
      .replace(/([,;])\1+/g, '$1')
      .replace(/\.{2,}/g, '.');
  }

  /* Checks the ISMS scope answers for the contradictions an auditor
     picks up at stage 1. Not blocking: each is a question to answer
     before approving, shown with an "approve anyway" option, because
     some have legitimate answers the check cannot see. */
  function scopeProfileWarnings(p) {
    p = p || {};
    var out = [];
    var t = function (k) { return String(p[k] || '').trim(); };
    var units = t('orgBusinessUnits'), excl = t('orgExclusions'), stmt = t('orgScopeStatement'), legal = t('orgLegalName'), people = t('orgPeople');
    var noExclusions = !excl || /^(none|nothing|n\/?a|nil)\b/i.test(excl);
    if (units && noExclusions && !/\b(all|entire|whole|every)\b/i.test(units)) {
      out.push('Business units lists only some teams, but nothing is excluded. List every function (leadership, sales, finance and so on), or add the others to Exclusions with a reason.');
    }
    if (stmt && legal) {
      var core = legal.replace(/\(.*?\)/g, '').replace(/\b(pty|ltd|limited|inc|llc|plc|pte)\b\.?/gi, '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/)[0] || '';
      if (core && stmt.toLowerCase().indexOf(core.toLowerCase()) === -1) out.push('The scope statement does not name the organisation (' + legal + '). The statement is what a certificate prints, so it should.');
    }
    if (stmt && /(\.\s*,|,\s*\.|\s[,.;]|\.\s+and\b)/i.test(stmt)) out.push('The scope statement has stray punctuation. It will be printed on the certificate, so make it one clean sentence.');
    var mentionsContractors = ['orgBusinessUnits', 'orgLocations', 'orgScopeStatement', 'orgPeople', 'orgServices'].some(function (k) { return /contractor|outsourc|offshore/i.test(t(k)); });
    if (mentionsContractors && !/(personnel|supplier|company[- ]issued|our (accounts|devices|policies)|under (our|the organisation)|excluded)/i.test(people)) {
      out.push('Contractors are mentioned, but People in scope does not say how they are treated: in scope as personnel, or managed as suppliers.');
    }
    if (t('orgInterfaces') && !/[A-Z][a-z]+/.test(t('orgInterfaces').replace(/^[A-Z]/, ''))) {
      out.push('Interfaces and dependencies do not name any provider. Name each one (hosting, AI services, code repositories, Microsoft 365, key suppliers).');
    }
    return out;
  }

  /* Controls whose requirement IS an approved document, so approving
     the document implements them. Deliberately short: for most controls
     a policy states intent and an auditor tests whether the control
     operates (an approved Cryptography Policy is not encrypted devices),
     so those stay In progress until scan or operating evidence shows
     them working. These are the exceptions:
       A.5.1  policies defined, approved and published (27701 A.3.3)
       A.5.2  roles and responsibilities defined and allocated (A.3.4)
       A.5.10 rules for acceptable use documented
       A.5.24 incident management planned and prepared (A.3.11)
       AI.2.2 AI policy, AI.2.3 its alignment with other policies,
       AI.3.2 AI roles and responsibilities (ISO 42001). */
  var DOCUMENT_IMPLEMENTED_CONTROLS = {
    'infosec-policy': ['A.5.1', 'A.3.3'],
    'roles-responsibilities': ['A.5.2', 'A.3.4'],
    'acceptable-use-policy': ['A.5.10'],
    'incident-response-plan': ['A.5.24', 'A.3.11'],
    'ai-policy': ['AI.2.2', 'AI.2.3', 'AI.3.2']
  };
  /* The applicable controls an approved document implements that are
     not already Implemented. A control holding different evidence is
     left alone: someone chose that evidence on purpose. */
  /* An organisation's own document, uploaded as its version of a
     Checkpoint document (doc.origin 'own', doc.tplId the template it
     replaces). Once it is approved, the generated copy of the same
     template should drop out of the live register, and any control or
     clause still pointing at that copy as evidence should point at the
     organisation's own document instead. Returns what to change:
       supersede  generated documents with the same template id that are
                  not already Superseded
       repoint    { kind: 'control'|'clause', item } whose evidenceUrl is
                  one of those documents' urls
     Pure: the caller writes the changes. */
  function ownDocumentReplacement(ownDoc, docs, controls, clauses) {
    var out = { supersede: [], repoint: [] };
    if (!ownDoc || ownDoc.origin !== 'own' || !ownDoc.tplId) return out;
    out.supersede = (docs || []).filter(function (d) {
      return d && d !== ownDoc && d.id !== ownDoc.id && d.tplId === ownDoc.tplId &&
        d.origin !== 'own' && String(d.status || '') !== 'Superseded';
    });
    var urls = {};
    out.supersede.forEach(function (d) { if (d.url) urls[d.url] = true; });
    (controls || []).forEach(function (c) { if (c && c.evidenceUrl && urls[c.evidenceUrl]) out.repoint.push({ kind: 'control', item: c }); });
    (clauses || []).forEach(function (c) { if (c && c.evidenceUrl && urls[c.evidenceUrl]) out.repoint.push({ kind: 'clause', item: c }); });
    return out;
  }

  function controlsImplementedByDocument(tplId, controls, docUrl) {
    var codes = DOCUMENT_IMPLEMENTED_CONTROLS[tplId] || [];
    return (controls || []).filter(function (c) {
      return c && codes.indexOf(c.id) !== -1 && c.app !== false && c.st !== 'Implemented' && c.st !== 'Not applicable' &&
        (!c.evidenceUrl || !docUrl || c.evidenceUrl === docUrl);
    });
  }

  function matchHealthReport(client, reports) {
    var id = String((client && client.tenantId) || '').trim().toLowerCase();
    if (!id) return null;
    var best = null;
    (reports || []).forEach(function (r) {
      var hit = String(r.tenantId || '').toLowerCase() === id ||
        (r.domains || []).some(function (d) { return String(d).toLowerCase() === id; });
      if (hit && (!best || String(r.reportedAt || '') > String(best.reportedAt || ''))) best = r;
    });
    return best;
  }

  /* Graph permissions granted to a delegated access token, from its
     scp claim. Returns null for anything that is not a readable JWT. */
  function scopesFromAccessToken(token) {
    try {
      var part = String(token || '').split('.')[1];
      if (!part) return null;
      part = part.replace(/-/g, '+').replace(/_/g, '/');
      while (part.length % 4) part += '=';
      var json = typeof atob === 'function' ? atob(part) : Buffer.from(part, 'base64').toString('binary');
      var claims = JSON.parse(json);
      return typeof claims.scp === 'string' ? claims.scp.split(' ').filter(Boolean) : null;
    } catch (e) { return null; }
  }

  /* The scopes MSAL actually asks Entra for. Microsoft Graph permissions
     (bare names such as 'Sites.Manage.All') become Graph's '.default':
     "whatever this organisation's admin has already approved". Listing
     the permissions one by one made Entra re-evaluate consent at every
     sign-in, and for an app it flags as risky it showed the full
     consent screen each time even though admin consent was already
     granted. With '.default' a granted tenant is never prompted; a
     permission the admin has not approved is reported by Setup health
     instead of a consent prompt. Other resources (Azure OpenAI, our
     signing endpoint) are passed through unchanged. */
  var GRAPH_DEFAULT_SCOPE = 'https://graph.microsoft.com/.default';
  function graphTokenScopes(scopes) {
    var list = (scopes || []).filter(Boolean);
    if (!list.length) return [GRAPH_DEFAULT_SCOPE];
    var allGraph = list.every(function (s) { return !/[:\/]/.test(String(s)); });
    return allGraph ? [GRAPH_DEFAULT_SCOPE] : list;
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
  /* The path to certification as a dated plan: the days after the start
     of the engagement by which each step should be done. The first 30
     days set up, document and assess; operating, checking and booking
     follow, so a typical organisation is ready for Stage 1 in about 90
     days. */
  var ONBOARDING_DAYS = { scope: 3, scan: 3, docs: 7, approve: 14, risks: 14, assets: 21, legal: 21, training: 21, rhythm: 21,
    soa: 30, objectives: 30, suppliers: 30, ai: 30, audit: 60, review: 75, clauses: 80, mandatory: 85, book: 90 };
  /* steps from certificationPathSteps(); start = the engagement start
     (ISO date). Returns { week, weekStart, weekEnd, steps:[step + { target, late }],
     thisWeek:[], behind:[] }: behind = not done and past its target. */
  /* target (optional) = the Stage 1 date the client is aiming for. The
     standard 90-day plan is stretched or compressed to end on it, so
     every step's date is worked back from the date that matters. */
  function onboardingSchedule(steps, start, today, target) {
    var addD = function (iso, n) { var d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    var begin = start || today;
    var elapsed = Math.max(0, daysBetweenDateStr(begin, today));
    var week = Math.floor(elapsed / 7) + 1;
    var weekStart = addD(begin, (week - 1) * 7), weekEnd = addD(begin, week * 7 - 1);
    var span = /^\d{4}-\d{2}-\d{2}/.test(String(target || '')) ? daysBetweenDateStr(begin, String(target).slice(0, 10)) : 0;
    var scale = span > 0 ? span / 90 : 1;
    var out = (steps || []).map(function (st) {
      var target = addD(begin, Math.round((ONBOARDING_DAYS[st.id] != null ? ONBOARDING_DAYS[st.id] : 90) * scale));
      return Object.assign({}, st, { target: target, late: !st.done && target < today });
    }).sort(function (a, b) { return a.target.localeCompare(b.target); });
    return {
      week: week, weekStart: weekStart, weekEnd: weekEnd, steps: out, target: span > 0 ? String(target).slice(0, 10) : '',
      thisWeek: out.filter(function (x) { return !x.done && !x.late && x.target <= weekEnd; }),
      behind: out.filter(function (x) { return x.late; })
    };
  }

  /* The handful of milestones a certification body and a sponsor care
     about, each made of path steps. Due = its last step's date on the
     plan. */
  var CERT_MILESTONES = [
    { key: 'documented', label: 'The ISMS documented', what: 'Scope, policies approved, risks assessed and treated, Statement of Applicability', steps: ['scope', 'scan', 'docs', 'approve', 'assets', 'legal', 'risks', 'soa'] },
    { key: 'operating', label: 'The ISMS operating', what: 'Recurring activities, training, suppliers and objectives running with records', steps: ['rhythm', 'training', 'suppliers', 'objectives', 'ai'] },
    { key: 'audit', label: 'Internal audit completed', what: 'Clauses 4 to 10 and Annex A audited, findings raised', steps: ['audit'] },
    { key: 'review', label: 'Management review held', what: 'Top management has reviewed the results and recorded decisions', steps: ['review'] },
    { key: 'stage1', label: 'Ready for Stage 1', what: 'Clause gaps closed, mandatory documents in place, audit booked', steps: ['clauses', 'mandatory', 'book'] }
  ];
  /* plan = onboardingSchedule(). Returns { target, daysToTarget,
     milestones:[{ key, label, what, due, done, lateDays, open:[step labels] }],
     atRisk, warnings }. atRisk = a milestone is late, or the target is
     near with work left that the remaining time cannot hold. */
  function certificationMilestones(plan, today) {
    var steps = (plan && plan.steps) || [];
    var target = plan && plan.target ? plan.target : '';
    var ms = CERT_MILESTONES.map(function (m) {
      var mine = steps.filter(function (s) { return m.steps.indexOf(s.id) !== -1; });
      if (!mine.length) return null;
      var due = mine.map(function (s) { return s.target; }).sort().pop();
      var open = mine.filter(function (s) { return !s.done; });
      return { key: m.key, label: m.label, what: m.what, due: due, done: !open.length, lateDays: open.length && due < today ? daysBetweenDateStr(due, today) : 0, open: open.map(function (s) { return s.label; }) };
    }).filter(Boolean);
    var warnings = [];
    var daysToTarget = target ? daysBetweenDateStr(today, target) : null;
    var late = ms.filter(function (m) { return m.lateDays > 0; });
    var openSteps = steps.filter(function (s) { return !s.done; }).length;
    if (target && daysToTarget < 0 && openSteps) warnings.push('The Stage 1 target of ' + target + ' has passed with ' + openSteps + ' step(s) still open: set a new date.');
    else if (target && daysToTarget !== null && openSteps && daysToTarget < openSteps * 3) warnings.push(openSteps + ' step(s) left and ' + daysToTarget + ' day(s) to the target: at this rate it will slip.');
    var audit = ms.find(function (m) { return m.key === 'audit'; });
    if (target && audit && !audit.done && daysToTarget !== null && daysToTarget >= 0 && daysToTarget < 30) warnings.push('The internal audit is not done and Stage 1 is under a month away. Most bodies accept Stage 1 before the internal audit, but Stage 2 will not go ahead without it and the management review.');
    if (target && plan.steps.length && daysBetweenDateStr(plan.steps[0].target, target) < 60) warnings.push('Less than two months from start to Stage 1 is tight. Certification bodies expect records of the ISMS operating, typically about three months, before Stage 2.');
    return { target: target, daysToTarget: daysToTarget, milestones: ms, atRisk: late.length > 0 || warnings.some(function (w) { return /slip|passed/.test(w); }), warnings: warnings };
  }

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
      var rhythmMissing = planOperatingRhythm(s.calendar || [], today || '1970-01-01').length;
      steps.splice(steps.findIndex(function (x) { return x.id === 'suppliers'; }) + 1, 0,
        { id: 'rhythm', phase: 'Operate', label: 'Set up the operating rhythm',
          why: 'The recurring checks an auditor samples to see controls working: access reviews, log reviews, restore tests and more, each completed with its evidence.',
          done: rhythmMissing === 0,
          detail: rhythmMissing && rhythmMissing < OPERATING_RHYTHM.length ? rhythmMissing + ' activit' + (rhythmMissing === 1 ? 'y' : 'ies') + ' not yet scheduled' : '' });
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

  /* The run-up to the next certification body audit, as calendar
     steps: confirm the dates with the body, hold a management review
     that considers the internal audit results, and prepare the
     surveillance pack with findings closed. Dates count back from the
     audit's due date; a step whose date has passed is due now. Returns
     [{ marker, title, category, nextDue }]. */
  function certificationPrepSteps(cert, today, fwLabel) {
    var cyc = certificationCycle(cert, today);
    if (!cyc.next || !cyc.next.dueBy) return [];
    var fw = (cert && cert.fw) || 'iso27001';
    var due = cyc.next.dueBy, label = cyc.next.label, body = cert && cert.body ? cert.body : 'the certification body';
    var at = function (days) { var d = new Date(due + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - days); var iso = d.toISOString().slice(0, 10); return iso < today ? today : iso; };
    var name = (fwLabel || fw) + ' ' + label;
    return [
      { marker: 'cert:' + fw + ':prep-confirm', title: 'Confirm the ' + name + ' dates and auditor with ' + body, category: 'External surveillance audit', nextDue: at(90) },
      { marker: 'cert:' + fw + ':prep-review', title: 'Management review before the ' + name + ' (consider the internal audit results)', category: 'Management review', nextDue: at(45) },
      { marker: 'cert:' + fw + ':prep-pack', title: 'Prepare for the ' + name + ': surveillance pack, close open findings, file fresh evidence snapshots', category: 'External surveillance audit', nextDue: at(14) }
    ];
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
  /* In-app internal audits: each workpack line's result, keyed
     'follow|ACT-1', 'clause|4.1' or 'control|A.5.15'.
     { key: { r: 'C'|'OFI'|'Minor'|'Major', note, ref (the action raised), by, date } } */
  var AUDIT_RESULTS = [
    { value: 'C', label: 'Conforms' },
    { value: 'OFI', label: 'Opportunity for improvement' },
    { value: 'Minor', label: 'Minor nonconformity' },
    { value: 'Major', label: 'Major nonconformity' }
  ];
  function parseAuditResults(json) {
    if (!json) return {};
    if (typeof json === 'object') return json;
    try { var o = JSON.parse(json); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
  }
  /* The lines of a workpack, in audit order: follow-ups, clauses, controls. */
  function auditWorkpackLines(wp) {
    wp = wp || {};
    return (wp.followUps || []).map(function (f) { return { key: 'follow|' + f.id, kind: 'follow', id: f.id, title: f.title, flags: [] }; })
      .concat((wp.clauses || []).map(function (c) { return { key: 'clause|' + c.id, kind: 'clause', id: c.id, title: c.title, flags: c.flags, evidenceUrl: c.evidenceUrl }; }))
      .concat((wp.controls || []).map(function (c) { return { key: 'control|' + c.id, kind: 'control', id: c.id, title: c.title, flags: c.flags, evidenceUrl: c.evidenceUrl }; }));
  }
  /* What the audit found so far, and the conclusion it supports. */
  function auditResultsSummary(lines, results) {
    results = results || {};
    var out = { total: (lines || []).length, assessed: 0, C: 0, OFI: 0, Minor: 0, Major: 0, refs: [], unassessed: [] };
    (lines || []).forEach(function (l) {
      var r = results[l.key];
      if (!r || !r.r) { out.unassessed.push(l.key); return; }
      out.assessed++;
      if (out[r.r] !== undefined) out[r.r]++;
      if (r.ref) out.refs.push(r.ref);
    });
    var ncs = out.Minor + out.Major;
    out.conclusion = out.Major ? 'The management system does not conform: ' + out.Major + ' major nonconformit' + (out.Major === 1 ? 'y' : 'ies') + ' must be corrected before certification.'
      : ncs ? 'The management system conforms, except for ' + ncs + ' minor nonconformit' + (ncs === 1 ? 'y' : 'ies') + ' with corrective action under way.'
      : 'The management system conforms to the requirements audited and is effectively implemented and maintained.';
    out.text = out.assessed + ' of ' + out.total + ' items audited: ' + out.C + ' conform, ' + out.OFI + ' opportunit' + (out.OFI === 1 ? 'y' : 'ies') + ' for improvement, ' +
      out.Minor + ' minor and ' + out.Major + ' major nonconformit' + (out.Major === 1 ? 'y' : 'ies') + '. ' + out.conclusion;
    return out;
  }

  function auditWorkpack(audit, data, today) {
    var a = audit || {}, d = data || {};
    var fw = a.fw || 'iso27001';
    /* ISO 27701:2025 has its own Clauses 4-10 (a standalone PIMS), so
       an ISO 27701 audit reads the ISO 27701 clause rows. */
    var clauseFw = fw;
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

  /* What Checkpoint has done for a client over a period, from the audit
     log and the registers, with a conservative estimate of the hours it
     replaced. Every assumption is listed next to its line, so the
     estimate can be checked and argued with rather than taken on trust.
     Posture scans count once per week at most: a tenant scanned daily
     has not had seven manual reviews' worth of work done. */
  var VALUE_HOURS = {
    scanWeek: 2, document: 3, statusUpdate: 0.25, finding: 0.5, questionnaireAnswer: 0.1,
    vendorQuestionnaire: 1, report: 2, workpack: 4, surveillance: 3
  };
  function isoWeekKey(iso) {
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(d)) return '';
    var day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    var firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return d.getUTCFullYear() + '-W' + (1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7));
  }
  function valueDelivered(data, since) {
    var d = data || {}, from = String(since || '');
    var inPeriod = function (date) { return !from || String(date || '').slice(0, 10) >= from; };
    var log = (d.auditLog || []).filter(function (e) { return e && inPeriod(e.entryDateTime); });
    var count = function (action) { return log.filter(function (e) { return e.action === action; }).length; };
    var leadingNumber = function (e) { var m = /^(\d+)/.exec(String(e.after || '')); return m ? parseInt(m[1], 10) : 0; };

    var scans = (d.scans || []).filter(function (x) { return x && inPeriod(x.date); });
    var weeks = {};
    scans.forEach(function (x) { var k = isoWeekKey(x.date); if (k) weeks[k] = true; });
    var checks = 0;
    scans.forEach(function (x) {
      try { var r = JSON.parse(x.detail || '{}').results; checks += Array.isArray(r) ? r.length : (r ? Object.keys(r).length : 0); } catch (e) { /* unparseable detail counts no checks */ }
    });
    var scanWeeks = Object.keys(weeks).length;

    var automatedStatus = log.filter(function (e) {
      return (e.action === 'Control status changed' || e.action === 'Clause status changed') &&
        /\((automated|scan-suggested|policy approved|policy generated|evidence linked|cross-framework)/.test(String(e.after || ''));
    }).length;
    /* "Open — 3 action(s) created": the risk and actions one approval
       of a scan finding writes. */
    var findings = count('Risk approved from scan finding');
    var qAnswers = log.filter(function (e) { return e.action === 'Questionnaire assistant run' || e.action === 'Questionnaire answers drafted with AI'; })
      .reduce(function (n, e) { return n + leadingNumber(e); }, 0);
    var reports = log.filter(function (e) { return e.action === 'Report generated'; });
    var reportHours = reports.reduce(function (h, e) { return h + (VALUE_HOURS[e.targetId] || VALUE_HOURS.report); }, 0);

    var items = [
      { key: 'scans', label: 'Microsoft 365 posture scans', count: scans.length, detail: checks + ' checks run, in ' + scanWeeks + ' week' + (scanWeeks === 1 ? '' : 's'), hours: scanWeeks * VALUE_HOURS.scanWeek, basis: VALUE_HOURS.scanWeek + ' hours per week scanned, for a manual configuration review' },
      { key: 'documents', label: 'Policies and procedures drafted', count: count('Policy template generated'), hours: count('Policy template generated') * VALUE_HOURS.document, basis: VALUE_HOURS.document + ' hours each to draft from scratch' },
      { key: 'status', label: 'Control and clause updates made automatically', count: automatedStatus, hours: automatedStatus * VALUE_HOURS.statusUpdate, basis: '15 minutes each to find the evidence and update the register' },
      { key: 'findings', label: 'Scan findings turned into risks and actions', count: findings, hours: findings * VALUE_HOURS.finding, basis: '30 minutes each to investigate and write up' },
      { key: 'questionnaires', label: 'Security questionnaire answers drafted', count: qAnswers, hours: qAnswers * VALUE_HOURS.questionnaireAnswer, basis: '6 minutes per answer' },
      { key: 'vendors', label: 'Supplier questionnaires sent and recorded', count: count('Vendor questionnaire sent') + count('Vendor questionnaire answers recorded'), hours: (count('Vendor questionnaire sent') + count('Vendor questionnaire answers recorded')) * VALUE_HOURS.vendorQuestionnaire, basis: '1 hour each' },
      { key: 'reports', label: 'Reports and audit packs generated', count: reports.length, hours: reportHours, basis: '2 hours per report; 3 for a pre-audit pack, 4 for an internal audit workpack' }
    ].filter(function (i) { return i.count > 0; });
    items.forEach(function (i) { i.hours = Math.round(i.hours * 10) / 10; });
    var hours = Math.round(items.reduce(function (h, i) { return h + i.hours; }, 0));
    return { items: items, hours: hours, since: from };
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
    band: band, residual: residual, riskScenarioGaps: riskScenarioGaps, residualAcceptanceStale: residualAcceptanceStale, checkResult: checkResult, activeDisposition: activeDisposition, score: score, incidentTriageResult: incidentTriageResult, alertTriageResult: alertTriageResult, deviceCheckinResult: deviceCheckinResult, leaverHygieneResult: leaverHygieneResult, caDeviceComplianceResult: caDeviceComplianceResult, caRiskBasedResult: caRiskBasedResult, caSignInFrequencyResult: caSignInFrequencyResult, caTermsOfUseResult: caTermsOfUseResult, caCloudAppSecurityResult: caCloudAppSecurityResult, oauthConsentRiskResult: oauthConsentRiskResult, describeServicePrincipal: describeServicePrincipal, lifecycleWorkflowsResult: lifecycleWorkflowsResult, subjectRightsResult: subjectRightsResult, retentionLabelResult: retentionLabelResult, tvmExposureResult: tvmExposureResult, edrCoverageResult: edrCoverageResult, attackSimulationResult: attackSimulationResult, labelProtectionResult: labelProtectionResult, QUESTION_TOPICS: QUESTION_TOPICS, matchQuestionTopics: matchQuestionTopics, questionSimilarity: questionSimilarity, parseQuestionnaireInput: parseQuestionnaireInput, assessQuestion: assessQuestion, ASSET_TYPES: ASSET_TYPES, ASSET_CLASSIFICATIONS: ASSET_CLASSIFICATIONS, mergeDiscoveredAssets: mergeDiscoveredAssets, assetRegisterSummary: assetRegisterSummary, LEGAL_BASELINE_AU: LEGAL_BASELINE_AU, LEGAL_TYPES: LEGAL_TYPES, LEGAL_APPLIES: LEGAL_APPLIES, legalRegisterSummary: legalRegisterSummary, soaInclusionReasons: soaInclusionReasons, MANDATORY_DOCS: MANDATORY_DOCS, mandatoryDocumentation: mandatoryDocumentation, CLAUSE_REQUIREMENTS: CLAUSE_REQUIREMENTS, CLAUSE_REQUIREMENTS_42: CLAUSE_REQUIREMENTS_42, clauseRequirementsFor: clauseRequirementsFor, CLAUSE_RECORD_KINDS: CLAUSE_RECORD_KINDS, isAiRisk: isAiRisk, isPrivacyRisk: isPrivacyRisk, clauseRecordStatus: clauseRecordStatus, clauseChecklist: clauseChecklist, clauseImplementGate: clauseImplementGate, parseClauseConfirmations: parseClauseConfirmations, PENDING_MARKER_PREFIX: PENDING_MARKER_PREFIX, pendingMarker: pendingMarker, pendingMarkersIn: pendingMarkersIn, readinessPct: readinessPct, EVIDENCE_ROOT: EVIDENCE_ROOT, evidenceFolderSegment: evidenceFolderSegment, evidenceFolderName: evidenceFolderName, evidenceFolderCode: evidenceFolderCode, evidenceKey: evidenceKey, planEvidenceFolders: planEvidenceFolders, diffEvidenceFolders: diffEvidenceFolders, evidenceFolderSummary: evidenceFolderSummary, evidenceFolderLinkUpdates: evidenceFolderLinkUpdates, evidenceFolderFreshness: evidenceFolderFreshness, SETUP_CHECK_IDS: SETUP_CHECK_IDS, setupHealthChecks: setupHealthChecks, setupHealthSummary: setupHealthSummary, scopesFromAccessToken: scopesFromAccessToken, graphTokenScopes: graphTokenScopes, GRAPH_DEFAULT_SCOPE: GRAPH_DEFAULT_SCOPE, matchHealthReport: matchHealthReport, sitePathsFromSearchHits: sitePathsFromSearchHits, buildProgressSnapshot: buildProgressSnapshot, progressHeadline: progressHeadline, mergeProgressHistory: mergeProgressHistory, clientStage: clientStage, clientAttentionFlags: clientAttentionFlags, clientStatusNote: clientStatusNote, clauseReadiness: clauseReadiness, DOCUMENT_IMPLEMENTED_CONTROLS: DOCUMENT_IMPLEMENTED_CONTROLS, controlsImplementedByDocument: controlsImplementedByDocument, tidyProfileAnswer: tidyProfileAnswer, scopeProfileWarnings: scopeProfileWarnings, parseProgressSnapshot: parseProgressSnapshot,
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
    entitlementAnnualValue: entitlementAnnualValue, isAgreedPrice: isAgreedPrice, moduleRevenueShares: moduleRevenueShares, computePaymentStatus: computePaymentStatus,
    computeNextBestModule: computeNextBestModule, computeClientHealth: computeClientHealth,
    rankUpsellOpportunities: rankUpsellOpportunities,
    syncAllQueue: syncAllQueue, syncAllSummary: syncAllSummary,
    daysBetweenDateStr: daysBetweenDateStr, normalizeEntitlementType: normalizeEntitlementType,
    addMonthsToDateStr: addMonthsToDateStr, isValidTenantIdentifier: isValidTenantIdentifier,
    findDuplicateTenantClient: findDuplicateTenantClient, buildClientIssuancePlan: buildClientIssuancePlan,
    computeClientChecklist: computeClientChecklist, controlReviewStatus: controlReviewStatus,
    riskReviewStatus: riskReviewStatus,
    buildAdminConsentUrl: buildAdminConsentUrl, normaliseSitePath: normaliseSitePath, welcomeGuideContent: welcomeGuideContent, sharePointHostFromDomains: sharePointHostFromDomains,
    documentReviewState: documentReviewState, documentRegisterSummary: documentRegisterSummary,
    attestationCampaigns: attestationCampaigns, outstandingAttestationsFor: outstandingAttestationsFor,
    attestationFocusRows: attestationFocusRows, attestationSummary: attestationSummary,
    trainingCheckResult: trainingCheckResult, usersMissingInduction: usersMissingInduction,
    segregationOfDutiesResult: segregationOfDutiesResult,
    recurringActivityState: recurringActivityState, backupCheckResult: backupCheckResult,
    bcpCheckResult: bcpCheckResult, supplierCheckResult: supplierCheckResult, policyCheckResult: policyCheckResult,
    independentReviewResult: independentReviewResult, incidentLessonsResult: incidentLessonsResult,
    objectivesCheckResult: objectivesCheckResult,
    capaStatus: capaStatus, MR_INPUT_SECTIONS: MR_INPUT_SECTIONS, parseReviewActionLines: parseReviewActionLines, CLAUSE_SNAPSHOTS: CLAUSE_SNAPSHOTS,
    nextBestActions: nextBestActions, controlToCheckIds: controlToCheckIds, overdueDaysOf: overdueDaysOf,
    MONITOR_APP_PERMISSIONS: MONITOR_APP_PERMISSIONS, monitorGrantSnippet: monitorGrantSnippet,
    resolvableFindings: resolvableFindings,
    SECURITY_REVIEW_AGENDA: SECURITY_REVIEW_AGENDA, SECURITY_REVIEW_QUARTERLY: SECURITY_REVIEW_QUARTERLY, SECURITY_REVIEW_KICKOFF: SECURITY_REVIEW_KICKOFF,
    importDupKey: importDupKey, guessImportMapping: guessImportMapping,
    ISMS_CHANGE_AREAS: ISMS_CHANGE_AREAS, ismsChangeLog: ismsChangeLog, ismsChangeLines: ismsChangeLines,
    policiesNeedingAcknowledgement: policiesNeedingAcknowledgement, attestationsToChase: attestationsToChase,
    BACKUP_ROOT: BACKUP_ROOT, backupStrip: backupStrip, backupSafeSettings: backupSafeSettings, backupFileName: backupFileName, buildBackupFiles: buildBackupFiles, backupsToPrune: backupsToPrune, backupDue: backupDue,
    CERT_MILESTONES: CERT_MILESTONES, certificationMilestones: certificationMilestones,
    clauseFinishSteps: clauseFinishSteps, CLAUSE_EVIDENCE_EXPECT: CLAUSE_EVIDENCE_EXPECT, clauseEvidenceFit: clauseEvidenceFit,
    TOP_MGMT_QUESTIONS: TOP_MGMT_QUESTIONS, topManagementInterview: topManagementInterview,
    NEXT_KIND_GUIDE: NEXT_KIND_GUIDE, nextForYou: nextForYou, welcomeScreens: welcomeScreens, GLOSSARY: GLOSSARY, PAGE_GUIDE: PAGE_GUIDE, pageGuide: pageGuide, WHO_AREAS: WHO_AREAS, whoDoesWhat: whoDoesWhat, whoAreaText: whoAreaText, BUILD_STAGES: BUILD_STAGES, BUILD_TOP_ITEMS: BUILD_TOP_ITEMS, guidedBuild: guidedBuild,
    srDate: srDate, dashDoNext: dashDoNext, pursuedFrameworks: pursuedFrameworks, pulseSummary: pulseSummary, chairSummary: chairSummary, chairSummaryHtml: chairSummaryHtml, stage2DryRun: stage2DryRun, vendorRenewalState: vendorRenewalState, vendorNotesText: vendorNotesText, validateVendorRenewal: validateVendorRenewal, vendorRenewalNote: vendorRenewalNote, riskWeightedAuditPlan: riskWeightedAuditPlan, ismsHealthScore: ismsHealthScore, securityReviewsMissed: securityReviewsMissed, AUDITOR_QUESTIONS: AUDITOR_QUESTIONS, auditorQuestionBank: auditorQuestionBank, evidenceValidity: evidenceValidity, clauseCadenceGaps: clauseCadenceGaps, srNamePresent: srNamePresent, securityReviewAttendance: securityReviewAttendance, securityReviewAbsences: securityReviewAbsences, topManagementRecord: topManagementRecord, securityReviewInviteText: securityReviewInviteText, securityReviewEscalationLines: securityReviewEscalationLines, securityReviewQuiet: securityReviewQuiet, securityReviewStatus: securityReviewStatus, securityReviewFollowUps: securityReviewFollowUps, securityReviewFollowUpHtml: securityReviewFollowUpHtml, SECURITY_REVIEW_LENGTH: SECURITY_REVIEW_LENGTH,
    addDaysIso: addDaysIso, securityReviewKind: securityReviewKind, parseSecurityReviewItems: parseSecurityReviewItems, securityReviewItemsText: securityReviewItemsText,
    wallTimeToUtc: wallTimeToUtc, securityReviewDue: securityReviewDue, securityReviewMinutesHtml: securityReviewMinutesHtml, SECURITY_REVIEW_KIND_LABEL: SECURITY_REVIEW_KIND_LABEL, securityReviewDayIn: securityReviewDayIn, nextSecurityReviewDate: nextSecurityReviewDate, workingDaysBefore: workingDaysBefore,
    buildSecurityReviewPack: buildSecurityReviewPack, securityReviewFacts: securityReviewFacts, securityReviewAgenda: securityReviewAgenda,
    securityReviewEmailHtml: securityReviewEmailHtml, securityReviewIcs: securityReviewIcs, securityReviewTrend: securityReviewTrend, securityReviewYearSummary: securityReviewYearSummary,
    EXCLUSION_RULES: EXCLUSION_RULES, REMOTE_APPLICABLE: REMOTE_APPLICABLE, remoteApplicableReason: remoteApplicableReason,
    suggestedExclusions: suggestedExclusions, suggestedJustification: suggestedJustification, exclusionConflicts: exclusionConflicts, exclusionsStatement: exclusionsStatement,
    ASSET_RETIRE_REASONS: ASSET_RETIRE_REASONS, ASSET_DISPOSAL_METHODS: ASSET_DISPOSAL_METHODS,
    retirementGaps: retirementGaps, retiredAssets: retiredAssets, parseRetirement: parseRetirement,
    departedOwners: departedOwners, registerReviewQueue: registerReviewQueue, recordHistory: recordHistory, evidenceTargets: evidenceTargets, evidenceCheckIssues: evidenceCheckIssues, isSharePointUrl: isSharePointUrl, seededPick: seededPick, mockAudit: mockAudit, riskTreatmentProgress: riskTreatmentProgress, riskNeedsReassessment: riskNeedsReassessment, registerTidy: registerTidy, vendorHandlesPersonalData: vendorHandlesPersonalData, vendorCriticalityFromTier: vendorCriticalityFromTier, VENDOR_REVIEW_MONTHS: VENDOR_REVIEW_MONTHS, vendorNextReview: vendorNextReview, normaliseVendorName: normaliseVendorName, vendorCandidates: vendorCandidates, matchOwners: matchOwners, fuzzyOwnerMatch: fuzzyOwnerMatch, BUSINESS_RISKS: BUSINESS_RISKS, BUSINESS_RISK_OF: BUSINESS_RISK_OF, businessRiskKeyFor: businessRiskKeyFor, businessRiskDef: businessRiskDef, isBusinessRisk: isBusinessRisk, riskFindings: riskFindings, groupProposals: groupProposals, groupExistingRisks: groupExistingRisks, registerSizeAfterGrouping: registerSizeAfterGrouping, checkHeadline: checkHeadline, scanFixFirst: scanFixFirst,
    isRetryableGraphStatus: isRetryableGraphStatus, graphRetryDelayMs: graphRetryDelayMs,
    parseReviewInputs: parseReviewInputs, serializeReviewInputs: serializeReviewInputs,
    isDevBypassActive: isDevBypassActive,
    controlAssurance: controlAssurance, assuranceSummary: assuranceSummary,
    evaluateSegregation: evaluateSegregation,
    parseCsv: parseCsv, normaliseHeader: normaliseHeader, planCsvImport: planCsvImport,
    sha256Hex: sha256Hex, canonicalAuditEntry: canonicalAuditEntry, auditEntryHash: auditEntryHash, verifyAuditChain: verifyAuditChain,
    encryptPack: encryptPack, decryptPack: decryptPack, validatePackShape: validatePackShape, fetchPackText: fetchPackText, ownDocumentReplacement: ownDocumentReplacement,
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
    valueDelivered: valueDelivered, VALUE_HOURS: VALUE_HOURS,
    clauseRequirementFixes: clauseRequirementFixes, clauseAutopilot: clauseAutopilot, CLAUSE_RECORD_FIXES: CLAUSE_RECORD_FIXES,
    SUGGESTED_OBJECTIVES: SUGGESTED_OBJECTIVES, suggestedObjectives: suggestedObjectives, objectivesStatement: objectivesStatement, measureObjective: measureObjective, certApplicationAnswers: certApplicationAnswers, scopeAdvice: scopeAdvice, certificationBookingReadiness: certificationBookingReadiness, auditorAccessState: auditorAccessState, ownerWorkItems: ownerWorkItems, matchOwnerToUser: matchOwnerToUser, evidenceRequestsByOwner: evidenceRequestsByOwner, evidenceRequestHtml: evidenceRequestHtml, ownerDigestHtml: ownerDigestHtml, notifyPref: notifyPref, ANNEX_STEPS: ANNEX_STEPS, annexAPlan: annexAPlan, annexAPlanGroups: annexAPlanGroups, CONTEXT_OPPORTUNITIES: CONTEXT_OPPORTUNITIES,
    contextOpportunitySuggestions: contextOpportunitySuggestions, preCertificationAudits: preCertificationAudits,
    parseAuditScope: parseAuditScope, auditWorkpack: auditWorkpack, AUDIT_RESULTS: AUDIT_RESULTS, parseAuditResults: parseAuditResults,
    auditWorkpackLines: auditWorkpackLines, auditResultsSummary: auditResultsSummary, CLAUSE_AUDIT_PROMPTS: CLAUSE_AUDIT_PROMPTS,
    clauseOperatingEvidence: clauseOperatingEvidence, clauseAutomationUpdates: clauseAutomationUpdates,
    createWriteGuard: createWriteGuard, certificationPathSteps: certificationPathSteps,
    OPERATING_RHYTHM: OPERATING_RHYTHM, rhythmKeyOf: rhythmKeyOf, rhythmDef: rhythmDef, rhythmDefFor: rhythmDefFor, CALENDAR_STATUSES: CALENDAR_STATUSES, calendarItemLive: calendarItemLive, rhythmNotesText: rhythmNotesText, rhythmLastEvidence: rhythmLastEvidence,
    planOperatingRhythm: planOperatingRhythm, rhythmCompletionUpdates: rhythmCompletionUpdates,
    CONTEXT_RISKS: CONTEXT_RISKS, contextRiskSuggestions: contextRiskSuggestions,
    CADENCES: CADENCES, cadenceCurrent: cadenceCurrent, resolveCadenceTokens: resolveCadenceTokens, cadenceKeysIn: cadenceKeysIn, cadenceSnapshot: cadenceSnapshot, statementApplies: statementApplies, policyPracticeGaps: policyPracticeGaps,
    addMonthsIso: addMonthsIso, certificationCycle: certificationCycle, certificationPrepSteps: certificationPrepSteps, ONBOARDING_DAYS: ONBOARDING_DAYS, onboardingSchedule: onboardingSchedule, internalAuditCoverage: internalAuditCoverage, internalAuditProgramme: internalAuditProgramme
  };
});
