type StatusAlertsProps = {
  error: string
  notice: string
}

function StatusAlerts({ error, notice }: StatusAlertsProps) {
  if (!error && !notice) {
    return null
  }

  return (
    <section className="status-stack" aria-live="polite" aria-atomic="true">
      {error ? <p className="status-alert status-alert-error">{error}</p> : null}
      {notice ? <p className="status-alert status-alert-success">{notice}</p> : null}
    </section>
  )
}

export default StatusAlerts
