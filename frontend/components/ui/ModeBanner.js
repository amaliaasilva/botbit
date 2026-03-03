"use client";

/**
 * ModeBanner — global safety indicator (PAPER / TESTNET / LIVE)
 * @param {object} props
 * @param {"PAPER"|"TESTNET"|"LIVE"|string} props.mode
 */
export default function ModeBanner({ mode }) {
  const m = String(mode || "PAPER").toUpperCase();

  const config = {
    PAPER: {
      cls: "mode-banner mode-banner-paper",
      label: "PAPER",
      desc: "Modo simulação — sem dinheiro real",
    },
    TESTNET: {
      cls: "mode-banner mode-banner-testnet",
      label: "TESTNET",
      desc: "Binance Testnet — sem dinheiro real",
    },
    LIVE: {
      cls: "mode-banner mode-banner-live",
      label: "LIVE",
      desc: "Conta real — dinheiro real em risco",
    },
  };

  const c = config[m] || config.PAPER;

  return (
    <div className={c.cls}>
      <span className="mode-dot" />
      <strong>{c.label}</strong>
      <span style={{ fontWeight: 400, opacity: 0.85 }}>— {c.desc}</span>
    </div>
  );
}
