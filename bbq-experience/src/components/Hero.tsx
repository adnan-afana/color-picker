import type { SceneConfig } from '../config/types'
import type { RegisterRef } from '../useElementRegistry'
import { boxStyle } from '../sceneIndex'

/** Sparks rising from the coals: position along the grill (%), delay and duration (s). */
const EMBERS = [
  { x: 18, delay: 0, dur: 3.4 }, { x: 27, delay: 1.6, dur: 4.1 }, { x: 35, delay: 0.7, dur: 3.1 },
  { x: 42, delay: 2.4, dur: 3.8 }, { x: 49, delay: 1.1, dur: 4.4 }, { x: 55, delay: 3.0, dur: 3.3 },
  { x: 61, delay: 0.3, dur: 3.9 }, { x: 68, delay: 2.0, dur: 3.5 }, { x: 74, delay: 1.3, dur: 4.2 },
  { x: 81, delay: 2.8, dur: 3.6 }, { x: 31, delay: 3.6, dur: 4.0 }, { x: 64, delay: 4.1, dur: 3.2 },
]

interface HeroProps {
  scene: SceneConfig
  register: RegisterRef
}

/**
 * Full-screen hero with the charcoal grill. Food that stays on the grill is
 * drawn here; food that travels (and the basket lid) lives in the food layer,
 * and only an invisible slot marks where it rests. Upright images are turned
 * to their angle on the grill.
 */
export function Hero({ scene, register }: HeroProps) {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero__media">
        {/* Keeps the photo's aspect ratio so slot positions (in %) stay true. */}
        <div className="grill-stage">
          <img className="grill-stage__image" src={scene.assets.grill} alt="" draggable={false} />
          {/* The photo's own flames, in three layers that flicker and lick upward out of step. */}
          <img className="grill-stage__flames" src={scene.assets.flames} alt="" draggable={false} />
          <img className="grill-stage__flames grill-stage__flames--lick" src={scene.assets.flames} alt="" draggable={false} />
          <img className="grill-stage__flames grill-stage__flames--dance" src={scene.assets.flames} alt="" draggable={false} />
          <div className="embers" aria-hidden="true">
            {EMBERS.map((e, i) => (
              <span key={i} style={{ left: `${e.x}%`, animationDelay: `${e.delay}s`, animationDuration: `${e.dur}s` }} />
            ))}
          </div>
          {scene.grillItems.map((item) => {
            const style = boxStyle(scene, item.id)
            if (!style) return null
            if (item.kind === 'mover' || item.kind === 'lid') {
              return <div key={item.id} ref={register(`slot:${item.id}`)} className="grill-slot" style={style} />
            }
            const axis = scene.grillLayout.items[item.id]?.axis
            return (
              <div
                key={item.id}
                className={`grill-item grill-item--${item.kind}`}
                style={axis ? { ...style, transform: `rotate(${axis}deg)` } : style}
              >
                {item.images?.metal && <img src={item.images.metal} alt="" draggable={false} />}
                <img src={item.images?.food ?? item.images?.image} alt={item.alt ?? ''} draggable={false} />
              </div>
            )
          })}
        </div>
      </div>
      <div className="hero__shade" aria-hidden="true" />

      <h1 id="hero-title" className="hero__headline" ref={register('headline')}>
        {scene.hero.headline}
      </h1>
    </section>
  )
}
