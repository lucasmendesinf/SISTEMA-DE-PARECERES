function deleteDraft(reportId) {
  const report = data.reports.find(item => String(item.id) === String(reportId));
  if (!report || report.status === 'done') return;
  if (!window.confirm('Excluir este rascunho? Esta ação remove também as atividades e fotos vinculadas e não pode ser desfeita.')) return;

  const removeFromScreen = async () => {
    data.reports = data.reports.filter(item => String(item.id) !== String(reportId));
    if (String(wizard?.studentId) === String(report.studentId) && normalizeDocumentType?.(wizard?.documentType) === normalizeDocumentType?.(report.documentType)) clearWizard();
    save();
    await loadReports();
  };

  const databaseId = report.databaseId;
  if (!databaseId) {
    removeFromScreen();
    return;
  }

  fetch(`api.php?resource=reports&id=${encodeURIComponent(databaseId)}`, { method: 'DELETE' })
    .then(async response => {
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível excluir o rascunho.');
      await removeFromScreen();
    })
    .catch(error => alert(error.message));
}

function addDraftDeleteButtons() {
  document.querySelectorAll('#reportsList .report-row').forEach(row => {
    const status = row.querySelector('.status');
    const continueButton = row.querySelector('.actions button[onclick^="editReport"]');
    if (!status || status.textContent.trim() !== 'Rascunho' || !continueButton || row.querySelector('.delete-draft')) return;
    const match = continueButton.getAttribute('onclick').match(/editReport\(([^)]+)\)/);
    if (!match) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary delete-draft';
    button.textContent = 'Excluir rascunho';
    button.addEventListener('click', () => deleteDraft(match[1]));
    continueButton.parentElement.appendChild(button);
  });
}

new MutationObserver(addDraftDeleteButtons).observe(document.querySelector('#reportsList'), { childList: true, subtree: true });
addDraftDeleteButtons();
