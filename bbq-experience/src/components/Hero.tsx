import type { SceneConfig } from '../config/types'
import type { RegisterRef } from '../useElementRegistry'
import { SiteHeader } from './SiteHeader'

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
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero__media" aria-hidden="true">
        {/* Keeps the photo's aspect ratio so slot positions (in %) stay true. */}
        <div className="grill-stage">
          <img className="grill-stage__image" src={scene.assets.grill} alt="" draggable={false} />
          <img className="grill-stage__flames" src={scene.assets.flames} alt="" draggable={false} />
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
            />
          ))}
        </div>
      </div>
      <div className="hero__shade" aria-hidden="true" />

      <SiteHeader scene={scene} />

      <h1 id="hero-title" className="hero__headline">
        {scene.hero.headline}
      </h1>
    </section>
  )
}
