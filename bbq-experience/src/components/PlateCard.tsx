import type { SkewerConfig } from '../config/types'
import type { RegisterRef } from '../useElementRegistry'
import { Steam } from './Steam'

interface PlateCardProps {
  skewer: SkewerConfig
  register: RegisterRef
}

/** One serving plate: empty plate, finished dish on top, dish details and CTA. */
export function PlateCard({ skewer, register }: PlateCardProps) {
  const { id, images, dish } = skewer
  return (
    <article className="plate-card" aria-labelledby={`dish-${id}`}>
      <div className="plate-card__plate" ref={register(id, 'plate')}>
        <div className="plate-card__visual" ref={register(id, 'plateVisual')}>
          <img className="plate-card__img" src={images.plateEmpty} alt="" draggable={false} />
          <img
            className="plate-card__img plate-card__dish"
            ref={register(id, 'dish')}
            src={images.plateDish}
            alt={`${dish.name}, plated`}
            draggable={false}
          />
          <Steam ref={register(id, 'steam')} />
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
