import { useEffect, useMemo, useState } from 'react'
import type { Adjust, SceneConfig } from '../config/types'
import { adjustTransform, baseKey, foodKey, moverPieces, moversFor, NO_ADJUST, referenceKey } from '../food'
import { LandedPieces, SkewerPieces } from '../components/FoodPieces'
import { emptyState, exportState, importState, loadOwnerState, saveOwnerState, type OwnerState } from './store'

const noRegister = () => () => {}

interface AssetSlot {
  key: string
  label: string
  hint: string
  original: string
}

const SLIDERS: { prop: keyof Adjust; label: string; min: number; max: number; step: number; unit: string; scale: number }[] = [
  { prop: 'scale', label: 'Scale', min: 0.5, max: 1.5, step: 0.01, unit: '%', scale: 100 },
  { prop: 'x', label: 'Horizontal', min: -0.3, max: 0.3, step: 0.005, unit: '%', scale: 100 },
  { prop: 'y', label: 'Vertical', min: -0.3, max: 0.3, step: 0.005, unit: '%', scale: 100 },
  { prop: 'rotation', label: 'Rotation', min: -45, max: 45, step: 0.5, unit: '°', scale: 1 },
]

/**
 * Owner image editor (open with #owner). Replacements and adjustments are
 * saved in this browser only; they never change the published website.
 */
export function OwnerEditor({ scene }: { scene: SceneConfig }) {
  const [state, setState] = useState<OwnerState>(emptyState())
  const [dishId, setDishId] = useState(scene.dishes[0]?.id ?? 'chicken')
  const [compare, setCompare] = useState(0)
  const [message, setMessage] = useState('')
  const [exported, setExported] = useState('')

  useEffect(() => {
    loadOwnerState().then(setState)
  }, [])

  const urls = useMemo(() => Object.fromEntries(Object.entries(state.images).map(([k, b]) => [k, URL.createObjectURL(b)])), [state.images])
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls])

  const preview: SceneConfig = { ...scene, local: { images: urls, adjust: state.adjust } }
  const plate = scene.food.plates[dishId]
  const dish = scene.dishes.find((d) => d.id === dishId)
  const firstMover = moversFor(scene, dishId)[0]

  const update = async (next: OwnerState, note = '') => {
    setState(next)
    const ok = await saveOwnerState(next)
    setMessage(ok ? note : 'This browser is not allowing saves (private window or blocked site data). Edits will be lost when you leave; export them to keep them.')
  }

  const setAdjust = (key: string, prop: keyof Adjust, value: number) =>
    update({ ...state, adjust: { ...state.adjust, [key]: { ...(state.adjust[key] ?? NO_ADJUST), [prop]: value } } })

  const resetAdjust = (key: string) => {
    const adjust = { ...state.adjust }
    delete adjust[key]
    update({ ...state, adjust }, 'Position reset.')
  }

  const replace = (key: string, file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setMessage('Choose an image file (PNG, JPG or WebP).')
    update({ ...state, images: { ...state.images, [key]: file } }, `Replaced. Saved in this browser only.`)
  }

  const useOriginal = (key: string) => {
    const images = { ...state.images }
    delete images[key]
    update({ ...state, images }, 'Back to the original image.')
  }

  const slots: AssetSlot[] = plate
    ? [
        {
          key: foodKey(dishId),
          label: `${dish?.name ?? dishId} — food`,
          hint: 'The food that travels from the grill: the meat only, without the skewer, as a transparent PNG.',
          original: firstMover?.[1].pieces[0]?.src ?? '',
        },
        { key: baseKey(dishId), label: 'Dish base', hint: 'The plate with rice and sides, without the arriving food.', original: plate.base },
        {
          key: referenceKey(dishId),
          label: 'Complete dish reference',
          hint: 'The finished photo, used here to line the food up. It is not shown on the site.',
          original: plate.reference,
        },
      ]
    : []

  const onExport = async () => {
    const data = JSON.stringify(await exportState(state))
    setExported(data)
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
      a.download = 'sindibad-owner-config.json'
      a.click()
      setMessage('Configuration exported. If no file was saved, copy it from the box below.')
    } catch {
      setMessage('Copy the configuration from the box below.')
    }
  }

  const onImport = async (file: File | undefined) => {
    if (!file) return
    try {
      await update(await importState(await file.text(), state), 'Configuration imported.')
    } catch (e) {
      setMessage((e as Error).message || 'That file could not be read.')
    }
  }

  return (
    <div className="owner">
      <header className="owner__bar">
        <div>
          <h1>Owner image editor</h1>
          <p className="owner__badge">Saved in this browser only — not published</p>
        </div>
        <a className="owner__back" href="#">
          Back to the site
        </a>
      </header>

      <p className="owner__intro">
        Replace the food and dish images and fine-tune their position. Changes are stored in this browser
        (IndexedDB) and can be shown on the site on this device only. They do not change the published website:
        to publish, export the configuration and send it, with the image files, to whoever updates the site.
        Clearing site data or using a private window loses unsaved edits.
      </p>

      <nav className="owner__tabs" aria-label="Dish">
        {scene.dishes.map((d) => (
          <button key={d.id} type="button" aria-pressed={d.id === dishId} onClick={() => setDishId(d.id)}>
            {d.name}
          </button>
        ))}
      </nav>

      <div className="owner__layout">
        <div className="owner__slots">
          {slots.map((slot) => {
            const adjust = state.adjust[slot.key] ?? NO_ADJUST
            const replaced = Boolean(urls[slot.key])
            return (
              <section key={slot.key} className="owner__slot" aria-labelledby={`slot-${slot.key}`}>
                <div className="owner__slot-head">
                  <img className="owner__thumb" src={urls[slot.key] ?? slot.original} alt="" />
                  <div>
                    <h2 id={`slot-${slot.key}`}>{slot.label}</h2>
                    <p>{slot.hint}</p>
                    <p className="owner__status">{replaced ? 'Replaced (this browser only)' : 'Original image'}</p>
                  </div>
                </div>
                <div className="owner__actions">
                  <label className="owner__button">
                    Replace image
                    <input id={`file-${slot.key}`} type="file" accept="image/*" onChange={(e) => replace(slot.key, e.target.files?.[0])} />
                  </label>
                  <button type="button" className="owner__button owner__button--quiet" disabled={!replaced} onClick={() => useOriginal(slot.key)}>
                    Use original
                  </button>
                </div>
                {SLIDERS.map((s) => (
                  <label key={s.prop} className="owner__slider">
                    <span>{s.label}</span>
                    <input
                      id={`${slot.key}-${s.prop}`}
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={adjust[s.prop]}
                      onChange={(e) => setAdjust(slot.key, s.prop, Number(e.target.value))}
                    />
                    <output>
                      {Math.round(adjust[s.prop] * s.scale * 10) / 10}
                      {s.unit}
                    </output>
                  </label>
                ))}
                <button type="button" className="owner__button owner__button--quiet" onClick={() => resetAdjust(slot.key)}>
                  Reset position
                </button>
              </section>
            )
          })}
        </div>

        <aside className="owner__preview" aria-label="Preview">
          <h2>Preview</h2>
          {plate && (
            <div className="owner__plate" style={{ aspectRatio: `${plate.size[0]} / ${plate.size[1]}` }}>
              <img
                src={urls[baseKey(dishId)] ?? plate.base}
                alt=""
                style={{ transform: adjustTransform(state.adjust[baseKey(dishId)] ?? NO_ADJUST) }}
              />
              <div className="owner__landed">
                {moversFor(preview, dishId).map(([mid, mover]) => (
                  <LandedPieces key={mid} scene={preview} mover={mover} pieces={moverPieces(preview, mover)} plateSize={plate.size} />
                ))}
              </div>
              <img
                className="owner__reference"
                src={urls[referenceKey(dishId)] ?? plate.reference}
                alt=""
                style={{ opacity: compare, transform: adjustTransform(state.adjust[referenceKey(dishId)] ?? NO_ADJUST) }}
              />
            </div>
          )}
          <label className="owner__slider">
            <span>Compare with complete dish</span>
            <input id="compare" type="range" min={0} max={1} step={0.01} value={compare} onChange={(e) => setCompare(Number(e.target.value))} />
            <output>{Math.round(compare * 100)}%</output>
          </label>

          {firstMover && (
            <>
              <h3>On the grill</h3>
              <div className="owner__grill">
                {moversFor(preview, dishId).map(([mid, mover]) => (
                  <div
                    key={mid}
                    className="owner__mover"
                    style={{ aspectRatio: `${mover.canvas[0]} / ${mover.canvas[1]}`, transform: `rotate(${scene.grillLayout.items[mid]?.axis ?? 0}deg)` }}
                  >
                    {mover.metal && <img className="food__metal" src={mover.metal} alt="" />}
                    <SkewerPieces scene={preview} id={mid} mover={mover} pieces={moverPieces(preview, mover)} register={noRegister} />
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>

      <footer className="owner__footer">
        <label className="owner__toggle">
          <input id="active" type="checkbox" checked={state.active} onChange={(e) => update({ ...state, active: e.target.checked })} />
          Show these edits on the site in this browser
        </label>
        <div className="owner__actions">
          <button type="button" className="owner__button" onClick={onExport}>
            Export configuration
          </button>
          <label className="owner__button owner__button--quiet">
            Import configuration
            <input id="import" type="file" accept="application/json,.json" onChange={(e) => onImport(e.target.files?.[0])} />
          </label>
          <button type="button" className="owner__button owner__button--quiet" onClick={() => update({ ...emptyState(), active: false }, 'All edits cleared.')}>
            Clear all edits
          </button>
        </div>
        {message && (
          <p className="owner__message" role="status">
            {message}
          </p>
        )}
        {exported && (
          <textarea id="exported" className="owner__export" readOnly value={exported} rows={4} aria-label="Exported configuration" />
        )}
      </footer>
    </div>
  )
}
