(() => {
  const state = {permission: 'none', user: null};
  const allowed = ['none', 'manual', 'ai', 'both'];

  async function init() {
    try {
      let user = window.PortalCurrentUser || null;
      if (!user && window.PortalCurrentUserPromise) user = await window.PortalCurrentUserPromise;
      if (!user) {
        const response = await fetch('api.php?resource=auth');
        user = await response.json();
        if (!response.ok) throw new Error(user.error || 'Falha ao carregar permissoes.');
      }
      state.user = user;
      state.permission = allowed.includes(user.imageEditorPermission) ? user.imageEditorPermission : 'none';
    } catch (error) {
      console.warn(error);
      state.permission = 'none';
    }
  }

  function canUse(mode) {
    if (mode === 'none') return true;
    if (mode === 'manual') return ['manual', 'ai', 'both'].includes(state.permission);
    return state.permission === 'both' || state.permission === mode;
  }

  function availableModes() {
    if (['manual', 'ai', 'both'].includes(state.permission)) return ['manual'];
    return [];
  }

  window.PortalImageEditorPermissions = {init, canUse, availableModes, state};
  document.addEventListener('DOMContentLoaded', init);
})();
