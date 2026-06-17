/** Appsheet */
const APPSHEET_ID = PropertiesService.getScriptProperties().getProperty('APPSHEET_ID');
const APPSHEET_KEY = PropertiesService.getScriptProperties().getProperty('APPSHEET_KEY');

/** Bitrix */
const BitrixBaseUrl = "https://ventasbio.bitrix24.com/rest"
const NotifyBotUrl = BitrixBaseUrl + PropertiesService.getScriptProperties().getProperty('notifyBotKey') + '/';
const TechDevops = BitrixBaseUrl + PropertiesService.getScriptProperties().getProperty('techDevops') + '/';

/** Google Sheet */
const SheetById = SpreadsheetApp.openById("1MTW18USJHOLCO7jNOLCnmaYPZ5S0Dte53Y5dwDWOJz0");

/** TAMOTSU */
Tamotsu.initialize(SheetById);
const Staff = Tamotsu.Table.define({
  // classProperties
  sheetName: 'staff',
  idColumn: 'ID',
  rowShift: 0,
  columnShift: 0,
})

class Wo {
  static get WorkOrder() {
    return this._getTamotsuTable('workOrder', 'woId');
  }
  static get WorkOrderTemp() {
    return this._getTamotsuTable('workOrder_temp', 'woId');
  }
  static get PhaseEquip() {
    return this._getTamotsuTable('phaseEquip', 'id')
  }
  static _getTamotsuTable(sheetName, idColumn) {
    Tamotsu.initialize(SheetById);
    return Tamotsu.Table.define({
      sheetName: sheetName,
      idColumn: idColumn,
    });
  }
}