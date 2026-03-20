import { useEffect, useState } from "react";

import { SceneViewport } from "./components/SceneViewport";
import { loadScenePayload, loadSimViewData } from "./lib/loaders";
import { BASELINE_CONTROLS, DEFAULT_LAYERS, getTrackMetrics } from "./lib/scene";
import type { ScenePayload, SimViewData, TrackId } from "./types";

type DataBundle = {
  scene: ScenePayload;
  simView: SimViewData;
};

const SCENE_META: Record<
  TrackId,
  {
    toggle: string;
    title: string;
    metrics: string[];
  }
> = {
  nature: {
    toggle: "Risk Pattern",
    title: "Constrained Risk Pattern",
    metrics: ["linearity", "lowRedundancy", "exposureConcentration", "lockInScore"],
  },
  cities: {
    toggle: "Prototype Form",
    title: "Pearl River Delta Prototype",
    metrics: ["rccuScore", "nearWaterCoupling", "croplandEmbedding", "emergenceCurve"],
  },
};

const METRIC_LABELS: Record<string, string> = {
  linearity: "Linearity",
  lowRedundancy: "Low redundancy",
  exposureConcentration: "Exposure concentration",
  lockInScore: "Lock-in score",
  rccuScore: "Prototype score",
  nearWaterCoupling: "Near-water coupling",
  croplandEmbedding: "Cropland embedding",
  emergenceCurve: "Emergence strength",
};

const LEGEND_ITEMS = [
  { label: "Waterways", className: "is-water" },
  { label: "Cropland", className: "is-cropland" },
  { label: "Ecology", className: "is-ecology" },
  { label: "Settlements", className: "is-settlement" },
] as const;

function App() {
  const [bundle, setBundle] = useState<DataBundle | null>(null);
  const [trackId, setTrackId] = useState<TrackId>("cities");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    Promise.all([loadScenePayload(), loadSimViewData()])
      .then(([scene, simView]) => {
        setBundle({ scene, simView });
        setFrameIndex(Math.floor(scene.frames.length * 0.68));
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  useEffect(() => {
    if (!bundle || !playing) {
      return;
    }
    const interval = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % bundle.scene.frames.length);
    }, 900 / speed);
    return () => window.clearInterval(interval);
  }, [bundle, playing, speed]);

  if (!bundle) {
    return (
      <div className="loading-screen">
        <h1>Loading scene...</h1>
      </div>
    );
  }

  const currentFrame = bundle.scene.frames[frameIndex];
  const meta = SCENE_META[trackId];
  const currentMetrics = getTrackMetrics(bundle.scene, trackId, frameIndex)
    .filter((metric) => meta.metrics.includes(metric.id))
    .map((metric) => ({
      ...metric,
      label: METRIC_LABELS[metric.id] ?? metric.label,
    }));

  return (
    <div className="lab-shell">
      <div className="simulation-card">
        <header className="simulation-card__header">
          <div className="simulation-card__copy">
            <h1>{meta.title}</h1>
          </div>
          <div className="track-switch">
            {(Object.keys(SCENE_META) as TrackId[]).map((track) => (
              <button
                key={track}
                type="button"
                className={track === trackId ? "is-active" : ""}
                onClick={() => setTrackId(track)}
              >
                {SCENE_META[track].toggle}
              </button>
            ))}
          </div>
        </header>

        <section className="scene-shell">
          <SceneViewport
            scene={bundle.scene}
            simView={bundle.simView}
            track={trackId}
            chapterId={trackId}
            viewMode="model"
            frameIndex={frameIndex}
            controls={BASELINE_CONTROLS}
            layers={DEFAULT_LAYERS}
          />

          <aside className="metrics-window">
            <div className="metrics-window__head">
              <span>{meta.toggle}</span>
              <strong>{currentFrame.timeLabel}</strong>
            </div>
            <div className="metrics-window__grid">
              {currentMetrics.map((metric) => (
                <div key={metric.id} className="mini-metric">
                  <span>{metric.label}</span>
                  <strong style={{ color: metric.color }}>{(metric.value * 100).toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          </aside>

          <aside className="legend-window" aria-label="Map legend">
            {LEGEND_ITEMS.map((item) => (
              <div key={item.label} className="legend-item">
                <span className={`legend-swatch ${item.className}`} aria-hidden="true" />
                <span>{item.label}</span>
              </div>
            ))}
          </aside>

          <div className="timeline-window">
            <button type="button" onClick={() => setPlaying((current) => !current)}>
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={bundle.scene.frames.length - 1}
              value={frameIndex}
              onChange={(event) => setFrameIndex(Number(event.target.value))}
            />
            <span>{currentFrame.timeLabel}</span>
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
