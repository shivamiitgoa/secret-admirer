import { Link } from 'react-router-dom'

function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <p className="eyebrow">Secret Admirer</p>
        <h1>Privacy Policy</h1>
        <p className="lead">Effective date: February 12, 2026</p>
        <p className="lead">
          This policy explains how Secret Admirer collects, uses, and protects information when you use this app.
        </p>
      </header>

      <section className="legal-card">
        <h2>Who controls this app</h2>
        <p>
          Data controller / owner: <strong>Shivam Kumar</strong>
        </p>
        <p>
          Contact: <a href="mailto:shivam7@outlook.in">shivam7@outlook.in</a>
        </p>
        <p>Location: Bihar, India</p>
      </section>

      <section className="legal-card">
        <h2>Information we collect</h2>
        <ul>
          <li>Authentication and account identifiers from your X login via Firebase Auth.</li>
          <li>Your X username, app profile data, and account consent records.</li>
          <li>Admirer/match relationship data required to run reveal-on-match behavior.</li>
          <li>Safety data such as block records and abuse reports you submit.</li>
          <li>Security and rate-limit logs to protect the service from abuse.</li>
        </ul>
      </section>

      <section className="legal-card">
        <h2>How we use information</h2>
        <ul>
          <li>Operate sign-in, profile sync, and match logic.</li>
          <li>Prevent fraud, abuse, harassment, and misuse.</li>
          <li>Investigate and respond to trust and safety reports.</li>
          <li>Comply with legal obligations and enforce our Terms.</li>
        </ul>
      </section>

      <section className="legal-card">
        <h2>Retention</h2>
        <ul>
          <li>Account and relationship data are retained while your account is active.</li>
          <li>Abuse reports are retained for up to 180 days, unless longer retention is legally required.</li>
          <li>On account deletion, we remove your account-linked data and anonymize reports received against your account.</li>
        </ul>
      </section>

      <section className="legal-card">
        <h2>Your choices</h2>
        <ul>
          <li>You can block users, report abuse, and delete your account from within the app.</li>
          <li>Account deletion removes your profile and app-linked records as described in this policy.</li>
          <li>For privacy requests, contact <a href="mailto:shivam7@outlook.in">shivam7@outlook.in</a>.</li>
        </ul>
      </section>

      <section className="legal-card">
        <h2>Children and age requirement</h2>
        <p>This app is intended for users aged 18 or older. If you are under 18, do not use this service.</p>
      </section>

      <section className="legal-card">
        <h2>Policy updates</h2>
        <p>
          We may update this policy from time to time. Material changes will be reflected by a new effective date and may
          require renewed consent.
        </p>
      </section>

      <footer className="legal-footer">
        <Link to="/">Back to app</Link>
        <Link to="/terms">Terms & Acceptable Use</Link>
      </footer>
    </main>
  )
}

export default PrivacyPolicyPage
