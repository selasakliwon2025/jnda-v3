/**
 * ============================================================
 * JNDA V3 - SESSION SERVICE
 * File    : SVC_Session.gs
 * Version : V3
 * ============================================================
 *
 * Tanggung jawab:
 * - Membuat session
 * - Membaca session
 * - Validasi session
 * - Memperbarui aktivitas session
 * - Menghapus session
 *
 * Catatan:
 * Session disimpan di CacheService.
 * Browser hanya akan menerima session token.
 * Data user/role/permission tidak dipercaya dari client.
 * ============================================================
 */


/**
 * Prefix untuk semua session JNDA.
 */
const SESSION_PREFIX = 'JNDA_SESSION_';


/**
 * Membuat session baru.
 *
 * @param {Object} userData
 * @return {Object}
 */
function createSession(userData) {

  if (!userData || !userData.userId) {
    throw new Error('Data user tidak valid untuk membuat session.');
  }


  // Buat token acak.
  const token = Utilities.getUuid();


  // Waktu session.
  const now = new Date();


  const expiresAt = new Date(
    now.getTime() +
    (getConfig('SESSION_TIMEOUT_MINUTES') * 60 * 1000)
  );


  const sessionData = {

    token: token,

    userId: String(userData.userId),

    createdAt: now.toISOString(),

    lastActivityAt: now.toISOString(),

    expiresAt: expiresAt.toISOString()
  };


  const cache = CacheService.getScriptCache();


  cache.put(
    SESSION_PREFIX + token,
    JSON.stringify(sessionData),
    getSessionCacheSeconds()
  );


  return {

    success: true,

    token: token,

    expiresAt: sessionData.expiresAt
  };
}


/**
 * Mengambil session berdasarkan token.
 *
 * @param {String} token
 * @return {Object|null}
 */
function getSession(token) {

  if (!token) {
    return null;
  }


  const cache = CacheService.getScriptCache();

  const raw = cache.get(
    SESSION_PREFIX + token
  );


  if (!raw) {
    return null;
  }


  try {

    return JSON.parse(raw);

  } catch (error) {

    console.error(
      'Session JSON tidak valid:',
      error
    );

    return null;
  }
}


/**
 * Memvalidasi session.
 *
 * @param {String} token
 * @return {Object}
 */
function validateSession(token) {

  const session = getSession(token);


  if (!session) {

    return {
      valid: false,
      reason: 'SESSION_NOT_FOUND'
    };
  }


  const now = new Date();

  const expiresAt = new Date(
    session.expiresAt
  );


  if (now.getTime() >= expiresAt.getTime()) {

    destroySession(token);

    return {
      valid: false,
      reason: 'SESSION_EXPIRED'
    };
  }


  return {

    valid: true,

    session: session
  };
}


/**
 * Memperbarui aktivitas session.
 *
 * Session akan diperpanjang selama masih valid.
 *
 * @param {String} token
 * @return {Object}
 */
function refreshSession(token) {

  const result = validateSession(token);


  if (!result.valid) {
    return result;
  }


  const session = result.session;

  const now = new Date();


  const expiresAt = new Date(
    now.getTime() +
    (getConfig('SESSION_TIMEOUT_MINUTES') * 60 * 1000)
  );


  session.lastActivityAt = now.toISOString();

  session.expiresAt = expiresAt.toISOString();


  CacheService
    .getScriptCache()
    .put(
      SESSION_PREFIX + token,
      JSON.stringify(session),
      getSessionCacheSeconds()
    );


  return {

    valid: true,

    session: session
  };
}


/**
 * Menghapus session.
 *
 * @param {String} token
 */
function destroySession(token) {

  if (!token) {
    return;
  }


  CacheService
    .getScriptCache()
    .remove(
      SESSION_PREFIX + token
    );
}


/**
 * Memastikan user sudah login.
 *
 * Fungsi ini akan banyak digunakan
 * oleh service lain.
 *
 * @param {String} token
 * @return {Object}
 */
function requireLogin(token) {

  const result = validateSession(token);


  if (!result.valid) {

    throw new Error(
      'Session tidak valid. Silakan login kembali.'
    );
  }


  return result.session;
}


/**
 * Menghitung TTL CacheService.
 *
 * CacheService maksimal sekitar 6 jam untuk
 * penyimpanan cache individual.
 *
 * Karena timeout kita 8 jam, TTL cache dibatasi.
 *
 * Session sebenarnya nanti dapat kita tingkatkan
 * menggunakan mekanisme penyimpanan session yang
 * lebih persisten.
 */
function getSessionCacheSeconds() {

  const timeoutMinutes =
    Number(
      getConfig('SESSION_TIMEOUT_MINUTES')
    );


  const seconds =
    timeoutMinutes * 60;


  // Maksimum praktis CacheService.
  return Math.min(seconds, 21600);
}

/**
 * ============================================================
 * TEST SESSION
 * Hanya untuk development.
 * Nanti akan dihapus setelah authentication selesai.
 * ============================================================
 */
function testSession() {

  const testUser = {

    userId: 'TEST-USER-001'
  };


  // Buat session.
  const created =
    createSession(testUser);


  console.log(
    'SESSION CREATED:',
    created
  );


  // Validasi session.
  const validated =
    validateSession(created.token);


  console.log(
    'SESSION VALIDATED:',
    validated
  );


  // Refresh session.
  const refreshed =
    refreshSession(created.token);


  console.log(
    'SESSION REFRESHED:',
    refreshed
  );


  // Hapus session.
  destroySession(created.token);


  // Cek setelah dihapus.
  const afterDestroy =
    validateSession(created.token);


  console.log(
    'SESSION AFTER DESTROY:',
    afterDestroy
  );


  return {

    created: created,

    validated: validated,

    refreshed: refreshed,

    afterDestroy: afterDestroy
  };
}
