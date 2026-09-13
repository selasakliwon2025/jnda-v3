/**
 * ============================================================
 * JNDA V3 - AUTHENTICATION SERVICE
 * File    : SVC_Auth.gs
 * Version : V3
 * ============================================================
 *
 * Tanggung jawab:
 * - Login
 * - Validasi username
 * - Validasi password
 * - Mengambil user dari SYS_User
 * - Membuat session
 * - Logout
 *
 * Tidak menangani:
 * - GPS
 * - Attendance
 * - Report
 * - Permission detail
 * ============================================================
 */


/**
 * ============================================================
 * LOGIN
 * ============================================================
 *
 * @param {String} username
 * @param {String} password
 * @return {Object}
 */
function login(username, password) {

  username = normalizeUsername(username);


  if (!username) {

    return {
      success: false,
      code: 'USERNAME_REQUIRED',
      message: 'Username wajib diisi.'
    };
  }


  if (!password) {

    return {
      success: false,
      code: 'PASSWORD_REQUIRED',
      message: 'Password wajib diisi.'
    };
  }


  try {

    const user =
      findUserByUsername(username);


    if (!user) {

      return {
        success: false,
        code: 'INVALID_LOGIN',
        message: 'Username atau password salah.'
      };
    }


    // --------------------------------------------------------
    // STATUS USER
    // --------------------------------------------------------

    if (
      String(user.STATUS || '')
        .toUpperCase() !== 'ACTIVE'
    ) {

      return {
        success: false,
        code: 'USER_INACTIVE',
        message: 'Akun Anda tidak aktif.'
      };
    }


    // --------------------------------------------------------
    // PASSWORD
    // --------------------------------------------------------

    const passwordValid =
    verifyPassword(
      password,
      user.PASSWORD_HASH
    );


    if (!passwordValid) {

      return {
        success: false,
        code: 'INVALID_LOGIN',
        message: 'Username atau password salah.'
      };
    }


    // --------------------------------------------------------
    // BUAT SESSION
    // --------------------------------------------------------

    const session =
      createSession({

        userId: user.USER_ID
      });


    // --------------------------------------------------------
    // UPDATE LAST LOGIN
    // --------------------------------------------------------

    updateLastLogin(
      user.USER_ID
    );


    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return {

      success: true,

      code: 'LOGIN_SUCCESS',

      message: 'Login berhasil.',

      sessionToken: session.token,

      expiresAt: session.expiresAt,

      user: {

        userId: user.USER_ID,

        employeeId: user.EMPLOYEE_ID,

        username: user.USERNAME
      }
    };


  } catch (error) {

    console.error(
      'Login error:',
      error
    );


    return {

      success: false,

      code: 'AUTH_ERROR',

      message:
        'Terjadi kesalahan saat proses login.'
    };
  }
}


/**
 * ============================================================
 * FIND USER
 * ============================================================
 *
 * Mencari user berdasarkan username.
 *
 * @param {String} username
 * @return {Object|null}
 */
function findUserByUsername(username) {

  const sheet =
    getUserSheet();


  const values =
    sheet.getDataRange().getValues();


  if (!values || values.length < 2) {
    return null;
  }


  const headers =
    values[0].map(function(header) {

      return String(header)
        .trim()
        .toUpperCase();

    });


  const usernameIndex =
    headers.indexOf('USERNAME');


  if (usernameIndex === -1) {

    throw new Error(
      'Kolom USERNAME tidak ditemukan di SYS_User.'
    );
  }


  for (let i = 1; i < values.length; i++) {

    const row =
      values[i];


    const rowUsername =
      normalizeUsername(
        row[usernameIndex]
      );


    if (rowUsername !== username) {
      continue;
    }


    return rowToObject(
      headers,
      row
    );
  }


  return null;
}


/**
 * ============================================================
 * GET USER SHEET
 * ============================================================
 */
function getUserSheet() {

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


  const sheet =
    spreadsheet.getSheetByName(
      getConfig('USER_SHEET_NAME')
    );


  if (!sheet) {

    throw new Error(
      'Sheet SYS_User tidak ditemukan.'
    );
  }


  return sheet;
}


/**
 * ============================================================
 * PASSWORD VERIFICATION
 * ============================================================
 *
 * V3 menggunakan SHA-256.
 *
 * Password plaintext TIDAK digunakan sebagai
 * mekanisme autentikasi produksi.
 * ============================================================
 */
function verifyPassword(password, storedPassword) {

  if (
    password === null ||
    password === undefined ||
    storedPassword === null ||
    storedPassword === undefined
  ) {

    return false;
  }


  const hash =
    hashPassword(
      String(password)
    );


  return (
    hash.toLowerCase() ===
    String(storedPassword)
      .trim()
      .toLowerCase()
  );
}


/**
 * ============================================================
 * HASH PASSWORD
 * ============================================================
 */
function hashPassword(password) {

  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      password,
      Utilities.Charset.UTF_8
    );


  return digest
    .map(function(byte) {

      const value =
        byte < 0
          ? byte + 256
          : byte;

      return (
        value
          .toString(16)
          .padStart(2, '0')
      );

    })
    .join('');
}


/**
 * ============================================================
 * NORMALIZE USERNAME
 * ============================================================
 */
function normalizeUsername(username) {

  if (
    username === null ||
    username === undefined
  ) {
    return '';
  }


  return String(username)
    .trim()
    .toLowerCase();
}


/**
 * ============================================================
 * ROW TO OBJECT
 * ============================================================
 */
function rowToObject(headers, row) {

  const result = {};


  headers.forEach(function(header, index) {

    result[header] =
      row[index];

  });


  return result;
}


/**
 * ============================================================
 * UPDATE LAST LOGIN
 * ============================================================
 */
function updateLastLogin(userId) {

  const sheet =
    getUserSheet();


  const values =
    sheet.getDataRange().getValues();


  if (!values || values.length < 2) {
    return false;
  }


  const headers =
    values[0].map(function(header) {

      return String(header)
        .trim()
        .toUpperCase();

    });


  const userIdIndex =
    headers.indexOf('USER_ID');


  const lastLoginIndex =
    headers.indexOf('LAST_LOGIN');


  if (
    userIdIndex === -1 ||
    lastLoginIndex === -1
  ) {

    return false;
  }


  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    if (
      String(values[i][userIdIndex])
        .trim() !==
      String(userId).trim()
    ) {
      continue;
    }


    sheet
      .getRange(
        i + 1,
        lastLoginIndex + 1
      )
      .setValue(
        new Date()
      );


    return true;
  }


  return false;
}

function testPasswordHash() {

  const password =
    '123456';


  const hash =
    hashPassword(password);


  console.log(
    'PASSWORD:',
    password
  );


  console.log(
    'SHA256:',
    hash
  );


  console.log(
    'VERIFY:',
    verifyPassword(
      password,
      hash
    )
  );


  console.log(
    'VERIFY WRONG:',
    verifyPassword(
      '654321',
      hash
    )
  );


  return {

    password: password,

    hash: hash,

    verifyCorrect:
      verifyPassword(
        password,
        hash
      ),

    verifyWrong:
      verifyPassword(
        '654321',
        hash
      )
  };
}

/**
 * ============================================================
 * TEST DATABASE CONNECTION
 * Development only.
 * ============================================================
 */
function testDatabaseConnection() {

  try {

    const spreadsheetId =
      getConfig('DATABASE_SPREADSHEET_ID');

    const spreadsheet =
      SpreadsheetApp.openById(spreadsheetId);

    const spreadsheetName =
      spreadsheet.getName();

    const userSheet =
      spreadsheet.getSheetByName(
        getConfig('USER_SHEET_NAME')
      );

    const employeeSheet =
      spreadsheet.getSheetByName(
        getConfig('EMPLOYEE_SHEET_NAME')
      );


    if (!userSheet) {

      throw new Error(
        'Sheet SYS_User tidak ditemukan.'
      );
    }


    if (!employeeSheet) {

      throw new Error(
        'Sheet HR_Employee tidak ditemukan.'
      );
    }


    const userLastRow =
      userSheet.getLastRow();

    const userLastColumn =
      userSheet.getLastColumn();

    const employeeLastRow =
      employeeSheet.getLastRow();

    const employeeLastColumn =
      employeeSheet.getLastColumn();


    const result = {

      success: true,

      spreadsheetName:
        spreadsheetName,

      spreadsheetId:
        spreadsheetId,

      userSheet: {

        name: userSheet.getName(),

        rows: userLastRow,

        columns: userLastColumn
      },

      employeeSheet: {

        name: employeeSheet.getName(),

        rows: employeeLastRow,

        columns: employeeLastColumn
      }
    };


    console.log(
      'DATABASE CONNECTION:',
      result
    );


    return result;


  } catch (error) {

    console.error(
      'DATABASE CONNECTION ERROR:',
      error
    );


    return {

      success: false,

      message:
        error.message
    };
  }
}

/**
 * ============================================================
 * TEST DATABASE STRUCTURE
 * Development only.
 * ============================================================
 */
function testDatabaseStructure() {

  try {

    const spreadsheet = SpreadsheetApp.openById(
      getConfig('DATABASE_SPREADSHEET_ID')
    );

    const userSheet = spreadsheet.getSheetByName(
      getConfig('USER_SHEET_NAME')
    );

    const employeeSheet = spreadsheet.getSheetByName(
      getConfig('EMPLOYEE_SHEET_NAME')
    );


    const userHeaders = userSheet
      .getRange(
        1,
        1,
        1,
        userSheet.getLastColumn()
      )
      .getValues()[0]
      .map(function(value) {
        return String(value).trim();
      });


    const employeeHeaders = employeeSheet
      .getRange(
        1,
        1,
        1,
        employeeSheet.getLastColumn()
      )
      .getValues()[0]
      .map(function(value) {
        return String(value).trim();
      });


    const result = {

      success: true,

      SYS_User: userHeaders,

      HR_Employee: employeeHeaders
    };


    console.log(
      'DATABASE STRUCTURE:',
      JSON.stringify(result, null, 2)
    );


    return result;


  } catch (error) {

    console.error(
      'DATABASE STRUCTURE ERROR:',
      error
    );


    return {

      success: false,

      message: error.message
    };
  }
}

function generateTestPasswordHash() {

  const password = 'JNDA123456';

  const hash = hashPassword(password);

  console.log('TEST PASSWORD:', password);
  console.log('PASSWORD_HASH:', hash);

  return hash;
}

/**
 * ============================================================
 * TEST ACCOUNT
 * Development only.
 *
 * Membuat 1 employee + 1 user untuk pengujian login V3.
 * ============================================================
 */
function createTestAccount() {

  const spreadsheet = SpreadsheetApp.openById(
    getConfig('DATABASE_SPREADSHEET_ID')
  );

  const userSheet = spreadsheet.getSheetByName(
    getConfig('USER_SHEET_NAME')
  );

  const employeeSheet = spreadsheet.getSheetByName(
    getConfig('EMPLOYEE_SHEET_NAME')
  );


  // ==========================================================
  // DATA TEST
  // ==========================================================

  const employeeId = 'EMP-TEST-001';
  const employeeNo = 'TEST001';
  const fullName = 'User Test JNDA';
  const username = 'test.jnda';

  const password = 'JNDA123456';

  const passwordHash =
    hashPassword(password);

  const userId = 'USR-TEST-001';


  // ==========================================================
  // CEK AGAR TIDAK DUPLIKAT
  // ==========================================================

  const existingUser =
    findUserByUsername(username);


  if (existingUser) {

    return {

      success: false,

      code: 'TEST_USER_EXISTS',

      message:
        'User test sudah ada: ' + username
    };
  }


  // ==========================================================
  // EMPLOYEE
  // ==========================================================

  employeeSheet.appendRow([

    employeeId,

    employeeNo,

    fullName,

    username,

    '', // BRANCH_ID

    '', // DEPARTMENT_ID

    '', // UNIT_ID

    '', // SUBUNIT_ID

    '', // POSITION_ID

    '', // SHIP_ID

    '', // ATTENDANCE_GROUP

    '', // POLICY_ID

    'ACTIVE',

    new Date(), // START_DATE

    '', // END_DATE

    new Date(), // CREATED_AT

    new Date()  // UPDATED_AT
  ]);


  // ==========================================================
  // USER
  // ==========================================================

  userSheet.appendRow([

    userId,

    employeeId,

    username,

    passwordHash,

    '', // ROLE_ID

    '', // EMAIL

    'ACTIVE',

    '', // LAST_LOGIN

    new Date(), // CREATED_AT

    new Date()  // UPDATED_AT
  ]);


  console.log(
    'TEST ACCOUNT CREATED:',
    username
  );


  return {

    success: true,

    userId: userId,

    employeeId: employeeId,

    username: username,

    password: password,

    passwordHash: passwordHash
  };
}

function testLogin() {

  const username = 'test.jnda';
  const password = 'JNDA123456';

  const result =
    login(
      username,
      password
    );

  console.log(
    'LOGIN RESULT:',
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}