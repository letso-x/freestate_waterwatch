import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertCircle, ArrowDown, ChevronRight, CircleHelp, ClipboardList, Droplet, Droplets, LayoutDashboard, MapPin, RefreshCw, Search, ShieldCheck, Waves, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PrototypeNotice } from '../components/PublicLayout'
import { getIncidents } from '../lib/api'
import { filterIncidents, formatTimestamp, summarize, lifecycleStatuses, priorities, statusLabel } from '../lib/incidents'
import type { Incident } from '../lib/incidents'

function Metric({ label, value, description, icon: Icon, accent }: { label: string; value: number | null; description: string; icon: LucideIcon; accent: string }) {
  return <article className="metric-card">
    <div className="metric-top"><span>{label}</span><span className={`metric-icon ${accent}`}><Icon size={19} strokeWidth={1.8} /></span></div>
    <strong>{value === null ? '—' : value.toLocaleString('en-ZA')}</strong>
    <p>{description}</p>
  </article>
}

function IncidentRow({ incident }: { incident: Incident }) {
  const [expanded, setExpanded] = useState(false)
  const longDescription = incident.description.length > 150
  return <article className="incident-row" aria-label={incident.title}>
    <div className="incident-main">
      <span className="incident-symbol"><Droplet size={20} strokeWidth={1.7} /></span>
      <div className="min-w-0">
        <h3><Link to={`/operations/incidents/${incident.id}`}>{incident.title}</Link></h3>
        <p className={longDescription && !expanded ? 'description-clamp' : ''}>{incident.description}</p>
        {longDescription && <button className="text-button detail-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Read full description'}</button>}
        <span className="incident-reference">WW · {incident.id} <span>Citizen report</span></span>
      </div>
    </div>
    <div className="incident-location"><MapPin size={15} /><span>{incident.location}<small className="assignment-label">{incident.assignedTo ?? "Unassigned"}</small></span></div>
    <div className="incident-status"><span className={`status-badge status-${incident.status}`}><span />{statusLabel(incident.status)}</span><span className={`priority-badge priority-${incident.priority ?? "Medium"}`}>{incident.priority ?? "Medium"}</span></div>
    <div className="incident-time"><time dateTime={incident.updatedAtUtc ?? incident.createdAtUtc}>{formatTimestamp(incident.updatedAtUtc ?? incident.createdAtUtc)}</time><span>Last updated · SAST</span></div>
  </article>
}

export default function OperationsDashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const activeRequest = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setLoading(true)
    setError('')
    try {
      const records = await getIncidents(controller.signal)
      if (controller.signal.aborted) return
      setIncidents(records)
      setLoaded(true)
      setLastUpdated(new Date())
    } catch (cause) {
      if (controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : 'Unable to load incident reports. Please try again.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh(); return () => activeRequest.current?.abort() }, [refresh])
  const summary = useMemo(() => summarize(incidents), [incidents])
  const visible = useMemo(() => filterIncidents(incidents, search, status).filter(record => priorityFilter === 'all' || (record.priority ?? 'Medium') === priorityFilter), [incidents, search, status, priorityFilter])
  const statuses = lifecycleStatuses
  const hasFilters = search.trim() !== '' || status !== 'all' || priorityFilter !== 'all'

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to incident overview</a>
    <aside className="sidebar" aria-label="Main navigation">
      <a href="#main-content" className="brand"><span className="brand-symbol"><Droplets size={26} /></span><span>WaterWatch<small>FREE STATE</small></span></a>
      <div className="workspace-label">MUNICIPAL WORKSPACE</div>
      <nav>
        <a href="#main-content" className="nav-item active" aria-current="page"><LayoutDashboard size={18} />Incident overview<span className="nav-dot" /></a>
        <Link className="nav-item" to="/report"><Droplets size={18} />Resident portal</Link>
      </nav>
      <div className="sidebar-bottom">
        <div className="water-motif" aria-hidden="true"><Waves size={40} strokeWidth={1.1} /></div>
        <h2>Every drop matters.</h2><p>Better visibility for the water issues in our communities.</p>
        <div className="sidebar-footer"><span className="province-mark">FS</span><span>Free State<small>Municipal water operations</small></span></div>
      </div>
    </aside>

    <div className="workspace"><PrototypeNotice />
      <header className="topbar">
        <div className="breadcrumb">Municipal operations <ChevronRight size={14} /><span>Overview</span></div>
        <div className="region-label"><MapPin size={15} /><span>Free State, South Africa</span><span className="region-tag">SAST</span></div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section className="page-heading">
          <div><div className="eyebrow"><span className="small-line" />WATER INCIDENT MANAGEMENT</div><h1>A clearer view of every report<span>.</span></h1><p>Track community water incidents. Turn local reports into a shared picture.</p></div>
          <span className="workspace-tag">Monitoring workspace</span>
        </section>
        <div className="data-context"><span className={`connection-dot ${loaded && !error ? 'connected' : ''}`} /><span>{loading ? 'Fetching incident records…' : error ? 'Incident API connection needs attention' : 'Connected to incident API'}</span><span className="context-separator">/</span><span>Source: citizen reports</span></div>
        {error && <div className="error-banner dashboard-error" role="alert"><AlertCircle size={20} /><div><strong>We couldn’t refresh the incident overview.</strong><p>{error}{loaded ? ' Showing the last available reports.' : ''}</p></div><button className="button button-secondary" onClick={() => void refresh()} disabled={loading}>Try again</button></div>}
        <section className="metrics-grid" aria-label="Incident summary">
          <Metric label="Total incidents" value={loaded ? summary.total : null} description="All stored citizen reports" icon={ClipboardList} accent="blue" />
          <Metric label="Reported" value={loaded ? summary.reported : null} description="Reports with Reported status" icon={Activity} accent="amber" />
          <Metric label="Reported today" value={loaded ? summary.today : null} description="Since midnight · South Africa" icon={Droplets} accent="teal" />
          <Metric label="Reported locations" value={loaded ? summary.locations : null} description="Distinct locations in reports" icon={MapPin} accent="violet" />
        </section>

        <section className="incident-panel" aria-labelledby="incidents-heading" aria-busy={loading}>
          <div className="panel-heading"><div className="panel-title"><h2 id="incidents-heading">Incident overview</h2><span className="count-badge">{loaded ? summary.total : '—'}</span></div><button className="refresh-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /><span>{loading ? 'Refreshing' : 'Refresh'}</span></button></div>
          <div className="filter-bar">
            <div className="search-field"><Search size={18} /><input aria-label="Search incidents" placeholder="Search incidents, locations or descriptions…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button className="icon-button" aria-label="Clear search" onClick={() => setSearch('')}><X size={16} /></button>}</div>
            <div className="status-filter"><label htmlFor="status-filter">Status</label><select id="status-filter" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></div>
            <div className="status-filter"><label htmlFor="priority-filter">Priority</label><select id="priority-filter" value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}><option value="all">All priorities</option>{priorities.map(item => <option key={item}>{item}</option>)}</select></div>
          </div>
          <div className="list-head" aria-hidden="true"><span>INCIDENT DETAILS</span><span>LOCATION</span><span>STATUS</span><span>UPDATED <ArrowDown size={12} /></span></div>
          {loading && !loaded ? <div className="loading-state" role="status"><RefreshCw size={26} className="animate-spin" /><h3>Loading incident reports</h3><p>Bringing your municipal overview up to date.</p></div>
            : !loaded && error ? <div className="empty-state"><span className="empty-symbol"><AlertCircle size={30} /></span><h3>Incident records are unavailable</h3><p>Restore the API connection and try again to view your reports.</p></div>
              : visible.length > 0 ? <div className="incident-list">{visible.map(incident => <IncidentRow key={incident.id} incident={incident} />)}</div>
                : <div className="empty-state"><span className="empty-symbol">{hasFilters ? <Search size={30} /> : <Droplets size={33} />}</span><h3>{hasFilters ? 'No reports match your filters' : 'No incidents reported yet'}</h3><p>{hasFilters ? 'Try a different search or clear your filters to see all reports.' : 'Resident reports will appear here after submission through the public portal.'}</p>{hasFilters ? <button className="button button-secondary" onClick={() => { setSearch(''); setStatus('all'); setPriorityFilter('all') }}>Clear filters</button> : null}</div>}
          <div className="list-footer"><span>{loaded ? `Showing ${visible.length} of ${incidents.length} incident${incidents.length === 1 ? '' : 's'}` : 'Waiting for incident records'}<span className="footer-dot">·</span>Newest first</span><span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false })} SAST` : 'All times in South Africa'}</span></div>
        </section>

        <section className="bottom-grid" aria-label="About incident reporting">
          <div className="report-callout"><div className="callout-art" aria-hidden="true"><Droplets size={42} strokeWidth={1.2} /><Waves size={65} strokeWidth={1} /></div><div><span className="eyebrow">LOCAL REPORTS. SHARED VISIBILITY.</span><h2>Review the report. Understand the location.</h2><p>Open any incident to review its full description, address, coordinates and reference number.</p></div></div>
          <div className="reporting-guide"><h2><CircleHelp size={18} />About this overview</h2><p><ShieldCheck size={17} /><span>Reports are stored in the municipal incident database.</span></p><p><ClipboardList size={17} /><span>New reports start with the status <strong>Reported</strong>.</span></p><p><RefreshCw size={16} /><span>Refresh to retrieve the latest resident submissions.</span></p></div>
        </section>
        <footer className="page-footer"><span><Droplets size={14} />WaterWatch Free State</span><span>Community reports. Better water visibility.</span></footer>
      </main>
    </div>

  </div>
}
