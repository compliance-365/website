/* A duplicate of public/checkpoint/lib.js's VENDOR_QUESTIONNAIRE, for
 * VendorQuestionnaireSubmit's GET response (which the no-sign-in
 * vendor-questionnaire.html form renders). Not a shared module: this
 * Function App's deployment package is just the azure/ directory (see
 * `func azure functionapp publish` in README.md) — it never includes
 * the parent public/checkpoint/lib.js, so there is no runtime path to
 * import it from here even though both run on Node.
 *
 * Kept in sync by hand, same as PostureMonitor's own header comment
 * already says about mirroring app.js's posture-check logic: different
 * runtimes, no shared module, change one and change the other. If you
 * edit a question's wording or add/remove one, edit
 * public/checkpoint/lib.js's VENDOR_QUESTIONNAIRE too — test/lib.test.mjs
 * checks that file's shape but has no way to know this copy drifted.
 *
 * Deliberately just the question labels/ids/types a vendor needs to see
 * and answer — no `dependsOn` UI hints here; the static form
 * (vendor-questionnaire.html) reveals the AI follow-ups with a plain
 * JS show/hide on the gate question rather than a general dependency
 * system, so this copy only needs to tell it which three ids those are.
 */
const VENDOR_QUESTIONNAIRE = {
  security: {
    label: 'Security',
    questions: [
      { id: 'certification', label: 'Current independent security certification (SOC 2, ISO 27001, or equivalent)?', type: 'yesno' },
      { id: 'certificationDetail', label: 'Which certification, and when does it expire?', type: 'text' },
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
      { id: 'subProcessorsDetail', label: 'If yes, who — can you list them?', type: 'text' },
      { id: 'dataAtContractEnd', label: 'What happens to our data when the contract ends (deletion/return)?', type: 'text' }
    ]
  },
  ai: {
    label: 'AI',
    gateId: 'usesAi',
    questions: [
      { id: 'usesAi', label: 'Does your product/service use AI or machine learning to process our data, or to make decisions that affect us or our customers?', type: 'yesno' },
      { id: 'directInteraction', label: 'Does it interact directly with people (e.g. a chatbot) who might not realise it’s AI?', type: 'yesno' },
      { id: 'essentialServicesAccess', label: 'Does it help decide access to things like credit, employment, insurance or other essential services?', type: 'yesno' },
      { id: 'syntheticContent', label: 'Does it generate synthetic content (text, image, audio, video) that could be mistaken for human-made?', type: 'yesno' }
    ]
  }
};

module.exports = { VENDOR_QUESTIONNAIRE };
