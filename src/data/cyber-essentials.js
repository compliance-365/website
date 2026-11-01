/**
 * cyber-essentials.js
 * ===================
 * The five Cyber Essentials technical controls, where each one lives in
 * Microsoft 365, and the self-check questions, shared by
 * /uk/cyber-essentials-microsoft-365/ and /uk/cyber-essentials-checker/
 * on www.compliance365.io so the guide and the checker never disagree.
 *
 * Requirements are summarised from the NCSC / IASME "Cyber Essentials:
 * Requirements for IT infrastructure" in plain language, not quoted. The
 * position on automation matches /resources/cyber-essentials-readiness/:
 * four of the five controls are read from the tenant; boundary firewalls
 * sit outside what Microsoft Graph can see and stay a guided attestation.
 * `checks` are real Checkpoint posture check ids (public/checkpoint/store.js).
 */

export const CONTROLS = [
  {
    id: 'firewalls',
    name: 'Firewalls',
    automated: false,
    asks: [
      'Every device in scope is protected by a correctly configured firewall: a boundary firewall, or a host firewall on devices used on untrusted networks such as home or public Wi-Fi.',
      'Default firewall administrator passwords are changed, and the admin interface is not reachable from the internet unless it is protected by MFA or an allow-list.',
      'Inbound connections are blocked by default, and every rule that opens one is approved, documented and removed when no longer needed.',
    ],
    microsoft: 'Host firewalls on Windows, macOS and mobile devices are deployed as Intune endpoint security policies. The boundary firewall or router at each office is outside Microsoft 365, so it is checked and attested by hand.',
    checks: [],
    questions: [
      'Is every in-scope device behind a boundary firewall, or running a host firewall when it is used away from the office?',
      'Have default administrator passwords on every firewall and router been changed?',
      'Is inbound traffic blocked by default, with every open rule approved and documented?',
    ],
  },
  {
    id: 'secure-configuration',
    name: 'Secure configuration',
    automated: true,
    asks: [
      'Unnecessary user accounts and software are removed or disabled, default and guessable passwords are changed, and auto-run is turned off.',
      'Devices lock and need a biometric, or a password or PIN of at least six characters, to unlock.',
      'Password sign-in is protected against guessing, for example by locking or throttling after no more than ten failed attempts, with stronger length rules where MFA is not used.',
    ],
    microsoft: 'Intune compliance policies and configuration profiles (or security baselines) set the device rules. Windows Hello covers device unlock. Entra ID smart lockout limits password guessing, and Entra Password Protection blocks common passwords.',
    checks: ['compliance-policy', 'device-config', 'device-checkin', 'dormant-accounts'],
    questions: [
      'Are unused accounts and unneeded software removed or disabled on every device?',
      'Do devices lock, and need a biometric or a PIN or password of at least six characters to unlock?',
      'Is password guessing limited by lockout or throttling on all accounts?',
      'Are Intune compliance policies applied to every device that reaches your data?',
    ],
  },
  {
    id: 'security-updates',
    name: 'Security update management',
    automated: true,
    asks: [
      'All software in scope is licensed and supported by its vendor. Unsupported software is removed or kept out of scope.',
      'Updates install automatically where possible, and critical or high-risk security updates are applied within 14 days of release.',
    ],
    microsoft: 'Windows Update for Business rings (or Windows Autopatch) in Intune install updates with a deadline. Microsoft Defender Vulnerability Management shows missing updates and software the vendor no longer supports.',
    checks: ['patch', 'patch-os', 'patch-apps'],
    questions: [
      'Is every operating system and application in scope still supported by its vendor?',
      'Are critical and high-risk security updates applied within 14 days of release?',
      'Are updates set to install automatically, with a deadline, through Intune or another tool?',
    ],
  },
  {
    id: 'user-access-control',
    name: 'User access control',
    automated: true,
    asks: [
      'Accounts are created only when approved, given only the access the job needs, and removed or disabled when no longer needed.',
      'Administrator accounts are separate from day-to-day accounts and used only for admin tasks, not for email or web browsing.',
      'Multi-factor authentication is turned on for every user of cloud services such as Microsoft 365.',
    ],
    microsoft: 'Conditional Access in Entra ID requires MFA for all users and blocks legacy authentication, which would otherwise bypass it. Privileged Identity Management makes admin roles time-limited, and access reviews and Lifecycle Workflows remove leavers.',
    checks: ['mfa-all', 'legacy', 'legacy-auth-observed', 'admins', 'pim', 'leaver', 'access-review'],
    questions: [
      'Is MFA enforced for every user of Microsoft 365, including administrators?',
      'Is legacy authentication (which skips MFA) blocked?',
      'Do administrators use separate admin accounts only for admin work?',
      'Are leavers’ accounts disabled promptly, and access reviewed regularly?',
    ],
  },
  {
    id: 'malware-protection',
    name: 'Malware protection',
    automated: true,
    asks: [
      'Every device in scope uses anti-malware software, kept up to date and set to scan files and block malicious websites, or runs only approved applications through application allow-listing.',
    ],
    microsoft: 'Microsoft Defender Antivirus with real-time and cloud protection, plus SmartScreen and network protection for websites. For allow-listing, App Control for Business (WDAC) deployed through Intune.',
    checks: ['edr-coverage', 'wdac', 'asr'],
    questions: [
      'Is anti-malware (such as Microsoft Defender) running and up to date on every device, or is application allow-listing in place?',
      'Are malicious websites blocked or warned on, through SmartScreen, network protection or web filtering?',
    ],
  },
];

export const ANSWERS = [
  { value: 'yes', label: 'Yes' },
  { value: 'partly', label: 'Partly' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
];

export const QUESTIONS = CONTROLS.flatMap((c) => c.questions.map((q, i) => ({ id: `${c.id}-${i + 1}`, control: c.id, controlName: c.name, q })));

/**
 * Cyber Essentials is pass or fail on each requirement, so readiness is
 * not an average: any "no" is a blocker, and "partly" or "not sure" needs
 * checking before submission.
 */
export function assess(answers = {}) {
  const controls = CONTROLS.map((c) => {
    const qs = QUESTIONS.filter((q) => q.control === c.id);
    const got = qs.map((q) => answers[q.id]).filter(Boolean);
    const status = got.length < qs.length ? 'open'
      : got.includes('no') ? 'blocked'
      : got.some((a) => a === 'partly' || a === 'unsure') ? 'check'
      : 'ready';
    return { id: c.id, name: c.name, status, answered: got.length, total: qs.length };
  });
  const answered = QUESTIONS.filter((q) => answers[q.id]).length;
  const blockers = QUESTIONS.filter((q) => answers[q.id] === 'no');
  const toCheck = QUESTIONS.filter((q) => answers[q.id] === 'partly' || answers[q.id] === 'unsure');
  const complete = answered === QUESTIONS.length;
  const verdict = !answered ? 'start' : blockers.length ? 'not-ready' : !complete ? 'so-far' : toCheck.length ? 'nearly' : 'ready';
  return { controls, answered, total: QUESTIONS.length, complete, blockers, toCheck, verdict };
}
