import type { FigureTemplate, ScenarioPreset, ScenePayload, StoryManifest } from "../types";

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function loadManifest() {
  return loadJson<StoryManifest>("data/story-manifest.json");
}

export async function loadScenePayload() {
  return loadJson<ScenePayload>("data/scene-payload.json");
}

export async function loadScenarioPresets() {
  return loadJson<ScenarioPreset[]>("data/scenario-presets.json");
}

export async function loadFigureTemplates() {
  return loadJson<FigureTemplate[]>("data/figure-templates.json");
}
