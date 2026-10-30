import { RefreshCw } from 'lucide-react'
import OperationsLayout from '../components/OperationsLayout'
import ReadingsChart from '../components/ReadingsChart'
import { useSensorMonitoring } from '../lib/useSensorMonitoring'
import { freshness, sourceLabel, wetnessValue, formatWetness } from '../lib/sensors'
import { readingTime, clockTime } from '../lib/display'

export default function SensorMonitoring() {
  const { sensors, selectedId, readings, loading, loaded, readingLoading, error, readingError, updatedAt, now, refresh, selectSensor } = useSensorMonitoring()
  const selected = sensors.find(sensor => sensor.id === selectedId)
  const anomalies = sensors.filter(sensor => sensor.activeAnomaly)
  const active = sensors.filter(sensor => freshness(sensor, now) === 'Receiving readings').length
  const attention = sensors.filter(sensor => sensor.activeAnomaly || freshness(sensor, now) !== 'Receiving readings').length
  const time = (value: string | null | undefined) => value ? <time dateTime={value}>{readingTime(value)} SAST</time> : '—'
  const observedIntervals = readings.slice(0, 11).slice(0, -1).map((item, index) => (Date.parse(item.measuredAtUtc) - Date.parse(readings[index + 1].measuredAtUtc)) / 1000).filter(value => value > 0).sort((a, b) => a - b)
  const observedInterval = observedIntervals.length ? Math.round(observedIntervals[Math.floor(observedIntervals.length / 2)]) : null
  return <OperationsLayout title="Sensor Monitoring" connection={error || readingError ? 'error' : loaded ? 'connected' : 'loading'} updatedAt={updatedAt}>
    <section className="workspace-heading"><div><h1>Sensor Monitoring</h1><p>Last Reading {selected?.lastMeasuredAtUtc ? clockTime(selected.lastMeasuredAtUtc) : '—'}</p></div><button className="button button-secondary" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh</button></section>
    {error && <div className="error-banner" role="alert"><span>{error}{sensors.length ? ' Previously loaded sensors are shown below.' : ''}</span><button className="button button-secondary" onClick={refresh}>Try again</button></div>}
    {anomalies.length > 0 && <section className="attention-panel" aria-label="Suspected anomalies"><h2>Needs Attention · Suspected anomalies</h2><p>Investigate the readings below.</p>{anomalies.map(sensor => <div className="attention-entry" key={sensor.id}><div><strong>{sensor.name}</strong><span className={`source-label source-${sensor.source}`}>{sourceLabel(sensor.source)}</span><p>Relative Wetness: {formatWetness(wetnessValue(sensor.activeAnomaly!.triggerValue, sensor.unit))} · {sensor.activeAnomaly!.consecutiveReadings} consecutive abnormal readings. Flagged {time(sensor.activeAnomaly!.startedAtUtc)}.</p></div><button className="button button-secondary" onClick={() => selectSensor(sensor.id)}>View readings</button></div>)}</section>}
    <section className="information-strip" aria-label="Sensor summary">
      <div><span>Active sensors</span><strong>{loaded ? `${active} / ${sensors.length}` : '—'}</strong></div>
      <div><span>Relative Wetness (%)</span><strong>{selected?.latestValue != null ? formatWetness(wetnessValue(selected.latestValue, selected.unit)) : '—'}</strong></div>
      <div><span>Sensors requiring attention</span><strong>{loaded ? attention : '—'}</strong></div>
      <div><span>Last received</span><strong className="timestamp-value">{time(selected?.lastReceivedAtUtc)}</strong></div>
    </section>
    {loading && !loaded && <p role="status" className="workspace-state">Loading sensors…</p>}
    {loaded && !sensors.length && <section className="surface workspace-state"><h2>No sensors registered</h2><p>Registered sensors and their measurements will appear here.</p></section>}
    {selected && <>
      <div className="monitoring-columns">
        <section className="surface chart-surface" aria-label="Sensor readings"><div className="surface-heading"><h2>Historical readings</h2><label className="sensor-selector">Sensor<select aria-label="Registered sensors" value={selectedId} onChange={event => selectSensor(event.target.value)}>{sensors.map(sensor => <option key={sensor.id} value={sensor.id}>{sensor.name}</option>)}</select></label></div>
          <div className="chart-meta"><span>{selected.name} · {sourceLabel(selected.source)}</span><span>Relative Wetness (%)</span></div>
          {readingError && <div className="error-banner" role="alert"><span>{readingError}{readings.length ? ' Showing the last loaded measurements.' : ''}</span><button className="button button-secondary" onClick={refresh}>Try again</button></div>}
          {readingLoading && !readings.length ? <p className="workspace-state" role="status">Loading measurements…</p> : !readingError || readings.length ? <ReadingsChart readings={readings} /> : null}
          <div className="chart-footer"><span>{readings.length} persisted readings</span><span>Refresh interval: 10 seconds</span></div>
        </section>
        <aside className="surface sensor-facts" aria-label="Sensor details"><div className="surface-heading"><h2>Sensor details</h2></div><dl>
          <div><dt>Sensor</dt><dd>{selected.name}<small>{selected.sensorKey}</small></dd></div><div><dt>Location</dt><dd>{selected.location}</dd></div>
          <div><dt>Source</dt><dd><span className={`source-label source-${selected.source}`}>{sourceLabel(selected.source)}</span></dd></div>
          <div><dt>Reading activity</dt><dd className={freshness(selected, now) === 'Receiving readings' ? 'healthy-text' : 'warning-text'}>{freshness(selected, now)}</dd></div>
          <div><dt>Expected interval</dt><dd>10 seconds</dd></div><div><dt>Observed interval</dt><dd>{observedInterval != null ? `${observedInterval} seconds` : 'Not enough readings'}</dd></div>
          <div><dt>Current alert state</dt><dd>{selected.activeAnomaly ? 'Suspected anomaly · needs investigation' : selected.lastRecoveredAnomaly?.recoveredAtUtc ? <>Recovered {time(selected.lastRecoveredAnomaly.recoveredAtUtc)}</> : 'No active configured alert'}</dd></div>
        </dl></aside>
      </div>
      <section className="surface measurements-surface"><div className="surface-heading"><h2>Recent measurements</h2><span>{selected.name}</span></div><div className="table-scroll" tabIndex={0} aria-label="Scroll measurements table"><table className="data-table measurements-table"><caption className="visually-hidden">Latest measurements · {sourceLabel(selected.source)} · times in SAST</caption><thead><tr><th scope="col">Time (SAST)</th><th scope="col">Sensor</th><th scope="col">Relative Wetness (%)</th><th scope="col">Change (percentage points)</th><th scope="col">Status</th></tr></thead><tbody>{readings.map((reading, index) => {
        const previous = readings[index + 1]; const value = wetnessValue(reading.value, reading.unit); const previousValue = previous ? wetnessValue(previous.value, previous.unit) : null; const delta = previous && previous.source === reading.source && value != null && previousValue != null ? Math.round((value - previousValue) * 10) / 10 : null
        return <tr key={reading.id}><td><time dateTime={reading.measuredAtUtc}>{readingTime(reading.measuredAtUtc)}</time></td><td>{selected.name}<small>{sourceLabel(reading.source)}</small></td><td className="numeric-cell">{formatWetness(value)}</td><td className="numeric-cell">{delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta} pp`}</td><td><span className={`assessment ${reading.isAbnormal ? 'assessment-warning' : ''}`}>{reading.isAbnormal ? 'Rule flagged' : 'Not flagged'}</span></td></tr>
      })}</tbody></table>{!readings.length && !readingLoading && <p className="workspace-state">No measurements recorded.</p>}</div></section>
    </>}
  </OperationsLayout>
}
