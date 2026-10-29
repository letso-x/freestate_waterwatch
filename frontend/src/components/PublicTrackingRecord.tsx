import type { PublicTracking } from '../lib/incidents'
import { formatTimestamp, statusLabel } from '../lib/incidents'

export default function PublicTrackingRecord({ incident }: { incident: PublicTracking }) {
  return <article className="record-card" aria-label="Public report progress"><div className="record-heading"><div><span className="eyebrow">YOUR REPORT</span><h2>{incident.title}</h2></div><span className={`status-badge status-${incident.status}`}><span />{statusLabel(incident.status)}</span></div>
    <dl className="record-fields"><div><dt>Reference number</dt><dd className="full-reference">{incident.id}</dd></div><div><dt>Location</dt><dd>{incident.locationDescription}</dd></div><div><dt>Date reported</dt><dd>{formatTimestamp(incident.createdAtUtc)} SAST</dd></div><div><dt>Last updated</dt><dd>{formatTimestamp(incident.updatedAtUtc)} SAST</dd></div></dl>
    <h3>Report progress</h3><ol className="activity-timeline">{incident.events.map((event, index) => <li key={`${event.createdAtUtc}-${index}`}><strong>{statusLabel(event.newStatus ?? incident.status)}</strong><p>{event.summary}</p><time dateTime={event.createdAtUtc}>{formatTimestamp(event.createdAtUtc)} SAST</time></li>)}</ol>
    <p className="service-note">A recorded resolution is a municipal operator’s update, not independent verification that a physical repair was completed. This remains an independent Hackathon Prototype, not an official municipal service.</p>
  </article>
}
