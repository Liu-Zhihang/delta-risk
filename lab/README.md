# Delta Constraint Lab

新版交互站点壳层，服务于：

- `Nature Track: Hazardous Substructures`
- `Cities Track: RCCU in Pearl River Delta`

## 目录

- `src/`：React + TypeScript 前端
- `public/data/`：叙事清单、情景预设、图件模板、标准化 `scene-payload.json`
- `public/assets/`：首版预览图
- `scripts/generate-lab-data.mjs`：从 `../sim_data.json` 生成 `scene-payload.json`

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
3. 复制预览图到 `public/assets/`

## 当前实现范围

- 统一站点双入口
- `Story Mode` / `Sandbox Mode`
- `Geo View` / `Model View` / `Compare View`
- 时间轴与自动播放
- Track-specific metrics rail
- Evidence Drawer 与 Why it matters
- Figure Studio 的 PNG / SVG 首版导出
