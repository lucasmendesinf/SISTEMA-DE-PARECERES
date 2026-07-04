let editingActivityPhotos = [];
let editingActivityImageEditorMode = 'none';

function editActivity(activityId) {
  const activity = data.activities.find(item => String(item.id) === String(activityId));
  if (!activity) return;
  editingActivityPhotos = [...(activity.photos || [])];
  editingActivityImageEditorMode = 'none';
  open(`<h2 class="modal-title">Editar atividade</h2><p class="modal-subtitle">Atualize as informacoes e, se necessario, substitua as fotos da atividade.</p><div class="form-grid"><div class="field"><label>Titulo da atividade</label><input id="editActivityTitle" required value="${esc(activity.title)}"></div><div class="field"><label>Campo de experiencia</label><select id="editActivityArea"><option ${activity.area === 'O eu, o outro e o nos' ? 'selected' : ''}>O eu, o outro e o nos</option><option ${activity.area === 'Corpo, gestos e movimentos' ? 'selected' : ''}>Corpo, gestos e movimentos</option><option ${activity.area === 'Tracos, sons, cores e formas' ? 'selected' : ''}>Tracos, sons, cores e formas</option><option ${activity.area === 'Escuta, fala, pensamento e imaginacao' ? 'selected' : ''}>Escuta, fala, pensamento e imaginacao</option><option ${activity.area === 'Espacos, tempos, quantidades, relacoes e transformacoes' ? 'selected' : ''}>Espacos, tempos, quantidades, relacoes e transformacoes</option></select></div><div class="field"><label>Observacoes da professora</label><textarea id="editActivityNote" rows="4">${esc(activity.note)}</textarea></div><div class="field"><label>Fotos da atividade <span class="muted">(ate 3 imagens)</span></label><div id="editActivityPreviews" class="image-previews">${editingActivityPhotos.map(photo => `<img src="${photo}" alt="Foto da atividade">`).join('')}</div><input id="editActivityPhotos" type="file" accept="image/*" multiple onchange="selectEditActivityPhotos(this)"><small class="muted">Ao selecionar novas imagens, elas substituem as fotos atuais.</small></div></div><div class="form-actions"><button class="secondary" type="button" onclick="document.querySelector('#modal').close()">Cancelar</button><button class="primary" type="button" onclick="saveActivityEdit('${activity.id}')">Salvar atividade</button></div>`);
}

async function selectEditActivityPhotos(input) {
  try {
    const result = await window.PortalImageEditors.processFiles(input.files, 3);
    editingActivityPhotos = result.photos;
    editingActivityImageEditorMode = result.mode;
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
