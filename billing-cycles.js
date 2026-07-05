(() => {
  const api = 'api.php?resource=billing-cycles';
  const authApi = 'api.php?resource=auth';
  let cycles = [];

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[char]));
  const money = value => Number(value || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

  async function request(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.href = 'login.php';
      throw new Error('Sessao expirada.');
    }
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel salvar os ciclos.');
    return data;
  }

  function ensurePanel() {
    if (document.querySelector('#billingCyclesPanel')) return;
    const config = document.querySelector('#configuracoes');
    if (!config) return;
    const panel = document.createElement('div');
    panel.id = 'billingCyclesPanel';
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="profile-subtitle">
        <h3>Ciclos de cobranca</h3>
        <p>Cadastre os periodos usados no plano do cliente e o valor de cada ciclo.</p>
      </div>
      <div id="billingCyclesForm" class="form-grid two-columns">
        <input name="cycleId" type="hidden">
        <div class="field"><label>Nome do ciclo</label><input name="cycleName" placeholder="Ex.: Trimestral"></div>
        <div class="field"><label>Meses de cobranca</label><input name="cycleMonths" type="number" min="1" max="60" step="1" placeholder="Ex.: 3"></div>
        <div class="field"><label>Valor</label><input name="cycleAmount" type="number" min="0" step="0.01" placeholder="Ex.: 90.00"></div>
        <label class="checkline"><input name="cycleActive" type="checkbox" checked> Ciclo ativo</label>
      </div>
      <p id="billingCyclesMessage" class="profile-message"></p>
      <div class="form-actions">
        <button class="secondary" id="clearBillingCycleForm" type="button">Novo ciclo</button>
        <button class="primary" id="saveBillingCycle" type="button">Salvar ciclo</button>
      </div>
      <div id="billingCyclesList" class="simple-list"></div>`;
    const mercadoPanel = config.querySelector('.mercado-pago-panel');
    if (mercadoPanel) mercadoPanel.insertAdjacentElement('beforebegin', panel);
    else config.append(panel);
    panel.querySelector('#saveBillingCycle').addEventListener('click', saveCycle);
    panel.querySelector('#clearBillingCycleForm').addEventListener('click', clearForm);
    panel.querySelector('#billingCyclesList').addEventListener('click', event => {
      const edit = event.target.closest('[data-edit-cycle]');
      const remove = event.target.closest('[data-remove-cycle]');
      if (edit) fillForm(cycles.find(cycle => Number(cycle.id) === Number(edit.dataset.editCycle)));
      if (remove) removeCycle(Number(remove.dataset.removeCycle));
    });
  }

  function clearForm() {
    const form = document.querySelector('#billingCyclesForm');
    if (!form) return;
    form.querySelector('[name="cycleId"]').value = '';
    form.querySelector('[name="cycleName"]').value = '';
    form.querySelector('[name="cycleMonths"]').value = '';
    form.querySelector('[name="cycleAmount"]').value = '';
    form.querySelector('[name="cycleActive"]').checked = true;
    document.querySelector('#billingCyclesMessage').textContent = '';
  }

  function fillForm(cycle) {
    if (!cycle) return;
    const form = document.querySelector('#billingCyclesForm');
    form.querySelector('[name="cycleId"]').value = cycle.id;
    form.querySelector('[name="cycleName"]').value = cycle.name || '';
    form.querySelector('[name="cycleMonths"]').value = cycle.months || 1;
    form.querySelector('[name="cycleAmount"]').value = Number(cycle.amount || 0).toFixed(2);
    form.querySelector('[name="cycleActive"]').checked = Boolean(cycle.active);
    document.querySelector('#billingCyclesMessage').textContent = '';
  }

  function renderCycles() {
    const list = document.querySelector('#billingCyclesList');
    if (!list) return;
    list.innerHTML = cycles.map(cycle => `
      <article class="list-row">
        <div>
          <strong>${escapeHtml(cycle.name)}</strong>
          <small>${cycle.months} ${cycle.months === 1 ? 'mes' : 'meses'} - ${escapeHtml(money(cycle.amount))} - ${cycle.active ? 'Ativo' : 'Inativo'}</small>
        </div>
        <div class="actions">
          <button class="secondary" type="button" data-edit-cycle="${cycle.id}">Editar</button>
          <button class="secondary danger" type="button" data-remove-cycle="${cycle.id}">Inativar</button>
        </div>
      </article>`).join('') || '<p class="muted">Nenhum ciclo cadastrado.</p>';
  }

  async function loadCycles() {
    const data = await request(api);
    cycles = data.cycles || [];
    renderCycles();
  }

  async function saveCycle() {
    const form = document.querySelector('#billingCyclesForm');
    const message = document.querySelector('#billingCyclesMessage');
    const payload = {
      id: form.querySelector('[name="cycleId"]').value || undefined,
      name: form.querySelector('[name="cycleName"]').value,
      months: form.querySelector('[name="cycleMonths"]').value,
      amount: form.querySelector('[name="cycleAmount"]').value,
      active: form.querySelector('[name="cycleActive"]').checked
    };
    if (!payload.name || !payload.months) {
      message.textContent = 'Informe nome e quantidade de meses.';
      return;
    }
    try {
      await request(api, {method: payload.id ? 'PUT' : 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      message.textContent = 'Ciclo salvo com sucesso.';
      clearForm();
      await loadCycles();
    } catch (error) {
      message.textContent = error.message;
    }
  }

  async function removeCycle(id) {
    if (!confirm('Inativar este ciclo de cobranca?')) return;
    await request(`${api}&id=${id}`, {method: 'DELETE'});
    await loadCycles();
  }

  async function init() {
    const user = await request(authApi).catch(() => null);
    if (!user || user.role !== 'master') return;
    ensurePanel();
    await loadCycles();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
