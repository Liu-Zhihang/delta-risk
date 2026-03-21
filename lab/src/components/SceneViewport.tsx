import { useEffect, useMemo, useRef } from "react";

import type { LayerKey, SandboxControls, ScenePayload, SimViewData, SimViewFrame, TrackId, ViewMode } from "../types";

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

type Matrix = number[][];
type Rgb = [number, number, number];

type ViewState = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

type BaseRaster = {
  rows: number;
  cols: number;
  pixels: Uint8ClampedArray;
};

const DEFAULT_VIEW: ViewState = {
  zoom: 1,
  offsetX: -4,
  offsetY: 0,
};

const MIN_ZOOM = 0.82;
const MAX_ZOOM = 4.2;

const COLORS = {
  background: "#f1ede6",
  bare: [239, 235, 233] as Rgb,
  farmLight: [165, 214, 167] as Rgb,
  farmMid: [102, 187, 106] as Rgb,
  ecoMid: [46, 125, 50] as Rgb,
  ecoDeep: [27, 94, 32] as Rgb,
  dike: [120, 144, 156] as Rgb,
  waterMid: [33, 150, 243] as Rgb,
  waterDeep: [21, 101, 192] as Rgb,
};

const URBAN_RAMP = [
  { position: 0.0, color: [239, 235, 233] as Rgb, alpha: 0.0 },
  { position: 0.12, color: [239, 235, 233] as Rgb, alpha: 0.0 },
  { position: 0.25, color: [255, 171, 145] as Rgb, alpha: 0.6 },
  { position: 0.45, color: [255, 112, 67] as Rgb, alpha: 0.8 },
  { position: 0.6, color: [244, 81, 30] as Rgb, alpha: 0.9 },
  { position: 0.78, color: [230, 74, 25] as Rgb, alpha: 0.95 },
  { position: 1.0, color: [191, 54, 12] as Rgb, alpha: 1.0 },
] as const;

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function createMatrix(rows: number, cols: number, fill = 0): Matrix {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}

function copyMatrix(matrix: Matrix): Matrix {
  return matrix.map((row) => [...row]);
}

function matrixFromPredicate(tiles: number[][], predicate: (kind: number) => boolean): Matrix {
  return tiles.map((row) => row.map((kind) => (predicate(kind) ? 1 : 0)));
}

function blurPass(input: Matrix, radius: number): Matrix {
  if (radius <= 0) {
    return copyMatrix(input);
  }

  const rows = input.length;
  const cols = input[0]?.length ?? 0;
  const horizontal = createMatrix(rows, cols, 0);
  const vertical = createMatrix(rows, cols, 0);
  const window = radius * 2 + 1;

  for (let row = 0; row < rows; row += 1) {
    let sum = 0;
    for (let col = -radius; col <= radius; col += 1) {
      const sampleCol = Math.max(0, Math.min(cols - 1, col));
      sum += input[row][sampleCol];
    }
    for (let col = 0; col < cols; col += 1) {
      horizontal[row][col] = sum / window;
      const left = Math.max(0, col - radius);
      const right = Math.min(cols - 1, col + radius + 1);
      sum += input[row][right] - input[row][left];
    }
  }

  for (let col = 0; col < cols; col += 1) {
    let sum = 0;
    for (let row = -radius; row <= radius; row += 1) {
      const sampleRow = Math.max(0, Math.min(rows - 1, row));
      sum += horizontal[sampleRow][col];
    }
    for (let row = 0; row < rows; row += 1) {
      vertical[row][col] = sum / window;
      const top = Math.max(0, row - radius);
      const bottom = Math.min(rows - 1, row + radius + 1);
      sum += horizontal[bottom][col] - horizontal[top][col];
    }
  }

  return vertical;
}

function blurMatrix(input: Matrix, radius: number, passes = 1): Matrix {
  let current = copyMatrix(input);
  for (let pass = 0; pass < passes; pass += 1) {
    current = blurPass(current, radius);
  }
  return current;
}

function paintLayer(base: Float32Array, rows: number, cols: number, mask: Matrix, color: Rgb, alpha: number) {
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const weight = clamp(mask[row][col]) * alpha;
      if (weight <= 0.0001) {
        continue;
      }
      const index = (row * cols + col) * 3;
      base[index] = base[index] * (1 - weight) + color[0] * weight;
      base[index + 1] = base[index + 1] * (1 - weight) + color[1] * weight;
      base[index + 2] = base[index + 2] * (1 - weight) + color[2] * weight;
    }
  }
}

function buildBaseRaster(simView: SimViewData): BaseRaster {
  const rows = simView.grid.rows;
  const cols = simView.grid.cols;
  const frame0 = simView.frames[0];

  const waterBinary = simView.env?.water ?? matrixFromPredicate(frame0.tiles, (kind) => kind === 2);
  const farmland = simView.env?.farmland ?? matrixFromPredicate(frame0.tiles, (kind) => kind === 1);
  const eco = simView.env?.eco ?? matrixFromPredicate(frame0.tiles, (kind) => kind === 3);

  const waterField = blurMatrix(waterBinary, 2, 3);
  const farmSoft = blurMatrix(farmland, 1, 2);
  const ecoSoft = blurMatrix(eco, 1, 2);
  const dikes = createMatrix(rows, cols, 0);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      dikes[row][col] = clamp((waterField[row][col] - waterBinary[row][col] * 0.78 - 0.06) * 1.7);
    }
  }

  const base = new Float32Array(rows * cols * 3);
  for (let index = 0; index < rows * cols; index += 1) {
    base[index * 3] = COLORS.bare[0];
    base[index * 3 + 1] = COLORS.bare[1];
    base[index * 3 + 2] = COLORS.bare[2];
  }

  paintLayer(base, rows, cols, farmSoft, COLORS.farmLight, 0.85);
  paintLayer(
    base,
    rows,
    cols,
    farmSoft.map((row) => row.map((value) => clamp(value * 1.5))),
    COLORS.farmMid,
    0.45,
  );
  paintLayer(base, rows, cols, ecoSoft, COLORS.ecoMid, 0.8);
  paintLayer(
    base,
    rows,
    cols,
    ecoSoft.map((row) => row.map((value) => clamp((value - 0.25) * 1.8))),
    COLORS.ecoDeep,
    0.5,
  );
  paintLayer(base, rows, cols, dikes, COLORS.dike, 0.28);
  paintLayer(base, rows, cols, waterBinary, COLORS.waterMid, 0.96);
  paintLayer(
    base,
    rows,
    cols,
    waterField.map((row) => row.map((value) => clamp((value - 0.34) * 2.3))),
    COLORS.waterDeep,
    0.58,
  );

  const pixels = new Uint8ClampedArray(rows * cols * 4);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const source = (row * cols + col) * 3;
      const target = (row * cols + col) * 4;
      pixels[target] = Math.round(clamp(base[source], 0, 255));
      pixels[target + 1] = Math.round(clamp(base[source + 1], 0, 255));
      pixels[target + 2] = Math.round(clamp(base[source + 2], 0, 255));
      pixels[target + 3] = 255;
    }
  }

  return { rows, cols, pixels };
}

function sampleUrbanRamp(value: number) {
  const clamped = clamp(value);
  for (let index = 0; index < URBAN_RAMP.length - 1; index += 1) {
    const start = URBAN_RAMP[index];
    const end = URBAN_RAMP[index + 1];
    if (clamped <= end.position) {
      const span = Math.max(0.0001, end.position - start.position);
      const t = clamp((clamped - start.position) / span);
      return {
        color: [
          start.color[0] + (end.color[0] - start.color[0]) * t,
          start.color[1] + (end.color[1] - start.color[1]) * t,
          start.color[2] + (end.color[2] - start.color[2]) * t,
        ] as Rgb,
        alpha: start.alpha + (end.alpha - start.alpha) * t,
      };
    }
  }

  const last = URBAN_RAMP[URBAN_RAMP.length - 1];
  return { color: last.color, alpha: last.alpha };
}

function buildFrameImage(baseRaster: BaseRaster, frame: SimViewFrame) {
  const { rows, cols } = baseRaster;
  const pixels = new Uint8ClampedArray(baseRaster.pixels);
  const settlementMask = matrixFromPredicate(frame.tiles, (kind) => kind === 4 || kind === 5);
  const urbanSoft = blurMatrix(frame.density, 2, 2);
  const urbanSeeds = blurMatrix(settlementMask, 1, 1);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const fieldValue = clamp(Math.pow(Math.max(urbanSoft[row][col], urbanSeeds[row][col] * 0.24), 0.86));
      if (fieldValue <= 0.02) {
        continue;
      }
      const { color, alpha } = sampleUrbanRamp(fieldValue);
      const index = (row * cols + col) * 4;
      pixels[index] = Math.round(pixels[index] * (1 - alpha) + color[0] * alpha);
      pixels[index + 1] = Math.round(pixels[index + 1] * (1 - alpha) + color[1] * alpha);
      pixels[index + 2] = Math.round(pixels[index + 2] * (1 - alpha) + color[2] * alpha);
    }
  }

  return new ImageData(pixels, cols, rows);
}

function computeFitScale(width: number, height: number, cols: number, rows: number) {
  return Math.min((width - 72) / cols, (height - 72) / rows);
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  rasterCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  view: ViewState,
  rows: number,
  cols: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  const fitScale = computeFitScale(width, height, cols, rows);
  const drawWidth = cols * fitScale * view.zoom;
  const drawHeight = rows * fitScale * view.zoom;
  const x = (width - drawWidth) / 2 + view.offsetX;
  const y = (height - drawHeight) / 2 + view.offsetY;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.shadowColor = "rgba(106, 93, 76, 0.16)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "rgba(255, 255, 255, 0.74)";
  ctx.fillRect(x - 3, y - 3, drawWidth + 6, drawHeight + 6);
  ctx.shadowColor = "transparent";
  ctx.drawImage(rasterCanvas, x, y, drawWidth, drawHeight);
  ctx.strokeStyle = "rgba(165, 153, 138, 0.38)";
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

  const baseRaster = useMemo(() => buildBaseRaster(simView), [simView]);
  const frameImage = useMemo(() => buildFrameImage(baseRaster, simView.frames[frameIndex]), [baseRaster, frameIndex, simView]);

  const render = useMemo(
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
      let rasterCanvas = rasterCanvasRef.current;
      if (!rasterCanvas) {
        rasterCanvas = document.createElement("canvas");
        rasterCanvasRef.current = rasterCanvas;
      }
      rasterCanvas.width = baseRaster.cols;
      rasterCanvas.height = baseRaster.rows;
      const rasterCtx = rasterCanvas.getContext("2d");
      if (!rasterCtx) {
        return;
      }
      rasterCtx.putImageData(frameImage, 0, 0);

      drawScene(ctx, rasterCanvas, width, height, viewRef.current, baseRaster.rows, baseRaster.cols);
    },
    [baseRaster.cols, baseRaster.rows, frameImage],
  );

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
      render();
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
  }, [render]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
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
      render();
    };

    const stopDragging = () => {
      dragRef.current = null;
      canvas.style.cursor = "grab";
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const width = container.clientWidth;
      const height = container.clientHeight;
      const fitScale = computeFitScale(width, height, baseRaster.cols, baseRaster.rows);
      const previousZoom = viewRef.current.zoom;
      const nextZoom = clamp(previousZoom * (event.deltaY < 0 ? 1.08 : 0.92), MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(nextZoom - previousZoom) < 0.0001) {
        return;
      }

      const prevWidth = baseRaster.cols * fitScale * previousZoom;
      const prevHeight = baseRaster.rows * fitScale * previousZoom;
      const prevX = (width - prevWidth) / 2 + viewRef.current.offsetX;
      const prevY = (height - prevHeight) / 2 + viewRef.current.offsetY;
      const localX = clamp((event.offsetX - prevX) / Math.max(1, prevWidth));
      const localY = clamp((event.offsetY - prevY) / Math.max(1, prevHeight));

      viewRef.current.zoom = nextZoom;
      const nextWidth = baseRaster.cols * fitScale * nextZoom;
      const nextHeight = baseRaster.rows * fitScale * nextZoom;
      const nextX = event.offsetX - localX * nextWidth;
      const nextY = event.offsetY - localY * nextHeight;
      viewRef.current.offsetX = nextX - (width - nextWidth) / 2;
      viewRef.current.offsetY = nextY - (height - nextHeight) / 2;
      render();
    };

    const onDoubleClick = () => {
      viewRef.current = { ...DEFAULT_VIEW };
      render();
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
  }, [baseRaster.cols, baseRaster.rows, render]);

  const adjustZoom = (factor: number) => {
    viewRef.current.zoom = clamp(viewRef.current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    render();
  };

  const fitView = () => {
    viewRef.current = { zoom: 1, offsetX: 0, offsetY: 0 };
    render();
  };

  const resetView = () => {
    viewRef.current = { ...DEFAULT_VIEW };
    render();
  };

  return (
    <div ref={containerRef} className="scene-pane scene-pane--canvas">
      <canvas ref={canvasRef} />
      <div className="scene-controls" aria-label="View controls">
        <button type="button" onClick={() => adjustZoom(1.14)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => adjustZoom(0.88)} aria-label="Zoom out">
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
