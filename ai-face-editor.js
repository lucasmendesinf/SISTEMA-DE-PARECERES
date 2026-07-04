(() => {
  const visionUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
  const wasmUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
  const modelUrls = [
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite',
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite'
  ];
  const handleSize = 10;
  const minBoxSize = 24;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function shell() {
    const node = document.createElement('div');
    node.className = 'image-editor-shell';
    node.innerHTML = `
      <div class="image-editor-panel ai-editor-panel">
        <button class="image-editor-close" type="button">x</button>
        <h2>Editor com IA</h2>
        <p class="image-editor-help">Todos os rostos detectados serao ocultados. Clique no rosto que deve ficar visivel para desmarcar a ocultacao. Caso algum rosto nao tenha sido detectado, use a ferramenta manual.</p>
        <canvas id="aiFaceCanvas" width="900" height="620"></canvas>
        <div class="image-editor-actions">
          <button class="secondary" id="aiDetect" type="button">Detectar rostos</button>
          <button class="secondary" id="aiAddBox" type="button">Adicionar area manual</button>
          <button class="secondary" id="aiRemoveBox" type="button">Remover selecao</button>
          <button class="secondary" id="aiApply" type="button">Borrar rostos</button>
          <button class="secondary" id="aiReset" type="button">Restaurar</button>
          <button class="primary" id="aiSave" type="button">Salvar imagem editada</button>
        </div>
        <p id="aiEditorMessage" class="profile-message"></p>
      </div>`;
    (document.querySelector('dialog[open]') || document.body).append(node);
    return node;
  }

  function pixelate(ctx, sx, sy, sw, sh) {
    const pixel = 12;
    sx = Math.max(0, Math.floor(sx));
    sy = Math.max(0, Math.floor(sy));
    sw = Math.min(ctx.canvas.width - sx, Math.floor(sw));
    sh = Math.min(ctx.canvas.height - sy, Math.floor(sh));
    if (sw <= 0 || sh <= 0) return;
    const temp = document.createElement('canvas');
    temp.width = Math.max(1, Math.floor(sw / pixel));
    temp.height = Math.max(1, Math.floor(sh / pixel));
    const tctx = temp.getContext('2d');
    tctx.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, temp.width, temp.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp, 0, 0, temp.width, temp.height, sx, sy, sw, sh);
    ctx.imageSmoothingEnabled = true;
  }

  function detectionScore(item) {
    const categories = item.categories || [];
    const scores = categories.map(category => Number(category.score || 0));
    return scores.length ? Math.max(...scores) : 0;
  }

  function normalizedBox(box, rendered, source = {x: 0, y: 0, scale: 1}, meta = {}) {
    const shrink = 0.92;
    const sourceScale = source.scale || 1;
    const originalX = (box.originX / sourceScale) + source.x;
    const originalY = (box.originY / sourceScale) + source.y;
    const originalW = box.width / sourceScale;
    const originalH = box.height / sourceScale;
    const width = originalW * rendered.scale * shrink;
    const height = originalH * rendered.scale * shrink;
    const x = rendered.x + originalX * rendered.scale + (originalW * rendered.scale - width) / 2;
    const y = rendered.y + originalY * rendered.scale + (originalH * rendered.scale - height) / 2;
    const minSize = 24;
    const clampedX = Math.max(rendered.x, Math.min(rendered.x + rendered.w - minSize, x));
    const clampedY = Math.max(rendered.y, Math.min(rendered.y + rendered.h - minSize, y));
    return {
      x: clampedX,
      y: clampedY,
      w: Math.max(minSize, Math.min(width, rendered.x + rendered.w - clampedX)),
      h: Math.max(minSize, Math.min(height, rendered.y + rendered.h - clampedY)),
      score: Number(meta.score || 0),
      pass: meta.pass || 'crop',
      votes: 1,
      hidden: true
    };
  }

  function overlapRatio(a, b) {
    const left = Math.max(a.x, b.x);
    const top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.w, b.x + b.w);
    const bottom = Math.min(a.y + a.h, b.y + b.h);
    const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
    const smaller = Math.min(a.w * a.h, b.w * b.h);
    return smaller ? intersection / smaller : 0;
  }

  function uniqueBoxes(boxes) {
    return boxes
      .sort((a, b) => b.score - a.score)
      .reduce((items, box) => {
        const existing = items.find(item => overlapRatio(item, box) > .42);
        if (existing) {
          existing.votes += 1;
          existing.score = Math.max(existing.score, box.score);
          if (box.pass === 'whole') existing.pass = 'whole';
          return items;
        }
        items.push(box);
        return items;
      }, []);
  }

  function detectionCanvas(img, crop, targetSize = 768) {
    const scale = Math.min(targetSize / crop.w, targetSize / crop.h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.w * scale));
    canvas.height = Math.max(1, Math.round(crop.h * scale));
    const ctx = canvas.getContext('2d');
    ctx.filter = 'contrast(1.12) saturate(1.08) brightness(1.03)';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
    return {canvas, source: {x: crop.x, y: crop.y, scale}};
  }

  function detectionCrops(img) {
    const crops = [];
    const addGrid = (columns, rows, overlap) => {
      const stepX = img.width / columns;
      const stepY = img.height / rows;
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const x = Math.max(0, column * stepX - stepX * overlap);
          const y = Math.max(0, row * stepY - stepY * overlap);
          const right = Math.min(img.width, (column + 1) * stepX + stepX * overlap);
          const bottom = Math.min(img.height, (row + 1) * stepY + stepY * overlap);
          crops.push({x, y, w: right - x, h: bottom - y});
        }
      }
    };
    addGrid(2, 2, 0.22);
    if (Math.max(img.width, img.height) >= 720) addGrid(3, 3, 0.14);
    return crops;
  }

  function validFaceBox(box, rendered) {
    const imageArea = rendered.w * rendered.h;
    const boxArea = box.w * box.h;
    const aspect = box.w / box.h;
    const areaRatio = boxArea / imageArea;
    const reliableScore = box.score >= 0.34 || box.votes >= 2 || (box.pass === 'whole' && box.score >= 0.24);
    return box.w >= 20
      && box.h >= 20
      && aspect >= 0.5
      && aspect <= 1.75
      && areaRatio >= 0.00025
      && areaRatio <= 0.045
      && reliableScore;
  }

  async function detectFaces(img, rendered) {
    try {
      // MediaPipe runs in the browser; the selected photo is not sent to this PHP app or a custom API.
      const vision = await import(visionUrl);
      const fileset = await vision.FilesetResolver.forVisionTasks(wasmUrl);
      const boxes = [];
      for (const modelUrl of modelUrls) {
        try {
          const detector = await vision.FaceDetector.createFromOptions(fileset, {
            baseOptions: {modelAssetPath: modelUrl},
            runningMode: 'IMAGE',
            minDetectionConfidence: 0.2,
            minSuppressionThreshold: 0.18,
            maxResults: 40
          });
          const whole = detector.detect(img).detections || [];
          boxes.push(...whole.map(item => normalizedBox(item.boundingBox, rendered, undefined, {score: detectionScore(item), pass: 'whole'})));
          for (const crop of detectionCrops(img)) {
            const pass = detectionCanvas(img, crop);
            const detections = detector.detect(pass.canvas).detections || [];
            boxes.push(...detections.map(item => normalizedBox(item.boundingBox, rendered, pass.source, {score: detectionScore(item), pass: 'crop'})));
          }
          detector.close?.();
        } catch (modelError) {
          console.warn(modelError);
        }
      }
      return uniqueBoxes(boxes).filter(box => validFaceBox(box, rendered));
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async function open(dataUrl) {
    return new Promise(async resolve => {
      const node = shell();
      const canvas = node.querySelector('#aiFaceCanvas');
      const ctx = canvas.getContext('2d');
      const msg = node.querySelector('#aiEditorMessage');
      const img = await loadImage(dataUrl);
      const boxes = [];
      let selectedBox = null;
      let applied = false;
      let dragging = null;
      let moved = false;
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const rendered = {scale, x: (canvas.width - img.width * scale) / 2, y: (canvas.height - img.height * scale) / 2, w: img.width * scale, h: img.height * scale};

      function close(result) { node.remove(); resolve(result); }
      node.querySelector('.image-editor-close').onclick = () => close(null);

      function draw(showControls = true) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, rendered.x, rendered.y, rendered.w, rendered.h);
        if (applied) {
          boxes.filter(box => box.hidden).forEach(box => pixelate(ctx, box.x, box.y, box.w, box.h));
        }
        if (!showControls) return;
        boxes.forEach((box, index) => {
          ctx.strokeStyle = box.hidden ? '#c23b3b' : '#1f8f5f';
          ctx.lineWidth = box === selectedBox ? 6 : 4;
          ctx.strokeRect(box.x, box.y, box.w, box.h);
          ctx.fillStyle = box.hidden ? 'rgba(194,59,59,.86)' : 'rgba(31,143,95,.86)';
          const labelY = Math.max(0, box.y - 24);
          ctx.fillRect(box.x, labelY, 130, 22);
          ctx.fillStyle = '#fff';
          ctx.font = '12px Arial';
          ctx.fillText(box.hidden ? `Ocultar ${index + 1}` : 'Visivel', box.x + 8, labelY + 16);
          boxHandles(box).forEach(handle => {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = box.hidden ? '#c23b3b' : '#1f8f5f';
            ctx.lineWidth = 2;
            ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
          });
        });
      }

      function pointer(event) {
        const rect = canvas.getBoundingClientRect();
        return {x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height)};
      }

      function hitBox(x, y) {
        return boxes.find(box => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
      }

      function boxHandles(box) {
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        const right = box.x + box.w;
        const bottom = box.y + box.h;
        return [
          {name: 'nw', x: box.x, y: box.y, cursor: 'nwse-resize'},
          {name: 'n', x: cx, y: box.y, cursor: 'ns-resize'},
          {name: 'ne', x: right, y: box.y, cursor: 'nesw-resize'},
          {name: 'e', x: right, y: cy, cursor: 'ew-resize'},
          {name: 'se', x: right, y: bottom, cursor: 'nwse-resize'},
          {name: 's', x: cx, y: bottom, cursor: 'ns-resize'},
          {name: 'sw', x: box.x, y: bottom, cursor: 'nesw-resize'},
          {name: 'w', x: box.x, y: cy, cursor: 'ew-resize'}
        ];
      }

      function hitHandle(x, y) {
        for (let i = boxes.length - 1; i >= 0; i--) {
          const box = boxes[i];
          const handle = boxHandles(box).find(item => Math.abs(x - item.x) <= handleSize && Math.abs(y - item.y) <= handleSize);
          if (handle) return {box, handle};
        }
        return null;
      }

      function resizeBox(box, handle, x, y) {
        const frameLeft = rendered.x;
        const frameTop = rendered.y;
        const frameRight = rendered.x + rendered.w;
        const frameBottom = rendered.y + rendered.h;
        let left = box.x;
        let top = box.y;
        let right = box.x + box.w;
        let bottom = box.y + box.h;
        if (handle.includes('w')) left = Math.max(frameLeft, Math.min(x, right - minBoxSize));
        if (handle.includes('e')) right = Math.min(frameRight, Math.max(x, left + minBoxSize));
        if (handle.includes('n')) top = Math.max(frameTop, Math.min(y, bottom - minBoxSize));
        if (handle.includes('s')) bottom = Math.min(frameBottom, Math.max(y, top + minBoxSize));
        box.x = left;
        box.y = top;
        box.w = right - left;
        box.h = bottom - top;
      }

      function setCursor(x, y) {
        const handle = hitHandle(x, y);
        if (handle) {
          canvas.style.cursor = handle.handle.cursor;
          return;
        }
        canvas.style.cursor = hitBox(x, y) ? 'move' : 'default';
      }

      canvas.onmousedown = event => {
        const {x, y} = pointer(event);
        const handle = hitHandle(x, y);
        moved = false;
        if (handle) {
          dragging = {mode: 'resize', box: handle.box, handle: handle.handle.name};
          selectedBox = handle.box;
          return;
        }
        const hit = hitBox(x, y);
        if (hit) {
          selectedBox = hit;
          dragging = {mode: 'move', box: hit, dx: x - hit.x, dy: y - hit.y};
        }
      };
      canvas.onmousemove = event => {
        const {x, y} = pointer(event);
        if (!dragging) {
          setCursor(x, y);
          return;
        }
        moved = true;
        if (dragging.mode === 'resize') {
          resizeBox(dragging.box, dragging.handle, x, y);
        } else {
          dragging.box.x = Math.max(rendered.x, Math.min(rendered.x + rendered.w - dragging.box.w, x - dragging.dx));
          dragging.box.y = Math.max(rendered.y, Math.min(rendered.y + rendered.h - dragging.box.h, y - dragging.dy));
        }
        draw();
      };
      canvas.onmouseup = () => { dragging = null; };
      canvas.onmouseleave = () => {
        dragging = null;
        canvas.style.cursor = 'default';
      };
      canvas.onclick = event => {
        if (moved) {
          moved = false;
          return;
        }
        const {x, y} = pointer(event);
        const hit = hitBox(x, y);
        if (!hit) return;
        selectedBox = hit;
        hit.hidden = !hit.hidden;
        msg.textContent = hit.hidden ? 'Este rosto sera ocultado.' : 'Este rosto ficara visivel. Os demais marcados em vermelho serao ocultados.';
        draw();
      };

      node.querySelector('#aiDetect').onclick = async () => {
        msg.textContent = 'Detectando rostos no navegador...';
        boxes.splice(0, boxes.length, ...(await detectFaces(img, rendered)));
        selectedBox = null;
        msg.textContent = boxes.length ? `${boxes.length} rosto(s) detectado(s). Clique nos rostos que devem ficar visiveis para desmarcar a ocultacao.` : 'Erro na deteccao de rosto. Use Adicionar area manual para marcar rostos ausentes.';
        draw();
      };
      node.querySelector('#aiAddBox').onclick = () => {
        selectedBox = {x: rendered.x + 40, y: rendered.y + 40, w: 150, h: 150, hidden: true};
        boxes.push(selectedBox);
        msg.textContent = 'Area adicionada. Ajuste o quadro e clique nela se essa area deve ficar visivel.';
        draw();
      };
      node.querySelector('#aiRemoveBox').onclick = () => {
        if (!selectedBox) {
          msg.textContent = 'Clique primeiro no quadrinho que deseja remover.';
          return;
        }
        const index = boxes.indexOf(selectedBox);
        if (index >= 0) boxes.splice(index, 1);
        selectedBox = null;
        msg.textContent = 'Selecao removida.';
        draw();
      };
      node.querySelector('#aiApply').onclick = () => {
        applied = true;
        if (!boxes.some(box => box.hidden)) msg.textContent = 'Nenhum rosto esta marcado para ocultar.';
        else msg.textContent = 'Os rostos marcados em vermelho foram ocultados.';
        draw();
      };
      node.querySelector('#aiReset').onclick = () => {
        applied = false;
        boxes.forEach(box => { box.hidden = true; });
        msg.textContent = 'Imagem restaurada. Clique nos rostos que devem ficar visiveis.';
        draw();
      };
      node.querySelector('#aiSave').onclick = () => {
        if (!applied) {
          applied = true;
        }
        draw(false);
        close(canvas.toDataURL('image/jpeg', .9));
      };

      draw();
      node.querySelector('#aiDetect').click();
    });
  }

  window.AiFaceImageEditor = {open, detectFaces};
})();
