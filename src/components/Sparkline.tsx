interface SparklineProps {
  data: { time: string; price: number }[];
  isPositive: boolean;
  width?: number;
  height?: number;
}

export default function Sparkline({ data, isPositive, width = 100, height = 36 }: SparklineProps) {
  if (!data || data.length < 2) return null;

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min === 0 ? 1 : max - min;

  // Convert points to SVG coordinates
  const points = data.map((d, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((d.price - min) / range) * (height - 6) - 3; // 3px padding top/bottom
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  // Create standard fill under the path
  const fillD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  const strokeColor = isPositive ? "#22c55e" : "#ef4444"; // emerald-500 or red-500
  const gradientId = `grad-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Area Fill */}
      <path d={fillD} fill={`url(#${gradientId})`} />

      {/* Stroke Line */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-300"
      />

      {/* Pulsing End Dot */}
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="2.5"
          fill={strokeColor}
          className="animate-pulse"
        />
      )}
    </svg>
  );
}
