const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { chromium, devices } = require(require.resolve('playwright', {
  paths: [root, path.join(root, '.tmp-tests')]
}));

// Run the production editor in a browser, with isolated data and an in-memory API.
async function openEditor(browser, device, documentType) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (route.request().url() === 'http://aiprof.test/') {
      return route.fulfill({contentType: 'text/html', body: `<!doctype html>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <button id="openGenerator">Novo documento</button><dialog id="modal"></dialog>
        <style>dialog{width:min(850px,90vw);box-sizing:border-box}textarea{width:100%;min-height:100px}
        .form-actions{display:flex;gap:8px;margin:16px 0}.review-box{max-height:400px;overflow:auto}
        .activity-photos img,.image-previews img{width:64px;height:64px}</style>`});
    }
    return route.abort();
  });
  await page.goto('http://aiprof.test/');
  await page.evaluate(type => {
    window.$ = selector => document.querySelector(selector);
    window.esc = value => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
    window.KEY = 'qa-data';
    window.WIZARD_KEY = 'qa-wizard';
    window.HEADER_KEY = 'qa-header';
    window.data = {
      students: [{id: 1, name: 'Aluno QA', classId: 1}], reports: [],
      activities: [], periods: [{name: 'Periodo QA', active: true}]
    };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    canvas.getContext('2d').fillRect(0, 0, 64, 64);
    window.qaPhoto = canvas.toDataURL('image/png');
    window.wizard = {studentId: 1, documentType: type, text: 'Texto principal QA.',
      entries: [], activityIds: [], photos: [qaPhoto], photoNote: 'Vivencia original.'};
    window.persistWizard = () => localStorage.setItem(WIZARD_KEY, JSON.stringify(wizard));
    window.clearWizard = () => localStorage.removeItem(WIZARD_KEY);
    window.wizardClose = () => $('#modal').close();
    window.wizardOpen = html => {
      const modal = $('#modal');
      modal.innerHTML = html;
      if (!modal.open) modal.showModal();
    };
    window.configuredHeaderHtml = () => '';
    window.studentDocumentHeader = () => '';
    window.save = () => {};
    window.render = () => {};
    window.alert = message => { window.qaAlerts.push(message); };
    window.confirm = () => true;
    window.qaAlerts = [];
    window.qaRequests = [];
    window.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      qaRequests.push(body);
      return {ok: true, json: async () => ({id: 123, ok: true})};
    };
  }, documentType);
  for (const file of ['document-type.js', 'report-editor.js']) {
    await page.addScriptTag({content: fs.readFileSync(path.join(root, file), 'utf8')});
  }
  await page.evaluate(() => wizardActivitiesV2());
  return {context, page, errors};
}

async function prepareAvailability(page) {
  await page.evaluate(() => {
    data.students = [1, 2, 3, 4, 5].map(id => ({id, name: 'Aluno QA ' + id, classId: 1}));
    data.periods = [{id: 20, name: 'Semestre atual', active: true}, {id: 10, name: 'Semestre anterior'}];
    data.reports = [
      {id: 101, studentId: 1, periodId: 20, status: 'done'},
      {id: 102, studentId: 2, periodId: 20, status: 'draft'},
      {id: 103, studentId: 3, periodId: 10, status: 'done'},
      {id: 105, studentId: 5, periodId: 20, status: 'done', documentType: 'portfolio'}
    ].map(report => ({documentType: 'parecer', text: 'Documento existente.', hasFullData: true,
      databaseId: report.id, entries: report.status === 'done' ? [{activityIds: [], photoNote: 'Foto QA', photos: [qaPhoto]}] : [], ...report}));
    const originalFetch = window.fetch;
    window.fetch = async (url, options = {}) => {
      if (options.body) return originalFetch(url, options);
      return {ok: true, json: async () => structuredClone(url.includes('resource=periods') ? data.periods : data.reports)};
    };
  });
}

for (const [deviceName, device] of [['desktop', {viewport: {width: 1440, height: 900}}], ['mobile', devices['Pixel 7']]]) {
  test(`${deviceName}: new document blocks students only for the same period and type`, async () => {
    const browser = await chromium.launch();
    try {
      const {page, errors} = await openEditor(browser, device, 'parecer');
      await prepareAvailability(page);
      await page.evaluate(() => wizardStart(true));
      await page.waitForFunction(() => !document.querySelector('#wizardStudent').disabled);
      assert.deepEqual(await page.locator('#wizardStudent option').evaluateAll(options => options.map(option => [option.value, option.disabled])), [
        ['', false], ['1', true], ['2', true], ['3', false], ['4', false], ['5', false]
      ]);
      assert.equal(await page.locator('#wizardStudent').inputValue(), '');
      assert.equal(await page.getByRole('button', {name: 'Pr\u00f3ximo', exact: true}).isDisabled(), true);
      await page.locator('#wizardStudent').selectOption('3');
      await page.locator('#wizardText').fill('Novo semestre.');
      assert.equal(await page.getByRole('button', {name: 'Pr\u00f3ximo', exact: true}).isEnabled(), true);
      const reports = await page.evaluate(() => data.reports.filter(report => String(report.studentId) === '3'));
      assert.deepEqual(reports.map(report => [report.periodId, report.status]).sort(), [[10, 'done'], [20, 'draft']]);
      await page.locator('#wizardDocumentType').selectOption('portfolio');
      assert.equal(await page.locator('#wizardStudent option[value="1"]').isEnabled(), true);
      assert.equal(await page.locator('#wizardStudent option[value="5"]').isDisabled(), true);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(`${deviceName}: continuing drafts and explicitly reopening keep the document editable`, async () => {
    const browser = await chromium.launch();
    try {
      const {page, errors} = await openEditor(browser, device, 'parecer');
      await prepareAvailability(page);
      await page.evaluate(() => editReport(102));
      assert.equal(await page.locator('#wizardStudent').inputValue(), '2');
      assert.equal(await page.locator('#wizardStudent option[value="2"]').isEnabled(), true);
      await page.locator('#wizardText').fill('Rascunho em andamento.');
      await page.getByRole('button', {name: 'Salvar rascunho', exact: true}).click();
      await page.waitForFunction(() => qaRequests.some(request => request.reportId === 102));
      assert.equal(await page.evaluate(() => qaRequests.find(request => request.reportId === 102).periodId), 20);
      await page.evaluate(() => editReport(103));
      await page.getByRole('button', {name: 'Reabrir documento', exact: true}).click();
      await page.locator('#wizardPhotoNote').waitFor();
      await page.getByRole('button', {name: 'Voltar', exact: true}).click();
      assert.equal(await page.locator('#wizardStudent').inputValue(), '3');
      await page.locator('#wizardText').fill('Revisao do semestre anterior.');
      await page.getByRole('button', {name: 'Salvar rascunho', exact: true}).click();
      await page.waitForFunction(() => qaRequests.some(request => request.reportId === 103));
      assert.equal(await page.evaluate(() => qaRequests.find(request => request.reportId === 103).periodId), 10);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(`${deviceName}: delayed autosave does not bind a different selected student`, async () => {
    const browser = await chromium.launch();
    try {
      const {page, errors} = await openEditor(browser, device, 'parecer');
      await prepareAvailability(page);
      await page.evaluate(() => wizardStart(true));
      await page.waitForFunction(() => !document.querySelector('#wizardStudent').disabled);
      await page.locator('#wizardStudent').selectOption('4');
      await page.locator('#wizardText').fill('Texto do aluno 4.');
      await page.evaluate(() => {
        cancelWizardDraftAutosave();
        window.fetch = () => new Promise(resolve => { window.resolveQASave = resolve; });
        window.pendingQASave = autosaveWizardDraft();
      });
      await page.locator('#wizardStudent').selectOption('3');
      await page.locator('#wizardText').fill('Texto do aluno 3.');
      await page.evaluate(async () => {
        cancelWizardDraftAutosave();
        resolveQASave({ok: true, json: async () => ({id: 888})});
        await pendingQASave;
      });
      const state = await page.evaluate(() => ({student: wizard.studentId, id: wizard.databaseId,
        saved: data.reports.find(report => report.databaseId === 888).studentId}));
      assert.equal(state.student, '3');
      assert.equal(state.id, undefined);
      assert.equal(String(state.saved), '4');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(`${deviceName}: failed availability lookup keeps creation blocked`, async () => {
    const browser = await chromium.launch();
    try {
      const {page} = await openEditor(browser, device, 'parecer');
      await prepareAvailability(page);
      await page.evaluate(() => {
        window.fetch = async () => ({ok: false});
        wizardStart(true);
      });
      await page.waitForFunction(() => wizard.availabilityFailed);
      assert.equal(await page.locator('#wizardStudent').isDisabled(), true);
      assert.equal(await page.getByRole('button', {name: 'Pr\u00f3ximo', exact: true}).isDisabled(), true);
      assert.equal(await page.getByRole('button', {name: 'Salvar rascunho', exact: true}).isDisabled(), true);
    } finally { await browser.close(); }
  });
}

async function assertEntries(page, expectedNotes, message) {
  const state = await page.evaluate(() => ({
    entries: wizardEntries(),
    rendered: document.querySelectorAll('.review-box .editable-entry').length,
    alerts: qaAlerts
  }));
  assert.deepEqual(state.alerts, [], 'No errors should be shown');
  assert.deepEqual(state.entries.map(entry => entry.photoNote), expectedNotes, message);
  assert.equal(state.rendered, expectedNotes.length, 'Preview must match saved entries');
  return state.entries;
}

for (const [deviceName, device] of [
  ['desktop', {viewport: {width: 1440, height: 900}}],
  ['mobile', devices['Pixel 7']]
]) {
  for (const type of ['parecer', 'portfolio']) {
    test(`${deviceName} ${type}: editing then finalizing must not duplicate text or images`, async () => {
      const browser = await chromium.launch();
      try {
        const {page, errors} = await openEditor(browser, device, type);
        await page.getByRole('button', {name: 'Pr\u00f3ximo', exact: true}).click();
        await page.getByRole('button', {name: 'Voltar', exact: true}).click();
        await page.getByRole('button', {name: 'Pr\u00f3ximo', exact: true}).click();
        await page.getByRole('button', {name: 'Editar texto/imagens', exact: true}).click();
        await page.locator('#wizardPhotoNote').fill('Vivencia revisada.');
        await page.getByRole('button', {name: 'Salvar e voltar', exact: true}).click();
        await assertEntries(page, ['Vivencia revisada.'], 'Saving an edit must replace the original');

        await page.getByRole('button', {name: 'Editar texto/imagens', exact: true}).click();
        await page.locator('#wizardPhotoNote').fill('Segunda revisao.');
        await page.getByRole('button', {name: 'Pr\u00f3ximo', exact: true}).click();
        await assertEntries(page, ['Segunda revisao.']);
        await page.getByRole('button', {name: 'Finalizar documento', exact: true}).click();
        await page.getByRole('button', {name: 'Voltar para edi\u00e7\u00e3o', exact: true}).waitFor();
        const entries = await assertEntries(page, ['Segunda revisao.'], 'Finalizing an edited entry must not append it again');
        assert.equal(entries[0].photos.length, 1);
        const payload = await page.evaluate(() => qaRequests.findLast(request => !request.draft));
        assert.equal(payload.documentType, type);
        assert.deepEqual(payload.entries, entries, 'The API must receive the same single block');
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    });

    test(`${deviceName} ${type}: back, repeated edits, drafts and add/remove keep block identity`, async () => {
      const browser = await chromium.launch();
      try {
        const {page, errors} = await openEditor(browser, device, type);
        await page.getByRole('button', {name: 'Pr\u00f3ximo', exact: true}).click();
        await page.getByRole('button', {name: 'Editar texto/imagens', exact: true}).click();
        await page.locator('#wizardPhotoNote').fill('Texto editado.');
        await page.getByRole('button', {name: 'Salvar e voltar', exact: true}).click();
        await page.getByRole('button', {name: 'Voltar', exact: true}).click();
        assert.equal(await page.locator('#wizardPhotoNote').inputValue(), 'Texto editado.');
        await page.getByRole('button', {name: 'Pr\u00f3ximo', exact: true}).click();

        for (let i = 0; i < 3; i++) {
          await page.getByRole('button', {name: 'Editar texto/imagens', exact: true}).click();
          await page.locator('#wizardPhotoNote').fill(`Revisao ${i}.`);
          await page.getByRole('button', {name: 'Salvar e voltar', exact: true}).click();
          await assertEntries(page, [`Revisao ${i}.`]);
        }
        await page.getByRole('button', {name: 'Salvar rascunho', exact: true}).click();
        await page.waitForFunction(() => qaAlerts.length === 1);
        const snapshot = await page.evaluate(() => {
          qaAlerts = [];
          return qaRequests.findLast(request => request.draft);
        });
        assert.equal(snapshot.entries.length, 1);
        assert.equal(snapshot.entries[0].photos.length, 1);
        // Restore the saved document as when reopening a draft.
        await page.evaluate(saved => {
          wizard = {...wizard, entries: saved.entries, activityIds: [], photos: [], photoNote: ''};
          delete wizard.editingEntryIndex;
          openDraftWithSavedImages();
        }, snapshot);
        await page.getByRole('button', {name: 'Pr\u00f3ximo', exact: true}).click();
        await assertEntries(page, ['Revisao 2.']);

        await page.getByRole('button', {name: '+ Adicionar nova viv\u00eancia', exact: true}).click();
        await page.locator('#wizardPhotoNote').fill('Revisao 2.');
        await page.getByRole('button', {name: 'Pr\u00f3ximo', exact: true}).click();
        await assertEntries(page, ['Revisao 2.', 'Revisao 2.'], 'Intentionally added identical text must remain a separate block');
        await page.getByRole('button', {name: 'Remover bloco', exact: true}).first().click();
        await assertEntries(page, ['Revisao 2.']);
        await page.getByRole('button', {name: 'Editar texto/imagens', exact: true}).click();
        await page.locator('#wizardPhotoNote').fill('Bloco restante.');
        await page.getByRole('button', {name: 'Salvar e voltar', exact: true}).click();
        await assertEntries(page, ['Bloco restante.']);
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    });
  }
}
