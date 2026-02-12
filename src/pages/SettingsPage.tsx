import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

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
  return (
    <section className="settings-layout">
      <article className="card settings-intro-card">
        <h2>Settings</h2>
        <p className="muted">Manage safety tools and account controls. These actions are optional and usually rarely used.</p>
        <p className="muted settings-inline-link">
          <Link to="/">Back to dashboard</Link>
        </p>
      </article>

      <article className="card">
        <h2>Safety</h2>
        <p className="muted">Report abuse and block accounts. Blocked users cannot interact with you in this app.</p>

        <form onSubmit={onReportSubmit} className="stacked-form" aria-busy={reportPending}>
          <h3>Report user</h3>
          <label>
            Target X username
            <div className="username-input">
              <span className="username-prefix">@</span>
              <input
                className="username-input-field"
                value={reportUsername}
                onChange={(e) => onReportUsernameChange(e.target.value)}
                placeholder="@username"
                autoComplete="off"
                disabled={!canUseSafetyTools || reportPending}
              />
            </div>
          </label>

          <label>
            Reason
            <select
              value={reportReason}
              onChange={(e) => onReportReasonChange(e.target.value as SettingsReportReason)}
              disabled={!canUseSafetyTools || reportPending}
            >
              <option value="harassment">Harassment</option>
              <option value="impersonation">Impersonation</option>
              <option value="spam">Spam</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            Details (optional)
            <textarea
              value={reportDetails}
              onChange={(e) => onReportDetailsChange(e.target.value)}
              maxLength={500}
              placeholder="Provide context for the report"
              disabled={!canUseSafetyTools || reportPending}
            />
          </label>

          <button type="submit" className="ghost" disabled={!canUseSafetyTools || reportPending}>
            {reportPending ? 'Submitting report...' : 'Submit report'}
          </button>
        </form>

        <form onSubmit={onBlockSubmit} className="stacked-form stacked-form-divider" aria-busy={blockPending}>
          <h3>Block user</h3>
          <label>
            X username
            <div className="username-input">
              <span className="username-prefix">@</span>
              <input
                className="username-input-field"
                value={blockUsername}
                onChange={(e) => onBlockUsernameChange(e.target.value)}
                placeholder="@username"
                autoComplete="off"
                disabled={!canUseSafetyTools || blockPending}
              />
            </div>
          </label>

          <button type="submit" className="ghost" disabled={!canUseSafetyTools || blockPending}>
            {blockPending ? 'Blocking...' : 'Block user'}
          </button>
        </form>

        <div className="stacked-form stacked-form-divider">
          <h3>Blocked users</h3>
          {blockedUsers.length ? (
            <ul className="blocked-list">
              {blockedUsers.map((blocked) => (
                <li key={blocked.uid}>
                  <span>@{blocked.username}</span>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onUnblock(blocked.username, blocked.uid)}
                    disabled={Boolean(unblockPendingUid) || !canUseSafetyTools}
                  >
                    {unblockPendingUid === blocked.uid ? 'Unblocking...' : 'Unblock'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No blocked users.</p>
          )}
        </div>
      </article>

      <form className="card" onSubmit={onDeleteSubmit} aria-busy={deletePending}>
        <h2>Account</h2>
        <p className="muted">
          Deleting your account removes your profile and admirer data immediately. Reports you filed are deleted; reports
          received against your account are anonymized.
        </p>
        <label>
          Type DELETE to confirm
          <input
            value={deleteConfirmation}
            onChange={(e) => onDeleteConfirmationChange(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            disabled={deletePending}
          />
        </label>
        <button type="submit" className="danger" disabled={deletePending || deleteConfirmation.trim() !== 'DELETE'}>
          {deletePending ? 'Deleting account...' : 'Delete my account'}
        </button>
      </form>
    </section>
  )
}

export default SettingsPage
