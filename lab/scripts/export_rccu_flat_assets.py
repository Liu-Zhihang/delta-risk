#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def parse_args() -> argparse.Namespace:
    here = Path(__file__).resolve()
    root = here.parents[3]
    p = argparse.ArgumentParser(description="Export RCCU flat-render binary bundle for the lab frontend.")
    p.add_argument(
        "--npz",
        type=Path,
        default=root / "cities 投稿" / "数据" / "rccu_v2" / "rccu_run.npz",
    )
    p.add_argument(
        "--out-bin",
        type=Path,
        default=root / "delta-risk" / "lab" / "public" / "assets" / "rccu_flat_bundle.bin",
    )
    p.add_argument(
        "--out-meta",
        type=Path,
        default=root / "delta-risk" / "lab" / "public" / "data" / "rccu_flat_bundle.json",
    )
    p.add_argument("--sample-count", type=int, default=84)
    return p.parse_args()


def quantize(field: np.ndarray) -> np.ndarray:
    return np.clip(np.round(field * 255.0), 0, 255).astype(np.uint8)


def main() -> None:
    args = parse_args()
    data = np.load(args.npz, allow_pickle=True)

    frames = data["frames"].astype(np.float32)
    t_values = data["t_values"].astype(np.int32)
    urban_frac = data["urban_frac"].astype(np.float32)

    indices = np.linspace(0, len(frames) - 1, args.sample_count, dtype=int)
    indices = np.unique(indices)

    rows, cols = frames.shape[1], frames.shape[2]
    bundle_parts: list[np.ndarray] = []
    offsets: dict[str, int] = {}
    cursor = 0

    def append_part(name: str, array: np.ndarray) -> None:
        nonlocal cursor
        contiguous = np.ascontiguousarray(array.reshape(-1))
        offsets[name] = cursor
        bundle_parts.append(contiguous)
        cursor += contiguous.nbytes

    append_part("water", quantize(data["water_binary"].astype(np.float32)))
    append_part("farmland", quantize(data["farmland"].astype(np.float32)))
    append_part("eco", quantize(data["eco_reserve"].astype(np.float32)))
    append_part("dikes", quantize(data["dikes"].astype(np.float32)))

    frame_offsets: list[int] = []
    for idx in indices:
        frame_offsets.append(cursor)
        append_part(f"frame_{int(idx)}", quantize(frames[idx]))

    args.out_bin.parent.mkdir(parents=True, exist_ok=True)
    args.out_meta.parent.mkdir(parents=True, exist_ok=True)

    with args.out_bin.open("wb") as f:
        for part in bundle_parts:
            f.write(part.tobytes())

    metadata = {
        "rows": int(rows),
        "cols": int(cols),
        "frameCount": int(len(indices)),
        "indices": indices.astype(int).tolist(),
        "timeValues": t_values[indices].astype(int).tolist(),
        "urbanFrac": urban_frac[indices].astype(float).tolist(),
        "offsets": {
            "water": offsets["water"],
            "farmland": offsets["farmland"],
            "eco": offsets["eco"],
            "dikes": offsets["dikes"],
            "frames": frame_offsets,
        },
        "sizes": {
            "layerBytes": int(rows * cols),
            "frameBytes": int(rows * cols),
        },
    }
    args.out_meta.write_text(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"Binary bundle → {args.out_bin}")
    print(f"Metadata      → {args.out_meta}")
    print(f"Frames        → {len(indices)} sampled from {len(frames)}")


if __name__ == "__main__":
    main()
