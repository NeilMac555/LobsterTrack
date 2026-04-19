interface SparklineProps {
  values: number[] | null | undefined;
  width?: number;
  height?: number;
  /** Color hint — pass 'auto' to color by direction of last move
   *  (rising = emerald, falling = red, flat = slate). */
  color?: string | 'auto';
  /** Show a faint area fill beneath the line. */
  fill?: boolean;
  className?: string;
}

/**
 * Tiny inline sparkline. Pure SVG, no dependencies, renders in a single
 * div — drop it next to odds values in tables/cards to show trajectory
 * at a glance. Accepts arbitrary numeric series; it auto-scales to fit.
 *
 * Returns null silently if data is missing or too short to draw.
 */
export default function Sparkline({
  values,
  width = 64,
  height = 20,
  color = 'auto',
  fill = true,
  className = '',
}: SparklineProps) {
  if (!values || values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);

  // Pad 1.5px top/bottom so the stroke doesn't clip at extremes.
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * (height - 3) - 1.5;
    return [x, y] as const;
  });

  const line = pts
    .map(([x, y], i) => (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1))
    .join(' ');
  const area = line + ` L${width},${height} L0,${height} Z`;

  // Auto color: compare last value against first — rising = emerald (home
  // implied-prob going up = being backed), falling = red, flat = slate.
  let stroke = color;
  if (color === 'auto') {
    const delta = values[values.length - 1] - values[0];
    if (delta > 0.3) stroke = '#34d399';      // emerald-400
    else if (delta < -0.3) stroke = '#f87171'; // red-400
    else stroke = '#94a3b8';                    // slate-400
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`inline-block align-middle ${className}`}
      style={{ color: stroke }}
      aria-hidden="true"
    >
      {fill && <path d={area} fill={stroke as string} opacity="0.14" />}
      <path
        d={line}
        stroke={stroke as string}
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
