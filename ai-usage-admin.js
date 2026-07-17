(function () {
  const api = 'api.php?resource=ai-usage';
  let state = {};

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[char]));
  const usd = value => {
    const n = Number(value || 0);
    return `US$ ${n < 0.01 && n > 0 ? n.toFixed(6) : n.toFixed(2)}`;
  };
  const brl = value => Number(value || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const number = value => Number(value || 0).toLocaleString('pt-BR');
  const dateTime = value => value ? new Date(String(value).replace(' ', 'T')).toLocaleString('pt-BR') : '-';

  async function request(url, options = {}) {
    const response = await fetch(url, options);
    if (options.raw) return response;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel carregar o consumo de IA.');
    return data;
  }

  function ensureView() {
    if (document.querySelector('#consumoIa')) return;
    const section = document.createElement('section');
    section.id = 'consumoIa';
    section.className = 'view';
    section.innerHTML = `
      <div class="page-title">
        <div>
          <p class="eyebrow">LOGIN MASTER</p>
          <h1>Consumo de Inteligencia Artificial</h1>
          <p>Consumo estimado e registrado pelo iProf. Pode haver pequenas diferencas em relacao a cobranca final da Groq.</p>
        </div>
        <button class="secondary" id="exportAiUsageCsv" type="button">Exportar CSV</button>
      </div>
      <div class="ai-usage-layout">
        <div id="aiUsageAlerts" class="ai-usage-alerts"></div>
        <div class="panel">
          <div class="ai-usage-filters">
            <div class="field"><label>Inicio</label><input id="aiUsageStart" type="date"></div>
            <div class="field"><label>Fim</label><input id="aiUsageEnd" type="date"></div>
            <div class="field"><label>Usuario</label><select id="aiUsageUser"><option value="">Todos</option></select></div>
            <div class="field"><label>Escola/cliente</label><select id="aiUsageSchool"><option value="">Todos</option></select></div>
            <div class="field"><label>Modelo</label><select id="aiUsageModel"><option value="">Todos</option></select></div>
            <div class="field"><label>Status</label><select id="aiUsageStatus"><option value="">Todos</option><option value="success">Sucesso</option><option value="failed">Falha</option><option value="timeout">Timeout</option><option value="rate_limited">Limite API</option><option value="no_usage_data">Sem usage</option></select></div>
            <button class="primary" id="applyAiUsageFilters" type="button">Filtrar</button>
          </div>
        </div>
        <div class="ai-usage-summary" id="aiUsageSummary"></div>
        <div class="ai-usage-charts">
          <div class="ai-usage-card"><h2>Custo diario</h2><div id="aiUsageDaily" class="ai-usage-bars"></div></div>
          <div class="ai-usage-card"><h2>Consumo por modelo</h2><div id="aiUsageModels" class="ai-usage-bars"></div></div>
          <div class="ai-usage-card"><h2>Consumo por usuario</h2><div id="aiUsageUsers" class="ai-usage-bars"></div></div>
          <div class="ai-usage-card"><h2>Consumo por escola</h2><div id="aiUsageSchools" class="ai-usage-bars"></div></div>
        </div>
        <div class="panel">
          <div class="panel-head"><div><h2>Configuracoes de limite</h2><p>Controle interno do iProf, sem consultar cobranca oficial da Groq.</p></div><button class="primary" id="saveAiUsageSettings" type="button">Salvar</button></div>
          <div class="ai-usage-settings">
            <div class="field"><label>Cotacao USD/BRL</label><input id="aiUsageExchange" type="number" step="0.0001" min="0.01"></div>
            <div class="field"><label>Limite mensal USD</label><input id="aiUsageLimit" type="number" step="0.01" min="0"></div>
            <div class="field"><label>Alerta 70%</label><input id="aiUsageAlert70" type="number" min="1"></div>
            <div class="field"><label>Alerta 90%</label><input id="aiUsageAlert90" type="number" min="1"></div>
            <div class="field"><label>Alerta 100%</label><input id="aiUsageAlert100" type="number" min="1"></div>
            <div class="field"><label>Ao atingir limite</label><select id="aiUsageLimitAction"><option value="alert">Somente alertar</option><option value="block">Bloquear novas requisicoes</option><option value="fallback">Trocar provedor/modelo quando houver suporte</option><option value="continue">Continuar e registrar alerta</option></select></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><div><h2>Precos por modelo</h2><p>Alteracoes preservam o historico ja registrado.</p></div><button class="primary" id="saveAiModelPrice" type="button">Salvar preco</button></div>
          <div class="ai-usage-settings">
            <div class="field"><label>Provedor</label><input id="aiPriceProvider" value="Groq"></div>
            <div class="field"><label>Modelo</label><input id="aiPriceModel" value="llama-3.3-70b-versatile"></div>
            <div class="field"><label>Nome exibido</label><input id="aiPriceName" value="Llama 3.3 70B Versatile"></div>
            <div class="field"><label>Entrada / 1M</label><input id="aiPriceInput" type="number" step="0.0000000001" min="0"></div>
            <div class="field"><label>Saida / 1M</label><input id="aiPriceOutput" type="number" step="0.0000000001" min="0"></div>
            <div class="field"><label>Cache / 1M</label><input id="aiPriceCached" type="number" step="0.0000000001" min="0"></div>
          </div>
          <div id="aiUsagePrices"></div>
        </div>
        <div class="panel">
          <div class="panel-head"><div><h2>Requisicoes detalhadas</h2><p>Sem conteudo pedagogico ou dados sensiveis do texto revisado.</p></div></div>
          <div id="aiUsageLogs"></div>
        </div>
      </div>`;
    document.querySelector('main')?.append(section);
    section.querySelector('#applyAiUsageFilters').addEventListener('click', loadUsage);
    section.querySelector('#exportAiUsageCsv').addEventListener('click', exportCsv);
    section.querySelector('#saveAiUsageSettings').addEventListener('click', saveSettings);
    section.querySelector('#saveAiModelPrice').addEventListener('click', savePrice);
  }

  function ensureNav() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav || document.querySelector('.nav-item[data-view="consumoIa"]')) return;
    const button = document.createElement('button');
    button.className = 'nav-item';
    button.dataset.view = 'consumoIa';
    button.type = 'button';
    button.innerHTML = '<span>◫</span> Consumo IA';
    nav.append(button);
    bindNavButton(button);
  }

  function bindNavButton(button) {
    if (button.dataset.aiUsageBound) return;
    button.dataset.aiUsageBound = '1';
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'consumoIa'));
      const title = document.querySelector('#headerTitle');
      if (title) title.textContent = 'Consumo IA';
      document.querySelector('.sidebar')?.classList.remove('open');
      document.body.classList.remove('menu-open');
      window.scrollTo(0, 0);
      loadUsage();
    });
  }

  function qs() {
    const params = new URLSearchParams();
    [['start', '#aiUsageStart'], ['end', '#aiUsageEnd'], ['userId', '#aiUsageUser'], ['school', '#aiUsageSchool'], ['model', '#aiUsageModel'], ['status', '#aiUsageStatus']].forEach(([key, selector]) => {
      const value = document.querySelector(selector)?.value || '';
      if (value) params.set(key, value);
    });
    return params.toString();
  }

  function renderSummary() {
    const s = state.summary || {};
    const month = state.month || {};
    const today = state.today || {};
    const bestModel = (state.byModel || [])[0];
    const bestUser = (state.byUser || [])[0];
    const bestSchool = (state.bySchool || [])[0];
    document.querySelector('#aiUsageSummary').innerHTML = [
      ['Hoje USD', usd(today.total_cost_usd)],
      ['Hoje BRL', brl(today.total_cost_brl)],
      ['Mes USD', usd(month.total_cost_usd)],
      ['Mes BRL', brl(month.total_cost_brl)],
      ['Requisicoes no periodo', number(s.requests)],
      ['Sucessos', number(s.successes)],
      ['Falhas', number(s.failures)],
      ['Tokens entrada', number(s.prompt_tokens)],
      ['Tokens saida', number(s.completion_tokens)],
      ['Tokens totais', number(s.total_tokens)],
      ['Custo medio', usd(s.avg_cost_usd)],
      ['Modelo mais usado', bestModel ? bestModel.model_id : '-'],
      ['Usuario maior consumo', bestUser ? bestUser.name : '-'],
      ['Escola maior consumo', bestSchool ? bestSchool.name : '-'],
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></article>`).join('');
  }

  function bars(selector, rows, labelFn, valueFn, moneyValue = true) {
    const list = document.querySelector(selector);
    const max = Math.max(...(rows || []).map(row => Number(valueFn(row) || 0)), 0);
    if (!rows || !rows.length) {
      list.innerHTML = '<small>Nenhum consumo no periodo.</small>';
      return;
    }
    list.innerHTML = rows.map(row => {
      const value = Number(valueFn(row) || 0);
      const width = max > 0 ? Math.max(3, (value / max) * 100) : 0;
      return `<div class="ai-usage-bar"><span>${escapeHtml(labelFn(row))}</span><div class="ai-usage-track"><div class="ai-usage-fill" style="width:${width}%"></div></div><b>${escapeHtml(moneyValue ? usd(value) : number(value))}</b></div>`;
    }).join('');
  }

  function renderCharts() {
    bars('#aiUsageDaily', state.series || [], row => row.day, row => row.total_cost_usd);
    bars('#aiUsageModels', state.byModel || [], row => row.model_id || row.provider, row => row.total_cost_usd);
    bars('#aiUsageUsers', state.byUser || [], row => row.name, row => row.total_cost_usd);
    bars('#aiUsageSchools', state.bySchool || [], row => row.name, row => row.total_cost_usd);
  }

  function renderFiltersAndSettings() {
    const users = state.users || [];
    const schools = state.schools || [];
    const models = [...new Set((state.prices || []).map(price => price.model_id))];
    const userValue = document.querySelector('#aiUsageUser')?.value || '';
    const schoolValue = document.querySelector('#aiUsageSchool')?.value || '';
    const modelValue = document.querySelector('#aiUsageModel')?.value || '';
    document.querySelector('#aiUsageUser').innerHTML = '<option value="">Todos</option>' + users.map(user => `<option value="${user.id}">${escapeHtml(user.nome)}</option>`).join('');
    document.querySelector('#aiUsageSchool').innerHTML = '<option value="">Todos</option>' + schools.map(school => `<option value="${escapeHtml(school.school_hash)}">${escapeHtml(school.name)}</option>`).join('');
    document.querySelector('#aiUsageModel').innerHTML = '<option value="">Todos</option>' + models.map(model => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join('');
    document.querySelector('#aiUsageUser').value = userValue;
    document.querySelector('#aiUsageSchool').value = schoolValue;
    document.querySelector('#aiUsageModel').value = modelValue;
    const settings = state.settings || {};
    document.querySelector('#aiUsageExchange').value = settings.exchange_rate_brl ?? 5.5;
    document.querySelector('#aiUsageLimit').value = settings.monthly_limit_usd ?? 20;
    document.querySelector('#aiUsageAlert70').value = settings.alert_70 ?? 70;
    document.querySelector('#aiUsageAlert90').value = settings.alert_90 ?? 90;
    document.querySelector('#aiUsageAlert100').value = settings.alert_100 ?? 100;
    document.querySelector('#aiUsageLimitAction').value = settings.limit_action || 'alert';
    const activePrice = (state.prices || []).find(price => price.is_active == 1 && price.provider === 'Groq') || (state.prices || []).find(price => price.is_active == 1);
    if (activePrice) {
      document.querySelector('#aiPriceProvider').value = activePrice.provider || 'Groq';
      document.querySelector('#aiPriceModel').value = activePrice.model_id || 'llama-3.3-70b-versatile';
      document.querySelector('#aiPriceName').value = activePrice.display_name || activePrice.model_id || '';
      document.querySelector('#aiPriceInput').value = activePrice.input_price_per_million || '';
      document.querySelector('#aiPriceOutput').value = activePrice.output_price_per_million || '';
      document.querySelector('#aiPriceCached').value = activePrice.cached_input_price_per_million || '';
    }
  }

  function renderTables() {
    const alerts = state.alerts || [];
    document.querySelector('#aiUsageAlerts').innerHTML = alerts.map(alert => `<div class="ai-usage-alert">${escapeHtml(alert.message)}</div>`).join('');
    document.querySelector('#aiUsagePrices').innerHTML = `<div class="ai-usage-table-wrap"><table class="ai-usage-table"><thead><tr><th>Provedor</th><th>Modelo</th><th>Entrada</th><th>Saida</th><th>Cache</th><th>Status</th></tr></thead><tbody>${(state.prices || []).map(price => `<tr><td>${escapeHtml(price.provider)}</td><td>${escapeHtml(price.model_id)}</td><td>${usd(price.input_price_per_million)}</td><td>${usd(price.output_price_per_million)}</td><td>${usd(price.cached_input_price_per_million)}</td><td>${price.is_active == 1 ? 'Ativo' : 'Historico'}</td></tr>`).join('')}</tbody></table></div>`;
    document.querySelector('#aiUsageLogs').innerHTML = `<div class="ai-usage-table-wrap"><table class="ai-usage-table"><thead><tr><th>Data</th><th>Usuario</th><th>Escola</th><th>Modelo</th><th>Recurso</th><th>Tokens</th><th>Custo</th><th>Duracao</th><th>Status</th></tr></thead><tbody>${(state.logs || []).map(log => `<tr><td>${dateTime(log.created_at)}</td><td>${escapeHtml(log.user_name || '-')}</td><td>${escapeHtml(log.school_name || '-')}</td><td>${escapeHtml(log.provider)}<br><small>${escapeHtml(log.model_id)}</small></td><td>${escapeHtml(log.feature)}<br><small>${escapeHtml(log.operation)}</small></td><td>${number(log.total_tokens)}<br><small>E:${number(log.prompt_tokens)} S:${number(log.completion_tokens)} C:${number(log.cached_tokens)}</small></td><td>${usd(log.total_cost_usd)}<br><small>${brl(log.total_cost_brl)}</small></td><td>${number(log.duration_ms)} ms</td><td><span class="ai-usage-status ${escapeHtml(log.status)}">${escapeHtml(log.status)}</span></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function loadUsage() {
    const query = qs();
    state = await request(query ? `${api}&${query}` : api);
    renderFiltersAndSettings();
    renderSummary();
    renderCharts();
    renderTables();
  }

  async function saveSettings() {
    await request(api, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'settings',
        exchangeRateBrl: document.querySelector('#aiUsageExchange').value,
        monthlyLimitUsd: document.querySelector('#aiUsageLimit').value,
        alert70: document.querySelector('#aiUsageAlert70').value,
        alert90: document.querySelector('#aiUsageAlert90').value,
        alert100: document.querySelector('#aiUsageAlert100').value,
        limitAction: document.querySelector('#aiUsageLimitAction').value,
      }),
    });
    await loadUsage();
  }

  async function savePrice() {
    await request(api, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'price',
        provider: document.querySelector('#aiPriceProvider').value,
        modelId: document.querySelector('#aiPriceModel').value,
        displayName: document.querySelector('#aiPriceName').value,
        inputPrice: document.querySelector('#aiPriceInput').value,
        outputPrice: document.querySelector('#aiPriceOutput').value,
        cachedInputPrice: document.querySelector('#aiPriceCached').value,
        currency: 'USD',
      }),
    });
    await loadUsage();
  }

  function exportCsv() {
    const query = qs();
    location.href = `${api}&action=export${query ? `&${query}` : ''}`;
  }

  function init() {
    const user = window.PortalBootstrapUser || {};
    if (user.role !== 'master' && document.body.dataset.role !== 'master' && !user.permissions?.includes('consumo_ia')) return;
    ensureView();
    ensureNav();
    document.querySelectorAll('.nav-item[data-view="consumoIa"]').forEach(bindNavButton);
  }

  window.addEventListener('portal:user-ready', init);
  document.addEventListener('DOMContentLoaded', init);
})();
