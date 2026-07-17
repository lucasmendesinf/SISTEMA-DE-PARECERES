(() => {
  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

  const correctionPairs = [
    ['nao', 'n\u00e3o'], ['voce', 'voc\u00ea'], ['voces', 'voc\u00eas'], ['tambem', 'tamb\u00e9m'],
    ['ja', 'j\u00e1'], ['so', 's\u00f3'], ['apos', 'ap\u00f3s'], ['ate', 'at\u00e9'], ['atraves', 'atrav\u00e9s'],
    ['historico', 'hist\u00f3rico'], ['usuario', 'usu\u00e1rio'], ['usuarios', 'usu\u00e1rios'],
    ['responsavel', 'respons\u00e1vel'], ['responsaveis', 'respons\u00e1veis'], ['responsalvel', 'respons\u00e1vel'], ['diretora responsalvel', 'diretora respons\u00e1vel'],
    ['opcao', 'op\u00e7\u00e3o'], ['opcoes', 'op\u00e7\u00f5es'], ['edicao', 'edi\u00e7\u00e3o'], ['edicoes', 'edi\u00e7\u00f5es'],
    ['deteccao', 'detec\u00e7\u00e3o'], ['selecao', 'sele\u00e7\u00e3o'], ['selecoes', 'sele\u00e7\u00f5es'],
    ['portugues', 'portugu\u00eas'], ['gramatica', 'gram\u00e1tica'], ['acentuacao', 'acentua\u00e7\u00e3o'],
    ['relatorio', 'relat\u00f3rio'], ['relatorios', 'relat\u00f3rios'], ['financeiro', 'financeiro'],
    ['configuracao', 'configura\u00e7\u00e3o'], ['configuracaoo', 'configura\u00e7\u00e3o'], ['configuracoes', 'configura\u00e7\u00f5es'],
    ['cobranca', 'cobran\u00e7a'], ['cobrancas', 'cobran\u00e7as'], ['vencimento', 'vencimento'],
    ['fatura', 'fatura'], ['periodo', 'per\u00edodo'], ['periodos', 'per\u00edodos'],
    ['portifolio', 'portf\u00f3lio'], ['portifolios', 'portf\u00f3lios'], ['portfolio', 'portf\u00f3lio'], ['portfolios', 'portf\u00f3lios'],
    ['crianca', 'crian\u00e7a'], ['criancas', 'crian\u00e7as'], ['educacao', 'educa\u00e7\u00e3o'],
    ['observacao', 'observa\u00e7\u00e3o'], ['observacoes', 'observa\u00e7\u00f5es'],
    ['interacao', 'intera\u00e7\u00e3o'], ['interacoes', 'intera\u00e7\u00f5es'], ['participacao', 'participa\u00e7\u00e3o'],
    ['exploracao', 'explora\u00e7\u00e3o'], ['expressao', 'express\u00e3o'], ['avaliacao', 'avalia\u00e7\u00e3o'],
    ['relacao', 'rela\u00e7\u00e3o'], ['relacoes', 'rela\u00e7\u00f5es'], ['informacao', 'informa\u00e7\u00e3o'],
    ['informacoes', 'informa\u00e7\u00f5es'], ['experiencia', 'experi\u00eancia'], ['experiencias', 'experi\u00eancias'],
    ['vivencia', 'viv\u00eancia'], ['vivencias', 'viv\u00eancias'], ['autonomia', 'autonomia'],
    ['concluido', 'conclu\u00eddo'], ['inicio', 'in\u00edcio'], ['necessario', 'necess\u00e1rio'],
    ['possivel', 'poss\u00edvel'], ['proximo', 'pr\u00f3ximo'], ['proxima', 'pr\u00f3xima'], ['sera', 'ser\u00e1'],
    ['botao', 'bot\u00e3o'], ['botoes', 'bot\u00f5es'], ['modal', 'modal'],
    ['textarea', 'campo de texto'], ['texttarea', 'campo de texto'],
    ['sujjo', 'sujo'], ['brusa', 'blusa'], ['makina', 'm\u00e1quina'], ['maquina', 'm\u00e1quina'],
    ['esta', 'est\u00e1'], ['estao', 'est\u00e3o'], ['ficara', 'ficar\u00e1'], ['ficarao', 'ficar\u00e3o'],
    ['cadatro', 'cadastro'], ['dectectar', 'detectar'], ['dectectado', 'detectado'], ['dectetado', 'detectado'],
    ['deichei', 'deixei'], ['deichar', 'deixar'], ['deichei', 'deixei'],
    ['adicoinar', 'adicionar'], ['adicionei', 'adicionei'], ['adicoinei', 'adicionei'],
    ['adicoinado', 'adicionado'], ['anexado', 'anexado'], ['anexada', 'anexada'],
    ['imagem', 'imagem'], ['imagens', 'imagens'], ['documento', 'documento'], ['parecer', 'parecer'],
    ['atividade', 'atividade'], ['atividades', 'atividades'], ['professora', 'professora'],
    ['turma', 'turma'], ['aluno', 'aluno'], ['alunos', 'alunos'], ['escola', 'escola']
  ];

  const corrections = correctionPairs.map(([word, replacement]) => [
    new RegExp(`\\b${word}\\b`, 'gi'),
    replacement
  ]);

  const phraseCorrections = [
    [/\btem que\b/gi, 'precisa'],
    [/\ba partir\b/gi, 'a partir'],
    [/\bapartir\b/gi, 'a partir'],
    [/\bporisso\b/gi, 'por isso'],
    [/\ba onde\b/gi, 'onde'],
    [/\bde mais\b/gi, 'demais'],
    [/\bmeio que\b/gi, ''],
    [/\bna parte de\b/gi, 'na \u00e1rea de'],
    [/\bno ato da\b/gi, 'no momento da'],
    [/\baopcao\b/gi, 'a op\u00e7\u00e3o'],
    [/\bao clicar\b/gi, 'ao clicar'],
    [/\bque abrir\b/gi, 'que for aberto'],
    [/\bem qualquer novo campo de texto que abrir\b/gi, 'em qualquer novo campo de texto que for aberto'],
    [/\bm[aá]quina de lava\b/gi, 'm\u00e1quina de lavar']
  ];

  function preserveCase(original, replacement) {
    if (!original) return replacement;
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    return replacement;
  }

  function capitalizeSentences(text) {
    return text.replace(/(^|[.!?]\s+|[\n\r]+)([a-z\u00e0-\u00ff])/g, (match, prefix, letter) => prefix + letter.toUpperCase());
  }

  function normalizeSpacing(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,.;:!?])([^\s\n])/g, '$1 $2')
      .replace(/([.!?])\s*([.!?])+/g, '$1')
      .replace(/\s+%/g, '%')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .trim();
  }

  function reviewPortuguese(text) {
    let reviewed = normalizeSpacing(text);
    phraseCorrections.forEach(([pattern, replacement]) => {
      reviewed = reviewed.replace(pattern, replacement).replace(/\s{2,}/g, ' ');
    });
    corrections.forEach(([pattern, replacement]) => {
      reviewed = reviewed.replace(pattern, match => preserveCase(match, replacement));
    });

    reviewed = reviewed
      .replace(/\bmas tamb\u00e9m\b/gi, 'e tamb\u00e9m')
      .replace(/\bpara que possa\b/gi, 'para que seja poss\u00edvel')
      .replace(/\bcaso queira\b/gi, 'se desejar')
      .replace(/\bno sistema\b/gi, 'no sistema')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return reviewed.split(/\n{2,}/).map(paragraph => {
      let clean = capitalizeSentences(paragraph.trim());
      if (clean && !/[.!?:;\u2026]$/.test(clean)) clean += '.';
      return clean;
    }).filter(Boolean).join('\n\n');
  }

  function closestTextareaFromTrigger(trigger) {
    if (!trigger) return null;
    let previous = trigger.previousElementSibling;
    while (previous) {
      if (previous instanceof HTMLTextAreaElement) return previous;
      previous = previous.previousElementSibling;
    }
    const field = trigger.closest('.field, label, form, #modalContent, .profile-form, .panel, section');
    return field?.querySelector('textarea') || null;
  }

  function targetTextarea(field) {
    if (field instanceof HTMLTextAreaElement) return field;
    const trigger = window.event?.currentTarget;
    return closestTextareaFromTrigger(trigger)
      || (document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null)
      || $('#wizardText')
      || $('#wizardPhotoNote')
      || $('#editParagraphText')
      || $('#reportText')
      || document.querySelector('textarea');
  }

  const actionLabels = {
    improve: 'Melhorar texto',
    grammar: 'Corrigir gram\u00e1tica',
    summarize: 'Resumir parecer',
    expand: 'Gerar texto'
  };

  async function requestAiReview(text, action) {
    const student = typeof wizard === 'object' && wizard?.studentId && Array.isArray(data?.students)
      ? data.students.find(item => String(item.id) === String(wizard.studentId))
      : null;
    const response = await fetch('api.php?resource=ai-review', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text, action, studentName: student?.name || ''})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Nao foi possivel revisar com IA agora.');
    return result.texto_revisado || '';
  }

  function syncTextareaBuffers(textarea) {
    textarea.dispatchEvent(new Event('input', {bubbles: true}));
    if (typeof bufferStepOne === 'function' && textarea.id === 'wizardText') bufferStepOne();
    if (typeof bufferStepTwo === 'function' && textarea.id === 'wizardPhotoNote') bufferStepTwo();
  }

  function showComparisonModal(textarea, original, suggestion, provider = '') {
    document.querySelector('#aiReviewModal')?.remove();
    const modal = document.createElement('dialog');
    modal.id = 'aiReviewModal';
    modal.className = 'ai-review-dialog';
    modal.innerHTML = `
      <section class="ai-review-modal" role="dialog" aria-modal="true" aria-labelledby="aiReviewTitle">
        <button class="ai-review-close" type="button" data-ai-review-close aria-label="Fechar">x</button>
        <p class="eyebrow">REVISAO INTELIGENTE</p>
        <h2 id="aiReviewTitle">Compare antes de aplicar</h2>
        ${provider ? `<p class="ai-review-provider">Provedor usado: ${escapeHtml(provider)}</p>` : ''}
        <div class="ai-review-columns">
          <div><h3>Texto original</h3><textarea readonly>${escapeHtml(original)}</textarea></div>
          <div><h3>Sugestao da IA</h3><textarea id="aiReviewSuggestion">${escapeHtml(suggestion)}</textarea></div>
        </div>
        <div class="form-actions">
          <button class="secondary" type="button" data-ai-review-copy>Copiar</button>
          <button class="secondary" type="button" data-ai-review-close>Cancelar</button>
          <button class="primary" type="button" data-ai-review-apply>Aplicar sugestao</button>
        </div>
      </section>`;
    document.body.append(modal);
    const closeModal = () => {
      if (modal.open) modal.close();
      modal.remove();
    };
    modal.addEventListener('cancel', event => {
      event.preventDefault();
      closeModal();
    });
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    modal.querySelectorAll('[data-ai-review-close]').forEach(button => button.addEventListener('click', closeModal));
    modal.querySelector('[data-ai-review-copy]')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(modal.querySelector('#aiReviewSuggestion')?.value || suggestion);
    });
    modal.querySelector('[data-ai-review-apply]')?.addEventListener('click', () => {
      textarea.value = modal.querySelector('#aiReviewSuggestion')?.value || suggestion;
      syncTextareaBuffers(textarea);
      closeModal();
      textarea.focus();
    });
    if (typeof modal.showModal === 'function') modal.showModal();
    modal.querySelector('#aiReviewSuggestion')?.focus();
  }

  async function runAiReview(textarea, action, trigger) {
    const original = textarea.value.trim();
    if (!original) {
      textarea.focus();
      alert('Escreva um texto antes de solicitar a revisao.');
      return;
    }
    const oldText = trigger?.textContent;
    if (trigger) {
      trigger.disabled = true;
      trigger.textContent = 'Revisando com IA...';
    }
    try {
      const suggestion = await requestAiReview(original, action);
      showComparisonModal(textarea, original, suggestion, 'Gemini');
    } catch (error) {
      const message = String(error?.message || 'Nao foi possivel revisar com IA agora.');
      const quotaExceeded = /quota|rate|limit|exceeded|retry/i.test(message);
      if (quotaExceeded) {
        showComparisonModal(textarea, original, reviewPortuguese(original), 'Revisao local - limite da IA atingido');
        return;
      }
      if (confirm(message + '\n\nDeseja aplicar a revisao local simples?')) {
        showComparisonModal(textarea, original, reviewPortuguese(original), 'Revisao local');
      }
    } finally {
      if (trigger) {
        trigger.disabled = false;
        trigger.textContent = oldText || actionLabels[action] || 'Revisar com IA';
      }
    }
  }

  function openAiReviewMenu(textarea, anchor) {
    document.querySelector('#aiReviewMenuDialog')?.remove();
    document.querySelector('#aiReviewMenu')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'aiReviewMenuDialog';
    dialog.className = 'ai-review-menu-dialog';
    const menu = document.createElement('div');
    menu.id = 'aiReviewMenu';
    menu.className = 'ai-review-menu';
    menu.innerHTML = Object.entries(actionLabels).map(([action, label]) => `<button type="button" data-ai-action="${action}">${label}</button>`).join('');
    dialog.append(menu);
    document.body.append(dialog);
    const rect = anchor?.getBoundingClientRect?.() || textarea.getBoundingClientRect();
    dialog.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 238))}px`;
    dialog.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 220))}px`;
    const closeMenu = () => {
      if (dialog.open) dialog.close();
      dialog.remove();
    };
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeMenu();
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeMenu();
    });
    menu.addEventListener('click', event => {
      const button = event.target.closest('[data-ai-action]');
      if (!button) return;
      const action = button.dataset.aiAction;
      closeMenu();
      runAiReview(textarea, action, anchor);
    });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    menu.querySelector('button')?.focus();
  }

  window.adjustTextWithAI = function adjustTextWithAI(field) {
    const textarea = targetTextarea(field);
    if (!textarea) return;
    openAiReviewMenu(textarea, window.event?.currentTarget || textarea);
  };

  window.adjustInlineParagraph = function adjustInlineParagraph() {
    window.adjustTextWithAI(document.querySelector('#editParagraphText'));
  };

  function addReviewButton(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    if (textarea.id === 'directorEmailMessage' || textarea.dataset.aiReviewDisabled === '1') {
      const nextButton = textarea.nextElementSibling;
      if (nextButton?.classList?.contains('ai-adjust')) nextButton.remove();
      textarea.dataset.aiReviewAdded = '';
      return;
    }
    const existing = textarea.parentElement?.querySelector(`button.ai-adjust[data-ai-review-for="${textarea.id || textarea.name || 'textarea'}"]`);
    if (existing) return;
    const nextButton = textarea.nextElementSibling;
    if (nextButton?.classList?.contains('ai-adjust')) {
      nextButton.textContent = 'Revisar portugu\u00eas com IA';
      nextButton.dataset.aiReviewFor = textarea.id || textarea.name || 'textarea';
      nextButton.onclick = event => {
        event.preventDefault();
        window.adjustTextWithAI(textarea);
      };
      return;
    }
    if (textarea.dataset.aiReviewAdded === '1') return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-adjust';
    button.dataset.aiReviewFor = textarea.id || textarea.name || 'textarea';
    button.textContent = 'Revisar portugu\u00eas com IA';
    button.addEventListener('click', event => {
      event.preventDefault();
      window.adjustTextWithAI(textarea);
    });
    textarea.insertAdjacentElement('afterend', button);
    textarea.dataset.aiReviewAdded = '1';
  }

  function refreshTextareaReviewButtons() {
    document.querySelectorAll('textarea').forEach(addReviewButton);
  }

  async function apiJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel concluir a operacao.');
    return data;
  }

  function ensureAiSettingsPanel() {
    if (document.body.dataset.role !== 'master') return;
    const config = document.querySelector('#configuracoes');
    if (!config || document.querySelector('#aiReviewSettingsPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'aiReviewSettingsPanel';
    panel.className = 'panel ai-review-settings-panel';
    panel.innerHTML = `
      <div class="profile-subtitle">
        <h3>Revisao inteligente com IA</h3>
        <p>Escolha o provedor usado para revisar textos de pareceres sem expor credenciais no navegador.</p>
      </div>
      <div class="form-grid">
        <label class="checkline"><input id="aiReviewEnabled" type="checkbox"> Habilitar revisao por IA</label>
        <label class="checkline"><input id="aiReviewFallback" type="checkbox"> Usar fallback quando o provedor falhar</label>
        <div class="field">
          <label>Provedor de IA</label>
          <select id="aiReviewProvider">
            <option value="gemini">Gemini</option>
            <option value="llama">Llama via API</option>
          </select>
        </div>
        <div class="ai-provider-fields" data-ai-provider-fields="gemini">
          <label class="checkline"><input id="aiGeminiEnabled" type="checkbox"> Gemini ativo</label>
          <div class="field"><label>Gemini API Key</label><input id="aiGeminiApiKey" type="password" autocomplete="off" placeholder="Cole a API Key ou deixe em branco para manter"></div>
          <div class="field"><label>Modelo Gemini</label><input id="aiGeminiModel" placeholder="gemini-3.5-flash"></div>
        </div>
        <div class="ai-provider-fields" data-ai-provider-fields="llama">
          <label class="checkline"><input id="aiLlamaEnabled" type="checkbox"> Llama via API ativo</label>
          <div class="field"><label>URL base da API</label><input id="aiLlamaBaseUrl" placeholder="https://api.groq.com/openai/v1"></div>
          <div class="field"><label>API Key do Llama</label><input id="aiLlamaApiKey" type="password" autocomplete="off" placeholder="Cole a API Key ou deixe em branco para manter"></div>
          <div class="field"><label>Modelo Llama</label><input id="aiLlamaModel" placeholder="llama-3.3-70b-versatile"></div>
          <small class="muted">Use uma API compatível com OpenAI Chat Completions, como Groq, Together ou OpenRouter.</small>
        </div>
        <div class="field"><label>Limite diario por professora</label><input id="aiDailyUserLimit" type="number" min="1" max="500"></div>
        <div class="field"><label>Limite diario por escola</label><input id="aiDailySchoolLimit" type="number" min="1" max="5000"></div>
      </div>
      <p id="aiReviewSettingsStatus" class="profile-message"></p>
      <div class="form-actions"><button class="primary" type="button" id="saveAiReviewSettings">Salvar IA</button></div>`;
    config.append(panel);
    panel.querySelector('#aiReviewProvider')?.addEventListener('change', toggleAiProviderFields);
    loadAiSettings();
    panel.querySelector('#saveAiReviewSettings')?.addEventListener('click', saveAiSettings);
  }

  function toggleAiProviderFields() {
    const provider = document.querySelector('#aiReviewProvider')?.value || 'gemini';
    document.querySelectorAll('[data-ai-provider-fields]').forEach(box => {
      box.style.display = box.dataset.aiProviderFields === provider ? 'contents' : 'none';
    });
  }

  async function loadAiSettings() {
    const status = document.querySelector('#aiReviewSettingsStatus');
    try {
      const settings = await apiJson('api.php?resource=ai-review-settings');
      document.querySelector('#aiReviewEnabled').checked = !!settings.enabled;
      document.querySelector('#aiReviewFallback').checked = !!settings.fallbackEnabled;
      document.querySelector('#aiReviewProvider').value = settings.provider || 'gemini';
      document.querySelector('#aiGeminiEnabled').checked = !!settings.geminiEnabled;
      document.querySelector('#aiGeminiApiKey').placeholder = settings.geminiConfigured ? `Configurada: ${settings.geminiApiKeyMasked}` : 'Cole a API Key do Gemini';
      document.querySelector('#aiGeminiModel').value = settings.geminiModel || 'gemini-3.5-flash';
      document.querySelector('#aiLlamaEnabled').checked = !!settings.llamaEnabled;
      document.querySelector('#aiLlamaBaseUrl').value = settings.llamaBaseUrl || 'https://api.groq.com/openai/v1';
      document.querySelector('#aiLlamaApiKey').placeholder = settings.llamaApiKeyConfigured ? `Configurada: ${settings.llamaApiKeyMasked}` : 'Cole a API Key do provedor';
      document.querySelector('#aiLlamaModel').value = settings.llamaModel || 'llama-3.3-70b-versatile';
      document.querySelector('#aiDailyUserLimit').value = settings.dailyUserLimit || 10;
      document.querySelector('#aiDailySchoolLimit').value = settings.dailySchoolLimit || 100;
      toggleAiProviderFields();
      if (status) status.textContent = settings.enabled ? 'Revisao por IA habilitada.' : 'Revisao por IA desabilitada.';
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  }

  async function saveAiSettings() {
    const status = document.querySelector('#aiReviewSettingsStatus');
    if (status) status.textContent = 'Salvando configuracao de IA...';
    try {
      const payload = {
        enabled: document.querySelector('#aiReviewEnabled')?.checked,
        provider: document.querySelector('#aiReviewProvider')?.value || 'gemini',
        fallbackEnabled: document.querySelector('#aiReviewFallback')?.checked,
        geminiEnabled: document.querySelector('#aiGeminiEnabled')?.checked,
        geminiApiKey: document.querySelector('#aiGeminiApiKey')?.value.trim(),
        geminiModel: document.querySelector('#aiGeminiModel')?.value.trim(),
        llamaEnabled: document.querySelector('#aiLlamaEnabled')?.checked,
        llamaBaseUrl: document.querySelector('#aiLlamaBaseUrl')?.value.trim(),
        llamaApiKey: document.querySelector('#aiLlamaApiKey')?.value.trim(),
        llamaModel: document.querySelector('#aiLlamaModel')?.value.trim(),
        dailyUserLimit: document.querySelector('#aiDailyUserLimit')?.value,
        dailySchoolLimit: document.querySelector('#aiDailySchoolLimit')?.value
      };
      await apiJson('api.php?resource=ai-review-settings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      if (document.querySelector('#aiGeminiApiKey')) document.querySelector('#aiGeminiApiKey').value = '';
      if (document.querySelector('#aiLlamaApiKey')) document.querySelector('#aiLlamaApiKey').value = '';
      if (status) status.textContent = 'Configuracao de IA salva com sucesso.';
      loadAiSettings();
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    refreshTextareaReviewButtons();
    ensureAiSettingsPanel();
    let refreshTimer = 0;
    const observer = new MutationObserver(() => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshTextareaReviewButtons, 80);
    });
    observer.observe(document.body, {childList: true, subtree: true});
  });
  window.addEventListener('portal:user-ready', ensureAiSettingsPanel);
})();
