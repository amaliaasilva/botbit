"use client";

import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import IAExplainPanel from "../../components/ui/IAExplainPanel";
import { fetchTradeIntents, fetchTradeStatus, triggerEmergencyStop, fetchExplain } from "../../lib/backend";

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(val, digits = 6) {
  if (val == null || val === "") return "—";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toFixed(digits);
}

function fmtDate(val) {
  if (!val) return "—";
  try {
    const d = val?.toDate ? val.toDate() : new Date(val?.seconds ? val.seconds * 1000 : val);
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(val);
  }
}

const STATUS_STYLE = {
  PENDING:      { color: "var(--warn)",   bg: "var(--warn-dim)" },
  SUBMITTED:    { color: "var(--accent)", bg: "var(--accent-dim)" },
  FILL_PENDING: { color: "var(--accent)", bg: "var(--accent-dim)" },
  FILLED:       { color: "var(--good)",   bg: "var(--good-dim)" },
  REJECTED:     { color: "var(--danger)", bg: "var(--danger-dim)" },
  CANCELLED:    { color: "var(--muted)",  bg: "rgba(255,255,255,.05)" },
  OCO_FAILED:   { color: "var(--warn)",   bg: "var(--warn-dim)" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { color: "var(--muted)", bg: "rgba(255,255,255,.05)" };
  return (
    <span style={{
      fontSize: "var(--fs-xs)", fontWeight: 600,
      padding: "3px 9px", borderRadius: 999,
      color: s.color, background: s.bg,
      border: `1px solid ${s.color}44`,
      whiteSpace: "nowrap",
    }}>
      {status || "—"}
    </span>
  );
}

function ModeBadge({ mode }) {
  if (!mode) return <span style={{ color: "var(--muted)" }}>—</span>;
  const isLive = mode === "LIVE";
  return (
    <span style={{
      fontSize: "var(--fs-xs)", fontWeight: 700,
      padding: "3px 8px", borderRadius: 6,
      color: isLive ? "#FCA5A5" : "#86EFAC",
      background: isLive ? "rgba(239,68,68,.14)" : "rgba(34,197,94,.14)",
      border: `1px solid ${isLive ? "rgba(239,68,68,.35)" : "rgba(34,197,94,.35)"}`,
    }}>
      {mode}
    </span>
  );
}

// ── IA Explain por linha ──────────────────────────────────────────────────────
function IntentExplainRow({ intent, onClose }) {
  const [state, setState] = useState("loading");
  const [explain, setExplain] = useState(null);

  useEffect(() => {
    if (!intent?.symbol) return;
    let cancelled = false;
    setState("loading");
    fetchExplain(intent.symbol)
      .then((res) => { if (!cancelled) { setExplain(res); setState("done"); } })
      .catch((e) => { if (!cancelled) { setExplain({ error: e.message }); setState("error"); } });
    return () => { cancelled = true; };
  }, [intent?.symbol]);

  return (
    <tr>
      <td colSpan={12} style={{ padding: 0, background: "var(--surface2)" }}>
        <div style={{
          margin: "0 12px 12px",
          padding: "16px 20px",
          borderLeft: "3px solid var(--accent)",
          borderRadius: "0 var(--r-sm) var(--r-sm) 0",
          background: "var(--surface)",
        }}>
          {/* cabeçalho */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--text)" }}>
                IA — Por que {intent.side === "BUY" ? "comprou" : "vendeu"} {intent.symbol}?
              </span>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", marginTop: 3 }}>
                Score {intent.score != null ? `${Number(intent.score).toFixed(0)}/100` : "—"} ·
                Regime {intent.regime ?? "—"} ·
                Sinal {intent.signal ?? "—"} ·
                {fmtDate(intent.createdAt)}
              </div>
            </div>
            <button className="btn" style={{ padding: "3px 10px", fontSize: "var(--fs-xs)", marginLeft: 12 }} onClick={onClose}>
              Fechar ✕
            </button>
          </div>

          {/* chips de contexto */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            <ModeBadge mode={intent.mode} />
            {intent.price    && <span className="chip">entry {fmt(intent.price, 2)}</span>}
            {intent.stopPrice && <span className="chip" style={{ color: "var(--danger)" }}>stop {fmt(intent.stopPrice, 2)}</span>}
            {intent.takePrice && <span className="chip" style={{ color: "var(--good)"   }}>take {fmt(intent.takePrice, 2)}</span>}
            {intent.quantity  && <span className="chip">qty {fmt(intent.quantity, 5)}</span>}
          </div>

          {state === "loading" && (
            <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)" }}>⟳ Consultando Gemini…</p>
          )}
          {state === "error" && (
            <p style={{ color: "var(--danger)", fontSize: "var(--fs-sm)" }}>
              Erro: {explain?.error}
            </p>
          )}
          {state === "done" && explain && (
            <IAExplainPanel
              leigo={explain.leigo || []}
              intermediario={explain.intermediario}
              tecnico={explain.tecnico}
              significado={explain.significado}
              riscoPrincipal={explain.riscoPrincipal}
              condicaoMudar={explain.condicaoMudar}
              source={explain.source}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
const FILTERS = ["ALL", "PENDING", "SUBMITTED", "FILL_PENDING", "FILLED", "REJECTED", "OCO_FAILED", "CANCELLED"];

export default function TradingPage() {
  const [authed, setAuthed] = useState(false);
  const [intents, setIntents] = useState([]);
  const [botStatus, setBotStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [stopMsg, setStopMsg] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [expandedId, setExpandedId] = useState(null);
  const router = useRouter();

  // auth gate
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push("/login"); return; }
      setAuthed(true);
    });
    return () => unsub();
  }, [router]);

  const load = useCallback(async () => {
    try {
      const [intentData, statusData] = await Promise.all([
        fetchTradeIntents({ limit: 200 }),
        fetchTradeStatus().catch(() => null),
      ]);
      setIntents(intentData?.intents || []);
      setBotStatus(statusData);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [authed, load]);

  const handleStop = async () => {
    if (!confirm("Confirma EMERGENCY STOP? O bot será desativado imediatamente.")) return;
    setStopping(true);
    try {
      const r = await triggerEmergencyStop();
      setStopMsg(r?.message || "Bot desativado com sucesso.");
      load();
    } catch (e) {
      setStopMsg(`Erro: ${e.message}`);
    } finally {
      setStopping(false);
    }
  };

  const visible = filter === "ALL" ? intents : intents.filter((i) => i.status === filter);
  const kpiFilled   = intents.filter((i) => i.status === "FILLED").length;
  const kpiRejected = intents.filter((i) => i.status === "REJECTED").length;
  const kpiPending  = intents.filter((i) => ["PENDING", "SUBMITTED", "FILL_PENDING"].includes(i.status)).length;
  const kpiMode     = botStatus?.mode || "—";
  const kpiEnabled  = botStatus?.enabled != null ? (botStatus.enabled ? "ATIVO" : "PARADO") : "—";
  const hasSellRejected = intents.some((i) => i.side === "SELL" && i.status === "REJECTED");

  return (
    <AppShell title="Trading" subtitle="Trilha de auditoria de ordens e intents">

      {/* ── KPIs ── */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card">
          <span className="kpi-card-label">Modo Bot</span>
          <span className="kpi-card-value" style={{ fontSize: "var(--fs-lg)" }}>{kpiMode}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Status Bot</span>
          <span className="kpi-card-value" style={{
            fontSize: "var(--fs-lg)",
            color: kpiEnabled === "ATIVO" ? "var(--good)" : "var(--danger)",
          }}>
            {kpiEnabled}
          </span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Total Intents</span>
          <span className="kpi-card-value">{intents.length}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Preenchidas</span>
          <span className="kpi-card-value" style={{ color: "var(--good)" }}>{kpiFilled}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Pendentes</span>
          <span className="kpi-card-value" style={{ color: "var(--warn)" }}>{kpiPending}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Rejeitadas</span>
          <span className="kpi-card-value" style={{ color: kpiRejected > 0 ? "var(--danger)" : "var(--muted)" }}>
            {kpiRejected}
          </span>
        </div>
      </div>

      {/* ── alertas ── */}
      {hasSellRejected && (
        <div className="card" style={{ marginBottom: 12, borderColor: "rgba(239,68,68,.35)", background: "var(--danger-dim)" }}>
          <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "#FCA5A5" }}>
            <strong>Atenção:</strong> há intents de SELL com status REJECTED. Verifique posições abertas manualmente.
          </p>
        </div>
      )}
      {stopMsg && (
        <div className="card" style={{ marginBottom: 12, borderColor: "rgba(245,158,11,.3)", background: "var(--warn-dim)" }}>
          <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--warn)" }}>{stopMsg}</p>
        </div>
      )}

      {/* ── tabela de intents ── */}
      <div className="card">
        {/* toolbar */}
        <div className="card-title" style={{ marginBottom: 14, alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <strong style={{ color: "var(--text)" }}>Trade Intents</strong>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="chip"
                  style={{
                    cursor: "pointer",
                    fontWeight: filter === f ? 700 : 500,
                    background: filter === f ? "var(--accent-dim)" : undefined,
                    color: filter === f ? "var(--accent)" : undefined,
                    borderColor: filter === f ? "rgba(79,142,247,.4)" : undefined,
                    transition: "all var(--t)",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <button className="btn" onClick={load} style={{ padding: "5px 14px", fontSize: "var(--fs-xs)" }}>
              ↺ Atualizar
            </button>
            <button
              className="btn"
              onClick={handleStop}
              disabled={stopping}
              style={{
                padding: "5px 14px", fontSize: "var(--fs-xs)",
                color: "#FCA5A5", borderColor: "rgba(239,68,68,.4)",
                background: "rgba(239,68,68,.1)",
                opacity: stopping ? 0.5 : 1,
              }}
            >
              {stopping ? "Parando…" : "⛔ Emergency Stop"}
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", textAlign: "center", padding: "24px 0" }}>
            Carregando…
          </p>
        ) : error ? (
          <p style={{ color: "var(--danger)", fontSize: "var(--fs-sm)", textAlign: "center", padding: "24px 0" }}>
            {error}
          </p>
        ) : visible.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", textAlign: "center", padding: "24px 0" }}>
            Nenhuma intent encontrada.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Símbolo</th>
                  <th>Lado</th>
                  <th>Modo</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Qtd</th>
                  <th style={{ textAlign: "right" }}>Preço</th>
                  <th style={{ textAlign: "right" }}>Stop</th>
                  <th style={{ textAlign: "right" }}>Take</th>
                  <th style={{ textAlign: "right" }}>Score</th>
                  <th>OrderId</th>
                  <th>IA</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((intent, idx) => {
                  const id = intent.intentId || `${intent.symbol}-${idx}`;
                  const isExpanded = expandedId === id;
                  return [
                    <tr
                      key={id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setExpandedId(isExpanded ? null : id)}
                    >
                      <td style={{ whiteSpace: "nowrap", color: "var(--muted)", fontSize: "var(--fs-xs)" }}>
                        {fmtDate(intent.createdAt)}
                      </td>
                      <td className="asset">{intent.symbol || "—"}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: intent.side === "BUY" ? "var(--good)" : "var(--danger)" }}>
                          {intent.side || "—"}
                        </span>
                      </td>
                      <td><ModeBadge mode={intent.mode} /></td>
                      <td><StatusBadge status={intent.status} /></td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                        {fmt(intent.quantity, 5)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                        {fmt(intent.price, 2)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--danger)", opacity: 0.8 }}>
                        {fmt(intent.stopPrice, 2)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--good)", opacity: 0.8 }}>
                        {fmt(intent.takePrice, 2)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {intent.score != null ? (
                          <span style={{
                            fontSize: "var(--fs-xs)", fontWeight: 700,
                            color: Number(intent.score) >= 70 ? "var(--good)" : Number(intent.score) >= 45 ? "var(--warn)" : "var(--muted)",
                          }}>
                            {Number(intent.score).toFixed(0)}/100
                          </span>
                        ) : <span style={{ color: "var(--muted)" }}>—</span>}
                      </td>
                      <td style={{
                        fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--muted)",
                        maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {intent.orderId || "—"}
                      </td>
                      <td onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : id); }}>
                        <button
                          className="btn"
                          style={{
                            padding: "3px 10px", fontSize: "var(--fs-xs)",
                            color: isExpanded ? "var(--accent)" : "var(--muted)",
                            borderColor: isExpanded ? "rgba(79,142,247,.4)" : undefined,
                            background: isExpanded ? "var(--accent-dim)" : undefined,
                          }}
                        >
                          {isExpanded ? "▲ IA" : "▼ IA"}
                        </button>
                      </td>
                    </tr>,
                    isExpanded && (
                      <IntentExplainRow
                        key={`explain-${id}`}
                        intent={intent}
                        onClose={() => setExpandedId(null)}
                      />
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ marginTop: 10, fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
          Mostrando {visible.length} de {intents.length} intents · atualiza a cada 30s · clique numa linha ou em ▼ IA para ver a explicação Gemini
        </p>
      </div>
    </AppShell>
  );
}
