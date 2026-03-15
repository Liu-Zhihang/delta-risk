"""
bridge.py – Adapter for ingesting real geospatial data.

Converts GeoTIFF rasters and Shapefiles into the standard
environment dict expected by DeltaBuilder / RCCUEngine.

Required real-data inputs:
  1. constraint.tif  –  constraint intensity C(x)
  2. driving.tif     –  driving-field base G₀(x)
  3. theta.tif       –  river-direction angle θ(x) [radians]

Optional:
  4. water.tif       –  binary or continuous water mask
  5. farmland.tif    –  farmland coverage
  6. eco.tif         –  ecological-reserve mask
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional
import warnings

import numpy as np
from scipy.ndimage import gaussian_filter


def _normalize(a: np.ndarray) -> np.ndarray:
    lo, hi = np.nanmin(a), np.nanmax(a)
    return np.zeros_like(a) if (hi - lo) < 1e-12 else (a - lo) / (hi - lo)


def _read_band(path: Path) -> np.ndarray:
    """Read the first band of a GeoTIFF via rasterio."""
    try:
        import rasterio
    except ImportError as e:
        raise RuntimeError("Real-data mode requires `pip install rasterio`.") from e
    with rasterio.open(path) as src:
        arr = src.read(1).astype(np.float64)
    return np.nan_to_num(arr, nan=0.0)


def _ensure_theta_radians(theta: np.ndarray) -> np.ndarray:
    """
    Normalize orientation field to radians in [-pi, pi].

    If magnitudes exceed 2*pi, values are treated as degrees.
    """
    theta = np.nan_to_num(theta, nan=0.0).astype(np.float64)
    max_abs = float(np.nanmax(np.abs(theta)))
    if max_abs > (2.0 * np.pi + 1e-3):
        warnings.warn(
            "Orientation raster appears to be in degrees; converting to radians.",
            RuntimeWarning,
        )
        theta = np.deg2rad(theta)
    return np.arctan2(np.sin(theta), np.cos(theta))


def load_real_environment(
    constraint_path: Path,
    driving_path: Path,
    theta_path: Path,
    water_path: Optional[Path] = None,
    farm_path: Optional[Path] = None,
    eco_path: Optional[Path] = None,
    seed: int = 42,
) -> Dict[str, np.ndarray]:
    """
    Load real GeoTIFF rasters and assemble the standard env dict.

    All rasters must share identical shape, CRS, and resolution.
    """
    C     = _normalize(_read_band(constraint_path))
    g     = _normalize(_read_band(driving_path))
    theta = _ensure_theta_radians(_read_band(theta_path))

    ny, nx = C.shape
    if g.shape != (ny, nx) or theta.shape != (ny, nx):
        raise ValueError(
            f"All rasters must share the same shape. "
            f"Got constraint={C.shape}, driving={g.shape}, theta={theta.shape}."
        )

    x = np.linspace(0, 1, nx)
    y = np.linspace(0, 1, ny)
    xx, yy = np.meshgrid(x, y)

    water = _normalize(_read_band(water_path)) if water_path else (g > np.quantile(g, 0.70)).astype(float)
    farm  = _normalize(_read_band(farm_path))  if farm_path  else np.zeros((ny, nx))
    eco   = _normalize(_read_band(eco_path))   if eco_path   else np.zeros((ny, nx))

    rng = np.random.default_rng(seed)
    u0 = np.clip(
        0.05 + 0.12 * g * (1.0 - C) + 0.008 * rng.normal(size=(ny, nx)),
        0.0, 1.0,
    )
    u0 = gaussian_filter(u0, 1.0)

    return {
        "x": x,
        "y": y,
        "xx": xx,
        "yy": yy,
        "water_field": water,
        "water_binary": (water > 0.4).astype(float),
        "theta": theta,
        "farmland": farm,
        "eco_reserve": eco,
        "dikes": np.zeros((ny, nx)),
        "constraint": C,
        "g_base": g,
        "u0": u0,
        "nucleation_sites": [],
    }
