import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createChoreography } from './animation/choreography'
import { loadScene } from './config/loadScene'
import type { SceneConfig } from './config/types'
import { FoodLayer } from './components/FoodLayer'
import { Hero } from './components/Hero'
import { PlateCard } from './components/PlateCard'
import { SiteHeader } from './components/SiteHeader'
import { useElementRegistry } from './useElementRegistry'

const debug = new URLSearchParams(window.location.search).has('debug')

export default function App() {
  const [scene, setScene] = useState<SceneConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { register, get } = useElementRegistry()
  const debugSvg = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    loadScene().then(setScene, (e: Error) => setError(e.message))
  }, [])

  useLayoutEffect(() => {
    if (!scene) return
    return createChoreography({ scene, get, debugSvg: debugSvg.current })
  }, [scene, get])

  if (error) return <p className="load-error">{error}</p>
  if (!scene) return <div className="loading" aria-busy="true" />

  return (
    <main>
      {/* The journey pins while the camera pans between the grill and each plate. */}
      <div className="journey" ref={register('journey')}>
        <div className="journey__header" ref={register('header')}>
          <SiteHeader scene={scene} />
        </div>
        <div className="journey__track" ref={register('track')}>
          <Hero scene={scene} register={register} />

          <section className="plates" id="menu" aria-labelledby="plates-title">
            <header className="plates__header">
              <p className="eyebrow">Signature dishes</p>
              <h2 id="plates-title">{scene.platesSection.title}</h2>
              <p>{scene.platesSection.subtitle}</p>
            </header>
            <div className="plates__grid">
              {scene.dishes.map((d) => (
                <PlateCard key={d.id} dish={d} register={register} />
              ))}
            </div>
          </section>
        </div>
        <FoodLayer
          scene={scene}
          register={register}
          debug={debug}
          debugRef={(el) => {
            debugSvg.current = el
          }}
        />
      </div>

      <section className="closing" id="contact">
        <h2>Reserve your table</h2>
        <p>Open Tuesday to Sunday, from 5 pm until the coals go out.</p>
        <button type="button" className="button button--ghost">
          Book a table
        </button>
      </section>
    </main>
  )
}
