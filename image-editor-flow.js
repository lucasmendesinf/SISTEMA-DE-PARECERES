(() => {
  const editorMode = {last: 'none'};

  function fileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function normalizeImageDataUrl(dataUrl, maxSide = 1800) {
    const img = await loadImage(dataUrl);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height || Math.max(width, height) <= maxSide) return dataUrl;
    const scale = maxSide / Math.max(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.88);
  }

  function chooseMode(modes) {
    if (!modes.length) return Promise.resolve('none');
    if (modes.includes('manual')) return Promise.resolve('manual');
    return new Promise(resolve => {
      const shell = document.createElement('div');
      shell.className = 'image-editor-shell';
      shell.innerHTML = `
        <div class="image-editor-panel image-editor-choice">
          <button class="image-editor-close" type="button">x</button>
          <h2>Editar imagem</h2>
          <p class="image-editor-help">Escolha como deseja tratar a foto antes de salvar no parecer.</p>
          <div class="image-editor-actions vertical">
            <button class="primary" data-mode="manual" type="button">Editor com IA e manual</button>
            <button class="secondary" data-mode="none" type="button">Upload simples</button>
          </div>
        </div>`;
      (document.querySelector('dialog[open]') || document.body).append(shell);
      shell.querySelector('.image-editor-close').onclick = () => { shell.remove(); resolve('none'); };
      shell.querySelectorAll('[data-mode]').forEach(button => {
        if (button.dataset.mode !== 'none' && !modes.includes(button.dataset.mode)) button.hidden = true;
        button.onclick = () => {
          const mode = button.dataset.mode;
          shell.remove();
          resolve(mode);
        };
      });
    });
  }

  async function editDataUrl(dataUrl, mode, options = {}) {
    if (mode === 'manual' && window.ManualImageEditor) {
      const edited = await window.ManualImageEditor.open(dataUrl, options);
      if (options.queue) return edited;
      return edited || dataUrl;
    }
    return dataUrl;
  }

  async function processFiles(files, limit = 3) {
    const list = [...files];
    if (list.length > limit) throw new Error(`Adicione no maximo ${limit} imagens.`);
    if (list.some(file => file.size > 5 * 1024 * 1024)) throw new Error('Cada imagem deve ter no maximo 5 MB.');
    await window.PortalImageEditorPermissions?.init?.();
    const modes = window.PortalImageEditorPermissions?.availableModes?.() || [];
    // The selected mode is sent to the API so the backend can validate the user permission.
    const mode = await chooseMode(modes);
    editorMode.last = mode;
    const output = [];
    for (const file of list) {
      const dataUrl = await normalizeImageDataUrl(await fileAsDataUrl(file));
      output.push(await editDataUrl(dataUrl, mode));
    }
    return {photos: output, mode};
  }

  async function processDataUrls(dataUrls, limit = 3, options = {}) {
    const list = [...dataUrls].filter(Boolean);
    if (list.length > limit) throw new Error(`Adicione no maximo ${limit} imagens.`);
    await window.PortalImageEditorPermissions?.init?.();
    const modes = window.PortalImageEditorPermissions?.availableModes?.() || [];
    const mode = await chooseMode(modes);
    editorMode.last = mode;
    const output = [];
    for (let index = 0; index < list.length; index += 1) {
      const dataUrl = list[index];
      const normalized = await normalizeImageDataUrl(dataUrl);
      if (options.reviewEach && mode === 'manual' && window.ManualImageEditor) {
        const result = await editDataUrl(normalized, mode, {queue: {index, total: list.length}});
        if (typeof result === 'string') output.push(result);
        else if (result?.action === 'save' && result.photo) output.push(result.photo);
        continue;
      }
      output.push(await editDataUrl(normalized, mode));
    }
    return {photos: output, mode};
  }

  window.PortalImageEditors = {processFiles, processDataUrls, fileAsDataUrl, editorMode};
})();
