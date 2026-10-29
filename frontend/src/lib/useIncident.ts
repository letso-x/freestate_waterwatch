import { useEffect, useState } from 'react'
import { ApiError, getIncident, getPublicTracking, isIncidentReference } from '../lib/api'
import type { Incident, PublicTracking } from '../lib/incidents'

function useReference<T extends { id: string }>(reference: string | undefined, loader: (id: string, signal?: AbortSignal) => Promise<T>) {
  const [incident, setIncident] = useState<T | null>(null)
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
    void loader(reference, controller.signal).then(record => {
      if (!controller.signal.aborted) setIncident(record)
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof ApiError && cause.status === 404
        ? 'No report was found for this reference. Check the full reference and try again.'
        : cause instanceof Error ? cause.message : 'The report could not be loaded.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reference, attempt, loader])
  return { incident: incident?.id.toLowerCase() === reference?.trim().toLowerCase() ? incident : null, loading, error, retry: () => setAttempt(current => current + 1) }
}

export function useIncident(reference: string | undefined) { return useReference<Incident>(reference, getIncident) }
export function usePublicTracking(reference: string | undefined) { return useReference<PublicTracking>(reference, getPublicTracking) }
