(() => {
  const api = resource => `api.php?resource=${resource}`;
  const state = {
    user: null,
    header: {},
    periods: [],
    classes: [],
    students: [],
    step: 0,
    studentDrafts: [],
    draft: {},
    locked: false,
    starting: false,
  };

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

  async function request(resource, options = {}) {
    const response = await fetch(api(resource), options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel salvar os dados.');
    return data;
  }

  async function refreshState() {
    const [header, periods, classes, students] = await Promise.all([
      request('header-settings'),
      request('periods'),
      request('classes'),
      request('children'),
    ]);
    state.header = header || {};
    state.periods = Array.isArray(periods) ? periods : [];
    state.classes = Array.isArray(classes) ? classes : [];
    state.students = Array.isArray(students) ? students : [];
  }

  const hasHeader = () => ['network', 'school', 'contact'].every(key => String(state.header[key] || '').trim() !== '');
  const missingSteps = () => [
    !hasHeader(),
    state.periods.length === 0,
    state.classes.length === 0,
    state.students.length === 0,
  ];

  function firstMissingStep() {
    const missing = missingSteps();
    const index = missing.findIndex(Boolean);
    return index >= 0 ? index : 0;
  }

  function shouldRun() {
    return state.user && state.user.role !== 'master' && missingSteps().some(Boolean);
  }

  function draftKey() {
    const id = state.user?.id || state.user?.email || state.user?.name || 'current';
    return `portal-onboarding-draft-v1-${id}`;
  }

  function loadDraft() {
    try {
      state.draft = JSON.parse(localStorage.getItem(draftKey()) || '{}') || {};
      state.studentDrafts = Array.isArray(state.draft.studentDrafts) ? state.draft.studentDrafts : [];
    } catch (_) {
      state.draft = {};
      state.studentDrafts = [];
    }
  }

  function persistDraft() {
    try {
      localStorage.setItem(draftKey(), JSON.stringify({...state.draft, studentDrafts: state.studentDrafts}));
    } catch (error) {
      console.warn('Nao foi possivel salvar o rascunho do cadastro inicial.', error);
    }
  }

  function clearDraft() {
    localStorage.removeItem(draftKey());
    state.draft = {};
    state.studentDrafts = [];
  }

  function ensureDialog() {
    let dialog = $('#onboardingModal');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'onboardingModal';
    dialog.className = 'onboarding-dialog';
    dialog.addEventListener('cancel', event => event.preventDefault());
    dialog.addEventListener('click', event => {
      const bounds = dialog.getBoundingClientRect();
      const clickedBackdrop = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (clickedBackdrop) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      if (!state.locked || !shouldRun()) return;
      setTimeout(render, 0);
    });
    document.body.append(dialog);
    return dialog;
  }

  function progressHtml() {
    return `<div class="onboarding-progress">${[0, 1, 2, 3].map(index => `<span class="${index <= state.step ? 'active' : ''}"></span>`).join('')}</div>`;
  }

  function footerHtml(buttonLabel = 'Proximo') {
    const back = state.step > 0 ? '<button class="secondary" type="button" id="onboardingBack">Voltar</button>' : '<span></span>';
    return `<div class="onboarding-footer"><p class="muted">Etapa ${state.step + 1} de 4</p><div class="form-actions"><button class="secondary danger" type="button" id="onboardingLogout">Sair do sistema</button>${back}<button class="primary" type="button" id="onboardingNext">${buttonLabel}</button></div></div>`;
  }

  function stepSchool() {
    const header = {...state.header, ...(state.draft.header || {})};
    return `<section class="onboarding-step">
      <p class="wizard-step">CADASTRO INICIAL</p>
      <h2 class="modal-title">Dados da escola</h2>
      <p class="modal-subtitle">Preencha o cabecalho que aparecera nos pareceres e portfolios.</p>
      <div class="form-grid">
        <div class="field"><label>Nome da rede ou secretaria</label><input id="onboardNetwork" value="${esc(header.network)}" placeholder="Ex.: Secretaria Municipal de Educacao"></div>
        <div class="field"><label>Unidade escolar</label><input id="onboardSchool" value="${esc(header.school)}" placeholder="Ex.: CMEI Nome da Unidade"></div>
        <div class="field"><label>Endereco e contato</label><textarea id="onboardContact" rows="3" placeholder="Endereco, telefone e e-mail">${esc(header.contact)}</textarea></div>
        <div class="field"><label>Logo institucional <span class="muted">(opcional)</span></label><input id="onboardLogo" type="file" accept="image/*"><div id="onboardLogoPreview" class="image-previews">${header.logo ? `<img src="${header.logo}" alt="Logo">` : ''}</div></div>
      </div>
      ${footerHtml()}
    </section>`;
  }

  function stepPeriod() {
    const period = state.draft.period || {};
    return `<section class="onboarding-step">
      <p class="wizard-step">ORGANIZACAO ESCOLAR</p>
      <h2 class="modal-title">Periodo avaliativo</h2>
      <p class="modal-subtitle">Cadastre o periodo que sera usado nos primeiros pareceres.</p>
      <div class="form-grid">
        <div class="field"><label>Nome do periodo</label><input id="onboardPeriodName" value="${esc(period.name)}" placeholder="Ex.: 2o semestre de 2026"></div>
        <div class="field"><label>Data de inicio</label><input id="onboardPeriodStart" type="date" value="${esc(period.start)}"></div>
        <div class="field"><label>Data de termino</label><input id="onboardPeriodEnd" type="date" value="${esc(period.end)}"></div>
      </div>
      ${footerHtml()}
    </section>`;
  }

  function stepClass() {
    const classDraft = state.draft.class || {};
    return `<section class="onboarding-step">
      <p class="wizard-step">ORGANIZACAO ESCOLAR</p>
      <h2 class="modal-title">Turma</h2>
      <p class="modal-subtitle">Cadastre a primeira turma antes de incluir os alunos.</p>
      <div class="form-grid">
        <div class="field"><label>Nome da turma</label><input id="onboardClassName" value="${esc(classDraft.name)}" placeholder="Ex.: Jardim I B"></div>
        <div class="field"><label>Etapa</label><select id="onboardClassStage"><option ${classDraft.stage === 'Educacao Infantil' ? 'selected' : ''}>Educacao Infantil</option><option ${classDraft.stage === 'Creche' ? 'selected' : ''}>Creche</option><option ${classDraft.stage === 'Pre-escola' ? 'selected' : ''}>Pre-escola</option></select></div>
        <div class="field"><label>Turno</label><select id="onboardClassShift"><option ${classDraft.shift === 'Manha' ? 'selected' : ''}>Manha</option><option ${classDraft.shift === 'Tarde' ? 'selected' : ''}>Tarde</option><option ${classDraft.shift === 'Integral' ? 'selected' : ''}>Integral</option></select></div>
      </div>
      ${footerHtml()}
    </section>`;
  }

  function studentListHtml() {
    if (!state.studentDrafts.length) return '';
    return `<div class="onboarding-student-list">${state.studentDrafts.map((student, index) => `<div><strong>${esc(student.name)}</strong><span>${esc(student.birthDate || 'Data nao informada')}</span><button class="text-button" type="button" data-remove-student="${index}">Remover</button></div>`).join('')}</div>`;
  }

  function stepStudents() {
    const studentInput = state.draft.studentInput || {};
    const options = state.classes.map(item => `<option value="${item.id}" ${String(studentInput.classId || '') === String(item.id) ? 'selected' : ''}>${esc(item.name)} - ${esc(item.shift)}</option>`).join('');
    return `<section class="onboarding-step">
      <p class="wizard-step">ALUNOS</p>
      <h2 class="modal-title">Primeiros alunos</h2>
      <p class="modal-subtitle">Inclua pelo menos um aluno para liberar o uso do sistema. Voce pode cadastrar os demais depois.</p>
      <div class="form-grid">
        <div class="field"><label>Nome completo</label><input id="onboardStudentName" value="${esc(studentInput.name)}" placeholder="Ex.: Beatriz Souza"></div>
        <div class="field"><label>Data de nascimento</label><input id="onboardStudentBirth" type="date" value="${esc(studentInput.birthDate)}"></div>
        <div class="field"><label>Turma</label><select id="onboardStudentClass">${options}</select></div>
        <div class="field"><label>Foto do aluno <span class="muted">(opcional)</span></label><input id="onboardStudentPhoto" type="file" accept="image/*"></div>
      </div>
      <div class="form-actions"><button class="secondary" type="button" id="addOnboardStudent">Adicionar aluno</button></div>
      ${studentListHtml()}
      ${footerHtml('Concluir cadastro')}
    </section>`;
  }

  function render() {
    persistDraft();
    const dialog = ensureDialog();
    const steps = [stepSchool, stepPeriod, stepClass, stepStudents];
    dialog.innerHTML = `<div class="onboarding-shell">${progressHtml()}${steps[state.step]()}</div>`;
    bindStep();
    state.locked = true;
    document.body.classList.add('onboarding-locked');
    if (!dialog.open) dialog.showModal();
    window.dispatchEvent(new CustomEvent('portal:onboarding-open', {detail: {step: state.step}}));
  }

  function fileAsDataUrl(file) {
    return new Promise(resolve => {
      if (!file) return resolve('');
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
  }

  function setLoading(button, loading) {
    button.disabled = loading;
    button.textContent = loading ? 'Salvando...' : (button.dataset.label || 'Proximo');
  }

  async function showFirstAccessTutorialBeforeOnboarding(user) {
    const openTutorial = () => {
      if (!window.TutorialVideos?.showFirstAccessBeforeOnboarding) return Promise.resolve(false);
      return window.TutorialVideos.showFirstAccessBeforeOnboarding(user, {force: true, allowFallback: true});
    };
    if (window.TutorialVideos?.showFirstAccessBeforeOnboarding) return openTutorial();
    return new Promise(resolve => {
      let finished = false;
      const finish = async () => {
        if (finished) return;
        finished = true;
        window.removeEventListener('portal:tutorial-ready', finish);
        resolve(await openTutorial());
      };
      window.addEventListener('portal:tutorial-ready', finish, {once: true});
      setTimeout(finish, 1200);
    });
  }

  async function saveSchool() {
    const network = $('#onboardNetwork').value.trim();
    const school = $('#onboardSchool').value.trim();
    const contact = $('#onboardContact').value.trim();
    if (!network) { $('#onboardNetwork').focus(); throw new Error('Informe o nome da rede ou secretaria.'); }
    if (!school) { $('#onboardSchool').focus(); throw new Error('Informe a unidade escolar.'); }
    if (!contact) { $('#onboardContact').focus(); throw new Error('Informe o endereco e contato da escola.'); }
    const logo = await fileAsDataUrl($('#onboardLogo').files[0]) || state.draft.header?.logo || state.header.logo || '';
    state.header = {network, school, contact, logo};
    state.draft.header = state.header;
    persistDraft();
    await request('header-settings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(state.header)});
    localStorage.setItem('parecer-cabecalho-professora-v1', JSON.stringify(state.header));
    if (typeof loadHeaderSettings === 'function') loadHeaderSettings();
  }

  async function savePeriod() {
    const name = $('#onboardPeriodName').value.trim();
    if (!name) { $('#onboardPeriodName').focus(); throw new Error('Informe o nome do periodo.'); }
    state.draft.period = {name, start: $('#onboardPeriodStart').value, end: $('#onboardPeriodEnd').value};
    persistDraft();
    await request('periods', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, start: $('#onboardPeriodStart').value, end: $('#onboardPeriodEnd').value})});
    if (typeof loadPeriods === 'function') await loadPeriods();
  }

  async function saveClass() {
    const name = $('#onboardClassName').value.trim();
    if (!name) { $('#onboardClassName').focus(); throw new Error('Informe o nome da turma.'); }
    state.draft.class = {name, stage: $('#onboardClassStage').value, shift: $('#onboardClassShift').value};
    persistDraft();
    await request('classes', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, stage: $('#onboardClassStage').value, shift: $('#onboardClassShift').value})});
    if (typeof loadClasses === 'function') await loadClasses();
  }

  async function addStudentDraft() {
    const name = $('#onboardStudentName').value.trim();
    const birthDate = $('#onboardStudentBirth').value;
    const classId = Number($('#onboardStudentClass').value);
    if (!name) { $('#onboardStudentName').focus(); throw new Error('Informe o nome do aluno.'); }
    if (!birthDate) { $('#onboardStudentBirth').focus(); throw new Error('Informe a data de nascimento do aluno.'); }
    const photo = await fileAsDataUrl($('#onboardStudentPhoto').files[0]);
    state.studentDrafts.push({name, birthDate, classId, photo});
    state.draft.studentInput = {};
    persistDraft();
    render();
  }

  async function saveStudents() {
    if (!state.studentDrafts.length) {
      await addStudentDraft();
      if (!state.studentDrafts.length) return false;
    }
    for (const student of state.studentDrafts) {
      await request('children', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(student)});
    }
    state.studentDrafts = [];
    state.draft.studentInput = {};
    persistDraft();
    if (typeof loadChildren === 'function') await loadChildren();
    return true;
  }

  async function next() {
    const button = $('#onboardingNext');
    button.dataset.label = button.textContent;
    setLoading(button, true);
    try {
      if (state.step === 0) await saveSchool();
      if (state.step === 1) await savePeriod();
      if (state.step === 2) await saveClass();
      if (state.step === 3) {
        const saved = await saveStudents();
        if (!saved) return;
      }
      await refreshState();
      if (state.step < 3) {
        state.step += 1;
        render();
        return;
      }
      if (!shouldRun()) {
        state.locked = false;
        clearDraft();
        document.body.classList.remove('onboarding-locked');
        ensureDialog().close();
        return;
      }
      state.step = firstMissingStep();
      render();
    } catch (error) {
      alert(error.message);
    } finally {
      if (button.isConnected) setLoading(button, false);
    }
  }

  function back() {
    captureCurrentDraft();
    if (state.step <= 0) return;
    state.step -= 1;
    render();
  }

  async function logout() {
    try {
      await fetch(api('auth'), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'logout'})});
    } finally {
      location.href = 'login.php';
    }
  }

  function bindStep() {
    $('#onboardingNext')?.addEventListener('click', next);
    $('#onboardingBack')?.addEventListener('click', back);
    $('#onboardingLogout')?.addEventListener('click', logout);
    $('#addOnboardStudent')?.addEventListener('click', addStudentDraft);
    document.querySelector('.onboarding-step')?.addEventListener('input', captureCurrentDraft);
    document.querySelector('.onboarding-step')?.addEventListener('change', captureCurrentDraft);
    $('#onboardLogo')?.addEventListener('change', event => {
      const file = event.currentTarget.files[0];
      if (!file) return;
      const preview = $('#onboardLogoPreview');
      preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Logo">`;
      fileAsDataUrl(file).then(logo => {
        state.draft.header = {...(state.draft.header || {}), logo};
        persistDraft();
      });
    });
    document.querySelectorAll('[data-remove-student]').forEach(button => {
      button.addEventListener('click', () => {
        state.studentDrafts.splice(Number(button.dataset.removeStudent), 1);
        persistDraft();
        render();
      });
    });
  }

  function captureCurrentDraft() {
    if (state.step === 0) {
      state.draft.header = {
        ...(state.draft.header || {}),
        network: $('#onboardNetwork')?.value || '',
        school: $('#onboardSchool')?.value || '',
        contact: $('#onboardContact')?.value || '',
      };
    }
    if (state.step === 1) {
      state.draft.period = {
        name: $('#onboardPeriodName')?.value || '',
        start: $('#onboardPeriodStart')?.value || '',
        end: $('#onboardPeriodEnd')?.value || '',
      };
    }
    if (state.step === 2) {
      state.draft.class = {
        name: $('#onboardClassName')?.value || '',
        stage: $('#onboardClassStage')?.value || 'Educacao Infantil',
        shift: $('#onboardClassShift')?.value || 'Manha',
      };
    }
    if (state.step === 3) {
      state.draft.studentInput = {
        name: $('#onboardStudentName')?.value || '',
        birthDate: $('#onboardStudentBirth')?.value || '',
        classId: Number($('#onboardStudentClass')?.value || 0),
      };
    }
    persistDraft();
  }

  async function start(user) {
    state.user = user || window.PortalCurrentUser;
    if (!state.user || state.user.role === 'master') return;
    if (state.starting || state.locked) return;
    state.starting = true;
    try {
      await refreshState();
      loadDraft();
      if (!shouldRun()) return;
      state.step = firstMissingStep();
      if (state.students.length === 0) await showFirstAccessTutorialBeforeOnboarding(state.user);
      render();
    } catch (error) {
      console.warn('Nao foi possivel iniciar o cadastro inicial.', error);
    } finally {
      state.starting = false;
    }
  }

  window.addEventListener('portal:user-ready', event => start(event.detail));
  if (window.PortalCurrentUser) start(window.PortalCurrentUser);
})();
