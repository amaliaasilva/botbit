"use client";

import { clsx } from "clsx";

/**
 * KPI Card — single metric display
 * @param {object} props
 * @param {string} props.label - metric label (small caps)
 * @param {string|number} props.value - main number
 * @param {string} [props.hint] - optional subtitle
 * @param {string} [props.color] - CSS color for value
 * @param {string} [props.className]
 */
export default function KpiCard({ label, value, hint, color, className }) {
  return (
    <div className={clsx("kpi-card", className)}>
      <span className="kpi-card-label">{label}</span>
      <span className="kpi-card-value" style={color ? { color } : undefined}>{value}</span>
      {hint && <span className="kpi-card-hint">{hint}</span>}
    </div>
  );
}
