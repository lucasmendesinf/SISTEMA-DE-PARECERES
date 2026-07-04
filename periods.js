function periodForm(){
  open(`<h2 class="modal-title">Novo período avaliativo</h2><p class="modal-subtitle">O novo período ficará ativo para os próximos documentos e atividades.</p><div class="form-grid"><div class="field"><label>Nome do período</label><input id="periodName" required autofocus placeholder="Ex.: 2º semestre de 2026"></div><div class="field"><label>Data de início</label><input id="periodStart" type="date"></div><div class="field"><label>Data de término</label><input id="periodEnd" type="date"></div></div><div class="form-actions"><button class="secondary" type="button" onclick="document.querySelector('#modal').close()">Cancelar</button><button class="primary" type="button" onclick="addPeriodSave()">Salvar período</button></div>`);
}

async function loadPeriods(){
  try{
    const response = await fetch('api.php?resource=periods');
    if(!response.ok) throw new Error('Não foi possível carregar os períodos.');
    data.periods = await response.json();
    render();
  }catch(error){console.warn(error);}
}

async function addPeriodSave(){
  const name = $('#periodName').value.trim();
  if(!name) return $('#periodName').focus();
  try{
    const response = await fetch('api.php?resource=periods',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,start:$('#periodStart').value,end:$('#periodEnd').value})});
    const result = await response.json();
    if(!response.ok) throw new Error(result.error || 'Não foi possível salvar o período.');
    close();
    await loadPeriods();
  }catch(error){alert(error.message);}
}

async function deletePeriod(periodId){
  const period = data.periods.find(item => String(item.id) === String(periodId));
  if(!period) return;
  if(!window.confirm(`Excluir o período “${period.name}”? Esta ação não pode ser desfeita.`)) return;
  try{
    const response = await fetch(`api.php?resource=periods&id=${encodeURIComponent(periodId)}`,{method:'DELETE'});
    const result = await response.json();
    if(!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível excluir o período.');
    await loadPeriods();
  }catch(error){alert(error.message);}
}

function addPeriodDeleteButtons(){
  const cards = document.querySelectorAll('#periodsList .student-card');
  cards.forEach((card,index)=>{
    const period = data.periods[index];
    if(!period || card.querySelector('.delete-period')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary delete-period';
    button.textContent = 'Excluir período';
    button.addEventListener('click',()=>deletePeriod(period.id));
    card.appendChild(button);
  });
}

new MutationObserver(addPeriodDeleteButtons).observe(document.querySelector('#periodsList'),{childList:true,subtree:true});
$('#addPeriod').onclick = periodForm;
loadPeriods();
