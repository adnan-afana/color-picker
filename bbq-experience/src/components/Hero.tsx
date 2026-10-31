import type { SceneConfig } from '../config/types'
import type { RegisterRef } from '../useElementRegistry'

interface HeroProps {
  scene: SceneConfig
  register: RegisterRef
}

/**
 * Full-screen hero with the charcoal grill. The skewers themselves live in
 * the overlay layer; here we only place invisible "slot" markers on the grill
 * that tell the engine where each skewer rests.
 */
export function Hero({ scene, register }: HeroProps) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__copy">
        <p className="eyebrow">{scene.hero.eyebrow}</p>
        <h1 id="hero-title" className="hero__title">
          {scene.hero.title}
        </h1>
        <p className="hero__subtitle">{scene.hero.subtitle}</p>
      </div>

      <div className="hero__stage-wrap">
        <div className="grill-stage">
          <img className="grill-stage__image" src={scene.assets.grill} alt="Charcoal grill with glowing coals" />
          <div className="grill-stage__glow" aria-hidden="true" />
          {scene.skewers.map((s) => (
            <div
              key={s.id}
              ref={register(s.id, 'slot')}
              className="grill-slot"
              style={{
                left: `${s.grill.x}%`,
                top: `${s.grill.y}%`,
                width: `${s.grill.width}%`,
              }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      <div className="scroll-cue" aria-hidden="true">
        <span>Scroll</span>
      </div>
    </section>
  )
}
