"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { listNotifications, markNotificationRead, subscribeNotifications } from "../../lib/firestore";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";

const TYPE_LABELS = {
  TRADE_EXECUTED: "Operação executada",
  STOP_HIT: "Stop atingido",
  TAKE_HIT: "Take-profit atingido",
  POSITION_EXIT: "Saída de posição",
  FAILSAFE: "Proteção ativada",
  EMERGENCY_STOP: "Emergency Stop",
  REGIME_CHANGE: "Mudança de regime",
  SCORE_ALERT: "Alerta de score",
};

function priorityClass(p) {
  const key = String(p || "P2").toUpperCase();
  if (key === "P0") return "badge-p0";
  if (key === "P1") return "badge-p1";
  if (key === "P2") return "badge-p2";
  return "badge-p3";
}

function priorityLabel(p) {
  const key = String(p || "P2").toUpperCase();
  if (key === "P0") return "P0 Crítico";
  if (key === "P1") return "P1 Importante";
  if (key === "P2") return "P2 Info";
  return "P3 Baixo";
}

export default function NotificationsPage() {
  const [uid, setUid] = useState("");
  const [items, setItems] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const router = useRouter();

  async function refresh(currentUid) {
    const data = await listNotifications(currentUid);
    setItems(data);
  }

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
      await refresh(user.uid);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!uid) return () => {};
    return subscribeNotifications(uid, (rows) => setItems(rows));
  }, [uid]);

  async function readOne(id) {
    if (!uid) return;
    await markNotificationRead(uid, id);
    await refresh(uid);
  }

  return (
    <AppShell
      title="Notificações"
      subtitle="Alertas estratégicos e eventos de regime"
    >
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <label style={{ minWidth: 120 }}>Prioridade</label>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="ALL">Todas</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <label style={{ minWidth: 120 }}>Tipo</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="ALL">Todos</option>
            <option value="TRADE_EXECUTED">TRADE_EXECUTED</option>
            <option value="STOP_HIT">STOP_HIT</option>
            <option value="TAKE_HIT">TAKE_HIT</option>
            <option value="POSITION_EXIT">POSITION_EXIT</option>
            <option value="FAILSAFE">FAILSAFE</option>
          </select>
        </div>
      </div>

      <div className="card">
{items.length === 0 ? (
          <p className="settings-help" style={{ margin: 0 }}>
            Sem eventos recentes. As notificações aparecem quando o robô executar uma operação, sair de uma posição, atingir stop/take ou encontrar algum problema.
          </p>
        ) : null}
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Prioridade</th>
              <th>Tipo</th>
              <th>Mensagem</th>
              <th>Data</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {items.filter((item) => (priorityFilter === "ALL" || String(item.priority || "P2") === priorityFilter) && (typeFilter === "ALL" || String(item.type || "") === typeFilter)).length === 0 ? (
              <tr><td colSpan={5}>Sem notificações para o filtro selecionado.</td></tr>
            ) : items.filter((item) => (priorityFilter === "ALL" || String(item.priority || "P2") === priorityFilter) && (typeFilter === "ALL" || String(item.type || "") === typeFilter)).map((item) => (
              <tr key={item.id} className={!item.read ? "notif-unread" : ""}>
                <td>
                  <span className={priorityClass(item.priority)}>{priorityLabel(item.priority)}</span>
                  {!item.read ? <span className="chip" style={{ marginLeft: 4 }}>Nova</span> : null}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {TYPE_LABELS[item.type] || item.type || "Evento"}
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{item.title || item.type || "Evento"} {item.symbol ? <span className="asset" style={{ marginLeft: 4 }}>{item.symbol}</span> : null}</div>
                  <div style={{ color: "var(--muted)", marginTop: 2 }}>{item.summary_leigo || item.message || "—"}</div>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{item.createdAt?.toDate?.().toLocaleString?.() ?? "-"}</td>
                <td>
                  {!item.read ? <button className="btn" onClick={() => readOne(item.id)}>Marcar lida</button> : <span className="chip">Lida</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </AppShell>
  );
}
