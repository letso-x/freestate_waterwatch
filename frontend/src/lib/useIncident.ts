import { useEffect, useState } from 'react'
import { ApiError, getIncident, isIncidentReference } from '../lib/api'
import type { Incident } from '../lib/incidents'

export function useIncident(reference: string | undefined) {
  const [incident, setIncident] = useState<Incident | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setIncident(null)
    setError('')
    if (!reference) { setLoading(false); return }
    if (!isIncidentReference(reference)) { setLoading(false); setError('Enter the full report reference shown on your confirmation.'); return }
    const controller = new AbortController()
    setLoading(true)
    void getIncident(reference, controller.signal).then(record => {
      if (!controller.signal.aborted) setIncident(record)
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof ApiError && cause.status === 404
        ? 'No report was found for this reference. Check the full reference and try again.'
        : cause instanceof Error ? cause.message : 'The report could not be loaded.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reference, attempt])
  return { incident: incident?.id.toLowerCase() === reference?.trim().toLowerCase() ? incident : null, loading, error, retry: () => setAttempt(current => current + 1) }
}
