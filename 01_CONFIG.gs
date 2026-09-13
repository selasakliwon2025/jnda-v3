/**
 * ============================================================
 * JNDA V3 - CONFIGURATION
 * File    : 01_CONFIG.gs
 * Version : V3
 * ============================================================
 */

const JNDA_CONFIG = {

  // ----------------------------------------------------------
  // APPLICATION
  // ----------------------------------------------------------

  APP_NAME: 'JN Daily Attendance',
  APP_SHORT_NAME: 'JNDA',
  APP_VERSION: 'V3',

  // ----------------------------------------------------------
  // DATABASE
  // ----------------------------------------------------------

  DATABASE_SPREADSHEET_ID: '1CEcF60r7_FYgjdFmbCfnbxc1RLwqdNDjzARoD6ABPQw',

  USER_SHEET_NAME: 'SYS_User',
  EMPLOYEE_SHEET_NAME: 'HR_Employee',

  // ----------------------------------------------------------
  // SYSTEM
  // ----------------------------------------------------------

  TIMEZONE: 'Asia/Jakarta',

  // ----------------------------------------------------------
  // SECURITY
  // ----------------------------------------------------------

  DEVICE_BINDING: false,

  // Session dalam menit.
  SESSION_TIMEOUT_MINUTES: 480,

  // ----------------------------------------------------------
  // GPS
  // ----------------------------------------------------------

  DEFAULT_GPS_RADIUS_METERS: 100,

  // ----------------------------------------------------------
  // ATTENDANCE
  // ----------------------------------------------------------

  ACTIVE_ATTENDANCE_MONTHS: 3,

  // Maksimum sesi presensi darat.
  LAND_MAX_SESSION_HOURS: 24,

  // Maksimum sesi presensi crew.
  CREW_MAX_SESSION_HOURS: 72,

  // ----------------------------------------------------------
  // ARCHIVE
  // ----------------------------------------------------------

  AUTO_PURGE: false
};




/**
 * Mengambil konfigurasi.
 */
function getConfig(key) {

  if (!(key in JNDA_CONFIG)) {
    throw new Error(
      'Configuration tidak ditemukan: ' + key
    );
  }

  return JNDA_CONFIG[key];
}


/**
 * Mengambil seluruh konfigurasi.
 *
 * Hanya untuk kebutuhan internal/admin.
 */
function getAllConfig() {
  return Object.assign({}, JNDA_CONFIG);
}