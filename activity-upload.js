// Salva atividades enviando as fotos em lotes pequenos.
// Uma unica requisicao com 50 fotos passa de 8 MB e pode ser recusada pelo
// servidor ou cair em conexoes lentas; em lotes de 5 cada envio fica com
// menos de 1 MB e um lote que falhar e reenviado automaticamente.
(function () {
  const BATCH_SIZE = 5;
  const MAX_ATTEMPTS = 3;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function messageFor(status, result) {
    if (result && result.error) return `${result.error} (erro ${status})`;
    if (status === 413) return 'O envio ficou grande demais para o servidor (erro 413).';
    if (status === 401 || status === 403) return `Sua sessao expirou ou nao tem permissao. Entre novamente no sistema (erro ${status}).`;
    if (status === 408 || status === 504) return `O servidor demorou demais para responder (erro ${status}).`;
    return `O servidor recusou o envio (erro ${status}).`;
  }

  // retryable: so reenvia quando repetir a requisicao nao duplica dados.
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
        lastError = new Error('Sem conexao com o servidor. Verifique a internet e tente novamente.');
        if (retryable && attempt < MAX_ATTEMPTS) { await wait(1500 * attempt); continue; }
        throw lastError;
      }
      const text = await response.text().catch(() => '');
      let result = {};
      try { result = text ? JSON.parse(text) : {}; } catch (parseError) { result = {}; }
      if (response.ok) return result;
      lastError = new Error(messageFor(response.status, result));
      lastError.status = response.status;
      const temporary = response.status >= 500 || response.status === 408 || response.status === 429;
      if (retryable && temporary && attempt < MAX_ATTEMPTS) { await wait(1500 * attempt); continue; }
      throw lastError;
    }
    throw lastError;
  }

  // payload: {id?, title, area, note, photos, classId, periodId, imageEditorMode}
  // onProgress(enviadas, total)
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

  async function uploadInBatches(payload, onProgress) {
    const photos = (payload.photos || []).filter(photo => String(photo).startsWith('data:image/'));
    const total = photos.length;
    const first = photos.slice(0, BATCH_SIZE);
    onProgress?.(0, total);
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

    for (let offset = BATCH_SIZE; offset < total; offset += BATCH_SIZE) {
      const chunk = photos.slice(offset, offset + BATCH_SIZE);
      try {
        await postJson({action: 'appendPhotos', id: activityId, offset, photos: chunk}, true);
      } catch (error) {
        const partial = new Error(`A atividade foi salva, mas so ${offset} de ${total} fotos foram enviadas. ${error.message} Clique em salvar novamente para enviar todas as fotos.`);
        partial.activityId = activityId;
        throw partial;
      }
      onProgress?.(Math.min(offset + chunk.length, total), total);
    }
    if (result.activity) result.activity.photoCount = total;
    return {...result, id: activityId};
  }

  window.PortalActivityUpload = {saveActivity, BATCH_SIZE};
})();
