function closeCurrentModal(){document.querySelector('#modal')?.close()}

function classForm(classId = null){
  const classData = classId ? data.classes.find(item => String(item.id) === String(classId)) : null;
  const title = classData ? 'Editar turma' : 'Nova turma';
  open(`<h2 class="modal-title">${title}</h2><p class="modal-subtitle">Atualize os dados que identificam esta turma.</p><div class="form-grid"><div class="field"><label>Nome da turma</label><input id="className" required autofocus value="${esc(classData?.name || '')}" placeholder="Ex.: Jardim I B"></div><div class="field"><label>Etapa</label><select id="classStage"><option ${classData?.stage==='Educação Infantil'?'selected':''}>Educação Infantil</option><option ${classData?.stage==='Creche'?'selected':''}>Creche</option><option ${classData?.stage==='Pré-escola'?'selected':''}>Pré-escola</option></select></div><div class="field"><label>Turno</label><select id="classShift"><option ${classData?.shift==='Manhã'?'selected':''}>Manhã</option><option ${classData?.shift==='Tarde'?'selected':''}>Tarde</option><option ${classData?.shift==='Integral'?'selected':''}>Integral</option></select></div></div><div class="form-actions"><button class="secondary" type="button" onclick="closeCurrentModal()">Cancelar</button><button class="primary" type="button" onclick="saveClass(${classData ? `'${classData.id}'` : 'null'})">Salvar turma</button></div>`);
}

async function saveClass(classId){
  const name = $('#className').value.trim();
  if(!name) return $('#className').focus();
  try{
    const response = await fetch('api.php?resource=classes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:classId,name,stage:$('#classStage').value,shift:$('#classShift').value})});
    const result = await response.json();
    if(!response.ok) throw new Error(result.error || 'Não foi possível salvar a turma.');
    close();
    await loadClasses();
  }catch(error){alert(error.message);}
}

function addClassEditButtons(){
  document.querySelectorAll('#classesList .student-card').forEach((card,index)=>{
    const classData = data.classes[index];
    if(!classData || card.querySelector('.edit-class')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary edit-class';
    button.textContent = 'Editar turma';
    button.addEventListener('click',()=>classForm(classData.id));
    card.appendChild(button);
  });
}

function previewStudentPhoto(input){
  const preview = document.querySelector('#editStudentPhotoPreview');
  const file = input.files?.[0];
  if(!preview || !file) return;
  preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Prévia da foto do aluno">`;
}

function editStudent(id){
  const student = data.students.find(item => String(item.id) === String(id));
  if(!student) return;
  const options = data.classes.map(classData=>`<option value="${classData.id}" ${String(classData.id)===String(student.classId)?'selected':''}>${esc(classData.name)} · ${esc(classData.shift)}</option>`).join('');
  const photoPreview = student.photo ? `<img src="${student.photo}" alt="Foto atual do aluno">` : '<span class="muted">Nenhuma foto cadastrada.</span>';
  open(`<h2 class="modal-title">Editar aluno</h2><p class="modal-subtitle">Atualize os dados cadastrais e a foto de identificação.</p><div class="form-grid"><div class="field"><label>Nome completo</label><input id="editStudentName" value="${esc(student.name)}" required></div><div class="field"><label>Data de nascimento</label><input id="editStudentBirth" type="date" value="${esc(student.birthDate||'')}"></div><div class="field"><label>Turma</label><select id="editStudentClass">${options}</select></div><div class="field"><label>Foto atual</label><div id="editStudentPhotoPreview" class="image-previews">${photoPreview}</div><label class="muted" style="margin-top:10px">Substituir foto <span>(opcional)</span></label><input id="editStudentPhoto" type="file" accept="image/*" onchange="previewStudentPhoto(this)"></div></div><div class="form-actions"><button class="secondary" type="button" onclick="closeCurrentModal()">Cancelar</button><button class="primary" type="button" onclick="saveStudentEdit('${String(student.id)}')">Salvar alterações</button></div>`);
}

new MutationObserver(addClassEditButtons).observe(document.querySelector('#classesList'),{childList:true,subtree:true});
$('#addClass').onclick = () => classForm();
addClassEditButtons();
