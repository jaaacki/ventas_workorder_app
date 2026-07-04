// Lightweight inline SVG/CSS charts. The app ships no chart library and the
// dashboard only needs horizontal bars and a small multi-line trend, so a couple
// of dozen lines here beat pulling in a ~500KB dependency. The grayscale
// --chart-* tokens have weak light-mode contrast, so the primary series uses the
// brand accent and the secondary a mid-gray token.
export const CHART_PRIMARY = 'var(--brand)';
export const CHART_SECONDARY = 'var(--color-chart-2)';

export interface BarDatum {
  label: string;
  value: number;
}

export function BarRows({
  data,
  color = CHART_PRIMARY,
  formatValue = (value: number) => String(value),
}: {
  data: BarDatum[];
  color?: string;
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((datum) => datum.value));
  return (
    <div className="space-y-2.5">
      {data.map((datum) => (
        <div key={datum.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-sm text-gray-600 dark:text-gray-300" title={datum.label}>
            {datum.label}
          </span>
          <div className="h-6 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full rounded"
              style={{
                width: `${(datum.value / max) * 100}%`,
                minWidth: datum.value > 0 ? 4 : 0,
                background: color,
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">
            {formatValue(datum.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

// Multi-line trend over a shared set of period labels. Scales to a fixed viewBox
// and scrolls horizontally when there are many periods.
export function LineChart({
  periods,
  series,
  height = 200,
  formatPeriod = (period: string) => period,
}: {
  periods: string[];
  series: LineSeries[];
  height?: number;
  formatPeriod?: (period: string) => string;
}) {
  const pad = { left: 30, right: 14, top: 14, bottom: 30 };
  const step = 64;
  const width = Math.max(320, pad.left + pad.right + Math.max(1, periods.length - 1) * step);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxY = Math.max(1, ...series.flatMap((line) => line.values));
  const x = (index: number) =>
    pad.left + (periods.length <= 1 ? innerW / 2 : (index / (periods.length - 1)) * innerW);
  const y = (value: number) => pad.top + innerH - (value / maxY) * innerH;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4">
        {series.map((line) => (
          <span key={line.name} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: line.color }} />
            {line.name}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Throughput trend">
          {/* Baseline + max gridline with y labels. */}
          <line x1={pad.left} y1={y(0)} x2={width - pad.right} y2={y(0)} stroke="currentColor" strokeOpacity={0.15} />
          <line x1={pad.left} y1={y(maxY)} x2={width - pad.right} y2={y(maxY)} stroke="currentColor" strokeOpacity={0.08} />
          <text x={pad.left - 6} y={y(maxY) + 4} textAnchor="end" className="fill-gray-400 text-[10px]">
            {maxY}
          </text>
          <text x={pad.left - 6} y={y(0) + 4} textAnchor="end" className="fill-gray-400 text-[10px]">
            0
          </text>
          {periods.map((period, index) => (
            <text
              key={period}
              x={x(index)}
              y={height - 10}
              textAnchor="middle"
              className="fill-gray-400 text-[10px]"
            >
              {formatPeriod(period)}
            </text>
          ))}
          {series.map((line) => (
            <g key={line.name}>
              <polyline
                fill="none"
                stroke={line.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={line.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')}
              />
              {line.values.map((value, index) => (
                <circle key={index} cx={x(index)} cy={y(value)} r={3} fill={line.color}>
                  <title>{`${line.name} — ${periods[index]}: ${value}`}</title>
                </circle>
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
