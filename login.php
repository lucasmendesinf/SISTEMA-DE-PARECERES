<?php
session_start();
$hasPaymentReturn = isset($_GET['payment']) || isset($_GET['payment_id']) || isset($_GET['collection_id']) || isset($_GET['preapproval_id']);
if (!empty($_SESSION['user_id']) && !$hasPaymentReturn) {
  header('Location: index.php');
  exit;
}
$publishedPwaVersion = '20260826-pwa-chrome-native-1';
$publishedPwaAt = '';
try {
  $config = require __DIR__ . '/config.php';
  $pdo = new PDO(
    "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4",
    $config['username'],
    $config['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
  );
  $query = $pdo->prepare("SELECT setting_value,updated_at FROM app_settings WHERE setting_key='pwa_release' LIMIT 1");
  $query->execute();
  $row = $query->fetch(PDO::FETCH_ASSOC) ?: [];
  $payload = json_decode((string)($row['setting_value'] ?? '{}'), true);
  if (is_array($payload) && !empty($payload['version'])) {
    $publishedPwaVersion = 'v' . max(1, (int)$payload['version']);
    $publishedPwaAt = trim((string)($payload['publishedAt'] ?? '')) ?: (string)($row['updated_at'] ?? '');
  }
} catch (Throwable $ignored) {
  // A tela de login nao deve falhar caso o banco esteja temporariamente indisponivel.
}
$formatPwaDate = static function (string $value): string {
  if ($value === '') return '';
  try {
    return (new DateTimeImmutable($value))->format('d/m/Y H:i');
  } catch (Throwable $ignored) {
    return $value;
  }
};
$escape = static fn($value): string => htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
?><!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Entrar | Ai Prof.</title>
  <meta name="theme-color" content="#196b52">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Ai Prof.">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="manifest" href="manifest.json?v=20260826-pwa-chrome-native-1">
  <link rel="apple-touch-icon" href="assets/pwa/icon-192.png">
  <link rel="stylesheet" href="login.css?v=20260826-pwa-chrome-native-1">
  <link rel="stylesheet" href="login-version.css?v=20260812-pwa-version-1">
  <link rel="stylesheet" href="pwa-install.css?v=20260826-pwa-chrome-native-1">
</head>
<body>
  <main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <div class="login-brand"><img src="assets/ai-prof-logo-transparent.png" alt="Ai Prof."></div>
      <p class="eyebrow">PORTAL DA PROFESSORA</p>
      <h1 id="login-title">Seu espaco para registrar cada descoberta.</h1>
      <p class="intro">Entre para criar pareceres e portfolios pedagogicos com cuidado e organizacao.</p>
      <form id="loginForm" novalidate>
        <label>E-mail<input id="email" type="email" autocomplete="email" placeholder="seuemail@escola.edu.br" required></label>
        <label>Senha<input id="password" type="password" autocomplete="current-password" placeholder="Sua senha" required></label>
        <p id="loginMessage" class="login-message" role="alert"></p>
        <button class="login-submit" type="submit">Entrar no Ai Prof.</button>
        <button id="forgotPasswordOpen" class="login-forgot-link" type="button">Esqueci minha senha</button>
        <button id="signupOpen" class="login-signup-link" type="button">Criar conta gratis</button>
      </form>
      <section id="passwordResetBox" class="password-reset-box" aria-labelledby="passwordResetTitle" hidden>
        <h2 id="passwordResetTitle">Redefinir senha</h2>
        <p id="passwordResetIntro">Informe seu e-mail cadastrado para receber o codigo de confirmacao.</p>
        <label>E-mail<input id="resetEmail" type="email" autocomplete="email" placeholder="seuemail@escola.edu.br"></label>
        <div id="passwordResetRequestStep" class="password-reset-actions">
          <button id="passwordResetRequest" class="billing-button" type="button">Enviar codigo</button>
          <button id="passwordResetCancel" class="billing-button" type="button">Voltar</button>
        </div>
        <form id="passwordResetConfirmForm" class="password-reset-confirm" hidden novalidate>
          <label>Codigo recebido<input id="resetCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="000000"></label>
          <label>Nova senha<input id="resetNewPassword" type="password" autocomplete="new-password" placeholder="Minimo de 6 caracteres"></label>
          <label>Confirmar nova senha<input id="resetConfirmPassword" type="password" autocomplete="new-password" placeholder="Repita a nova senha"></label>
          <div class="password-reset-actions">
            <button class="login-submit" type="submit">Alterar senha</button>
            <button id="passwordResetBack" class="billing-button" type="button">Voltar</button>
          </div>
        </form>
        <p id="passwordResetMessage" class="login-message" role="alert"></p>
      </section>
      <section id="signupBox" class="signup-box" aria-labelledby="signupTitle" hidden>
        <h2 id="signupTitle">Criar conta gratis</h2>
        <p>Comece com 7 dias de teste gratuito. Depois, escolha o plano e periodo de pagamento.</p>
        <form id="signupForm" class="signup-form" novalidate>
          <label>Nome completo<input id="signupName" type="text" autocomplete="name" placeholder="Seu nome"></label>
          <label>E-mail<input id="signupEmail" type="email" autocomplete="email" placeholder="seuemail@escola.edu.br"></label>
          <label>Telefone<input id="signupPhone" type="tel" autocomplete="tel" placeholder="Ex: (41) 99631-0725"></label>
          <label>Senha<input id="signupPassword" type="password" autocomplete="new-password" placeholder="Minimo de 6 caracteres"></label>
          <label>Confirmar senha<input id="signupConfirmPassword" type="password" autocomplete="new-password" placeholder="Repita a senha"></label>
          <label class="signup-check"><input id="signupTerms" type="checkbox"> <span>Li e aceito os termos de uso e responsabilidade.</span></label>
          <div class="password-reset-actions">
            <button class="login-submit" type="submit">Criar conta e iniciar teste</button>
            <button id="signupCancel" class="billing-button" type="button">Voltar</button>
          </div>
        </form>
        <p id="signupMessage" class="login-message" role="alert"></p>
      </section>
      <div id="billingLogin" class="billing-login" hidden>
        <strong>Pagamento do plano</strong>
        <p id="billingLoginSummary"></p>
        <div id="billingLoginActions" class="billing-login-actions"></div>
        <p id="billingLoginMessage" class="login-message" role="alert"></p>
      </div>
      <p class="login-foot">
        Um ambiente pensado para professoras e professores da Educacao Infantil.
        <span class="login-version">Publicacao <?= $escape($publishedPwaVersion) ?><?= $publishedPwaAt !== '' ? ' - ' . $escape($formatPwaDate($publishedPwaAt)) : '' ?></span>
      </p>
    </section>
  </main>
  <script>
    const form = document.querySelector('#loginForm');
    const message = document.querySelector('#loginMessage');
    const billingBox = document.querySelector('#billingLogin');
    const billingSummary = document.querySelector('#billingLoginSummary');
    const billingActions = document.querySelector('#billingLoginActions');
    const billingMessage = document.querySelector('#billingLoginMessage');
    const forgotPasswordOpen = document.querySelector('#forgotPasswordOpen');
    const passwordResetBox = document.querySelector('#passwordResetBox');
    const passwordResetRequestStep = document.querySelector('#passwordResetRequestStep');
    const passwordResetRequest = document.querySelector('#passwordResetRequest');
    const passwordResetCancel = document.querySelector('#passwordResetCancel');
    const passwordResetBack = document.querySelector('#passwordResetBack');
    const passwordResetConfirmForm = document.querySelector('#passwordResetConfirmForm');
    const passwordResetMessage = document.querySelector('#passwordResetMessage');
    const resetEmail = document.querySelector('#resetEmail');
    const resetCode = document.querySelector('#resetCode');
    const resetNewPassword = document.querySelector('#resetNewPassword');
    const resetConfirmPassword = document.querySelector('#resetConfirmPassword');
    const signupOpen = document.querySelector('#signupOpen');
    const signupBox = document.querySelector('#signupBox');
    const signupForm = document.querySelector('#signupForm');
    const signupCancel = document.querySelector('#signupCancel');
    const signupMessage = document.querySelector('#signupMessage');
    const signupName = document.querySelector('#signupName');
    const signupEmail = document.querySelector('#signupEmail');
    const signupPhone = document.querySelector('#signupPhone');
    const signupPassword = document.querySelector('#signupPassword');
    const signupConfirmPassword = document.querySelector('#signupConfirmPassword');
    const signupTerms = document.querySelector('#signupTerms');
    let publicBillingCyclesPromise = null;
    const cycleLabels = {monthly: 'mensal', annual: 'anual'};
    const money = value => Number(value || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
    function hideAccessPanels() {
      passwordResetBox.hidden = true;
      signupBox.hidden = true;
      billingBox.hidden = true;
      message.textContent = '';
      billingMessage.textContent = '';
      passwordResetMessage.textContent = '';
      signupMessage.textContent = '';
    }

    async function readJson(response) {
      const text = await response.text();
      if (!text.trim()) throw new Error('O servidor nao retornou resposta. Verifique a configuracao do banco em producao.');
      try {
        return JSON.parse(text);
      } catch (_) {
        throw new Error('O servidor retornou uma resposta invalida. Verifique os logs PHP da hospedagem.');
      }
    }

    function openPasswordReset() {
      hideAccessPanels();
      resetEmail.value = document.querySelector('#email').value.trim();
      passwordResetRequestStep.hidden = false;
      passwordResetConfirmForm.hidden = true;
      passwordResetBox.hidden = false;
      resetEmail.focus();
    }

    function closePasswordReset() {
      passwordResetBox.hidden = true;
      passwordResetMessage.textContent = '';
      passwordResetRequest.disabled = false;
      passwordResetConfirmForm.querySelector('button[type="submit"]').disabled = false;
      document.querySelector('#email').focus();
    }

    async function requestPasswordReset() {
      passwordResetMessage.textContent = '';
      passwordResetRequest.disabled = true;
      passwordResetRequest.textContent = 'Enviando...';
      try {
        const response = await fetch('api.php?resource=auth', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({action: 'request_password_reset', email: resetEmail.value})
        });
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'Nao foi possivel solicitar a redefinicao.');
        passwordResetMessage.textContent = data.message || 'Confira seu e-mail para continuar.';
        passwordResetRequestStep.hidden = true;
        passwordResetConfirmForm.hidden = false;
        resetCode.focus();
      } catch (error) {
        passwordResetMessage.textContent = error.message || 'Nao foi possivel solicitar a redefinicao.';
      } finally {
        passwordResetRequest.disabled = false;
        passwordResetRequest.textContent = 'Enviar codigo';
      }
    }

    async function confirmPasswordReset(event) {
      event.preventDefault();
      passwordResetMessage.textContent = '';
      const button = passwordResetConfirmForm.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Alterando...';
      try {
        const response = await fetch('api.php?resource=auth', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            action: 'confirm_password_reset',
            email: resetEmail.value,
            code: resetCode.value,
            newPassword: resetNewPassword.value,
            confirmPassword: resetConfirmPassword.value
          })
        });
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'Nao foi possivel alterar a senha.');
        document.querySelector('#email').value = resetEmail.value;
        document.querySelector('#password').value = '';
        resetCode.value = '';
        resetNewPassword.value = '';
        resetConfirmPassword.value = '';
        passwordResetMessage.textContent = data.message || 'Senha redefinida com sucesso.';
        setTimeout(() => {
          closePasswordReset();
          document.querySelector('#password').focus();
        }, 1200);
      } catch (error) {
        passwordResetMessage.textContent = error.message || 'Nao foi possivel alterar a senha.';
      } finally {
        button.disabled = false;
        button.textContent = 'Alterar senha';
      }
    }

    function openSignup() {
      hideAccessPanels();
      signupEmail.value = document.querySelector('#email').value.trim();
      signupPassword.value = '';
      signupConfirmPassword.value = '';
      signupTerms.checked = false;
      signupBox.hidden = false;
      signupName.focus();
    }

    function closeSignup() {
      signupBox.hidden = true;
      signupMessage.textContent = '';
      document.querySelector('#email').focus();
    }

    async function submitSignup(event) {
      event.preventDefault();
      signupMessage.textContent = '';
      const button = signupForm.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Criando conta...';
      try {
        const response = await fetch('api.php?resource=auth', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            action: 'register_trial',
            name: signupName.value,
            email: signupEmail.value,
            phone: signupPhone.value,
            password: signupPassword.value,
            confirmPassword: signupConfirmPassword.value,
            termsAccepted: signupTerms.checked
          })
        });
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'Nao foi possivel criar sua conta.');
        signupMessage.textContent = data.message || 'Conta criada com sucesso.';
        location.href = 'index.php';
      } catch (error) {
        signupMessage.textContent = error.message || 'Nao foi possivel criar sua conta.';
      } finally {
        button.disabled = false;
        button.textContent = 'Criar conta e iniciar teste';
      }
    }

    async function loadPublicBillingCycles() {
      if (!publicBillingCyclesPromise) {
        publicBillingCyclesPromise = fetch('api.php?resource=billing-public-plans')
          .then(readJson)
          .then(data => Array.isArray(data.cycles) ? data.cycles : [])
          .catch(() => []);
      }
      return publicBillingCyclesPromise;
    }

    async function fillBillingCycles(selectedCycleId) {
      const select = document.querySelector('#billingCycleSelect');
      if (!select) return;
      const cycles = await loadPublicBillingCycles();
      select.innerHTML = '';
      cycles.forEach(cycle => {
        const option = document.createElement('option');
        option.value = cycle.id || '';
        option.textContent = `${cycle.name || 'Periodo'} - ${money(cycle.amount || 0)}`;
        if (Number(cycle.id) === Number(selectedCycleId)) option.selected = true;
        select.append(option);
      });
    }

    async function confirmPaymentReturn() {
      const params = new URLSearchParams(location.search);
      if (!params.has('payment') && !params.has('payment_id') && !params.has('collection_id') && !params.has('preapproval_id')) return;
      billingBox.hidden = false;
      billingSummary.textContent = 'Confirmando retorno do Mercado Pago...';
      billingActions.innerHTML = '';
      try {
        const response = await fetch(`api.php?resource=billing-return&${params.toString()}`);
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'Nao foi possivel confirmar o pagamento.');
        billingMessage.textContent = data.message || 'Pagamento confirmado. Acesse com seu login.';
      } catch (error) {
        billingMessage.textContent = error.message || 'Nao foi possivel confirmar o pagamento.';
      }
    }

    function showBilling(data) {
      const billing = data.billing || {};
      billingBox.hidden = false;
      billingSummary.textContent = `${billing.plan || 'Plano'} ${billing.cycleLabel || cycleLabels[billing.cycle] || 'mensal'} - ${money(billing.amount)}`;
      billingActions.innerHTML = '';
      const planChoice = document.createElement('div');
      planChoice.className = 'billing-plan-choice';
      planChoice.innerHTML = `
        <label>Plano desejado<input id="billingPlanName" type="text" value="${escapeHtml(billing.plan || 'Basico')}" maxlength="80"></label>
        <label>Periodo<select id="billingCycleSelect"></select></label>
      `;
      billingActions.append(planChoice);
      fillBillingCycles(billing.cycleId);
      (data.paymentMethods || []).forEach(method => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'billing-button';
        button.textContent = method === 'pix' ? 'Pagar com Pix' : 'Cadastrar cartao';
        button.addEventListener('click', () => payPendingPlan(method));
        billingActions.append(button);
      });
    }

    async function payPendingPlan(method) {
      billingMessage.textContent = '';
      const buttons = billingActions.querySelectorAll('button');
      buttons.forEach(button => { button.disabled = true; });
      try {
        const response = await fetch('api.php?resource=billing-public', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({email: document.querySelector('#email').value, method, plan: document.querySelector('#billingPlanName')?.value || '', cycleId: Number(document.querySelector('#billingCycleSelect')?.value || 0)})
        });
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'Nao foi possivel iniciar o pagamento.');
        renderPaymentResult(data);
      } catch (error) {
        billingMessage.textContent = error.message || 'Nao foi possivel iniciar o pagamento.';
      } finally {
        buttons.forEach(button => { button.disabled = false; });
      }
    }

    function renderPaymentResult(data) {
      if (data.method === 'pix') {
        const content = `
          ${data.qrCodeBase64 ? `<img class="billing-qr" src="data:image/png;base64,${data.qrCodeBase64}" alt="QR Code Pix">` : ''}
          <span>${escapeHtml(data.message || 'Pix gerado. Escaneie o QR Code ou copie o codigo abaixo.')}</span>
          ${data.qrCode ? `<textarea class="billing-copy" readonly>${escapeHtml(data.qrCode)}</textarea>` : ''}
          ${data.qrCode ? '<button class="billing-button billing-copy-button" type="button">Copiar codigo Pix</button>' : ''}
          ${data.paymentId ? `<button class="billing-button billing-confirm-button" type="button" data-confirm-payment="${escapeHtml(data.paymentId)}">Ja paguei, confirmar</button>` : ''}
        `;
        billingMessage.textContent = 'Pix gerado. O QR Code esta aberto na tela para pagamento.';
        openBillingModal('Pagar com Pix', content);
        return;
      }
      const url = data.initPoint || data.sandboxInitPoint || '';
      const content = url
        ? `<p>${escapeHtml(data.message || 'Link gerado.')}</p><a class="billing-button billing-checkout-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir cadastro do cartao</a>`
        : escapeHtml(data.message || 'Pagamento iniciado.');
      billingMessage.textContent = url ? 'Link de cadastro do cartao gerado.' : content;
      openBillingModal('Cadastrar cartao', content);
    }

    function openBillingModal(title, content) {
      let modal = document.querySelector('#billingModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'billingModal';
        modal.className = 'billing-modal-backdrop';
        modal.innerHTML = `
          <div class="billing-modal" role="dialog" aria-modal="true" aria-labelledby="billingModalTitle">
            <button class="billing-modal-close" type="button" aria-label="Fechar">x</button>
            <h2 id="billingModalTitle"></h2>
            <div id="billingModalContent" class="billing-modal-content"></div>
          </div>`;
        document.body.append(modal);
        modal.addEventListener('click', event => {
          if (event.target === modal || event.target.closest('.billing-modal-close')) closeBillingModal();
        });
        modal.addEventListener('click', async event => {
          const copyButton = event.target.closest('.billing-copy-button');
          if (!copyButton) return;
          const copyText = modal.querySelector('.billing-copy')?.value || '';
          if (!copyText) return;
          try {
            await navigator.clipboard.writeText(copyText);
            copyButton.textContent = 'Codigo copiado';
          } catch (_) {
            modal.querySelector('.billing-copy')?.select();
            copyButton.textContent = 'Selecione e copie o codigo';
          }
        });
        modal.addEventListener('click', async event => {
          const confirmButton = event.target.closest('[data-confirm-payment]');
          if (!confirmButton) return;
          await confirmPayment(confirmButton.dataset.confirmPayment, confirmButton);
        });
      }
      modal.querySelector('#billingModalTitle').textContent = title;
      modal.querySelector('#billingModalContent').innerHTML = content;
      modal.hidden = false;
      document.body.classList.add('billing-modal-open');
      modal.querySelector('.billing-modal-close')?.focus();
    }

    function closeBillingModal() {
      const modal = document.querySelector('#billingModal');
      if (!modal) return;
      modal.hidden = true;
      document.body.classList.remove('billing-modal-open');
    }

    async function confirmPayment(paymentId, button) {
      if (!paymentId) return;
      const previousText = button.textContent;
      button.disabled = true;
      button.textContent = 'Confirmando...';
      billingMessage.textContent = '';
      try {
        const response = await fetch(`api.php?resource=billing-return&payment_id=${encodeURIComponent(paymentId)}`);
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'Pagamento ainda nao confirmado.');
        billingMessage.textContent = data.message || 'Pagamento confirmado. Entre com seu login.';
        button.textContent = 'Pagamento confirmado';
        setTimeout(closeBillingModal, 900);
      } catch (error) {
        button.textContent = previousText;
        billingMessage.textContent = error.message || 'Pagamento ainda nao confirmado.';
      } finally {
        button.disabled = false;
      }
    }

    forgotPasswordOpen.addEventListener('click', openPasswordReset);
    signupOpen.addEventListener('click', openSignup);
    if (new URLSearchParams(window.location.search).get('signup') === '1') {
      openSignup();
    }
    signupCancel.addEventListener('click', closeSignup);
    signupForm.addEventListener('submit', submitSignup);
    passwordResetCancel.addEventListener('click', closePasswordReset);
    passwordResetRequest.addEventListener('click', requestPasswordReset);
    passwordResetConfirmForm.addEventListener('submit', confirmPasswordReset);
    passwordResetBack.addEventListener('click', () => {
      passwordResetMessage.textContent = '';
      passwordResetConfirmForm.hidden = true;
      passwordResetRequestStep.hidden = false;
      resetCode.value = '';
      resetNewPassword.value = '';
      resetConfirmPassword.value = '';
      resetEmail.focus();
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      message.textContent = '';
      billingBox.hidden = true;
      billingMessage.textContent = '';
      const button = form.querySelector('button');
      button.disabled = true;
      button.textContent = 'Entrando...';
      try {
        const response = await fetch('api.php?resource=auth', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({action: 'login', email: document.querySelector('#email').value, password: document.querySelector('#password').value})
        });
        const data = await readJson(response);
        if (response.status === 402 && data.billingRequired) {
          showBilling(data);
          throw new Error(data.error || 'Pagamento do plano pendente.');
        }
        if (!response.ok) throw new Error(data.error || 'Nao foi possivel entrar.');
        location.href = 'index.php';
      } catch (error) {
        message.textContent = error.message || 'Nao foi possivel entrar.';
        button.disabled = false;
        button.textContent = 'Entrar no Ai Prof.';
      }
    });

    confirmPaymentReturn();
  </script>
  <script src="pwa-install.js?v=20260826-pwa-chrome-native-1"></script>
  <script src="pwa.js?v=20260826-pwa-chrome-native-1"></script>
</body>
</html>
