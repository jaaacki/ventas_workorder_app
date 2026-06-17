function saveUsers() {
  const type = "user.search";
  const payload = {};
  const usersObj = httpBitrixArray(type, payload);
  const filterObj = Helper.filterObjectsInArray(usersObj, { ACTIVE: true })

  Helper.arrSaveToSheet(filterObj, 'staff')

}