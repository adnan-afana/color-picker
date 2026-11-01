import type { DishLayout, GrillLayout, SceneConfig } from './types'

const base = import.meta.env.BASE_URL
const SCENE_URL = `${base}config/scene.json`
const LAYOUT_URL = `${base}config/grill-items.json`
const DISH_URL = `${base}config/dish-layout.json`

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`)
  return (await res.json()) as T
}

/**
 * Loads the scene configuration and the grill and dish layouts from `public/config/`.
 * They are kept outside the bundle so they can be swapped without rebuilding.
 */
export async function loadScene(): Promise<SceneConfig> {
  const [scene, grillLayout, dishLayout] = await Promise.all([
    getJson<Omit<SceneConfig, 'grillLayout' | 'dishLayout'>>(SCENE_URL),
    getJson<GrillLayout>(LAYOUT_URL),
    getJson<Record<string, DishLayout>>(DISH_URL),
  ])
  return { ...scene, grillLayout, dishLayout }
}
