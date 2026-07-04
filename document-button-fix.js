(() => {
  function openNewPedagogicalDocument() {
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

  function bindGenerateDocumentButtons() {
    document.querySelectorAll('[data-new-document], .welcome .primary[data-go="pareceres"]').forEach(button => {
      if (button.dataset.documentButtonReady === '1') return;
      button.dataset.documentButtonReady = '1';
      button.type = 'button';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openNewPedagogicalDocument();
      }, true);
    });
  }

  document.addEventListener('DOMContentLoaded', bindGenerateDocumentButtons);
})();
