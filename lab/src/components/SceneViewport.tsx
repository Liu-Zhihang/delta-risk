import { DeckGL } from "@deck.gl/react";
import { LineLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { useEffect, useState } from "react";

import {
  getBaselineCompareControls,
  getCameraState,
  getCellData,
  getCurrentChapterAnnotations,
  getObjectData,
  getSkeletonData,
} from "../lib/scene";
import type { LayerKey, SandboxControls, ScenePayload, TrackId, ViewMode } from "../types";

const GEO_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#f1ece5" } }],
};

type SceneViewportProps = {
  scene: ScenePayload;
  track: TrackId;
  chapterId: string;
  viewMode: ViewMode;
  frameIndex: number;
  controls: SandboxControls;
  layers: Record<LayerKey, boolean>;
};

type CellDatum = ReturnType<typeof getCellData>[number];

function buildLayers(
  scene: ScenePayload,
  track: TrackId,
  chapterId: string,
  frameIndex: number,
  controls: SandboxControls,
  layers: Record<LayerKey, boolean>,
  viewMode: ViewMode,
) {
  const cells = getCellData(scene, frameIndex, controls, layers, viewMode);
  const objects = getObjectData(scene, layers, track);
  const skeleton = getSkeletonData(scene, layers);
  const annotations = getCurrentChapterAnnotations(scene, track, chapterId);

  const cellLayer = new PolygonLayer<CellDatum>({
    id: `cells-${track}-${viewMode}-${frameIndex}`,
    data: cells,
    getPolygon: (item) => item.polygon,
    getFillColor: (item) => item.fillColor,
    getLineColor: (item) => item.strokeColor,
    lineWidthMinPixels: viewMode === "model" ? 0.5 : 0.3,
    getElevation: (item) => item.elevation,
    extruded: true,
    pickable: true,
    wireframe: false,
    material: { ambient: 0.55, diffuse: 0.65, shininess: 26, specularColor: [255, 242, 228] },
  });

  const objectLayer = new PolygonLayer({
    id: `objects-${track}`,
    data: objects,
    getPolygon: (item) => item.polygon,
    getFillColor: (item) =>
      item.class === "core"
        ? [180, 88, 42, 120]
        : item.class === "probable"
          ? [196, 144, 64, 98]
          : [120, 119, 112, 70],
    getLineColor: (item) =>
      item.class === "core"
        ? [130, 58, 31, 220]
        : item.class === "probable"
          ? [148, 101, 40, 200]
          : [95, 94, 88, 160],
    lineWidthMinPixels: 1.4,
    extruded: false,
    filled: true,
    stroked: true,
    pickable: true,
  });

  const centroidLayer = new ScatterplotLayer({
    id: `centroids-${track}`,
    data: objects,
    getPosition: (item) => item.centroid,
    getFillColor: (item) =>
      item.class === "core" ? [137, 61, 37, 255] : item.class === "probable" ? [166, 122, 42, 230] : [99, 98, 93, 220],
    getRadius: (item) => 2200 + item.metrics.rccuScore * 1500,
    radiusMinPixels: 4,
    radiusMaxPixels: 20,
    stroked: true,
    lineWidthMinPixels: 1,
    getLineColor: [255, 250, 245, 220],
  });

  const skeletonLayer = new LineLayer({
    id: `skeleton-${track}`,
    data: skeleton,
    getSourcePosition: (item) => item.path[0],
    getTargetPosition: (item) => item.path[1],
    getColor: (item) =>
      item.class === "core" ? [102, 44, 34, 210] : item.class === "probable" ? [137, 105, 45, 170] : [109, 109, 109, 130],
    getWidth: (item) => (item.class === "core" ? 520 : 300),
  });

  const annotationDotLayer = new ScatterplotLayer({
    id: `annotations-dots-${track}-${chapterId}`,
    data: annotations,
    getPosition: (item) => item.position,
    getFillColor: [35, 52, 67, 230],
    getRadius: 2500,
    radiusMinPixels: 4,
    radiusMaxPixels: 10,
    stroked: true,
    getLineColor: [255, 255, 255, 220],
    lineWidthMinPixels: 1,
  });

  const annotationTextLayer = new TextLayer({
    id: `annotations-text-${track}-${chapterId}`,
    data: annotations,
    getPosition: (item) => item.position,
    getText: (item) => item.title,
    getColor: [32, 40, 48, 255],
    getSize: 15,
    sizeUnits: "pixels",
    getTextAnchor: "start",
    getAlignmentBaseline: "center",
    getPixelOffset: [12, 0],
    fontFamily: "IBM Plex Sans, sans-serif",
    background: true,
    getBackgroundColor: [255, 251, 246, 230],
    getBorderColor: [219, 210, 201, 255],
    getBorderWidth: 1,
  });

  return [cellLayer, objectLayer, centroidLayer, skeletonLayer, annotationDotLayer, annotationTextLayer];
}

function ScenePane({
  scene,
  track,
  chapterId,
  viewMode,
  frameIndex,
  controls,
  layers,
  title,
}: SceneViewportProps & { title?: string }) {
  const [viewState, setViewState] = useState(() => getCameraState(scene, track, chapterId, viewMode));

  useEffect(() => {
    setViewState(getCameraState(scene, track, chapterId, viewMode));
  }, [scene, track, chapterId, viewMode]);

  const deckLayers = buildLayers(scene, track, chapterId, frameIndex, controls, layers, viewMode);

  return (
    <div className={`scene-pane scene-pane--${viewMode}`}>
      {title ? <div className="scene-pane__title">{title}</div> : null}
      <DeckGL
        controller={true}
        layers={deckLayers}
        viewState={viewState}
        onViewStateChange={(event) => setViewState(event.viewState as typeof viewState)}
      >
        <Map
          mapLib={maplibregl}
          reuseMaps
          mapStyle={viewMode === "geo" ? GEO_STYLE : BLANK_STYLE}
          attributionControl={false}
        />
      </DeckGL>
    </div>
  );
}

export function SceneViewport(props: SceneViewportProps) {
  if (props.viewMode === "compare") {
    return (
      <div className="scene-compare">
        <ScenePane {...props} viewMode="geo" controls={getBaselineCompareControls(props.track)} title="Baseline / observed logic" />
        <ScenePane {...props} viewMode="geo" title="Scenario / active logic" />
      </div>
    );
  }

  return <ScenePane {...props} />;
}
