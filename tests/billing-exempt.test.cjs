const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {chromium, devices} = require(require.resolve('playwright', {paths: [root, path.join(root, '.tmp-tests')]}));
let browser;
before(async () => { browser = await chromium.launch({headless: true}); });
after(async () => { await browser?.close(); });

const cycles = [{id: 1, name: 'Mensal', months: 1, amount: 14.90, active: true}];
const invoice = {level: 'danger', status: 'overdue_grace', message: 'Regularize o pagamento.'};
function user(status = 'exempt', extra = {}) {
  return {
    id: 1, name: 'Cliente de teste', email: 'cliente@example.test', phone: '',
    role: 'cliente', active: true, permissions: ['alunos', 'pareceres'], terms: {accepted: true},
    billing: {status, plan: 'Basico', cycle: 'monthly', cycleId: 1, cycleLabel: 'Mensal', amount: 14.90, paymentMethod: 'both', nextDueDate: '2000-01-01', trialDays: 7},
    billingAlert: null, billingWarning: null, billingLock: null, ...extra
  };
}

async function fixture(t, viewport, account, scripts = ['auth-profile.js'], responseBilling = account.billing) {
  const context = await browser.newContext(viewport);
  t.after(() => context.close());
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  const dialogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  const client = user();
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== 'aiprof.test') return route.abort();
    if (url.pathname === '/api.php') {
      const resource = url.searchParams.get('resource');
      const body = request.postData() ? JSON.parse(request.postData()) : null;
      requests.push({resource, method: request.method(), body});
      if (resource === 'users' && request.method() === 'PUT') Object.assign(client, body);
      const responses = {
        auth: account,
        billing: {billing: responseBilling, cycles},
        'billing-cycles': {cycles},
        users: {users: [client], currentUserId: account.id, availablePermissions: ['alunos', 'pareceres']},
        finance: {clients: [client, {...user('pending'), id: 2, name: 'Cliente vencido'}], payments: [], summary: {overdueClients: 1}}
      };
      if (!(resource in responses)) return route.fulfill({status: 404, json: {error: 'Unexpected resource'}});
      return route.fulfill({json: responses[resource]});
    }
    const filename = url.pathname.slice(1);
    if (scripts.includes(filename) || ['style.css', 'user-profile.css', 'billing-lock.css', 'master-users.css', 'finance-admin.css'].includes(filename)) {
      return route.fulfill({path: path.join(root, filename)});
    }
    if (url.pathname !== '/') return route.abort();
    return route.fulfill({contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="pt-BR"><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="style.css"><link rel="stylesheet" href="user-profile.css">
      <link rel="stylesheet" href="billing-lock.css"><link rel="stylesheet" href="master-users.css">
      <link rel="stylesheet" href="finance-admin.css">
      </head><body><aside class="sidebar"><nav></nav></aside><main>
      <header><span id="headerTitle">Inicio</span><button id="sidebarProfileButton">Meus dados</button></header>
      <section id="inicio" class="view active">Inicio</section></main>
      <dialog id="modal"><div id="modalContent"></div></dialog>
      ${scripts.map(script => `<script src="${script}"></script>`).join('')}
      </body></html>`});
  });
  await page.goto('http://aiprof.test/');
  if (scripts.includes('auth-profile.js')) {
    await page.waitForFunction(() => window.PortalCurrentUser?.billing);
    await page.waitForTimeout(550);
  }
  t.after(() => assert.deepEqual(errors, [], 'No JavaScript errors'));
  return {page, requests, dialogs};
}

for (const [name, viewport] of Object.entries({desktop: {viewport: {width: 1366, height: 900}}, mobile: {...devices['Pixel 7']}})) {
  test(`${name}: exempt ignores stale payment alerts, lock and checkout`, async t => {
    const account = user('exempt', {billingAlert: invoice, billingLock: {locked: true, message: invoice.message}, billingWarning: invoice.message});
    const {page, requests, dialogs} = await fixture(t, viewport, account);
    assert.equal(await page.locator('#billingTopBanner, #billingLockModal').count(), 0);
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('billing-locked')), false);
    assert.equal(await page.locator('#perfil.active').count(), 0, 'No forced payment navigation');
    await page.locator('#sidebarProfileButton').click();
    const panel = page.locator('#perfil .billing-panel');
    assert.match(await panel.innerText(), /Isento/);
    assert.doesNotMatch(await panel.innerText(), /14,90|Vencimento|Pix|cartao|pagamento/i);
    assert.equal(await panel.locator('button, input, select').count(), 0);
    assert.equal(await page.locator('#profileForm, #passwordForm').count(), 2, 'Account forms preserved');
    assert.deepEqual(dialogs, []);
    assert.equal(requests.filter(item => item.resource === 'billing' && item.method === 'POST').length, 0);
    await page.screenshot({path: path.join(root, '.tmp-tests', `billing-exempt-${name}.png`), fullPage: true});
  });

  test(`${name}: exempt suppresses standalone warning and refreshed stale status`, async t => {
    const {page, dialogs} = await fixture(t, viewport, user('pending', {billingWarning: invoice.message}), ['auth-profile.js'], user().billing);
    assert.deepEqual(dialogs, []);
    assert.equal(await page.locator('#billingTopBanner, #billingLockModal').count(), 0);
    await page.locator('#sidebarProfileButton').click();
    assert.match(await page.locator('.billing-panel').innerText(), /Isento/);
  });

  test(`${name}: non-exempt overdue account keeps payment block`, async t => {
    const account = user('pending', {billingAlert: {...invoice, status: 'blocked'}, billingLock: {locked: true, message: invoice.message}});
    const {page} = await fixture(t, viewport, account);
    assert.equal(await page.locator('#billingLockModal').count(), 1);
    assert.equal(await page.locator('#billingTopBanner').count(), 1);
    assert.equal(await page.locator('[data-lock-pay-method]').count(), 2);
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('billing-locked')), true);
  });

  test(`${name}: changing administrator exemption clears existing payment overlays`, async t => {
    const account = user('pending', {billingAlert: {...invoice, status: 'blocked'}, billingLock: {locked: true}});
    const {page} = await fixture(t, viewport, account);
    assert.equal(await page.locator('#billingLockModal').count(), 1);
    const exempt = user();
    // The existing terms/profile event also refreshes billing state without a reload.
    await page.route('**/api.php?resource=billing', route => route.fulfill({json: {billing: exempt.billing, cycles: []}}));
    await page.evaluate(exempt => window.dispatchEvent(new CustomEvent('portal:terms-accepted', {detail: exempt})), exempt);
    await page.waitForFunction(() => !document.querySelector('#billingLockModal'));
    assert.equal(await page.locator('#billingTopBanner').count(), 0);
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('billing-locked')), false);
  });

  test(`${name}: administrator reopens and saves exempt account with old trial days`, async t => {
    const {page, requests} = await fixture(t, viewport, user('active', {id: 99, role: 'master'}), ['master-users.js']);
    await page.locator('.sidebar').evaluate(element => element.classList.add('open'));
    await page.locator('[data-view="usuarios"]').click();
    await page.locator('[data-edit-user="1"]').click();
    const status = page.locator('#portalUserForm [name="billingStatus"]');
    assert.equal(await status.inputValue(), 'exempt');
    await page.locator('[name="billingTrialDays"]').fill('10');
    assert.equal(await status.inputValue(), 'exempt', 'Trial field cannot silently override exemption');
    await page.locator('#savePortalUser').click();
    await page.waitForFunction(() => !document.querySelector('#modal').open);
    const saved = requests.find(item => item.resource === 'users' && item.method === 'PUT');
    assert.equal(saved.body.billing.status, 'exempt');
    assert.deepEqual(saved.body.permissions, ['alunos', 'pareceres']);
    await page.locator('[data-edit-user="1"]').click();
    assert.equal(await status.inputValue(), 'exempt');
  });

  test(`${name}: finance does not list exempt account as overdue`, async t => {
    const {page} = await fixture(t, viewport, user('active', {id: 99, role: 'master'}), ['finance-admin.js']);
    await page.waitForSelector('#financeClients .finance-client-card', {state: 'attached'});
    assert.equal(await page.locator('#financeClients .finance-client-card').count(), 1);
    assert.match(await page.locator('#financeClients').textContent(), /Cliente vencido/);
    assert.doesNotMatch(await page.locator('#financeClients').textContent(), /Cliente de teste/);
  });
}
