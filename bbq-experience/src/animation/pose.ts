import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import type { GrillItemLayout, PathPoint, Placement } from '../config/types'

/**
 * Pure motion maths — no DOM access.
 *
 * Every frame the engine measures the food's resting slot on the grill and
 * its destination plate on screen, then asks these functions where the food
 * should be for the current progress. The path is rebuilt from those live
 * measurements, so the motion stays glued to both while the page scrolls,
 * pins or resizes.
 */

export interface Point {
  x: number
  y: number
}

/** A measured box in viewport pixels. */
export interface Anchor {
  cx: number
  cy: number
  w: number
  h: number
}

export interface Viewport {
  w: number
  h: number
}

/** Animated progress values (0–1) for one food item, driven by the scroll timeline. */
export interface ItemProgress {
  lift: number
  flight: number
  settle: number
  slide: number
}

export const emptyItemProgress = (): ItemProgress => ({ lift: 0, flight: 0, settle: 0, slide: 0 })
export const finalItemProgress = (): ItemProgress => ({ lift: 1, flight: 1, settle: 1, slide: 1 })

export interface FoodPose {
  x: number
  y: number
  /** Element size in px at rest (scale is applied on top). */
  w: number
  h: number
  scale: number
  /** Extra horizontal scale in the element's own axes, to match the meat's thickness in the dish photo. */
  stretch: number
  rotation: number
  shadow: number
  /** Metal skewer offset along its own length (element px), and its opacity. */
  metalY: number
  metalOpacity: number
}

export interface MotionSettings {
  lift: { y: number; scale: number }
  path: { curviness: number; via: PathPoint[] }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp01((v - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const rad = (deg: number) => (deg * Math.PI) / 180

export interface FlightPlan {
  rest: Point
  restRotation: number
  lifted: Point
  hover: Point
  final: Point
  finalScale: number
  finalStretch: number
  finalRotation: number
  points: Point[]
  raw: ReturnType<typeof MotionPathPlugin.arrayToRawPath>
}

/** Rotates and scales a local offset (element px) into screen px. */
function project(dx: number, dy: number, rotation: number, scale: number): Point {
  const c = Math.cos(rad(rotation))
  const s = Math.sin(rad(rotation))
  return { x: (dx * c - dy * s) * scale, y: (dx * s + dy * c) * scale }
}

/**
 * Works out where the food rests, where it lands and the curved path between,
 * all from live measurements.
 */
export function planFlight(
  layout: GrillItemLayout,
  place: Placement,
  slot: Anchor,
  plate: Anchor,
  vp: Viewport,
  motion: MotionSettings,
): FlightPlan {
  const [x0, y0, x1, y1] = layout.box
  const toSlot = slot.h / (y1 - y0) // grill-frame px → screen px at rest

  // Final size: skewers are sized by the length of their meat, pieces by width.
  let finalScale: number
  let finalStretch = 1
  if (layout.meat && place.length) {
    const meatPx = (layout.meat[1] - layout.meat[0]) * toSlot
    finalScale = (place.length * plate.w) / Math.max(1, meatPx)
    if (place.thickness && layout.meatWidth) {
      const thickPx = layout.meatWidth * toSlot * finalScale
      finalStretch = Math.min(2.5, Math.max(0.6, (place.thickness * plate.w) / thickPx))
    }
  } else {
    finalScale = ((place.width ?? 0.8) * plate.w) / Math.max(1, (x1 - x0) * toSlot)
  }
  const finalRotation = place.rotation

  // Land the centre of the food (not the centre of the box) on the target spot.
  const [fx, fy] = layout.center ?? [0.5, 0.5]
  const local = { x: (fx - 0.5) * slot.w * finalStretch, y: (fy - 0.5) * slot.h }
  const target = { x: plate.cx + place.x * plate.w, y: plate.cy + place.y * plate.w }
  const off = project(local.x, local.y, finalRotation, finalScale)
  const final = { x: target.x - off.x, y: target.y - off.y }

  const rest = { x: slot.cx, y: slot.cy }
  const lifted = { x: rest.x, y: rest.y + (motion.lift.y / 100) * vp.h }
  const hover = { x: final.x, y: final.y - 0.12 * plate.w }
  const via = [...motion.path.via]
    .sort((a, b) => a.t - b.t)
    .map((p) => ({
      x: lerp(lifted.x, hover.x, p.t) + (p.x / 100) * vp.w,
      y: lerp(lifted.y, hover.y, p.t) + (p.y / 100) * vp.h,
    }))
  const points = [lifted, ...via, hover]
  const raw = MotionPathPlugin.arrayToRawPath(points, { curviness: motion.path.curviness })
  return {
    rest,
    restRotation: layout.axis ?? 0,
    lifted,
    hover,
    final,
    finalScale,
    finalStretch,
    finalRotation,
    points,
    raw,
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

export function computeFoodPose(
  p: ItemProgress,
  slot: Anchor,
  plan: FlightPlan,
  motion: MotionSettings,
  vp: Viewport,
): FoodPose {
  const flight = clamp01(p.flight)
  const pt = MotionPathPlugin.getPositionOnPath(plan.raw, flight) as Point

  // Blend from the resting spot into the start of the path, then from the
  // hover point down onto the plate. Each blend fades out as the next phase
  // takes over, so there is never a jump.
  const unlift = (1 - p.lift) * (1 - flight)
  let x = pt.x + unlift * (plan.rest.x - plan.lifted.x)
  let y = pt.y + unlift * (plan.rest.y - plan.lifted.y)
  const settle = Math.max(0, p.settle)
  x += (plan.final.x - plan.hover.x) * settle
  y += (plan.final.y - plan.hover.y) * settle

  const lifted = lerp(1, motion.lift.scale, p.lift)
  let scale = lerp(lifted, plan.finalScale * 1.05, smooth(0.1, 1, flight))
  scale = lerp(scale, plan.finalScale, clamp01(settle))
  const stretch = lerp(1, plan.finalStretch, smooth(0.5, 1, flight))

  // From the resting angle on the grill to the plated angle, with a gentle tilt in the air.
  const rotation =
    lerp(plan.restRotation, plan.finalRotation, smooth(0.05, 0.95, flight)) + Math.sin(Math.PI * flight) * 4

  // While travelling, never let any part of the food leave the screen.
  const travelling = smooth(0, 0.2, p.lift) * (1 - smooth(0.5, 1, settle))
  if (travelling > 0) {
    const safe = keepOnScreen(x, y, slot.w * scale * stretch, slot.h * scale, rotation, vp)
    x = lerp(x, safe.x, travelling)
    y = lerp(y, safe.y, travelling)
  }

  return {
    x,
    y,
    w: slot.w,
    h: slot.h,
    scale,
    stretch,
    rotation,
    shadow: clamp01(settle),
    // Metal slides straight down the upright image, i.e. out along the skewer.
    metalY: slot.h * 0.8 * p.slide,
    metalOpacity: 1 - smooth(0.35, 0.9, p.slide),
  }
}
