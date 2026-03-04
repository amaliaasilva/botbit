"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import { KpiCard } from "../../components/ui";
import { subscribeTradingState } from "../../lib/firestore";
import { fetchPortfolio, fetchBalance } from "../../lib/backend";

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(null);
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
      setLiveLoading(true);
      setBalanceError("");
      const [portfolioRes, liveRes, testnetRes] = await Promise.allSettled([
        fetchPortfolio(),
        fetchBalance("live"),
        fetchBalance("testnet"),
      ]);
      if (portfolioRes.status === "fulfilled") setLiveData(portfolioRes.value);
      if (liveRes.status === "fulfilled") setBalanceLive(liveRes.value);
      if (testnetRes.status === "fulfilled") setBalanceTestnet(testnetRes.value);
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

  const liveCashUSDT = Number(balanceLive?.usdtFree ?? 0);
  const liveTotalAssets = balanceLive?.totalAssets ?? 0;
  const testnetCashUSDT = Number(balanceTestnet?.usdtFree ?? 0);
  const exposureUSDT = Number(liveData?.exposureUSDT ?? state?.exposureUSDT ?? 0);
  const exposurePct = liveCashUSDT + exposureUSDT > 0 ? (exposureUSDT / (liveCashUSDT + exposureUSDT)) * 100 : 0;
  const currentMode = String(liveData?.mode ?? state?.mode ?? "PAPER").toUpperCase();

  const aiContextGlobal = [
    "As decisões de entrada/saída consideram score, regime e sinal do motor determinístico.",
    "Os limites de risco (alocação máxima, perda diária e cooldown) controlam tamanho e frequência das posições.",
    "Em PAPER, OCO aparece como SIMULATED; em TESTNET/LIVE, a proteção tenta criar OCO real na Binance.",
  ];

  return (
    <AppShell title="Carteira" subtitle="Visão clara de caixa, exposição e posições">

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
    </AppShell>
  );
}
