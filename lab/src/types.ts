export type TrackId = "nature" | "cities";
export type ViewMode = "geo" | "model" | "compare";
export type InteractionMode = "story" | "sandbox";
export type LayerKey =
  | "water"
  | "farmland"
  | "eco"
  | "built"
  | "objects"
  | "risk"
  | "growth"
  | "skeleton";

export interface ManifestChapter {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  whyItMatters: string;
  view: ViewMode;
  focusMetrics: string[];
  evidence: string[];
}

export interface ManifestTrack {
  id: TrackId;
  label: string;
  title: string;
  subtitle: string;
  cta: string;
  heroSummary: string;
  chapters: ManifestChapter[];
}

export interface StoryManifest {
  brand: {
    title: string;
    eyebrow: string;
    tagline: string;
    heroStatement: string;
  };
  tracks: ManifestTrack[];
  footer: Array<{
    title: string;
    body: string;
  }>;
}

export interface ScenarioPreset {
  id: string;
  track: TrackId;
  title: string;
  summary: string;
  controls: SandboxControls;
}

export interface FigureTemplate {
  id: string;
  title: string;
  description: string;
  aspectRatio: string;
  view: ViewMode;
  legendMode: string;
  captionMode: string;
  exportWidth: number;
}

export interface SandboxControls {
  riverGuidance: number;
  constraintIntensity: number;
  protectionAdaptation: number;
  developmentPressure: number;
  hazardStress: number;
}

export interface SceneFrame {
  id: string;
  step: number;
  t: number;
  label: string;
  timeLabel: string;
  density: number[][];
  diagnostics: {
    meanU: number;
    urbanFrac: number;
    corridorRatio: number;
    edgeLength: number;
  };
  metrics: Record<string, number>;
}

export interface SceneObject {
  id: string;
  name: string;
  class: "core" | "probable" | "non-RCCU";
  centroid: [number, number];
  polygon: [number, number][];
  metrics: Record<string, number>;
}

export interface CameraState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface AnnotationItem {
  id: string;
  position: [number, number];
  title: string;
  body: string;
}

export interface ScenePayload {
  sceneMeta: {
    id: string;
    title: string;
    region: string;
    version: string;
    generatedAt: string;
    source: string;
  };
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  grid: {
    rows: number;
    cols: number;
  };
  cameraBookmarks: {
    home: {
      geo: CameraState;
      model: CameraState;
    };
    nature: Record<string, CameraState>;
    cities: Record<string, CameraState>;
  };
  layers: {
    water: number[][];
    farmland: number[][];
    eco: number[][];
    waterBoost: number[][];
    risk: number[][];
    redundancy: number[][];
    skeleton: Array<{
      id: string;
      class: "core" | "probable" | "non-RCCU";
      path: [number, number][];
    }>;
  };
  objects: SceneObject[];
  metricCatalog: Record<TrackId, string[]>;
  frames: SceneFrame[];
  annotations: Record<TrackId, Record<string, AnnotationItem[]>>;
}

export interface MetricCard {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  description: string;
  value: number;
  series: number[];
}
