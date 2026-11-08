(() => {
  const looksHtml = value => /<(p|div|br|img)\b/i.test(String(value || ''));
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const imageSource = /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i;
  const blockTags = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE']);

  // Le um elemento (ou documento HTML) e devolve blocos de texto e imagem em ordem.
  function collectBlocks(root) {
    const blocks = [];
    let buffer = '';
    const flush = () => {
      const text = buffer.replace(/\s+/g, ' ').trim();
      if (text) blocks.push({type: 'text', text});
      buffer = '';
    };
    const walk = node => {
      node.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) buffer += child.nodeValue;
        else if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName;
          if (tag === 'IMG') {
            flush();
            const src = child.getAttribute('src') || '';
            if (imageSource.test(src)) blocks.push({type: 'image', src});
          } else if (tag === 'BR') flush();
          else if (blockTags.has(tag)) { flush(); walk(child); flush(); }
          else walk(child);
        }
      });
    };
    walk(root);
    flush();
    return blocks;
  }

  function blocksFromValue(value) {
    const text = String(value || '').trim();
    if (!text) return [];
    if (!looksHtml(text)) {
      return text.split(/\r?\n\s*\r?\n/).map(part => part.replace(/\s+/g, ' ').trim()).filter(Boolean).map(part => ({type: 'text', text: part}));
    }
    return collectBlocks(new DOMParser().parseFromString(`<body>${text}</body>`, 'text/html').body);
  }

  // Valor gravado: texto simples quando nao ha imagens (compativel com o formato antigo)
  // ou HTML simples (<p> e <img>) quando ha imagens.
  function serializeBlocks(blocks) {
    if (!blocks.some(block => block.type === 'image')) return blocks.map(block => block.text).join('\n\n');
    return blocks.map(block => block.type === 'image'
      ? `<p><img src="${block.src}"></p>`
      : `<p>${escapeHtml(block.text)}</p>`).join('');
  }

  // Cabecalho do documento: valor proprio do documento (true/false) ou, se nao definido,
  // a configuracao geral ("Exibir cabecalho nos documentos").
  window.effectiveShowHeader = function effectiveShowHeader(value) {
    if (value === true || value === false) return value;
    try { return (JSON.parse(localStorage.getItem(HEADER_KEY) || '{}') || {}).showHeader !== false; } catch (_) { return true; }
  };

  window.wizardHeaderFieldHtml = function wizardHeaderFieldHtml() {
    return `<div class="field"><label class="final-text-option"><input type="checkbox" id="wizardShowHeader" ${effectiveShowHeader(wizard.showHeader) ? 'checked' : ''} onchange="toggleWizardHeader(this)"> Exibir cabeçalho neste documento</label></div>`;
  };

  window.toggleWizardHeader = function toggleWizardHeader(input) {
    wizard.showHeader = !!input.checked;
    if (typeof persistWizard === 'function') persistWizard();
    if (document.querySelector('#modal .review-box')) wizardReviewV2();
  };

  window.finalTextHasContent = value => blocksFromValue(value).length > 0;

  window.finalTextToHtml = function finalTextToHtml(value) {
    return blocksFromValue(value).map(block => block.type === 'image'
      ? `<p class="final-text-image"><img src="${block.src}" alt="Imagem do texto final"></p>`
      : `<p>${escapeHtml(block.text)}</p>`).join('');
  };

  function editorHtml(value) {
    return blocksFromValue(value).map(block => block.type === 'image'
      ? `<div><img src="${block.src}"></div>`
      : `<div>${escapeHtml(block.text)}</div>`).join('');
  }

  window.richFieldHtml = function richFieldHtml(id, value, placeholder, extraAttributes = '') {
    return `<div class="rich-field-wrap">
      <div class="rich-toolbar">
        <button class="secondary" type="button" data-rich-image="${id}">+ Inserir imagem</button>
        <input type="file" accept="image/*" multiple hidden data-rich-file="${id}">
        <small class="muted">Escreva o texto e insira imagens (ex.: assinatura). Elas aparecem no documento na mesma ordem.</small>
      </div>
      <div id="${id}" class="rich-field" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="${escapeHtml(placeholder || '')}" ${extraAttributes}>${editorHtml(value)}</div>
    </div>`;
  };

  window.getRichFieldValue = function getRichFieldValue(id) {
    const field = document.getElementById(id);
    return field ? serializeBlocks(collectBlocks(field)) : '';
  };

  window.setRichFieldValue = function setRichFieldValue(id, value) {
    const field = document.getElementById(id);
    if (field) field.innerHTML = editorHtml(value);
  };

  function shrinkImage(file, maxSide = 900) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Arquivo de imagem invalido.'));
        image.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function insertImages(id, files) {
    const field = document.getElementById(id);
    if (!field) return;
    const images = [...files].filter(file => file.type.startsWith('image/'));
    for (const file of images) {
      try {
        const src = await shrinkImage(file);
        field.focus();
        const selection = window.getSelection();
        if (!selection.rangeCount || !field.contains(selection.anchorNode)) {
          const range = document.createRange();
          range.selectNodeContents(field);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        document.execCommand('insertHTML', false, `<div><img src="${src}"></div><div><br></div>`);
      } catch (error) {
        alert(error.message || 'Nao foi possivel inserir a imagem.');
      }
    }
    field.dispatchEvent(new Event('input', {bubbles: true}));
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-rich-image]');
    if (!button) return;
    document.querySelector(`[data-rich-file="${button.dataset.richImage}"]`)?.click();
  });

  document.addEventListener('change', event => {
    const input = event.target.closest?.('[data-rich-file]');
    if (!input) return;
    insertImages(input.dataset.richFile, input.files);
    input.value = '';
  });

  document.addEventListener('paste', event => {
    const field = event.target.closest?.('.rich-field');
    if (!field) return;
    const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
    event.preventDefault();
    if (files.length) return insertImages(field.id, files);
    document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || '');
  });

  document.addEventListener('dragover', event => {
    if (event.target.closest?.('.rich-field')) event.preventDefault();
  });

  document.addEventListener('drop', event => {
    const field = event.target.closest?.('.rich-field');
    if (!field) return;
    const files = [...(event.dataTransfer?.files || [])].filter(file => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    insertImages(field.id, files);
  });

  // Texto final do documento no assistente (etapa 1).
  document.addEventListener('input', event => {
    const field = event.target.closest?.('.rich-field[data-wizard-final]');
    if (!field || typeof wizard === 'undefined') return;
    wizard.finalText = getRichFieldValue(field.id);
    wizard.finalTextTouched = true;
    if (typeof persistWizard === 'function') persistWizard();
  });

  // Padrao: texto final marcado apenas para portfolio (e se ja houver texto cadastrado).
  window.applyFinalTextDefault = function applyFinalTextDefault() {
    if (!wizard || wizard.finalTextTouched || wizard.databaseId || wizard.localReportId || wizard.readOnly) return;
    const configured = typeof configuredFinalText === 'function' ? configuredFinalText() : '';
    wizard.useFinalText = wizard.documentType === 'portfolio' && finalTextHasContent(configured);
    wizard.finalText = wizard.useFinalText ? configured : '';
  };

  window.syncWizardFinalTextUi = function syncWizardFinalTextUi() {
    const checkbox = document.getElementById('wizardUseFinalText');
    const box = document.getElementById('wizardFinalTextBox');
    if (!checkbox || !box) return;
    checkbox.checked = !!wizard.useFinalText;
    box.hidden = !wizard.useFinalText;
    setRichFieldValue('wizardFinalText', wizard.finalText || '');
  };

  window.wizardFinalTextFieldHtml = function wizardFinalTextFieldHtml() {
    const checked = !!wizard.useFinalText;
    return `<div class="field final-text-field">
      <label class="final-text-option"><input type="checkbox" id="wizardUseFinalText" ${checked ? 'checked' : ''} onchange="toggleWizardFinalText(this)"> Adicionar texto no final do documento</label>
      <div id="wizardFinalTextBox" ${checked ? '' : 'hidden'}>
        ${richFieldHtml('wizardFinalText', wizard.finalText || '', 'Texto que aparece no final do documento (pode incluir imagens)...', 'data-wizard-final="1"')}
        <small class="muted">Dica: escreva [NOME] onde quiser que apareça o nome do aluno ao finalizar o documento.</small>
      </div>
    </div>`;
  };

  window.toggleWizardFinalText = function toggleWizardFinalText(input) {
    wizard.useFinalText = !!input.checked;
    wizard.finalTextTouched = true;
    if (wizard.useFinalText && !finalTextHasContent(wizard.finalText)) {
      wizard.finalText = typeof configuredFinalText === 'function' ? configuredFinalText() : '';
    }
    syncWizardFinalTextUi();
    if (typeof persistWizard === 'function') persistWizard();
  };

  // Edicao do texto final na etapa de revisao.
  window.editFinalText = function editFinalText() {
    wizardOpen(`
      <p class="wizard-step">TEXTO FINAL</p>
      <h2 class="modal-title">Texto no final do documento</h2>
      <p class="modal-subtitle">Este texto vale só para este documento. Use [NOME] para o nome do aluno.</p>
      <div class="field">${richFieldHtml('wizardFinalTextEdit', wizard.finalText || (typeof configuredFinalText === 'function' ? configuredFinalText() : ''), 'Texto que aparece no final do documento...')}</div>
      <div class="form-actions">
        <button class="secondary" type="button" onclick="wizardReviewV2()">Cancelar</button>
        <button class="primary" type="button" onclick="saveFinalTextEdit()">Salvar texto final</button>
      </div>
    `);
  };

  window.saveFinalTextEdit = function saveFinalTextEdit() {
    wizard.finalText = getRichFieldValue('wizardFinalTextEdit');
    wizard.useFinalText = finalTextHasContent(wizard.finalText);
    wizard.finalTextTouched = true;
    if (typeof persistWizard === 'function') persistWizard();
    wizardReviewV2();
  };
})();
