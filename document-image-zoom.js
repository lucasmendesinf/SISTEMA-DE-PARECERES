(() => {
  let viewer = null;

  function ensureViewer() {
    const host = document.querySelector('#modal[open]') || document.body;
    if (viewer) {
      if (viewer.parentElement !== host) host.append(viewer);
      return viewer;
    }
    viewer = document.createElement('div');
    viewer.className = 'document-image-zoom';
    viewer.hidden = true;
    viewer.innerHTML = `
      <div class="document-image-zoom-panel" role="dialog" aria-modal="true" aria-label="Imagem ampliada">
        <button class="document-image-zoom-close" type="button" aria-label="Fechar imagem ampliada">x</button>
        <img alt="Imagem ampliada do documento">
      </div>`;
    host.append(viewer);
    viewer.addEventListener('click', event => {
      if (event.target === viewer || event.target.closest('.document-image-zoom-close')) closeViewer();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && viewer && !viewer.hidden) closeViewer();
    });
    return viewer;
  }

  function openViewer(src, alt = 'Imagem ampliada do documento') {
    const node = ensureViewer();
    const image = node.querySelector('img');
    image.src = src;
    image.alt = alt;
    node.hidden = false;
  }

  function closeViewer() {
    if (!viewer) return;
    viewer.hidden = true;
    const image = viewer.querySelector('img');
    if (image) image.removeAttribute('src');
  }

  document.addEventListener('click', event => {
    const image = event.target.closest('.review-box .activity-photos img');
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    openViewer(image.currentSrc || image.src, image.alt);
  });

  function markZoomableImages(root = document) {
    root.querySelectorAll('.review-box .activity-photos img').forEach(image => {
      image.classList.add('document-image-zoomable');
      image.title = 'Clique para ampliar';
    });
  }

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node instanceof Element) markZoomableImages(node);
      });
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    markZoomableImages();
    observer.observe(document.body, {childList: true, subtree: true});
  });
})();
