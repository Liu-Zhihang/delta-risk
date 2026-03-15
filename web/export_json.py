#!/usr/bin/env python3
"""
export_json.py – Convert RCCU simulation .npz to JSON for Three.js frontend.

Downsamples continuous fields to a tile grid, classifies each tile,
and outputs a compact JSON with environment layers + time-series frames.

Usage:
    python export_json.py --npz path/to/rccu_run.npz --out sim_data.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


# Match viz_iso denser grid so web and static outputs are consistent
TILE_ROWS = 48
TILE_COLS = 72
U_THRESHOLD = 0.40


def downsample_field(field: np.ndarray, rows: int, cols: int) -> np.ndarray:
    ny, nx = field.shape
    sy, sx = ny / rows, nx / cols
    out = np.zeros((rows, cols), dtype=np.float32)
    for r in range(rows):
        y0, y1 = int(r * sy), int(min((r + 1) * sy, ny))
        for c in range(cols):
            x0, x1 = int(c * sx), int(min((c + 1) * sx, nx))
            out[r, c] = float(field[y0:y1, x0:x1].mean())
    return out


def classify_tile(water: float, urban: float, eco: float, farm: float, dike: float) -> int:
    if water > 0.40:
        return 2
    if urban > U_THRESHOLD:
        return 4
    if eco > 0.40:
        return 3
    if dike > 0.35:
        return 5
    if farm > 0.20:
        return 1
    return 0


def main():
    p = argparse.ArgumentParser(description="Export RCCU npz to JSON for Three.js")
    p.add_argument("--npz", type=Path, required=True)
    p.add_argument("--out", type=Path, default=Path("sim_data.json"))
    p.add_argument("--rows", type=int, default=TILE_ROWS)
    p.add_argument("--cols", type=int, default=TILE_COLS)
    args = p.parse_args()

    data = np.load(args.npz, allow_pickle=True)

    params = json.loads(str(data["params_json"]))

    def safe_downsample(key, default_shape=(1, 1)):
        if key not in data:
            return None
        arr = data[key]
        if arr.shape[0] < 2 or arr.shape[1] < 2:
            return None
        return downsample_field(arr, args.rows, args.cols)

    env_water = safe_downsample("water_binary")
    env_farm = safe_downsample("farmland")
    env_eco = safe_downsample("eco_reserve")
    env_dikes = safe_downsample("dikes")

    frames_raw = data["frames"]
    t_values = data["t_values"].tolist()

    frame_list = []
    for i, t in enumerate(t_values):
        u_down = downsample_field(frames_raw[i], args.rows, args.cols)
        tiles = []
        for r in range(args.rows):
            row = []
            for c in range(args.cols):
                w = float(env_water[r, c]) if env_water is not None else 0.0
                f = float(env_farm[r, c]) if env_farm is not None else 0.0
                e = float(env_eco[r, c]) if env_eco is not None else 0.0
                d = float(env_dikes[r, c]) if env_dikes is not None else 0.0
                u = float(u_down[r, c])
                row.append(classify_tile(w, u, e, f, d))
            tiles.append(row)
        frame_list.append({"t": int(t), "tiles": tiles})

    env_dict = {}
    if env_water is not None:
        env_dict["water"] = (env_water > 0.4).astype(int).tolist()
    if env_farm is not None:
        env_dict["farmland"] = (env_farm > 0.2).astype(int).tolist()
    if env_eco is not None:
        env_dict["eco"] = (env_eco > 0.4).astype(int).tolist()

    result = {
        "grid": {"rows": args.rows, "cols": args.cols},
        "params": params,
        "diagnostics": {
            "t_values": t_values,
            "mean_u": data["mean_u"].tolist(),
            "urban_frac": data["urban_frac"].tolist(),
            "corridor_ratio": data["corridor_ratio"].tolist(),
            "edge_length": data["edge_length"].tolist(),
        },
        "env": env_dict,
        "frames": frame_list,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    size_mb = args.out.stat().st_size / (1024 * 1024)
    print(f"Exported {len(frame_list)} frames ({args.rows}x{args.cols}) → {args.out} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
