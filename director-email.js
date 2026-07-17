(() => {
  const headerKey = 'parecer-cabecalho-professora-v1';

  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

  function ensureFinalTextField() {
    if ($('#headerFinalText')) return;
    const contactField = $('#headerContact')?.closest('.field');
    if (!contactField) return;
    contactField.insertAdjacentHTML('afterend', `
      <div class="field">
        <label>Texto final do parecer <span class="muted">(opcional)</span></label>
        <textarea id="headerFinalText" rows="4" placeholder="Aqui você coloca os nomes das professoras envolvidas no parecer, esses nomes vão ficar no final do documento parecer/portifólio"></textarea>
        <small class="muted">A professora escolhe em cada parecer se deseja usar este texto.</small>
      </div>
    `);
  }

  const originalLoadHeaderSettings = window.loadHeaderSettings;
  window.loadHeaderSettings = async function loadHeaderSettingsWithDirector() {
    if (typeof originalLoadHeaderSettings === 'function') await originalLoadHeaderSettings();
    ensureFinalTextField();
    const settings = JSON.parse(localStorage.getItem(headerKey) || '{}');
    $('#headerFinalText').value = settings.finalText || '';
  };

  function hookSaveHeaderSettings() {
    ensureFinalTextField();
    const button = $('#saveHeaderSettings');
    if (!button || button.dataset.directorHooked) return;
    button.dataset.directorHooked = '1';
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const logoFile = $('#headerLogo')?.files?.[0];
      const old = JSON.parse(localStorage.getItem(headerKey) || '{}');
      let logo = old.logo || '';
      if (logoFile && typeof fileAsDataUrl === 'function') logo = await fileAsDataUrl(logoFile);
      const settings = {
        ...old,
        network: $('#headerNetwork')?.value.trim() || '',
        school: $('#headerSchool')?.value.trim() || '',
        contact: $('#headerContact')?.value.trim() || '',
        finalText: $('#headerFinalText')?.value.trim() || '',
        ...(window.collectDocumentStyleSettings?.() || {}),
        logo
      };
      const response = await fetch('api.php?resource=header-settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(settings)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return alert(result.error || 'Nao foi possivel salvar o cabecalho.');
      localStorage.setItem(headerKey, JSON.stringify(settings));
      await window.loadHeaderSettings();
      window.applyDocumentStylePreview?.();
      alert('Cabecalho salvo com sucesso.');
    }, true);
  }

  function reportPeriod() {
    const period = data?.periods?.find(item => item.active) || data?.periods?.[0];
    return period?.name || 'periodo avaliativo';
  }

  function defaultMessage(report) {
    const student = data.students.find(item => String(item.id) === String(report.studentId));
    return `Segue parecer referente ao ${reportPeriod()} da crianca ${student?.name || ''}.`;
  }

  const currentHeader = () => JSON.parse(localStorage.getItem(headerKey) || '{}');
  const normalizeType = value => typeof normalizeDocumentType === 'function' ? normalizeDocumentType(value) : (value === 'portfolio' ? 'portfolio' : 'parecer');
  const documentLabel = value => normalizeType(value) === 'portfolio' ? 'Portfolio' : 'Parecer';

  async function ensureFullReport(reportOrId) {
    const id = typeof reportOrId === 'object' ? (reportOrId.databaseId || reportOrId.id) : reportOrId;
    let report = typeof reportOrId === 'object'
      ? reportOrId
      : data.reports.find(item => String(item.databaseId || item.id) === String(id) || String(item.id) === String(id));
    if (report?.hasFullData && Array.isArray(report.entries)) return report;
    const response = await fetch('api.php?resource=reports');
    if (!response.ok) throw new Error('Nao foi possivel carregar o documento completo.');
    const fullReports = await response.json();
    const fullReport = fullReports.find(item => String(item.databaseId || item.id) === String(id) || String(item.id) === String(id));
    if (!fullReport) return report;
    fullReport.status = ['done', 'concluido', 'concluído', 'entregue'].includes(String(fullReport.status).toLowerCase()) ? 'done' : (fullReport.status || 'draft');
    fullReport.hasFullData = true;
    const index = data.reports.findIndex(item => String(item.databaseId || item.id) === String(fullReport.databaseId || fullReport.id) || String(item.id) === String(fullReport.id));
    if (index >= 0) data.reports[index] = {...data.reports[index], ...fullReport};
    else data.reports.unshift(fullReport);
    return data.reports.find(item => String(item.databaseId || item.id) === String(fullReport.databaseId || fullReport.id) || String(item.id) === String(fullReport.id)) || fullReport;
  }

  if (typeof window.ensureReportDetail !== 'function') {
    window.ensureReportDetail = ensureFullReport;
  }

  function styledFields(fields) {
    const header = currentHeader();
    return {
      ...fields,
      documentFont: header.documentFont || 'Arial',
      documentFontSize: header.documentFontSize || 12,
      detailColor: header.detailColor || '#253c31'
    };
  }

  async function documentBlob(endpoint, fields) {
    const body = new URLSearchParams();
    Object.entries(fields).forEach(([key, value]) => body.set(key, value ?? ''));
    const response = await fetch(endpoint, {method: 'POST', body});
    if (!response.ok) throw new Error(await response.text() || 'Falha ao gerar arquivo para anexo.');
    const blob = await response.blob();
    if (!blob || blob.size <= 0) throw new Error('O arquivo gerado para anexo ficou vazio.');
    return blob;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('Nao foi possivel preparar o anexo para envio.'));
      reader.readAsDataURL(blob);
    });
  }

  async function buildOfficialReportFiles(report) {
    const fullReport = await ensureFullReport(report);
    const student = data.students.find(item => String(item.id) === String(fullReport.studentId));
    if (!student) throw new Error('Aluno nao localizado para gerar anexos.');
    const period = data.periods.find(item => item.active) || data.periods[0];
    const className = student.className || data.classes.find(item => String(item.id) === String(student.classId))?.name || 'Turma nao informada';
    const header = currentHeader();
    const type = normalizeType(fullReport.documentType);
    const label = documentLabel(fullReport.documentType);
    const safeName = `${label} - ${student.name}`.replace(/[\\/:*?"<>|]+/g, '-');
    const baseFields = styledFields({
      name: student.name,
      birthDate: student.birthDate || '',
      className,
      period: period?.name || 'Periodo avaliativo',
      text: fullReport.text || '',
      documentType: type,
      studentPhoto: student.photo || '',
      entries: JSON.stringify(fullReport.entries || []),
      finalText: fullReport.useFinalText ? (fullReport.finalText || header.finalText || '') : '',
      headerNetwork: header.network || '',
      headerSchool: header.school || '',
      headerContact: header.contact || '',
      headerLogo: header.logo || ''
    });
    const pdfEntries = await Promise.all((fullReport.entries || []).map(async entry => ({
      ...entry,
      photos: (await Promise.all((entry.photos || []).map(src => typeof pdfJpeg === 'function' ? pdfJpeg(src) : src))).filter(Boolean)
    })));
    const pdfFields = {
      ...baseFields,
      studentPhoto: typeof pdfJpeg === 'function' ? await pdfJpeg(student.photo || '') : student.photo || '',
      headerLogo: typeof pdfJpeg === 'function' ? await pdfJpeg(header.logo || '') : header.logo || '',
      entries: JSON.stringify(pdfEntries)
    };
    return {
      docx: await documentBlob('download_parecer.php', baseFields),
      pdf: await documentBlob('download_pdf.php', pdfFields),
      docxName: `${safeName}.docx`,
      pdfName: `${safeName}.pdf`
    };
  }

  async function saveOfficialFile(reportId, type, blob, fileName) {
    const form = new FormData();
    form.append('reportId', reportId);
    form.append('type', type);
    form.append('file', blob, fileName);
    const response = await fetch('api.php?resource=report-files', {method: 'POST', body: form});
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Nao foi possivel salvar o arquivo final.');
    return result;
  }

  window.saveOfficialReportFiles = async function saveOfficialReportFiles(report, files = null) {
    const reportId = report?.databaseId || report?.id;
    if (!reportId) throw new Error('Documento sem identificador para salvar arquivos finais.');
    const generated = files || await buildOfficialReportFiles(report);
    await saveOfficialFile(reportId, 'docx', generated.docx, generated.docxName);
    await saveOfficialFile(reportId, 'pdf', generated.pdf, generated.pdfName);
    return generated;
  };

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadStoredFile(report, type, fallback) {
    const reportId = report?.databaseId || report?.id;
    if (!reportId || report?.status !== 'done') {
      fallback();
      return;
    }
    try {
      const response = await fetch(`api.php?resource=report-files&reportId=${encodeURIComponent(reportId)}&type=${encodeURIComponent(type)}`);
      if (!response.ok) throw new Error('Arquivo final ainda nao salvo.');
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/i);
      downloadBlob(blob, match ? match[1] : `documento.${type}`);
    } catch (error) {
      fallback();
      try {
        await window.saveOfficialReportFiles(report);
      } catch (saveError) {
        console.warn(saveError);
      }
    }
  }

  function wrapOfficialFilesFlow() {
    if (!window.downloadReport?.__officialWrapped && typeof window.downloadReport === 'function') {
      const originalDownloadReport = window.downloadReport;
      window.downloadReport = function officialDownloadReport(id) {
        const report = data.reports.find(item => String(item.id) === String(id) || String(item.databaseId) === String(id));
        return downloadStoredFile(report, 'docx', () => originalDownloadReport(id));
      };
      window.downloadReport.__officialWrapped = true;
    }
    if (!window.downloadPdf?.__officialWrapped && typeof window.downloadPdf === 'function') {
      const originalDownloadPdf = window.downloadPdf;
      window.downloadPdf = function officialDownloadPdf(id) {
        const report = data.reports.find(item => String(item.id) === String(id) || String(item.databaseId) === String(id));
        return downloadStoredFile(report, 'pdf', () => originalDownloadPdf(id));
      };
      window.downloadPdf.__officialWrapped = true;
    }
    if (!window.deliverReport?.__officialWrapped && typeof window.deliverReport === 'function') {
      const originalDeliverReport = window.deliverReport;
      window.deliverReport = async function officialDeliverReport(id) {
        const result = await originalDeliverReport(id);
        const report = data.reports.find(item => String(item.id) === String(id) || String(item.databaseId) === String(id));
        if (report?.status === 'done') {
          try {
            await window.saveOfficialReportFiles(report);
          } catch (error) {
            console.warn('Nao foi possivel salvar os arquivos finais do documento.', error);
          }
        }
        return result;
      };
      window.deliverReport.__officialWrapped = true;
    }
  }

  window.openDirectorEmailModal = async function openDirectorEmailModal(id) {
    const report = await ensureFullReport(id);
    if (!report) return alert('Documento nao encontrado.');
    const message = defaultMessage(report);
    if (typeof open === 'function') {
      open(`
        <h2 class="modal-title">Enviar documento por e-mail</h2>
        <p class="modal-subtitle">Informe o e-mail que recebera o parecer ou portfolio finalizado.</p>
        <div class="field">
          <label>E-mail do destinatario</label>
          <input id="directorEmailRecipient" type="email" placeholder="destinatario@escola.edu.br" autocomplete="email">
        </div>
        <div class="field">
          <label>Mensagem do e-mail</label>
          <textarea id="directorEmailMessage" rows="6" data-ai-review-disabled="1">${escapeHtml(message)}</textarea>
        </div>
        <p id="directorEmailStatus" class="profile-message"></p>
        <div class="form-actions">
          <button class="secondary" type="button" onclick="document.querySelector('#modal').close()">Cancelar</button>
          <button class="primary" type="button" id="directorEmailSendButton" onclick="sendReportToDirector(${Number(report.databaseId || report.id)})">Enviar e-mail</button>
        </div>
      `);
    }
  };

  window.sendReportToDirector = async function sendReportToDirector(reportId) {
    const status = $('#directorEmailStatus');
    const sendButton = $('#directorEmailSendButton');
    const recipientEmail = $('#directorEmailRecipient')?.value.trim() || '';
    const message = $('#directorEmailMessage')?.value.trim() || '';
    if (!recipientEmail) {
      if (status) status.textContent = 'Informe o e-mail do destinatario.';
      $('#directorEmailRecipient')?.focus();
      return;
    }
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.dataset.originalText = sendButton.dataset.originalText || sendButton.textContent;
      sendButton.innerHTML = '<span class="email-send-spinner" aria-hidden="true"></span> Enviando...';
    }
    if (status) {
      status.classList.add('email-send-loading');
      status.innerHTML = '<span class="email-send-spinner" aria-hidden="true"></span> Preparando envio...';
    }
    try {
      const report = await ensureFullReport(reportId);
      if (!report) throw new Error('Documento nao encontrado para gerar anexos.');
      if (status) status.innerHTML = '<span class="email-send-spinner" aria-hidden="true"></span> Atualizando arquivos finais com imagens...';
      await window.saveOfficialReportFiles(report);
      if (status) status.innerHTML = '<span class="email-send-spinner" aria-hidden="true"></span> Anexando arquivos oficiais e enviando e-mail...';
      const sendRequest = async () => {
        const response = await fetch('api.php?resource=send-report-email', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({reportId, recipientEmail, message})
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Nao foi possivel enviar o e-mail.');
        return result;
      };
      let result;
      try {
        result = await sendRequest();
      } catch (error) {
        if (!String(error?.message || '').includes('arquivo final salvo')) throw error;
        if (status) status.innerHTML = '<span class="email-send-spinner" aria-hidden="true"></span> Salvando arquivos finais para este documento...';
        await window.saveOfficialReportFiles(report);
        result = await sendRequest();
      }
      if (status) {
        status.classList.remove('email-send-loading');
        status.textContent = result.message || 'E-mail enviado com sucesso.';
      }
    } catch (error) {
      if (status) {
        status.classList.remove('email-send-loading');
        const message = String(error?.message || '');
        status.textContent = message.toLowerCase().includes('abort')
          ? 'O envio foi interrompido pelo navegador ou servidor. Tente novamente com menos imagens ou envie pelo Google Drive.'
          : message;
      }
    } finally {
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = sendButton.dataset.originalText || 'Enviar e-mail';
      }
    }
  };

  function decorateReportList() {
    document.querySelectorAll('#reportsList .report-row').forEach(row => {
      const button = row.querySelector('button[onclick^="editReport"]');
      if (!button || row.querySelector('[data-email-director]')) return;
      const match = button.getAttribute('onclick')?.match(/editReport\(([^)]+)\)/);
      const id = match?.[1];
      const status = row.querySelector('.status');
      if (!id || status?.textContent.trim() !== 'Entregue') return;
      button.insertAdjacentHTML('beforebegin', `<button class="secondary" data-email-director type="button" onclick="openDirectorEmailModal(${id})">Enviar e-mail</button>`);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    wrapOfficialFilesFlow();
    ensureFinalTextField();
    hookSaveHeaderSettings();
    window.loadHeaderSettings?.();
    decorateReportList();
    const list = $('#reportsList');
    if (list) new MutationObserver(decorateReportList).observe(list, {childList: true, subtree: true});
  });
})();
