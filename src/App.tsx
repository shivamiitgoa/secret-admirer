import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import './App.css'
import { auth, functions } from './lib/firebase'

type Dashboard = {
  username: string | null
  incomingCount: number
  outgoingCount: number
  maxOutgoing: number
  matches: { otherUid: string; otherUsername: string; createdAt?: unknown }[]
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)

  const [usernameInput, setUsernameInput] = useState('')
  const [toUsername, setToUsername] = useState('')
  const [message, setMessage] = useState('')

  const claimUsername = useMemo(() => httpsCallable(functions, 'claimUsername'), [])
  const addAdmirer = useMemo(() => httpsCallable(functions, 'addAdmirer'), [])
  const getDashboard = useMemo(() => httpsCallable(functions, 'getDashboard'), [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        await signInAnonymously(auth)
        return
      }
      setUser(nextUser)
      await refreshDashboard()
      setLoading(false)
    })

    return () => unsub()
  }, [])

  const refreshDashboard = async () => {
    const result = await getDashboard()
    setDashboard(result.data as Dashboard)
  }

  const handleClaimUsername = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    try {
      const res = await claimUsername({ username: usernameInput })
      const data = res.data as { username: string }
      setNotice(`Username set: @${data.username}`)
      setUsernameInput('')
      await refreshDashboard()
    } catch (err: any) {
      setError(err?.message || 'Could not claim username.')
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    try {
      const res = await addAdmirer({ toUsername, message })
      const data = res.data as { match: boolean; toUsername: string }
      if (data.match) {
        setNotice(`It’s a match 💘 You and @${data.toUsername} liked each other.`)
      } else {
        setNotice(`Secret admirer added for @${data.toUsername}`)
      }
      setToUsername('')
      setMessage('')
      await refreshDashboard()
    } catch (err: any) {
      setError(err?.message || 'Could not add admirer.')
    }
  }

  const canAdd =
    !!dashboard?.username &&
    toUsername.trim().length >= 3 &&
    (dashboard?.outgoingCount ?? 0) < (dashboard?.maxOutgoing ?? 5)

  if (loading) {
    return <main className="page"><p>Loading…</p></main>
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="badge">Phase 1 live</p>
        <h1>Secret Admirer 💌</h1>
        <p>Username-first anonymous crush app. Reveal only on 2-way match.</p>
        <p className="muted">Signed in as uid: {user?.uid}</p>
      </section>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <section className="grid">
        <article className="card">
          <h2>Dashboard</h2>
          <p><strong>Your username:</strong> {dashboard?.username ? `@${dashboard.username}` : 'Not set'}</p>
          <p><strong>Secret admirers:</strong> {dashboard?.incomingCount ?? 0}</p>
          <p><strong>Sent:</strong> {dashboard?.outgoingCount ?? 0} / {dashboard?.maxOutgoing ?? 5}</p>
          <h3>Matches</h3>
          {dashboard?.matches?.length ? (
            <ul>
              {dashboard.matches.map((m) => (
                <li key={m.otherUid}>@{m.otherUsername}</li>
              ))}
            </ul>
          ) : (
            <p>No matches yet.</p>
          )}
        </article>

        <form className="card" onSubmit={handleClaimUsername}>
          <h2>Claim username</h2>
          <label>
            Instagram username
            <input
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="e.g. shivamk3r"
            />
          </label>
          <button type="submit" disabled={usernameInput.trim().length < 3}>Save username</button>
        </form>

        <form className="card" onSubmit={handleAdd}>
          <h2>Add secret admirer</h2>
          <label>
            Their username
            <input
              value={toUsername}
              onChange={(e) => setToUsername(e.target.value)}
              placeholder="@username"
            />
          </label>
          <label>
            Optional message
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={300}
              placeholder="Totally optional. Keep it kind."
            />
          </label>
          <button type="submit" disabled={!canAdd}>Add admirer</button>
          {(dashboard?.outgoingCount ?? 0) >= (dashboard?.maxOutgoing ?? 5) && (
            <p className="muted">You reached the 5 admirer limit.</p>
          )}
        </form>
      </section>
    </main>
  )
}

export default App
