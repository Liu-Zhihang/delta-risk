# Delta Risk Vis

3D visualization of delta growth locked into river–levee corridors and high-hazard substructures.

This repository provides an interactive isometric simulator for **river-constrained urban corridor emergence** in deltas, illustrating how rivers and levees channel development into corridors and increase exposure in hazardous substructures. It supports the broader [delta risk and spatial structure](https://github.com/Liu-Zhihang/delta-risk) research line.

## Features

- **Isometric 3D view**: Water, farmland, ecological reserves, and settlements as tiled terrain
- **Time slider**: Step through simulation frames and play animation
- **Diagnostics**: Urban fraction, mean order parameter, corridor ratio
- **Delta Constraint Lab**: A new editorial React front end with dual Nature / Cities narratives, story mode, sandbox mode, metrics rail, and figure export presets

## Delta Constraint Lab (new app)

The `lab/` directory contains the new front-end shell for the unified website described in the project planning:

- `lab/public/data/story-manifest.json`: editorial narrative structure for Nature and Cities tracks
- `lab/public/data/scenario-presets.json`: macro sandbox presets
- `lab/public/data/figure-templates.json`: export preset definitions
- `lab/public/data/scene-payload.json`: normalized front-end payload generated from `../sim_data.json`
- `lab/scripts/generate-lab-data.mjs`: adapter that converts the existing simulator JSON into the new payload

### Run the new lab locally

```bash
cd delta-risk/lab
npm install
npm run dev
```

### Rebuild the lab payload and production bundle

```bash
cd delta-risk/lab
npm run generate:data
npm run build
```

The build output is written to `lab/dist/`. The repository root `index.html` now redirects to `lab/dist/index.html`, so GitHub Pages on `main` / root can open the new site directly while the legacy prototype remains at `web/index.html`.

## Quick start (view only)

1. Clone the repo and serve from the **repo root** (so the app at root loads):
   ```bash
   git clone https://github.com/Liu-Zhihang/delta-risk.git
   cd delta-risk
   python -m http.server 8080
   ```
2. Open http://localhost:8080 — you get the **same 3D app** as the live site.

### Deployed site (same as localhost)

The **site root** is the app: `index.html` + `sim_data.json` at repo root. So:

- **https://zhihangliu.cn/delta-risk/** or **https://Liu-Zhihang.github.io/delta-risk/**  
  → opens the 3D isometric simulator directly (no “说明” page).

Enable GitHub Pages: **Settings** → **Pages** → **Source**: Deploy from branch **main**, folder **/ (root)** → Save.

## Regenerating simulation data

To rebuild the environment and simulation, then export JSON for the web:

```bash
cd delta-risk
pip install numpy scipy matplotlib  # optional: use project requirements if present

python run_rccu.py --preset quick --renderer iso --skip-animation
python web/export_json.py --npz data/rccu_run.npz --out web/sim_data.json
cp web/sim_data.json sim_data.json
```

Then reload the web app. The root `sim_data.json` is what the deployed site loads. Outputs (snapshots, npz) are in `output/` and `data/`.

## License

See repository license. For use in publications, please cite the associated work (Cities case / global delta risk manuscript when available).
