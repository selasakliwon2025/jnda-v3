/**
 * ============================================================
 * JNDA V3 - APPLICATION FOUNDATION
 * File    : 00_APP.gs
 * Version : V3
 * ============================================================
 */

/**
 * Informasi aplikasi.
 */
function getAppInfo() {
  return {
    name: getConfig('APP_NAME'),
    shortName: getConfig('APP_SHORT_NAME'),
    version: getConfig('APP_VERSION'),
    timezone: getConfig('TIMEZONE')
  };
}


/**
 * Nama aplikasi.
 */
function getAppName() {
  return getConfig('APP_NAME');
}


/**
 * Versi aplikasi.
 */
function getAppVersion() {
  return getConfig('APP_VERSION');
}


/**
 * Timezone aplikasi.
 */
function getAppTimezone() {
  return getConfig('TIMEZONE');
}


/**
 * Include file HTML.
 *
 * Digunakan oleh UI/Layout:
 * <?!= include('UI_Styles'); ?>
 */
function include(filename) {
  return HtmlService
    .createTemplateFromFile(filename)
    .evaluate()
    .getContent();
}

/**
 * ============================================================
 * DATABASE SHEET HELPER
 * ============================================================
 *
 * Mengambil sheet dari database utama JNDA.
 */
function getDatabaseSheet(sheetName) {

  if (!sheetName) {
    throw new Error(
      'Nama sheet database tidak boleh kosong.'
    );
  }

  const spreadsheetId =
    getConfig(
      'DATABASE_SPREADSHEET_ID'
    );

  if (!spreadsheetId) {
    throw new Error(
      'DATABASE_SPREADSHEET_ID belum dikonfigurasi.'
    );
  }

  const spreadsheet =
    SpreadsheetApp.openById(
      spreadsheetId
    );

  /*
  * Pastikan database menggunakan timezone
  * yang sama dengan aplikasi.
  */
  const appTimezone =
    getConfig('TIMEZONE');

  if (
    appTimezone &&
    spreadsheet.getSpreadsheetTimeZone() !== appTimezone
  ) {
    spreadsheet.setSpreadsheetTimeZone(
      appTimezone
    );
  }

  const sheet =
    spreadsheet.getSheetByName(
      String(sheetName).trim()
    );

  if (!sheet) {
    throw new Error(
      'Sheet database tidak ditemukan: ' +
      sheetName
    );
  }

  return sheet;
}


/**
 * ============================================================
 * CONFIG COMPATIBILITY HELPER
 * ============================================================
 *
 * Dipakai service V3 yang menggunakan getConfigValue().
 */
function getConfigValue(key) {

  return getConfig(key);

}