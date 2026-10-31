import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import type { SceneConfig, SkewerConfig, SkewerOverrides, Timing } from '../config/types'
import {
  buildFlightPath,
  computePlatePose,
  computeSkewerPose,
  emptyProgress,
  type Anchor,
  type Progress,
} from './pose'

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin)

/** DOM nodes the engine drives for one skewer → plate pair. */
export interface SkewerElements {
  /** The flying skewer image (lives in the fixed overlay layer). */
  skewer: HTMLElement
  /** Invisible marker on the grill where the skewer rests. */
  slot: HTMLElement
  /** Plate wrapper — measured, never transformed. */
  plate: HTMLElement
  /** Plate visual (empty plate + dish) — scaled during the settle. */
  plateVisual: HTMLElement
  dish: HTMLElement
  steam: HTMLElement
}

export interface ChoreographyOptions {
  scene: SceneConfig
  elements: (id: string) => SkewerElements | undefined
  platesSection: HTMLElement
  /** Optional SVG used to draw the motion paths (add ?debug to the URL). */
  debugSvg?: SVGSVGElement | null
}

const EASES: Record<keyof Timing, string> = {
  lift: 'power2.out',
  flight: 'power1.inOut',
  pull: 'power2.in',
  fade: 'power1.in',
  reveal: 'power2.out',
  settle: 'back.out(2.2)',
}

const PHASES = Object.keys(EASES) as (keyof Timing)[]

interface SkewerState {
  cfg: SkewerConfig
  els: SkewerElements
  progress: Progress
  width: number
}

/** Applies breakpoint overrides group by group (e.g. only `arrival.width`). */
function resolveConfig(base: SkewerConfig, overrides: SkewerOverrides | undefined): SkewerConfig {
  if (!overrides) return base
  const out = { ...base }
  ;(Object.keys(overrides) as (keyof SkewerOverrides)[]).forEach((key) => {
    Object.assign((out[key] = { ...base[key] } as never), overrides[key])
  })
  return out
}

const measure = (el: HTMLElement): Anchor => {
  const r = el.getBoundingClientRect()
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width }
}

/** Adds one tween per motion phase to a timeline normalised to a 0–1 duration. */
function addPhases(tl: gsap.core.Timeline, progress: Progress, timing: Timing, offset: number) {
  PHASES.forEach((key) => {
    const [a, b] = timing[key]
    const start = Math.min(0.999, Math.max(0, a + offset))
    const end = Math.min(1, Math.max(start + 0.001, b + offset))
    tl.to(progress, { [key]: 1, duration: end - start, ease: EASES[key] }, start)
  })
  // Lock the timeline length to exactly 1 so segment values map 1:1 to scroll progress.
  tl.add(() => {}, 1)
}

/**
 * Wires the whole scroll-driven sequence. Returns a cleanup function that
 * kills every trigger, tween and listener and restores the DOM.
 */
export function createChoreography({ scene, elements, platesSection, debugSvg }: ChoreographyOptions) {
  const states: SkewerState[] = scene.skewers.flatMap((cfg) => {
    const els = elements(cfg.id)
    return els ? [{ cfg, els, progress: emptyProgress(), width: 0 }] : []
  })

  let dirty = true
  const markDirty = () => {
    dirty = true
  }
  let lastSignature = ''

  /** Read every anchor first, then write every style — no layout thrashing. */
  const render = () => {
    const vp = { w: window.innerWidth, h: window.innerHeight }
    const signature =
      `${window.scrollY}|${vp.w}|${vp.h}|` +
      states.map((s) => PHASES.map((k) => s.progress[k].toFixed(4)).join(',')).join(';')
    if (!dirty && signature === lastSignature) return
    lastSignature = signature
    dirty = false

    const frames = states.map((s) => {
      const slot = measure(s.els.slot)
      const plate = measure(s.els.plate)
      const path = buildFlightPath(s.cfg, slot, plate, vp)
      return {
        s,
        path,
        skewer: computeSkewerPose(s.cfg, s.progress, slot, plate, path),
        plate: computePlatePose(s.progress),
      }
    })

    let debug = ''
    for (const { s, path, skewer, plate } of frames) {
      const { els } = s
      if (Math.abs(s.width - skewer.width) > 0.5) {
        els.skewer.style.width = `${skewer.width}px`
        s.width = skewer.width
      }
      els.skewer.style.transform =
        `translate3d(${skewer.x}px, ${skewer.y}px, 0) translate(-50%, -50%) ` +
        `rotate(${skewer.rotation}deg) scale(${skewer.scale})`
      els.skewer.style.opacity = String(skewer.opacity)
      els.skewer.style.visibility = skewer.opacity <= 0.001 ? 'hidden' : 'visible'
      // Lift the skewer above everything once it leaves the grill.
      els.skewer.dataset.state = s.progress.lift > 0.001 ? 'flying' : 'resting'

      els.dish.style.opacity = String(plate.dishOpacity)
      els.dish.style.transform = `translate3d(0, ${plate.dishY}px, 0) scale(${plate.dishScale})`
      els.plateVisual.style.transform = `scale(${plate.plateScale})`
      els.steam.style.opacity = String(plate.steam)

      if (debugSvg && s.cfg.animate) {
        debug +=
          `<path d="${MotionPathPlugin.rawPathToString(path.raw)}" />` +
          path.points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5" />`).join('') +
          `<circle class="start" cx="${path.start.x}" cy="${path.start.y}" r="6" />`
      }
    }
    if (debugSvg) debugSvg.innerHTML = debug
  }

  const mm = gsap.matchMedia()
  mm.add(
    {
      // matchMedia only runs the setup when at least one query matches,
      // so desktop and mobile are both listed explicitly.
      isDesktop: '(min-width: 768px)',
      isMobile: '(max-width: 767px)',
      reduceMotion: '(prefers-reduced-motion: reduce)',
    },
    (ctx) => {
      const { isDesktop, reduceMotion } = ctx.conditions as { isDesktop: boolean; reduceMotion: boolean }
      states.forEach((s, i) => {
        const base = scene.skewers.find((c) => c.id === s.cfg.id) ?? s.cfg
        states[i].cfg = isDesktop ? base : resolveConfig(base, base.mobile)
        Object.assign(s.progress, emptyProgress())
      })

      if (reduceMotion) {
        // No travelling motion: skewers stay on the grill, dishes simply fade in when in view.
        states.forEach((s) => {
          gsap.to(s.progress, {
            reveal: 1,
            settle: 1,
            duration: 0.6,
            ease: 'power1.out',
            onUpdate: markDirty,
            scrollTrigger: {
              trigger: s.els.plate,
              start: 'top 75%',
              toggleActions: 'play none none reverse',
            },
          })
        })
        return
      }

      const { motion } = scene
      const pin = isDesktop
        ? ScrollTrigger.create({
            trigger: platesSection,
            start: 'top top',
            end: () => `+=${window.innerHeight * motion.pinLength}`,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          })
        : null

      states
        .filter((s) => s.cfg.animate)
        .forEach((s) => {
          const tl = gsap.timeline({
            defaults: { overwrite: false },
            onUpdate: markDirty,
            scrollTrigger: {
              start: 0,
              end: () => {
                if (pin) return pin.end
                // Mobile: finish once this plate's centre reaches the configured viewport height.
                const r = s.els.plate.getBoundingClientRect()
                const centre = r.top + window.scrollY + r.height / 2
                return Math.max(1, centre - window.innerHeight * motion.mobileEndOffset)
              },
              scrub: motion.scrub > 0 ? motion.scrub : true,
              invalidateOnRefresh: true,
            },
          })
          addPhases(tl, s.progress, motion.timing, s.cfg.timingOffset)
        })

      return () => {
        states.forEach((s) => Object.assign(s.progress, emptyProgress()))
        markDirty()
      }
    },
  )

  const onRefresh = () => markDirty()
  ScrollTrigger.addEventListener('refresh', onRefresh)
  window.addEventListener('resize', onRefresh)
  gsap.ticker.add(render)
  // Images can settle layout after first paint.
  const onLoad = () => ScrollTrigger.refresh()
  window.addEventListener('load', onLoad)
  requestAnimationFrame(() => ScrollTrigger.refresh())

  return () => {
    gsap.ticker.remove(render)
    ScrollTrigger.removeEventListener('refresh', onRefresh)
    window.removeEventListener('resize', onRefresh)
    window.removeEventListener('load', onLoad)
    mm.revert()
  }
}
