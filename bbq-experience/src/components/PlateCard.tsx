import type { Dish } from '../config/types'
import type { RegisterRef } from '../useElementRegistry'
import { Steam } from './Steam'

interface PlateCardProps {
  dish: Dish
  /** Width / height of the dish photo, so landing spots measured on it stay exact. */
  aspect: number
  register: RegisterRef
}

/**
 * One serving plate with the dish details and CTA. The plate starts empty;
 * the food arrives from the grill and dissolves into the complete dish photo,
 * which sits on the same canvas, so there is never a second serving.
 */
export function PlateCard({ dish, aspect, register }: PlateCardProps) {
  const { id } = dish
  return (
    <article className="plate-card" aria-labelledby={`dish-${id}`}>
      <div className="plate-card__plate" ref={register(`plate:${id}`)} style={{ aspectRatio: aspect }}>
        <div className="plate-card__visual" ref={register(`plateVisual:${id}`)}>
          <img className="plate-card__img" src={dish.plate} alt="" draggable={false} />
          <img
            className="plate-card__img plate-card__full"
            ref={register(`full:${id}`)}
            src={dish.full}
            alt={`${dish.name}, plated`}
            draggable={false}
          />
          <Steam ref={register(`steam:${id}`)} />
        </div>
      </div>
      <div className="plate-card__body">
        <div className="plate-card__heading">
          <h3 id={`dish-${id}`}>{dish.name}</h3>
          <span className="plate-card__price">{dish.price}</span>
        </div>
        <p>{dish.description}</p>
        <button type="button" className="button">
          Order Now
        </button>
      </div>
    </article>
  )
}
