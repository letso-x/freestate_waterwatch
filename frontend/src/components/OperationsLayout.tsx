import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Activity, ArrowUpRight, ClipboardList, Droplets, LayoutDashboard, Menu, X } from 'lucide-react'
import { ProductFooter } from './PublicLayout'
import { clockTime } from '../lib/display'

export default function OperationsLayout({ title, connection, updatedAt, children }: {
  title: string; connection: 'loading' | 'connected' | 'error'; updatedAt?: string | null; children: ReactNode
}) {
  const [navigationOpen, setNavigationOpen] = useState(false)
  return <div className="control-centre">
    <a href="#workspace" className="skip-link">Skip to workspace</a>
    <aside className={`control-sidebar ${navigationOpen ? 'is-open' : ''}`}>
      <Link to="/operations" className="control-brand"><Droplets size={25} strokeWidth={1.6} /><span>WaterWatch<small>Free State</small></span></Link>
      <nav aria-label="Main navigation" onClick={() => setNavigationOpen(false)}>
        <NavLink to="/operations" end><LayoutDashboard size={17} />Overview</NavLink>
        <NavLink to="/operations/incidents"><ClipboardList size={17} />Incidents</NavLink>
        <NavLink to="/operations/sensors"><Activity size={17} />Sensor Monitoring</NavLink>
      </nav>
      <Link className="resident-link" to="/report">Resident reporting portal<ArrowUpRight size={15} /></Link>
      <div className="sidebar-identification">Water management<br /><span>Free State, South Africa</span></div>
    </aside>
    <div className="control-body">
      <header className="control-topbar">
        <button className="navigation-toggle" aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navigationOpen} onClick={() => setNavigationOpen(value => !value)}>{navigationOpen ? <X size={19} /> : <Menu size={19} />}</button>
        <div className="control-breadcrumb">WaterWatch <span>/</span> <strong>{title}</strong></div>
        <div className="connection-meta"><span className={`connection-state connection-${connection}`}><i />{connection === 'connected' ? 'Service connected' : connection === 'error' ? 'Connection interrupted' : 'Connecting'}</span><span>Last Updated <time dateTime={updatedAt ?? undefined}>{updatedAt ? clockTime(updatedAt) : '—'}</time></span></div>
      </header>
      <main id="workspace" className="control-workspace" tabIndex={-1}>{children}</main>
      <ProductFooter compact />
    </div>
  </div>
}
