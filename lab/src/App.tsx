import { useEffect, useMemo, useState } from "react";

import { SceneViewport } from "./components/SceneViewport";
import { loadScenarioPresets, loadScenePayload } from "./lib/loaders";
import { BASELINE_CONTROLS, DEFAULT_LAYERS, getTrackMetrics } from "./lib/scene";
import type { SandboxControls, ScenarioPreset, ScenePayload, TrackId } from "./types";

type DataBundle = {
  scene: ScenePayload;
  presets: ScenarioPreset[];
};

const SCENE_META: Record<
  TrackId,
  {
    toggle: string;
    title: string;
    subtitle: string;
    metrics: string[];
  }
> = {
  nature: {
    toggle: "风险锁定",
    title: "风险锁定场景",
    subtitle: "聚落沿受限水网持续扩散，并在高风险边缘逐步抬升。",
    metrics: ["linearity", "lowRedundancy", "exposureConcentration", "lockInScore"],
  },
  cities: {
    toggle: "珠三角原型",
    title: "珠三角原型场景",
    subtitle: "河网、农田和聚落共同构成一个庞大的三角洲沙盘。",
    metrics: ["rccuScore", "nearWaterCoupling", "croplandEmbedding", "emergenceCurve"],
  },
};

const PRESET_LABELS: Record<string, string> = {
  "nature-baseline": "基准形态",
  "nature-protection-trap": "防护锁定",
  "nature-ablated-guidance": "削弱引导",
  "cities-prototype": "原型聚落",
  "cities-hybrid-water": "混合水网",
  "cities-diffuse-expansion": "扩散增长",
};

const METRIC_LABELS: Record<string, string> = {
  linearity: "线性度",
  lowRedundancy: "低冗余",
  exposureConcentration: "暴露集中",
  lockInScore: "锁定度",
  rccuScore: "原型强度",
  nearWaterCoupling: "近水耦合",
  croplandEmbedding: "农田嵌入",
  emergenceCurve: "涌现度",
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
    Promise.all([loadScenePayload(), loadScenarioPresets()])
      .then(([scene, presets]) => {
        setBundle({ scene, presets });
        const defaultPreset = presets.find((item) => item.track === "cities") ?? presets[0];
        setActivePresetId(defaultPreset.id);
        setControls(defaultPreset.controls);
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

  if (!bundle) {
    return (
      <div className="loading-screen">
        <h1>加载沙盘中...</h1>
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
            <p className="simulation-card__subtitle">{meta.subtitle}</p>
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
            track={trackId}
            chapterId={trackId}
            viewMode="model"
            frameIndex={frameIndex}
            controls={controls}
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
                {PRESET_LABELS[preset.id] ?? preset.title}
              </button>
            ))}
          </div>

          <div className="timeline-window">
            <button type="button" onClick={() => setPlaying((current) => !current)}>
              {playing ? "暂停" : "播放"}
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
