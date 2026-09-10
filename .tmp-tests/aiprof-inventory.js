const { chromium, devices } = require('playwright');
const path = require('path');
const baseURL = 'https://aiprof.calutec.com.br';
const email = 'teste@gmail.com';
const password = 'teste@teste*';
async function login(page){
  await page.goto(baseURL + '/login.php', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first().fill(email);
  await page.locator('input[type="password"], input[name="senha"], input[name="password"]').first().fill(password);
  await page.locator('button:has-text("Entrar"), input[type="submit"]').first().click();
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(()=>{});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(()=>{});
}
async function snapshot(page, name){
  const out = path.resolve('.tmp-tests', name + '.png');
  await page.screenshot({ path: out, fullPage: true });
  console.log('SCREENSHOT', out);
}
async function dump(page, label){
  console.log('--- ' + label + ' URL', page.url());
  console.log('TITLE', await page.title());
  const text = await page.locator('body').innerText({ timeout: 10000 }).catch(e => 'BODY_ERR ' + e.message);
  console.log('BODY_TEXT', text.slice(0, 1500).replace(/\s+/g, ' '));
  const controls = await page.locator('button, a, input, select, textarea').evaluateAll(els => els.slice(0,120).map((el, i) => ({i, tag: el.tagName, type: el.type || '', text: (el.innerText||el.value||el.placeholder||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,80), href: el.href || '', id: el.id || '', name: el.name || '', cls: String(el.className || '').slice(0,80)})));
  console.log('CONTROLS', JSON.stringify(controls, null, 2));
}
async function run(label, contextOptions){
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.on('console', msg => console.log(label, 'CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', err => console.log(label, 'PAGEERROR', err.message));
  page.on('requestfailed', req => console.log(label, 'REQUESTFAILED', req.method(), req.url(), req.failure()?.errorText));
  try {
    await login(page);
    await dump(page, label + ' after login');
    await snapshot(page, label + '-home');
  } finally {
    await context.close();
    await browser.close();
  }
}
(async()=>{
  await run('desktop', { viewport: { width: 1440, height: 900 } });
  await run('mobile', { ...devices['Pixel 7'] });
})().catch(err => { console.error('FATAL', err); process.exit(1); });
