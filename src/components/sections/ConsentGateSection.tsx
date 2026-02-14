import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, FileText, Scale } from 'lucide-react'
import { Link } from 'react-router-dom'

type ConsentGateSectionProps = {
  consentPending: boolean
  onAccept: () => Promise<void>
}

function ConsentGateSection({ consentPending, onAccept }: ConsentGateSectionProps) {
  const reduceMotion = useReducedMotion()

  return (
    <section className="two-panel">
      <motion.article
        className="panel-card surface-panel"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <h2 className="section-title">One final step</h2>
        <p className="section-subtitle">
          We need explicit acceptance before enabling matches, signal actions, and safety controls.
        </p>

        <div className="feature-list">
          <div className="feature-item">
            <FileText size={16} aria-hidden="true" />
            <div>
              <h3>Privacy Policy</h3>
              <p>How data is collected, used, retained, and deleted.</p>
              <Link to="/privacy">Review privacy policy</Link>
            </div>
          </div>

          <div className="feature-item">
            <Scale size={16} aria-hidden="true" />
            <div>
              <h3>Terms & Acceptable Use</h3>
              <p>Behavior standards, eligibility, and account controls.</p>
              <Link to="/terms">Review terms</Link>
            </div>
          </div>
        </div>
      </motion.article>

      <motion.article
        className="panel-card surface-panel"
        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.34, delay: reduceMotion ? 0 : 0.04, ease: 'easeOut' }}
      >
        <h2 className="section-title">I understand and agree</h2>
        <p className="section-subtitle">
          Confirm once. You will only need to re-consent when policy versions are updated.
        </p>

        <div className="form-stack">
          <button type="button" className="btn btn-primary" onClick={onAccept} disabled={consentPending}>
            <CheckCircle2 size={16} aria-hidden="true" />
            {consentPending ? 'Saving consent...' : 'I agree and continue'}
          </button>
          <p className="inline-note">Minimum age requirement is 18+. You can view policy pages at any time later.</p>
        </div>
      </motion.article>
    </section>
  )
}

export default ConsentGateSection
