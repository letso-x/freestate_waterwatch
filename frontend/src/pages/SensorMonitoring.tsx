import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, AlertCircle, Droplets, RefreshCw } from 'lucide-react'
import { ProductFooter } from '../components/PublicLayout'
import ReadingsChart from '../components/ReadingsChart'
import { getSensors, getSensorReadings } from '../lib/api'
import type { Sensor, TelemetryReading } from '../lib/sensors'
import { freshness, measurementLabel, sourceLabel } from '../lib/sensors'
import { formatTimestamp } from '../lib/incidents'

export default function SensorMonitoring() {
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [readings, setReadings] = useState<TelemetryReading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [readingError, setReadingError] = useState('')
  const [readingLoading, setReadingLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const [now, setNow] = useState(Date.now())
  const refresh = useCallback(() => setRevision(x => x + 1), [])
  useEffect(() => { const interval = window.setInterval(() => { setNow(Date.now()); refresh() }, 30000); return () => clearInterval(interval) }, [refresh])
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    void getSensors(controller.signal).then(result => {
      if (controller.signal.aborted) return
      setSensors(result); setNow(Date.now())
      setSelectedId(current => result.some(x => x.id === current) ? current : result[0]?.id ?? '')
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'We couldn’t load the sensors.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController(); setReadingLoading(true); setReadingError(''); setReadings([])
    void getSensorReadings(selectedId, controller.signal).then(result => { if (!controller.signal.aborted) setReadings(result) })
      .catch(cause => { if (!controller.signal.aborted) setReadingError(cause instanceof Error ? cause.message : 'We couldn’t load recent readings.') })
      .finally(() => { if (!controller.signal.aborted) setReadingLoading(false) })
    return () => controller.abort()
  }, [selectedId, revision])
  const selected = sensors.find(x => x.id === selectedId)
  const anomalies = sensors.filter(x => x.activeAnomaly)
  return <div className="public-shell sensor-shell">
    <a className="skip-link" href="#sensor-main">Skip to sensors</a>
    <header className="public-header"><Link to="/operations" className="brand"><span className="brand-symbol"><Droplets size={26} /></span><span>WaterWatch<small>FREE STATE</small></span></Link><nav aria-label="Water management navigation"><Link to="/operations">Reports</Link><Link to="/operations/sensors" aria-current="page">Sensor monitoring</Link><Link to="/report">Resident portal</Link></nav></header>
    <main id="sensor-main" className="public-main sensor-main" tabIndex={-1}>
      <section className="page-heading"><div><span className="eyebrow">WATER MANAGEMENT</span><h1>Sensor monitoring</h1><p>Review moisture readings and changes that need investigation.</p></div><button className="button button-secondary" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button></section>
      {error && <div className="error-banner" role="alert"><AlertCircle size={20} /><span>{error}{sensors.length > 0 ? ' Previously loaded sensors are shown below.' : ''}</span><button className="button button-secondary" onClick={refresh}>Try again</button></div>}
      {loading && sensors.length === 0 && <p role="status">Loading sensors…</p>}
      {!loading && !error && sensors.length === 0 && <section className="record-card sensor-empty"><Activity size={30} /><h2>No sensors registered</h2><p>Registered sensors and their measurements will appear here.</p></section>}
      {anomalies.length > 0 && <section className="sensor-anomalies" aria-label="Suspected anomalies"><h2>Needs investigation <span className="count-badge">{anomalies.length}</span></h2><p>Unusual moisture readings indicate a suspected issue. They do not confirm a water leak.</p>{anomalies.map(sensor => <article className="anomaly-card" key={sensor.id}><div><strong>{sensor.name}</strong><span className={`source-label source-${sensor.source}`}>{sourceLabel(sensor.source)}</span><p>{sensor.location} · {sensor.activeAnomaly!.consecutiveReadings} consecutive abnormal readings</p><p>First flagged {formatTimestamp(sensor.activeAnomaly!.startedAtUtc)} SAST · Threshold {sensor.activeAnomaly!.direction === 'Above' ? '≥' : '≤'} {sensor.activeAnomaly!.threshold} {sensor.unit}</p></div><button className="button button-secondary" onClick={() => setSelectedId(sensor.id)}>View readings</button></article>)}</section>}
      {sensors.length > 0 && <div className="sensor-grid"><section className="record-card sensor-directory" aria-label="Registered sensors"><h2>Registered sensors <span className="count-badge">{sensors.length}</span></h2><div className="sensor-list">{sensors.map(sensor => <button key={sensor.id} className={`sensor-choice ${selectedId === sensor.id ? 'selected' : ''}`} onClick={() => setSelectedId(sensor.id)} aria-pressed={selectedId === sensor.id}><strong>{sensor.name}</strong><span>{sensor.location}</span><span className={`source-label source-${sensor.source}`}>{sourceLabel(sensor.source)}</span><span className={`sensor-freshness ${freshness(sensor, now) === 'Receiving readings' ? 'recent' : ''}`}>{freshness(sensor, now)}</span><b>{sensor.latestValue == null ? 'No measurement' : `${sensor.latestValue.toLocaleString('en-ZA')} ${sensor.unit}`}</b></button>)}</div></section>
        {selected && <section className="record-card sensor-detail" aria-label="Sensor readings"><div className="record-heading"><div><span className="eyebrow">{measurementLabel(selected.measurementType)}</span><h2>{selected.name}</h2></div><span className={`source-label source-${selected.source}`}>{sourceLabel(selected.source)}</span></div><p>{selected.location}</p><dl className="sensor-summary"><div><dt>Latest measurement</dt><dd>{selected.latestValue == null ? '—' : `${selected.latestValue.toLocaleString('en-ZA')} ${selected.unit}`}</dd></div><div><dt>Last reading</dt><dd>{selected.lastMeasuredAtUtc ? `${formatTimestamp(selected.lastMeasuredAtUtc)} SAST` : 'No readings yet'}</dd></div><div><dt>Reading activity</dt><dd>{freshness(selected, now)}</dd></div></dl>
          <h3>Recent readings</h3>{readingLoading && <p role="status">Loading measurements…</p>}{readingError && <div className="error-banner" role="alert">{readingError}<button className="button button-secondary" onClick={refresh}>Try again</button></div>}{!readingLoading && !readingError && <><ReadingsChart readings={readings} />{readings.length > 0 && <div className="readings-table-wrap"><table className="readings-table"><caption>Latest measurements · {sourceLabel(selected.source)}</caption><thead><tr><th scope="col">Measured at (SAST)</th><th scope="col">Value</th><th scope="col">Assessment</th></tr></thead><tbody>{readings.slice(0, 10).map(reading => <tr key={reading.id}><td><time dateTime={reading.measuredAtUtc}>{formatTimestamp(reading.measuredAtUtc)}</time></td><td>{reading.value.toLocaleString('en-ZA')} {reading.unit}<small>{sourceLabel(reading.source)}</small></td><td>{reading.isAbnormal ? 'Outside expected range' : 'Within expected range'}</td></tr>)}</tbody></table></div>}</>}
        </section>}
      </div>}
    </main><ProductFooter />
  </div>
}
