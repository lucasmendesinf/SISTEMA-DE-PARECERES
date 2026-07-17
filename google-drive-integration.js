(() => {
  const driveApi = 'api.php?resource=google-drive';
  const settingsApi = 'api.php?resource=google-drive-settings';
  const uploadApi = 'api.php?resource=google-drive-upload';
  const historyApi = 'api.php?resource=google-drive-history';
  let driveState = null;
  let driveUploads = [];
  const canUseDriveMenu = () => {
    const user = window.PortalBootstrapUser || {};
    return user.role === 'master' || (Array.isArray(user.permissions) && user.permissions.includes('drive'));
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[char]));
  const currentHeader = () => JSON.parse(localStorage.getItem(typeof HEADER_KEY !== 'undefined' ? HEADER_KEY : 'parecer-cabecalho-professora-v1') || '{}');
  const normalizeType = value => typeof normalizeDocumentType === 'function' ? normalizeDocumentType(value) : (value === 'portfolio' ? 'portfolio' : 'parecer');
  const documentLabel = value => normalizeType(value) === 'portfolio' ? 'Portfólio' : 'Parecer';

  async function request(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.href = 'login.php';
      throw new Error('Sessao expirada.');
    }
    if (!response.ok && response.status !== 202) throw new Error(data.error || data.message || 'Nao foi possivel concluir a operacao.');
    return data;
  }

  function toast(message, type = '') {
    document.querySelector('#driveToast')?.remove();
    const box = document.createElement('div');
    box.id = 'driveToast';
    box.className = `drive-toast ${type}`;
    box.textContent = message;
    document.body.append(box);
    setTimeout(() => box.remove(), 5200);
  }

  async function loadDriveState() {
    driveState = await request(driveApi);
    return driveState;
  }

  async function loadDriveHistory() {
    const data = await request(historyApi);
    driveUploads = data.uploads || [];
    renderDriveHistory();
  }

  function ensureDriveNav() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav || document.querySelector('.nav-item[data-view="drive-arquivos"]')) return;
    const button = document.createElement('button');
    button.className = 'nav-item';
    button.dataset.view = 'drive-arquivos';
    button.type = 'button';
    button.innerHTML = '<span>▣</span> Arquivos no Drive';
    nav.append(button);
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'drive-arquivos'));
      const title = document.querySelector('#headerTitle');
      if (title) title.textContent = 'Arquivos no Drive';
      document.querySelector('.sidebar')?.classList.remove('open');
      document.body.classList.remove('menu-open');
      loadDriveHistory();
    });
  }

  function ensureDriveView() {
    if (document.querySelector('#drive-arquivos')) return;
    const section = document.createElement('section');
    section.id = 'drive-arquivos';
    section.className = 'view';
    section.innerHTML = `
      <div class="page-title">
        <div>
          <p class="eyebrow">GOOGLE DRIVE</p>
          <h1>Arquivos no Drive</h1>
          <p>Acompanhe os documentos enviados automaticamente para a conta conectada.</p>
        </div>
        <button class="secondary" id="refreshDriveHistory" type="button">Atualizar</button>
      </div>
      <div class="panel"><div id="driveHistoryList" class="drive-history-grid"></div></div>`;
    document.querySelector('main')?.append(section);
    section.querySelector('#refreshDriveHistory')?.addEventListener('click', loadDriveHistory);
    section.querySelector('#driveHistoryList')?.addEventListener('click', async event => {
      const copy = event.target.closest('[data-drive-copy]');
      if (copy) {
        await navigator.clipboard.writeText(copy.dataset.driveCopy || '');
        toast('Link copiado.');
      }
      const retry = event.target.closest('[data-drive-retry]');
      if (retry) {
        await request(historyApi, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: retry.dataset.driveRetry})});
        toast('Reenvio concluido.');
        loadDriveHistory();
      }
      const remove = event.target.closest('[data-drive-remove]');
      if (remove && confirm('Excluir este item apenas do historico?')) {
        await request(`${historyApi}&id=${encodeURIComponent(remove.dataset.driveRemove)}`, {method: 'DELETE'});
        loadDriveHistory();
      }
    });
  }

  function renderDriveHistory() {
    const list = document.querySelector('#driveHistoryList');
    if (!list) return;
    const labels = {uploaded: 'Enviado', error: 'Erro', queued: 'Na fila', uploading: 'Enviando'};
    list.innerHTML = driveUploads.map(item => `
      <article class="drive-file-card">
        <header>
          <div><h3>${escapeHtml(item.fileName)}</h3><p>${escapeHtml(item.student || 'Aluno não informado')} · ${escapeHtml(item.folder || 'Pasta não informada')}</p></div>
          <span class="drive-status ${escapeHtml(item.status)}">${escapeHtml(labels[item.status] || item.status)}</span>
        </header>
        ${item.error ? `<p>${escapeHtml(item.error)}</p>` : ''}
        <p>Data: ${escapeHtml(item.uploadedAt || item.createdAt || '-')}</p>
        <div class="drive-file-actions">
          ${item.link ? `<a class="secondary" href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Abrir no Drive</a><button class="secondary" type="button" data-drive-copy="${escapeHtml(item.link)}">Copiar link</button>` : ''}
          ${item.status === 'error' ? `<button class="secondary" type="button" data-drive-retry="${item.id}">Reenviar</button>` : ''}
          <button class="secondary danger" type="button" data-drive-remove="${item.id}">Excluir histórico</button>
        </div>
      </article>`).join('') || '<p class="muted">Nenhum arquivo enviado ao Drive ainda.</p>';
  }

  function renderDriveHistory() {
    const list = document.querySelector('#driveHistoryList');
    if (!list) return;
    const labels = {uploaded: 'Enviado', error: 'Erro', queued: 'Na fila', uploading: 'Enviando'};
    const baseFileName = name => String(name || '').replace(/\.(pdf|docx)$/i, '');
    const fileFormat = name => {
      const match = String(name || '').match(/\.(pdf|docx)$/i);
      return match ? match[1].toUpperCase() : 'Arquivo';
    };
    const groups = driveUploads.reduce((acc, item) => {
      const student = item.student || 'Aluno nao informado';
      if (!acc.has(student)) acc.set(student, []);
      acc.get(student).push(item);
      return acc;
    }, new Map());
    list.innerHTML = [...groups.entries()].map(([student, files], index) => `
      <article class="drive-student-card ${index % 2 === 0 ? 'tinted' : ''}">
        <header>
          <div><p class="eyebrow">ALUNO</p><h3>${escapeHtml(student)}</h3></div>
          <span>${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'}</span>
        </header>
        <div class="drive-student-files">
          ${[...files.reduce((acc, item) => {
            const key = baseFileName(item.fileName);
            if (!acc.has(key)) acc.set(key, []);
            acc.get(key).push(item);
            return acc;
          }, new Map()).entries()].map(([title, documentFiles]) => `
            <section class="drive-document-group">
              <div class="drive-document-title">
                <strong>${escapeHtml(title)}</strong>
                <span>${documentFiles.length} ${documentFiles.length === 1 ? 'formato' : 'formatos'}</span>
              </div>
              <div class="drive-document-formats">
                ${documentFiles.map(item => `
                  <div class="drive-file-row">
                    <div>
                      <strong>${escapeHtml(fileFormat(item.fileName))}</strong>
                      <p>${escapeHtml(item.folder || 'Pasta nao informada')} - ${escapeHtml(item.uploadedAt || item.createdAt || '-')}</p>
                      ${item.error ? `<p class="drive-error">${escapeHtml(item.error)}</p>` : ''}
                    </div>
                    <span class="drive-status ${escapeHtml(item.status)}">${escapeHtml(labels[item.status] || item.status)}</span>
                    <div class="drive-file-actions">
                      ${item.link ? `<a class="secondary" href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Abrir</a><button class="secondary" type="button" data-drive-copy="${escapeHtml(item.link)}">Copiar link</button>` : ''}
                      ${item.status === 'error' ? `<button class="secondary" type="button" data-drive-retry="${item.id}">Reenviar</button>` : ''}
                      <button class="secondary danger" type="button" data-drive-remove="${item.id}">Excluir historico</button>
                    </div>
                  </div>`).join('')}
              </div>
            </section>`).join('')}
        </div>
      </article>`).join('') || '<p class="muted">Nenhum arquivo enviado ao Drive ainda.</p>';
  }

  function renderDriveConfig() {
    const config = document.querySelector('#configuracoes');
    if (!config || config.querySelector('#googleDrivePanel')) return;
    const panel = document.createElement('div');
    panel.id = 'googleDrivePanel';
    panel.className = 'panel drive-panel';
    panel.innerHTML = '<div class="profile-subtitle"><h3>Integração com Google Drive</h3><p>Conecte sua conta Google para salvar pareceres e portfólios automaticamente.</p></div><div id="googleDriveUserBox"></div><div id="googleDriveAdminBox"></div>';
    config.append(panel);
    panel.addEventListener('click', handleDrivePanelClick);
    refreshDrivePanel();
  }

  async function refreshDrivePanel() {
    await loadDriveState().catch(() => null);
    const userBox = document.querySelector('#googleDriveUserBox');
    const adminBox = document.querySelector('#googleDriveAdminBox');
    if (!userBox || !driveState) return;
    const connected = !!driveState.connected;
    const configured = !!driveState.settings?.configured;
    userBox.innerHTML = `
      <div class="drive-status-line"><span class="drive-dot ${connected ? 'connected' : configured ? 'pending' : ''}"></span>${connected ? `Google Drive conectado: ${escapeHtml(driveState.account?.email || '')}` : configured ? 'Google Drive disponível para conexão' : 'Google Drive ainda não configurado pelo administrador'}</div>
      <p class="muted">Pasta padrão: ${escapeHtml(driveState.account?.folderName || 'Será criada automaticamente no primeiro envio')}</p>
      <div class="drive-actions">
        ${configured ? `<a class="primary" href="api.php?resource=google-drive-oauth&action=start">Conectar Google Drive</a>` : ''}
        ${connected ? `<a class="secondary" href="api.php?resource=google-drive-oauth&action=start">Reconectar</a><button class="secondary" type="button" data-drive-action="folder">Alterar pasta</button><button class="secondary danger" type="button" data-drive-action="disconnect">Desconectar</button>` : ''}
      </div>`;
    if (document.body.dataset.role === 'master') {
      const settings = await request(settingsApi).catch(() => driveState.settings || {});
      adminBox.innerHTML = `
        <div class="profile-subtitle" style="margin-top:22px"><h3>Configuração administrativa</h3><p>Use credenciais OAuth 2.0 do tipo aplicação Web no Google Cloud.</p></div>
        <div class="form-grid">
          <label class="checkline"><input id="driveEnabled" type="checkbox" ${settings.enabled ? 'checked' : ''}> Habilitar Google Drive</label>
          <label class="checkline"><input id="driveRequired" type="checkbox" ${settings.required ? 'checked' : ''}> Obrigar integração</label>
          <div class="field"><label>Client ID</label><input id="driveClientId" value="${escapeHtml(settings.clientId || '')}" placeholder="${escapeHtml(settings.clientIdMasked || 'Client ID do Google')}"></div>
          <div class="field"><label>Client Secret</label><input id="driveClientSecret" type="password" placeholder="Informe para salvar/alterar"></div>
          <p class="drive-template-help">Redirect URI no Google Cloud: ${escapeHtml(`${location.origin}${location.pathname.replace(/index\\.php$/,'')}api.php?resource=google-drive-oauth&action=callback`)}</p>
          <div class="field"><label>Estrutura padrão de pastas</label><textarea id="driveFolderTemplate" rows="4">${escapeHtml(settings.folderTemplate || '')}</textarea><p class="drive-template-help">Use uma pasta por linha. Variáveis: {Aluno}, {Turma}, {Professor}, {Escola}, {Ano}, {Mes}, {Data}, {Tipo}</p></div>
          <div class="field"><label>Modelo do nome dos arquivos</label><input id="driveFilenameTemplate" value="${escapeHtml(settings.filenameTemplate || '')}"></div>
          <p id="driveSettingsMessage" class="profile-message"></p>
          <div class="form-actions"><button class="primary" type="button" data-drive-action="save-settings">Salvar Google Drive</button></div>
        </div>`;
    }
  }

  async function handleDrivePanelClick(event) {
    const button = event.target.closest('[data-drive-action]');
    if (!button) return;
    const action = button.dataset.driveAction;
    if (action === 'disconnect' && confirm('Desconectar a conta Google Drive?')) {
      await request(driveApi, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'disconnect'})});
      toast('Google Drive desconectado.');
      refreshDrivePanel();
    }
    if (action === 'folder') {
      const folderName = prompt('Nome da pasta padrão no Google Drive. Deixe em branco para usar a estrutura automática.');
      if (folderName === null) return;
      await request(driveApi, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'set_folder', folderName})});
      toast('Pasta atualizada.');
      refreshDrivePanel();
    }
    if (action === 'save-settings') {
      const payload = {
        enabled: document.querySelector('#driveEnabled')?.checked,
        required: document.querySelector('#driveRequired')?.checked,
        clientId: document.querySelector('#driveClientId')?.value,
        clientSecret: document.querySelector('#driveClientSecret')?.value,
        folderTemplate: document.querySelector('#driveFolderTemplate')?.value,
        filenameTemplate: document.querySelector('#driveFilenameTemplate')?.value
      };
      const data = await request(settingsApi, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      document.querySelector('#driveSettingsMessage').textContent = 'Configurações salvas.';
      driveState = {...driveState, settings: data.settings};
    }
  }

  function reportContext(report) {
    const student = data.students.find(item => String(item.id) === String(report.studentId));
    const period = data.periods.find(item => item.active) || data.periods[0];
    const className = student?.className || data.classes.find(item => String(item.id) === String(student?.classId))?.name || 'Turma não informada';
    const header = currentHeader();
    return {student, period, className, header};
  }

  function styledFields(fields) {
    const header = currentHeader();
    return {
      ...fields,
      documentFont: header.documentFont || 'Arial',
      documentFontSize: header.documentFontSize || 12,
      detailColor: header.detailColor || '#253c31'
    };
  }

  async function documentBlob(endpoint, fields) {
    const body = new URLSearchParams();
    Object.entries(fields).forEach(([key, value]) => body.set(key, value ?? ''));
    const response = await fetch(endpoint, {method: 'POST', body});
    if (!response.ok) throw new Error(await response.text() || 'Falha ao gerar arquivo.');
    return response.blob();
  }

  async function buildReportFiles(report) {
    await window.ensureReportDetail?.(report.id);
    const fullReport = data.reports.find(item => String(item.id) === String(report.id) || String(item.databaseId) === String(report.databaseId)) || report;
    const {student, period, className, header} = reportContext(fullReport);
    if (!student) throw new Error('Aluno não localizado para envio ao Drive.');
    const label = documentLabel(fullReport.documentType);
    const baseFields = styledFields({
      name: student.name,
      birthDate: student.birthDate || '',
      className,
      period: period?.name || 'Período avaliativo',
      text: fullReport.text || '',
      documentType: normalizeType(fullReport.documentType),
      studentPhoto: student.photo || '',
      entries: JSON.stringify(fullReport.entries || []),
      finalText: fullReport.useFinalText ? (fullReport.finalText || header.finalText || '') : '',
      headerNetwork: header.network || '',
      headerSchool: header.school || '',
      headerContact: header.contact || '',
      headerLogo: header.logo || ''
    });
    const pdfEntries = await Promise.all((fullReport.entries || []).map(async entry => ({...entry, photos: (await Promise.all((entry.photos || []).map(src => typeof pdfJpeg === 'function' ? pdfJpeg(src) : src))).filter(Boolean)})));
    const pdfFields = {...baseFields, studentPhoto: typeof pdfJpeg === 'function' ? await pdfJpeg(student.photo || '') : student.photo || '', headerLogo: typeof pdfJpeg === 'function' ? await pdfJpeg(header.logo || '') : header.logo || '', entries: JSON.stringify(pdfEntries)};
    const docx = await documentBlob('download_parecer.php', baseFields);
    const pdf = await documentBlob('download_pdf.php', pdfFields);
    return {student, className, header, label, docx, pdf, report: fullReport};
  }

  async function uploadOne(fileBlob, fileType, context) {
    const form = new FormData();
    form.append('reportId', context.report.databaseId || context.report.id);
    form.append('fileType', fileType);
    form.append('studentName', context.student.name);
    form.append('className', context.className);
    form.append('schoolName', context.header.school || '');
    form.append('documentLabel', context.label);
    form.append('year', new Date().getFullYear());
    form.append('file', fileBlob, `${context.label}.${fileType}`);
    return request(uploadApi, {method: 'POST', body: form});
  }

  async function uploadReportToDrive(report) {
    try {
      const state = driveState || await loadDriveState();
      if (!state.settings?.enabled) return;
      if (!state.connected) {
        if (state.settings?.required) alert('Conecte o Google Drive para enviar o documento.');
        return;
      }
      toast('Enviando para Google Drive...', 'warning');
      const context = await buildReportFiles(report);
      await window.saveOfficialReportFiles?.(context.report, context);
      const docx = await uploadOne(context.docx, 'docx', context);
      const pdf = await uploadOne(context.pdf, 'pdf', context);
      if (docx.ok && pdf.ok) toast('Parecer enviado com sucesso para seu Google Drive.');
      else toast('Documento ficou na fila do Google Drive para reenvio.', 'warning');
      loadDriveHistory().catch(() => {});
    } catch (error) {
      console.warn(error);
      toast(error.message || 'Erro ao enviar para Google Drive.', 'error');
    }
  }

  function openDeliveryChoice(state) {
    return new Promise(resolve => {
      document.querySelector('#driveDeliveryChoice')?.remove();
      const canDrive = !!state?.settings?.enabled && !!state?.connected;
      const canConfigure = !!state?.settings?.enabled && !state?.connected;
      const modal = document.createElement('div');
      modal.id = 'driveDeliveryChoice';
      modal.className = 'drive-choice-backdrop';
      modal.innerHTML = `
        <div class="drive-choice-modal" role="dialog" aria-modal="true" aria-labelledby="driveChoiceTitle">
          <button class="drive-choice-close" type="button" data-choice="cancel" aria-label="Fechar">x</button>
          <p class="eyebrow">FINALIZAR DOCUMENTO</p>
          <h2 id="driveChoiceTitle">Como deseja salvar este documento?</h2>
          <p>Escolha se quer enviar os arquivos para o Google Drive conectado ou baixar no computador.</p>
          ${canConfigure ? '<p class="drive-choice-warning">Google Drive habilitado, mas ainda nao conectado nesta conta.</p>' : ''}
          <div class="drive-choice-actions">
            ${canDrive ? '<button class="primary" type="button" data-choice="drive">Salvar no Drive</button>' : ''}
            <button class="secondary" type="button" data-choice="download">Baixar arquivos</button>
            ${canConfigure ? '<button class="secondary" type="button" data-choice="config">Conectar Drive</button>' : ''}
          </div>
        </div>`;
      document.body.append(modal);
      const finish = choice => {
        modal.remove();
        resolve(choice);
      };
      modal.addEventListener('click', event => {
        if (event.target === modal) return finish('cancel');
        const button = event.target.closest('[data-choice]');
        if (button) finish(button.dataset.choice);
      });
      modal.querySelector('[data-choice="drive"], [data-choice="download"], [data-choice="config"]')?.focus();
    });
  }

  async function deliverReportWithoutDownload(report) {
    window.cancelWizardDraftAutosave?.();
    const databaseId = report?.databaseId || report?.id;
    if (!databaseId) throw new Error('Este parecer ainda nao foi salvo no banco de dados.');
    const response = await fetch('api.php?resource=reports', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({deliverId: databaseId})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Falha ao entregar.');
    report.status = 'done';
    report.deliveredAt = new Date().toISOString();
    clearWizard?.();
    wizardClose?.();
    save?.();
    setTimeout(() => loadReports?.(), 1200);
  }

  function wrapDeliverReport() {
    const original = window.deliverReport;
    if (typeof original !== 'function' || original.__driveWrapped) return;
    const withTimeout = (promise, ms, fallback = null) => new Promise(resolve => {
      const timer = setTimeout(() => resolve(fallback), ms);
      Promise.resolve(promise)
        .then(value => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(fallback);
        });
    });
    const setButtonLoading = (button, loading) => {
      if (!button) return;
      if (loading) {
        button.dataset.originalText = button.dataset.originalText || button.textContent;
        button.disabled = true;
        button.textContent = 'Finalizando...';
        return;
      }
      button.disabled = false;
      button.textContent = button.dataset.originalText || 'Entregar documento';
    };
    window.deliverReport = async function deliverReportWithDrive(id) {
      const button = document.activeElement?.tagName === 'BUTTON' ? document.activeElement : null;
      setButtonLoading(button, true);
      try {
        const state = driveState || await withTimeout(loadDriveState(), 4500, null);
        const report = data.reports.find(item => String(item.id) === String(id) || String(item.databaseId) === String(id));
        if (state?.settings?.enabled && state?.settings?.required && !state.connected) {
          toast('Conecte o Google Drive antes de finalizar este documento.', 'warning');
          document.querySelector('.nav-item[data-view="configuracoes"]')?.click();
          return null;
        }
        if (!state?.settings?.enabled) return await original(id);
        setButtonLoading(button, false);
        wizardClose?.();
        const choice = await openDeliveryChoice(state);
        if (choice === 'cancel') return null;
        if (choice === 'config') {
          document.querySelector('.nav-item[data-view="configuracoes"]')?.click();
          return null;
        }
        setButtonLoading(button, true);
        if (choice === 'download') return await original(id);
        if (!report) return await original(id);
        await deliverReportWithoutDownload(report);
        await uploadReportToDrive(report);
      } catch (error) {
        console.error(error);
        alert(error.message || 'Nao foi possivel finalizar o documento.');
      } finally {
        setButtonLoading(button, false);
      }
      return null;
    };
    window.deliverReport.__driveWrapped = true;
  }

  async function init() {
    if (canUseDriveMenu()) {
      ensureDriveNav();
      ensureDriveView();
    }
    renderDriveConfig();
    wrapDeliverReport();
    await loadDriveState().catch(() => null);
  }

  window.addEventListener('portal:user-ready', init);
  document.addEventListener('DOMContentLoaded', () => setTimeout(wrapDeliverReport, 500));
})();
