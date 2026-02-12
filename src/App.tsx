import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import {
  getAdditionalUserInfo,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  TwitterAuthProvider,
  type User,
  type UserCredential,
} from 'firebase/auth'
import './App.css'
import { auth, functions } from './lib/firebase'

type Dashboard = {
  username: string | null
  incomingCount: number
  outgoingCount: number
  maxOutgoing: number
  matches: { otherUid: string; otherUsername: string; createdAt?: unknown }[]
}

type SyncXProfileRequest = {
  username?: string
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

function toValidXUsername(value: unknown): string | null {
  const normalized = normalizeUsername(value)
  return X_USERNAME_REGEX.test(normalized) ? normalized : null
}

function firstValidXUsername(values: unknown[]): string | null {
  for (const value of values) {
    const username = toValidXUsername(value)
    if (username) {
      return username
    }
  }

  return null
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

function extractUsernameFromCredential(credential: UserCredential): string | null {
  const additionalInfo = getAdditionalUserInfo(credential)
  const profile = additionalInfo?.profile

  return firstValidXUsername([
    additionalInfo?.username,
    profile && typeof profile === 'object' ? (profile as Record<string, unknown>).screen_name : null,
    profile && typeof profile === 'object' ? (profile as Record<string, unknown>).username : null,
  ])
}

function extractUsernameFromUser(user: User): string | null {
  const reloadUserInfo = (user as User & { reloadUserInfo?: Record<string, unknown> }).reloadUserInfo

  return firstValidXUsername([
    reloadUserInfo?.screenName,
    reloadUserInfo?.screen_name,
    reloadUserInfo?.username,
  ])
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [loginPending, setLoginPending] = useState(false)
  const [profileSyncing, setProfileSyncing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [manualUsername, setManualUsername] = useState('')
  const [toUsername, setToUsername] = useState('')

  const pendingSyncUsernameRef = useRef<string | null>(null)
  const autoSyncAttemptedRef = useRef<Set<string>>(new Set())
  const dashboardRequestIdRef = useRef(0)

  const syncXProfile = useMemo(
    () => httpsCallable<SyncXProfileRequest, SyncXProfileResponse>(functions, 'syncXProfile'),
    []
  )
  const addAdmirer = useMemo(
    () => httpsCallable<AddAdmirerRequest, AddAdmirerResponse>(functions, 'addAdmirer'),
    []
  )
  const getDashboard = useMemo(
    () => httpsCallable<Record<string, never>, Dashboard>(functions, 'getDashboard'),
    []
  )

  const refreshDashboard = useCallback(async (): Promise<Dashboard | null> => {
    const requestId = ++dashboardRequestIdRef.current
    const result = await getDashboard({})

    if (requestId !== dashboardRequestIdRef.current) {
      return null
    }

    setDashboard(result.data)
    return result.data
  }, [getDashboard])

  const syncProfile = useCallback(
    async ({ username, silent = false }: { username?: string; silent?: boolean } = {}) => {
      const payload = username ? { username } : {}
      const result = await syncXProfile(payload)
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
        if (redirectResult) {
          pendingSyncUsernameRef.current = extractUsernameFromCredential(redirectResult)
        }
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
          setManualUsername('')
          return
        }

        if (!hasXProvider(nextUser)) {
          await signOut(auth)
          setUser(null)
          setDashboard(null)
          setProfileSyncing(false)
          setManualUsername('')
          return
        }

        setUser(nextUser)
        setProfileSyncing(true)

        const dashboardData = await refreshDashboard()
        if (!dashboardData || dashboardData.username) {
          pendingSyncUsernameRef.current = null
          return
        }

        if (autoSyncAttemptedRef.current.has(nextUser.uid)) {
          return
        }

        const usernameHint = pendingSyncUsernameRef.current || extractUsernameFromUser(nextUser)
        if (!usernameHint) {
          autoSyncAttemptedRef.current.add(nextUser.uid)
          return
        }

        autoSyncAttemptedRef.current.add(nextUser.uid)
        await syncProfile({ username: usernameHint, silent: true })
        pendingSyncUsernameRef.current = null
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
    setError('')
    setNotice('')
    setLoginPending(true)
    const provider = new TwitterAuthProvider()

    try {
      const result = await signInWithPopup(auth, provider)
      pendingSyncUsernameRef.current = extractUsernameFromCredential(result)
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
    try {
      await signOut(auth)
      setDashboard(null)
      setManualUsername('')
      setNotice('Signed out.')
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not sign out.'))
    }
  }

  const handleManualSync = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')

    const normalizedUsername = normalizeUsername(manualUsername)
    if (!X_USERNAME_REGEX.test(normalizedUsername)) {
      setError('Please enter a valid X username (1-15 characters, letters, numbers, and _).')
      return
    }

    try {
      await syncProfile({ username: normalizedUsername })
      setManualUsername('')
      await refreshDashboard()
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Could not sync your X username.'))
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    const normalizedToUsername = normalizeUsername(toUsername)

    if (!X_USERNAME_REGEX.test(normalizedToUsername)) {
      setError('Enter a valid X username before adding.')
      return
    }

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
    }
  }

  const canAdd =
    !!dashboard?.username &&
    X_USERNAME_REGEX.test(normalizeUsername(toUsername)) &&
    (dashboard?.outgoingCount ?? 0) < (dashboard?.maxOutgoing ?? 5)

  const needsManualSync = !!user && !profileSyncing && !dashboard?.username
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
            Log in with X, add usernames of people you like, and reveal names only when both people choose each
            other.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary" onClick={handleLoginWithX} disabled={loginPending}>
              {loginPending ? 'Connecting to X...' : 'Continue with X'}
            </button>
          </div>
        </section>

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
          <h1>Mutual feelings, revealed only on a match.</h1>
          <p className="lead">
            Add X usernames privately. Names unlock for both people only when the admiration is mutual.
          </p>
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

      {error && <p className="alert alert-error">{error}</p>}
      {notice && <p className="alert alert-success">{notice}</p>}

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
        </article>

        <form className="card" onSubmit={handleAdd}>
          <h2>Add a crush</h2>
          <p className="muted">Use their X username. We'll reveal names only if both sides match.</p>
          <label>
            X username
            <input
              value={toUsername}
              onChange={(e) => setToUsername(e.target.value)}
              placeholder="@username"
              autoComplete="off"
            />
          </label>
          <button type="submit" className="primary" disabled={!canAdd}>
            Add admirer
          </button>
          {(dashboard?.outgoingCount ?? 0) >= (dashboard?.maxOutgoing ?? 5) && (
            <p className="muted">You reached your admirer limit.</p>
          )}
          {!dashboard?.username && (
            <p className="muted">Finish profile setup before adding admirers.</p>
          )}
        </form>

        {needsManualSync && (
          <form className="card" onSubmit={handleManualSync}>
            <h2>Confirm your X username</h2>
            <p className="muted">We could not auto-read your handle in this session. Enter it once to continue.</p>
            <label>
              Your X username
              <input
                value={manualUsername}
                onChange={(e) => setManualUsername(e.target.value)}
                placeholder="e.g. shivamk3r"
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              className="primary"
              disabled={!X_USERNAME_REGEX.test(normalizeUsername(manualUsername))}
            >
              Save username
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

export default App
