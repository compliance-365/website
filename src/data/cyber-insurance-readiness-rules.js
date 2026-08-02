/**
 * cyber-insurance-readiness-rules.js
 * ====================================
 * Rule constants for the Cyber Insurance Readiness Check
 * (/cyber-insurance-readiness-check/).
 *
 * Unlike src/data/ransomware-reporting-rules.js (grounded in a specific
 * piece of legislation), there is no single authoritative source for what
 * Australian cyber insurers ask at underwriting — every insurer's proposal
 * form differs, and none publish them. This file instead reflects a
 * pattern that was consistent across multiple independent broker/MSP/cyber
 * -vendor sources (not one primary document), so treat weights and the
 * specific numeric ranges (e.g. patch SLA days) as indicative, not
 * contractual — worth a periodic sanity-check against current market
 * commentary, and ideally against Compliance365's own insurance-partner
 * conversations, rather than treated as settled fact the way the
 * ransomware-reporting rules are.
 *
 * Sources consulted (cross-checked; all secondary/advisory commentary):
 *  - https://4it.com.au/cybersecurity/cyber-insurance-australian-sme-2026/
 *  - https://virtuellegroup.com.au/cyber-insurance-requirements-2026-what-insurers-now-demand/
 *  - https://www.cliffside.com.au/insights/cyber-insurance-requirements-australia/
 *  - https://www.upcover.com/blog/cyber-insurance-requirements-australia
 *  - https://armourcyber.io/advisory-services/cyber-insurance-what-insurers-want/
 *  - https://www.stanfieldit.com/blog/cyber-insurance/
 *
 * Last reviewed against sources: 2026-08-02.
 *
 * Three controls (MFA, EDR, tested backups) are called out repeatedly as
 * near-universal eligibility gates rather than just weighted factors —
 * i.e. insurers decline or heavily load cover on the worst answer to any
 * of these regardless of overall score. That's modelled below via
 * `nonNegotiable: true` on those questions' scoring logic.
 */

export const MAX_SCORE = 100;

export const BANDS = [
  { min: 80, id: 'ready', label: 'Insurer-ready', color: '#166534', bg: '#F0FDF4' },
  { min: 55, id: 'gaps', label: 'Gaps insurers will flag', color: '#92400E', bg: '#FFFBEB' },
  { min: 0, id: 'high-risk', label: 'High risk of decline or heavy loading', color: '#B91C1C', bg: '#FEF2F2' },
];

/**
 * Each question: id, label (the insurer-framing headline), weight (points
 * at stake, sums to MAX_SCORE across all questions), options ordered
 * best-to-worst with a 0-1 `score` multiplier, and optional
 * `nonNegotiable`/`criticalIf` flags used for the band cap / critical
 * banner.
 */
export const QUESTIONS = [
  {
    id: 'mfa',
    weight: 18,
    nonNegotiable: true,
    insurerFrames: 'Insurers ask about MFA coverage on every application form — it\'s the single most common reason cover is declined or loaded.',
    question: 'Where is multi-factor authentication (MFA) enforced?',
    options: [
      { value: 'full', label: 'Everywhere — email, remote access/VPN, admin & privileged accounts, cloud consoles', score: 1 },
      { value: 'partial', label: 'Email and admin accounts only', score: 0.55 },
      { value: 'email-only', label: 'Email only', score: 0.3 },
      { value: 'none', label: 'Not enforced anywhere', score: 0 },
    ],
  },
  {
    id: 'remoteAccess',
    weight: 14,
    nonNegotiable: true,
    criticalIf: 'exposed',
    insurerFrames: 'Insurers specifically ask whether remote administration (e.g. RDP) is exposed directly to the internet — it\'s treated as a near-automatic red flag.',
    question: 'How is remote access to your systems configured?',
    options: [
      { value: 'gated', label: 'No remote admin exposed to the internet — all remote access is MFA-gated (VPN/ZTNA)', score: 1 },
      { value: 'mostly-gated', label: 'Remote access exists and is generally behind MFA', score: 0.6 },
      { value: 'some-ungated', label: 'Some remote access without MFA', score: 0.25 },
      { value: 'exposed', label: 'RDP or remote admin is exposed directly to the internet', score: 0 },
    ],
  },
  {
    id: 'endpoint',
    weight: 14,
    nonNegotiable: true,
    insurerFrames: 'Insurers now ask specifically about EDR, not just "do you have antivirus" — legacy AV-only is treated as a gap.',
    question: 'What endpoint protection do you have in place?',
    options: [
      { value: 'edr', label: 'EDR / next-gen endpoint protection with active monitoring, on all endpoints & servers', score: 1 },
      { value: 'av-only', label: 'Traditional antivirus only, no EDR or active monitoring', score: 0.4 },
      { value: 'inconsistent', label: 'Inconsistent — some devices have no protection', score: 0 },
    ],
  },
  {
    id: 'backups',
    weight: 14,
    nonNegotiable: true,
    insurerFrames: 'Insurers ask not just "do you back up" but "have you tested a restore" and "is a copy offline/immutable" — ransomware makes online-only backups a common decline reason.',
    question: 'How confident are you in your backups?',
    options: [
      { value: 'tested', label: 'Regularly restore-tested, with at least one offline/immutable copy', score: 1 },
      { value: 'automated-untested', label: 'Automated backups exist but restores aren\'t regularly tested', score: 0.5 },
      { value: 'online-only', label: 'Backups exist but no offline/immutable copy', score: 0.25 },
      { value: 'none', label: 'No reliable backup process', score: 0 },
    ],
  },
  {
    id: 'patching',
    weight: 10,
    insurerFrames: 'Insurers commonly ask how quickly critical patches are applied — ad hoc patching is a frequently cited gap.',
    question: 'How is patch management handled?',
    options: [
      { value: 'sla', label: 'Defined SLA — critical patches applied within about 2–4 weeks', score: 1 },
      { value: 'periodic', label: 'Patched periodically, but no defined SLA', score: 0.55 },
      { value: 'adhoc', label: 'Ad hoc / reactive only', score: 0.15 },
    ],
  },
  {
    id: 'email',
    weight: 9,
    insurerFrames: 'Given email is the dominant attack vector, insurers commonly ask about filtering and DMARC enforcement, not just spam filtering.',
    question: 'What email security do you have?',
    options: [
      { value: 'advanced', label: 'Advanced filtering (attachment/link sandboxing) with DMARC enforced', score: 1 },
      { value: 'basic', label: 'Basic spam filtering only', score: 0.45 },
      { value: 'none', label: 'No dedicated email security beyond the default', score: 0.1 },
    ],
  },
  {
    id: 'pam',
    weight: 8,
    insurerFrames: 'Insurers ask whether admin accounts are separated from everyday accounts and regularly reviewed.',
    question: 'How is privileged/admin access managed?',
    options: [
      { value: 'separated-reviewed', label: 'Admin accounts are separate, least-privilege, and reviewed regularly', score: 1 },
      { value: 'separated-unreviewed', label: 'Some separation, but not reviewed regularly', score: 0.5 },
      { value: 'shared', label: 'Admins use the same everyday accounts, no review', score: 0.1 },
    ],
  },
  {
    id: 'incidentResponse',
    weight: 8,
    insurerFrames: 'Insurers ask not just whether an incident response plan exists, but when it was last tested — an untested plan is a commonly flagged gap.',
    question: 'What\'s the state of your incident response plan?',
    options: [
      { value: 'tested', label: 'Documented and tested/exercised within the last 12 months', score: 1 },
      { value: 'stale', label: 'Documented, but not tested recently', score: 0.5 },
      { value: 'none', label: 'No documented plan', score: 0 },
    ],
  },
  {
    id: 'training',
    weight: 5,
    insurerFrames: 'Insurers increasingly ask about phishing simulation testing, not just whether training happens.',
    question: 'What security awareness training is in place?',
    options: [
      { value: 'regular', label: 'Regular training plus simulated phishing tests', score: 1 },
      { value: 'infrequent', label: 'Training exists but is infrequent, no phishing tests', score: 0.5 },
      { value: 'none', label: 'No formal training', score: 0 },
    ],
  },
];
