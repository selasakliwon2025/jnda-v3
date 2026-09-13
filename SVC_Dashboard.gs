/**
 * ============================================================
 * JNDA V3 - SVC_Dashboard
 * ============================================================
 *
 * Dashboard service untuk:
 * - Pegawai
 * - Manager
 * - Branch Manager
 * - Direksi
 * - Admin
 * - Admin HR
 *
 * Alur identitas:
 *
 * SESSION TOKEN
 *      ↓
 * SYS_User
 *      ↓
 * EMPLOYEE_ID
 *      ↓
 * HR_Employee
 *      ↓
 * Master Organization / Ship
 *
 * Client TIDAK dipercaya untuk menentukan employee.
 * ============================================================
 */


/**
 * ============================================================
 * PUBLIC
 * ============================================================
 */

/**
 * Ambil seluruh data dashboard berdasarkan session token.
 */
function getDashboardData(sessionToken) {

  if (!sessionToken) {
    throw new Error('Session tidak ditemukan.');
  }

  // ----------------------------------------------------------
  // 1. VALIDASI SESSION
  // ----------------------------------------------------------

  const sessionResult = validateSession(sessionToken);

  if (!sessionResult || !sessionResult.valid) {
    throw new Error('Session tidak valid atau sudah berakhir.');
  }

  const session = sessionResult.session || {};

  if (!session.userId) {
    throw new Error('Session tidak memiliki USER_ID.');
  }


  // ----------------------------------------------------------
  // 2. AMBIL USER
  // ----------------------------------------------------------

  const user = getDashboardUserById(session.userId);

  if (!user) {
    throw new Error('Data user tidak ditemukan.');
  }

  if (normalizeDashboardStatus(user.STATUS) !== 'ACTIVE') {
    throw new Error('User tidak aktif.');
  }


  // ----------------------------------------------------------
  // 3. AMBIL EMPLOYEE
  // ----------------------------------------------------------

  const employeeId = String(user.EMPLOYEE_ID || '').trim();

  if (!employeeId) {
    throw new Error(
      'USER belum memiliki EMPLOYEE_ID.'
    );
  }

  const employee = getDashboardEmployeeById(employeeId);

  if (!employee) {
    throw new Error(
      'Data HR_Employee tidak ditemukan untuk EMPLOYEE_ID: ' +
      employeeId
    );
  }


  // ----------------------------------------------------------
  // 4. ROLE
  // ----------------------------------------------------------

  const role = getDashboardRole(user.ROLE_ID);

  const roleCategory =
    getDashboardRoleCategory(
      role.roleId,
      role.roleName
    );


  // ----------------------------------------------------------
  // 5. MASTER ORGANIZATION
  // ----------------------------------------------------------

  const organization = buildEmployeeOrganizationContext(
    employee
  );


  // ----------------------------------------------------------
  // 6. ATTENDANCE SUMMARY
  // ----------------------------------------------------------

  const attendanceSummary =
    getDashboardAttendanceSummary(
      employeeId,
      roleCategory
    );


  // ----------------------------------------------------------
  // 7. MANAGEMENT SUMMARY
  // ----------------------------------------------------------

  let managementSummary = null;

  if (
    roleCategory === 'MANAGEMENT' ||
    roleCategory === 'ADMIN'
  ) {
    managementSummary =
      getDashboardManagementSummary(
        roleCategory
      );
  }


  // ----------------------------------------------------------
  // 8. RETURN
  // ----------------------------------------------------------

  return {

    success: true,

    app: {
      name: getConfigValue('APP_NAME') || 'JN Daily Attendance',
      shortName: getConfigValue('APP_SHORT_NAME') || 'JNDA',
      version: getConfigValue('VERSION') || 'V3',
      timezone: getConfigValue('TIMEZONE') || 'Asia/Jakarta'
    },

    user: {

      userId:
        String(user.USER_ID || ''),

      employeeId:
        employeeId,

      username:
        String(user.USERNAME || ''),

      email:
        String(user.EMAIL || ''),

      roleId:
        String(user.ROLE_ID || ''),

      roleName:
        role.roleName,

      roleCategory:
        roleCategory

    },

    employee: {

      employeeId:
        employeeId,

      employeeNo:
        String(employee.EMPLOYEE_NO || ''),

      nip:
        String(employee.NIP || ''),

      fullName:
        String(employee.FULL_NAME || ''),

      branchId:
        String(employee.BRANCH_ID || ''),

      directorateId:
        String(employee.DIRECTORATE_ID || ''),

      departmentId:
        String(employee.DEPARTMENT_ID || ''),

      unitId:
        String(employee.UNIT_ID || ''),

      subUnitId:
        String(employee.SUBUNIT_ID || ''),

      positionId:
        String(employee.POSITION_ID || ''),

      shipId:
        String(employee.SHIP_ID || ''),

      attendanceGroup:
        String(employee.ATTENDANCE_GROUP || ''),

      policyId:
        String(employee.POLICY_ID || ''),

      status:
        String(employee.STATUS || '')

    },

    organization: organization,

    attendance: attendanceSummary,

    management: managementSummary,

    generatedAt:
      new Date().toISOString()

  };
}


/**
 * ============================================================
 * USER
 * ============================================================
 */

function getDashboardUserById(userId) {

  const rows =
    getDashboardSheetObjects('SYS_User');

  const target =
    String(userId || '').trim();

  for (let i = 0; i < rows.length; i++) {

    const row = rows[i];

    if (
      String(row.USER_ID || '').trim() === target
    ) {
      return row;
    }
  }

  return null;
}


/**
 * ============================================================
 * EMPLOYEE
 * ============================================================
 */

function getDashboardEmployeeById(employeeId) {

  const rows =
    getDashboardSheetObjects('HR_Employee');

  const target =
    String(employeeId || '').trim();

  for (let i = 0; i < rows.length; i++) {

    const row = rows[i];

    if (
      String(row.EMPLOYEE_ID || '').trim() === target
    ) {
      return row;
    }
  }

  return null;
}


/**
 * ============================================================
 * ROLE
 * ============================================================
 */

function getDashboardRole(roleId) {

  const result = {

    roleId:
      String(roleId || ''),

    roleName:
      String(roleId || 'PEGAWAI')

  };

  if (!roleId) {
    return result;
  }

  try {

    const rows =
      getDashboardSheetObjects('SYS_Role');

    const target =
      String(roleId).trim();

    for (let i = 0; i < rows.length; i++) {

      const row = rows[i];

      if (
        String(row.ROLE_ID || '').trim() === target
      ) {

        const roleName =
          row.ROLE_NAME ||
          row.NAME ||
          row.DESCRIPTION ||
          target;

        result.roleName =
          String(roleName).trim();

        return result;
      }
    }

  } catch (error) {

    console.warn(
      'SYS_Role tidak dapat dibaca: ' +
      error.message
    );
  }

  return result;
}


/**
 * Menentukan kategori dashboard.
 */
function getDashboardRoleCategory(roleId, roleName) {

  const text = (
    String(roleName || '') +
    ' ' +
    String(roleId || '')
  )
    .toUpperCase()
    .replace(/[_-]/g, ' ');

  // ----------------------------------------------------------
  // ADMIN
  // ----------------------------------------------------------

  if (
    text.indexOf('SUPER ADMIN') >= 0 ||
    text.indexOf('ADMIN HR') >= 0 ||
    text.indexOf('ADMINHR') >= 0 ||
    text.indexOf('ADMIN') >= 0
  ) {
    return 'ADMIN';
  }


  // ----------------------------------------------------------
  // MANAGEMENT
  // ----------------------------------------------------------

  if (
    text.indexOf('DIREKSI') >= 0 ||
    text.indexOf('DIREKTUR') >= 0 ||
    text.indexOf('DIRECTOR') >= 0 ||
    text.indexOf('CEO') >= 0 ||
    text.indexOf('MANAGER') >= 0 ||
    text.indexOf('BRANCH MANAGER') >= 0 ||
    text.indexOf('GENERAL MANAGER') >= 0
  ) {
    return 'MANAGEMENT';
  }


  // ----------------------------------------------------------
  // DEFAULT
  // ----------------------------------------------------------

  return 'EMPLOYEE';
}


/**
 * ============================================================
 * ORGANIZATION CONTEXT
 * ============================================================
 */

function buildEmployeeOrganizationContext(employee) {

  const context = {

    branch: getMasterName(
      'MS_Branch',
      'BRANCH_ID',
      employee.BRANCH_ID,
      [
        'BRANCH_NAME',
        'NAME'
      ]
    ),

    directorate: getMasterName(
      'MS_Directorate',
      'DIRECTORATE_ID',
      employee.DIRECTORATE_ID,
      [
        'DIRECTORATE_NAME',
        'NAME'
      ]
    ),

    department: getMasterName(
      'MS_Department',
      'DEPARTMENT_ID',
      employee.DEPARTMENT_ID,
      [
        'DEPARTMENT_NAME',
        'NAME'
      ]
    ),

    unit: getMasterName(
      'MS_Unit',
      'UNIT_ID',
      employee.UNIT_ID,
      [
        'UNIT_NAME',
        'NAME'
      ]
    ),

    subUnit: getMasterName(
      'MS_SubUnit',
      'SUBUNIT_ID',
      employee.SUBUNIT_ID,
      [
        'SUBUNIT_NAME',
        'SUB_UNIT_NAME',
        'NAME'
      ]
    ),

    position: getMasterName(
      'MS_Position',
      'POSITION_ID',
      employee.POSITION_ID,
      [
        'POSITION_NAME',
        'NAME'
      ]
    ),

    ship: null
  };


  // ----------------------------------------------------------
  // SHIP
  // ----------------------------------------------------------

  if (employee.SHIP_ID) {

    context.ship =
      getMasterName(
        'MS_Ship',
        'SHIP_ID',
        employee.SHIP_ID,
        [
          'SHIP_NAME',
          'NAME'
        ]
      );
  }


  // ----------------------------------------------------------
  // WORK CONTEXT
  // ----------------------------------------------------------

  if (employee.SHIP_ID) {

    context.workType = 'CREW';

    context.workContext =
      context.ship ||
      'Kapal';

  } else {

    context.workType = 'LAND';

    const hierarchy = [
      context.subUnit,
      context.unit,
      context.department,
      context.directorate,
      context.branch
    ];

    context.workContext =
      hierarchy
        .filter(function(value) {
          return value &&
            value !== '-';
        })
        .join(' • ');

    if (!context.workContext) {
      context.workContext = 'Penempatan belum tersedia';
    }
  }


  return context;
}


/**
 * ============================================================
 * MASTER LOOKUP
 * ============================================================
 */

function getMasterName(
  sheetName,
  idColumn,
  idValue,
  nameColumns
) {

  if (!idValue) {
    return null;
  }

  try {

    const rows =
      getDashboardSheetObjects(sheetName);

    const target =
      String(idValue).trim();

    for (let i = 0; i < rows.length; i++) {

      const row = rows[i];

      if (
        String(row[idColumn] || '').trim() === target
      ) {

        for (
          let j = 0;
          j < nameColumns.length;
          j++
        ) {

          const name =
            String(
              row[nameColumns[j]] || ''
            ).trim();

          if (name) {
            return name;
          }
        }
      }
    }

  } catch (error) {

    console.warn(
      'Lookup master gagal [' +
      sheetName +
      ']: ' +
      error.message
    );
  }

  return null;
}


/**
 * ============================================================
 * ATTENDANCE
 * ============================================================
 */

function getDashboardAttendanceSummary(
  employeeId,
  roleCategory
) {

  const result = {

    today: {

      workDate:
        getDashboardTodayDateString(),

      status:
        'BELUM_ABSEN',

      checkIn:
        null,

      checkOut:
        null,

      workingMinutes:
        0,

      overtimeMinutes:
        0

    },

    recent: []

  };


  let rows = [];

  try {

    rows =
      getDashboardSheetObjects(
        'HR_Attendance'
      );

  } catch (error) {

    console.warn(
      'HR_Attendance belum tersedia: ' +
      error.message
    );

    return result;
  }


  const today =
    getDashboardTodayDateString();


  // ----------------------------------------------------------
  // TODAY
  // ----------------------------------------------------------

  let todayRecord = null;


  for (let i = 0; i < rows.length; i++) {

    const row = rows[i];

    if (
      String(row.EMPLOYEE_ID || '').trim() !==
      String(employeeId).trim()
    ) {
      continue;
    }

    const workDate =
      normalizeDashboardDate(
        row.WORK_DATE ||
        row.ATTENDANCE_DATE
      );

    if (workDate === today) {

      todayRecord = row;

      // Kalau ada lebih dari satu,
      // gunakan record terakhir.
    }
  }


  if (todayRecord) {

    const checkIn =
      toIsoDateValue(
        todayRecord.CHECK_IN_AT ||
        todayRecord.CHECK_IN
      );

    const checkOut =
      toIsoDateValue(
        todayRecord.CHECK_OUT_AT ||
        todayRecord.CHECK_OUT
      );

    result.today.checkIn =
      checkIn;

    result.today.checkOut =
      checkOut;

    result.today.workingMinutes =
      parseInteger(
        todayRecord.WORKING_MINUTES,
        0
      );

    result.today.overtimeMinutes =
      parseInteger(
        todayRecord.OVERTIME_MINUTES ||
        todayRecord.OVERTIME,
        0
      );


    if (checkIn && checkOut) {

      result.today.status =
        'SELESAI';

    } else if (checkIn) {

      result.today.status =
        'SEDANG_BEKERJA';

    } else {

      result.today.status =
        'BELUM_ABSEN';
    }
  }


  // ----------------------------------------------------------
  // RECENT ATTENDANCE
  // ----------------------------------------------------------

  const recent = [];

  for (let i = 0; i < rows.length; i++) {

    const row = rows[i];

    if (
      String(row.EMPLOYEE_ID || '').trim() !==
      String(employeeId).trim()
    ) {
      continue;
    }

    const workDate =
      normalizeDashboardDate(
        row.WORK_DATE ||
        row.ATTENDANCE_DATE
      );

    if (!workDate) {
      continue;
    }

    recent.push({

      attendanceId:
        String(
          row.ATTENDANCE_ID || ''
        ),

      workDate:
        workDate,

      checkIn:
        toIsoDateValue(
          row.CHECK_IN_AT ||
          row.CHECK_IN
        ),

      checkOut:
        toIsoDateValue(
          row.CHECK_OUT_AT ||
          row.CHECK_OUT
        ),

      status:
        String(
          row.STATUS || ''
        ),

      workingMinutes:
        parseInteger(
          row.WORKING_MINUTES,
          0
        ),

      overtimeMinutes:
        parseInteger(
          row.OVERTIME_MINUTES ||
          row.OVERTIME,
          0
        )

    });
  }


  // Sort terbaru.
  recent.sort(function(a, b) {

    return String(b.workDate)
      .localeCompare(
        String(a.workDate)
      );
  });


  result.recent =
    recent.slice(0, 5);


  return result;
}


/**
 * ============================================================
 * MANAGEMENT SUMMARY
 * ============================================================
 */

function getDashboardManagementSummary(
  roleCategory
) {

  const result = {

    activeEmployees: 0,

    presentToday: 0,

    completedToday: 0,

    openToday: 0,

    absentToday: 0,

    attendanceRate: 0,

    totalBranches: 0,

    totalShips: 0

  };


  // ----------------------------------------------------------
  // EMPLOYEE
  // ----------------------------------------------------------

  try {

    const employees =
      getDashboardSheetObjects(
        'HR_Employee'
      );

    result.activeEmployees =
      employees.filter(function(row) {

        return normalizeDashboardStatus(
          row.STATUS
        ) === 'ACTIVE';

      }).length;

  } catch (error) {

    console.warn(
      'Gagal membaca HR_Employee: ' +
      error.message
    );
  }


  // ----------------------------------------------------------
  // BRANCH
  // ----------------------------------------------------------

  try {

    const branches =
      getDashboardSheetObjects(
        'MS_Branch'
      );

    result.totalBranches =
      branches.filter(function(row) {

        if (
          row.ACTIVE === undefined ||
          row.ACTIVE === ''
        ) {
          return true;
        }

        return isDashboardActiveValue(
          row.ACTIVE
        );

      }).length;

  } catch (error) {

    console.warn(
      'Gagal membaca MS_Branch: ' +
      error.message
    );
  }


  // ----------------------------------------------------------
  // SHIP
  // ----------------------------------------------------------

  try {

    const ships =
      getDashboardSheetObjects(
        'MS_Ship'
      );

    result.totalShips =
      ships.filter(function(row) {

        if (
          row.ACTIVE === undefined ||
          row.ACTIVE === ''
        ) {
          return true;
        }

        return isDashboardActiveValue(
          row.ACTIVE
        );

      }).length;

  } catch (error) {

    console.warn(
      'Gagal membaca MS_Ship: ' +
      error.message
    );
  }


  // ----------------------------------------------------------
  // TODAY ATTENDANCE
  // ----------------------------------------------------------

  try {

    const attendance =
      getDashboardSheetObjects(
        'HR_Attendance'
      );

    const today =
      getDashboardTodayDateString();

    const activeEmployeeIds = {};

    const employees =
      getDashboardSheetObjects(
        'HR_Employee'
      );

    employees.forEach(function(row) {

      if (
        normalizeDashboardStatus(
          row.STATUS
        ) === 'ACTIVE'
      ) {

        activeEmployeeIds[
          String(
            row.EMPLOYEE_ID || ''
          ).trim()
        ] = true;

      }

    });


    const countedEmployees = {};

    attendance.forEach(function(row) {

      const employeeId =
        String(
          row.EMPLOYEE_ID || ''
        ).trim();

      if (
        !employeeId ||
        !activeEmployeeIds[employeeId]
      ) {
        return;
      }

      const workDate =
        normalizeDashboardDate(
          row.WORK_DATE ||
          row.ATTENDANCE_DATE
        );

      if (workDate !== today) {
        return;
      }

      // Satu employee dihitung satu kali.
      if (countedEmployees[employeeId]) {
        return;
      }

      countedEmployees[employeeId] =
        true;

      const checkIn =
        row.CHECK_IN_AT ||
        row.CHECK_IN;

      const checkOut =
        row.CHECK_OUT_AT ||
        row.CHECK_OUT;

      if (checkIn) {

        result.presentToday++;

        if (checkOut) {

          result.completedToday++;

        } else {

          result.openToday++;
        }
      }

    });


    result.absentToday =
      Math.max(
        0,
        result.activeEmployees -
        result.presentToday
      );


    if (result.activeEmployees > 0) {

      result.attendanceRate =
        Math.round(
          (
            result.presentToday /
            result.activeEmployees
          ) * 100
        );

    }

  } catch (error) {

    console.warn(
      'Gagal menghitung summary attendance: ' +
      error.message
    );
  }


  return result;
}


/**
 * ============================================================
 * SHEET READER
 * ============================================================
 */

function getDashboardSheetObjects(
  sheetName
) {

  const sheet =
    getDatabaseSheet(sheetName);

  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();


  if (
    lastRow < 2 ||
    lastColumn < 1
  ) {
    return [];
  }


  const values =
    sheet
      .getRange(
        1,
        1,
        lastRow,
        lastColumn
      )
      .getValues();


  const headers =
    values[0].map(function(header) {

      return String(
        header || ''
      ).trim();

    });


  const result = [];


  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {

    const row =
      values[rowIndex];

    const object = {};


    headers.forEach(
      function(header, columnIndex) {

        if (!header) {
          return;
        }

        object[header] =
          row[columnIndex];

      }
    );


    result.push(object);
  }


  return result;
}


/**
 * ============================================================
 * DATE / VALUE HELPERS
 * ============================================================
 */

function getDashboardTodayDateString() {

  return Utilities.formatDate(
    new Date(),
    getConfigValue('TIMEZONE') ||
      'Asia/Jakarta',
    'yyyy-MM-dd'
  );
}


function normalizeDashboardDate(value) {

  if (!value) {
    return '';
  }


  if (
    Object.prototype.toString
      .call(value) === '[object Date]'
  ) {

    if (isNaN(value.getTime())) {
      return '';
    }

    return Utilities.formatDate(
      value,
      getConfigValue('TIMEZONE') ||
        'Asia/Jakarta',
      'yyyy-MM-dd'
    );
  }


  const text =
    String(value).trim();

  if (!text) {
    return '';
  }


  // yyyy-MM-dd
  const isoMatch =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (isoMatch) {

    return (
      isoMatch[1] +
      '-' +
      isoMatch[2] +
      '-' +
      isoMatch[3]
    );
  }


  // dd/MM/yyyy
  const localMatch =
    text.match(
      /^(\d{2})\/(\d{2})\/(\d{4})/
    );

  if (localMatch) {

    return (
      localMatch[3] +
      '-' +
      localMatch[2] +
      '-' +
      localMatch[1]
    );
  }


  const date =
    new Date(text);

  if (isNaN(date.getTime())) {
    return '';
  }


  return Utilities.formatDate(
    date,
    getConfigValue('TIMEZONE') ||
      'Asia/Jakarta',
    'yyyy-MM-dd'
  );
}


function toIsoDateValue(value) {

  if (!value) {
    return null;
  }


  if (
    Object.prototype.toString
      .call(value) === '[object Date]'
  ) {

    if (isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString();
  }


  const date =
    new Date(value);

  if (isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}


function parseInteger(value, fallback) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return fallback;
  }


  const number =
    Number(value);

  if (!isFinite(number)) {
    return fallback;
  }

  return Math.round(number);
}


function normalizeDashboardStatus(value) {

  return String(
    value || ''
  )
    .trim()
    .toUpperCase();
}


function isDashboardActiveValue(value) {

  const text =
    String(value || '')
      .trim()
      .toUpperCase();

  return (
    text === 'TRUE' ||
    text === '1' ||
    text === 'YES' ||
    text === 'Y' ||
    text === 'ACTIVE' ||
    text === 'AKTIF'
  );
}
/**
 * ============================================================
 * CONFIG COMPATIBILITY
 * ============================================================
 *
 * SVC_Dashboard menggunakan getConfigValue()
 * sementara konfigurasi V3 menggunakan getConfig().
 *
 * Helper ini menjaga kompatibilitas service dashboard.
 */
function getConfigValue(key) {
  return getConfig(key);
}
