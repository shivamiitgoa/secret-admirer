import type { FormEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CircleAlert, Heart, HeartHandshake, Hourglass, Plus, Sparkles } from 'lucide-react'

type DashboardMatch = {
  otherUid: string
  otherUsername: string
}

type DashboardSentAdmirer = {
  id: string
  toUid?: string | null
  toUsername: string
  revealed: boolean
}

type DashboardSectionProps = {
  incomingCount: number
  outgoingCount: number
  maxOutgoing: number
  matches: DashboardMatch[]
  sentAdmirers: DashboardSentAdmirer[]
  toUsername: string
  addPending: boolean
  canAdd: boolean
  hasSyncedProfile: boolean
  onToUsernameChange: (value: string) => void
  onAddSubmit: (event: FormEvent) => void
  needsProfileResync: boolean
  profileSyncing: boolean
  onRetryProfileSync: () => Promise<void>
}

function DashboardSection({
  incomingCount,
  outgoingCount,
  maxOutgoing,
  matches,
  sentAdmirers,
  toUsername,
  addPending,
  canAdd,
  hasSyncedProfile,
  onToUsernameChange,
  onAddSubmit,
  needsProfileResync,
  profileSyncing,
  onRetryProfileSync,
}: DashboardSectionProps) {
  const reduceMotion = useReducedMotion()

  return (
    <section className="dashboard-layout">
      <div className="dashboard-main">
        <motion.form
          className="section-block surface-panel"
          onSubmit={onAddSubmit}
          aria-busy={addPending}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
        >
          <h2 className="section-title">Send a private signal</h2>
          <p className="section-subtitle">
            Enter an X handle. Account presence stays private, and names reveal only when both people choose each other.
          </p>

          <div className="form-stack">
            <label className="label">
              X username
              <div className="username-field">
                <span className="username-prefix">@</span>
                <input
                  value={toUsername}
                  onChange={(event) => onToUsernameChange(event.target.value)}
                  placeholder="username"
                  autoComplete="off"
                  disabled={addPending}
                />
              </div>
            </label>

            <p className="input-hint">You can type `username` or `@username`.</p>

            <button type="submit" className="btn btn-primary" disabled={addPending || !canAdd}>
              <Plus size={16} aria-hidden="true" />
              {addPending ? 'Sending signal...' : 'Send signal'}
            </button>

            <div className="inline-note-wrap">
              {outgoingCount >= maxOutgoing ? <p className="inline-note">You have reached your signal limit.</p> : null}
              {!hasSyncedProfile ? <p className="inline-note">Finish profile sync before sending signals.</p> : null}
            </div>
          </div>
        </motion.form>

        {needsProfileResync ? (
          <motion.article
            className="section-block surface-panel"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: reduceMotion ? 0 : 0.05, ease: 'easeOut' }}
          >
            <h2 className="section-title">Finish profile sync</h2>
            <p className="section-subtitle">
              We could not verify your X username from this session. Retry now, or sign out and sign in again.
            </p>
            <div className="form-stack">
              <button type="button" className="btn btn-secondary" onClick={onRetryProfileSync} disabled={profileSyncing}>
                <Sparkles size={16} aria-hidden="true" />
                {profileSyncing ? 'Retrying sync...' : 'Retry profile sync'}
              </button>
            </div>
          </motion.article>
        ) : null}
      </div>

      <div className="dashboard-side">
        <motion.article
          className="section-block surface-panel"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: reduceMotion ? 0 : 0.06, ease: 'easeOut' }}
        >
          <h2 className="section-title">Your dashboard</h2>
          <div className="stats-grid" role="list" aria-label="Profile stats">
            <div className="stat-card" role="listitem">
              <p className="stat-label">Received signals</p>
              <strong className="stat-value">{incomingCount}</strong>
            </div>
            <div className="stat-card" role="listitem">
              <p className="stat-label">Sent</p>
              <strong className="stat-value">
                {outgoingCount}/{maxOutgoing}
              </strong>
            </div>
            <div className="stat-card" role="listitem">
              <p className="stat-label">Matches</p>
              <strong className="stat-value">{matches.length}</strong>
            </div>
          </div>
        </motion.article>

        <motion.article
          className="section-block surface-panel"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: reduceMotion ? 0 : 0.08, ease: 'easeOut' }}
        >
          <h2 className="section-title">Revealed matches</h2>
          {matches.length ? (
            <ul className="badge-list">
              {matches.map((match) => (
                <li key={match.otherUid} className="badge-chip">
                  <HeartHandshake size={14} aria-hidden="true" />@{match.otherUsername}
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-empty">No matches yet. Your first mutual reveal will appear here.</p>
          )}
        </motion.article>

        <motion.article
          className="section-block surface-panel"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.36, delay: reduceMotion ? 0 : 0.1, ease: 'easeOut' }}
        >
          <h2 className="section-title">Sent signals</h2>
          {sentAdmirers.length ? (
            <ul className="vertical-list">
              {sentAdmirers.map((sent) => (
                <li key={sent.id} className="vertical-list-item">
                  <span className="vertical-list-handle">@{sent.toUsername}</span>
                  <span className={`status-pill ${sent.revealed ? 'status-pill-match' : 'status-pill-pending'}`}>
                    {sent.revealed ? (
                      <>
                        <Heart size={12} aria-hidden="true" /> Matched
                      </>
                    ) : (
                      <>
                        <Hourglass size={12} aria-hidden="true" /> Pending
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-empty">No signals sent yet. Add your first handle from the panel on the left.</p>
          )}
        </motion.article>

        {!hasSyncedProfile ? (
          <article className="section-block surface-panel">
            <h2 className="section-title">Profile unavailable</h2>
            <p className="section-empty">
              <CircleAlert size={14} aria-hidden="true" /> Your X profile is not synced yet.
            </p>
          </article>
        ) : null}
      </div>
    </section>
  )
}

export default DashboardSection
