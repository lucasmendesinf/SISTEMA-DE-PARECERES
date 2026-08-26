(() => {
  const DISMISS_KEY = 'ai-prof-pwa-install-dismissed-at';
  const DISMISS_DAYS = 14;
  let deferredPrompt = null;
  let installState = 'unavailable';

  const $ = selector => document.querySelector(selector);
  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true || document.referrer.startsWith('android-app://');
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIOSSafari = () => isIOS() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios|mercury/i.test(navigator.userAgent);
  const isChrome = () => /chrome|crios|chromium/i.test(navigator.userAgent) && !/edg|edgios|opr|opios|samsungbrowser/i.test(navigator.userAgent);
  const isEdge = () => /edg|edgios/i.test(navigator.userAgent);
  const canShowManualInstall = () => isIOS() || isChrome() || isEdge();
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
        button.hidden = true;
        button.disabled = true;
        button.classList.add('pwa-installed-button');
        button.textContent = 'AiProf instalado';
        return;
      }
      button.disabled = false;
      button.classList.remove('pwa-installed-button');
      button.textContent = button.dataset.pwaInstallButton === 'nudge' && isIOS() ? 'Ver como instalar' : 'Instalar AiProf';
      button.hidden = installState === 'unavailable' && !canShowManualInstall();
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

  function iosInstructionsHtml() {
    const safari = isIOSSafari();
    const intro = safari
      ? 'Adicione o AiProf a Tela de Inicio para acessar o sistema como um aplicativo.'
      : 'Para instalar o AiProf no iPhone, abra esta pagina no Safari.';
    const title = safari ? 'Instale o AiProf no seu iPhone' : 'Abra no Safari para instalar';
    const steps = safari
      ? `
        <div class="pwa-install-flow" aria-hidden="true">
          <span>Compartilhar</span><b></b><span>Adicionar</span><b></b><span>AiProf</span>
        </div>
        <div class="pwa-install-steps">
          <article><strong>1. Toque em Compartilhar</strong><p>Use o botao de compartilhamento do Safari.</p></article>
          <article><strong>2. Selecione "Adicionar a Tela de Inicio"</strong><p>Essa opcao cria o icone do AiProf no celular.</p></article>
          <article><strong>3. Ative "Abrir como App da Web"</strong><p>Quando essa opcao aparecer, mantenha ativada.</p></article>
          <article><strong>4. Toque em "Adicionar"</strong><p>Depois disso, abra o AiProf pelo icone na Tela de Inicio.</p></article>
        </div>`
      : `
        <div class="pwa-install-steps">
          <article><strong>1. Abra esta pagina no Safari</strong><p>Copie o endereco atual ou acesse o AiProf pelo Safari do iPhone/iPad.</p></article>
          <article><strong>2. Toque em Instalar AiProf novamente</strong><p>No Safari, mostraremos as etapas para adicionar a Tela de Inicio.</p></article>
        </div>`;
    return {title, intro, steps};
  }

  function chromeInstructionsHtml() {
    const mobile = isMobile();
    const title = mobile ? 'Instale o AiProf no Google Chrome' : 'Instalar AiProf no Chrome';
    const intro = mobile
      ? 'Adicione o AiProf a tela inicial pelo Google Chrome para acessar como um aplicativo.'
      : 'Instale o AiProf pelo Google Chrome para abrir em uma janela de aplicativo.';
    const steps = mobile
      ? `
        <div class="pwa-install-flow" aria-hidden="true">
          <span>Menu do Chrome</span><b></b><span>Adicionar</span><b></b><span>AiProf</span>
        </div>
        <div class="pwa-install-steps">
          <article><strong>1. Toque no menu do Chrome</strong><p>Use o botao de tres pontos no canto superior do navegador.</p></article>
          <article><strong>2. Escolha "Adicionar a tela inicial"</strong><p>Em alguns aparelhos, a opcao pode aparecer como "Instalar app".</p></article>
          <article><strong>3. Confirme em "Adicionar" ou "Instalar"</strong><p>O icone do AiProf ficara disponivel na tela inicial.</p></article>
        </div>`
      : `
        <div class="pwa-install-flow" aria-hidden="true">
          <span>Barra do Chrome</span><b></b><span>Instalar</span><b></b><span>AiProf</span>
        </div>
        <div class="pwa-install-steps">
          <article><strong>1. Procure o icone de instalar na barra de endereco</strong><p>Quando disponivel, o Chrome mostra um icone de instalacao ao lado do endereco.</p></article>
          <article><strong>2. Ou abra o menu do Chrome</strong><p>Clique nos tres pontos e escolha "Instalar AiProf" ou "Salvar e compartilhar" &gt; "Instalar pagina como app".</p></article>
          <article><strong>3. Confirme a instalacao</strong><p>O AiProf abrira em uma janela propria, como aplicativo.</p></article>
        </div>`;
    return {title, intro, steps};
  }

  function ensureInstallModal() {
    let modal = $('#pwaInstallModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pwaInstallModal';
    modal.className = 'pwa-install-backdrop';
    modal.hidden = true;
    document.body.append(modal);
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('.pwa-install-close') || event.target.closest('[data-pwa-install-ok]')) {
        closeInstallModal();
      }
    });
    return modal;
  }

  function renderInstallModal() {
    const modal = ensureInstallModal();
    const content = isIOS()
      ? iosInstructionsHtml()
      : isChrome() || isEdge()
        ? chromeInstructionsHtml()
        : {
          title: 'Instalar AiProf',
          intro: 'Se o navegador nao abriu o instalador automaticamente, use a opcao de instalar aplicativo no menu do navegador.',
          steps: '<div class="pwa-install-steps"><article><strong>Use o menu do navegador</strong><p>Procure por Instalar aplicativo ou Adicionar a tela inicial.</p></article></div>'
        };
    modal.innerHTML = `
      <div class="pwa-install-modal" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">
        <button class="pwa-install-close" type="button" aria-label="Fechar">x</button>
        <p class="eyebrow">AIPROF NO CELULAR</p>
        <h2 id="pwaInstallTitle">${content.title}</h2>
        <p class="pwa-install-intro">${content.intro}</p>
        ${content.steps}
        <button class="primary" type="button" data-pwa-install-ok>Entendi</button>
      </div>`;
    return modal;
  }

  function openInstallModal() {
    if (isStandalone()) return;
    const modal = renderInstallModal();
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
    if (installState === 'unavailable' && !canShowManualInstall()) return;
    const main = document.querySelector('main');
    if (!main) return;
    const ios = isIOS();
    const chrome = !ios && (isChrome() || isEdge());
    const nudge = document.createElement('div');
    nudge.id = 'pwaInstallNudge';
    nudge.className = 'pwa-install-nudge';
    nudge.innerHTML = `
      <div>
        <strong>${ios ? 'Instale o AiProf no seu iPhone' : chrome ? 'Instale o AiProf no Google Chrome' : 'Tenha o AiProf sempre a mao'}</strong>
        <span>${ios ? 'Acesse diretamente pela sua Tela de Inicio, como um aplicativo.' : chrome ? 'Acesse pela tela inicial ou em uma janela de aplicativo.' : 'Instale o AiProf no seu celular e acesse direto pela tela inicial.'}</span>
      </div>
      <div class="pwa-install-actions">
        <button class="primary" type="button" data-pwa-install-button="nudge">${ios ? 'Ver como instalar' : 'Instalar AiProf'}</button>
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
    if (isIOS()) {
      openInstallModal();
      return;
    }
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      installState = 'prompt-used';
      prompt.prompt();
      try { await prompt.userChoice; } catch (_) {}
      setButtonState();
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
    installState = canShowManualInstall() ? 'manual' : 'unavailable';
    refreshInstallUi();
    setTimeout(refreshInstallUi, 800);
  });

  window.addEventListener('portal:user-ready', refreshInstallUi);
  window.addEventListener('resize', () => setTimeout(refreshInstallUi, 150));
})();