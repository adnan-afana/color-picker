import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createChoreography } from './animation/choreography'
import { loadScene } from './config/loadScene'
import type { SceneConfig } from './config/types'
import { FoodLayer } from './components/FoodLayer'
import { Hero } from './components/Hero'
import { PlateCard } from './components/PlateCard'
import { SiteHeader } from './components/SiteHeader'
import { OwnerEditor } from './owner/OwnerEditor'
import { loadOwnerState } from './owner/store'
import { useElementRegistry } from './useElementRegistry'

const debug = new URLSearchParams(window.location.search).has('debug')
const isOwnerRoute = () => window.location.hash === '#owner'

export default function App() {
  const [scene, setScene] = useState<SceneConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [owner, setOwner] = useState(isOwnerRoute)

  useEffect(() => {
    const onHash = () => {
      // Owner mode and the site load different things; start fresh when switching.
      if (isOwnerRoute() !== owner) window.location.reload()
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [owner])

  useEffect(() => {
    setOwner(isOwnerRoute())
    Promise.all([loadScene(), isOwnerRoute() ? null : loadOwnerState()]).then(([s, local]) => {
      // Owner edits are applied only when the owner switched them on in this browser.
      if (local?.active) {
        const images = Object.fromEntries(Object.entries(local.images).map(([k, b]) => [k, URL.createObjectURL(b)]))
        s = { ...s, local: { images, adjust: local.adjust } }
      }
      setScene(s)
    }, (e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="load-error">{error}</p>
  if (!scene) return <div className="loading" aria-busy="true" />
  if (owner) return <OwnerEditor scene={scene} />
  return <Site scene={scene} />
}

function Site({ scene }: { scene: SceneConfig }) {
  const { register, get } = useElementRegistry()
  const debugSvg = useRef<SVGSVGElement | null>(null)

  useLayoutEffect(() => createChoreography({ scene, get, debugSvg: debugSvg.current }), [scene, get])

  return (
    <main>
      {/* The journey pins while the view moves once from the grill down to the dishes. */}
      <div className="journey" ref={register('journey')}>
        <div className="journey__track" ref={register('track')}>
          <Hero scene={scene} register={register} />

          <section className="plates" id="menu" aria-labelledby="plates-title">
            {/* No visible heading between grill and plates: the food never passes over text. */}
            <h2 id="plates-title" className="visually-hidden">
              {scene.platesSection.title}
            </h2>
            <div className="plates__grid">
              {scene.dishes.map((d) => (
                <PlateCard key={d.id} scene={scene} dish={d} register={register} />
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Header and moving food sit at the top of the page, outside the pinned
          journey: pinning gives the journey a transform and overflow clipping,
          which would otherwise trap and crop anything inside it. */}
      {createPortal(
        <>
          <FoodLayer
            scene={scene}
            register={register}
            debug={debug}
            debugRef={(el) => {
              debugSvg.current = el
            }}
          />
          <div className="header-layer" ref={register('header')}>
            <SiteHeader scene={scene} />
          </div>
          {scene.local && (
            <p className="local-banner" role="status">
              Showing owner edits saved in this browser only. The published site is unchanged.{' '}
              <a href="#owner">Open owner mode</a>
            </p>
          )}
        </>,
        document.body,
      )}

      <section className="closing" id="contact">
        <h2>{scene.closing.title}</h2>
        <button type="button" className="order-button">
          {scene.closing.button}
        </button>
      </section>
    </main>
  )
}
