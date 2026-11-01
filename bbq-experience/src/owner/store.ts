import type { Adjust } from '../config/types'

/**
 * Owner-mode storage, in this browser only (IndexedDB).
 *
 * Nothing here reaches the published website: replacements and adjustments
 * live on this device until they are exported and the image files are put in
 * `public/assets/` by whoever publishes the site.
 */

export interface OwnerState {
  /** Show these edits on the site in this browser. */
  active: boolean
  adjust: Record<string, Adjust>
  images: Record<string, Blob>
}

export interface OwnerExport {
  kind: 'sindibad-owner-config'
  version: 1
  adjust: Record<string, Adjust>
  /** Replacement images as data URLs. */
  images: Record<string, string>
}

const DB = 'sindibad-owner'
const STORE = 'kv'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const emptyState = (): OwnerState => ({ active: false, adjust: {}, images: {} })

/** Never throws: storage can be unavailable (private windows, blocked site data). */
export async function loadOwnerState(): Promise<OwnerState> {
  try {
    const saved = await tx<OwnerState | undefined>('readonly', (s) => s.get('state') as IDBRequest<OwnerState | undefined>)
    return saved ? { ...emptyState(), ...saved } : emptyState()
  } catch {
    return emptyState()
  }
}

/** Returns false when this browser does not allow saving. */
export async function saveOwnerState(state: OwnerState): Promise<boolean> {
  try {
    await tx('readwrite', (s) => s.put(state, 'state'))
    return true
  } catch {
    return false
  }
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(',')
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream'
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

export async function exportState(state: OwnerState): Promise<OwnerExport> {
  const images: Record<string, string> = {}
  for (const [k, b] of Object.entries(state.images)) images[k] = await toDataUrl(b)
  return { kind: 'sindibad-owner-config', version: 1, adjust: state.adjust, images }
}

export async function importState(json: string, current: OwnerState): Promise<OwnerState> {
  const data = JSON.parse(json) as OwnerExport
  if (data.kind !== 'sindibad-owner-config') throw new Error('This file is not a Sindibad owner configuration.')
  const images: Record<string, Blob> = {}
  for (const [k, url] of Object.entries(data.images ?? {})) images[k] = dataUrlToBlob(url)
  return { active: current.active, adjust: data.adjust ?? {}, images }
}
