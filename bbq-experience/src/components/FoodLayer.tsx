import type { SceneConfig } from '../config/types'
import { moverPieces } from '../food'
import type { RegisterRef } from '../useElementRegistry'
import { SkewerPieces } from './FoodPieces'

interface FoodLayerProps {
  scene: SceneConfig
  register: RegisterRef
  debug: boolean
  debugRef: (el: SVGSVGElement | null) => void
}

/**
 * Fixed, full-viewport layer for the food that travels from the grill to the
 * plates, rendered at the top of the page so no section can clip it. It sits
 * below the site header, so it never covers the navigation.
 */
export function FoodLayer({ scene, register, debug, debugRef }: FoodLayerProps) {
  return (
    <div className="food-layer" aria-hidden="true">
      {scene.grillItems.map((item) => {
        if (item.kind === 'lid') {
          return (
            <div key={item.id} ref={register(`lid:${item.id}`)} className="food-layer__lid">
              <img src={item.images?.image} alt="" draggable={false} />
            </div>
          )
        }
        const mover = scene.food.movers[item.id]
        if (item.kind !== 'mover' || !mover) return null
        return (
          <div key={item.id} ref={register(`item:${item.id}`)} className="food">
            {mover.metal && (
              <img ref={register(`metal:${item.id}`)} className="food__metal" src={mover.metal} alt="" draggable={false} />
            )}
            <SkewerPieces scene={scene} id={item.id} mover={mover} pieces={moverPieces(scene, mover)} register={register} />
          </div>
        )
      })}
      {debug && <svg className="debug-paths" ref={debugRef} />}
    </div>
  )
}
