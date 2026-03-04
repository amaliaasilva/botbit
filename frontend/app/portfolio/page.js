"use client";

import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import { KpiCard } from "../../components/ui";
import { subscribeTradingState } from "../../lib/firestore";
import { fetchPortfolio, fetchBalance } from "../../lib/backend";

/* ── Collapsible section component ────────────────────── */
function Collapsible({ title, badge, badgeClass, count, chips, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`wallet-section ${open ? "wallet-open" : ""}`}>
      <button className="wallet-header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className="wallet-header-left">
          <span className={`wallet-chevron ${open ? "wallet-chevron-open" : ""}`}>▸</span>
          <strong>{title}</strong>
          {badge && <span className={`chip badge ${badgeClass || "wait"}`}>{badge}</span>}
          {count != null && <span className="chip" style={{ marginLeft: 4 }}>{count} ativo{count !== 1 ? "s" : ""}</span>}
        </div>
        <div className="wallet-header-chips">
          {chips}
        </div>
      </button>
      <div className={`wallet-body ${open ? "wallet-body-open" : ""}`}>
        {children}
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [balanceLive, setBalanceLive] = useState(null);
  const [balanceTestnet, setBalanceTestnet] = useState(null);
  const [balanceError, setBalanceError] = useState("");
  const router = useRouter();

  const loadData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      setLoading(false);
      loadData();
    });
    return () => unsub();
  }, [router, loadData]);

  useEffect(() => {
    return subscribeTradingState((row) => setState(row));
  }, []);

  const liveCashUSDT = Number(balanceLive?.usdtFree ?? 0);
  const liveTotalAssets = balanceLive?.totalAssets ?? 0;
  const testnetCashUSDT = Number(balanceTestnet?.usdtFree ?? 0);
  const testnetTotalAssets = balanceTestnet?.totalAssets ?? 0;
  const exposureUSDT = Number(liveData?.exposureUSDT ?? state?.exposureUSDT ?? 0);
  const totalEquity = liveCashUSDT + exposureUSDT;
  const exposurePct = totalEquity > 0 ? (exposureUSDT / totalEquity) * 100 : 0;
  const currentMode = String(liveData?.mode ?? state?.mode ?? "PAPER").toUpperCase();

  const rightActions = (
    <button className="btn btn-primary" onClick={loadData} disabled={liveLoading} style={{ gap: 6, display: "inline-flex", alignItems: "center" }}>
      {liveLoading ? "Atualizando…" : "↻ Atualizar"}
    </button>
  );

  return (
    <AppShell title="Carteira" subtitle="Visão consolidada de caixa, exposição e posições" rightActions={rightActions}>

      {/* ── KPIs globais (resumo rápido) ── */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard label="USDT livre (LIVE)" value={liveCashUSDT.toFixed(2)} hint="Saldo USDT disponível na Binance real" />
        <KpiCard label="Exposição" value={`${exposurePct.toFixed(1)}%`} color={exposurePct > 80 ? "var(--danger)" : exposurePct > 50 ? "var(--warn)" : "var(--good)"} hint="Percentual alocado em posições abertas" />
        <KpiCard label="Bot modo" value={currentMode} hint="PAPER / TESTNET / LIVE" />
        <KpiCard label="USDT livre (TEST)" value={testnetCashUSDT.toFixed(2)} hint="Saldo USDT na Binance Testnet" />
      </div>

      {balanceError && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="settings-help" style={{ color: "var(--danger)", margin: 0 }}>{balanceError}</p>
        </div>
      )}

      {/* ── Carteira LIVE (colapsável) ── */}
      <Collapsible
        title="Carteira LIVE"
        badge="Binance Real"
        badgeClass="buy"
        count={balanceLive?.balances?.length ?? null}
        defaultOpen={true}
        chips={
          liveLoading
            ? <span className="chip badge wait">Carregando…</span>
            : balanceLive && (
              <>
                <span className="chip">USDT: <strong>{Number(balanceLive.usdtFree).toFixed(2)}</strong></span>
                <span className={`chip ${balanceLive.canTrade ? "badge buy" : "badge avoid"}`}>
                  {balanceLive.canTrade ? "canTrade ✓" : "canTrade ✗"}
                </span>
              </>
            )
        }
      >
        {!liveLoading && !balanceLive && (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <div className="empty-title">Sem conexão</div>
            <p className="empty-desc">BINANCE_API_KEY não configurada ou erro de conexão com a Binance.</p>
          </div>
        )}
        {balanceLive && (
          <>
            <div className="wallet-summary-chips">
              <span className="chip">USDT livre: <strong>{Number(balanceLive.usdtFree).toFixed(2)}</strong></span>
              <span className="chip">USDT bloqueado: <strong>{Number(balanceLive.usdtLocked).toFixed(2)}</strong></span>
              <span className="chip">Ativos: <strong>{balanceLive.totalAssets}</strong></span>
            </div>
            {balanceLive.balances?.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Ativo</th><th>Disponível</th><th>Bloqueado</th><th>Total</th></tr></thead>
                  <tbody>
                    {balanceLive.balances.map((b) => (
                      <tr key={b.asset}>
                        <td className="asset">{b.asset}</td>
                        <td className="mono">{Number(b.free).toFixed(8)}</td>
                        <td className="mono">{Number(b.locked).toFixed(8)}</td>
                        <td className="mono">{Number(b.total).toFixed(8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: "20px 12px" }}>
                <div className="empty-title">Nenhum ativo</div>
                <p className="empty-desc">A conta LIVE não possui ativos com saldo.</p>
              </div>
            )}
          </>
        )}
      </Collapsible>

      {/* ── Carteira TESTNET (colapsável, fechada por padrão) ── */}
      <Collapsible
        title="Carteira TESTNET"
        badge="Testnet"
        badgeClass="wait"
        count={balanceTestnet?.balances?.length ?? null}
        defaultOpen={false}
        chips={
          liveLoading
            ? <span className="chip badge wait">Carregando…</span>
            : balanceTestnet && (
              <>
                <span className="chip">USDT: <strong>{Number(balanceTestnet.usdtFree).toFixed(2)}</strong></span>
                <span className={`chip ${balanceTestnet.canTrade ? "badge buy" : "badge avoid"}`}>
                  {balanceTestnet.canTrade ? "canTrade ✓" : "canTrade ✗"}
                </span>
              </>
            )
        }
      >
        {!liveLoading && !balanceTestnet && (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <div className="empty-title">Sem conexão</div>
            <p className="empty-desc">BINANCE_TESTNET_API_KEY não configurada ou erro de conexão.</p>
          </div>
        )}
        {balanceTestnet && (
          <>
            <div className="wallet-summary-chips">
              <span className="chip">USDT livre: <strong>{Number(balanceTestnet.usdtFree).toFixed(2)}</strong></span>
              <span className="chip">USDT bloqueado: <strong>{Number(balanceTestnet.usdtLocked).toFixed(2)}</strong></span>
              <span className="chip">Ativos: <strong>{balanceTestnet.totalAssets}</strong></span>
            </div>
            {balanceTestnet.balances?.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Ativo</th><th>Disponível</th><th>Bloqueado</th><th>Total</th></tr></thead>
                  <tbody>
                    {balanceTestnet.balances.map((b) => (
                      <tr key={b.asset}>
                        <td className="asset">{b.asset}</td>
                        <td className="mono">{Number(b.free).toFixed(8)}</td>
                        <td className="mono">{Number(b.locked).toFixed(8)}</td>
                        <td className="mono">{Number(b.total).toFixed(8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: "20px 12px" }}>
                <div className="empty-title">Nenhum ativo</div>
                <p className="empty-desc">A conta TESTNET não possui ativos com saldo.</p>
              </div>
            )}
          </>
        )}
      </Collapsible>

      {/* ── Contexto IA ── */}
      <Collapsible title="Contexto IA da decisão" badge="Explicação operacional" badgeClass="" defaultOpen={false}>
        <ul className="ai-list" style={{ margin: "8px 0 0" }}>
          <li>As decisões de entrada/saída consideram score, regime e sinal do motor determinístico.</li>
          <li>Os limites de risco (alocação máxima, perda diária e cooldown) controlam tamanho e frequência das posições.</li>
          <li>Em PAPER, OCO aparece como SIMULATED; em TESTNET/LIVE, a proteção tenta criar OCO real na Binance.</li>
        </ul>
      </Collapsible>
    </AppShell>
  );
}
