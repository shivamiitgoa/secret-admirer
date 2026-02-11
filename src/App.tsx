import { useMemo, useState } from 'react'
import './App.css'

type Hint = {
  text: string
  day: string
}

function App() {
  const [recipient, setRecipient] = useState('')
  const [message, setMessage] = useState('')
  const [vibe, setVibe] = useState('sweet')
  const [submitted, setSubmitted] = useState(false)

  const hints: Hint[] = useMemo(
    () => [
      { text: 'We crossed paths near coffee more than once ☕', day: 'Day 1' },
      { text: 'I notice the little things you do for people 🌟', day: 'Day 2' },
      { text: 'You make ordinary days feel better 💫', day: 'Day 3' },
    ],
    []
  )

  const canSubmit = recipient.trim().length >= 3 && message.trim().length >= 8

  const submitNote = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitted(true)
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="badge">Valentine MVP</p>
        <h1>Secret Admirer 💌</h1>
        <p>
          Send a gentle anonymous note. Identity is revealed only when both sides
          opt in.
        </p>
      </section>

      <section className="grid">
        <form className="card" onSubmit={submitNote}>
          <h2>Send anonymous note</h2>
          <label>
            Recipient username/email
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="e.g. priya@college.edu"
            />
          </label>

          <label>
            Message
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="I like your energy and your smile..."
            />
          </label>

          <label>
            Vibe
            <select value={vibe} onChange={(e) => setVibe(e.target.value)}>
              <option value="sweet">Sweet</option>
              <option value="playful">Playful</option>
              <option value="poetic">Poetic</option>
            </select>
          </label>

          <button type="submit" disabled={!canSubmit}>
            Send secretly
          </button>

          {submitted && (
            <p className="success">
              Note queued ✅ Recipient gets a private link with hint drops.
            </p>
          )}
        </form>

        <article className="card">
          <h2>How reveal works</h2>
          <ol>
            <li>Recipient reads anonymous note + timed hints.</li>
            <li>They can respond, ignore, block, or report.</li>
            <li>Identity reveals only on mutual opt-in.</li>
          </ol>

          <h3>Example hint sequence</h3>
          <ul>
            {hints.map((hint) => (
              <li key={hint.day}>
                <strong>{hint.day}:</strong> {hint.text}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <footer>
        Built with React + Firebase Hosting. Next: Auth, Firestore, Functions.
      </footer>
    </main>
  )
}

export default App
