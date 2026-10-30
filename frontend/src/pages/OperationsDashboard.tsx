import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RefreshCw, Search, X } from 'lucide-react'
import OperationsLayout from '../components/OperationsLayout'
import { useIncidents } from '../lib/useIncidents'
import { filterIncidents, formatTimestamp, lifecycleStatuses, priorities, statusLabel } from '../lib/incidents'
import type { Incident } from '../lib/incidents'

export function IncidentTable({ incidents }: { incidents: Incident[] }) {
  const navigate = useNavigate()
  return <div className="table-scroll" tabIndex={0} aria-label="Scroll incident table"><table className="data-table incident-table">
    <caption className="visually-hidden">Incidents · newest reported first · times in SAST</caption>
    <thead><tr>{['Reference', 'Reported', 'Location', 'Type / title', 'Priority', 'Status', 'Assigned team', 'Last updated'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{incidents.map(incident => <tr key={incident.id} onClick={event => { if (!(event.target as HTMLElement).closest('a')) navigate(`/operations/incidents/${incident.id}`) }}>
      <td className="reference-cell"><Link title={incident.id} aria-label={`Open report ${incident.id}`} to={`/operations/incidents/${incident.id}`}>{incident.id.slice(0, 8)}</Link></td>
      <td><time dateTime={incident.createdAtUtc}>{formatTimestamp(incident.createdAtUtc)}</time></td>
      <td className="location-cell">{incident.location}</td>
      <td className="title-cell"><Link to={`/operations/incidents/${incident.id}`}>{incident.title}</Link><small>Resident report</small></td>
      <td><span className={`priority-tag priority-${incident.priority ?? 'Medium'}`}>{incident.priority ?? 'Medium'}</span></td>
      <td><span className={`status-badge status-${incident.status}`}>{statusLabel(incident.status)}</span></td>
      <td>{incident.assignedTo ?? 'Unassigned'}</td>
      <td><time dateTime={incident.updatedAtUtc ?? incident.createdAtUtc}>{formatTimestamp(incident.updatedAtUtc ?? incident.createdAtUtc)}</time></td>
    </tr>)}</tbody>
  </table></div>
}
export default function OperationsDashboard() {
  const { incidents, loaded, loading, error, updatedAt, refresh } = useIncidents()
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [priority, setPriority] = useState('all')
  const visible = filterIncidents(incidents, search, status).filter(item => priority === 'all' || (item.priority ?? 'Medium') === priority)
  const filtered = search.trim() !== '' || status !== 'all' || priority !== 'all'
  return <OperationsLayout title="Incidents" connection={error ? 'error' : loaded ? 'connected' : 'loading'} updatedAt={updatedAt}>
    <section className="workspace-heading"><h1>Incidents</h1><section className="status-totals" aria-label="Incident summary">{lifecycleStatuses.map(value => <div key={value}><span>{statusLabel(value)}</span><strong>{loaded ? incidents.filter(item => item.status === value).length : '—'}</strong></div>)}</section></section>
    {error && <div className="error-banner" role="alert"><span>{error}{loaded ? ' Your last loaded reports are shown below.' : ''}</span><button className="button button-secondary" onClick={refresh}>Try again</button></div>}
    <section className="surface incident-register" aria-label="Incident register" aria-busy={loading}>
      <div className="register-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search reports" placeholder="Search reference, location or title" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear search" className="icon-button" onClick={() => setSearch('')}><X size={15} /></button>}</div>
        <label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{lifecycleStatuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
        <label>Priority<select value={priority} onChange={event => setPriority(event.target.value)}><option value="all">All priorities</option>{priorities.map(value => <option key={value}>{value}</option>)}</select></label>
        <button className="button button-secondary" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh</button>
      </div>
      {loading && !loaded ? <p className="workspace-state" role="status">Loading reports</p> : !loaded && error ? <p className="workspace-state">Reports are unavailable</p> : visible.length ? <IncidentTable incidents={visible} /> : <div className="workspace-state"><h2>{filtered ? 'No matching reports' : 'No reports yet'}</h2><p>{filtered ? 'Try another search or clear your filters.' : 'New reports from residents will appear here.'}</p>{filtered && <button className="button button-secondary" onClick={() => { setSearch(''); setStatus('all'); setPriority('all') }}>Clear filters</button>}</div>}
      <div className="table-footer">{loaded ? `Showing ${visible.length} of ${incidents.length} report${incidents.length === 1 ? '' : 's'}` : 'Waiting for reports'}<span>Newest first · SAST</span></div>
    </section>
  </OperationsLayout>
}
