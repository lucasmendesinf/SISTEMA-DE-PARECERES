(() => {
  const noStudentMessage = 'Você não tem aluno cadastrado, cadastre pelo menos 1 para seguir.';

  function hasRegisteredStudent() {
    try {
      return Array.isArray(data?.students) && data.students.length > 0;
    } catch (error) {
      return Number(document.querySelector('#studentCount')?.textContent || 0) > 0;
    }
  }

  function warnNoStudents() {
    alert(noStudentMessage);
  }

  function canStartNewDocument() {
    if (hasRegisteredStudent()) return true;
    warnNoStudents();
    return false;
  }

  function openNewPedagogicalDocument() {
    if (!canStartNewDocument()) return;
    const reportsNav = document.querySelector('.nav-item[data-view="pareceres"]');
    reportsNav?.click();
    setTimeout(() => {
      if (typeof wizardStart === 'function') {
        wizardStart(true);
        return;
      }
      document.querySelector('#openGenerator')?.click();
    }, 40);
  }

  function guardWizardStart() {
    if (typeof wizardStart !== 'function' || wizardStart.__studentGuard === '1') return;
    const originalWizardStart = wizardStart;
    wizardStart = function guardedWizardStart(newRegistration = false, draft = null) {
      if (newRegistration && !canStartNewDocument()) return;
      return originalWizardStart.apply(this, arguments);
    };
    wizardStart.__studentGuard = '1';
  }

  function bindGenerateDocumentButtons() {
    guardWizardStart();
    document.querySelectorAll('[data-new-document], .welcome .primary[data-go="pareceres"], #openGenerator').forEach(button => {
      if (button.dataset.documentButtonReady === '1') return;
      button.dataset.documentButtonReady = '1';
      button.type = 'button';
      button.addEventListener('click', event => {
        if (button.id === 'openGenerator') {
          if (!canStartNewDocument()) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openNewPedagogicalDocument();
      }, true);
    });
  }

  document.addEventListener('DOMContentLoaded', bindGenerateDocumentButtons);
})();
