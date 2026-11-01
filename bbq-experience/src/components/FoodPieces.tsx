import type { FoodPiece, Mover, SceneConfig } from '../config/types'
import { adjustFor, adjustTransform, foodKey } from '../food'
import type { RegisterRef } from '../useElementRegistry'

const pct = (v: number, of: number) => `${(v / of) * 100}%`

/** A piece image with any owner adjustment applied inside its own box. */
function PieceImage({ scene, mover, piece }: { scene: SceneConfig; mover: Mover; piece: FoodPiece }) {
  return (
    <img
      src={piece.src}
      alt=""
      draggable={false}
      style={{ transform: adjustTransform(adjustFor(scene, foodKey(mover.dish))) }}
    />
  )
}

/** The pieces of a mover laid out on its skewer canvas (they move with the mover). */
export function SkewerPieces({ scene, id, mover, pieces, register }: {
  scene: SceneConfig
  id: string
  mover: Mover
  pieces: FoodPiece[]
  register: RegisterRef
}) {
  const [cw, ch] = mover.canvas
  return (
    <>
      {pieces.map((p, i) => (
        <div
          key={i}
          ref={register(`piece:${id}:${i}`)}
          className="food__piece"
          style={{ left: pct(p.rect[0], cw), top: pct(p.rect[1], ch), width: pct(p.rect[2], cw), height: pct(p.rect[3], ch) }}
        >
          <PieceImage scene={scene} mover={mover} piece={p} />
        </div>
      ))}
    </>
  )
}

/**
 * The same pieces as they lie on the plate, positioned in the plate image's
 * own coordinates. The moving food lands exactly here, so handing over from
 * one to the other changes nothing on screen.
 */
export function LandedPieces({ scene, mover, pieces, plateSize }: {
  scene: SceneConfig
  mover: Mover
  pieces: FoodPiece[]
  plateSize: [number, number]
}) {
  const [pw, ph] = plateSize
  const ps = mover.plateScale ?? 1
  return (
    <>
      {pieces.map((p, i) => {
        const w = p.rect[2] * ps
        const h = p.rect[3] * ps
        return (
          <div
            key={i}
            className="plate-card__piece"
            style={{
              left: pct(p.final[0] - w / 2, pw),
              top: pct(p.final[1] - h / 2, ph),
              width: pct(w, pw),
              height: pct(h, ph),
              transform: `rotate(${p.finalRotation}deg)`,
            }}
          >
            <PieceImage scene={scene} mover={mover} piece={p} />
          </div>
        )
      })}
    </>
  )
}
