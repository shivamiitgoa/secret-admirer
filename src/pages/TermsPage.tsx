import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'

function TermsPage() {
  const reduceMotion = useReducedMotion()

  return (
    <main className="legal-shell">
      <motion.header
        className="legal-hero surface-panel"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
      >
        <p className="hero-micro">Secret Admirer</p>
        <h1>Terms of Service & Acceptable Use</h1>
        <p className="hero-lead">Effective date: February 12, 2026</p>
        <p className="hero-lead">By using Secret Admirer, you agree to these terms.</p>
      </motion.header>

      <section className="legal-grid">
        <section className="legal-card surface-panel">
          <h2>Operator</h2>
          <p>
            Service owner: <strong>Shivam Kumar</strong>
          </p>
          <p>
            Contact: <a href="mailto:shivam7@outlook.in">shivam7@outlook.in</a>
          </p>
          <p>Governing location: Bihar, India</p>
        </section>

        <section className="legal-card surface-panel">
          <h2>Eligibility</h2>
          <p>You must be at least 18 years old and able to enter a binding agreement to use this service.</p>
        </section>

        <section className="legal-card surface-panel">
          <h2>Acceptable use</h2>
          <ul>
            <li>Use the service lawfully and respectfully.</li>
            <li>Do not harass, threaten, stalk, impersonate, or defame others.</li>
            <li>Do not attempt to bypass app limits, security checks, or moderation controls.</li>
            <li>Do not automate abuse, scraping, or unauthorized access attempts.</li>
          </ul>
        </section>

        <section className="legal-card surface-panel">
          <h2>Safety tools and enforcement</h2>
          <ul>
            <li>Users can report and block accounts.</li>
            <li>Blocked users cannot interact with each other through admirer actions.</li>
            <li>We may limit, suspend, or terminate access for policy violations or abuse.</li>
          </ul>
        </section>

        <section className="legal-card surface-panel">
          <h2>Account deletion</h2>
          <p>
            You can delete your account in-app. Deletion removes your profile and relationship data, and associated abuse
            report handling follows our Privacy Policy.
          </p>
        </section>

        <section className="legal-card surface-panel">
          <h2>Disclaimers and liability</h2>
          <ul>
            <li>The service is provided on an "as is" and "as available" basis.</li>
            <li>We do not guarantee uninterrupted service or outcomes from user interactions.</li>
            <li>To the maximum extent permitted by law, liability is limited for indirect or consequential damages.</li>
          </ul>
        </section>

        <section className="legal-card surface-panel">
          <h2>Changes to these terms</h2>
          <p>
            We may update these terms. Continued use after updates means you accept the revised terms. Material updates may
            require renewed acceptance.
          </p>
        </section>
      </section>

      <footer className="footer-links">
        <Link to="/">Back to app</Link>
        <Link to="/privacy">Privacy Policy</Link>
      </footer>
    </main>
  )
}

export default TermsPage
