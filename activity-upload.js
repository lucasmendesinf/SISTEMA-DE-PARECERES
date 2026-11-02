// =============================================================================
// activity-upload.js - Salvamento de atividades com envio das fotos em lotes
// =============================================================================
// Por que existe:
//   Antes, todas as fotos da atividade iam numa unica requisicao. Com 50 fotos
//   isso passa de 8 MB, o que pode ser recusado pelo servidor (post_max_size,
//   LiteSpeed/ModSecurity) ou cair em internet lenta de celular.
//
// Como funciona:
//   1. A atividade e salva (criada ou atualizada) junto com as 5 primeiras fotos.
//   2. As demais fotos vao de 5 em 5 com action=appendPhotos (cada envio < 1 MB).
//   3. Cada lote informa o "offset" (posicao da primeira foto do lote). Assim o
//      servidor sabe se aquele lote ja foi gravado e uma nova tentativa nunca
//      duplica fotos.
//   4. Lotes que falham por conexao ou erro temporario sao reenviados ate 3 vezes.
//   5. Se mesmo assim falhar, o erro devolve o id da atividade (activityId) para
//      que o proximo "salvar" atualize a mesma atividade em vez de criar outra.
//
// Usado por: addActivitySaveV2 (app.js) e saveActivityEdit (activities-edit.js).
// =============================================================================
(function () {
  // Quantidade de fotos por requisicao (~160 KB cada => ~0,8 MB por lote).
  const BATCH_SIZE = 5;
  // Tentativas por requisicao antes de desistir (1 envio + 2 reenvios).
  const MAX_ATTEMPTS = 3;

  // Pausa entre tentativas (cresce a cada tentativa: 1,5 s, 3 s...).
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Monta a mensagem de erro mostrada a professora, sempre com o codigo HTTP,
  // para que o suporte consiga identificar o motivo real da falha.
  function messageFor(status, result) {
    if (result && result.error) return `${result.error} (erro ${status})`;
    if (status === 413) return 'O envio ficou grande demais para o servidor (erro 413).';
    if (status === 401 || status === 403) return `Sua sessao expirou ou nao tem permissao. Entre novamente no sistema (erro ${status}).`;
    if (status === 408 || status === 504) return `O servidor demorou demais para responder (erro ${status}).`;
    return `O servidor recusou o envio (erro ${status}).`;
  }

  // Envia um POST para api.php?resource=activities e devolve o JSON da resposta.
  // retryable: so reenvia quando repetir a requisicao nao duplica dados
  //   (lotes de fotos e edicoes; a criacao de atividade nova NAO e reenviada,
  //   para nao correr o risco de criar duas atividades iguais).
  async function postJson(body, retryable) {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response;
      try {
        response = await fetch('api.php?resource=activities', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          // silent: o aviso de "Salvando..." e controlado aqui, com o progresso.
          body: JSON.stringify({...body, silent: true})
        });
      } catch (networkError) {
        // fetch so lanca erro quando nao chegou resposta (sem internet, queda de conexao).
        lastError = new Error('Sem conexao com o servidor. Verifique a internet e tente novamente.');
        if (retryable && attempt < MAX_ATTEMPTS) { await wait(1500 * attempt); continue; }
        throw lastError;
      }
      // Le como texto primeiro: se o servidor devolver HTML (ex.: pagina de erro
      // 413 do Apache) o JSON.parse falharia e perderiamos o codigo do erro.
      const text = await response.text().catch(() => '');
      let result = {};
      try { result = text ? JSON.parse(text) : {}; } catch (parseError) { result = {}; }
      if (response.ok) return result;
      lastError = new Error(messageFor(response.status, result));
      lastError.status = response.status;
      // Erros temporarios (servidor ocupado, tempo esgotado) valem nova tentativa;
      // erros de validacao (4xx) nao, pois repetir daria o mesmo resultado.
      const temporary = response.status >= 500 || response.status === 408 || response.status === 429;
      if (retryable && temporary && attempt < MAX_ATTEMPTS) { await wait(1500 * attempt); continue; }
      throw lastError;
    }
    throw lastError;
  }

  // Funcao publica: salva a atividade e todas as fotos.
  // payload: {id?, title, area, note, photos, classId, periodId, imageEditorMode}
  //   - id presente => edita a atividade existente (as fotos sao substituidas).
  // onProgress(enviadas, total): chamado a cada lote, para atualizar a tela.
  // Mostra o aviso "Enviando fotos: X de Y..." no carregamento global
  // (save-feedback.js) e um unico "Atividade salva com sucesso" no final.
  async function saveActivity(payload, onProgress) {
    const feedback = window.PortalSaveFeedback;
    const setText = text => { const el = document.querySelector('#saveFeedbackText'); if (el) el.textContent = text; };
    const report = (sent, total) => {
      if (total) setText(`Enviando fotos: ${sent} de ${total}...`);
      onProgress?.(sent, total);
    };
    feedback?.showLoading('Salvando...');
    try {
      const result = await uploadInBatches(payload, report);
      feedback?.notify('Atividade salva com sucesso.');
      return result;
    } finally {
      feedback?.hideLoading();
    }
  }

  // Faz o envio propriamente dito: primeiro lote junto com os dados da
  // atividade, depois os lotes restantes com action=appendPhotos.
  async function uploadInBatches(payload, onProgress) {
    const photos = (payload.photos || []).filter(photo => String(photo).startsWith('data:image/'));
    const total = photos.length;
    const first = photos.slice(0, BATCH_SIZE);
    onProgress?.(0, total);
    // 1) Salva a atividade com as primeiras fotos. Em edicao (com id) o servidor
    //    apaga as fotos antigas aqui e as novas chegam nos lotes seguintes.
    let result;
    try {
      result = await postJson({...payload, photos: first}, Boolean(payload.id));
    } catch (error) {
      error.message = `Nao foi possivel salvar a atividade. ${error.message}`;
      throw error;
    }
    const activityId = result.id || result.activity?.id;
    onProgress?.(first.length, total);
    if (total > BATCH_SIZE && !activityId) throw new Error('Nao foi possivel salvar as fotos: o servidor nao retornou a atividade.');

    // 2) Envia o restante das fotos de 5 em 5.
    for (let offset = BATCH_SIZE; offset < total; offset += BATCH_SIZE) {
      const chunk = photos.slice(offset, offset + BATCH_SIZE);
      try {
        await postJson({action: 'appendPhotos', id: activityId, offset, photos: chunk}, true);
      } catch (error) {
        const partial = new Error(`A atividade foi salva, mas so ${offset} de ${total} fotos foram enviadas. ${error.message} Clique em salvar novamente para enviar todas as fotos.`);
        // A atividade ja existe no banco: o chamador guarda este id para que o
        // proximo clique em "salvar" complete a mesma atividade.
        partial.activityId = activityId;
        throw partial;
      }
      onProgress?.(Math.min(offset + chunk.length, total), total);
    }
    if (result.activity) result.activity.photoCount = total;
    return {...result, id: activityId};
  }

  // Exposto globalmente para app.js e activities-edit.js.
  window.PortalActivityUpload = {saveActivity, BATCH_SIZE};
})();
