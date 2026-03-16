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
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from rccu.viz_iso import _build_tile_frame_sequence


# Match viz_iso denser grid so web and static outputs are consistent
TILE_ROWS = 48
TILE_COLS = 72


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

    env_native = {}
    for key in ("water_binary", "farmland", "eco_reserve", "dikes"):
        if key in data:
            env_native[key] = data[key]

    frame_list = []
    tile_frames = _build_tile_frame_sequence(env_native, frames_raw, args.rows, args.cols)
    for i, t in enumerate(t_values):
        tiles = tile_frames[i]["tiles"].tolist()
        density = np.round(tile_frames[i]["density"], 3).tolist()
        height = np.round(tile_frames[i]["height"], 3).tolist()
        frame_list.append({"t": int(t), "tiles": tiles, "density": density, "height": height})

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
