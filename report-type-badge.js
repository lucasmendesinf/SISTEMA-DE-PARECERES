function addReportTypeBadges(){
  document.querySelectorAll('#reportsList .report-row').forEach(row=>{
    const action = row.querySelector('.actions button[onclick^="editReport"]');
    const title = row.querySelector('h3');
    if(!action || !title || row.querySelector('.report-type-badge')) return;
    const match = action.getAttribute('onclick').match(/editReport\(([^)]+)\)/);
    if(!match) return;
    const id = match[1].replace(/^["']|["']$/g,'');
    const report = data.reports.find(item=>String(item.id)===id || String(item.databaseId)===id);
    if(!report) return;
    const badge = document.createElement('span');
    const isPortfolio = report.documentType === 'portfolio';
    badge.className = `report-type-badge ${isPortfolio ? 'portfolio' : 'pedagogical'}`;
    badge.textContent = isPortfolio ? 'Portfólio' : 'Parecer Pedagógico';
    row.classList.add(isPortfolio ? 'type-portfolio' : 'type-pedagogical');
    title.insertAdjacentElement('afterend',badge);
  });
}

new MutationObserver(addReportTypeBadges).observe(document.querySelector('#reportsList'),{childList:true,subtree:true});
addReportTypeBadges();
