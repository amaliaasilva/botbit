"use client";

/**
 * Sparkline — inline SVG mini chart (24-48h price movement)
 * @param {object} props
 * @param {number[]} props.data - array of values
 * @param {number} [props.width] - default 60
 * @param {number} [props.height] - default 20
 * @param {string} [props.color] - default var(--accent)
 */
export default function Sparkline({ data = [], width = 60, height = 20, color }) {
  if (!data || data.length < 2) {
    return <svg width={width} height={height} className="sparkline-svg" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 1;
  const w = width - padding * 2;
  const h = height - padding * 2;
  const step = w / (data.length - 1);

  const points = data.map((v, i) => {
    const x = padding + i * step;
    const y = padding + h - ((v - min) / range) * h;
    return `${x},${y}`;
  });

  const isUp = data[data.length - 1] >= data[0];
  const strokeColor = color || (isUp ? "var(--good)" : "var(--danger)");

  return (
    <svg
      width={width}
      height={height}
      className="sparkline-svg"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
