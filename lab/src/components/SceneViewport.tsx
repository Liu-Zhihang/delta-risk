import { DeckGL } from "@deck.gl/react";
import { PolygonLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";

import { getCameraState, getCellData } from "../lib/scene";
import type { LayerKey, SandboxControls, ScenePayload, TrackId, ViewMode } from "../types";

const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#f4efe5" } }],
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

function expandScenePolygon(scene: ScenePayload, paddingRatio = 0.03) {
  const width = scene.bbox.east - scene.bbox.west;
  const height = scene.bbox.north - scene.bbox.south;
  const padX = width * paddingRatio;
  const padY = height * paddingRatio;

  return [
    [scene.bbox.west - padX, scene.bbox.north + padY],
    [scene.bbox.east + padX, scene.bbox.north + padY],
    [scene.bbox.east + padX, scene.bbox.south - padY],
    [scene.bbox.west - padX, scene.bbox.south - padY],
  ] as [number, number][];
}

export function SceneViewport({
  scene,
  track,
  chapterId,
  viewMode,
  frameIndex,
  controls,
  layers,
}: SceneViewportProps) {
  const [viewState, setViewState] = useState(() => getCameraState(scene, track, chapterId, viewMode));

  useEffect(() => {
    setViewState(getCameraState(scene, track, chapterId, viewMode));
  }, [scene, track, chapterId, viewMode]);

  const cellData = useMemo(
    () => getCellData(scene, frameIndex, controls, layers, "model"),
    [scene, frameIndex, controls, layers],
  );
  const frameProgress = scene.frames.length > 1 ? frameIndex / (scene.frames.length - 1) : 0;

  const sceneBoard = useMemo(() => [{ polygon: expandScenePolygon(scene) }], [scene]);
  const builtCells = useMemo(() => cellData.filter((item) => item.urbanSignal > 0.24 && item.tile !== 2), [cellData]);

  const deckLayers = useMemo(
    () => [
      new PolygonLayer({
        id: "board-base",
        data: sceneBoard,
        getPolygon: (item: { polygon: [number, number][] }) => item.polygon,
        getFillColor: [158, 180, 110, 255],
        getLineColor: [101, 122, 67, 255],
        lineWidthMinPixels: 1.5,
        extruded: true,
        wireframe: false,
        getElevation: 5,
        material: { ambient: 0.6, diffuse: 0.65, shininess: 18, specularColor: [185, 205, 140] },
      }),
      new PolygonLayer<CellDatum>({
        id: `land-tiles-${frameIndex}`,
        data: cellData,
        getPolygon: (item) => item.polygon,
        getFillColor: (item) => item.tile === 4 ? [170, 192, 118, 255] : item.fillColor,
        getLineColor: (item) => (item.tile === 2 ? [96, 157, 185, 255] : [120, 143, 79, 135]),
        lineWidthMinPixels: 0.45,
        extruded: true,
        wireframe: false,
        getElevation: (item) => item.elevation,
        material: { ambient: 0.65, diffuse: 0.55, shininess: 14, specularColor: [178, 198, 130] },
      }),
      new PolygonLayer<CellDatum>({
        id: `built-clusters-${frameIndex}`,
        data: builtCells,
        getPolygon: (item) => item.polygon,
        getFillColor: (item) =>
          item.urbanSignal > 0.68
            ? [180, 39, 24, 255]
            : item.urbanSignal > 0.48
              ? [198, 55, 33, 252]
              : [217, 85, 50, 245],
        getLineColor: [120, 29, 17, 210],
        lineWidthMinPixels: 0.6,
        extruded: true,
        wireframe: false,
        getElevation: (item) => 10 + item.urbanSignal * (26 + frameProgress * 34),
        material: { ambient: 0.58, diffuse: 0.72, shininess: 26, specularColor: [255, 193, 157] },
      }),
    ],
    [builtCells, cellData, frameIndex, frameProgress, sceneBoard],
  );

  return (
    <div className="scene-pane">
      <DeckGL
        controller={true}
        layers={deckLayers}
        viewState={viewState}
        onViewStateChange={(event) => {
          const next = event.viewState as typeof viewState;
          setViewState({
            ...next,
            pitch: Math.max(48, Math.min(72, next.pitch)),
            zoom: Math.max(8, Math.min(9.6, next.zoom)),
          });
        }}
      >
        <Map mapLib={maplibregl} reuseMaps mapStyle={BLANK_STYLE} attributionControl={false} />
      </DeckGL>
    </div>
  );
}
