import type { Adjust, FoodPiece, Mover, SceneConfig } from './config/types'
import { rotate } from './animation/pose'

/** Owner-mode asset keys. */
export const foodKey = (dish: string) => `food:${dish}`
export const baseKey = (dish: string) => `base:${dish}`
export const referenceKey = (dish: string) => `reference:${dish}`

export const NO_ADJUST: Adjust = { scale: 1, x: 0, y: 0, rotation: 0 }

export function adjustFor(scene: SceneConfig, key: string): Adjust {
  return scene.local?.adjust[key] ?? NO_ADJUST
}

/** CSS transform for an owner adjustment, applied to an image inside its own box. */
export function adjustTransform(a: Adjust): string | undefined {
  if (a.scale === 1 && !a.x && !a.y && !a.rotation) return undefined
  return `translate(${a.x * 100}%, ${a.y * 100}%) rotate(${a.rotation}deg) scale(${a.scale})`
}

/**
 * The pieces a mover carries. When the owner has replaced this dish's food
 * image, the mover carries that one image instead, spanning the same area and
 * landing where the original pieces' group lands.
 */
export function moverPieces(scene: SceneConfig, mover: Mover): FoodPiece[] {
  const replacement = scene.local?.images[foodKey(mover.dish)]
  if (!replacement) return mover.pieces
  const xs = mover.pieces.flatMap((p) => [p.rect[0], p.rect[0] + p.rect[2]])
  const ys = mover.pieces.flatMap((p) => [p.rect[1], p.rect[1] + p.rect[3]])
  const rect: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
  // Same landing pose as the original pieces (in plate-image px).
  const ps = mover.plateScale ?? 1
  const [cw, ch] = mover.canvas
  let gx = 0
  let gy = 0
  for (const p of mover.pieces) {
    const r = rotate((p.rect[0] + p.rect[2] / 2 - cw / 2) * ps, (p.rect[1] + p.rect[3] / 2 - ch / 2) * ps, mover.rotation)
    gx += p.final[0] - r.x
    gy += p.final[1] - r.y
  }
  gx /= mover.pieces.length
  gy /= mover.pieces.length
  const u = rotate((rect[0] + rect[2] / 2 - cw / 2) * ps, (rect[1] + rect[3] / 2 - ch / 2) * ps, mover.rotation)
  return [{ src: replacement, rect, final: [gx + u.x, gy + u.y], finalRotation: mover.rotation }]
}

/** Movers that travel to a dish, in grill order. */
export function moversFor(scene: SceneConfig, dish: string): [string, Mover][] {
  return Object.entries(scene.food.movers).filter(([, m]) => m.dish === dish)
}
