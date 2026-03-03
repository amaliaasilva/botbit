"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import { KpiCard } from "../../components/ui";
import { subscribeQuotes, subscribeTradingOrders, subscribeTradingPositions, subscribeTradingState } from "../../lib/firestore";
import { fetchPortfolio } from "../../lib/backend";

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
  const router = useRouter();

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setLoading(false);
      // Fetch live data from backend (real Binance balances when TESTNET/LIVE)
      setLiveLoading(true);
      try {
        const data = await fetchPortfolio();
        setLiveData(data);
      } catch (e) {
        console.warn("fetchPortfolio failed:", e.message);
      } finally {
        setLiveLoading(false);
      }
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

  // Prefer live backend data; fall back to Firestore state
  const cashUSDT = Number(liveData?.cashUSDT ?? state?.cashUSDT ?? 0);
  const equityUSDT = Number(liveData?.equityUSDT ?? state?.equityUSDT ?? 0);
  const exposureUSDT = Number(liveData?.exposureUSDT ?? state?.exposureUSDT ?? 0);
  const exposurePct = equityUSDT > 0 ? (exposureUSDT / equityUSDT) * 100 : 0;
  const cashPct = equityUSDT > 0 ? (cashUSDT / equityUSDT) * 100 : 0;
  const currentMode = String(liveData?.mode ?? state?.mode ?? "PAPER").toUpperCase();
  const isSimulated = currentMode === "PAPER";
  const binanceBalances = liveData?.binanceBalances || [];

  const aiContextGlobal = [
    "As decisões de entrada/saída consideram score, regime e sinal do motor determinístico.",
    "Os limites de risco (alocação máxima, perda diária e cooldown) controlam tamanho e frequência das posições.",
    "Em PAPER, OCO aparece como SIMULATED; em TESTNET/LIVE, a proteção tenta criar OCO real na Binance.",
  ];

  return (
    <AppShell title="Portfolio" subtitle="Visão clara de caixa, exposição e posições">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title"><strong>Fonte do saldo</strong><span className={`chip ${isSimulated ? "badge wait" : "badge buy"}`}>{currentMode}</span></div>
        <p className="settings-help" style={{ marginTop: 8 }}>
          {isSimulated
            ? "Você está em PAPER: os valores são simulados (ex.: caixa inicial e PnL virtual), não são o saldo real da Binance."
            : "Modo conectado à exchange: o saldo tenta refletir conta Binance (USDT) para o modo ativo."}
        </p>
      </div>
      <div className="kpi-grid">
        <KpiCard label="Cash (USDT)" value={cashUSDT.toFixed(2)} hint="Saldo livre para novas entradas" />
        <KpiCard label="Equity (USDT)" value={equityUSDT.toFixed(2)} hint="Patrimônio total estimado" />
        <KpiCard label="Exposição" value={`${exposurePct.toFixed(1)}%`} color={exposurePct > 80 ? "var(--danger)" : exposurePct > 50 ? "var(--warn)" : "var(--good)"} hint="Alocado em posições" />
        <KpiCard label="Cash %" value={`${cashPct.toFixed(1)}%`} color={cashPct < 20 ? "var(--danger)" : "var(--good)"} hint="Reserva de liquidez" />
      </div>

      {!isSimulated && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-title">
            <strong>Carteira {currentMode}</strong>
            <span className="chip">Saldos reais na Binance</span>
            {liveLoading && <span className="chip badge wait" style={{ marginLeft: 8 }}>Carregando…</span>}
          </div>
          {!liveLoading && binanceBalances.length === 0 && (
            <p className="settings-help" style={{ marginTop: 8 }}>Nenhum saldo encontrado na conta Binance {currentMode}.</p>
          )}
          {binanceBalances.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Ativo</th>
                    <th>Disponível</th>
                    <th>Bloqueado</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {binanceBalances.map((b) => (
                    <tr key={b.asset}>
                      <td className="asset">{b.asset}</td>
                      <td>{Number(b.free).toFixed(8)}</td>
                      <td>{Number(b.locked).toFixed(8)}</td>
                      <td>{(Number(b.free) + Number(b.locked)).toFixed(8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
