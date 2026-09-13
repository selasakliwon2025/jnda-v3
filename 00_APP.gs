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