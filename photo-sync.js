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

  // Converte qualquer imagem que o navegador consiga ler para JPEG (fundo branco), com no
  // maximo maxSide pixels. Devolve '' se o navegador nao conseguir ler a imagem.
  function toJpegDataUrl(source, maxSide = 900, quality = 0.88) {
    return new Promise(resolve => {
      const image = new Image();
      image.onerror = () => resolve('');
      image.onload = () => {
        try {
          const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (_) { resolve(''); }
      };
      image.src = source;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo.'));
      reader.readAsDataURL(file);
    });
  }

  // Foto do aluno ao cadastrar/editar: sempre JPEG leve, para aparecer no Word e no PDF.
  window.studentPhotoFromFile = async function studentPhotoFromFile(file) {
    if (!file) return '';
    const jpeg = await toJpegDataUrl(await readFileAsDataUrl(file), 1000, 0.88);
    if (!jpeg) throw new Error('Nao foi possivel ler esta foto. Use uma imagem JPEG ou PNG (no iPhone: Ajustes > Camera > Formatos > Mais compativel).');
    return jpeg;
  };

  // Foto/logo para os arquivos Word e PDF: converte para JPEG; se o navegador nao conseguir
  // ler a imagem, devolve a original quando ela ja e JPEG ou PNG, senao vazio.
  window.documentImageForFile = async function documentImageForFile(dataUrl, maxSide = 900) {
    const value = String(dataUrl || '');
    if (!value.startsWith('data:')) return '';
    const jpeg = await toJpegDataUrl(value, maxSide, 0.88);
    if (jpeg) return jpeg;
    return /^data:image\/(?:jpeg|jpg|png);base64,/i.test(value) ? value : '';
  };

  // Entradas para baixar Word/PDF: fotos que o servidor ja guarda vao como {ref}; as
  // demais vao inline (convertidas por "convert", se informado). Os hashes tambem
  // chegam junto dos blocos do documento, por isso nao dependemos da resposta clonada
  // do fetch terminar antes de a pessoa clicar em baixar.
  window.PortalPhotoSync_entriesForDownload = async function entriesForDownload(reportId, entries, convert) {
    const entryHashes = (entries || []).flatMap(entry => entry.photoHashes || []).filter(Boolean);
    if (entryHashes.length) remember(reportId, entryHashes);
    const serverPhotos = known.get(String(reportId || ''));
    return Promise.all((entries || []).map(async entry => ({
      ...entry,
      photos: (await Promise.all((entry.photos || []).map(async photo => {
        if (typeof photo === 'string' && serverPhotos?.size && /^data:image\/[^;]+;base64,/i.test(photo)) {
          const hash = await sha256(photo);
          if (hash && serverPhotos.has(hash)) return {ref: hash};
        }
        return convert ? convert(photo) : photo;
      }))).filter(Boolean)
    })));
  };

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
