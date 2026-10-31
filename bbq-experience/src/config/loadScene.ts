import type { SceneConfig } from './types'

const SCENE_URL = `${import.meta.env.BASE_URL}config/scene.json`

/**
 * Loads the scene configuration from `public/config/scene.json`.
 * Kept outside the bundle so it can be swapped without rebuilding.
 */
export async function loadScene(): Promise<SceneConfig> {
  const res = await fetch(SCENE_URL, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Could not load ${SCENE_URL} (${res.status})`)
  return (await res.json()) as SceneConfig
}
