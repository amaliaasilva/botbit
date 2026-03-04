"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchTradeIntents, fetchTradeStatus, triggerEmergencyStop } from "@/lib/backend";

// ── status badge colors ────────────────────────────────────────────────────────
const STATUS_COLORS = {
  PENDING: "bg-yellow-100 text-yellow-800",
  SUBMITTED: "bg-blue-100 text-blue-800",
  FILL_PENDING: "bg-indigo-100 text-indigo-800",
  FILLED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-200 text-gray-700",
  OCO_FAILED: "bg-orange-100 text-orange-800",
};

function Badge({ status }) {
  const cls = STATUS_COLORS[status] || "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>
      {status || "—"}
    </span>
  );
}

function ModeBadge({ mode }) {
  if (!mode) return <span className="text-gray-400">—</span>;
  const cls =
    mode === "LIVE"
      ? "bg-red-100 text-red-700 border border-red-300"
      : "bg-green-100 text-green-700 border border-green-300";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${cls}`}>
      {mode}
    </span>
  );
}

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

function KpiChip({ label, value, sub }) {
  return (
    <div className="rounded-xl border bg-white px-5 py-4 shadow-sm min-w-[130px]">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900 truncate">{value ?? "—"}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function TradingPage() {
  const [intents, setIntents] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [stopMsg, setStopMsg] = useState(null);
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(async () => {
    try {
      const [intentData, statusData] = await Promise.all([
        fetchTradeIntents({ limit: 200 }),
        fetchTradeStatus().catch(() => null),
      ]);
      setIntents(intentData?.intents || []);
      setStatus(statusData);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const handleStop = async () => {
    if (!confirm("Confirma EMERGENCY STOP? O bot será desativado imediatamente.")) return;
    setStopping(true);
    try {
      const r = await triggerEmergencyStop();
      setStopMsg(r?.message || "Bot desativado.");
    } catch (e) {
      setStopMsg(`Erro: ${e.message}`);
    } finally {
      setStopping(false);
    }
  };

  const filters = ["ALL", "PENDING", "SUBMITTED", "FILL_PENDING", "FILLED", "REJECTED", "OCO_FAILED", "CANCELLED"];
  const visible = filter === "ALL" ? intents : intents.filter((i) => i.status === filter);

  // aggregate KPIs
  const kpiTotal = intents.length;
  const kpiFilled = intents.filter((i) => i.status === "FILLED").length;
  const kpiRejected = intents.filter((i) => i.status === "REJECTED").length;
  const kpiPending = intents.filter((i) => ["PENDING", "SUBMITTED", "FILL_PENDING"].includes(i.status)).length;
  const kpiMode = status?.mode || "—";
  const kpiEnabled = status?.enabled != null ? (status.enabled ? "ATIVO" : "PARADO") : "—";

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Trading</h1>
            <p className="text-sm text-gray-500 mt-0.5">Trilha de auditoria das ordens e intents</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
            >
              Atualizar
            </button>
            <button
              onClick={handleStop}
              disabled={stopping}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 shadow-sm"
            >
              {stopping ? "Parando…" : "⛔ Emergency Stop"}
            </button>
          </div>
        </div>

        {stopMsg && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 text-sm">
            {stopMsg}
          </div>
        )}

        {/* ── KPIs ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          <KpiChip label="Modo" value={kpiMode} />
          <KpiChip label="Status Bot" value={kpiEnabled} />
          <KpiChip label="Total Intents" value={kpiTotal} />
          <KpiChip label="Preenchidas" value={kpiFilled} />
          <KpiChip label="Pendentes" value={kpiPending} />
          <KpiChip label="Rejeitadas" value={kpiRejected} />
        </div>

        {/* ── INTENTS TABLE ──────────────────────────────────────────── */}
        <section className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">Trade Intents</h2>
            <div className="flex flex-wrap gap-1.5">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-0.5 text-xs font-medium border transition-colors ${
                    filter === f
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="px-6 py-8 text-sm text-gray-400 text-center">Carregando…</p>
          ) : error ? (
            <p className="px-6 py-8 text-sm text-red-500 text-center">{error}</p>
          ) : visible.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-400 text-center">Nenhuma intent encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    {["Hora", "Símbolo", "Lado", "Modo", "Status", "Qtd", "Preço", "Stop", "Take", "OrderId", "Run"].map(
                      (h) => (
                        <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map((intent, idx) => (
                    <tr key={intent.intentId || idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-500 text-xs">
                        {fmtDate(intent.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">
                        {intent.symbol || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`font-bold ${
                            intent.side === "BUY" ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {intent.side || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <ModeBadge mode={intent.mode} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge status={intent.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                        {fmt(intent.quantity, 5)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                        {fmt(intent.price, 2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-red-400">
                        {fmt(intent.stopPrice, 2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-green-500">
                        {fmt(intent.takePrice, 2)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono truncate max-w-[120px]">
                        {intent.orderId || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono truncate max-w-[100px]">
                        {intent.runId || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-6 py-3 text-xs text-gray-400 border-t">
            Mostrando {visible.length} de {kpiTotal} intents · atualiza a cada 30s
          </p>
        </section>

        {/* ── SELL intent highlight ──────────────────────────────────── */}
        {intents.some((i) => i.side === "SELL" && i.status === "REJECTED") && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-700">
            <span className="font-bold">Atenção:</span> há intents de SELL com status REJECTED. Verifique positions abertas manualmente.
          </div>
        )}
      </div>
    </main>
  );
}
