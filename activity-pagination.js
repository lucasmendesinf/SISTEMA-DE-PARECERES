(() => {
  const pageSize = 6;
  let currentPage = 1;
  const list = document.querySelector('#activitiesList');
  const searchInput = document.querySelector('#activitySearch');
  if (!list) return;

  function renderPagination() {
    const cards = [...list.querySelectorAll('.activity-card')];
    const query = searchInput?.value.trim().toLocaleLowerCase('pt-BR') || '';
    const matchingCards = cards.filter(card => card.textContent.toLocaleLowerCase('pt-BR').includes(query));
    const totalPages = Math.max(1, Math.ceil(matchingCards.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    cards.forEach(card => { card.hidden = true; });
    matchingCards.forEach((card, index) => { card.hidden = index < start || index >= start + pageSize; });

    let controls = document.querySelector('#activityPagination');
    if (!controls) {
      controls = document.createElement('nav');
      controls.id = 'activityPagination';
      controls.className = 'activity-pagination';
      controls.setAttribute('aria-label', 'Paginação de atividades');
      list.insertAdjacentElement('afterend', controls);
    }
    let emptySearch = document.querySelector('#activitySearchEmpty');
    if (!emptySearch) {
      emptySearch = document.createElement('p');
      emptySearch.id = 'activitySearchEmpty';
      emptySearch.className = 'muted';
      emptySearch.textContent = 'Nenhuma atividade encontrada para esta busca.';
      controls.insertAdjacentElement('beforebegin', emptySearch);
    }
    emptySearch.hidden = cards.length === 0 || matchingCards.length > 0;
    if (matchingCards.length <= pageSize) {
      controls.innerHTML = '';
      controls.hidden = true;
      return;
    }
    controls.hidden = false;
    const button = (label, page, disabled = false, active = false) => `<button type="button" class="secondary${active ? ' active-page' : ''}" data-page="${page}" ${disabled ? 'disabled' : ''}>${label}</button>`;
    let html = button('‹ Anterior', currentPage - 1, currentPage === 1);
    for (let page = 1; page <= totalPages; page++) html += button(String(page), page, false, page === currentPage);
    html += button('Próxima ›', currentPage + 1, currentPage === totalPages);
    controls.innerHTML = html;
    controls.querySelectorAll('[data-page]').forEach(buttonElement => buttonElement.addEventListener('click', () => {
      currentPage = Number(buttonElement.dataset.page);
      renderPagination();
      list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  new MutationObserver(renderPagination).observe(list, { childList: true });
  searchInput?.addEventListener('input', () => { currentPage = 1; renderPagination(); });
  renderPagination();
})();
