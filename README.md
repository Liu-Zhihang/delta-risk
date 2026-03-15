# Delta Risk Vis

3D visualization of delta growth locked into river–levee corridors and high-hazard substructures.

This repository provides an interactive isometric simulator for **river-constrained urban corridor emergence** in deltas, illustrating how rivers and levees channel development into corridors and increase exposure in hazardous substructures. It supports the broader [delta risk and spatial structure](https://github.com/Liu-Zhihang/delta-risk) research line.

## Features

- **Isometric 3D view**: Water, farmland, ecological reserves, and settlements as tiled terrain
- **Time slider**: Step through simulation frames and play animation
- **Diagnostics**: Urban fraction, mean order parameter, corridor ratio

## Quick start (view only)

1. Clone the repo and open the web app:
   ```bash
   git clone https://github.com/Liu-Zhihang/delta-risk.git
   cd delta-risk/web
   ```
2. Serve the folder locally (required for loading `sim_data.json`):
   ```bash
   python -m http.server 8080
   ```
3. Open http://localhost:8080 in a browser.

Or deploy `web/` to GitHub Pages / your site (e.g. `yoursite.com/delta-risk-vis`).

## Regenerating simulation data

To rebuild the environment and simulation, then export JSON for the web:

```bash
cd delta-risk
pip install numpy scipy matplotlib  # optional: use project requirements if present

python run_rccu.py --preset quick --renderer iso --skip-animation
python web/export_json.py --npz data/rccu_run.npz --out web/sim_data.json
```

Then reload the web app. Outputs (snapshots, npz) are written to `output/` and `data/`.

## License

See repository license. For use in publications, please cite the associated work (Cities case / global delta risk manuscript when available).
