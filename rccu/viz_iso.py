"""
viz_iso.py – Isometric 3D landscape renderer for RCCU simulations.

Renders the simulation as a tiled isometric map with layered elements:
  Layer 0  Farmland / bare land base grid
  Layer 1  Water channels (depressed tiles)
  Layer 2  Ecological reserves (tree crowns)
  Layer 3  Settlements (building clusters, growing over time)

Output: snapshot panels and animated GIF/MP4 with diagnostic curves.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional, Tuple

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import numpy as np
from matplotlib import animation
from matplotlib.patches import Patch
from scipy.ndimage import zoom

from .config import Palette, RenderPreset, _hex
from .sprites import IsometricSprites


# tile-classification thresholds
_U_THRESHOLD = 0.40


def _classify_tiles(
    env: Dict[str, np.ndarray],
    u_field: np.ndarray,
    tile_rows: int,
    tile_cols: int,
) -> np.ndarray:
    """
    Downsample continuous fields to a (tile_rows, tile_cols) grid and
    assign each tile a class: 0=bare, 1=farmland, 2=water, 3=eco, 4=settlement, 5=dike.
    """
    ny, nx = u_field.shape
    sy, sx = ny / tile_rows, nx / tile_cols

    water = env.get("water_binary", np.zeros_like(u_field))
    farm  = env.get("farmland", np.zeros_like(u_field))
    eco   = env.get("eco_reserve", np.zeros_like(u_field))
    dikes = env.get("dikes", np.zeros_like(u_field))

    grid = np.zeros((tile_rows, tile_cols), dtype=np.int32)

    for r in range(tile_rows):
        y0, y1 = int(r * sy), int(min((r + 1) * sy, ny))
        for c in range(tile_cols):
            x0, x1 = int(c * sx), int(min((c + 1) * sx, nx))
            patch_u = u_field[y0:y1, x0:x1]
            patch_w = water[y0:y1, x0:x1]
            patch_f = farm[y0:y1, x0:x1]
            patch_e = eco[y0:y1, x0:x1]
            patch_d = dikes[y0:y1, x0:x1]

            mw = float(patch_w.mean())
            mu = float(patch_u.mean())
            me = float(patch_e.mean())
            mf = float(patch_f.mean())
            md = float(patch_d.mean())

            if mw > 0.40:
                grid[r, c] = 2   # water
            elif mu > _U_THRESHOLD:
                grid[r, c] = 4   # settlement
            elif me > 0.40:
                grid[r, c] = 3   # eco
            elif md > 0.35:
                grid[r, c] = 5   # dike
            elif mf > 0.20:
                grid[r, c] = 1   # farmland
            else:
                grid[r, c] = 0   # bare

    return grid


_KIND_MAP = {0: "bare", 1: "farmland", 2: "water", 3: "eco", 4: "settlement", 5: "dike"}


class IsometricRenderer:
    """Renders RCCU simulation as an isometric tiled landscape."""

    def __init__(self, preset: Optional[RenderPreset] = None, tile_px: int = 48):
        self.p = preset or RenderPreset()
        self.sprites = IsometricSprites(tile_px)
        self.tile_px = tile_px
        # Denser grid so elements are less sparse (was 28×42)
        self.tile_rows = 48
        self.tile_cols = 72

    def _compose_iso_image(
        self,
        tile_grid: np.ndarray,
    ) -> np.ndarray:
        """Render a full isometric image from the tile classification grid."""
        rows, cols = tile_grid.shape
        hw = self.sprites.half_w
        hh = self.sprites.half_h
        tw, th = self.sprites.tile_screen_size()

        canvas_w = (rows + cols) * hw + tw
        canvas_h = (rows + cols) * hh + th + 20
        canvas = np.ones((canvas_h, canvas_w, 4), dtype=np.float64)
        canvas[..., :3] = _hex(Palette.BG_LIGHT)

        # painter's algorithm: draw back-to-front
        for r in range(rows):
            for c in range(cols):
                kind = _KIND_MAP.get(tile_grid[r, c], "bare")
                variant = (r * 137 + c * 251) % 16
                sprite = self.sprites.get(kind, variant)
                sh, sw = sprite.shape[:2]

                sx, sy = self.sprites.grid_to_screen(r, c)
                px = sx + (rows - 1) * hw
                py = sy + 10

                # height offset for 3D feel
                if kind == "water":
                    py += 3
                elif kind == "settlement":
                    py -= 2
                elif kind == "eco":
                    py -= 1

                if px < 0 or py < 0 or px + sw > canvas_w or py + sh > canvas_h:
                    continue

                alpha = sprite[..., 3:4]
                canvas[py:py + sh, px:px + sw, :3] = (
                    canvas[py:py + sh, px:px + sw, :3] * (1 - alpha)
                    + sprite[..., :3] * alpha
                )
                canvas[py:py + sh, px:px + sw, 3] = np.clip(
                    canvas[py:py + sh, px:px + sw, 3] + sprite[..., 3], 0, 1
                )

        return np.clip(canvas[..., :3], 0, 1)

    @staticmethod
    def _legend_patches():
        return [
            Patch(facecolor="#4DB8D6", edgecolor="none", label="Water"),
            Patch(facecolor="#8CD67A", edgecolor="none", label="Farmland"),
            Patch(facecolor="#388E3C", edgecolor="none", label="Eco reserve"),
            Patch(facecolor="#D64530", edgecolor="none", label="Settlement"),
            Patch(facecolor="#E0DCD8", edgecolor="#AAA", label="Bare land"),
        ]

    # ── snapshot panel ──────────────────────────────────────────

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

        cols = n_panels // 2
        fig, axes = plt.subplots(
            2, cols,
            figsize=(self.p.fig_width, self.p.fig_height * 0.78),
            facecolor=Palette.BG_LIGHT,
        )
        fig.subplots_adjust(wspace=0.04, hspace=0.12, left=0.01, right=0.99, top=0.90, bottom=0.06)

        for ax, idx in zip(axes.flat, idxs):
            tile_grid = _classify_tiles(env, frames[idx], self.tile_rows, self.tile_cols)
            img = self._compose_iso_image(tile_grid)
            ax.imshow(img, interpolation="bilinear", aspect="equal")
            ax.set_xticks([]); ax.set_yticks([])
            for sp in ax.spines.values():
                sp.set_color(Palette.BORDER); sp.set_linewidth(0.6)

            step = int(t_vals[idx])
            uf = float(sim["urban_frac"][idx])
            ax.set_title(
                f"t = {step}   urban {uf:.1%}",
                fontsize=self.p.label_size, fontweight="bold",
                color=Palette.TEXT_PRIMARY, fontfamily=self.p.font_family, pad=4,
            )

        fig.legend(
            handles=self._legend_patches(), loc="lower center",
            ncol=5, frameon=True, fontsize=self.p.tick_size,
            facecolor=Palette.BG_PANEL, edgecolor=Palette.BORDER,
        )
        fig.suptitle(
            "RCCU  ·  Isometric Corridor Emergence",
            color=Palette.TEXT_PRIMARY, fontsize=self.p.title_size, fontweight="bold",
            fontfamily=self.p.font_family,
        )

        out_path.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(str(out_path), dpi=self.p.dpi * 2, facecolor=Palette.BG_LIGHT)
        plt.close(fig)
        print(f"  ISO Snapshots → {out_path}")

    # ── animation ───────────────────────────────────────────────

    def save_animation(
        self,
        env: Dict[str, np.ndarray],
        sim: Dict[str, np.ndarray],
        out_path: Path,
    ) -> Path:
        frames = sim["frames"]
        t_vals = sim["t_values"]
        n_frames = len(frames)

        # pre-render all iso frames
        print("  Pre-rendering isometric frames ...")
        iso_frames = []
        for i in range(n_frames):
            tg = _classify_tiles(env, frames[i], self.tile_rows, self.tile_cols)
            iso_frames.append(self._compose_iso_image(tg))

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

        im = ax_main.imshow(iso_frames[0], interpolation="bilinear", aspect="equal")
        ax_main.set_xticks([]); ax_main.set_yticks([])
        title_text = ax_main.set_title(
            "Isometric View  ·  t = 0",
            color=Palette.TEXT_PRIMARY, fontsize=self.p.label_size,
            fontweight="bold", fontfamily=self.p.font_family, loc="left", pad=6,
        )
        ax_main.legend(
            handles=self._legend_patches(), loc="lower left", frameon=True,
            fontsize=self.p.tick_size - 1,
            facecolor=Palette.BG_PANEL, edgecolor=Palette.BORDER,
        )

        l_mean, = ax_diag1.plot([], [], lw=2.0, color=Palette.ACCENT_BLUE, label="mean(u)")
        l_frac, = ax_diag1.plot([], [], lw=2.0, color=Palette.ACCENT_ORANGE, label="urban frac")
        ax_diag1.set_xlim(int(t_vals[0]), int(t_vals[-1]))
        ax_diag1.set_ylim(0, max(0.50, float(sim["urban_frac"].max()) * 1.3))
        ax_diag1.set_ylabel("fraction", color=Palette.TEXT_SECONDARY, fontsize=self.p.tick_size)
        ax_diag1.legend(loc="upper left", fontsize=self.p.tick_size - 1, frameon=False)
        ax_diag1.set_title("Growth Dynamics", color=Palette.TEXT_PRIMARY,
                           fontsize=self.p.tick_size + 1, fontweight="bold", loc="left")
        ax_diag1.grid(color=Palette.GRID_SUBTLE, linewidth=0.4, alpha=0.6)

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
        ax_diag2.legend([l_ratio, l_edge], ["corridor ratio", "edge length"],
                        loc="upper left", fontsize=self.p.tick_size - 1, frameon=False)
        ax_diag2.set_title("Corridor Metrics", color=Palette.TEXT_PRIMARY,
                           fontsize=self.p.tick_size + 1, fontweight="bold", loc="left")
        ax_diag2.grid(color=Palette.GRID_SUBTLE, linewidth=0.4, alpha=0.6)

        fig.suptitle(
            "RCCU  ·  Isometric Corridor Emergence Simulator",
            color=Palette.TEXT_PRIMARY, fontsize=self.p.title_size,
            fontweight="bold", fontfamily=self.p.font_family,
        )

        def update(i: int):
            im.set_array(iso_frames[i])
            title_text.set_text(f"Isometric View  ·  t = {int(t_vals[i])}")
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
        print(f"  ISO Animation → {actual}")
        return actual
