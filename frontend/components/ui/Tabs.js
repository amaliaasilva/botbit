"use client";

import { clsx } from "clsx";

/**
 * Tabs — horizontal tab switcher
 * @param {object} props
 * @param {{id:string, label:string, hint?:string}[]} props.tabs
 * @param {string} props.activeId
 * @param {(id:string)=>void} props.onChange
 * @param {"dash"|"settings"} [props.variant]
 */
export default function Tabs({ tabs, activeId, onChange, variant = "dash" }) {
  const isDash = variant === "dash";
  return (
    <div className={isDash ? "dash-tabs" : "settings-tabs"} style={{ marginBottom: isDash ? 16 : 12 }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={clsx(isDash ? "dash-tab" : "settings-tab", activeId === tab.id && "active")}
          onClick={() => onChange(tab.id)}
        >
          <span className={isDash ? "dash-tab-label" : "settings-tab-title"}>{tab.label}</span>
          {tab.hint && <span className={isDash ? "dash-tab-hint" : "settings-tab-hint"}>{tab.hint}</span>}
        </button>
      ))}
    </div>
  );
}
