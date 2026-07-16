(() => {
  const defaults = {font: 'Arial', fontSize: 12, detailColor: '#253c31'};
  const fontOptions = ['Arial', 'Times New Roman', 'Calibri', 'Georgia', 'Verdana', 'Courier New'];
  const clampFontSize = value => Math.min(16, Math.max(10, Number(value) || defaults.fontSize));
  const normalizeColor = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : defaults.detailColor;

  function getHeaderSettings() {
    try { return JSON.parse(localStorage.getItem(HEADER_KEY) || '{}') || {}; } catch { return {}; }
  }

  function getDocumentStyle() {
    const settings = getHeaderSettings();
    return {
      font: fontOptions.includes(settings.documentFont) ? settings.documentFont : defaults.font,
      fontSize: clampFontSize(settings.documentFontSize),
      detailColor: normalizeColor(settings.detailColor)
    };
  }

  function applyDocumentStylePreview() {
    const style = getDocumentStyle();
    document.documentElement.style.setProperty('--document-font-family', `"${style.font}", Arial, sans-serif`);
    document.documentElement.style.setProperty('--document-font-size', `${style.fontSize}pt`);
    document.documentElement.style.setProperty('--document-detail-color', style.detailColor);
  }

  function injectDocumentStyleFields() {
    const logoField = document.querySelector('#headerLogo')?.closest('.field');
    if (!logoField || document.querySelector('#documentFont')) return;
    const style = getDocumentStyle();
    logoField.insertAdjacentHTML('afterend', `
      <div class="field">
        <label>Fonte final do documento</label>
        <select id="documentFont">
          ${fontOptions.map(font => `<option value="${font}" ${font === style.font ? 'selected' : ''}>${font}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Tamanho da fonte do texto</label>
        <select id="documentFontSize">
          ${[10, 11, 12, 13, 14, 15, 16].map(size => `<option value="${size}" ${size === style.fontSize ? 'selected' : ''}>${size}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Cor dos detalhes do documento</label>
        <input id="detailColor" type="color" value="${style.detailColor}">
        <small class="muted">Aplicada em cabeçalho, dados do aluno e título do documento.</small>
      </div>
    `);
  }

  function saveDocumentStyleWithHeader() {
    const old = getHeaderSettings();
    return {
      documentFont: document.querySelector('#documentFont')?.value || old.documentFont || defaults.font,
      documentFontSize: clampFontSize(document.querySelector('#documentFontSize')?.value || old.documentFontSize),
      detailColor: normalizeColor(document.querySelector('#detailColor')?.value || old.detailColor)
    };
  }

  const originalLoadHeaderSettings = window.loadHeaderSettings;
  window.loadHeaderSettings = async function loadHeaderSettingsWithDocumentStyle() {
    await originalLoadHeaderSettings?.();
    injectDocumentStyleFields();
    const style = getDocumentStyle();
    const font = document.querySelector('#documentFont');
    const fontSize = document.querySelector('#documentFontSize');
    const detailColor = document.querySelector('#detailColor');
    if (font) font.value = style.font;
    if (fontSize) fontSize.value = String(style.fontSize);
    if (detailColor) detailColor.value = style.detailColor;
    applyDocumentStylePreview();
  };

  const saveButton = document.querySelector('#saveHeaderSettings');
  if (saveButton) {
    const oldClick = saveButton.onclick;
    saveButton.onclick = async event => {
      const selectedDocumentStyle = saveDocumentStyleWithHeader();
      await oldClick?.call(saveButton, event);
      const settings = {...getHeaderSettings(), ...selectedDocumentStyle};
      const response = await fetch('api.php?resource=header-settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(settings)
      });
      if (response.ok) localStorage.setItem(HEADER_KEY, JSON.stringify(settings));
      window.loadHeaderSettings?.();
      applyDocumentStylePreview();
    };
  }

  function appendStyleFields(fields) {
    const header = getHeaderSettings();
    const style = getDocumentStyle();
    return {
      ...fields,
      documentFont: fontOptions.includes(header.documentFont) ? header.documentFont : style.font,
      documentFontSize: clampFontSize(header.documentFontSize || style.fontSize),
      detailColor: normalizeColor(header.detailColor || style.detailColor)
    };
  }

  const originalDownloadReport = window.downloadReport;
  window.downloadReport = async function downloadReportWithStyle(id) {
    await window.ensureReportDetail?.(id);
    const report = data.reports.find(item => String(item.id) === String(id) || String(item.databaseId) === String(id));
    const student = report && data.students.find(item => String(item.id) === String(report.studentId));
    if (!report || !student) return originalDownloadReport?.(id);
    let period = data.periods.find(item => item.active) || data.periods[0];
    let className = student.className || data.classes.find(item => String(item.id) === String(student.classId))?.name || 'Turma não informada';
    let header = getHeaderSettings();
    let form = document.createElement('form');
    form.method = 'post';
    form.action = 'download_parecer.php';
    form.target = '_blank';
    const fields = appendStyleFields({
      name: student.name,
      birthDate: student.birthDate || '',
      className,
      period: period?.name || 'Período avaliativo',
      text: report.text || '',
      documentType: normalizeDocumentType(report.documentType),
      studentPhoto: student.photo || '',
      entries: JSON.stringify(report.entries || []),
      finalText: report.useFinalText ? (report.finalText || header.finalText || '') : '',
      headerNetwork: header.network || '',
      headerSchool: header.school || '',
      headerContact: header.contact || '',
      headerLogo: header.logo || ''
    });
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  const originalDownloadPdf = window.downloadPdf;
  window.downloadPdf = async function downloadPdfWithStyle(id) {
    await window.ensureReportDetail?.(id);
    const report = data.reports.find(item => String(item.id) === String(id) || String(item.databaseId) === String(id));
    const student = report && data.students.find(item => String(item.id) === String(report.studentId));
    if (!report || !student) return originalDownloadPdf?.(id);
    let period = data.periods.find(item => item.active) || data.periods[0];
    let className = student.className || data.classes.find(item => String(item.id) === String(student.classId))?.name || 'Turma não informada';
    let header = getHeaderSettings();
    let entries = await Promise.all((report.entries || []).map(async entry => ({...entry, photos: (await Promise.all((entry.photos || []).map(pdfJpeg))).filter(Boolean)})));
    let form = document.createElement('form');
    form.method = 'post';
    form.action = 'download_pdf.php';
    form.target = '_blank';
    const fields = appendStyleFields({
      name: student.name,
      birthDate: student.birthDate || '',
      className,
      period: period?.name || 'Período avaliativo',
      text: report.text || '',
      documentType: normalizeDocumentType(report.documentType),
      studentPhoto: await pdfJpeg(student.photo || ''),
      entries: JSON.stringify(entries),
      finalText: report.useFinalText ? (report.finalText || header.finalText || '') : '',
      headerNetwork: header.network || '',
      headerSchool: header.school || '',
      headerContact: header.contact || '',
      headerLogo: await pdfJpeg(header.logo || '')
    });
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.loadHeaderSettings?.();
    applyDocumentStylePreview();
  });

  window.documentStyleSettings = getDocumentStyle;
  window.collectDocumentStyleSettings = saveDocumentStyleWithHeader;
  window.applyDocumentStylePreview = applyDocumentStylePreview;
})();
