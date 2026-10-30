import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import OperationsLayout from '../components/OperationsLayout'
import { IncidentTable } from './OperationsDashboard'
import { useIncidents } from '../lib/useIncidents'
import { getSensors } from '../lib/api'
import { freshness, sourceLabel } from '../lib/sensors'
import type { Sensor } from '../lib/sensors'

export default function OperationsOverview() {
  const { incidents, loading, loaded, error, updatedAt, refresh } = useIncidents()
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [sensorError, setSensorError] = useState('')
  const [sensorsLoaded, setSensorsLoaded] = useState(false)
  useEffect(() => {
    const controller = new AbortController(); setSensorError('')
    void getSensors(controller.signal).then(result => { if (!controller.signal.aborted) { setSensors(result); setSensorsLoaded(true) } })
      .catch(cause => { if (!controller.signal.aborted) setSensorError(cause instanceof Error ? cause.message : 'Unable to load sensors.') })
    return () => controller.abort()
  }, [updatedAt])
  const open = incidents.filter(item => item.status !== 'Resolved')
  return <OperationsLayout title="Overview" connection={error || sensorError ? 'error' : loaded && sensorsLoaded ? 'connected' : 'loading'} updatedAt={updatedAt}>
    <section className="workspace-heading"><h1>Overview</h1><button className="button button-secondary" disabled={loading} onClick={refresh}><RefreshCw size={15} />Refresh</button></section>
    {(error || sensorError) && <div className="error-banner" role="alert">{error || sensorError}<button className="button button-secondary" onClick={refresh}>Try again</button></div>}
    <section className="information-strip" aria-label="Service overview"><div><span>Open incidents</span><strong>{loaded ? open.length : '—'}</strong></div><div><span>In progress</span><strong>{loaded ? incidents.filter(item => item.status === 'InProgress').length : '—'}</strong></div><div><span>Unassigned incidents</span><strong>{loaded ? open.filter(item => !item.assignedTo).length : '—'}</strong></div><div><span>Sensor alerts</span><strong>{sensorsLoaded ? sensors.filter(item => item.activeAnomaly).length : '—'}</strong></div></section>
    <section className="surface"><div className="surface-heading"><h2>Recent incidents</h2><Link className="text-button" to="/operations/incidents">View all incidents</Link></div>{loading && !loaded ? <p role="status" className="workspace-state">Loading incidents…</p> : incidents.length ? <IncidentTable incidents={incidents.slice(0, 5)} /> : <p className="workspace-state">{error ? 'Incidents are unavailable.' : 'No incidents reported.'}</p>}</section>
    <section className="surface overview-sensors"><div className="surface-heading"><h2>Sensor activity</h2><Link className="text-button" to="/operations/sensors">Open Sensor Monitoring</Link></div>{sensors.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">Sensor</th><th scope="col">Location</th><th scope="col">Source</th><th scope="col">Latest Reading</th><th scope="col">Activity</th></tr></thead><tbody>{sensors.map(item => <tr key={item.id}><td><Link to="/operations/sensors">{item.name}</Link></td><td>{item.location}</td><td>{sourceLabel(item.source)}</td><td>{item.latestValue == null ? '—' : `${item.latestValue} ${item.unit}`}</td><td>{freshness(item)}</td></tr>)}</tbody></table></div> : <p className="workspace-state">{sensorError ? 'Sensor activity is unavailable.' : sensorsLoaded ? 'No sensors registered.' : 'Loading sensor activity…'}</p>}</section>
  </OperationsLayout>
}
