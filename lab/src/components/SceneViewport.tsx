import { BitmapLayer, PolygonLayer } from "@deck.gl/layers";
import { DeckGL } from "@deck.gl/react";
import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import { Map } from "react-map-gl/maplibre";

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

type PolygonDatum = {
  id: string;
  polygon: [number, number][];
  fillColor: [number, number, number, number];
  lineColor: [number, number, number, number];
  elevation: number;
};

function expandScenePolygon(scene: ScenePayload, paddingRatio = 0.035) {
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

function createRectPolygon(west: number, east: number, north: number, south: number) {
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ] as [number, number][];
}

function polygonBounds(polygon: [number, number][]) {
  return {
    west: polygon[0][0],
    east: polygon[1][0],
    north: polygon[0][1],
    south: polygon[2][1],
  };
}

function hashValue(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededUnit(input: string) {
  return (hashValue(input) % 1000) / 1000;
}

function adjustColor(
  color: [number, number, number, number],
  amount: number,
): [number, number, number, number] {
  return [
    Math.max(0, Math.min(255, Math.round(color[0] + amount))),
    Math.max(0, Math.min(255, Math.round(color[1] + amount))),
    Math.max(0, Math.min(255, Math.round(color[2] + amount))),
    color[3],
  ];
}

function createFootprint(
  polygon: [number, number][],
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
  insetRatio: number,
) {
  const { west, east, north, south } = polygonBounds(polygon);
  const width = east - west;
  const height = north - south;
  const insetX = width * insetRatio;
  const insetY = height * insetRatio;

  return createRectPolygon(
    west + width * xStart + insetX,
    west + width * xEnd - insetX,
    north - height * yStart - insetY,
    north - height * yEnd + insetY,
  );
}

function createSettlementBlocks(cellData: CellDatum[], frameProgress: number) {
  const blocks: PolygonDatum[] = [];
  const footprintTemplates: Array<[number, number, number, number]> = [
    [0.12, 0.32, 0.16, 0.36],
    [0.38, 0.6, 0.18, 0.42],
    [0.64, 0.86, 0.18, 0.34],
    [0.2, 0.42, 0.5, 0.76],
    [0.5, 0.74, 0.54, 0.8],
    [0.68, 0.88, 0.52, 0.76],
    [0.32, 0.54, 0.36, 0.62],
  ];

  for (const item of cellData) {
    if (!item.isUrban || item.landTile === 2 || item.urbanSignal <= 0.22) {
      continue;
    }

    const buildingCount = Math.max(
      2,
      Math.min(6, Math.round(item.urbanSignal * 3.2 + frameProgress * 2.4)),
    );
    const rotation = hashValue(item.id) % footprintTemplates.length;

    for (let index = 0; index < buildingCount; index += 1) {
      const template = footprintTemplates[(index + rotation) % footprintTemplates.length];
      const heightSeed = seededUnit(`${item.id}-height-${index}`);
      const toneSeed = seededUnit(`${item.id}-tone-${index}`);
      const footprint = createFootprint(item.polygon, template[0], template[1], template[2], template[3], 0.03);
      const fillColor =
        toneSeed > 0.72
          ? ([182, 42, 28, 255] as [number, number, number, number])
          : toneSeed > 0.36
            ? ([198, 53, 34, 252] as [number, number, number, number])
            : ([214, 84, 50, 248] as [number, number, number, number]);
      const elevation =
        16 +
        item.urbanSignal * 32 +
        frameProgress * (22 + item.urbanSignal * 34) +
        heightSeed * 24 +
        index * 4;

      blocks.push({
        id: `${item.id}-building-${index}`,
        polygon: footprint,
        fillColor,
        lineColor: [122, 31, 18, 220],
        elevation,
      });
    }
  }

  return blocks;
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
  const settlementBlocks = useMemo(
    () => createSettlementBlocks(cellData, frameProgress),
    [cellData, frameProgress],
  );

  const deckLayers = useMemo(
    () => [
      new PolygonLayer({
        id: "board-base",
        data: sceneBoard,
        getPolygon: (item: { polygon: [number, number][] }) => item.polygon,
        getFillColor: [177, 197, 128, 255],
        getLineColor: [99, 118, 66, 210],
        lineWidthMinPixels: 1.2,
        extruded: false,
        wireframe: false,
        material: { ambient: 0.55, diffuse: 0.7, shininess: 18, specularColor: [185, 203, 140] },
      }),
      new BitmapLayer({
        id: "base-texture",
        image: "assets/delta-base-texture.svg",
        bounds: [scene.bbox.west, scene.bbox.south, scene.bbox.east, scene.bbox.north],
        opacity: 0.98,
      }),
      new PolygonLayer<PolygonDatum>({
        id: `settlement-blocks-${frameIndex}`,
        data: settlementBlocks,
        getPolygon: (item) => item.polygon,
        getFillColor: (item) => item.fillColor,
        getLineColor: (item) => item.lineColor,
        lineWidthMinPixels: 0.55,
        extruded: true,
        wireframe: false,
        getElevation: (item) => item.elevation,
        material: { ambient: 0.58, diffuse: 0.82, shininess: 30, specularColor: [255, 205, 170] },
      }),
    ],
    [frameIndex, scene, sceneBoard, settlementBlocks],
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
            pitch: Math.max(56, Math.min(74, next.pitch)),
            zoom: Math.max(8.2, Math.min(9.8, next.zoom)),
          });
        }}
      >
        <Map mapLib={maplibregl} reuseMaps mapStyle={BLANK_STYLE} attributionControl={false} />
      </DeckGL>
    </div>
  );
}
