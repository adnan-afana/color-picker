import type { SceneConfig } from './config/types'

/** Ids of grill items that leave the grill, and of lids that open. */
export function animatedIds(scene: SceneConfig) {
  const moving = new Set(scene.motion.steps.flatMap((s) => s.items.map((i) => i.id)))
  const lids = new Set(scene.motion.steps.flatMap((s) => (s.lid ? [s.lid] : [])))
  return { moving, lids }
}

/** Position of a grill cut-out in % of the grill photo. */
export function boxStyle(scene: SceneConfig, id: string) {
  const item = scene.grillLayout.items[id]
  if (!item) return undefined
  const { width: W, height: H } = scene.grillLayout.frame
  const [x0, y0, x1, y1] = item.box
  return {
    left: `${(x0 / W) * 100}%`,
    top: `${(y0 / H) * 100}%`,
    width: `${((x1 - x0) / W) * 100}%`,
    height: `${((y1 - y0) / H) * 100}%`,
  }
}
