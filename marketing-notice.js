(() => {
  const api = 'api.php?resource=marketing-notice';
  const fonts = ['DM Sans', 'Arial', 'Georgia', 'Verdana', 'Times New Roman'];
  let activeNotice = {};
  let marketingNotices = [];
  let editingNoticeId = '';
  let defaultMarketingCardHtml = '';

  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return 'Sem data';
    const [year, month, day] = String(value).split('-');
    return day && month && year ? `${day}/${month}/${year}` : value;
  }

  function isActiveNotice(notice) {
    if (!notice?.enabled) return false;
    const today = todayIso();
    if (notice.startDate && today < notice.startDate) return false;
    if (notice.endDate && today > notice.endDate) return false;
    return Boolean(notice.title || notice.body || notice.image);
  }

  function noticeStatus(notice) {
    if (!notice?.enabled) return 'Inativo';
    const today = todayIso();
    if (notice.startDate && today < notice.startDate) return 'Agendado';
    if (notice.endDate && today > notice.endDate) return 'Encerrado';
    return 'Ativo';
  }

  async function fileAsDataUrl(file) {
    if (!file) return '';
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
  }

  async function request(options = {}) {
    const response = await fetch(api, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel salvar o informativo.');
    return data;
  }

  function applyNoticeData(data) {
    if (Array.isArray(data?.notices)) {
      marketingNotices = data.notices;
      activeNotice = data.notice || {};
      return;
    }
    activeNotice = data || {};
    marketingNotices = activeNotice?.id ? [activeNotice] : [];
  }

  function renderMarketingCard() {
    if (window.PortalCurrentUser?.role === 'master') return;
    const card = document.querySelector('#inicio .highlight');
    if (!card) return;
    if (!defaultMarketingCardHtml) defaultMarketingCardHtml = card.innerHTML;
    const notice = activeNotice;
    if (!isActiveNotice(notice)) {
      card.classList.remove('marketing-active');
      card.style.fontFamily = '';
      card.style.color = '';
      card.innerHTML = defaultMarketingCardHtml;
      return;
    }
    card.classList.add('marketing-active');
    card.style.fontFamily = `'${notice.fontFamily || 'DM Sans'}', sans-serif`;
    card.style.color = notice.textColor || '#236b52';
    card.innerHTML = `
      <p class="eyebrow" style="color:${escapeHtml(notice.textColor || '#236b52')}">${escapeHtml(notice.eyebrow || 'INFORMATIVO')}</p>
      <h2 style="color:${escapeHtml(notice.textColor || '#236b52')};font-family:'${escapeHtml(notice.fontFamily || 'DM Sans')}',sans-serif">${escapeHtml(notice.title)}</h2>
      ${notice.image ? `<img class="marketing-notice-image" src="${notice.image}" alt="Informativo">` : ''}
      <p style="color:${escapeHtml(notice.textColor || '#236b52')}">${escapeHtml(notice.body)}</p>`;
  }

  function ensureMarketingAdminView() {
    if (document.querySelector('#informativoMarketing')) return;
    const section = document.createElement('section');
    section.id = 'informativoMarketing';
    section.className = 'view';
    section.innerHTML = `
      <div class="page-title">
        <div>
          <p class="eyebrow">LOGIN MASTER</p>
          <h1>Dica Pedagogica</h1>
          <p>Cadastre informativos com data de inicio e termino para aparecerem para as professoras.</p>
        </div>
      </div>
      <div class="marketing-admin-layout">
        <div class="panel marketing-admin-panel">
          <div class="form-grid">
            <label class="checkline"><input id="marketingEnabled" type="checkbox" checked> Informativo ativo</label>
            <div class="field"><label>Etiqueta</label><input id="marketingEyebrow" placeholder="Ex.: DICA PEDAGOGICA"></div>
            <div class="field"><label>Titulo</label><input id="marketingTitle" placeholder="Ex.: Proposta para a semana"></div>
            <div class="field"><label>Texto</label><textarea id="marketingBody" rows="5" placeholder="Escreva o informativo que sera exibido para as professoras"></textarea></div>
            <div class="form-grid two-columns">
              <div class="field"><label>Cor do texto</label><input id="marketingTextColor" type="color" value="#236b52"></div>
              <div class="field"><label>Fonte</label><select id="marketingFont">${fonts.map(font => `<option value="${font}">${font}</option>`).join('')}</select></div>
              <div class="field"><label>Data de inicio</label><input id="marketingStartDate" type="date"></div>
              <div class="field"><label>Data de termino</label><input id="marketingEndDate" type="date"></div>
            </div>
            <div class="field"><label>Imagem do informativo</label><input id="marketingImage" type="file" accept="image/*"><div id="marketingImagePreview" class="image-previews"></div></div>
          </div>
          <div class="marketing-preview" id="marketingPreview"></div>
          <p id="marketingMessage" class="profile-message"></p>
          <div class="form-actions">
            <button class="secondary" id="newMarketingNotice" type="button">Novo informativo</button>
            <button class="primary" id="saveMarketingNotice" type="button">Salvar informativo</button>
          </div>
        </div>
        <div class="panel marketing-list-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">CADASTRADOS</p>
              <h2>Informativos</h2>
            </div>
          </div>
          <div id="marketingNoticeList" class="marketing-notice-list"></div>
        </div>
      </div>`;
    document.querySelector('main')?.append(section);
    section.querySelectorAll('input, textarea, select').forEach(input => input.addEventListener('input', updatePreview));
    section.querySelector('#marketingImage').addEventListener('change', updatePreview);
    section.querySelector('#saveMarketingNotice').addEventListener('click', saveNotice);
    section.querySelector('#newMarketingNotice').addEventListener('click', resetForm);
    section.querySelector('#marketingNoticeList').addEventListener('click', handleListClick);
  }

  function ensureMarketingNav() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav || document.querySelector('.nav-item[data-view="informativoMarketing"]')) return;
    const button = document.createElement('button');
    button.className = 'nav-item';
    button.dataset.view = 'informativoMarketing';
    button.type = 'button';
    button.innerHTML = '<span aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a2 2 0 0 0 2 2h2l4 5v-5h2l7 3V6l-7 3H5a2 2 0 0 0-2 2Z"/><path d="M17 9.5v5"/><path d="M7 15v4"/></svg></span> Informativo';
    nav.append(button);
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'informativoMarketing'));
      const title = document.querySelector('#headerTitle');
      if (title) title.textContent = 'Informativo';
      window.scrollTo(0, 0);
    });
  }

  function setField(selector, value) {
    const field = document.querySelector(selector);
    if (field) field.value = value || '';
  }

  function fillForm(notice = {}) {
    editingNoticeId = notice.id || '';
    const enabled = document.querySelector('#marketingEnabled');
    if (enabled) enabled.checked = notice.enabled !== false;
    setField('#marketingEyebrow', notice.eyebrow || 'DICA PEDAGOGICA');
    setField('#marketingTitle', notice.title || '');
    setField('#marketingBody', notice.body || '');
    setField('#marketingTextColor', notice.textColor || '#236b52');
    setField('#marketingFont', notice.fontFamily || 'DM Sans');
    setField('#marketingStartDate', notice.startDate || '');
    setField('#marketingEndDate', notice.endDate || '');
    const file = document.querySelector('#marketingImage');
    if (file) file.value = '';
    const preview = document.querySelector('#marketingImagePreview');
    if (preview) preview.innerHTML = notice.image ? `<img src="${notice.image}" alt="Imagem atual">` : '';
    updatePreview();
  }

  function resetForm() {
    fillForm({});
    const message = document.querySelector('#marketingMessage');
    if (message) message.textContent = '';
  }

  async function formNotice() {
    const editing = marketingNotices.find(notice => String(notice.id) === String(editingNoticeId)) || {};
    const file = document.querySelector('#marketingImage')?.files?.[0];
    const image = await fileAsDataUrl(file) || editing.image || '';
    return {
      id: editingNoticeId,
      enabled: document.querySelector('#marketingEnabled')?.checked || false,
      eyebrow: document.querySelector('#marketingEyebrow')?.value.trim() || 'DICA PEDAGOGICA',
      title: document.querySelector('#marketingTitle')?.value.trim() || '',
      body: document.querySelector('#marketingBody')?.value.trim() || '',
      textColor: document.querySelector('#marketingTextColor')?.value || '#236b52',
      fontFamily: document.querySelector('#marketingFont')?.value || 'DM Sans',
      startDate: document.querySelector('#marketingStartDate')?.value || '',
      endDate: document.querySelector('#marketingEndDate')?.value || '',
      image
    };
  }

  async function updatePreview() {
    const preview = document.querySelector('#marketingPreview');
    if (!preview) return;
    const notice = await formNotice();
    preview.style.fontFamily = `'${notice.fontFamily}', sans-serif`;
    preview.innerHTML = `
      <p class="eyebrow" style="color:${escapeHtml(notice.textColor)}">${escapeHtml(notice.eyebrow)}</p>
      <h2 style="color:${escapeHtml(notice.textColor)};font-family:'${escapeHtml(notice.fontFamily)}',sans-serif">${escapeHtml(notice.title || 'Titulo do informativo')}</h2>
      ${notice.image ? `<img src="${notice.image}" alt="Previa">` : ''}
      <p style="color:${escapeHtml(notice.textColor)}">${escapeHtml(notice.body || 'Texto do informativo para as professoras.')}</p>`;
  }

  function renderNoticeList() {
    const list = document.querySelector('#marketingNoticeList');
    if (!list) return;
    if (!marketingNotices.length) {
      list.innerHTML = '<p class="muted">Nenhum informativo cadastrado ainda.</p>';
      return;
    }
    list.innerHTML = marketingNotices.map(notice => {
      const status = noticeStatus(notice);
      return `
        <article class="marketing-notice-item">
          ${notice.image ? `<img src="${notice.image}" alt="Imagem do informativo">` : ''}
          <div>
            <div class="notice-item-head">
              <strong>${escapeHtml(notice.title)}</strong>
              <span class="notice-status status-${status.toLowerCase()}">${status}</span>
            </div>
            <p>${escapeHtml(notice.body)}</p>
            <small>${formatDate(notice.startDate)} ate ${formatDate(notice.endDate)}</small>
            <div class="notice-item-actions">
              <button class="secondary" type="button" data-edit-notice="${escapeHtml(notice.id)}">Editar</button>
              <button class="secondary danger" type="button" data-delete-notice="${escapeHtml(notice.id)}">Excluir</button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  async function saveNotice() {
    const message = document.querySelector('#marketingMessage');
    if (message) message.textContent = '';
    try {
      const notice = await formNotice();
      const data = await request({method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(notice)});
      applyNoticeData(data);
      renderNoticeList();
      resetForm();
      if (message) message.textContent = 'Informativo salvo com sucesso.';
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  function handleListClick(event) {
    const editButton = event.target.closest('[data-edit-notice]');
    if (editButton) {
      const notice = marketingNotices.find(item => String(item.id) === String(editButton.dataset.editNotice));
      if (notice) fillForm(notice);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-notice]');
    if (deleteButton) {
      removeNotice(deleteButton.dataset.deleteNotice);
    }
  }

  async function removeNotice(id) {
    if (!confirm('Excluir este informativo?')) return;
    const message = document.querySelector('#marketingMessage');
    if (message) message.textContent = '';
    try {
      const response = await fetch(`${api}&id=${encodeURIComponent(id)}`, {method: 'DELETE'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel excluir o informativo.');
      applyNoticeData(data);
      renderNoticeList();
      resetForm();
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  async function loadNotice() {
    try {
      const data = await request();
      applyNoticeData(data);
      if (window.PortalCurrentUser && window.PortalCurrentUser.role !== 'master') renderMarketingCard();
      if (window.PortalCurrentUser?.role === 'master') {
        ensureMarketingAdminView();
        ensureMarketingNav();
        resetForm();
        renderNoticeList();
      }
    } catch (error) {
      console.warn('Nao foi possivel carregar o informativo.', error);
    }
  }

  window.addEventListener('portal:user-ready', event => {
    if (event.detail?.role === 'master') {
      ensureMarketingAdminView();
      ensureMarketingNav();
      resetForm();
      renderNoticeList();
      return;
    }
    renderMarketingCard();
  });

  document.addEventListener('DOMContentLoaded', loadNotice);
})();
