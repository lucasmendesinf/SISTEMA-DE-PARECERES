(() => {
  const authApi = 'api.php?resource=auth';
  const usersApi = 'api.php?resource=users';
  const resetUserApi = 'api.php?resource=user-reset';
  const billingCyclesApi = 'api.php?resource=billing-cycles';
  const labels = {
    alunos: 'Alunos',
    turmas: 'Turmas',
    periodos: 'Periodos',
    atividades: 'Atividades',
    pareceres: 'Pareceres',
    portfolio: 'Portfolio',
    configuracoes: 'Configuracoes'
  };
  const editorLabels = {
    none: 'Nenhum editor',
    manual: 'Editor com IA e manual',
    ai: 'Editor com IA e manual',
    both: 'Editor com IA e manual'
  };
  const cycleLabels = {monthly: 'Mensal', annual: 'Anual'};
  const paymentLabels = {pix: 'Pix', card: 'Cartao recorrente', both: 'Pix ou cartao', manual: 'Manual'};
  const billingStatusLabels = {trial: 'Teste', pending: 'Pendente', active: 'Pago', overdue: 'Atrasado', canceled: 'Cancelado', exempt: 'Isento'};
  const viewPermissions = {
    criancas: 'alunos',
    turmas: 'turmas',
    periodos: 'periodos',
    atividades: 'atividades',
    pareceres: 'pareceres',
    configuracoes: 'configuracoes'
  };
  let currentUser = null;
  let usersState = {users: [], currentUserId: 0, availablePermissions: Object.keys(labels)};
  let billingCycles = [];
  const userFilters = {active: '', role: ''};

  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
  const phoneDigits = value => String(value || '').replace(/\D/g, '').slice(0, 11);
  const formatPhone = value => {
    const digits = phoneDigits(value);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  async function request(url, options = {}) {
    const response = await fetch(url, options);
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (response.status === 401) {
      location.href = 'login.php';
      throw new Error('Sessao expirada.');
    }
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel concluir a operacao.');
    return data;
  }

  function canAccess(view) {
    if (!currentUser || currentUser.role === 'master') return true;
    if (view === 'configuracoes') return true;
    const permission = viewPermissions[view];
    if (!permission) return true;
    if (view === 'pareceres') {
      return currentUser.permissions.includes('pareceres') || currentUser.permissions.includes('portfolio');
    }
    return currentUser.permissions.includes(permission);
  }

  function activateView(viewId, label) {
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === viewId));
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === viewId));
    const title = document.querySelector('#headerTitle');
    if (title) title.textContent = label;
    document.querySelector('.sidebar')?.classList.remove('open');
    document.body.classList.remove('menu-open');
    window.scrollTo(0, 0);
  }

  function applyClientPermissions() {
    if (!currentUser || currentUser.role === 'master') return;
    document.querySelectorAll('.nav-item[data-view]').forEach(button => {
      if (!canAccess(button.dataset.view)) button.hidden = true;
    });
    document.querySelectorAll('[data-go]').forEach(button => {
      if (!canAccess(button.dataset.go)) button.hidden = true;
    });
    const active = document.querySelector('.nav-item.active');
    if (active && active.hidden) {
      const firstAllowed = [...document.querySelectorAll('.nav-item[data-view]')].find(button => !button.hidden);
      firstAllowed?.click();
    }
  }

  function ensureUsersView() {
    if (document.querySelector('#usuarios')) return;
    const section = document.createElement('section');
    section.id = 'usuarios';
    section.className = 'view';
    section.innerHTML = `
      <div class="page-title">
        <div>
          <p class="eyebrow">LOGIN MASTER</p>
          <h1>Usuarios e permissoes</h1>
          <p>Crie acessos para clientes e defina quais areas do portal cada conta pode usar.</p>
        </div>
        <button class="primary" id="addPortalUser" type="button">+ Novo usuario</button>
      </div>
      <div class="panel">
        <div class="toolbar user-admin-toolbar">
          <span id="portalUsersTotal"></span>
          <div class="user-admin-filters">
            <select id="filterUserActive">
              <option value="">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
            <select id="filterUserRole">
              <option value="">Todos os tipos</option>
              <option value="cliente">Clientes</option>
              <option value="master">Masters</option>
            </select>
          </div>
        </div>
        <div id="portalUsersList" class="user-admin-list"></div>
      </div>`;
    document.querySelector('main').append(section);
    section.querySelector('#addPortalUser').addEventListener('click', () => openUserForm());
    section.querySelector('#filterUserActive').addEventListener('change', event => {
      userFilters.active = event.target.value;
      renderUsers();
    });
    section.querySelector('#filterUserRole').addEventListener('change', event => {
      userFilters.role = event.target.value;
      renderUsers();
    });
  }

  function ensureUsersNav() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav || document.querySelector('.nav-item[data-view="usuarios"]')) return;
    const button = document.createElement('button');
    button.className = 'nav-item';
    button.dataset.view = 'usuarios';
    button.type = 'button';
    button.innerHTML = '<span>@</span> Usuarios';
    nav.append(button);
    button.addEventListener('click', () => activateView('usuarios', 'Usuarios'));
  }

  function permissionsText(user) {
    if (user.role === 'master') return 'Acesso master completo';
    if (!user.permissions?.length) return 'Sem permissoes liberadas';
    return user.permissions.map(permission => labels[permission] || permission).join(', ');
  }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  }

  function billingText(user) {
    const billing = user.billing || {};
    const trialText = Number(billing.trialDays || 0) > 0 ? ` - teste ${Number(billing.trialDays)} dias` : '';
    return `${billing.plan || 'Basico'} - ${billing.cycleLabel || cycleLabels[billing.cycle] || 'Mensal'} - ${money(billing.amount)} - ${paymentLabels[billing.paymentMethod] || 'Pix ou cartao'} - ${billingStatusLabels[billing.status] || 'Pendente'}${trialText}`;
  }

  function renderUsers() {
    ensureUsersView();
    const list = document.querySelector('#portalUsersList');
    const total = document.querySelector('#portalUsersTotal');
    if (!list || !total) return;
    const filteredUsers = usersState.users.filter(user => {
      if (userFilters.active === 'active' && !user.active) return false;
      if (userFilters.active === 'inactive' && user.active) return false;
      if (userFilters.role && user.role !== userFilters.role) return false;
      return true;
    });
    total.textContent = `${filteredUsers.length} de ${usersState.users.length} usuarios`;
    list.innerHTML = filteredUsers.map(user => `
      <article class="user-admin-card">
        <div class="user-admin-main">
          <span class="avatar">${escapeHtml((user.name || 'AP').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase())}</span>
          <div>
            <strong>${escapeHtml(user.name)}</strong>
            <p>${escapeHtml(user.email)}${user.phone ? ` - ${escapeHtml(user.phone)}` : ''}</p>
            <small>${escapeHtml(permissionsText(user))}</small>
            <small>Imagem: ${escapeHtml(editorLabels[user.imageEditorPermission || 'none'])}</small>
            <small>Cobranca: ${escapeHtml(billingText(user))}</small>
          </div>
        </div>
        <span class="status ${user.active ? 'done' : ''}">${user.active ? 'Ativo' : 'Inativo'}</span>
        <span class="status ${user.role === 'master' ? 'done' : ''}">${user.role === 'master' ? 'Master' : 'Cliente'}</span>
        <div class="actions">
          <button class="secondary" type="button" data-edit-user="${user.id}">Editar</button>
          ${user.role === 'cliente' ? `<button class="secondary danger" type="button" data-reset-user="${user.id}">Resetar dados</button>` : ''}
          ${user.id === usersState.currentUserId ? '' : `<button class="secondary danger" type="button" data-delete-user="${user.id}">Excluir</button>`}
        </div>
      </article>`).join('') || '<p class="muted">Nenhum usuario cadastrado.</p>';
    list.querySelectorAll('[data-edit-user]').forEach(button => {
      button.addEventListener('click', () => openUserForm(usersState.users.find(user => user.id === Number(button.dataset.editUser))));
    });
    list.querySelectorAll('[data-delete-user]').forEach(button => {
      button.addEventListener('click', () => deleteUser(Number(button.dataset.deleteUser)));
    });
    list.querySelectorAll('[data-reset-user]').forEach(button => {
      button.addEventListener('click', () => resetUser(Number(button.dataset.resetUser)));
    });
  }

  async function loadUsers() {
    usersState = await request(usersApi);
    renderUsers();
  }

  async function loadBillingCycles() {
    const data = await request(billingCyclesApi);
    billingCycles = data.cycles || [];
  }

  function openUserForm(user = null) {
    const editing = Boolean(user);
    const permissions = new Set(user?.permissions || []);
    const billing = user?.billing || {};
    const defaultCycle = billingCycles.find(cycle => cycle.active) || billingCycles[0] || null;
    const selectedCycleId = Number(billing.cycleId || defaultCycle?.id || 0);
    const selectedCycle = billingCycles.find(cycle => Number(cycle.id) === selectedCycleId) || billingCycles[0] || null;
    const trialDays = Number(billing.trialDays ?? (!editing ? 3 : 0));
    const cycleOptions = billingCycles.map(cycle => {
      const selected = Number(cycle.id) === selectedCycleId;
      return `<option value="${cycle.id}" data-months="${cycle.months}" data-amount="${Number(cycle.amount || 0).toFixed(2)}" ${selected ? 'selected' : ''} ${!cycle.active && !selected ? 'disabled' : ''}>${escapeHtml(cycle.name)}${cycle.active ? '' : ' (inativo)'} - ${cycle.months} ${cycle.months === 1 ? 'mes' : 'meses'} - ${money(cycle.amount)}</option>`;
    }).join('');
    const modal = document.querySelector('#modal');
    const content = document.querySelector('#modalContent');
    if (!modal || !content) return;
    content.innerHTML = `
      <h2 class="modal-title">${editing ? 'Editar usuario' : 'Novo usuario'}</h2>
      <p class="modal-subtitle">Defina o tipo de acesso e as areas liberadas para esta conta.</p>
      <div id="portalUserForm" class="form-grid">
        <div class="field"><label>Nome completo</label><input name="name" required value="${escapeHtml(user?.name)}" autofocus></div>
        <div class="field"><label>E-mail</label><input name="email" type="email" required value="${escapeHtml(user?.email)}"></div>
        <div class="field"><label>Telefone</label><input name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="15" pattern="\\([0-9]{2}\\) [0-9]{4,5}-[0-9]{4}" value="${escapeHtml(formatPhone(user?.phone))}" placeholder="(00) 00000-0000"></div>
        <div class="field"><label>${editing ? 'Nova senha' : 'Senha inicial'}</label><input name="password" type="password" ${editing ? '' : 'required'} minlength="6" placeholder="${editing ? 'Preencha apenas se quiser alterar' : 'Minimo de 6 caracteres'}"></div>
        <div class="form-grid two-columns">
          <div class="field"><label>Tipo de login</label><select name="role"><option value="cliente" ${user?.role === 'master' ? '' : 'selected'}>Cliente</option><option value="master" ${user?.role === 'master' ? 'selected' : ''}>Master</option></select></div>
          <label class="checkline"><input name="active" type="checkbox" ${user?.active === false ? '' : 'checked'}> Usuario ativo</label>
        </div>
        <div class="field">
          <label>Editor de imagem liberado</label>
          <select name="imageEditorPermission">
            <option value="none" ${(user?.imageEditorPermission || 'none') === 'none' ? 'selected' : ''}>Nenhum editor</option>
            <option value="manual" ${['manual', 'ai', 'both'].includes(user?.imageEditorPermission) ? 'selected' : ''}>Editor com IA e manual</option>
          </select>
        </div>
        <div class="billing-box">
          <div class="profile-subtitle">
            <h3>Cobranca do cliente</h3>
            <p>Configure como este plano sera cobrado no login da professora.</p>
          </div>
          <div class="form-grid two-columns">
            <div class="field"><label>Nome do plano</label><input name="billingPlan" value="${escapeHtml(billing.plan || 'Basico')}"></div>
            <div class="field"><label>Ciclo de cobranca</label><select name="billingCycleId" required>${cycleOptions || '<option value="">Cadastre um ciclo nas configuracoes</option>'}</select></div>
            <div class="field"><label>Valor</label><input name="billingAmount" type="number" min="0" step="0.01" value="${Number(selectedCycle?.amount ?? billing.amount ?? 0).toFixed(2)}" readonly></div>
            <input name="billingCycle" type="hidden" value="${(selectedCycle?.months || billing.cycleMonths || 1) >= 12 ? 'annual' : 'monthly'}">
            <div class="field"><label>Forma de pagamento</label><select name="billingPaymentMethod"><option value="both" ${(billing.paymentMethod || 'both') === 'both' ? 'selected' : ''}>Pix ou cartao</option><option value="pix" ${billing.paymentMethod === 'pix' ? 'selected' : ''}>Somente Pix</option><option value="card" ${billing.paymentMethod === 'card' ? 'selected' : ''}>Somente cartao recorrente</option><option value="manual" ${billing.paymentMethod === 'manual' ? 'selected' : ''}>Cobranca manual</option></select></div>
            <div class="field"><label>Status</label><select name="billingStatus"><option value="pending" ${(billing.status || 'pending') === 'pending' ? 'selected' : ''}>Pendente</option><option value="active" ${billing.status === 'active' ? 'selected' : ''}>Pago/ativo</option><option value="trial" ${billing.status === 'trial' ? 'selected' : ''}>Teste</option><option value="overdue" ${billing.status === 'overdue' ? 'selected' : ''}>Atrasado</option><option value="canceled" ${billing.status === 'canceled' ? 'selected' : ''}>Cancelado</option><option value="exempt" ${billing.status === 'exempt' ? 'selected' : ''}>Isento</option></select></div>
            <div class="field"><label>Dias de teste</label><input name="billingTrialDays" type="number" min="0" max="365" step="1" value="${trialDays}"></div>
            <div class="field"><label>Proximo vencimento</label><input name="billingNextDueDate" type="date" value="${escapeHtml(billing.nextDueDate || '')}"></div>
          </div>
          <div class="field"><label>Observacoes internas</label><input name="billingNotes" value="${escapeHtml(billing.notes || '')}" placeholder="Opcional"></div>
        </div>
        <div class="field permissions-field">
          <label>Permissoes do cliente</label>
          <div class="permissions-grid">
            ${usersState.availablePermissions.map(permission => `<label><input type="checkbox" name="permissions" value="${permission}" ${permissions.has(permission) ? 'checked' : ''}> ${labels[permission] || permission}</label>`).join('')}
          </div>
        </div>
        <p id="portalUserMessage" class="profile-message"></p>
        <div class="form-actions">
          <button class="secondary" type="button" onclick="document.querySelector('#modal').close()">Cancelar</button>
          <button class="primary" id="savePortalUser" type="button">${editing ? 'Salvar usuario' : 'Criar usuario'}</button>
        </div>
      </div>`;
    const form = content.querySelector('#portalUserForm');
    const cycleSelect = form.querySelector('[name="billingCycleId"]');
    const amountInput = form.querySelector('[name="billingAmount"]');
    const legacyCycleInput = form.querySelector('[name="billingCycle"]');
    const trialDaysInput = form.querySelector('[name="billingTrialDays"]');
    const statusSelect = form.querySelector('[name="billingStatus"]');
    const nextDueInput = form.querySelector('[name="billingNextDueDate"]');
    const syncCycle = () => {
      const selected = cycleSelect.selectedOptions[0];
      const months = Number(selected?.dataset.months || 1);
      amountInput.value = Number(selected?.dataset.amount || 0).toFixed(2);
      legacyCycleInput.value = months >= 12 ? 'annual' : 'monthly';
    };
    cycleSelect.addEventListener('change', syncCycle);
    syncCycle();
    const syncTrial = () => {
      const days = Math.max(0, Number(trialDaysInput.value || 0));
      if (days > 0) {
        statusSelect.value = 'trial';
        if (!editing || !nextDueInput.value) {
          const due = new Date();
          due.setHours(0, 0, 0, 0);
          due.setDate(due.getDate() + days);
          nextDueInput.value = due.toISOString().slice(0, 10);
        }
      }
    };
    trialDaysInput.addEventListener('input', syncTrial);
    syncTrial();
    const role = form.querySelector('[name="role"]');
    const phoneInput = form.querySelector('[name="phone"]');
    phoneInput.addEventListener('input', () => { phoneInput.value = formatPhone(phoneInput.value); });
    phoneInput.addEventListener('paste', () => setTimeout(() => { phoneInput.value = formatPhone(phoneInput.value); }, 0));
    const permissionsField = content.querySelector('.permissions-field');
    const syncRole = () => { permissionsField.hidden = role.value === 'master'; };
    role.addEventListener('change', syncRole);
    syncRole();
    content.querySelector('#savePortalUser').addEventListener('click', () => saveUser(form, user?.id));
    modal.showModal();
  }

  async function saveUser(form, id) {
    const message = form.querySelector('#portalUserMessage');
    const fields = form.querySelectorAll('input, select');
    const checkedPermissions = [...form.querySelectorAll('input[name="permissions"]:checked')].map(input => input.value);
    const payload = {
      id,
      name: form.querySelector('[name="name"]').value,
      email: form.querySelector('[name="email"]').value,
      phone: formatPhone(form.querySelector('[name="phone"]').value),
      password: form.querySelector('[name="password"]').value,
      role: form.querySelector('[name="role"]').value,
      active: form.querySelector('[name="active"]').checked,
      imageEditorPermission: form.querySelector('[name="imageEditorPermission"]').value,
      permissions: checkedPermissions,
      billing: {
        plan: form.querySelector('[name="billingPlan"]').value,
        amount: form.querySelector('[name="billingAmount"]').value,
        cycle: form.querySelector('[name="billingCycle"]').value,
        cycleId: form.querySelector('[name="billingCycleId"]').value,
        paymentMethod: form.querySelector('[name="billingPaymentMethod"]').value,
        status: form.querySelector('[name="billingStatus"]').value,
        nextDueDate: form.querySelector('[name="billingNextDueDate"]').value,
        notes: form.querySelector('[name="billingNotes"]').value,
        trialDays: form.querySelector('[name="billingTrialDays"]').value
      }
    };
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return;
      }
    }
    message.textContent = '';
    try {
      await request(usersApi, {
        method: id ? 'PUT' : 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      document.querySelector('#modal')?.close();
      await loadUsers();
    } catch (error) {
      message.textContent = error.message;
    }
  }

  async function deleteUser(id) {
    if (!confirm('Excluir este usuario de acesso?')) return;
    await request(`${usersApi}&id=${id}`, {method: 'DELETE'});
    await loadUsers();
  }

  async function resetUser(id) {
    const user = usersState.users.find(item => Number(item.id) === Number(id));
    if (!user || user.role !== 'cliente') return;
    const typed = prompt(`Esta acao vai apagar os dados iniciais, escola, periodos, turmas, alunos, atividades, pareceres e portfolios de ${user.name}. O login, senha, permissoes e cobranca serao mantidos.\n\nDigite RESETAR para confirmar.`);
    if (typed !== 'RESETAR') return;
    await request(resetUserApi, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userId: id})
    });
    alert('Dados resetados. No proximo login, este usuario fara o cadastro inicial novamente.');
    await loadUsers();
  }

  async function init() {
    window.PortalCurrentUserPromise = window.PortalCurrentUserPromise || request(authApi);
    try { currentUser = await window.PortalCurrentUserPromise; } catch (_) { return; }
    applyClientPermissions();
    if (currentUser.role !== 'master') return;
    ensureUsersView();
    ensureUsersNav();
    await loadBillingCycles();
    await loadUsers();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
