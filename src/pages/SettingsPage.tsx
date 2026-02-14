import type { FormEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Ban, Flag, ShieldAlert, ShieldCheck, UserRoundX } from 'lucide-react'

export type SettingsReportReason = 'harassment' | 'impersonation' | 'spam' | 'other'

export type SettingsBlockedUser = {
  uid: string
  username: string
  createdAt?: unknown | null
}

type SettingsPageProps = {
  canUseSafetyTools: boolean
  reportUsername: string
  reportReason: SettingsReportReason
  reportDetails: string
  reportPending: boolean
  onReportSubmit: (e: FormEvent) => void
  onReportUsernameChange: (value: string) => void
  onReportReasonChange: (value: SettingsReportReason) => void
  onReportDetailsChange: (value: string) => void
  blockUsername: string
  blockPending: boolean
  onBlockSubmit: (e: FormEvent) => void
  onBlockUsernameChange: (value: string) => void
  blockedUsers: SettingsBlockedUser[]
  unblockPendingUid: string
  onUnblock: (username: string, uid: string) => void
  deleteConfirmation: string
  deletePending: boolean
  onDeleteSubmit: (e: FormEvent) => void
  onDeleteConfirmationChange: (value: string) => void
}

function SettingsPage({
  canUseSafetyTools,
  reportUsername,
  reportReason,
  reportDetails,
  reportPending,
  onReportSubmit,
  onReportUsernameChange,
  onReportReasonChange,
  onReportDetailsChange,
  blockUsername,
  blockPending,
  onBlockSubmit,
  onBlockUsernameChange,
  blockedUsers,
  unblockPendingUid,
  onUnblock,
  deleteConfirmation,
  deletePending,
  onDeleteSubmit,
  onDeleteConfirmationChange,
}: SettingsPageProps) {
  const reduceMotion = useReducedMotion()

  return (
    <section className="settings-grid">
      <motion.article
        className="section-block surface-panel settings-full"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        <h2 className="section-title">Safety Center</h2>
        <p className="section-subtitle">
          Reporting and blocking tools are built for trust and safety. Use them whenever someone violates boundaries.
        </p>
      </motion.article>

      <motion.article
        className="section-block surface-panel"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: reduceMotion ? 0 : 0.04, ease: 'easeOut' }}
      >
        <h2 className="section-title">Report an account</h2>
        <p className="section-subtitle">Submit abuse reports with reason and optional context for faster review.</p>

        <form onSubmit={onReportSubmit} className="form-stack" aria-busy={reportPending}>
          <label className="label">
            Target X username
            <div className="username-field">
              <span className="username-prefix">@</span>
              <input
                value={reportUsername}
                onChange={(event) => onReportUsernameChange(event.target.value)}
                placeholder="username"
                autoComplete="off"
                disabled={!canUseSafetyTools || reportPending}
              />
            </div>
          </label>

          <label className="label">
            Reason
            <select
              value={reportReason}
              onChange={(event) => onReportReasonChange(event.target.value as SettingsReportReason)}
              disabled={!canUseSafetyTools || reportPending}
            >
              <option value="harassment">Harassment</option>
              <option value="impersonation">Impersonation</option>
              <option value="spam">Spam</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="label">
            Details (optional)
            <textarea
              value={reportDetails}
              onChange={(event) => onReportDetailsChange(event.target.value)}
              maxLength={500}
              placeholder="Provide context for the report"
              disabled={!canUseSafetyTools || reportPending}
            />
          </label>

          <button type="submit" className="btn btn-secondary" disabled={!canUseSafetyTools || reportPending}>
            <Flag size={16} aria-hidden="true" />
            {reportPending ? 'Submitting report...' : 'Submit report'}
          </button>
        </form>
      </motion.article>

      <motion.article
        className="section-block surface-panel"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.34, delay: reduceMotion ? 0 : 0.06, ease: 'easeOut' }}
      >
        <h2 className="section-title">Blocked accounts</h2>
        <p className="section-subtitle">Blocked users cannot interact with you in signal flows.</p>

        <form onSubmit={onBlockSubmit} className="form-stack" aria-busy={blockPending}>
          <label className="label">
            X username to block
            <div className="username-field">
              <span className="username-prefix">@</span>
              <input
                value={blockUsername}
                onChange={(event) => onBlockUsernameChange(event.target.value)}
                placeholder="username"
                autoComplete="off"
                disabled={!canUseSafetyTools || blockPending}
              />
            </div>
          </label>

          <button type="submit" className="btn btn-secondary" disabled={!canUseSafetyTools || blockPending}>
            <Ban size={16} aria-hidden="true" />
            {blockPending ? 'Blocking user...' : 'Block user'}
          </button>
        </form>

        <div className="form-divider">
          {blockedUsers.length ? (
            <ul className="vertical-list list-actions">
              {blockedUsers.map((blocked) => (
                <li key={blocked.uid} className="vertical-list-item">
                  <span className="vertical-list-handle">@{blocked.username}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onUnblock(blocked.username, blocked.uid)}
                    disabled={Boolean(unblockPendingUid) || !canUseSafetyTools}
                  >
                    {unblockPendingUid === blocked.uid ? (
                      <>
                        <ShieldAlert size={15} aria-hidden="true" /> Unblocking...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={15} aria-hidden="true" /> Unblock
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-empty">No blocked users yet.</p>
          )}
        </div>
      </motion.article>

      <motion.form
        className="section-block surface-panel settings-full"
        onSubmit={onDeleteSubmit}
        aria-busy={deletePending}
        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.36, delay: reduceMotion ? 0 : 0.08, ease: 'easeOut' }}
      >
        <h2 className="section-title">Danger Zone</h2>
        <p className="section-subtitle">
          Account deletion removes your profile and signal data immediately. Reports you filed are removed; reports
          received against your account are anonymized.
        </p>

        <div className="form-stack">
          <label className="label">
            Type DELETE to confirm
            <input
              value={deleteConfirmation}
              onChange={(event) => onDeleteConfirmationChange(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={deletePending}
            />
          </label>

          <button type="submit" className="btn btn-danger" disabled={deletePending || deleteConfirmation.trim() !== 'DELETE'}>
            <AlertTriangle size={16} aria-hidden="true" />
            {deletePending ? 'Deleting account...' : 'Delete my account'}
          </button>

          <p className="inline-note">
            <UserRoundX size={14} aria-hidden="true" /> This action is irreversible.
          </p>
        </div>
      </motion.form>
    </section>
  )
}

export default SettingsPage
