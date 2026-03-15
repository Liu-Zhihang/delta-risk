"""
viz.py – Remote-sensing style renderer.

Renders a classified land-cover map with vivid, distinct colours:
  Water      → vivid blue
  Farmland   → vivid green
  Eco zone   → deep emerald
  Urban      → coral-orange-red
  Bare land  → light beige
  Dike       → blue-grey lines

Overall aesthetic: satellite classification map, bright & high-contrast.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import numpy as np
from matplotlib import animation
from matplotlib.colors import Normalize
from matplotlib.patches import Patch

from .config import Palette, RenderPreset, CMAP_URBAN, _hex


class DeltaRenderer:

    def __init__(self, preset: Optional[RenderPreset] = None):
        self.p = preset or RenderPreset()

    # ── build static base layer (classified land cover, no urban) ──

    def compose_base(
        self,
        env: Dict[str, np.ndarray],
        shape: tuple,
    ) -> np.ndarray:
        ny, nx = shape
        base = np.zeros((ny, nx, 3), dtype=np.float64)

        bare_rgb = _hex(Palette.BARE)
        base[..., 0] = bare_rgb[0]
        base[..., 1] = bare_rgb[1]
        base[..., 2] = bare_rgb[2]

        water_b = env.get("water_binary", np.zeros(shape))
        water_f = env.get("water_field", np.zeros(shape))
        farm    = env.get("farmland", np.zeros(shape))
        eco     = env.get("eco_reserve", np.zeros(shape))
        dikes   = env.get("dikes", np.zeros(shape))

        # farmland first (background land)
        self._paint(base, farm, _hex(Palette.FARM_LIGHT), 0.85)
        farm_strong = np.clip(farm * 1.5, 0, 1)
        self._paint(base, farm_strong, _hex(Palette.FARM_MID), 0.45)

        # ecological reserves on top
        self._paint(base, eco, _hex(Palette.ECO_MID), 0.80)
        eco_core = np.clip((eco - 0.3) * 2.0, 0, 1)
        self._paint(base, eco_core, _hex(Palette.ECO_DEEP), 0.50)

        # dikes (subtle grey lines along channels)
        self._paint(base, dikes, _hex(Palette.DIKE), 0.40)

        # water channels last (solid blue)
        water_solid = (water_b > 0.5).astype(float)
        self._paint(base, water_solid, _hex(Palette.WATER_MID), 0.95)

        channel_core = np.clip((water_f - 0.55) * 3.0, 0, 1)
        self._paint(base, channel_core, _hex(Palette.WATER_DEEP), 0.60)

        return np.clip(base, 0, 1)

    @staticmethod
    def _paint(canvas, mask, colour, alpha):
        a = np.clip(mask, 0, 1) * alpha
        for c in range(3):
            canvas[..., c] = canvas[..., c] * (1.0 - a) + colour[c] * a

    # ── overlay urban field onto base ──

    def render_frame(
        self,
        base_img: np.ndarray,
        u_field: np.ndarray,
    ) -> np.ndarray:
        frame = base_img.copy()

        u = np.clip(u_field, 0, 1)
        urban_rgba = CMAP_URBAN(u)

        a = urban_rgba[..., 3]
        for c in range(3):
            frame[..., c] = frame[..., c] * (1 - a) + urban_rgba[..., c] * a

        return np.clip(frame, 0, 1)

    # ── legend patches ──

    @staticmethod
    def _legend_patches():
        return [
            Patch(facecolor=Palette.WATER_MID, edgecolor="none", label="Water"),
            Patch(facecolor=Palette.FARM_MID,  edgecolor="none", label="Farmland"),
            Patch(facecolor=Palette.ECO_MID,   edgecolor="none", label="Eco reserve"),
            Patch(facecolor=Palette.URBAN_MID,  edgecolor="none", label="Settlement"),
            Patch(facecolor=Palette.BARE,       edgecolor="#AAA", label="Bare land"),
        ]

    # ── snapshot panel (6 time steps) ──

    def save_snapshots(
        self,
        env: Dict[str, np.ndarray],
        sim: Dict[str, np.ndarray],
        out_path: Path,
        n_panels: int = 6,
    ):
        frames = sim["frames"]
        t_vals = sim["t_values"]
        n = len(frames)
        idxs = np.linspace(0, n - 1, n_panels, dtype=int)

        base = self.compose_base(env, frames[0].shape)

        cols = n_panels // 2
        fig, axes = plt.subplots(
            2, cols,
            figsize=(self.p.fig_width, self.p.fig_height * 0.72),
            facecolor=Palette.BG_LIGHT,
        )
        fig.subplots_adjust(wspace=0.05, hspace=0.14, left=0.02, right=0.98, top=0.90, bottom=0.06)

        for ax, idx in zip(axes.flat, idxs):
            img = self.render_frame(base, frames[idx])
            ax.imshow(img, interpolation="bilinear", aspect="equal")
            ax.set_xticks([]); ax.set_yticks([])
            for sp in ax.spines.values():
                sp.set_color(Palette.BORDER); sp.set_linewidth(0.8)

            step = int(t_vals[idx])
            uf = float(sim["urban_frac"][idx])
            ax.set_title(
                f"t = {step}   urban {uf:.1%}",
                fontsize=self.p.label_size, fontweight="bold",
                color=Palette.TEXT_PRIMARY, fontfamily=self.p.font_family,
                pad=4,
            )

        fig.legend(
            handles=self._legend_patches(), loc="lower center",
            ncol=5, frameon=True, fontsize=self.p.tick_size,
            facecolor=Palette.BG_PANEL, edgecolor=Palette.BORDER,
        )

        fig.suptitle(
            "Emergence of River-Constrained Corridor Urbanization",
            color=Palette.TEXT_PRIMARY, fontsize=self.p.title_size, fontweight="bold",
            fontfamily=self.p.font_family,
        )

        out_path.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(str(out_path), dpi=self.p.dpi * 2, facecolor=Palette.BG_LIGHT)
        plt.close(fig)
        print(f"  Snapshots → {out_path}")

    # ── cinematic animation ──

    def save_animation(
        self,
        env: Dict[str, np.ndarray],
        sim: Dict[str, np.ndarray],
        out_path: Path,
    ) -> Path:
        frames = sim["frames"]
        t_vals = sim["t_values"]
        n_frames = len(frames)

        base = self.compose_base(env, frames[0].shape)

        fig = plt.figure(
            figsize=(self.p.fig_width, self.p.fig_height),
            facecolor=Palette.BG_LIGHT,
        )
        gs = gridspec.GridSpec(
            2, 2, width_ratios=[2.2, 1.0], height_ratios=[1.0, 1.0],
            wspace=0.10, hspace=0.22,
            left=0.03, right=0.97, top=0.92, bottom=0.07,
        )

        ax_main  = fig.add_subplot(gs[:, 0])
        ax_diag1 = fig.add_subplot(gs[0, 1])
        ax_diag2 = fig.add_subplot(gs[1, 1])

        for ax in [ax_main, ax_diag1, ax_diag2]:
            ax.set_facecolor(Palette.BG_PANEL)
            for sp in ax.spines.values():
                sp.set_color(Palette.BORDER); sp.set_linewidth(0.6)
            ax.tick_params(colors=Palette.TEXT_SECONDARY, labelsize=self.p.tick_size)

        init_img = self.render_frame(base, frames[0])
        im = ax_main.imshow(init_img, interpolation="bilinear", aspect="equal")
        ax_main.set_xticks([]); ax_main.set_yticks([])
        title_text = ax_main.set_title(
            "Land Cover  ·  t = 0",
            color=Palette.TEXT_PRIMARY, fontsize=self.p.label_size,
            fontweight="bold", fontfamily=self.p.font_family, loc="left", pad=6,
        )
        ax_main.legend(
            handles=self._legend_patches(), loc="lower left", frameon=True,
            fontsize=self.p.tick_size - 1,
            facecolor=Palette.BG_PANEL, edgecolor=Palette.BORDER,
        )

        # panel 1: growth dynamics
        l_mean, = ax_diag1.plot([], [], lw=2.0, color=Palette.ACCENT_BLUE, label="mean(u)")
        l_frac, = ax_diag1.plot([], [], lw=2.0, color=Palette.ACCENT_ORANGE, label="urban frac")
        ax_diag1.set_xlim(int(t_vals[0]), int(t_vals[-1]))
        ax_diag1.set_ylim(0, max(0.50, float(sim["urban_frac"].max()) * 1.3))
        ax_diag1.set_ylabel("fraction", color=Palette.TEXT_SECONDARY, fontsize=self.p.tick_size)
        ax_diag1.legend(loc="upper left", fontsize=self.p.tick_size - 1, frameon=False)
        ax_diag1.set_title("Growth Dynamics", color=Palette.TEXT_PRIMARY,
                           fontsize=self.p.tick_size + 1, fontweight="bold", loc="left")
        ax_diag1.grid(color=Palette.GRID_SUBTLE, linewidth=0.4, alpha=0.6)

        # panel 2: corridor ratio + edge density
        l_ratio, = ax_diag2.plot([], [], lw=2.0, color=Palette.ACCENT_GREEN, label="corridor ratio")
        ax2t = ax_diag2.twinx()
        l_edge, = ax2t.plot([], [], lw=1.5, color=Palette.ACCENT_RED, alpha=0.7, label="edge length")

        ax_diag2.set_xlim(int(t_vals[0]), int(t_vals[-1]))
        cr_max = max(2.5, float(sim["corridor_ratio"].max()) * 1.15)
        ax_diag2.set_ylim(0, cr_max)
        ax_diag2.set_ylabel("ratio", color=Palette.TEXT_SECONDARY, fontsize=self.p.tick_size)
        ax_diag2.set_xlabel("step", color=Palette.TEXT_SECONDARY, fontsize=self.p.tick_size)
        ax2t.set_ylim(0, max(1, float(sim["edge_length"].max()) * 1.15))
        ax2t.set_ylabel("edges", color=Palette.TEXT_SECONDARY, fontsize=self.p.tick_size)
        ax2t.tick_params(colors=Palette.TEXT_SECONDARY, labelsize=self.p.tick_size)
        for sp in ax2t.spines.values():
            sp.set_color(Palette.BORDER); sp.set_linewidth(0.6)

        ax_diag2.legend(
            [l_ratio, l_edge], ["corridor ratio", "edge length"],
            loc="upper left", fontsize=self.p.tick_size - 1, frameon=False,
        )
        ax_diag2.set_title("Corridor Metrics", color=Palette.TEXT_PRIMARY,
                           fontsize=self.p.tick_size + 1, fontweight="bold", loc="left")
        ax_diag2.grid(color=Palette.GRID_SUBTLE, linewidth=0.4, alpha=0.6)

        fig.suptitle(
            "RCCU  ·  River-Constrained Corridor Urbanization Simulator",
            color=Palette.TEXT_PRIMARY, fontsize=self.p.title_size,
            fontweight="bold", fontfamily=self.p.font_family,
        )

        def update(i: int):
            img = self.render_frame(base, frames[i])
            im.set_array(img)
            title_text.set_text(f"Land Cover  ·  t = {int(t_vals[i])}")

            sl = slice(None, i + 1)
            l_mean.set_data(t_vals[sl], sim["mean_u"][sl])
            l_frac.set_data(t_vals[sl], sim["urban_frac"][sl])
            l_ratio.set_data(t_vals[sl], sim["corridor_ratio"][sl])
            l_edge.set_data(t_vals[sl], sim["edge_length"][sl])
            return [im, l_mean, l_frac, l_ratio, l_edge, title_text]

        ani = animation.FuncAnimation(
            fig, update, frames=n_frames,
            interval=1000 // max(1, self.p.fps), blit=False,
        )

        out_path.parent.mkdir(parents=True, exist_ok=True)
        actual = out_path
        if out_path.suffix.lower() == ".gif":
            writer = animation.PillowWriter(fps=self.p.fps)
        else:
            try:
                writer = animation.FFMpegWriter(fps=self.p.fps, bitrate=4000)
            except Exception:
                actual = out_path.with_suffix(".gif")
                writer = animation.PillowWriter(fps=self.p.fps)

        savefig_kw = {"facecolor": Palette.BG_LIGHT}
        ani.save(str(actual), writer=writer, dpi=self.p.dpi, savefig_kwargs=savefig_kw)
        plt.close(fig)
        print(f"  Animation → {actual}")
        return actual
