import type { LayerKey, SandboxControls, ScenarioPreset } from "../types";

type SandboxPanelProps = {
  controls: SandboxControls;
  presets: ScenarioPreset[];
  activePresetId: string;
  layers: Record<LayerKey, boolean>;
  onPresetSelect: (presetId: string) => void;
  onControlChange: (key: keyof SandboxControls, value: number) => void;
  onLayerToggle: (layer: LayerKey) => void;
};

const SLIDER_META: Array<{
  key: keyof SandboxControls;
  label: string;
  helper: string;
}> = [
  { key: "riverGuidance", label: "River guidance", helper: "Directional pull from waterways and channelized edges." },
  { key: "constraintIntensity", label: "Constraint intensity", helper: "Strength of farmland, reserve, and levee-like development limits." },
  { key: "protectionAdaptation", label: "Protection / adaptation", helper: "Short-term dampening of exposure alongside possible long-term lock-in." },
  { key: "developmentPressure", label: "Development pressure", helper: "Baseline tendency for growth to spread and intensify." },
  { key: "hazardStress", label: "Hazard stress", helper: "Intensity of flood-like pressure and red-overlay emphasis." },
];

const LAYER_LABELS: Record<LayerKey, string> = {
  water: "Water",
  farmland: "Farmland / polder",
  eco: "Eco reserve",
  built: "Built-up",
  objects: "RCCU objects",
  risk: "Risk layers",
  growth: "Simulated growth",
  skeleton: "Network skeleton",
};

export function SandboxPanel({
  controls,
  presets,
  activePresetId,
  layers,
  onPresetSelect,
  onControlChange,
  onLayerToggle,
}: SandboxPanelProps) {
  return (
    <section className="sandbox-panel">
      <div className="panel-block">
        <div className="panel-block__head">
          <p className="eyebrow">Sandbox Mode</p>
          <h3>Scenario controls</h3>
        </div>
        <div className="preset-grid">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset-chip ${preset.id === activePresetId ? "is-active" : ""}`}
              onClick={() => onPresetSelect(preset.id)}
            >
              <strong>{preset.title}</strong>
              <span>{preset.summary}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel-block">
        {SLIDER_META.map((item) => (
          <label key={item.key} className="slider-field">
            <div className="slider-field__head">
              <span>{item.label}</span>
              <strong>{Math.round(controls[item.key] * 100)}%</strong>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(controls[item.key] * 100)}
              onChange={(event) => onControlChange(item.key, Number(event.target.value) / 100)}
            />
            <span className="slider-field__helper">{item.helper}</span>
          </label>
        ))}
      </div>

      <div className="panel-block">
        <div className="panel-block__head">
          <p className="eyebrow">Layers</p>
          <h3>Scene stack</h3>
        </div>
        <div className="layer-grid">
          {(Object.keys(LAYER_LABELS) as LayerKey[]).map((layer) => (
            <button
              key={layer}
              type="button"
              className={`layer-chip ${layers[layer] ? "is-on" : ""}`}
              onClick={() => onLayerToggle(layer)}
            >
              {LAYER_LABELS[layer]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
