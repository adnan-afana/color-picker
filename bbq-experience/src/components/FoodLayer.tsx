import type { SceneConfig } from '../config/types'
import type { RegisterRef } from '../useElementRegistry'
import { animatedIds } from '../sceneIndex'

/** Skewers cast their plate shadow under the meat only, not the handle that slides away. */
function shadowStyle(scene: SceneConfig, id: string) {
  const layout = scene.grillLayout.items[id]
  if (!layout?.meat) return undefined
  const [, y0, , y1] = layout.box
  const h = y1 - y0
  return { inset: `${(layout.meat[0] / h) * 100}% 14% ${100 - (layout.meat[1] / h) * 100}%` }
}

interface FoodLayerProps {
  scene: SceneConfig
  register: RegisterRef
  debug: boolean
  debugRef: (el: SVGSVGElement | null) => void
}

/**
 * Fixed, full-viewport layer for the food that travels from the grill to the
 * plates, so it is never clipped by either section. It sits below the site
 * header, so it never covers the navigation.
 */
export function FoodLayer({ scene, register, debug, debugRef }: FoodLayerProps) {
  const { moving, lids } = animatedIds(scene)
  return (
    <div className="food-layer" aria-hidden="true">
      {scene.grillItems.map((item) => {
        if (lids.has(item.id)) {
          return (
            <div key={item.id} ref={register(`lid:${item.id}`)} className="food-layer__lid">
              <img src={item.images.image} alt="" draggable={false} />
            </div>
          )
        }
        if (!moving.has(item.id)) return null
        return (
          <div key={item.id} ref={register(`item:${item.id}`)} className={`food food--${item.kind}`}>
            <div ref={register(`shadow:${item.id}`)} className="food__shadow" style={shadowStyle(scene, item.id)} />
            {item.images.metal && (
              <img ref={register(`metal:${item.id}`)} className="food__metal" src={item.images.metal} alt="" draggable={false} />
            )}
            <img className="food__img" src={item.images.food} alt="" draggable={false} />
          </div>
        )
      })}
      {debug && <svg className="debug-paths" ref={debugRef} />}
    </div>
  )
}
