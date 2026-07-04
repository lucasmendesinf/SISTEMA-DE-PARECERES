(() => {
  const api = 'api.php?resource=mercado-pago-settings';

  async function request(options = {}) {
    const response = await fetch(api, options);
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (response.status === 401) {
      location.href = 'login.php';
      throw new Error('Sessao expirada.');
    }
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel salvar as credenciais.');
    return data;
  }

  function setStatus(message) {
    const status = document.querySelector('#mpSettingsStatus');
    if (status) status.textContent = message;
  }

  async function loadSettings() {
    if (!document.querySelector('#mpAccessToken')) return;
    if (window.PortalCurrentUser?.role !== 'master') return;
    try {
      const data = await request();
      document.querySelector('#mpPublicKey').value = data.publicKey || '';
      document.querySelector('#mpSuccessUrl').value = data.successUrl || 'http://localhost/Pareceres/login.php?payment=success';
      document.querySelector('#mpFailureUrl').value = data.failureUrl || 'http://localhost/Pareceres/login.php?payment=failure';
      document.querySelector('#mpAccessToken').placeholder = data.accessTokenMasked || 'Cole o Access Token';
      document.querySelector('#mpWebhookSecret').placeholder = data.webhookSecretMasked || 'Opcional';
      const localHost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
      if (data.configured && data.accessTokenType === 'production' && localHost) {
        setStatus('Mercado Pago configurado com credenciais de producao. Para testar Pix no localhost, use credenciais TEST- do Mercado Pago.');
      } else {
        setStatus(data.configured ? 'Mercado Pago configurado.' : 'Informe Access Token e Public Key para ativar os pagamentos.');
      }
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function saveSettings() {
    if (window.PortalCurrentUser?.role !== 'master') return;
    const button = document.querySelector('#saveMercadoPagoSettings');
    button.disabled = true;
    setStatus('');
    try {
      await request({
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          accessToken: document.querySelector('#mpAccessToken').value.trim(),
          publicKey: document.querySelector('#mpPublicKey').value.trim(),
          webhookSecret: document.querySelector('#mpWebhookSecret').value.trim(),
          successUrl: document.querySelector('#mpSuccessUrl').value.trim(),
          failureUrl: document.querySelector('#mpFailureUrl').value.trim()
        })
      });
      document.querySelector('#mpAccessToken').value = '';
      document.querySelector('#mpWebhookSecret').value = '';
      await loadSettings();
      setStatus('Credenciais do Mercado Pago salvas com sucesso.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      button.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#saveMercadoPagoSettings')?.addEventListener('click', saveSettings);
    if (window.PortalCurrentUser?.role === 'master') loadSettings();
    window.addEventListener('portal:user-ready', event => {
      if (event.detail?.role === 'master') loadSettings();
    });
  });
})();
