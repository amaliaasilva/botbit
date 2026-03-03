"use client";

import { useEffect } from "react";

/**
 * Toast — ephemeral message
 * @param {object} props
 * @param {string} props.message
 * @param {"success"|"error"|"info"} [props.variant]
 * @param {number} [props.duration] - ms, default 2500
 * @param {()=>void} props.onClose
 */
export default function Toast({ message, variant = "success", duration = 2500, onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const colors = {
    success: { bg: "var(--good-dim)", border: "rgba(34,197,94,.4)", color: "#86EFAC" },
    error: { bg: "var(--danger-dim)", border: "rgba(239,68,68,.4)", color: "#FCA5A5" },
    info: { bg: "var(--accent-dim)", border: "rgba(79,142,247,.4)", color: "#93C5FD" },
  };

  const c = colors[variant] || colors.success;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 100,
        padding: "10px 18px",
        borderRadius: "var(--r-sm)",
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.color,
        fontSize: "var(--fs-sm)",
        fontWeight: 600,
        boxShadow: "var(--shadow-lg)",
        animation: "toast-in .25s ease",
      }}
    >
      {message}
    </div>
  );
}
