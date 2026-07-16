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

  function isImageDataUrl(value) {
    return typeof value === 'string' && /^data:image\/[\w.+-]+;base64,/.test(value);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  async function compactImageDataUrl(dataUrl, maxWidth = 1200, quality = 0.72) {
    if (!isImageDataUrl(dataUrl)) return dataUrl || '';
    return new Promise(resolve => {
      const image = new Image();
      const finish = value => resolve(value || dataUrl);
      const timer = setTimeout(() => finish(dataUrl), 7000);
      image.onload = () => {
        clearTimeout(timer);
        try {
          const scale = Math.min(1, maxWidth / Math.max(image.naturalWidth || image.width || maxWidth, 1));
          const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
          const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', {alpha: false});
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          const compact = canvas.toDataURL('image/jpeg', quality);
          finish(compact.length < dataUrl.length ? compact : dataUrl);
        } catch (error) {
          finish(dataUrl);
        }
      };
      image.onerror = () => {
        clearTimeout(timer);
        finish(dataUrl);
      };
      image.src = dataUrl;
    });
  }

  async function compactReportEntries(entries) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    const compacted = [];
    for (const entry of sourceEntries) {
      const photos = [];
      for (const photo of (Array.isArray(entry?.photos) ? entry.photos : [])) {
        photos.push(await compactImageDataUrl(photo, 1280, 0.72));
      }
      compacted.push({...entry, photos});
    }
    return compacted;
  }

  async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('Nao foi possivel preparar o anexo para envio.'));
      reader.readAsDataURL(blob);
    });
  }

  async function buildEmailAttachments(report) {
    if (window.ensureReportDetail) {
      await Promise.race([
        window.ensureReportDetail(report.databaseId || report.id),
        new Promise(resolve => setTimeout(resolve, 8000))
      ]);
    }
    const fullReport = data.reports.find(item => String(item.id) === String(report.id) || String(item.databaseId) === String(report.databaseId)) || report;
    const student = data.students.find(item => String(item.id) === String(fullReport.studentId));
    if (!student) throw new Error('Aluno nao localizado para gerar anexos.');
    const period = data.periods.find(item => item.active) || data.periods[0];
    const className = student.className || data.classes.find(item => String(item.id) === String(student.classId))?.name || 'Turma nao informada';
    const header = currentHeader();
    const type = normalizeType(fullReport.documentType);
    const label = documentLabel(fullReport.documentType);
    const safeName = `${label} - ${student.name}`.replace(/[\\/:*?"<>|]+/g, '-');
    const compactStudentPhoto = await compactImageDataUrl(student.photo || '', 900, 0.74);
    const compactHeaderLogo = await compactImageDataUrl(header.logo || '', 700, 0.78);
    const compactEntries = await compactReportEntries(fullReport.entries || []);
    const baseFields = styledFields({
      name: student.name,
      birthDate: student.birthDate || '',
      className,
      period: period?.name || 'Periodo avaliativo',
      text: fullReport.text || '',
      documentType: type,
      studentPhoto: compactStudentPhoto,
      entries: JSON.stringify(compactEntries),
      finalText: fullReport.useFinalText ? (fullReport.finalText || header.finalText || '') : '',
      headerNetwork: header.network || '',
      headerSchool: header.school || '',
      headerContact: header.contact || '',
      headerLogo: compactHeaderLogo
    });
    const pdfFields = {
      ...baseFields,
      studentPhoto: compactStudentPhoto,
      headerLogo: compactHeaderLogo,
      entries: JSON.stringify(compactEntries)
    };
    return {
      docx: await documentBlob('download_parecer.php', baseFields),
      pdf: await documentBlob('download_pdf.php', pdfFields),
      docxName: `${safeName}.docx`,
      pdfName: `${safeName}.pdf`
    };
  }

  window.openDirectorEmailModal = async function openDirectorEmailModal(id) {
    const report = await (window.ensureReportDetail ? window.ensureReportDetail(id) : Promise.resolve(data.reports.find(item => String(item.id) === String(id))));
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
          <textarea id="directorEmailMessage" rows="6">${escapeHtml(message)}</textarea>
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
      const report = data.reports.find(item => String(item.databaseId || item.id) === String(reportId) || String(item.id) === String(reportId));
      if (!report) throw new Error('Documento nao encontrado para gerar anexos.');
      if (status) status.innerHTML = '<span class="email-send-spinner" aria-hidden="true"></span> Otimizando imagens e gerando anexos PDF e Word...';
      const attachments = await buildEmailAttachments(report);
      if (status) status.innerHTML = '<span class="email-send-spinner" aria-hidden="true"></span> Anexando arquivos e enviando e-mail...';
      const totalSize = attachments.docx.size + attachments.pdf.size;
      if (totalSize > 18 * 1024 * 1024) {
        throw new Error(`Os anexos ficaram muito grandes (${formatBytes(totalSize)}). Remova algumas imagens ou envie pelo Google Drive.`);
      }
      const encodedAttachments = [
        {
          name: attachments.docxName,
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          content: await blobToBase64(attachments.docx)
        },
        {
          name: attachments.pdfName,
          mime: 'application/pdf',
          content: await blobToBase64(attachments.pdf)
        }
      ];
      const response = await fetch('api.php?resource=send-report-email', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          reportId,
          recipientEmail,
          message,
          attachments: encodedAttachments
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Nao foi possivel enviar o e-mail.');
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
    ensureFinalTextField();
    hookSaveHeaderSettings();
    window.loadHeaderSettings?.();
    decorateReportList();
    const list = $('#reportsList');
    if (list) new MutationObserver(decorateReportList).observe(list, {childList: true, subtree: true});
  });
})();
