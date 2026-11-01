import { useCallback, useRef } from 'react'

export type RegisterRef = (key: string) => (el: HTMLElement | null) => void

/**
 * Collects the DOM nodes the animation drives (grill slots, food layers,
 * plates…) from components spread across the page, keyed by name such as
 * `slot:kebab-3` or `plate:kebab`.
 */
export function useElementRegistry() {
  const map = useRef(new Map<string, HTMLElement>())
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>())

  const register: RegisterRef = useCallback((key) => {
    let cb = callbacks.current.get(key)
    if (!cb) {
      cb = (el) => {
        if (el) map.current.set(key, el)
        else map.current.delete(key)
      }
      callbacks.current.set(key, cb)
    }
    return cb
  }, [])

  const get = useCallback((key: string) => map.current.get(key), [])

  return { register, get }
}
