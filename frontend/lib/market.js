export function signalClass(signal) {
  if (signal === "BUY") return "buy";
  if (signal === "SELL") return "avoid";
  if (signal === "AVOID") return "avoid";
  return "wait";
}

export function scoreBand(score) {
  const value = Number(score || 0);
  if (value >= 70) return "Forte";
  if (value >= 40) return "Neutro";
  return "Fraco";
}

export function defaultCards() {
  return [
    { symbol: "BTCUSDT", name: "Bitcoin", price: "—", score: 0, regime: "—", rsi: 0, signal: "WAIT" },
  ];
}
