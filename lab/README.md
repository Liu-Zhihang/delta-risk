# Delta Constraint Lab

新版交互站点壳层，服务于：

- `Nature Track: Hazardous Substructures`
- `Cities Track: RCCU in Pearl River Delta`

## 目录

- `src/`：React + TypeScript 前端
- `public/data/`：叙事清单、情景预设、图件模板、标准化 `scene-payload.json`、`rccu_flat_bundle.json`
- `public/assets/`：预览图与 `rccu_flat_bundle.bin`
- `scripts/generate-lab-data.mjs`：从 `../sim_data.json` 生成 `scene-payload.json`
- `scripts/export_rccu_flat_assets.py`：从 `cities 投稿/数据/rccu_v2/rccu_run.npz` 导出平面连续渲染二进制包

## 运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 数据更新

当上游模拟重新导出 `delta-risk/sim_data.json` 后，运行：

```bash
npm run generate:data
```

该脚本会：

1. 读取现有 `sim_data.json`
2. 生成新的 `public/data/scene-payload.json`
3. 通过 `uv run --with numpy` 重新导出 `public/assets/rccu_flat_bundle.bin`
4. 生成新的 `public/data/rccu_flat_bundle.json`

说明：

- 当前构建依赖本机可用 `uv`
- 平面连续模拟页面直接使用 `rccu_v2` 的真实高分辨率连续场，不再使用旧的低分辨率块体网页渲染

## 当前实现范围

- 统一站点双入口
- `Story Mode` / `Sandbox Mode`
- `Geo View` / `Model View` / `Compare View`
- 时间轴与自动播放
- Track-specific metrics rail
- Evidence Drawer 与 Why it matters
- Figure Studio 的 PNG / SVG 首版导出
