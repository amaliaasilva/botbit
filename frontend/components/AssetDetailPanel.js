"use client";

import { useEffect, useState } from "react";
import IAExplainPanel from "./ui/IAExplainPanel";
import { fetchExplain } from "../lib/backend";
import { placeManualOrder } from "../lib/backend";

function metricValue(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(digits);
}

function friendlySignal(signal) {
  const value = String(signal || "WAIT").toUpperCase();
  if (value === "BUY") return "entrada possível (compra)";
  if (value === "SELL") return "saída / reduzir posição";
  return "aguardar melhor momento";
}

function friendlyRegime(regime) {
  const value = String(regime || "Neutro").toLowerCase();
  if (value === "alta" || value === "bullish") return "mercado em tendência de alta";
  if (value === "baixa" || value === "bearish") return "mercado em tendência de baixa";
  if (value === "lateral") return "mercado andando de lado, sem tendência definida";
  return "mercado sem direção clara (neutro)";
}

function scoreInterpret(score) {
  const n = Number(score || 0);
  if (n >= 75) return "excelente — condições muito favoráveis para o robô operar";
  if (n >= 55) return "bom — sinais positivos, mas o robô é criterioso";
  if (n >= 35) return "médio — abaixo do limiar padrão de operação";
  return "fraco — o robô aguarda melhorar antes de agir";
}

function rsiInterpret(rsi) {
  const n = Number(rsi || 0);
  if (n >= 70) return `sobrecomprado (${n.toFixed(1)}) — preço pode estar esticado, cuidado com reversão`;
  if (n <= 30) return `sobrevendido (${n.toFixed(1)}) — possível oportunidade de recuperação`;
  return `neutro (${n.toFixed(1)}) — sem extremo de compra ou venda`;
}

function volZInterpret(volZ) {
  const n = Number(volZ || 0);
  if (n >= 2) return "volume muito acima da média — movimento relevante, mais confiança";
  if (n >= 1) return "volume acima da média — sinal tende a ser mais confiável";
  if (n <= -0.5) return "volume abaixo da média — cuidado, movimento pode ser fraco";
  return "volume dentro do padrão";
}

function buildLeigoExplan({ symbol, market, discover, quote }) {
  const signal = friendlySignal(market?.signal);
  const regime = friendlyRegime(market?.regime);
  const score = Number(market?.score || 0);
  const rsi = Number(market?.rsi14 || 0);
  const potential = Number(discover?.potentialScore || 0);
  const volZ = Number(discover?.keyMetrics?.volume_z || 0);
  const corrBtc = Number(discover?.keyMetrics?.corr_btc || 0);
  const chg24 = quote?.change24hPct != null ? Number(quote.change24hPct) : null;

  const parts = [];

  // Linha 1: situação geral
  parts.push(
    `Neste momento, ${symbol} está com orientação de ${signal}, com ${regime}. ` +
    `A nota técnica (score) é ${score}/100, o que indica ${scoreInterpret(score)}.`
  );

  // Linha 2: RSI
  if (rsi > 0) {
    parts.push(`O RSI está ${rsiInterpret(rsi)}.`);
  }

  // Linha 3: volume (se disponível no discover)
  if (discover && volZ !== 0) {
    parts.push(`O volume está ${volZInterpret(volZ)}.`);
  }

  // Linha 4: correlação com BTC
  if (discover && Math.abs(corrBtc) >= 0.3) {
    const corrLabel = corrBtc >= 0.6
      ? "fortemente correlacionado com o Bitcoin (sobe e cai junto)"
      : corrBtc >= 0.3
        ? "moderadamente correlacionado com o Bitcoin"
        : "pouco correlacionado com o Bitcoin (comportamento mais independente)";
    parts.push(`Este ativo é ${corrLabel}.`);
  }

  // Linha 5: variação 24h
  if (chg24 != null) {
    const chgLabel = chg24 >= 0
      ? `subiu ${chg24.toFixed(2)}% nas últimas 24h`
      : `caiu ${Math.abs(chg24).toFixed(2)}% nas últimas 24h`;
    parts.push(`O preço ${chgLabel}.`);
  }

  // Linha 6: potencial score (discover)
  if (potential > 0) {
    const potLabel = potential >= 60
      ? "alto potencial de entrada segundo o scanner"
      : potential >= 35
        ? "potencial moderado segundo o scanner"
        : "potencial ainda baixo no scanner";
    parts.push(`O scanner Discover indica ${potLabel} (${potential}/100).`);
  }

  // Linha 7: conclusão operacional
  const signalUpper = String(market?.signal || "WAIT").toUpperCase();
  if (signalUpper === "BUY") {
    parts.push("Em resumo: o robô considera este ativo como candidato para entrada, mas só opera se o score estiver acima do limiar configurado.");
  } else if (signalUpper === "SELL") {
    parts.push("Em resumo: o robô indica saída ou redução de posição se houver alguma aberta para este ativo.");
  } else {
    parts.push("Em resumo: o robô está aguardando condições melhores antes de agir neste ativo.");
  }

  return parts;
}

function signalAction(signal) {
  const v = String(signal || "WAIT").toUpperCase();
  if (v === "BUY") return "O robô considera este ativo como candidato para entrada. Se o score estiver acima do limiar, pode operar.";
  if (v === "SELL") return "O robô indica saída ou redução de posição. Se houver posição aberta, avalie realizar lucro ou limitar perda.";
  return "Aguardar. As condições ainda não são ideais para operar. Não faça nada por enquanto.";
}

function signalClassV2(signal) {
  const v = String(signal || "WAIT").toUpperCase();
  if (v === "BUY") return "buy";
  if (v === "SELL" || v === "AVOID") return "avoid";
  return "wait";
}

function buildExplanLevels({ symbol, market, discover, quote }) {
  const signal = friendlySignal(market?.signal);
  const regime = friendlyRegime(market?.regime);
  const score = Number(market?.score || 0);
  const rsi = Number(market?.rsi14 || 0);
  const potential = Number(discover?.potentialScore || 0);
  const volZ = Number(discover?.keyMetrics?.volume_z || 0);
  const corrBtc = Number(discover?.keyMetrics?.corr_btc || 0);
  const chg24 = quote?.change24hPct != null ? Number(quote.change24hPct) : null;
  const atr = Number(market?.atr14 || 0);

  const leigo = [];
  leigo.push(
    `Neste momento, ${symbol} está com orientação de ${signal}, com ${regime}. A nota técnica (score) é ${score}/100, o que indica ${scoreInterpret(score)}.`
  );
  if (rsi > 0) leigo.push(`O RSI está ${rsiInterpret(rsi)}.`);
  if (discover && volZ !== 0) leigo.push(`O volume está ${volZInterpret(volZ)}.`);
  if (chg24 != null) {
    leigo.push(`O preço ${chg24 >= 0 ? `subiu ${chg24.toFixed(2)}%` : `caiu ${Math.abs(chg24).toFixed(2)}%`} nas últimas 24h.`);
  }

  const signalUpper = String(market?.signal || "WAIT").toUpperCase();
  const significado = signalUpper === "BUY"
    ? "Condições favoráveis para entrada — score alto e regime positivo."
    : signalUpper === "SELL"
    ? "Condições indicam saída — risco elevado ou reversão."
    : "Sem convicção para operar — melhor aguardar sinais mais claros.";

  const riscoPrincipal = rsi >= 70
    ? "RSI sobrecomprado — risco de reversão no curto prazo."
    : rsi <= 30
    ? "RSI sobrevendido — risco de queda adicional antes de recuperação."
    : atr > 0
    ? `Volatilidade (ATR): ${atr.toFixed(4)} — variação esperada no período.`
    : "Sem risco específico identificado no momento.";

  const condicaoMudar = signalUpper === "BUY"
    ? "Score cair abaixo de 45 ou regime mudar para baixa."
    : signalUpper === "SELL"
    ? "Score subir acima de 70 com regime de alta confirmado."
    : "Score subir acima de 60 com RSI fora da zona neutra.";

  const intermediario = [
    `Score: ${score}/100 (${scoreInterpret(score)}).`,
    `RSI(14): ${metricValue(rsi)} — ${rsiInterpret(rsi)}.`,
    `Regime: ${market?.regime || "N/A"} — ${regime}.`,
    atr > 0 ? `ATR(14): ${metricValue(atr, 4)} — mede a volatilidade média.` : null,
    discover ? `Potential Score: ${metricValue(potential, 0)}/100.` : null,
    discover && volZ !== 0 ? `Volume Z-Score: ${metricValue(volZ)} — ${volZInterpret(volZ)}.` : null,
  ].filter(Boolean).join(" ");

  const rawExplanation = market?.explanation || discover?.explanation || "";
  const tecnico = rawExplanation
    || `score=${metricValue(score, 0)}, regime=${market?.regime || "N/A"}, signal=${market?.signal || "WAIT"}, rsi14=${metricValue(rsi)}, atr14=${metricValue(atr, 4)}, potential=${metricValue(potential, 0)}, volZ=${metricValue(volZ)}`;

  return { leigo, intermediario, tecnico, significado, riscoPrincipal, condicaoMudar };
}

export default function AssetDetailPanel({ open, symbol, quote, market, discover, uid = "", mode = "PAPER", onClose }) {
  const [aiExplain, setAiExplain] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderMsg, setOrderMsg] = useState("");
  const [orderErr, setOrderErr] = useState("");
  const [confirmLive, setConfirmLive] = useState(false);

  async function handleOrder(side) {
    if (!uid) { setOrderErr("Você precisa estar autenticado para operar."); return; }
    if (mode === "LIVE" && !confirmLive) { setConfirmLive(true); return; }
    setOrderLoading(true); setOrderMsg(""); setOrderErr("");
    try {
      const res = await placeManualOrder({
        symbol, side,
        quoteQty: side === "BUY" ? 50 : undefined,
        confirm: mode === "LIVE",
      });
      setOrderMsg(`✅ ${side === "BUY" ? "Compra" : "Venda"} executada em ${mode} — @ ${Number(res.executedPrice || 0).toFixed(6)}`);
    } catch (e) {
      setOrderErr(e?.message || "Erro ao enviar ordem. Verifique o console.");
    } finally {
      setOrderLoading(false); setConfirmLive(false);
    }
  }

  /* Fetch AI explanation when panel opens */
  useEffect(() => {
    if (!open || !symbol) { setAiExplain(null); return; }
    let cancelled = false;
    setAiLoading(true);
    fetchExplain(symbol)
      .then((res) => { if (!cancelled) setAiExplain(res); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
  }, [open, symbol]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !symbol) return null;

  // ── Merged data: market takes priority, discover fills gaps ──────────────
  const keyMetrics = discover?.keyMetrics || {};
  const score     = Number(market?.score      || discover?.potentialScore || 0);
  const rsi       = Number(market?.rsi14      || keyMetrics?.rsi14       || 0);
  const atr       = Number(market?.atr14      || keyMetrics?.atr14       || 0);
  const regime_   = market?.regime || discover?.regime || "N/A";
  const signalRaw = String(market?.signal || discover?.signal || "WAIT").toUpperCase();
  const chg24     = quote?.change24hPct != null ? Number(quote.change24hPct) : null;
  const price     = Number(quote?.price || 0);

  // Discover-only metrics (with market fallbacks when available)
  const potentialScore = discover?.potentialScore    ?? market?.potentialScore    ?? null;
  const volZ           = keyMetrics?.volume_z        ?? market?.volume_z          ?? null;
  const corrBtc        = keyMetrics?.corr_btc        ?? market?.corr_btc          ?? null;

  // Entry / exit suggestions
  const stopPrice   = price > 0 && atr > 0 ? price - atr * 1.5 : null;
  const targetPrice = price > 0 && atr > 0 ? price + atr * 3   : null;

  const explanation = buildExplanLevels({
    symbol,
    market: market || { score, rsi14: rsi, atr14: atr, regime: regime_, signal: signalRaw },
    discover,
    quote,
  });

  return (
    <div className="asset-panel-overlay" onClick={onClose}>
      <aside className="asset-panel" onClick={(e) => e.stopPropagation()}>
        <div className="asset-panel-head">
          <div>
            <div className="asset-panel-title">{symbol}</div>
            <div className="asset-panel-sub">Ficha de decisão — análise completa</div>
          </div>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>

        <div className="asset-panel-body">

          {/* ── Seção 1: SINAL ── */}
          <div className={`decision-signal ${signalClassV2(signalRaw)}`}>
            {signalRaw === "BUY" ? "🟢 Compra — condições favoráveis" :
             signalRaw === "SELL" ? "🔴 Venda — reduzir posição" :
             "⏸ Aguardar — sem sinal claro"}
          </div>

          {/* ── Seção 2: KPIs nível 1 ── */}
          <div className="kpi-grid" style={{ marginTop: 14 }}>
            <div className="kpi-card">
              <span className="kpi-card-label">Preço</span>
              <span className="kpi-card-value" style={{ fontSize: "var(--fs-xl)" }}>{metricValue(price, price >= 1 ? 2 : 6)}</span>
              {chg24 != null && (
                <span className="kpi-card-hint" style={{ color: chg24 >= 0 ? "var(--good)" : "var(--danger)", fontWeight: 600 }}>
                  {chg24 >= 0 ? "+" : ""}{chg24.toFixed(2)}% (24h)
                </span>
              )}
            </div>
            <div className="kpi-card">
              <span className="kpi-card-label">Score</span>
              <span className="kpi-card-value" style={{ color: score >= 70 ? "var(--good)" : score >= 45 ? "var(--warn)" : "var(--danger)" }}>
                {score}<span style={{ fontSize: "var(--fs-sm)", fontWeight: 400, color: "var(--muted)" }}>/100</span>
              </span>
            </div>
            <div className="kpi-card">
              <span className="kpi-card-label">Regime</span>
              <span className="kpi-card-value" style={{ fontSize: "var(--fs-lg)" }}>{regime_}</span>
            </div>
          </div>

          {/* ── Seção 3: Motivos ── */}
          <div className="decision-section">
            <div className="decision-section-title"><span>📋</span> Motivos</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--fs-sm)", color: "var(--text-secondary)", lineHeight: 1.7 }}>
              <li>Score {score}/100: {scoreInterpret(score)}.</li>
              <li>RSI {rsiInterpret(rsi)}.</li>
              <li>{friendlyRegime(regime_)} — {signalRaw === "BUY" ? "favorece entrada" : signalRaw === "SELL" ? "favorece saída" : "não favorece operação"}.</li>
            </ul>
          </div>

          {/* ── Seção 4: Risco ── */}
          <div className="decision-section">
            <div className="decision-section-title"><span>⚠️</span> Risco</div>
            <div className="kpi-grid">
              <div className="kpi-card">
                <span className="kpi-card-label">ATR (14)</span>
                <span className="kpi-card-value" style={{ fontSize: "var(--fs-lg)" }}>{metricValue(atr, 4)}</span>
                {price > 0 && atr > 0 && (
                  <span className="kpi-card-hint">{((atr / price) * 100).toFixed(2)}% do preço</span>
                )}
              </div>
              <div className="kpi-card">
                <span className="kpi-card-label">Stop sugerido</span>
                <span className="kpi-card-value" style={{ fontSize: "var(--fs-lg)" }}>
                  {price > 0 && atr > 0 ? metricValue(price - atr * 1.5, price >= 1 ? 2 : 6) : "—"}
                </span>
                <span className="kpi-card-hint">Preço − 1.5× ATR</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-card-label">RSI</span>
                <span className="kpi-card-value" style={{ fontSize: "var(--fs-lg)", color: rsi >= 70 ? "var(--danger)" : rsi <= 30 ? "var(--good)" : "var(--muted)" }}>
                  {metricValue(rsi, 1)}
                </span>
              </div>
            </div>
          </div>

          {/* ── Seção 5: Sugestão de entrada / saída ── */}
          <div className="decision-section" style={{ background: "var(--surface2)" }}>
            <div className="decision-section-title"><span>💡</span> O que fazer agora</div>
            <p style={{ margin: 0, marginBottom: 12, fontSize: "var(--fs-base)", color: "var(--text)", lineHeight: 1.6, fontWeight: 500 }}>
              {signalAction(signalRaw)}
            </p>
            {/* Sugestão de entrada */}
            {signalRaw === "BUY" && price > 0 && (
              <div style={{ background: "var(--surface)", borderRadius: 8, padding: "10px 14px", marginBottom: 8, fontSize: "var(--fs-sm)" }}>
                <div style={{ fontWeight: 700, color: "var(--good)", marginBottom: 4 }}>📥 Sugestão de entrada</div>
                <div className="row">
                  <span style={{ color: "var(--muted)" }}>Preço de entrada</span>
                  <span className="mono">{metricValue(price, price >= 1 ? 2 : 6)} (mercado)</span>
                </div>
                {stopPrice != null && (
                  <div className="row">
                    <span style={{ color: "var(--muted)" }}>Stop loss (1.5× ATR)</span>
                    <span className="mono" style={{ color: "var(--danger)" }}>{metricValue(stopPrice, price >= 1 ? 2 : 6)}</span>
                  </div>
                )}
                {targetPrice != null && (
                  <div className="row">
                    <span style={{ color: "var(--muted)" }}>Alvo (3× ATR, R:R 2:1)</span>
                    <span className="mono" style={{ color: "var(--good)" }}>{metricValue(targetPrice, price >= 1 ? 2 : 6)}</span>
                  </div>
                )}
                {orderMsg && <div style={{ color: "var(--good)", margin: "8px 0", fontWeight: 600 }}>{orderMsg}</div>}
                {orderErr && <div style={{ color: "var(--danger)", margin: "8px 0" }}>{orderErr}</div>}
                {confirmLive && (
                  <div style={{ background: "#7f1d1d", borderRadius: 6, padding: "8px 10px", marginTop: 8, fontSize: "var(--fs-xs)" }}>
                    ⚠️ Confirmação LIVE — dinheiro real!
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleOrder("BUY")} disabled={orderLoading}>
                        {orderLoading ? "⏳..." : "🟢 Confirmar Compra LIVE"}
                      </button>
                      <button className="btn" onClick={() => setConfirmLive(false)}>Cancelar</button>
                    </div>
                  </div>
                )}
                {!confirmLive && (
                  <button className="btn btn-primary" style={{ marginTop: 10, width: "100%" }}
                    onClick={() => handleOrder("BUY")} disabled={orderLoading}>
                    {orderLoading ? "⏳ Enviando..." : `🟢 Comprar 50 USDT — ${mode}`}
                  </button>
                )}
              </div>
            )}
            {/* Sugestão de saída */}
            {signalRaw === "SELL" && price > 0 && (
              <div style={{ background: "var(--surface)", borderRadius: 8, padding: "10px 14px", fontSize: "var(--fs-sm)" }}>
                <div style={{ fontWeight: 700, color: "var(--danger)", marginBottom: 4 }}>📤 Sugestão de saída</div>
                <div className="row">
                  <span style={{ color: "var(--muted)" }}>Preço de saída</span>
                  <span className="mono">{metricValue(price, price >= 1 ? 2 : 6)} (mercado)</span>
                </div>
                {stopPrice != null && (
                  <div className="row">
                    <span style={{ color: "var(--muted)" }}>Stop de proteção</span>
                    <span className="mono" style={{ color: "var(--danger)" }}>{metricValue(stopPrice, price >= 1 ? 2 : 6)}</span>
                  </div>
                )}
                {orderMsg && <div style={{ color: "var(--good)", margin: "8px 0", fontWeight: 600 }}>{orderMsg}</div>}
                {orderErr && <div style={{ color: "var(--danger)", margin: "8px 0" }}>{orderErr}</div>}
                {confirmLive && (
                  <div style={{ background: "#7f1d1d", borderRadius: 6, padding: "8px 10px", marginTop: 8, fontSize: "var(--fs-xs)" }}>
                    ⚠️ Confirmação LIVE — fecha posição real!
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button className="btn" style={{ flex: 1, background: "var(--danger)" }} onClick={() => handleOrder("SELL")} disabled={orderLoading}>
                        {orderLoading ? "⏳..." : "🔴 Confirmar Venda LIVE"}
                      </button>
                      <button className="btn" onClick={() => setConfirmLive(false)}>Cancelar</button>
                    </div>
                  </div>
                )}
                {!confirmLive && (
                  <button className="btn" style={{ marginTop: 10, width: "100%", background: "var(--danger)", color: "#fff" }}
                    onClick={() => handleOrder("SELL")} disabled={orderLoading}>
                    {orderLoading ? "⏳ Enviando..." : `🔴 Vender posição — ${mode}`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Seção 6: IA — Por quê? ── */}
          {aiLoading ? (
            <div className="ia-panel" style={{ textAlign: "center", padding: 20 }}>
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--muted)" }}>⏳ Consultando IA...</div>
            </div>
          ) : (
            <IAExplainPanel
              leigo={aiExplain?.leigo || explanation.leigo}
              intermediario={aiExplain?.intermediario || explanation.intermediario}
              tecnico={aiExplain?.tecnico || explanation.tecnico}
              significado={aiExplain?.significado || explanation.significado}
              riscoPrincipal={aiExplain?.riscoPrincipal || explanation.riscoPrincipal}
              condicaoMudar={aiExplain?.condicaoMudar || explanation.condicaoMudar}
              source={aiExplain?.source}
            />
          )}

          {/* ── Tags ── */}
          {Array.isArray(discover?.tags) && discover.tags.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {discover.tags.map((t) => (
                <span key={t} className="tag-pill">{t}</span>
              ))}
            </div>
          )}

          {/* ── Indicadores nível 2 ── */}
          <div className="decision-section">
            <div className="decision-section-title"><span>📊</span> Indicadores técnicos</div>
            <div className="kpi-grid">
              <div className="kpi-card">
                <span className="kpi-card-label">Potential</span>
                <span className="kpi-card-value" style={{ fontSize: "var(--fs-lg)", color: potentialScore >= 60 ? "var(--good)" : potentialScore >= 35 ? "var(--warn)" : "var(--muted)" }}>
                  {potentialScore != null ? `${metricValue(potentialScore, 0)}/100` : "—"}
                </span>
                <span className="kpi-card-hint">{potentialScore == null ? "Sem dados Discover" : potentialScore >= 60 ? "alto" : potentialScore >= 35 ? "moderado" : "baixo"}</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-card-label">Vol Z</span>
                <span className="kpi-card-value" style={{
                  fontSize: "var(--fs-lg)",
                  color: volZ == null ? "var(--muted)" : Number(volZ) >= 1.5 ? "var(--good)" : Number(volZ) <= -0.5 ? "var(--danger)" : "var(--muted)"
                }}>
                  {volZ != null ? metricValue(volZ) : "—"}
                </span>
                {volZ != null && (
                  <span className="kpi-card-hint">{Number(volZ) >= 1.5 ? "acima da média" : Number(volZ) <= -0.5 ? "fraco" : "normal"}</span>
                )}
              </div>
              <div className="kpi-card">
                <span className="kpi-card-label">Corr BTC</span>
                <span className="kpi-card-value" style={{ fontSize: "var(--fs-lg)", color: corrBtc == null ? "var(--muted)" : Math.abs(Number(corrBtc)) >= 0.6 ? "var(--warn)" : "var(--text)" }}>
                  {corrBtc != null ? metricValue(corrBtc) : "—"}
                </span>
                {corrBtc != null && (
                  <span className="kpi-card-hint">{Math.abs(Number(corrBtc)) >= 0.6 ? "alta correlação" : Math.abs(Number(corrBtc)) >= 0.3 ? "moderada" : "independente"}</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Gráfico ── */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-title"><strong>Gráfico</strong><span className="chip">4h</span></div>
            <iframe
              title={`asset-panel-chart-${symbol}`}
              src={`https://s.tradingview.com/widgetembed/?symbol=BINANCE:${symbol}&interval=240&theme=dark&style=1&hide_side_toolbar=1&withdateranges=1&allow_symbol_change=0`}
              style={{ width: "100%", height: 360, border: 0, borderRadius: 12, marginTop: 10 }}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
