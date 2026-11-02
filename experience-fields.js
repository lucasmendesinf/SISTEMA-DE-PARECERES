let editingExperienceFieldId = null;

function experienceOptions(selected = ''){
  const fields = data.experienceFields || [];
  const options = fields.map(field => `<option value="${esc(field.name)}" ${field.name===selected?'selected':''}>${esc(field.name)}</option>`).join('');
  return `${options}<option value="__manage__">+ Adicionar ou gerenciar campos</option>`;
}

async function loadExperienceFields(){
  try{
    const response = await fetch('api.php?resource=experience-fields');
    if(!response.ok) throw new Error();
    data.experienceFields = await response.json();
  }catch(error){
    console.warn('Não foi possível carregar os campos de experiência.',error);
    data.experienceFields = data.experienceFields || [];
  }
}

function activityFormV2(){
  activityFiles=[];
  // Atividade nova: esquece o id de um envio anterior que tenha parado no meio
  // (ver addActivitySaveV2 em app.js e activity-upload.js).
  window.pendingActivityId=null;
  window.currentImageEditorMode='none';
  const draft = typeof activityDraft === 'function' ? activityDraft() : {};
  const options = experienceOptions(draft.area || '');
  open(`<h2 class="modal-title">Registrar atividade</h2><p class="modal-subtitle">Conte o que a turma viveu e registre até 50 fotos da atividade.</p><div class="form-grid"><div class="field"><label>Título da atividade</label><input id="activityTitle" required autofocus placeholder="Ex.: Exploração do jardim" value="${esc(draft.title||'')}"></div><div class="field"><label>Campo de experiência <button type="button" class="manage-experience" onclick="openExperienceManager()">Gerenciar campos</button></label><select id="activityArea" onchange="handleExperienceChoice(this);saveActivityDraft()">${options}</select></div><div class="field"><label>Observações da professora</label><textarea id="activityNote" rows="4" placeholder="O que os alunos fizeram, disseram ou descobriram?">${esc(draft.note||'')}</textarea></div><div class="field"><label>Fotos da atividade <span class="muted">(até 50 imagens)</span></label><div class="activity-upload-actions"><label class="secondary activity-upload-button" for="activityPhotos">Escolher fotos</label><label class="secondary activity-upload-button activity-camera-button" for="activityCamera">Abrir camera</label></div><input id="activityPhotos" class="activity-file-input" type="file" accept="image/*" multiple data-append="1" onchange="selectActivityPhotos(this)"><input id="activityCamera" class="activity-file-input" type="file" accept="image/*" capture="environment" data-append="1" onchange="selectActivityPhotos(this)"><div id="imagePreviews" class="image-previews"></div><small class="muted">Escolha fotos da galeria ou use a camera no celular.</small><small id="activityPhotoLimit" class="photo-limit">${window.PortalActivityPhotos ? window.PortalActivityPhotos.limitText(0) : '0 de 50 fotos.'}</small></div></div><div class="form-actions"><button class="secondary" type="button" onclick="document.querySelector('#modal').close()">Cancelar</button><button class="primary" type="button" onclick="addActivitySaveV2()">Registrar atividade</button></div>`);
}

function handleExperienceChoice(select){
  if(select.value !== '__manage__') return;
  select.value = data.experienceFields?.[0]?.name || '';
  openExperienceManager(true);
}

function ensureExperienceDialog(){
  let dialog = document.querySelector('#experienceModal');
  if(dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'experienceModal';
  dialog.className = 'experience-manager';
  document.body.appendChild(dialog);
  return dialog;
}

function openExperienceManager(focusInput = false){
  const dialog = ensureExperienceDialog();
  editingExperienceFieldId = null;
  renderExperienceManager();
  if(!dialog.open) dialog.showModal();
  if(focusInput) setTimeout(()=>document.querySelector('#experienceName')?.focus(),0);
}

function renderExperienceManager(){
  const dialog = ensureExperienceDialog();
  const fields = data.experienceFields || [];
  const editing = fields.find(field=>field.id===editingExperienceFieldId);
  dialog.innerHTML = `<button class="close" type="button" aria-label="Fechar" onclick="document.querySelector('#experienceModal').close()">×</button><h2 class="modal-title">Gerenciar campos</h2><p class="modal-subtitle">Cadastre, edite ou remova os campos usados nas atividades.</p><div class="experience-list">${fields.map(field=>`<div class="experience-row"><span>${esc(field.name)}</span><button class="secondary" type="button" onclick="startExperienceEdit(${field.id})">Editar</button><button class="secondary experience-delete" type="button" onclick="deleteExperienceField(${field.id})">Excluir</button></div>`).join('') || '<p class="muted">Nenhum campo cadastrado.</p>'}</div><div class="field"><label>${editing?'Editar campo':'Novo campo de experiência'}</label><input id="experienceName" value="${esc(editing?.name||'')}" placeholder="Ex.: Corpo, gestos e movimentos"></div><div class="form-actions">${editing?'<button class="secondary" type="button" onclick="cancelExperienceEdit()">Cancelar edição</button>':''}<button class="primary" type="button" onclick="saveExperienceField()">${editing?'Salvar alteração':'Adicionar campo'}</button></div>`;
}

function startExperienceEdit(fieldId){editingExperienceFieldId=fieldId;renderExperienceManager();document.querySelector('#experienceName')?.focus()}
function cancelExperienceEdit(){editingExperienceFieldId=null;renderExperienceManager()}

async function saveExperienceField(){
  const name = document.querySelector('#experienceName').value.trim();
  if(!name) return document.querySelector('#experienceName').focus();
  try{
    const response = await fetch('api.php?resource=experience-fields',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editingExperienceFieldId,name})});
    const result = await response.json();
    if(!response.ok) throw new Error(result.error || 'Não foi possível salvar o campo.');
    await loadExperienceFields();
    editingExperienceFieldId = null;
    renderExperienceManager();
    refreshExperienceSelects(name);
  }catch(error){alert(error.message);}
}

async function deleteExperienceField(fieldId){
  if(!window.confirm('Excluir este campo de experiência?')) return;
  try{
    const response = await fetch(`api.php?resource=experience-fields&id=${encodeURIComponent(fieldId)}`,{method:'DELETE'});
    const result = await response.json();
    if(!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível excluir o campo.');
    await loadExperienceFields();
    renderExperienceManager();
    refreshExperienceSelects();
  }catch(error){alert(error.message);}
}

function refreshExperienceSelects(preferred = ''){
  ['#activityArea','#editActivityArea'].forEach(selector=>{
    const select = document.querySelector(selector);
    if(!select) return;
    const selected = preferred || select.value;
    select.innerHTML = experienceOptions(selected);
    if(selected && [...select.options].some(option=>option.value===selected)) select.value=selected;
  });
}

const baseEditActivity = window.editActivity;
window.editActivity = function editActivityWithExperienceFields(activityId){
  baseEditActivity?.(activityId);
  const activity = data.activities.find(item=>String(item.id)===String(activityId));
  if(activity) refreshExperienceSelects(activity.area);
};

$('#addActivity').onclick = activityFormV2;
$('#emptyAddActivity').onclick = activityFormV2;
loadExperienceFields();

// Tela "Registrar atividade": miniaturas das fotos escolhidas (cada uma com x
// para remover antes de salvar) e contador "X de 50 fotos. Voce ainda pode
// adicionar Y." (ver window.PortalActivityPhotos em activity-upload.js).
// Chamado por selectActivityPhotos (app.js) sempre que a lista muda.
function refreshNewActivityPhotos(){
  if (window.PortalActivityPhotos) window.PortalActivityPhotos.render('#imagePreviews', '#activityPhotoLimit', [], activityFiles, 'removeNewActivityPhoto');
  else renderActivityPreviews('#imagePreviews', activityFiles);
}
function removeNewActivityPhoto(index){
  activityFiles.splice(index, 1);
  refreshNewActivityPhotos();
}
window.refreshNewActivityPhotos = refreshNewActivityPhotos;
window.removeNewActivityPhoto = removeNewActivityPhoto;
