/**
 * Scene configuration schema.
 *
 * Everything a designer may want to tune lives here: copy, image paths and
 * motion settings. The animation engine only reads these values.
 *
 *  - `public/config/scene.json`       copy, dishes, grill items and the scroll timeline
 *  - `public/config/grill-items.json` where each layer sits on the grill photo
 *  - `public/config/food-layout.json` the moving food (pieces cut from the dish photos)
 *                                     and each plate's images
 *  (the last two are written by tools/prepare_supplied_food.py and tools/prepare_basket.py)
 */

/** [start, end] as a fraction (0–1) of the pinned scroll. */
export type Segment = [number, number]

/** One shared timeline: every dish is assembled during the same downward scroll. */
export interface Timeline {
  /** The hero headline fades so food never passes over it. */
  headline: Segment
  /** The basket lid opens. */
  open: Segment
  /** Food lifts off the grill. */
  lift: Segment
  /** Food travels to its plate while the view moves down to the dishes. */
  flight: Segment
  /** Food settles onto the rice. */
  settle: Segment
  /** Metal skewers slide out of the meat. */
  slide: Segment
  /** Skewer pieces fan out to where they lie in the dish photo. */
  spread: Segment
  /** The landed food is handed over to the plate image (pixel-identical, so nothing changes). */
  handoff: Segment
}

export interface Dish {
  id: string
  name: string
  /** Optional: only shown when supplied by the restaurant. */
  description?: string
  price?: string
}

export type GrillItemKind = 'skewer' | 'mover' | 'lid' | 'prop'

export interface GrillItem {
  id: string
  /**
   * skewer: stays on the grill (food + metal images);
   * mover: travels to a plate (images in food-layout.json);
   * lid: the basket lid that opens; prop: anything else that stays.
   */
  kind: GrillItemKind
  images?: { food?: string; metal?: string; image?: string }
  alt?: string
}

export interface GrillItemLayout {
  /** [x0, y0, x1, y1] in pixels of the grill photo frame (before rotation). */
  box: [number, number, number, number]
  /** Rotation of the (upright) image as it rests on the grill, in CSS degrees. */
  axis?: number
}

export interface GrillLayout {
  frame: { width: number; height: number }
  items: Record<string, GrillItemLayout>
}

/** A piece of protein cut from a dish photo. */
export interface FoodPiece {
  src: string
  /** Where it sits in the mover's canvas while on the skewer: [x, y, w, h] in canvas px. */
  rect: [number, number, number, number]
  /** Its centre in the dish photo, in plate-image px. */
  final: [number, number]
  /** Its rotation in the dish photo, in CSS degrees. */
  finalRotation: number
}

export interface Mover {
  dish: string
  /** Canvas size in px; the metal image and piece rects use this space. */
  canvas: [number, number]
  /** Skewer metal (tip, rod, handle) on the same canvas, or null. */
  metal: string | null
  /** Rotation of the whole mover once it lies on the plate. */
  rotation: number
  /** Plate-image px per canvas px (1 when cut from the dish photo itself). */
  plateScale?: number
  pieces: FoodPiece[]
}

export interface PlateImages {
  /** Size of the plate images in px (all three share it). */
  size: [number, number]
  /** The dish with only the arriving protein removed. */
  base: string
  /** The untouched restaurant photo, shown in owner mode for comparison. */
  reference: string
}

export interface FoodLayout {
  plates: Record<string, PlateImages>
  movers: Record<string, Mover>
}

/** Owner-mode image adjustment, applied on top of the image's normal placement. */
export interface Adjust {
  scale: number
  /** Offsets as a fraction of the image box. */
  x: number
  y: number
  rotation: number
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
  platesSection: { title: string }
  closing: { title: string; button: string }
  /** Every layer on the grill, painted back to front. */
  grillItems: GrillItem[]
  /** Left to right, matching the food on the grill. */
  dishes: Dish[]
  motion: {
    /** Scroll smoothing in seconds (0 = locked to the scrollbar). */
    scrub: number
    /** Length of the pinned transition, in viewport heights. */
    scrollLength: { desktop: number; mobile: number }
    lift: {
      /** Rise off the grill in % of viewport height (negative = up). */
      y: number
      scale: number
    }
    /** 0 = straight lines, ~0.5 = gentle arcs. */
    curviness: number
    /** Small delay between movers so they don't move as one block. */
    stagger: number
    /** Lid opening angle in degrees. */
    lidAngle: number
    timeline: Timeline
  }
  /** Filled in at load time. */
  grillLayout: GrillLayout
  food: FoodLayout
  /** Owner-mode overrides active on this device (never part of the published files). */
  local?: LocalOverrides
}

/** Images and adjustments saved by owner mode in this browser only. */
export interface LocalOverrides {
  /** Replacement image (object URL) per asset key. */
  images: Record<string, string>
  adjust: Record<string, Adjust>
}
