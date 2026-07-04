function normalizeDocumentType(value){return value==='portfolio'?'portfolio':'parecer'}
function documentTypeLabel(value){return normalizeDocumentType(value)==='portfolio'?'PORTF\u00d3LIO':'PARECER PEDAG\u00d3GICO'}
function documentTypePreview(){let period=(data.periods||[]).find(item=>item.active)||(data.periods||[])[0];let periodName=period?.name||'Periodo avaliativo';return `<h3 style="font:700 12px Arial,sans-serif;text-align:center;margin:28px 0 20px">${documentTypeLabel(wizard.documentType)} - ${esc(periodName).toUpperCase()}</h3>`}

function adjustTextWithAI(){
  let field=$('#wizardText')||$('#wizardPhotoNote')||$('#reportText');
  if(!field)return;
  let text=field.value.trim();
  if(!text){field.focus();return alert('Escreva um texto antes de solicitar o ajuste.');}
  let adjusted=text.split(/\n{2,}/).map(paragraph=>{
    let clean=paragraph.replace(/\s+/g,' ').replace(/\s*([,.;:!?])\s*/g,'$1 ').trim();
    if(!clean)return '';
    clean=clean.charAt(0).toUpperCase()+clean.slice(1);
    return /[.!?]$/.test(clean)?clean:clean+'.';
  }).filter(Boolean).join('\n\n');
  field.value=adjusted;
  field.dispatchEvent(new Event('input',{bubbles:true}));
  field.focus();
}

function wizardActivitiesV2(){
  if($('#wizardText'))bufferStepOne();
  if(!wizard.text?.trim())return wizardStart();
  let activities=data.activities.map(activity=>`<label class="linked-activity"><input class="wizard-activity" type="checkbox" value="${activity.id}" ${(wizard.activityIds||[]).includes(activity.id)?'checked':''}><span><strong>${esc(activity.title)}</strong><small>${esc(activity.date)} · ${esc(activity.area)}</small></span>${activity.photos?.[0]?`<img src="${activity.photos[0]}" alt="Foto">`:''}</label>`).join('')||'<p class="muted">Nenhuma atividade cadastrada.</p>';
  let previews=(wizard.photos||[]).map(src=>`<img src="${src}" alt="Prévia">`).join('');
  wizardOpen(`<p class="wizard-step">ETAPA 2 DE 3 · ATIVIDADES E FOTOS</p><h2 class="modal-title">Vivências realizadas</h2><p class="modal-subtitle">Selecione atividades já cadastradas ou adicione uma nova vivência.</p><div class="field"><label>Atividades cadastradas</label><div class="linked-activities">${activities}</div><button class="ai-adjust" type="button" onclick="useRegisteredActivities()">+ Usar atividades selecionadas no documento</button></div><div class="field"><label>Fotos da atividade <span class="muted">(até 3 imagens)</span></label><label id="wizardDropzone" class="dropzone" ondragover="wizardDrag(event)" ondragleave="wizardLeave()" ondrop="wizardDrop(event)"><strong>Arraste as imagens aqui</strong><span>ou clique para escolher arquivos</span><input id="wizardPhotos" type="file" accept="image/*" multiple onchange="wizardPhotoCheck(this)"></label><div id="wizardPreviews" class="image-previews">${previews}</div></div><div class="field"><label>Informações sobre a brincadeira ou as fotos</label><textarea id="wizardPhotoNote" rows="4" oninput="bufferStepTwo()" placeholder="Descreva o que aconteceu, o que o aluno explorou ou demonstrou nas imagens...">${esc(wizard.photoNote||'')}</textarea><button class="ai-adjust" type="button" onclick="adjustTextWithAI();bufferStepTwo()">✦ Revisar texto com IA</button><small class="muted">Organiza a escrita e a pontuação, sem mudar as informações registradas.</small></div><div class="form-actions"><button class="secondary" type="button" onclick="wizardStart()">Voltar</button><button class="secondary" type="button" onclick="saveDraftEverywhere()">Salvar rascunho</button><button class="primary" type="button" onclick="wizardReviewV2()">Próximo</button></div>`);
}

function wizardStart(newRegistration=false,draft=null){
  let options=data.students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if(newRegistration){clearWizard();wizard={}}else if(draft){wizard=draft}else{wizard=JSON.parse(localStorage.getItem(WIZARD_KEY)||'null')||{}};
  wizard.documentType=normalizeDocumentType(wizard.documentType);
  wizardOpen(`<p class="wizard-step">ETAPA 1 DE 3 · TEXTO PRINCIPAL</p><h2 class="modal-title">Novo documento pedag\u00f3gico</h2><p class="modal-subtitle">Escolha o tipo de documento e registre as observa\u00e7\u00f5es mais importantes. O rascunho \u00e9 salvo neste dispositivo.</p><div class="form-grid"><div class="field"><label>Aluno</label><select id="wizardStudent" onchange="bufferStepOne()">${options}</select></div><div class="field"><label>Tipo de documento</label><select id="wizardDocumentType" onchange="bufferStepOne()"><option value="parecer">Parecer Pedag\u00f3gico</option><option value="portfolio">Portf\u00f3lio</option></select></div><div class="field"><label>Informa\u00e7\u00f5es sobre o aluno</label><textarea id="wizardText" oninput="bufferStepOne()" placeholder="Descreva as informa\u00e7\u00f5es do aluno: conquistas, intera\u00e7\u00f5es, interesses, autonomia e aspectos que merecem acompanhamento...">${esc(wizard.text||'')}</textarea><button class="ai-adjust" type="button" onclick="adjustTextWithAI();bufferStepOne()">✦ Ajustar texto com IA</button></div></div><div class="form-actions"><button class="secondary" type="button" onclick="wizardClose()">Voltar</button><button class="secondary" type="button" onclick="saveInitialDraft()">Salvar rascunho</button><button class="primary" type="button" onclick="wizardActivitiesV2()">Pr\u00f3ximo</button></div>`);
  if(wizard.studentId)$('#wizardStudent').value=wizard.studentId;
  $('#wizardDocumentType').value=wizard.documentType;
}

function bufferStepOne(){
  let student=$('#wizardStudent'),text=$('#wizardText'),type=$('#wizardDocumentType');
  if(student)wizard.studentId=student.value;
  if(text)wizard.text=text.value;
  if(type)wizard.documentType=normalizeDocumentType(type.value);
  persistWizard();
}

function wizardReport(){
  let entries=wizardEntries(),activityIds=[...new Set(entries.flatMap(item=>item.activityIds||[]))],photos=entries.flatMap(item=>item.photos||[]),photoNote=entries.map(item=>item.photoNote).filter(Boolean).join('\n\n'),documentType=normalizeDocumentType(wizard.documentType);
  let found=data.reports.find(r=>String(r.studentId)===String(wizard.studentId)&&normalizeDocumentType(r.documentType)===documentType),payload={text:wizard.text||'',activityIds,photoNote,photos,entries,documentType};
  if(found){Object.assign(found,payload);return found}
  let report={id:Date.now(),studentId:wizard.studentId,status:'draft',...payload};data.reports.unshift(report);return report;
}

async function saveInitialDraft(){
  bufferStepOne();let student=data.students.find(s=>String(s.id)===String(wizard.studentId));
  if(!student)return alert('Selecione uma crian\u00e7a antes de salvar.');
  try{
    let response=await fetch('api.php?resource=reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:true,student:{name:student.name,birthDate:student.birthDate||'',classId:student.classId||1},text:wizard.text||'',documentType:normalizeDocumentType(wizard.documentType),activityIds:[],entries:[],imageEditorMode:wizard.imageEditorMode||'none'})});
    let result=await response.json();if(!response.ok)throw new Error(result.error||'Erro ao salvar o rascunho.');
    let report=wizardReport();report.databaseId=result.id;persistWizard();save();alert('Rascunho salvo com sucesso no banco de dados.');
  }catch(error){alert(error.message)}
}

async function saveDraftEverywhere(){
  try{
    if($('#wizardText'))bufferStepOne();if($('#wizardPhotoNote'))bufferStepTwo();
    let student=data.students.find(s=>String(s.id)===String(wizard.studentId));if(!student)throw new Error('Selecione uma crian\u00e7a antes de salvar.');
    let entries=wizardEntries(),activityIds=[...new Set(entries.flatMap(entry=>entry.activityIds||[]))];
    let response=await fetch('api.php?resource=reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:true,student:{name:student.name,birthDate:student.birthDate||'',classId:student.classId||1},text:wizard.text||'',documentType:normalizeDocumentType(wizard.documentType),activityIds,entries,imageEditorMode:wizard.imageEditorMode||'none'})});
    let result=await response.json();if(!response.ok)throw new Error(result.error||'Erro ao salvar o rascunho.');
    let report=wizardReport();report.databaseId=result.id;persistWizard();save();alert('Rascunho salvo com sucesso no banco de dados.');
  }catch(error){console.error(error);alert(error.message)}
}

function wizardReviewV2(){
  bufferStepTwo();importSelectedRegisteredActivities();persistWizard();
  let student=data.students.find(x=>String(x.id)===String(wizard.studentId));if(!student)return alert('N\u00e3o foi poss\u00edvel localizar a crian\u00e7a deste documento.');
  wizardOpen(`<p class="wizard-step">ETAPA 3 DE 3 · REVIS\u00c3O</p><h2 class="modal-title">Rascunho do documento</h2><p class="modal-subtitle">Pr\u00e9via formatada para o documento final.</p><div class="review-box">${configuredHeaderHtml()}${studentDocumentHeader(student)}${documentTypePreview()}${documentDraftHtml()}</div><div class="form-actions"><button class="secondary" type="button" onclick="wizardActivitiesV2()">Voltar</button><button class="secondary" type="button" onclick="wizardAddMore()">Adicionar mais</button><button class="secondary" type="button" onclick="saveWizardDraft()">Salvar rascunho</button><button class="primary" type="button" onclick="wizardFinalizeV3()">Finalizar documento</button></div>`);
}

async function wizardFinalizeV3(){
  try{
    bufferStepTwo();let report=wizardReport(),student=data.students.find(x=>String(x.id)===String(report.studentId));
    let response=await fetch('api.php?resource=reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({student:{name:student.name,birthDate:student.birthDate||'',classId:student.classId||1},text:report.text,documentType:report.documentType,activityIds:report.activityIds,entries:report.entries,imageEditorMode:wizard.imageEditorMode||'none'})});
    let result=await response.json();if(!response.ok)throw new Error(result.error||'Falha ao salvar no banco.');
    report.databaseId=result.id;report.status='review';save();
    wizardOpen(`<p class="wizard-step">PR\u00c9VIA FINAL</p><h2 class="modal-title">Documento pronto para entrega</h2><p class="modal-subtitle">Rascunho salvo no banco de dados. Confira antes de entregar.</p><div class="review-box">${configuredHeaderHtml()}${studentDocumentHeader(student)}${documentTypePreview()}${documentDraftHtml()}</div><div class="form-actions"><button class="secondary" type="button" onclick="wizardReviewV2()">Voltar para edi\u00e7\u00e3o</button><button class="primary" type="button" onclick="deliverReport(${report.id})">Entregar documento</button></div>`);
  }catch(error){console.error(error);alert(error.message)}
}

function downloadReport(id){
  let report=data.reports.find(r=>String(r.id)===String(id)),student=report&&data.students.find(s=>String(s.id)===String(report.studentId));if(!report||!student)return;
  let period=data.periods.find(p=>p.active)||data.periods[0],className=student.className||data.classes.find(c=>String(c.id)===String(student.classId))?.name||'Turma n\u00e3o informada',header=JSON.parse(localStorage.getItem(HEADER_KEY)||'{}'),form=document.createElement('form');
  form.method='post';form.action='download_parecer.php';form.target='_blank';
  let fields={name:student.name,birthDate:student.birthDate||'',className,period:period?.name||'Per\u00edodo avaliativo',text:report.text||'',documentType:normalizeDocumentType(report.documentType),studentPhoto:student.photo||'',entries:JSON.stringify(report.entries||[]),headerNetwork:header.network||'',headerSchool:header.school||'',headerContact:header.contact||'',headerLogo:header.logo||''};
  Object.entries(fields).forEach(([name,value])=>{let input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input)});document.body.appendChild(form);form.submit();form.remove();
}

async function pdfJpeg(dataUrl){
  if(!dataUrl) return '';
  if(/^data:image\/(?:jpeg|jpg);base64,/i.test(dataUrl)) return dataUrl;
  try{return await new Promise(resolve=>{const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);resolve(canvas.toDataURL('image/jpeg',.9));};image.onerror=()=>resolve('');image.src=dataUrl;});}catch{return ''}
}

async function downloadPdf(id){
  let report=data.reports.find(r=>String(r.id)===String(id)),student=report&&data.students.find(s=>String(s.id)===String(report.studentId));if(!report||!student)return;
  let period=data.periods.find(p=>p.active)||data.periods[0],className=student.className||data.classes.find(c=>String(c.id)===String(student.classId))?.name||'Turma não informada',header=JSON.parse(localStorage.getItem(HEADER_KEY)||'{}');
  let entries=await Promise.all((report.entries||[]).map(async entry=>({...entry,photos:(await Promise.all((entry.photos||[]).map(pdfJpeg))).filter(Boolean)})));
  let form=document.createElement('form');form.method='post';form.action='download_pdf.php';form.target='_blank';
  let fields={name:student.name,birthDate:student.birthDate||'',className,period:period?.name||'Período avaliativo',text:report.text||'',documentType:normalizeDocumentType(report.documentType),studentPhoto:await pdfJpeg(student.photo||''),entries:JSON.stringify(entries),headerNetwork:header.network||'',headerSchool:header.school||'',headerContact:header.contact||'',headerLogo:await pdfJpeg(header.logo||'')};
  Object.entries(fields).forEach(([name,value])=>{let input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input)});document.body.appendChild(form);form.submit();form.remove();
}

function editReport(id){
  let report=data.reports.find(r=>String(r.id)===String(id));if(!report)return;
  let draft={studentId:report.studentId,text:report.text||'',documentType:normalizeDocumentType(report.documentType),activityIds:[],photoNote:'',photos:[],entries:report.entries||[{activityIds:report.activityIds||[],photoNote:report.photoNote||'',photos:report.photos||[]}]};
  wizard=draft;let student=data.students.find(s=>String(s.id)===String(report.studentId));
  if(report.status==='done'){wizardOpen(`<p class="wizard-step">DOCUMENTO ENTREGUE</p><h2 class="modal-title">Revis\u00e3o do documento</h2><p class="modal-subtitle">Visualiza\u00e7\u00e3o completa do documento entregue.</p><div class="review-box">${configuredHeaderHtml()}${studentDocumentHeader(student)}${documentTypePreview()}${documentDraftHtml()}</div><div class="form-actions"><button class="secondary" type="button" onclick="wizardClose()">Fechar</button><button class="secondary" type="button" onclick="reopenReport(${report.id})">Reabrir documento</button><button class="secondary" type="button" onclick="downloadPdf(${report.id})">Baixar PDF</button><button class="primary" type="button" onclick="downloadReport(${report.id})">Baixar DOCX</button></div>`);return}
  persistWizard();wizardStart(false,draft);
}

$('#openGenerator').onclick=()=>wizardStart(true);
