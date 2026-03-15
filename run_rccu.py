#!/usr/bin/env python3
"""
run_rccu.py – Main entry point for the RCCU emergence simulator (delta-risk-vis).

Usage (toy mode, quick test):
    python run_rccu.py --preset quick

Usage (toy mode, isometric + web export):
    python run_rccu.py --preset quick --renderer iso --skip-animation
    python web/export_json.py --npz data/rccu_run.npz --out web/sim_data.json
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

from rccu.config import PhysicsParams, RenderPreset
from rccu.delta import DeltaBuilder
from rccu.engine import RCCUEngine
from rccu.viz import DeltaRenderer


OUT_ROOT = Path(__file__).resolve().parent / "output"
DATA_ROOT = Path(__file__).resolve().parent / "data"


PRESETS = {
    "quick": {
        "physics": PhysicsParams(nx=320, ny=220, n_steps=1200, save_every=6, dt=0.026),
        "render":  RenderPreset(fig_width=15, fig_height=8.5, dpi=130, fps=20),
    },
    "standard": {
        "physics": PhysicsParams(nx=480, ny=340, n_steps=2000, save_every=5, dt=0.024),
        "render":  RenderPreset(fig_width=16, fig_height=9, dpi=150, fps=24),
    },
    "cinematic": {
        "physics": PhysicsParams(nx=640, ny=440, n_steps=3000, save_every=6, dt=0.020),
        "render":  RenderPreset(fig_width=19.2, fig_height=10.8, dpi=180, fps=30),
    },
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="RCCU – River-Constrained Corridor Urbanization Simulator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--mode", choices=["toy", "raster"], default="toy",
                   help="'toy' = procedural delta; 'raster' = real GeoTIFF data")
    p.add_argument("--preset", choices=list(PRESETS.keys()), default="standard",
                   help="Quality preset (quick / standard / cinematic)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--boundary", choices=["neumann", "periodic"], default="neumann",
                   help="Spatial boundary condition for PDE finite differences")

    g = p.add_argument_group("real-data paths (raster mode)")
    g.add_argument("--constraint-raster", type=Path)
    g.add_argument("--driving-raster", type=Path)
    g.add_argument("--orientation-raster", type=Path)
    g.add_argument("--water-raster", type=Path)
    g.add_argument("--farm-raster", type=Path)
    g.add_argument("--eco-raster", type=Path)

    p.add_argument("--renderer", choices=["flat", "iso"], default="flat",
                   help="'flat' = remote-sensing style; 'iso' = isometric 3D landscape")
    p.add_argument("--out-dir", type=Path, default=None,
                   help="Override output directory")
    p.add_argument("--skip-animation", action="store_true",
                   help="Only produce snapshots (faster)")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    preset = PRESETS[args.preset]
    params: PhysicsParams = preset["physics"]
    render: RenderPreset = preset["render"]
    params.seed = args.seed
    params.boundary_mode = args.boundary

    out_dir = args.out_dir or OUT_ROOT
    data_dir = DATA_ROOT
    out_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 62)
    print("  RCCU  ·  River-Constrained Corridor Urbanization Simulator")
    print("=" * 62)
    print(f"  Mode     : {args.mode}")
    print(f"  Preset   : {args.preset}")
    print(f"  Grid     : {params.nx} × {params.ny}")
    print(f"  Steps    : {params.n_steps}")
    print(f"  Seed     : {params.seed}")
    print(f"  Boundary : {params.boundary_mode}")
    print(f"  Output   : {out_dir}")
    print("-" * 62)

    t0 = time.time()
    if args.mode == "toy":
        builder = DeltaBuilder(params.nx, params.ny, params.seed)
        env = builder.build_all(
            n_main=params.n_main_channels,
            n_trib=params.n_tributaries,
            n_sub=getattr(params, "n_sub_tributaries", 20),
            channel_width=params.channel_width,
            n_eco=params.n_eco_patches,
            n_sites=params.n_nucleation_sites,
        )
        print(f"  Environment built ({time.time() - t0:.1f}s)")
    else:
        from rccu.bridge import load_real_environment
        for name, val in [
            ("constraint", args.constraint_raster),
            ("driving", args.driving_raster),
            ("orientation", args.orientation_raster),
        ]:
            if val is None:
                raise ValueError(f"--{name}-raster is required in raster mode")
        env = load_real_environment(
            args.constraint_raster,
            args.driving_raster,
            args.orientation_raster,
            water_path=args.water_raster,
            farm_path=args.farm_raster,
            eco_path=args.eco_raster,
            seed=params.seed,
        )
        params.nx = env["constraint"].shape[1]
        params.ny = env["constraint"].shape[0]
        print(f"  Real data loaded ({time.time() - t0:.1f}s)")

    t1 = time.time()
    engine = RCCUEngine(params)
    sim = engine.run(env)
    elapsed = time.time() - t1
    print(f"  Simulation done ({elapsed:.1f}s, {params.n_steps / elapsed:.0f} steps/s)")

    if args.renderer == "iso":
        from rccu.viz_iso import IsometricRenderer
        renderer = IsometricRenderer(render)
        suffix = "_iso"
    else:
        renderer = DeltaRenderer(render)
        suffix = ""

    snap_path = out_dir / f"rccu_snapshots{suffix}.png"
    renderer.save_snapshots(env, sim, snap_path, n_panels=6)

    if not args.skip_animation:
        anim_path = out_dir / f"rccu_evolution{suffix}.gif"
        renderer.save_animation(env, sim, anim_path)

    npz_path = data_dir / "rccu_run.npz"
    save_dict = {k: v for k, v in sim.items()}
    save_dict["params_json"] = np.array(json.dumps(asdict(params), ensure_ascii=False))
    save_dict["mode"] = np.array(args.mode)
    if args.mode == "toy" and env is not None:
        for key in ("water_binary", "farmland", "eco_reserve", "dikes"):
            if key in env:
                save_dict[key] = env[key]
    np.savez_compressed(npz_path, **save_dict)
    print(f"  Data → {npz_path}")

    print("-" * 62)
    print("  Done. All outputs saved.")
    print("=" * 62)


if __name__ == "__main__":
    main()
