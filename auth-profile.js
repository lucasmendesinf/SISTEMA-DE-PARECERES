(() => {
  const api = 'api.php?resource=auth';
  const billingApi = 'api.php?resource=billing';
  let user = null;

  const initials = (name = '') => name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase() || 'AP';

  const firstName = (name = '') => name.split(/\s+/).filter(Boolean)[0] || 'professora';

  function timeGreeting(date = new Date()) {
    const hour = date.getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
  const cycleLabels = {monthly: 'Mensal', annual: 'Anual'};
  const paymentLabels = {pix: 'Pix', card: 'Cartao recorrente', both: 'Pix ou cartao', manual: 'Manual'};
  const billingStatusLabels = {trial: 'Teste', pending: 'Pendente', active: 'Ativo', overdue: 'Atrasado', canceled: 'Cancelado', exempt: 'Isento'};
  const money = value => Number(value || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const billingMethods = billing => billing?.paymentMethod === 'pix' ? ['pix'] : billing?.paymentMethod === 'card' ? ['card'] : ['pix', 'card'];
  const supportWhatsAppUrl = 'https://wa.me/5541996310725';

  async function request(method = 'GET', body) {
    const response = await fetch(api, {
      method,
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (response.status === 401) {
      location.href = 'login.php';
      throw new Error('Sessão expirada.');
    }
    if (response.status === 402) {
      location.href = 'login.php?billing=pending';
      throw new Error('Pagamento do plano pendente.');
    }
    if (!response.ok) throw new Error(data.error || 'Não foi possível salvar os dados.');
    return data;
  }

  async function billingRequest(method = 'GET', body) {
    const response = await fetch(billingApi, {
      method,
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (response.status === 401) {
      location.href = 'login.php';
      throw new Error('Sessao expirada.');
    }
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel iniciar o pagamento.');
    return data;
  }

  function renderBillingPaymentResult(container, data) {
    if (data.method === 'pix') {
      const content = `
        ${data.qrCodeBase64 ? `<img class="billing-qr" src="data:image/png;base64,${data.qrCodeBase64}" alt="QR Code Pix">` : ''}
        <span>${escapeHtml(data.message || 'Pix gerado. Escaneie o QR Code ou copie o codigo abaixo.')}</span>
        ${data.qrCode ? `<textarea class="billing-copy" readonly>${escapeHtml(data.qrCode)}</textarea>` : ''}
        ${data.qrCode ? '<button class="secondary billing-copy-button" type="button">Copiar codigo Pix</button>' : ''}
        ${data.paymentId ? `<button class="primary" type="button" data-confirm-payment="${escapeHtml(data.paymentId)}">Ja paguei, confirmar</button>` : ''}
      `;
      container.innerHTML = 'Pix gerado. O QR Code esta aberto na tela para pagamento.';
      openBillingModal('Pagamento via Pix', content);
      return;
    }
    const url = data.initPoint || data.sandboxInitPoint || '';
    const content = url
      ? `<p>${escapeHtml(data.message || 'Link gerado.')}</p><a class="primary billing-checkout-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir cadastro do cartao</a>`
      : escapeHtml(data.message || 'Pagamento iniciado.');
    container.innerHTML = url ? 'Link de cadastro do cartao gerado. Abra a janela para informar os dados.' : content;
    openBillingModal('Cadastrar cartao', content);
  }

  function openBillingModal(title, content) {
    let modal = document.querySelector('#billingModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'billingModal';
      modal.className = 'billing-modal-backdrop';
      modal.innerHTML = `
        <div class="billing-modal" role="dialog" aria-modal="true" aria-labelledby="billingModalTitle">
          <button class="billing-modal-close" type="button" aria-label="Fechar">x</button>
          <h3 id="billingModalTitle"></h3>
          <div id="billingModalContent" class="billing-modal-content"></div>
        </div>`;
      document.body.append(modal);
      modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest('.billing-modal-close')) closeBillingModal();
      });
      modal.addEventListener('click', async event => {
        const copyButton = event.target.closest('.billing-copy-button');
        if (!copyButton) return;
        const copyText = modal.querySelector('.billing-copy')?.value || '';
        if (!copyText) return;
        try {
          await navigator.clipboard.writeText(copyText);
          copyButton.textContent = 'Codigo copiado';
        } catch (_) {
          modal.querySelector('.billing-copy')?.select();
          copyButton.textContent = 'Selecione e copie o codigo';
        }
      });
      modal.addEventListener('click', async event => {
        const confirmButton = event.target.closest('[data-confirm-payment]');
        if (!confirmButton) return;
        await confirmPayment(confirmButton.dataset.confirmPayment, confirmButton);
      });
    }
    modal.querySelector('#billingModalTitle').textContent = title;
    modal.querySelector('#billingModalContent').innerHTML = content;
    modal.hidden = false;
    document.body.classList.add('billing-modal-open');
    modal.querySelector('.billing-modal-close')?.focus();
  }

  function closeBillingModal() {
    const modal = document.querySelector('#billingModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('billing-modal-open');
  }

  async function confirmPayment(paymentId, button) {
    if (!paymentId) return;
    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = 'Confirmando...';
    try {
      const response = await fetch(`api.php?resource=billing-return&payment_id=${encodeURIComponent(paymentId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Pagamento ainda nao confirmado.');
      user = await request();
      window.PortalCurrentUser = user;
      renderBillingBanner();
      renderBillingLockModal();
      const message = document.querySelector('#billingMessage');
      if (message) message.textContent = data.message || 'Pagamento confirmado. Acesso liberado.';
      button.textContent = 'Pagamento confirmado';
      setTimeout(closeBillingModal, 900);
    } catch (error) {
      button.textContent = previousText;
      alert(error.message || 'Pagamento ainda nao confirmado.');
    } finally {
      button.disabled = false;
    }
  }

  function renderBillingBanner() {
    document.querySelector('#billingTopBanner')?.remove();
    const alert = user?.billingAlert;
    if (!alert?.message) return;
    const header = document.querySelector('main > header');
    if (!header) return;
    const banner = document.createElement('div');
    const isDanger = alert.level === 'danger';
    banner.id = 'billingTopBanner';
    banner.className = `billing-top-banner ${isDanger ? 'danger' : 'warning'}`;
    banner.setAttribute('role', isDanger ? 'alert' : 'status');
    banner.innerHTML = `
      <div>
        <strong>${isDanger ? 'Fatura vencida' : 'Fatura a vencer'}</strong>
        <span>${escapeHtml(alert.message)}</span>
      </div>
      <button class="secondary" type="button">Pagar agora</button>`;
    banner.querySelector('button')?.addEventListener('click', openBillingPaymentScreen);
    header.insertAdjacentElement('afterend', banner);
  }

  function renderBillingLockModal() {
    document.querySelector('#billingLockModal')?.remove();
    document.body.classList.toggle('billing-locked', !!user?.billingLock);
    if (!user?.billingLock) return;
    const billing = user.billing || {};
    const methods = billingMethods(billing);
    const modal = document.createElement('div');
    modal.id = 'billingLockModal';
    modal.className = 'billing-lock-backdrop';
    modal.innerHTML = `
      <div class="billing-lock-modal" role="dialog" aria-modal="true" aria-labelledby="billingLockTitle">
        <p class="eyebrow">ACESSO BLOQUEADO</p>
        <h2 id="billingLockTitle">Fatura vencida</h2>
        <p>${escapeHtml(user.billingLock.message || 'Regularize o pagamento para liberar o acesso.')}</p>
        <dl class="billing-summary">
          <div><dt>Plano</dt><dd>${escapeHtml(billing.plan || 'Basico')}</dd></div>
          <div><dt>Ciclo</dt><dd>${escapeHtml(cycleLabels[billing.cycle] || 'Mensal')}</dd></div>
          <div><dt>Valor</dt><dd>${escapeHtml(money(billing.amount))}</dd></div>
          <div><dt>Vencimento</dt><dd>${escapeHtml(billing.nextDueDate || 'Nao informado')}</dd></div>
        </dl>
        <div id="billingLockMessage" class="profile-message"></div>
        <div class="form-actions billing-actions">
          ${methods.includes('pix') ? '<button class="primary" type="button" data-lock-pay-method="pix">Pagar com Pix</button>' : ''}
          ${methods.includes('card') ? '<button class="primary" type="button" data-lock-pay-method="card">Cadastrar cartao</button>' : ''}
        </div>
        <div class="billing-lock-footer">
          <a class="billing-support-link" href="${supportWhatsAppUrl}" target="_blank" rel="noopener" aria-label="Entrar em contato com o suporte pelo WhatsApp">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 2a9.7 9.7 0 0 0-8.4 14.6L2.7 22l5.5-1.4A9.7 9.7 0 1 0 12 2Zm0 1.9a7.8 7.8 0 0 1 0 15.6 7.7 7.7 0 0 1-3.7-.9l-.4-.2-2.7.7.7-2.7-.2-.4A7.8 7.8 0 0 1 12 3.9Zm-3.1 4c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.8 2.8 4.4 3.8 2.2.9 2.6.7 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3l-1.7-.8c-.2-.1-.4-.1-.6.1l-.7.9c-.1.2-.3.2-.6.1-.2-.1-1.1-.4-2.1-1.3-.8-.7-1.3-1.6-1.5-1.8-.1-.3 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5.1-.2.1-.3 0-.5l-.8-1.8c-.2-.4-.4-.4-.6-.4Z"/>
            </svg>
            Suporte
          </a>
          <button class="secondary" type="button" data-billing-logout>Sair sem pagar agora</button>
        </div>
      </div>`;
    document.body.append(modal);
    modal.querySelectorAll('[data-lock-pay-method]').forEach(button => {
      button.addEventListener('click', async () => {
        const message = modal.querySelector('#billingLockMessage');
        message.textContent = '';
        button.disabled = true;
        try {
          const data = await billingRequest('POST', {method: button.dataset.lockPayMethod});
          renderBillingPaymentResult(message, data);
        } catch (error) {
          message.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      });
    });
    modal.querySelector('[data-billing-logout]')?.addEventListener('click', logout);
    modal.querySelector('[data-lock-pay-method]')?.focus();
  }

  async function logout() {
    try { await request('POST', {action: 'logout'}); } finally { location.href = 'login.php'; }
  }

  function closeProfileMenu() {
    const profile = document.querySelector('.sidebar-bottom .profile');
    const menu = document.querySelector('.profile-menu');
    if (!profile || !menu) return;
    profile.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
  }

  function openProfileMenu() {
    const profile = document.querySelector('.sidebar-bottom .profile');
    const menu = document.querySelector('.profile-menu');
    if (!profile || !menu) return;
    profile.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
  }

  function renderProfile() {
    document.querySelector('#perfil')?.remove();
    const section = document.createElement('section');
    section.id = 'perfil';
    section.className = 'view';
    const billing = user?.billing || {};
    const methods = billingMethods(billing);
    const billingStatusText = user?.billingAlert?.level === 'danger'
      ? 'Vencida'
      : user?.billingAlert?.status
        ? 'A vencer'
        : (billingStatusLabels[billing.status] || 'Pendente');
    section.innerHTML = `
      <div class="page-title">
        <div>
          <p class="eyebrow">CONTA DA PROFESSORA</p>
          <h1>Meus dados</h1>
          <p>Atualize suas informações básicas de acesso e altere sua senha.</p>
        </div>
      </div>
      <div class="profile-panel">
        <div class="profile-heading">
          <div class="profile-avatar-large">${initials(user?.name)}</div>
          <div>
            <h2>${escapeHtml(user?.name)}</h2>
            <p>Professora</p>
          </div>
        </div>
        <form id="profileForm" class="profile-form">
          <label>Nome completo
            <input name="name" required value="${escapeHtml(user?.name)}">
          </label>
          <label>E-mail
            <input name="email" type="email" required value="${escapeHtml(user?.email)}">
          </label>
          <label>Telefone
            <input name="phone" type="tel" value="${escapeHtml(user?.phone)}" placeholder="(00) 00000-0000">
          </label>
          <p id="profileMessage" class="profile-message"></p>
          <div class="form-actions">
            <button class="primary" type="submit">Salvar dados</button>
            <button id="logoutButton" class="secondary" type="button">Sair da conta</button>
          </div>
        </form>
        <div class="billing-panel">
          <div class="profile-subtitle">
            <h3>Cobranca do plano</h3>
            <p>Veja o plano contratado e escolha a forma de pagamento liberada para sua conta.</p>
          </div>
          <dl class="billing-summary">
            <div><dt>Plano</dt><dd>${escapeHtml(billing.plan || 'Basico')}</dd></div>
            <div><dt>Ciclo</dt><dd>${escapeHtml(cycleLabels[billing.cycle] || 'Mensal')}</dd></div>
            <div><dt>Valor</dt><dd>${escapeHtml(money(billing.amount))}</dd></div>
            <div><dt>Status</dt><dd>${escapeHtml(billingStatusText)}</dd></div>
            <div><dt>Pagamento</dt><dd>${escapeHtml(paymentLabels[billing.paymentMethod] || 'Pix ou cartao')}</dd></div>
            <div><dt>Vencimento</dt><dd>${escapeHtml(billing.nextDueDate || 'Nao informado')}</dd></div>
          </dl>
          <div id="billingMessage" class="profile-message"></div>
          <div class="form-actions billing-actions">
            ${methods.includes('pix') ? '<button class="secondary" type="button" data-pay-method="pix">Pagar com Pix</button>' : ''}
            ${methods.includes('card') ? '<button class="secondary" type="button" data-pay-method="card">Cadastrar cartao</button>' : ''}
            ${methods.length ? '' : '<span class="billing-no-method">Nenhuma forma de pagamento liberada. Entre em contato com o suporte.</span>'}
          </div>
        </div>
        <form id="passwordForm" class="profile-form password-form">
          <div class="profile-subtitle">
            <h3>Alterar senha</h3>
            <p>Informe sua senha atual para cadastrar uma nova senha de acesso.</p>
          </div>
          <label>Senha atual
            <input name="currentPassword" type="password" autocomplete="current-password" required>
          </label>
          <label>Nova senha
            <input name="newPassword" type="password" autocomplete="new-password" minlength="6" required>
          </label>
          <label>Confirmar nova senha
            <input name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required>
          </label>
          <p id="passwordMessage" class="profile-message"></p>
          <div class="form-actions">
            <button class="primary" type="submit">Alterar senha</button>
          </div>
        </form>
      </div>`;
    document.querySelector('main').append(section);

    section.querySelector('#profileForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = section.querySelector('#profileMessage');
      message.textContent = '';
      const fields = Object.fromEntries(new FormData(form));
      try {
        await request('PUT', fields);
        user = {...user, ...fields};
        updateChrome();
        renderBillingBanner();
        message.textContent = 'Dados atualizados com sucesso.';
      } catch (error) {
        message.textContent = error.message;
      }
    });

    section.querySelectorAll('[data-pay-method]').forEach(button => {
      button.addEventListener('click', async () => {
        const message = section.querySelector('#billingMessage');
        message.textContent = '';
        button.disabled = true;
        try {
          const data = await billingRequest('POST', {method: button.dataset.payMethod});
          renderBillingPaymentResult(message, data);
        } catch (error) {
          message.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      });
    });

    section.querySelector('#passwordForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = section.querySelector('#passwordMessage');
      message.textContent = '';
      const fields = Object.fromEntries(new FormData(form));
      if (fields.newPassword !== fields.confirmPassword) {
        message.textContent = 'A confirmação da senha não confere.';
        return;
      }
      try {
        await request('PUT', {action: 'change_password', ...fields});
        form.reset();
        message.textContent = 'Senha alterada com sucesso.';
      } catch (error) {
        message.textContent = error.message;
      }
    });

    section.querySelector('#logoutButton').addEventListener('click', logout);
  }

  function updateChrome() {
    const profile = document.querySelector('.sidebar-bottom .profile');
    if (!profile || !user) return;
    profile.querySelector('.avatar').textContent = initials(user.name);
    profile.querySelector('strong').textContent = user.name;
    const welcomeTitle = document.querySelector('#inicio .welcome h1');
    if (welcomeTitle) {
      const greeting = `${timeGreeting()}, ${firstName(user.name)}! `;
      if (welcomeTitle.firstChild?.nodeType === Node.TEXT_NODE) {
        welcomeTitle.firstChild.nodeValue = greeting;
      } else {
        welcomeTitle.prepend(document.createTextNode(greeting));
      }
    }
    const heading = document.querySelector('#perfil .profile-heading');
    if (heading) {
      heading.querySelector('.profile-avatar-large').textContent = initials(user.name);
      heading.querySelector('h2').textContent = user.name;
    }
  }

  function openProfile() {
    closeProfileMenu();
    renderProfile();
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'perfil'));
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === 'perfil'));
    const title = document.querySelector('#headerTitle');
    if (title) title.textContent = 'Meus dados';
    document.querySelector('.sidebar')?.classList.remove('open');
    document.body.classList.remove('menu-open');
  }

  function openBillingPaymentScreen() {
    openProfile();
    setTimeout(() => {
      const panel = document.querySelector('#perfil .billing-panel');
      panel?.scrollIntoView({behavior: 'smooth', block: 'start'});
      panel?.querySelector('[data-pay-method]')?.focus();
    }, 80);
  }

  function redirectOverdueBillingOnce() {
    const alert = user?.billingAlert;
    if (alert?.status !== 'overdue_grace') return;
    const billing = user?.billing || {};
    if (billing.paymentMethod === 'manual') return;
    const key = `billing-overdue-opened-${user.id}-${billing.nextDueDate || ''}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setTimeout(openBillingPaymentScreen, 350);
  }

  async function init() {
    try { user = await request(); } catch (_) { return; }
    window.PortalCurrentUser = user;
    document.body.dataset.role = user.role || 'cliente';
    window.dispatchEvent(new CustomEvent('portal:user-ready', {detail: user}));
    if (user.billingWarning && !user.billingAlert) setTimeout(() => alert(user.billingWarning), 300);
    const sidebarBottom = document.querySelector('.sidebar-bottom');
    const profile = document.querySelector('.sidebar-bottom .profile');
    sidebarBottom?.addEventListener('mouseenter', openProfileMenu);
    sidebarBottom?.addEventListener('mouseleave', closeProfileMenu);
    sidebarBottom?.addEventListener('focusin', openProfileMenu);
    sidebarBottom?.addEventListener('focusout', event => {
      if (!sidebarBottom.contains(event.relatedTarget)) closeProfileMenu();
    });
    profile?.setAttribute('role', 'button');
    profile?.setAttribute('tabindex', '0');
    profile?.addEventListener('click', event => {
      event.stopPropagation();
      const expanded = profile.getAttribute('aria-expanded') === 'true';
      if (expanded) closeProfileMenu();
      else openProfileMenu();
    });
    profile?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProfileMenu();
      }
      if (event.key === 'Escape') {
        closeProfileMenu();
      }
    });
    document.querySelector('#sidebarProfileButton')?.addEventListener('click', openProfile);
    document.querySelector('#sidebarLogoutButton')?.addEventListener('click', logout);
    document.querySelector('.profile-menu')?.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('click', closeProfileMenu);
    updateChrome();
    renderBillingBanner();
    renderBillingLockModal();
    redirectOverdueBillingOnce();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
