import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import OperationsLayout from '../components/OperationsLayout'
import IncidentManagement from '../components/IncidentManagement'
import { useIncident } from '../lib/useIncident'

export default function IncidentDetails() {
  const { id } = useParams()
  const { incident, loading, error, retry } = useIncident(id)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  return <OperationsLayout title="Incident details" connection={error ? 'error' : incident ? 'connected' : 'loading'} updatedAt={savedAt ?? incident?.updatedAtUtc ?? null}>
    <section className="workspace-heading"><div><Link to="/operations/incidents" className="back-link"><ArrowLeft size={14} />Incidents</Link><h1>Report details</h1></div>{incident && <span className="reference-heading">Reference {incident.id}</span>}</section>
    {loading && <p role="status" className="workspace-state">Loading report…</p>}
    {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={retry} className="button button-secondary">Try again</button></div>}
    {incident && <IncidentManagement key={incident.id} initialIncident={incident} onUpdated={setSavedAt} />}
  </OperationsLayout>
}
