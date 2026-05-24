// Run after deploying: node scripts/indexnow-submit.mjs
const HOST = 'www.compliance365.com.au';
const KEY  = 'e47ea977dfd9435994c74feee9df576a';

const urls = [
  // Core
  'https://www.compliance365.com.au/',
  'https://www.compliance365.com.au/about/',
  'https://www.compliance365.com.au/how-we-work/',
  'https://www.compliance365.com.au/contact/',
  'https://www.compliance365.com.au/book/',
  'https://www.compliance365.com.au/free-roadmap/',
  'https://www.compliance365.com.au/thank-you/',
  // Services
  'https://www.compliance365.com.au/services/',
  'https://www.compliance365.com.au/services/iso27001/',
  'https://www.compliance365.com.au/services/iso27701/',
  'https://www.compliance365.com.au/services/iso42001/',
  'https://www.compliance365.com.au/services/soc2/',
  'https://www.compliance365.com.au/services/essential-eight/',
  'https://www.compliance365.com.au/services/disp-ism-irap/',
  'https://www.compliance365.com.au/services/nist-csf/',
  // Checklists
  'https://www.compliance365.com.au/checklist/',
  'https://www.compliance365.com.au/checklist/iso27001/',
  'https://www.compliance365.com.au/checklist/iso27701/',
  'https://www.compliance365.com.au/checklist/iso42001/',
  'https://www.compliance365.com.au/checklist/soc2/',
  'https://www.compliance365.com.au/checklist/essential-eight/',
  'https://www.compliance365.com.au/checklist/disp-ism-irap/',
  // Resources
  'https://www.compliance365.com.au/resources/',
  'https://www.compliance365.com.au/resources/iso27001-cost-australia/',
  'https://www.compliance365.com.au/resources/inside-statement-of-applicability/',
  'https://www.compliance365.com.au/resources/automating-compliance/',
  'https://www.compliance365.com.au/resources/ai-governance-readiness/',
  'https://www.compliance365.com.au/resources/readiness-checklist/',
  'https://www.compliance365.com.au/resources/what-a-good-ropa-looks-like/',
  'https://www.compliance365.com.au/resources/risk-register-sharepoint/',
  // Blog
  'https://www.compliance365.com.au/blog/',
  'https://www.compliance365.com.au/blog/3-fears-killing-enterprise-deals/',
  'https://www.compliance365.com.au/blog/ai-governance-iso42001-playbook/',
  'https://www.compliance365.com.au/blog/disp-certification-requirements-australia/',
  'https://www.compliance365.com.au/blog/essential-eight-ml2-vs-ml3-australia/',
  'https://www.compliance365.com.au/blog/isms-truths/',
  'https://www.compliance365.com.au/blog/iso-27001-vs-iso-27701-australia/',
  'https://www.compliance365.com.au/blog/iso27001-tips/',
  'https://www.compliance365.com.au/blog/iso27001-vs-soc2-australia/',
  'https://www.compliance365.com.au/blog/iso27701-2025/',
  'https://www.compliance365.com.au/blog/iso27701-privacy-foundations/',
  'https://www.compliance365.com.au/blog/soc2-readiness-microsoft-365-saas-australia/',
  // Case studies & legal
  'https://www.compliance365.com.au/case-studies/',
  'https://www.compliance365.com.au/privacy/',
  'https://www.compliance365.com.au/terms/',
  'https://www.compliance365.com.au/cookies/',
  'https://www.compliance365.com.au/privacy-summary/',
];

const body = JSON.stringify({
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList: urls,
});

console.log(`Submitting ${urls.length} URLs to IndexNow…`);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body,
});

console.log(`Response: ${res.status} ${res.statusText}`);
if (res.status === 200) console.log('All URLs accepted.');
if (res.status === 202) console.log('URLs accepted (Bing will crawl shortly).');
if (res.status >= 400) {
  const text = await res.text();
  console.error('Error:', text);
}
