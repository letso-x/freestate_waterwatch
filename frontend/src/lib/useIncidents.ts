import { useCallback, useEffect, useState } from 'react'
import { getIncidents } from './api'
import type { Incident } from './incidents'

export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    void getIncidents(controller.signal).then(records => {
      if (controller.signal.aborted) return
      setIncidents(records); setLoaded(true); setUpdatedAt(new Date().toISOString())
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load incidents.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  return { incidents, loaded, loading, error, updatedAt, refresh }
}
