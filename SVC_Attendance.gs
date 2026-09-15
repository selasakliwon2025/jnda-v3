/**
 * ============================================================
 * JNDA V3 - ATTENDANCE SERVICE
 * File    : SVC_Attendance.gs
 * Version : V3 FINAL
 * ============================================================
 *
 * PRINCIPLE
 * ------------------------------------------------------------
 * 1. EMPLOYEE_ID berasal dari session.
 * 2. Client tidak boleh menentukan EMPLOYEE_ID.
 * 3. Attendance menggunakan server time.
 * 4. Dashboard tidak membaca seluruh HR_Attendance.
 * 5. Check-in/check-out hanya mencari record employee terkait.
 * 6. Satu employee hanya boleh mempunyai satu attendance
 *    untuk WORK_DATE yang sama.
 * 7. Lock digunakan untuk mencegah double submit.
 * 8. Timezone employee mengikuti:
 *      - Land  : MS_Branch.TIME_ZONE
 *      - Crew  : posisi kapal berdasarkan longitude.
 * 9. Night shift menggunakan tanggal mulai shift sebagai
 *    WORK_DATE.
 * 10. GPS belum divalidasi di service ini.
 *     Validasi GPS akan ditangani SVC_GPS.gs.
 *
 * ============================================================
 */


/* ============================================================
 * CONSTANT
 * ============================================================ */

const ATTENDANCE_SHEET_NAME = 'HR_Attendance';
const ATTENDANCE_EMPLOYEE_SHIFT_SHEET = 'HR_EmployeeShift';
const ATTENDANCE_SHIFT_SHEET = 'MS_Shift';
const ATTENDANCE_BRANCH_SHEET = 'MS_Branch';
const ATTENDANCE_SHIP_SHEET = 'MS_Ship';

const ATTENDANCE_STATUS_OPEN = 'OPEN';
const ATTENDANCE_STATUS_CLOSED = 'CLOSED';

const ATTENDANCE_DEFAULT_TIMEZONE = 'Asia/Jakarta';
const ATTENDANCE_DEFAULT_ZONE_LABEL = 'WIB';

/* ============================================================
 * OFFICE HOUR RULE
 * ============================================================ */

const ATTENDANCE_OFFICE_HOUR_START = '08:00';

const ATTENDANCE_OFFICE_HOUR_END_WEEKDAY = '16:30';

const ATTENDANCE_OFFICE_HOUR_END_FRIDAY = '17:00';

/*
 * Toleransi keterlambatan.
 *
 * 18 menit berarti:
 * 08:00 - 08:18 = TEPAT WAKTU
 * 08:19          = TERLAMBAT
 */
const ATTENDANCE_GRACE_MINUTES = 18;


/* ============================================================
 * PUBLIC - CHECK IN
 * ============================================================ */

/**
 * Check-in pegawai.
 *
 * Client:
 *   checkIn(sessionToken, payload)
 *
 * payload saat ini boleh kosong.
 * GPS nanti akan diproses oleh SVC_GPS.
 */
function checkIn(sessionToken, payload) {

  const lock = LockService.getScriptLock();

  try {

    lock.waitLock(15000);

    /* --------------------------------------------------------
     * 1. SESSION + EMPLOYEE
     * ------------------------------------------------------ */

    const context =
      _attendanceGetContext(sessionToken);

    const employee =
      context.employee;

    const employeeId =
      String(employee.EMPLOYEE_ID || '').trim();

    if (!employeeId) {
      throw new Error(
        'EMPLOYEE_ID pegawai tidak ditemukan.'
      );
    }


    /* --------------------------------------------------------
     * 2. TIMEZONE EMPLOYEE
     * ------------------------------------------------------ */

    const timezoneInfo =
      _attendanceGetEmployeeTimezone(employee);

    const timezone =
      timezoneInfo.timezone;

    const zoneLabel =
      timezoneInfo.label;


    /* --------------------------------------------------------
     * 3. SERVER TIME
     * ------------------------------------------------------ */

    const now =
      new Date();


    /* --------------------------------------------------------
     * 4. SHIFT EMPLOYEE
     * ------------------------------------------------------ */

    const shift =
      _attendanceGetEmployeeShift(employeeId, now);

    const attendanceMode =
      String(
        payload &&
        payload.attendanceMode || ''
      )
        .trim()
        .toUpperCase();

    const employeeType =
      String(
        payload &&
        payload.employeeType || ''
      )
        .trim()
        .toUpperCase();

    let attendanceRule = null;

    if (
      attendanceMode === 'WFO' &&
      employeeType === 'OFFICE_HOUR'
    ) {

      attendanceRule =
        _attendanceGetOfficeHourRule(
          now,
          timezone
        );
    }


    /* ============================================================
    * OFFICE HOUR RULE
    * ============================================================ */

    /**
     * Mengambil aturan Office Hour berdasarkan tanggal lokal employee.
     *
     * Senin - Kamis
     *   08:00 - 16:30
     *
     * Jumat
     *   08:00 - 17:00
     *
     * Sabtu/Minggu
     *   Tidak memiliki jadwal Office Hour.
     */
    function _attendanceGetOfficeHourRule(
      now,
      timezone
    ) {

      const localDate =
        Utilities.formatDate(
          now,
          timezone,
          'yyyy-MM-dd'
        );

      /*
      * JavaScript:
      * 0 = Minggu
      * 1 = Senin
      * 2 = Selasa
      * 3 = Rabu
      * 4 = Kamis
      * 5 = Jumat
      * 6 = Sabtu
      */
      const dayOfWeek =
        Number(
          Utilities.formatDate(
            now,
            timezone,
            'u'
          )
        );

      /*
      * ISO:
      * 1 = Senin
      * 2 = Selasa
      * 3 = Rabu
      * 4 = Kamis
      * 5 = Jumat
      * 6 = Sabtu
      * 7 = Minggu
      */

      if (
        dayOfWeek >= 1 &&
        dayOfWeek <= 4
      ) {

        return {
          employeeType: 'OFFICE_HOUR',
          scheduleCode: 'OFFICE_MON_THU',
          workDate: localDate,
          dayOfWeek: dayOfWeek,
          dayName: _attendanceOfficeDayName(dayOfWeek),

          startTime:
            ATTENDANCE_OFFICE_HOUR_START,

          endTime:
            ATTENDANCE_OFFICE_HOUR_END_WEEKDAY,

          graceMinutes:
            ATTENDANCE_GRACE_MINUTES
        };
      }


      if (dayOfWeek === 5) {

        return {
          employeeType: 'OFFICE_HOUR',
          scheduleCode: 'OFFICE_FRIDAY',
          workDate: localDate,
          dayOfWeek: dayOfWeek,
          dayName: 'Jumat',

          startTime:
            ATTENDANCE_OFFICE_HOUR_START,

          endTime:
            ATTENDANCE_OFFICE_HOUR_END_FRIDAY,

          graceMinutes:
            ATTENDANCE_GRACE_MINUTES
        };
      }


      /*
      * Weekend.
      */
      return {
        employeeType: 'OFFICE_HOUR',
        scheduleCode: 'OFFICE_WEEKEND',
        workDate: localDate,
        dayOfWeek: dayOfWeek,
        dayName: _attendanceOfficeDayName(dayOfWeek),

        startTime: '',
        endTime: '',

        graceMinutes:
          ATTENDANCE_GRACE_MINUTES,

        isWorkingDay: false
      };
    }


    /**
     * Nama hari lokal.
     */
    function _attendanceOfficeDayName(
      isoDay
    ) {

      const names = {
        1: 'Senin',
        2: 'Selasa',
        3: 'Rabu',
        4: 'Kamis',
        5: 'Jumat',
        6: 'Sabtu',
        7: 'Minggu'
      };

      return names[isoDay] || '';
    }

    /**
     * Evaluasi waktu check-in Office Hour.
     *
     * Contoh:
     *
     * Jadwal       : 08:00
     * Toleransi    : 18 menit
     *
     * 08:00        → ON_TIME
     * 08:18        → ON_TIME
     * 08:19        → LATE, 1 menit
     */
    function _attendanceEvaluateOfficeHourCheckIn(
      checkInAt,
      rule,
      timezone
    ) {

      if (
        !checkInAt ||
        !rule ||
        !rule.startTime
      ) {

        return {
          status: 'UNKNOWN',
          lateMinutes: 0,
          isLate: false
        };
      }


      /*
      * Ambil tanggal lokal dari check-in.
      */
      const localDate =
        Utilities.formatDate(
          checkInAt,
          timezone,
          'yyyy-MM-dd'
        );


      /*
      * Buat waktu mulai kerja berdasarkan
      * tanggal lokal employee.
      */
      const scheduledStart =
        _attendanceBuildLocalDateTime(
          localDate,
          rule.startTime,
          timezone
        );


      if (!scheduledStart) {

        return {
          status: 'UNKNOWN',
          lateMinutes: 0,
          isLate: false
        };
      }


      const graceEnd =
        new Date(
          scheduledStart.getTime() +
          (
            rule.graceMinutes *
            60 *
            1000
          )
        );


      const actual =
        checkInAt.getTime();


      /*
      * Masih dalam toleransi.
      */
      if (
        actual <=
        graceEnd.getTime()
      ) {

        return {
          status: 'ON_TIME',
          lateMinutes: 0,
          isLate: false,

          scheduledStart:
            scheduledStart,

          graceEnd:
            graceEnd
        };
      }


      /*
      * Sudah melewati toleransi.
      */
      const lateMinutes =
        Math.ceil(
          (
            actual -
            graceEnd.getTime()
          ) /
          60000
        );


      return {
        status: 'LATE',
        lateMinutes: lateMinutes,
        isLate: true,

        scheduledStart:
          scheduledStart,

        graceEnd:
          graceEnd
      };
    }

    /**
     * Membuat Date dari tanggal + jam lokal.
     *
     * Karena Apps Script menggunakan Date object,
     * kita buat string ISO lokal lalu konversi
     * menggunakan timezone employee.
     */
    function _attendanceBuildLocalDateTime(
      localDate,
      time,
      timezone
    ) {

      if (
        !localDate ||
        !time
      ) {
        return null;
      }


      const match =
        String(time)
          .trim()
          .match(
            /^(\d{1,2}):(\d{2})$/
          );


      if (!match) {
        return null;
      }


      const hour =
        Number(match[1]);

      const minute =
        Number(match[2]);


      if (
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
      ) {
        return null;
      }


      /*
      * Apps Script timezone-safe approach:
      *
      * Gunakan Utilities.parseDate jika tersedia
      * pada runtime Apps Script.
      */
      const date =
        Utilities.parseDate(
          localDate +
          ' ' +
          (
            ('0' + hour).slice(-2)
          ) +
          ':' +
          (
            ('0' + minute).slice(-2)
          ),
          timezone,
          'yyyy-MM-dd HH:mm'
        );


      return date;
    }


    /* --------------------------------------------------------
     * 5. WORK DATE
     *
     * Untuk night shift:
     *
     * 19:00 - 07:00
     *
     * checkout besok pagi tetap menggunakan WORK_DATE
     * tanggal mulai shift.
     * ------------------------------------------------------ */

    const workDate =
      _attendanceResolveWorkDate(
        now,
        timezone,
        shift
      );


    /* --------------------------------------------------------
     * 6. CEK ATTENDANCE EXISTING
     * ------------------------------------------------------ */

    const existing =
      _attendanceFindByEmployeeAndWorkDate(
        employeeId,
        workDate
      );


    if (existing) {

      const existingStatus =
        _attendanceNormalizeStatus(
          existing.record.STATUS
        );


      /* ------------------------------------------------------
       * SUDAH CHECK-IN
       * ---------------------------------------------------- */

      if (
        existingStatus ===
        ATTENDANCE_STATUS_OPEN
      ) {

        return {
          success: false,
          code: 'ALREADY_CHECKED_IN',
          message:
            'Anda sudah melakukan absen masuk.',
          attendance:
            _attendanceBuildResult(
              existing.record,
              timezone,
              zoneLabel
            )
        };
      }


      /* ------------------------------------------------------
       * SUDAH SELESAI
       * ---------------------------------------------------- */

      if (
        existingStatus ===
        ATTENDANCE_STATUS_CLOSED
      ) {

        return {
          success: false,
          code: 'ATTENDANCE_ALREADY_COMPLETED',
          message:
            'Attendance hari ini sudah selesai.',
          attendance:
            _attendanceBuildResult(
              existing.record,
              timezone,
              zoneLabel
            )
        };
      }
    }


    /* --------------------------------------------------------
     * 7. GENERATE ATTENDANCE ID
     * ------------------------------------------------------ */

    const attendanceId =
      _attendanceGenerateId(
        employeeId,
        now
      );


    /* --------------------------------------------------------
     * 8. MASTER / CONTEXT
     * ------------------------------------------------------ */

    const shiftId =
      shift && shift.SHIFT_ID
        ? String(shift.SHIFT_ID).trim()
        : '';

    const policyId =
      String(employee.POLICY_ID || '').trim();

    const shipId =
      String(employee.SHIP_ID || '').trim();


    /*
     * LOCATION_ID dikosongkan dulu.
     *
     * Nanti SVC_GPS akan menentukan lokasi valid.
     */
    const locationId = '';


    /* --------------------------------------------------------
     * 9. SHEET
     * ------------------------------------------------------ */

    const sheet =
      getDatabaseSheet(
        ATTENDANCE_SHEET_NAME
      );

    const columns =
      _attendanceGetColumns(sheet);

    const row =
      _attendanceCreateEmptyRow(columns);


    /* --------------------------------------------------------
     * 10. BUILD ROW
     * ------------------------------------------------------ */

    _attendanceSetRowValue(
      row,
      columns,
      'ATTENDANCE_ID',
      attendanceId
    );

    _attendanceSetRowValue(
      row,
      columns,
      'EMPLOYEE_ID',
      employeeId
    );

    _attendanceSetRowValue(
      row,
      columns,
      'WORK_DATE',
      workDate
    );

    _attendanceSetRowValue(
      row,
      columns,
      'CHECK_IN_AT',
      now
    );

    _attendanceSetRowValue(
      row,
      columns,
      'CHECK_OUT_AT',
      ''
    );

    _attendanceSetRowValue(
      row,
      columns,
      'STATUS',
      ATTENDANCE_STATUS_OPEN
    );

    _attendanceSetRowValue(
      row,
      columns,
      'SHIFT_ID',
      shiftId
    );

    _attendanceSetRowValue(
      row,
      columns,
      'POLICY_ID',
      policyId
    );

    _attendanceSetRowValue(
      row,
      columns,
      'LOCATION_ID',
      locationId
    );

    _attendanceSetRowValue(
      row,
      columns,
      'SHIP_ID',
      shipId
    );


    /* GPS - tahap berikutnya */

    _attendanceSetRowValue(
      row,
      columns,
      'CHECKIN_LATITUDE',
      ''
    );

    _attendanceSetRowValue(
      row,
      columns,
      'CHECKIN_LONGITUDE',
      ''
    );

    _attendanceSetRowValue(
      row,
      columns,
      'CHECKIN_ACCURACY',
      ''
    );

    _attendanceSetRowValue(
      row,
      columns,
      'CHECKOUT_LATITUDE',
      ''
    );

    _attendanceSetRowValue(
      row,
      columns,
      'CHECKOUT_LONGITUDE',
      ''
    );

    _attendanceSetRowValue(
      row,
      columns,
      'CHECKOUT_ACCURACY',
      ''
    );


    /* Working */

    _attendanceSetRowValue(
      row,
      columns,
      'WORKING_MINUTES',
      0
    );

    _attendanceSetRowValue(
      row,
      columns,
      'OVERTIME_MINUTES',
      0
    );

    _attendanceSetRowValue(
      row,
      columns,
      'REMARK',
      ''
    );


    /* Audit */

    _attendanceSetRowValue(
      row,
      columns,
      'CREATED_AT',
      now
    );

    _attendanceSetRowValue(
      row,
      columns,
      'UPDATED_AT',
      now
    );


    /* --------------------------------------------------------
     * 11. SAVE
     * ------------------------------------------------------ */

    sheet.appendRow(row);


    /* --------------------------------------------------------
     * 12. BUILD RESPONSE
     * ------------------------------------------------------ */

    const insertedRecord =
      _attendanceRowToObject(
        columns,
        row
      );

    const result =
      _attendanceBuildResult(
        insertedRecord,
        timezone,
        zoneLabel
      );


    return {

      success: true,

      code:
        'CHECK_IN_SUCCESS',

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


/* ============================================================
 * PUBLIC - CHECK OUT
 * ============================================================ */

/**
 * Check-out pegawai.
 */
function checkOut(sessionToken, payload) {

  const lock =
    LockService.getScriptLock();

  try {

    lock.waitLock(15000);


    /* --------------------------------------------------------
     * 1. SESSION
     * ------------------------------------------------------ */

    const context =
      _attendanceGetContext(
        sessionToken
      );

    const employee =
      context.employee;

    const employeeId =
      String(
        employee.EMPLOYEE_ID || ''
      ).trim();

    if (!employeeId) {
      throw new Error(
        'EMPLOYEE_ID pegawai tidak ditemukan.'
      );
    }


    /* --------------------------------------------------------
     * 2. TIMEZONE
     * ------------------------------------------------------ */

    const timezoneInfo =
      _attendanceGetEmployeeTimezone(
        employee
      );

    const timezone =
      timezoneInfo.timezone;

    const zoneLabel =
      timezoneInfo.label;


    /* --------------------------------------------------------
     * 3. SERVER TIME
     * ------------------------------------------------------ */

    const now =
      new Date();


    let attendanceEvaluation = {
      status: 'UNKNOWN',
      lateMinutes: 0,
      isLate: false
    };


    if (
      attendanceRule &&
      attendanceRule.isWorkingDay !== false
    ) {

      attendanceEvaluation =
        _attendanceEvaluateOfficeHourCheckIn(
          now,
          attendanceRule,
          timezone
        );
    }


    /* --------------------------------------------------------
     * 4. SHIFT
     * ------------------------------------------------------ */

    const shift =
      _attendanceGetEmployeeShift(
        employeeId,
        now
      );


    /* --------------------------------------------------------
     * 5. WORK DATE
     *
     * Penting untuk night shift.
     * ------------------------------------------------------ */

    const workDate =
      _attendanceResolveWorkDate(
        now,
        timezone,
        shift
      );


    /* --------------------------------------------------------
     * 6. FIND OPEN / EXISTING
     * ------------------------------------------------------ */

    let existing =
      _attendanceFindByEmployeeAndWorkDate(
        employeeId,
        workDate
      );


    /*
     * Jika tidak ditemukan berdasarkan tanggal sekarang,
     * cek kemungkinan night shift dari hari sebelumnya.
     *
     * Contoh:
     *
     * 14 Sep 19:00 masuk
     * 15 Sep 06:00 pulang
     *
     * WORK_DATE = 14 Sep
     */

    if (!existing) {

      const previousWorkDate =
        _attendanceGetPreviousDate(
          workDate
        );

      existing =
        _attendanceFindByEmployeeAndWorkDate(
          employeeId,
          previousWorkDate
        );
    }


    /* --------------------------------------------------------
     * 7. BELUM CHECK-IN
     * ------------------------------------------------------ */

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

    const status =
      _attendanceNormalizeStatus(
        record.STATUS
      );


    /* --------------------------------------------------------
     * 8. SUDAH CHECKOUT
     * ------------------------------------------------------ */

    if (
      status ===
      ATTENDANCE_STATUS_CLOSED
    ) {

      return {

        success: false,

        code:
          'ALREADY_CHECKED_OUT',

        message:
          'Anda sudah melakukan absen pulang.',

        attendance:
          _attendanceBuildResult(
            record,
            timezone,
            zoneLabel
          )

      };
    }


    /* --------------------------------------------------------
     * 9. CHECK-IN VALIDATION
     * ------------------------------------------------------ */

    const checkIn =
      _attendanceToDate(
        record.CHECK_IN_AT
      );

    if (!checkIn) {

      throw new Error(
        'Waktu absen masuk tidak valid.'
      );
    }


    /* --------------------------------------------------------
     * 10. PROTECT AGAINST INVALID TIME
     * ------------------------------------------------------ */

    if (
      now.getTime() <
      checkIn.getTime()
    ) {

      throw new Error(
        'Waktu absen pulang tidak valid.'
      );
    }


    /* --------------------------------------------------------
     * 11. WORKING MINUTES
     * ------------------------------------------------------ */

    const workingMinutes =
      _attendanceCalculateWorkingMinutes(
        checkIn,
        now
      );


    /* --------------------------------------------------------
     * 12. OVERTIME
     *
     * Untuk tahap ini tetap 0.
     * Akan dihitung melalui Attendance Policy.
     * ------------------------------------------------------ */

    const overtimeMinutes = 0;


    /* --------------------------------------------------------
     * 13. UPDATE ROW
     * ------------------------------------------------------ */

    const sheet =
      getDatabaseSheet(
        ATTENDANCE_SHEET_NAME
      );

    const columns =
      _attendanceGetColumns(sheet);

    const rowNumber =
      existing.rowNumber;


    _attendanceSetSheetCell(
      sheet,
      rowNumber,
      columns,
      'CHECK_OUT_AT',
      now
    );

    _attendanceSetSheetCell(
      sheet,
      rowNumber,
      columns,
      'STATUS',
      ATTENDANCE_STATUS_CLOSED
    );

    _attendanceSetSheetCell(
      sheet,
      rowNumber,
      columns,
      'WORKING_MINUTES',
      workingMinutes
    );

    _attendanceSetSheetCell(
      sheet,
      rowNumber,
      columns,
      'OVERTIME_MINUTES',
      overtimeMinutes
    );

    _attendanceSetSheetCell(
      sheet,
      rowNumber,
      columns,
      'UPDATED_AT',
      now
    );


    /* --------------------------------------------------------
     * 14. RESPONSE
     * ------------------------------------------------------ */

    const updatedRecord =
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
        _attendanceBuildResult(
          updatedRecord,
          timezone,
          zoneLabel
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


/* ============================================================
 * PUBLIC - TODAY ATTENDANCE
 * ============================================================ */

/**
 * Mengambil attendance hari ini.
 *
 * Fungsi ini DIPANGGIL SATU KALI setelah dashboard selesai
 * loading.
 *
 * Tidak membaca seluruh attendance.
 */
function getTodayAttendance(sessionToken) {

  const context =
    _attendanceGetContext(
      sessionToken
    );

  const employee =
    context.employee;

  const employeeId =
    String(
      employee.EMPLOYEE_ID || ''
    ).trim();


  const timezoneInfo =
    _attendanceGetEmployeeTimezone(
      employee
    );


  const now =
    new Date();


  const shift =
    _attendanceGetEmployeeShift(
      employeeId,
      now
    );


  const workDate =
    _attendanceResolveWorkDate(
      now,
      timezoneInfo.timezone,
      shift
    );


  let existing =
    _attendanceFindByEmployeeAndWorkDate(
      employeeId,
      workDate
    );


  /*
   * Night shift:
   * jika pagi hari dan attendance kemarin masih OPEN,
   * ambil record tersebut.
   */

  if (!existing) {

    const previousWorkDate =
      _attendanceGetPreviousDate(
        workDate
      );

    const previous =
      _attendanceFindByEmployeeAndWorkDate(
        employeeId,
        previousWorkDate
      );

    if (
      previous &&
      _attendanceNormalizeStatus(
        previous.record.STATUS
      ) === ATTENDANCE_STATUS_OPEN
    ) {
      existing = previous;
    }
  }


  /* ----------------------------------------------------------
   * BELUM ABSEN
   * -------------------------------------------------------- */

  if (!existing) {

    return {

      success: true,

      exists: false,

      status:
        'BELUM_ABSEN',

      attendance: null

    };
  }


  /* ----------------------------------------------------------
   * ADA ATTENDANCE
   * -------------------------------------------------------- */

  return {

    success: true,

    exists: true,

    status:
      _attendanceNormalizeStatus(
        existing.record.STATUS
      ),

    attendance:
      _attendanceBuildResult(
        existing.record,
        timezoneInfo.timezone,
        timezoneInfo.label
      )

  };
}


/* ============================================================
 * CONTEXT
 * ============================================================ */

/**
 * Session → SYS_User → HR_Employee
 */
function _attendanceGetContext(sessionToken) {

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


  if (!session || !session.userId) {

    throw new Error(
      'Session tidak memiliki USER_ID.'
    );
  }


  /* ----------------------------------------------------------
   * SYS USER
   * -------------------------------------------------------- */

  const user =
    _attendanceFindRowByColumn(
      'SYS_User',
      'USER_ID',
      session.userId
    );


  if (!user) {

    throw new Error(
      'Data user tidak ditemukan.'
    );
  }


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


  /* ----------------------------------------------------------
   * HR EMPLOYEE
   * -------------------------------------------------------- */

  const employee =
    _attendanceFindRowByColumn(
      'HR_Employee',
      'EMPLOYEE_ID',
      employeeId
    );


  if (!employee) {

    throw new Error(
      'Data employee tidak ditemukan.'
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
      'Employee tidak aktif.'
    );
  }


  return {

    user: user,

    employee: employee

  };
}


/* ============================================================
 * EMPLOYEE TIMEZONE
 * ============================================================ */

/**
 * LAND
 * ----
 * HR_Employee.BRANCH_ID
 *       ↓
 * MS_Branch.TIME_ZONE
 *
 *
 * CREW
 * ----
 * HR_Employee.SHIP_ID
 *       ↓
 * MS_Ship.LATITUDE / LONGITUDE
 *       ↓
 * timezone
 */
function _attendanceGetEmployeeTimezone(employee) {

  const shipId =
    String(
      employee.SHIP_ID || ''
    ).trim();


  /* ----------------------------------------------------------
   * CREW
   * -------------------------------------------------------- */

  if (shipId) {

    const ship =
      _attendanceFindRowByColumn(
        ATTENDANCE_SHIP_SHEET,
        'SHIP_ID',
        shipId
      );


    if (ship) {

      const latitude =
        Number(
          ship.LATITUDE
        );

      const longitude =
        Number(
          ship.LONGITUDE
        );


      if (
        !isNaN(latitude) &&
        !isNaN(longitude)
      ) {

        return _attendanceTimezoneFromLongitude(
          longitude
        );
      }
    }
  }


  /* ----------------------------------------------------------
   * LAND
   * -------------------------------------------------------- */

  const branchId =
    String(
      employee.BRANCH_ID || ''
    ).trim();


  if (branchId) {

    const branch =
      _attendanceFindRowByColumn(
        ATTENDANCE_BRANCH_SHEET,
        'BRANCH_ID',
        branchId
      );


    if (branch) {

      const timezone =
        String(
          branch.TIME_ZONE ||
          branch.TIMEZONE ||
          ''
        ).trim();


      if (timezone) {

        return _attendanceTimezoneInfo(
          timezone
        );
      }
    }
  }


  /* ----------------------------------------------------------
   * FALLBACK
   * -------------------------------------------------------- */

  return {

    timezone:
      ATTENDANCE_DEFAULT_TIMEZONE,

    label:
      ATTENDANCE_DEFAULT_ZONE_LABEL

  };
}


/**
 * Indonesia timezone berdasarkan longitude.
 *
 * WIB  : UTC+7
 * WITA : UTC+8
 * WIT  : UTC+9
 *
 * Saat ini perusahaan menggunakan WIB/WITA.
 */
function _attendanceTimezoneFromLongitude(longitude) {

  if (longitude < 114.5) {

    return {

      timezone:
        'Asia/Jakarta',

      label:
        'WIB'

    };
  }


  if (longitude < 120.5) {

    return {

      timezone:
        'Asia/Makassar',

      label:
        'WITA'

    };
  }


  return {

    timezone:
      'Asia/Jayapura',

    label:
      'WIT'

  };
}


/**
 * Normalisasi timezone.
 */
function _attendanceTimezoneInfo(timezone) {

  const value =
    String(
      timezone || ''
    ).trim();


  if (
    value === 'Asia/Jakarta' ||
    value === 'WIB' ||
    value === 'UTC+7'
  ) {

    return {

      timezone:
        'Asia/Jakarta',

      label:
        'WIB'

    };
  }


  if (
    value === 'Asia/Makassar' ||
    value === 'Asia/Ujung_Pandang' ||
    value === 'WITA' ||
    value === 'UTC+8'
  ) {

    return {

      timezone:
        'Asia/Makassar',

      label:
        'WITA'

    };
  }


  if (
    value === 'Asia/Jayapura' ||
    value === 'WIT' ||
    value === 'UTC+9'
  ) {

    return {

      timezone:
        'Asia/Jayapura',

      label:
        'WIT'

    };
  }


  return {

    timezone:
      value ||
      ATTENDANCE_DEFAULT_TIMEZONE,

    label:
      _attendanceTimezoneLabel(
        value
      )

  };
}


function _attendanceTimezoneLabel(timezone) {

  if (
    timezone === 'Asia/Makassar'
  ) {
    return 'WITA';
  }

  if (
    timezone === 'Asia/Jayapura'
  ) {
    return 'WIT';
  }

  return 'WIB';
}


/* ============================================================
 * SHIFT
 * ============================================================ */

/**
 * Mencari shift employee.
 *
 * Karena struktur HR_EmployeeShift dapat berkembang,
 * fungsi ini mendeteksi header secara fleksibel.
 */
function _attendanceGetEmployeeShift(
  employeeId,
  referenceDate
) {

  const sheet =
    _attendanceGetSheetSafe(
      ATTENDANCE_EMPLOYEE_SHIFT_SHEET
    );


  if (!sheet) {
    return null;
  }


  const data =
    sheet.getDataRange().getValues();


  if (
    !data ||
    data.length < 2
  ) {
    return null;
  }


  const headers =
    data[0].map(
      function (value) {
        return String(
          value || ''
        )
          .trim()
          .toUpperCase();
      }
    );


  const employeeIndex =
    _attendanceFindHeaderIndex(
      headers,
      [
        'EMPLOYEE_ID',
        'EMP_ID'
      ]
    );


  const shiftIndex =
    _attendanceFindHeaderIndex(
      headers,
      [
        'SHIFT_ID',
        'ATTENDANCE_SHIFT_ID'
      ]
    );


  if (
    employeeIndex < 0 ||
    shiftIndex < 0
  ) {
    return null;
  }


  const startIndex =
    _attendanceFindHeaderIndex(
      headers,
      [
        'START_DATE',
        'EFFECTIVE_FROM',
        'VALID_FROM'
      ]
    );


  const endIndex =
    _attendanceFindHeaderIndex(
      headers,
      [
        'END_DATE',
        'EFFECTIVE_TO',
        'VALID_TO'
      ]
    );


  const statusIndex =
    _attendanceFindHeaderIndex(
      headers,
      [
        'STATUS',
        'IS_ACTIVE'
      ]
    );


  const refTime =
    referenceDate.getTime();


  let best =
    null;

  let bestStart =
    -Infinity;


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    const row =
      data[i];


    const rowEmployeeId =
      String(
        row[employeeIndex] || ''
      ).trim();


    if (
      rowEmployeeId !==
      String(employeeId).trim()
    ) {
      continue;
    }


    /* Status */

    if (statusIndex >= 0) {

      const status =
        String(
          row[statusIndex] || ''
        )
          .trim()
          .toUpperCase();


      if (
        status === 'INACTIVE' ||
        status === '0' ||
        status === 'FALSE'
      ) {
        continue;
      }
    }


    /* Start date */

    let startTime =
      -Infinity;


    if (startIndex >= 0) {

      const startDate =
        _attendanceToDate(
          row[startIndex]
        );


      if (startDate) {

        startTime =
          startDate.getTime();


        if (
          startTime >
          refTime
        ) {
          continue;
        }
      }
    }


    /* End date */

    if (endIndex >= 0) {

      const endDate =
        _attendanceToDate(
          row[endIndex]
        );


      if (
        endDate &&
        refTime >
        endDate.getTime()
      ) {
        continue;
      }
    }


    if (
      startTime >= bestStart
    ) {

      bestStart =
        startTime;

      best =
        _attendanceRowToObject(
          headers,
          row
        );
    }
  }


  if (!best) {
    return null;
  }


  const shiftId =
    String(
      best.SHIFT_ID ||
      best.ATTENDANCE_SHIFT_ID ||
      ''
    ).trim();


  if (!shiftId) {
    return null;
  }


  /* ----------------------------------------------------------
   * Ambil master shift.
   * -------------------------------------------------------- */

  const shift =
    _attendanceFindRowByColumn(
      ATTENDANCE_SHIFT_SHEET,
      'SHIFT_ID',
      shiftId
    );


  if (!shift) {

    return {

      SHIFT_ID:
        shiftId

    };
  }


  return Object.assign(
    {},
    shift,
    {
      SHIFT_ID:
        shiftId
    }
  );
}


/* ============================================================
 * WORK DATE
 * ============================================================ */

/**
 * Menentukan WORK_DATE.
 *
 * Night shift:
 *
 * 19:00 - 07:00
 *
 * Jika sekarang sebelum jam selesai shift,
 * tanggal kerja dapat berasal dari hari sebelumnya.
 */
function _attendanceResolveWorkDate(
  now,
  timezone,
  shift
) {

  const localDate =
    Utilities.formatDate(
      now,
      timezone,
      'yyyy-MM-dd'
    );


  if (!shift) {
    return localDate;
  }


  const start =
    _attendanceGetShiftTime(
      shift,
      [
        'START_TIME',
        'SHIFT_START',
        'CHECKIN_START'
      ]
    );


  const end =
    _attendanceGetShiftTime(
      shift,
      [
        'END_TIME',
        'SHIFT_END',
        'CHECKOUT_END'
      ]
    );


  if (!start || !end) {
    return localDate;
  }


  /*
   * Shift melewati tengah malam.
   *
   * Contoh:
   * 19:00 → 07:00
   */
  if (end < start) {

    const currentTime =
      Utilities.formatDate(
        now,
        timezone,
        'HH:mm'
      );


    /*
     * Setelah tengah malam dan sebelum end time,
     * WORK_DATE adalah hari sebelumnya.
     */
    if (
      currentTime <
      end
    ) {

      return _attendanceGetPreviousDate(
        localDate
      );
    }
  }


  return localDate;
}


/**
 * Ambil jam shift secara fleksibel.
 */
function _attendanceGetShiftTime(
  shift,
  fields
) {

  for (
    let i = 0;
    i < fields.length;
    i++
  ) {

    const value =
      shift[
        fields[i]
      ];


    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      continue;
    }


    /*
     * Jika Date.
     */
    if (
      Object.prototype.toString.call(
        value
      ) === '[object Date]'
    ) {

      return Utilities.formatDate(
        value,
        ATTENDANCE_DEFAULT_TIMEZONE,
        'HH:mm'
      );
    }


    const text =
      String(
        value
      ).trim();


    const match =
      text.match(
        /(\d{1,2}):(\d{2})/
      );


    if (match) {

      const hour =
        ('0' +
          match[1]
        ).slice(-2);

      const minute =
        match[2];

      return (
        hour +
        ':' +
        minute
      );
    }
  }


  return '';
}


/* ============================================================
 * ATTENDANCE FIND
 * ============================================================ */

/**
 * Mencari attendance berdasarkan:
 *
 * EMPLOYEE_ID + WORK_DATE
 *
 * PENTING:
 * Tidak menggunakan getDataRange() untuk seluruh
 * HR_Attendance.
 *
 * TextFinder digunakan untuk menemukan EMPLOYEE_ID,
 * kemudian hanya row yang match yang dibaca.
 */
function _attendanceFindByEmployeeAndWorkDate(
  employeeId,
  workDate
) {

  const sheet =
    _attendanceGetSheetSafe(
      ATTENDANCE_SHEET_NAME
    );


  if (!sheet) {
    throw new Error(
      'Sheet HR_Attendance tidak ditemukan.'
    );
  }


  const lastRow =
    sheet.getLastRow();


  const lastColumn =
    sheet.getLastColumn();


  if (
    lastRow < 2 ||
    lastColumn < 1
  ) {
    return null;
  }


  /* ----------------------------------------------------------
   * Header
   * -------------------------------------------------------- */

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0]
      .map(
        function (value) {
          return String(
            value || ''
          ).trim();
        }
      );


  const employeeColumn =
    _attendanceFindHeaderIndex(
      headers.map(
        function (value) {
          return value.toUpperCase();
        }
      ),
      ['EMPLOYEE_ID']
    );


  const workDateColumn =
    _attendanceFindHeaderIndex(
      headers.map(
        function (value) {
          return value.toUpperCase();
        }
      ),
      ['WORK_DATE']
    );


  if (
    employeeColumn < 0 ||
    workDateColumn < 0
  ) {

    throw new Error(
      'Kolom EMPLOYEE_ID atau WORK_DATE pada HR_Attendance tidak ditemukan.'
    );
  }


  /* ----------------------------------------------------------
   * TextFinder
   * -------------------------------------------------------- */

  const employeeColumnNumber =
    employeeColumn + 1;


  const matches =
    sheet
      .getRange(
        2,
        employeeColumnNumber,
        lastRow - 1,
        1
      )
      .createTextFinder(
        String(employeeId)
      )
      .matchEntireCell(true)
      .matchCase(true)
      .findAll();


  if (
    !matches ||
    matches.length === 0
  ) {
    return null;
  }


  /* ----------------------------------------------------------
   * Check matched rows only.
   * -------------------------------------------------------- */

  const targetDate =
    String(
      workDate
    ).trim();


  let found =
    null;


  for (
    let i = 0;
    i < matches.length;
    i++
  ) {

    const rowNumber =
      matches[i].getRow();


    const values =
      sheet
        .getRange(
          rowNumber,
          1,
          1,
          lastColumn
        )
        .getValues()[0];


    const record =
      _attendanceRowToObject(
        headers,
        values
      );


    const recordDate =
      _attendanceNormalizeWorkDate(
        record.WORK_DATE
      );


    if (
      recordDate !==
      targetDate
    ) {
      continue;
    }


    /*
     * Jika ada lebih dari satu record,
     * prioritaskan OPEN.
     */
    const status =
      _attendanceNormalizeStatus(
        record.STATUS
      );


    if (
      status ===
      ATTENDANCE_STATUS_OPEN
    ) {

      return {

        rowNumber:
          rowNumber,

        record:
          record

      };
    }


    if (!found) {

      found = {

        rowNumber:
          rowNumber,

        record:
          record

      };
    }
  }


  return found;
}


/* ============================================================
 * SHEET HELPERS
 * ============================================================ */

function _attendanceGetSheetSafe(
  sheetName
) {

  try {

    return getDatabaseSheet(
      sheetName
    );

  } catch (error) {

    console.error(
      'Attendance sheet error:',
      sheetName,
      error
    );

    return null;
  }
}


function _attendanceGetColumns(
  sheet
) {

  const lastColumn =
    sheet.getLastColumn();


  if (
    lastColumn < 1
  ) {
    throw new Error(
      'Sheet attendance tidak memiliki header.'
    );
  }


  return sheet
    .getRange(
      1,
      1,
      1,
      lastColumn
    )
    .getValues()[0]
    .map(
      function (value) {
        return String(
          value || ''
        ).trim();
      }
    );
}


function _attendanceCreateEmptyRow(
  columns
) {

  return columns.map(
    function () {
      return '';
    }
  );
}


function _attendanceSetRowValue(
  row,
  columns,
  columnName,
  value
) {

  const index =
    _attendanceFindHeaderIndex(
      columns.map(
        function (value) {
          return String(
            value || ''
          ).toUpperCase();
        }
      ),
      [
        columnName.toUpperCase()
      ]
    );


  if (
    index >= 0
  ) {
    row[index] =
      value;
  }
}


function _attendanceSetSheetCell(
  sheet,
  rowNumber,
  columns,
  columnName,
  value
) {

  const index =
    _attendanceFindHeaderIndex(
      columns.map(
        function (item) {
          return String(
            item || ''
          ).toUpperCase();
        }
      ),
      [
        columnName.toUpperCase()
      ]
    );


  if (
    index < 0
  ) {
    return;
  }


  sheet
    .getRange(
      rowNumber,
      index + 1
    )
    .setValue(
      value
    );
}


function _attendanceFindHeaderIndex(
  headers,
  candidates
) {

  for (
    let i = 0;
    i < headers.length;
    i++
  ) {

    const header =
      String(
        headers[i] || ''
      )
        .trim()
        .toUpperCase();


    for (
      let j = 0;
      j < candidates.length;
      j++
    ) {

      if (
        header ===
        String(
          candidates[j]
        )
          .trim()
          .toUpperCase()
      ) {

        return i;
      }
    }
  }


  return -1;
}


/* ============================================================
 * GENERIC ROW FINDER
 * ============================================================ */

/**
 * Digunakan untuk master kecil:
 *
 * SYS_User
 * HR_Employee
 * MS_Branch
 * MS_Ship
 * MS_Shift
 *
 * Bukan untuk HR_Attendance.
 */
function _attendanceFindRowByColumn(
  sheetName,
  columnName,
  value
) {

  const sheet =
    _attendanceGetSheetSafe(
      sheetName
    );


  if (!sheet) {
    return null;
  }


  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();


  if (
    lastRow < 2 ||
    lastColumn < 1
  ) {
    return null;
  }


  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0];


  const normalizedHeaders =
    headers.map(
      function (header) {
        return String(
          header || ''
        )
          .trim()
          .toUpperCase();
      }
    );


  const columnIndex =
    _attendanceFindHeaderIndex(
      normalizedHeaders,
      [
        columnName
      ]
    );


  if (
    columnIndex < 0
  ) {
    return null;
  }


  /*
   * TextFinder agar tidak membaca seluruh
   * kolom menjadi array besar.
   */
  const matches =
    sheet
      .getRange(
        2,
        columnIndex + 1,
        lastRow - 1,
        1
      )
      .createTextFinder(
        String(value)
      )
      .matchEntireCell(true)
      .matchCase(true)
      .findAll();


  if (
    !matches ||
    matches.length === 0
  ) {
    return null;
  }


  const rowNumber =
    matches[0].getRow();


  const row =
    sheet
      .getRange(
        rowNumber,
        1,
        1,
        lastColumn
      )
      .getValues()[0];


  return _attendanceRowToObject(
    headers,
    row
  );
}


/* ============================================================
 * OBJECT / ROW
 * ============================================================ */

function _attendanceRowToObject(
  headers,
  row
) {

  const object =
    {};


  for (
    let i = 0;
    i < headers.length;
    i++
  ) {

    const key =
      String(
        headers[i] || ''
      ).trim();


    if (!key) {
      continue;
    }


    object[key] =
      row[i];
  }


  return object;
}


/* ============================================================
 * RESULT
 * ============================================================ */

/**
 * Response yang dikonsumsi PAGE_Dashboard.html.
 */
function _attendanceBuildResult(
  record,
  timezone,
  zoneLabel
) {

  if (!record) {
    return null;
  }


  const checkIn =
    _attendanceToDate(
      record.CHECK_IN_AT
    );


  const checkOut =
    _attendanceToDate(
      record.CHECK_OUT_AT
    );


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
      _attendanceNormalizeWorkDate(
        record.WORK_DATE
      ),

    status:
      _attendanceNormalizeStatus(
        record.STATUS
      ),

    checkInAt:
      checkIn
        ? checkIn.toISOString()
        : null,

    checkOutAt:
      checkOut
        ? checkOut.toISOString()
        : null,

    checkInDisplay:
      checkIn
        ? _attendanceFormatDateTime(
            checkIn,
            timezone
          )
        : '',

    checkOutDisplay:
      checkOut
        ? _attendanceFormatDateTime(
            checkOut,
            timezone
          )
        : '',

    timezone:
      timezone,

    timezoneLabel:
      zoneLabel,

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
      ),

    workingMinutes:
      Number(
        record.WORKING_MINUTES || 0
      ),

    overtimeMinutes:
      Number(
        record.OVERTIME_MINUTES || 0
      ),

    remark:
      String(
        record.REMARK || ''
      )

  };
}


/* ============================================================
 * DATE / TIME
 * ============================================================ */

function _attendanceFormatDateTime(
  date,
  timezone
) {

  return Utilities.formatDate(
    date,
    timezone ||
      ATTENDANCE_DEFAULT_TIMEZONE,
    'dd/MM/yyyy HH:mm:ss'
  );
}


function _attendanceNormalizeWorkDate(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '';
  }


  if (
    Object.prototype.toString.call(
      value
    ) === '[object Date]'
  ) {

    return Utilities.formatDate(
      value,
      ATTENDANCE_DEFAULT_TIMEZONE,
      'yyyy-MM-dd'
    );
  }


  const text =
    String(
      value
    ).trim();


  /*
   * yyyy-MM-dd
   */
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {

    return text;
  }


  /*
   * Date object represented as string.
   */
  const parsed =
    new Date(text);


  if (
    !isNaN(
      parsed.getTime()
    )
  ) {

    return Utilities.formatDate(
      parsed,
      ATTENDANCE_DEFAULT_TIMEZONE,
      'yyyy-MM-dd'
    );
  }


  return text;
}


function _attendanceGetPreviousDate(
  workDate
) {

  const date =
    new Date(
      workDate +
      'T00:00:00'
    );


  date.setDate(
    date.getDate() - 1
  );


  return Utilities.formatDate(
    date,
    'UTC',
    'yyyy-MM-dd'
  );
}


function _attendanceToDate(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }


  if (
    Object.prototype.toString.call(
      value
    ) === '[object Date]'
  ) {

    if (
      isNaN(
        value.getTime()
      )
    ) {
      return null;
    }

    return value;
  }


  const parsed =
    new Date(value);


  if (
    isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }


  return parsed;
}


/* ============================================================
 * CALCULATION
 * ============================================================ */

function _attendanceCalculateWorkingMinutes(
  checkIn,
  checkOut
) {

  const diff =
    checkOut.getTime() -
    checkIn.getTime();


  if (
    diff <= 0
  ) {
    return 0;
  }


  return Math.floor(
    diff /
    60000
  );
}


/* ============================================================
 * STATUS
 * ============================================================ */

function _attendanceNormalizeStatus(
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
    ATTENDANCE_STATUS_OPEN
  ) {
    return ATTENDANCE_STATUS_OPEN;
  }


  if (
    value ===
    ATTENDANCE_STATUS_CLOSED
  ) {
    return ATTENDANCE_STATUS_CLOSED;
  }


  if (!value) {
    return '';
  }


  return value;
}


/* ============================================================
 * ID
 * ============================================================ */

function _attendanceGenerateId(
  employeeId,
  date
) {

  const timestamp =
    Utilities.formatDate(
      date,
      'UTC',
      'yyyyMMddHHmmss'
    );


  const random =
    Math.floor(
      Math.random() *
      1000
    )
      .toString()
      .padStart(
        3,
        '0'
      );


  return (
    'ATT-' +
    employeeId +
    '-' +
    timestamp +
    '-' +
    random
  );
}
