(() => {
  // Fotos que o servidor ja guarda, por documento: reportId -> Set(hash SHA-256).
  // Ao salvar, essas fotos vao como {ref: hash} em vez de reenviar o base64 inteiro,
  // o que mantem a requisicao pequena mesmo em documentos com muitas fotos.
  const known = new Map();
  const hashCache = new Map();

  function remember(reportId, hashes) {
    if (!reportId || !Array.isArray(hashes)) return;
    known.set(String(reportId), new Set(hashes.filter(Boolean)));
  }

  async function sha256(dataUrl) {
    if (hashCache.has(dataUrl)) return hashCache.get(dataUrl);
    if (!window.crypto?.subtle) return '';
    try {
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (hashCache.size > 200) hashCache.clear();
      hashCache.set(dataUrl, hash);
      return hash;
    } catch (_) {
      return '';
    }
  }

  // Aprende os hashes das fotos sempre que um documento completo e carregado.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function fetchWithPhotoHashes(input, init) {
    const response = await originalFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      if (method === 'GET' && /resource=reports/.test(url) && /[?&]id=\d+/.test(url)) {
        response.clone().json().then(list => {
          (Array.isArray(list) ? list : []).forEach(report => {
            remember(report.id, (report.entries || []).flatMap(entry => entry.photoHashes || []));
          });
        }).catch(() => {});
      }
    } catch (_) { /* observacao opcional */ }
    return response;
  };

  function friendlyError(response, text) {
    const status = response.status;
    if (status === 413) return 'O servidor recusou o envio porque o documento ficou grande demais (erro 413). Remova algumas fotos ou use fotos menores e tente de novo.';
    if (status === 408 || status === 504 || status === 524) return `O servidor demorou demais para responder (erro ${status}). Verifique a internet e tente salvar novamente.`;
    if (status >= 500) return `O servidor não conseguiu salvar agora (erro ${status}). Tente novamente em instantes.`;
    if (status === 401) return 'Sua sessão expirou. Entre no sistema novamente.';
    if (/^\s*</.test(text)) return `O servidor devolveu uma resposta inesperada (erro ${status}). Tente salvar novamente.`;
    return 'Não foi possível salvar o documento.';
  }

  async function send(body) {
    let response;
    try {
      response = await originalFetch('api.php?resource=reports', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      });
    } catch (_) {
      throw new Error('Sem conexão com o servidor. Verifique a internet e tente salvar novamente.');
    }
    const text = await response.text();
    let result = null;
    try { result = JSON.parse(text); } catch (_) { /* resposta nao e JSON */ }
    return {response, result, text};
  }

  // Envia o documento. Fotos ja gravadas no servidor viram referencias.
  window.PortalPhotoSync = {
    remember,
    async saveReport(body) {
      const reportId = body.reportId ? String(body.reportId) : '';
      const serverPhotos = reportId ? known.get(reportId) : null;
      let usedReferences = false;
      let entries = body.entries;
      if (serverPhotos?.size && Array.isArray(entries)) {
        entries = await Promise.all(entries.map(async entry => ({
          ...entry,
          photos: await Promise.all((entry.photos || []).map(async photo => {
            if (typeof photo !== 'string' || !photo.startsWith('data:')) return photo;
            const hash = await sha256(photo);
            if (hash && serverPhotos.has(hash)) { usedReferences = true; return {ref: hash}; }
            return photo;
          }))
        })));
      }
      let attempt = await send({...body, entries});
      if (attempt.response.status === 409 && attempt.result?.code === 'photo_ref_missing' && usedReferences) {
        known.delete(reportId);
        attempt = await send(body);
      }
      const {response, result, text} = attempt;
      if (!response.ok || !result) throw new Error(result?.error || friendlyError(response, text));
      remember(result.id, result.photoHashes);
      return result;
    }
  };
})();
