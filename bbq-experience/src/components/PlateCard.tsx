import type { Dish, SceneConfig } from '../config/types'
import { adjustFor, adjustTransform, baseKey, moverPieces, moversFor } from '../food'
import type { RegisterRef } from '../useElementRegistry'
import { LandedPieces } from './FoodPieces'
import { Steam } from './Steam'

interface PlateCardProps {
  scene: SceneConfig
  dish: Dish
  register: RegisterRef
}

/**
 * One dish: the restaurant's plate with rice and sides from the start, the
 * protein that lands on it, and the dish name and order button below.
 */
export function PlateCard({ scene, dish, register }: PlateCardProps) {
  const { id } = dish
  const plate = scene.food.plates[id]
  if (!plate) return null
  const base = scene.local?.images[baseKey(id)] ?? plate.base
  return (
    <article className="plate-card" aria-labelledby={`dish-${id}`}>
      <div
        className="plate-card__plate"
        ref={register(`plate:${id}`)}
        style={{ aspectRatio: `${plate.size[0]} / ${plate.size[1]}` }}
      >
        <div className="plate-card__visual" ref={register(`plateVisual:${id}`)}>
          <img
            className="plate-card__img"
            src={base}
            alt=""
            draggable={false}
            style={{ transform: adjustTransform(adjustFor(scene, baseKey(id))) }}
          />
          <div className="plate-card__landed" ref={register(`landed:${id}`)}>
            {moversFor(scene, id).map(([mid, mover]) => (
              <LandedPieces key={mid} scene={scene} mover={mover} pieces={moverPieces(scene, mover)} plateSize={plate.size} />
            ))}
          </div>
          <Steam ref={register(`steam:${id}`)} />
        </div>
        <span className="visually-hidden">{dish.name}, plated</span>
      </div>
      <div className="plate-card__body">
        <h3 id={`dish-${id}`}>{dish.name}</h3>
        {dish.price && <p className="plate-card__price">{dish.price}</p>}
        {dish.description && <p className="plate-card__description">{dish.description}</p>}
        <a className="order-button order-button--small" href={scene.hero.order.href}>
          {scene.hero.order.label}
        </a>
      </div>
    </article>
  )
}
