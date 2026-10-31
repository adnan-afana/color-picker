import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import type { SkewerConfig } from '../config/types'

/**
 * Pure motion maths — no DOM access.
 *
 * Every frame the engine measures the live grill slot and plate on screen,
 * then asks these functions where the skewer and dish should be for the
 * current animation progress. Because the path is rebuilt from live
 * measurements, the motion stays glued to both sections while they scroll,
 * pin or resize, with no cached pixel values to go stale.
 */

export interface Point {
  x: number
  y: number
}

/** A measured anchor in viewport pixels. */
export interface Anchor {
  cx: number
  cy: number
  w: number
}

export interface Viewport {
  w: number
  h: number
}

/** Animated progress values (0–1) driven by the scroll timeline. */
export interface Progress {
  lift: number
  flight: number
  pull: number
  fade: number
  reveal: number
  settle: number
}

export const emptyProgress = (): Progress => ({
  lift: 0,
  flight: 0,
  pull: 0,
  fade: 0,
  reveal: 0,
  settle: 0,
})

export interface SkewerPose {
  x: number
  y: number
  /** Rendered width of the element in px (scale is applied on top). */
  width: number
  scale: number
  rotation: number
  opacity: number
}

export interface PlatePose {
  dishOpacity: number
  dishScale: number
  dishY: number
  plateScale: number
  steam: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp01((v - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

export interface FlightPath {
  start: Point
  lifted: Point
  hover: Point
  points: Point[]
  raw: ReturnType<typeof MotionPathPlugin.arrayToRawPath>
}

/** Builds the curved flight path from the live slot and plate anchors. */
export function buildFlightPath(cfg: SkewerConfig, slot: Anchor, plate: Anchor, vp: Viewport): FlightPath {
  const start = { x: slot.cx, y: slot.cy }
  const lifted = {
    x: start.x + (cfg.lift.x / 100) * vp.w,
    y: start.y + (cfg.lift.y / 100) * vp.h,
  }
  const hover = {
    x: plate.cx + cfg.arrival.x * plate.w,
    y: plate.cy + cfg.arrival.y * plate.w,
  }
  const via = [...cfg.path.via]
    .sort((a, b) => a.t - b.t)
    .map((p) => ({
      x: lerp(lifted.x, hover.x, p.t) + (p.x / 100) * vp.w,
      y: lerp(lifted.y, hover.y, p.t) + (p.y / 100) * vp.h,
    }))
  const points = [lifted, ...via, hover]
  const raw = MotionPathPlugin.arrayToRawPath(points, { curviness: cfg.path.curviness })
  return { start, lifted, hover, points, raw }
}

export function computeSkewerPose(
  cfg: SkewerConfig,
  p: Progress,
  slot: Anchor,
  plate: Anchor,
  path: FlightPath,
): SkewerPose {
  const pt = MotionPathPlugin.getPositionOnPath(path.raw, clamp01(p.flight)) as Point

  // Blend from the resting spot on the grill into the start of the path.
  // At flight = 0 this is a straight lift; it vanishes as the flight begins,
  // so there is never a jump between the two phases.
  const unlift = (1 - p.lift) * (1 - clamp01(p.flight))
  let x = pt.x + unlift * (path.start.x - path.lifted.x)
  let y = pt.y + unlift * (path.start.y - path.lifted.y)

  // Scale: grow to the peak while lifting, then shrink to plate size on approach.
  const arrivalScale = (plate.w * cfg.arrival.width) / Math.max(1, slot.w)
  const lifted = lerp(1, cfg.lift.peakScale, p.lift)
  let scale = lerp(lifted, arrivalScale, smooth(0.2, 1, p.flight))

  // Rotation: tilt on lift, ease to the arrival angle, with a gentle sway in between.
  const bell = Math.sin(Math.PI * clamp01(p.flight))
  let rotation =
    cfg.grill.rotation +
    cfg.lift.tilt * p.lift * (1 - smooth(0, 0.6, p.flight)) +
    (cfg.arrival.rotation - cfg.grill.rotation) * smooth(0.15, 1, p.flight) +
    Math.sin(p.flight * Math.PI * 2) * cfg.arrival.sway * bell

  // Pull: slide sideways out of the meat.
  x += p.pull * cfg.pull.distance * plate.w
  y += p.pull * cfg.pull.rise * plate.w
  rotation += p.pull * cfg.pull.tilt
  scale *= 1 - p.pull * 0.03

  return { x, y, width: slot.w, scale, rotation, opacity: 1 - clamp01(p.fade) }
}

export function computePlatePose(p: Progress): PlatePose {
  const reveal = clamp01(p.reveal)
  return {
    dishOpacity: reveal,
    dishScale: 1.04 - 0.04 * reveal,
    // settle uses an overshooting ease, so it may exceed 1 briefly — intended.
    dishY: (1 - p.settle) * -10 * reveal,
    plateScale: 1 - 0.018 * Math.sin(Math.PI * clamp01(p.settle)),
    steam: clamp01(p.settle),
  }
}
