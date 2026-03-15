"""
engine.py – PDE integration engine for RCCU dynamics.

    ∂u/∂t = R(u) + D‖ ∂²‖u + D⊥ ∂²⊥u + D_iso ∇²u − κ₄ ∇⁴u
            − λ C(x) + η G(x,t) − h₀ + noise

Physical constraint: u ≡ 0 inside river channels (hard boundary).
Settlements grow on RIVERBANKS, spreading along the channel direction.
"""

from __future__ import annotations

import math
from typing import Dict

import numpy as np
from scipy.ndimage import gaussian_filter, distance_transform_edt

from .config import PhysicsParams


def _laplacian_9pt_neumann(u: np.ndarray) -> np.ndarray:
    # Neumann-like (zero-gradient) boundary via edge padding.
    up = np.pad(u, ((1, 1), (1, 1)), mode="edge")
    c = up[1:-1, 1:-1]
    n = up[:-2, 1:-1]
    s = up[2:, 1:-1]
    e = up[1:-1, 2:]
    w = up[1:-1, :-2]
    ne = up[:-2, 2:]
    nw = up[:-2, :-2]
    se = up[2:, 2:]
    sw = up[2:, :-2]
    return (4.0 * (n + s + e + w) + (ne + nw + se + sw) - 20.0 * c) / 6.0


def _laplacian_9pt_periodic(u: np.ndarray) -> np.ndarray:
    n = np.roll(u, -1, 0)
    s = np.roll(u, 1, 0)
    e = np.roll(u, -1, 1)
    w = np.roll(u, 1, 1)
    ne = np.roll(n, -1, 1)
    nw = np.roll(n, 1, 1)
    se = np.roll(s, -1, 1)
    sw = np.roll(s, 1, 1)
    return (4.0 * (n + s + e + w) + (ne + nw + se + sw) - 20.0 * u) / 6.0


def _laplacian_9pt(u: np.ndarray, boundary_mode: str) -> np.ndarray:
    if boundary_mode == "periodic":
        return _laplacian_9pt_periodic(u)
    return _laplacian_9pt_neumann(u)


def _d2_xx_neumann(u: np.ndarray) -> np.ndarray:
    up = np.pad(u, ((0, 0), (1, 1)), mode="edge")
    return up[:, 2:] - 2.0 * up[:, 1:-1] + up[:, :-2]


def _d2_xx_periodic(u: np.ndarray) -> np.ndarray:
    return np.roll(u, -1, 1) - 2.0 * u + np.roll(u, 1, 1)


def _d2_yy_neumann(u: np.ndarray) -> np.ndarray:
    up = np.pad(u, ((1, 1), (0, 0)), mode="edge")
    return up[2:, :] - 2.0 * up[1:-1, :] + up[:-2, :]


def _d2_yy_periodic(u: np.ndarray) -> np.ndarray:
    return np.roll(u, -1, 0) - 2.0 * u + np.roll(u, 1, 0)


def _d2_xy_neumann(u: np.ndarray) -> np.ndarray:
    up = np.pad(u, ((1, 1), (1, 1)), mode="edge")
    return (
        up[2:, 2:]
      - up[2:, :-2]
      - up[:-2, 2:]
      + up[:-2, :-2]
    ) / 4.0


def _d2_xy_periodic(u: np.ndarray) -> np.ndarray:
    return (
        np.roll(np.roll(u, -1, 0), -1, 1)
        - np.roll(np.roll(u, -1, 0), 1, 1)
        - np.roll(np.roll(u, 1, 0), -1, 1)
        + np.roll(np.roll(u, 1, 0), 1, 1)
    ) / 4.0


def _aniso_laplacians(u: np.ndarray, theta: np.ndarray, boundary_mode: str):
    if boundary_mode == "periodic":
        uxx, uyy, uxy = _d2_xx_periodic(u), _d2_yy_periodic(u), _d2_xy_periodic(u)
    else:
        uxx, uyy, uxy = _d2_xx_neumann(u), _d2_yy_neumann(u), _d2_xy_neumann(u)
    c, s = np.cos(theta), np.sin(theta)
    d2_par  = c*c*uxx + 2*s*c*uxy + s*s*uyy
    d2_perp = s*s*uxx - 2*s*c*uxy + c*c*uyy
    return d2_par, d2_perp


def _driving_envelope(step: int, n_steps: int) -> float:
    tau = step / max(n_steps - 1, 1)
    s1 = 1.0 / (1.0 + math.exp(-14.0 * (tau - 0.15)))
    s2 = 1.0 / (1.0 + math.exp(-18.0 * (tau - 0.50)))
    s3 = 1.0 / (1.0 + math.exp(-20.0 * (tau - 0.85)))
    return 0.45 + 0.40 * s1 + 0.25 * s2 - 0.08 * s3


class RCCUEngine:

    def __init__(self, params: PhysicsParams):
        self.p = params
        if self.p.boundary_mode not in {"neumann", "periodic"}:
            raise ValueError(
                f"Unsupported boundary mode: {self.p.boundary_mode}. "
                "Use 'neumann' or 'periodic'."
            )

    def run(self, env: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        p = self.p
        rng = np.random.default_rng(p.seed + 1)

        u      = env["u0"].copy()
        C      = env["constraint"]
        g_base = env["g_base"]
        theta  = env["theta"]

        water_mask = env.get("water_binary", np.zeros_like(u)) > 0.5
        is_land = ~water_mask

        u[water_mask] = 0.0

        dist_from_water = distance_transform_edt(is_land)
        bank_zone = (dist_from_water > 0) & (dist_from_water < 12)
        hinterland = dist_from_water >= 12

        frames, t_vals = [], []
        mean_u, corridor_ratio, urban_frac = [], [], []
        phase_area, edge_length = [], []

        for step in range(p.n_steps):
            amp = _driving_envelope(step, p.n_steps)
            G_t = np.clip(amp * g_base, 0.0, 2.0)

            d2_par, d2_perp = _aniso_laplacians(u, theta, p.boundary_mode)
            lap = _laplacian_9pt(u, p.boundary_mode)
            bih = _laplacian_9pt(lap, p.boundary_mode)

            reaction = p.a * u * (1.0 - u) * (u - p.u_crit)
            forcing  = -p.lambda_constraint * C + p.eta_driving * G_t - p.h0

            det = (
                reaction
                + p.d_parallel * d2_par
                + p.d_perp * d2_perp
                + p.d_iso * lap
                - p.k4 * bih
                + forcing
            )

            noise = rng.normal(size=u.shape)
            noise = gaussian_filter(noise, sigma=p.noise_corr_len)
            noise /= np.std(noise) + 1e-8
            stoch = p.noise_sigma * noise

            u = u + p.dt * det + math.sqrt(p.dt) * stoch
            u = np.clip(u, 0.0, 1.0)

            u[water_mask] = 0.0

            if step % p.save_every == 0 or step == p.n_steps - 1:
                frames.append(u.copy())
                t_vals.append(step)

                m = float(u[is_land].mean())
                mean_u.append(m)

                bm = float(u[bank_zone].mean()) if np.any(bank_zone) else 0.0
                hm = float(u[hinterland].mean()) if np.any(hinterland) else 0.0
                # floor at 0.02 prevents noise-driven spikes when hinterland ≈ 0
                corridor_ratio.append(bm / max(hm, 0.02))

                binary = (u > 0.55) & is_land
                urban_frac.append(float(binary.sum()) / max(float(is_land.sum()), 1))
                phase_area.append(float(binary.sum()))

                edges = (
                    np.abs(np.diff(binary.astype(float), axis=0)).sum()
                    + np.abs(np.diff(binary.astype(float), axis=1)).sum()
                )
                edge_length.append(float(edges))

        return {
            "frames":         np.asarray(frames, np.float32),
            "t_values":       np.asarray(t_vals, np.int32),
            "mean_u":         np.asarray(mean_u, np.float32),
            "corridor_ratio": np.asarray(corridor_ratio, np.float32),
            "urban_frac":     np.asarray(urban_frac, np.float32),
            "phase_area":     np.asarray(phase_area, np.float32),
            "edge_length":    np.asarray(edge_length, np.float32),
        }
