/**
 * Scene configuration schema.
 *
 * Everything a designer may want to tune lives here — image paths, layout
 * positions and motion settings. The animation engine only reads these
 * values; it never hard-codes them. The default values live in
 * `public/config/scene.json` and the Animation Studio (phase 4) will
 * write overrides with the same shape.
 */

/** [start, end] as a fraction (0–1) of a skewer's scroll range. */
export type Segment = [number, number]

export interface Timing {
  /** Skewer detaches, lifts and zooms to its peak scale. */
  lift: Segment
  /** Skewer travels along its curved path to the hover point above the plate. */
  flight: Segment
  /** Skewer slides sideways, as if pulled out from the meat. */
  pull: Segment
  /** Skewer fades out. */
  fade: Segment
  /** Finished dish fades in over the empty plate. */
  reveal: Segment
  /** Dish settles and steam appears. */
  settle: Segment
}

export interface PathPoint {
  /** Position between the lifted start (0) and the hover point (1). */
  t: number
  /** Horizontal offset in % of viewport width. */
  x: number
  /** Vertical offset in % of viewport height (negative = up). */
  y: number
}

export interface SkewerConfig {
  id: string
  /** When false the skewer stays on the grill (used while building phase by phase). */
  animate: boolean
  /** Shifts this skewer's timing to stagger it against the others. */
  timingOffset: number
  images: {
    skewer: string
    plateEmpty: string
    plateDish: string
  }
  dish: {
    name: string
    description: string
    price: string
  }
  /** Resting position on the grill, in % of the grill image. */
  grill: { x: number; y: number; width: number; rotation: number }
  lift: {
    /** Lift offset in % of viewport width / height. */
    x: number
    y: number
    /** Scale reached at the top of the lift (1.2 = 120 %). */
    peakScale: number
    /** Extra rotation in degrees at the top of the lift. */
    tilt: number
  }
  path: {
    /** 0 = straight lines, ~1–1.5 = smooth arcs. */
    curviness: number
    via: PathPoint[]
  }
  arrival: {
    /** Hover offset from the plate centre, as a fraction of plate width. */
    x: number
    y: number
    /** Skewer width on arrival, as a fraction of plate width. */
    width: number
    rotation: number
    /** Gentle mid-flight sway in degrees. */
    sway: number
  }
  pull: {
    /** Sideways travel as a fraction of plate width (negative = to the left). */
    distance: number
    /** Vertical drift during the pull, as a fraction of plate width. */
    rise: number
    tilt: number
  }
  /** Optional overrides applied on screens narrower than 768 px. */
  mobile?: SkewerOverrides
}

/** Layout and motion groups that can be overridden per breakpoint. */
export type SkewerOverrides = {
  [K in 'grill' | 'lift' | 'path' | 'arrival' | 'pull']?: Partial<SkewerConfig[K]>
}

export interface SceneConfig {
  version: number
  assets: { grill: string }
  hero: { eyebrow: string; title: string; subtitle: string }
  platesSection: { title: string; subtitle: string }
  motion: {
    /** Scroll smoothing in seconds (true/0 = locked to the scrollbar). */
    scrub: number
    /** How long the plates stay pinned on desktop, in viewport heights. */
    pinLength: number
    /** Mobile: the animation completes when the plate centre reaches this fraction of the viewport height. */
    mobileEndOffset: number
    timing: Timing
  }
  skewers: SkewerConfig[]
}
