import { Link, NavLink } from 'react-router-dom'
import { Droplets, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

export function ProductFooter({ compact = false }: { compact?: boolean }) {
  return <footer className={compact ? 'page-footer' : 'public-footer'}><span>WaterWatch Free State</span><small className="product-disclosure">Independent water reporting and management. Not an official Mangaung municipal service.</small></footer>
}

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="public-shell">
    <a href="#public-main" className="skip-link">Skip to content</a>
    <header className="public-header">
      <Link to="/report" className="brand"><span className="brand-symbol"><Droplets size={26} /></span><span>WaterWatch<small>FREE STATE</small></span></Link>
      <nav aria-label="Resident navigation"><NavLink to="/report" end>Report a problem</NavLink><NavLink to="/track">Track a report</NavLink><Link className="operations-link" to="/operations">Water management <ArrowUpRight size={14} /></Link></nav>
    </header>
    <main id="public-main" className="public-main" tabIndex={-1}>{children}</main>
    <ProductFooter />
  </div>
}
