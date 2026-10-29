import { Link, NavLink } from 'react-router-dom'
import { Droplets, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

export function PrototypeNotice() {
  return <div className="prototype-notice"><strong>Hackathon Prototype</strong><span>Independent WaterWatch project · Not an official municipal service or endorsed by Mangaung Metropolitan Municipality.</span></div>
}

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="public-shell">
    <a href="#public-main" className="skip-link">Skip to content</a>
    <PrototypeNotice />
    <header className="public-header">
      <Link to="/report" className="brand"><span className="brand-symbol"><Droplets size={26} /></span><span>WaterWatch<small>FREE STATE</small></span></Link>
      <nav aria-label="Resident navigation"><NavLink to="/report" end>Report a problem</NavLink><NavLink to="/track">Track a report</NavLink><Link className="operations-link" to="/operations">Municipal operations <ArrowUpRight size={14} /></Link></nav>
    </header>
    <main id="public-main" className="public-main" tabIndex={-1}>{children}</main>
    <footer className="public-footer"><span>WaterWatch Free State · Hackathon Prototype</span><span>Inspired by Mangaung’s green, orange and black identity. No municipal endorsement.</span></footer>
  </div>
}
