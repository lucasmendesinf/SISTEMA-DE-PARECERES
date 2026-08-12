window.PortalCloseMainModal = function PortalCloseMainModal() {
  const modal = document.querySelector('#modal');
  if (!modal) return;
  if (modal.classList.contains('wizard')) window.flushWizardDraftAutosave?.();
  modal.classList.remove('wizard');
  try {
    if (modal.open) modal.close();
  } catch (error) {
    console.warn('Nao foi possivel fechar a modal pelo dialog.close().', error);
  }
  if (modal.open) modal.removeAttribute('open');
};

document.addEventListener('click', event => {
  const closeButton = event.target.closest('#modal .close');
  if (!closeButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  window.PortalCloseMainModal();
}, true);

document.addEventListener('click', event => {
  const dialog = event.target;
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
  if (dialog.classList.contains('onboarding-dialog')) return;
  if (dialog.classList.contains('wizard')) return;
  if (dialog.classList.contains('no-backdrop-close')) return;
  const bounds = dialog.getBoundingClientRect();
  const clickedBackdrop = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (clickedBackdrop) dialog.close();
}, true);

document.addEventListener('cancel', event => {
  const dialog = event.target;
  if (!(dialog instanceof HTMLDialogElement) || !dialog.classList.contains('wizard')) return;
  event.preventDefault();
}, true);
