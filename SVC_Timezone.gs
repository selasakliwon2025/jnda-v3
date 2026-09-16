/**
 * ============================================================
 * JNDA V3 - TIMEZONE SERVICE
 * File    : SVC_Timezone.gs
 * Version : V3
 * ============================================================
 *
 * RULE:
 * - WIB  = Asia/Jakarta
 * - WITA = Asia/Makassar
 * - WIT  = TIDAK DIGUNAKAN
 *
 * LAND:
 *   Employee -> Branch -> TIME_ZONE
 *
 * CREW:
 *   Employee -> Ship -> LATITUDE/LONGITUDE
 *   Timezone ditentukan berdasarkan posisi terakhir kapal.
 *
 * IMPORTANT:
 * Jam server / browser TIDAK dijadikan sumber timezone.
 * ============================================================
 */


/**
 * ============================================================
 * CONSTANT
 * ============================================================
 */

const JNDA_TIMEZONE = {
  WIB: 'Asia/Jakarta',
  WITA: 'Asia/Makassar',

  WIB_LABEL: 'WIB',
  WITA_LABEL: 'WITA'
};


/**
 * ============================================================
 * PUBLIC
 * ============================================================
 */


/**
 * Mendapatkan timezone berdasarkan EMPLOYEE_ID.
 *
 * LAND:
 *   MS_Branch.TIME_ZONE
 *
 * CREW:
 *   MS_Ship.LATITUDE / LONGITUDE
 *
 * Return:
 *
 * {
 *   timezone: 'Asia/Jakarta',
 *   label: 'WIB',
 *   source: 'BRANCH'
 * }
 */
function getEmployeeTimezone(employeeId) {

  if (!employeeId) {
    throw new Error(
      'EMPLOYEE_ID wajib diisi untuk menentukan timezone.'
    );
  }

  const employee =
    getTimezoneEmployee(employeeId);

  if (!employee) {
    throw new Error(
      'Data employee tidak ditemukan: ' +
      employeeId
    );
  }


  // ----------------------------------------------------------
  // CREW / KAPAL
  // ----------------------------------------------------------

  if (employee.SHIP_ID) {

    const ship =
      getTimezoneShip(employee.SHIP_ID);

    if (!ship) {
      throw new Error(
        'Data kapal tidak ditemukan: ' +
        employee.SHIP_ID
      );
    }

    const latitude =
      parseCoordinate(ship.LATITUDE);

    const longitude =
      parseCoordinate(ship.LONGITUDE);


    if (
      latitude === null ||
      longitude === null
    ) {

      throw new Error(
        'Posisi kapal belum tersedia. ' +
        'Nahkoda harus melakukan update lokasi kapal terlebih dahulu.'
      );
    }


    const shipTimezone =
      getTimezoneFromIndonesiaCoordinate(
        latitude,
        longitude
      );


    return {
      timezone:
        shipTimezone.timezone,

      label:
        shipTimezone.label,

      source:
        'SHIP',

      employeeId:
        String(employeeId),

      shipId:
        String(employee.SHIP_ID),

      latitude:
        latitude,

      longitude:
        longitude
    };
  }


  // ----------------------------------------------------------
  // LAND / DARAT
  // ----------------------------------------------------------

  const branchId =
    String(employee.BRANCH_ID || '').trim();


  if (!branchId) {

    throw new Error(
      'Employee belum memiliki BRANCH_ID.'
    );
  }


  const branch =
    getTimezoneBranch(branchId);


  if (!branch) {

    throw new Error(
      'Data branch tidak ditemukan: ' +
      branchId
    );
  }


  const timezone =
    normalizeTimezoneValue(
      branch.TIME_ZONE
    );


  if (!timezone) {

    throw new Error(
      'TIME_ZONE branch belum diisi untuk branch: ' +
      branchId
    );
  }


  return {

    timezone:
      timezone.timezone,

    label:
      timezone.label,

    source:
      'BRANCH',

    employeeId:
      String(employeeId),

    branchId:
      branchId,

    branchName:
      String(
        branch.BRANCH_NAME ||
        ''
      ),

    latitude:
      parseCoordinate(branch.LATITUDE),

    longitude:
      parseCoordinate(branch.LONGITUDE)
  };
}


/**
 * ============================================================
 * EMPLOYEE LOOKUP
 * ============================================================
 */

function getTimezoneEmployee(employeeId) {

  const rows =
    getTimezoneSheetObjects(
      'HR_Employee'
    );

  const target =
    String(employeeId).trim();


  for (
    let i = 0;
    i < rows.length;
    i++
  ) {

    const row = rows[i];

    if (
      String(
        row.EMPLOYEE_ID || ''
      ).trim() === target
    ) {

      return row;
    }
  }


  return null;
}


/**
 * ============================================================
 * BRANCH LOOKUP
 * ============================================================
 */

function getTimezoneBranch(branchId) {

  const rows =
    getTimezoneSheetObjects(
      'MS_Branch'
    );

  const target =
    String(branchId).trim();


  for (
    let i = 0;
    i < rows.length;
    i++
  ) {

    const row = rows[i];

    if (
      String(
        row.BRANCH_ID || ''
      ).trim() === target
    ) {

      return row;
    }
  }


  return null;
}


/**
 * ============================================================
 * SHIP LOOKUP
 * ============================================================
 */

function getTimezoneShip(shipId) {

  const rows =
    getTimezoneSheetObjects(
      'MS_Ship'
    );

  const target =
    String(shipId).trim();


  for (
    let i = 0;
    i < rows.length;
    i++
  ) {

    const row = rows[i];

    if (
      String(
        row.SHIP_ID || ''
      ).trim() === target
    ) {

      return row;
    }
  }


  return null;
}


/**
 * ============================================================
 * COORDINATE -> TIMEZONE
 * ============================================================
 *
 * JNDA V3 saat ini hanya menggunakan:
 *
 *   WIB  : Asia/Jakarta
 *   WITA : Asia/Makassar
 *
 * Batas operasional timezone Indonesia bagian barat/tengah
 * digunakan sekitar longitude 114° BT.
 *
 * < 114  -> WIB
 * >= 114 -> WITA
 *
 * Ini digunakan khusus untuk posisi kapal.
 * ============================================================
 */

function getTimezoneFromIndonesiaCoordinate(
  latitude,
  longitude
) {

  const lat =
    Number(latitude);

  const lng =
    Number(longitude);


  if (
    !isFinite(lat) ||
    !isFinite(lng)
  ) {

    throw new Error(
      'Koordinat tidak valid.'
    );
  }


  // ----------------------------------------------------------
  // VALIDASI AREA INDONESIA
  // ----------------------------------------------------------

  if (
    lat < -11.5 ||
    lat > 6.5 ||
    lng < 94 ||
    lng > 141
  ) {

    throw new Error(
      'Posisi kapal berada di luar area Indonesia.'
    );
  }


  // ----------------------------------------------------------
  // WIB / WITA
  // ----------------------------------------------------------

  if (lng < 114) {

    return {

      timezone:
        JNDA_TIMEZONE.WIB,

      label:
        JNDA_TIMEZONE.WIB_LABEL
    };

  }


  return {

    timezone:
      JNDA_TIMEZONE.WITA,

    label:
      JNDA_TIMEZONE.WITA_LABEL
  };
}


/**
 * ============================================================
 * NORMALIZE TIMEZONE
 * ============================================================
 *
 * Mendukung value database:
 *
 * Asia/Jakarta
 * Asia/Makassar
 * WIB
 * WITA
 * UTC+7
 * UTC+8
 * ============================================================
 */

function normalizeTimezoneValue(value) {

  const text =
    String(value || '')
      .trim()
      .toUpperCase();


  if (!text) {
    return null;
  }


  // WIB
  if (
    text === 'WIB' ||
    text === 'ASIA/JAKARTA' ||
    text === 'UTC+7' ||
    text === 'GMT+7'
  ) {

    return {

      timezone:
        JNDA_TIMEZONE.WIB,

      label:
        JNDA_TIMEZONE.WIB_LABEL
    };
  }


  // WITA
  if (
    text === 'WITA' ||
    text === 'ASIA/MAKASSAR' ||
    text === 'UTC+8' ||
    text === 'GMT+8'
  ) {

    return {

      timezone:
        JNDA_TIMEZONE.WITA,

      label:
        JNDA_TIMEZONE.WITA_LABEL
    };
  }


  // WIT SENGAJA DITOLAK
  if (
    text === 'WIT' ||
    text === 'ASIA/JAYAPURA' ||
    text === 'UTC+9' ||
    text === 'GMT+9'
  ) {

    throw new Error(
      'JNDA V3 tidak menggunakan timezone WIT.'
    );
  }


  return null;
}


/**
 * ============================================================
 * DATE / TIME
 * ============================================================
 */


/**
 * Mendapatkan Date object yang sudah diformat
 * berdasarkan timezone employee.
 *
 * PERHATIAN:
 * Date JavaScript sendiri tetap merupakan absolute timestamp.
 * Timezone hanya digunakan saat formatting.
 */
function formatEmployeeDateTime(
  date,
  employeeId
) {

  const context =
    getEmployeeTimezone(
      employeeId
    );


  return {

    value:
      Utilities.formatDate(
        new Date(date),
        context.timezone,
        'yyyy-MM-dd HH:mm:ss'
      ),

    date:
      Utilities.formatDate(
        new Date(date),
        context.timezone,
        'yyyy-MM-dd'
      ),

    time:
      Utilities.formatDate(
        new Date(date),
        context.timezone,
        'HH:mm:ss'
      ),

    timezone:
      context.timezone,

    label:
      context.label,

    source:
      context.source
  };
}


/**
 * Mendapatkan tanggal kerja employee.
 */
function getEmployeeWorkDate(
  date,
  employeeId
) {

  const context =
    getEmployeeTimezone(
      employeeId
    );


  return Utilities.formatDate(
    new Date(date),
    context.timezone,
    'yyyy-MM-dd'
  );
}


/**
 * ============================================================
 * SHEET HELPER
 * ============================================================
 */

function getTimezoneSheetObjects(
  sheetName
) {

  const spreadsheet =
    SpreadsheetApp.openById(
      getConfigValue(
        'DATABASE_SPREADSHEET_ID'
      )
    );


  const sheet =
    spreadsheet.getSheetByName(
      sheetName
    );


  if (!sheet) {

    throw new Error(
      'Sheet tidak ditemukan: ' +
      sheetName
    );
  }


  const values =
    sheet.getDataRange()
      .getValues();


  if (
    !values ||
    values.length < 2
  ) {

    return [];
  }


  const headers =
    values[0].map(function(header) {

      return String(
        header || ''
      ).trim();

    });


  const result = [];


  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    const row = values[i];

    const object = {};


    for (
      let j = 0;
      j < headers.length;
      j++
    ) {

      if (!headers[j]) {
        continue;
      }

      object[headers[j]] =
        row[j];
    }


    result.push(object);
  }


  return result;
}


/**
 * ============================================================
 * COORDINATE HELPER
 * ============================================================
 */

function parseCoordinate(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return null;
  }


  const number =
    Number(
      String(value)
        .replace(',', '.')
        .trim()
    );


  if (!isFinite(number)) {
    return null;
  }


  return number;
}