"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { subscribeTradingConfig, subscribeTradingState, subscribeExecutorStatus } from "../lib/firestore";
import ModeBanner from "./ui/ModeBanner";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Mercado", icon: "▦" },
  { href: "/trading", label: "Trading", icon: "◬" },
  { href: "/portfolio", label: "Carteira", icon: "◈" },
  { href: "/notifications", label: "Alertas", icon: "◍" },
  { href: "/settings", label: "Settings", icon: "⚙" },
  { href: "/ajuda", label: "Ajuda", icon: "?" },
];

function logoSvg() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
      <defs>
        <linearGradient id="bbg" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(96,165,250,.95)" />
          <stop offset="1" stopColor="rgba(59,130,246,.75)" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95" />
      <rect x="3" y="9" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75" />
      <rect x="3" y="15" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95" />
      <rect x="9" y="3" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75" />
      <rect x="9" y="9" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95" />
      <rect x="9" y="15" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75" />
      <rect x="15" y="3" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95" />
      <rect x="15" y="9" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75" />
      <rect x="15" y="15" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95" />
      <rect x="21" y="3" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75" />
      <rect x="21" y="9" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95" />
      <rect x="21" y="15" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75" />
      <rect x="3" y="22" width="23" height="2" rx="1" fill="rgba(255,255,255,.18)" />
    </svg>
  );
}

export default function AppShell({ title, subtitle, children, rightActions }) {
  const pathname = usePathname();
  const [currentQuery, setCurrentQuery] = useState("");
  const [tradingMode, setTradingMode] = useState("PAPER");
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [executorStatus, setExecutorStatus] = useState(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCurrentQuery(window.location.search || "");
  }, [pathname]);

  // Aguarda auth resolver antes de iniciar qualquer subscription Firestore
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => setAuthed(!!user));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authed) return;
    return subscribeTradingState((state) => {
      if (state?.mode) setTradingMode(String(state.mode).toUpperCase());
    });
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    return subscribeTradingConfig((cfg) => {
      if (!cfg) return;
      if (cfg.mode) setTradingMode(String(cfg.mode).toUpperCase());
      setTradingEnabled(Boolean(cfg.enabled));
    });
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    return subscribeExecutorStatus((s) => setExecutorStatus(s));
  }, [authed]);

  const currentParams = new URLSearchParams(currentQuery);
  const currentTab = currentParams.get("tab") || "";

  function isActive(itemHref) {
    if (!itemHref.includes("?")) {
      // /dashboard without query: active only when no tab param
      if (itemHref === "/dashboard") {
        return pathname === "/dashboard" && !currentTab;
      }
      return pathname === itemHref && (!currentTab || itemHref !== "/settings");
    }
    const [path, query] = itemHref.split("?");
    if (pathname !== path || !query) return false;
    const pairs = query.split("&").map((chunk) => chunk.split("="));
    return pairs.every(([key, value]) => currentParams.get(key) === value);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand" title="BotBit">
          <div className="logo" aria-label="Logo BotBit">
            {logoSvg()}
          </div>
          <div>
            <div className="title">BotBit</div>
            <div className="subtitle">Market Intelligence Engine</div>
          </div>
        </div>

        <nav className="nav-col">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(item.href) ? "active" : ""}
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status">
            {(() => {
              const isTestnet = tradingMode === "TESTNET";
              const executorOnline = isTestnet ? (executorStatus?.online === true) : true;
              const botOn = tradingEnabled && executorOnline;
              const dotColor = botOn ? "var(--good)" : tradingEnabled ? "var(--warn)" : "#6B7280";
              const label = botOn ? "Online" : tradingEnabled && isTestnet ? "Sem executor" : tradingEnabled ? "Sem executor" : "Parado";
              return (
                <div className="flex" style={{ gap: 6, alignItems: "center" }}>
                  <span className="dot" style={{ background: dotColor, boxShadow: botOn ? `0 0 5px ${dotColor}` : "none" }}></span>
                  <span style={{ color: botOn ? "var(--text)" : "var(--muted)", fontSize: "var(--fs-xs)" }}>{label}</span>
                </div>
              );
            })()}
            {(() => {
              const modeColor = tradingMode === "LIVE"
                ? { color: "#FCA5A5", bg: "rgba(239,68,68,.15)", border: "rgba(239,68,68,.35)" }
                : tradingMode === "TESTNET"
                  ? { color: "#86EFAC", bg: "rgba(34,197,94,.12)", border: "rgba(34,197,94,.35)" }
                  : { color: "var(--muted)", bg: "rgba(255,255,255,.05)", border: "rgba(255,255,255,.12)" };
              return (
                <span style={{
                  fontSize: "var(--fs-xs)", fontWeight: 700,
                  padding: "3px 9px", borderRadius: 6,
                  color: modeColor.color, background: modeColor.bg,
                  border: `1px solid ${modeColor.border}`,
                }}>
                  {tradingMode || "PAPER"}
                </span>
              );
            })()}
          </div>
        </div>
      </aside>

      <main className="main">
        <ModeBanner mode={tradingMode} />
        <div className="topbar">
          <div>
            <div className="page-title">{title}</div>
            <div className="page-sub">{subtitle}</div>
          </div>
          <div className="right-actions">{rightActions}</div>
        </div>
        {children}
      </main>
    </div>
  );
}
