import { useCallback, useRef } from 'react'
import type { SkewerElements } from './animation/choreography'

export type ElementKey = keyof SkewerElements
export type RegisterRef = (id: string, key: ElementKey) => (el: HTMLElement | null) => void

/**
 * Collects the DOM nodes each skewer needs (grill slot, overlay image, plate…)
 * from components spread across the page, keyed by skewer id.
 */
export function useElementRegistry() {
  const map = useRef(new Map<string, Partial<SkewerElements>>())
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>())

  const register: RegisterRef = useCallback((id, key) => {
    const cacheKey = `${id}:${key}`
    let cb = callbacks.current.get(cacheKey)
    if (!cb) {
      cb = (el) => {
        const entry = map.current.get(id) ?? {}
        if (el) entry[key] = el
        else delete entry[key]
        map.current.set(id, entry)
      }
      callbacks.current.set(cacheKey, cb)
    }
    return cb
  }, [])

  const get = useCallback((id: string): SkewerElements | undefined => {
    const e = map.current.get(id)
    return e?.skewer && e.slot && e.plate && e.plateVisual && e.dish && e.steam ? (e as SkewerElements) : undefined
  }, [])

  return { register, get }
}
