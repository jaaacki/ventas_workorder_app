function generateWoReportPdf(hetIdOrHetNumber, woId) {
  // https://script.google.com/u/0/home/projects/18Ig3sc-V3n5SRQqjVI_pVm_Jeo6ONJb-WOAjq97hPWxeUZ91U3i9OeWL/edit
  const result = BOM_WO_SHEET.generateWoReportPdf(hetIdOrHetNumber);
  Logger.log(result)
  if (result) {
    const res = AppSheet.editRow(woId, {reportPdf: result, forceField: ''}, 'workOrder')
  } else {
    const res = AppSheet.editRow(woId, {forceField: ''}, 'workOrder')
  }
}
