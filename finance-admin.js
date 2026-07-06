(() => {
  const api = 'api.php?resource=finance';
  const authApi = 'api.php?resource=auth';
  const statusLabels = {pending: 'Pendente', approved: 'Pago', rejected: 'Rejeitado', canceled: 'Cancelado'};
  const billingStatusLabels = {trial: 'Teste', pending: 'Pendente', active: 'Pago', overdue: 'Atrasado', canceled: 'Cancelado', exempt: 'Isento'};
  const paymentLabels = {pix: 'Pix', card: 'Cartao', both: 'Pix ou cartao', manual: 'Manual'};
  let financeState = {clients: [], payments: [], summary: {}};

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[char]));
  const money = value => Number(value || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const dateBr = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : 'Nao informado';

  async function request(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.href = 'login.php';
      throw new Error('Sessao expirada.');
    }
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel concluir a operacao.');
    return data;
  }

  function ensureFinanceView() {
    if (document.querySelector('#financeiro')) return;
    const section = document.createElement('section');
    section.id = 'financeiro';
    section.className = 'view';
    section.innerHTML = `
      <div class="page-title">
        <div>
          <p class="eyebrow">LOGIN MASTER</p>
          <h1>Financeiro</h1>
          <p>Acompanhe vencimentos, pendencias, pagamentos e gere cobrancas manuais.</p>
        </div>
        <button class="primary" id="openManualCharge" type="button">+ Gerar cobranca manual</button>
      </div>
      <div class="finance-layout">
        <div class="finance-summary" id="financeSummary"></div>
        <div class="panel">
          <div class="panel-head">
            <div><h2>Clientes com vencimento</h2><p>Contas pendentes, vencidas ou proximas do vencimento</p></div>
          </div>
          <div id="financeClients" class="finance-client-grid"></div>
        </div>
        <div class="panel">
          <div class="panel-head">
            <div><h2>Relatorio de pagamentos</h2><p>Filtre por periodo, cliente e status.</p></div>
            <button class="secondary" id="exportFinanceExcel" type="button">Gerar Excel</button>
          </div>
          <div class="finance-filters">
            <div class="field"><label>Inicio</label><input id="financeStart" type="date"></div>
            <div class="field"><label>Fim</label><input id="financeEnd" type="date"></div>
            <div class="field"><label>Status</label><select id="financeStatus"><option value="">Todos</option><option value="pending">Pendente</option><option value="approved">Pago</option><option value="rejected">Rejeitado</option><option value="canceled">Cancelado</option></select></div>
            <div class="field"><label>Cliente</label><select id="financeClientFilter"><option value="">Todos</option></select></div>
            <button class="primary" id="applyFinanceFilters" type="button">Filtrar</button>
          </div>
          <div id="financePayments"></div>
        </div>
      </div>`;
    document.querySelector('main')?.append(section);
    section.querySelector('#openManualCharge').addEventListener('click', openManualCharge);
    section.querySelector('#applyFinanceFilters').addEventListener('click', loadFinance);
    section.querySelector('#exportFinanceExcel').addEventListener('click', exportExcel);
    section.querySelector('#financePayments').addEventListener('click', event => {
      const button = event.target.closest('[data-mark-paid]');
      if (button) markPaid(Number(button.dataset.markPaid));
    });
  }

  function ensureFinanceNav() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav || document.querySelector('.nav-item[data-view="financeiro"]')) return;
    const button = document.createElement('button');
    button.className = 'nav-item';
    button.dataset.view = 'financeiro';
    button.type = 'button';
    button.innerHTML = '<span>$</span> Financeiro';
    nav.append(button);
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'financeiro'));
      const title = document.querySelector('#headerTitle');
      if (title) title.textContent = 'Financeiro';
      document.querySelector('.sidebar')?.classList.remove('open');
      document.body.classList.remove('menu-open');
      window.scrollTo(0, 0);
      loadFinance();
    });
  }

  function queryString() {
    const params = new URLSearchParams();
    const start = document.querySelector('#financeStart')?.value || '';
    const end = document.querySelector('#financeEnd')?.value || '';
    const status = document.querySelector('#financeStatus')?.value || '';
    const userId = document.querySelector('#financeClientFilter')?.value || '';
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (status) params.set('status', status);
    if (userId) params.set('userId', userId);
    return params.toString();
  }

  function clientSituation(client) {
    const billing = client.billing || {};
    if (!billing.nextDueDate) return ['pending', 'overdue'].includes(billing.status) ? 'danger' : (billing.status || 'active');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${billing.nextDueDate}T00:00:00`);
    const diff = Math.round((due - today) / 86400000);
    if (diff < 0) return 'danger';
    if (diff <= 5) return 'pending';
    return 'active';
  }

  function clientSituationLabel(client) {
    const situation = clientSituation(client);
    if (situation === 'danger') return 'Vencido';
    if (situation === 'pending') return 'A vencer';
    return billingStatusLabels[client.billing?.status] || 'Ativo';
  }

  function renderSummary() {
    const summary = financeState.summary || {};
    document.querySelector('#financeSummary').innerHTML = `
      <article><span>Clientes vencidos</span><strong>${summary.overdueClients || 0}</strong></article>
      <article><span>A vencer em 5 dias</span><strong>${summary.dueSoonClients || 0}</strong></article>
      <article><span>Valor pendente</span><strong>${money(summary.pending || 0)}</strong></article>
      <article><span>Valor ativo</span><strong>${money(summary.approved || 0)}</strong></article>`;
  }

  function renderClients() {
    const list = document.querySelector('#financeClients');
    const clients = financeState.clients || [];
    const relevant = clients.filter(client => {
      const situation = clientSituation(client);
      return situation === 'danger' || situation === 'pending';
    });
    list.innerHTML = relevant.map(client => {
      const billing = client.billing || {};
      const situation = clientSituation(client);
      return `
        <article class="finance-client-card">
          <div class="finance-client-head">
            <div><strong>${escapeHtml(client.name)}</strong><p>${escapeHtml(client.email)}</p></div>
            <span class="finance-status ${situation}">${escapeHtml(clientSituationLabel(client))}</span>
          </div>
          <p>Vencimento: ${escapeHtml(dateBr(billing.nextDueDate))} | Valor: ${escapeHtml(money(billing.amount))}</p>
          <p>Plano: ${escapeHtml(billing.plan || 'Basico')} | Ciclo: ${escapeHtml(billing.cycleLabel || 'Mensal')} | Pagamento: ${escapeHtml(paymentLabels[billing.paymentMethod] || 'Pix ou cartao')}</p>
        </article>`;
    }).join('') || '<p class="muted">Nenhum cliente vencido ou perto do vencimento.</p>';
  }

  function renderClientFilter() {
    const select = document.querySelector('#financeClientFilter');
    const selected = select.value;
    select.innerHTML = '<option value="">Todos</option>' + financeState.clients.map(client => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join('');
    select.value = selected;
  }

  function renderPayments() {
    const container = document.querySelector('#financePayments');
    const rows = financeState.payments || [];
    container.innerHTML = `
      <div class="finance-table-wrap">
        <table class="finance-table" id="financePaymentsTable">
          <thead><tr><th>Cliente</th><th>Descricao</th><th>Tipo</th><th>Status</th><th>Valor</th><th>Vencimento</th><th>Pago em</th><th>Acoes</th></tr></thead>
          <tbody>
            ${rows.map(payment => `
              <tr>
                <td>${escapeHtml(payment.userName)}</td>
                <td>${escapeHtml(payment.description || '-')}</td>
                <td>${payment.type === 'manual' ? 'Manual' : 'Mercado Pago'}</td>
                <td><span class="finance-status ${escapeHtml(payment.status)}">${escapeHtml(statusLabels[payment.status] || payment.status)}</span></td>
                <td>${escapeHtml(money(payment.amount))}</td>
                <td>${escapeHtml(dateBr(payment.dueDate))}</td>
                <td>${escapeHtml(payment.paidAt ? dateBr(payment.paidAt) : '-')}</td>
                <td>${payment.status === 'pending' ? `<button class="secondary" type="button" data-mark-paid="${payment.id}">Marcar pago</button>` : ''}</td>
              </tr>`).join('') || '<tr><td colspan="8">Nenhum pagamento no periodo.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  async function loadFinance() {
    const qs = queryString();
    financeState = await request(qs ? `${api}&${qs}` : api);
    renderClientFilter();
    renderSummary();
    renderClients();
    renderPayments();
  }

  function openManualCharge() {
    const modal = document.querySelector('#modal');
    const content = document.querySelector('#modalContent');
    if (!modal || !content) return;
    content.innerHTML = `
      <h2 class="modal-title">Gerar cobranca manual</h2>
      <p class="modal-subtitle">Crie uma cobranca pendente e atualize o vencimento do cliente.</p>
      <div id="manualChargeForm" class="form-grid">
        <div class="field"><label>Cliente</label><select name="userId" required>${financeState.clients.map(client => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Valor</label><input name="amount" type="number" min="0.01" step="0.01" required></div>
        <div class="field"><label>Vencimento</label><input name="dueDate" type="date" required></div>
        <div class="field"><label>Descricao</label><input name="description" value="Cobranca manual"></div>
        <p id="manualChargeMessage" class="profile-message"></p>
        <div class="form-actions">
          <button class="secondary" type="button" onclick="document.querySelector('#modal').close()">Cancelar</button>
          <button class="primary" id="saveManualCharge" type="button">Gerar cobranca</button>
        </div>
      </div>`;
    content.querySelector('#saveManualCharge').addEventListener('click', saveManualCharge);
    modal.showModal();
  }

  async function saveManualCharge() {
    const form = document.querySelector('#manualChargeForm');
    const message = form.querySelector('#manualChargeMessage');
    for (const field of form.querySelectorAll('input,select')) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return;
      }
    }
    try {
      await request(api, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'manual-charge',
          userId: form.querySelector('[name="userId"]').value,
          amount: form.querySelector('[name="amount"]').value,
          dueDate: form.querySelector('[name="dueDate"]').value,
          description: form.querySelector('[name="description"]').value
        })
      });
      document.querySelector('#modal')?.close();
      await loadFinance();
    } catch (error) {
      message.textContent = error.message;
    }
  }

  async function markPaid(paymentId) {
    if (!confirm('Marcar esta cobranca como paga?')) return;
    await request(api, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: 'mark-paid', paymentId})
    });
    await loadFinance();
  }

  function crc32(text) {
    const bytes = new TextEncoder().encode(text);
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ -1) >>> 0;
  }

  function uint16(value) {
    return String.fromCharCode(value & 255, (value >>> 8) & 255);
  }

  function uint32(value) {
    return String.fromCharCode(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
  }

  function zipStore(files) {
    let offset = 0;
    const localParts = [];
    const centralParts = [];
    files.forEach(file => {
      const content = new TextEncoder().encode(file.content);
      const name = file.name;
      const checksum = crc32(file.content);
      const local = 'PK\x03\x04' + uint16(20) + uint16(0) + uint16(0) + uint16(0) + uint16(0)
        + uint32(checksum) + uint32(content.length) + uint32(content.length) + uint16(name.length) + uint16(0) + name;
      localParts.push(local, content);
      const central = 'PK\x01\x02' + uint16(20) + uint16(20) + uint16(0) + uint16(0) + uint16(0) + uint16(0)
        + uint32(checksum) + uint32(content.length) + uint32(content.length) + uint16(name.length) + uint16(0)
        + uint16(0) + uint16(0) + uint16(0) + uint32(0) + uint32(offset) + name;
      centralParts.push(central);
      offset += local.length + content.length;
    });
    const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
    const end = 'PK\x05\x06' + uint16(0) + uint16(0) + uint16(files.length) + uint16(files.length)
      + uint32(centralSize) + uint32(offset) + uint16(0);
    return new Blob([...localParts, ...centralParts, end], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }

  function cellRef(row, column) {
    let label = '';
    let number = column;
    while (number >= 0) {
      label = String.fromCharCode(65 + (number % 26)) + label;
      number = Math.floor(number / 26) - 1;
    }
    return `${label}${row}`;
  }

  function xml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;'}[char]));
  }

  function sheetRows(rows) {
    return rows.map((row, rowIndex) => {
      const number = rowIndex + 1;
      const cells = row.map((value, columnIndex) => `<c r="${cellRef(number, columnIndex)}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`).join('');
      return `<row r="${number}">${cells}</row>`;
    }).join('');
  }

  function exportExcel() {
    const rows = [
      ['Cliente', 'Descricao', 'Tipo', 'Status', 'Valor', 'Vencimento', 'Pago em'],
      ...(financeState.payments || []).map(payment => [
        payment.userName,
        payment.description || '-',
        payment.type === 'manual' ? 'Manual' : 'Mercado Pago',
        statusLabels[payment.status] || payment.status,
        money(payment.amount),
        dateBr(payment.dueDate),
        payment.paidAt ? dateBr(payment.paidAt) : '-'
      ])
    ];
    const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows(rows)}</sheetData></worksheet>`;
    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Relatorio financeiro" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
    const blob = zipStore([
      {name: '[Content_Types].xml', content: contentTypes},
      {name: '_rels/.rels', content: rels},
      {name: 'xl/workbook.xml', content: workbook},
      {name: 'xl/_rels/workbook.xml.rels', content: workbookRels},
      {name: 'xl/worksheets/sheet1.xml', content: worksheet}
    ]);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-financeiro-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function init() {
    let user = null;
    window.PortalCurrentUserPromise = window.PortalCurrentUserPromise || request(authApi);
    try { user = await window.PortalCurrentUserPromise; } catch (_) { return; }
    if (user.role !== 'master') return;
    ensureFinanceView();
    ensureFinanceNav();
    await loadFinance();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
