import { useEffect, useMemo, useRef, useState } from "react";

import type { LayerKey, SandboxControls, ScenePayload, SimViewData, TrackId, ViewMode } from "../types";

type SceneViewportProps = {
  scene: ScenePayload;
  simView: SimViewData;
  track: TrackId;
  chapterId: string;
  viewMode: ViewMode;
  frameIndex: number;
  controls: SandboxControls;
  layers: Record<LayerKey, boolean>;
};

type ViewState = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

type FlatBundleMeta = {
  rows: number;
  cols: number;
  frameCount: number;
  indices: number[];
  timeValues: number[];
  urbanFrac: number[];
  offsets: {
    water: number;
    farmland: number;
    eco: number;
    dikes: number;
    frames: number[];
  };
  sizes: {
    layerBytes: number;
    frameBytes: number;
  };
};

type FlatBundle = {
  meta: FlatBundleMeta;
  bytes: Uint8Array;
  basePixels: Uint8ClampedArray;
};

const META_URL = "data/rccu_flat_bundle.json";
const BUNDLE_URL = "assets/rccu_flat_bundle.bin";
const MIN_ZOOM = 0.84;
const MAX_ZOOM = 3.4;
const DEFAULT_VIEW: ViewState = { zoom: 1, offsetX: 0, offsetY: 0 };

const COLORS = {
  bg: "#f3efe7",
  bare: [239, 235, 233] as const,
  farmLight: [165, 214, 167] as const,
  farmMid: [102, 187, 106] as const,
  ecoMid: [46, 125, 50] as const,
  ecoDeep: [27, 94, 32] as const,
  dike: [120, 144, 156] as const,
  waterMid: [33, 150, 243] as const,
  waterDeep: [21, 101, 192] as const,
};

const URBAN_STOPS = [0.0, 0.12, 0.25, 0.45, 0.60, 0.78, 1.0] as const;
const URBAN_RGBA = [
  [239, 235, 233, 0.0],
  [239, 235, 233, 0.0],
  [255, 171, 145, 0.60],
  [255, 112, 67, 0.80],
  [244, 81, 30, 0.90],
  [230, 74, 25, 0.95],
  [191, 54, 12, 1.0],
] as const;

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function readLayer(bytes: Uint8Array, offset: number, size: number) {
  return bytes.subarray(offset, offset + size);
}

function blurLayer(layer: Uint8Array, cols: number, rows: number, radius: number) {
  if (radius <= 0) {
    return new Uint8Array(layer);
  }

  const horizontal = new Float32Array(layer.length);
  const vertical = new Uint8Array(layer.length);
  const window = radius * 2 + 1;

  for (let row = 0; row < rows; row += 1) {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const col = Math.max(0, Math.min(cols - 1, offset));
      sum += layer[row * cols + col];
    }
    for (let col = 0; col < cols; col += 1) {
      horizontal[row * cols + col] = sum / window;
      const left = Math.max(0, col - radius);
      const right = Math.min(cols - 1, col + radius + 1);
      sum += layer[row * cols + right] - layer[row * cols + left];
    }
  }

  for (let col = 0; col < cols; col += 1) {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const row = Math.max(0, Math.min(rows - 1, offset));
      sum += horizontal[row * cols + col];
    }
    for (let row = 0; row < rows; row += 1) {
      vertical[row * cols + col] = Math.round(sum / window);
      const top = Math.max(0, row - radius);
      const bottom = Math.min(rows - 1, row + radius + 1);
      sum += horizontal[bottom * cols + col] - horizontal[top * cols + col];
    }
  }

  return vertical;
}

function paintLayer(
  pixels: Float32Array,
  mask: Uint8Array,
  color: readonly [number, number, number],
  alpha: number,
  pixelCount: number,
) {
  for (let index = 0; index < pixelCount; index += 1) {
    const weight = (mask[index] / 255) * alpha;
    if (weight <= 0.0001) {
      continue;
    }
    const baseIndex = index * 3;
    pixels[baseIndex] = pixels[baseIndex] * (1 - weight) + color[0] * weight;
    pixels[baseIndex + 1] = pixels[baseIndex + 1] * (1 - weight) + color[1] * weight;
    pixels[baseIndex + 2] = pixels[baseIndex + 2] * (1 - weight) + color[2] * weight;
  }
}

function buildBasePixels(meta: FlatBundleMeta, bytes: Uint8Array) {
  const pixelCount = meta.rows * meta.cols;
  const pixels = new Float32Array(pixelCount * 3);
  for (let index = 0; index < pixelCount; index += 1) {
    const baseIndex = index * 3;
    pixels[baseIndex] = COLORS.bare[0];
    pixels[baseIndex + 1] = COLORS.bare[1];
    pixels[baseIndex + 2] = COLORS.bare[2];
  }

  const farmland = blurLayer(readLayer(bytes, meta.offsets.farmland, meta.sizes.layerBytes), meta.cols, meta.rows, 1);
  const eco = blurLayer(readLayer(bytes, meta.offsets.eco, meta.sizes.layerBytes), meta.cols, meta.rows, 1);
  const dikes = blurLayer(readLayer(bytes, meta.offsets.dikes, meta.sizes.layerBytes), meta.cols, meta.rows, 1);
  const water = blurLayer(readLayer(bytes, meta.offsets.water, meta.sizes.layerBytes), meta.cols, meta.rows, 2);

  paintLayer(pixels, farmland, COLORS.farmLight, 0.85, pixelCount);
  const farmlandBoost = new Uint8Array(farmland.length);
  const ecoCore = new Uint8Array(eco.length);
  const waterCore = new Uint8Array(water.length);
  for (let index = 0; index < pixelCount; index += 1) {
    farmlandBoost[index] = Math.min(255, farmland[index] * 1.5);
    ecoCore[index] = Math.max(0, Math.min(255, (eco[index] - 77) * 2));
    waterCore[index] = Math.max(0, Math.min(255, (water[index] - 140) * 3));
  }
  paintLayer(pixels, farmlandBoost, COLORS.farmMid, 0.45, pixelCount);
  paintLayer(pixels, eco, COLORS.ecoMid, 0.80, pixelCount);
  paintLayer(pixels, ecoCore, COLORS.ecoDeep, 0.50, pixelCount);
  paintLayer(pixels, dikes, COLORS.dike, 0.40, pixelCount);
  paintLayer(pixels, water, COLORS.waterMid, 0.95, pixelCount);
  paintLayer(pixels, waterCore, COLORS.waterDeep, 0.60, pixelCount);

  const out = new Uint8ClampedArray(pixelCount * 4);
  for (let index = 0; index < pixelCount; index += 1) {
    const src = index * 3;
    const dst = index * 4;
    out[dst] = Math.round(clamp(pixels[src], 0, 255));
    out[dst + 1] = Math.round(clamp(pixels[src + 1], 0, 255));
    out[dst + 2] = Math.round(clamp(pixels[src + 2], 0, 255));
    out[dst + 3] = 255;
  }
  return out;
}

function sampleUrbanColor(value: number) {
  const clamped = clamp(value);
  for (let index = 0; index < URBAN_STOPS.length - 1; index += 1) {
    const start = URBAN_STOPS[index];
    const end = URBAN_STOPS[index + 1];
    if (clamped <= end) {
      const t = clamp((clamped - start) / Math.max(0.0001, end - start));
      return {
        r: lerp(URBAN_RGBA[index][0], URBAN_RGBA[index + 1][0], t),
        g: lerp(URBAN_RGBA[index][1], URBAN_RGBA[index + 1][1], t),
        b: lerp(URBAN_RGBA[index][2], URBAN_RGBA[index + 1][2], t),
        a: lerp(URBAN_RGBA[index][3], URBAN_RGBA[index + 1][3], t),
      };
    }
  }
  const last = URBAN_RGBA[URBAN_RGBA.length - 1];
  return { r: last[0], g: last[1], b: last[2], a: last[3] };
}

function makeImageData(bundle: FlatBundle, selectedFrame: number) {
  const { meta, bytes, basePixels } = bundle;
  const frameOffset = meta.offsets.frames[selectedFrame];
  const field = blurLayer(readLayer(bytes, frameOffset, meta.sizes.frameBytes), meta.cols, meta.rows, 1);
  const pixels = new Uint8ClampedArray(basePixels);
  const pixelCount = meta.rows * meta.cols;

  for (let index = 0; index < pixelCount; index += 1) {
    const fieldValue = field[index] / 255;
    if (fieldValue <= 0.01) {
      continue;
    }
    const { r, g, b, a } = sampleUrbanColor(fieldValue);
    const dst = index * 4;
    pixels[dst] = Math.round(pixels[dst] * (1 - a) + r * a);
    pixels[dst + 1] = Math.round(pixels[dst + 1] * (1 - a) + g * a);
    pixels[dst + 2] = Math.round(pixels[dst + 2] * (1 - a) + b * a);
  }

  return new ImageData(pixels, meta.cols, meta.rows);
}

function drawLoading(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(59, 53, 46, 0.72)";
  ctx.font = '600 24px "Source Serif 4", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Loading rendered simulation…", width / 2, height / 2);
}

function renderCanvas(
  ctx: CanvasRenderingContext2D,
  rasterCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  view: ViewState,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const fitScale = Math.min((width - 24) / rasterCanvas.width, (height - 24) / rasterCanvas.height);
  const drawWidth = rasterCanvas.width * fitScale * view.zoom;
  const drawHeight = rasterCanvas.height * fitScale * view.zoom;
  const x = (width - drawWidth) / 2 + view.offsetX;
  const y = (height - drawHeight) / 2 + view.offsetY;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.shadowColor = "rgba(95, 80, 61, 0.14)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.fillRect(x - 2, y - 2, drawWidth + 4, drawHeight + 4);
  ctx.shadowColor = "transparent";
  ctx.drawImage(rasterCanvas, x, y, drawWidth, drawHeight);
  ctx.strokeStyle = "rgba(214, 205, 193, 0.86)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, drawWidth + 1, drawHeight + 1);
  ctx.restore();
}

export function SceneViewport({ simView, frameIndex }: SceneViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rasterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<ViewState>({ ...DEFAULT_VIEW });
  const dragRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const dprRef = useRef(1);
  const bundleRef = useRef<FlatBundle | null>(null);
  const [ready, setReady] = useState(false);

  const selectedBundleFrame = useMemo(() => {
    const totalSceneFrames = Math.max(1, simView.frames.length - 1);
    const bundleFrames = bundleRef.current?.meta.frameCount ?? simView.frames.length;
    return Math.round((frameIndex / totalSceneFrames) * Math.max(0, bundleFrames - 1));
  }, [frameIndex, simView.frames.length]);

  const draw = useMemo(
    () => () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) {
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      const width = container.clientWidth;
      const height = container.clientHeight;
      const bundle = bundleRef.current;
      if (!bundle) {
        drawLoading(ctx, width, height);
        return;
      }

      let rasterCanvas = rasterCanvasRef.current;
      if (!rasterCanvas) {
        rasterCanvas = document.createElement("canvas");
        rasterCanvasRef.current = rasterCanvas;
      }
      rasterCanvas.width = bundle.meta.cols;
      rasterCanvas.height = bundle.meta.rows;
      const rasterCtx = rasterCanvas.getContext("2d");
      if (!rasterCtx) {
        return;
      }
      rasterCtx.putImageData(makeImageData(bundle, selectedBundleFrame), 0, 0);
      renderCanvas(ctx, rasterCanvas, width, height, viewRef.current);
    },
    [selectedBundleFrame],
  );

  useEffect(() => {
    let cancelled = false;

    const loadBundle = async () => {
      const [metaResponse, binResponse] = await Promise.all([fetch(META_URL), fetch(BUNDLE_URL)]);
      const meta = (await metaResponse.json()) as FlatBundleMeta;
      const bytes = new Uint8Array(await binResponse.arrayBuffer());
      if (cancelled) {
        return;
      }
      bundleRef.current = {
        meta,
        bytes,
        basePixels: buildBasePixels(meta, bytes),
      };
      setReady(true);
    };

    loadBundle().catch((error) => {
      console.error(error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const resize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) {
        return;
      }
      const width = container.clientWidth;
      const height = container.clientHeight;
      dprRef.current = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dprRef.current);
      canvas.height = Math.round(height * dprRef.current);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      draw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw, frameIndex, ready]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      dragRef.current = { lastX: event.clientX, lastY: event.clientY };
      canvas.style.cursor = "grabbing";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragRef.current) {
        return;
      }
      viewRef.current.offsetX += event.clientX - dragRef.current.lastX;
      viewRef.current.offsetY += event.clientY - dragRef.current.lastY;
      dragRef.current = { lastX: event.clientX, lastY: event.clientY };
      draw();
    };

    const stopDragging = () => {
      dragRef.current = null;
      canvas.style.cursor = "grab";
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = clamp(viewRef.current.zoom * (event.deltaY < 0 ? 1.08 : 0.92), MIN_ZOOM, MAX_ZOOM);
      viewRef.current.zoom = next;
      draw();
    };

    const onDoubleClick = () => {
      viewRef.current = { ...DEFAULT_VIEW };
      draw();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", stopDragging);
    canvas.addEventListener("pointerleave", stopDragging);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDoubleClick);
    canvas.style.cursor = "grab";

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", stopDragging);
      canvas.removeEventListener("pointerleave", stopDragging);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
    };
  }, [draw]);

  const adjustZoom = (factor: number) => {
    viewRef.current.zoom = clamp(viewRef.current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    draw();
  };

  const fitView = () => {
    viewRef.current = { zoom: 1, offsetX: 0, offsetY: 0 };
    draw();
  };

  const resetView = () => {
    viewRef.current = { ...DEFAULT_VIEW };
    draw();
  };

  return (
    <div ref={containerRef} className="scene-pane scene-pane--canvas">
      <canvas ref={canvasRef} />
      <div className="scene-controls" aria-label="View controls">
        <button type="button" onClick={() => adjustZoom(1.12)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => adjustZoom(0.9)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={fitView}>
          Fit
        </button>
        <button type="button" className="scene-controls__reset" onClick={resetView}>
          Reset
        </button>
      </div>
    </div>
  );
}
