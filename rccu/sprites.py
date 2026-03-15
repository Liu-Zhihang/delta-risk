"""
sprites.py – Programmatic isometric tile sprite generator (v2).

Each sprite is rendered at 48px width to ensure all visual elements
(farmland ridges, water ripples, tree crowns, building blocks) are
clearly visible at the final output resolution.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Tuple

import numpy as np


# ── colours ──────────────────────────────────────────────────────

C_WATER      = np.array([0.30, 0.72, 0.88, 1.0])
C_WATER_DEEP = np.array([0.12, 0.45, 0.78, 1.0])
C_WATER_SPEC = np.array([0.55, 0.85, 0.95, 0.7])

C_FARM       = np.array([0.55, 0.82, 0.42, 1.0])
C_FARM_RIDGE = np.array([0.45, 0.72, 0.32, 1.0])
C_FARM_LIGHT = np.array([0.65, 0.88, 0.52, 1.0])

C_ECO_BASE   = np.array([0.20, 0.45, 0.20, 1.0])
C_ECO_CROWN  = np.array([0.22, 0.62, 0.28, 1.0])
C_ECO_HIGH   = np.array([0.35, 0.72, 0.35, 1.0])
C_TRUNK      = np.array([0.42, 0.28, 0.15, 1.0])

C_URBAN_ROOF = np.array([0.84, 0.32, 0.16, 1.0])
C_URBAN_WALL = np.array([0.72, 0.25, 0.12, 1.0])
C_URBAN_SIDE = np.array([0.90, 0.48, 0.25, 1.0])
C_URBAN_BASE = np.array([0.85, 0.82, 0.78, 0.65])

C_BARE       = np.array([0.88, 0.86, 0.82, 1.0])
C_BARE_LINE  = np.array([0.80, 0.78, 0.74, 0.5])

C_DIKE       = np.array([0.50, 0.58, 0.62, 1.0])
C_DIKE_TOP   = np.array([0.60, 0.66, 0.70, 1.0])


# ── drawing primitives ──────────────────────────────────────────

def _make_diamond(w: int, h: int) -> np.ndarray:
    """Boolean diamond mask of size (h, w)."""
    mask = np.zeros((h, w), dtype=bool)
    cx, cy = w // 2, h // 2
    for y in range(h):
        for x in range(w):
            if cx > 0 and cy > 0:
                if abs(x - cx) / cx + abs(y - cy) / cy <= 1.0:
                    mask[y, x] = True
    return mask


def _blend(img, mask, col):
    """Alpha-blend colour into masked region."""
    a = float(col[3])
    for c in range(3):
        img[mask, c] = img[mask, c] * (1 - a) + col[c] * a
    img[mask, 3] = np.clip(img[mask, 3] + a, 0, 1)


def _blend_rect(img, y0, y1, x0, x1, col):
    """Alpha-blend a rectangle."""
    h, w = img.shape[:2]
    y0, y1 = max(0, y0), min(h, y1)
    x0, x1 = max(0, x0), min(w, x1)
    if y0 >= y1 or x0 >= x1:
        return
    a = float(col[3])
    for c in range(3):
        img[y0:y1, x0:x1, c] = img[y0:y1, x0:x1, c] * (1 - a) + col[c] * a
    img[y0:y1, x0:x1, 3] = np.clip(img[y0:y1, x0:x1, 3] + a, 0, 1)


def _circle(img, cx, cy, r, col):
    """Filled circle with soft edge."""
    h, w = img.shape[:2]
    for y in range(max(0, cy - r - 1), min(h, cy + r + 2)):
        for x in range(max(0, cx - r - 1), min(w, cx + r + 2)):
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            r2 = r * r
            if d2 <= r2 * 1.2:
                fade = max(0.0, min(1.0, 2.0 - 2.0 * (d2 / r2) ** 0.5))
                a = col[3] * fade
                for c in range(3):
                    img[y, x, c] = img[y, x, c] * (1 - a) + col[c] * a
                img[y, x, 3] = min(1.0, img[y, x, 3] + a)


def _iso_box(img, cx, base_y, bw, bh, depth, roof_col, front_col, side_col):
    """Draw a small isometric box at (cx, base_y) with given dimensions."""
    h_img, w_img = img.shape[:2]

    top = [
        (cx, base_y - depth),
        (cx + bw, base_y - depth + bh),
        (cx, base_y - depth + 2 * bh),
        (cx - bw, base_y - depth + bh),
    ]
    front = [
        (cx - bw, base_y - depth + bh),
        (cx, base_y - depth + 2 * bh),
        (cx, base_y + 2 * bh),
        (cx - bw, base_y + bh),
    ]
    side = [
        (cx, base_y - depth + 2 * bh),
        (cx + bw, base_y - depth + bh),
        (cx + bw, base_y + bh),
        (cx, base_y + 2 * bh),
    ]

    for pts, col in [(front, front_col), (side, side_col), (top, roof_col)]:
        _fill_poly(img, pts, col)


def _fill_poly(img, pts, col):
    """Scanline fill for a convex polygon."""
    if len(pts) < 3:
        return
    h, w = img.shape[:2]
    ys = [int(p[1]) for p in pts]
    ymin, ymax = max(0, min(ys)), min(h - 1, max(ys))
    a = float(col[3])

    for y in range(ymin, ymax + 1):
        xs = []
        n = len(pts)
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            if y1 == y2:
                continue
            if min(y1, y2) <= y < max(y1, y2):
                xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            xa, xb = max(0, int(xs[k])), min(w - 1, int(xs[k + 1]))
            if xa <= xb:
                for c in range(3):
                    img[y, xa:xb + 1, c] = img[y, xa:xb + 1, c] * (1 - a) + col[c] * a
                img[y, xa:xb + 1, 3] = np.clip(img[y, xa:xb + 1, 3] + a, 0, 1)


# ── sprite factory ──────────────────────────────────────────────

class IsometricSprites:
    """Generates and caches isometric tile sprites at usable resolution."""

    def __init__(self, tile_px: int = 48):
        self.tile_px = tile_px
        self.half_w = tile_px // 2
        self.half_h = tile_px // 4
        self.diamond = _make_diamond(tile_px, tile_px // 2)
        self.sprite_h = tile_px // 2 + tile_px // 2  # extra headroom for objects
        self.sprite_w = tile_px

    @lru_cache(maxsize=64)
    def get(self, kind: str, variant: int = 0) -> np.ndarray:
        sw, sh = self.sprite_w, self.sprite_h
        img = np.zeros((sh, sw, 4), dtype=np.float64)

        dh, dw = self.diamond.shape
        dy = sh - dh  # diamond top-left y
        mask = np.zeros((sh, sw), dtype=bool)
        mask[dy:dy + dh, :dw] = self.diamond

        rng = np.random.default_rng(variant * 31 + hash(kind) % 9999)

        if kind == "water":
            _blend(img, mask, C_WATER)
            # wave ripples: horizontal lighter stripes
            for i in range(4):
                wy = dy + 2 + i * (dh // 5)
                if wy < sh:
                    for x in range(sw):
                        if mask[wy, x]:
                            f = 0.3 + 0.15 * np.sin(x * 0.8 + i * 1.5)
                            c = C_WATER * (1 - f) + C_WATER_SPEC * f
                            c[3] = 1.0
                            for ch in range(3):
                                img[wy, x, ch] = c[ch]
            # deeper centre
            centre_mask = np.zeros_like(mask)
            inner = _make_diamond(sw - 8, max(1, dh - 6))
            ih, iw = inner.shape
            iy, ix = dy + 3, 4
            if iy + ih <= sh and ix + iw <= sw:
                centre_mask[iy:iy + ih, ix:ix + iw] = inner
            _blend(img, centre_mask & mask, C_WATER_DEEP * np.array([1, 1, 1, 0.35]))

        elif kind == "farmland":
            _blend(img, mask, C_FARM)
            # diagonal ridge stripes
            for y in range(sh):
                for x in range(sw):
                    if mask[y, x] and (y + x) % 5 < 2:
                        f = rng.random() * 0.3
                        col = C_FARM_RIDGE * (1 - f) + C_FARM_LIGHT * f
                        col[3] = 0.7
                        for ch in range(3):
                            img[y, x, ch] = img[y, x, ch] * 0.6 + col[ch] * 0.4

        elif kind == "eco":
            _blend(img, mask, C_ECO_BASE)
            n_trees = 2 + rng.integers(0, 3)
            for _ in range(n_trees):
                tx = self.half_w + rng.integers(-8, 9)
                trunk_h = 3 + rng.integers(0, 3)
                crown_r = 4 + rng.integers(0, 4)
                ty_crown = dy - crown_r - trunk_h + rng.integers(0, 3)

                # trunk
                _blend_rect(img, max(0, ty_crown + crown_r), max(0, ty_crown + crown_r + trunk_h),
                            max(0, tx - 1), min(sw, tx + 2), C_TRUNK)
                # crown
                shade = 0.85 + 0.15 * rng.random()
                crown_col = C_ECO_CROWN * shade
                crown_col[3] = 1.0
                _circle(img, tx, max(crown_r, ty_crown), crown_r, crown_col)
                # highlight
                _circle(img, tx - 1, max(crown_r - 1, ty_crown - 1),
                        max(1, crown_r - 2), C_ECO_HIGH * np.array([1, 1, 1, 0.4]))

        elif kind == "settlement":
            _blend(img, mask, C_URBAN_BASE)
            n_bldg = 2 + rng.integers(0, 3)
            for _ in range(n_bldg):
                bx = self.half_w + rng.integers(-7, 8)
                by = dy - rng.integers(2, 8)
                bw = 3 + rng.integers(0, 4)
                bh = 2 + rng.integers(0, 3)
                depth = 5 + rng.integers(0, 7)
                mix = rng.random()
                roof = C_URBAN_ROOF * (0.85 + 0.15 * mix)
                wall = C_URBAN_WALL * (0.75 + 0.25 * mix)
                side = C_URBAN_SIDE * (0.80 + 0.20 * mix)
                roof[3] = wall[3] = side[3] = 1.0
                _iso_box(img, bx, max(4, by), bw, bh, depth, roof, wall, side)

        elif kind == "dike":
            _blend(img, mask, C_DIKE)
            inner = _make_diamond(sw - 6, max(1, dh - 4))
            ih, iw = inner.shape
            top_mask = np.zeros_like(mask)
            iy, ix = dy + 2, 3
            if iy + ih <= sh and ix + iw <= sw:
                top_mask[iy:iy + ih, ix:ix + iw] = inner
            _blend(img, top_mask & mask, C_DIKE_TOP * np.array([1, 1, 1, 0.5]))

        else:  # bare
            _blend(img, mask, C_BARE)
            for y in range(sh):
                for x in range(sw):
                    if mask[y, x] and (y % 6 == 0 or x % 6 == 0):
                        for ch in range(3):
                            img[y, x, ch] = img[y, x, ch] * 0.85 + C_BARE_LINE[ch] * 0.15

        return np.clip(img, 0, 1)

    def tile_screen_size(self) -> Tuple[int, int]:
        return self.sprite_w, self.sprite_h

    def grid_to_screen(self, gx: int, gy: int) -> Tuple[int, int]:
        sx = (gx - gy) * self.half_w
        sy = (gx + gy) * self.half_h
        return sx, sy
