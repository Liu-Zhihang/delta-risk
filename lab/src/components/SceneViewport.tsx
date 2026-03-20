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

const GEO_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#020617" } }],
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
    material: { ambient: 0.65, diffuse: 0.75, shininess: 32, specularColor: [200, 220, 255] },
  });

  const objectLayer = new PolygonLayer({
    id: `objects-${track}`,
    data: objects,
    getPolygon: (item) => item.polygon,
    getFillColor: (item) =>
      item.class === "core"
        ? [244, 63, 94, 90] // neon pink/red
        : item.class === "probable"
          ? [245, 158, 11, 80] // amber
          : [148, 163, 184, 40], // slate
    getLineColor: (item) =>
      item.class === "core"
        ? [254, 226, 226, 255]
        : item.class === "probable"
          ? [254, 243, 199, 255]
          : [203, 213, 225, 180],
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
      item.class === "core" ? [225, 29, 72, 255] : item.class === "probable" ? [217, 119, 6, 255] : [100, 116, 139, 220],
    getRadius: (item) => 2200 + item.metrics.rccuScore * 1500,
    radiusMinPixels: 4,
    radiusMaxPixels: 20,
    stroked: true,
    lineWidthMinPixels: 1.5,
    getLineColor: [255, 255, 255, 255],
  });

  const skeletonLayer = new LineLayer({
    id: `skeleton-${track}`,
    data: skeleton,
    getSourcePosition: (item) => item.path[0],
    getTargetPosition: (item) => item.path[1],
    getColor: (item) =>
      item.class === "core" ? [244, 63, 94, 255] : item.class === "probable" ? [251, 146, 60, 230] : [148, 163, 184, 180],
    getWidth: (item) => (item.class === "core" ? 520 : 300),
  });

  const annotationDotLayer = new ScatterplotLayer({
    id: `annotations-dots-${track}-${chapterId}`,
    data: annotations,
    getPosition: (item) => item.position,
    getFillColor: [14, 165, 233, 240], // sky blue dot
    getRadius: 2500,
    radiusMinPixels: 4,
    radiusMaxPixels: 10,
    stroked: true,
    getLineColor: [255, 255, 255, 255],
    lineWidthMinPixels: 1.5,
  });

  const annotationTextLayer = new TextLayer({
    id: `annotations-text-${track}-${chapterId}`,
    data: annotations,
    getPosition: (item) => item.position,
    getText: (item) => item.title,
    getColor: [248, 250, 252, 255], // text color light
    getSize: 15,
    sizeUnits: "pixels",
    getTextAnchor: "start",
    getAlignmentBaseline: "center",
    getPixelOffset: [12, 0],
    fontFamily: "IBM Plex Sans, sans-serif",
    background: true,
    getBackgroundColor: [15, 23, 42, 230], // dark bg
    getBorderColor: [51, 65, 85, 255], // Line color
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
