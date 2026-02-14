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
import { ArrowLeft, LogOut, Settings2 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import AuthGateSection from './components/sections/AuthGateSection'
import ConsentGateSection from './components/sections/ConsentGateSection'
import DashboardSection from './components/sections/DashboardSection'
import LoadingScreen from './components/common/LoadingScreen'
import StatusAlerts from './components/common/StatusAlerts'
import AppShell from './components/layout/AppShell'
import { auth, functions } from './lib/firebase'
import SettingsPage, { type SettingsBlockedUser, type SettingsReportReason } from './pages/SettingsPage'

type Match = {
  otherUid: string
  otherUsername: string
  createdAt?: unknown
}

type SentAdmirer = {
  id: string
  toUid?: string | null
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

type DashboardViewModel = {
  username: string | null
  incomingCount: number
  outgoingCount: number
  maxOutgoing: number
  matches: Match[]
  sentAdmirers: SentAdmirer[]
  blockedUsers: SettingsBlockedUser[]
  consentRequired: boolean
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
const AUTH_REDIRECT_RECOVERY_KEY = 'mw_auth_redirect_recovery'

const REDIRECT_RECOVERY_CODES = new Set([
  'auth/popup-blocked',
  'auth/web-storage-unsupported',
  'auth/operation-not-supported-in-this-environment',
])

const SOFT_LOGIN_CANCEL_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])

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

function shouldRecoverWithRedirect(error: unknown): boolean {
  return REDIRECT_RECOVERY_CODES.has(readErrorCode(error))
}

function hasXProvider(user: User): boolean {
  return user.providerData.some((provider) => provider.providerId === 'twitter.com')
}

function hasLoginRedirectRecovery(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.sessionStorage.getItem(AUTH_REDIRECT_RECOVERY_KEY) === '1'
  } catch {
    return false
  }
}

function setLoginRedirectRecovery(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(AUTH_REDIRECT_RECOVERY_KEY, '1')
  } catch {
    // Ignore storage failures; fallback still works.
  }
}

function clearLoginRedirectRecovery(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.removeItem(AUTH_REDIRECT_RECOVERY_KEY)
  } catch {
    // Ignore storage failures; this key is best-effort only.
  }
}

function readLoginErrorMessage(error: unknown, fallback: string): string {
  const code = readErrorCode(error)

  if (SOFT_LOGIN_CANCEL_CODES.has(code)) {
    return "Couldn't complete popup sign-in. Please try again."
  }

  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized for X login.'
  }

  if (code === 'auth/web-storage-unsupported') {
    return 'This browser does not support required storage for login.'
  }

  if (code === 'auth/internal-error') {
    return 'Could not complete X login. Please try again.'
  }

  return readErrorMessage(error, fallback)
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
  const [unblockPendingId, setUnblockPendingId] = useState('')

  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletePending, setDeletePending] = useState(false)

  const autoSyncAttemptedRef = useRef<Set<string>>(new Set())
  const dashboardRequestIdRef = useRef(0)
  const announcedToastRef = useRef({ error: '', notice: '' })
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
        const redirectResult = await getRedirectResult(auth)
        if (redirectResult?.user) {
          clearLoginRedirectRecovery()
        }
      } catch (err: unknown) {
        if (active) {
          if (SOFT_LOGIN_CANCEL_CODES.has(readErrorCode(err))) {
            setNotice('Sign-in was cancelled. Continue with X when you are ready.')
          } else {
            setError(readLoginErrorMessage(err, 'X login failed. Please try again.'))
          }
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
        setLoginPending(false)
        clearLoginRedirectRecovery()
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

  useEffect(() => {
    if (error && announcedToastRef.current.error !== error) {
      toast.error(error)
      announcedToastRef.current.error = error
    }

    if (!error) {
      announcedToastRef.current.error = ''
    }

    if (notice && announcedToastRef.current.notice !== notice) {
      toast.success(notice)
      announcedToastRef.current.notice = notice
    }

    if (!notice) {
      announcedToastRef.current.notice = ''
    }
  }, [error, notice])

  const handleLoginWithX = async () => {
    if (!loginConsentChecked) {
      setError('Please agree to Privacy Policy and Terms before continuing.')
      return
    }

    clearLoginRedirectRecovery()
    setError('')
    setNotice('')
    setLoginPending(true)
    const provider = new TwitterAuthProvider()

    try {
      await signInWithPopup(auth, provider)
      clearLoginRedirectRecovery()
    } catch (err: unknown) {
      const code = readErrorCode(err)

      if (auth.currentUser) {
        clearLoginRedirectRecovery()
        return
      }

      if (shouldRecoverWithRedirect(err)) {
        if (!hasLoginRedirectRecovery()) {
          setLoginRedirectRecovery()
          setNotice('Completing sign-in...')
          await signInWithRedirect(auth, provider)
          return
        }
      }

      if (SOFT_LOGIN_CANCEL_CODES.has(code)) {
        setNotice('Sign-in was cancelled. Continue with X when you are ready.')
        return
      }

      setError(readLoginErrorMessage(err, 'Could not log in with X.'))
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
      clearLoginRedirectRecovery()
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

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault()
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
        setNotice(`Signal sent to @${data.toUsername}`)
      }

      setToUsername('')
      await refreshDashboard()
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not send signal.'))
    } finally {
      setAddPending(false)
    }
  }

  const handleReport = async (event: React.FormEvent) => {
    event.preventDefault()
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

  const handleBlock = async (event: React.FormEvent) => {
    event.preventDefault()
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

  const handleUnblock = async (targetUsername: string, blockId: string) => {
    if (unblockPendingId) {
      return
    }

    setError('')
    setNotice('')
    setUnblockPendingId(blockId)

    try {
      await unblockUser({ targetUsername })
      await refreshDashboard()
      setNotice(`Unblocked @${targetUsername}`)
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not unblock this user.'))
    } finally {
      setUnblockPendingId('')
    }
  }

  const handleDeleteAccount = async (event: React.FormEvent) => {
    event.preventDefault()
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

  const dashboardView = useMemo<DashboardViewModel>(
    () => ({
      username: dashboard?.username ?? null,
      incomingCount: dashboard?.incomingCount ?? 0,
      outgoingCount: dashboard?.outgoingCount ?? 0,
      maxOutgoing: dashboard?.maxOutgoing ?? 5,
      matches: dashboard?.matches ?? [],
      sentAdmirers: dashboard?.sentAdmirers ?? [],
      blockedUsers: dashboard?.blockedUsers ?? [],
      consentRequired: Boolean(dashboard?.consentRequired),
    }),
    [dashboard]
  )

  const consentRequired = dashboardView.consentRequired
  const hasSyncedProfile = Boolean(dashboardView.username)

  const canAdd =
    hasSyncedProfile &&
    !consentRequired &&
    X_USERNAME_REGEX.test(normalizeUsername(toUsername)) &&
    dashboardView.outgoingCount < dashboardView.maxOutgoing

  const canUseSafetyTools = hasSyncedProfile && !consentRequired

  const needsProfileResync = Boolean(user) && !profileSyncing && !dashboardView.username
  const setupInProgress = Boolean(user) && profileSyncing && !dashboardView.username

  const sharedFooter = (
    <>
      <Link to="/privacy">Privacy Policy</Link>
      <Link to="/terms">Terms & Acceptable Use</Link>
    </>
  )

  if (loading || setupInProgress) {
    return (
      <>
        <Toaster richColors closeButton position="top-right" />
        <LoadingScreen
          title="MutualWink"
          message={setupInProgress ? 'Setting up your profile...' : 'Preparing your mutual reveal space...'}
        />
      </>
    )
  }

  if (!user) {
    return (
      <>
        <Toaster richColors closeButton position="top-right" />
        <AppShell
          sectionLabel="Welcome"
          eyebrow="Mutual Reveal"
          title="Private signals without public pressure"
          subtitle="A trust-first experience where no one can tell whether you have an account, and names reveal only when both people choose each other."
          footer={sharedFooter}
          heroAside={
            <>
              <div className="hero-badge">
                <h3>Consent-first</h3>
                <p>Policy consent and safety controls are visible before any interaction starts.</p>
              </div>
              <div className="hero-badge">
                <h3>Private by default</h3>
                <p>Your crush never knows unless feelings are mutual.</p>
              </div>
            </>
          }
        >
          <StatusAlerts error={error} notice={notice} />
          <AuthGateSection
            loginConsentChecked={loginConsentChecked}
            loginPending={loginPending}
            onConsentChange={setLoginConsentChecked}
            onLogin={handleLoginWithX}
          />
        </AppShell>
      </>
    )
  }

  if (consentRequired) {
    return (
      <>
        <Toaster richColors closeButton position="top-right" />
        <AppShell
          sectionLabel="Consent"
          eyebrow="Trust Gate"
          title="Review and accept policies to continue"
          subtitle="Before using mutual reveal and safety features, please accept our Privacy Policy and Terms."
          username={dashboardView.username}
          actions={
            <button type="button" className="btn btn-secondary" onClick={handleSignOut}>
              <LogOut size={15} aria-hidden="true" />
              Sign out
            </button>
          }
          heroAside={
            <>
              <div className="hero-badge">
                <h3>Privacy in plain terms</h3>
                <p>Clear data handling and retention details for your account.</p>
              </div>
              <div className="hero-badge">
                <h3>Single-step consent</h3>
                <p>Accept once unless policy versions are updated.</p>
              </div>
            </>
          }
          footer={sharedFooter}
        >
          <StatusAlerts error={error} notice={notice} />
          <ConsentGateSection consentPending={consentPending} onAccept={handleAcceptPolicies} />
        </AppShell>
      </>
    )
  }

  return (
    <>
      <Toaster richColors closeButton position="top-right" />
      <AppShell
        sectionLabel={isSettingsPage ? 'Settings' : 'Dashboard'}
        eyebrow={isSettingsPage ? 'Safety and Controls' : 'Mutual Reveal Engine'}
        title={isSettingsPage ? 'Settings and account controls' : 'Mutual feelings, revealed only on a match'}
        subtitle={
          isSettingsPage
            ? 'Manage reporting, blocking, and account controls without mixing them into your daily dashboard.'
            : 'Add X usernames privately. Account presence stays private, and names unlock only when admiration is mutual.'
        }
        username={dashboardView.username}
        actions={
          <>
            {isSettingsPage ? (
              <Link className="btn btn-secondary btn-link" to="/">
                <ArrowLeft size={15} aria-hidden="true" />
                Back to dashboard
              </Link>
            ) : (
              <Link className="btn btn-secondary btn-link" to="/settings">
                <Settings2 size={15} aria-hidden="true" />
                Settings
              </Link>
            )}
            <button type="button" className="btn btn-secondary" onClick={handleSignOut}>
              <LogOut size={15} aria-hidden="true" />
              Sign out
            </button>
          </>
        }
        heroAside={
          <>
            <div className="hero-badge">
              <h3>Real-time clarity</h3>
              <p>Track incoming signals, sent signals, and matches in one private timeline.</p>
            </div>
            <div className="hero-badge">
              <h3>Safety first</h3>
              <p>Report and block actions are always available from settings.</p>
            </div>
          </>
        }
        footer={sharedFooter}
      >
        <StatusAlerts error={error} notice={notice} />

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
            blockedUsers={dashboardView.blockedUsers}
            unblockPendingId={unblockPendingId}
            onUnblock={handleUnblock}
            deleteConfirmation={deleteConfirmation}
            deletePending={deletePending}
            onDeleteSubmit={handleDeleteAccount}
            onDeleteConfirmationChange={setDeleteConfirmation}
          />
        ) : (
          <DashboardSection
            incomingCount={dashboardView.incomingCount}
            outgoingCount={dashboardView.outgoingCount}
            maxOutgoing={dashboardView.maxOutgoing}
            matches={dashboardView.matches}
            sentAdmirers={dashboardView.sentAdmirers}
            toUsername={toUsername}
            addPending={addPending}
            canAdd={canAdd}
            hasSyncedProfile={hasSyncedProfile}
            onToUsernameChange={(value) => setToUsername(normalizeUsername(value))}
            onAddSubmit={handleAdd}
            needsProfileResync={needsProfileResync}
            profileSyncing={profileSyncing}
            onRetryProfileSync={handleRetryProfileSync}
          />
        )}
      </AppShell>
    </>
  )
}

export default App
