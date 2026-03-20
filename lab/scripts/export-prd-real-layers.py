#!/usr/bin/env python3
"""
Export simplified Pearl River Delta reference layers for the web viewer.

This script converts existing local research data into lightweight GeoJSON files
that the lab frontend can consume later:
1. boundary
2. river network
3. cropland
4. reviewed/manual RCCU labels

It is intentionally separate from the current simulated scene payload so the
frontend can gradually migrate from grid-based textures to real vector layers.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd


SCRIPT_PATH = Path(__file__).resolve()
LAB_ROOT = SCRIPT_PATH.parents[1]
PROJECT_ROOT = SCRIPT_PATH.parents[3]
CITY_ROOT = PROJECT_ROOT / "cities 投稿"

DEFAULT_BOUNDARY = CITY_ROOT / "数据" / "phenomenon" / "珠江三角洲行政边界.shp"
DEFAULT_WATER = CITY_ROOT / "数据" / "phenomenon" / "珠三角水系矢量" / "珠江三角洲水系_river_vector_wgs84.shp"
DEFAULT_LABELS = CITY_ROOT / "数据" / "phenomenon" / "人工标注的廊道聚落" / "标注20260212.shp"
DEFAULT_CROPLAND_DIR = CITY_ROOT / "数据" / "广东省耕地矢量数据"
DEFAULT_OUT_DIR = LAB_ROOT / "public" / "data" / "real"

PRD_CITY_NAMES = [
    "广州市",
    "深圳市",
    "珠海市",
    "佛山市",
    "江门市",
    "东莞市",
    "中山市",
    "惠州市",
    "肇庆市",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export real PRD reference layers for the web lab.")
    parser.add_argument("--boundary", type=Path, default=DEFAULT_BOUNDARY)
    parser.add_argument("--water", type=Path, default=DEFAULT_WATER)
    parser.add_argument("--labels", type=Path, default=DEFAULT_LABELS)
    parser.add_argument("--cropland-dir", type=Path, default=DEFAULT_CROPLAND_DIR)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--simplify-m", type=float, default=45.0)
    return parser.parse_args()


def read_layer(path: Path, target_crs: str | None = None) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(path)
    if target_crs is not None:
      gdf = gdf.to_crs(target_crs)
    return gdf


def simplify_layer(gdf: gpd.GeoDataFrame, tolerance_m: float) -> gpd.GeoDataFrame:
    if gdf.empty:
        return gdf
    metric_crs = gdf.estimate_utm_crs()
    projected = gdf.to_crs(metric_crs)
    projected["geometry"] = projected.geometry.simplify(tolerance_m, preserve_topology=True)
    return projected.to_crs(gdf.crs)


def collect_prd_cropland(cropland_dir: Path) -> list[Path]:
    paths: list[Path] = []
    for city_name in PRD_CITY_NAMES:
        paths.extend(sorted(cropland_dir.glob(f"cf_{city_name}_*.shp")))
    return paths


def concat_layers(paths: list[Path], crs: str) -> gpd.GeoDataFrame:
    frames = []
    for path in paths:
        gdf = read_layer(path, crs)
        gdf = gdf[["geometry"]].copy()
        gdf["source"] = path.stem
        frames.append(gdf)
    if not frames:
        return gpd.GeoDataFrame({"source": []}, geometry=[], crs=crs)
    return gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=crs)


def clip_to_boundary(gdf: gpd.GeoDataFrame, boundary: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if gdf.empty:
        return gdf
    return gpd.clip(gdf, boundary)


def dissolve_geometry(gdf: gpd.GeoDataFrame, key: str) -> gpd.GeoDataFrame:
    if gdf.empty:
        return gdf
    return gdf.dissolve(by=key, as_index=False)


def ensure_wgs84(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    return gdf.to_crs("EPSG:4326")


def write_geojson(gdf: gpd.GeoDataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    gdf.to_file(path, driver="GeoJSON")


def build_manifest(boundary: gpd.GeoDataFrame, water: gpd.GeoDataFrame, cropland: gpd.GeoDataFrame, labels: gpd.GeoDataFrame) -> dict:
    bounds = boundary.total_bounds.tolist()
    return {
        "bbox": {
            "west": bounds[0],
            "south": bounds[1],
            "east": bounds[2],
            "north": bounds[3],
        },
        "counts": {
            "boundary": len(boundary),
            "water": len(water),
            "cropland": len(cropland),
            "labels": len(labels),
        },
        "sources": {
            "boundary": str(DEFAULT_BOUNDARY),
            "water": str(DEFAULT_WATER),
            "labels": str(DEFAULT_LABELS),
            "cropland_dir": str(DEFAULT_CROPLAND_DIR),
        },
    }


def main() -> None:
    args = parse_args()
    target_crs = "EPSG:4326"

    boundary = read_layer(args.boundary, target_crs)
    boundary = boundary[["geometry"]].copy()
    boundary["layer"] = "boundary"
    boundary = dissolve_geometry(boundary, "layer")

    water = read_layer(args.water, target_crs)
    water = clip_to_boundary(water, boundary)
    water = water[["geometry"]].copy()
    water["layer"] = "river"

    labels = read_layer(args.labels, target_crs)
    keep_cols = [col for col in labels.columns if col != "geometry"]
    labels = clip_to_boundary(labels, boundary)[keep_cols + ["geometry"]].copy()
    if "Name" in labels.columns:
        labels = labels.rename(columns={"Name": "name"})

    cropland_paths = collect_prd_cropland(args.cropland_dir)
    cropland = concat_layers(cropland_paths, target_crs)
    cropland = clip_to_boundary(cropland, boundary)
    cropland = dissolve_geometry(cropland.assign(layer="cropland"), "layer")

    boundary = simplify_layer(ensure_wgs84(boundary), args.simplify_m)
    water = simplify_layer(ensure_wgs84(water), args.simplify_m)
    cropland = simplify_layer(ensure_wgs84(cropland), args.simplify_m)
    labels = simplify_layer(ensure_wgs84(labels), args.simplify_m)

    out_dir = args.out_dir
    write_geojson(boundary, out_dir / "prd-boundary.geojson")
    write_geojson(water, out_dir / "prd-rivers.geojson")
    write_geojson(cropland, out_dir / "prd-cropland.geojson")
    write_geojson(labels, out_dir / "prd-rccu-labels.geojson")

    manifest = build_manifest(boundary, water, cropland, labels)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Saved boundary: {out_dir / 'prd-boundary.geojson'}")
    print(f"Saved rivers: {out_dir / 'prd-rivers.geojson'}")
    print(f"Saved cropland: {out_dir / 'prd-cropland.geojson'}")
    print(f"Saved labels: {out_dir / 'prd-rccu-labels.geojson'}")
    print(f"Saved manifest: {out_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
