"""
metrics.py – Order-parameter diagnostics for RCCU simulations.
"""

from __future__ import annotations

from typing import Dict

import numpy as np


def compute_phase_stats(u: np.ndarray, threshold: float = 0.55) -> Dict[str, float]:
    """Basic phase-field statistics for a single frame."""
    binary = u > threshold
    total = u.size
    urban_count = int(binary.sum())

    edge_h = np.abs(np.diff(binary.astype(float), axis=1)).sum()
    edge_v = np.abs(np.diff(binary.astype(float), axis=0)).sum()

    return {
        "mean_u":       float(u.mean()),
        "std_u":        float(u.std()),
        "urban_frac":   urban_count / total,
        "edge_length":  float(edge_h + edge_v),
        "urban_pixels": urban_count,
    }


def corridor_ratio(
    u: np.ndarray,
    core_mask: np.ndarray,
) -> float:
    """Ratio of mean urbanisation inside vs outside the river corridor."""
    core   = core_mask > 0.5
    fringe = ~core
    cm = float(u[core].mean())   if np.any(core)   else 0.0
    fm = float(u[fringe].mean()) if np.any(fringe)  else 1e-8
    return cm / max(fm, 1e-8)


def elongation_ratio(u: np.ndarray, threshold: float = 0.55) -> float:
    """Ratio of major to minor axis of the urban phase bounding box."""
    binary = u > threshold
    rows = np.any(binary, axis=1)
    cols = np.any(binary, axis=0)
    if not (np.any(rows) and np.any(cols)):
        return 1.0
    height = np.max(np.where(rows)) - np.min(np.where(rows)) + 1
    width  = np.max(np.where(cols)) - np.min(np.where(cols)) + 1
    return max(width, height) / max(min(width, height), 1)
