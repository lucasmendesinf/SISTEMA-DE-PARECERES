(() => {
  const DISMISS_KEY = 'ai-prof-pwa-install-dismissed-at';
  const DISMISS_DAYS = 14;
  let deferredPrompt = null;
  let installState = 'unavailable';

  const $ = selector => document.querySelector(selector);
  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true || document.referrer.startsWith('android-app://');
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = () => window.matchMedia?.('(hover: none) and (pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) <= 820;

  function dismissedRecently() {
    const value = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (!value) return false;
    return Date.now() - value < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  }

  function setDismissed() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }

  function ensureStyles() {
    if (document.querySelector('#pwaInstallRuntimeStyles')) return;
    const style = document.createElement('style');
    style.id = 'pwaInstallRuntimeStyles';
    style.textContent = `
      .profile-menu button.pwa-installed-button{color:#236b52;cursor:default}.profile-menu button.pwa-installed-button:hover,.profile-menu button.pwa-installed-button:focus{background:#fff;color:#236b52}.profile-menu button.pwa-installed-button::before{background:#236b52}
    `;
    document.head.append(style);
  }

  function setButtonState() {
    ensureStyles();
    const buttons = document.querySelectorAll('[data-pwa-install-button]');
    const installed = isStandalone();
    buttons.forEach(button => {
      if (installed) {
        button.hidden = false;
        button.disabled = true;
        button.classList.add('pwa-installed-button');
        button.textContent = 'AiProf instalado';
        return;
      }
      button.disabled = false;
      button.classList.remove('pwa-installed-button');
      button.textContent = 'Instalar AiProf';
      button.hidden = installState === 'unavailable' && !isIOS();
    });
  }

  function ensureMenuButton() {
    const menu = $('.profile-menu');
    if (!menu || menu.querySelector('[data-pwa-install-button]')) return;
    const logout = menu.querySelector('#sidebarLogoutButton');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.pwaInstallButton = 'menu';
    button.textContent = 'Instalar AiProf';
    button.addEventListener('click', event => {
      event.stopPropagation();
      startInstall();
    });
    if (logout) menu.insertBefore(button, logout);
    else menu.append(button);
    setButtonState();
  }

  function ensureInstallModal() {
    let modal = $('#pwaInstallModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pwaInstallModal';
    modal.className = 'pwa-install-backdrop';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="pwa-install-modal" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">
        <button class="pwa-install-close" type="button" aria-label="Fechar">x</button>
        <p class="eyebrow">AIPROF NO CELULAR</p>
        <h2 id="pwaInstallTitle">Instalar AiProf no iPhone</h2>
        <ol>
          <li>Toque no botao <strong>Compartilhar</strong> do Safari.</li>
          <li>Escolha <strong>Adicionar a Tela de Inicio</strong>.</li>
          <li>Confirme em <strong>Adicionar</strong>.</li>
        </ol>
        <button class="primary" type="button" data-pwa-install-ok>Entendi</button>
      </div>`;
    document.body.append(modal);
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('.pwa-install-close') || event.target.closest('[data-pwa-install-ok]')) {
        closeInstallModal();
      }
    });
    return modal;
  }

  function openInstallModal() {
    const modal = ensureInstallModal();
    modal.hidden = false;
    document.body.classList.add('pwa-install-modal-open');
    modal.querySelector('[data-pwa-install-ok]')?.focus();
  }

  function closeInstallModal() {
    const modal = $('#pwaInstallModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('pwa-install-modal-open');
  }

  function ensureInstallNudge() {
    if (isStandalone() || !isMobile() || dismissedRecently() || $('#pwaInstallNudge')) return;
    if (installState === 'unavailable' && !isIOS()) return;
    const main = document.querySelector('main');
    if (!main) return;
    const nudge = document.createElement('div');
    nudge.id = 'pwaInstallNudge';
    nudge.className = 'pwa-install-nudge';
    nudge.innerHTML = `
      <div>
        <strong>Tenha o AiProf sempre a mao</strong>
        <span>Instale o AiProf no seu celular e acesse direto pela tela inicial.</span>
      </div>
      <div class="pwa-install-actions">
        <button class="primary" type="button" data-pwa-install-button="nudge">Instalar AiProf</button>
        <button class="secondary" type="button" data-pwa-install-dismiss>Agora nao</button>
      </div>`;
    const header = main.querySelector('header');
    if (header) header.insertAdjacentElement('afterend', nudge);
    else main.prepend(nudge);
    nudge.querySelector('[data-pwa-install-button]')?.addEventListener('click', startInstall);
    nudge.querySelector('[data-pwa-install-dismiss]')?.addEventListener('click', () => {
      setDismissed();
      nudge.remove();
    });
  }

  async function startInstall() {
    if (isStandalone()) return;
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      installState = 'prompt-used';
      prompt.prompt();
      try { await prompt.userChoice; } catch (_) {}
      setButtonState();
      return;
    }
    if (isIOS()) {
      openInstallModal();
      return;
    }
    openInstallModal();
  }

  function refreshInstallUi() {
    ensureMenuButton();
    setButtonState();
    ensureInstallNudge();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    installState = 'available';
    refreshInstallUi();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installState = 'installed';
    document.querySelector('#pwaInstallNudge')?.remove();
    setButtonState();
  });

  window.AiProfPwaInstall = {refresh: refreshInstallUi, install: startInstall, isInstalled: isStandalone};

  document.addEventListener('DOMContentLoaded', () => {
    installState = isIOS() ? 'ios' : 'unavailable';
    refreshInstallUi();
    setTimeout(refreshInstallUi, 800);
  });

  window.addEventListener('portal:user-ready', refreshInstallUi);
  window.addEventListener('resize', () => setTimeout(refreshInstallUi, 150));
})();