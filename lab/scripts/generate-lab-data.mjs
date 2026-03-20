import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const labRoot = path.resolve(__dirname, "..");
const sourcePath = path.resolve(labRoot, "..", "sim_data.json");
const outDir = path.resolve(labRoot, "public", "data");
const outPath = path.resolve(outDir, "scene-payload.json");
const assetDir = path.resolve(labRoot, "public", "assets");

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const round = (value, digits = 3) => Number(value.toFixed(digits));

const bbox = {
  west: 113.15,
  south: 22.28,
  east: 114.52,
  north: 23.43,
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeGridDistances(binaryGrid) {
  const rows = binaryGrid.length;
  const cols = binaryGrid[0].length;
  const distances = Array.from({ length: rows }, () => Array(cols).fill(Number.POSITIVE_INFINITY));
  const queue = [];
  let head = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (binaryGrid[row][col]) {
        distances[row][col] = 0;
        queue.push([row, col]);
      }
    }
  }

  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (head < queue.length) {
    const [row, col] = queue[head];
    head += 1;
    const current = distances[row][col];
    for (const [dr, dc] of offsets) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
        continue;
      }
      if (distances[nr][nc] > current + 1) {
        distances[nr][nc] = current + 1;
        queue.push([nr, nc]);
      }
    }
  }

  let maxDistance = 0;
  for (const row of distances) {
    for (const value of row) {
      if (Number.isFinite(value)) {
        maxDistance = Math.max(maxDistance, value);
      }
    }
  }

  return distances.map((row) =>
    row.map((value) => (Number.isFinite(value) && maxDistance > 0 ? clamp(1 - value / maxDistance) : 0)),
  );
}

function countTrueNeighbours(grid, row, col, radius = 1) {
  let total = 0;
  for (let dr = -radius; dr <= radius; dr += 1) {
    for (let dc = -radius; dc <= radius; dc += 1) {
      if (!dr && !dc) {
        continue;
      }
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= grid.length || nc < 0 || nc >= grid[0].length) {
        continue;
      }
      total += grid[nr][nc] ? 1 : 0;
    }
  }
  return total;
}

function connectedComponents(binaryGrid) {
  const rows = binaryGrid.length;
  const cols = binaryGrid[0].length;
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const parts = [];

  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!binaryGrid[row][col] || seen[row][col]) {
        continue;
      }
      const cells = [];
      const queue = [[row, col]];
      seen[row][col] = true;
      while (queue.length > 0) {
        const [cr, cc] = queue.pop();
        cells.push([cr, cc]);
        for (const [dr, dc] of offsets) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
            continue;
          }
          if (binaryGrid[nr][nc] && !seen[nr][nc]) {
            seen[nr][nc] = true;
            queue.push([nr, nc]);
          }
        }
      }
      parts.push(cells);
    }
  }

  return parts;
}

function cellBounds(row, col, rows, cols) {
  const width = (bbox.east - bbox.west) / cols;
  const height = (bbox.north - bbox.south) / rows;
  const west = bbox.west + col * width;
  const east = west + width;
  const north = bbox.north - row * height;
  const south = north - height;
  return { west, south, east, north };
}

function cellCenter(row, col, rows, cols) {
  const bounds = cellBounds(row, col, rows, cols);
  return [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];
}

function buildObjects(finalUrban, waterBoost, farmlandGrid) {
  const rows = finalUrban.length;
  const cols = finalUrban[0].length;
  const parts = connectedComponents(finalUrban).filter((part) => part.length >= 6);

  const objects = parts
    .map((cells, index) => {
      let minRow = rows;
      let maxRow = 0;
      let minCol = cols;
      let maxCol = 0;
      let waterSum = 0;
      let farmSum = 0;
      let edgeLike = 0;
      let rowSum = 0;
      let colSum = 0;

      for (const [row, col] of cells) {
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
        waterSum += waterBoost[row][col];
        farmSum += countTrueNeighbours(farmlandGrid, row, col, 1) / 8;
        edgeLike += 1 - clamp(countTrueNeighbours(finalUrban, row, col, 1) / 8);
        rowSum += row;
        colSum += col;
      }

      const width = maxCol - minCol + 1;
      const height = maxRow - minRow + 1;
      const elongation = round(Math.max(width, height) / Math.max(1, Math.min(width, height)));
      const nearWaterCoupling = round(waterSum / cells.length);
      const croplandEmbedding = round(clamp((farmSum / cells.length) * 0.75));
      const urbanSeparation = round(clamp((edgeLike / cells.length) * 1.2));
      const rccuScore = round(
        clamp(
          nearWaterCoupling * 0.38 +
            croplandEmbedding * 0.24 +
            urbanSeparation * 0.18 +
            clamp(elongation / 4.2) * 0.2,
        ),
      );

      const klass = rccuScore >= 0.72 ? "core" : rccuScore >= 0.54 ? "probable" : "non-RCCU";
      const centroid = cellCenter(rowSum / cells.length, colSum / cells.length, rows, cols);
      const leftTop = cellBounds(minRow, minCol, rows, cols);
      const rightBottom = cellBounds(maxRow, maxCol, rows, cols);
      const polygon = [
        [leftTop.west, rightBottom.north],
        [rightBottom.east, rightBottom.north],
        [rightBottom.east, leftTop.south],
        [leftTop.west, leftTop.south],
      ];

      return {
        id: `object-${index + 1}`,
        name: `Prototype ${String(index + 1).padStart(2, "0")}`,
        class: klass,
        centroid: centroid.map((value) => round(value, 5)),
        polygon: polygon.map((pair) => pair.map((value) => round(value, 5))),
        metrics: {
          rccuScore,
          nearWaterCoupling,
          croplandEmbedding,
          urbanSeparation,
          elongation,
          size: cells.length,
        },
      };
    })
    .sort((left, right) => right.metrics.rccuScore - left.metrics.rccuScore)
    .slice(0, 16);

  return objects;
}

function buildSkeleton(objects) {
  return objects.map((object) => {
    const [a, b, c, d] = object.polygon;
    const width = Math.abs(b[0] - a[0]);
    const height = Math.abs(a[1] - d[1]);
    const alongX = width >= height;
    return {
      id: `${object.id}-skeleton`,
      class: object.class,
      path: alongX
        ? [
            [a[0], (a[1] + d[1]) / 2],
            [b[0], (b[1] + c[1]) / 2],
          ]
        : [
            [(a[0] + b[0]) / 2, a[1]],
            [(d[0] + c[0]) / 2, d[1]],
          ],
    };
  });
}

function copyAsset(source, target) {
  if (fs.existsSync(source)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function main() {
  const source = readJson(sourcePath);
  const rows = source.grid.rows;
  const cols = source.grid.cols;
  const water = source.env.water;
  const farmland = source.env.farmland;
  const eco = source.env.eco;
  const waterBoost = normalizeGridDistances(water);

  const edgeSeries = source.diagnostics.edge_length;
  const maxEdge = Math.max(...edgeSeries);
  const frameCount = source.frames.length;
  const frames = [];

  for (let index = 0; index < frameCount; index += 1) {
    const frame = source.frames[index];
    const tiles = frame.tiles;
    const density = frame.density;
    const urban = tiles.map((row) => row.map((tile) => tile === 4));
    let urbanCount = 0;
    let waterAdjCount = 0;
    let farmAdjCount = 0;
    let riskOnUrban = 0;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!urban[row][col]) {
          continue;
        }
        urbanCount += 1;
        if (countTrueNeighbours(water, row, col, 1) > 0) {
          waterAdjCount += 1;
        }
        if (countTrueNeighbours(farmland, row, col, 1) > 0) {
          farmAdjCount += 1;
        }
        riskOnUrban += waterBoost[row][col];
      }
    }

    const components = connectedComponents(urban).filter((part) => part.length >= 2);
    const corridorRatio = source.diagnostics.corridor_ratio[index];
    const urbanFrac = source.diagnostics.urban_frac[index];
    const edgeNorm = maxEdge > 0 ? edgeSeries[index] / maxEdge : 0;
    const nearWaterCoupling = urbanCount ? waterAdjCount / urbanCount : 0;
    const croplandEmbedding = urbanCount ? farmAdjCount / urbanCount : 0;
    const urbanSeparation = urbanCount ? clamp((components.length * 12) / urbanCount) : 0;
    const linearity = clamp(corridorRatio);
    const lowRedundancy = clamp(corridorRatio * 0.52 + edgeNorm * 0.28 + nearWaterCoupling * 0.2);
    const directionConsistency = clamp(0.24 + corridorRatio * 0.46 + nearWaterCoupling * 0.3);
    const endpointEnrichment = clamp(0.2 + edgeNorm * 0.55 + urbanSeparation * 0.25);
    const exposureConcentration = clamp(
      (urbanCount ? riskOnUrban / urbanCount : 0) * 0.38 + nearWaterCoupling * 0.34 + corridorRatio * 0.28,
    );
    const lockInScore = clamp(
      lowRedundancy * 0.34 + directionConsistency * 0.32 + exposureConcentration * 0.34,
    );
    const rccuScore = clamp(corridorRatio * 0.4 + nearWaterCoupling * 0.35 + croplandEmbedding * 0.25);
    const emergenceCurve = clamp(rccuScore * 0.58 + urbanFrac * 0.42);

    frames.push({
      id: `frame-${index}`,
      step: index,
      t: frame.t,
      label: `Step ${String(index + 1).padStart(3, "0")}`,
      timeLabel: `t = ${frame.t}`,
      density: density.map((row) => row.map((value) => round(value, 2))),
      diagnostics: {
        meanU: round(source.diagnostics.mean_u[index]),
        urbanFrac: round(urbanFrac),
        corridorRatio: round(corridorRatio),
        edgeLength: round(edgeSeries[index]),
      },
      metrics: {
        linearity: round(linearity),
        lowRedundancy: round(lowRedundancy),
        directionConsistency: round(directionConsistency),
        endpointEnrichment: round(endpointEnrichment),
        exposureConcentration: round(exposureConcentration),
        lockInScore: round(lockInScore),
        rccuScore: round(rccuScore),
        nearWaterCoupling: round(nearWaterCoupling),
        croplandEmbedding: round(croplandEmbedding),
        urbanSeparation: round(urbanSeparation),
        emergenceCurve: round(emergenceCurve),
      },
    });
  }

  const finalUrban = source.frames.at(-1).tiles.map((row) => row.map((tile) => tile === 4));
  const objects = buildObjects(finalUrban, waterBoost, farmland);
  const skeleton = buildSkeleton(objects);

  const payload = {
    sceneMeta: {
      id: "delta-constraint-lab-v1",
      title: "Pearl River Delta demonstration payload",
      region: "Pearl River Delta",
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      source: "../sim_data.json",
    },
    bbox,
    grid: { rows, cols },
    cameraBookmarks: {
      home: {
        geo: { longitude: 113.83, latitude: 22.84, zoom: 8.65, pitch: 58, bearing: 18 },
        model: { longitude: 113.83, latitude: 22.84, zoom: 8.15, pitch: 68, bearing: -28 },
      },
      nature: {
        phenomenon: { longitude: 113.82, latitude: 22.88, zoom: 8.8, pitch: 58, bearing: 12 },
        structure: { longitude: 113.77, latitude: 22.82, zoom: 9.1, pitch: 64, bearing: -18 },
        mechanism: { longitude: 113.95, latitude: 22.83, zoom: 8.95, pitch: 66, bearing: 34 },
        consequence: { longitude: 113.88, latitude: 22.73, zoom: 9.0, pitch: 60, bearing: 2 },
      },
      cities: {
        whatIsRccu: { longitude: 113.8, latitude: 22.84, zoom: 8.9, pitch: 58, bearing: 12 },
        prdTimeline: { longitude: 113.9, latitude: 22.86, zoom: 8.6, pitch: 67, bearing: -24 },
        prototypeObjects: { longitude: 113.73, latitude: 22.73, zoom: 9.25, pitch: 62, bearing: 14 },
        waterGuidance: { longitude: 113.99, latitude: 22.82, zoom: 9.05, pitch: 65, bearing: 28 },
      },
    },
    layers: {
      water,
      farmland,
      eco,
      waterBoost: waterBoost.map((row) => row.map((value) => round(value))),
      risk: source.frames.at(-1).tiles.map((row, rowIndex) =>
        row.map((tile, colIndex) =>
          round(
            clamp(
              waterBoost[rowIndex][colIndex] * 0.72 +
                (tile === 4 ? 0.22 : 0) +
                (farmland[rowIndex][colIndex] ? 0.08 : 0) -
                (eco[rowIndex][colIndex] ? 0.12 : 0),
            ),
          ),
        ),
      ),
      redundancy: source.frames.at(-1).tiles.map((row, rowIndex) =>
        row.map((tile, colIndex) =>
          round(
            clamp(
              1 -
                (waterBoost[rowIndex][colIndex] * 0.55 +
                  (tile === 4 ? 0.15 : 0) +
                  (countTrueNeighbours(finalUrban, rowIndex, colIndex, 1) <= 2 ? 0.18 : 0)),
            ),
          ),
        ),
      ),
      skeleton,
    },
    objects,
    metricCatalog: {
      nature: [
        "linearity",
        "lowRedundancy",
        "directionConsistency",
        "endpointEnrichment",
        "exposureConcentration",
        "lockInScore",
      ],
      cities: [
        "rccuScore",
        "nearWaterCoupling",
        "croplandEmbedding",
        "urbanSeparation",
        "emergenceCurve",
        "linearity",
      ],
    },
    frames,
    annotations: {
      nature: {
        phenomenon: [
          {
            id: "nature-phenomenon-1",
            position: objects[0]?.centroid ?? [113.81, 22.86],
            title: "Counterintuitive aggregation",
            body: "Growth intensity remains attached to risky, water-linked cells.",
          }
        ],
        structure: [
          {
            id: "nature-structure-1",
            position: objects[1]?.centroid ?? [113.73, 22.76],
            title: "Low-redundancy branch",
            body: "Elongated substructures concentrate on edge-like paths with weak substitutes.",
          }
        ],
        mechanism: [
          {
            id: "nature-mechanism-1",
            position: objects[2]?.centroid ?? [114.02, 22.86],
            title: "Guidance + protection",
            body: "River alignment and protection can jointly steer settlement persistence.",
          }
        ],
        consequence: [
          {
            id: "nature-consequence-1",
            position: objects[3]?.centroid ?? [113.92, 22.69],
            title: "Exposure hotspot",
            body: "Hazard and constrained growth overlap on the thinnest developed edges.",
          }
        ]
      },
      cities: {
        whatIsRccu: [
          {
            id: "cities-rccu-1",
            position: objects[0]?.centroid ?? [113.81, 22.86],
            title: "Prototype corridor",
            body: "A compact, water-coupled prototype rather than ordinary diffuse expansion.",
          }
        ],
        prdTimeline: [
          {
            id: "cities-timeline-1",
            position: objects[4]?.centroid ?? [113.97, 22.83],
            title: "Emergence path",
            body: "Thin chains appear first and later thicken along constrained axes.",
          }
        ],
        prototypeObjects: [
          {
            id: "cities-object-1",
            position: objects[1]?.centroid ?? [113.71, 22.74],
            title: "Core object",
            body: "High coupling, elongated form, and distinct separation from compact city cores.",
          }
        ],
        waterGuidance: [
          {
            id: "cities-water-1",
            position: objects[2]?.centroid ?? [114.02, 22.86],
            title: "Guidance sensitivity",
            body: "Weaker water guidance broadens the geometry and reduces object confidence.",
          }
        ]
      }
    }
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload), "utf8");

  copyAsset(path.resolve(labRoot, "..", "output", "_repo_web_final_v2.png"), path.resolve(assetDir, "preview-hero.png"));
  copyAsset(path.resolve(labRoot, "..", "output", "rccu_snapshots_iso.png"), path.resolve(assetDir, "preview-timeline.png"));

  console.log(`Generated ${path.relative(labRoot, outPath)} from ${path.relative(labRoot, sourcePath)}`);
}

main();
