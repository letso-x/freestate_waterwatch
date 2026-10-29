import { Link, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Droplets } from 'lucide-react'
import { PrototypeNotice } from '../components/PublicLayout'
import IncidentManagement from '../components/IncidentManagement'
import { useIncident } from '../lib/useIncident'

export default function IncidentDetails() {
  const { id } = useParams()
  const { incident, loading, error, retry } = useIncident(id)
  return <div className="details-shell"><PrototypeNotice />
    <header className="details-header"><Link to="/operations" className="brand"><Droplets size={27} /><span>WaterWatch<small>FREE STATE · OPERATIONS</small></span></Link><Link to="/operations" className="button button-secondary"><ArrowLeft size={16} />Back to overview</Link></header>
    <main className="public-main" tabIndex={-1}>
      <span className="eyebrow">MUNICIPAL OPERATIONS · REVIEW</span><h1>Incident details</h1>
      <p className="intro-copy">Review the resident’s report and recorded location.</p>
      {loading && <p role="status">Loading incident details…</p>}
      {error && <div className="error-banner" role="alert"><AlertCircle size={19} /><span>{error}</span><button onClick={retry} className="button button-secondary">Try again</button></div>}
      {incident && <IncidentManagement key={incident.id} initialIncident={incident} />}
    </main>
  </div>
}
