import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Search } from 'lucide-react'
import PublicLayout from '../components/PublicLayout'
import ReportIncident from '../components/ReportIncident'
import IncidentRecord from '../components/IncidentRecord'
import { isIncidentReference } from '../lib/api'
import { useIncident } from '../lib/useIncident'

export function PublicReport() {
  const navigate = useNavigate()
  return <PublicLayout><div className="public-heading"><span className="eyebrow">RESIDENT REPORTING PORTAL</span><h1>Help protect our community’s water.</h1><p className="intro-copy">Report a leak or water problem in your area. You don’t need to enter the municipal dashboard.</p></div>
    <div className="public-report-grid"><ReportIncident onCreated={async incident => {
      navigate(`/report/success?reference=${encodeURIComponent(incident.id)}`)
    }} /><aside className="report-sidebar"><h2>A useful report starts here</h2><ol><li>Give the problem a clear title.</li><li>Include a street, landmark and town.</li><li>Pin the location or use GPS if available.</li><li>Describe what you can see.</li></ol><p>Keep your full reference number after submitting. It lets you retrieve the stored report.</p><div className="scope-note"><h3>Prototype scope</h3><p>Reports are saved to the WaterWatch database. This is not an official municipal service or an emergency channel. Photos cannot be attached yet.</p></div><Link to="/track" className="text-button">Already reported? Track your report</Link></aside></div>
  </PublicLayout>
}

export function ReportSuccess() {
  const [params] = useSearchParams()
  const reference = params.get('reference') ?? undefined
  const { incident, loading, error, retry } = useIncident(reference)
  return <PublicLayout><div className="confirmation-heading">
    {incident && <CheckCircle2 size={44} aria-hidden="true" />}
    <span className="eyebrow">REPORT CONFIRMATION</span><h1>{incident ? 'Your report has been received.' : loading ? 'Checking your report…' : 'Check your report reference'}</h1>
    <p className="intro-copy">{incident ? 'Your report is stored in WaterWatch. Keep the full reference below to track it.' : 'Confirmation is shown only after the report can be verified in the incident database.'}</p>
  </div>
    {loading && <p role="status">Loading confirmation…</p>}
    {!reference && <div className="scope-note"><p>There is no report reference in this link. Submit a report or enter an existing reference to track it.</p><Link to="/report" className="button button-primary">Report a problem</Link></div>}
    {error && <div className="error-banner" role="alert"><AlertCircle size={18} /><span>{error} If you just submitted, keep this reference and retry the lookup rather than submitting again: <strong className="full-reference">{reference}</strong></span><button className="button button-secondary" onClick={retry}>Retry lookup</button></div>}
    {incident && <><IncidentRecord incident={incident} publicView /><div className="confirmation-actions"><Link className="button button-primary" to={`/track?reference=${encodeURIComponent(incident.id)}`}>Track this report</Link><Link className="button button-secondary" to="/report">Report another problem</Link></div></>}
  </PublicLayout>
}

export function TrackReport() {
  const [params, setParams] = useSearchParams()
  const reference = params.get('reference') ?? ''
  const [input, setInput] = useState(reference)
  const [validation, setValidation] = useState('')
  useEffect(() => { setInput(reference); setValidation('') }, [reference])
  const { incident, loading, error, retry } = useIncident(reference || undefined)
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!isIncidentReference(input)) { setValidation('Enter the full report reference shown on your confirmation.'); return }
    setValidation('')
    if (reference === input.trim()) retry()
    else setParams({ reference: input.trim() })
  }
  return <PublicLayout><div className="public-heading"><span className="eyebrow">RESIDENT REPORT TRACKING</span><h1>Follow your water report.</h1><p className="intro-copy">Enter the full reference number from your confirmation to view its recorded details and current status.</p></div>
    <form className="tracking-form" onSubmit={submit} noValidate><label htmlFor="tracking-reference">Report reference number</label><div className="tracking-input"><input id="tracking-reference" value={input} onChange={event => { setInput(event.target.value); setValidation('') }} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoCapitalize="none" spellCheck={false} aria-invalid={!!validation} aria-describedby={validation ? 'tracking-error' : 'tracking-hint'} required /><button className="button button-primary" disabled={loading}><Search size={16} />{loading ? 'Looking up…' : 'Track report'}</button></div><p id={validation ? 'tracking-error' : 'tracking-hint'} className={validation ? 'field-error' : 'field-hint'}>{validation || 'Use the complete UUID reference, not a shortened list label.'}</p></form>
    {loading && <p role="status">Looking up your report…</p>}
    {error && <div className="error-banner" role="alert"><AlertCircle size={18} /><span>{error}</span><button className="button button-secondary" onClick={retry}>Retry lookup</button></div>}
    {incident && <IncidentRecord incident={incident} publicView />}
  </PublicLayout>
}
