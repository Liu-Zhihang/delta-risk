import type {
  AnnotationItem,
  CameraState,
  LayerKey,
  MetricCard,
  SandboxControls,
  ScenePayload,
  TrackId,
  ViewMode,
} from "../types";

export const BASELINE_CONTROLS: SandboxControls = {
  riverGuidance: 0.62,
  constraintIntensity: 0.56,
  protectionAdaptation: 0.52,
  developmentPressure: 0.54,
  hazardStress: 0.48,
};

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  water: true,
  farmland: true,
  eco: true,
  built: true,
  objects: false,
  risk: false,
  growth: true,
  skeleton: false,
};

const METRIC_META: Record<
  string,
  {
    label: string;
    shortLabel: string;
    color: string;
    description: string;
  }
> = {
  linearity: {
    label: "Linearity",
    shortLabel: "LIN",
    color: "#b55e34",
    description: "Degree to which growth is organized into elongated corridor-like substructures.",
  },
  lowRedundancy: {
    label: "Low-redundancy",
    shortLabel: "RED",
    color: "#5d7f93",
    description: "Weak substitute path structure at the urban edge.",
  },
  directionConsistency: {
    label: "Direction consistency",
    shortLabel: "DIR",
    color: "#3f6980",
    description: "Alignment between growth orientation and river-guided constraints.",
  },
  endpointEnrichment: {
    label: "Endpoint enrichment",
    shortLabel: "END",
    color: "#7b6953",
    description: "Concentration of edge-like tips associated with fragile settlement chains.",
  },
  exposureConcentration: {
    label: "Exposure concentration",
    shortLabel: "EXP",
    color: "#bb6a49",
    description: "Co-location of growth and hazard pressure.",
  },
  lockInScore: {
    label: "Lock-in score",
    shortLabel: "LOCK",
    color: "#8c4c3a",
    description: "Combined indicator of directional structure, exposure, and weak redundancy.",
  },
  rccuScore: {
    label: "RCCU score",
    shortLabel: "RCCU",
    color: "#bb5a2e",
    description: "Confidence that a pattern behaves like a recognizable corridor-like RCCU object.",
  },
  nearWaterCoupling: {
    label: "Near-water coupling",
    shortLabel: "WAT",
    color: "#4d87ad",
    description: "Share of urban cells directly associated with water-linked geometry.",
  },
  croplandEmbedding: {
    label: "Cropland embedding",
    shortLabel: "CROP",
    color: "#718c54",
    description: "Degree to which urban structures remain embedded in agrarian constraints.",
  },
  urbanSeparation: {
    label: "Urban separation",
    shortLabel: "SEP",
    color: "#856950",
    description: "Distance from generic compact urban expansion logic.",
  },
  emergenceCurve: {
    label: "Emergence curve",
    shortLabel: "EMR",
    color: "#af7b39",
    description: "Overall emergence strength of corridor-like urban patterns through time.",
  },
};

const TILE_COLORS = {
  bare: [173, 198, 126, 255] as [number, number, number, number],
  farmland: [148, 187, 108, 255] as [number, number, number, number],
  water: [128, 191, 212, 255] as [number, number, number, number],
  eco: [118, 165, 88, 255] as [number, number, number, number],
  built: [206, 62, 39, 255] as [number, number, number, number],
  risk: [186, 78, 58, 180] as [number, number, number, number],
  modelBackplate: [181, 206, 136, 255] as [number, number, number, number],
};

type CellDatum = {
  id: string;
  polygon: [number, number][];
  centroid: [number, number];
  elevation: number;
  fillColor: [number, number, number, number];
  strokeColor: [number, number, number, number];
  tile: number;
  landTile: number;
  risk: number;
  redundancy: number;
  density: number;
  urbanSignal: number;
  isUrban: boolean;
};

function lerpColor(
  from: [number, number, number, number],
  to: [number, number, number, number],
  amount: number,
): [number, number, number, number] {
  return [
    Math.round(from[0] + (to[0] - from[0]) * amount),
    Math.round(from[1] + (to[1] - from[1]) * amount),
    Math.round(from[2] + (to[2] - from[2]) * amount),
    Math.round(from[3] + (to[3] - from[3]) * amount),
  ];
}

function cellPolygon(scene: ScenePayload, row: number, col: number) {
  const width = (scene.bbox.east - scene.bbox.west) / scene.grid.cols;
  const height = (scene.bbox.north - scene.bbox.south) / scene.grid.rows;
  const west = scene.bbox.west + col * width;
  const east = west + width;
  const north = scene.bbox.north - row * height;
  const south = north - height;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ] as [number, number][];
}

function cellCentroid(polygon: [number, number][]) {
  return [
    (polygon[0][0] + polygon[1][0]) / 2,
    (polygon[1][1] + polygon[2][1]) / 2,
  ] as [number, number];
}

function applyScenarioValue(value: number, controls: SandboxControls, waterBoost: number, isUrban: boolean) {
  const guidance = 0.85 + waterBoost * controls.riverGuidance * 0.42;
  const pressure = 0.82 + controls.developmentPressure * 0.5;
  const constraint = 1 - (1 - waterBoost) * controls.constraintIntensity * (isUrban ? 0.18 : 0.3);
  return value * guidance * pressure * constraint;
}

export function getTrackMetrics(scene: ScenePayload, track: TrackId, frameIndex: number): MetricCard[] {
  const frame = scene.frames[frameIndex];
  return scene.metricCatalog[track].map((metricId) => {
    const meta = METRIC_META[metricId];
    return {
      id: metricId,
      label: meta.label,
      shortLabel: meta.shortLabel,
      color: meta.color,
      description: meta.description,
      value: frame.metrics[metricId] ?? 0,
      series: scene.frames.map((item) => item.metrics[metricId] ?? 0),
    };
  });
}

export function getCurrentChapterAnnotations(
  scene: ScenePayload,
  track: TrackId,
  chapterId: string,
): AnnotationItem[] {
  return scene.annotations[track]?.[chapterId] ?? [];
}

export function getCameraState(
  scene: ScenePayload,
  track: TrackId,
  chapterId: string,
  viewMode: ViewMode,
): CameraState {
  return {
    longitude: scene.cameraBookmarks.home.model.longitude,
    latitude: scene.cameraBookmarks.home.model.latitude,
    zoom: 8.58,
    pitch: 67,
    bearing: -38,
  };
}

export function getCellData(
  scene: ScenePayload,
  frameIndex: number,
  controls: SandboxControls,
  layers: Record<LayerKey, boolean>,
  viewMode: ViewMode,
): CellDatum[] {
  const frame = scene.frames[frameIndex];
  const frameProgress = scene.frames.length > 1 ? frameIndex / (scene.frames.length - 1) : 0;
  const items: CellDatum[] = [];
  for (let row = 0; row < scene.grid.rows; row += 1) {
    for (let col = 0; col < scene.grid.cols; col += 1) {
      const density = frame.density[row][col];
      const waterBoost = scene.layers.waterBoost[row][col];
      const risk = scene.layers.risk[row][col];
      const redundancy = scene.layers.redundancy[row][col];
      const polygon = cellPolygon(scene, row, col);
      const centroid = cellCentroid(polygon);
      const urbanSignal = applyScenarioValue(density, controls, waterBoost, true);
      const urbanThreshold = 0.38 - frameProgress * 0.12;
      const isUrban = urbanSignal > urbanThreshold;
      const landTile = scene.layers.water[row][col]
        ? 2
        : scene.layers.eco[row][col]
          ? 3
          : scene.layers.farmland[row][col]
            ? 1
            : 0;
      const tile = landTile;

      let baseColor = TILE_COLORS.bare;
      if (landTile === 2 && layers.water) {
        baseColor = TILE_COLORS.water;
      } else if (landTile === 1 && layers.farmland) {
        baseColor = TILE_COLORS.farmland;
      } else if (landTile === 3 && layers.eco) {
        baseColor = TILE_COLORS.eco;
      } else if (viewMode === "model") {
        baseColor = TILE_COLORS.modelBackplate;
      }

      const riskMix = layers.risk ? Math.max(risk - redundancy * 0.35, 0) : 0;
      const fillColor = riskMix > 0.1 ? lerpColor(baseColor, TILE_COLORS.risk, Math.min(riskMix, 0.28)) : baseColor;
      const growthBoost = layers.growth ? density * (1 + controls.developmentPressure * 0.18) : density;
      const landPlateHeight = landTile === 2 ? 2.1 : landTile === 3 ? 8.9 : landTile === 1 ? 8 : 7.1;
      const elevation = landPlateHeight + (isUrban && landTile !== 2 ? 0.85 + growthBoost * 1.4 : 0);

      items.push({
        id: `${row}-${col}`,
        polygon,
        centroid,
        elevation,
        fillColor,
        strokeColor: [255, 255, 255, viewMode === "model" ? 100 : 60],
        tile,
        landTile,
        risk,
        redundancy,
        density,
        urbanSignal,
        isUrban,
      });
    }
  }
  return items;
}

export function getObjectData(
  scene: ScenePayload,
  layers: Record<LayerKey, boolean>,
  track: TrackId,
) {
  if (!layers.objects) {
    return [];
  }
  const showNonCore = track === "cities";
  return scene.objects.filter((item) => showNonCore || item.class !== "non-RCCU");
}

export function getSkeletonData(scene: ScenePayload, layers: Record<LayerKey, boolean>) {
  return layers.skeleton ? scene.layers.skeleton : [];
}

export function getBaselineCompareControls(track: TrackId): SandboxControls {
  return track === "nature"
    ? { ...BASELINE_CONTROLS }
    : {
        riverGuidance: 0.76,
        constraintIntensity: 0.58,
        protectionAdaptation: 0.4,
        developmentPressure: 0.52,
        hazardStress: 0.35,
      };
}
