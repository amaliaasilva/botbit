"use client";

import { auth } from "./firebase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://botbit-api-273106014373.southamerica-east1.run.app";

function buildUrl(path) {
  if (!API_BASE_URL) {
    return path;
  }
  return `${API_BASE_URL.replace(/\/$/, "")}${path}`;
}

async function authHeaders() {
  if (!auth?.currentUser) return {};
  const token = await auth.currentUser.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function getJson(path, requireAuth = false) {
  const headers = requireAuth ? await authHeaders() : {};
  const response = await fetch(buildUrl(path), { cache: "no-store", headers });
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Backend ${response.status}: ${text || response.statusText}`);
  }
  if (!contentType.includes("application/json")) {
    throw new Error(`Resposta inválida do backend (esperado JSON): ${text.slice(0, 120)}`);
  }
  return JSON.parse(text);
}

async function postJson(path, body = {}, requireAuth = false) {
  const headers = {
    "Content-Type": "application/json",
    ...(requireAuth ? await authHeaders() : {}),
  };
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend ${response.status}: ${text || response.statusText}`);
  }
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error(`Resposta inválida do backend (esperado JSON): ${text.slice(0, 120)}`);
  }
  return JSON.parse(text);
}

function mapScorePayload(payload) {
  const item = payload?.data || {};
  return {
    symbol: item.symbol || "",
    score: Number(item.score || 0),
    regime: item.regime || "—",
    signal: item.signal || "WAIT",
    rsi: Number(item.rsi14 || 0),
    atr: Number(item.atr14 || 0),
    ema50: Number(item.ema50 || 0),
    ema200: Number(item.ema200 || 0),
    stop: item.stop_price == null ? null : Number(item.stop_price),
    explanation: item.explanation || "",
    createdAt: item.created_at || "",
    source: payload?.source || "",
  };
}

export async function fetchBtcScore() {
  const payload = await getJson("/public/score/btc");
  return mapScorePayload(payload);
}

export async function fetchB3Score(ticker) {
  const payload = await getJson(`/public/score/b3/${encodeURIComponent(String(ticker || "").toUpperCase())}`);
  return mapScorePayload(payload);
}

export async function fetchPortfolio() {
  return getJson("/portfolio", true);
}

export async function fetchBalance(account = "live") {
  return getJson(`/portfolio/balance?account=${account}`, true);
}

export async function fetchTradeStatus() {
  return getJson("/trade/status", true);
}

export async function fetchTradeIntents(params = {}) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.status) qs.set("status", params.status);
  const query = qs.toString() ? `?${qs}` : "";
  return getJson(`/trading/intents${query}`, true);
}

export async function triggerEmergencyStop() {
  return postJson("/api/trading/emergency-stop", {}, true);
}

export async function fetchLiveQuotes(symbols) {
  if (!symbols || !symbols.length) return [];
  const data = await getJson(`/api/live-quotes?symbols=${symbols.join(",")}`);
  return data?.items || [];
}

export async function fetchExplain(symbol) {
  return getJson(`/api/explain/${encodeURIComponent(symbol)}`);
}

export async function fetchBinanceValidate() {
  return postJson("/internal/binance/validate", {}, true);
}

export async function fetchExecutorApiStatus() {
  return getJson("/internal/executor/status", true);
}

export async function fetchLiveGateStatus() {
  return getJson("/api/trading/live-gate-status", true);
}

export async function triggerAlertTest() {
  return postJson("/api/alerts/test", {}, true);
}
