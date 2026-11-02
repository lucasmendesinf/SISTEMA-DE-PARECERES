// =============================================================================
// activity-upload.js - Salvamento de atividades com envio das fotos em lotes
// =============================================================================
// Por que existe:
//   Antes, todas as fotos da atividade iam numa unica requisicao. Com 50 fotos
//   isso passa de 8 MB e o servidor recusa (erro 413) ou a conexao cai.
//   Em producao o servidor recusou ate lotes de ~1 MB (limite comum de
//   nginx/LiteSpeed/ModSecurity), por isso os lotes sao montados pelo TAMANHO
//   e encolhem sozinhos quando o servidor reclama.
//
// Como funciona:
//   1. A atividade e salva (criada ou atualizada) SEM fotos: requisicao pequena.
//      Em edicao, o servidor apaga as fotos antigas nesse passo.
//   2. As fotos vao com action=appendPhotos em lotes de no maximo 5 fotos e
//      ~450 KB por envio.
//   3. Se o servidor responder 413 (envio grande demais), o lote e dividido ao
//      meio e reenviado; se uma unica foto ainda for grande demais, ela e
//      reduzida (menor resolucao/qualidade) e reenviada. Assim o envio se
//      adapta a qualquer limite do servidor, sem precisar mexer no cPanel.
//   4. Cada lote informa o "offset" (posicao da primeira foto do lote). Assim o
//      servidor sabe se aquele lote ja foi gravado e uma nova tentativa nunca
//      duplica fotos.
//   5. Lotes que falham por conexao ou erro temporario sao reenviados ate 3 vezes.
//   6. Se mesmo assim falhar, o erro devolve o id da atividade (activityId) para
//      que o proximo "salvar" atualize a mesma atividade em vez de criar outra,
//      e quantas fotos novas ja foram gravadas (sentCount).
//   7. Na edicao (keepPhotos: true) as fotos que a atividade ja tem sao mantidas
//      e as novas sao ACRESCENTADAS depois delas.
//
// Tambem expoe window.PortalActivityPhotos, usado pelas telas de registrar e
// editar atividade para mostrar "X de 50 fotos. Voce ainda pode adicionar Y."
// e as miniaturas (as fotos novas tem um botao x para remover antes de salvar).
//
// Usado por: addActivitySaveV2 (app.js) e saveActivityEdit (activities-edit.js).
// =============================================================================
(function () {
  // No maximo 5 fotos por requisicao (o servidor aceita ate 10).
  const BATCH_SIZE = 5;
  // Tamanho alvo de cada requisicao, em caracteres do JSON (~450 KB).
  // Fica abaixo de 1 MB, que e o limite padrao de varios servidores.
  const MAX_BATCH_CHARS = 450 * 1024;
  // Tentativas por requisicao antes de desistir (1 envio + 2 reenvios).
  const MAX_ATTEMPTS = 3;
  // Quantas vezes uma foto sozinha pode ser reduzida quando ainda da erro 413.
  const MAX_SHRINKS = 3;
  // Maximo de fotos por atividade (o mesmo validado no api.php).
  const MAX_PHOTOS = 50;

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
  // O erro lancado leva .status com o codigo HTTP (ex.: 413).
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
      // 413 do nginx/Apache) o JSON.parse falharia e perderiamos o codigo do erro.
      const text = await response.text().catch(() => '');
      let result = {};
      try { result = text ? JSON.parse(text) : {}; } catch (parseError) { result = {}; }
      if (response.ok) return result;
      lastError = new Error(messageFor(response.status, result));
      lastError.status = response.status;
      // Erros temporarios (servidor ocupado, tempo esgotado) valem nova tentativa;
      // erros de validacao (4xx, inclusive 413) nao, pois repetir igual daria o
      // mesmo resultado. O 413 e tratado em sendPhotos, que diminui o envio.
      const temporary = response.status >= 500 || response.status === 408 || response.status === 429;
      if (retryable && temporary && attempt < MAX_ATTEMPTS) { await wait(1500 * attempt); continue; }
      throw lastError;
    }
    throw lastError;
  }

  // Reduz uma foto (dataURL) para caber em servidores com limite pequeno:
  // diminui a resolucao em 25% e usa qualidade JPEG menor.
  function shrinkPhoto(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const width = Math.max(1, Math.round(img.naturalWidth * 0.75));
        const height = Math.max(1, Math.round(img.naturalHeight * 0.75));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.5));
      };
      img.onerror = () => reject(new Error('Nao foi possivel reduzir a foto.'));
      img.src = dataUrl;
    });
  }

  // Quantas fotos a partir de "start" cabem num envio, respeitando o limite de
  // quantidade (maxCount) e o tamanho alvo. Sempre pelo menos 1 foto.
  function batchLength(photos, start, maxCount) {
    let size = 0;
    let count = 0;
    while (start + count < photos.length && count < maxCount) {
      const next = photos[start + count].length;
      if (count > 0 && size + next > MAX_BATCH_CHARS) break;
      size += next;
      count += 1;
    }
    return count;
  }

  // Envia todas as fotos para a atividade ja salva, adaptando o tamanho dos
  // lotes ao limite do servidor. "photos" pode ser alterado (fotos reduzidas).
  // startOffset: quantas fotos a atividade ja tem no servidor (edicao que
  // acrescenta fotos); as novas sao gravadas a partir dessa posicao.
  async function sendPhotos(activityId, photos, onProgress, startOffset = 0) {
    const total = photos.length;
    // offset aqui e a posicao dentro das fotos NOVAS; no servidor e startOffset + offset.
    let offset = 0;
    // Limite de fotos por lote; cai pela metade a cada erro 413.
    let maxCount = BATCH_SIZE;
    // Quantas vezes a foto atual ja foi reduzida.
    let shrinks = 0;
    // Quantas reducoes o servidor exigiu ate agora: as proximas fotos ja saem
    // reduzidas nesse nivel, para nao gastar um envio recusado em cada foto.
    let shrinkLevel = 0;
    while (offset < total) {
      if (maxCount === 1 && shrinkLevel > shrinks) {
        while (shrinks < shrinkLevel) { photos[offset] = await shrinkPhoto(photos[offset]); shrinks += 1; }
      }
      const count = batchLength(photos, offset, maxCount);
      const chunk = photos.slice(offset, offset + count);
      try {
        await postJson({action: 'appendPhotos', id: activityId, offset: startOffset + offset, photos: chunk}, true);
      } catch (error) {
        if (error.status === 413) {
          // Envio grande demais: tenta de novo com menos fotos no lote...
          if (count > 1) { maxCount = Math.max(1, Math.floor(count / 2)); continue; }
          // ...ou, se ja e uma foto so, reduz essa foto e tenta de novo.
          if (shrinks < MAX_SHRINKS) {
            photos[offset] = await shrinkPhoto(photos[offset]);
            shrinks += 1;
            shrinkLevel = Math.max(shrinkLevel, shrinks);
            continue;
          }
        }
        const partial = new Error(`A atividade foi salva, mas so ${offset} de ${total} fotos foram enviadas. ${error.message} Clique em salvar novamente para enviar todas as fotos.`);
        // A atividade ja existe no banco: o chamador guarda este id para que o
        // proximo clique em "salvar" complete a mesma atividade.
        partial.activityId = activityId;
        // Quantas fotos novas ja foram gravadas: a tela de edicao tira essas da
        // lista para que, ao salvar de novo, so as que faltam sejam enviadas.
        partial.sentCount = offset;
        throw partial;
      }
      offset += count;
      shrinks = 0;
      onProgress?.(offset, total);
    }
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

  // Faz o envio propriamente dito: primeiro os dados da atividade (sem fotos),
  // depois as fotos com action=appendPhotos.
  async function uploadInBatches(payload, onProgress) {
    const photos = (payload.photos || []).filter(photo => String(photo).startsWith('data:image/'));
    const total = photos.length;
    onProgress?.(0, total);
    // 1) Salva a atividade sem fotos (requisicao pequena, nunca da 413).
    //    Em edicao (com id) o servidor apaga as fotos antigas aqui e as novas
    //    chegam logo em seguida.
    let result;
    try {
      // keepPhotos so faz sentido em edicao (com id): mantem as fotos atuais.
      result = await postJson({...payload, photos: [], keepPhotos: Boolean(payload.id && payload.keepPhotos)}, Boolean(payload.id));
    } catch (error) {
      error.message = `Nao foi possivel salvar a atividade. ${error.message}`;
      throw error;
    }
    const activityId = result.id || result.activity?.id;
    if (total && !activityId) throw new Error('Nao foi possivel salvar as fotos: o servidor nao retornou a atividade.');
    // Na edicao que acrescenta fotos, o servidor informa quantas a atividade ja tem.
    const existing = payload.keepPhotos ? Number(result.activity?.photoCount || 0) : 0;
    if (existing + total > MAX_PHOTOS) {
      const error = new Error(`A atividade ja tem ${existing} foto(s). Voce pode adicionar so mais ${Math.max(0, MAX_PHOTOS - existing)}.`);
      error.activityId = activityId;
      error.sentCount = 0;
      throw error;
    }

    // 2) Envia as fotos em lotes que se ajustam ao limite do servidor.
    if (total) await sendPhotos(activityId, photos, onProgress, existing);
    if (result.activity) {
      result.activity.photoCount = existing + total;
      // Fotos novas como foram gravadas (algumas podem ter sido reduzidas).
      result.activity.photos = photos;
    }
    return {...result, id: activityId};
  }

  // Texto do contador mostrado abaixo das fotos.
  function limitText(count) {
    const left = Math.max(0, MAX_PHOTOS - count);
    if (left === 0) return `${count} de ${MAX_PHOTOS} fotos. Limite atingido.`;
    return `${count} de ${MAX_PHOTOS} fotos. Voce ainda pode adicionar ${left}.`;
  }

  // Desenha as miniaturas: primeiro as fotos ja salvas (sem botao) e depois as
  // novas, cada uma com um x que chama window[removeHandler](indice).
  // Tambem atualiza o contador (elemento limitSelector).
  function render(previewSelector, limitSelector, saved, added, removeHandler) {
    const target = document.querySelector(previewSelector);
    if (target) {
      const savedHtml = (saved || []).map(src => `<img src="${src}" alt="Foto da atividade">`).join('');
      const addedHtml = (added || []).map((src, index) => `<span class="photo-new"><img src="${src}" alt="Foto nova"><button type="button" class="photo-remove" aria-label="Remover foto" onclick="${removeHandler}(${index})">&times;</button></span>`).join('');
      target.innerHTML = savedHtml + addedHtml;
    }
    const limit = document.querySelector(limitSelector);
    if (limit) limit.textContent = limitText((saved || []).length + (added || []).length);
  }

  // Exposto globalmente para app.js, activities-edit.js e experience-fields.js.
  window.PortalActivityUpload = {saveActivity, BATCH_SIZE};
  window.PortalActivityPhotos = {MAX_PHOTOS, limitText, render};
})();
