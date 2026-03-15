"""
delta.py – Procedural delta-landscape generator.

Three-tier river network:
  Level 1  Main channels   (wide, sinuous)
  Level 2  Tributaries      (medium, branching off mains)
  Level 3  Sub-tributaries  (narrow, fine irrigation-like grid)

Settlements nucleate as discrete patches on riverbanks.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np
from scipy.ndimage import gaussian_filter, binary_dilation, distance_transform_edt


def _sigmoid(x: np.ndarray, c: float, k: float) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-k * (x - c)))


def _norm(a: np.ndarray) -> np.ndarray:
    lo, hi = np.nanmin(a), np.nanmax(a)
    return np.zeros_like(a) if hi - lo < 1e-12 else (a - lo) / (hi - lo)


class DeltaBuilder:

    def __init__(self, nx: int, ny: int, seed: int = 42):
        self.nx, self.ny = nx, ny
        self.rng = np.random.default_rng(seed)

        # wider coordinate range → zoomed-out perspective
        self.x = np.linspace(-1.6, 1.6, nx)
        self.y = np.linspace(-1.2, 1.2, ny)
        self.xx, self.yy = np.meshgrid(self.x, self.y)

    # ── single channel primitive ─────────────────────────────────

    def _channel(self, y0, amp, freq, phase, w):
        centre = y0 + amp * np.sin(freq * np.pi * self.xx + phase) \
                     + 0.2 * amp * np.sin(2.5 * freq * np.pi * self.xx + phase * 1.4)
        dist = np.abs(self.yy - centre)
        dcdx = np.gradient(centre, self.x, axis=1)
        theta = np.arctan2(dcdx, np.ones_like(dcdx))
        mask = np.exp(-0.5 * (dist / w) ** 2)
        return mask, centre, theta

    # ── three-tier river network ─────────────────────────────────

    def build_river_network(
        self, n_main=5, n_trib=15, n_sub=20, cw=0.018,
    ) -> Dict[str, np.ndarray]:
        water = np.zeros((self.ny, self.nx), dtype=np.float64)
        th_acc = np.zeros_like(water)
        wt_acc = np.zeros_like(water) + 1e-8
        centres = []

        # Level 1: main channels
        y_off = np.linspace(-0.72, 0.72, n_main)
        amps  = 0.10 + 0.08 * self.rng.random(n_main)
        freqs = 0.8 + 0.5 * self.rng.random(n_main)
        phs   = self.rng.uniform(0, 2 * np.pi, n_main)

        for i in range(n_main):
            w = cw * (1.15 - 0.15 * abs(y_off[i]))
            m, c, t = self._channel(y_off[i], amps[i], freqs[i], phs[i], w)
            water = np.maximum(water, m)
            th_acc += t * m; wt_acc += m
            centres.append(c)

        # Level 2: tributaries (branch off mains)
        for _ in range(n_trib):
            pi = self.rng.integers(0, n_main)
            xs = self.rng.uniform(-1.2, 0.8)
            py = float(np.interp(xs, self.x, centres[pi][0]))
            yo = py + self.rng.uniform(-0.10, 0.10)
            a  = 0.03 + 0.05 * self.rng.random()
            f  = 1.5 + 1.0 * self.rng.random()
            p  = self.rng.uniform(0, 2 * np.pi)
            w  = cw * 0.50

            m, _, t = self._channel(yo, a, f, p, w)
            fade = _sigmoid(self.xx, xs, 10.0) * _sigmoid(-self.xx, -(xs + 0.40), 8.0)
            m *= fade
            water = np.maximum(water, m)
            th_acc += t * m; wt_acc += m

        # Level 3: sub-tributaries (fine channels, nearly straight)
        for _ in range(n_sub):
            pi = self.rng.integers(0, n_main)
            xs = self.rng.uniform(-1.3, 1.0)
            py = float(np.interp(xs, self.x, centres[pi][0]))
            yo = py + self.rng.uniform(-0.06, 0.06)
            a  = 0.01 + 0.02 * self.rng.random()
            f  = 2.5 + 1.5 * self.rng.random()
            p  = self.rng.uniform(0, 2 * np.pi)
            w  = cw * 0.28

            m, _, t = self._channel(yo, a, f, p, w)
            fade = _sigmoid(self.xx, xs, 12.0) * _sigmoid(-self.xx, -(xs + 0.25), 10.0)
            m *= fade
            water = np.maximum(water, m)
            th_acc += t * m; wt_acc += m

        theta = th_acc / wt_acc
        # Slightly lower threshold so channels appear thicker and more coherent (delta-like)
        wb = (water > 0.42).astype(np.float64)

        return {
            "water_field": np.clip(water, 0, 1),
            "water_binary": wb,
            "theta": theta,
            "channel_centres": centres,
        }

    # ── farmland (polder texture between channels) ───────────────

    def build_farmland(self, wb: np.ndarray) -> np.ndarray:
        land = 1.0 - wb
        d = distance_transform_edt(land)
        dn = _norm(d)

        tx = 0.5 + 0.5 * np.sin(11.0 * np.pi * self.xx + 0.9)
        ty = 0.5 + 0.5 * np.sin(15.0 * np.pi * self.yy + 0.5)
        tex = 0.78 + 0.22 * tx * ty

        farm = land * np.clip(dn * 3.5, 0, 1) * tex
        return np.clip(gaussian_filter(farm, 0.8), 0, 1)

    # ── ecological reserves ──────────────────────────────────────

    def build_eco(self, n_patches=6, wb=None) -> np.ndarray:
        eco = np.zeros((self.ny, self.nx), dtype=np.float64)

        coastal = _sigmoid(self.xx, 1.0, 5.0) * (1 - _sigmoid(np.abs(self.yy), 0.9, 7.0))
        eco += 0.60 * coastal

        for _ in range(n_patches):
            cx = self.rng.uniform(-1.2, 0.6)
            cy = self.rng.uniform(-0.8, 0.8)
            rx = 0.07 + 0.10 * self.rng.random()
            ry = 0.05 + 0.08 * self.rng.random()
            ang = self.rng.uniform(0, np.pi)

            dx, dy = self.xx - cx, self.yy - cy
            rx_, ry_ = dx * np.cos(ang) + dy * np.sin(ang), -dx * np.sin(ang) + dy * np.cos(ang)
            eco = np.maximum(eco, np.exp(-0.5 * ((rx_ / rx) ** 2 + (ry_ / ry) ** 2)))

        eco = gaussian_filter(eco, 1.3)
        if wb is not None:
            eco *= (1.0 - wb)
        return np.clip(eco, 0, 1)

    # ── dikes ────────────────────────────────────────────────────

    def build_dikes(self, wb: np.ndarray) -> np.ndarray:
        dil = binary_dilation(wb > 0.5, iterations=2)
        dm = gaussian_filter(np.clip(dil.astype(float) - wb, 0, 1), 0.4)
        return np.clip(dm * 3.0, 0, 1)

    # ── riverbank driving field ──────────────────────────────────

    def _polder_gaps(self, n_blocks: int = 55) -> np.ndarray:
        """
        Simulate 基塘/farmland-protection blocks that INTERRUPT the
        continuous riverbank attraction, producing discrete settlement gaps.

        Returns a mask in [0, 1] where 0 = blocked (farmland gap), 1 = open.
        """
        gaps = np.ones((self.ny, self.nx), dtype=np.float64)

        for _ in range(n_blocks):
            cx = self.rng.uniform(-1.5, 1.3)
            cy = self.rng.uniform(-1.1, 1.1)
            wx = 0.05 + 0.08 * self.rng.random()
            wy = 0.04 + 0.07 * self.rng.random()
            ang = self.rng.uniform(0, np.pi)

            dx, dy = self.xx - cx, self.yy - cy
            rx = dx * np.cos(ang) + dy * np.sin(ang)
            ry = -dx * np.sin(ang) + dy * np.cos(ang)
            block = np.exp(-0.5 * ((rx / wx) ** 2 + (ry / wy) ** 2))
            gaps -= 0.95 * block

        return np.clip(gaps, 0, 1)

    def build_driving(self, wb, sites, polder=None) -> np.ndarray:
        is_land = wb < 0.5
        d = distance_transform_edt(is_land)

        g_bank = np.exp(-0.5 * ((d - 3.0) / 3.5) ** 2)
        g_bank[~is_land] = 0.0

        if polder is not None:
            g_bank *= polder

        g_poles = np.zeros_like(g_bank)
        for sx, sy in sites:
            g_poles += np.exp(-0.5 * ((self.xx - sx) ** 2 + (self.yy - sy) ** 2) / 0.04 ** 2)
        g_poles = gaussian_filter(g_poles, 0.8)
        g_poles[~is_land] = 0.0

        g = _norm(0.60 * g_bank + 0.90 * _norm(g_poles))
        g[~is_land] = 0.0
        return np.clip(g, 0, 1)

    # ── constraint field ─────────────────────────────────────────

    def build_constraint(self, wb, farm, eco, polder_gaps=None) -> np.ndarray:
        is_land = wb < 0.5
        d = _norm(distance_transform_edt(is_land))

        c = 0.28 * d ** 1.6 + 0.42 * eco + 0.22 * farm

        # polder gaps add extra constraint where driving was removed
        if polder_gaps is not None:
            gap_constraint = np.clip(1.0 - polder_gaps, 0, 1)
            c += 0.30 * gap_constraint

        c = _norm(gaussian_filter(c, 0.8))
        c[~is_land] = 1.0
        return np.clip(c, 0, 1)

    # ── nucleation: many small discrete seeds on banks ───────────

    def build_nucleation(self, n_sites=14, wb=None, eco=None):
        u0 = np.full((self.ny, self.nx), 0.02, dtype=np.float64)
        sites = []

        is_land = (wb < 0.5) if wb is not None else np.ones((self.ny, self.nx), dtype=bool)
        if wb is not None:
            d = distance_transform_edt(is_land)
            bank = (d > 1) & (d < 10)
        else:
            bank = is_land

        for _ in range(n_sites):
            sx = self.rng.uniform(-1.2, 0.8)
            sy = self.rng.uniform(-0.65, 0.65)
            strength = 0.05 + 0.06 * self.rng.random()   # smaller seeds
            sigma = 0.020 + 0.015 * self.rng.random()     # tighter spots

            spot = strength * np.exp(
                -0.5 * ((self.xx - sx) ** 2 + (self.yy - sy) ** 2) / sigma ** 2
            )
            u0 += spot
            sites.append((sx, sy))

        u0 += 0.003 * self.rng.normal(size=u0.shape)
        u0 = gaussian_filter(u0, 0.6)

        if eco is not None:
            u0 *= (1.0 - 0.90 * eco)
        u0[~is_land] = 0.0

        return np.clip(u0, 0.0, 1.0), sites

    # ── full assembly ────────────────────────────────────────────

    def build_all(
        self, n_main=5, n_trib=15, n_sub=20,
        channel_width=0.018, n_eco=6, n_sites=14,
    ):
        rivers = self.build_river_network(n_main, n_trib, n_sub, channel_width)
        wb = rivers["water_binary"]

        farm = self.build_farmland(wb)
        eco  = self.build_eco(n_eco, wb)
        dikes = self.build_dikes(wb)
        u0, sites = self.build_nucleation(n_sites, wb, eco)

        polder = self._polder_gaps()
        constraint = self.build_constraint(wb, farm, eco, polder)
        driving    = self.build_driving(wb, sites, polder)

        return {
            "x": self.x, "y": self.y,
            "xx": self.xx, "yy": self.yy,
            "water_field": rivers["water_field"],
            "water_binary": wb,
            "theta": rivers["theta"],
            "farmland": farm,
            "eco_reserve": eco,
            "dikes": dikes,
            "constraint": constraint,
            "g_base": driving,
            "u0": u0,
            "nucleation_sites": sites,
        }
