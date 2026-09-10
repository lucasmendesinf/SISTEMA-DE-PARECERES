const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const baseURL = 'https://aiprof.calutec.com.br';
const email = 'teste@gmail.com';
const password = 'teste@teste*';
async function login(page){
  await page.goto(baseURL + '/login.php', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first().fill(email);
  await page.locator('input[type="password"], input[name="senha"], input[name="password"]').first().fill(password);
  await page.locator('button:has-text("Entrar"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(()=>{});
}
async function snapshot(page, name){
  const out = path.resolve('tmp-playwright-' + name + '.png');
  await page.screenshot({ path: out, fullPage: true });
  console.log('SCREENSHOT', out);
}
async function dump(page, label){
  console.log('--- ' + label + ' URL', page.url());
  console.log('TITLE', await page.title());
  const buttons = await page.locator('button, a').evaluateAll(els => els.slice(0,80).map((el, i) => ({i, tag: el.tagName, text: (el.innerText||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,80), href: el.href || '', id: el.id || '', cls: el.className || ''})));
  console.log(JSON.stringify(buttons, null, 2));
}
test('desktop inventory', async ({ page }) => {
  page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR', err.message));
  await login(page);
  await dump(page, 'desktop after login');
  await snapshot(page, 'desktop-home');
});
test('mobile inventory', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR', err.message));
  await login(page);
  await dump(page, 'mobile after login');
  await snapshot(page, 'mobile-home');
  await context.close();
});
