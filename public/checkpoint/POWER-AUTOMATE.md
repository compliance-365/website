# Checkpoint — Power Automate recipes

Checkpoint keeps every register as a SharePoint list in your own Microsoft
365 tenant. Power Automate's built-in SharePoint connector can trigger on
those lists, so you can wire Checkpoint into the rest of your working
day without new permissions, add-ons or a Checkpoint backend.

This guide gives four ready-to-build flows. Each takes about ten minutes.

---

## Before you start

**Where the lists are.** Checkpoint's lists live on the SharePoint site
chosen when Checkpoint was set up. If you're not sure which, open the
`Checkpoint Actions` list from SharePoint search. Each list is named
`Checkpoint <register>`, for example `Checkpoint Actions`,
`Checkpoint Incidents`, `Checkpoint Calendar` and `Checkpoint Vendors`.

**Licensing.** The SharePoint, Outlook, Teams and Planner connectors are
standard connectors, included with most Microsoft 365 business plans. No
premium licence is needed for any flow here.

**Read from Checkpoint's lists; don't write to them.** Checkpoint records
every change in a tamper-evident audit log (`Checkpoint AuditLog`), keeps
reference numbers in sequence, and updates related records when a status
changes (a risk's residual score when its treatment actions close, for
example). A flow that edits a Checkpoint list
directly bypasses all of that, and an auditor will see register changes
with no matching audit entry. Every flow below only **reads** Checkpoint
and writes somewhere else: Teams, Outlook or Planner. Make changes to the
registers in Checkpoint itself.

**Run flows as a service account if you can.** A flow runs with its
owner's permissions. If that person leaves, the flow stops. A shared
compliance mailbox or service account as owner avoids that.

---

## Flow 1 — Tell an owner the moment a high-priority action is assigned

Checkpoint's scheduled monitor emails owners about overdue work. This flow
tells them as soon as a Critical or High action lands, so nothing waits
for the next digest.

1. **Create → Automated cloud flow.** Trigger: *SharePoint — When an item
   is created*. Site: your Checkpoint site. List: `Checkpoint Actions`.
2. **Add a condition:** `Priority` *is equal to* `Critical`, **or**
   `Priority` *is equal to* `High`.
3. **If yes:** add *Office 365 Outlook — Send an email (V2)*.
   - To: `OwnerEmail` (if your owners are recorded by name only, use a
     fixed address such as your compliance mailbox instead).
   - Subject: `New compliance action: ` + `Title`
   - Body: `RefId`, `Title`, `Priority`, `DueDate`, `Control`, and a link
     to Checkpoint (`https://www.compliance365.com.au/checkpoint/`).
4. Save, then add a test action in Checkpoint to confirm the email
   arrives.

**Teams instead of email:** replace step 3 with *Microsoft Teams — Post
message in a chat or channel*, posting as Flow bot to the owner
(Recipient: `OwnerEmail`).

---

## Flow 2 — Escalate a suspected privacy breach immediately

Under the Privacy Act's Notifiable Data Breaches scheme you have 30 days to
assess a suspected eligible data breach, and the clock starts when you
become aware of it. Checkpoint tracks the assessment date. This flow
makes sure the privacy officer hears about it the same day.

1. **Automated cloud flow.** Trigger: *SharePoint — When an item is created
   or modified*. List: `Checkpoint Incidents`.
2. **Stop it firing on every edit.** Open the trigger's *Settings →
   Trigger conditions* and add:
   ```
   @equals(triggerOutputs()?['body/IsPrivacyBreach'], true)
   ```
3. **Add** *SharePoint — Get changes for an item or a file (properties
   only)*. Site and list as above, Id: `ID` from the trigger, Since:
   `Trigger Window Start Token`. Then a **condition**:
   `Has Column Changed: IsPrivacyBreach` *is equal to* `true`. This makes
   the flow act once, when the incident is first marked as a privacy
   breach, not on every later update.
4. **If yes:** send an email (or a Teams message) to your privacy officer
   with `RefId`, `Title`, `Severity`, `DetectedDate` and
   `AssessmentDueDate`, marked High importance.

---

## Flow 3 — Monday morning: what's due this week

A weekly list for each owner of the actions due in the next seven days.

1. **Scheduled cloud flow.** Recurrence: every 1 week, Monday, 8:00 in your
   time zone.
2. **SharePoint — Get items.** List: `Checkpoint Actions`. Filter Query:
   ```
   Status ne 'Done' and Status ne 'Cancelled'
   ```
   Top Count: `5000`.
3. **Data operation — Filter array.** From: `value` from Get items.
   Switch to advanced mode and enter:
   ```
   @and(not(empty(item()?['DueDate'])), lessOrEquals(item()?['DueDate'], formatDateTime(addDays(utcNow(), 7), 'yyyy-MM-dd')))
   ```
   Checkpoint stores dates as `yyyy-MM-dd` text, so this text comparison
   is a date comparison. Overdue actions are included, because their due
   dates are earlier.
4. **Data operation — Create HTML table** from the filtered array, with
   custom columns `RefId`, `Title`, `Priority`, `DueDate`, `Owner`.
5. **Send an email (V2)** to your compliance lead with the table as the
   body. To send each owner only their own actions, add a *Select* on
   `OwnerEmail`, remove duplicates with `union()`, and loop over the
   result with *Apply to each*, filtering the array per owner.

---

## Flow 4 — Put new actions into Planner

For teams that run their week in Planner. This is a one-way copy:
Checkpoint stays the record auditors see, and Planner is where the work
gets scheduled.

1. **Automated cloud flow.** Trigger: *SharePoint — When an item is
   created*. List: `Checkpoint Actions`.
2. **Planner — Create a task.** Group and plan: your compliance plan.
   - Title: `RefId` + ` — ` + `Title`
   - Due Date Time: `DueDate`
   - Assigned User Ids: `OwnerEmail` (leave blank if not recorded)
3. **Planner — Update task details.** Task Id: from the previous step.
   Description: the `Control`, `Priority` and a link to Checkpoint.
   Add a checklist item: *Mark done in Checkpoint*, so closing the Planner
   task prompts the owner to close the action where it counts.

Don't sync Planner back into Checkpoint. Closing an action in Checkpoint
records who closed it and the evidence, and a nonconformity also needs its
root cause and effectiveness review recorded. A flow can't do that.

---

## Other ideas

- **Calendar items due** (`Checkpoint Calendar`, `NextDue`): the same
  pattern as Flow 3, for recurring activities such as access reviews and
  BCP tests.
- **Supplier reviews** (`Checkpoint Vendors`, `NextReviewDue`,
  `CertExpiryDate`): a monthly email of suppliers whose review or
  certificate falls due next month.
- **Drift alerts** (`Checkpoint Alerts`): Checkpoint's Teams notifications
  already post these once a Teams channel is connected in Checkpoint's
settings. Use a flow only if you
  want them somewhere else, such as a ticketing system's email intake.

If a column name in these recipes doesn't appear in the flow designer,
open Checkpoint once. It adds any columns a newer release introduced to
the existing lists when it loads, then refresh the flow designer.
