/**
 * ============================================================
 * JNDA V3 - ATTENDANCE SERVICE
 * File    : SVC_Attendance.gs
 * Version : V3
 * ============================================================
 *
 * Prinsip:
 * - EMPLOYEE_ID berasal dari session, bukan client.
 * - Waktu attendance menggunakan server time.
 * - Dashboard TIDAK membaca seluruh HR_Attendance.
 * - Check-in hanya mencari attendance milik employee terkait.
 * - Check-out hanya mencari sesi OPEN milik employee terkait.
 * - Satu employee hanya boleh mempunyai satu sesi OPEN.
 * - Lock digunakan untuk mencegah double submit / race condition.
 *
 * GPS belum diproses di tahap ini.
 * GPS akan ditangani SVC_GPS.gs.
 * ============================================================
 */


/* ============================================================
 * CONSTANT
 * ============================================================ */

const ATTENDANCE_SHEET_NAME = 'HR_Attendance';

const ATTENDANCE_STATUS_OPEN = 'OPEN';
const ATTENDANCE_STATUS_CLOSED = 'CLOSED';


/* ============================================================
 * PUBLIC
 * ============================================================ */


/**
 * ------------------------------------------------------------
 * CHECK-IN
 * ------------------------------------------------------------
 *
 * Client cukup mengirim:
 *
 * {
 *   sessionToken: '...'
 * }
 *
 * EMPLOYEE_ID TIDAK BOLEH dipercaya dari client.
 */
function checkIn(sessionToken, payload) {

  const lock =
    LockService.getScriptLock();

  try {

    /*
     * Cegah dua request check-in bersamaan.
     */
    lock.waitLock(15000);


    /*
     * Validasi session + employee.
     */
    const context =
      _getAttendanceContext(sessionToken);


    const employee =
      context.employee;


    const employeeId =
      String(employee.EMPLOYEE_ID || '').trim();


    if (!employeeId) {
      throw new Error(
        'EMPLOYEE_ID pegawai tidak ditemukan.'
      );
    }


    /*
     * Server time.
     */
    const now =
      new Date();


    /*
     * WORK_DATE untuk tahap awal:
     * mengikuti tanggal server aplikasi.
     *
     * Nanti dapat diperluas untuk night shift.
     */
    const workDate =
      _getWorkDate(now);


    /*
     * Cari attendance employee + WORK_DATE.
     *
     * Penting:
     * tidak membaca seluruh HR_Attendance.
     */
    const existing =
      _findAttendanceByEmployeeAndDate(
        employeeId,
        workDate
      );


    /*
     * Jika sudah ada record OPEN,
     * jangan buat record kedua.
     */
    if (existing) {

      if (
        String(existing.record.STATUS || '')
          .trim()
          .toUpperCase() ===
        ATTENDANCE_STATUS_OPEN
      ) {

        return {
          success: false,
          code: 'ALREADY_CHECKED_IN',
          message:
            'Anda sudah melakukan absen masuk.',
          attendance:
            _buildAttendanceResult(
              existing.record
            )
        };
      }


      /*
       * Jika sudah CLOSED,
       * berarti employee sudah menyelesaikan
       * attendance hari tersebut.
       */
      if (
        String(existing.record.STATUS || '')
          .trim()
          .toUpperCase() ===
        ATTENDANCE_STATUS_CLOSED
      ) {

        return {
          success: false,
          code: 'ATTENDANCE_ALREADY_COMPLETED',
          message:
            'Attendance hari ini sudah selesai.',
          attendance:
            _buildAttendanceResult(
              existing.record
            )
        };
      }
    }


    /*
     * Generate ATTENDANCE_ID.
     */
    const attendanceId =
      _generateAttendanceId(
        employeeId,
        now
      );


    /*
     * Context employee.
     */
    const shiftId =
      String(
        employee.SHIFT_ID ||
        employee.ATTENDANCE_SHIFT_ID ||
        ''
      ).trim();


    const policyId =
      String(
        employee.POLICY_ID ||
        ''
      ).trim();


    const shipId =
      String(
        employee.SHIP_ID ||
        ''
      ).trim();


    /*
     * Untuk tahap awal LOCATION_ID
     * masih kosong.
     *
     * Nanti diisi oleh SVC_GPS.
     */
    const locationId = '';


    /*
     * Payload GPS sengaja belum dipercaya.
     *
     * Nanti:
     * SVC_GPS akan melakukan validasi server-side.
     */


    /*
     * Insert attendance.
     */
    const sheet =
      getDatabaseSheet(
        ATTENDANCE_SHEET_NAME
      );


    const columns =
      _getAttendanceColumns(sheet);


    const row =
      _createEmptyAttendanceRow(
        columns
      );


    _setAttendanceValue(
      row,
      columns,
      'ATTENDANCE_ID',
      attendanceId
    );


    _setAttendanceValue(
      row,
      columns,
      'EMPLOYEE_ID',
      employeeId
    );


    _setAttendanceValue(
      row,
      columns,
      'WORK_DATE',
      workDate
    );


    _setAttendanceValue(
      row,
      columns,
      'CHECK_IN_AT',
      now
    );


    _setAttendanceValue(
      row,
      columns,
      'CHECK_OUT_AT',
      ''
    );


    _setAttendanceValue(
      row,
      columns,
      'STATUS',
      ATTENDANCE_STATUS_OPEN
    );


    _setAttendanceValue(
      row,
      columns,
      'SHIFT_ID',
      shiftId
    );


    _setAttendanceValue(
      row,
      columns,
      'POLICY_ID',
      policyId
    );


    _setAttendanceValue(
      row,
      columns,
      'LOCATION_ID',
      locationId
    );


    _setAttendanceValue(
      row,
      columns,
      'SHIP_ID',
      shipId
    );


    _setAttendanceValue(
      row,
      columns,
      'WORKING_MINUTES',
      0
    );


    _setAttendanceValue(
      row,
      columns,
      'OVERTIME_MINUTES',
      0
    );


    _setAttendanceValue(
      row,
      columns,
      'REMARK',
      ''
    );


    _setAttendanceValue(
      row,
      columns,
      'CREATED_AT',
      now
    );


    _setAttendanceValue(
      row,
      columns,
      'UPDATED_AT',
      now
    );


    /*
     * Simpan satu baris saja.
     */
    sheet.appendRow(row);


    /*
     * Return data hasil insert.
     */
    const result =
      _buildAttendanceResult(
        _rowArrayToObject(
          columns,
          row
        )
      );


    return {

      success: true,

      code: 'CHECK_IN_SUCCESS',

      message:
        'Absen masuk berhasil.',

      attendance:
        result

    };


  } catch (error) {

    console.error(
      'checkIn error:',
      error
    );


    throw new Error(
      error.message ||
      'Gagal melakukan absen masuk.'
    );


  } finally {

    try {
      lock.releaseLock();
    } catch (e) {
      // ignore
    }
  }
}


/**
 * ------------------------------------------------------------
 * CHECK-OUT
 * ------------------------------------------------------------
 */
function checkOut(sessionToken, payload) {

  const lock =
    LockService.getScriptLock();

  try {

    /*
     * Cegah double checkout.
     */
    lock.waitLock(15000);


    /*
     * Validasi session.
     */
    const context =
      _getAttendanceContext(sessionToken);


    const employeeId =
      String(
        context.employee.EMPLOYEE_ID || ''
      ).trim();


    if (!employeeId) {
      throw new Error(
        'EMPLOYEE_ID pegawai tidak ditemukan.'
      );
    }


    /*
     * Server time.
     */
    const now =
      new Date();


    /*
     * Cari attendance hari ini.
     */
    const workDate =
      _getWorkDate(now);


    const existing =
      _findAttendanceByEmployeeAndDate(
        employeeId,
        workDate
      );


    /*
     * Belum check-in.
     */
    if (!existing) {

      return {

        success: false,

        code:
          'NOT_CHECKED_IN',

        message:
          'Anda belum melakukan absen masuk.'

      };
    }


    const record =
      existing.record;


    /*
     * Sudah checkout.
     */
    if (
      String(record.STATUS || '')
        .trim()
        .toUpperCase() ===
      ATTENDANCE_STATUS_CLOSED
    ) {

      return {

        success: false,

        code:
          'ALREADY_CHECKED_OUT',

        message:
          'Anda sudah melakukan absen pulang.',

        attendance:
          _buildAttendanceResult(
            record
          )

      };
    }


    /*
     * CHECK_IN harus ada.
     */
    const checkIn =
      _toDate(
        record.CHECK_IN_AT
      );


    if (!checkIn) {

      throw new Error(
        'Waktu absen masuk tidak valid.'
      );
    }


    /*
     * Hitung durasi.
     */
    const workingMinutes =
      _calculateWorkingMinutes(
        checkIn,
        now
      );


    /*
     * Overtime sementara 0.
     *
     * Nanti dihitung berdasarkan:
     * MS_Shift / MS_AttendancePolicy.
     */
    const overtimeMinutes = 0;


    /*
     * Update hanya row attendance terkait.
     */
    const sheet =
      getDatabaseSheet(
        ATTENDANCE_SHEET_NAME
      );


    const columns =
      _getAttendanceColumns(sheet);


    const rowNumber =
      existing.rowNumber;


    _setSheetCell(
      sheet,
      rowNumber,
      columns,
      'CHECK_OUT_AT',
      now
    );


    _setSheetCell(
      sheet,
      rowNumber,
      columns,
      'STATUS',
      ATTENDANCE_STATUS_CLOSED
    );


    _setSheetCell(
      sheet,
      rowNumber,
      columns,
      'WORKING_MINUTES',
      workingMinutes
    );


    _setSheetCell(
      sheet,
      rowNumber,
      columns,
      'OVERTIME_MINUTES',
      overtimeMinutes
    );


    _setSheetCell(
      sheet,
      rowNumber,
      columns,
      'UPDATED_AT',
      now
    );


    /*
     * Buat hasil terbaru.
     */
    const updated =
      Object.assign(
        {},
        record,
        {
          CHECK_OUT_AT: now,
          STATUS:
            ATTENDANCE_STATUS_CLOSED,
          WORKING_MINUTES:
            workingMinutes,
          OVERTIME_MINUTES:
            overtimeMinutes,
          UPDATED_AT: now
        }
      );


    return {

      success: true,

      code:
        'CHECK_OUT_SUCCESS',

      message:
        'Absen pulang berhasil.',

      attendance:
        _buildAttendanceResult(
          updated
        )

    };


  } catch (error) {

    console.error(
      'checkOut error:',
      error
    );


    throw new Error(
      error.message ||
      'Gagal melakukan absen pulang.'
    );


  } finally {

    try {
      lock.releaseLock();
    } catch (e) {
      // ignore
    }
  }
}


/**
 * ------------------------------------------------------------
 * GET TODAY ATTENDANCE
 * ------------------------------------------------------------
 *
 * Dipanggil hanya ketika UI benar-benar membutuhkan
 * status attendance.
 *
 * JANGAN dipanggil berulang setiap detik.
 */
function getTodayAttendance(sessionToken) {

  const context =
    _getAttendanceContext(
      sessionToken
    );


  const employeeId =
    String(
      context.employee.EMPLOYEE_ID || ''
    ).trim();


  const workDate =
    _getWorkDate(
      new Date()
    );


  const existing =
    _findAttendanceByEmployeeAndDate(
      employeeId,
      workDate
    );


  if (!existing) {

    return {

      success: true,

      exists: false,

      status:
        'BELUM_ABSEN',

      attendance: null

    };
  }


  return {

    success: true,

    exists: true,

    status:
      _normalizeAttendanceStatus(
        existing.record.STATUS
      ),

    attendance:
      _buildAttendanceResult(
        existing.record
      )

  };
}


/* ============================================================
 * CONTEXT
 * ============================================================ */


/**
 * Mendapatkan employee berdasarkan session.
 *
 * Session hanya menyimpan USER_ID.
 */
function _getAttendanceContext(sessionToken) {

  const sessionResult =
    validateSession(
      sessionToken
    );


  if (
    !sessionResult ||
    !sessionResult.valid
  ) {

    throw new Error(
      'Session tidak valid atau sudah berakhir.'
    );
  }


  const session =
    sessionResult.session;


  if (!session.userId) {

    throw new Error(
      'Session tidak memiliki USER_ID.'
    );
  }


  /*
   * Ambil SYS_User.
   */
  const user =
    _findRowByColumn(
      'SYS_User',
      'USER_ID',
      session.userId
    );


  if (!user) {

    throw new Error(
      'Data user tidak ditemukan.'
    );
  }


  /*
   * User harus aktif.
   */
  const userStatus =
    String(
      user.STATUS || ''
    )
      .trim()
      .toUpperCase();


  if (
    userStatus &&
    userStatus !== 'ACTIVE'
  ) {

    throw new Error(
      'User tidak aktif.'
    );
  }


  const employeeId =
    String(
      user.EMPLOYEE_ID || ''
    ).trim();


  if (!employeeId) {

    throw new Error(
      'User belum memiliki EMPLOYEE_ID.'
    );
  }


  /*
   * Ambil HR_Employee.
   */
  const employee =
    _findRowByColumn(
      'HR_Employee',
      'EMPLOYEE_ID',
      employeeId
    );


  if (!employee) {

    throw new Error(
      'Data HR_Employee tidak ditemukan.'
    );
  }


  const employeeStatus =
    String(
      employee.STATUS || ''
    )
      .trim()
      .toUpperCase();


  if (
    employeeStatus &&
    employeeStatus !== 'ACTIVE'
  ) {

    throw new Error(
      'Data pegawai tidak aktif.'
    );
  }


  return {

    session:
      session,

    user:
      user,

    employee:
      employee

  };
}


/* ============================================================
 * ATTENDANCE FIND
 * ============================================================ */


/**
 * Mencari attendance berdasarkan:
 *
 * EMPLOYEE_ID + WORK_DATE
 *
 * Tidak menggunakan getDataRange().
 *
 * TextFinder hanya mencari employee ID
 * pada kolom EMPLOYEE_ID.
 */
function _findAttendanceByEmployeeAndDate(
  employeeId,
  workDate
) {

  const sheet =
    getDatabaseSheet(
      ATTENDANCE_SHEET_NAME
    );


  const columns =
    _getAttendanceColumns(
      sheet
    );


  if (
    !columns.EMPLOYEE_ID ||
    !columns.WORK_DATE
  ) {

    throw new Error(
      'Kolom EMPLOYEE_ID / WORK_DATE tidak ditemukan.'
    );
  }


  const lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {
    return null;
  }


  /*
   * Cari EMPLOYEE_ID saja.
   *
   * Ini jauh lebih ringan dibanding membaca
   * seluruh HR_Attendance ke memory.
   */
  const employeeRange =
    sheet.getRange(
      2,
      columns.EMPLOYEE_ID,
      lastRow - 1,
      1
    );


  const finder =
    employeeRange
      .createTextFinder(
        String(employeeId)
      )
      .matchEntireCell(true)
      .matchCase(false);


  const matches =
    finder.findAll();


  if (!matches || !matches.length) {
    return null;
  }


  /*
   * Periksa hanya row milik employee tersebut.
   */
  for (
    let i = matches.length - 1;
    i >= 0;
    i--
  ) {

    const cell =
      matches[i];


    const rowNumber =
      cell.getRow();


    const rowValues =
      sheet
        .getRange(
          rowNumber,
          1,
          1,
          columns._count
        )
        .getValues()[0];


    const record =
      _rowArrayToObject(
        columns,
        rowValues
      );


    const recordDate =
      _normalizeWorkDate(
        record.WORK_DATE
      );


    if (
      recordDate ===
      workDate
    ) {

      return {

        rowNumber:
          rowNumber,

        record:
          record

      };
    }
  }


  return null;
}


/* ============================================================
 * DATABASE HELPERS
 * ============================================================ */


/**
 * Cari row berdasarkan satu kolom.
 *
 * Dipakai untuk master yang kecil:
 * SYS_User
 * HR_Employee
 *
 * Bukan untuk HR_Attendance.
 */
function _findRowByColumn(
  sheetName,
  columnName,
  targetValue
) {

  const sheet =
    getDatabaseSheet(
      sheetName
    );


  const lastColumn =
    sheet.getLastColumn();


  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0];


  const index =
    _findHeaderIndex(
      headers,
      columnName
    );


  if (index < 0) {

    throw new Error(
      'Kolom ' +
      columnName +
      ' tidak ditemukan pada ' +
      sheetName
    );
  }


  const lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {
    return null;
  }


  /*
   * Untuk master kecil, baca hanya
   * kolom pencarian.
   */
  const values =
    sheet
      .getRange(
        2,
        index + 1,
        lastRow - 1,
        1
      )
      .getValues();


  const target =
    String(
      targetValue || ''
    ).trim();


  for (
    let i = 0;
    i < values.length;
    i++
  ) {

    if (
      String(
        values[i][0] || ''
      ).trim() === target
    ) {

      const rowNumber =
        i + 2;


      const rowValues =
        sheet
          .getRange(
            rowNumber,
            1,
            1,
            lastColumn
          )
          .getValues()[0];


      return _rowArrayToObject(
        _buildColumnMap(
          headers
        ),
        rowValues
      );
    }
  }


  return null;
}


/**
 * Ambil mapping kolom attendance.
 */
function _getAttendanceColumns(sheet) {

  const lastColumn =
    sheet.getLastColumn();


  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0];


  const columns =
    _buildColumnMap(
      headers
    );


  columns._count =
    lastColumn;


  return columns;
}


/**
 * Build map:
 *
 * {
 *   ATTENDANCE_ID: 1,
 *   EMPLOYEE_ID: 2,
 *   ...
 * }
 *
 * Index dibuat 1-based karena Google Sheets.
 */
function _buildColumnMap(headers) {

  const map = {};


  headers.forEach(
    function(header, index) {

      const key =
        String(
          header || ''
        )
          .trim()
          .toUpperCase();


      if (key) {

        map[key] =
          index + 1;
      }
    }
  );


  return map;
}


/**
 * Cari index header.
 *
 * Return 0-based.
 */
function _findHeaderIndex(
  headers,
  target
) {

  const wanted =
    String(
      target || ''
    )
      .trim()
      .toUpperCase();


  for (
    let i = 0;
    i < headers.length;
    i++
  ) {

    if (
      String(
        headers[i] || ''
      )
        .trim()
        .toUpperCase() ===
      wanted
    ) {

      return i;
    }
  }


  return -1;
}


/* ============================================================
 * ROW HELPERS
 * ============================================================ */


/**
 * Membuat row kosong berdasarkan jumlah kolom.
 */
function _createEmptyAttendanceRow(
  columns
) {

  return new Array(
    columns._count
  ).fill('');
}


/**
 * Set nilai row berdasarkan nama kolom.
 */
function _setAttendanceValue(
  row,
  columns,
  columnName,
  value
) {

  const column =
    columns[
      String(
        columnName
      ).toUpperCase()
    ];


  if (!column) {
    return;
  }


  row[column - 1] =
    value;
}


/**
 * Update satu cell berdasarkan nama kolom.
 */
function _setSheetCell(
  sheet,
  rowNumber,
  columns,
  columnName,
  value
) {

  const column =
    columns[
      String(
        columnName
      ).toUpperCase()
    ];


  if (!column) {
    return;
  }


  sheet
    .getRange(
      rowNumber,
      column
    )
    .setValue(
      value
    );
}


/**
 * Ubah array row menjadi object.
 */
function _rowArrayToObject(
  columns,
  row
) {

  const result = {};


  Object.keys(columns)
    .forEach(
      function(key) {

        if (
          key === '_count'
        ) {
          return;
        }


        const column =
          columns[key];


        result[key] =
          row[column - 1];
      }
    );


  return result;
}


/* ============================================================
 * DATE / TIME
 * ============================================================ */


/**
 * WORK_DATE server.
 *
 * Tahap pertama menggunakan tanggal server.
 */
function _getWorkDate(date) {

  const timezone =
    getConfigValue(
      'TIMEZONE'
    ) ||
    Session.getScriptTimeZone() ||
    'Asia/Jakarta';


  return Utilities.formatDate(
    date,
    timezone,
    'yyyy-MM-dd'
  );
}


/**
 * Normalize WORK_DATE dari Sheet.
 */
function _normalizeWorkDate(value) {

  if (!value) {
    return '';
  }


  /*
   * Date object.
   */
  if (
    Object.prototype.toString
      .call(value) ===
    '[object Date]'
  ) {

    if (
      isNaN(
        value.getTime()
      )
    ) {
      return '';
    }


    return _getWorkDate(
      value
    );
  }


  /*
   * String yyyy-MM-dd.
   */
  const text =
    String(
      value
    ).trim();


  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {

    return text;
  }


  /*
   * Coba parse.
   */
  const parsed =
    new Date(
      text
    );


  if (
    !isNaN(
      parsed.getTime()
    )
  ) {

    return _getWorkDate(
      parsed
    );
  }


  return '';
}


/**
 * Convert value menjadi Date.
 */
function _toDate(value) {

  if (!value) {
    return null;
  }


  if (
    Object.prototype.toString
      .call(value) ===
    '[object Date]'
  ) {

    return isNaN(
      value.getTime()
    )
      ? null
      : value;
  }


  const date =
    new Date(
      value
    );


  return isNaN(
    date.getTime()
  )
    ? null
    : date;
}


/**
 * Hitung working minutes.
 */
function _calculateWorkingMinutes(
  start,
  end
) {

  const startMs =
    start.getTime();


  const endMs =
    end.getTime();


  if (
    endMs <= startMs
  ) {

    return 0;
  }


  return Math.floor(
    (
      endMs -
      startMs
    ) /
    60000
  );
}


/* ============================================================
 * RESULT
 * ============================================================ */


/**
 * Normalize status.
 */
function _normalizeAttendanceStatus(
  status
) {

  const value =
    String(
      status || ''
    )
      .trim()
      .toUpperCase();


  if (
    value ===
    ATTENDANCE_STATUS_CLOSED
  ) {

    return 'SELESAI';
  }


  if (
    value ===
    ATTENDANCE_STATUS_OPEN
  ) {

    return 'SEDANG_BEKERJA';
  }


  return 'BELUM_ABSEN';
}


/**
 * Build response untuk frontend.
 */
function _buildAttendanceResult(
  record
) {

  if (!record) {
    return null;
  }


  return {

    attendanceId:
      String(
        record.ATTENDANCE_ID || ''
      ),

    employeeId:
      String(
        record.EMPLOYEE_ID || ''
      ),

    workDate:
      _normalizeWorkDate(
        record.WORK_DATE
      ),

    status:
      _normalizeAttendanceStatus(
        record.STATUS
      ),

    rawStatus:
      String(
        record.STATUS || ''
      ),

    checkIn:
      _formatAttendanceTime(
        record.CHECK_IN_AT
      ),

    checkOut:
      _formatAttendanceTime(
        record.CHECK_OUT_AT
      ),

    workingMinutes:
      Number(
        record.WORKING_MINUTES ||
        0
      ),

    overtimeMinutes:
      Number(
        record.OVERTIME_MINUTES ||
        0
      ),

    shiftId:
      String(
        record.SHIFT_ID || ''
      ),

    policyId:
      String(
        record.POLICY_ID || ''
      ),

    locationId:
      String(
        record.LOCATION_ID || ''
      ),

    shipId:
      String(
        record.SHIP_ID || ''
      )

  };
}


/**
 * Format timestamp untuk frontend.
 */
function _formatAttendanceTime(
  value
) {

  const date =
    _toDate(
      value
    );


  if (!date) {
    return null;
  }


  const timezone =
    getConfigValue(
      'TIMEZONE'
    ) ||
    'Asia/Jakarta';


  return Utilities.formatDate(
    date,
    timezone,
    'HH:mm:ss'
  );
}


/* ============================================================
 * ID
 * ============================================================ */


/**
 * Generate ATTENDANCE_ID.
 *
 * Contoh:
 *
 * ATT-20260914-12306001-abc123
 */
function _generateAttendanceId(
  employeeId,
  date
) {

  const timezone =
    getConfigValue(
      'TIMEZONE'
    ) ||
    'Asia/Jakarta';


  const dateText =
    Utilities.formatDate(
      date,
      timezone,
      'yyyyMMdd'
    );


  const suffix =
    Utilities.getUuid()
      .replace(
        /-/g,
        ''
      )
      .substring(
        0,
        8
      );


  return (
    'ATT-' +
    dateText +
    '-' +
    employeeId +
    '-' +
    suffix
  );
}
