import type { SceneConfig } from '../config/types'
import type { RegisterRef } from '../useElementRegistry'
import { animatedIds, boxStyle } from '../sceneIndex'

interface HeroProps {
  scene: SceneConfig
  register: RegisterRef
}

/**
 * Full-screen hero with the charcoal grill. Food that stays on the grill is
 * drawn here; food that moves (and the basket lid) lives in the food layer,
 * and only an invisible slot marks where it rests. Skewer images are upright
 * and turned to their angle on the grill.
 */
export function Hero({ scene, register }: HeroProps) {
  const { moving, lids } = animatedIds(scene)
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero__media">
        {/* Keeps the photo's aspect ratio so slot positions (in %) stay true. */}
        <div className="grill-stage">
          <img className="grill-stage__image" src={scene.assets.grill} alt="" draggable={false} />
          <img className="grill-stage__flames" src={scene.assets.flames} alt="" draggable={false} />
          {scene.grillItems.map((item) => {
            const style = boxStyle(scene, item.id)
            if (!style) return null
            if (moving.has(item.id) || lids.has(item.id)) {
              return <div key={item.id} ref={register(`slot:${item.id}`)} className="grill-slot" style={style} />
            }
            const axis = scene.grillLayout.items[item.id]?.axis
            return (
              <div
                key={item.id}
                className={`grill-item grill-item--${item.kind}`}
                style={axis ? { ...style, transform: `rotate(${axis}deg)` } : style}
              >
                {item.images.metal && <img src={item.images.metal} alt="" draggable={false} />}
                <img src={item.images.food ?? item.images.image} alt={item.alt ?? ''} draggable={false} />
              </div>
            )
          })}
        </div>
      </div>
      <div className="hero__shade" aria-hidden="true" />

      <h1 id="hero-title" className="hero__headline">
        {scene.hero.headline}
      </h1>
    </section>
  )
}
