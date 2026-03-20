import { toPng } from "html-to-image";

import type { FigureTemplate, MetricCard, TrackId } from "../types";

function saveBlob(href: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
}

export async function exportNodeAsPng(node: HTMLElement, template: FigureTemplate, track: TrackId) {
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: Math.max(2, Math.round(template.exportWidth / Math.max(node.clientWidth, 1))),
    backgroundColor: "#f4efe9",
  });
  saveBlob(dataUrl, `delta-constraint-lab-${track}-${template.id}.png`);
}

export function exportMetricsAsSvg(metrics: MetricCard[], title: string, track: TrackId, template: FigureTemplate) {
  const width = template.exportWidth;
  const height = Math.round(width * (template.aspectRatio === "3:4" ? 4 / 3 : 0.7));
  const panelWidth = width - 120;
  const rowHeight = 132;
  const startY = 168;

  const cards = metrics
    .map((metric, index) => {
      const y = startY + index * rowHeight;
      const sparkline = metric.series
        .map((value, itemIndex, series) => {
          const x = 460 + (itemIndex / Math.max(series.length - 1, 1)) * 560;
          const scaled = y + 60 - value * 56;
          return `${itemIndex === 0 ? "M" : "L"} ${x.toFixed(1)} ${scaled.toFixed(1)}`;
        })
        .join(" ");
      return `
        <g transform="translate(60 ${y})">
          <rect x="0" y="0" width="${panelWidth}" height="96" rx="16" fill="#ffffff" stroke="#ded6cf" />
          <text x="24" y="30" font-family="IBM Plex Sans" font-size="16" fill="#5d5147">${metric.label}</text>
          <text x="24" y="66" font-family="IBM Plex Mono" font-size="34" font-weight="600" fill="${metric.color}">${(metric.value * 100).toFixed(1)}%</text>
          <path d="${sparkline}" fill="none" stroke="${metric.color}" stroke-width="3" stroke-linecap="round" />
        </g>
      `;
    })
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#f4efe9" />
      <text x="60" y="76" font-family="Source Serif 4" font-size="44" font-weight="600" fill="#2f2d2b">${title}</text>
      <text x="60" y="116" font-family="IBM Plex Sans" font-size="22" fill="#6f6256">Metric poster export from Delta Constraint Lab</text>
      ${cards}
    </svg>
  `;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  saveBlob(href, `delta-constraint-lab-${track}-${template.id}.svg`);
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
