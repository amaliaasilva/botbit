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

function buildHtmlEmail_(subject, message, payload) {
  var event = (payload && payload.event) || (payload && payload.type) || '';

  // Cor do cabeçalho por tipo de evento
  var colorMap = {
    'BUY':              '#16a34a',  // verde
    'TRADE_EXECUTED':   '#16a34a',
    'NEAR_ENTRY':       '#d97706',  // amarelo
    'SCORE_JUMP':       '#2563eb',  // azul
    'REGIME_CHANGE':    '#7c3aed',  // roxo
    'POSITION_EXIT':    '#ea580c',  // laranja
    'STOP_HIT':         '#dc2626',  // vermelho
    'TAKE_HIT':         '#16a34a',  // verde
    'FAILSAFE':         '#dc2626',
    'DISARM':           '#dc2626',
    'TEST_ALERT':       '#6b7280',  // cinza
  };
  var headerColor = colorMap[event] || '#1e293b';

  // Ícone por tipo
  var iconMap = {
    'BUY':              '🟢',
    'TRADE_EXECUTED':   '✅',
    'NEAR_ENTRY':       '🟡',
    'SCORE_JUMP':       '📈',
    'REGIME_CHANGE':    '🔄',
    'POSITION_EXIT':    '🚪',
    'STOP_HIT':         '🛑',
    'TAKE_HIT':         '🎯',
    'FAILSAFE':         '🚨',
    'DISARM':           '🚨',
    'TEST_ALERT':       '🔔',
  };
  var icon = iconMap[event] || '📊';

  // Linhas de detalhe do payload
  var skipKeys = {'token': 1, 'test': 1, 'action_items': 1, 'explanation': 1, 'summary_leigo': 1};
  var rows = '';
  if (payload) {
    Object.keys(payload).forEach(function(k) {
      if (skipKeys[k]) return;
      var v = payload[k];
      if (v === null || v === undefined || v === '') return;
      rows += '<tr><td style="padding:4px 8px;color:#64748b;font-size:13px;">' + k + '</td>'
            + '<td style="padding:4px 8px;font-size:13px;font-weight:600;">' + v + '</td></tr>';
    });
  }
  var detailsBlock = rows
    ? '<table style="width:100%;border-collapse:collapse;margin-top:12px;">' + rows + '</table>'
    : '';

  var actionItems = (payload && payload.action_items) ? payload.action_items : '';
  var actionBlock = actionItems
    ? '<div style="margin-top:16px;padding:10px 14px;background:#fef9c3;border-left:4px solid #eab308;border-radius:4px;font-size:13px;">👉 ' + actionItems + '</div>'
    : '';

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">'
    + '<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">'
    + '<div style="background:' + headerColor + ';padding:20px 24px;">'
    + '<div style="font-size:22px;font-weight:700;color:#fff;">' + icon + ' ' + subject + '</div>'
    + '</div>'
    + '<div style="padding:20px 24px;">'
    + '<p style="margin:0 0 12px;font-size:15px;color:#1e293b;">' + message.replace(/\n/g, '<br>') + '</p>'
    + detailsBlock
    + actionBlock
    + '</div>'
    + '<div style="padding:12px 24px;background:#f8fafc;font-size:11px;color:#94a3b8;text-align:center;">'
    + 'BotBit &bull; ' + new Date().toLocaleString('pt-BR') + '</div>'
    + '</div></body></html>';
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

    var htmlBody = buildHtmlEmail_(subject, message, payload);
    MailApp.sendEmail({
      to: toEmail,
      subject: subject,
      body: message,          // fallback texto puro
      htmlBody: htmlBody,
    });
    appendSheetLog_(subject, toEmail, message, payload);

    return jsonResponse({ ok: true, sentTo: toEmail });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}
