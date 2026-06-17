const Helper = {
  arrSaveToSheet: function (dataArray, sheetName) {
    let sheet = SheetById.getSheetByName(sheetName);

    // 1. Sheet existence check and creation (if needed)
    if (!sheet) {
      Logger.log(`Sheet "${sheetName}" not found. Creating it now.`);
      try {
        sheet = SheetById.insertSheet(sheetName);
      } catch (e) {
        Logger.log(`Failed to create sheet "${sheetName}": ${e.toString()}`);
        return;
      }
    }

    if (!dataArray || dataArray.length === 0) {
      Logger.log("Data array is empty or null. No action taken.");
      return;
    }

    // 2. Determine headers and start row based on sheet status
    const lastRow = sheet.getLastRow();
    let headers;
    let startRow;
    let outputData;

    if (lastRow === 0) {
      // Sheet is blank: Write headers + data
      startRow = 1;
      headers = Object.keys(dataArray[0]);
      Logger.log("Sheet was empty. Writing headers and data.");
    } else {
      // Sheet has content: Read existing headers from Row 1
      startRow = 2; // Data always starts on row 2 if headers exist

      // Read all existing headers and filter out any blank cells at the end
      const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      headers = existingHeaders.filter(h => h !== '');

      // Crucial step: Clear all old data (from row 2 down) to prevent stale records
      const dataRange = sheet.getRange(2, 1, lastRow, headers.length);
      dataRange.clearContent();

      Logger.log(`Sheet had existing data. Preserving headers, clearing old content, and starting write at row ${startRow}.`);
    }

    // 3. Convert Array of Objects to a 2D Array of values (DATA TRANSFORMATION)
    const dataRows = dataArray.map(obj => {
      // Use the determined headers (either new or existing) to map the object fields.
      // This ensures only fields matching the headers are included (ignoring extra fields).
      return headers.map(header => obj[header] === undefined ? '' : obj[header]);
    });

    // 4. Construct final payload
    outputData = (lastRow === 0) ? [headers, ...dataRows] : dataRows;

    // 5. Write data to the sheet
    const numRowsToWrite = outputData.length;
    const numColumns = headers.length;

    try {
      sheet.getRange(startRow, 1, numRowsToWrite, numColumns).setValues(outputData);
      Logger.log(`Successfully wrote ${numRowsToWrite} rows to sheet "${sheetName}".`);
    } catch (e) {
      Logger.log(`Failed to write data to sheet "${sheetName}". Please ensure all input objects have the required keys. Error: ${e.toString()}`);
    }
  },
  filterObjectsInArray: function (array, filterObject) {
    if (!Array.isArray(array) || array.length === 0) {
      // Return an empty array if the input is not valid or empty
      return [];
    }

    // Get the [key, value] pairs from the filter object
    const filterEntries = Object.entries(filterObject);

    // Use Array.filter() to check each item in the input array
    return array.filter(item => {
      // Use Array.every() to check if ALL filter criteria are met for the current item
      return filterEntries.every(([key, value]) => {
        // Check 1: Does the item have the property?
        // Check 2: Does the property's value exactly match the filter's value?
        return item.hasOwnProperty(key) && item[key] === value;
      });
    });
  }
}