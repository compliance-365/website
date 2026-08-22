import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type()==='error') errs.push('console: ' + m.text()); });
await p.goto('http://localhost:4471/checkpoint/?demo=1', { waitUntil: 'networkidle' });
await p.waitForTimeout(1600);

// Generate real audit entries through normal app use, so the chain is built by the app itself
await p.evaluate(async () => {
  // Real app actions that audit -- exercises the same appendAudit path
  // every audit() call funnels into.
  await window.App.acceptRisk('R-001').catch(() => {});
  await window.App.setScanCadence({ value: '14' }).catch(() => {});
  await window.App.toggleEntitlement('soc2').catch(() => {});
});
await p.waitForTimeout(1200);

const chained = await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('checkpoint-demo-v5'));
  const withHash = s.auditLog.filter(e => e.entryHash);
  return { total: s.auditLog.length, withHash: withHash.length, sample: withHash[0] ? withHash[0].entryHash.slice(0,16) : null };
});
console.log('audit entries:', JSON.stringify(chained));

// Verify via the UI
await p.evaluate(() => window.App.go('auditlog'));
await p.waitForTimeout(400);
await p.click('button[data-action="App.verifyAuditChain"]');
await p.waitForTimeout(1200);
const clean = await p.evaluate(() => document.getElementById('auditChainCard').innerText.replace(/\s+/g,' ').slice(0,260));
console.log('CLEAN  ->', JSON.stringify(clean));

// Now TAMPER: edit an entry's content in storage and re-verify
await p.evaluate(() => {
  const K='checkpoint-demo-v5'; const s=JSON.parse(localStorage.getItem(K));
  const i = s.auditLog.findIndex(e => e.entryHash);
  s.auditLog[i].after = 'FORGED VALUE';
  localStorage.setItem(K, JSON.stringify(s));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(1600);
await p.evaluate(() => window.App.go('auditlog'));
await p.waitForTimeout(400);
await p.click('button[data-action="App.verifyAuditChain"]');
await p.waitForTimeout(1200);
const tampered = await p.evaluate(() => document.getElementById('auditChainCard').innerText.replace(/\s+/g,' ').slice(0,260));
console.log('TAMPERED ->', JSON.stringify(tampered));

console.log('errors:', JSON.stringify(errs));
await b.close();
