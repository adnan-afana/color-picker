import type { Dish } from '../config/types'
import type { RegisterRef } from '../useElementRegistry'
import { Steam } from './Steam'

interface PlateCardProps {
  dish: Dish
  register: RegisterRef
}

/**
 * One serving plate with the dish details and CTA. The plate starts empty;
 * the food itself arrives from the grill, so there is no second food image.
 */
export function PlateCard({ dish, register }: PlateCardProps) {
  const { id } = dish
  return (
    <article className="plate-card" aria-labelledby={`dish-${id}`}>
      <div className="plate-card__plate" ref={register(`plate:${id}`)}>
        <div className="plate-card__visual" ref={register(`plateVisual:${id}`)}>
          <img className="plate-card__img" src={dish.plate} alt="" draggable={false} />
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
