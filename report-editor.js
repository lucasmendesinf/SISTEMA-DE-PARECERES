function normalizeWizardEntry(entry = {}) {
  return {
    activityIds: Array.isArray(entry.activityIds) ? entry.activityIds : [],
    photoNote: entry.photoNote || '',
    photos: Array.isArray(entry.photos) ? entry.photos : []
  };
}

function currentWizardEntry() {
  return normalizeWizardEntry({
    activityIds: wizard.activityIds || [],
    photoNote: wizard.photoNote || '',
    photos: wizard.photos || []
  });
}

function hasWizardEntryContent(entry) {
  return !!(entry.activityIds?.length || entry.photoNote || entry.photos?.length);
}

function setActiveWizardEntry(entry = {}) {
  const normalized = normalizeWizardEntry(entry);
  wizard.activityIds = [...normalized.activityIds];
  wizard.photoNote = normalized.photoNote;
  wizard.photos = [...normalized.photos];
}

function clearActiveWizardEntry() {
  wizard.activityIds = [];
  wizard.photoNote = '';
  wizard.photos = [];
  delete wizard.editingEntryIndex;
}

function wizardEntries() {
  const entries = (wizard.entries || []).map(normalizeWizardEntry).filter(hasWizardEntryContent);
  const current = currentWizardEntry();
  if (Number.isInteger(wizard.editingEntryIndex)) {
    if (hasWizardEntryContent(current)) entries[wizard.editingEntryIndex] = current;
    return entries.filter(hasWizardEntryContent);
  }
  if (hasWizardEntryContent(current)) entries.push(current);
  return entries;
}

function bufferStepTwo() {
  const note = $('#wizardPhotoNote');
  const activities = document.querySelectorAll('.wizard-activity');
  if (activities.length) wizard.activityIds = [...document.querySelectorAll('.wizard-activity:checked')].map(input => +input.value);
  if (note) wizard.photoNote = note.value;
  if (Number.isInteger(wizard.editingEntryIndex)) {
    wizard.entries = wizard.entries || [];
    wizard.entries[wizard.editingEntryIndex] = currentWizardEntry();
  }
  persistWizard();
}

function wizardPreviewImages() {
  return (wizard.photos || []).map((src, index) => `
    <div class="wizard-photo-item">
      <img src="${src}" alt="Prévia da imagem ${index + 1}">
      <button type="button" onclick="removeWizardPhoto(${index})" aria-label="Remover imagem">×</button>
    </div>
  `).join('');
}

function wizardPhotoLoadingHtml(message = 'Carregando imagens no sistema...') {
  return `
    <div class="wizard-photo-loading" role="status" aria-live="polite">
      <span class="wizard-photo-spinner" aria-hidden="true"></span>
      <strong>${esc(message)}</strong>
      <small>Aguarde enquanto a imagem e preparada para edicao.</small>
    </div>
  `;
}

function setWizardPhotoProcessing(processing, message) {
  wizard.isProcessingPhotos = !!processing;
  const previews = $('#wizardPreviews');
  const input = $('#wizardPhotos');
  const dropzone = $('#wizardDropzone');
  if (previews) {
    previews.setAttribute('aria-busy', processing ? 'true' : 'false');
    previews.innerHTML = processing ? wizardPhotoLoadingHtml(message) : wizardPreviewImages();
  }
  if (input) input.disabled = !!processing;
  if (dropzone) {
    dropzone.classList.toggle('is-loading', !!processing);
    dropzone.setAttribute('aria-disabled', processing ? 'true' : 'false');
  }
  document.querySelectorAll('#modal .form-actions button').forEach(button => {
    button.disabled = !!processing;
  });
}

function removeWizardPhoto(index) {
  if (wizard.isProcessingPhotos) return;
  wizard.photos = (wizard.photos || []).filter((_, itemIndex) => itemIndex !== index);
  bufferStepTwo();
  const previews = $('#wizardPreviews');
  if (previews) previews.innerHTML = wizardPreviewImages();
}

async function wizardPhotoCheck(input) {
  if (!input?.files?.length) return;
  try {
    setWizardPhotoProcessing(true, 'Carregando imagens no sistema...');
    const result = await window.PortalImageEditors.processFiles(input.files, 3);
    wizard.photos = result.photos;
    wizard.imageEditorMode = result.mode;
    setWizardPhotoProcessing(false);
    bufferStepTwo();
  } catch (error) {
    alert(error.message || 'Não foi possível ler uma das imagens.');
    input.value = '';
    setWizardPhotoProcessing(false);
  }
}

function wizardActivitiesV2() {
  if ($('#wizardText')) bufferStepOne();
  if (!wizard.text?.trim()) return wizardStart();
  const editing = Number.isInteger(wizard.editingEntryIndex);
  const activities = data.activities.map(activity => `
    <label class="linked-activity">
      <input class="wizard-activity" type="checkbox" value="${activity.id}" ${(wizard.activityIds || []).includes(activity.id) ? 'checked' : ''} onchange="selectRegisteredActivityForDocument(this)">
      <span><strong>${esc(activity.title)}</strong><small>${esc(activity.date)} · ${esc(activity.area)}</small></span>
      ${activity.photos?.[0] ? `<img src="${activity.photos[0]}" alt="Foto">` : ''}
    </label>
  `).join('') || '<p class="muted">Nenhuma atividade cadastrada.</p>';
  wizardOpen(`
    <p class="wizard-step">ETAPA 2 DE 3 · ATIVIDADES E FOTOS</p>
    <h2 class="modal-title">${editing ? 'Editar vivência' : 'Vivências realizadas'}</h2>
    <p class="modal-subtitle">${editing ? 'Altere o texto, as atividades vinculadas ou substitua as imagens deste trecho.' : 'Selecione atividades já cadastradas ou adicione uma nova vivência.'}</p>
    <div class="field">
      <label>Atividades cadastradas</label>
      <div class="linked-activities">${activities}</div>
      <button class="ai-adjust" type="button" onclick="useRegisteredActivities()">+ Usar atividades selecionadas no documento</button>
    </div>
    <div class="field">
      <label>Fotos da atividade <span class="muted">(até 3 imagens por bloco)</span></label>
      <label id="wizardDropzone" class="dropzone" ondragover="wizardDrag(event)" ondragleave="wizardLeave()" ondrop="wizardDrop(event)">
        <strong>${wizard.photos?.length ? 'Clique para trocar as imagens' : 'Arraste as imagens aqui'}</strong>
        <span>${wizard.photos?.length ? 'Ao escolher novos arquivos, as imagens atuais deste bloco serão substituídas.' : 'ou clique para escolher arquivos'}</span>
        <input id="wizardPhotos" type="file" accept="image/*" multiple onchange="wizardPhotoCheck(this)">
      </label>
      <div id="wizardPreviews" class="image-previews editable-previews">${wizardPreviewImages()}</div>
    </div>
    <div class="field">
      <label>Informações sobre a brincadeira ou as fotos</label>
      <textarea id="wizardPhotoNote" rows="4" oninput="bufferStepTwo()" placeholder="Descreva o que aconteceu, o que o aluno explorou ou demonstrou nas imagens...">${esc(wizard.photoNote || '')}</textarea>
      <button class="ai-adjust" type="button" onclick="adjustTextWithAI();bufferStepTwo()">✦ Revisar texto com IA</button>
      <small class="muted">Organiza a escrita e a pontuação, sem mudar as informações registradas.</small>
    </div>
    <div class="form-actions">
      <button class="secondary" type="button" onclick="${editing ? 'finishEntryEdit()' : 'wizardStart()'}">${editing ? 'Salvar e voltar' : 'Voltar'}</button>
      <button class="secondary" type="button" onclick="saveDraftEverywhere()">Salvar rascunho</button>
      <button class="primary" type="button" onclick="wizardReviewV2()">Próximo</button>
    </div>
  `);
}

function finishEntryEdit() {
  if (wizard.isProcessingPhotos) return alert('Aguarde o carregamento das imagens terminar.');
  bufferStepTwo();
  delete wizard.editingEntryIndex;
  clearActiveWizardEntry();
  persistWizard();
  wizardReviewV2();
}

function mainParagraphs() {
  return (wizard.text || '').split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
}

function setMainParagraph(index, value) {
  const paragraphs = mainParagraphs();
  paragraphs[index] = value.trim();
  wizard.text = paragraphs.filter(Boolean).join('\n\n');
  persistWizard();
}

function editMainParagraph(index) {
  const paragraph = mainParagraphs()[index] || '';
  wizardOpen(`
    <p class="wizard-step">EDIÇÃO DO TEXTO PRINCIPAL</p>
    <h2 class="modal-title">Editar parágrafo</h2>
    <p class="modal-subtitle">Altere somente este trecho do documento.</p>
    <div class="field">
      <label>Parágrafo ${index + 1}</label>
      <textarea id="editParagraphText" rows="8">${esc(paragraph)}</textarea>
      <button class="ai-adjust" type="button" onclick="adjustInlineParagraph()">✦ Ajustar texto com IA</button>
    </div>
    <div class="form-actions">
      <button class="secondary" type="button" onclick="wizardReviewV2()">Cancelar</button>
      <button class="primary" type="button" onclick="saveMainParagraph(${index})">Salvar parágrafo</button>
    </div>
  `);
}

function adjustInlineParagraph() {
  const field = $('#editParagraphText');
  if (!field || !field.value.trim()) return;
  const clean = field.value.replace(/\s+/g, ' ').replace(/\s*([,.;:!?])\s*/g, '$1 ').trim();
  field.value = (clean.charAt(0).toUpperCase() + clean.slice(1)).replace(/\s+$/, '') + (/[.!?]$/.test(clean) ? '' : '.');
}

function saveMainParagraph(index) {
  const field = $('#editParagraphText');
  if (!field) return;
  setMainParagraph(index, field.value);
  wizardReviewV2();
}

function editAllMainText() {
  wizardOpen(`
    <p class="wizard-step">ETAPA 1 DE 3 · TEXTO PRINCIPAL</p>
    <h2 class="modal-title">Editar informações sobre o aluno</h2>
    <p class="modal-subtitle">Aqui você pode alterar todo o texto principal do documento.</p>
    <div class="field">
      <label>Informações sobre o aluno</label>
      <textarea id="wizardText" oninput="bufferStepOne()" placeholder="Descreva as informações do aluno...">${esc(wizard.text || '')}</textarea>
      <button class="ai-adjust" type="button" onclick="adjustTextWithAI();bufferStepOne()">✦ Ajustar texto com IA</button>
    </div>
    <div class="form-actions">
      <button class="secondary" type="button" onclick="wizardReviewV2()">Voltar para revisão</button>
      <button class="secondary" type="button" onclick="saveDraftEverywhere()">Salvar rascunho</button>
      <button class="primary" type="button" onclick="bufferStepOne();wizardReviewV2()">Salvar e revisar</button>
    </div>
  `);
}

function editEntry(index) {
  bufferStepTwo();
  const entries = wizardEntries();
  const entry = entries[index];
  if (!entry) return wizardReviewV2();
  wizard.entries = entries;
  wizard.editingEntryIndex = index;
  setActiveWizardEntry(entry);
  persistWizard();
  wizardActivitiesV2();
}

function removeEntry(index) {
  if (!confirm('Remover este bloco de vivência do documento?')) return;
  const entries = wizardEntries();
  entries.splice(index, 1);
  wizard.entries = entries;
  clearActiveWizardEntry();
  persistWizard();
  wizardReviewV2();
}

function openDraftWithSavedImages() {
  const entries = (wizard.entries || []).map(normalizeWizardEntry).filter(hasWizardEntryContent);
  if (entries.length === 1) {
    wizard.entries = [];
    delete wizard.editingEntryIndex;
    setActiveWizardEntry(entries[0]);
    persistWizard();
    wizardActivitiesV2();
    return;
  }
  persistWizard();
  if (entries.length > 1) {
    wizardReviewV2();
    return;
  }
  wizardStart(false, wizard);
}

function documentDraftHtml() {
  const readOnly = !!wizard.readOnly;
  const paragraphs = mainParagraphs().map((part, index) => `
    <div class="editable-paragraph">
      <p>${esc(part)}</p>
      ${readOnly ? '' : `<button type="button" onclick="editMainParagraph(${index})">Editar parágrafo</button>`}
    </div>
  `).join('');
  const entries = wizardEntries().map((entry, index) => {
    const note = entry.photoNote ? `<p>${esc(entry.photoNote)}</p>` : '';
    const photos = entry.photos?.length ? `<div class="activity-photos">${entry.photos.map(src => `<img src="${src}" alt="Foto da vivência">`).join('')}</div>` : '';
    return `
      <section class="document-entry editable-entry">
        ${note}${photos}
        ${readOnly ? '' : `<div class="entry-actions">
          <button type="button" onclick="editEntry(${index})">Editar texto/imagens</button>
          <button type="button" onclick="removeEntry(${index})">Remover bloco</button>
        </div>`}
      </section>
    `;
  }).join('');
  return `${paragraphs || '<p class="muted">Nenhum texto principal informado.</p>'}${entries}${finalTextHtml()}`;
}

function configuredFinalText() {
  try {
    return String((JSON.parse(localStorage.getItem(HEADER_KEY) || '{}') || {}).finalText || '').trim();
  } catch (_) {
    return '';
  }
}

function finalTextHtml() {
  const text = String(wizard.finalText || configuredFinalText()).trim();
  if (!wizard.useFinalText || !text) return '';
  return `<section class="document-entry final-text-entry">${text.split(/\n{2,}/).filter(Boolean).map(part => `<p>${esc(part)}</p>`).join('')}</section>`;
}

function finalTextOptionHtml() {
  const text = configuredFinalText();
  if (!text) return '';
  return `<label class="final-text-option"><input type="checkbox" ${wizard.useFinalText ? 'checked' : ''} onchange="toggleFinalText(this)"> Usar texto final configurado</label>`;
}

function toggleFinalText(input) {
  wizard.useFinalText = !!input?.checked;
  wizard.finalText = configuredFinalText();
  persistWizard();
  wizardReviewV2();
}

async function ensureReportDetail(id) {
  const current = data.reports.find(item => String(item.id) === String(id) || String(item.databaseId) === String(id));
  const databaseId = current?.databaseId || current?.id || id;
  if (current?.hasFullData && (current.entries || []).some(entry => (entry.photos || []).length)) return current;
  const response = await fetch(`api.php?resource=reports&id=${encodeURIComponent(databaseId)}`);
  if (!response.ok) throw new Error('Nao foi possivel carregar as imagens do documento.');
  const detail = (await response.json())[0];
  if (!detail) return current || null;
  detail.status = ['done', 'concluido', 'concluído', 'entregue'].includes(String(detail.status).toLowerCase()) ? 'done' : 'draft';
  const index = data.reports.findIndex(item => String(item.id) === String(detail.id) || String(item.databaseId) === String(detail.id) || String(item.id) === String(id));
  if (index >= 0) data.reports[index] = {...data.reports[index], ...detail, hasFullData: true};
  else data.reports.unshift({...detail, hasFullData: true});
  const studentIndex = data.students.findIndex(student => String(student.id) === String(detail.studentId));
  if (studentIndex >= 0) data.students[studentIndex] = {...data.students[studentIndex], name: detail.name, birthDate: detail.birthDate, classId: detail.classId};
  else data.students.push({id: detail.studentId, name: detail.name, birthDate: detail.birthDate, classId: detail.classId, avatar: detail.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()});
  return data.reports[index >= 0 ? index : 0];
}

function wizardAddMore() {
  bufferStepTwo();
  const current = currentWizardEntry();
  if (hasWizardEntryContent(current) && !Number.isInteger(wizard.editingEntryIndex)) {
    wizard.entries = [...(wizard.entries || []), current];
  }
  clearActiveWizardEntry();
  persistWizard();
  wizardActivitiesV2();
}

async function refreshSelectedRegisteredActivities(selectedIds = []) {
  const selected = new Set(selectedIds.map(String));
  if (!selected.size) return;
  const selectedActivities = (data.activities || []).filter(activity => selected.has(String(activity.id)));
  const needsRefresh = selectedActivities.length !== selected.size
    || selectedActivities.some(activity => !Array.isArray(activity.photos));
  if (!needsRefresh) return;
  try {
    const response = await fetch('api.php?resource=activities');
    if (!response.ok) return;
    const activities = await response.json();
    if (Array.isArray(activities)) data.activities = activities;
  } catch (error) {
    console.warn('Nao foi possivel recarregar as fotos das atividades.', error);
  }
}

async function importSelectedRegisteredActivities() {
  const selected = (wizard.activityIds || []).map(String);
  await refreshSelectedRegisteredActivities(selected);
  const current = currentWizardEntry();
  const currentIsOnlySelection = current.activityIds.length && !current.photoNote && !current.photos.length;
  const entries = (wizard.entries || []).map(normalizeWizardEntry).filter(hasWizardEntryContent);
  const existingBase = currentIsOnlySelection ? entries : [...entries, current].filter(hasWizardEntryContent);
  const existing = new Set(existingBase.flatMap(entry => (entry.activityIds || []).map(String)));
  const selectedActivities = data.activities
    .filter(activity => selected.includes(String(activity.id)) && !existing.has(String(activity.id)));
  const additions = [];
  for (const activity of selectedActivities) {
    additions.push(await registeredActivityEntry(activity));
  }
  if (additions.length) {
    wizard.entries = currentIsOnlySelection ? [...entries, ...additions] : [...entries, current, ...additions].filter(hasWizardEntryContent);
    clearActiveWizardEntry();
  }
  return additions.length;
}

async function registeredActivityEntry(activity) {
  const photos = Array.isArray(activity.photos) ? [...activity.photos] : [];
  let editedPhotos = photos;
  if (photos.length && window.PortalImageEditors?.processDataUrls) {
    const result = await window.PortalImageEditors.processDataUrls(photos, 3);
    editedPhotos = result.photos;
    wizard.imageEditorMode = result.mode;
  }
  return {activityIds: [activity.id], photoNote: activity.note || activity.title, photos: editedPhotos};
}

async function selectRegisteredActivityForDocument(input) {
  if (!input?.checked) {
    bufferStepTwo();
    return;
  }
  input.disabled = true;
  const label = input.closest('.linked-activity');
  label?.classList.add('is-importing');
  try {
    bufferStepTwo();
    const count = await importSelectedRegisteredActivities();
    if (!count) {
      alert('Esta atividade ja foi adicionada ao documento.');
      input.checked = false;
      bufferStepTwo();
      return;
    }
    persistWizard();
    wizardReviewV2();
  } catch (error) {
    console.error(error);
    alert(error.message || 'Nao foi possivel anexar a atividade ao documento.');
    input.checked = false;
    bufferStepTwo();
  } finally {
    input.disabled = false;
    label?.classList.remove('is-importing');
  }
}

async function useRegisteredActivities() {
  if (wizard.isProcessingPhotos) return alert('Aguarde o carregamento das imagens terminar.');
  bufferStepTwo();
  const count = await importSelectedRegisteredActivities();
  if (!count) return alert('Selecione uma atividade ainda não adicionada.');
  persistWizard();
  alert(`${count} atividade(s) adicionada(s) ao documento.`);
  wizardReviewV2();
}

async function wizardReviewV2() {
  if (wizard.isProcessingPhotos) return alert('Aguarde a edicao das imagens terminar antes de avancar.');
  bufferStepTwo();
  const current = currentWizardEntry();
  if (current.activityIds.length && !current.photoNote && !current.photos.length) await importSelectedRegisteredActivities();
  persistWizard();
  const student = data.students.find(item => String(item.id) === String(wizard.studentId));
  if (!student) return alert('Não foi possível localizar o aluno deste documento.');
  wizardOpen(`
    <p class="wizard-step">ETAPA 3 DE 3 · REVISÃO</p>
    <h2 class="modal-title">Rascunho do documento</h2>
    <p class="modal-subtitle">Clique em um parágrafo ou bloco para editar exatamente o trecho desejado.</p>
    <div class="review-toolbar">
      <button class="secondary" type="button" onclick="editAllMainText()">Editar texto principal</button>
      <button class="secondary" type="button" onclick="wizardAddMore()">Adicionar nova vivência</button>
      ${finalTextOptionHtml()}
    </div>
    <div class="review-box">${configuredHeaderHtml()}${studentDocumentHeader(student)}${documentTypePreview()}${documentDraftHtml()}</div>
    <div class="form-actions">
      <button class="secondary" type="button" onclick="wizardActivitiesV2()">Voltar</button>
      <button class="secondary" type="button" onclick="saveWizardDraft()">Salvar rascunho</button>
      <button class="primary" type="button" onclick="wizardFinalizeV3()">Finalizar documento</button>
    </div>
  `);
}

async function wizardFinalizeV3() {
  try {
    if (wizard.isProcessingPhotos) return alert('Aguarde a edicao das imagens terminar antes de finalizar.');
    bufferStepTwo();
    delete wizard.editingEntryIndex;
    const report = wizardReport();
    const student = data.students.find(item => String(item.id) === String(report.studentId));
    const response = await fetch('api.php?resource=reports', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        student: {name: student.name, birthDate: student.birthDate || '', classId: student.classId || 1},
        text: report.text,
        documentType: report.documentType,
        activityIds: report.activityIds,
        entries: report.entries,
        useFinalText: !!report.useFinalText,
        finalText: report.finalText || '',
        imageEditorMode: wizard.imageEditorMode || 'none'
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Falha ao salvar no banco.');
    report.databaseId = result.id;
    report.hasFullData = true;
    report.status = 'review';
    save();
    wizardOpen(`
      <p class="wizard-step">PRÉVIA FINAL</p>
      <h2 class="modal-title">Documento pronto para entrega</h2>
      <p class="modal-subtitle">Rascunho salvo no banco de dados. Se precisar alterar algo, volte para edição.</p>
      <div class="review-box">${configuredHeaderHtml()}${studentDocumentHeader(student)}${documentTypePreview()}${documentDraftHtml()}</div>
      <div class="form-actions">
        <button class="secondary" type="button" onclick="wizardReviewV2()">Voltar para edição</button>
        <button class="primary" type="button" onclick="deliverReport(${report.id})">Entregar documento</button>
      </div>
    `);
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function editReport(id) {
  let report = data.reports.find(item => String(item.id) === String(id) || String(item.databaseId) === String(id));
  if (!report) return;
  if (!report.hasFullData) {
    wizardOpen(`
      <p class="wizard-step">CARREGANDO DOCUMENTO</p>
      <h2 class="modal-title">Abrindo o documento completo</h2>
      <p class="modal-subtitle">Buscando textos e imagens salvas...</p>
    `);
    try {
      report = await ensureReportDetail(id);
    } catch (error) {
      alert(error.message || 'Nao foi possivel abrir o documento completo.');
      wizardClose();
      return;
    }
  }
  if (!report) return;
  wizard = {
    studentId: report.studentId,
    text: report.text || '',
    documentType: normalizeDocumentType(report.documentType),
    activityIds: [],
    photoNote: '',
    photos: [],
    entries: report.entries || [{activityIds: report.activityIds || [], photoNote: report.photoNote || '', photos: report.photos || []}],
    useFinalText: !!report.useFinalText,
    finalText: report.finalText || '',
    readOnly: report.status === 'done'
  };
  const student = data.students.find(item => String(item.id) === String(report.studentId));
  if (report.status === 'done') {
    wizardOpen(`
      <p class="wizard-step">DOCUMENTO ENTREGUE</p>
      <h2 class="modal-title">Revisão do documento</h2>
      <p class="modal-subtitle">Visualização completa do documento entregue. Para editar, reabra o documento como rascunho.</p>
      <div class="review-box">${configuredHeaderHtml()}${studentDocumentHeader(student)}${documentTypePreview()}${documentDraftHtml()}</div>
      <div class="form-actions">
        <button class="secondary" type="button" onclick="wizardClose()">Fechar</button>
        <button class="secondary" type="button" onclick="reopenReport(${report.id})">Reabrir documento</button>
        <button class="secondary" type="button" onclick="openDirectorEmailModal(${report.id})">Enviar e-mail</button>
        <button class="secondary" type="button" onclick="downloadPdf(${report.id})">Baixar PDF</button>
        <button class="primary" type="button" onclick="downloadReport(${report.id})">Baixar DOCX</button>
      </div>
    `);
    return;
  }
  delete wizard.readOnly;
  openDraftWithSavedImages();
}

async function reopenReport(id) {
  try {
    const report = await ensureReportDetail(id);
    if (!report) throw new Error('Documento nao encontrado.');
    const databaseId = report.databaseId || report.id;
    const response = await fetch('api.php?resource=reports', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({reopenId: databaseId})
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Nao foi possivel reabrir o documento.');
    report.status = 'draft';
    report.deliveredAt = null;
    report.hasFullData = true;
    wizardClose();
    editReport(report.id);
  } catch (error) {
    alert(error.message || 'Nao foi possivel reabrir o documento.');
  }
}

const downloadReportBeforeDetailLoad = window.downloadReport?.bind(window);
const downloadPdfBeforeDetailLoad = window.downloadPdf?.bind(window);

if (downloadReportBeforeDetailLoad) {
  window.downloadReport = async function downloadReportWithDetail(id) {
    try { await ensureReportDetail(id); } catch (error) { console.warn(error); }
    return downloadReportBeforeDetailLoad(id);
  };
}

if (downloadPdfBeforeDetailLoad) {
  window.downloadPdf = async function downloadPdfWithDetail(id) {
    try { await ensureReportDetail(id); } catch (error) { console.warn(error); }
    return downloadPdfBeforeDetailLoad(id);
  };
}

window.ensureReportDetail = ensureReportDetail;
window.reopenReport = reopenReport;

let reportAutosaveTimer = null;
let reportAutosaveRunning = false;
let reportAutosaveQueued = false;

async function autosaveWizardDraft() {
  if (reportAutosaveRunning) {
    reportAutosaveQueued = true;
    return;
  }
  const student = data.students.find(item => String(item.id) === String(wizard.studentId || ''));
  if (!student || wizard.readOnly || wizard.isProcessingPhotos) return;
  const text = String(wizard.text || '').trim();
  const entries = wizardEntries();
  if (!text && !entries.length) return;
  reportAutosaveRunning = true;
  try {
    const activityIds = [...new Set(entries.flatMap(entry => entry.activityIds || []))];
    const finalText = typeof configuredFinalText === 'function' ? configuredFinalText() : '';
    const response = await fetch('api.php?resource=reports', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        draft: true,
        student: {name: student.name, birthDate: student.birthDate || '', classId: student.classId || 1},
        text: wizard.text || '',
        documentType: normalizeDocumentType(wizard.documentType),
        activityIds,
        entries,
        useFinalText: !!wizard.useFinalText,
        finalText: wizard.useFinalText ? (wizard.finalText || finalText) : '',
        imageEditorMode: wizard.imageEditorMode || 'none'
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Erro ao salvar rascunho automaticamente.');
    wizard.databaseId = result.id;
    const report = data.reports.find(item => String(item.studentId) === String(wizard.studentId));
    if (report) {
      Object.assign(report, {
        databaseId: result.id,
        text: wizard.text || '',
        documentType: normalizeDocumentType(wizard.documentType),
        activityIds,
        entries,
        useFinalText: !!wizard.useFinalText,
        finalText: wizard.useFinalText ? (wizard.finalText || finalText) : '',
        photoNote: entries.map(entry => entry.photoNote).filter(Boolean).join('\n\n'),
        status: 'draft'
      });
    }
    persistWizard();
  } catch (error) {
    console.warn(error.message || error);
  } finally {
    reportAutosaveRunning = false;
    if (reportAutosaveQueued) {
      reportAutosaveQueued = false;
      scheduleWizardAutosave();
    }
  }
}

function scheduleWizardAutosave() {
  clearTimeout(reportAutosaveTimer);
  reportAutosaveTimer = setTimeout(autosaveWizardDraft, 1400);
}

const originalBufferStepOneForAutosave = window.bufferStepOne;
if (typeof originalBufferStepOneForAutosave === 'function') {
  window.bufferStepOne = function bufferStepOneWithAutosave(...args) {
    const result = originalBufferStepOneForAutosave.apply(this, args);
    scheduleWizardAutosave();
    return result;
  };
}

const originalBufferStepTwoForAutosave = window.bufferStepTwo;
window.bufferStepTwo = function bufferStepTwoWithAutosave(...args) {
  const result = originalBufferStepTwoForAutosave?.apply(this, args);
  scheduleWizardAutosave();
  return result;
};
