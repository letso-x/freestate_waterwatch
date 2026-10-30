import { useCallback, useEffect, useRef, useState } from 'react'
import { getSensors, getSensorReadings } from './api'
import type { Sensor, TelemetryReading } from './sensors'

export const SENSOR_POLL_INTERVAL = 10000
export function useSensorMonitoring() {
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [selectedId, setSelectedId] = useState('')
  const selected = useRef('')
  const [readings, setReadings] = useState<TelemetryReading[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [readingLoading, setReadingLoading] = useState(false)
  const [error, setError] = useState('')
  const [readingError, setReadingError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => { const timer = window.setInterval(refresh, SENSOR_POLL_INTERVAL); return () => window.clearInterval(timer) }, [refresh])
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setReadingError('')
    async function load() {
      try {
        const records = await getSensors(controller.signal)
        if (controller.signal.aborted) return
        setSensors(records); setLoaded(true); setNow(Date.now()); setUpdatedAt(new Date().toISOString())
        const id = records.some(item => item.id === selected.current) ? selected.current : records[0]?.id ?? ''
        if (id !== selected.current) setReadings([])
        selected.current = id; setSelectedId(id)
        if (!id) { setReadings([]); return }
        setReadingLoading(true)
        try {
          const measurements = await getSensorReadings(id, controller.signal)
          if (!controller.signal.aborted) setReadings(measurements)
        } catch (cause) { if (!controller.signal.aborted) setReadingError(cause instanceof Error ? cause.message : 'We couldn’t load recent readings.') }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'We couldn’t load the sensors.') }
      finally { if (!controller.signal.aborted) { setLoading(false); setReadingLoading(false) } }
    }
    void load()
    return () => controller.abort()
  }, [revision])
  function selectSensor(id: string) {
    if (id === selected.current) return
    selected.current = id; setSelectedId(id); setReadings([]); setReadingLoading(true); refresh()
  }
  return { sensors, selectedId, readings, loading, loaded, readingLoading, error, readingError, updatedAt, now, refresh, selectSensor }
}
