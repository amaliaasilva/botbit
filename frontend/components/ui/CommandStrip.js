"use client";

/**
 * CommandStrip — status bar at top of dashboard
 * Shows: Regime Global, Risco, Bot Status, Last Updated
 * @param {object} props
 * @param {{label:string, value:string|React.ReactNode, color?:string}[]} props.items
 */
export default function CommandStrip({ items = [] }) {
  return (
    <div className="command-strip">
      {items.map((item, i) => (
        <div key={i} className="command-strip-item">
          <span className="command-strip-label">{item.label}</span>
          <span className="command-strip-value" style={item.color ? { color: item.color } : undefined}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
