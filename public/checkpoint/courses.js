/* ============================================================
   Checkpoint — Training Course Catalogue
   window.TRAINING_COURSES: awareness and competence training,
   written in our own words. No standard text, no vendor
   boilerplate, no licensed content copied in.

   WHY THIS IS WRITTEN, NOT FILMED
   -------------------------------
   The awareness market competes on production values — video,
   phishing simulation, an LMS. Checkpoint deliberately does not.
   What it competes on is EVIDENCE: a completion here is a dated,
   per-person record in the client's own tenant, mapped to the
   control it satisfies, sitting next to the policy that person
   also attested to and exportable as one artefact at audit.
   Prose can be maintained by the same people who maintain the
   policy library; a video estate cannot, and a course that has
   quietly gone stale is worse evidence than no course at all.

   Phishing SIMULATION is deliberately out of scope — Microsoft
   Defender for Office 365 P2 ships Attack Simulation Training and
   many clients already pay for it. guidance.js's A.6.3 entry
   points there on purpose. This catalogue covers the knowledge
   half of A.6.3, which simulation does not.

   COMPLETION CRITERION
   --------------------
   Every course ends in a short comprehension check. This is not
   assessment theatre: A.6.3 and Clause 7.2 ask an organisation to
   demonstrate awareness and competence, and "opened the page" does
   not demonstrate either. It is deliberately short, the pass mark
   is achievable, wrong answers explain themselves, and retries are
   unlimited — the goal is that the point lands, not that anyone
   fails. Attempt counts are recorded because a course where
   everybody needs four attempts is telling you something about the
   course.

   JURISDICTION
   ------------
   Framework content (ISO 27001/27701/42001) is international. Where
   a course covers Australian law — the Privacy Act 1988, the
   Australian Privacy Principles, the Notifiable Data Breaches
   scheme — it is confined to a clearly-labelled module and flagged
   with `jurisdiction: 'AU'` so a practitioner delivering to a
   client outside Australia knows exactly which module to replace
   rather than having to read the whole course to find out.

   Each entry:
     {
       id,           // stable key — the completion record's CourseId
       title,
       version,      // bump when content changes materially; completion
                     // records are version-specific, same reasoning as
                     // policy attestation (see store.js's Training list)
       audience,     // plain-language "who this is for"
       duration,     // honest read-time estimate in minutes
       frameworks,   // which entitled frameworks this course serves
       controls,     // control codes it helps satisfy (verified against
                     // store.js — never invented)
       clauses,      // management-system clauses, which aren't modelled
                     // as linkable controls (same convention as
                     // templates.js's clause documents)
       purpose,      // 2-3 sentences: why anyone should read this
       modules: [ {
         heading,
         intro,      // a paragraph setting up the section
         points,     // the substance, as discrete statements
         callout     // optional { kind: 'do'|'avoid'|'note', text }
       } ],
       quiz: [ {
         q, options, answer (index into options), why
       } ],
       passMark      // number of correct answers required
     }
   ============================================================ */
window.TRAINING_COURSES = [

  /* ==========================================================
     1. SECURITY AWARENESS — ISO 27001 A.6.3, Clause 7.2/7.3,
        SOC 2 CC1.4, NIST PR.AT. The one course every framework
        expects and every auditor samples.
     ========================================================== */
  {
    id: 'security-awareness',
    title: 'Security Awareness',
    version: '1.0',
    audience: 'Everyone, at induction and annually',
    duration: 15,
    frameworks: ['iso27001', 'iso27701', 'soc2', 'essential8', 'nistcsf', 'is18', 'dispirap'],
    controls: ['A.6.3', 'A.5.10', 'A.6.8', 'A.8.5'],
    clauses: 'ISO 27001 Clause 7.2 (competence) and 7.3 (awareness)',
    purpose: 'Almost every breach that reaches an organisation of our size arrives through a person, not a firewall. This course covers what those attempts actually look like now, the handful of habits that stop most of them, and — the single most valuable thing in it — how and when to report something that feels wrong.',
    modules: [
      {
        heading: 'How attacks actually reach you',
        intro: 'Attackers are not, for the most part, breaking encryption or exploiting zero-days. They are logging in with credentials someone gave them, or persuading someone to move money or data. Understanding the shape of that helps more than memorising a list of threats.',
        points: [
          'The overwhelming majority of successful intrusions begin with a person: a password entered on a convincing fake page, a multi-factor prompt approved without thinking, or an instruction followed because it appeared to come from someone senior.',
          'Attackers research before they contact you. Your name, role, manager and current projects are often public — on the company website, LinkedIn, a conference programme, or a media release. A message that knows those things is not evidence that it is genuine.',
          'The goal is usually one of three things: credentials to sign in as you, money moved to an account the attacker controls, or data they can sell or extort you with.',
          'You are a target because of your access, not because of your seniority. A finance officer, an executive assistant and a support engineer are all high-value to an attacker for different reasons.'
        ],
        callout: { kind: 'note', text: 'Nothing in this course requires you to become technical. It requires you to slow down at three specific moments: a sign-in prompt you did not initiate, a request to move money or data, and a link asking you to authenticate.' }
      },
      {
        heading: 'Phishing, and the versions of it that get past people',
        intro: 'Everyone has been taught to spot the badly-spelled email with a suspicious link. Attackers know that too. These are the variants that currently work.',
        points: [
          'Multi-factor fatigue: you receive a stream of MFA approval prompts you did not trigger, in the hope you approve one to make them stop. An unexpected prompt means somebody already has your password. Deny it and report it — that report is the only warning anyone will get.',
          'Business email compromise: no link and no attachment, just a plausible request. A supplier emails new bank details. An executive asks you to buy gift cards, urgently, and asks you to keep it quiet. Urgency plus secrecy plus a payment change is the pattern, and the absence of a link is what makes it slip through filters.',
          'Consent phishing: a link that asks you to grant an app permission to your Microsoft 365 account rather than asking for your password. Approving it hands over access without any password ever changing hands, and MFA does not stop it.',
          'QR codes: a code in an email, a PDF, or stuck on a physical poster moves you onto your phone, which is usually outside the organisation\'s filtering and has a smaller screen showing less of the address.',
          'Callback phishing: an invoice or subscription-renewal notice with no link at all, just a phone number. Ringing it connects you to the attacker, who talks you into installing remote-access software.',
          'Legitimate services get abused constantly. A file-share notification really is from a genuine cloud provider; the document inside it is the attack. The sender being real does not make the content safe.'
        ],
        callout: { kind: 'avoid', text: 'Never approve a multi-factor prompt you did not personally trigger seconds earlier — not to stop the noise, not because you assume it is a system glitch. That prompt means your password is already known to someone else.' }
      },
      {
        heading: 'Signing in: passwords, MFA and passkeys',
        intro: 'Credential handling is where the largest amount of risk is concentrated in the smallest number of habits.',
        points: [
          'Use a unique password for every service. Reuse is what turns somebody else\'s breach into ours: attackers take credentials leaked from an unrelated site and try them against Microsoft 365 at scale.',
          'Use the password manager the organisation provides. A long random password you cannot remember is safer than a memorable one, precisely because you are not the one remembering it.',
          'Length beats complexity. A long passphrase of ordinary words is stronger and more usable than a short string of substituted characters, which attackers have modelled for years.',
          'Prefer passkeys or an authenticator app with number matching over SMS codes. SMS can be intercepted or redirected by transferring your number to another SIM, and a code you type into a fake page works just as well for the attacker as for you.',
          'A passkey cannot be phished in the same way, because it will only authenticate against the genuine site — it has no code for you to read out or type somewhere else.',
          'Never share a one-time code with anyone, including someone claiming to be IT or the service provider. No legitimate support process needs it.'
        ],
        callout: { kind: 'do', text: 'If you have ever used your work password anywhere else, change it today and stop reusing it. That single change removes one of the most common routes into an organisation.' }
      },
      {
        heading: 'Data and devices in ordinary work',
        intro: 'Most data loss is not dramatic. It is an attachment sent to the wrong recipient, a file copied somewhere convenient, or a device left somewhere.',
        points: [
          'Keep work data in approved systems. A copy in personal cloud storage, a personal email account, or an unmanaged USB drive is outside every protection the organisation has and outside its ability to retrieve or delete it.',
          'Check the recipient before sending, especially where autocomplete has filled in the address. Misdirected email is one of the most commonly reported causes of data breaches.',
          'Apply the sensitivity label where the organisation uses them. It is what drives encryption and sharing restrictions automatically, so it does work long after you have forgotten the file exists.',
          'When sharing from SharePoint or OneDrive, share with specific people rather than "anyone with the link" unless there is a genuine reason, and set an expiry.',
          'Lock your screen whenever you step away, including at home and in shared workspaces.',
          'Report a lost or stolen device immediately, even if you are fairly sure it will turn up. Remote wipe is only useful before somebody else has had time with it.',
          'Public Wi-Fi is acceptable for ordinary work over modern encrypted connections, but treat any certificate warning or unexpected sign-in page on a public network as a reason to stop.'
        ]
      },
      {
        heading: 'Reporting — the part that actually matters',
        intro: 'If you take one thing from this course, take this. The difference between an incident and a near-miss is almost always how quickly somebody said something.',
        points: [
          'Report anything that feels wrong, as soon as it does: a suspicious message, a prompt you did not trigger, a file that appeared somewhere it should not be, a payment that now looks doubtful, or a sinking feeling about a link you clicked ten minutes ago.',
          'Report it even if you think you may have already caused a problem. Especially then. Early reporting is what makes a mistake recoverable — resetting a password and revoking sessions within the hour usually contains it entirely.',
          'You will not be disciplined for reporting a genuine mistake or a false alarm. Reporting is the behaviour the organisation wants; a culture where people hide errors is one where small problems become large ones in silence.',
          'Report near-misses too. Something you spotted and avoided tells us about a gap that will catch somebody less lucky.',
          'If you cannot reach the usual channel, escalate to your manager rather than waiting. Do not let an evening or a weekend pass on a suspected compromise.'
        ],
        callout: { kind: 'do', text: 'Make sure you know, right now, how to report a security concern here — the address, channel or number. If you do not, find out before you close this course.' }
      }
    ],
    quiz: [
      {
        q: 'You are working normally and your phone starts showing repeated Microsoft sign-in approval prompts that you did not trigger. What is the right response?',
        options: [
          'Approve one so the prompts stop, then carry on',
          'Deny the prompts, and report it — an unexpected prompt means someone already has your password',
          'Ignore it; unexpected prompts are usually a system glitch',
          'Turn off multi-factor authentication until it settles down'
        ],
        answer: 1,
        why: 'Those prompts only exist because someone is entering your password. Approving one hands them your account, and ignoring it leaves them free to keep trying. Denying and reporting is the only response that helps — your report may be the only warning anyone gets.'
      },
      {
        q: 'A long-standing supplier emails to say their bank details have changed, and asks for this month\'s invoice to be paid to the new account. The email address and signature look right. What should happen?',
        options: [
          'Pay it — the email is from the supplier\'s real address',
          'Pay it, but note the change for the next audit',
          'Verify the change by contacting the supplier on a number you already hold, not one from the email',
          'Reply to the email asking them to confirm the change'
        ],
        answer: 2,
        why: 'This is the classic invoice-redirection pattern, and it works precisely because the address and signature look right — often because the supplier\'s own mailbox has been compromised. Replying to the email just reaches the attacker. Verification only means anything through a channel you already had.'
      },
      {
        q: 'Which of these gives the best protection against a phishing page that captures your credentials?',
        options: [
          'A very complex password changed every 30 days',
          'An SMS code sent to your mobile',
          'A passkey, or an authenticator app with number matching',
          'Using a different browser for work'
        ],
        answer: 2,
        why: 'A passkey will only authenticate against the genuine site, so there is nothing for a fake page to capture or replay. An SMS code can be typed into a fake page — or redirected by transferring your number to another SIM — which is why it is the weakest of the multi-factor options.'
      },
      {
        q: 'You realise you clicked a link in a suspicious email about twenty minutes ago and entered your password. What is the best thing to do?',
        options: [
          'Wait and see whether anything unusual happens to the account',
          'Report it immediately, even though you are the one who made the mistake',
          'Change the password quietly and say nothing, since no harm has appeared yet',
          'Delete the email so nobody else falls for it'
        ],
        answer: 1,
        why: 'Twenty minutes is usually well inside the window where this can be contained completely — resetting the password and revoking active sessions ends it. Waiting or staying quiet spends that window. You will not be disciplined for reporting a genuine mistake; that is exactly the behaviour the organisation wants.'
      },
      {
        q: 'Which of these is an acceptable place to keep a copy of a work document containing customer information?',
        options: [
          'Your personal cloud storage, so you can work on it at the weekend',
          'Your personal email account, sent to yourself',
          'An approved organisational system such as SharePoint, OneDrive or Teams',
          'A personal USB drive, provided you delete it afterwards'
        ],
        answer: 2,
        why: 'Only approved systems are covered by the organisation\'s access controls, logging, retention and — if it ever matters — its ability to retrieve or delete the data. A copy anywhere else is invisible to all of that, including during a breach investigation where we have to say exactly where the data went.'
      }
    ],
    passMark: 4
  },

  /* ==========================================================
     2. PRIVACY & PERSONAL INFORMATION — ISO 27701 and ISO 27001
        A.5.34. Module 5 is Australian-law-specific and flagged
        as such so it can be swapped for another jurisdiction
        without touching the rest of the course.
     ========================================================== */
  {
    id: 'privacy-awareness',
    title: 'Privacy & Personal Information',
    version: '1.0',
    audience: 'Everyone who handles personal information — in practice, almost everyone',
    duration: 15,
    frameworks: ['iso27701', 'iso27001', 'soc2'],
    controls: ['A.5.34', 'A.6.3', 'A.5.12', 'P.7.2.1', 'P.7.3.1', 'P.7.4.1'],
    clauses: 'ISO 27701 Clause 7 (PII controller obligations); ISO 27001 Clause 7.3',
    purpose: 'Privacy obligations are mostly discharged in ordinary work — what you collect, who you send it to, how long you keep it — not in a legal department. This course covers the handful of judgements that come up routinely, and what to do in the first hour after something goes wrong.',
    modules: [
      {
        heading: 'What counts as personal information',
        intro: 'People consistently underestimate this, which is where most accidental mishandling starts.',
        points: [
          'Personal information is information about an identified individual, or one who is reasonably identifiable — not just formal identifiers. A name is obvious; so is an email address, a photo, an IP address tied to a person, a device identifier, or a free-text note about someone.',
          'It does not have to be true, and it does not have to be written down formally. A wrong assumption recorded in a support ticket is still personal information about that person.',
          'Information can become personal when combined. A postcode, a birth date and a job title are individually unremarkable and together often identify exactly one person.',
          'Some categories carry much higher risk and stricter handling: health information, biometrics, racial or ethnic origin, religious or political views, sexual orientation, criminal record, and financial details. Treat these as sensitive by default.',
          'Being an employer does not exempt us. Staff records are personal information about our own people, and they are among the most commonly mishandled data an organisation holds.'
        ],
        callout: { kind: 'note', text: 'A practical test: if you would not want the individual reading it over your shoulder, you are almost certainly handling personal information that deserves care.' }
      },
      {
        heading: 'Collect less, use it for what you said',
        intro: 'Two principles do most of the work in privacy, and both are decisions made at the moment of collection.',
        points: [
          'Only collect what you actually need for the task. Every extra field is something to secure, retain, disclose in a breach and answer for later. "It might be useful one day" is not a purpose.',
          'Use it for the purpose it was collected for. Information a customer gave us to deliver a service is not automatically available for a marketing campaign, a product experiment, or a demo.',
          'Be straight with people about what you are collecting and why, in language they would actually understand. Privacy notices exist for this, but so does the sentence you say on a phone call.',
          'Do not create new copies casually. Exporting a customer list to a spreadsheet to do one piece of analysis creates a second holding of that data that nobody is tracking and nobody will delete.',
          'Anonymise or aggregate when the individual identity is not the point. If you need to know how many customers are in a region, you do not need their names.'
        ],
        callout: { kind: 'avoid', text: 'Avoid using real customer or staff data in test systems, training material, screenshots or demos. Synthetic data costs a few minutes and removes the whole category of risk.' }
      },
      {
        heading: 'Access, retention and disposal',
        intro: 'Holding personal information longer or more widely than necessary is the quiet risk — it does no harm at all until the day it does.',
        points: [
          'Access personal information only when you have a work reason. Curiosity about a customer, a colleague or a public figure in our records is misuse, and access is logged.',
          'Share internally on the same basis. Broad internal visibility of an HR file or a customer complaint is a privacy problem even though nothing left the organisation.',
          'Keep information only as long as there is a business or legal reason. Once there is not, it should be deleted or de-identified according to the retention schedule — and that includes the spreadsheet copy in your own OneDrive.',
          'Dispose of it properly. For paper, that means secure destruction, not a general waste bin. For devices, it means the organisation\'s disposal process, not a personal sale or a household bin.',
          'Individuals have rights over their information — to access it, to have inaccurate information corrected, and in some circumstances to have it deleted or to object to a use. You do not have to know the detail; you have to recognise a request and pass it on quickly, because these have deadlines.'
        ],
        callout: { kind: 'do', text: 'If someone asks what personal information we hold about them, or asks us to correct or delete it, treat it as a formal request and pass it to the privacy contact the same day — even if it arrives casually in a support chat or a phone call.' }
      },
      {
        heading: 'Third parties and sending information overseas',
        intro: 'Most organisations disclose personal information to suppliers constantly, through ordinary tool choices rather than deliberate decisions.',
        points: [
          'Every supplier that can see personal information is a disclosure — the cloud platform, the support desk tool, the analytics service, the AI assistant, the contractor with a login.',
          'Suppliers must be assessed and put under contract before they receive personal information, not after. Signing up to a new tool with a corporate card and loading customer data into it bypasses that entirely.',
          'Sending personal information overseas — including storing it in an offshore data centre — carries extra obligations, and in most cases we remain accountable for what the overseas recipient does with it.',
          'Do not paste personal information into a service the organisation has not approved. That specifically includes public AI chatbots, free file-conversion sites, and online translation tools.',
          'If a supplier tells us they have had a breach affecting our data, that is our breach to assess as well as theirs. Escalate it immediately rather than waiting for their investigation.'
        ]
      },
      {
        heading: 'Data breaches — the first hour, and the law',
        jurisdiction: 'AU',
        intro: 'This module reflects Australian law. Organisations operating under another privacy regime should read the principles here and follow their own notification rules, which differ on timing and thresholds.',
        points: [
          'A data breach is unauthorised access to, unauthorised disclosure of, or loss of personal information. It very often has no attacker in it at all — the most common causes are an email to the wrong recipient, a file shared too broadly, and a lost device.',
          'Under the Privacy Act 1988, an eligible data breach is one likely to result in serious harm to an affected individual where the risk cannot be remediated. These must be notified to the Office of the Australian Information Commissioner and to the affected individuals.',
          'Once we become aware there are reasonable grounds to suspect an eligible breach, we have a maximum of 30 days to complete an assessment — and if it is confirmed, notification must be as soon as practicable. That clock starts at suspicion, not at certainty.',
          'This is why immediate reporting matters more than diagnosis. Your job is to raise it the moment you suspect it; assessing whether it meets the threshold is someone else\'s.',
          'Fast action often prevents a breach becoming notifiable at all. Recalling a misdirected message, revoking a sharing link, or remotely wiping a device within minutes can remove the risk of serious harm entirely — which is exactly the remediation the law asks about.',
          'Do not investigate alone, and do not contact the affected individual yourself before the organisation has decided how to respond. Well-meant early contact can make the situation materially worse.'
        ],
        callout: { kind: 'do', text: 'Suspected breach: report it immediately, preserve the evidence (do not delete the email or the log), and do not notify anyone outside the organisation until the response is coordinated.' }
      }
    ],
    quiz: [
      {
        q: 'Which of these is NOT personal information?',
        options: [
          'A free-text note in a support ticket recording an assumption about a customer\'s health',
          'A postcode, birth date and job title that together identify one individual',
          'A count of how many customers are in each state, with no identifiers',
          'A work email address of the form firstname.lastname@company.example'
        ],
        answer: 2,
        why: 'An aggregate count with no identifiers is not about an identified or reasonably identifiable individual. The other three all are — including the free-text note, which is personal information even though it is an assumption and may well be wrong, and the combination, which identifies one person even though each field alone would not.'
      },
      {
        q: 'You need to analyse how customers use a feature. What is the best approach?',
        options: [
          'Export the full customer list to a spreadsheet so the data is there if the analysis expands',
          'Use aggregated or de-identified data, since individual identity is not what you are measuring',
          'Use the live customer database directly and delete nothing',
          'Copy the data into a personal cloud drive so you can work on it at home'
        ],
        answer: 1,
        why: 'If you are measuring usage patterns you do not need to know who anyone is. Exporting the full list creates a second, untracked holding of personal data that nobody will remember to delete — the "it might be useful" instinct is exactly what collection and retention limits exist to resist.'
      },
      {
        q: 'A customer mentions in a support chat, in passing, that they would like to know everything the company holds about them. What should you do?',
        options: [
          'Answer informally from what you can see on your screen',
          'Tell them to submit it in writing to a legal address, or it does not count',
          'Treat it as a formal access request and pass it to the privacy contact the same day',
          'Nothing — a request made in a chat is not a real request'
        ],
        answer: 2,
        why: 'Rights requests do not have to be formal, or use the right words, or arrive through the right channel to be valid — and they have deadlines that start running immediately. Recognising one and passing it on quickly is the whole of your job here; answering it yourself risks giving out an incomplete or wrong picture.'
      },
      {
        q: 'A colleague suggests pasting a spreadsheet of customer contact details into a free public AI chatbot to tidy up the formatting. Is that acceptable?',
        options: [
          'Yes, as long as the file is deleted from the chatbot afterwards',
          'Yes, since formatting is not really "using" the data',
          'No — it discloses personal information to a supplier we have not assessed or contracted',
          'Only if the customers are in Australia'
        ],
        answer: 2,
        why: 'Pasting data into any external service is a disclosure to that service, whether or not you think of it that way. An unapproved tool has had no supplier assessment, no contract, and no check on where it stores data or whether it trains on it — and deleting the conversation afterwards does not undo the disclosure.'
      },
      {
        q: 'You have just realised you emailed a spreadsheet of staff details to the wrong external recipient. What is the right first move?',
        options: [
          'Email the recipient directly and ask them to delete it, then see what happens',
          'Work out first whether it is serious enough to count as a notifiable breach',
          'Report it immediately and preserve the evidence, without contacting anyone outside the organisation',
          'Delete the sent email so it does not appear in the mailbox'
        ],
        answer: 2,
        why: 'The assessment clock starts at suspicion, not at certainty, and deciding whether the threshold is met is not your call to make alone. Fast internal reporting is also what makes remediation possible — a recall or a revoked link within minutes can stop it being notifiable at all. Deleting the sent email destroys the evidence needed to assess it.'
      }
    ],
    passMark: 4
  },

  /* ==========================================================
     3. AI USE & OVERSIGHT — ISO 42001. The thinnest part of the
        awareness market and the one Checkpoint is best placed to
        serve, because the client's own AI systems register can
        make it specific rather than generic.
     ========================================================== */
  {
    id: 'ai-use-oversight',
    title: 'Using AI Safely and Responsibly',
    version: '1.0',
    audience: 'Everyone who uses an AI tool at work, and anyone deciding to adopt one',
    duration: 15,
    frameworks: ['iso42001', 'iso27001', 'iso27701'],
    controls: ['AI.4.4', 'AI.8.2', 'AI.6.2.6', 'A.6.3'],
    clauses: 'ISO 42001 Clause 7.2 (competence) and 7.3 (awareness)',
    purpose: 'AI tools are now embedded in ordinary work, often without anyone deciding to adopt them. This course covers what you can safely put into one, why a confident answer is not necessarily a correct one, what meaningful human oversight actually involves, and how to get a tool approved rather than using it quietly.',
    modules: [
      {
        heading: 'What AI governance is actually about',
        intro: 'Security asks whether the organisation could be harmed. AI governance adds a question most people find unfamiliar: could a person be harmed by what this system does?',
        points: [
          'The core discipline is not "is the AI accurate" but "what happens to someone if it is wrong, and would they know, and could they contest it?"',
          'That shifts the risk assessment. A model that is wrong 2% of the time is unremarkable in a formatting tool and unacceptable in something influencing whether a person gets a service, a job or a payment.',
          'Risk is proportionate to consequence, not to sophistication. A simple spreadsheet rule that decides who gets contacted first can matter more to individuals than an advanced model summarising meeting notes.',
          'The organisation stays accountable for outcomes. "The model produced it" is not a defence to a customer, a regulator or a court — accountability cannot be delegated to a supplier or a system.',
          'This is why the organisation maintains a register of the AI systems it uses, records what each is for, and assesses the ones that could affect people. That register only works if people tell us what they are using.'
        ],
        callout: { kind: 'note', text: 'The question to carry through this course: if this system gets it wrong about a real person, what happens to them, and who notices?' }
      },
      {
        heading: 'What you can and cannot put into an AI tool',
        intro: 'Most AI risk in practice is not exotic. It is ordinary data going into a service nobody assessed.',
        points: [
          'Use approved AI tools. Enterprise services the organisation has assessed and contracted have commitments about where data goes, who can see it, and whether it is used to train the provider\'s models. Consumer and free tiers frequently do not.',
          'Do not paste customer or staff personal information, health information, credentials, financial details, unreleased commercial information, or anything under a confidentiality obligation into an unapproved tool. Once submitted, you cannot retrieve it.',
          'Assume anything you type into a consumer AI service may be retained, reviewed by a human for quality purposes, or used to improve the model, unless the organisation has confirmed in writing that it will not be.',
          'Be careful with indirect disclosure. Uploading a whole document to "just summarise it" submits everything in it, including the parts you were not thinking about — attachments, tracked changes, and comments.',
          'Even in an approved tool, an AI assistant sees what your account can see. If your permissions are broader than they should be, an assistant will surface information you were never really meant to have — which is an access-control problem AI makes visible rather than one it creates.',
          'Confidential does not become non-confidential because a model paraphrased it.'
        ],
        callout: { kind: 'avoid', text: 'Never paste anything into an AI tool that you could not paste into an email to someone outside the organisation. That is the right mental threshold for an unapproved service.' }
      },
      {
        heading: 'Confidently wrong: verification and human oversight',
        intro: 'Language models are optimised to produce plausible text. Plausibility and accuracy are different properties, and the gap between them is where the damage happens.',
        points: [
          'Models fabricate. They invent citations, legal cases, statistics, product features, policy clauses and quotations — in fluent, confident, correctly-formatted prose. The fluency is not evidence of anything.',
          'Confidence is not calibrated. A model states an invented fact in exactly the same tone as a well-established one, so you cannot use its manner to judge its reliability.',
          'Verify anything consequential against a real source before it leaves you: figures, names, dates, legal or regulatory statements, commitments to a customer, and anything going into a document with our name on it.',
          'Meaningful oversight means you could have reached, and can defend, the decision yourself. Skimming an output and clicking approve is not oversight; it is a signature on someone else\'s reasoning.',
          'Oversight has to be real, not nominal. If a person is expected to review 200 AI recommendations an hour, the control does not exist however the process is documented.',
          'Watch for automation bias in yourself. People systematically over-trust machine outputs, and become less likely to catch errors the more often the system has been right before.',
          'You remain the author. Work you produce with AI assistance is your work, and you are answerable for it.'
        ],
        callout: { kind: 'do', text: 'Treat AI output as a confident first draft from a well-read colleague who sometimes makes things up and never says when. Useful, and never the final word on anything that matters.' }
      },
      {
        heading: 'Bias, fairness and who is affected',
        intro: 'Systems trained on historical data reproduce historical patterns, including the ones the organisation would not defend if stated as a policy.',
        points: [
          'Bias usually enters through the data, not through intent. A model learns from what happened before, and if past decisions disadvantaged a group, the model will treat that pattern as the target to reproduce.',
          'Harm is often unevenly distributed. A system that works well on average can work poorly for a specific group — and averages are exactly what hides that.',
          'Accuracy varies by population in ways that are easy to miss. Speech, image and language systems commonly perform worse for accents, names, appearances and dialects less represented in training data.',
          'Consider who is affected but not present. The people a system makes decisions about are rarely the people who chose it, specified it or tested it.',
          'If an AI system contributes to a decision about a person, they should generally be able to find out that it did, and have a route to a human review. Being told "the system decided" with no recourse is the outcome AI governance exists to prevent.',
          'Report patterns, not just individual errors. "It keeps mishandling names like this one" is far more valuable than a single corrected output, because it identifies something systematic.'
        ]
      },
      {
        heading: 'Shadow AI, and getting a tool approved',
        intro: 'The most common AI governance failure is not a bad model. It is that nobody knows which tools are in use.',
        points: [
          'Shadow AI is any AI tool used for work that the organisation does not know about — a browser extension, a free web tool, an AI feature quietly switched on inside software we already had, or a personal subscription used for work tasks.',
          'It is a governance problem rather than a discipline problem: we cannot assess, secure or answer for a system we do not know exists, and an auditor asking "what AI do you use?" needs a truthful answer.',
          'AI features increasingly arrive inside tools already approved for other purposes. A note-taker that joins meetings, a summariser added to a helpdesk, a code assistant enabled by default — these need raising even though the underlying product was approved.',
          'Getting a tool approved is not an obstacle course. Say what you want to use, what it would do, and what data it would touch; a low-risk tool handling no personal data is usually straightforward.',
          'Raise it before loading real data, not after. Approval is much harder to give retrospectively once the data has already gone.',
          'If you already use something that has not been raised, say so now. Nobody is in trouble for surfacing a tool; the register just needs to be honest.'
        ],
        callout: { kind: 'do', text: 'Think of two AI tools or AI features you personally use for work. Check whether each is on the approved list — and if you are not sure, that is exactly what to raise.' }
      }
    ],
    quiz: [
      {
        q: 'What is the central question AI governance adds to ordinary security risk assessment?',
        options: [
          'Whether the model is technically sophisticated enough for the task',
          'Whether a person could be harmed if the system is wrong, and whether they would know or could contest it',
          'Whether the AI vendor is larger than our current suppliers',
          'Whether the system runs in our own tenant rather than the vendor\'s'
        ],
        answer: 1,
        why: 'Security asks whether the organisation could be harmed. AI governance adds harm to individuals and to society, which is why risk is proportionate to consequence rather than to sophistication — a simple rule that decides who gets a service can matter more to a person than an advanced summarisation model.'
      },
      {
        q: 'An AI assistant produces a well-written summary citing three industry statistics with sources. What should you do before putting it in a client document?',
        options: [
          'Use it — the citations show it has drawn on real sources',
          'Use it, but soften the wording in case a figure is slightly off',
          'Verify each statistic and source independently before it leaves you',
          'Ask the model whether it is confident the statistics are correct'
        ],
        answer: 2,
        why: 'Models fabricate citations and statistics in exactly the same fluent, confident, correctly-formatted style they use for real ones — the presence of a source is not evidence the source exists. Asking the model to self-assess does not help either, since its confidence is not calibrated to its accuracy.'
      },
      {
        q: 'A team reviews AI-generated recommendations before they take effect, but each reviewer is expected to clear around 200 an hour. Is this meaningful human oversight?',
        options: [
          'Yes — a human approves every recommendation, so oversight exists',
          'Yes, provided the review step is documented in the process',
          'No — at that rate the reviewer cannot genuinely reach or defend each decision, so the control is nominal',
          'It depends entirely on how accurate the model is'
        ],
        answer: 2,
        why: 'Oversight means the reviewer could have reached, and can defend, the decision themselves. At 200 an hour that is not happening, so the control exists on paper and not in reality — and documenting it more thoroughly does not change that. Model accuracy is a separate question; a nominal control is nominal either way.'
      },
      {
        q: 'A recruitment screening tool is trained on the organisation\'s past hiring decisions. What is the main risk?',
        options: [
          'The model will be too slow to process applications at volume',
          'It will reproduce whatever patterns are in past decisions, including ones the organisation would not defend as a policy',
          'It will be more accurate than human reviewers and make them redundant',
          'Applicants will object to any use of technology in hiring'
        ],
        answer: 1,
        why: 'A model trained on historical decisions treats those decisions as the thing to reproduce. If past hiring disadvantaged a group, that pattern becomes the target — bias enters through the data rather than through intent, and good average accuracy is exactly what hides uneven performance across groups.'
      },
      {
        q: 'You discover a note-taking AI has been automatically enabled in a meeting tool the organisation already approved, and it is transcribing client calls. What should you do?',
        options: [
          'Nothing — the underlying tool was already approved',
          'Nothing, provided you delete the transcripts afterwards',
          'Raise it, because a new AI feature processing client conversations has not been assessed even though the product was',
          'Switch it off for your own meetings and leave it at that'
        ],
        answer: 2,
        why: 'AI features increasingly arrive switched on inside products approved for something else entirely. The approval covered the original product and its original data flows, not a system now transcribing client conversations — and quietly disabling it for yourself leaves it running for everyone else and still absent from the register.'
      }
    ],
    passMark: 4
  }
];
