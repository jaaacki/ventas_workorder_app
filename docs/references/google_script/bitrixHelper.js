function httpBitrix(url, payload) {

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true // This allows us to handle HTTP errors gracefully
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode !== 200) {
      Logger.log("HTTP Error: " + responseCode);
      return null;
    }

    const data = JSON.parse(response.getContentText());

    if (data.error) {
      Logger.log("API Error: " + data.error_description);
      return null;
    }

    // Assuming the actual contact data is in the 'result' field
    if (data.result) {
      return data.result;
    } else {
      Logger.log("No result found in the response");
      return null;
    }

  } catch (e) {
    Logger.log("Exception occurred: " + e.toString());
    return null;
  }
}

function httpBitrixArray(type, payload) {
  var array = [];
  var url = TechDevops + type;
  Logger.log(url)

  while (true) {
    var options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload)
    };

    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());
    //Logger.log(data)

    if (data.error) {
      Logger.log("Error: " + data.error_description);
      break;
    }

    if (data.result && data.result.length > 0) {
      array = array.concat(data.result);
      Logger.log("Fetched " + array.length + " array so far.");
    }

    if (data.next) {
      payload.start = data.next;
    } else {
      break;
    }

    // Respect Bitrix24 API rate limits
    Utilities.sleep(500);
  }
  //Logger.log(array)
  return array;
}
