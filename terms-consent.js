(() => {
  const api = 'api.php?resource=auth';

  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

  async function acceptTerms(version) {
    const response = await fetch(api, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: 'accept_terms', version})
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel registrar o aceite.');
    return data.user;
  }

  async function logout() {
    try {
      await fetch(api, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'logout'})
      });
    } finally {
      location.href = 'login.php';
    }
  }

  function termsText(user) {
    return `
      <h3>1. Finalidade do sistema</h3>
      <p>O Ai Prof. e uma ferramenta de apoio pedagogico para cadastro de escola, turmas, periodos, alunos, atividades, pareceres e portfolios. Os dados informados sao utilizados para organizar registros pedagogicos, gerar documentos, manter o historico do acesso e viabilizar recursos contratados.</p>

      <h3>2. Dados que podem ser tratados</h3>
      <ul>
        <li>Dados da conta: nome, e-mail, telefone, perfil de acesso, permissoes, senha protegida por criptografia e registros de aceite.</li>
        <li>Dados da escola: rede/secretaria, unidade escolar, endereco, contato, logo, diretora responsavel e e-mail para envio de pareceres.</li>
        <li>Dados pedagogicos: turmas, periodos, campos de experiencia, atividades, observacoes, pareceres, portfolios, rascunhos e historico de documentos.</li>
        <li>Dados de alunos: nome, data de nascimento, turma, foto e imagens vinculadas a atividades ou documentos.</li>
        <li>Dados financeiros: plano contratado, vencimento, status de pagamento e identificadores de pagamento quando houver integracao com Mercado Pago.</li>
      </ul>

      <h3>3. Responsabilidade da professora ou escola</h3>
      <p>Ao usar o sistema, voce declara que possui autorizacao e base legal adequada para inserir dados de alunos, imagens, fotos e informacoes escolares, especialmente por envolver criancas. As informacoes devem ser cadastradas somente para finalidade pedagogica, administrativa ou documental da escola.</p>

      <h3>4. Uso de recursos com IA</h3>
      <p>Quando voce aciona recursos de revisao de texto, edicao de imagem ou deteccao de rostos, o conteudo informado pode ser processado para executar a funcao solicitada. Sempre revise o resultado antes de salvar ou enviar documentos.</p>

      <h3>5. Compartilhamento e envio</h3>
      <p>O sistema pode enviar pareceres para o e-mail da diretora cadastrado, quando essa acao for solicitada pela professora. Dados de pagamento podem ser compartilhados com o provedor de pagamento contratado apenas para processar cobrancas.</p>

      <h3>6. Segurança e acesso individual</h3>
      <p>Cada login deve acessar somente seus proprios cadastros, historicos, pareceres e portfolios. A senha e pessoal e nao deve ser compartilhada. O sistema utiliza controles de acesso para evitar mistura de dados entre clientes.</p>

      <h3>7. Direitos previstos na LGPD</h3>
      <p>O titular dos dados pode solicitar informacoes sobre tratamento, acesso, correcao, atualizacao, exclusao ou revisao de dados, conforme aplicavel pela Lei Geral de Protecao de Dados Pessoais. Solicite suporte ao administrador do sistema quando precisar exercer esses direitos.</p>

      <h3>8. Retencao e exclusao</h3>
      <p>Os dados permanecem no sistema enquanto a conta estiver ativa ou enquanto forem necessarios para cumprimento de finalidade pedagogica, contratual, legal ou de seguranca. O administrador pode remover ou resetar dados quando solicitado e permitido.</p>

      <h3>9. Aceite</h3>
      <p>Ao aceitar este termo, voce confirma que leu, compreendeu e concorda com o uso do sistema conforme as finalidades descritas, comprometendo-se a cadastrar apenas informacoes que esteja autorizada a utilizar.</p>
      <p><strong>Usuario:</strong> ${escapeHtml(user?.name || 'Usuario logado')}<br><strong>Versao do termo:</strong> ${escapeHtml(user?.terms?.currentVersion || 'lgpd-2026-07-16')}</p>
    `;
  }

  function showTermsModal(user) {
    if (!user || user.terms?.accepted) return;
    document.querySelector('#termsConsentModal')?.remove();
    const version = user.terms?.currentVersion || 'lgpd-2026-07-16';
    const modal = document.createElement('div');
    modal.id = 'termsConsentModal';
    modal.className = 'terms-consent-backdrop';
    modal.innerHTML = `
      <section class="terms-consent-modal" role="dialog" aria-modal="true" aria-labelledby="termsConsentTitle">
        <div class="terms-consent-header">
          <p class="eyebrow">PRIMEIRO ACESSO</p>
          <h2 id="termsConsentTitle">Termos de uso e privacidade</h2>
          <p>Para continuar usando o Ai Prof., leia e aceite o termo baseado nas regras brasileiras de protecao de dados.</p>
        </div>
        <div class="terms-consent-body">${termsText(user)}</div>
        <div class="terms-consent-footer">
          <label class="terms-consent-check">
            <input id="termsConsentCheck" type="checkbox">
            <span>Li e aceito os termos de uso e privacidade do Ai Prof.</span>
          </label>
          <p id="termsConsentMessage" class="terms-consent-message"></p>
          <div class="terms-consent-actions">
            <button class="secondary" type="button" data-terms-logout>Sair do sistema</button>
            <button class="primary" type="button" data-terms-accept disabled>Aceitar e continuar</button>
          </div>
        </div>
      </section>`;
    document.body.append(modal);
    document.body.classList.add('terms-consent-lock');
    const checkbox = modal.querySelector('#termsConsentCheck');
    const acceptButton = modal.querySelector('[data-terms-accept]');
    const message = modal.querySelector('#termsConsentMessage');
    checkbox.addEventListener('change', () => {
      acceptButton.disabled = !checkbox.checked;
      message.textContent = '';
    });
    modal.querySelector('[data-terms-logout]')?.addEventListener('click', logout);
    acceptButton.addEventListener('click', async () => {
      if (!checkbox.checked) {
        message.textContent = 'Marque o aceite para continuar.';
        return;
      }
      acceptButton.disabled = true;
      acceptButton.textContent = 'Registrando aceite...';
      try {
        const updatedUser = await acceptTerms(version);
        window.PortalCurrentUser = updatedUser;
        window.dispatchEvent(new CustomEvent('portal:terms-accepted', {detail: updatedUser}));
        modal.remove();
        document.body.classList.remove('terms-consent-lock');
      } catch (error) {
        message.textContent = error.message || 'Nao foi possivel registrar o aceite.';
        acceptButton.disabled = false;
        acceptButton.textContent = 'Aceitar e continuar';
      }
    });
    checkbox.focus();
  }

  window.PortalTermsConsent = {show: showTermsModal};
  window.addEventListener('portal:user-ready', event => showTermsModal(event.detail));
})();
