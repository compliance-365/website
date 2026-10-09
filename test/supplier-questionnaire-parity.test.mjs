// The no-sign-in supplier questionnaire (vendor-questionnaire.html) is
// served by the Azure Function from its own copy of the questions, since
// the Function's package never includes lib.js. Its header said nothing
// would notice the copies drifting; this does. A supplier answering by
// link and a practitioner recording answers must see the same questions,
// or the gap rules read answers to questions the supplier never saw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../public/checkpoint/lib.js');
const A = require('../public/checkpoint/azure/lib/vendorQuestions.js').VENDOR_QUESTIONNAIRE;

test('the Function serves the same questions as the app', () => {
  assert.deepEqual(Object.keys(A), Object.keys(L.VENDOR_QUESTIONNAIRE));
  for (const sec of Object.keys(L.VENDOR_QUESTIONNAIRE)) {
    const shape = (s) => ({ label: s.label, questions: s.questions.map((q) => ({ id: q.id, label: q.label, type: q.type })) });
    assert.deepEqual(shape(A[sec]), shape(L.VENDOR_QUESTIONNAIRE[sec]), sec);
  }
});

test('every gap rule reads a yes/no question the supplier is asked', () => {
  const ids = L.VENDOR_QUESTIONNAIRE.security.questions.filter((q) => q.type === 'yesno').map((q) => q.id);
  for (const r of L.SUPPLIER_GAP_RULES) assert.ok(ids.includes(r.id), r.id);
});
