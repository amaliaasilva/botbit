"use client";

import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import { subscribeMarketRanking } from "../../lib/firestore";
import { fetchExplain } from "../../lib/backend";
import IAExplainPanel from "../../components/ui/IAExplainPanel";

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtTs(val) {
  if (!val) return "—";
  const d = val?.toDate ? val.toDate() : new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function fmtNum(val, decimals = 2) {
  const n = Number(val);
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function regimeLabel(regime) {
  const v = String(regime || "").toLowerCase();
  if (v === "alta" || v === "bullish") return "↑ Alta";
  if (v === "baixa" || v === "bearish") return "↓ Baixa";
  if (v === "lateral") return "→ Lateral";
  return "—";
}

function regimeClass(regime) {
  const v = String(regime || "").toLowerCase();
  if (v === "alta" || v === "bullish") return "badge badge-regime-alta";
  if (v === "baixa" || v === "bearish") return "badge badge-regime-baixa";
  if (v === "lateral") return "badge badge-regime-lateral";
  return "badge badge-regime-neutro";
}

function ScoreBar({ score }) {
  const n = Math.min(100, Math.max(0, Number(score || 0)));
  const color = n >= 70 ? "var(--good)" : n >= 50 ? "var(--warn)" : "var(--danger)";
  return (
    <div className="flex items-center gap-2">
      <div style={{ width: 56, height: 6, background: "var(--bg-muted)", borderRadius: 3 }}>
        <div style={{ width: `${n}%`, height: "100%", background: color, borderRadius: 3, transition: "width .3s" }} />
      </div>
      <span style={{ color, fontWeight: 600, fontSize: "0.85rem" }}>{n}</span>
    </div>
  );
}

const SIGNAL_META = {
  BUY:  { label: "Compra",   bg: "#16a34a", color: "#fff" },
  SELL: { label: "Venda",    bg: "#dc2626", color: "#fff" },
  AVOID:{ label: "Evitar",   bg: "#b91c1c", color: "#fff" },
  WAIT: { label: "Aguardar", bg: "#6b7280", color: "#fff" },
};

function SignalChip({ signal }) {
  const s = String(signal || "WAIT").toUpperCase();
  const meta = SIGNAL_META[s] ?? SIGNAL_META.WAIT;
  return (
    <span style={{
      background: meta.bg, color: meta.color,
      padding: "2px 10px", borderRadius: 12,
      fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.03em",
    }}>
      {meta.label}
    </span>
  );
}

// ── filter logic ──────────────────────────────────────────────────────────────
const TABS = [
  { id: "todos",      label: "Todos" },
  { id: "buy",        label: "Compra" },
  { id: "near_entry", label: "Pré-entrada" },
  { id: "avoid",      label: "Evitar" },
];

function applyTab(rows, tab) {
  if (tab === "buy")
    return rows.filter(r => String(r.signal || "").toUpperCase() === "BUY");
  if (tab === "near_entry")
    return rows.filter(r => {
      const score = Number(r.score || 0);
      const regime = String(r.regime || "").toLowerCase();
      return score >= 55 && score < 70 && (regime === "alta" || regime === "bullish");
    });
  if (tab === "avoid")
    return rows.filter(r => ["AVOID", "SELL"].includes(String(r.signal || "").toUpperCase()));
  return rows;
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function SignalsPage() {
  const router = useRouter();

  const [user, setUser]           = useState(undefined); // undefined = loading
  const [rows, setRows]           = useState([]);
  const [tab, setTab]             = useState("todos");
  const [selected, setSelected]   = useState(null);
  const [explain, setExplain]     = useState(null);
  const [loadingEx, setLoadingEx] = useState(false);
  const [search, setSearch]       = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeMarketRanking(100, setRows);
    return () => unsub();
  }, [user]);

  const openExplain = useCallback(async (row) => {
    setSelected(row);
    setExplain(null);
    setLoadingEx(true);
    try {
      const data = await fetchExplain(row.symbol);
      setExplain(data);
    } catch {
      setExplain({ error: "Não foi possível carregar a explicação." });
    } finally {
      setLoadingEx(false);
    }
  }, []);

  if (user === undefined) {
    return <div className="p-8 text-muted">Carregando…</div>;
  }
  if (!user) return null;

  const searchLower = search.toLowerCase();
  const visibleRows = searchLower
    ? rows.filter(r => String(r.symbol || "").toLowerCase().includes(searchLower))
    : rows;
  const filtered = applyTab(visibleRows, tab);

  const tabCounts = Object.fromEntries(TABS.map(t => [t.id, applyTab(visibleRows, t.id).length]));

  return (
    <AppShell title="Sinais" subtitle="Score e sinal em tempo real por ativo">
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      {/* ── main panel ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0 }}>Sinais de Mercado</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
            Score em tempo real para todos os ativos do universo monitorado. Clique numa linha para ver a análise IA.
          </p>
        </div>

        {/* search */}
        <input
          type="text"
          placeholder="Buscar ativo…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", maxWidth: 340, padding: "6px 12px",
            borderRadius: 8, border: "1px solid var(--border)",
            background: "var(--bg-card)", color: "var(--text)",
            marginBottom: 12, fontSize: "0.875rem",
          }}
        />

        {/* tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "5px 16px", borderRadius: 20,
                border: "1px solid var(--border)",
                background: tab === t.id ? "var(--accent)" : "var(--bg-card)",
                color: tab === t.id ? "#fff" : "var(--text)",
                fontWeight: tab === t.id ? 700 : 400,
                cursor: "pointer", fontSize: "0.85rem",
                transition: "all .15s",
              }}
            >
              {t.label}
              {tabCounts[t.id] > 0 && (
                <span style={{ marginLeft: 6, opacity: 0.75, fontSize: "0.78rem" }}>
                  ({tabCounts[t.id]})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* table */}
        {filtered.length === 0 ? (
          <div style={{ color: "var(--text-muted)", padding: "32px 0", textAlign: "center" }}>
            {rows.length === 0
              ? "Aguardando dados do Firestore…"
              : "Nenhum ativo nesta categoria no momento."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                  {["Ativo", "Sinal", "Regime", "Score", "RSI", "Stop", "Atualizado"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const isSelected = selected?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => openExplain(row)}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        background: isSelected ? "var(--bg-hover, rgba(99,102,241,.10))" : "transparent",
                        transition: "background .12s",
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover, rgba(99,102,241,.05))"; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? "var(--bg-hover, rgba(99,102,241,.10))" : "transparent"; }}
                    >
                      <td style={{ padding: "9px 10px", fontWeight: 700, letterSpacing: "0.03em" }}>
                        {String(row.symbol || "").replace(/USDT$/, "")}
                        <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 2, fontSize: "0.75rem" }}>/USDT</span>
                      </td>
                      <td style={{ padding: "9px 10px" }}><SignalChip signal={row.signal} /></td>
                      <td style={{ padding: "9px 10px" }}>
                        <span className={regimeClass(row.regime)}>{regimeLabel(row.regime)}</span>
                      </td>
                      <td style={{ padding: "9px 10px" }}><ScoreBar score={row.score} /></td>
                      <td style={{ padding: "9px 10px", color: "var(--text-muted)" }}>
                        {row.rsi14 != null ? fmtNum(row.rsi14, 1) : "—"}
                      </td>
                      <td style={{ padding: "9px 10px", color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.8rem" }}>
                        {row.stop_loss != null ? fmtNum(row.stop_loss, 4) : "—"}
                      </td>
                      <td style={{ padding: "9px 10px", color: "var(--text-muted)", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                        {fmtTs(row.updatedAt ?? row.ts)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── IA explain panel ────────────────────────────────────────── */}
      {selected && (
        <div style={{ width: 340, flexShrink: 0, position: "sticky", top: 80 }}>
          <IAExplainPanel
            symbol={selected.symbol}
            data={explain}
            loading={loadingEx}
            onClose={() => { setSelected(null); setExplain(null); }}
          />
        </div>
      )}
    </div>
    </AppShell>
  );
}
