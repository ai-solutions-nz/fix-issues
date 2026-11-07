const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage();
  await p.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await p.screenshot({ path: process.argv[2] + '/01-signup.png' });
  await p.fill('input[placeholder="Your name"]', 'Demo Agency Admin');
  await p.fill('input[type="email"]', 'admin@demo-agency.example');
  await p.fill('input[type="password"]', 'local-demo-password-123');
  await p.getByRole('button', { name: 'Create account' }).click();
  await p.waitForTimeout(6000);
  console.log('after signup', p.url());
  await ctx.storageState({ path: process.argv[2] + '/state.json' });
  await b.close();
})();
