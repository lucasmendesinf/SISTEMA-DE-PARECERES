function addReportTypeBadges(){
  document.querySelectorAll('#reportsList .report-row').forEach(row=>{
    const action = row.querySelector('.actions button[onclick^="editReport"]');
    const title = row.querySelector('h3');
    if(!action || !title || row.querySelector('.report-type-badge')) return;
    const match = action.getAttribute('onclick').match(/editReport\(([^)]+)\)/);
    if(!match) return;
    const report = data.reports.find(item=>String(item.id)===String(match[1]));
    if(!report || report.status !== 'done') return;
    const badge = document.createElement('span');
    const isPortfolio = report.documentType === 'portfolio';
    badge.className = `report-type-badge ${isPortfolio ? 'portfolio' : 'pedagogical'}`;
    badge.textContent = isPortfolio ? 'Portfólio' : 'Parecer Pedagógico';
    title.insertAdjacentElement('afterend',badge);
  });
}

new MutationObserver(addReportTypeBadges).observe(document.querySelector('#reportsList'),{childList:true,subtree:true});
addReportTypeBadges();
