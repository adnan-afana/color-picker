import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import type { FoodPiece, Mover, SceneConfig, Segment } from '../config/types'
import { moverPieces } from '../food'
import {
  computePose,
  emptyProgress,
  finalProgress,
  planMover,
  type MoverProgress,
  type Rect,
} from './pose'

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin)

export interface ChoreographyOptions {
  scene: SceneConfig
  /** Looks up a registered element, e.g. `slot:kebab-3`, `plate:kebab`. */
  get: (key: string) => HTMLElement | undefined
  /** Optional SVG used to draw the motion paths (add ?debug to the URL). */
  debugSvg?: SVGSVGElement | null
}

interface MoverState {
  id: string
  mover: Mover
  pieces: FoodPiece[]
  restRotation: number
  progress: MoverProgress
  el: HTMLElement
  metal?: HTMLElement
  pieceEls: HTMLElement[]
  slot: HTMLElement
  plate: HTMLElement
  size: { w: number; h: number }
}

const EASE = {
  lift: 'power2.out',
  flight: 'power1.inOut',
  settle: 'power2.out',
  slide: 'power1.inOut',
  spread: 'power2.inOut',
} as const

const measure = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, w: r.width, h: r.height }
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
 * Wires the scroll-driven transition: one downward scroll moves the view from
 * the grill to the dishes while all three food groups travel to their plates
 * together. Returns a cleanup function that kills every trigger and listener.
 */
export function createChoreography({ scene, get, debugSvg }: ChoreographyOptions) {
  const journey = get('journey')
  const track = get('track')
  const header = get('header')
  const headline = get('headline')
  if (!journey || !track) return () => {}
  const { motion } = scene
  const t = motion.timeline

  const movers: MoverState[] = Object.entries(scene.food.movers).flatMap(([id, mover]) => {
    const el = get(`item:${id}`)
    const slot = get(`slot:${id}`)
    const plate = get(`plate:${mover.dish}`)
    const pieces = moverPieces(scene, mover)
    const pieceEls = pieces.map((_, i) => get(`piece:${id}:${i}`))
    if (!el || !slot || !plate || pieceEls.some((p) => !p)) return []
    return [{
      id,
      mover,
      pieces,
      restRotation: scene.grillLayout.items[id]?.axis ?? 0,
      progress: emptyProgress(),
      el,
      metal: get(`metal:${id}`),
      pieceEls: pieceEls as HTMLElement[],
      slot,
      plate,
      size: { w: 0, h: 0 },
    }]
  })
  const lids = scene.grillItems
    .filter((g) => g.kind === 'lid')
    .flatMap((g) => {
      const el = get(`lid:${g.id}`)
      const slot = get(`slot:${g.id}`)
      return el && slot ? [{ el, slot, size: { w: 0, h: 0 } }] : []
    })
  const dishes = scene.dishes.map((d) => ({
    id: d.id,
    landed: get(`landed:${d.id}`),
    visual: get(`plateVisual:${d.id}`),
    steam: get(`steam:${d.id}`),
  }))
  const plateImgOf = (dish: string) => scene.food.plates[dish]?.size ?? ([1, 1] as [number, number])

  /** Shared progress values driven by the one timeline. */
  const state = { camera: 0, lid: 0, headline: 0, handoff: 0 }
  let cinematic = false

  const render = () => {
    const vp = { w: window.innerWidth, h: window.innerHeight }

    // 1. The view moves from the grill (0) down to the dishes (end of the track) — only ever down.
    const end = Math.max(0, track.offsetHeight - vp.h)
    const cam = cinematic ? end * state.camera : 0
    track.style.transform = cam ? `translate3d(0, ${-cam}px, 0)` : ''
    // The header lives outside the pinned journey (so food can pass under it
    // without being clipped); while cinematic it is fixed and follows the
    // journey and the view, otherwise it simply scrolls with the page.
    if (header) {
      header.dataset.mode = cinematic ? 'cinematic' : 'static'
      header.style.transform = cinematic ? `translate3d(0, ${journey.getBoundingClientRect().top - cam}px, 0)` : ''
    }
    if (headline) headline.style.opacity = String(1 - state.headline)

    // 2. Read every anchor, then write every style.
    const frames = movers.map((m) => {
      const slot = measure(m.slot)
      const plate = measure(m.plate)
      const plan = planMover(m.mover, m.pieces, slot, m.restRotation, plate, plateImgOf(m.mover.dish), vp, motion)
      return { m, plan, pose: computePose(m.progress, slot, plan, motion, vp) }
    })
    const lidFrames = lids.map((l) => ({ l, slot: measure(l.slot) }))

    let debug = ''
    for (const { m, plan, pose } of frames) {
      sizeTo(m.el, m.size, pose.w, pose.h)
      m.el.style.transform =
        `translate3d(${pose.x}px, ${pose.y}px, 0) translate(-50%, -50%) ` +
        `rotate(${pose.rotation}deg) scale(${pose.scale})`
      // Once the plate shows the landed food, the moving copy steps aside.
      m.el.style.visibility = state.handoff >= 0.999 ? 'hidden' : 'visible'
      if (m.metal) {
        m.metal.style.transform = `translate3d(0, ${pose.metalY}px, 0)`
        m.metal.style.opacity = String(pose.metalOpacity)
        m.metal.style.visibility = pose.metalOpacity <= 0.001 ? 'hidden' : 'visible'
      }
      const s = m.progress.spread
      m.pieceEls.forEach((el, i) => {
        const target = plan.pieces[i]
        el.style.transform = s
          ? `translate3d(${target.dx * s}px, ${target.dy * s}px, 0) rotate(${target.rotation * s}deg)`
          : ''
      })
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
        `translate3d(${slot.left + slot.w / 2}px, ${slot.top + slot.h / 2}px, 0) translate(-50%, -50%) ` +
        `perspective(${slot.h * 1.6}px) rotateX(${state.lid * motion.lidAngle}deg)`
      // Once it stands up at the far edge, the lid is behind the food rather than over it.
      l.el.style.zIndex = state.lid > 0.45 ? '0' : '2'
    }
    const settle = movers.length ? Math.min(...movers.map((m) => Math.min(1, m.progress.settle))) : 0
    for (const d of dishes) {
      if (d.visual) d.visual.style.transform = `scale(${1 - 0.012 * Math.sin(Math.PI * settle)})`
      if (d.steam) d.steam.style.opacity = String(settle)
      if (d.landed) d.landed.style.opacity = String(state.handoff)
    }
    if (debugSvg) debugSvg.innerHTML = debug
  }

  const at = (tl: gsap.core.Timeline, target: object, vars: gsap.TweenVars, seg: Segment, offset = 0) => {
    const start = Math.min(0.999, Math.max(0, seg[0] + offset))
    const stop = Math.min(1, Math.max(start + 0.001, seg[1] + offset))
    tl.to(target, { ...vars, duration: stop - start }, start)
  }

  const onNavClick = (e: MouseEvent) => {
    const link = (e.target as Element | null)?.closest?.('a[href="#menu"]')
    if (!link || !cinematic) return
    // The dishes sit inside the pinned transition: go to its end, where every dish is plated.
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
        // Static: the finished dishes are shown, nothing pins or moves; the empty basket stays closed.
        cinematic = false
        journey.dataset.mode = 'static'
        movers.forEach((m) => Object.assign(m.progress, finalProgress()))
        Object.assign(state, { camera: 0, lid: 0, headline: 0, handoff: 1 })
        return
      }

      cinematic = true
      journey.dataset.mode = 'cinematic'
      movers.forEach((m) => Object.assign(m.progress, emptyProgress()))
      Object.assign(state, { camera: 0, lid: 0, headline: 0, handoff: 0 })

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
      at(tl, state, { headline: 1, ease: 'power1.out' }, t.headline)
      at(tl, state, { lid: 1, ease: 'power2.inOut' }, t.open)
      at(tl, state, { camera: 1, ease: 'power1.inOut' }, t.flight)
      movers.forEach((m, k) => {
        // The chicken waits for the lid; everything else starts together, lightly staggered.
        const offset = m.mover.dish === 'chicken' ? t.open[1] - t.lift[0] - 0.02 : k * motion.stagger
        at(tl, m.progress, { lift: 1, ease: EASE.lift }, t.lift, Math.max(0, offset))
        at(tl, m.progress, { flight: 1, ease: EASE.flight }, t.flight)
        at(tl, m.progress, { settle: 1, ease: EASE.settle }, t.settle)
        if (m.mover.metal) at(tl, m.progress, { slide: 1, ease: EASE.slide }, t.slide)
        if (m.pieces.length > 1) at(tl, m.progress, { spread: 1, ease: EASE.spread }, t.spread)
      })
      at(tl, state, { handoff: 1, ease: 'none' }, t.handoff)
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
  // Re-measure once every image has loaded and whenever the layout changes size.
  const refresh = () => ScrollTrigger.refresh()
  window.addEventListener('load', refresh)
  const ro = new ResizeObserver(() => ScrollTrigger.refresh())
  ro.observe(track)
  const imgs = [...document.images].filter((img) => !img.complete)
  imgs.forEach((img) => img.addEventListener('load', refresh, { once: true }))
  requestAnimationFrame(refresh)

  return () => {
    gsap.ticker.remove(render)
    document.removeEventListener('click', onNavClick)
    window.removeEventListener('load', refresh)
    imgs.forEach((img) => img.removeEventListener('load', refresh))
    ro.disconnect()
    mm.revert()
    track.style.transform = ''
    if (header) header.style.transform = ''
    if (headline) headline.style.opacity = ''
  }
}
