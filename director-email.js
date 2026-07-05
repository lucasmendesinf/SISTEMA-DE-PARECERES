(() => {
  const headerKey = 'parecer-cabecalho-professora-v1';

  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

  function ensureFinalTextField() {
    if ($('#headerFinalText')) return;
    const contactField = $('#headerContact')?.closest('.field');
    if (!contactField) return;
    contactField.insertAdjacentHTML('afterend', `
      <div class="field">
        <label>Texto final do parecer <span class="muted">(opcional)</span></label>
        <textarea id="headerFinalText" rows="4" placeholder="Ex.: Sem mais para o momento, colocamo-nos a disposicao para dialogar sobre o desenvolvimento da crianca."></textarea>
        <small class="muted">A professora escolhe em cada parecer se deseja usar este texto.</small>
      </div>
    `);
  }

  const originalLoadHeaderSettings = window.loadHeaderSettings;
  window.loadHeaderSettings = async function loadHeaderSettingsWithDirector() {
    if (typeof originalLoadHeaderSettings === 'function') await originalLoadHeaderSettings();
    ensureFinalTextField();
    const settings = JSON.parse(localStorage.getItem(headerKey) || '{}');
    $('#headerFinalText').value = settings.finalText || '';
  };

  function hookSaveHeaderSettings() {
    ensureFinalTextField();
    const button = $('#saveHeaderSettings');
    if (!button || button.dataset.directorHooked) return;
    button.dataset.directorHooked = '1';
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const logoFile = $('#headerLogo')?.files?.[0];
      const old = JSON.parse(localStorage.getItem(headerKey) || '{}');
      let logo = old.logo || '';
      if (logoFile && typeof fileAsDataUrl === 'function') logo = await fileAsDataUrl(logoFile);
      const settings = {
        ...old,
        network: $('#headerNetwork')?.value.trim() || '',
        school: $('#headerSchool')?.value.trim() || '',
        contact: $('#headerContact')?.value.trim() || '',
        finalText: $('#headerFinalText')?.value.trim() || '',
        logo
      };
      const response = await fetch('api.php?resource=header-settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(settings)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return alert(result.error || 'Nao foi possivel salvar o cabecalho.');
      localStorage.setItem(headerKey, JSON.stringify(settings));
      await window.loadHeaderSettings();
      alert('Cabecalho salvo com sucesso.');
    }, true);
  }

  function reportPeriod() {
    const period = data?.periods?.find(item => item.active) || data?.periods?.[0];
    return period?.name || 'periodo avaliativo';
  }

  function defaultMessage(report) {
    const student = data.students.find(item => String(item.id) === String(report.studentId));
    return `Segue parecer referente ao ${reportPeriod()} da crianca ${student?.name || ''}.`;
  }

  window.openDirectorEmailModal = async function openDirectorEmailModal(id) {
    const report = await (window.ensureReportDetail ? window.ensureReportDetail(id) : Promise.resolve(data.reports.find(item => String(item.id) === String(id))));
    if (!report) return alert('Documento nao encontrado.');
    const message = defaultMessage(report);
    if (typeof open === 'function') {
      open(`
        <h2 class="modal-title">Enviar documento por e-mail</h2>
        <p class="modal-subtitle">Informe o e-mail que recebera o parecer ou portfolio finalizado.</p>
        <div class="field">
          <label>E-mail do destinatario</label>
          <input id="directorEmailRecipient" type="email" placeholder="destinatario@escola.edu.br" autocomplete="email">
        </div>
        <div class="field">
          <label>Mensagem do e-mail</label>
          <textarea id="directorEmailMessage" rows="6">${escapeHtml(message)}</textarea>
        </div>
        <p id="directorEmailStatus" class="profile-message"></p>
        <div class="form-actions">
          <button class="secondary" type="button" onclick="document.querySelector('#modal').close()">Cancelar</button>
          <button class="primary" type="button" onclick="sendReportToDirector(${Number(report.databaseId || report.id)})">Enviar e-mail</button>
        </div>
      `);
    }
  };

  window.sendReportToDirector = async function sendReportToDirector(reportId) {
    const status = $('#directorEmailStatus');
    const recipientEmail = $('#directorEmailRecipient')?.value.trim() || '';
    const message = $('#directorEmailMessage')?.value.trim() || '';
    if (!recipientEmail) {
      if (status) status.textContent = 'Informe o e-mail do destinatario.';
      $('#directorEmailRecipient')?.focus();
      return;
    }
    if (status) status.textContent = 'Enviando...';
    try {
      const response = await fetch('api.php?resource=send-report-email', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({reportId, recipientEmail, message})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Nao foi possivel enviar o e-mail.');
      if (status) status.textContent = result.message || 'E-mail enviado com sucesso.';
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  };

  function decorateReportList() {
    document.querySelectorAll('#reportsList .report-row').forEach(row => {
      const button = row.querySelector('button[onclick^="editReport"]');
      if (!button || row.querySelector('[data-email-director]')) return;
      const match = button.getAttribute('onclick')?.match(/editReport\(([^)]+)\)/);
      const id = match?.[1];
      const status = row.querySelector('.status');
      if (!id || status?.textContent.trim() !== 'Entregue') return;
      button.insertAdjacentHTML('beforebegin', `<button class="secondary" data-email-director type="button" onclick="openDirectorEmailModal(${id})">Enviar e-mail</button>`);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureFinalTextField();
    hookSaveHeaderSettings();
    window.loadHeaderSettings?.();
    decorateReportList();
    const list = $('#reportsList');
    if (list) new MutationObserver(decorateReportList).observe(list, {childList: true, subtree: true});
  });
})();
