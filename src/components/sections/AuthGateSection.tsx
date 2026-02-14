import { motion, useReducedMotion } from 'framer-motion'
import { Lock, ShieldCheck, Sparkles, UserRoundCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

type AuthGateSectionProps = {
  loginConsentChecked: boolean
  loginPending: boolean
  onConsentChange: (checked: boolean) => void
  onLogin: () => Promise<void>
}

function AuthGateSection({ loginConsentChecked, loginPending, onConsentChange, onLogin }: AuthGateSectionProps) {
  const reduceMotion = useReducedMotion()

  return (
    <section className="two-panel">
      <motion.article
        className="panel-card surface-panel"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: 'easeOut' }}
      >
        <p className="hero-micro">Mutual by design</p>
        <h1 className="panel-title">Send private signals. Reveal only on a true match.</h1>
        <p className="panel-lead">
          MutualWink is built for low-pressure connection. Add an X handle privately and names unlock only when both
          people choose each other.
        </p>

        <div className="feature-list">
          <div className="feature-item">
            <Sparkles size={16} aria-hidden="true" />
            <p>Your private signals stay hidden until there is mutual intent.</p>
          </div>
          <div className="feature-item">
            <ShieldCheck size={16} aria-hidden="true" />
            <p>Integrated reporting and blocking controls keep the experience safer.</p>
          </div>
          <div className="feature-item">
            <Lock size={16} aria-hidden="true" />
            <p>Sign-in is restricted to verified X sessions and policy consent.</p>
          </div>
        </div>
      </motion.article>

      <motion.article
        className="panel-card surface-panel"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.36, delay: reduceMotion ? 0 : 0.06, ease: 'easeOut' }}
      >
        <h2 className="section-title">Continue with X</h2>
        <p className="section-subtitle">Agree to policy terms first, then sign in with your current X account.</p>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={loginConsentChecked}
            onChange={(event) => onConsentChange(event.target.checked)}
          />
          <span>
            By continuing, you agree to the <Link to="/privacy">Privacy Policy</Link> and{' '}
            <Link to="/terms">Terms & Acceptable Use</Link>.
          </span>
        </label>

        <div className="form-stack">
          <button type="button" className="btn btn-primary" onClick={onLogin} disabled={loginPending || !loginConsentChecked}>
            <UserRoundCheck size={16} aria-hidden="true" />
            {loginPending ? 'Connecting to X...' : 'Continue with X'}
          </button>
          <p className="inline-note">You can sign out anytime in-app. No public timeline posting occurs from this app.</p>
        </div>
      </motion.article>
    </section>
  )
}

export default AuthGateSection
