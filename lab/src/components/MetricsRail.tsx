import type { MetricCard } from "../types";

function buildSparkPath(series: number[]) {
  return series
    .map((value, index) => {
      const x = (index / Math.max(series.length - 1, 1)) * 100;
      const y = 30 - value * 24;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

type MetricsRailProps = {
  metrics: MetricCard[];
};

export function MetricsRail({ metrics }: MetricsRailProps) {
  return (
    <div className="metrics-rail">
      {metrics.map((metric) => (
        <article key={metric.id} className="metric-card">
          <div className="metric-card__header">
            <span className="metric-card__short">{metric.shortLabel}</span>
            <span className="metric-card__label">{metric.label}</span>
          </div>
          <div className="metric-card__value" style={{ color: metric.color }}>
            {(metric.value * 100).toFixed(1)}%
          </div>
          <svg className="metric-card__spark" viewBox="0 0 100 32" preserveAspectRatio="none">
            <path d={buildSparkPath(metric.series)} stroke={metric.color} fill="none" strokeWidth="2" />
          </svg>
          <p className="metric-card__description">{metric.description}</p>
        </article>
      ))}
    </div>
  );
}
