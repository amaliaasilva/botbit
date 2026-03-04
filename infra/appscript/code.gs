/**
 * Webhook para receber alertas do backend e enviar email.
 *
 * Script Properties esperadas:
 * - ALERT_WEBHOOK_TOKEN: token compartilhado com backend
 * - ENABLE_SHEET_LOG: "true" ou "false" (opcional)
 * - ALERT_SHEET_ID: id da planilha (opcional)
 * - ALLOWED_IPS: CSV de IPs permitidos (opcional, best-effort)
 */

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Body ausente');
  }
  return JSON.parse(e.postData.contents);
}

function getClientIp_(e) {
  if (!e || !e.parameter) return '';
  return e.parameter.ip || '';
}

function isAllowedIp_(e, props) {
  var allowedIps = (props.getProperty('ALLOWED_IPS') || '').trim();
  if (!allowedIps) return true;
  var ip = getClientIp_(e);
  if (!ip) return false;
  var list = allowedIps.split(',').map(function(item) { return item.trim(); });
  return list.indexOf(ip) >= 0;
}

function appendSheetLog_(subject, toEmail, message, payload) {
  var props = PropertiesService.getScriptProperties();
  var enabled = (props.getProperty('ENABLE_SHEET_LOG') || 'false').toLowerCase() === 'true';
  if (!enabled) return;

  var sheetId = props.getProperty('ALERT_SHEET_ID');
  if (!sheetId) return;

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName('alerts_log') || ss.insertSheet('alerts_log');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['ts', 'toEmail', 'subject', 'message', 'payload']);
  }
  sheet.appendRow([
    new Date(),
    toEmail,
    subject,
    message,
    JSON.stringify(payload || {}),
  ]);
}

/**
 * GET de diagnóstico — retorna info do token sem expô-lo.
 * Para testar se o token está certo:
 *   GET <URL_DO_APPSCRIPT>?token=SEU_TOKEN
 * Retorna { ok: true/false, match: true/false, storedLen, providedLen }
 */
function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var stored = (props.getProperty('ALERT_WEBHOOK_TOKEN') || '').trim();
  var provided = ((e && e.parameter && e.parameter.token) || '').trim();

  if (provided) {
    return jsonResponse({
      ok: provided === stored,
      match: provided === stored,
      storedLen: stored.length,
      providedLen: provided.length,
    });
  }

  return jsonResponse({
    ok: true,
    service: 'botbit-appscript',
    tokenConfigured: stored.length > 0,
    tokenLen: stored.length,
  });
}

function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  try {
    if (!isAllowedIp_(e, props)) {
      return jsonResponse({ ok: false, error: 'ip_not_allowed' });
    }

    var body = parseBody_(e);
    var expectedToken = (props.getProperty('ALERT_WEBHOOK_TOKEN') || '').trim();
    var receivedToken = (body.token || '').trim();

    if (!expectedToken || receivedToken !== expectedToken) {
      return jsonResponse({
        ok: false,
        error: 'unauthorized',
        debug_stored_len: expectedToken.length,
        debug_received_len: receivedToken.length,
      });
    }

    var toEmail = body.toEmail;
    var subject = body.subject || '[Market AI] Alerta';
    var message = body.message || 'Alerta sem mensagem';
    var payload = body.payload || {};

    if (!toEmail) {
      return jsonResponse({ ok: false, error: 'toEmail_required' });
    }

    MailApp.sendEmail(toEmail, subject, message);
    appendSheetLog_(subject, toEmail, message, payload);

    return jsonResponse({ ok: true, sentTo: toEmail });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}
