"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import AssetDetailPanel from "../../components/AssetDetailPanel";
import { CommandStrip, Sparkline } from "../../components/ui";
import {
  addWatchlistSymbol,
  listDiscoverScores,
  listMarketScores,
  removeWatchlistSymbol,
  subscribeDiscoverLatest,
  subscribeMarketRanking,
  subscribeQuotes,
  subscribeTradingState,
  subscribeWatchlist,
} from "../../lib/firestore";
import { fetchLiveQuotes } from "../../lib/backend";
import { scoreBand, signalClass } from "../../lib/market";

const TABS = [
  { id: "mercado", label: "Mercado", hint: "Ranking e gráfico" },
  { id: "watchlist", label: "Watchlist", hint: "Meus ativos" },
  { id: "discover", label: "Discover", hint: "Scanner top 50" },
];

function normalizeTab(v) {
  const valid = new Set(TABS.map((t) => t.id));
  return valid.has(v) ? v : "mercado";
}

function regimeClass(regime) {
  const v = String(regime || "").toLowerCase();
  if (v === "alta" || v === "bullish") return "badge-regime-alta";
  if (v === "baixa" || v === "bearish") return "badge-regime-baixa";
  if (v === "lateral") return "badge-regime-lateral";
  return "badge-regime-neutro";
}

function regimeLabel(regime) {
  const v = String(regime || "").toLowerCase();
  if (v === "alta" || v === "bullish") return "↑ Alta";
  if (v === "baixa" || v === "bearish") return "↓ Baixa";
  if (v === "lateral") return "→ Lateral";
  return "Neutro";
}

function scoreColor(score) {
  const n = Number(score || 0);
  if (n >= 70) return "var(--good)";
  if (n >= 45) return "var(--warn)";
  return "var(--danger)";
}

function signalLabelPt(signal) {
  const v = String(signal || "WAIT").toUpperCase();
  if (v === "BUY") return "Compra";
  if (v === "SELL") return "Venda";
  return "Aguardar";
}

const TAG_PT = {
  BREAKOUT_VOLUME: "Rompimento c/ volume",
  SQUEEZE_RELEASE: "Compressão liberada",
  ROTATION_RS: "Rotação de força",
  REVERSAL_SAFE: "Reversão segura",
};

function fmtPrice(val) {
  if (val == null) return "—";
  const n = Number(val);
  if (n >= 1000) return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

/** Build quick "why" bullets for a ranked asset */
function whyBullets(item, quote) {
  const score = Number(item?.score || 0);
  const signal = String(item?.signal || "WAIT").toUpperCase();
  const regime = String(item?.regime || "").toLowerCase();
  const rsi = Number(item?.rsi14 || 50);
  const chg = quote?.change24hPct != null ? Number(quote.change24hPct) : null;

  const bullets = [];
  // Score
  if (score >= 70) bullets.push(`Score alto (${score}) — condições favoráveis`);
  else if (score >= 45) bullets.push(`Score médio (${score}) — sem convicção forte`);
  else bullets.push(`Score baixo (${score}) — condições desfavoráveis`);

  // RSI
  if (rsi >= 70) bullets.push(`RSI sobrecomprado (${rsi.toFixed(0)}) — cuidado`);
  else if (rsi <= 30) bullets.push(`RSI sobrevendido (${rsi.toFixed(0)}) — oportunidade`);
  else bullets.push(`RSI neutro (${rsi.toFixed(0)})`);

  // Regime
  if (regime === "alta" || regime === "bullish") bullets.push("Mercado em tendência de alta");
  else if (regime === "baixa" || regime === "bearish") bullets.push("Mercado em tendência de baixa");
  else if (regime === "lateral") bullets.push("Mercado lateral, sem direção");
  else bullets.push("Regime neutro / indefinido");

  return bullets;
}

/** WhyTooltip — "Por quê?" hover tooltip */
function WhyTooltip({ item, quote }) {
  const [open, setOpen] = useState(false);
  const bullets = whyBullets(item, quote);
  return (
    <span className="why-cell" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span className="why-trigger" onClick={() => setOpen(!open)}>
        <span>Por quê?</span>
      </span>
      {open && (
        <span className="why-popup">
          <strong style={{ fontSize: "var(--fs-sm)" }}>{item.symbol}</strong>
          <ul>
            {bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </span>
      )}
    </span>
  );
}

/* ── MercadoTab ─────────────────────────────────────────── */
function MercadoTab() {
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quotesMap, setQuotesMap] = useState({});
  const [detailSymbol, setDetailSymbol] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [tradingState, setTradingState] = useState(null);
  const [discoverMap, setDiscoverMap] = useState({});

  useEffect(() => {
    setLoading(true);
    return subscribeMarketRanking(50, (rows) => {
      setRanking(rows);
      setLoading(false);
    });
  }, []);

  /* Load discover data for ranking symbols whenever ranking updates */
  useEffect(() => {
    const syms = ranking.map((r) => r.symbol).filter(Boolean);
    if (!syms.length) return;
    let cancelled = false;
    listDiscoverScores(syms).then((rows) => {
      if (cancelled) return;
      const map = {};
      rows.forEach((r) => { if (r.symbol) map[r.symbol] = r; });
      setDiscoverMap(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [ranking]);

  useEffect(() => {
    return subscribeTradingState((s) => setTradingState(s));
  }, []);

  useEffect(() => {
    const symbols = ranking.slice(0, 30).map((r) => r.symbol).filter(Boolean);
    if (!symbols.length) return () => {};
    return subscribeQuotes(symbols, (rows) => {
      setQuotesMap((prev) => {
        const next = { ...prev };
        rows.forEach((r) => { next[r.symbol] = r; });
        return next;
      });
    });
  }, [ranking]);

  const top3 = ranking.slice(0, 3);

  // Derive global regime from top assets
  const regimeCounts = ranking.reduce((acc, r) => {
    const re = String(r.regime || "").toLowerCase();
    acc[re] = (acc[re] || 0) + 1;
    return acc;
  }, {});
  const dominantRegime = Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutro";
  const avgScore = ranking.length ? Math.round(ranking.reduce((s, r) => s + Number(r.score || 0), 0) / ranking.length) : 0;
  const mode = String(tradingState?.mode || "PAPER").toUpperCase();

  return (
    <>
      {/* Command Strip — status do sistema */}
      <CommandStrip items={[
        {
          label: "Regime Global",
          value: regimeLabel(dominantRegime),
          color: dominantRegime === "alta" || dominantRegime === "bullish" ? "var(--good)" : dominantRegime === "baixa" || dominantRegime === "bearish" ? "var(--danger)" : "var(--accent)",
        },
        {
          label: "Score Médio",
          value: `${avgScore}/100`,
          color: scoreColor(avgScore),
        },
        {
          label: "Bot Status",
          value: mode,
          color: mode === "LIVE" ? "var(--danger)" : mode === "TESTNET" ? "var(--accent)" : "var(--warn)",
        },
        {
          label: "Ativos Ranqueados",
          value: String(ranking.length),
        },
      ]} />

      {loading && <div className="chip" style={{ marginBottom: 12 }}>Carregando ranking...</div>}

      {top3.length > 0 && (
        <div className="grid3" style={{ marginBottom: 16 }}>
          {top3.map((c) => {
            const q = quotesMap[c.symbol] || {};
            const score = Number(c.score || 0);
            return (
              <div
                className="card card-market"
                key={c.symbol}
                onClick={() => setDetailSymbol(c.symbol)}
                style={{ cursor: "pointer", borderColor: `${scoreColor(score)}55` }}
              >
                <div className="card-title">
                  <strong className="asset">{c.symbol}</strong>
                  <span className={`badge ${signalClass(c.signal)}`}>{signalLabelPt(c.signal)}</span>
                </div>
                <div className="market-price">{fmtPrice(q.price)}</div>
                <div
                  className="market-change"
                  style={{ color: Number(q.change24hPct || 0) >= 0 ? "var(--good)" : "var(--danger)" }}
                >
                  {q.change24hPct != null
                    ? `${Number(q.change24hPct) >= 0 ? "+" : ""}${Number(q.change24hPct).toFixed(2)}%`
                    : "—"} (24h)
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <span>Score</span>
                  <span style={{ fontWeight: 800, color: scoreColor(score) }}>{score}</span>
                </div>
                <div className="bar" style={{ marginTop: 6 }}>
                  <span style={{ width: `${score}%`, background: scoreColor(score) }}></span>
                </div>
                <div className="row">
                  <span>Regime</span>
                  <span className={regimeClass(c.regime)}>{regimeLabel(c.regime)}</span>
                </div>
                <div className="row">
                  <span>RSI</span>
                  <span className="mono">{Number(c.rsi14 || 0).toFixed(1)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          <strong>Ranking completo</strong>
          <span className="chip">{ranking.length} ativos</span>
        </div>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Ativo</th>
                <th>Preço</th>
                <th>24h</th>
                <th>Sparkline</th>
                <th>Score</th>
                <th>Regime</th>
                <th>Sinal</th>
                <th>Por quê?</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 ? (
                <tr><td colSpan={9}>Aguardando dados (cron de score roda a cada hora).</td></tr>
              ) : ranking.map((item, idx) => {
                const q = quotesMap[item.symbol] || {};
                const score = Number(item.score || 0);
                const chg = q.change24hPct != null ? Number(q.change24hPct) : null;
                // Generate synthetic sparkline data from price + change
                const sparkData = (() => {
                  const price = Number(q.price || 0);
                  if (!price) return [];
                  const pct = chg != null ? chg / 100 : 0;
                  const start = price / (1 + pct);
                  const pts = [];
                  for (let i = 0; i <= 12; i++) {
                    const t = i / 12;
                    const noise = (Math.sin(i * 2.3 + score * 0.1) * 0.003);
                    pts.push(start + (price - start) * t + price * noise);
                  }
                  return pts;
                })();
                return (
                  <tr
                    key={item.symbol}
                    onClick={() => { setSelectedSymbol(item.symbol); setDetailSymbol(item.symbol); }}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="mono">{idx + 1}</td>
                    <td className="asset">{item.symbol}</td>
                    <td className="mono">{fmtPrice(q.price)}</td>
                    <td
                      className="mono"
                      style={{ color: chg == null ? "var(--muted)" : chg >= 0 ? "var(--good)" : "var(--danger)" }}
                    >
                      {chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—"}
                    </td>
                    <td>
                      <Sparkline data={sparkData} width={56} height={18} />
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="bar" style={{ width: 60 }}>
                          <span style={{ width: `${score}%`, background: scoreColor(score) }}></span>
                        </div>
                        <span className="mono" style={{ color: scoreColor(score), fontWeight: 700 }}>{score}</span>
                      </div>
                    </td>
                    <td><span className={regimeClass(item.regime)}>{regimeLabel(item.regime)}</span></td>
                    <td><span className={`badge ${signalClass(item.signal)}`}>{signalLabelPt(item.signal)}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <WhyTooltip item={item} quote={q} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <strong>Gráfico</strong>
          <span className="chip">{selectedSymbol} · 4h</span>
        </div>
        <iframe
          title={`chart-${selectedSymbol}`}
          src={`https://s.tradingview.com/widgetembed/?symbol=BINANCE:${selectedSymbol}&interval=240&theme=dark&style=1&hide_side_toolbar=1&withdateranges=1&allow_symbol_change=0`}
          style={{ width: "100%", height: 380, border: 0, borderRadius: 12, marginTop: 10 }}
        />
      </div>

      <AssetDetailPanel
        open={Boolean(detailSymbol)}
        symbol={detailSymbol}
        quote={quotesMap[detailSymbol] || null}
        market={ranking.find((r) => r.symbol === detailSymbol) || null}
        discover={discoverMap[detailSymbol] || null}
        onClose={() => setDetailSymbol("")}
      />
    </>
  );
}

/* ── WatchlistTab ────────────────────────────────────────── */
function WatchlistTab({ uid }) {
  const [items, setItems] = useState([]);
  const [rows, setRows] = useState([]);
  const [discoverRows, setDiscoverRows] = useState([]);
  const [quotesMap, setQuotesMap] = useState({});
  const [symbol, setSymbol] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailSymbol, setDetailSymbol] = useState("");

  /* Stable key: only changes when the actual symbol list changes */
  const symbolsKey = useMemo(
    () => items.map((i) => i.symbol).filter(Boolean).sort().join(","),
    [items]
  );

  /* 1) Subscribe watchlist — only update items when symbols truly change */
  useEffect(() => {
    if (!uid) return () => {};
    let prevKey = "";
    return subscribeWatchlist(uid, (data) => {
      const key = data.map((i) => i.symbol).filter(Boolean).sort().join(",");
      if (key !== prevKey) {
        prevKey = key;
        setItems(data);
      }
    });
  }, [uid]);

  /* 2) Fetch market scores + discover scores in parallel */
  useEffect(() => {
    if (!symbolsKey) { setRows([]); setDiscoverRows([]); return; }
    let cancelled = false;
    setLoading(true);
    const syms = symbolsKey.split(",");
    Promise.all([
      listMarketScores(syms).catch(() => []),
      listDiscoverScores(syms).catch(() => []),
    ]).then(([marketRes, discoverRes]) => {
      if (cancelled) return;
      setRows(marketRes);
      setDiscoverRows(discoverRes);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbolsKey]);

  /* 3) Subscribe quotes — keyed on symbolsKey to avoid spurious re-subs */
  useEffect(() => {
    const syms = symbolsKey ? symbolsKey.split(",") : [];
    if (!syms.length) return () => {};
    return subscribeQuotes(syms, (qrows) => {
      setQuotesMap((prev) => {
        const next = { ...prev };
        qrows.forEach((r) => { next[r.symbol] = r; });
        return next;
      });
    });
  }, [symbolsKey]);

  /* 4) Fetch live quotes from Binance API for symbols missing from Firestore */
  useEffect(() => {
    if (!symbolsKey) return;
    const syms = symbolsKey.split(",");
    // Wait a bit for Firestore quotes to arrive, then fill gaps
    const timer = setTimeout(() => {
      const missing = syms.filter((s) => !quotesMap[s] || !quotesMap[s].price);
      if (!missing.length) return;
      fetchLiveQuotes(missing).then((liveItems) => {
        if (!liveItems.length) return;
        setQuotesMap((prev) => {
          const next = { ...prev };
          liveItems.forEach((r) => { next[r.symbol] = r; });
          return next;
        });
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [symbolsKey, quotesMap]);

  /* Helper: merge market + discover data for a symbol */
  function getRowData(sym) {
    const market = rows.find((r) => r.symbol === sym) || null;
    if (market) return market;
    // Fallback: use discover data
    const disc = discoverRows.find((r) => r.symbol === sym) || null;
    if (!disc) return null;
    return {
      symbol: disc.symbol,
      score: disc.potentialScore || 0,
      signal: disc.signal || "WAIT",
      regime: disc.regime || "Neutro",
      rsi14: disc.keyMetrics?.rsi14 || 0,
      atr14: disc.keyMetrics?.atr14 || 0,
      _fromDiscover: true,
    };
  }

  async function quickAdd(sym) {
    if (!uid) return;
    try {
      await addWatchlistSymbol(uid, sym);
      setActionMsg(`${sym} adicionado`);
    } catch (e) {
      setActionMsg(e?.message || "Erro");
    }
    setTimeout(() => setActionMsg(""), 2000);
  }

  async function add() {
    if (!uid || !symbol.trim()) return;
    const norm = symbol.trim().toUpperCase();
    await quickAdd(norm === "BTC" ? "BTCUSDT" : norm);
    setSymbol("");
  }

  async function remove(sym) {
    try {
      await removeWatchlistSymbol(uid, sym);
      setActionMsg(`${sym} removido`);
    } catch (e) {
      setActionMsg(e?.message || "Erro");
    }
    setTimeout(() => setActionMsg(""), 2000);
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title"><strong>Adicionar ativo</strong><span className="chip">Binance</span></div>
        <p className="settings-help" style={{ marginBottom: 10 }}>
          Digite um par (ex: BTCUSDT) ou use os atalhos. Clique na linha para análise detalhada.
        </p>
        {actionMsg ? <div className="action-msg">{actionMsg}</div> : null}
        <div className="row">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Ex: BTCUSDT, SOLUSDT..."
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn btn-primary" onClick={add}>Adicionar</button>
        </div>
        <div className="settings-actions-wrap" style={{ marginTop: 10 }}>
          {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map((sym) => (
            <button key={sym} className="btn" onClick={() => quickAdd(sym)}>+ {sym}</button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading && <div className="chip" style={{ marginBottom: 8 }}>Atualizando dados...</div>}
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Watchlist vazia</div>
            <p className="empty-desc">Adicione ativos acima para monitorar score, regime e sinal em tempo real.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>Preço</th>
                  <th>24h</th>
                  <th>Score</th>
                  <th>Regime</th>
                  <th>Sinal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const data = getRowData(item.symbol);
                  const q = quotesMap[item.symbol] || {};
                  const score = Number(data?.score || 0);
                  const chg = q.change24hPct != null ? Number(q.change24hPct) : null;
                  return (
                    <tr key={item.symbol} onClick={() => setDetailSymbol(item.symbol)} style={{ cursor: "pointer" }}>
                      <td className="asset">
                        {item.symbol}
                        {data?._fromDiscover && <span className="chip" style={{ marginLeft: 6, fontSize: 9 }}>Discover</span>}
                      </td>
                      <td className="mono">{fmtPrice(q.price)}</td>
                      <td
                        className="mono"
                        style={{ color: chg == null ? "var(--muted)" : chg >= 0 ? "var(--good)" : "var(--danger)" }}
                      >
                        {chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—"}
                      </td>
                      <td>
                        {data ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div className="bar" style={{ width: 50 }}>
                              <span style={{ width: `${score}%`, background: scoreColor(score) }}></span>
                            </div>
                            <span className="mono" style={{ color: scoreColor(score), fontWeight: 700 }}>{score}</span>
                          </div>
                        ) : <span className="mono">—</span>}
                      </td>
                      <td><span className={regimeClass(data?.regime)}>{data ? regimeLabel(data.regime) : "—"}</span></td>
                      <td><span className={`badge ${signalClass(data?.signal || "WAIT")}`}>{signalLabelPt(data?.signal)}</span></td>
                      <td>
                        <button
                          className="btn btn-danger-sm"
                          onClick={(e) => { e.stopPropagation(); remove(item.symbol); }}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AssetDetailPanel
        open={Boolean(detailSymbol)}
        symbol={detailSymbol}
        quote={quotesMap[detailSymbol] || null}
        market={rows.find((r) => r.symbol === detailSymbol) || null}
        discover={discoverRows.find((r) => r.symbol === detailSymbol) || null}
        onClose={() => setDetailSymbol("")}
      />
    </>
  );
}

/* ── DiscoverTab ─────────────────────────────────────────── */
function DiscoverTab({ uid }) {
  const [items, setItems] = useState([]);
  const [quotesMap, setQuotesMap] = useState({});
  const [tagFilter, setTagFilter] = useState("ALL");
  const [minScore, setMinScore] = useState(20);
  const [detailSymbol, setDetailSymbol] = useState("");
  const [watchlistSymbols, setWatchlistSymbols] = useState([]);
  const [actionMsg, setActionMsg] = useState("");

  useEffect(() => { return subscribeDiscoverLatest(50, (rows) => setItems(rows)); }, []);

  useEffect(() => {
    if (!uid) return () => {};
    return subscribeWatchlist(uid, (rows) =>
      setWatchlistSymbols(rows.map((r) => String(r.symbol || "").toUpperCase()))
    );
  }, [uid]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (Number(item.potentialScore || 0) < Number(minScore || 0)) return false;
      if (tagFilter === "ALL") return true;
      return (Array.isArray(item.tags) ? item.tags : []).includes(tagFilter);
    });
  }, [items, tagFilter, minScore]);

  useEffect(() => {
    const syms = filtered.map((i) => i.symbol).slice(0, 20);
    if (!syms.length) return () => {};
    return subscribeQuotes(syms, (rows) => {
      setQuotesMap((prev) => {
        const next = { ...prev };
        rows.forEach((r) => { next[r.symbol] = r; });
        return next;
      });
    });
  }, [filtered]);

  async function add(symbol) {
    if (!uid) return;
    try {
      await addWatchlistSymbol(uid, symbol);
      setActionMsg(`${symbol} adicionado na Watchlist`);
    } catch (e) {
      setActionMsg(e?.message || "Falha ao adicionar");
    }
    setTimeout(() => setActionMsg(""), 2000);
  }

  const allTags = [...new Set(items.flatMap((i) => (Array.isArray(i.tags) ? i.tags : [])))].filter(Boolean);

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">
          <strong>Filtros</strong>
          <span className="chip">{filtered.length} ativos encontrados</span>
        </div>
        {actionMsg ? <div className="action-msg" style={{ marginBottom: 8 }}>{actionMsg}</div> : null}
        <p className="settings-help" style={{ marginBottom: 10 }}>
          O Discover escaneia os 50 maiores da Binance automaticamente. Clique num ativo para análise detalhada.
        </p>
        <div className="filter-row">
          <div className="filter-group">
            <label className="filter-label">Tag</label>
            <div className="custom-select-wrap">
              <select
                className="custom-select"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="ALL">Todas as tags</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>{TAG_PT[t] || t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="filter-group">
            <label className="filter-label">
              Potential mínimo: <strong style={{ color: "var(--text)" }}>{minScore}</strong>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="range-slider"
            />
          </div>
          <button className="btn" onClick={() => { setMinScore(20); setTagFilter("ALL"); }}>Resetar</button>
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◇</div>
            <div className="empty-title">Nenhum candidato</div>
            <p className="empty-desc">Reduza o Potential mínimo ou remova o filtro de tag. Dica: valores entre 10–25 normalmente mostram resultados.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ativo</th>
                  <th>Preço</th>
                  <th>24h</th>
                  <th>Potential</th>
                  <th>Tags</th>
                  <th>Vol Z</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 30).map((item, idx) => {
                  const q = quotesMap[item.symbol] || {};
                  const potential = Number(item.potentialScore || 0);
                  const chg = q.change24hPct != null ? Number(q.change24hPct) : null;
                  const volZ = Number(item.keyMetrics?.volume_z || 0);
                  const inWl = watchlistSymbols.includes(String(item.symbol || "").toUpperCase());
                  return (
                    <tr key={item.symbol} onClick={() => setDetailSymbol(item.symbol)} style={{ cursor: "pointer" }}>
                      <td className="mono">{idx + 1}</td>
                      <td className="asset">{item.symbol}</td>
                      <td className="mono">{fmtPrice(q.price)}</td>
                      <td
                        className="mono"
                        style={{ color: chg == null ? "var(--muted)" : chg >= 0 ? "var(--good)" : "var(--danger)" }}
                      >
                        {chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div className="bar" style={{ width: 50 }}>
                            <span style={{ width: `${potential}%`, background: scoreColor(potential) }}></span>
                          </div>
                          <span className="mono" style={{ color: scoreColor(potential), fontWeight: 700 }}>{potential}</span>
                        </div>
                      </td>
                      <td>
                        {Array.isArray(item.tags) && item.tags.length
                          ? item.tags.map((t) => <span key={t} className="tag-pill">{TAG_PT[t] || t}</span>)
                          : <span className="mono">—</span>}
                      </td>
                      <td
                        className="mono"
                        style={{ color: volZ >= 1.5 ? "var(--good)" : volZ <= -0.5 ? "var(--danger)" : "var(--muted)" }}
                      >
                        {volZ.toFixed(2)}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {inWl ? (
                          <span className="chip badge-watchlisted">✓ Watchlist</span>
                        ) : (
                          <button className="btn btn-primary-sm" onClick={() => add(item.symbol)}>+ Add</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AssetDetailPanel
        open={Boolean(detailSymbol)}
        symbol={detailSymbol}
        quote={quotesMap[detailSymbol] || null}
        market={null}
        discover={items.find((r) => r.symbol === detailSymbol) || null}
        onClose={() => setDetailSymbol("")}
      />
    </>
  );
}

/* ── Main Page ───────────────────────────────────────────── */
export default function DashboardPage() {
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState("mercado");
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tab = normalizeTab(new URLSearchParams(window.location.search).get("tab"));
    setActiveTab(tab);
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);
      setEmail(user.email || "");
    });
    return () => unsub();
  }, [router]);

  function selectTab(tabId) {
    const next = normalizeTab(tabId);
    setActiveTab(next);
    router.replace(next === "mercado" ? "/dashboard" : `/dashboard?tab=${next}`);
  }

  return (
    <AppShell
      title={TABS.find((t) => t.id === activeTab)?.label || "Dashboard"}
      subtitle={email || "BotBit Market Intelligence"}
      rightActions={
        <button className="btn" onClick={() => signOut(auth)}>Sair</button>
      }
    >
      <div className="dash-tabs" style={{ marginBottom: 16 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dash-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => selectTab(tab.id)}
          >
            <span className="dash-tab-label">{tab.label}</span>
            <span className="dash-tab-hint">{tab.hint}</span>
          </button>
        ))}
      </div>

      {activeTab === "mercado" && <MercadoTab />}
      {activeTab === "watchlist" && <WatchlistTab uid={uid} />}
      {activeTab === "discover" && <DiscoverTab uid={uid} />}
    </AppShell>
  );
}
