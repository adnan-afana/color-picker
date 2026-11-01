import type { GrillLayout, SceneConfig } from './types'

const base = import.meta.env.BASE_URL
const SCENE_URL = `${base}config/scene.json`
const LAYOUT_URL = `${base}config/grill-items.json`

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`)
  return (await res.json()) as T
}

/**
 * Loads the scene configuration and the grill layout from `public/config/`.
 * Both are kept outside the bundle so they can be swapped without rebuilding.
 */
export async function loadScene(): Promise<SceneConfig> {
  const [scene, grillLayout] = await Promise.all([
    getJson<Omit<SceneConfig, 'grillLayout'>>(SCENE_URL),
    getJson<GrillLayout>(LAYOUT_URL),
  ])
  return { ...scene, grillLayout }
}
