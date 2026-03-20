import { useEffect, useMemo, useState } from "react";

import { SceneViewport } from "./components/SceneViewport";
import { loadManifest, loadScenarioPresets, loadScenePayload } from "./lib/loaders";
import { BASELINE_CONTROLS, DEFAULT_LAYERS, getTrackMetrics } from "./lib/scene";
import type { SandboxControls, ScenarioPreset, ScenePayload, StoryManifest, TrackId } from "./types";

type DataBundle = {
  manifest: StoryManifest;
  scene: ScenePayload;
  presets: ScenarioPreset[];
};

const TRACK_METRIC_IDS: Record<TrackId, string[]> = {
  nature: ["linearity", "lowRedundancy", "exposureConcentration", "lockInScore"],
  cities: ["rccuScore", "nearWaterCoupling", "croplandEmbedding", "emergenceCurve"],
};

function App() {
  const [bundle, setBundle] = useState<DataBundle | null>(null);
  const [trackId, setTrackId] = useState<TrackId>("cities");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [controls, setControls] = useState<SandboxControls>(BASELINE_CONTROLS);
  const [activePresetId, setActivePresetId] = useState<string>("");

  useEffect(() => {
    Promise.all([loadManifest(), loadScenePayload(), loadScenarioPresets()])
      .then(([manifest, scene, presets]) => {
        setBundle({ manifest, scene, presets });
        const defaultPreset = presets.find((item) => item.track === "cities") ?? presets[0];
        setActivePresetId(defaultPreset.id);
        setControls(defaultPreset.controls);
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
    }, 1000 / speed);
    return () => window.clearInterval(interval);
  }, [bundle, playing, speed]);

  const activeTrack = useMemo(
    () => bundle?.manifest.tracks.find((track) => track.id === trackId) ?? null,
    [bundle, trackId],
  );

  const activePresets = useMemo(
    () => bundle?.presets.filter((item) => item.track === trackId) ?? [],
    [bundle, trackId],
  );

  useEffect(() => {
    if (!activePresets.length) {
      return;
    }
    const current = activePresets.find((item) => item.id === activePresetId) ?? activePresets[0];
    setActivePresetId(current.id);
    setControls(current.controls);
  }, [activePresets, activePresetId]);

  if (!bundle || !activeTrack) {
    return (
      <div className="loading-screen">
        <p className="eyebrow">Delta Constraint Lab</p>
        <h1>Loading simulation scene...</h1>
      </div>
    );
  }

  const currentFrame = bundle.scene.frames[frameIndex];
  const currentMetrics = getTrackMetrics(bundle.scene, trackId, frameIndex).filter((metric) =>
    TRACK_METRIC_IDS[trackId].includes(metric.id),
  );

  return (
    <div className="lab-shell">
      <div className="simulation-card">
        <header className="simulation-card__header">
          <div>
            <p className="eyebrow">Delta Constraint Lab</p>
            <h1>Minimal Simulation View</h1>
            <p className="simulation-card__subtitle">
              A simplified 3D sandbox without basemap. The scene focuses on water-guided settlement form and compact indicator feedback.
            </p>
          </div>
          <div className="track-switch">
            {bundle.manifest.tracks.map((track) => (
              <button
                key={track.id}
                type="button"
                className={track.id === trackId ? "is-active" : ""}
                onClick={() => setTrackId(track.id)}
              >
                {track.id === "cities" ? "Cities" : "Nature"}
              </button>
            ))}
          </div>
        </header>

        <section className="scene-shell">
          <SceneViewport
            scene={bundle.scene}
            track={trackId}
            chapterId={activeTrack.chapters[0]?.id ?? "scene"}
            viewMode="model"
            frameIndex={frameIndex}
            controls={controls}
            layers={DEFAULT_LAYERS}
          />

          <aside className="metrics-window">
            <div className="metrics-window__head">
              <span>{activeTrack.title}</span>
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

          <div className="preset-strip">
            {activePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={preset.id === activePresetId ? "is-active" : ""}
                onClick={() => {
                  setActivePresetId(preset.id);
                  setControls(preset.controls);
                }}
              >
                {preset.title}
              </button>
            ))}
          </div>

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
            <span>{currentFrame.label}</span>
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
