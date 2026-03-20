import { useEffect, useMemo, useRef } from "react";

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

type ScenePalette = {
  bg: string;
  shadow: string;
  water: string;
  waterEdge: string;
  waterShine: string;
  farmTop: string;
  farmLeft: string;
  farmRight: string;
  farmLine: string;
  ecoTop: string;
  ecoLeft: string;
  ecoRight: string;
  bareTop: string;
  bareLeft: string;
  bareRight: string;
  urbanPodiumTop: string;
  urbanPodiumLeft: string;
  urbanPodiumRight: string;
  urbanMainTop: string;
  urbanMainLeft: string;
  urbanMainRight: string;
  urbanTowerTop: string;
  urbanTowerTopAlt: string;
  urbanTowerLeft: string;
  urbanTowerLeftAlt: string;
  urbanTowerRight: string;
  urbanTowerRightAlt: string;
  urbanGlass: string;
};

type BoardLayout = {
  originX: number;
  originY: number;
  width: number;
  height: number;
  maxTowerH: number;
  tileW: number;
  tileH: number;
};

type ViewState = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

const DAY_SCENE: ScenePalette = {
  bg: "#f7f3ec",
  shadow: "rgba(188, 168, 142, 0.16)",
  water: "#6bc3f3",
  waterEdge: "#2f97d7",
  waterShine: "rgba(255,255,255,0.58)",
  farmTop: "#9ed97d",
  farmLeft: "#78c66a",
  farmRight: "#63ba5e",
  farmLine: "rgba(255,255,255,0.24)",
  ecoTop: "#5ea65b",
  ecoLeft: "#3a7d40",
  ecoRight: "#33713b",
  bareTop: "#eadfd4",
  bareLeft: "#dccdbf",
  bareRight: "#d4c2b3",
  urbanPodiumTop: "#f7ebe4",
  urbanPodiumLeft: "#efcabc",
  urbanPodiumRight: "#e0ab93",
  urbanMainTop: "#fff2eb",
  urbanMainLeft: "#f4ddd2",
  urbanMainRight: "#e8bca5",
  urbanTowerTop: "#ff875c",
  urbanTowerTopAlt: "#ffab87",
  urbanTowerLeft: "#f8e2d6",
  urbanTowerLeftAlt: "#f2d5c8",
  urbanTowerRight: "#d79a80",
  urbanTowerRightAlt: "#ddb099",
  urbanGlass: "rgba(115, 194, 245, 0.62)",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hash01(a: number, b: number, c = 0) {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 29.3) * 43758.5453123;
  return value - Math.floor(value);
}

function computeBoardLayout(width: number, height: number, simView: SimViewData): BoardLayout {
  const rows = simView.grid.rows;
  const cols = simView.grid.cols;
  const availW = width * 0.94;
  const availH = height * 0.8;
  const tileWByWidth = availW / ((rows + cols) * 0.54);
  const tileWByHeight = availH / (((rows + cols) * 0.25) + 9.5);
  const tileW = clamp(Math.min(tileWByWidth, tileWByHeight), 9, 26);
  const tileH = tileW * 0.48;
  const boardW = (rows + cols) * tileW * 0.5;
  const boardH = (rows + cols) * tileH * 0.5;
  const maxTowerH = tileH * 13.8;

  return {
    originX: width / 2,
    originY: 36 + maxTowerH * 0.9,
    width: boardW,
    height: boardH,
    maxTowerH,
    tileW,
    tileH,
  };
}

function isoPoint(r: number, c: number, board: BoardLayout) {
  return {
    x: board.originX + (c - r) * board.tileW * 0.5,
    y: board.originY + (c + r) * board.tileH * 0.5,
  };
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string | null = null,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x, y + h / 2);
  ctx.lineTo(x - w / 2, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.restore();
}

function drawPrism(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lift: number,
  top: string,
  left: string,
  right: string,
  outline: string | null = null,
) {
  const topY = y - lift;

  ctx.beginPath();
  ctx.moveTo(x, topY - h / 2);
  ctx.lineTo(x + w / 2, topY);
  ctx.lineTo(x, topY + h / 2);
  ctx.lineTo(x - w / 2, topY);
  ctx.closePath();
  ctx.fillStyle = top;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - w / 2, topY);
  ctx.lineTo(x, topY + h / 2);
  ctx.lineTo(x, y + h / 2);
  ctx.lineTo(x - w / 2, y);
  ctx.closePath();
  ctx.fillStyle = left;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + w / 2, topY);
  ctx.lineTo(x, topY + h / 2);
  ctx.lineTo(x, y + h / 2);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fillStyle = right;
  ctx.fill();

  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

function drawBare(ctx: CanvasRenderingContext2D, x: number, y: number, board: BoardLayout, scene: ScenePalette) {
  drawPrism(
    ctx,
    x,
    y,
    board.tileW,
    board.tileH,
    board.tileH * 0.12,
    scene.bareTop,
    scene.bareLeft,
    scene.bareRight,
    "rgba(180,150,135,0.18)",
  );
}

function drawFarmland(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  c: number,
  board: BoardLayout,
  scene: ScenePalette,
) {
  drawPrism(
    ctx,
    x,
    y,
    board.tileW,
    board.tileH,
    board.tileH * 0.18,
    scene.farmTop,
    scene.farmLeft,
    scene.farmRight,
    null,
  );

  ctx.save();
  ctx.strokeStyle = scene.farmLine;
  ctx.lineWidth = 0.8;
  for (let index = -1; index <= 1; index += 1) {
    const phase = hash01(r, c, index);
    ctx.beginPath();
    ctx.moveTo(x - board.tileW * 0.28 + index * board.tileW * 0.16, y - board.tileH * 0.02);
    ctx.lineTo(
      x + board.tileW * 0.02 + index * board.tileW * 0.16,
      y - board.tileH * 0.21 - phase * board.tileH * 0.05,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawEco(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  c: number,
  board: BoardLayout,
  scene: ScenePalette,
) {
  drawPrism(
    ctx,
    x,
    y,
    board.tileW,
    board.tileH,
    board.tileH * 0.22,
    scene.ecoTop,
    scene.ecoLeft,
    scene.ecoRight,
    null,
  );

  const crowns = 2 + Math.round(hash01(r, c, 5) * 1.5);
  for (let index = 0; index < crowns; index += 1) {
    const dx = (hash01(r, c, 20 + index) - 0.5) * board.tileW * 0.26;
    const dy = (hash01(r, c, 30 + index) - 0.5) * board.tileH * 0.18;
    const radius = board.tileH * (0.18 + hash01(r, c, 40 + index) * 0.12);
    ctx.fillStyle = index % 2 ? "#347f38" : "#57b45a";
    ctx.beginPath();
    ctx.arc(x + dx, y - board.tileH * 0.54 + dy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5b4535";
    ctx.fillRect(x + dx - 0.8, y - board.tileH * 0.38 + dy, 1.6, board.tileH * 0.2);
  }
}

function drawSettlement(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  density: number,
  heightValue: number,
  r: number,
  c: number,
  board: BoardLayout,
  scene: ScenePalette,
) {
  const podiumLift = board.tileH * 0.34;
  drawPrism(
    ctx,
    x,
    y,
    board.tileW,
    board.tileH,
    podiumLift,
    scene.urbanPodiumTop,
    scene.urbanPodiumLeft,
    scene.urbanPodiumRight,
    "rgba(255,255,255,0.4)",
  );

  ctx.save();
  ctx.fillStyle = "rgba(197, 108, 67, 0.14)";
  ctx.beginPath();
  ctx.ellipse(
    x + board.tileW * 0.08,
    y + board.tileH * 0.18,
    board.tileW * 0.28,
    board.tileH * 0.14,
    0.18,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  const h = Math.pow(clamp(heightValue ?? density, 0, 1), 0.76);
  const compact = Math.pow(clamp(density, 0, 1), 0.88);

  drawPrism(
    ctx,
    x + board.tileW * 0.02,
    y - podiumLift * 0.46,
    board.tileW * 0.54,
    board.tileH * 0.24,
    board.tileH * (0.35 + h * 0.58),
    scene.urbanMainTop,
    scene.urbanMainLeft,
    scene.urbanMainRight,
    null,
  );

  const towers: Array<{ dx: number; dy: number; w: number; d: number; h: number }> = [];
  if (h > 0.06) {
    towers.push({ dx: 0, dy: 0, w: board.tileW * 0.56, d: board.tileH * 0.46, h: board.tileH * (1.8 + h * 9.4) });
  }
  if (h > 0.18 || compact > 0.42) {
    towers.push({
      dx: -board.tileW * 0.2,
      dy: board.tileH * 0.05,
      w: board.tileW * 0.34,
      d: board.tileH * 0.3,
      h: board.tileH * (1.1 + h * 4.8),
    });
  }
  if (h > 0.38) {
    towers.push({
      dx: board.tileW * 0.22,
      dy: -board.tileH * 0.03,
      w: board.tileW * 0.32,
      d: board.tileH * 0.28,
      h: board.tileH * (1 + h * 4.2),
    });
  }
  if (h > 0.72) {
    towers.push({
      dx: board.tileW * 0.02,
      dy: -board.tileH * 0.2,
      w: board.tileW * 0.22,
      d: board.tileH * 0.22,
      h: board.tileH * (0.9 + h * 2.5),
    });
  }

  towers.forEach((tower, index) => {
    const jitter = (hash01(r, c, 80 + index) - 0.5) * board.tileW * 0.04;
    const bx = x + tower.dx + jitter;
    const by = y - podiumLift * 0.9 + tower.dy;
    const top = index === 0 ? scene.urbanTowerTop : scene.urbanTowerTopAlt;
    const left = index === 0 ? scene.urbanTowerLeft : scene.urbanTowerLeftAlt;
    const right = index === 0 ? scene.urbanTowerRight : scene.urbanTowerRightAlt;
    drawPrism(ctx, bx, by, tower.w, tower.d, tower.h, top, left, right, null);

    const windows = Math.max(2, Math.floor(tower.h / (board.tileH * 0.62)));
    ctx.save();
    ctx.fillStyle = scene.urbanGlass;
    for (let row = 0; row < windows; row += 1) {
      const wy = by - tower.h + tower.d * 0.55 + row * board.tileH * 0.44;
      ctx.fillRect(bx - tower.w * 0.22, wy, tower.w * 0.1, board.tileH * 0.11);
      ctx.fillRect(bx + tower.w * 0.02, wy + board.tileH * 0.03, tower.w * 0.14, board.tileH * 0.11);
    }
    ctx.restore();
  });
}

function drawWaterNetwork(
  ctx: CanvasRenderingContext2D,
  frame: SimViewData["frames"][number],
  board: BoardLayout,
  scene: ScenePalette,
) {
  const rows = frame.tiles.length;
  const cols = frame.tiles[0].length;

  const hasWater = (row: number, col: number) =>
    row >= 0 && row < rows && col >= 0 && col < cols && frame.tiles[row][col] === 2;

  const drawSegment = (ax: number, ay: number, bx: number, by: number, width: number) => {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = scene.waterEdge;
    ctx.lineWidth = width * 1.28;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    ctx.strokeStyle = scene.water;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    ctx.strokeStyle = scene.waterShine;
    ctx.lineWidth = width * 0.18;
    ctx.beginPath();
    ctx.moveTo(ax - width * 0.06, ay - width * 0.06);
    ctx.lineTo(bx - width * 0.06, by - width * 0.06);
    ctx.stroke();
    ctx.restore();
  };

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!hasWater(row, col)) {
        continue;
      }
      const center = isoPoint(row, col, board);
      const density = frame.density?.[row]?.[col] ?? 0;
      const waterWidth = board.tileH * (0.54 + density * 0.18);

      if (hasWater(row + 1, col)) {
        const next = isoPoint(row + 1, col, board);
        drawSegment(center.x, center.y + board.tileH * 0.02, next.x, next.y + board.tileH * 0.02, waterWidth);
      }
      if (hasWater(row, col + 1)) {
        const next = isoPoint(row, col + 1, board);
        drawSegment(center.x, center.y + board.tileH * 0.02, next.x, next.y + board.tileH * 0.02, waterWidth);
      }

      const branches =
        Number(hasWater(row - 1, col)) +
        Number(hasWater(row + 1, col)) +
        Number(hasWater(row, col - 1)) +
        Number(hasWater(row, col + 1));
      drawDiamond(
        ctx,
        center.x,
        center.y + board.tileH * 0.06,
        board.tileW * (branches >= 3 ? 0.74 : 0.56),
        board.tileH * (branches >= 3 ? 0.56 : 0.38),
        scene.water,
        null,
      );
    }
  }
}

export function SceneViewport({ simView, frameIndex }: SceneViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<BoardLayout | null>(null);
  const viewRef = useRef<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const dprRef = useRef(1);

  const frame = useMemo(() => simView.frames[frameIndex], [simView, frameIndex]);

  const renderFrame = useMemo(
    () => () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      const board = boardRef.current;
      if (!container || !canvas || !board) {
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      const width = container.clientWidth;
      const height = container.clientHeight;
      const scene = DAY_SCENE;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = scene.bg;
      ctx.fillRect(0, 0, width, height);

      const view = viewRef.current;
      ctx.save();
      ctx.translate(view.offsetX, view.offsetY);
      ctx.scale(view.scale, view.scale);

      ctx.fillStyle = scene.shadow;
      ctx.beginPath();
      ctx.ellipse(
        board.originX,
        board.originY + board.height * 0.58,
        board.width * 0.42,
        board.height * 0.24,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      const rows = simView.grid.rows;
      const cols = simView.grid.cols;
      const farmlandEnv = simView.env?.farmland ?? [];
      const ecoEnv = simView.env?.eco ?? [];

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const kind = frame.tiles[row][col];
          const density = frame.density?.[row]?.[col] ?? 0;
          const heightValue = frame.height?.[row]?.[col] ?? density;
          const { x, y } = isoPoint(row, col, board);

          if (kind === 4) {
            drawSettlement(ctx, x, y, density, heightValue, row, col, board, scene);
            continue;
          }

          if (kind === 2) {
            const farmNearby = farmlandEnv[row]?.[col] ?? 0;
            if (farmNearby) {
              drawFarmland(ctx, x, y, row, col, board, scene);
            } else {
              drawBare(ctx, x, y, board, scene);
            }
            continue;
          }

          if (kind === 1) {
            drawFarmland(ctx, x, y, row, col, board, scene);
          } else if (kind === 3 || ecoEnv[row]?.[col]) {
            drawEco(ctx, x, y, row, col, board, scene);
          } else {
            drawBare(ctx, x, y, board, scene);
          }
        }
      }

      drawWaterNetwork(ctx, frame, board, scene);
      ctx.restore();
    },
    [frame, simView],
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
      boardRef.current = computeBoardLayout(width, height, simView);
      renderFrame();
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
  }, [renderFrame, simView]);

  useEffect(() => {
    renderFrame();
  }, [frameIndex, renderFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      const view = viewRef.current;
      view.offsetX = view.offsetX;
      view.offsetY = view.offsetY;
      (canvas as HTMLCanvasElement).dataset.dragging = "true";
      (canvas as HTMLCanvasElement).dataset.lastX = String(event.clientX);
      (canvas as HTMLCanvasElement).dataset.lastY = String(event.clientY);
      canvas.style.cursor = "grabbing";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (canvas.dataset.dragging !== "true") {
        return;
      }
      const lastX = Number(canvas.dataset.lastX ?? event.clientX);
      const lastY = Number(canvas.dataset.lastY ?? event.clientY);
      viewRef.current.offsetX += event.clientX - lastX;
      viewRef.current.offsetY += event.clientY - lastY;
      canvas.dataset.lastX = String(event.clientX);
      canvas.dataset.lastY = String(event.clientY);
      renderFrame();
    };

    const stopDragging = () => {
      canvas.dataset.dragging = "false";
      canvas.style.cursor = "grab";
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const previous = viewRef.current.scale;
      const next = clamp(previous * (event.deltaY < 0 ? 1.08 : 0.92), 0.74, 2.6);
      if (Math.abs(previous - next) < 1e-6) {
        return;
      }
      const wx = (event.clientX - viewRef.current.offsetX) / previous;
      const wy = (event.clientY - viewRef.current.offsetY) / previous;
      viewRef.current.scale = next;
      viewRef.current.offsetX = event.clientX - wx * next;
      viewRef.current.offsetY = event.clientY - wy * next;
      renderFrame();
    };

    const onDoubleClick = () => {
      viewRef.current = { scale: 1, offsetX: 0, offsetY: 0 };
      renderFrame();
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
  }, [renderFrame]);

  return (
    <div ref={containerRef} className="scene-pane scene-pane--canvas">
      <canvas ref={canvasRef} />
    </div>
  );
}
