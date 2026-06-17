const AppSheet = {
  APP_ID: APPSHEET_ID,
  ACCESS_KEY: APPSHEET_KEY,
  DEFAULT_KEY_FIELD: 'ID',

  TABLES: {
    bomLine: { table: 'bomLine', keyField: 'bomLineId' },
    workOrder: {table: 'workOrder', keyField: 'woId'}
  },

  _resolveTableName(name) {
    return (this.TABLES[name] && this.TABLES[name].table) || name;
  },

  _resolveKeyField(name) {
    return (this.TABLES[name] && this.TABLES[name].keyField) || this.DEFAULT_KEY_FIELD;
  },

  _makeApiCall(action, payloadRows, tableName, options = {}) {
    Logger.log(payloadRows)
    if (!tableName || typeof tableName !== 'string' || tableName.trim() === '') {
      throw new Error(`tableName must be a non-empty string for ${action} operation. Got: ${JSON.stringify(tableName)}`);
    }
    if (!this.ACCESS_KEY) throw new Error('ACCESS_KEY is missing or null.');
    const encodedTableName = encodeURIComponent(tableName);
    const url = `https://api.appsheet.com/api/v2/apps/${this.APP_ID}/tables/${encodedTableName}/Action`;
    const payload = { Action: action, Properties: { Locale: 'en-US', Timezone: 'Singapore Standard Time', ...options }, Rows: payloadRows };
    const fetchOptions = { method: 'post', headers: { ApplicationAccessKey: this.ACCESS_KEY, 'Content-Type': 'application/json' }, payload: JSON.stringify(payload), muteHttpExceptions: true };
    try {
      const response = UrlFetchApp.fetch(url, fetchOptions);
      const body = response.getContentText();
      if (response.getResponseCode() === 200) {
        if (body && body.trim() !== '') {
          try { return JSON.parse(body); } catch (e) { return { success: true, note: 'Empty or malformed response body' }; }
        }
        return { success: true, note: 'Empty response body' };
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  addRow(rowData, tableOrAlias, options = {}) {
    const table = this._resolveTableName(tableOrAlias);
    return this._makeApiCall('Add', [rowData], table, options);
  },

  editRow(rowKeyValue, rowData, tableOrAlias, options = {}) {
    const table = this._resolveTableName(tableOrAlias);
    const keyField = this._resolveKeyField(tableOrAlias);
    const rowWithKey = { [keyField]: rowKeyValue, ...rowData };
    return this._makeApiCall('Edit', [rowWithKey], table, options);
  },

  deleteRow(rowKeyValue, tableOrAlias, options = {}) {
    const table = this._resolveTableName(tableOrAlias);
    const keyField = this._resolveKeyField(tableOrAlias);
    return this._makeApiCall('Delete', [{ [keyField]: rowKeyValue }], table, options);
  }
};

// function tryUpdate() {
//   const res = AppSheet.editRow('WKO-250919X3B', { forceField: '', reportPdf: 'workOrder_Report_Pdf/H20002025BE_HET-2502122MLL_20251001133258.pdf' }, 'workOrder');
//   Logger.log(JSON.stringify(res));
// }


// Example usage for your bomLine table:
// Assume key field is 'LineID'—update DEFAULT_KEY_FIELD accordingly
// const updateData = { 'Quantity': 50, 'Description': 'Updated BOM line' };
// const result = AppSheet.editRow('line-123', updateData, 'bomLine');

// For delete:
// AppSheet.deleteRow('unique-123', 'Orders');