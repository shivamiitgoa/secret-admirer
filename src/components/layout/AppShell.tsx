import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import BrandMark from '../common/BrandMark'

type AppShellProps = {
  sectionLabel: string
  eyebrow: string
  title: string
  subtitle: string
  username?: string | null
  actions?: ReactNode
  heroAside?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

function AppShell({
  sectionLabel,
  eyebrow,
  title,
  subtitle,
  username,
  actions,
  heroAside,
  children,
  footer,
}: AppShellProps) {
  const reduceMotion = useReducedMotion()

  return (
    <main className="app-shell">
      <motion.header
        className="app-topbar surface-panel"
        initial={reduceMotion ? false : { opacity: 0, y: -10 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        <div className="app-topbar-left">
          <BrandMark className="brand-mark brand-mark-img" decorative />
          <span className="brand-meta">
            <span className="brand-eyebrow">{sectionLabel}</span>
            <span className="brand-title">MutualWink</span>
          </span>
        </div>

        <div className="app-topbar-actions">
          {username ? <span className="shell-handle-chip">@{username}</span> : null}
          {actions}
        </div>
      </motion.header>

      <motion.section
        className="hero-banner surface-panel"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.34, delay: reduceMotion ? 0 : 0.04, ease: 'easeOut' }}
      >
        <div className="hero-copy">
          <p className="hero-micro">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="hero-lead">{subtitle}</p>
        </div>
        {heroAside ? <aside className="hero-support">{heroAside}</aside> : null}
      </motion.section>

      <section className="shell-content">{children}</section>
      {footer ? <footer className="footer-links">{footer}</footer> : null}
    </main>
  )
}

export default AppShell
