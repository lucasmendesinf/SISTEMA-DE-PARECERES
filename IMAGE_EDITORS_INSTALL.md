# Editores de imagem e anonimização

## Bibliotecas usadas

O portal carrega as bibliotecas sob demanda no navegador:

- Cropper.js: `https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js`
- Fabric.js: `https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js`
- MediaPipe Tasks Vision: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs`
- Modelo Face Detector: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite`

Nao ha instalacao via npm neste projeto. Para uso offline, baixe esses arquivos para `assets/vendor/` e ajuste as URLs em:

- `manual-image-editor.js`
- `ai-face-editor.js`

## Permissao por usuario

O campo `usuarios.image_editor_permission` aceita:

- `none`: upload simples, sem editor.
- `manual`: editor manual com corte, pixelado e tarja.
- `ai`: editor com deteccao de rostos via MediaPipe.
- `both`: permite escolher entre manual e IA.

O administrador configura isso em **Usuarios e permissoes**.

## Fluxo

1. A professora seleciona fotos da atividade ou do parecer.
2. O sistema consulta a permissao carregada pelo login.
3. Se houver um editor liberado, ele abre antes de salvar.
4. A imagem final editada substitui a original no payload.
5. O backend valida o modo enviado em `imageEditorMode`.
6. O PDF/DOCX usa a imagem final salva no banco.

Por LGPD, o fluxo atual nao guarda a imagem original separadamente.
