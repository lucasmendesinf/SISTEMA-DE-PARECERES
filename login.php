<?php
session_start();
$hasPaymentReturn = isset($_GET['payment']) || isset($_GET['payment_id']) || isset($_GET['collection_id']) || isset($_GET['preapproval_id']);
if (!empty($_SESSION['user_id']) && !$hasPaymentReturn) {
  header('Location: index.php');
  exit;
}
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
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="assets/pwa/icon-192.png">
  <link rel="stylesheet" href="login.css?v=20260702-billing-modal-1">
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
      </form>
      <div id="billingLogin" class="billing-login" hidden>
        <strong>Pagamento do plano</strong>
        <p id="billingLoginSummary"></p>
        <div id="billingLoginActions" class="billing-login-actions"></div>
        <p id="billingLoginMessage" class="login-message" role="alert"></p>
      </div>
      <p class="login-foot">Um ambiente pensado para professoras e professores da Educacao Infantil.</p>
    </section>
  </main>
  <script>
    const form = document.querySelector('#loginForm');
    const message = document.querySelector('#loginMessage');
    const billingBox = document.querySelector('#billingLogin');
    const billingSummary = document.querySelector('#billingLoginSummary');
    const billingActions = document.querySelector('#billingLoginActions');
    const billingMessage = document.querySelector('#billingLoginMessage');
    const cycleLabels = {monthly: 'mensal', annual: 'anual'};
    const money = value => Number(value || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
    async function readJson(response) {
      const text = await response.text();
      if (!text.trim()) throw new Error('O servidor nao retornou resposta. Verifique a configuracao do banco em producao.');
      try {
        return JSON.parse(text);
      } catch (_) {
        throw new Error('O servidor retornou uma resposta invalida. Verifique os logs PHP da hospedagem.');
      }
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
          body: JSON.stringify({email: document.querySelector('#email').value, method})
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
  <script src="pwa.js?v=20260705-pwa-1"></script>
</body>
</html>
