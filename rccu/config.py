"""
config.py – Colour palettes, physics parameters, and rendering presets.

Visual style: remote-sensing land-cover classification map.
Cool-toned, vivid, high-contrast palette on a light background.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

import numpy as np
from matplotlib.colors import LinearSegmentedColormap


def _hex(h: str) -> Tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


class Palette:
    """Remote-sensing land-cover colour register."""

    # ── canvas ──
    BG_LIGHT      = "#F5F5F0"
    BG_PANEL      = "#FFFFFF"
    GRID_SUBTLE   = "#D0D0D0"
    BORDER        = "#AAAAAA"

    # ── water / rivers  (vivid blue) ──
    WATER_DEEP    = "#1565C0"
    WATER_MID     = "#2196F3"
    WATER_LIGHT   = "#64B5F6"

    # ── farmland / polder  (vivid green) ──
    FARM_DARK     = "#388E3C"
    FARM_MID      = "#66BB6A"
    FARM_LIGHT    = "#A5D6A7"

    # ── ecological reserves  (deep emerald) ──
    ECO_DEEP      = "#1B5E20"
    ECO_MID       = "#2E7D32"
    ECO_LIGHT     = "#43A047"

    # ── urban / settlement  (warm coral-orange for contrast) ──
    URBAN_SEED    = "#FFAB91"
    URBAN_LOW     = "#FF7043"
    URBAN_MID     = "#F4511E"
    URBAN_HIGH    = "#E64A19"
    URBAN_CORE    = "#BF360C"

    # ── embankment / dike ──
    DIKE          = "#78909C"

    # ── bare land / background terrain ──
    BARE          = "#EFEBE9"

    # ── diagnostics / text ──
    ACCENT_BLUE   = "#1565C0"
    ACCENT_RED    = "#C62828"
    ACCENT_ORANGE = "#EF6C00"
    ACCENT_GREEN  = "#2E7D32"
    TEXT_PRIMARY   = "#212121"
    TEXT_SECONDARY = "#616161"

    @classmethod
    def rgb(cls, attr_name: str) -> Tuple[float, float, float]:
        return _hex(getattr(cls, attr_name))


def make_urban_cmap() -> LinearSegmentedColormap:
    """Transparent → light coral → deep orange-red."""
    stops = [
        (0.00, (*_hex(Palette.BARE), 0.0)),
        (0.12, (*_hex(Palette.BARE), 0.0)),
        (0.25, (*_hex(Palette.URBAN_SEED), 0.60)),
        (0.45, (*_hex(Palette.URBAN_LOW), 0.80)),
        (0.60, (*_hex(Palette.URBAN_MID), 0.90)),
        (0.78, (*_hex(Palette.URBAN_HIGH), 0.95)),
        (1.00, (*_hex(Palette.URBAN_CORE), 1.0)),
    ]
    cdict = {"red": [], "green": [], "blue": [], "alpha": []}
    for pos, (r, g, b, a) in stops:
        cdict["red"].append((pos, r, r))
        cdict["green"].append((pos, g, g))
        cdict["blue"].append((pos, b, b))
        cdict["alpha"].append((pos, a, a))
    return LinearSegmentedColormap("rccu_urban", cdict, N=512)


CMAP_URBAN = make_urban_cmap()


@dataclass
class PhysicsParams:
    nx: int = 400
    ny: int = 280
    n_steps: int = 2000
    save_every: int = 5
    dt: float = 0.025

    a: float = 2.8
    u_crit: float = 0.48          # moderate threshold → patchy but viable nucleation

    d_parallel: float = 0.055     # low → patches resist merging along channels
    d_perp: float = 0.014         # tight perpendicular confinement
    d_iso: float = 0.005          # minimal isotropic blurring
    k4: float = 0.0010

    lambda_constraint: float = 1.75   # constraint respects farmland & eco
    eta_driving: float = 1.55         # compensate for gaps in driving field
    h0: float = 0.33                  # threshold bias

    noise_sigma: float = 0.015
    noise_corr_len: float = 1.2

    n_main_channels: int = 8         # delta-like: more main distributaries
    n_tributaries: int = 28          # dense tributary network
    n_sub_tributaries: int = 40      # fine sub-channels (delta anastomosing)
    channel_width: float = 0.028     # thicker, more visible channels
    n_eco_patches: int = 6
    n_nucleation_sites: int = 14     # more seeds, each smaller

    seed: int = 42
    boundary_mode: str = "neumann"  # neumann | periodic


@dataclass
class RenderPreset:
    fig_width: float = 16.0
    fig_height: float = 9.0
    dpi: int = 150
    fps: int = 24
    font_family: str = "sans-serif"
    title_size: float = 14.0
    label_size: float = 11.0
    tick_size: float = 9.0
