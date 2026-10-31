import type { SceneConfig } from '../config/types'
import type { RegisterRef } from '../useElementRegistry'

interface SkewerLayerProps {
  scene: SceneConfig
  register: RegisterRef
  debug: boolean
  debugRef: (el: SVGSVGElement | null) => void
}

/**
 * Fixed, full-viewport layer above every section. Skewers are rendered here
 * so they can travel between the hero and the plates without being clipped
 * by either section.
 */
export function SkewerLayer({ scene, register, debug, debugRef }: SkewerLayerProps) {
  return (
    <div className="skewer-layer" aria-hidden="true">
      {scene.skewers.map((s) => (
        <img
          key={s.id}
          ref={register(s.id, 'skewer')}
          className="skewer"
          src={s.images.skewer}
          alt=""
          draggable={false}
        />
      ))}
      {debug && <svg className="debug-paths" ref={debugRef} />}
    </div>
  )
}
