import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Search } from 'lucide-react'
import PublicLayout from '../components/PublicLayout'
import ReportIncident from '../components/ReportIncident'
import PublicTrackingRecord from '../components/PublicTrackingRecord'
import { isIncidentReference } from '../lib/api'
import { usePublicTracking } from '../lib/useIncident'

export function PublicReport() {
  const navigate = useNavigate()
  return <PublicLayout><div className="public-heading"><h1>Report a water problem</h1><p className="intro-copy">Tell us what you’ve noticed and where. Keep track of your report with one reference number.</p></div>
    <div className="public-report-grid"><ReportIncident onCreated={async incident => {
      navigate(`/report/success?reference=${encodeURIComponent(incident.id)}`)
    }} /></div>
  </PublicLayout>
}

export function ReportSuccess() {
  const [params] = useSearchParams()
  const reference = params.get('reference') ?? undefined
  const { incident, loading, error, retry } = usePublicTracking(reference)
  return <PublicLayout><div className="confirmation-heading">
    {incident && <CheckCircle2 size={26} aria-hidden="true" />}
    <h1>{incident ? 'Your report has been received.' : loading ? 'Finding your report…' : 'Find your report'}</h1>
    <p className="intro-copy">{incident ? 'Keep your reference number to check for updates from the maintenance team.' : 'We’re checking the details of your report.'}</p>
  </div>
    {loading && <p role="status">Loading confirmation…</p>}
    {!reference && <div className="scope-note"><p>This link doesn’t include a reference number. You can send a new report or track an existing one.</p><Link to="/report" className="button button-primary">Report a problem</Link></div>}
    {error && <div className="error-banner" role="alert"><AlertCircle size={18} /><span>{error} If you’ve just sent this report, keep this reference and try again. There’s no need to send it twice: <strong className="full-reference">{reference}</strong></span><button className="button button-secondary" onClick={retry}>Try again</button></div>}
    {incident && <><PublicTrackingRecord incident={incident} /><div className="confirmation-actions"><Link className="button button-primary" to={`/track?reference=${encodeURIComponent(incident.id)}`}>Track this report</Link><Link className="button button-secondary" to="/report">Report another problem</Link></div></>}
  </PublicLayout>
}

export function TrackReport() {
  const [params, setParams] = useSearchParams()
  const reference = params.get('reference') ?? ''
  const [input, setInput] = useState(reference)
  const [validation, setValidation] = useState('')
  useEffect(() => { setInput(reference); setValidation('') }, [reference])
  const { incident, loading, error, retry } = usePublicTracking(reference || undefined)
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!isIncidentReference(input)) { setValidation('Enter the full reference number from your confirmation.'); return }
    setValidation('')
    if (reference === input.trim()) retry()
    else setParams({ reference: input.trim() })
  }
  return <PublicLayout><div className="public-heading"><h1>Track your report</h1><p className="intro-copy">Enter your reference number to see the latest progress and updates.</p></div>
    <form className="tracking-form" onSubmit={submit} noValidate><label htmlFor="tracking-reference">Reference number</label><div className="tracking-input"><input id="tracking-reference" value={input} onChange={event => { setInput(event.target.value); setValidation('') }} placeholder="Paste your reference number" autoCapitalize="none" spellCheck={false} aria-invalid={!!validation} aria-describedby={validation ? 'tracking-error' : 'tracking-hint'} required /><button className="button button-primary" disabled={loading}><Search size={16} />{loading ? 'Finding report…' : 'Track report'}</button></div><p id={validation ? 'tracking-error' : 'tracking-hint'} className={validation ? 'field-error' : 'field-hint'}>{validation || 'Enter the full reference number exactly as it appears on your confirmation.'}</p></form>
    {loading && <p role="status">Finding your report…</p>}
    {error && <div className="error-banner" role="alert"><AlertCircle size={18} /><span>{error}</span><button className="button button-secondary" onClick={retry}>Try again</button></div>}
    {incident && <PublicTrackingRecord incident={incident} />}
  </PublicLayout>
}
