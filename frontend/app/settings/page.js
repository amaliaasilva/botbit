"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { getUserSettings, updateUserSettings } from "../../lib/firestore";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import { emergencyStopTrading, subscribeTradingConfig, subscribeTradingState, updateTradingConfig, subscribeExecutorStatus, subscribePendingIntents } from "../../lib/firestore";

const TABS = [
  { id: "profile", label: "Perfil", hint: "Notificações e preferências" },
  { id: "trading", label: "Trading", hint: "Modo, risco e proteção" },
  { id: "costs", label: "Cost App", hint: "Custos e previsibilidade" },
];

function normalizeTab(value) {
  const valid = new Set(TABS.map((t) => t.id));
  return valid.has(value) ? value : "profile";
}

function formatMaybe(value) {
  if (value == null || value === "") return "—";
  return String(value);
}

function humanBilling(value) {
  if (value === "True" || value === true) return "Ativo";
  if (value === "False" || value === false) return "Inativo";
  return "Indisponível";
}

function showFriendlyMoney(raw) {
  if (!raw || String(raw).toLowerCase().includes("indisponível")) return "Ainda não disponível";
  return String(raw);
}

export default function SettingsPage() {
  const [uid, setUid] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [minScoreAlert, setMinScoreAlert] = useState(70);
  const [quoteRefreshMinutes, setQuoteRefreshMinutes] = useState(5);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  const [tradingConfig, setTradingConfig] = useState(null);
  const [tradingState, setTradingState] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [tradingMessage, setTradingMessage] = useState("");
  const [executorStatus, setExecutorStatus] = useState(null);
  const [pendingIntents, setPendingIntents] = useState([]);

  const [costData, setCostData] = useState(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costRefreshing, setCostRefreshing] = useState(false);
  const [costError, setCostError] = useState("");
  const [costAuditRun, setCostAuditRun] = useState(null);
  const [lastAutoRefreshAt, setLastAutoRefreshAt] = useState(null);

  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tabFromQuery = normalizeTab(new URLSearchParams(window.location.search).get("tab"));
    setActiveTab(tabFromQuery);
  }, []);

  useEffect(() => {
    if (!auth) {
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.uid);
      const settings = await getUserSettings(user.uid);
      setAlertEmail(settings?.alertEmail || user.email || "");
      setEnabled(settings?.emailAlertsEnabled ?? true);
      setMinScoreAlert(Number(settings?.minScoreAlert ?? 70));
      setQuoteRefreshMinutes(Number(settings?.quoteRefreshMinutes ?? 5));
    });
    return () => unsub();
  }, [router]);

  useEffect(() => subscribeTradingConfig((row) => setTradingConfig(row)), []);
  useEffect(() => subscribeTradingState((row) => setTradingState(row)), []);
  useEffect(() => subscribeExecutorStatus((s) => setExecutorStatus(s)), []);
  useEffect(() => subscribePendingIntents((items) => setPendingIntents(items)), []);

  async function save() {
    if (!uid) return;
    await updateUserSettings(uid, {
      alertEmail,
      emailAlertsEnabled: enabled,
      minScoreAlert: Math.max(0, Math.min(100, Number(minScoreAlert || 70))),
      quoteRefreshMinutes: Math.max(1, Math.min(60, Number(quoteRefreshMinutes || 5))),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function saveTradingPatch(patch) {
    await updateTradingConfig(patch);
    setTradingMessage("Configuração de trading salva");
    setTimeout(() => setTradingMessage(""), 1800);
  }

  async function toggleTrading() {
    await saveTradingPatch({ enabled: !tradingConfig?.enabled });
  }

  async function setTradingMode(mode) {
    await saveTradingPatch({ mode });
  }

  async function confirmLiveMode() {
    await saveTradingPatch({
      liveGuard: {
        ...(tradingConfig?.liveGuard || {}),
        typedText: confirmText,
        liveConfirmed: confirmText.toUpperCase() === "LIVE",
        liveConfirmedAt: new Date().toISOString(),
      },
    });
  }

  async function triggerEmergencyStop() {
    await emergencyStopTrading();
    setTradingMessage("Emergency Stop aplicado com sucesso");
    setTimeout(() => setTradingMessage(""), 2000);
  }

  const loadCosts = useCallback(async () => {
    try {
      setCostLoading(true);
      setCostError("");
      const res = await fetch("/api/cost-audit", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Falha HTTP ${res.status}`);
      }
      const body = await res.json();
      setCostData(body);
    } catch (e) {
      setCostError(String(e?.message || e));
    } finally {
      setCostLoading(false);
    }
  }, []);

  const recalcCosts = useCallback(async (isAuto = false) => {
    try {
      setCostRefreshing(true);
      setCostError("");
      const res = await fetch("/api/cost-audit", { method: "POST", cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Falha HTTP ${res.status}`);
      }
      const body = await res.json();
      setCostData(body);
      setCostAuditRun(body?.auditRun || null);
      if (isAuto) setLastAutoRefreshAt(new Date().toISOString());
    } catch (e) {
      setCostError(String(e?.message || e));
    } finally {
      setCostRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "costs" && !costData && !costLoading) {
      loadCosts();
    }
  }, [activeTab, costData, costLoading, loadCosts]);

  useEffect(() => {
    if (activeTab !== "costs") return undefined;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      recalcCosts(true);
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [activeTab, recalcCosts]);

  function selectTab(tabId) {
    const next = normalizeTab(tabId);
    setActiveTab(next);
    router.replace(`/settings?tab=${next}`);
  }

  const topServices = useMemo(() => {
    if (!costData?.costByService?.headers?.length || !costData?.costByService?.rows?.length) return [];
    const headers = costData.costByService.headers;
    const rows = costData.costByService.rows;
    const serviceIdx = headers.findIndex((h) => h.toLowerCase().includes("service"));
    const valueIdx = headers.findIndex((h) => h.toLowerCase().includes("net_cost_mtd") || h.toLowerCase() === "value");
    return rows.slice(0, 8).map((row) => ({ service: row[serviceIdx] || "—", value: row[valueIdx] || "—" }));
  }, [costData]);

  const hasRealCost = String(costData?.billingExportPresent || "").toLowerCase() === "sim";
  const waitingFirstExportLoad = !hasRealCost && !!costData?.billingExportDatasetDetected;
  const billingState = humanBilling(costData?.billingEnabled);

  return (
    <AppShell
      title="Configurações"
      subtitle="Painel central de perfil, trading e custos"
      rightActions={
        activeTab === "profile"
          ? <button className="btn" onClick={save}>Salvar perfil</button>
          : activeTab === "costs"
            ? (
              <>
                <button className="btn" onClick={loadCosts}>Atualizar</button>
                <button className="btn" onClick={() => recalcCosts(false)}>{costRefreshing ? "Recalculando..." : "Recalcular custos"}</button>
              </>
            )
            : null
      }
    >
      <div className="section">
        <div className="settings-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`settings-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => selectTab(tab.id)}
            >
              <span className="settings-tab-title">{tab.label}</span>
              <span className="settings-tab-hint">{tab.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === "profile" ? (
        <div className="section">
          <div className="card settings-hero">
            <div className="card-title"><strong>Seu perfil de alertas</strong><span className="chip">Simples de entender</span></div>
            <p className="settings-help">Defina para quem os alertas vão, em que frequência e qual nível mínimo de qualidade você quer receber.</p>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title"><strong>Preferências pessoais</strong><span className="chip">Perfil</span></div>
            <div className="grid2">
              <label>
                Email para receber alertas
                <input value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="seu@email.com" />
              </label>
              <label>
                Atualização de preços (minutos)
                <input type="number" min="1" max="60" value={quoteRefreshMinutes} onChange={(e) => setQuoteRefreshMinutes(e.target.value)} />
              </label>
              <label>
                Score mínimo para alertar
                <input type="number" min="0" max="100" value={minScoreAlert} onChange={(e) => setMinScoreAlert(e.target.value)} />
              </label>
              <div className="settings-toggle-wrap">
                <label className="settings-inline-check">
                  <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                  Ativar alertas por email
                </label>
                <p className="settings-help">Se desativar, você ainda acessa tudo no app, mas não recebe aviso automático no email.</p>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={save}>Salvar alterações</button>
              {saved ? <span className="chip" style={{ marginLeft: 8 }}>Configurações salvas</span> : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "trading" ? (
        <div className="section">
          <div className="card settings-hero-trading">
            <div className="card-title"><strong>Controle de operação do robô</strong><span className="chip">Trading explicado</span></div>
            <p className="settings-help">
              Aqui você controla segurança e intensidade do robô. Use modo <strong>PAPER</strong> para simular,
              <strong> TESTNET</strong> para testar com ambiente de homologação e <strong>LIVE</strong> apenas quando estiver seguro.
            </p>
          </div>

          <div className="grid2" style={{ marginTop: 12 }}>
            <div className="card">
              <div className="card-title"><strong>Estado operacional</strong><span className={`chip ${tradingConfig?.enabled ? "badge buy" : "badge wait"}`}>{tradingConfig?.enabled ? "Rodando" : "Pausado"}</span></div>
              <div className="row"><span>Modo atual</span><span className="mono">{formatMaybe(tradingConfig?.mode || "PAPER")}</span></div>
              <div className="row"><span>Última execução</span><span className="mono">{formatMaybe(tradingState?.lastRunAt)}</span></div>
              <div className="row"><span>Posições abertas</span><span className="mono">{Number(tradingState?.openPositionsCount || 0)}</span></div>
              <div className="row"><span>Resumo da última rodada</span><span className="mono">{formatMaybe(tradingState?.lastSummary)}</span></div>
              <div className="row"><span>Último erro</span><span className="mono">{formatMaybe(tradingState?.lastError)}</span></div>
            </div>

            <div className="card">
              <div className="card-title"><strong>Ações rápidas</strong><span className="chip">Segurança</span></div>
              <p className="settings-help">Use estes botões para pausar, retomar ou parar tudo imediatamente.</p>
              <div className="settings-actions-wrap">
                <button className="btn" onClick={toggleTrading}>{tradingConfig?.enabled ? "Pausar trading" : "Ativar trading"}</button>
                <button className="btn btn-danger" onClick={triggerEmergencyStop}>Emergency Stop</button>
              </div>
              <p className="settings-help">Emergency Stop desliga operações imediatamente e deve ser usado em situação de risco.</p>
            </div>
          </div>

          {/* Executor externo TESTNET */}
          {(tradingConfig?.mode === "TESTNET" || executorStatus) && (
            <div className="card" style={{ marginTop: 12, borderLeft: `4px solid ${executorStatus?.online ? "var(--good)" : "#9CA3AF"}` }}>
              <div className="card-title">
                <strong>Executor Externo TESTNET</strong>
                <span className={`chip ${executorStatus?.online ? "badge buy" : "badge wait"}`}>
                  {executorStatus?.online ? "● ONLINE" : "○ OFFLINE"}
                </span>
              </div>
              <p className="settings-help" style={{ marginBottom: 8 }}>
                A Binance bloqueia execuções a partir de IPs de datacenter (GCP). O executor externo
                roda localmente (seu PC/notebook/VPS) e executa as ordens na Binance TESTNET.
                Sem executor online, nenhuma entrada TESTNET é feita.
              </p>
              {executorStatus ? (
                <>
                  <div className="row"><span>Último heartbeat</span><span className="mono">{executorStatus.ageSec != null ? `${executorStatus.ageSec}s atrás` : "—"}</span></div>
                  <div className="row"><span>Versão</span><span className="mono">{executorStatus.version || "—"}</span></div>
                  <div className="row"><span>Intents pendentes</span><span className="mono">{pendingIntents.length}</span></div>
                </>
              ) : (
                <div className="row"><span>Sem heartbeat registrado. Rode o executor localmente.</span></div>
              )}
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>Como iniciar o executor</summary>
                <pre style={{ fontSize: 11, backgroundColor: "var(--bg2)", padding: 8, borderRadius: 4, overflowX: "auto", marginTop: 4 }}>{`# No seu PC / VPS (fora do GCP)
export GCP_PROJECT_ID=botbit-489114
export BINANCE_TESTNET_API_KEY=<sua_chave>
export BINANCE_TESTNET_API_SECRET=<seu_secret>
export GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json

pip install google-cloud-firestore google-cloud-bigquery requests
python tools/testnet_executor.py`}</pre>
              </details>
            </div>
          )}

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title"><strong>Escolha do modo</strong><span className="chip">Passo a passo</span></div>
            <div className="settings-actions-wrap">
              <button className="btn" onClick={() => setTradingMode("PAPER")}>PAPER (simulação segura)</button>
              <button className="btn" onClick={() => setTradingMode("TESTNET")}>TESTNET (teste realista)</button>
              <button className="btn" onClick={() => setTradingMode("LIVE")}>LIVE (produção)</button>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Para liberar LIVE, digite LIVE" />
              <button className="btn" onClick={confirmLiveMode}>Confirmar modo LIVE</button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title"><strong>Limites de risco (explicados)</strong><span className="chip">Proteção de capital</span></div>
            <div className="grid cols-3">
              <label>
                Máximo de posições abertas
                <input type="number" value={Number(tradingConfig?.maxOpenPositions || 2)} onChange={(e) => saveTradingPatch({ maxOpenPositions: Number(e.target.value || 2) })} />
              </label>
              <label>
                Máximo de trades por dia
                <input type="number" value={Number(tradingConfig?.maxTradesPerDay || 2)} onChange={(e) => saveTradingPatch({ maxTradesPerDay: Number(e.target.value || 2) })} />
              </label>
              <label>
                Risco por trade (%)
                <input type="number" step="0.01" value={Number(tradingConfig?.riskPerTradePct || 0.75)} onChange={(e) => saveTradingPatch({ riskPerTradePct: Number(e.target.value || 0.75) })} />
              </label>
              <label>
                Perda máxima diária (%)
                <input type="number" step="0.1" value={Number(tradingConfig?.maxDailyLossPct || 2.5)} onChange={(e) => saveTradingPatch({ maxDailyLossPct: Number(e.target.value || 2.5) })} />
              </label>
              <label>
                Tamanho máximo por trade (%)
                <input type="number" step="0.1" value={Number(tradingConfig?.maxNotionalPerTradePct || 35)} onChange={(e) => saveTradingPatch({ maxNotionalPerTradePct: Number(e.target.value || 35) })} />
              </label>
              <label>
                Tempo de descanso entre sinais (horas)
                <input type="number" value={Number(tradingConfig?.cooldownHours || 24)} onChange={(e) => saveTradingPatch({ cooldownHours: Number(e.target.value || 24) })} />
              </label>
            </div>
            <p className="settings-help">Esses limites evitam excesso de exposição e ajudam a manter previsibilidade operacional.</p>
          </div>

          {tradingMessage ? <div className="chip" style={{ marginTop: 12 }}>{tradingMessage}</div> : null}
        </div>
      ) : null}

      {activeTab === "costs" ? (
        <div className="section">
          <div className="card settings-hero-cost">
            <div className="card-title"><strong>Painel de custos do GCP</strong><span className="chip">Financeiro</span></div>
            <p className="settings-help">
              Esta aba mostra o gasto em nuvem de forma simples. Se o export detalhado ainda estiver carregando,
              você verá uma estimativa proxy até os custos reais ficarem disponíveis.
            </p>
            <div className="costs-status-row">
              <span className={billingState === "Ativo" ? "badge buy" : "badge avoid"}>Billing: {billingState}</span>
              <span className={hasRealCost ? "badge buy" : "badge wait"}>Export: {hasRealCost ? "com custo real" : "sem custo real ainda"}</span>
              {waitingFirstExportLoad ? <span className="badge wait">Aguardando primeira carga do export</span> : null}
              <span className="badge wait">Auto refresh: 30 min</span>
            </div>
          </div>

          <div className="grid3" style={{ marginTop: 12 }}>
            <div className="card card-soft-blue">
              <div className="card-title"><strong>Custo MTD</strong><span className="chip">Mês atual</span></div>
              <div className="kpi">{showFriendlyMoney(costData?.mtd)}</div>
              <div className="row"><span>Forecast</span><span className="mono">{showFriendlyMoney(costData?.forecast)}</span></div>
              <div className="row"><span>Últimos 30 dias</span><span className="mono">{showFriendlyMoney(costData?.last30d)}</span></div>
            </div>
            <div className="card card-soft-green">
              <div className="card-title"><strong>Fonte dos dados</strong><span className="chip">Auditoria</span></div>
              <div className="row"><span>Dataset de export</span><span className="mono">{formatMaybe(costData?.billingExportDatasetDetected || "não detectado")}</span></div>
              <div className="row"><span>Tabela de export</span><span className="mono">{formatMaybe(costAuditRun?.billingExportTable || "ainda não criada")}</span></div>
              <div className="row"><span>Último auto refresh</span><span className="mono">{formatMaybe(lastAutoRefreshAt || "ainda não executado")}</span></div>
            </div>
            <div className="card card-soft-purple">
              <div className="card-title"><strong>Status da coleta</strong><span className="chip">Operação</span></div>
              <div className="row"><span>Modo</span><span className="mono">{formatMaybe(costAuditRun?.mode || "último arquivo")}</span></div>
              <div className="row"><span>Status</span><span className="mono">{costLoading ? "carregando" : costRefreshing ? "recalculando" : "ok"}</span></div>
              <div className="row"><span>Erro</span><span className="mono">{costError || "nenhum"}</span></div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title"><strong>Top serviços monitorados</strong><span className="chip">Custo / proxy</span></div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Serviço</th>
                    <th>Indicador</th>
                  </tr>
                </thead>
                <tbody>
                  {topServices.length === 0 ? (
                    <tr><td colSpan={3}>Sem dados de serviços ainda.</td></tr>
                  ) : topServices.map((item, idx) => (
                    <tr key={`${item.service}-${idx}`}>
                      <td className="mono">{idx + 1}</td>
                      <td className="asset">{item.service}</td>
                      <td className="mono">{item.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
