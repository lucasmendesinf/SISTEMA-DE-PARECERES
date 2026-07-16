(() => {
  const PWA_VERSION = '20260716-reset-terms-2';
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`sw.js?v=${PWA_VERSION}`).then(registration => {
      registration.update?.();
    }).catch(error => {
      console.warn('Nao foi possivel ativar o PWA.', error);
    });
  });
})();
