"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { getUserSettings, updateUserSettings } from "../../lib/firestore";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import { emergencyStopTrading, subscribeTradingConfig, subscribeTradingState, updateTradingConfig, subscribeExecutorStatus, subscribePendingIntents } from "../../lib/firestore";
import { fetchBinanceValidate, fetchLiveGateStatus } from "../../lib/backend";

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
  const [binanceValidation, setBinanceValidation] = useState(null);
  const [binanceValidating, setBinanceValidating] = useState(false);
  const [gateStatus, setGateStatus] = useState(null);
  const [gateLoading, setGateLoading] = useState(false);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);

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

  async function setLiveModeConfirmed() {
    // Sets mode=LIVE only after explicit double-confirmation
    await saveTradingPatch({ mode: "LIVE" });
    setShowLiveConfirm(false);
    await loadGateStatus();
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

          {/* ── Escolha do modo (com guarda LIVE) ── */}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">
              <strong>Escolha do modo</strong>
              <span className={`chip badge ${
                tradingConfig?.mode === "LIVE" ? "avoid"
                : tradingConfig?.mode === "TESTNET" ? "buy"
                : "wait"
              }`}>{tradingConfig?.mode || "PAPER"}</span>
            </div>
            <div className="settings-actions-wrap">
              <button className="btn" onClick={() => saveTradingPatch({ mode: "PAPER" })}>PAPER (simulação segura)</button>
              <button className="btn" onClick={() => saveTradingPatch({ mode: "TESTNET" })}>TESTNET (teste realista)</button>
              <button
                className="btn"
                style={{ color: "#FCA5A5", borderColor: "rgba(239,68,68,.4)", background: "rgba(239,68,68,.1)" }}
                onClick={() => setShowLiveConfirm(true)}
              >
                ⚠️ LIVE (dinheiro real)
              </button>
            </div>
            {showLiveConfirm && (
              <div style={{
                marginTop: 14, padding: "16px",
                background: "rgba(239,68,68,.1)",
                border: "1px solid rgba(239,68,68,.4)",
                borderRadius: 8,
              }}>
                <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#FCA5A5", fontSize: "var(--fs-sm)" }}>
                  ⚠️ Você está ativando o modo LIVE. Isso permite execuções com dinheiro real na Binance.
                  O bot APENAS operará se os 4 gates abaixo estiverem abertos.
                </p>
                <p style={{ margin: "0 0 12px", fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
                  Mudar o modo para LIVE NOT abre os gates automáticos — você ainda precisa confirmar o Gate 2
                  e o operador precisa armar os secrets no Cloud Run.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    style={{ color: "#FCA5A5", borderColor: "rgba(239,68,68,.4)", background: "rgba(239,68,68,.15)" }}
                    onClick={setLiveModeConfirmed}
                  >
                    Confirmar: definir modo LIVE
                  </button>
                  <button className="btn" onClick={() => setShowLiveConfirm(false)}>Cancelar</button>
                </div>
              </div>
            )}
            <p className="settings-help" style={{ marginTop: 10 }}>
              Modo LIVE ativo nunca executa ordens automaticamente sem todos os gates abertos.
              Mesmo com modo=LIVE, o backend bloqueia se os secrets não estiverem configurados.
            </p>
          </div>

          {/* ── Gates de proteção LIVE ── */}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">
              <strong>Gates de proteção LIVE</strong>
              {gateStatus?.ok
                ? <span className="chip badge buy">✓ TODOS ABERTOS — CUIDADO</span>
                : <span className="chip badge wait">Bloqueado — sem risco</span>}
              <button className="btn" onClick={loadGateStatus} disabled={gateLoading}
                style={{ padding: "3px 10px", fontSize: "var(--fs-xs)", marginLeft: "auto" }}>
                {gateLoading ? "⏳" : "↺ Verificar"}
              </button>
            </div>
            <p className="settings-help">
              O bot executa ordens LIVE SOMENTE se os 4 checks abaixo passarem simultaneamente.
              Clique em ↺ Verificar para ver o status real diretamente do servidor.
            </p>

            {gateStatus?.error && (
              <p style={{ color: "var(--danger)", fontSize: "var(--fs-sm)" }}>Erro: {gateStatus.error}</p>
            )}

            {gateStatus && !gateStatus.error && (() => {
              const g = gateStatus.gates || {};
              const GateRow = ({ label, ok, detail }) => (
                <div className="row" style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.07)", alignItems: "flex-start" }}>
                  <div>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>{label}</span>
                    {detail && <p className="settings-help" style={{ margin: "2px 0 0" }}>{detail}</p>}
                  </div>
                  <span className={`chip badge ${ok ? "buy" : "avoid"}`} style={{ flexShrink: 0 }}>
                    {ok ? "✓ Aberto" : "✗ Fechado"}
                  </span>
                </div>
              );
              return (
                <>
                  <GateRow
                    label="Gate 1A — Trading ativado (enabled)"
                    ok={g.g1_enabled}
                    detail="O switch enabled precisa estar ON no Firestore."
                  />
                  <GateRow
                    label="Gate 1B — Modo definido como LIVE"
                    ok={g.g1_mode_live}
                    detail={`Modo atual: ${gateStatus.mode}`}
                  />
                  <GateRow
                    label="Gate 2A — Confirmação LIVE digitada"
                    ok={g.g2_confirmed && g.g2_text_ok}
                    detail="liveGuard.liveConfirmed=true e texto digitado correto."
                  />
                  <GateRow
                    label={`Gate 2B — Cooldown de ${g.g2_cooldown_remaining_minutes != null ? Math.ceil(g.g2_cooldown_remaining_minutes) : 5} min decorrido`}
                    ok={g.g2_cooldown_ok}
                    detail={g.g2_cooldown_remaining_minutes > 0
                      ? `Aguardando ${Math.ceil(g.g2_cooldown_remaining_minutes)} min após confirmação.`
                      : "Cooldown já decorrido."}
                  />
                  <GateRow
                    label="Gate 3 — Secret LIVE_TRADING_ENABLED no Cloud Run"
                    ok={g.g3_feature_flag_enabled}
                    detail={'Secret LIVE_TRADING_ENABLED="true" deve estar no Cloud Run. Controlado pelo operador via gcloud.'}
                  />
                  <GateRow
                    label="Gate 4 — Secret LIVE_TRADING_ARMED no Cloud Run"
                    ok={g.g4_armed}
                    detail={'Secret LIVE_TRADING_ARMED="YES_I_KNOW_WHAT_IM_DOING" deve estar no Cloud Run. Última barreira — sem ela nenhuma ordem LIVE é enviada.'}
                  />
                </>
              );
            })()}

            {/* Sem status ainda */}
            {!gateStatus && (
              <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)" }}>
                Clique em ↺ Verificar para consultar o status real dos gates no servidor.
              </p>
            )}

            {/* Confirmar Gate 2 */}
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 14 }}>
              <strong style={{ fontSize: "var(--fs-sm)", color: "var(--text)" }}>Confirmar Gate 2 — digite LIVE e confirme</strong>
              <p className="settings-help">Inicia o cooldown de 5 minutos. Após isso o check Gate 2B passa automaticamente.</p>
              <div className="row" style={{ marginTop: 8 }}>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Digite LIVE aqui"
                  style={{ border: confirmText.toUpperCase() === "LIVE" ? "1px solid rgba(239,68,68,.5)" : undefined }}
                />
                <button
                  className="btn"
                  style={{ color: "#FCA5A5", borderColor: "rgba(239,68,68,.4)", background: "rgba(239,68,68,.1)" }}
                  onClick={async () => { await confirmLiveMode(); setTimeout(loadGateStatus, 500); }}
                  disabled={confirmText.toUpperCase() !== "LIVE"}
                >
                  Confirmar Gate 2
                </button>
              </div>
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
