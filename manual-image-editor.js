(() => {
  const cdn = {
    cropperCss: 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css',
    cropperJs: 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js',
    fabricJs: 'https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js'
  };

  function loadStyle(url) {
    if ([...document.styleSheets].some(sheet => sheet.href === url)) return Promise.resolve();
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      link.onerror = resolve;
      document.head.append(link);
    });
  }

  function loadScript(url, test) {
    if (test()) return Promise.resolve();
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = resolve;
      document.head.append(script);
    });
  }

  function image(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function overlay(title, body) {
    const shell = document.createElement('div');
    shell.className = 'image-editor-shell';
    shell.innerHTML = `<div class="image-editor-panel"><button class="image-editor-close" type="button">x</button><h2>${title}</h2>${body}</div>`;
    (document.querySelector('dialog[open]') || document.body).append(shell);
    shell.querySelector('.image-editor-close').onclick = () => shell.remove();
    return shell;
  }

  async function open(dataUrl, options = {}) {
    await loadStyle(cdn.cropperCss);
    await loadScript(cdn.cropperJs, () => Boolean(window.Cropper));
    return new Promise(resolve => {
      let history = [];
      let redo = [];
      let cropper = null;
      let fabricCanvas = null;
      let currentUrl = dataUrl;
      let imageFrame = null;
      let nativeEditor = null;
      let nativeHistory = [];
      let nativeRedo = [];
      const queue = options.queue || null;
      const queueControls = queue?.total > 1;
      const queueTitle = queue?.total > 1 ? `Imagem ${queue.index + 1} de ${queue.total}` : '';
      const shell = overlay('Editor com IA e manual', `
        ${queueTitle ? `<p class="image-editor-counter">${queueTitle}</p>` : ''}
        <p class="image-editor-help">Ajuste o quadro sobre a area que precisa ser ocultada e aplique pixelizacao ou tarja.</p>
        <div class="image-editor-stage"><img id="manualCropImage" src="${dataUrl}" alt="Imagem para corte"></div>
        <canvas id="manualFabricCanvas" width="900" height="620" hidden></canvas>
        <div class="image-editor-actions">
          ${queueControls ? '<button class="secondary danger" id="manualDiscardImage" type="button">Descartar imagem</button>' : ''}
          ${queueControls ? '<button class="secondary" id="manualNextImage" type="button">Proxima imagem</button>' : ''}
          <button class="secondary" id="manualCrop" type="button">Aplicar corte</button>
          <button class="secondary" id="manualSkipCrop" type="button">Continuar sem cortar</button>
          <button class="secondary" id="manualAddBox" type="button" hidden>Adicionar area</button>
          <button class="secondary" id="manualDetectFaces" type="button" hidden>Detectar rostos com IA</button>
          <button class="secondary" id="manualPixel" type="button" hidden>Borrar selecao</button>
          <button class="secondary" id="manualUnblur" type="button" hidden>Desborrar selecao</button>
          <button class="secondary" id="manualPixelAll" type="button" hidden>Borrar todas</button>
          <button class="secondary" id="manualBar" type="button" hidden>Tarja opaca</button>
          <button class="secondary" id="manualUndo" type="button" hidden>Desfazer</button>
          <button class="secondary" id="manualRedo" type="button" hidden>Refazer</button>
          <button class="secondary" id="manualClear" type="button" hidden>Limpar selecao</button>
          <button class="secondary" id="manualClearAll" type="button" hidden>Limpar todas</button>
          <button class="primary" id="manualSave" type="button">Salvar imagem editada</button>
        </div>
        <p id="manualEditorMessage" class="profile-message"></p>`);

      const close = result => { shell.remove(); resolve(result); };
      shell.querySelector('.image-editor-close').onclick = () => close(null);
      shell.querySelector('#manualDiscardImage')?.addEventListener('click', () => close({action: 'discard'}));
      shell.querySelector('#manualNextImage')?.addEventListener('click', () => close({action: 'next'}));

      function fitCropStage() {
        if (!cropper) return;
        const stage = shell.querySelector('.image-editor-stage');
        if (!stage || stage.hidden) return;
        const canvasData = cropper.getCanvasData();
        const imageHeight = Math.ceil(canvasData.height || shell.querySelector('#manualCropImage').getBoundingClientRect().height);
        if (imageHeight > 0) {
          stage.style.height = `${imageHeight}px`;
        }
      }

      if (window.Cropper) {
        cropper = new Cropper(shell.querySelector('#manualCropImage'), {
          viewMode: 1,
          autoCropArea: 1,
          responsive: true,
          ready: fitCropStage,
          zoom: fitCropStage
        });
        window.setTimeout(fitCropStage, 80);
      }

      function pushState() {
        if (!fabricCanvas) return;
        // Fabric JSON snapshots keep undo/redo local to this editing session.
        history.push(JSON.stringify(fabricCanvas.toJSON(['editorSelection'])));
        redo = [];
      }

      function pushNativeState() {
        if (!nativeEditor) return;
        nativeHistory.push(nativeEditor.editCanvas.toDataURL('image/png'));
        nativeRedo = [];
      }

      async function restoreNativeState(src) {
        if (!nativeEditor) return;
        const img = await image(src);
        nativeEditor.ectx.clearRect(0, 0, nativeEditor.editCanvas.width, nativeEditor.editCanvas.height);
        nativeEditor.ectx.drawImage(img, 0, 0);
        drawNative();
      }

      function nativeSelection() {
        if (!nativeEditor.selection) {
          nativeEditor.selection = createNativeSelection();
        }
        return nativeEditor.selection;
      }

      function createNativeSelection(selection = null) {
        const frame = imageFrame || {left: 0, top: 0, width: nativeEditor.canvas.width, height: nativeEditor.canvas.height};
        const item = selection || {
          x: frame.left + frame.width * .32,
          y: frame.top + frame.height * .32,
          w: Math.min(180, frame.width * .36),
          h: Math.min(130, frame.height * .28)
        };
        nativeClamp(item);
        if (!nativeEditor.selections.includes(item)) nativeEditor.selections.push(item);
        nativeEditor.selection = item;
        return item;
      }

      function drawNative(showSelection = true) {
        if (!nativeEditor) return;
        const {canvas, ctx, editCanvas} = nativeEditor;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(editCanvas, 0, 0);
        if (!showSelection) return;
        nativeEditor.selections.forEach((selection, index) => {
          const active = selection === nativeEditor.selection;
          ctx.save();
          ctx.strokeStyle = active ? '#236b52' : '#c23b3b';
          ctx.fillStyle = active ? 'rgba(35,107,82,.12)' : 'rgba(194,59,59,.12)';
          ctx.lineWidth = active ? 3 : 2;
          ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
          ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
          ctx.fillStyle = active ? 'rgba(35,107,82,.9)' : 'rgba(194,59,59,.86)';
          ctx.fillRect(selection.x, Math.max(0, selection.y - 22), 76, 20);
          ctx.fillStyle = '#fff';
          ctx.font = '12px Arial';
          ctx.fillText(`Area ${index + 1}`, selection.x + 7, Math.max(16, selection.y - 7));
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = active ? '#236b52' : '#c23b3b';
          [[selection.x, selection.y], [selection.x + selection.w, selection.y], [selection.x, selection.y + selection.h], [selection.x + selection.w, selection.y + selection.h]].forEach(([x, y]) => {
            ctx.fillRect(x - 5, y - 5, 10, 10);
            ctx.strokeRect(x - 5, y - 5, 10, 10);
          });
          ctx.restore();
        });
      }

      function nativePointer(event) {
        const rect = nativeEditor.canvas.getBoundingClientRect();
        return {
          x: (event.clientX - rect.left) * (nativeEditor.canvas.width / rect.width),
          y: (event.clientY - rect.top) * (nativeEditor.canvas.height / rect.height)
        };
      }

      function nativeHitHandle(x, y) {
        const s = nativeEditor.selection;
        if (!s) return '';
        const handles = [
          ['nw', s.x, s.y], ['ne', s.x + s.w, s.y],
          ['sw', s.x, s.y + s.h], ['se', s.x + s.w, s.y + s.h]
        ];
        return handles.find(([, hx, hy]) => Math.abs(x - hx) <= 10 && Math.abs(y - hy) <= 10)?.[0] || '';
      }

      function nativeHitSelection(x, y) {
        for (let i = nativeEditor.selections.length - 1; i >= 0; i--) {
          const selection = nativeEditor.selections[i];
          if (x >= selection.x && x <= selection.x + selection.w && y >= selection.y && y <= selection.y + selection.h) return selection;
        }
        return null;
      }

      function nativeClamp(selection) {
        const frame = imageFrame || {left: 0, top: 0, width: nativeEditor.canvas.width, height: nativeEditor.canvas.height};
        const min = 24;
        selection.w = Math.max(min, selection.w);
        selection.h = Math.max(min, selection.h);
        selection.x = Math.max(frame.left, Math.min(frame.left + frame.width - selection.w, selection.x));
        selection.y = Math.max(frame.top, Math.min(frame.top + frame.height - selection.h, selection.y));
      }

      function nativeArea() {
        const s = nativeSelection();
        const frame = imageFrame || {left: 0, top: 0, width: nativeEditor.canvas.width, height: nativeEditor.canvas.height};
        const x = Math.max(frame.left, s.x);
        const y = Math.max(frame.top, s.y);
        const right = Math.min(frame.left + frame.width, s.x + s.w);
        const bottom = Math.min(frame.top + frame.height, s.y + s.h);
        return {x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y)};
      }

      function nativeApplyPixel() {
        if (!nativeEditor) return;
        const area = nativeArea();
        nativePixelArea(area);
        pushNativeState();
        drawNative();
      }

      function nativePixelArea(area) {
        if (!nativeEditor || !area) return;
        const pixel = 12;
        const small = document.createElement('canvas');
        small.width = Math.max(1, Math.floor(area.w / pixel));
        small.height = Math.max(1, Math.floor(area.h / pixel));
        const smallCtx = small.getContext('2d');
        smallCtx.drawImage(nativeEditor.editCanvas, area.x, area.y, area.w, area.h, 0, 0, small.width, small.height);
        nativeEditor.ectx.imageSmoothingEnabled = false;
        nativeEditor.ectx.drawImage(small, 0, 0, small.width, small.height, area.x, area.y, area.w, area.h);
        nativeEditor.ectx.imageSmoothingEnabled = true;
      }

      function nativeApplyAllPixels() {
        if (!nativeEditor || !nativeEditor.selections.length) return;
        const currentSelection = nativeEditor.selection;
        nativeEditor.selections.forEach(selection => {
          nativeEditor.selection = selection;
          nativePixelArea(nativeArea());
        });
        nativeEditor.selection = currentSelection;
        pushNativeState();
        drawNative();
      }

      function nativeRestoreArea() {
        if (!nativeEditor || !nativeEditor.sourceImage || !imageFrame) return;
        const area = nativeArea();
        const scale = imageFrame.width / nativeEditor.sourceImage.width;
        const sx = Math.max(0, (area.x - imageFrame.left) / scale);
        const sy = Math.max(0, (area.y - imageFrame.top) / scale);
        const sw = Math.min(nativeEditor.sourceImage.width - sx, area.w / scale);
        const sh = Math.min(nativeEditor.sourceImage.height - sy, area.h / scale);
        if (sw <= 0 || sh <= 0) return;
        nativeEditor.ectx.drawImage(nativeEditor.sourceImage, sx, sy, sw, sh, area.x, area.y, area.w, area.h);
        pushNativeState();
        drawNative();
      }

      function nativeApplyBar() {
        if (!nativeEditor) return;
        const area = nativeArea();
        nativeEditor.ectx.fillStyle = 'rgba(8,12,10,.95)';
        nativeEditor.ectx.fillRect(area.x, area.y, area.w, area.h);
        pushNativeState();
        drawNative();
      }

      async function enterNativeCanvas(src, canvasEl) {
        const base = await image(src);
        const ctx = canvasEl.getContext('2d');
        const editCanvas = document.createElement('canvas');
        editCanvas.width = canvasEl.width;
        editCanvas.height = canvasEl.height;
        const ectx = editCanvas.getContext('2d');
        const scale = Math.min(canvasEl.width / base.width, canvasEl.height / base.height);
        imageFrame = {left: (canvasEl.width - base.width * scale) / 2, top: (canvasEl.height - base.height * scale) / 2, width: base.width * scale, height: base.height * scale};
        ectx.fillStyle = '#f6f8f6';
        ectx.fillRect(0, 0, editCanvas.width, editCanvas.height);
        ectx.drawImage(base, imageFrame.left, imageFrame.top, imageFrame.width, imageFrame.height);
        nativeEditor = {canvas: canvasEl, ctx, editCanvas, ectx, selection: null, selections: [], drag: null, sourceImage: base};
        nativeSelection();
        pushNativeState();
        drawNative();
        canvasEl.onmousedown = event => {
          const point = nativePointer(event);
          const hitSelection = nativeHitSelection(point.x, point.y);
          if (hitSelection) nativeEditor.selection = hitSelection;
          const selection = nativeSelection();
          const handle = nativeHitHandle(point.x, point.y);
          if (handle) nativeEditor.drag = {mode: 'resize', handle, start: point, original: {...selection}};
          else if (point.x >= selection.x && point.x <= selection.x + selection.w && point.y >= selection.y && point.y <= selection.y + selection.h) {
            nativeEditor.drag = {mode: 'move', dx: point.x - selection.x, dy: point.y - selection.y};
          }
          drawNative();
        };
        canvasEl.onmousemove = event => {
          const point = nativePointer(event);
          const selection = nativeEditor.selection || nativeSelection();
          if (!nativeEditor.drag) {
            const hitSelection = nativeHitSelection(point.x, point.y);
            canvasEl.style.cursor = nativeHitHandle(point.x, point.y) ? 'nwse-resize' : (hitSelection ? 'move' : 'default');
            return;
          }
          if (nativeEditor.drag.mode === 'move') {
            selection.x = point.x - nativeEditor.drag.dx;
            selection.y = point.y - nativeEditor.drag.dy;
          } else {
            const original = nativeEditor.drag.original;
            const frame = imageFrame || {left: 0, top: 0, width: canvasEl.width, height: canvasEl.height};
            let left = original.x, top = original.y, right = original.x + original.w, bottom = original.y + original.h;
            if (nativeEditor.drag.handle.includes('w')) left = Math.max(frame.left, Math.min(point.x, right - 24));
            if (nativeEditor.drag.handle.includes('e')) right = Math.min(frame.left + frame.width, Math.max(point.x, left + 24));
            if (nativeEditor.drag.handle.includes('n')) top = Math.max(frame.top, Math.min(point.y, bottom - 24));
            if (nativeEditor.drag.handle.includes('s')) bottom = Math.min(frame.top + frame.height, Math.max(point.y, top + 24));
            Object.assign(selection, {x: left, y: top, w: right - left, h: bottom - top});
          }
          nativeClamp(selection);
          drawNative();
        };
        canvasEl.onmouseup = () => { nativeEditor.drag = null; };
        canvasEl.onmouseleave = () => { nativeEditor.drag = null; canvasEl.style.cursor = 'default'; };
      }

      async function enterCanvas(src) {
        currentUrl = src;
        if (cropper) {
          cropper.destroy();
          cropper = null;
        }
        shell.querySelector('#manualCropImage').hidden = true;
        shell.querySelector('.image-editor-stage').hidden = true;
        const canvasEl = shell.querySelector('#manualFabricCanvas');
        canvasEl.hidden = false;
        shell.querySelectorAll('#manualAddBox,#manualDetectFaces,#manualPixel,#manualUnblur,#manualPixelAll,#manualBar,#manualUndo,#manualRedo,#manualClear,#manualClearAll').forEach(button => button.hidden = false);
        shell.querySelector('#manualCrop').hidden = true;
        shell.querySelector('#manualSkipCrop').hidden = true;
        await enterNativeCanvas(src, canvasEl);
        shell.querySelector('#manualEditorMessage').textContent = 'Ajuste o quadro sobre o rosto e escolha Borrar selecao ou Tarja opaca.';
        return;
        if (false && window.fabric) {
          fabricCanvas = new fabric.Canvas(canvasEl, {selection: true, preserveObjectStacking: true});
          const img = await new Promise(resolveImg => fabric.Image.fromURL(src, resolveImg, {crossOrigin: 'anonymous'}));
          const scale = Math.min(canvasEl.width / img.width, canvasEl.height / img.height);
          img.scale(scale);
          imageFrame = {left: (canvasEl.width - img.width * scale) / 2, top: (canvasEl.height - img.height * scale) / 2, width: img.width * scale, height: img.height * scale};
          img.set({left: imageFrame.left, top: imageFrame.top, selectable: false, evented: false});
          fabricCanvas.add(img);
          fabricCanvas.sendToBack(img);
          createSelection();
          pushState();
          shell.querySelector('#manualEditorMessage').textContent = 'Ajuste o quadro sobre o rosto e escolha Borrar selecao ou Tarja opaca.';
        } else {
          const base = await image(src);
          const ctx = canvasEl.getContext('2d');
          ctx.drawImage(base, 0, 0, canvasEl.width, canvasEl.height);
        }
      }

      shell.querySelector('#manualCrop').onclick = async () => {
        const cropped = cropper ? cropper.getCroppedCanvas({maxWidth: 1800, maxHeight: 1800}).toDataURL('image/jpeg', .9) : currentUrl;
        if (cropper) {
          cropper.destroy();
          cropper = null;
        }
        await enterCanvas(cropped);
      };
      shell.querySelector('#manualSkipCrop').onclick = async () => {
        if (cropper) {
          cropper.destroy();
          cropper = null;
        }
        await enterCanvas(currentUrl);
      };
      shell.querySelector('#manualEditorMessage').textContent = window.Cropper ? 'Opcional: ajuste o corte da imagem ou continue sem cortar.' : 'Corte indisponivel. Continue sem cortar para ocultar uma area manualmente.';

      function createSelection() {
        if (!fabricCanvas) return null;
        const frame = imageFrame || {left: 0, top: 0, width: fabricCanvas.width, height: fabricCanvas.height};
        const width = Math.min(160, frame.width * .35);
        const height = Math.min(120, frame.height * .3);
        const rect = new fabric.Rect({
          left: frame.left + Math.max(20, (frame.width - width) / 2),
          top: frame.top + Math.max(20, (frame.height - height) / 2),
          width,
          height,
          fill: 'rgba(35,107,82,.12)',
          stroke: '#236b52',
          strokeWidth: 2,
          cornerColor: '#236b52',
          cornerStyle: 'circle',
          transparentCorners: false
        });
        rect.editorSelection = true;
        fabricCanvas.add(rect);
        fabricCanvas.setActiveObject(rect);
        fabricCanvas.renderAll();
        return rect;
      }

      function selectedRect() {
        if (!fabricCanvas) return null;
        const active = fabricCanvas.getActiveObject();
        if (active?.type === 'rect' && active.editorSelection) return active;
        shell.querySelector('#manualEditorMessage').textContent = 'Ajuste ou adicione uma area antes de aplicar o efeito.';
        return null;
      }

      function clampSelection(rect) {
        const frame = imageFrame || {left: 0, top: 0, width: fabricCanvas.width, height: fabricCanvas.height};
        const left = Math.max(frame.left, rect.left);
        const top = Math.max(frame.top, rect.top);
        const right = Math.min(frame.left + frame.width, rect.left + rect.getScaledWidth());
        const bottom = Math.min(frame.top + frame.height, rect.top + rect.getScaledHeight());
        return {left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top)};
      }

      function applyPixelation(rect) {
        const area = clampSelection(rect);
        rect.visible = false;
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
        const source = fabricCanvas.lowerCanvasEl;
        const pixel = 12;
        const small = document.createElement('canvas');
        small.width = Math.max(1, Math.floor(area.width / pixel));
        small.height = Math.max(1, Math.floor(area.height / pixel));
        const smallCtx = small.getContext('2d');
        smallCtx.drawImage(source, area.left, area.top, area.width, area.height, 0, 0, small.width, small.height);
        const patch = document.createElement('canvas');
        patch.width = Math.ceil(area.width);
        patch.height = Math.ceil(area.height);
        const patchCtx = patch.getContext('2d');
        patchCtx.imageSmoothingEnabled = false;
        patchCtx.drawImage(small, 0, 0, small.width, small.height, 0, 0, patch.width, patch.height);
        fabricCanvas.remove(rect);
        fabric.Image.fromURL(patch.toDataURL('image/png'), img => {
          img.set({left: area.left, top: area.top, selectable: true});
          fabricCanvas.add(img);
          fabricCanvas.setActiveObject(img);
          fabricCanvas.renderAll();
          pushState();
        });
      }

      shell.querySelector('#manualAddBox').onclick = () => {
        if (nativeEditor) {
          createNativeSelection();
          drawNative();
          shell.querySelector('#manualEditorMessage').textContent = 'Ajuste o novo quadro antes de aplicar o efeito.';
          return;
        }
        createSelection();
        shell.querySelector('#manualEditorMessage').textContent = 'Ajuste o novo quadro antes de aplicar o efeito.';
      };
      shell.querySelector('#manualDetectFaces').onclick = async () => {
        if (!nativeEditor || !window.AiFaceImageEditor?.detectFaces) {
          shell.querySelector('#manualEditorMessage').textContent = 'Detector de rostos indisponivel neste navegador.';
          return;
        }
        shell.querySelector('#manualEditorMessage').textContent = 'Detectando rostos com IA...';
        const rendered = {scale: imageFrame.width / nativeEditor.sourceImage.width, x: imageFrame.left, y: imageFrame.top, w: imageFrame.width, h: imageFrame.height};
        const faces = await window.AiFaceImageEditor.detectFaces(nativeEditor.sourceImage, rendered);
        if (!faces.length) {
          shell.querySelector('#manualEditorMessage').textContent = 'Erro na deteccao de rosto. Use Adicionar area manual para marcar rostos ausentes.';
          return;
        }
        nativeEditor.selections = [];
        faces.forEach(face => createNativeSelection({x: face.x, y: face.y, w: face.w, h: face.h}));
        nativeEditor.selection = nativeEditor.selections[0] || null;
        drawNative();
        shell.querySelector('#manualEditorMessage').textContent = `${faces.length} rosto(s) detectado(s). Ajuste, remova ou aplique Borrar selecao em cada area.`;
      };
      shell.querySelector('#manualBar').onclick = () => {
        if (nativeEditor) {
          nativeApplyBar();
          return;
        }
        const rect = selectedRect();
        if (!rect) return;
        rect.set({fill: 'rgba(8,12,10,.95)', stroke: null, strokeWidth: 0});
        rect.editorSelection = false;
        fabricCanvas.renderAll();
        pushState();
      };
      shell.querySelector('#manualPixel').onclick = () => {
        if (nativeEditor) {
          nativeApplyPixel();
          return;
        }
        const rect = selectedRect();
        if (!rect) return;
        applyPixelation(rect);
      };
      shell.querySelector('#manualUnblur').onclick = () => {
        if (nativeEditor) {
          if (!nativeEditor.selection) {
            shell.querySelector('#manualEditorMessage').textContent = 'Selecione uma area para desborrar.';
            return;
          }
          nativeRestoreArea();
          shell.querySelector('#manualEditorMessage').textContent = 'Selecao desborrada.';
          return;
        }
        shell.querySelector('#manualEditorMessage').textContent = 'Use esta opcao apos continuar sem cortar ou aplicar o corte.';
      };
      shell.querySelector('#manualPixelAll').onclick = () => {
        if (nativeEditor) {
          if (!nativeEditor.selections.length) {
            shell.querySelector('#manualEditorMessage').textContent = 'Nenhuma selecao para borrar.';
            return;
          }
          nativeApplyAllPixels();
          shell.querySelector('#manualEditorMessage').textContent = 'Todas as selecoes foram borradas.';
          return;
        }
        shell.querySelector('#manualEditorMessage').textContent = 'Use esta opcao apos continuar sem cortar ou aplicar o corte.';
      };
      shell.querySelector('#manualClear').onclick = () => {
        if (nativeEditor) {
          if (nativeEditor.selection) {
            nativeEditor.selections = nativeEditor.selections.filter(selection => selection !== nativeEditor.selection);
            nativeEditor.selection = nativeEditor.selections.at(-1) || null;
          }
          drawNative();
          shell.querySelector('#manualEditorMessage').textContent = 'Selecao removida. Use Adicionar area para criar outro quadro.';
          return;
        }
        const active = fabricCanvas?.getActiveObject();
        if (active && active.type !== 'image') {
          fabricCanvas.remove(active);
          pushState();
        }
      };
      shell.querySelector('#manualClearAll').onclick = () => {
        if (nativeEditor) {
          nativeEditor.selections = [];
          nativeEditor.selection = null;
          drawNative();
          shell.querySelector('#manualEditorMessage').textContent = 'Todas as selecoes foram removidas.';
          return;
        }
        shell.querySelector('#manualEditorMessage').textContent = 'Use esta opcao apos continuar sem cortar ou aplicar o corte.';
      };
      shell.querySelector('#manualUndo').onclick = async () => {
        if (nativeEditor) {
          if (nativeHistory.length < 2) return;
          nativeRedo.push(nativeHistory.pop());
          await restoreNativeState(nativeHistory.at(-1));
          return;
        }
        if (!fabricCanvas || history.length < 2) return;
        redo.push(history.pop());
        fabricCanvas.loadFromJSON(history.at(-1), () => fabricCanvas.renderAll());
      };
      shell.querySelector('#manualRedo').onclick = async () => {
        if (nativeEditor) {
          if (!nativeRedo.length) return;
          const state = nativeRedo.pop();
          nativeHistory.push(state);
          await restoreNativeState(state);
          return;
        }
        if (!fabricCanvas || !redo.length) return;
        const state = redo.pop();
        history.push(state);
        fabricCanvas.loadFromJSON(state, () => fabricCanvas.renderAll());
      };
      shell.querySelector('#manualSave').onclick = async () => {
        if (!fabricCanvas && !nativeEditor) await enterCanvas(currentUrl);
        if (nativeEditor) {
          drawNative(false);
          const photo = nativeEditor.canvas.toDataURL('image/jpeg', .9);
          close(queue ? {action: 'save', photo} : photo);
          return;
        }
        const active = fabricCanvas?.getActiveObject();
        if (active?.editorSelection) {
          fabricCanvas.remove(active);
          fabricCanvas.renderAll();
        }
        const photo = fabricCanvas ? fabricCanvas.toDataURL({format: 'jpeg', quality: .9}) : currentUrl;
        close(queue ? {action: 'save', photo} : photo);
      };
    });
  }

  window.ManualImageEditor = {open};
})();
