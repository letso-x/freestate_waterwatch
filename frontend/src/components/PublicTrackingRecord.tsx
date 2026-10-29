import type { PublicTracking } from '../lib/incidents'
import { formatTimestamp, statusLabel } from '../lib/incidents'

export default function PublicTrackingRecord({ incident }: { incident: PublicTracking }) {
  return <article className="record-card" aria-label="Report updates"><div className="record-heading"><div><span className="eyebrow">YOUR REPORT</span><h2>{incident.title}</h2></div><span className={`status-badge status-${incident.status}`}><span />{statusLabel(incident.status)}</span></div>
    <dl className="record-fields"><div><dt>Reference number</dt><dd className="full-reference">{incident.id}</dd></div><div><dt>Location</dt><dd>{incident.locationDescription === 'Location recorded; exact address is available to municipal operators.' ? 'Address shared with the maintenance team.' : incident.locationDescription}</dd></div><div><dt>Date reported</dt><dd>{formatTimestamp(incident.createdAtUtc)} SAST</dd></div><div><dt>Last updated</dt><dd>{formatTimestamp(incident.updatedAtUtc)} SAST</dd></div></dl>
    <h3>Updates</h3><ol className="activity-timeline">{incident.events.map((event, index) => <li key={`${event.createdAtUtc}-${index}`}><strong>{statusLabel(event.newStatus ?? incident.status)}</strong><p>{event.summary.replace('Municipal operator recorded ', 'Status changed to ')}</p><time dateTime={event.createdAtUtc}>{formatTimestamp(event.createdAtUtc)} SAST</time></li>)}</ol>
    <p className="resolution-context">{incident.status === 'Resolved' ? "The team has marked this report as resolved." : "Check here for the latest updates from the maintenance team."}</p>
  </article>
}
