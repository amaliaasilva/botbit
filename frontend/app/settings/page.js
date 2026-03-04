"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { getUserSettings, updateUserSettings } from "../../lib/firestore";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import { emergencyStopTrading, subscribeTradingConfig, subscribeTradingState, updateTradingConfig, subscribeExecutorStatus, subscribePendingIntents, subscribeRestingIntents } from "../../lib/firestore";
import { fetchBinanceValidate, fetchLiveGateStatus, triggerAlertTest, triggerRunDiscover, triggerRunScore } from "../../lib/backend";

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
  const [liveField1, setLiveField1] = useState("");
  const [liveField2, setLiveField2] = useState("");
  const [tradingMessage, setTradingMessage] = useState("");
  const [executorStatus, setExecutorStatus] = useState(null);
  const [pendingIntents, setPendingIntents] = useState([]);
  const [restingIntents, setRestingIntents] = useState([]);
  const [binanceValidation, setBinanceValidation] = useState(null);
  const [binanceValidating, setBinanceValidating] = useState(false);
  const [gateStatus, setGateStatus] = useState(null);
  const [gateLoading, setGateLoading] = useState(false);
  const [alertTestResult, setAlertTestResult] = useState(null);
  const [alertTestLoading, setAlertTestLoading] = useState(false);
  const [discoverRunning, setDiscoverRunning] = useState(false);
  const [discoverResult, setDiscoverResult] = useState(null);
  const [scoreRunning, setScoreRunning] = useState(false);
  const [scoreResult, setScoreResult] = useState(null);

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
  useEffect(() => subscribeRestingIntents((items) => setRestingIntents(items)), []);

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
    const confirmed =
      liveField1.trim().toUpperCase() === "LIVE" &&
      liveField2.trim().toUpperCase() === "EU CONFIRMO";
    await updateTradingConfig({
      liveGuard: {
        ...(tradingConfig?.liveGuard || {}),
        typedText: liveField1.trim(),
        typedText2: liveField2.trim(),
        liveConfirmed: confirmed,
        liveConfirmedAt: new Date().toISOString(),
      },
    });
    if (confirmed) {
      setTradingMessage("✓ LIVE confirmado. Bot pode operar com dinheiro real.");
    } else {
      setTradingMessage("Textos incorretos — confirmação não gravada.");
    }
    setTimeout(() => setTradingMessage(""), 3000);
  }

  async function triggerEmergencyStop() {
    await emergencyStopTrading();
    setTradingMessage("Emergency Stop aplicado com sucesso");
    setTimeout(() => setTradingMessage(""), 2000);
  }

  async function runDiscover() {
    setDiscoverRunning(true);
    setDiscoverResult(null);
    try {
      const res = await triggerRunDiscover();
      setDiscoverResult({ ok: true, msg: `Discover atualizado — ${res.updated ?? res.total ?? ""} ativos processados.` });
    } catch (e) {
      setDiscoverResult({ ok: false, msg: e.message });
    } finally {
      setDiscoverRunning(false);
    }
  }

  async function runScore() {
    setScoreRunning(true);
    setScoreResult(null);
    try {
      const res = await triggerRunScore();
      setScoreResult({ ok: true, msg: `Score atualizado — ${res.updated ?? res.scored ?? res.total ?? ""} ativos pontuados.` });
    } catch (e) {
      setScoreResult({ ok: false, msg: e.message });
    } finally {
      setScoreRunning(false);
    }
  }

  async function validateBinance() {
    setBinanceValidating(true);
    setBinanceValidation(null);
    try {
      const res = await fetchBinanceValidate();
      setBinanceValidation({ ok: true, ...res });
    } catch (e) {
      let detail = e.message;
      try { detail = JSON.parse(e.message.replace(/^Backend \d+: /, ""))?.message || detail; } catch {}
      setBinanceValidation({ ok: false, error: detail });
    } finally {
      setBinanceValidating(false);
    }
  }

  async function loadGateStatus() {
    setGateLoading(true);
    try {
      const res = await fetchLiveGateStatus();
      setGateStatus(res);
    } catch (e) {
      setGateStatus({ error: e.message });
    } finally {
      setGateLoading(false);
    }
  }

  async function sendTestAlert() {
    setAlertTestLoading(true);
    setAlertTestResult(null);
    try {
      const res = await triggerAlertTest();
      setAlertTestResult(res);
    } catch (e) {
      setAlertTestResult({ ok: false, error: e.message });
    } finally {
      setAlertTestLoading(false);
    }
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

            <div className="card">
              <div className="card-title"><strong>Atualização manual</strong><span className="chip">Operação</span></div>
              <p className="settings-help">Força a execução imediata dos pipelines sem esperar o próximo ciclo automático.</p>
              <div className="settings-actions-wrap" style={{ flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button
                    className="btn"
                    onClick={runDiscover}
                    disabled={discoverRunning}
                    style={{ minWidth: 180 }}
                  >
                    {discoverRunning ? "⏳ Executando…" : "⚡ Forçar Discover"}
                  </button>
                  {discoverResult && (
                    <span style={{ fontSize: 12, color: discoverResult.ok ? "var(--good)" : "var(--danger)" }}>
                      {discoverResult.ok ? "✓ " : "✗ "}{discoverResult.msg}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button
                    className="btn"
                    onClick={runScore}
                    disabled={scoreRunning}
                    style={{ minWidth: 180 }}
                  >
                    {scoreRunning ? "⏳ Executando…" : "⚡ Forçar Score/Mercado"}
                  </button>
                  {scoreResult && (
                    <span style={{ fontSize: 12, color: scoreResult.ok ? "var(--good)" : "var(--danger)" }}>
                      {scoreResult.ok ? "✓ " : "✗ "}{scoreResult.msg}
                    </span>
                  )}
                </div>
              </div>
              <p className="settings-help" style={{ marginTop: 8 }}>
                Discover: varre novos ativos candidatos. Score/Mercado: recalcula pontuação e atualiza sinais.
                Cada execução pode levar 30–90 segundos.
              </p>
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

          {/* ── Modo de operação ── */}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">
              <strong>Modo de operação</strong>
              <span className={`chip badge ${
                tradingConfig?.mode === "LIVE" ? "avoid"
                : tradingConfig?.mode === "TESTNET" ? "buy"
                : "wait"
              }`}>{tradingConfig?.mode || "PAPER"}</span>
            </div>
            <div className="settings-actions-wrap">
              <button className="btn" onClick={() => saveTradingPatch({ mode: "PAPER" })}>PAPER</button>
              <button className="btn" onClick={() => saveTradingPatch({ mode: "TESTNET" })}>TESTNET</button>
              <button
                className="btn"
                style={{ color: "#FCA5A5", borderColor: "rgba(239,68,68,.4)", background: "rgba(239,68,68,.1)" }}
                onClick={() => saveTradingPatch({ mode: "LIVE" })}
              >
                LIVE
              </button>
            </div>
            <p className="settings-help" style={{ marginTop: 10 }}>
              Mudar o modo não autoriza ordens. Você ainda precisa preencher a confirmação LIVE abaixo.
            </p>
          </div>

          {/* ── Confirmação LIVE (duplo campo) ── */}
          <div className="card" style={{
            marginTop: 12,
            borderColor: tradingConfig?.liveGuard?.liveConfirmed ? "rgba(239,68,68,.4)" : undefined,
          }}>
            <div className="card-title">
              <strong>Confirmação LIVE</strong>
              {tradingConfig?.liveGuard?.liveConfirmed
                ? <span className="chip badge avoid">⚠ ATIVO — conta real</span>
                : <span className="chip badge wait">Desativado</span>}
              <button className="btn" onClick={loadGateStatus} disabled={gateLoading}
                style={{ padding: "3px 10px", fontSize: "var(--fs-xs)", marginLeft: "auto" }}>
                {gateLoading ? "⏳" : "↺ Verificar"}
              </button>
            </div>
            <p className="settings-help">
              Para autorizar ordens LIVE com dinheiro real, preencha os dois campos e clique em Confirmar.
              Para revogar, clique em Revogar ou use Emergency Stop.
            </p>

            {gateStatus && !gateStatus.error && (() => {
              const g = gateStatus.gates || {};
              const Row = ({ label, ok }) => (
                <div className="row" style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
                  <span style={{ color: "var(--text)" }}>{label}</span>
                  <span className={`chip badge ${ok ? "buy" : "avoid"}`} style={{ flexShrink: 0 }}>
                    {ok ? "✓" : "✗"}
                  </span>
                </div>
              );
              return (
                <div style={{ marginBottom: 12 }}>
                  <Row label="Bot ativado (enabled)" ok={g.g1_enabled} />
                  <Row label="Modo = LIVE" ok={g.g1_mode_live} />
                  <Row label="Campo 1 correto (LIVE)" ok={g.g2_field1_ok} />
                  <Row label="Campo 2 correto (EU CONFIRMO)" ok={g.g2_field2_ok} />
                </div>
              );
            })()}

            {gateStatus?.error && (
              <p style={{ color: "var(--danger)", fontSize: "var(--fs-sm)", marginBottom: 8 }}>Erro: {gateStatus.error}</p>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--fs-sm)" }}>
                Campo 1 — digite exatamente: <strong>LIVE</strong>
                <input
                  value={liveField1}
                  onChange={(e) => setLiveField1(e.target.value)}
                  placeholder="LIVE"
                  style={{ border: liveField1.toUpperCase() === "LIVE" ? "1px solid rgba(239,68,68,.5)" : undefined }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--fs-sm)" }}>
                Campo 2 — digite exatamente: <strong>EU CONFIRMO</strong>
                <input
                  value={liveField2}
                  onChange={(e) => setLiveField2(e.target.value)}
                  placeholder="EU CONFIRMO"
                  style={{ border: liveField2.toUpperCase() === "EU CONFIRMO" ? "1px solid rgba(239,68,68,.5)" : undefined }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="btn"
                style={{
                  color: "#FCA5A5",
                  borderColor: "rgba(239,68,68,.4)",
                  background: "rgba(239,68,68,.1)",
                  opacity: (liveField1.toUpperCase() === "LIVE" && liveField2.toUpperCase() === "EU CONFIRMO") ? 1 : 0.4,
                }}
                disabled={liveField1.toUpperCase() !== "LIVE" || liveField2.toUpperCase() !== "EU CONFIRMO"}
                onClick={async () => { await confirmLiveMode(); setTimeout(loadGateStatus, 500); }}
              >
                Confirmar — autorizar LIVE
              </button>
              <button className="btn" onClick={() => {
                updateTradingConfig({ liveGuard: { liveConfirmed: false, typedText: "", typedText2: "", liveConfirmedAt: null } });
                setLiveField1(""); setLiveField2("");
                setTradingMessage("Autorização LIVE revogada.");
                setTimeout(() => setTradingMessage(""), 2000);
              }}>
                Revogar
              </button>
            </div>
          </div>

          {/* ── Validar credenciais Binance ── */}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">
              <strong>Validar credenciais Binance</strong>
              <span className="chip">{tradingConfig?.mode || "PAPER"}</span>
            </div>
            <p className="settings-help">
              Testa se as chaves configuradas no backend conseguem autenticar na Binance
              ({tradingConfig?.mode === "TESTNET" ? "Testnet" : tradingConfig?.mode === "LIVE" ? "LIVE" : "PAPER — sem chaves"}).
            </p>
            <button className="btn" onClick={validateBinance} disabled={binanceValidating}>
              {binanceValidating ? "Validando…" : "Testar conexão Binance"}
            </button>
            {binanceValidation && (
              <div style={{
                marginTop: 10,
                padding: "10px 14px",
                borderRadius: 6,
                background: binanceValidation.ok ? "var(--good-dim)" : "var(--danger-dim)",
                border: `1px solid ${binanceValidation.ok ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}`,
              }}>
                {binanceValidation.ok ? (
                  <>
                    <div className="row"><span>Status</span><span className="mono" style={{ color: "var(--good)" }}>✓ Conectado — canTrade: {String(binanceValidation.canTrade)}</span></div>
                    <div className="row"><span>Modo testado</span><span className="mono">{binanceValidation.mode}</span></div>
                    <div className="row"><span>Permissões</span><span className="mono">{(binanceValidation.permissions || []).join(", ") || "—"}</span></div>
                    <div className="row"><span>Ativos com saldo</span><span className="mono">{binanceValidation.balancesCount ?? "—"}</span></div>
                  </>
                ) : (
                  <div className="row"><span style={{ color: "var(--danger)" }}>Erro</span><span className="mono" style={{ color: "#FCA5A5" }}>{binanceValidation.error}</span></div>
                )}
              </div>
            )}
          </div>

          {/* ── Testar notificações ── */}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">
              <strong>Notificações</strong>
              {gateStatus && (
                <span className={`chip badge ${gateStatus.alertsConfigured ? "buy" : "avoid"}`}>
                  {gateStatus.alertsConfigured ? "✓ Webhook configurado" : "⚠ Webhook não configurado"}
                </span>
              )}
            </div>
            <p className="settings-help">
              Alertas automáticos vão para o email via AppScript quando há sinal BUY, mudança de regime ou score jump ≥10.
              Os alertas in-app (sino) funcionam independente do email.
            </p>

            {/* Diagnóstico inline se já consultou o gate status */}
            {gateStatus && !gateStatus.error && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <span className={`chip badge ${gateStatus.alertWebhookSet ? "buy" : "avoid"}`}>
                  AppScript URL {gateStatus.alertWebhookSet ? "✓" : "✗ não montada"}
                </span>
                <span className={`chip badge ${gateStatus.alertTokenSet ? "buy" : "avoid"}`}>
                  Token {gateStatus.alertTokenSet ? "✓" : "✗ não montado"}
                </span>
                <span className={`chip badge ${gateStatus.alertEmailSet ? "buy" : "avoid"}`}>
                  Email destino {gateStatus.alertEmailSet ? "✓" : "✗ não montado"}
                </span>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn" onClick={sendTestAlert} disabled={alertTestLoading}>
                {alertTestLoading ? "Enviando…" : "🔔 Enviar notificação de teste"}
              </button>
              {!gateStatus && (
                <button className="btn" onClick={loadGateStatus} disabled={gateLoading}
                  style={{ fontSize: "var(--fs-xs)", padding: "5px 12px" }}>
                  {gateLoading ? "…" : "Verificar configuração"}
                </button>
              )}
            </div>

            {alertTestResult && (
              <div style={{
                marginTop: 10, padding: "10px 14px", borderRadius: 6,
                background: alertTestResult.ok ? "var(--good-dim)" : "var(--danger-dim)",
                border: `1px solid ${alertTestResult.ok ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}`,
              }}>
                {alertTestResult.ok ? (
                  <>
                    <div className="row"><span>Notif. in-app escrita</span><span className="mono" style={{ color: "var(--good)" }}>{alertTestResult.inAppWritten ? "✓ Sim" : "✗ Não"}</span></div>
                    <div className="row"><span>Email enviado</span><span className="mono" style={{ color: alertTestResult.emailSent ? "var(--good)" : "var(--warn)" }}>{alertTestResult.emailSent ? `✓ Enviado para ${alertTestResult.emailTarget}` : "Não enviado"}</span></div>
                    {alertTestResult.emailSkipped && <div className="row"><span>Motivo</span><span className="mono" style={{ color: "var(--muted)" }}>{alertTestResult.emailSkipped}</span></div>}
                    {alertTestResult.emailError && <div className="row"><span>Erro email</span><span className="mono" style={{ color: "#FCA5A5" }}>{alertTestResult.emailError}</span></div>}
                    <div className="row"><span>Webhook</span><span className="mono">{alertTestResult.webhookConfigured ? "✓" : "✗"}</span></div>
                    <div className="row"><span>Token</span><span className="mono">{alertTestResult.tokenConfigured ? "✓" : "✗"}</span></div>
                    <div className="row"><span>Email destino</span><span className="mono">{alertTestResult.emailConfigured ? `✓ ${alertTestResult.emailTarget}` : "✗ não configurado"}</span></div>
                  </>
                ) : (
                  <div className="row"><span style={{ color: "var(--danger)" }}>Erro</span><span className="mono" style={{ color: "#FCA5A5" }}>{alertTestResult.error}</span></div>
                )}
              </div>
            )}
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

          {/* ── Resting Order (Always On) ── */}
          <div className="card" style={{
            marginTop: 12,
            borderLeft: `4px solid ${tradingConfig?.resting?.enabled ? "var(--good)" : "rgba(156,163,175,.4)"}`,
          }}>
            <div className="card-title">
              <strong>Resting Order (Always On)</strong>
              <span className={`chip badge ${tradingConfig?.resting?.enabled ? "buy" : "wait"}`}>
                {tradingConfig?.resting?.enabled ? "● ATIVA" : "○ DESATIVADA"}
              </span>
            </div>
            <p className="settings-help" style={{ marginBottom: 10 }}>
              Quando ativado, o bot mantém sempre 1 ordem LIMIT BUY GTC aberta enquanto não há posição aberta.
              O candidato é selecionado por prioridade: STRICT → FALLBACK → ANCHOR.
              A ordem é cancelada/recriada se o regime virar Baixa, sinal virar AVOID, ou após o tempo de refresh.
            </p>

            {/* Enable/disable toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <button
                className="btn"
                onClick={() => saveTradingPatch({ resting: { ...(tradingConfig?.resting || {}), enabled: true } })}
                style={tradingConfig?.resting?.enabled ? { borderColor: "var(--good)", color: "var(--good)" } : {}}
              >
                Ativar
              </button>
              <button
                className="btn"
                onClick={() => saveTradingPatch({ resting: { ...(tradingConfig?.resting || {}), enabled: false } })}
                style={!tradingConfig?.resting?.enabled ? { borderColor: "rgba(239,68,68,.4)", color: "#FCA5A5" } : {}}
              >
                Desativar
              </button>
            </div>

            {/* Config params */}
            <div className="grid cols-3" style={{ marginBottom: 12 }}>
              <label>
                Desconto % (discountPct)
                <input
                  type="number" step="0.001"
                  value={Number(tradingConfig?.resting?.discountPct ?? 0.008)}
                  onChange={(e) => saveTradingPatch({ resting: { ...(tradingConfig?.resting || {}), discountPct: Number(e.target.value) } })}
                />
              </label>
              <label>
                Multiplicador ATR (atrMult)
                <input
                  type="number" step="0.1"
                  value={Number(tradingConfig?.resting?.atrMult ?? 0.8)}
                  onChange={(e) => saveTradingPatch({ resting: { ...(tradingConfig?.resting || {}), atrMult: Number(e.target.value) } })}
                />
              </label>
              <label>
                Refresh (minutos)
                <input
                  type="number"
                  value={Number(tradingConfig?.resting?.refreshMinutes ?? 60)}
                  onChange={(e) => saveTradingPatch({ resting: { ...(tradingConfig?.resting || {}), refreshMinutes: Number(e.target.value) } })}
                />
              </label>
              <label>
                Idade máxima (minutos)
                <input
                  type="number"
                  value={Number(tradingConfig?.resting?.maxOrderAgeMinutes ?? 360)}
                  onChange={(e) => saveTradingPatch({ resting: { ...(tradingConfig?.resting || {}), maxOrderAgeMinutes: Number(e.target.value) } })}
                />
              </label>
              <label>
                Tamanho relativo (fallbackSizeMultiplier)
                <input
                  type="number" step="0.05"
                  value={Number(tradingConfig?.resting?.fallbackSizeMultiplier ?? 0.25)}
                  onChange={(e) => saveTradingPatch({ resting: { ...(tradingConfig?.resting || {}), fallbackSizeMultiplier: Number(e.target.value) } })}
                />
              </label>
              <label>
                Âncoras (símbolos p/ fallback)
                <input
                  type="text"
                  value={(tradingConfig?.resting?.anchorSymbolsIfNone || ["BTCUSDT", "ETHUSDT"]).join(",")}
                  onChange={(e) => saveTradingPatch({ resting: { ...(tradingConfig?.resting || {}), anchorSymbolsIfNone: e.target.value.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) } })}
                />
              </label>
            </div>

            {/* Current resting intents */}
            <div className="card-title" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.08)" }}>
              <strong style={{ fontSize: "var(--fs-sm)" }}>Resting orders ativas</strong>
              <span className="chip">{restingIntents.length}</span>
            </div>
            {restingIntents.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", marginTop: 4 }}>Nenhuma resting order pendente no momento.</p>
            ) : (
              <div className="table-wrap" style={{ marginTop: 6 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Símbolo</th>
                      <th>Perfil</th>
                      <th>Preço limite</th>
                      <th>Qtd</th>
                      <th>Status</th>
                      <th>Criada em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restingIntents.map((ri) => {
                      const createdTs = ri.createdAt?.toDate ? ri.createdAt.toDate() : (ri.createdAt ? new Date(ri.createdAt) : null);
                      const ageMin = createdTs ? Math.round((Date.now() - createdTs.getTime()) / 60000) : null;
                      return (
                        <tr key={ri.id}>
                          <td className="asset">{ri.symbol || "—"}</td>
                          <td>
                            <span className={`chip badge ${ri.decisionProfile === "STRICT" ? "buy" : ri.decisionProfile === "FALLBACK" ? "wait" : "avoid"}`}>
                              {ri.decisionProfile || "—"}
                            </span>
                          </td>
                          <td className="mono">{ri.price != null ? ri.price.toFixed(6) : "—"}</td>
                          <td className="mono">{ri.quantity ?? "—"}</td>
                          <td><span className="chip badge wait">{ri.status}</span></td>
                          <td className="mono">{ageMin != null ? `${ageMin}m atrás` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
