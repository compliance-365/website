/**
 * automated-decisions.js
 * ======================
 * Logic for the automated decisions privacy policy checker
 * (/automated-decisions-checker/).
 *
 * From 10 December 2026, APP 1.7 to 1.9 (Privacy and Other Legislation
 * Amendment Act 2024) require an APP entity's privacy policy to describe:
 *   - the kinds of personal information used in computer programs that
 *     make, or do something substantially and directly related to making,
 *     decisions that could reasonably be expected to significantly affect
 *     an individual's rights or interests;
 *   - the kinds of such decisions made solely by a computer program; and
 *   - the kinds of such decisions a computer program substantially and
 *     directly assists a person to make.
 * The three-part test and the examples follow the OAIC guidance of
 * 30 September 2026 as summarised in
 * src/content/blog/privacy-policy-automated-decisions-10-december-2026.md,
 * which lists the sources. "Computer program" includes rule-based
 * processes, not only AI.
 */

export const DEADLINE = '2026-12-10';

export const ENTITY_OPTIONS = [
  { value: 'agency', label: 'An Australian Government agency', covered: true },
  { value: 'over3m', label: 'An organisation with annual turnover over $3 million', covered: true },
  { value: 'health', label: 'A health service provider, or otherwise covered regardless of turnover', covered: true },
  { value: 'small', label: 'Turnover of $3 million or less, and not otherwise covered', covered: false },
  { value: 'unsure', label: 'Not sure', covered: null },
];

export const ROLE_OPTIONS = [
  { value: 'solely', label: 'The software makes the decision on its own' },
  { value: 'assists', label: 'It substantially and directly informs a person who decides' },
  { value: 'minor', label: 'It only formats data, or makes a suggestion people routinely override' },
];

export const SYSTEM_PRESETS = [
  { id: 'credit', name: 'Credit, payment terms or account approval', example: 'an automated score approves or declines an account or sets its terms' },
  { id: 'recruitment', name: 'Recruitment screening', example: 'a system filters or ranks applicants before a person looks' },
  { id: 'pricing', name: 'Eligibility or pricing', example: 'rules in a quoting or onboarding system decide who qualifies, or at what price' },
  { id: 'fraud', name: 'Fraud or risk flags', example: 'a flag blocks a transaction or closes an account' },
  { id: 'triage', name: 'Health or service triage', example: 'a booking system allocates urgent appointments from questionnaire answers' },
];

export const INFO_KINDS = [
  'Contact details', 'Identity documents', 'Financial and credit information', 'Employment history',
  'Health information', 'Transaction history', 'Usage and behavioural data', 'Location data',
];

/** Is a single system caught? All three parts must be true. */
export function assess(system) {
  const program = system.role === 'solely' || system.role === 'assists';
  const significant = system.significant === 'yes';
  const personal = (system.info || []).length > 0;
  const reasons = [];
  if (!program) reasons.push('The software does not make the decision or substantially and directly inform it.');
  if (system.significant === 'no') reasons.push('The decision could not reasonably be expected to significantly affect anyone’s rights or interests.');
  if (system.significant === 'unsure') reasons.push('You are not sure whether the decision significantly affects people. Treat it as caught until you have decided, and record why.');
  if (!personal) reasons.push('No personal information about the person is used.');
  const caught = program && personal && (significant || system.significant === 'unsure');
  return { caught, certain: caught ? significant : true, reasons };
}

const listOf = (xs) => xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** Draft wording for the privacy policy, from the caught systems only. */
export function draftPolicy(systems) {
  const caught = systems.filter((s) => assess(s).caught);
  if (!caught.length) return null;
  const solely = caught.filter((s) => s.role === 'solely').map((s) => lc(s.name));
  const assists = caught.filter((s) => s.role === 'assists').map((s) => lc(s.name));
  const info = [...new Set(caught.flatMap((s) => s.info))].map(lc);
  const parts = ['We use computer programs, including rule-based systems, to make some decisions about you, or to substantially and directly help our staff make them, where those decisions could significantly affect your rights or interests.'];
  if (solely.length) parts.push(`Decisions made solely by a computer program: ${listOf(solely)}.`);
  if (assists.length) parts.push(`Decisions a computer program substantially and directly helps us make: ${listOf(assists)}.`);
  parts.push(`The kinds of personal information these programs use are ${listOf(info)}.`);
  return parts.join('\n\n');
}

export function daysUntilDeadline(now = new Date()) {
  const [y, m, d] = DEADLINE.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - today) / 86400000);
}
