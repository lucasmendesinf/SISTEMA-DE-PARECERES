(() => {
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

  window.adjustTextWithAI = function adjustTextWithAI(field) {
    const textarea = targetTextarea(field);
    if (!textarea) return;
    const original = textarea.value.trim();
    if (!original) {
      textarea.focus();
      alert('Escreva um texto antes de solicitar a revis\u00e3o.');
      return;
    }
    textarea.value = reviewPortuguese(original);
    textarea.dispatchEvent(new Event('input', {bubbles: true}));
    if (typeof bufferStepOne === 'function' && textarea.id === 'wizardText') bufferStepOne();
    if (typeof bufferStepTwo === 'function' && textarea.id === 'wizardPhotoNote') bufferStepTwo();
    textarea.focus();
  };

  window.adjustInlineParagraph = function adjustInlineParagraph() {
    window.adjustTextWithAI(document.querySelector('#editParagraphText'));
  };

  function addReviewButton(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) return;
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

  document.addEventListener('DOMContentLoaded', () => {
    refreshTextareaReviewButtons();
    let refreshTimer = 0;
    const observer = new MutationObserver(() => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshTextareaReviewButtons, 80);
    });
    observer.observe(document.body, {childList: true, subtree: true});
  });
})();
