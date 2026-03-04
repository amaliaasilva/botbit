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
  var symbol = (payload && payload.symbol) || '';
  var mode = (payload && payload.mode) || '';
  var price = (payload && payload.price) ? 'U$ ' + parseFloat(payload.price).toFixed(4) : '';
  var score = (payload && payload.score != null) ? payload.score : '';
  var regime = (payload && payload.regime) || '';
  var signal = (payload && payload.signal) || '';
  var orderId = (payload && payload.orderId) || '';
  var reason = (payload && payload.reason) || '';
  var rsi = (payload && payload.rsi14) ? parseFloat(payload.rsi14).toFixed(1) : '';
  var stop = (payload && payload.stopPrice) ? 'U$ ' + parseFloat(payload.stopPrice).toFixed(4) : '';
  var take = (payload && payload.takePrice) ? 'U$ ' + parseFloat(payload.takePrice).toFixed(4) : '';
  var lastPrice = (payload && payload.lastPrice) ? 'U$ ' + parseFloat(payload.lastPrice).toFixed(4) : '';
  var qty = (payload && payload.qty) ? payload.qty : '';
  var action = (payload && payload.action_items) || '';

  // Cor e ícone por evento
  var colorMap = {
    'BUY':              '#16a34a',
    'TRADE_EXECUTED':   '#16a34a',
    'NEAR_ENTRY':       '#b45309',
    'SCORE_JUMP':       '#2563eb',
    'REGIME_CHANGE':    '#7c3aed',
    'POSITION_EXIT':    '#ea580c',
    'STOP_HIT':         '#dc2626',
    'TAKE_HIT':         '#16a34a',
    'FAILSAFE':         '#dc2626',
    'DISARM':           '#dc2626',
    'TEST_ALERT':       '#6b7280',
  };
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

  // Títulos e descrições em português por evento
  var titleMap = {
    'BUY':            'Sinal de Compra Detectado',
    'TRADE_EXECUTED': mode === 'PAPER' ? 'Compra Simulada Executada (Paper)' : 'Ordem de Compra Executada',
    'NEAR_ENTRY':     'Ativo Próximo de Sinal de Compra',
    'SCORE_JUMP':     'Score com Alta Expressiva',
    'REGIME_CHANGE':  'Mudança de Regime de Mercado',
    'POSITION_EXIT':  'Posição Encerrada',
    'STOP_HIT':       'Stop Loss Acionado',
    'TAKE_HIT':       'Take Profit Atingido 🎉',
    'FAILSAFE':       'ALERTA: Trading Desarmado Automaticamente',
    'DISARM':         'ALERTA: Trading Desarmado',
    'TEST_ALERT':     'Notificação de Teste — BotBit',
  };

  var descMap = {
    'BUY':            'O modelo identificou um sinal de <strong>COMPRA</strong> para ' + (symbol || 'o ativo') + '. Todos os indicadores estão alinhados para uma entrada.',
    'TRADE_EXECUTED': 'Uma ordem de compra foi ' + (mode === 'PAPER' ? 'simulada' : 'enviada à Binance') + ' para <strong>' + (symbol || 'o ativo') + '</strong>.',
    'NEAR_ENTRY':     '<strong>' + (symbol || 'O ativo') + '</strong> está se aproximando de uma oportunidade de compra. Ainda não é sinal BUY, mas vale monitorar.',
    'SCORE_JUMP':     'O score de <strong>' + (symbol || 'o ativo') + '</strong> subiu significativamente, indicando melhora nos indicadores técnicos.',
    'REGIME_CHANGE':  'Houve uma alteração no regime de mercado de <strong>' + (symbol || 'o ativo') + '</strong>. Isso pode impactar posições abertas e novas entradas.',
    'POSITION_EXIT':  'A posição em <strong>' + (symbol || 'o ativo') + '</strong> foi encerrada' + (reason ? ' — motivo: ' + reasonLabel_(reason) : '') + '.',
    'STOP_HIT':       '<strong>Stop loss acionado</strong> para ' + (symbol || 'o ativo') + '. A posição foi encerrada para limitar perdas conforme configurado.',
    'TAKE_HIT':       '<strong>Take profit atingido</strong> para ' + (symbol || 'o ativo') + '. A posição foi encerrada com lucro!',
    'FAILSAFE':       'O trading foi <strong>desarmado automaticamente</strong> por segurança. Verifique o painel e rearme manualmente após resolver o problema.',
    'DISARM':         'O trading foi desarmado. Verifique o painel de configurações.',
    'TEST_ALERT':     'Este é um email de teste do BotBit. As notificações estão funcionando corretamente! ✅',
  };

  var headerColor = colorMap[event] || '#1e293b';
  var icon = iconMap[event] || '📊';
  var titleText = titleMap[event] || subject;
  var descText = descMap[event] || message;

  // Tabela de detalhes técnicos
  var details = [];
  if (symbol)    details.push(['Ativo', symbol]);
  if (signal)    details.push(['Sinal', signal]);
  if (regime)    details.push(['Regime', regime]);
  if (score !== '') details.push(['Score', score + ' / 100']);
  if (price)     details.push(['Preço de entrada', price]);
  if (lastPrice) details.push(['Último preço', lastPrice]);
  if (stop)      details.push(['Stop loss', stop]);
  if (take)      details.push(['Take profit', take]);
  if (qty)       details.push(['Quantidade', qty]);
  if (rsi)       details.push(['RSI (14)', rsi]);
  if (orderId)   details.push(['ID da ordem', orderId]);
  if (mode)      details.push(['Modo', mode === 'PAPER' ? '📋 Simulado (Paper)' : '🔴 LIVE']);
  if (reason)    details.push(['Motivo saída', reasonLabel_(reason)]);

  var rows = '';
  for (var i = 0; i < details.length; i++) {
    var bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
    rows += '<tr style="background:' + bg + ';">'
          + '<td style="padding:8px 12px;color:#64748b;font-size:13px;width:45%;">' + details[i][0] + '</td>'
          + '<td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1e293b;">' + details[i][1] + '</td>'
          + '</tr>';
  }
  var detailsBlock = rows
    ? '<table style="width:100%;border-collapse:collapse;margin-top:16px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">' + rows + '</table>'
    : '';

  var actionBlock = action
    ? '<div style="margin-top:16px;padding:12px 16px;background:#fef9c3;border-left:4px solid #eab308;border-radius:4px;font-size:13px;color:#713f12;">👉 <strong>O que fazer:</strong> ' + action + '</div>'
    : '';

  var modeTag = mode === 'PAPER'
    ? '<span style="background:#dbeafe;color:#1d4ed8;font-size:11px;padding:2px 8px;border-radius:12px;margin-left:8px;">PAPER</span>'
    : (mode === 'LIVE' ? '<span style="background:#fee2e2;color:#dc2626;font-size:11px;padding:2px 8px;border-radius:12px;margin-left:8px;">LIVE</span>' : '');

  return '<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">'
    + '<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.1);">'

    // Cabeçalho colorido
    + '<div style="background:' + headerColor + ';padding:24px 28px;">'
    + '<div style="font-size:24px;font-weight:700;color:#fff;line-height:1.3;">' + icon + ' ' + titleText + modeTag + '</div>'
    + (symbol ? '<div style="color:rgba(255,255,255,.8);font-size:14px;margin-top:4px;">Ativo: ' + symbol + '</div>' : '')
    + '</div>'

    // Corpo
    + '<div style="padding:24px 28px;">'
    + '<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">' + descText + '</p>'
    + detailsBlock
    + actionBlock
    + '</div>'

    // Rodapé
    + '<div style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between;">'
    + '<span>🤖 BotBit — Plataforma de Trading Automatizado</span>'
    + '<span>' + new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) + '</span>'
    + '</div>'

    + '</div></body></html>';
}

function reasonLabel_(reason) {
  var labels = {
    'stop_hit':        'Stop loss acionado',
    'take_hit':        'Take profit atingido',
    'regime_or_signal_exit': 'Mudança de regime/sinal',
    'manual':          'Encerramento manual',
    'failsafe':        'Mecanismo de segurança',
    'BINANCE_451':     'Bloqueio Binance (451)',
  };
  return labels[reason] || reason;
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
