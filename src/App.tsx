import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  TwitterAuthProvider,
  type User,
} from 'firebase/auth'
import { Link, useLocation } from 'react-router-dom'
import './App.css'
import { auth, functions } from './lib/firebase'
import SettingsPage, { type SettingsBlockedUser, type SettingsReportReason } from './pages/SettingsPage'

type Match = {
  otherUid: string
  otherUsername: string
  createdAt?: unknown
}

type SentAdmirer = {
  toUid: string
  toUsername: string
  revealed: boolean
  createdAt?: unknown | null
  matchedAt?: unknown | null
}

type Dashboard = {
  username: string | null
  incomingCount: number
  outgoingCount: number
  maxOutgoing: number
  matches: Match[]
  sentAdmirers?: SentAdmirer[]
  consentRequired: boolean
  blockedUsers: SettingsBlockedUser[]
}

type SyncXProfileResponse = {
  username: string
}

type AddAdmirerRequest = {
  toUsername: string
}

type AddAdmirerResponse = {
  match: boolean
  toUsername: string
}

type AcceptPoliciesResponse = {
  ok: boolean
  privacyVersion: string
  termsVersion: string
  acceptedAt: unknown
}

type ReportUserRequest = {
  targetUsername: string
  reason: SettingsReportReason
  details?: string
}

type ReportUserResponse = {
  ok: boolean
  reportId: string
}

type BlockUserRequest = {
  targetUsername: string
}

type BlockUserResponse = {
  ok: boolean
  blockedUid: string
  blockedUsername: string
}

type UnblockUserResponse = {
  ok: boolean
}

type DeleteMyAccountRequest = {
  confirmation: 'DELETE'
}

type DeleteMyAccountResponse = {
  ok: boolean
}

const X_USERNAME_REGEX = /^[a-z0-9_]{1,15}$/

const REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/web-storage-unsupported',
  'auth/operation-not-supported-in-this-environment',
])

function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().toLowerCase().replace(/^@+/, '')
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }

  return fallback
}

function readErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code
  }

  return ''
}

function shouldFallbackToRedirect(error: unknown): boolean {
  return REDIRECT_FALLBACK_CODES.has(readErrorCode(error))
}

function hasXProvider(user: User): boolean {
  return user.providerData.some((provider) => provider.providerId === 'twitter.com')
}

function App() {
  const location = useLocation()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [loginPending, setLoginPending] = useState(false)
  const [profileSyncing, setProfileSyncing] = useState(false)
  const [consentPending, setConsentPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loginConsentChecked, setLoginConsentChecked] = useState(false)

  const [toUsername, setToUsername] = useState('')
  const [addPending, setAddPending] = useState(false)

  const [reportUsername, setReportUsername] = useState('')
  const [reportReason, setReportReason] = useState<SettingsReportReason>('harassment')
  const [reportDetails, setReportDetails] = useState('')
  const [reportPending, setReportPending] = useState(false)

  const [blockUsername, setBlockUsername] = useState('')
  const [blockPending, setBlockPending] = useState(false)
  const [unblockPendingUid, setUnblockPendingUid] = useState('')

  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletePending, setDeletePending] = useState(false)

  const autoSyncAttemptedRef = useRef<Set<string>>(new Set())
  const dashboardRequestIdRef = useRef(0)
  const isSettingsPage = location.pathname === '/settings'

  const syncXProfile = useMemo(
    () => httpsCallable<Record<string, never>, SyncXProfileResponse>(functions, 'syncXProfile'),
    []
  )
  const addAdmirer = useMemo(
    () => httpsCallable<AddAdmirerRequest, AddAdmirerResponse>(functions, 'addAdmirer'),
    []
  )
  const getDashboard = useMemo(() => httpsCallable<Record<string, never>, Dashboard>(functions, 'getDashboard'), [])
  const acceptPolicies = useMemo(
    () => httpsCallable<Record<string, never>, AcceptPoliciesResponse>(functions, 'acceptPolicies'),
    []
  )
  const reportUser = useMemo(
    () => httpsCallable<ReportUserRequest, ReportUserResponse>(functions, 'reportUser'),
    []
  )
  const blockUser = useMemo(
    () => httpsCallable<BlockUserRequest, BlockUserResponse>(functions, 'blockUser'),
    []
  )
  const unblockUser = useMemo(
    () => httpsCallable<BlockUserRequest, UnblockUserResponse>(functions, 'unblockUser'),
    []
  )
  const deleteMyAccount = useMemo(
    () => httpsCallable<DeleteMyAccountRequest, DeleteMyAccountResponse>(functions, 'deleteMyAccount'),
    []
  )

  const refreshDashboard = useCallback(async (): Promise<Dashboard | null> => {
    const requestId = ++dashboardRequestIdRef.current
    const result = await getDashboard({})

    if (requestId !== dashboardRequestIdRef.current) {
      return null
    }

    const data = result.data
    setDashboard({
      ...data,
      consentRequired: Boolean(data.consentRequired),
      blockedUsers: data.blockedUsers || [],
      sentAdmirers: data.sentAdmirers || [],
      matches: data.matches || [],
    })
    return data
  }, [getDashboard])

  const syncProfile = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const result = await syncXProfile({})
      const syncedUsername = result.data.username

      if (!silent) {
        setNotice(`Connected as @${syncedUsername}`)
      }

      return syncedUsername
    },
    [syncXProfile]
  )

  useEffect(() => {
    let active = true

    const initRedirectAuth = async () => {
      try {
        await getRedirectResult(auth)
      } catch (err: unknown) {
        if (active) {
          setError(readErrorMessage(err, 'X login failed. Please try again.'))
        }
      }
    }

    void initRedirectAuth()

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      try {
        if (!active) {
          return
        }

        setError('')

        if (!nextUser) {
          setUser(null)
          setDashboard(null)
          setProfileSyncing(false)
          setLoginPending(false)
          return
        }

        if (!hasXProvider(nextUser)) {
          await signOut(auth)
          setUser(null)
          setDashboard(null)
          setProfileSyncing(false)
          return
        }

        setUser(nextUser)
        setProfileSyncing(true)

        const dashboardData = await refreshDashboard()
        if (!dashboardData || dashboardData.username) {
          return
        }

        if (autoSyncAttemptedRef.current.has(nextUser.uid)) {
          return
        }

        autoSyncAttemptedRef.current.add(nextUser.uid)
        await syncProfile({ silent: true })
        await refreshDashboard()
      } catch (err: unknown) {
        if (active) {
          setError(readErrorMessage(err, 'Could not load your dashboard.'))
        }
      } finally {
        if (active) {
          setProfileSyncing(false)
          setLoading(false)
        }
      }
    })

    return () => {
      active = false
      unsub()
    }
  }, [refreshDashboard, syncProfile])

  const handleLoginWithX = async () => {
    if (!loginConsentChecked) {
      setError('Please agree to Privacy Policy and Terms before continuing.')
      return
    }

    setError('')
    setNotice('')
    setLoginPending(true)
    const provider = new TwitterAuthProvider()

    try {
      await signInWithPopup(auth, provider)
    } catch (err: unknown) {
      if (shouldFallbackToRedirect(err)) {
        await signInWithRedirect(auth, provider)
        return
      }

      setError(readErrorMessage(err, 'Could not log in with X.'))
    } finally {
      setLoginPending(false)
    }
  }

  const handleSignOut = async () => {
    setError('')
    setNotice('')
    setAddPending(false)
    try {
      await signOut(auth)
      setDashboard(null)
      setNotice('Signed out.')
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not sign out.'))
    }
  }

  const handleRetryProfileSync = async () => {
    setError('')
    setNotice('')

    try {
      setProfileSyncing(true)
      await syncProfile()
      await refreshDashboard()
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not verify your X username from this session.'))
    } finally {
      setProfileSyncing(false)
    }
  }

  const handleAcceptPolicies = async () => {
    setError('')
    setNotice('')

    try {
      setConsentPending(true)
      await acceptPolicies({})
      await refreshDashboard()
      setNotice('Thanks. Privacy Policy and Terms accepted.')
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not record policy consent.'))
    } finally {
      setConsentPending(false)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (addPending) {
      return
    }

    setError('')
    setNotice('')
    const normalizedToUsername = normalizeUsername(toUsername)

    if (!X_USERNAME_REGEX.test(normalizedToUsername)) {
      setError('Enter a valid X username before adding.')
      return
    }

    setAddPending(true)
    try {
      const res = await addAdmirer({ toUsername: normalizedToUsername })
      const data = res.data

      if (data.match) {
        setNotice(`It's a match. You and @${data.toUsername} liked each other.`)
      } else {
        setNotice(`Secret admirer added for @${data.toUsername}`)
      }

      setToUsername('')
      await refreshDashboard()
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not add admirer.'))
    } finally {
      setAddPending(false)
    }
  }

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (reportPending) {
      return
    }

    setError('')
    setNotice('')
    const normalizedTarget = normalizeUsername(reportUsername)

    if (!X_USERNAME_REGEX.test(normalizedTarget)) {
      setError('Enter a valid X username to report.')
      return
    }

    setReportPending(true)
    try {
      const result = await reportUser({
        targetUsername: normalizedTarget,
        reason: reportReason,
        details: reportDetails.trim() ? reportDetails.trim() : undefined,
      })

      setReportUsername('')
      setReportDetails('')
      setReportReason('harassment')
      setNotice(`Report submitted. Reference: ${result.data.reportId}`)
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not submit report.'))
    } finally {
      setReportPending(false)
    }
  }

  const handleBlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (blockPending) {
      return
    }

    setError('')
    setNotice('')
    const normalizedTarget = normalizeUsername(blockUsername)

    if (!X_USERNAME_REGEX.test(normalizedTarget)) {
      setError('Enter a valid X username to block.')
      return
    }

    setBlockPending(true)
    try {
      const result = await blockUser({ targetUsername: normalizedTarget })
      setBlockUsername('')
      await refreshDashboard()
      setNotice(`Blocked @${result.data.blockedUsername}`)
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not block this user.'))
    } finally {
      setBlockPending(false)
    }
  }

  const handleUnblock = async (targetUsername: string, targetUid: string) => {
    if (unblockPendingUid) {
      return
    }

    setError('')
    setNotice('')
    setUnblockPendingUid(targetUid)

    try {
      await unblockUser({ targetUsername })
      await refreshDashboard()
      setNotice(`Unblocked @${targetUsername}`)
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not unblock this user.'))
    } finally {
      setUnblockPendingUid('')
    }
  }

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (deletePending) {
      return
    }

    setError('')
    setNotice('')

    if (deleteConfirmation.trim() !== 'DELETE') {
      setError('Type DELETE exactly to confirm account deletion.')
      return
    }

    setDeletePending(true)
    try {
      await deleteMyAccount({ confirmation: 'DELETE' })
      setDashboard(null)
      setDeleteConfirmation('')
      try {
        await signOut(auth)
      } catch {
        // Ignore local sign-out race after auth record deletion.
      }
      setNotice('Account deleted.')
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not delete account.'))
    } finally {
      setDeletePending(false)
    }
  }

  const consentRequired = Boolean(dashboard?.consentRequired)
  const hasSyncedProfile = Boolean(dashboard?.username)

  const canAdd =
    hasSyncedProfile &&
    !consentRequired &&
    X_USERNAME_REGEX.test(normalizeUsername(toUsername)) &&
    (dashboard?.outgoingCount ?? 0) < (dashboard?.maxOutgoing ?? 5)

  const canUseSafetyTools = hasSyncedProfile && !consentRequired

  const needsProfileResync = !!user && !profileSyncing && !dashboard?.username
  const setupInProgress = !!user && profileSyncing && !dashboard?.username

  if (loading || setupInProgress) {
    return (
      <main className="page">
        <section className="hero hero-shell">
          <h1>Secret Admirer</h1>
          <p className="lead">{setupInProgress ? 'Setting up your profile...' : 'Preparing your private space...'}</p>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="page">
        <section className="hero hero-shell">
          <p className="eyebrow">Private by design</p>
          <h1>Secret Admirer</h1>
          <p className="lead">
            Log in with X, add usernames of people you like, and reveal names only when both people choose each other.
          </p>

          <label className="consent-row">
            <input
              type="checkbox"
              checked={loginConsentChecked}
              onChange={(e) => setLoginConsentChecked(e.target.checked)}
            />
            <span>
              By continuing, you agree to the <Link to="/privacy">Privacy Policy</Link> and{' '}
              <Link to="/terms">Terms & Acceptable Use</Link>.
            </span>
          </label>

          <div className="hero-actions">
            <button type="button" className="primary" onClick={handleLoginWithX} disabled={loginPending || !loginConsentChecked}>
              {loginPending ? 'Connecting to X...' : 'Continue with X'}
            </button>
          </div>
        </section>

        <footer className="app-footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms & Acceptable Use</Link>
        </footer>

        {error && <p className="alert alert-error">{error}</p>}
        {notice && <p className="alert alert-success">{notice}</p>}
      </main>
    )
  }

  if (consentRequired) {
    return (
      <main className="page">
        <header className="hero">
          <div>
            <p className="eyebrow">Secret Admirer</p>
            <h1>Review and accept policies to continue</h1>
            <p className="lead">Before using core app features, please accept our Privacy Policy and Terms.</p>
          </div>
          <div className="hero-actions">
            {dashboard?.username ? (
              <span className="handle-chip">@{dashboard.username}</span>
            ) : (
              <span className="handle-chip handle-chip-muted">Profile setup</span>
            )}
            <button type="button" className="ghost" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <section className="grid">
          <article className="card">
            <h2>Required consent</h2>
            <p className="muted">By continuing, you agree to our policy documents.</p>
            <p className="muted">
              Review: <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms & Acceptable Use</Link>.
            </p>
            <button type="button" className="primary" onClick={handleAcceptPolicies} disabled={consentPending}>
              {consentPending ? 'Saving consent...' : 'I agree and continue'}
            </button>
          </article>
        </section>

        <footer className="app-footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms & Acceptable Use</Link>
        </footer>

        {error && <p className="alert alert-error">{error}</p>}
        {notice && <p className="alert alert-success">{notice}</p>}
      </main>
    )
  }

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Secret Admirer</p>
          <h1>{isSettingsPage ? 'Settings and account controls' : 'Mutual feelings, revealed only on a match.'}</h1>
          <p className="lead">
            {isSettingsPage
              ? 'Manage reporting, blocking, and account controls separately from your main dashboard.'
              : 'Add X usernames privately. Names unlock for both people only when admiration is mutual.'}
          </p>
        </div>
        <div className="hero-actions">
          {dashboard?.username ? (
            <span className="handle-chip">@{dashboard.username}</span>
          ) : (
            <span className="handle-chip handle-chip-muted">Profile setup</span>
          )}
          {isSettingsPage ? (
            <Link className="ghost-link" to="/">
              Back to dashboard
            </Link>
          ) : (
            <Link className="ghost-link" to="/settings">
              Settings
            </Link>
          )}
          <button type="button" className="ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="alert alert-error">{error}</p>}
      {notice && <p className="alert alert-success">{notice}</p>}

      {isSettingsPage ? (
        <SettingsPage
          canUseSafetyTools={canUseSafetyTools}
          reportUsername={reportUsername}
          reportReason={reportReason}
          reportDetails={reportDetails}
          reportPending={reportPending}
          onReportSubmit={handleReport}
          onReportUsernameChange={(value) => setReportUsername(normalizeUsername(value))}
          onReportReasonChange={setReportReason}
          onReportDetailsChange={(value) => setReportDetails(value.slice(0, 500))}
          blockUsername={blockUsername}
          blockPending={blockPending}
          onBlockSubmit={handleBlock}
          onBlockUsernameChange={(value) => setBlockUsername(normalizeUsername(value))}
          blockedUsers={dashboard?.blockedUsers || []}
          unblockPendingUid={unblockPendingUid}
          onUnblock={handleUnblock}
          deleteConfirmation={deleteConfirmation}
          deletePending={deletePending}
          onDeleteSubmit={handleDeleteAccount}
          onDeleteConfirmationChange={setDeleteConfirmation}
        />
      ) : (
        <section className="grid">
          <article className="card">
            <h2>Your dashboard</h2>
            <div className="stats-grid">
              <div className="stat">
                <p>Secret admirers</p>
                <strong>{dashboard?.incomingCount ?? 0}</strong>
              </div>
              <div className="stat">
                <p>Sent</p>
                <strong>
                  {dashboard?.outgoingCount ?? 0} / {dashboard?.maxOutgoing ?? 5}
                </strong>
              </div>
              <div className="stat">
                <p>Matches</p>
                <strong>{dashboard?.matches?.length ?? 0}</strong>
              </div>
            </div>

            <h3>Revealed matches</h3>
            {dashboard?.matches?.length ? (
              <ul className="matches">
                {dashboard.matches.map((match) => (
                  <li key={match.otherUid}>@{match.otherUsername}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">No matches yet.</p>
            )}

            <h3>Sent crushes</h3>
            {dashboard?.sentAdmirers?.length ? (
              <ul className="sent-crushes">
                {dashboard.sentAdmirers.map((sent) => (
                  <li key={sent.toUid}>
                    <span className="sent-handle">@{sent.toUsername}</span>
                    <span className={`status-pill ${sent.revealed ? 'status-pill-match' : 'status-pill-pending'}`}>
                      {sent.revealed ? 'Matched' : 'Pending'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No crushes added yet.</p>
            )}
          </article>

          <form className="card" onSubmit={handleAdd} aria-busy={addPending}>
            <h2>Add a crush</h2>
            <p className="muted">Use their X username. We reveal names only when both sides match.</p>
            <label>
              X username
              <div className="username-input">
                <span className="username-prefix">@</span>
                <input
                  className="username-input-field"
                  value={toUsername}
                  onChange={(e) => setToUsername(normalizeUsername(e.target.value))}
                  placeholder="@username"
                  autoComplete="off"
                  disabled={addPending}
                />
              </div>
            </label>
            <p className="field-hint">You can type `username` or `@username`.</p>
            <button type="submit" className="primary" disabled={addPending || !canAdd}>
              <span className="button-content">
                {addPending && <span className="spinner" aria-hidden="true" />}
                {addPending ? 'Adding...' : 'Add admirer'}
              </span>
            </button>
            {(dashboard?.outgoingCount ?? 0) >= (dashboard?.maxOutgoing ?? 5) && (
              <p className="muted">You reached your admirer limit.</p>
            )}
            {!dashboard?.username && <p className="muted">Finish profile setup before adding admirers.</p>}
          </form>

          {needsProfileResync && (
            <article className="card">
              <h2>Finish profile setup</h2>
              <p className="muted">
                We could not verify your X username from this session. Sign out and sign in again, then retry.
              </p>
              <button type="button" className="primary" onClick={handleRetryProfileSync} disabled={profileSyncing}>
                {profileSyncing ? 'Retrying...' : 'Retry profile sync'}
              </button>
            </article>
          )}
        </section>
      )}

      <footer className="app-footer-links">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms & Acceptable Use</Link>
      </footer>
    </main>
  )
}

export default App
