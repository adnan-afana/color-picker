/**
 * Scene configuration schema.
 *
 * Everything a designer may want to tune lives here: image paths, layout
 * positions and motion settings. The animation engine only reads these
 * values; it never hard-codes them.
 *
 *  - `public/config/scene.json`       copy, images, dishes and the scroll sequence
 *  - `public/config/grill-items.json` where each cut-out sits on the grill photo
 *                                     (written by tools/prepare_grill_items.py)
 */

/** [start, end] as a fraction (0–1) of the pinned scroll. */
export type Segment = [number, number]

export interface PathPoint {
  /** Position between the lifted start (0) and the hover point above the plate (1). */
  t: number
  /** Horizontal offset in % of viewport width. */
  x: number
  /** Vertical offset in % of viewport height (negative = up). */
  y: number
}

/** Where a food item ends up on its plate. Offsets are fractions of the plate width. */
export interface Placement {
  id: string
  x: number
  y: number
  /** Skewers: direction of the meat on the plate in degrees (0 = handle pointing down). Chicken: rotation. */
  rotation: number
  /** Skewers: length of the meat as a fraction of the plate width. */
  length?: number
  /** Whole pieces (chicken): width as a fraction of the plate width. */
  width?: number
}

export interface StepTiming {
  /** Camera pans back up to the grill (not needed for the first step). */
  return?: Segment
  /** Basket lid opens (half chicken only). */
  open?: Segment
  /** Food lifts slightly off the grill. */
  lift: Segment
  /** Food travels to its plate while the camera follows it down. */
  flight: Segment
  /** Food settles onto the plate. */
  settle: Segment
  /** Metal skewers slide out of the meat. */
  slide?: Segment
}

export interface SequenceStep {
  dish: string
  items: Placement[]
  /** Delay between items in the same step, as a fraction of the scroll. */
  stagger: number
  /** Id of the basket lid that opens before the food lifts. */
  lid?: string
  timing: StepTiming
}

export interface Dish {
  id: string
  name: string
  description: string
  price: string
  plate: string
}

export interface GrillItemLayout {
  /** [x0, y0, x1, y1] in pixels of the grill photo frame. */
  box: [number, number, number, number]
  /** Centre of the food as a fraction of the box. */
  center?: [number, number]
  /** Skewers: rows of the box occupied by meat [top, bottom] in px. */
  meat?: [number, number]
  /** Skewers: direction tip → handle in CSS degrees (0 = straight down). */
  axis?: number
}

export interface GrillLayout {
  frame: { width: number; height: number }
  items: Record<string, GrillItemLayout>
}

export type GrillItemKind = 'skewer' | 'piece' | 'lid' | 'prop'

export interface GrillItem {
  id: string
  kind: GrillItemKind
  /** Skewers have `food` and `metal`; pieces have `food`; lids and props have `image`. */
  images: { food?: string; metal?: string; image?: string }
  alt?: string
}

export interface SceneConfig {
  version: number
  assets: {
    /** Hero background photo (clean grill, no food). */
    grill: string
    /** Flames-only transparent layer, same size as the grill photo (used for the flicker). */
    flames: string
    logo: string
  }
  hero: {
    headline: string
    logoAlt: string
    /** Header links: an in-page anchor (#menu) or a full URL. */
    nav: { label: string; href: string }[]
    order: { label: string; href: string }
  }
  platesSection: { title: string; subtitle: string }
  /** Every cut-out on the grill, painted back to front. */
  grillItems: GrillItem[]
  dishes: Dish[]
  motion: {
    /** Scroll smoothing in seconds (0 = locked to the scrollbar). */
    scrub: number
    /** Length of the pinned sequence, in viewport heights. */
    scrollLength: { desktop: number; mobile: number }
    /** Where the camera frames each plate: plate centre at this fraction of the viewport height. */
    plateFocus: number
    lift: {
      /** Rise off the grill in % of viewport height (negative = up). */
      y: number
      scale: number
    }
    path: { curviness: number; via: PathPoint[] }
    /** Lid opening angle in degrees. */
    lidAngle: number
    steps: SequenceStep[]
  }
  /** Filled in at load time from grill-items.json. */
  grillLayout: GrillLayout
}
