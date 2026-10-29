import type { Incident } from '../lib/incidents'
import { formatTimestamp } from '../lib/incidents'

export default function IncidentRecord({ incident, publicView = false }: { incident: Incident; publicView?: boolean }) {
  return <article className="record-card" aria-label="Incident details">
    <div className="record-heading"><div><span className="eyebrow">{publicView ? 'YOUR REPORT' : 'CITIZEN REPORT'}</span><h2>{incident.title}</h2></div><span className="status-badge"><span />{incident.status}</span></div>
    <dl className="record-fields">
      <div><dt>Reference number</dt><dd className="full-reference">{incident.id}</dd></div>
      <div><dt>Address / location</dt><dd>{incident.location}</dd></div>
      <div><dt>Description</dt><dd className="record-description">{incident.description}</dd></div>
      <div><dt>Created</dt><dd><time dateTime={incident.createdAtUtc}>{formatTimestamp(incident.createdAtUtc)} SAST</time></dd></div>
      <div><dt>Coordinates</dt><dd>{incident.latitude != null && incident.longitude != null ? `${incident.latitude.toFixed(6)}, ${incident.longitude.toFixed(6)}` : 'No coordinates supplied'}</dd></div>
      <div><dt>Source</dt><dd>Resident / citizen report</dd></div>
    </dl>
    {publicView && <p className="service-note">This prototype shows the stored status only. It does not confirm dispatch, a repair schedule or an official municipal response.</p>}
  </article>
}
