(() => {
  const originalEditReport = window.editReport;
  const originalDownloadReport = window.downloadReport;
  const originalDownloadPdf = window.downloadPdf;
  let lastReportRefresh = 0;

  async function ensureReportDetail(reportId) {
    const report = data.reports.find(item => String(item.id) === String(reportId) || String(item.databaseId) === String(reportId));
    if (!report || report.hasFullData) return report;
    const databaseId = report.databaseId || report.id;
    const response = await fetch(`api.php?resource=reports&id=${encodeURIComponent(databaseId)}`);
    const detail = await response.json();
    if (!response.ok || !Array.isArray(detail) || !detail[0]) throw new Error(detail.error || 'Não foi possível carregar o documento completo.');
    Object.assign(report, detail[0], {hasFullData: true});
    return report;
  }
  window.ensureReportDetail = ensureReportDetail;

  window.editReport = async function editReport(reportId) {
    try {
      await ensureReportDetail(reportId);
      originalEditReport?.(reportId);
    } catch (error) {
      alert(error.message || 'Não foi possível abrir o documento.');
    }
  };

  window.downloadReport = async function downloadReport(reportId) {
    try {
      await ensureReportDetail(reportId);
      originalDownloadReport?.(reportId);
    } catch (error) {
      alert(error.message || 'Não foi possível baixar o DOCX.');
    }
  };

  window.downloadPdf = async function downloadPdf(reportId) {
    try {
      await ensureReportDetail(reportId);
      originalDownloadPdf?.(reportId);
    } catch (error) {
      alert(error.message || 'Não foi possível baixar o PDF.');
    }
  };

  if (typeof loadReports === 'function') {
    const originalLoadReports = loadReports;
    window.loadReports = async function loadReportsThrottled() {
      const now = Date.now();
      if (now - lastReportRefresh < 2000) return;
      lastReportRefresh = now;
      return originalLoadReports();
    };
  }
})();
