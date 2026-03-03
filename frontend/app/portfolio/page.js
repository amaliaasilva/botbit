"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import { KpiCard } from "../../components/ui";
import { subscribeQuotes, subscribeTradingOrders, subscribeTradingPositions, subscribeTradingState } from "../../lib/firestore";
import { fetchPortfolio, fetchBalance } from "../../lib/backend";

function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info-tip-wrap">
      <button
        type="button"
        className="info-tip"
        aria-label={text}
        onClick={() => setOpen((prev) => !prev)}
        title={text}
      >
        i
      </button>
      {open ? <span className="info-tip-pop">{text}</span> : null}
    </span>
  );
}

function LabelWithInfo({ label, info }) {
  return (
    <span className="label-info">
      <span>{label}</span>
      <InfoTip text={info} />
    </span>
  );
}

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [state, setState] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [quotesMap, setQuotesMap] = useState({});
  const [liveData, setLiveData] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [balanceLive, setBalanceLive] = useState(null);
  const [balanceTestnet, setBalanceTestnet] = useState(null);
  const [balanceError, setBalanceError] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setLoading(false);
      // Fetch bot portfolio + real Binance balances (live + testnet) in parallel
      setLiveLoading(true);
      setBalanceError("");
      const [portfolioRes, liveRes, testnetRes] = await Promise.allSettled([
        fetchPortfolio(),
        fetchBalance("live"),
        fetchBalance("testnet"),
      ]);
      if (portfolioRes.status === "fulfilled") setLiveData(portfolioRes.value);
      else console.warn("fetchPortfolio failed:", portfolioRes.reason?.message);
      if (liveRes.status === "fulfilled") setBalanceLive(liveRes.value);
      else console.warn("fetchBalance(live) failed:", liveRes.reason?.message);
      if (testnetRes.status === "fulfilled") setBalanceTestnet(testnetRes.value);
      else console.warn("fetchBalance(testnet) failed:", testnetRes.reason?.message);
      if (liveRes.status === "rejected" && testnetRes.status === "rejected") {
        setBalanceError("Não foi possível carregar saldos da Binance.");
      }
      setLiveLoading(false);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    return subscribeTradingState((row) => setState(row));
  }, []);

  useEffect(() => {
    return subscribeTradingPositions((rows) => setPositions(rows.filter((row) => String(row.status || "").toUpperCase() === "OPEN")));
  }, []);

  useEffect(() => {
    const symbols = positions.map((p) => p.symbol).filter(Boolean);
    if (!symbols.length) return () => {};
    return subscribeQuotes(symbols, (rows) => {
      setQuotesMap((prev) => {
        const next = { ...prev };
        rows.forEach((row) => {
          next[row.symbol] = row;
        });
        return next;
      });
    });
  }, [positions]);

  useEffect(() => {
    return subscribeTradingOrders((rows) => {
      const open = rows.filter((row) => {
        const status = String(row.status || "").toUpperCase();
        return status === "NEW" || status === "OPEN" || status === "PARTIALLY_FILLED";
      });
      setOrders(open);
    });
  }, []);

  // KPIs do LIVE: saldo real da Binance
  const liveCashUSDT = Number(balanceLive?.usdtFree ?? 0);
  const liveTotalAssets = balanceLive?.totalAssets ?? 0;
  // KPIs do TESTNET: saldo da conta testnet
  const testnetCashUSDT = Number(balanceTestnet?.usdtFree ?? 0);
  // KPIs do bot (posições abertas / exposição)
  const exposureUSDT = Number(liveData?.exposureUSDT ?? state?.exposureUSDT ?? 0);
  const exposurePct = liveCashUSDT + exposureUSDT > 0 ? (exposureUSDT / (liveCashUSDT + exposureUSDT)) * 100 : 0;
  const cashPct = 100 - exposurePct;
  const currentMode = String(liveData?.mode ?? state?.mode ?? "PAPER").toUpperCase();

  const aiContextGlobal = [
    "As decisões de entrada/saída consideram score, regime e sinal do motor determinístico.",
    "Os limites de risco (alocação máxima, perda diária e cooldown) controlam tamanho e frequência das posições.",
    "Em PAPER, OCO aparece como SIMULATED; em TESTNET/LIVE, a proteção tenta criar OCO real na Binance.",
  ];

  return (
    <AppShell title="Portfolio" subtitle="Visão clara de caixa, exposição e posições">

      {/* KPIs LIVE */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">
          <strong>Conta LIVE</strong>
          <span className="chip badge buy">Binance Real</span>
          {liveLoading && <span className="chip badge wait" style={{ marginLeft: 8 }}>Carregando…</span>}
        </div>
      </div>
      <div className="kpi-grid">
        <KpiCard label="USDT livre (LIVE)" value={liveCashUSDT.toFixed(2)} hint="Saldo USDT disponível na Binance real" />
        <KpiCard label="Ativos (LIVE)" value={liveTotalAssets} hint="Quantidade de ativos com saldo != 0 na conta real" />
        <KpiCard label="Bot modo" value={currentMode} hint="Modo atual do motor de trading (TESTNET = executa na Binance Testnet)" />
        <KpiCard label="Exposição bot" value={`${exposurePct.toFixed(1)}%`} color={exposurePct > 80 ? "var(--danger)" : exposurePct > 50 ? "var(--warn)" : "var(--good)"} hint="Percentual alocado em posições abertas pelo bot" />
      </div>

      {/* KPIs TESTNET */}
      <div className="card" style={{ marginTop: 12, marginBottom: 12 }}>
        <div className="card-title">
          <strong>Conta TESTNET</strong>
          <span className="chip badge wait">Binance Testnet</span>
        </div>
      </div>
      <div className="kpi-grid">
        <KpiCard label="USDT livre (TESTNET)" value={testnetCashUSDT.toFixed(2)} hint="Saldo USDT na conta Binance Testnet" />
        <KpiCard label="canTrade" value={balanceTestnet?.canTrade ? "Sim ✓" : (liveLoading ? "…" : "Não ✗")} color={balanceTestnet?.canTrade ? "var(--good)" : undefined} hint="Conta testnet habilitada para operar" />
      </div>

      {balanceError && (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="settings-help" style={{ color: "var(--danger)" }}>{balanceError}</p>
        </div>
      )}

      {/* Carteira LIVE */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">
          <strong>Carteira LIVE</strong>
          <span className="chip badge buy">Binance Real</span>
          {liveLoading && <span className="chip badge wait" style={{ marginLeft: 8 }}>Carregando…</span>}
        </div>
        {!liveLoading && !balanceLive && <p className="settings-help" style={{ marginTop: 8 }}>BINANCE_API_KEY não configurada ou erro de conexão.</p>}
        {balanceLive && (
          <>
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <span className="chip">USDT livre: <strong>{Number(balanceLive.usdtFree).toFixed(2)}</strong></span>
              <span className="chip">USDT bloqueado: <strong>{Number(balanceLive.usdtLocked).toFixed(2)}</strong></span>
              <span className="chip">Ativos: <strong>{balanceLive.totalAssets}</strong></span>
              <span className={`chip ${balanceLive.canTrade ? "badge buy" : "badge sell"}`}>{balanceLive.canTrade ? "canTrade ✓" : "canTrade ✗"}</span>
            </div>
            {balanceLive.balances?.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead><tr><th>Ativo</th><th>Disponível</th><th>Bloqueado</th><th>Total</th></tr></thead>
                  <tbody>
                    {balanceLive.balances.map((b) => (
                      <tr key={b.asset}>
                        <td className="asset">{b.asset}</td>
                        <td>{Number(b.free).toFixed(8)}</td>
                        <td>{Number(b.locked).toFixed(8)}</td>
                        <td>{Number(b.total).toFixed(8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Carteira TESTNET */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">
          <strong>Carteira TESTNET</strong>
          <span className="chip badge wait">Binance Testnet</span>
          {liveLoading && <span className="chip badge wait" style={{ marginLeft: 8 }}>Carregando…</span>}
        </div>
        {!liveLoading && !balanceTestnet && <p className="settings-help" style={{ marginTop: 8 }}>BINANCE_TESTNET_API_KEY não configurada ou erro de conexão.</p>}
        {balanceTestnet && (
          <>
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <span className="chip">USDT livre: <strong>{Number(balanceTestnet.usdtFree).toFixed(2)}</strong></span>
              <span className="chip">USDT bloqueado: <strong>{Number(balanceTestnet.usdtLocked).toFixed(2)}</strong></span>
              <span className="chip">Ativos: <strong>{balanceTestnet.totalAssets}</strong></span>
              <span className={`chip ${balanceTestnet.canTrade ? "badge buy" : "badge sell"}`}>{balanceTestnet.canTrade ? "canTrade ✓" : "canTrade ✗"}</span>
            </div>
            {balanceTestnet.balances?.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead><tr><th>Ativo</th><th>Disponível</th><th>Bloqueado</th><th>Total</th></tr></thead>
                  <tbody>
                    {balanceTestnet.balances.map((b) => (
                      <tr key={b.asset}>
                        <td className="asset">{b.asset}</td>
                        <td>{Number(b.free).toFixed(8)}</td>
                        <td>{Number(b.locked).toFixed(8)}</td>
                        <td>{Number(b.total).toFixed(8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title"><strong>Contexto IA da decisão</strong><span className="chip">Explicação operacional</span></div>
        <ul className="ai-list" style={{ marginTop: 10 }}>
          {aiContextGlobal.map((text, idx) => (
            <li key={idx}>{text}</li>
          ))}
        </ul>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title"><strong>Posições abertas</strong><span className="chip">{positions.length}</span></div>
        {loading ? <div className="chip">Carregando...</div> : null}
        {error ? <div className="chip">{error}</div> : null}
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th><LabelWithInfo label="Symbol" info="Par negociado na Binance (ex.: NEARUSDT)." /></th>
              <th><LabelWithInfo label="Qty" info="Quantidade total da posição aberta." /></th>
              <th><LabelWithInfo label="Avg Entry" info="Preço médio de entrada da posição." /></th>
              <th><LabelWithInfo label="Last" info="Último preço de mercado usado no cálculo." /></th>
              <th><LabelWithInfo label="PnL Unr." info="Lucro/prejuízo não realizado, baseado no último preço." /></th>
              <th><LabelWithInfo label="Allocation %" info="Fatia do equity comprometida nessa posição." /></th>
              <th><LabelWithInfo label="Stop" info="Preço de proteção para limitar perda (stop-loss)." /></th>
              <th><LabelWithInfo label="Take" info="Preço alvo para realização de lucro (take-profit)." /></th>
              <th><LabelWithInfo label="OCO" info="Status da proteção OCO (One-Cancels-the-Other)." /></th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr><td colSpan={9}>Sem posições abertas.</td></tr>
            ) : positions.map((p) => (
              <tr key={p.symbol}>
                <td className="asset">{p.symbol}</td>
                <td>{Number(p.qty || 0).toFixed(6)}</td>
                <td>{Number(p.avgEntry || 0).toFixed(6)}</td>
                <td>{Number((quotesMap[p.symbol]?.price ?? p.lastPrice) || 0).toFixed(6)}</td>
                <td>{(() => {
                  const last = Number((quotesMap[p.symbol]?.price ?? p.lastPrice) || 0);
                  const pnl = (last - Number(p.avgEntry || 0)) * Number(p.qty || 0);
                  const pnlPct = Number(p.avgEntry || 0) > 0 ? ((last / Number(p.avgEntry || 1) - 1) * 100) : 0;
                  return `${pnl.toFixed(6)} (${pnlPct.toFixed(2)}%)`;
                })()}</td>
                <td>{Number(p.allocationPct || 0).toFixed(2)}%</td>
                <td>{Number(p.stopPrice || 0).toFixed(6)}</td>
                <td>{Number(p.takePrice || 0).toFixed(6)}</td>
                <td>{p.ocoStatus || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title"><strong>Ordens abertas</strong><span className="chip">{orders.length}</span></div>
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th><LabelWithInfo label="Symbol" info="Par da ordem." /></th>
              <th><LabelWithInfo label="Side" info="Direção da ordem: BUY ou SELL." /></th>
              <th><LabelWithInfo label="Type" info="Tipo da ordem: LIMIT, MARKET, OCO etc." /></th>
              <th><LabelWithInfo label="Qty" info="Quantidade solicitada na ordem." /></th>
              <th><LabelWithInfo label="Price" info="Preço informado para a ordem (quando aplicável)." /></th>
              <th><LabelWithInfo label="Status" info="Estado da ordem na exchange/bot." /></th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan={6}>Sem ordens abertas.</td></tr>
            ) : orders.map((o, idx) => (
              <tr key={`${o.symbol}-${idx}`}>
                <td className="asset">{o.symbol}</td>
                <td>{o.side || "—"}</td>
                <td>{o.order_type || o.type || "—"}</td>
                <td>{Number(o.qty || 0).toFixed(6)}</td>
                <td>{Number(o.price || 0).toFixed(6)}</td>
                <td>{o.status || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </AppShell>
  );
}
