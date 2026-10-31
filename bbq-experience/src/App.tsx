import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createChoreography } from './animation/choreography'
import { loadScene } from './config/loadScene'
import type { SceneConfig } from './config/types'
import { Hero } from './components/Hero'
import { PlateCard } from './components/PlateCard'
import { SkewerLayer } from './components/SkewerLayer'
import { useElementRegistry } from './useElementRegistry'

const debug = new URLSearchParams(window.location.search).has('debug')

export default function App() {
  const [scene, setScene] = useState<SceneConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { register, get } = useElementRegistry()
  const platesRef = useRef<HTMLElement>(null)
  const debugSvg = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    loadScene().then(setScene, (e: Error) => setError(e.message))
  }, [])

  useLayoutEffect(() => {
    if (!scene || !platesRef.current) return
    return createChoreography({
      scene,
      elements: get,
      platesSection: platesRef.current,
      debugSvg: debugSvg.current,
    })
  }, [scene, get])

  if (error) return <p className="load-error">{error}</p>
  if (!scene) return <div className="loading" aria-busy="true" />

  return (
    <>
      <main>
        <Hero scene={scene} register={register} />

        <section className="plates" ref={platesRef} aria-labelledby="plates-title">
          <header className="plates__header">
            <p className="eyebrow">Signature skewers</p>
            <h2 id="plates-title">{scene.platesSection.title}</h2>
            <p>{scene.platesSection.subtitle}</p>
          </header>
          <div className="plates__grid">
            {scene.skewers.map((s) => (
              <PlateCard key={s.id} skewer={s} register={register} />
            ))}
          </div>
        </section>

        <section className="closing">
          <h2>Reserve your table</h2>
          <p>Open Tuesday to Sunday, from 5 pm until the coals go out.</p>
          <button type="button" className="button button--ghost">
            Book a table
          </button>
        </section>
      </main>

      <SkewerLayer
        scene={scene}
        register={register}
        debug={debug}
        debugRef={(el) => {
          debugSvg.current = el
        }}
      />
    </>
  )
}
