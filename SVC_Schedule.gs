/**
 * ============================================================
 * JNDA V3 - SCHEDULE SERVICE
 * File    : SVC_Schedule.gs
 * Version : V3
 * ============================================================
 *
 * Tanggung jawab:
 * - Manajemen jadwal pegawai
 * - Filter pegawai berdasarkan branch
 * - Membaca master shift
 * - Membaca HR_EmployeeShift
 * - Tambah jadwal
 * - Edit jadwal
 * - Hapus jadwal
 * - Validasi bentrok jadwal
 *
 * SECURITY:
 * - Employee/branch tidak dipercaya dari client
 * - Identitas admin diambil dari SESSION TOKEN
 * - Branch scope divalidasi di server
 * ============================================================
 */


/* ============================================================
   CONFIG
   ============================================================ */

const SCHEDULE_EMPLOYEE_SHEET =
  'HR_Employee';

const SCHEDULE_EMPLOYEE_SHIFT_SHEET =
  'HR_EmployeeShift';

const SCHEDULE_SHIFT_SHEET =
  'MS_Shift';


/* ============================================================
   PUBLIC
   ============================================================ */

/**
 * Ambil seluruh data awal halaman jadwal.
 *
 * @param {String} sessionToken
 * @return {Object}
 */
function getSchedulePageData(sessionToken) {

  const context =
    _scheduleGetContext(sessionToken);

  const employees =
    _scheduleGetBranchEmployees(
      context.branchId
    );

  const shifts =
    _scheduleGetShifts();

  return {

    success: true,

    access: {
      roleId: context.roleId,
      roleName: context.roleName,
      branchId: context.branchId,
      branchName: context.branchName,
      scope: context.scope
    },

    employees: employees,

    shifts: shifts

  };
}


/**
 * Ambil jadwal berdasarkan periode.
 *
 * @param {String} sessionToken
 * @param {String} startDate yyyy-MM-dd
 * @param {String} endDate yyyy-MM-dd
 */
function getSchedules(
  sessionToken,
  startDate,
  endDate
) {

  const context =
    _scheduleGetContext(sessionToken);

  const start =
    _scheduleNormalizeDateString(
      startDate
    );

  const end =
    _scheduleNormalizeDateString(
      endDate
    );

  if (!start || !end) {

    throw new Error(
      'Periode jadwal tidak valid.'
    );
  }

  if (start > end) {

    throw new Error(
      'Tanggal mulai tidak boleh lebih besar dari tanggal akhir.'
    );
  }

  const employees =
    _scheduleGetBranchEmployees(
      context.branchId
    );

  const employeeMap = {};

  employees.forEach(function(employee) {

    employeeMap[
      employee.employeeId
    ] = employee;

  });

  /* =====================================================
   MASTER SHIFT MAP
   Mengambil nama dan jam kerja dari MS_Shift
   ===================================================== */

  const masterShifts =
    _scheduleGetShifts();

  const shiftMap = {};

  masterShifts.forEach(function(shift) {

    shiftMap[
      shift.shiftId
    ] = shift;

  });

  const rows =
    _scheduleGetSheetObjects(
      SCHEDULE_EMPLOYEE_SHIFT_SHEET
    );

  const result = [];

  rows.forEach(function(row, index) {

    const employeeId =
      String(
        row.EMPLOYEE_ID ||
        row.employeeId ||
        ''
      ).trim();

    if (!employeeId) {
      return;
    }

    /* =====================================================
      FILTER JADWAL AKTIF
      ACTIVE = FALSE tidak ditampilkan
      ===================================================== */

    const activeValue =
      row.ACTIVE;

    if (
      activeValue === false ||
      String(activeValue)
        .trim()
        .toUpperCase() === 'FALSE'
    ) {
      return;
    }



    /*
     * Security:
     * Hanya pegawai yang berada dalam
     * branch admin yang boleh ditampilkan.
     */
    if (!employeeMap[employeeId]) {
      return;
    }

    const scheduleDate =
      _scheduleGetRowDate(
        row
      );

    if (!scheduleDate) {
      return;
    }

    if (
      scheduleDate < start ||
      scheduleDate > end
    ) {
      return;
    }

    const employee =
      employeeMap[employeeId];

    /* =====================================================
      DETAIL SHIFT
      ===================================================== */

    const shiftId =
      String(
        row.SHIFT_ID ||
        ''
      ).trim();

    const shift =
      shiftMap[shiftId] ||
      {};

    const shiftName =
      shift.shiftName ||
      '';

    const startTime =
      shift.startTime ||
      '';

    const endTime =
      shift.endTime ||
      '';

    result.push({

      scheduleId:
        String(
          row.SCHEDULE_ID ||
          row.EMPLOYEE_SHIFT_ID ||
          row.ID ||
          ''
        ).trim(),

      employeeId:
        employeeId,

      employeeNo:
        employee.employeeNo,

      employeeName:
        employee.fullName,

      branchId:
        employee.branchId,

      date:
        scheduleDate,

      shiftId:
        shiftId,

      shiftName:
        shiftName,

      startTime:
        startTime,

      endTime:
        endTime,

      scheduledMinutes:
        Number(
          shift.scheduledMinutes ||
          0
        ),

      status:
        String(
          row.ACTIVE === false ||
          String(row.ACTIVE)
            .trim()
            .toUpperCase() === 'FALSE'
            ? 'INACTIVE'
            : 'ACTIVE'
        ),

      note:
        String(
          row.NOTE ||
          row.REMARK ||
          row.NOTES ||
          ''
        ).trim(),

      rowNumber:
        index + 2

    });

  });

  /*
   * Urutkan tanggal kemudian nama.
   */

  result.sort(function(a, b) {

    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }

    return a.employeeName.localeCompare(
      b.employeeName
    );

  });

  return {

    success: true,

    schedules: result

  };
}


/**
 * Tambah jadwal baru.
 *
 * @param {String} sessionToken
 * @param {Object} payload
 */
function addSchedule(
  sessionToken,
  payload
) {

  const context =
    _scheduleGetContext(sessionToken);

  _scheduleValidatePayload(
    payload
  );

  const employeeId =
    String(
      payload.employeeId
    ).trim();

  const shiftId =
    String(
      payload.shiftId
    ).trim();

  const scheduleDate =
    _scheduleNormalizeDateString(
      payload.date
    );

  const note =
    String(
      payload.note ||
      ''
    ).trim();

  /*
   * SECURITY:
   * Pastikan employee berada pada branch
   * admin yang sedang login.
   */

  const employee =
    _scheduleGetEmployeeInBranch(
      employeeId,
      context.branchId
    );

  if (!employee) {

    throw new Error(
      'Pegawai tidak berada pada cabang Anda.'
    );
  }

  const shift =
    _scheduleGetShiftById(
      shiftId
    );

  if (!shift) {

    throw new Error(
      'Shift tidak ditemukan: ' +
      shiftId
    );
  }

  /*
   * Cek bentrok.
   */

  const collision =
    _scheduleFindCollision(
      employeeId,
      scheduleDate
    );

  if (collision) {

    return {

      success: false,

      code:
        'SCHEDULE_COLLISION',

      message:
        'Pegawai tersebut sudah memiliki jadwal pada tanggal ' +
        _scheduleFormatDateDisplay(
          scheduleDate
        ),

      existing:
        collision

    };
  }

  const sheet =
    getDatabaseSheet(
      SCHEDULE_EMPLOYEE_SHIFT_SHEET
    );

  const headers =
    _scheduleGetHeaders(
      sheet
    );

  const now =
    new Date();

  const row =
    _scheduleBuildRow(
      headers,
      {
        employeeId:
          employeeId,

        shiftId:
          shiftId,

        date:
          scheduleDate,

        note:
          note,

        status:
          'ACTIVE',

        now:
          now
      }
    );

  sheet.appendRow(row);

  return {

    success: true,

    code:
      'SCHEDULE_CREATED',

    message:
      'Jadwal berhasil ditambahkan.',

    schedule: {

      employeeId:
        employeeId,

      employeeName:
        employee.fullName,

      date:
        scheduleDate,

      shiftId:
        shiftId,

      shiftName:
        shift.shiftName,

      note:
        note

    }

  };
}


/**
 * Edit jadwal.
 *
 * @param {String} sessionToken
 * @param {Object} payload
 */
function updateSchedule(
  sessionToken,
  payload
) {

  const context =
    _scheduleGetContext(sessionToken);

  if (
    !payload ||
    !payload.rowNumber
  ) {

    throw new Error(
      'ID jadwal tidak valid.'
    );
  }

  const rowNumber =
    Number(
      payload.rowNumber
    );

  if (
    !Number.isInteger(rowNumber) ||
    rowNumber < 2
  ) {

    throw new Error(
      'Baris jadwal tidak valid.'
    );
  }

  _scheduleValidatePayload(
    payload
  );

  const employeeId =
    String(
      payload.employeeId
    ).trim();

  const shiftId =
    String(
      payload.shiftId
    ).trim();

  const scheduleDate =
    _scheduleNormalizeDateString(
      payload.date
    );

  const note =
    String(
      payload.note ||
      ''
    ).trim();

  const employee =
    _scheduleGetEmployeeInBranch(
      employeeId,
      context.branchId
    );

  if (!employee) {

    throw new Error(
      'Pegawai tidak berada pada cabang Anda.'
    );
  }

  const shift =
    _scheduleGetShiftById(
      shiftId
    );

  if (!shift) {

    throw new Error(
      'Shift tidak ditemukan.'
    );
  }

  const sheet =
    getDatabaseSheet(
      SCHEDULE_EMPLOYEE_SHIFT_SHEET
    );

  if (
    rowNumber >
    sheet.getLastRow()
  ) {

    throw new Error(
      'Data jadwal tidak ditemukan.'
    );
  }

  /*
   * Ambil record existing.
   */

  const headers =
    _scheduleGetHeaders(
      sheet
    );

  const existingRow =
    sheet
      .getRange(
        rowNumber,
        1,
        1,
        headers.length
      )
      .getValues()[0];

  const existing =
    rowToObject(
      headers.map(function(h) {
        return String(h)
          .trim()
          .toUpperCase();
      }),
      existingRow
    );

  const existingEmployeeId =
    String(
      existing.EMPLOYEE_ID ||
      ''
    ).trim();

  /*
   * Security:
   * Admin tidak boleh mengubah
   * jadwal branch lain.
   */

  const existingEmployee =
    _scheduleGetEmployeeInBranch(
      existingEmployeeId,
      context.branchId
    );

  if (!existingEmployee) {

    throw new Error(
      'Jadwal tersebut bukan bagian dari cabang Anda.'
    );
  }

  /*
   * Cek bentrok dengan record lain.
   */

  const collision =
    _scheduleFindCollision(
      employeeId,
      scheduleDate,
      rowNumber
    );

  if (collision) {

    return {

      success: false,

      code:
        'SCHEDULE_COLLISION',

      message:
        'Pegawai tersebut sudah memiliki jadwal pada tanggal ' +
        _scheduleFormatDateDisplay(
          scheduleDate
        )

    };
  }

  /*
   * Update kolom berdasarkan header.
   */

  const normalizedHeaders =
    headers.map(function(h) {

      return String(h)
        .trim()
        .toUpperCase();

    });

  _scheduleSetColumnValue(
    sheet,
    rowNumber,
    normalizedHeaders,
    [
      'EMPLOYEE_ID'
    ],
    employeeId
  );

  _scheduleSetColumnValue(
    sheet,
    rowNumber,
    normalizedHeaders,
    [
      'SHIFT_ID'
    ],
    shiftId
  );

  _scheduleSetColumnValue(
    sheet,
    rowNumber,
    normalizedHeaders,
    [
      'START_DATE',
      'SCHEDULE_DATE',
      'WORK_DATE',
      'DATE'
    ],
    _scheduleDateToSheetValue(
      scheduleDate
    )
  );

  _scheduleSetColumnValue(
    sheet,
    rowNumber,
    normalizedHeaders,
    [
      'END_DATE'
    ],
    _scheduleDateToSheetValue(
      scheduleDate
    )
  );

  _scheduleSetColumnValue(
    sheet,
    rowNumber,
    normalizedHeaders,
    [
      'NOTE',
      'REMARK',
      'NOTES'
    ],
    note
  );

  _scheduleSetColumnValue(
    sheet,
    rowNumber,
    normalizedHeaders,
    [
      'ACTIVE'
    ],
    true
  );

  _scheduleSetColumnValue(
    sheet,
    rowNumber,
    normalizedHeaders,
    [
      'UPDATED_AT'
    ],
    new Date()
  );

  return {

    success: true,

    code:
      'SCHEDULE_UPDATED',

    message:
      'Jadwal berhasil diperbarui.'

  };
}


/**
 * Hapus / nonaktifkan jadwal.
 *
 * Kita TIDAK langsung delete row.
 * Record diberi STATUS = INACTIVE.
 */
function deleteSchedule(
  sessionToken,
  rowNumber
) {

  const context =
    _scheduleGetContext(sessionToken);

  const sheet =
    getDatabaseSheet(
      SCHEDULE_EMPLOYEE_SHIFT_SHEET
    );

  const row =
    Number(
      rowNumber
    );

  if (
    !Number.isInteger(row) ||
    row < 2 ||
    row > sheet.getLastRow()
  ) {

    throw new Error(
      'Jadwal tidak ditemukan.'
    );
  }

  const headers =
    _scheduleGetHeaders(
      sheet
    );

  const normalizedHeaders =
    headers.map(function(h) {

      return String(h)
        .trim()
        .toUpperCase();

    });

  const values =
    sheet
      .getRange(
        row,
        1,
        1,
        normalizedHeaders.length
      )
      .getValues()[0];

  const record =
    rowToObject(
      normalizedHeaders,
      values
    );

  const employeeId =
    String(
      record.EMPLOYEE_ID ||
      ''
    ).trim();

  const employee =
    _scheduleGetEmployeeInBranch(
      employeeId,
      context.branchId
    );

  if (!employee) {

    throw new Error(
      'Anda tidak memiliki akses terhadap jadwal ini.'
    );
  }

  _scheduleSetColumnValue(
    sheet,
    row,
    normalizedHeaders,
    [
      'ACTIVE'
    ],
    false
  );

  _scheduleSetColumnValue(
    sheet,
    row,
    normalizedHeaders,
    [
      'UPDATED_AT'
    ],
    new Date()
  );

  return {

    success: true,

    code:
      'SCHEDULE_DELETED',

    message:
      'Jadwal berhasil dinonaktifkan.'

  };
}


/* ============================================================
   SECURITY CONTEXT
   ============================================================ */

/**
 * Membuat context dari session.
 */
function _scheduleGetContext(
  sessionToken
) {

  const validation =
    validateSession(
      sessionToken
    );

  if (
    !validation ||
    !validation.valid
  ) {

    throw new Error(
      'Session tidak valid atau sudah berakhir.'
    );
  }

  const session =
    validation.session || {};

  const userId =
    String(
      session.userId ||
      ''
    ).trim();

  if (!userId) {

    throw new Error(
      'Session tidak memiliki USER_ID.'
    );
  }

  const user =
    getDashboardUserById(
      userId
    );

  if (!user) {

    throw new Error(
      'Data user tidak ditemukan.'
    );
  }

  const employeeId =
    String(
      user.EMPLOYEE_ID ||
      ''
    ).trim();

  if (!employeeId) {

    throw new Error(
      'User belum memiliki EMPLOYEE_ID.'
    );
  }

  const employee =
    getDashboardEmployeeById(
      employeeId
    );

  if (!employee) {

    throw new Error(
      'Data employee tidak ditemukan.'
    );
  }

  const role =
    getDashboardRole(
      user.ROLE_ID
    );

  const roleName =
    String(
      role.roleName ||
      user.ROLE_ID ||
      ''
    ).trim();

  const roleText =
    (
      roleName +
      ' ' +
      String(
        user.ROLE_ID ||
        ''
      )
    )
      .toUpperCase()
      .replace(/[_-]/g, ' ');

  const isSuperAdmin =
    roleText.indexOf(
      'SUPER ADMIN'
    ) >= 0;

  const isAdminHR =
    roleText.indexOf(
      'ADMIN HR'
    ) >= 0 ||
    roleText.indexOf(
      'ADMINHR'
    ) >= 0;

  const isBranchAdmin =
    roleText.indexOf(
      'ADMIN CABANG'
    ) >= 0 ||
    roleText.indexOf(
      'BRANCH ADMIN'
    ) >= 0 ||
    roleText.indexOf(
      'ADMIN BRANCH'
    ) >= 0;

  /*
   * Untuk sementara:
   *
   * SUPER ADMIN / ADMIN HR
   * = seluruh branch
   *
   * ADMIN CABANG / BRANCH ADMIN
   * = branch sendiri
   */

  if (
    !isSuperAdmin &&
    !isAdminHR &&
    !isBranchAdmin
  ) {

    throw new Error(
      'Anda tidak memiliki akses Manajemen Jadwal.'
    );
  }

  const branchId =
    String(
      employee.BRANCH_ID ||
      ''
    ).trim();

  const branchName =
    getMasterName(
      'MS_Branch',
      'BRANCH_ID',
      branchId,
      [
        'BRANCH_NAME',
        'NAME'
      ]
    ) || branchId;

  return {

    userId:
      userId,

    employeeId:
      employeeId,

    roleId:
      String(
        user.ROLE_ID ||
        ''
      ).trim(),

    roleName:
      roleName,

    branchId:
      branchId,

    branchName:
      branchName,

    scope:
      (
        isSuperAdmin ||
        isAdminHR
      )
        ? 'ALL'
        : 'BRANCH'

  };
}


/* ============================================================
   EMPLOYEE
   ============================================================ */

function _scheduleGetBranchEmployees(
  branchId
) {

  const rows =
    _scheduleGetSheetObjects(
      SCHEDULE_EMPLOYEE_SHEET
    );

  const targetBranch =
    String(
      branchId ||
      ''
    ).trim();

  const result = [];

  rows.forEach(function(row) {

    const employeeId =
      String(
        row.EMPLOYEE_ID ||
        ''
      ).trim();

    const rowBranch =
      String(
        row.BRANCH_ID ||
        ''
      ).trim();

    const status =
      String(
        row.STATUS ||
        'ACTIVE'
      )
        .trim()
        .toUpperCase();

    if (!employeeId) {
      return;
    }

    if (
      targetBranch &&
      rowBranch !== targetBranch
    ) {
      return;
    }

    if (
      status &&
      status !== 'ACTIVE'
    ) {
      return;
    }

    result.push({

      employeeId:
        employeeId,

      employeeNo:
        String(
          row.EMPLOYEE_NO ||
          ''
        ).trim(),

      fullName:
        String(
          row.FULL_NAME ||
          row.NAME ||
          ''
        ).trim(),

      branchId:
        rowBranch,

      positionId:
        String(
          row.POSITION_ID ||
          ''
        ).trim()

    });

  });

  result.sort(function(a, b) {

    return a.fullName.localeCompare(
      b.fullName
    );

  });

  return result;
}


function _scheduleGetEmployeeInBranch(
  employeeId,
  branchId
) {

  const rows =
    _scheduleGetSheetObjects(
      SCHEDULE_EMPLOYEE_SHEET
    );

  const target =
    String(
      employeeId ||
      ''
    ).trim();

  const branch =
    String(
      branchId ||
      ''
    ).trim();

  for (
    let i = 0;
    i < rows.length;
    i++
  ) {

    const row =
      rows[i];

    if (
      String(
        row.EMPLOYEE_ID ||
        ''
      ).trim() !== target
    ) {
      continue;
    }

    if (
      branch &&
      String(
        row.BRANCH_ID ||
        ''
      ).trim() !== branch
    ) {
      continue;
    }

    const status =
      String(
        row.STATUS ||
        'ACTIVE'
      )
        .trim()
        .toUpperCase();

    if (
      status &&
      status !== 'ACTIVE'
    ) {
      return null;
    }

    return {

      employeeId:
        target,

      employeeNo:
        String(
          row.EMPLOYEE_NO ||
          ''
        ).trim(),

      fullName:
        String(
          row.FULL_NAME ||
          row.NAME ||
          ''
        ).trim(),

      branchId:
        String(
          row.BRANCH_ID ||
          ''
        ).trim()

    };
  }

  return null;
}


/* ============================================================
   SHIFT
   ============================================================ */

function _scheduleGetShifts() {

  const rows =
    _scheduleGetSheetObjects(
      SCHEDULE_SHIFT_SHEET
    );

  const result = [];

  rows.forEach(function(row) {

    const shiftId =
      String(
        row.SHIFT_ID ||
        ''
      ).trim();

    if (!shiftId) {
      return;
    }

    const status =
      String(
        row.STATUS ||
        'ACTIVE'
      )
        .trim()
        .toUpperCase();

    if (
      status &&
      status !== 'ACTIVE'
    ) {
      return;
    }

    const start =
      _scheduleGetShiftTime(
        row,
        [
          'START_TIME',
          'SHIFT_START',
          'CHECKIN_START'
        ]
      );

    const end =
      _scheduleGetShiftTime(
        row,
        [
          'END_TIME',
          'SHIFT_END',
          'CHECKOUT_END'
        ]
      );

    result.push({

      shiftId:
        shiftId,

      shiftName:
        String(
          row.SHIFT_NAME ||
          row.NAME ||
          row.DESCRIPTION ||
          shiftId
        ).trim(),

      shiftType:
        String(
          row.SHIFT_TYPE ||
          ''
        ).trim(),

      startTime:
        start,

      endTime:
        end,

      scheduledMinutes:
        Number(
          row.SCHEDULED_MINUTES ||
          0
        )

    });

  });

  result.sort(function(a, b) {

    return a.shiftId.localeCompare(
      b.shiftId
    );

  });

  return result;
}


function _scheduleGetShiftById(
  shiftId
) {

  const rows =
    _scheduleGetSheetObjects(
      SCHEDULE_SHIFT_SHEET
    );

  const target =
    String(
      shiftId ||
      ''
    ).trim();

  for (
    let i = 0;
    i < rows.length;
    i++
  ) {

    const row =
      rows[i];

    if (
      String(
        row.SHIFT_ID ||
        ''
      ).trim() !== target
    ) {
      continue;
    }

    const status =
      String(
        row.STATUS ||
        'ACTIVE'
      )
        .trim()
        .toUpperCase();

    if (
      status &&
      status !== 'ACTIVE'
    ) {
      return null;
    }

    return {

      shiftId:
        target,

      shiftName:
        String(
          row.SHIFT_NAME ||
          row.NAME ||
          row.DESCRIPTION ||
          target
        ).trim()

    };
  }

  return null;
}


function _scheduleGetShiftTime(
  row,
  keys
) {

  for (
    let i = 0;
    i < keys.length;
    i++
  ) {

    const key =
      keys[i];

    const value =
      row[key];

    if (
      value instanceof Date &&
      !isNaN(value.getTime())
    ) {

      return Utilities.formatDate(
        value,
        getConfig(
          'TIMEZONE'
        ) || 'Asia/Jakarta',
        'HH:mm'
      );
    }

    const text =
      String(
        value ||
        ''
      ).trim();

    if (
      /^\d{1,2}:\d{2}/.test(
        text
      )
    ) {

      return text.substring(
        0,
        5
      );
    }
  }

  return '';
}


/* ============================================================
   COLLISION
   ============================================================ */

function _scheduleFindCollision(
  employeeId,
  scheduleDate,
  ignoreRowNumber
) {

  const rows =
    _scheduleGetSheetObjects(
      SCHEDULE_EMPLOYEE_SHIFT_SHEET
    );

  const targetEmployee =
    String(
      employeeId ||
      ''
    ).trim();

  const targetDate =
    String(
      scheduleDate ||
      ''
    ).trim();

  for (
    let i = 0;
    i < rows.length;
    i++
  ) {

    const row =
      rows[i];

    const rowEmployee =
      String(
        row.EMPLOYEE_ID ||
        ''
      ).trim();

    if (
      rowEmployee !==
      targetEmployee
    ) {
      continue;
    }

    const activeValue =
      row.ACTIVE;

    if (
      activeValue === false ||
      String(activeValue)
        .trim()
        .toUpperCase() === 'FALSE'
    ) {
      continue;
    }

    const rowDate =
      _scheduleGetRowDate(
        row
      );

    if (
      rowDate !== targetDate
    ) {
      continue;
    }

    const rowNumber =
      i + 2;

    if (
      ignoreRowNumber &&
      rowNumber ===
      Number(ignoreRowNumber)
    ) {
      continue;
    }

    return {

      rowNumber:
        rowNumber,

      employeeId:
        rowEmployee,

      date:
        rowDate,

      shiftId:
        String(
          row.SHIFT_ID ||
          ''
        ).trim(),

      status:
        rowStatus

    };
  }

  return null;
}


/* ============================================================
   PAYLOAD VALIDATION
   ============================================================ */

function _scheduleValidatePayload(
  payload
) {

  if (
    !payload ||
    typeof payload !== 'object'
  ) {

    throw new Error(
      'Data jadwal tidak valid.'
    );
  }

  if (
    !String(
      payload.employeeId ||
      ''
    ).trim()
  ) {

    throw new Error(
      'Pegawai wajib dipilih.'
    );
  }

  if (
    !String(
      payload.shiftId ||
      ''
    ).trim()
  ) {

    throw new Error(
      'Shift wajib dipilih.'
    );
  }

  if (
    !_scheduleNormalizeDateString(
      payload.date
    )
  ) {

    throw new Error(
      'Tanggal jadwal wajib diisi.'
    );
  }
}


/* ============================================================
   SHEET HELPERS
   ============================================================ */

function _scheduleGetSheetObjects(
  sheetName
) {

  const sheet =
    getDatabaseSheet(
      sheetName
    );

  const values =
    sheet
      .getDataRange()
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
        header
      )
        .trim()
        .toUpperCase();

    });

  const result = [];

  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    const row =
      values[i];

    const object = {};

    headers.forEach(
      function(header, index) {

        object[header] =
          row[index];

      }
    );

    result.push(object);
  }

  return result;
}


function _scheduleGetHeaders(
  sheet
) {

  return sheet
    .getRange(
      1,
      1,
      1,
      sheet.getLastColumn()
    )
    .getValues()[0];
}


function _scheduleBuildRow(
  headers,
  data
) {

  const normalizedHeaders =
    headers.map(function(header) {

      return String(header || '')
        .trim()
        .toUpperCase();

    });


  const row =
    new Array(
      normalizedHeaders.length
    ).fill('');


  function setValue(
    columnNames,
    value
  ) {

    for (
      let i = 0;
      i < columnNames.length;
      i++
    ) {

      const index =
        normalizedHeaders.indexOf(
          columnNames[i]
        );

      if (index !== -1) {

        row[index] =
          value;

        return;

      }

    }

  }


  /*
   * ======================================================
   * EMPLOYEE SHIFT ID
   * ======================================================
   */

  const employeeShiftId =
    'ES-' +
    Utilities.getUuid()
      .replace(/-/g, '')
      .substring(0, 12)
      .toUpperCase();


  setValue(
    [
      'EMPLOYEE_SHIFT_ID'
    ],
    employeeShiftId
  );


  /*
   * ======================================================
   * EMPLOYEE
   * ======================================================
   */

  setValue(
    [
      'EMPLOYEE_ID'
    ],
    String(
      data.employeeId || ''
    ).trim()
  );


  /*
   * ======================================================
   * SHIFT
   * ======================================================
   */

  setValue(
    [
      'SHIFT_ID'
    ],
    String(
      data.shiftId || ''
    ).trim()
  );


  /*
   * ======================================================
   * DATE
   *
   * Gunakan tanggal saja.
   * Tidak menggunakan jam 12:00.
   * ======================================================
   */

  const scheduleDate =
    _scheduleDateToSheetValue(
      data.date
    );


  setValue(
    [
      'START_DATE',
      'SCHEDULE_DATE',
      'WORK_DATE',
      'DATE'
    ],
    scheduleDate
  );


  /*
   * END_DATE
   *
   * Untuk roster harian:
   *
   * START_DATE = END_DATE
   *
   * Artinya assignment berlaku
   * hanya pada tanggal tersebut.
   */

  setValue(
    [
      'END_DATE'
    ],
    scheduleDate
  );


  /*
   * ======================================================
   * DAY OF WEEK
   * ======================================================
   */

  if (
    scheduleDate instanceof Date &&
    !isNaN(
      scheduleDate.getTime()
    )
  ) {

    const days = [

      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY'

    ];

    setValue(
      [
        'DAY_OF_WEEK'
      ],
      days[
        scheduleDate.getDay()
      ]
    );

  }


  /*
   * ======================================================
   * ACTIVE
   *
   * Sheet menggunakan ACTIVE,
   * bukan STATUS.
   * ======================================================
   */

  setValue(
    [
      'ACTIVE'
    ],
    true
  );


  /*
   * Jika suatu saat sheet menggunakan
   * STATUS, tetap kompatibel.
   */

  setValue(
    [
      'STATUS'
    ],
    'ACTIVE'
  );


  /*
   * ======================================================
   * NOTE
   * ======================================================
   */

  setValue(
    [
      'NOTE',
      'REMARK',
      'NOTES'
    ],
    String(
      data.note || ''
    ).trim()
  );


  /*
   * ======================================================
   * AUDIT
   * ======================================================
   */

  setValue(
    [
      'CREATED_AT'
    ],
    data.now ||
    new Date()
  );


  setValue(
    [
      'UPDATED_AT'
    ],
    data.now ||
    new Date()
  );


  return row;

}


function _scheduleSetColumnValue(
  sheet,
  rowNumber,
  headers,
  possibleHeaders,
  value
) {

  for (
    let i = 0;
    i < possibleHeaders.length;
    i++
  ) {

    const index =
      headers.indexOf(
        possibleHeaders[i]
      );

    if (
      index === -1
    ) {
      continue;
    }

    sheet
      .getRange(
        rowNumber,
        index + 1
      )
      .setValue(
        value
      );

    return true;
  }

  return false;
}


/* ============================================================
   DATE
   ============================================================ */

function _scheduleNormalizeDateString(
  value
) {

  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {

    return Utilities.formatDate(
      value,
      getConfig(
        'TIMEZONE'
      ) || 'Asia/Jakarta',
      'yyyy-MM-dd'
    );
  }

  const text =
    String(
      value ||
      ''
    ).trim();

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {

    return text;
  }

  return '';
}


function _scheduleGetRowDate(row) {

  if (!row) {
    return '';
  }

  const rawDate =
    row.START_DATE ||
    row.SCHEDULE_DATE ||
    row.WORK_DATE ||
    row.DATE ||
    row.END_DATE ||
    '';

  if (!rawDate) {
    return '';
  }

  // Jika data berupa objek Date dari Google Sheets
  if (
    Object.prototype.toString.call(rawDate) ===
    '[object Date]'
  ) {

    if (isNaN(rawDate.getTime())) {
      return '';
    }

    return Utilities.formatDate(
      rawDate,
      'Asia/Jakarta',
      'yyyy-MM-dd'
    );
  }

  const value =
    String(rawDate).trim();

  if (!value) {
    return '';
  }

  // Format yyyy-MM-dd
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return value;
  }

  // Format dd/MM/yyyy
  const parts =
    value.split(/[\/\-]/);

  if (parts.length >= 3) {

    let day;
    let month;
    let year;

    if (parts[0].length === 4) {
      year = Number(parts[0]);
      month = Number(parts[1]);
      day = Number(parts[2]);
    } else {
      day = Number(parts[0]);
      month = Number(parts[1]);
      year = Number(parts[2]);
    }

    if (
      year > 1900 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {

      return [
        String(year),
        String(month).padStart(2, '0'),
        String(day).padStart(2, '0')
      ].join('-');
    }
  }

  return '';
}


function _scheduleDateToSheetValue(value) {

  const dateText =
    _scheduleNormalizeDateString(value);

  if (!dateText) {
    return '';
  }

  const parts =
    dateText.split('-');

  const year =
    Number(parts[0]);

  const month =
    Number(parts[1]) - 1;

  const day =
    Number(parts[2]);

  // Simpan tanggal pada pukul 00:00:00
  return new Date(
    year,
    month,
    day,
    0,
    0,
    0
  );
}


function _scheduleFormatDateDisplay(
  value
) {

  const normalized =
    _scheduleNormalizeDateString(
      value
    );

  if (!normalized) {
    return value;
  }

  const parts =
    normalized.split('-');

  return (
    parts[2] +
    '/' +
    parts[1] +
    '/' +
    parts[0]
  );
}
