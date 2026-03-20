import { useEffect, useMemo, useRef, useState } from "react";

import { FigureStudio } from "./components/FigureStudio";
import { MetricsRail } from "./components/MetricsRail";
import { SandboxPanel } from "./components/SandboxPanel";
import { SceneViewport } from "./components/SceneViewport";
import { StoryPanel } from "./components/StoryPanel";
import { exportMetricsAsSvg, exportNodeAsPng } from "./lib/exporters";
import { loadFigureTemplates, loadManifest, loadScenarioPresets, loadScenePayload } from "./lib/loaders";
import { BASELINE_CONTROLS, DEFAULT_LAYERS, getTrackMetrics } from "./lib/scene";
import type {
  FigureTemplate,
  InteractionMode,
  LayerKey,
  SandboxControls,
  ScenarioPreset,
  ScenePayload,
  StoryManifest,
  TrackId,
  ViewMode,
} from "./types";

type DataBundle = {
  manifest: StoryManifest;
  scene: ScenePayload;
  presets: ScenarioPreset[];
  templates: FigureTemplate[];
};

function App() {
  const [bundle, setBundle] = useState<DataBundle | null>(null);
  const [trackId, setTrackId] = useState<TrackId>("nature");
  const [activeChapterId, setActiveChapterId] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("geo");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("story");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [controls, setControls] = useState<SandboxControls>(BASELINE_CONTROLS);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(DEFAULT_LAYERS);
  const [activePresetId, setActivePresetId] = useState<string>("");
  const [activeTemplateId, setActiveTemplateId] = useState<string>("hero-oblique");
  const captureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([loadManifest(), loadScenePayload(), loadScenarioPresets(), loadFigureTemplates()])
      .then(([manifest, scene, presets, templates]) => {
        setBundle({ manifest, scene, presets, templates });
        setActiveChapterId(manifest.tracks[0].chapters[0].id);
        setActivePresetId(presets.find((item) => item.track === "nature")?.id ?? "");
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  const activeTrack = useMemo(
    () => bundle?.manifest.tracks.find((track) => track.id === trackId) ?? null,
    [bundle, trackId],
  );
  const trackPresets = useMemo(
    () => bundle?.presets.filter((preset) => preset.track === trackId) ?? [],
    [bundle, trackId],
  );
  const activeTemplate = useMemo(
    () => bundle?.templates.find((template) => template.id === activeTemplateId) ?? null,
    [bundle, activeTemplateId],
  );

  useEffect(() => {
    if (!activeTrack) {
      return;
    }
    const exists = activeTrack.chapters.some((chapter) => chapter.id === activeChapterId);
    if (!exists) {
      setActiveChapterId(activeTrack.chapters[0].id);
    }
  }, [activeTrack, activeChapterId]);

  useEffect(() => {
    if (!trackPresets.length) {
      return;
    }
    const preset = trackPresets.find((item) => item.id === activePresetId) ?? trackPresets[0];
    setActivePresetId(preset.id);
    setControls(preset.controls);
  }, [trackPresets, activePresetId]);

  useEffect(() => {
    if (!bundle || !playing) {
      return;
    }
    const interval = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % bundle.scene.frames.length);
    }, 700 / speed);
    return () => window.clearInterval(interval);
  }, [bundle, playing, speed]);

  useEffect(() => {
    if (!activeTrack || interactionMode !== "story") {
      return;
    }
    const chapter = activeTrack.chapters.find((item) => item.id === activeChapterId);
    if (chapter) {
      setViewMode(chapter.view);
    }
  }, [activeTrack, activeChapterId, interactionMode]);

  if (!bundle || !activeTrack || !activeTemplate) {
    return (
      <div className="loading-screen">
        <p className="eyebrow">Delta Constraint Lab</p>
        <h1>Loading editorial 3D workspace...</h1>
      </div>
    );
  }

  const currentFrame = bundle.scene.frames[frameIndex];
  const currentMetrics = getTrackMetrics(bundle.scene, trackId, frameIndex);
  const activeChapter = activeTrack.chapters.find((chapter) => chapter.id === activeChapterId) ?? activeTrack.chapters[0];

  const handleTrackChange = (nextTrack: TrackId) => {
    setTrackId(nextTrack);
    const nextTrackConfig = bundle.manifest.tracks.find((item) => item.id === nextTrack);
    if (nextTrackConfig) {
      setActiveChapterId(nextTrackConfig.chapters[0].id);
    }
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = trackPresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    setActivePresetId(preset.id);
    setControls(preset.controls);
  };

  const handleExportPng = async () => {
    if (!captureRef.current || !activeTemplate) {
      return;
    }
    await exportNodeAsPng(captureRef.current, activeTemplate, trackId);
  };

  const handleExportSvg = () => {
    if (!activeTemplate) {
      return;
    }
    exportMetricsAsSvg(currentMetrics, `${activeTrack.title} metrics`, trackId, activeTemplate);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <p className="eyebrow">{bundle.manifest.brand.eyebrow}</p>
          <h1>{bundle.manifest.brand.title}</h1>
          <p>{bundle.manifest.brand.tagline}</p>
        </div>

        <div className="topbar__controls">
          <div className="button-row">
            {bundle.manifest.tracks.map((track) => (
              <button
                key={track.id}
                type="button"
                className={`switch-button ${track.id === trackId ? "is-active" : ""}`}
                onClick={() => handleTrackChange(track.id)}
              >
                {track.cta}
              </button>
            ))}
          </div>
          <div className="button-row">
            {(["geo", "model", "compare"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`switch-button compact ${viewMode === mode ? "is-active" : ""}`}
                onClick={() => setViewMode(mode)}
              >
                {mode === "geo" ? "Geo View" : mode === "model" ? "Model View" : "Compare View"}
              </button>
            ))}
          </div>
          <div className="button-row">
            {(["story", "sandbox"] as InteractionMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`switch-button compact ${interactionMode === mode ? "is-active" : ""}`}
                onClick={() => setInteractionMode(mode)}
              >
                {mode === "story" ? "Story Mode" : "Sandbox Mode"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="hero-band">
        <div className="hero-band__copy">
          <p className="eyebrow">Project proposition</p>
          <h2>{bundle.manifest.brand.heroStatement}</h2>
          <p>{activeTrack.heroSummary}</p>
        </div>
        <div className="hero-band__cards">
          {bundle.manifest.tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              className={`track-card ${track.id === trackId ? "is-active" : ""}`}
              onClick={() => handleTrackChange(track.id)}
            >
              <p className="eyebrow">{track.label}</p>
              <h3>{track.title}</h3>
              <span>{track.subtitle}</span>
            </button>
          ))}
        </div>
      </section>

      <main className="workspace">
        <StoryPanel
          track={activeTrack}
          activeChapterId={activeChapterId}
          onSelectChapter={setActiveChapterId}
          currentTimeLabel={currentFrame.timeLabel}
        />

        <section className="workspace__main">
          <div className="scene-stage" ref={captureRef}>
            <div className="scene-stage__head">
              <div>
                <p className="eyebrow">{activeTrack.label}</p>
                <h2>{activeChapter.title}</h2>
                <p>{activeChapter.summary}</p>
              </div>
              <div className="scene-stage__meta">
                <span>{currentFrame.timeLabel}</span>
                <strong>{viewMode === "compare" ? "Paired narrative compare" : viewMode === "model" ? "Editorial 3D diorama" : "Geospatial evidence view"}</strong>
              </div>
            </div>

            <SceneViewport
              scene={bundle.scene}
              track={trackId}
              chapterId={activeChapterId}
              viewMode={viewMode}
              frameIndex={frameIndex}
              controls={controls}
              layers={layers}
            />
          </div>

          <MetricsRail metrics={currentMetrics} />

          <div className="timeline-bar">
            <div className="timeline-bar__primary">
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
              <strong>{currentFrame.label}</strong>
            </div>

            <div className="timeline-bar__secondary">
              <label>
                Speed
                <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={1.5}>1.5×</option>
                  <option value={2}>2×</option>
                </select>
              </label>
              <span>mean(u) {currentFrame.diagnostics.meanU.toFixed(3)}</span>
              <span>urban {Math.round(currentFrame.diagnostics.urbanFrac * 100)}%</span>
              <span>corridor {currentFrame.diagnostics.corridorRatio.toFixed(2)}</span>
            </div>
          </div>
        </section>

        <aside className="workspace__side">
          <section className="status-card">
            <p className="eyebrow">Active chapter</p>
            <h3>{activeChapter.title}</h3>
            <p>{activeChapter.whyItMatters}</p>
          </section>

          {interactionMode === "sandbox" ? (
            <SandboxPanel
              controls={controls}
              presets={trackPresets}
              activePresetId={activePresetId}
              layers={layers}
              onPresetSelect={handlePresetSelect}
              onControlChange={(key, value) => setControls((current) => ({ ...current, [key]: value }))}
              onLayerToggle={(layer) =>
                setLayers((current) => ({
                  ...current,
                  [layer]: !current[layer],
                }))
              }
            />
          ) : (
            <section className="status-card">
              <p className="eyebrow">Story mode</p>
              <h3>Editorial guidance</h3>
              <p>
                Scroll the chapter column to change scene focus. View mode follows the story automatically, while time and export remain fully interactive.
              </p>
            </section>
          )}

          <FigureStudio
            templates={bundle.templates}
            activeTemplateId={activeTemplateId}
            onSelectTemplate={(templateId) => {
              setActiveTemplateId(templateId);
              const template = bundle.templates.find((item) => item.id === templateId);
              if (template) {
                setViewMode(template.view);
              }
            }}
            onExportPng={handleExportPng}
            onExportSvg={handleExportSvg}
          />
        </aside>
      </main>

      <footer className="footer-grid">
        {bundle.manifest.footer.map((item) => (
          <article key={item.title} className="footer-card">
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </footer>
    </div>
  );
}

export default App;
