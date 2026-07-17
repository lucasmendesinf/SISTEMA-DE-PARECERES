(() => {
  if (window.PortalSaveFeedback) return;

  const excludedResources = new Set([
    'auth',
    'ai-review',
    'billing-public',
    'mercado-pago-webhook',
    'send-report-email',
    'google-drive-upload',
    'google-drive-oauth'
  ]);
  const mutatingMethods = new Set(['POST', 'PUT', 'DELETE']);
  const originalFetch = window.fetch.bind(window);
  let activeRequests = 0;
  let toastTimer = null;

  function ensureElements() {
    let overlay = document.querySelector('#saveFeedbackOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'saveFeedbackOverlay';
      overlay.className = 'save-feedback-overlay';
      overlay.setAttribute('aria-live', 'polite');
      overlay.setAttribute('aria-busy', 'true');
      overlay.innerHTML = '<div class="save-feedback-box"><span class="save-feedback-spinner" aria-hidden="true"></span><span id="saveFeedbackText">Salvando...</span></div>';
      document.body.append(overlay);
    }

    let toast = document.querySelector('#saveFeedbackToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'saveFeedbackToast';
      toast.className = 'save-feedback-toast';
      toast.setAttribute('role', 'status');
      document.body.append(toast);
    }

    return {overlay, toast};
  }

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input?.url || '';
  }

  function requestMethod(input, init = {}) {
    const options = init || {};
    return String(options.method || input?.method || 'GET').toUpperCase();
  }

  function resourceFromUrl(url) {
    try {
      return new URL(url, window.location.href).searchParams.get('resource') || '';
    } catch (error) {
      return '';
    }
  }

  function parseJsonBody(body) {
    if (!body || typeof body !== 'string') return {};
    try {
      return JSON.parse(body);
    } catch (error) {
      return {};
    }
  }

  function shouldTrack(input, init = {}) {
    const options = init || {};
    const method = requestMethod(input, options);
    if (!mutatingMethods.has(method)) return false;

    const url = requestUrl(input);
    if (!/api\.php/i.test(url)) return false;

    const resource = resourceFromUrl(url);
    if (!resource || excludedResources.has(resource)) return false;

    const body = parseJsonBody(options.body);
    if (body.draft === true || body.action === 'logout') return false;
    if (body.silent === true || body.autosave === true) return false;

    return {resource, method, body};
  }

  function successMessage(resource, method, body = {}) {
    if (method === 'DELETE') return 'Informacao excluida com sucesso.';
    if (resource === 'children') return 'Aluno salvo com sucesso.';
    if (resource === 'classes') return 'Turma salva com sucesso.';
    if (resource === 'periods') return 'Periodo salvo com sucesso.';
    if (resource === 'activities') return 'Atividade salva com sucesso.';
    if (resource === 'header-settings') return 'Configuracoes salvas com sucesso.';
    if (resource === 'users') return 'Usuario salvo com sucesso.';
    if (resource === 'reports' && body.deliverId) return 'Documento entregue com sucesso.';
    if (resource === 'reports' && body.reopenId) return 'Documento reaberto com sucesso.';
    if (resource === 'reports') return 'Documento salvo com sucesso.';
    return 'Informacao salva com sucesso.';
  }

  function showLoading(message = 'Salvando...') {
    activeRequests += 1;
    const {overlay} = ensureElements();
    const text = overlay.querySelector('#saveFeedbackText');
    if (text) text.textContent = message;
    overlay.classList.add('active');
  }

  function hideLoading() {
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests > 0) return;
    const overlay = document.querySelector('#saveFeedbackOverlay');
    overlay?.classList.remove('active');
  }

  function notify(message) {
    const {toast} = ensureElements();
    toast.textContent = message;
    toast.classList.add('active');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('active'), 3200);
  }

  window.PortalSaveFeedback = {
    showLoading,
    hideLoading,
    notify
  };

  window.fetch = async function fetchWithSaveFeedback(input, init = {}) {
    const options = init || {};
    const tracked = shouldTrack(input, options);
    if (!tracked) return originalFetch(input, init);

    showLoading('Salvando...');
    try {
      const response = await originalFetch(input, init);
      if (response.ok) notify(successMessage(tracked.resource, tracked.method, tracked.body));
      return response;
    } finally {
      hideLoading();
    }
  };
})();
