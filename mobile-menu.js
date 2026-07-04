(() => {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelector('#menuButton');
  const close = document.querySelector('#closeMenu');
  const overlay = document.querySelector('#mobileMenuOverlay');
  const mobileQuery = window.matchMedia('(max-width: 800px)');

  function setMenu(open) {
    if (!sidebar) return;
    const shouldOpen = Boolean(open) && mobileQuery.matches;
    sidebar.classList.toggle('open', shouldOpen);
    document.body.classList.toggle('menu-open', shouldOpen);
    toggle?.setAttribute('aria-expanded', String(shouldOpen));
  }

  toggle?.setAttribute('aria-expanded', 'false');
  toggle && (toggle.onclick = event => {
    event.preventDefault();
    setMenu(!sidebar.classList.contains('open'));
  });
  close?.addEventListener('click', () => setMenu(false));
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => setMenu(false)));
  mobileQuery.addEventListener('change', event => { if (!event.matches) setMenu(false); });
})();
