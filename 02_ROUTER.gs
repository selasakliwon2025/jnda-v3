/**
 * ============================================================
 * JNDA V3 - ROUTER
 * File    : 02_ROUTER.gs
 * Version : V3
 * ============================================================
 */


/**
 * Entry point Web App GAS.
 */
function doGet(e) {

  const page = getRequestedPage(e);

  return renderPage(page);
}


/**
 * Menentukan halaman berdasarkan parameter.
 *
 * Contoh:
 *
 * ?page=login
 * ?page=dashboard
 * ?page=history
 */
function getRequestedPage(e) {

  if (!e || !e.parameter) {
    return 'PAGE_Login';
  }

  const requestedPage = String(
    e.parameter.page || 'login'
  ).trim().toLowerCase();


  const routes = {

    login: 'PAGE_Login',

    dashboard: 'PAGE_Dashboard',

    history: 'PAGE_History',

    leave: 'PAGE_Leave',

    correction: 'PAGE_Correction',

    profile: 'PAGE_Profile',

    report: 'PAGE_Report',

    admin: 'PAGE_Admin'
  };


  return routes[requestedPage] || 'PAGE_Login';
}


/**
 * Render halaman.
 */
function renderPage(pageName) {

  try {

    const template = HtmlService
      .createTemplateFromFile(pageName);

    template.APP = getAppInfo();

    // URL utama Web App
    template.WEB_APP_URL =
      ScriptApp.getService().getUrl();

    return template
      .evaluate()
      .setTitle(getAppName())
      .setXFrameOptionsMode(
        HtmlService.XFrameOptionsMode.ALLOWALL
      );

  } catch (error) {

    console.error(
      'Gagal render page: ' + pageName,
      error
    );

    return renderErrorPage(error);
  }
}


/**
 * Render error sederhana.
 */
function renderErrorPage(error) {

  const message = error && error.message
    ? error.message
    : 'Terjadi kesalahan pada aplikasi.';

  return HtmlService
    .createHtmlOutput(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>JNDA Error</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            background: #f8fafc;
            color: #1e293b;
          }

          .error {
            max-width: 600px;
            margin: 60px auto;
            background: white;
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,.08);
          }

          h1 {
            margin-top: 0;
          }
        </style>
      </head>

      <body>

        <div class="error">
          <h1>JNDA</h1>
          <p>
            Halaman tidak dapat ditampilkan.
          </p>

          <small>
            ${escapeHtml(message)}
          </small>
        </div>

      </body>
      </html>
    `)
    .setTitle('JNDA Error');
}


/**
 * Escape HTML untuk pesan error.
 */
function escapeHtml(value) {

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}