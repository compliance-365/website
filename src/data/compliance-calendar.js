/**
 * compliance-calendar.js
 * ======================
 * Dates on /compliance-calendar/. Every dated entry repeats a date the
 * site already states, with its source there (named in `src`), so the
 * calendar can't drift from the posts and pages it summarises. Recurring
 * obligations have no date; they are shown as a separate band.
 * `precision: 'month'` marks a release known only to the month.
 */

export const EVENTS = [
  { date: '2019-07-01', fw: 'CPS 234', title: 'CPS 234 applies to APRA-regulated entities', href: 'services/cps234/', src: 'src/pages/services/cps234.astro' },
  { date: '2025-05-30', fw: 'Cyber Security Act', title: 'Ransomware payment reporting starts', detail: 'Report a ransomware or cyber extortion payment within 72 hours. Education-first enforcement to the end of 2025.', href: 'ransomware-payment-reporting-checker/', src: 'src/data/ransomware-reporting-rules.js' },
  { date: '2025-07-01', fw: 'CPS 230', title: 'CPS 230 Operational Risk Management in force', detail: 'Sits alongside CPS 234 for APRA-regulated entities.', href: 'blog/apra-cps230-essential-eight-alignment/', src: 'src/content/blog/apra-cps230-essential-eight-alignment.md' },
  { date: '2026-01-01', fw: 'Cyber Security Act', title: 'Ransomware payment reporting fully enforced', href: 'ransomware-payment-reporting-checker/', src: 'src/data/ransomware-reporting-rules.js' },
  { date: '2026-06-01', precision: 'month', fw: 'ISM', title: 'ISM June 2026 release', detail: 'Added controls for AI systems and AI-assisted development.', href: 'blog/ism-september-2026-changes/', src: 'src/content/blog/ism-september-2026-changes.md' },
  { date: '2026-06-01', precision: 'month', fw: 'Essential Eight', title: 'ASD announces the Essentials series to replace the Essential Eight', href: 'blog/essentials-series-status-october-2026/', src: 'src/content/blog/essentials-series-status-october-2026.md' },
  { date: '2026-07-12', fw: 'Essential Eight', title: 'Consultation on the first Essentials chapter closes', href: 'blog/essentials-series-status-october-2026/', src: 'src/content/blog/essentials-series-status-october-2026.md' },
  { date: '2026-08-31', fw: 'Privacy Act', title: 'Tranche 2 Privacy Act exposure draft released', detail: 'A draft bill, not law. Consultation closed 18 September 2026.', href: 'blog/privacy-act-tranche-2-draft-bill/', src: 'src/content/blog/privacy-act-tranche-2-draft-bill.md' },
  { date: '2026-09-01', precision: 'month', fw: 'ISM', title: 'ISM September 2026 release', detail: 'AI agents treated as identities, staff can no longer approve third-party apps, threat hunting every three months.', href: 'blog/ism-september-2026-changes/', src: 'src/content/blog/ism-september-2026-changes.md' },
  { date: '2026-09-30', fw: 'Privacy Act', title: 'OAIC publishes automated decision-making guidance', href: 'blog/privacy-policy-automated-decisions-10-december-2026/', src: 'src/content/blog/privacy-policy-automated-decisions-10-december-2026.md' },
  { date: '2026-09-30', fw: 'IS18', title: 'IS18 annual return due', detail: 'Signed by the accountable officer. Due every year on 30 September.', href: 'services/is18/', src: 'src/pages/services/is18.astro' },
  { date: '2026-10-15', fw: 'Essential Eight', title: 'ASD publishes the Essentials', detail: 'Chapters for enterprise IT, cloud and OT. Existing Essential Eight work counts.', href: 'resources/asd-essentials-framework/', src: 'src/content/blog/asd-essentials-published.md' },
  { date: '2026-12-10', fw: 'Privacy Act', title: 'Privacy policies must describe automated decisions', detail: 'APP 1.7 to 1.9 apply. Already law, from the 2024 amendments.', href: 'automated-decisions-checker/', src: 'src/content/blog/privacy-policy-automated-decisions-10-december-2026.md' },
  { date: '2027-09-30', fw: 'IS18', title: 'IS18 annual return due', detail: 'Signed by the accountable officer.', href: 'services/is18/', src: 'src/pages/services/is18.astro' },
];

export const RECURRING = [
  { fw: 'CPS 234', title: 'Within 72 hours', detail: 'Notify APRA of a material information security incident (¶35).', href: 'cps234-notification-calculator/' },
  { fw: 'CPS 234', title: 'Within 10 business days', detail: 'Notify APRA of a material control weakness you cannot remediate in time (¶36).', href: 'cps234-notification-calculator/' },
  { fw: 'CPS 234', title: 'Every year', detail: 'Review and test incident response plans (¶26) and review the testing program (¶31).', href: 'cps234-self-assessment/' },
  { fw: 'Cyber Security Act', title: 'Within 72 hours', detail: 'Report a ransomware or cyber extortion payment, if you are a reporting business entity.', href: 'ransomware-payment-reporting-checker/' },
  { fw: 'IS18', title: 'Every 30 September', detail: 'Annual return signed by the accountable officer.', href: 'services/is18/' },
  { fw: 'ISO 27001', title: 'Every year', detail: 'Surveillance audits in years 2 and 3, then recertification. Internal audit and management review before each.', href: 'services/iso27001/' },
];

export const FRAMEWORKS = [...new Set([...EVENTS, ...RECURRING].map((e) => e.fw))];

/** Split into past and upcoming relative to `today` (local date). */
export function split(today = new Date()) {
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const sorted = [...EVENTS].sort((a, b) => a.date.localeCompare(b.date));
  return { past: sorted.filter((e) => e.date < t), upcoming: sorted.filter((e) => e.date >= t), today: t };
}
