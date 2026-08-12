(() => {
  const view = document.querySelector('#pwaAdmin');
  if (!view || document.body.dataset.role !== 'master') return;

  const versionEl = view.querySelector('#pwaPublishedVersion');
  const publishedAtEl = view.querySelector('#pwaPublishedAt');
  const statusEl = view.querySelector('#pwaAdminStatus');
  const publishButton = view.querySelector('#publishPwaUpdate');

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.style.color = isError ? '#9b2f2f' : '#236b52';
  }

  function formatDate(value) {
    if (!value) return 'Ainda nao publicada';
    const normalized = String(value).replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('pt-BR');
  }

  function render(info = {}) {
    if (versionEl) versionEl.textContent = `v${Number(info.version || 1)}`;
    if (publishedAtEl) publishedAtEl.textContent = formatDate(info.publishedAt || info.updatedAt);
  }

  async function requestVersion(options = {}) {
    const url = `api.php?resource=pwa-version&_=${Date.now()}`;
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {'Accept': 'application/json', ...(options.headers || {})},
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Nao foi possivel carregar a versao do PWA.');
    return payload;
  }

  async function loadVersion() {
    try {
      render(await requestVersion());
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function publishVersion() {
    const ok = confirm('Publicar uma nova versao oficial do PWA? Use esta opcao apenas depois que os arquivos novos ja estiverem publicados no servidor.');
    if (!ok) return;
    const oldText = publishButton?.textContent;
    try {
      if (publishButton) {
        publishButton.disabled = true;
        publishButton.textContent = 'Publicando...';
      }
      setStatus('');
      const payload = await requestVersion({method: 'POST'});
      render(payload);
      setStatus('Atualizacao PWA publicada. Os usuarios serao avisados quando estiverem online.');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      if (publishButton) {
        publishButton.disabled = false;
        publishButton.textContent = oldText || 'Publicar atualizacao PWA';
      }
    }
  }

  publishButton?.addEventListener('click', publishVersion);
  loadVersion();
})();
