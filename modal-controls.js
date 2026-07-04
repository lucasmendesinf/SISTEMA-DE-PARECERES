document.addEventListener('click', event => {
  const closeButton = event.target.closest('#modal .close');
  if (!closeButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const modal = document.querySelector('#modal');
  if (modal?.open) modal.close();
}, true);

document.addEventListener('click', event => {
  const dialog = event.target;
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
  const bounds = dialog.getBoundingClientRect();
  const clickedBackdrop = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (clickedBackdrop) dialog.close();
}, true);
