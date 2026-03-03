"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  where,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export async function ensureUserDoc(uid, email) {
  if (!db) return;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      alertEmail: email || "",
      emailAlertsEnabled: true,
      minScoreAlert: 70,
      quoteRefreshMinutes: 5,
      createdAt: serverTimestamp(),
    });
  }
}

export async function getUserSettings(uid) {
  if (!db) return null;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function updateUserSettings(uid, payload) {
  if (!db) return;
  const ref = doc(db, "users", uid);
  await updateDoc(ref, payload);
}

export async function addWatchlistSymbol(uid, symbol) {
  if (!db) return;
  const ref = doc(db, "users", uid, "watchlist", symbol.toUpperCase());
  await setDoc(ref, { symbol: symbol.toUpperCase(), createdAt: serverTimestamp() });
}

export async function removeWatchlistSymbol(uid, symbol) {
  if (!db) return;
  const ref = doc(db, "users", uid, "watchlist", symbol.toUpperCase());
  await deleteDoc(ref);
}

export async function listWatchlist(uid) {
  if (!db) return [];
  const ref = collection(db, "users", uid, "watchlist");
  const snap = await getDocs(ref);
  return snap.docs.map((d) => d.data());
}

export function subscribeWatchlist(uid, onData) {
  if (!db || !uid) return () => {};
  const ref = collection(db, "users", uid, "watchlist");
  const q = query(ref, orderBy("createdAt", "desc"), limit(200));
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => d.data()));
  });
}

export async function listNotifications(uid) {
  if (!db) return [];
  const ref = collection(db, "users", uid, "notifications");
  const snap = await getDocs(query(ref, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeNotifications(uid, onData) {
  if (!db || !uid) return () => {};
  const ref = collection(db, "users", uid, "notifications");
  const q = query(ref, orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function markNotificationRead(uid, notificationId) {
  if (!db) return;
  const ref = doc(db, "users", uid, "notifications", notificationId);
  await updateDoc(ref, { read: true });
}

export async function listMarketScores(symbols) {
  if (!db || !Array.isArray(symbols) || symbols.length === 0) return [];
  const normalized = symbols.map((s) => String(s || "").toUpperCase()).filter(Boolean);
  if (!normalized.length) return [];

  const ref = collection(db, "public", "market_top", "items");
  const chunks = [];
  for (let i = 0; i < normalized.length; i += 10) {
    chunks.push(normalized.slice(i, i + 10));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const snap = await getDocs(query(ref, where("symbol", "in", chunk)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    })
  );

  return results.flat();
}

export async function listMarketRanking(limitSize = 20) {
  if (!db) return [];
  const ref = collection(db, "public", "market_top", "items");
  const snap = await getDocs(query(ref, orderBy("score", "desc")));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cryptoOnly = rows.filter((row) => row.asset_type === "CRYPTO" || row.asset_type === "BTC");
  const filtered = cryptoOnly.filter((row) => {
    const symbol = String(row.symbol || "").toUpperCase();
    const baseAsset = symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
    return !(
      baseAsset.length < 2 ||
      symbol.startsWith("USDC") ||
      symbol.startsWith("USDT") ||
      symbol.startsWith("FDUSD") ||
      symbol.startsWith("TUSD") ||
      symbol.startsWith("USDP") ||
      symbol.startsWith("BUSD") ||
      symbol.startsWith("DAI") ||
      symbol.startsWith("USD")
    );
  });
  return filtered.slice(0, Math.max(1, limitSize));
}

export async function listDiscoverLatest(limitSize = 20) {
  if (!db) return [];
  const ref = collection(db, "public", "discover_top", "items");
  const snap = await getDocs(query(ref, orderBy("potentialScore", "desc"), limit(Math.max(1, limitSize))));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeDiscoverLatest(limitSize, onData) {
  if (!db) return () => {};
  const ref = collection(db, "public", "discover_top", "items");
  const q = query(ref, orderBy("potentialScore", "desc"), limit(Math.max(1, limitSize || 20)));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onData(rows);
  });
}

export function subscribeMarketRanking(limitSize, onData) {
  if (!db) return () => {};
  const ref = collection(db, "public", "market_top", "items");
  const q = query(ref, orderBy("score", "desc"), limit(Math.max(1, limitSize || 20)));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const filtered = rows.filter((row) => {
      if (!(row.asset_type === "CRYPTO" || row.asset_type === "BTC")) return false;
      const symbol = String(row.symbol || "").toUpperCase();
      const baseAsset = symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
      if (baseAsset.length < 2) return false;
      return !(
        symbol.startsWith("USDC") ||
        symbol.startsWith("USDT") ||
        symbol.startsWith("FDUSD") ||
        symbol.startsWith("TUSD") ||
        symbol.startsWith("USDP") ||
        symbol.startsWith("BUSD") ||
        symbol.startsWith("DAI") ||
        symbol.startsWith("USD")
      );
    });
    onData(filtered);
  });
}

export function subscribeQuotes(symbols, onData) {
  if (!db || !Array.isArray(symbols) || symbols.length === 0) return () => {};
  const normalized = symbols.map((s) => String(s || "").toUpperCase()).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < normalized.length; i += 10) chunks.push(normalized.slice(i, i + 10));

  const unsubscribers = chunks.map((chunk) => {
    const ref = collection(db, "public", "quotes_top", "items");
    const q = query(ref, where("symbol", "in", chunk));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(rows);
    });
  });

  return () => unsubscribers.forEach((unsub) => unsub());
}

export function subscribeTradingConfig(onData) {
  if (!db) return () => {};
  const ref = doc(db, "config", "trading_global");
  return onSnapshot(ref, (snap) => onData(snap.exists() ? snap.data() : null));
}

export function subscribeTradingState(onData) {
  if (!db) return () => {};
  const ref = doc(db, "trading_state", "current");
  return onSnapshot(ref, (snap) => onData(snap.exists() ? snap.data() : null));
}

export function subscribeTradingPositions(onData, limitSize = 200) {
  if (!db) return () => {};
  const ref = collection(db, "trading_positions");
  const q = query(ref, orderBy("updatedAt", "desc"), limit(Math.max(1, limitSize)));
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function subscribeTradingOrders(onData, limitSize = 200) {
  if (!db) return () => {};
  const ref = collection(db, "trading_orders");
  const q = query(ref, orderBy("updatedAt", "desc"), limit(Math.max(1, limitSize)));
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function updateTradingConfig(patch) {
  if (!db) return;
  const ref = doc(db, "config", "trading_global");
  await setDoc(ref, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

export async function emergencyStopTrading() {
  if (!db) return;
  const ref = doc(db, "config", "trading_global");
  await setDoc(ref, { enabled: false, updatedAt: serverTimestamp(), lastSafetyError: "EMERGENCY_STOP_UI" }, { merge: true });
}

export function subscribeExecutorStatus(onData) {
  if (!db) return () => {};
  const ref = doc(db, "executor_heartbeat", "current");
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) { onData(null); return; }
    const d = snap.data();
    const lastHb = d.lastHeartbeat?.toDate?.() ?? null;
    const ageSec = lastHb ? Math.floor((Date.now() - lastHb.getTime()) / 1000) : null;
    onData({ ...d, lastHeartbeat: lastHb, ageSec, online: ageSec !== null && ageSec <= 120 });
  });
}

export function subscribePendingIntents(onData, limitSize = 20) {
  if (!db) return () => {};
  const ref = collection(db, "trade_intents");
  const q = query(ref, where("status", "==", "PENDING"), limit(Math.max(1, limitSize)));
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
