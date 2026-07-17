(() => {
  const api = 'api.php?resource=tutorial-videos';
  let videos = [];
  let editingId = '';
  let currentUser = window.PortalCurrentUser || window.PortalBootstrapUser || null;
  const shownPopups = new Set();
  let loadingPromise = null;
  let videosLoaded = false;
  let firstAccessOpening = null;

  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

  function isMaster() {
    return (currentUser?.role || document.body.dataset.role) === 'master';
  }

  function canManageTutorials() {
    return isMaster() || (Array.isArray(currentUser?.permissions) && currentUser.permissions.includes('tutoriais_cadastro'));
  }

  function embedUrl(video) {
    return `https://www.youtube.com/embed/${encodeURIComponent(video.youtubeId)}?rel=0`;
  }

  async function request(options = {}) {
    const response = await fetch(api, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel carregar os tutoriais.');
    return data;
  }

  function renderAdminPanel() {
    const target = $('#tutorialAdminPanel');
    if (!target) return;
    if (!canManageTutorials()) {
      target.innerHTML = '';
      return;
    }
    if (!target.dataset.ready) {
      target.dataset.ready = '1';
      target.innerHTML = `
        <div class="tutorial-admin-layout">
          <div class="panel tutorial-admin-panel">
            <div>
              <p class="eyebrow">LOGIN MASTER</p>
              <h2>Cadastro de tutorial</h2>
            </div>
            <div class="form-grid">
              <div class="field"><label>Titulo do video</label><input id="tutorialTitle" placeholder="Ex.: Como criar um parecer"></div>
              <div class="field"><label>Link do YouTube</label><input id="tutorialUrl" placeholder="https://www.youtube.com/watch?v=..."></div>
              <div class="tutorial-checks">
                <label><input id="tutorialShowOnHome" type="checkbox"> Aparecer como popup na tela inicial para professoras</label>
                <label><input id="tutorialShowFirstLogin" type="checkbox"> Aparecer no primeiro acesso da professora</label>
              </div>
            </div>
            <p id="tutorialAdminMessage" class="profile-message"></p>
            <div class="form-actions">
              <button class="secondary" id="newTutorialVideo" type="button">Novo tutorial</button>
              <button class="primary" id="saveTutorialVideo" type="button">Salvar tutorial</button>
            </div>
          </div>
          <div class="panel tutorial-list-panel">
            <div>
              <p class="eyebrow">CADASTRADOS</p>
              <h2>Videos</h2>
            </div>
            <div id="tutorialAdminList" class="tutorial-admin-list"></div>
          </div>
        </div>`;
      $('#saveTutorialVideo')?.addEventListener('click', saveVideo);
      $('#newTutorialVideo')?.addEventListener('click', resetForm);
      $('#tutorialAdminList')?.addEventListener('click', handleAdminListClick);
    }
    renderAdminList();
  }

  function resetForm() {
    editingId = '';
    ['#tutorialTitle', '#tutorialUrl'].forEach(selector => {
      const field = $(selector);
      if (field) field.value = '';
    });
    const home = $('#tutorialShowOnHome');
    const first = $('#tutorialShowFirstLogin');
    if (home) home.checked = false;
    if (first) first.checked = false;
    const message = $('#tutorialAdminMessage');
    if (message) message.textContent = '';
  }

  function fillForm(video) {
    editingId = video.id || '';
    if ($('#tutorialTitle')) $('#tutorialTitle').value = video.title || '';
    if ($('#tutorialUrl')) $('#tutorialUrl').value = video.url || '';
    if ($('#tutorialShowOnHome')) $('#tutorialShowOnHome').checked = !!video.showOnHome;
    if ($('#tutorialShowFirstLogin')) $('#tutorialShowFirstLogin').checked = !!video.showFirstLogin;
  }

  async function saveVideo() {
    const message = $('#tutorialAdminMessage');
    if (message) message.textContent = 'Salvando...';
    try {
      const payload = {
        id: editingId,
        title: $('#tutorialTitle')?.value.trim() || '',
        url: $('#tutorialUrl')?.value.trim() || '',
        showOnHome: !!$('#tutorialShowOnHome')?.checked,
        showFirstLogin: !!$('#tutorialShowFirstLogin')?.checked
      };
      const data = await request({method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      videos = Array.isArray(data.videos) ? data.videos : [];
      renderAll();
      resetForm();
      if (message) message.textContent = 'Tutorial salvo com sucesso.';
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  function handleAdminListClick(event) {
    const edit = event.target.closest('[data-edit-tutorial]');
    if (edit) {
      const video = videos.find(item => String(item.id) === String(edit.dataset.editTutorial));
      if (video) fillForm(video);
      return;
    }
    const remove = event.target.closest('[data-delete-tutorial]');
    if (remove) removeVideo(remove.dataset.deleteTutorial);
  }

  async function removeVideo(id) {
    if (!confirm('Excluir este tutorial?')) return;
    const message = $('#tutorialAdminMessage');
    if (message) message.textContent = 'Excluindo...';
    try {
      const response = await fetch(`${api}&id=${encodeURIComponent(id)}`, {method: 'DELETE'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel excluir o tutorial.');
      videos = Array.isArray(data.videos) ? data.videos : [];
      renderAll();
      resetForm();
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  function renderAdminList() {
    const list = $('#tutorialAdminList');
    if (!list) return;
    if (!videos.length) {
      list.innerHTML = '<p class="muted">Nenhum tutorial cadastrado.</p>';
      return;
    }
    list.innerHTML = videos.map(video => `
      <article class="tutorial-admin-item">
        <strong>${escapeHtml(video.title)}</strong>
        <p>${escapeHtml(video.url)}</p>
        <div class="tutorial-badges">
          ${video.showOnHome ? '<span class="tutorial-badge">Popup inicial</span>' : ''}
          ${video.showFirstLogin ? '<span class="tutorial-badge">Primeiro acesso</span>' : ''}
        </div>
        <div class="tutorial-admin-actions">
          <button class="secondary" type="button" data-edit-tutorial="${escapeHtml(video.id)}">Editar</button>
          <button class="secondary danger" type="button" data-delete-tutorial="${escapeHtml(video.id)}">Excluir</button>
        </div>
      </article>`).join('');
  }

  function filteredVideos() {
    const term = ($('#tutorialSearch')?.value || '').trim().toLowerCase();
    return videos.filter(video => !term || String(video.title || '').toLowerCase().includes(term));
  }

  function renderTutorialList() {
    const list = $('#tutorialList');
    if (!list) return;
    const items = filteredVideos();
    const total = $('#tutorialTotal');
    if (total) total.textContent = `${items.length} tutorial(is)`;
    if (!items.length) {
      list.innerHTML = '<div class="tutorial-empty">Nenhum tutorial encontrado para a pesquisa.</div>';
      return;
    }
    list.innerHTML = items.map(video => `
      <article class="tutorial-card">
        <h2>${escapeHtml(video.title)}</h2>
        <iframe src="${embedUrl(video)}" title="${escapeHtml(video.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
        <div class="tutorial-card-footer">
          <div class="tutorial-badges">
            ${video.showOnHome ? '<span class="tutorial-badge">Destaque</span>' : ''}
            ${video.showFirstLogin ? '<span class="tutorial-badge">Primeiro acesso</span>' : ''}
          </div>
          <a class="text-button" href="${escapeHtml(video.url)}" target="_blank" rel="noopener">Abrir YouTube</a>
        </div>
      </article>`).join('');
  }

  function renderAll() {
    renderAdminPanel();
    renderTutorialList();
  }

  function popupSeenKey(video, type) {
    const userId = currentUser?.id || 'anon';
    return `ai-prof-tutorial-popup-v2-${type}-${userId}-${video.id}`;
  }

  function firstAccessSessionKey(video) {
    const userId = currentUser?.id || 'anon';
    return `ai-prof-tutorial-first-session-v2-${userId}-${video.id}`;
  }

  function pickFirstAccessVideo(force, allowFallback = false) {
    const preferred = videos.find(item => item.showFirstLogin && (!force || !sessionStorage.getItem(firstAccessSessionKey(item))));
    if (preferred) return preferred;
    if (!allowFallback) return null;
    return videos.find(item => item.showOnHome && (!force || !sessionStorage.getItem(firstAccessSessionKey(item)))) || null;
  }

  function choosePopupVideo(allowFirstAccess = false) {
    if (isMaster()) return null;
    if (allowFirstAccess) {
      const firstLogin = videos.find(video => video.showFirstLogin && !localStorage.getItem(popupSeenKey(video, 'first')));
      if (firstLogin) return {video: firstLogin, type: 'first'};
    }
    const home = videos.find(video => video.showOnHome && !shownPopups.has(popupSeenKey(video, 'home')));
    return home ? {video: home, type: 'home'} : null;
  }

  function openTutorialPopup(choice) {
    if (document.querySelector('.tutorial-popup-backdrop')) return Promise.resolve(false);
    const {video, type} = choice;
    shownPopups.add(popupSeenKey(video, type));
    const backdrop = document.createElement(type === 'first' ? 'dialog' : 'div');
    backdrop.className = `tutorial-popup-backdrop tutorial-popup-force-top${backdrop.tagName === 'DIALOG' ? ' tutorial-popup-dialog' : ''}`;
    backdrop.innerHTML = `
      <div class="tutorial-popup" role="dialog" aria-modal="true" aria-labelledby="tutorialPopupTitle">
        <button class="tutorial-popup-close" type="button" aria-label="Fechar">×</button>
        <div class="tutorial-popup-content">
          <p class="eyebrow">${type === 'first' ? 'PRIMEIRO ACESSO' : 'TUTORIAL EM DESTAQUE'}</p>
          <h2 id="tutorialPopupTitle">${escapeHtml(video.title)}</h2>
          <div class="tutorial-popup-video"><iframe src="${embedUrl(video)}" title="${escapeHtml(video.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>
          <div class="tutorial-popup-actions">
            <button class="secondary" type="button" data-close-tutorial>Fechar</button>
            <a class="primary" href="${escapeHtml(video.url)}" target="_blank" rel="noopener">Abrir no YouTube</a>
          </div>
        </div>
      </div>`;
    return new Promise(resolve => {
      let resolved = false;
      const close = () => {
        if (resolved) return;
        resolved = true;
        if (type === 'first') localStorage.setItem(popupSeenKey(video, type), '1');
        if (backdrop.tagName === 'DIALOG' && backdrop.open) backdrop.close();
        backdrop.remove();
        resolve(true);
      };
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop || event.target.closest('[data-close-tutorial]') || event.target.closest('.tutorial-popup-close')) close();
      });
      backdrop.addEventListener('cancel', event => {
        event.preventDefault();
        close();
      });
      document.body.append(backdrop);
      if (backdrop.tagName === 'DIALOG' && typeof backdrop.showModal === 'function') {
        try {
          backdrop.showModal();
        } catch (error) {
          backdrop.setAttribute('open', '');
        }
      }
    });
  }

  function showPopupIfNeeded(allowFirstAccess = false) {
    const choice = choosePopupVideo(allowFirstAccess);
    if (!choice) return Promise.resolve(false);
    const {type} = choice;
    if (type === 'home' && !document.querySelector('#inicio')?.classList.contains('active')) return Promise.resolve(false);
    if (type !== 'first' && document.querySelector('#onboardingModal[open]')) {
      setTimeout(showPopupIfNeeded, 1200);
      return Promise.resolve(false);
    }
    return openTutorialPopup(choice);
  }

  async function loadVideos(autoPopup = true) {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      const data = await request();
      videos = Array.isArray(data.videos) ? data.videos : [];
      videosLoaded = true;
      renderAll();
      return videos;
    })();
    try {
      await loadingPromise;
      if (autoPopup) showPopupIfNeeded();
    } catch (error) {
      console.warn('Nao foi possivel carregar tutoriais.', error);
    }
    return loadingPromise;
  }

  async function showFirstAccessBeforeOnboarding(user, options = {}) {
    currentUser = user || currentUser || window.PortalCurrentUser || window.PortalBootstrapUser;
    if (isMaster()) return false;
    if (firstAccessOpening) return firstAccessOpening;
    try {
      if (!videosLoaded) await loadVideos(false);
      const force = !!options.force;
      const video = force
        ? pickFirstAccessVideo(true, !!options.allowFallback)
        : videos.find(item => item.showFirstLogin && !localStorage.getItem(popupSeenKey(item, 'first')));
      if (!video) return false;
      if (force) sessionStorage.setItem(firstAccessSessionKey(video), '1');
      firstAccessOpening = openTutorialPopup({video, type: 'first'}).finally(() => {
        firstAccessOpening = null;
      });
      return firstAccessOpening;
    } catch (error) {
      console.warn('Nao foi possivel abrir tutorial de primeiro acesso.', error);
      return false;
    }
  }

  window.TutorialVideos = {showFirstAccessBeforeOnboarding};
  window.dispatchEvent(new CustomEvent('portal:tutorial-ready'));

  document.addEventListener('DOMContentLoaded', () => {
    $('#tutorialSearch')?.addEventListener('input', renderTutorialList);
    loadVideos();
  });

  window.addEventListener('portal:user-ready', event => {
    currentUser = event.detail || currentUser;
    renderAll();
    showPopupIfNeeded();
  });

  window.addEventListener('portal:onboarding-open', () => showPopupIfNeeded());
})();
