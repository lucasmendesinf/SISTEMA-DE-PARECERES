// Agrupa a lista de documentos por tipo: abas Todos / Pareceres / Portfólios
// e, na aba Todos, dois blocos separados (Pareceres Pedagógicos e Portfólios).
const REPORT_TYPE_KEY = 'reportTypeFilter';
let reportTypeFilter = 'all';
try { reportTypeFilter = localStorage.getItem(REPORT_TYPE_KEY) || 'all'; } catch (_) {}
if (!['all', 'parecer', 'portfolio'].includes(reportTypeFilter)) reportTypeFilter = 'all';

const REPORT_GROUPS = {
  parecer: { title: 'Pareceres Pedagógicos', newLabel: '+ Novo parecer', empty: 'Nenhum parecer nesta categoria.' },
  portfolio: { title: 'Portfólios', newLabel: '+ Novo portfólio', empty: 'Nenhum portfólio nesta categoria.' }
};

function reportGroupType(report) {
  return report?.documentType === 'portfolio' ? 'portfolio' : 'parecer';
}

function updateReportTypeTabs(reports) {
  const counts = { all: reports.length, parecer: 0, portfolio: 0 };
  reports.forEach(report => counts[reportGroupType(report)]++);
  document.querySelectorAll('#reportTypeTabs [data-report-type]').forEach(button => {
    const type = button.dataset.reportType;
    button.classList.toggle('active', type === reportTypeFilter);
    button.setAttribute('aria-selected', type === reportTypeFilter ? 'true' : 'false');
    const count = button.querySelector('.count');
    if (count) count.textContent = counts[type] ?? 0;
  });
}

function reportGroupsHtml(reports, rowHtml) {
  updateReportTypeTabs(reports);
  const byType = type => reports.filter(report => reportGroupType(report) === type);
  const empty = type => `<p class="muted report-group-empty">${REPORT_GROUPS[type].empty}</p>`;
  if (reportTypeFilter !== 'all') {
    const list = byType(reportTypeFilter);
    return list.map(rowHtml).join('') || empty(reportTypeFilter);
  }
  return ['parecer', 'portfolio'].map(type => {
    const list = byType(type);
    return `<section class="report-group ${type}"><div class="report-group-head"><h3>${REPORT_GROUPS[type].title}</h3><span class="count">${list.length}</span><button class="secondary report-group-new" type="button" onclick="startDocumentOfType('${type}')">${REPORT_GROUPS[type].newLabel}</button></div><div class="report-group-list">${list.map(rowHtml).join('') || empty(type)}</div></section>`;
  }).join('');
}

function setReportTypeFilter(type) {
  reportTypeFilter = type;
  try { localStorage.setItem(REPORT_TYPE_KEY, type); } catch (_) {}
  if (typeof render === 'function') render();
}

function startDocumentOfType(type) {
  document.querySelector('#openGenerator')?.click();
  const select = document.querySelector('#wizardDocumentType');
  if (!select) return;
  select.value = type;
  select.dispatchEvent(new Event('change'));
}

document.addEventListener('click', event => {
  const button = event.target.closest('#reportTypeTabs [data-report-type]');
  if (button) setReportTypeFilter(button.dataset.reportType);
});
