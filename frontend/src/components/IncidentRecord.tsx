import type { Incident } from '../lib/incidents'
import { formatTimestamp, statusLabel } from '../lib/incidents'

export default function IncidentRecord({ incident }: { incident: Incident }) {
  return <article className="record-card" aria-label="Incident details">
    <div className="record-heading"><div><span className="eyebrow">CITIZEN REPORT</span><h2>{incident.title}</h2></div><span className={`status-badge status-${incident.status}`}><span />{statusLabel(incident.status)}</span></div>
    <dl className="record-fields">
      <div><dt>Reference number</dt><dd className="full-reference">{incident.id}</dd></div>
      <div><dt>Address / location</dt><dd>{incident.location}</dd></div>
      <div><dt>Description</dt><dd className="record-description">{incident.description}</dd></div>
      <div><dt>Created</dt><dd><time dateTime={incident.createdAtUtc}>{formatTimestamp(incident.createdAtUtc)} SAST</time></dd></div>
      <div><dt>Coordinates</dt><dd>{incident.latitude != null && incident.longitude != null ? `${incident.latitude.toFixed(6)}, ${incident.longitude.toFixed(6)}` : 'No coordinates supplied'}</dd></div>
      <div><dt>Last updated</dt><dd>{formatTimestamp(incident.updatedAtUtc ?? incident.createdAtUtc)} SAST</dd></div>
      <div><dt>Priority</dt><dd>{incident.priority ?? 'Medium'}</dd></div>
      <div><dt>Assigned to</dt><dd>{incident.assignedTo ?? 'Unassigned'}</dd></div>
      {incident.resolvedAtUtc && <div><dt>Resolution recorded</dt><dd>{formatTimestamp(incident.resolvedAtUtc)} SAST · operator-recorded outcome</dd></div>}
      <div><dt>Source</dt><dd>Resident / citizen report</dd></div>
    </dl>
  </article>
}
