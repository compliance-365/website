// The questionnaire answers as an Excel workbook, built at build time
// from the same data as /security/questionnaire/ with Checkpoint's own
// workbook writer, so the page and the file cannot disagree.
import type { APIRoute } from 'astro';
import { createRequire } from 'node:module';
import data from '../../data/checkpoint-security-answers.json';

export const GET: APIRoute = () => {
  const L = createRequire(process.cwd() + '/')('./public/checkpoint/lib.js');
  const answers = data.groups.flatMap((g) => g.items.map((it) => [g.name, it.q, it.a]));
  const outbound = data.outbound.map((o) => [o.what, o.when, o.sends, o.to, o.control]);
  const bytes: Uint8Array = L.buildXlsx([
    { name: 'Answers', header: ['Area', 'Question', 'Answer'], rows: answers },
    { name: 'Connections out of tenant', header: ['Connection', 'When', 'What it sends', 'To', 'Control'], rows: outbound },
    { name: 'About', header: ['Item', 'Value'], rows: [['Product', 'Checkpoint by Compliance365'], ['As at', data.asAt], ['Source', 'https://www.compliance365.com.au/security/questionnaire/'], ['Questions about Compliance365 as a company', 'info@compliance365.com.au']] },
  ], { title: 'Checkpoint security questionnaire answers' });
  return new Response(bytes, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
};
