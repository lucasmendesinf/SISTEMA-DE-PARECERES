let editingActivityPhotos = [];
let editingActivityImageEditorMode = 'none';

function editActivity(activityId) {
  const activity = data.activities.find(item => String(item.id) === String(activityId));
  if (!activity) return;
  editingActivityPhotos = [...(activity.photos || [])];
  editingActivityImageEditorMode = 'none';
  open(`<h2 class="modal-title">Editar atividade</h2><p class="modal-subtitle">Atualize as informacoes e, se necessario, substitua as fotos da atividade.</p><div class="form-grid"><div class="field"><label>Titulo da atividade</label><input id="editActivityTitle" required value="${esc(activity.title)}"></div><div class="field"><label>Campo de experiencia</label><select id="editActivityArea"><option ${activity.area === 'O eu, o outro e o nos' ? 'selected' : ''}>O eu, o outro e o nos</option><option ${activity.area === 'Corpo, gestos e movimentos' ? 'selected' : ''}>Corpo, gestos e movimentos</option><option ${activity.area === 'Tracos, sons, cores e formas' ? 'selected' : ''}>Tracos, sons, cores e formas</option><option ${activity.area === 'Escuta, fala, pensamento e imaginacao' ? 'selected' : ''}>Escuta, fala, pensamento e imaginacao</option><option ${activity.area === 'Espacos, tempos, quantidades, relacoes e transformacoes' ? 'selected' : ''}>Espacos, tempos, quantidades, relacoes e transformacoes</option></select></div><div class="field"><label>Observacoes da professora</label><textarea id="editActivityNote" rows="4">${esc(activity.note)}</textarea><small class="muted">Dica: escreva [NOME] para que apareça o nome do aluno quando esta atividade for usada em um parecer/portfólio.</small></div><div class="field"><label>Fotos da atividade <span class="muted">(ate 50 imagens)</span></label><div id="editActivityPreviews" class="image-previews">${editingActivityPhotos.map(photo => `<img src="${photo}" alt="Foto da atividade">`).join('')}</div><div class="activity-upload-actions"><label class="secondary activity-upload-button" for="editActivityPhotos">Escolher fotos</label><label class="secondary activity-upload-button activity-camera-button" for="editActivityCamera">Abrir camera</label></div><input id="editActivityPhotos" class="activity-file-input" type="file" accept="image/*" multiple onchange="selectEditActivityPhotos(this)"><input id="editActivityCamera" class="activity-file-input" type="file" accept="image/*" capture="environment" data-append="1" onchange="selectEditActivityPhotos(this)"><small class="muted">Escolha fotos da galeria ou use a camera no celular. Limite de 50 imagens.</small></div></div><div class="form-actions"><button class="secondary" type="button" onclick="document.querySelector('#modal').close()">Cancelar</button><button class="primary" type="button" onclick="saveActivityEdit('${activity.id}')">Salvar atividade</button></div>`);
}

async function selectEditActivityPhotos(input) {
  try {
    const files = [...input.files];
    if ((input.dataset.append ? editingActivityPhotos.length : 0) + files.length > 50) throw new Error('Selecione no maximo 50 imagens.');
    if (files.some(file => file.size > 5 * 1024 * 1024)) throw new Error('Cada imagem deve ter no maximo 5 MB.');
    const loaded = await Promise.all(files.map(file => window.PortalImageEditors.fileAsDataUrl(file)));
    editingActivityPhotos = input.dataset.append ? [...editingActivityPhotos, ...loaded] : loaded;
    editingActivityImageEditorMode = 'none';
    $('#editActivityPreviews').innerHTML = editingActivityPhotos.map(photo => `<img src="${photo}" alt="Previa da atividade">`).join('');
  } catch (error) {
    alert(error.message || 'Nao foi possivel editar as imagens.');
    input.value = '';
  }
}

async function saveActivityEdit(activityId) {
  const title = $('#editActivityTitle').value.trim();
  if (!title) return $('#editActivityTitle').focus();
  try {
    const activePeriod = data.periods.find(item => item.active) || data.periods[0];
    const response = await fetch('api.php?resource=activities', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        id: activityId,
        title,
        area: $('#editActivityArea').value,
        note: $('#editActivityNote').value.trim() || 'Registro de vivencia da turma.',
        photos: editingActivityPhotos,
        classId: 1,
        periodId: activePeriod?.id || 1,
        imageEditorMode: editingActivityPhotos.length ? editingActivityImageEditorMode : 'none'
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Nao foi possivel salvar a atividade.');
    close();
    await loadActivities();
  } catch (error) {
    alert(error.message);
  }
}

function activityLinkCount(activityId) {
  const id = String(activityId);
  return (data.reports || []).reduce((total, report) => {
    const direct = (report.activityIds || []).map(String).includes(id) ? 1 : 0;
    const entryLinks = (report.entries || []).some(entry => (entry.activityIds || []).map(String).includes(id)) ? 1 : 0;
    return total + (direct || entryLinks ? 1 : 0);
  }, 0);
}

async function deleteActivity(activityId) {
  const activity = data.activities.find(item => String(item.id) === String(activityId));
  if (!activity) return;
  const links = activityLinkCount(activityId);
  if (links > 0) {
    alert(`Esta atividade esta vinculada a ${links} parecer/portfolio e nao pode ser excluida.`);
    return;
  }
  if (!confirm(`Excluir a atividade "${activity.title}"?`)) return;
  try {
    const response = await fetch(`api.php?resource=activities&id=${encodeURIComponent(activityId)}`, {method: 'DELETE'});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Nao foi possivel excluir a atividade.');
    await loadActivities();
  } catch (error) {
    alert(error.message);
  }
}

function addActivityEditButtons() {
  document.querySelectorAll('#activitiesList .activity-card').forEach((card, index) => {
    const activity = data.activities[index];
    if (!activity || card.querySelector('.activity-actions')) return;
    card.dataset.activityId = activity.id;
    const links = activityLinkCount(activity.id);
    const actions = document.createElement('div');
    actions.className = 'activity-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'secondary edit-activity';
    editButton.dataset.editActivity = activity.id;
    editButton.textContent = 'Editar atividade';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'secondary danger delete-activity';
    deleteButton.dataset.deleteActivity = activity.id;
    deleteButton.textContent = 'Excluir atividade';
    deleteButton.disabled = links > 0;
    deleteButton.title = links > 0 ? 'Atividade vinculada a parecer ou portfolio.' : 'Excluir atividade';
    actions.append(editButton, deleteButton);
    card.appendChild(actions);
  });
}

document.querySelector('#activitiesList')?.addEventListener('click', event => {
  const editButton = event.target.closest('[data-edit-activity]');
  if (editButton) {
    event.preventDefault();
    event.stopPropagation();
    window.editActivity?.(editButton.dataset.editActivity);
    return;
  }
  const deleteButton = event.target.closest('[data-delete-activity]');
  if (deleteButton && !deleteButton.disabled) {
    event.preventDefault();
    event.stopPropagation();
    deleteActivity(deleteButton.dataset.deleteActivity);
  }
});

window.editActivity = editActivity;
window.saveActivityEdit = saveActivityEdit;
window.selectEditActivityPhotos = selectEditActivityPhotos;
window.deleteActivity = deleteActivity;

const activitiesList = document.querySelector('#activitiesList');
if (activitiesList) new MutationObserver(addActivityEditButtons).observe(activitiesList, {childList: true, subtree: true});
addActivityEditButtons();

// -----------------------------------------------------------------------------
// Tela "Editar atividade" (versao atual - substitui as definicoes acima).
// As fotos que a atividade ja tem sao MANTIDAS: as fotos escolhidas aqui sao
// acrescentadas depois delas (keepPhotos no api.php). Isso permite, por exemplo,
// completar uma atividade cujo envio parou no meio.
//   editingSavedPhotos -> fotos ja gravadas (so exibidas, nao sao reenviadas)
//   editingActivityPhotos -> fotos NOVAS escolhidas nesta edicao
// O contador mostra "X de 50 fotos. Voce ainda pode adicionar Y."
// -----------------------------------------------------------------------------
let editingSavedPhotos = [];

function refreshEditActivityPhotos() {
  if (window.PortalActivityPhotos) {
    window.PortalActivityPhotos.render('#editActivityPreviews', '#editActivityPhotoLimit', editingSavedPhotos, editingActivityPhotos, 'removeEditActivityPhoto');
  } else {
    window.PortalActivityImages?.renderPreviews('#editActivityPreviews', [...editingSavedPhotos, ...editingActivityPhotos]);
  }
}

// Remove uma foto NOVA (ainda nao salva) da lista.
function removeEditActivityPhoto(index) {
  editingActivityPhotos.splice(index, 1);
  refreshEditActivityPhotos();
}

function editActivity(activityId) {
  const activity = data.activities.find(item => String(item.id) === String(activityId));
  if (!activity) return;
  editingSavedPhotos = [...(activity.photos || [])];
  editingActivityPhotos = [];
  editingActivityImageEditorMode = 'none';
  open(`<h2 class="modal-title">Editar atividade</h2><p class="modal-subtitle">Atualize as informacoes e acrescente novas fotos. As fotos que a atividade ja tem sao mantidas.</p><div class="form-grid"><div class="field"><label>Titulo da atividade</label><input id="editActivityTitle" required value="${esc(activity.title)}"></div><div class="field"><label>Campo de experiencia</label><select id="editActivityArea"><option ${activity.area === 'O eu, o outro e o nos' ? 'selected' : ''}>O eu, o outro e o nos</option><option ${activity.area === 'Corpo, gestos e movimentos' ? 'selected' : ''}>Corpo, gestos e movimentos</option><option ${activity.area === 'Tracos, sons, cores e formas' ? 'selected' : ''}>Tracos, sons, cores e formas</option><option ${activity.area === 'Escuta, fala, pensamento e imaginacao' ? 'selected' : ''}>Escuta, fala, pensamento e imaginacao</option><option ${activity.area === 'Espacos, tempos, quantidades, relacoes e transformacoes' ? 'selected' : ''}>Espacos, tempos, quantidades, relacoes e transformacoes</option></select></div><div class="field"><label>Observacoes da professora</label><textarea id="editActivityNote" rows="4">${esc(activity.note)}</textarea><small class="muted">Dica: escreva [NOME] para que apareça o nome do aluno quando esta atividade for usada em um parecer/portfólio.</small></div><div class="field"><label>Fotos da atividade <span class="muted">(ate 50 imagens)</span></label><div id="editActivityPreviews" class="image-previews"></div><div class="activity-upload-actions"><label class="secondary activity-upload-button" for="editActivityPhotos">Escolher fotos</label><label class="secondary activity-upload-button activity-camera-button" for="editActivityCamera">Abrir camera</label></div><input id="editActivityPhotos" class="activity-file-input" type="file" accept="image/*" multiple data-append="1" onchange="selectEditActivityPhotos(this)"><input id="editActivityCamera" class="activity-file-input" type="file" accept="image/*" capture="environment" data-append="1" onchange="selectEditActivityPhotos(this)"><small id="editActivityPhotoStatus" class="muted">As fotos novas serao otimizadas antes de salvar.</small><small id="editActivityPhotoLimit" class="photo-limit"></small></div></div><div class="form-actions"><button class="secondary" type="button" onclick="document.querySelector('#modal').close()">Cancelar</button><button class="primary" id="saveEditActivityButton" type="button" onclick="saveActivityEdit('${activity.id}')">Salvar atividade</button></div>`);
  refreshEditActivityPhotos();
}

async function selectEditActivityPhotos(input) {
  const previous = [...editingActivityPhotos];
  try {
    const files = [...input.files];
    if (!files.length) return;
    // Limite conta as fotos ja salvas + as novas ja escolhidas + as que chegaram agora.
    const left = 50 - editingSavedPhotos.length - editingActivityPhotos.length;
    if (files.length > left) throw new Error(left > 0 ? `O limite e 50 fotos por atividade. Voce ainda pode adicionar ${left}.` : 'Esta atividade ja tem 50 fotos, o limite maximo.');
    window.PortalSaveFeedback?.showLoading('Preparando fotos...');
    const loaded = window.PortalActivityImages
      ? await window.PortalActivityImages.compressFiles(files, '#editActivityPhotoStatus')
      : await Promise.all(files.map(file => window.PortalImageEditors.fileAsDataUrl(file)));
    editingActivityPhotos = [...editingActivityPhotos, ...loaded];
    editingActivityImageEditorMode = 'none';
    refreshEditActivityPhotos();
  } catch (error) {
    editingActivityPhotos = previous;
    refreshEditActivityPhotos();
    alert(error.message || 'Nao foi possivel editar as imagens.');
  } finally {
    window.PortalSaveFeedback?.hideLoading();
    input.value = '';
  }
}

async function saveActivityEdit(activityId) {
  const title = $('#editActivityTitle').value.trim();
  if (!title) return $('#editActivityTitle').focus();
  const button = $('#saveEditActivityButton');
  const oldText = button?.textContent;
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Salvando...';
    }
    const activePeriod = data.periods.find(item => item.active) || data.periods[0];
    const status = $('#editActivityPhotoStatus');
    // keepPhotos: o servidor mantem as fotos atuais e so as NOVAS sao enviadas,
    // em lotes, a partir da quantidade que a atividade ja tem.
    const result = await window.PortalActivityUpload.saveActivity({
      id: activityId,
      keepPhotos: true,
      title,
      area: $('#editActivityArea').value,
      note: $('#editActivityNote').value.trim() || 'Registro de vivencia da turma.',
      photos: editingActivityPhotos.filter(photo => String(photo).startsWith('data:image/')),
      classId: 1,
      periodId: activePeriod?.id || 1,
      imageEditorMode: editingActivityPhotos.length ? editingActivityImageEditorMode : 'none'
    }, (sent, total) => { if (status && total) status.textContent = `Enviando fotos novas: ${sent} de ${total}...`; });
    if (result.activity) {
      // Lista local = fotos que ja existiam + fotos novas gravadas agora.
      result.activity.photos = [...editingSavedPhotos, ...(result.activity.photos || [])];
      data.activities = data.activities.map(item => String(item.id) === String(result.activity.id) ? result.activity : item);
      if (!data.activities.some(item => String(item.id) === String(result.activity.id))) data.activities.unshift(result.activity);
      render();
    }
    close();
    loadActivities().catch(error => console.warn('Atividade salva, mas a lista completa nao foi recarregada.', error));
  } catch (error) {
    // Se parte das fotos novas ja foi gravada, elas passam para "ja salvas" e
    // saem da lista de novas: salvar de novo envia so as que faltam.
    if (error.sentCount) {
      editingSavedPhotos = [...editingSavedPhotos, ...editingActivityPhotos.slice(0, error.sentCount)];
      editingActivityPhotos = editingActivityPhotos.slice(error.sentCount);
      refreshEditActivityPhotos();
    }
    const statusAfterError = $('#editActivityPhotoStatus');
    if (statusAfterError) statusAfterError.textContent = editingActivityPhotos.length ? `${editingActivityPhotos.length} foto(s) nova(s) ainda nao enviada(s).` : '';
    alert(error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText || 'Salvar atividade';
    }
  }
}

window.editActivity = editActivity;
window.saveActivityEdit = saveActivityEdit;
window.selectEditActivityPhotos = selectEditActivityPhotos;
window.removeEditActivityPhoto = removeEditActivityPhoto;
