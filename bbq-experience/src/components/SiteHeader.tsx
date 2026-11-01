import { useEffect, useId, useState } from 'react'
import type { SceneConfig } from '../config/types'

interface SiteHeaderProps {
  scene: SceneConfig
}

/** Logo, navigation and ORDER NOW. Navigation collapses into a menu on phones. */
export function SiteHeader({ scene }: SiteHeaderProps) {
  const { nav, order } = scene.hero
  const [open, setOpen] = useState(false)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="site-header" data-open={open || undefined}>
      <a className="site-header__logo" href="#top">
        <img src={scene.assets.logo} alt={scene.hero.logoAlt} draggable={false} />
      </a>

      <nav className="site-nav" aria-label="Main">
        <ul id={panelId} className="site-nav__list">
          {nav.map((item) => (
            <li key={item.label}>
              <a href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <a className="order-button" href={order.href}>
        {order.label}
      </a>

      <button
        type="button"
        className="menu-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>
    </header>
  )
}
