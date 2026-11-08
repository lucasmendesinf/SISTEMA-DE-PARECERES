(() => {
  const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function nameToTag(text, fullName) {
    let result = String(text || '');
    const full = String(fullName || '').trim();
    if (!result || !full) return result;
    const first = full.split(/\s+/)[0];
    const names = [full];
    if (first.length >= 3 && first.toLowerCase() !== full.toLowerCase()) names.push(first);
    names.forEach(name => {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'giu');
      result = result.replace(pattern, '[NOME]');
    });
    return result;
  }

  function findReport(id) {
    return data.reports.find(item => String(item.id) === String(id) || String(item.databaseId) === String(id));
  }

  function targetTypeFor(source, mode) {
    const sourceType = normalizeDocumentType(source.documentType);
    if (mode === 'type') return sourceType === 'portfolio' ? 'parecer' : 'portfolio';
    return sourceType;
  }

  function typeName(type) {
    return type === 'portfolio' ? 'Portfólio' : 'Parecer';
  }

  window.openDuplicateReport = function openDuplicateReport(id) {
    const report = findReport(id);
    if (!report) return;
    const sourceType = normalizeDocumentType(report.documentType);
    const otherType = typeName(sourceType === 'portfolio' ? 'parecer' : 'portfolio');
    const student = data.students.find(item => String(item.id) === String(report.studentId));
    const studentName = esc(student?.name || report.name || 'a criança');
    wizardOpen(`
      <p class="wizard-step">DUPLICAR DOCUMENTO</p>
      <h2 class="modal-title">Reutilizar os textos</h2>
      <p class="modal-subtitle">Cria um novo rascunho a partir de ${typeName(sourceType)} de ${studentName}. O documento original não é alterado.</p>
      <div class="form-grid">
        <div class="field">
          <button class="primary" type="button" data-duplicate-mode="student" style="width:100%">Duplicar para outra criança (${typeName(sourceType)})</button>
          <small class="muted">Copia o texto principal, as vivências e as fotos. O nome da criança é trocado por [NOME] e preenchido ao finalizar.</small>
        </div>
        <div class="field">
          <button class="primary" type="button" data-duplicate-mode="type" style="width:100%">Duplicar como ${otherType} (mesma criança)</button>
          <small class="muted">Copia todo o conteúdo, inclusive fotos, para um ${otherType} de ${studentName}. Não é permitido se a criança já tiver um ${otherType} neste período.</small>
        </div>
      </div>
      <div class="form-actions">
        <button class="secondary" type="button" onclick="wizardClose()">Cancelar</button>
      </div>
    `);
    document.querySelectorAll('#modal [data-duplicate-mode]').forEach(button => {
      button.addEventListener('click', () => duplicateReport(id, button.dataset.duplicateMode, button));
    });
  };

  async function duplicateReport(id, mode, button) {
    const originalLabel = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Preparando cópia...';
    }
    try {
      const source = await ensureReportDetail(id);
      if (!source) throw new Error('Documento não encontrado.');
      const sourceStudent = data.students.find(item => String(item.id) === String(source.studentId));
      const forOtherChild = mode === 'student';
      const rawEntries = Array.isArray(source.entries) && source.entries.length
        ? source.entries
        : [{activityIds: source.activityIds || [], photoNote: source.photoNote || '', photos: source.photos || []}];
      const entries = JSON.parse(JSON.stringify(rawEntries))
        .map(normalizeWizardEntry)
        .map(entry => ({
          activityIds: entry.activityIds,
          photoNote: forOtherChild ? nameToTag(entry.photoNote, sourceStudent?.name) : entry.photoNote,
          photos: entry.photos
        }))
        .filter(hasWizardEntryContent);
      const targetType = targetTypeFor(source, mode);
      const configuredFinal = typeof configuredFinalText === 'function' ? configuredFinalText() : '';
      let finalText = source.finalText || '';
      if (forOtherChild) finalText = nameToTag(finalText, sourceStudent?.name);
      if (!finalTextHasContent(finalText) && targetType === 'portfolio') finalText = configuredFinal;
      // Outra crianca: mantem a escolha do original. Mesma crianca com outro tipo: so portfolio vem marcado.
      const useFinalText = forOtherChild ? !!source.useFinalText : (targetType === 'portfolio' && finalTextHasContent(finalText));

      wizardAvailabilityReports = null;
      wizard = {
        loadingAvailability: true,
        documentType: targetType,
        periodId: activeWizardPeriodId(),
        studentId: mode === 'type' ? source.studentId : '',
        text: forOtherChild ? nameToTag(source.text || '', sourceStudent?.name) : (source.text || ''),
        activityIds: [],
        photoNote: '',
        photos: [],
        entries,
        useFinalText,
        finalText,
        finalTextTouched: true
      };
      const current = wizard;

      if (mode === 'student') {
        wizardStart(false, wizard);
        await loadWizardAvailability();
        return;
      }

      await loadWizardAvailability();
      if (wizard !== current) return;
      if (wizardStudentUnavailable(current.studentId)) {
        wizardClose();
        alert(`${sourceStudent?.name || 'Esta criança'} já possui ${typeName(current.documentType)} neste período. Não é permitido ter dois documentos do mesmo tipo para a mesma criança no mesmo período.`);
        return;
      }
      persistWizard();
      wizardReviewV2();
    } catch (error) {
      console.error(error);
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
      alert(error.message || 'Não foi possível duplicar o documento.');
    }
  }

  function decorateReportList() {
    document.querySelectorAll('#reportsList .report-row').forEach(row => {
      const openButton = row.querySelector('button[onclick^="editReport"]');
      if (!openButton || row.querySelector('[data-duplicate-report]')) return;
      const match = openButton.getAttribute('onclick')?.match(/editReport\(([^)]+)\)/);
      const id = match?.[1]?.replace(/^["']|["']$/g, '');
      if (!id) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.dataset.duplicateReport = '1';
      button.textContent = 'Duplicar';
      button.addEventListener('click', () => openDuplicateReport(id));
      openButton.insertAdjacentElement('beforebegin', button);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    decorateReportList();
    const list = document.querySelector('#reportsList');
    if (list) new MutationObserver(decorateReportList).observe(list, {childList: true, subtree: true});
  });
})();
