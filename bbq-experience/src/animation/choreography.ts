import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import type { GrillItemLayout, Placement, SceneConfig, Segment, SequenceStep } from '../config/types'
import {
  computeFoodPose,
  emptyItemProgress,
  finalItemProgress,
  planFlight,
  type Anchor,
  type ItemProgress,
  type Viewport,
} from './pose'

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin)

export interface ChoreographyOptions {
  scene: SceneConfig
  /** Looks up a registered element, e.g. `slot:kebab-3`, `plate:kebab`. */
  get: (key: string) => HTMLElement | undefined
  /** Optional SVG used to draw the motion paths (add ?debug to the URL). */
  debugSvg?: SVGSVGElement | null
}

interface Mover {
  step: number
  dish: string
  place: Placement
  layout: GrillItemLayout
  progress: ItemProgress
  el: HTMLElement
  metal?: HTMLElement
  shadow: HTMLElement
  slot: HTMLElement
  plate: HTMLElement
  size: { w: number; h: number }
}

interface Lid {
  el: HTMLElement
  slot: HTMLElement
  open: { v: number }
  size: { w: number; h: number }
}

const PHASE_EASE = {
  lift: 'power2.out',
  flight: 'power1.inOut',
  settle: 'power3.out',
  slide: 'power1.inOut',
} as const

const measure = (el: HTMLElement): Anchor => {
  const r = el.getBoundingClientRect()
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }
}

const sizeTo = (el: HTMLElement, size: { w: number; h: number }, w: number, h: number) => {
  if (Math.abs(size.w - w) > 0.5 || Math.abs(size.h - h) > 0.5) {
    el.style.width = `${w}px`
    el.style.height = `${h}px`
    size.w = w
    size.h = h
  }
}

/**
 * Wires the whole scroll-driven sequence: the camera pans between the grill
 * and each plate while the food transfers one dish at a time. Returns a
 * cleanup function that kills every trigger, tween and listener.
 */
export function createChoreography({ scene, get, debugSvg }: ChoreographyOptions) {
  const journey = get('journey')
  const track = get('track')
  const header = get('header')
  if (!journey || !track) return () => {}
  const { motion } = scene

  const movers: Mover[] = motion.steps.flatMap((step, i) =>
    step.items.flatMap((item, k) => {
      const el = get(`item:${item.id}`)
      const shadow = get(`shadow:${item.id}`)
      const slot = get(`slot:${item.id}`)
      const plate = get(`plate:${step.dish}`)
      const layout = scene.grillLayout.items[item.id]
      // Landing spot measured from the dish photo, unless scene.json overrides it.
      const measured = scene.dishLayout[step.dish]?.items[k]
      if (!el || !shadow || !slot || !plate || !layout || !measured) return []
      const { id: _id, ...overrides } = item
      return [{
        step: i,
        dish: step.dish,
        place: { ...measured, ...overrides },
        layout,
        progress: emptyItemProgress(),
        el,
        metal: get(`metal:${item.id}`),
        shadow,
        slot,
        plate,
        size: { w: 0, h: 0 },
      }]
    }),
  )
  const lids = new Map<string, Lid>()
  for (const step of motion.steps) {
    if (!step.lid) continue
    const el = get(`lid:${step.lid}`)
    const slot = get(`slot:${step.lid}`)
    if (el && slot) lids.set(step.lid, { el, slot, open: { v: 0 }, size: { w: 0, h: 0 } })
  }
  const dishes = scene.dishes.map((d) => ({
    id: d.id,
    visual: get(`plateVisual:${d.id}`),
    steam: get(`steam:${d.id}`),
    full: get(`full:${d.id}`),
  }))
  /** Per step: the arriving food dissolves into the complete dish photo (0–1). */
  const reveals = motion.steps.map(() => ({ v: 0 }))

  /** Camera position as a stop index: 0 grill, 1 first plate, 2 grill, 3 second plate… */
  const camera = { v: 0 }
  let cinematic = false

  const cameraStops = (vp: Viewport) => {
    const trackTop = track.getBoundingClientRect().top
    const end = Math.max(0, track.offsetHeight - vp.h)
    const stops = [0]
    motion.steps.forEach((step, i) => {
      if (i > 0) stops.push(0)
      const plate = get(`plate:${step.dish}`)
      let y = end
      if (plate) {
        const r = plate.getBoundingClientRect()
        y = r.top - trackTop + r.height / 2 - vp.h * motion.plateFocus
      }
      // The last stop must reach the end of the track so the page continues seamlessly.
      stops.push(i === motion.steps.length - 1 ? end : Math.min(end, Math.max(0, y)))
    })
    return stops
  }

  const render = () => {
    const vp = { w: window.innerWidth, h: window.innerHeight }

    // 1. Camera: pan the hero and plates together.
    let cam = 0
    if (cinematic) {
      const stops = cameraStops(vp)
      const i = Math.min(stops.length - 2, Math.floor(camera.v))
      cam = stops[i] + (stops[i + 1] - stops[i]) * (camera.v - i)
    }
    track.style.transform = cam ? `translate3d(0, ${-cam}px, 0)` : ''
    // The header lives outside the pinned journey (so food can pass under it
    // without being clipped); while cinematic it is fixed and follows the
    // journey and the camera, otherwise it simply scrolls with the page.
    if (header) {
      header.dataset.mode = cinematic ? 'cinematic' : 'static'
      header.style.transform = cinematic
        ? `translate3d(0, ${journey.getBoundingClientRect().top - cam}px, 0)`
        : ''
    }

    // 2. Read every anchor, then write every style.
    const frames = movers.map((m) => {
      const slot = measure(m.slot)
      const plate = measure(m.plate)
      const plan = planFlight(m.layout, m.place, slot, plate, vp, motion)
      return { m, plan, pose: computeFoodPose(m.progress, slot, plan, motion, vp) }
    })
    const lidFrames = [...lids.values()].map((l) => ({ l, slot: measure(l.slot) }))

    let debug = ''
    for (const { m, plan, pose } of frames) {
      sizeTo(m.el, m.size, pose.w, pose.h)
      m.el.style.transform =
        `translate3d(${pose.x}px, ${pose.y}px, 0) translate(-50%, -50%) ` +
        `rotate(${pose.rotation}deg) scale(${pose.scale * pose.stretch}, ${pose.scale})`
      m.el.dataset.state = m.progress.lift > 0.001 ? 'moving' : 'resting'
      const reveal = reveals[m.step].v
      m.el.style.opacity = String(1 - reveal)
      m.el.style.visibility = reveal >= 0.999 ? 'hidden' : 'visible'
      m.shadow.style.opacity = String(pose.shadow)
      if (m.metal) {
        m.metal.style.transform = `translate3d(0, ${pose.metalY}px, 0)`
        m.metal.style.opacity = String(pose.metalOpacity)
        m.metal.style.visibility = pose.metalOpacity <= 0.001 ? 'hidden' : 'visible'
      }
      if (debugSvg) {
        debug +=
          `<path d="${MotionPathPlugin.rawPathToString(plan.raw)}" />` +
          plan.points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4" />`).join('') +
          `<circle class="end" cx="${plan.final.x}" cy="${plan.final.y}" r="5" />`
      }
    }
    for (const { l, slot } of lidFrames) {
      sizeTo(l.el, l.size, slot.w, slot.h)
      l.el.style.transform =
        `translate3d(${slot.cx}px, ${slot.cy}px, 0) translate(-50%, -50%) ` +
        `perspective(${slot.h * 1.6}px) rotateX(${l.open.v * motion.lidAngle}deg)`
      // Once it stands up at the far edge, the lid is behind the food rather than over it.
      l.el.style.zIndex = l.open.v > 0.45 ? '0' : '2'

    }
    for (const d of dishes) {
      const own = movers.filter((m) => m.dish === d.id)
      const settle = own.length ? Math.min(...own.map((m) => Math.min(1, Math.max(0, m.progress.settle)))) : 0
      const step = motion.steps.findIndex((s) => s.dish === d.id)
      const reveal = step >= 0 ? reveals[step].v : 1
      if (d.visual) d.visual.style.transform = `scale(${1 - 0.018 * Math.sin(Math.PI * settle)})`
      if (d.steam) d.steam.style.opacity = String(settle)
      if (d.full) d.full.style.opacity = String(reveal)
    }
    if (debugSvg) debugSvg.innerHTML = debug
  }

  const addSegment = (tl: gsap.core.Timeline, target: object, vars: gsap.TweenVars, seg: Segment, offset = 0) => {
    const start = Math.min(0.999, Math.max(0, seg[0] + offset))
    const end = Math.min(1, Math.max(start + 0.001, seg[1] + offset))
    tl.to(target, { ...vars, duration: end - start }, start)
  }

  const addStep = (tl: gsap.core.Timeline, step: SequenceStep, index: number) => {
    const { timing } = step
    if (timing.return) addSegment(tl, camera, { v: index * 2, ease: 'power2.inOut' }, timing.return)
    addSegment(tl, camera, { v: index * 2 + 1, ease: 'power2.inOut' }, timing.flight)
    const lid = step.lid ? lids.get(step.lid) : undefined
    if (lid && timing.open) addSegment(tl, lid.open, { v: 1, ease: 'power2.inOut' }, timing.open)
    movers
      .filter((m) => m.step === index)
      .forEach((m, k) => {
        const offset = k * step.stagger
        ;(['lift', 'flight', 'settle', 'slide'] as const).forEach((phase) => {
          const seg = timing[phase]
          if (seg) addSegment(tl, m.progress, { [phase]: 1, ease: PHASE_EASE[phase] }, seg, offset)
        })
      })
    if (timing.reveal) addSegment(tl, reveals[index], { v: 1, ease: 'power1.inOut' }, timing.reveal)
  }

  const onNavClick = (e: MouseEvent) => {
    const link = (e.target as Element | null)?.closest?.('a[href="#menu"]')
    if (!link || !cinematic) return
    // The menu sits inside the pinned sequence: jump to the end, where every dish is plated.
    const st = ScrollTrigger.getById('journey')
    if (!st) return
    e.preventDefault()
    window.scrollTo({ top: st.end, behavior: 'smooth' })
  }

  const mm = gsap.matchMedia()
  mm.add(
    {
      // matchMedia only runs the setup when at least one query matches,
      // so every combination is listed explicitly.
      isDesktop: '(min-width: 768px)',
      isMobile: '(max-width: 767px)',
      reduceMotion: '(prefers-reduced-motion: reduce)',
    },
    (ctx) => {
      const { isDesktop, reduceMotion } = ctx.conditions as { isDesktop: boolean; reduceMotion: boolean }

      if (reduceMotion) {
        // Static plated layout: every dish already on its plate, no pinning or camera.
        cinematic = false
        journey.dataset.mode = 'static'
        movers.forEach((m) => Object.assign(m.progress, finalItemProgress()))
        reveals.forEach((r) => (r.v = 1))
        // The empty basket stays closed on the grill.
        lids.forEach((l) => (l.open.v = 0))
        camera.v = 0
        return
      }

      cinematic = true
      journey.dataset.mode = 'cinematic'
      movers.forEach((m) => Object.assign(m.progress, emptyItemProgress()))
      reveals.forEach((r) => (r.v = 0))
      lids.forEach((l) => (l.open.v = 0))
      camera.v = 0

      const length = isDesktop ? motion.scrollLength.desktop : motion.scrollLength.mobile
      const tl = gsap.timeline({
        scrollTrigger: {
          id: 'journey',
          trigger: journey,
          start: 'top top',
          end: () => `+=${window.innerHeight * length}`,
          pin: true,
          scrub: motion.scrub > 0 ? motion.scrub : true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      })
      motion.steps.forEach((step, i) => addStep(tl, step, i))
      // Lock the timeline length to exactly 1 so segment values map 1:1 to scroll progress.
      tl.add(() => {}, 1)

      return () => {
        cinematic = false
        journey.dataset.mode = 'static'
      }
    },
  )

  gsap.ticker.add(render)
  document.addEventListener('click', onNavClick)
  const onLoad = () => ScrollTrigger.refresh()
  window.addEventListener('load', onLoad)
  requestAnimationFrame(() => ScrollTrigger.refresh())

  return () => {
    gsap.ticker.remove(render)
    document.removeEventListener('click', onNavClick)
    window.removeEventListener('load', onLoad)
    mm.revert()
    track.style.transform = ''
    if (header) header.style.transform = ''
  }
}
