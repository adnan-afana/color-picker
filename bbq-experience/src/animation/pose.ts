import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import type { FoodPiece, Mover } from '../config/types'

/**
 * Pure motion maths — no DOM access.
 *
 * Every frame the engine measures the food's resting slot on the grill and
 * its destination plate on screen, then asks these functions where the food
 * should be for the current progress. Everything is rebuilt from those live
 * measurements, so the motion stays glued to both while the page scrolls,
 * pins or resizes.
 */

export interface Point {
  x: number
  y: number
}

/** A measured box in viewport pixels. */
export interface Rect {
  left: number
  top: number
  w: number
  h: number
}

export interface Viewport {
  w: number
  h: number
}

/** Animated progress values (0–1) for one mover, driven by the scroll timeline. */
export interface MoverProgress {
  lift: number
  flight: number
  settle: number
  slide: number
  spread: number
}

export const emptyProgress = (): MoverProgress => ({ lift: 0, flight: 0, settle: 0, slide: 0, spread: 0 })
export const finalProgress = (): MoverProgress => ({ lift: 1, flight: 1, settle: 1, slide: 1, spread: 1 })

export interface MotionSettings {
  lift: { y: number; scale: number }
  curviness: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp01((v - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const rad = (deg: number) => (deg * Math.PI) / 180

/** Rotates a vector by a CSS angle (clockwise, y down). */
export function rotate(x: number, y: number, deg: number): Point {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return { x: x * c - y * s, y: x * s + y * c }
}

/** Where one piece lies on the plate, in screen px. */
export function pieceOnPlate(piece: FoodPiece, plate: Rect, plateImg: [number, number]): Point {
  return {
    x: plate.left + (piece.final[0] / plateImg[0]) * plate.w,
    y: plate.top + (piece.final[1] / plateImg[1]) * plate.h,
  }
}

export interface PieceTarget {
  /** Offset from the piece's place on the skewer, in the element's own px. */
  dx: number
  dy: number
  /** Rotation relative to the element. */
  rotation: number
}

export interface Plan {
  rest: Point
  restRotation: number
  lifted: Point
  hover: Point
  final: Point
  finalScale: number
  finalRotation: number
  points: Point[]
  raw: ReturnType<typeof MotionPathPlugin.arrayToRawPath>
  pieces: PieceTarget[]
}

/**
 * Plans one mover from live measurements: its resting slot on the grill, its
 * landing pose on the plate, and how each piece fans out after landing.
 *
 * The landing pose is chosen so the pieces end exactly where they lie in the
 * dish photo; for a single piece (a kebab, the chicken) nothing fans out.
 */
export function planMover(
  mover: Mover,
  pieces: FoodPiece[],
  slot: Rect,
  restRotation: number,
  plate: Rect,
  plateImg: [number, number],
  vp: Viewport,
  motion: MotionSettings,
): Plan {
  const [cw, ch] = mover.canvas
  const local = slot.w / cw // element px per canvas px
  const onPlate = (plate.w / plateImg[0]) * (mover.plateScale ?? 1) // screen px per canvas px on the plate
  const theta = mover.rotation

  const C = { x: cw / 2, y: ch / 2 }
  const targets = pieces.map((p) => pieceOnPlate(p, plate, plateImg))
  const centres = pieces.map((p) => ({ x: p.rect[0] + p.rect[2] / 2, y: p.rect[1] + p.rect[3] / 2 }))
  // Element centre that best lines every piece up with its spot in the photo.
  let gx = 0
  let gy = 0
  pieces.forEach((_, i) => {
    const r = rotate((centres[i].x - C.x) * onPlate, (centres[i].y - C.y) * onPlate, theta)
    gx += targets[i].x - r.x
    gy += targets[i].y - r.y
  })
  const final = { x: gx / pieces.length, y: gy / pieces.length }
  const pieceTargets = pieces.map((p, i) => {
    const back = rotate(targets[i].x - final.x, targets[i].y - final.y, -theta)
    return {
      dx: (back.x / onPlate - (centres[i].x - C.x)) * local,
      dy: (back.y / onPlate - (centres[i].y - C.y)) * local,
      rotation: p.finalRotation - theta,
    }
  })

  const rest = { x: slot.left + slot.w / 2, y: slot.top + slot.h / 2 }
  const lifted = { x: rest.x, y: rest.y + (motion.lift.y / 100) * vp.h }
  const hover = { x: final.x, y: final.y - 0.08 * plate.w }
  // A gentle arc: the midpoint rides slightly higher than the straight line.
  const mid = { x: lerp(lifted.x, hover.x, 0.5), y: lerp(lifted.y, hover.y, 0.5) - 0.04 * vp.h }
  const points = [lifted, mid, hover]
  const raw = MotionPathPlugin.arrayToRawPath(points, { curviness: motion.curviness })
  return {
    rest,
    restRotation,
    lifted,
    hover,
    final,
    finalScale: onPlate / local,
    finalRotation: theta,
    points,
    raw,
    pieces: pieceTargets,
  }
}

/**
 * Keeps a moving item fully on screen: its rotated, scaled box is pushed back
 * inside the viewport (centred if it is larger than the viewport).
 */
function keepOnScreen(x: number, y: number, w: number, h: number, rotation: number, vp: Viewport) {
  const c = Math.abs(Math.cos(rad(rotation)))
  const s = Math.abs(Math.sin(rad(rotation)))
  const hw = (w * c + h * s) / 2
  const hh = (w * s + h * c) / 2
  const m = 8
  const fit = (v: number, half: number, size: number) =>
    half * 2 + m * 2 >= size ? size / 2 : Math.min(size - m - half, Math.max(m + half, v))
  return { x: fit(x, hw, vp.w), y: fit(y, hh, vp.h) }
}

export interface MoverPose {
  x: number
  y: number
  w: number
  h: number
  scale: number
  rotation: number
  metalY: number
  metalOpacity: number
}

export function computePose(p: MoverProgress, slot: Rect, plan: Plan, motion: MotionSettings, vp: Viewport): MoverPose {
  const flight = clamp01(p.flight)
  const pt = MotionPathPlugin.getPositionOnPath(plan.raw, flight) as Point

  // Blend from the resting spot into the start of the path, then from the
  // hover point down onto the plate. Each blend fades out as the next phase
  // takes over, so there is never a jump.
  const unlift = (1 - p.lift) * (1 - flight)
  let x = pt.x + unlift * (plan.rest.x - plan.lifted.x)
  let y = pt.y + unlift * (plan.rest.y - plan.lifted.y)
  const settle = clamp01(p.settle)
  x += (plan.final.x - plan.hover.x) * settle
  y += (plan.final.y - plan.hover.y) * settle

  const lifted = lerp(1, motion.lift.scale, p.lift)
  let scale = lerp(lifted, plan.finalScale * 1.03, smooth(0.15, 1, flight))
  scale = lerp(scale, plan.finalScale, settle)

  // From the resting angle on the grill to the plated angle, with a slight tilt in the air.
  const rotation =
    lerp(plan.restRotation, plan.finalRotation, smooth(0.1, 0.9, flight)) + Math.sin(Math.PI * flight) * 3

  // While travelling, never let any part of the food leave the screen.
  const travelling = smooth(0, 0.3, p.lift) * (1 - smooth(0.4, 1, settle))
  if (travelling > 0) {
    const safe = keepOnScreen(x, y, slot.w * scale, slot.h * scale, rotation, vp)
    x = lerp(x, safe.x, travelling)
    y = lerp(y, safe.y, travelling)
  }

  return {
    x,
    y,
    w: slot.w,
    h: slot.h,
    scale,
    rotation,
    // Metal slides straight down the upright image, i.e. out along the skewer.
    metalY: slot.h * 0.6 * p.slide,
    metalOpacity: 1 - smooth(0.15, 0.65, p.slide),
  }
}
