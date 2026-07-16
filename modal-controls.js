document.addEventListener('click', event => {
  const closeButton = event.target.closest('#modal .close');
  if (!closeButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const modal = document.querySelector('#modal');
  if (modal?.classList.contains('wizard')) window.flushWizardDraftAutosave?.();
  if (modal?.open) modal.close();
  modal?.classList.remove('wizard');
}, true);

document.addEventListener('click', event => {
  const dialog = event.target;
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
  if (dialog.classList.contains('onboarding-dialog')) return;
  if (dialog.classList.contains('wizard')) return;
  const bounds = dialog.getBoundingClientRect();
  const clickedBackdrop = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (clickedBackdrop) dialog.close();
}, true);

document.addEventListener('cancel', event => {
  const dialog = event.target;
  if (!(dialog instanceof HTMLDialogElement) || !dialog.classList.contains('wizard')) return;
  event.preventDefault();
}, true);
