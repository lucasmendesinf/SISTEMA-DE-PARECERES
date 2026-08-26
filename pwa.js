(() => {
  const PWA_VERSION = '20260826-pwa-chrome-native-1';
  const VERSION_ENDPOINT = 'api.php?resource=pwa-version';
  const LOCAL_VERSION_KEY = 'ai-prof-pwa-published-version';
  const RELOAD_FLAG = 'ai-prof-pwa-reload-once';
  const CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const CRITICAL_TIMEOUT_MS = 45000;

  if (!('serviceWorker' in navigator)) return;

  let registrationRef = null;
  let promptVisible = false;
  let pendingServerVersion = null;
  let criticalRequests = 0;
  let originalFetch = null;

  function endpointUrl() {
    const glue = VERSION_ENDPOINT.includes('?') ? '&' : '?';
    return `${VERSION_ENDPOINT}${glue}_=${Date.now()}`;
  }

  function getStoredVersion() {
    return Number(localStorage.getItem(LOCAL_VERSION_KEY) || '0') || 0;
  }

  function setStoredVersion(version) {
    if (Number(version) > 0) localStorage.setItem(LOCAL_VERSION_KEY, String(version));
  }

  function requestMethod(input, init = {}) {
    return String(init.method || input?.method || 'GET').toUpperCase();
  }

  function requestUrl(input) {
    try {
      return new URL(input?.url || input, window.location.href);
    } catch (error) {
      return null;
    }
  }

  function isCriticalRequest(input, init = {}) {
    const method = requestMethod(input, init);
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
    const url = requestUrl(input);
    if (!url) return true;
    if (url.pathname.endsWith('/api.php') && url.searchParams.get('resource') === 'pwa-version') return false;
    return true;
  }

  function trackCriticalRequests() {
    if (window.__AiProfPwaFetchTracked) return;
    window.__AiProfPwaFetchTracked = true;
    originalFetch = window.fetch.bind(window);
    window.fetch = function fetchWithPwaCriticalTracking(input, init = {}) {
      const critical = isCriticalRequest(input, init || {});
      if (critical) criticalRequests += 1;
      return originalFetch(input, init).finally(() => {
        if (critical) criticalRequests = Math.max(0, criticalRequests - 1);
      });
    };
    window.AiProfPwaUpdate = {
      beginCritical() {
        criticalRequests += 1;
      },
      endCritical() {
        criticalRequests = Math.max(0, criticalRequests - 1);
      },
      isBusy() {
        return criticalRequests > 0;
      }
    };
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitForCriticalOperations() {
    const startedAt = Date.now();
    while (criticalRequests > 0 && Date.now() - startedAt < CRITICAL_TIMEOUT_MS) {
      await wait(350);
    }
  }

  function ensurePrompt() {
    let overlay = document.querySelector('#pwaUpdateOverlay');
    if (overlay) return overlay;

    const style = document.createElement('style');
    style.textContent = `
      .pwa-update-overlay{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(20,28,25,.68);padding:24px}
      .pwa-update-overlay.active{display:flex}
      .pwa-update-box{width:min(420px,100%);background:#fff;border-radius:12px;padding:30px;box-shadow:0 24px 70px rgba(0,0,0,.28);color:#24342d}
      .pwa-update-box h2{margin:0 0 8px;font-family:Georgia,serif;font-size:30px;line-height:1.05}
      .pwa-update-box p{margin:0 0 24px;color:#6e7c76;font-size:16px;line-height:1.5}
      .pwa-update-box button{border:0;border-radius:8px;background:#1f765b;color:#fff;font-weight:700;font-size:15px;padding:14px 18px;cursor:pointer;box-shadow:0 8px 18px rgba(31,118,91,.2)}
      .pwa-update-box button:disabled{opacity:.72;cursor:wait}
    `;
    document.head.append(style);

    overlay = document.createElement('div');
    overlay.id = 'pwaUpdateOverlay';
    overlay.className = 'pwa-update-overlay';
    overlay.innerHTML = `
      <div class="pwa-update-box" role="dialog" aria-modal="true" aria-labelledby="pwaUpdateTitle">
        <h2 id="pwaUpdateTitle">Nova versao disponivel</h2>
        <p>O iProf recebeu uma atualizacao.</p>
        <button type="button" id="pwaUpdateNow">Atualizar agora</button>
      </div>
    `;
    document.body.append(overlay);
    overlay.querySelector('#pwaUpdateNow')?.addEventListener('click', applyUpdate);
    return overlay;
  }

  function showPrompt(serverVersion) {
    if (promptVisible) return;
    pendingServerVersion = Number(serverVersion) || pendingServerVersion;
    promptVisible = true;
    ensurePrompt().classList.add('active');
  }

  function reloadOnce() {
    if (sessionStorage.getItem(RELOAD_FLAG) === '1') return;
    sessionStorage.setItem(RELOAD_FLAG, '1');
    if (pendingServerVersion) setStoredVersion(pendingServerVersion);
    window.location.reload();
  }

  async function applyUpdate() {
    const button = document.querySelector('#pwaUpdateNow');
    if (button) {
      button.disabled = true;
      button.textContent = 'Atualizando...';
    }
    await waitForCriticalOperations();
    const waiting = registrationRef?.waiting;
    if (waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, {once: true});
      waiting.postMessage({type: 'AIPROF_SKIP_WAITING'});
      setTimeout(reloadOnce, 5000);
      return;
    }
    reloadOnce();
  }

  async function loadServerVersion() {
    const response = await fetch(endpointUrl(), {
      cache: 'no-store',
      headers: {'Accept': 'application/json'}
    });
    if (!response.ok) throw new Error('Falha ao consultar versao do PWA.');
    return response.json();
  }

  async function checkForUpdate(reason = 'timer') {
    if (!registrationRef || !navigator.onLine) return;
    try {
      const info = await loadServerVersion();
      const serverVersion = Number(info.version || 1);
      const storedVersion = getStoredVersion();
      if (!storedVersion) {
        setStoredVersion(serverVersion);
        return;
      }
      if (serverVersion <= storedVersion) return;

      pendingServerVersion = serverVersion;
      await registrationRef.update?.();
      if (registrationRef.waiting || navigator.serviceWorker.controller || reason === 'online') {
        showPrompt(serverVersion);
      }
    } catch (error) {
      if (reason !== 'timer') console.warn('Nao foi possivel verificar atualizacao do PWA.', error);
    }
  }

  function bindRegistration(registration) {
    registrationRef = registration;
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller && pendingServerVersion) {
          showPrompt(pendingServerVersion);
        }
      });
    });
  }

  window.addEventListener('load', () => {
    sessionStorage.removeItem(RELOAD_FLAG);
    trackCriticalRequests();
    navigator.serviceWorker.register(`sw.js?v=${PWA_VERSION}`)
      .then(registration => {
        bindRegistration(registration);
        checkForUpdate('load');
        setInterval(() => checkForUpdate('timer'), CHECK_INTERVAL_MS);
      })
      .catch(error => {
        console.warn('Nao foi possivel ativar o PWA.', error);
      });
  });

  window.addEventListener('online', () => checkForUpdate('online'));
  window.addEventListener('focus', () => checkForUpdate('focus'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate('visible');
  });
})();
