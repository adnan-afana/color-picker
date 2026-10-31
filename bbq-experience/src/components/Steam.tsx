import type { Ref } from 'react'

/** Soft rising steam wisps. Opacity is driven by the engine; motion is pure CSS. */
export function Steam({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div className="steam" ref={ref} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  )
}
