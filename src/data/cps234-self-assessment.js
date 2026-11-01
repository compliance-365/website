/**
 * cps234-self-assessment.js
 * =========================
 * Questions and scoring for the CPS 234 self-assessment
 * (/cps234-self-assessment/).
 *
 * One question per substantive paragraph of APRA Prudential Standard
 * CPS 234 Information Security (paragraphs 13 to 36, 24 in all), grouped
 * in the same nine domains as /services/cps234/. The wording is ours: a
 * plain question a CISO or risk lead can answer, not the text of the
 * standard. Paragraph numbers are anchored by CPS 234's own
 * cross-reference at paragraph 28 ("paragraphs 27(a) to 27(e)").
 *
 * Nothing leaves the browser. The page keeps answers in localStorage so
 * a visitor can come back to them; there is no submission.
 */

export const ANSWERS = [
  { value: 'yes', label: 'Yes', points: 2 },
  { value: 'partly', label: 'Partly', points: 1 },
  { value: 'no', label: 'No', points: 0 },
  { value: 'unsure', label: 'Not sure', points: 0 },
];

export const DOMAINS = [
  { id: 'roles', name: 'Roles and responsibilities', questions: [
    { p: 13, q: 'Does your Board formally own information security, and is that recorded (for example in a charter, terms of reference or minutes)?' },
    { p: 14, q: 'Are the information security roles of the Board, senior management, governing bodies and individuals defined in writing?' },
  ] },
  { id: 'capability', name: 'Information security capability', questions: [
    { p: 15, q: 'Do you maintain an information security capability that matches the size and extent of the threats to your information assets?' },
    { p: 16, q: 'Do you assess the information security capability of related parties and third parties that manage your information assets?' },
    { p: 17, q: 'Do you actively keep that capability up to date as threats, vulnerabilities and your information assets change?' },
  ] },
  { id: 'policy', name: 'Policy framework', questions: [
    { p: 18, q: 'Do you have an information security policy framework sized to your vulnerabilities and threats?' },
    { p: 19, q: 'Does that framework give direction to everyone with an obligation under it: staff, contractors, related parties and third parties?' },
  ] },
  { id: 'assets', name: 'Asset identification and classification', questions: [
    { p: 20, q: 'Are your information assets, including those managed by related or third parties, classified by criticality and sensitivity?' },
  ] },
  { id: 'controls', name: 'Implementation of controls', questions: [
    { p: 21, q: 'Are your controls sized against the threats, the criticality and sensitivity of each asset, its life-cycle stage and the consequences of an incident?' },
    { p: 22, q: 'Where a related or third party manages your information assets, do you evaluate the design of its controls?' },
  ] },
  { id: 'incident', name: 'Incident management', questions: [
    { p: 23, q: 'Do you have robust mechanisms to detect and respond to information security incidents in a timely way?' },
    { p: 24, q: 'Do you maintain response plans for the incidents you consider could plausibly occur?' },
    { p: 25, q: 'Do those plans run from detection to post-incident review, and include escalation to the Board where needed?' },
    { p: 26, q: 'Are the response plans reviewed and tested every year?' },
  ] },
  { id: 'testing', name: 'Testing control effectiveness', questions: [
    { p: 27, q: 'Do you run a systematic testing program, with its nature and frequency set by the five factors in paragraph 27 (not just an annual penetration test)?' },
    { p: 28, q: 'Where you rely on a third party’s control testing, do you assess whether it is commensurate with those same factors?' },
    { p: 29, q: 'Are testing deficiencies that cannot be remediated in a timely manner escalated to the Board or senior management?' },
    { p: 30, q: 'Is testing carried out by appropriately skilled and functionally independent specialists?' },
    { p: 31, q: 'Do you review whether the testing program itself is sufficient, at least every year?' },
  ] },
  { id: 'audit', name: 'Internal audit', questions: [
    { p: 32, q: 'Does internal audit review both the design and the operating effectiveness of your information security controls?' },
    { p: 33, q: 'Is that assurance given by people with appropriate information security skills?' },
    { p: 34, q: 'Does internal audit assess the information security assurance provided by related and third parties you rely on?' },
  ] },
  { id: 'notify', name: 'APRA notification', questions: [
    { p: 35, q: 'Would you notify APRA within 72 hours of becoming aware of a material information security incident, or one notified to another regulator?' },
    { p: 36, q: 'Would you notify APRA within 10 business days of becoming aware of a material control weakness you cannot remediate in time?' },
  ] },
];

export const QUESTIONS = DOMAINS.flatMap((d) => d.questions.map((q) => ({ ...q, domain: d.id, domainName: d.name })));

/* Paragraphs whose gap is worth calling out on its own, because a
   "no" there is more than a missing control. */
export const CALLOUTS = {
  13: 'Board accountability is the foundation of CPS 234. Without it recorded, every other domain rests on an assumption APRA will test first.',
  30: 'Testing your own controls with the team that built them is not functionally independent. This is one of the most common findings.',
  35: 'The 72-hour clock starts when you become aware, not when you finish investigating. A process that waits for certainty will miss it.',
  36: 'The 10-business-day clock needs no incident at all. It is the obligation entities miss most often, because nothing has visibly gone wrong.',
};

const pointsFor = (v) => (ANSWERS.find((a) => a.value === v) || { points: 0 }).points;

export function bandFor(pct) {
  if (pct >= 85) return { id: 'strong', label: 'Strong position' };
  if (pct >= 60) return { id: 'developing', label: 'Developing' };
  return { id: 'gaps', label: 'Significant gaps' };
}

/** answers: { [paragraph]: 'yes' | 'partly' | 'no' | 'unsure' } */
export function score(answers = {}) {
  const domains = DOMAINS.map((d) => {
    const max = d.questions.length * 2;
    const got = d.questions.reduce((n, q) => n + pointsFor(answers[q.p]), 0);
    const answered = d.questions.filter((q) => answers[q.p]).length;
    return { id: d.id, name: d.name, pct: Math.round((got / max) * 100), answered, total: d.questions.length };
  });
  const answered = QUESTIONS.filter((q) => answers[q.p]).length;
  const got = QUESTIONS.reduce((n, q) => n + pointsFor(answers[q.p]), 0);
  const pct = Math.round((got / (QUESTIONS.length * 2)) * 100);
  /* Gaps: anything not a full yes, unanswered excluded. "No" and "Not
     sure" come before "Partly"; within each, standard order. */
  const rank = { no: 0, unsure: 0, partly: 1 };
  const gaps = QUESTIONS
    .filter((q) => answers[q.p] && answers[q.p] !== 'yes')
    .sort((a, b) => rank[answers[a.p]] - rank[answers[b.p]] || a.p - b.p)
    .map((q) => ({ ...q, answer: answers[q.p], callout: CALLOUTS[q.p] || null }));
  return { pct, band: bandFor(pct), answered, total: QUESTIONS.length, complete: answered === QUESTIONS.length, domains, gaps };
}
