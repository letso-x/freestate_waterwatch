import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { addInternalNote, getEvents, updateAssignment, updatePriority, updateStatus } from '../lib/api'
import { formatTimestamp, nextStatus, priorities, statusLabel } from '../lib/incidents'
import type { Incident, IncidentEvent } from '../lib/incidents'
import IncidentRecord from './IncidentRecord'
import LocationPicker from './LocationPicker'

export default function IncidentManagement({ initialIncident }: { initialIncident: Incident }) {
  const [incident, setIncident] = useState(initialIncident)
  const [events, setEvents] = useState<IncidentEvent[]>([])
  const [historyError, setHistoryError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusNote, setStatusNote] = useState('')
  const [priority, setPriority] = useState(incident.priority ?? 'Medium')
  const [priorityNote, setPriorityNote] = useState('')
  const [assignedTo, setAssignedTo] = useState(incident.assignedTo ?? '')
  const [assignmentNote, setAssignmentNote] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const next = nextStatus(incident.status)
  async function loadHistory() {
    setHistoryError('')
    try { setEvents(await getEvents(incident.id)) }
    catch (cause) { setHistoryError(cause instanceof Error ? cause.message : 'History could not be loaded.') }
  }
  useEffect(() => { void loadHistory() }, [incident.id])
  async function change(action: () => Promise<Incident | IncidentEvent>, message: string, reset: () => void) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await action()
      if ('status' in saved) { setIncident(saved); setPriority(saved.priority ?? 'Medium'); setAssignedTo(saved.assignedTo ?? '') }
      else setIncident(current => ({ ...current, updatedAtUtc: saved.createdAtUtc }))
      reset(); setNotice(message); await loadHistory()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The incident could not be updated.') }
    finally { setBusy(false) }
  }
  function statusSubmit(event: FormEvent) {
    event.preventDefault()
    if (!next) return
    if (next === 'Resolved' && statusNote.trim().length < 10) { setError('Describe the resolution action in at least 10 characters.'); return }
    void change(() => updateStatus(incident.id, next, statusNote.trim()), `Status updated to ${statusLabel(next)}.`, () => setStatusNote(''))
  }
  const actions: Record<string,string> = { UnderReview: incident.status === 'Resolved' ? 'Reopen for review' : 'Start review', InProgress: 'Start work', Resolved: 'Record resolution' }
  return <>
    {notice && <div className="success-banner" role="status">{notice}</div>}
    {error && <div className="error-banner" role="alert">{error} <span>For a concurrent update, reload the incident before retrying.</span></div>}
    <IncidentRecord incident={incident} />
    {incident.latitude != null && incident.longitude != null && <section className="record-card"><h2>Recorded incident location</h2><LocationPicker value={{ latitude: incident.latitude, longitude: incident.longitude }} onChange={() => {}} readOnly /></section>}
    <div className="management-grid">
      <form className="record-card management-form" onSubmit={statusSubmit} aria-label="Status management">
        <h2>Manage status</h2><p>Current: <strong>{statusLabel(incident.status)}</strong></p>
        <label htmlFor="status-note">{next === 'Resolved' ? 'Resolution note (required)' : 'Status note (internal)'}</label>
        <textarea id="status-note" value={statusNote} onChange={event => setStatusNote(event.target.value)} maxLength={2000} required={next === 'Resolved'} disabled={busy} rows={3} />
        <p className="field-hint">Public tracking shows the status change, never this note. Resolution is operator-recorded, not independently verified.</p>
        <button className="button button-primary" disabled={busy || !next}>{busy ? 'Saving…' : next ? actions[next] : 'No transition available'}</button>
      </form>
      <form className="record-card management-form" aria-label="Priority management" onSubmit={event => { event.preventDefault(); void change(() => updatePriority(incident.id, priority, priorityNote.trim()), 'Priority updated.', () => setPriorityNote('')) }}>
        <h2>Priority</h2><label htmlFor="incident-priority">Operational priority</label><select id="incident-priority" value={priority} onChange={event => setPriority(event.target.value)} disabled={busy}>{priorities.map(item => <option key={item}>{item}</option>)}</select>
        <label htmlFor="priority-note">Priority note (internal, optional)</label><textarea id="priority-note" value={priorityNote} onChange={event => setPriorityNote(event.target.value)} maxLength={2000} disabled={busy} rows={2} />
        <button className="button button-primary" disabled={busy || priority === (incident.priority ?? 'Medium')}>Save priority</button>
      </form>
      <form className="record-card management-form" aria-label="Assignment management" onSubmit={event => { event.preventDefault(); void change(() => updateAssignment(incident.id, assignedTo, assignmentNote.trim()), 'Assignment updated.', () => setAssignmentNote('')) }}>
        <h2>Assigned team / operator</h2><label htmlFor="assigned-to">Team or operator name</label><input id="assigned-to" value={assignedTo} onChange={event => setAssignedTo(event.target.value)} maxLength={120} disabled={busy} placeholder="Leave empty to unassign" />
        <label htmlFor="assignment-note">Assignment note (internal, optional)</label><textarea id="assignment-note" value={assignmentNote} onChange={event => setAssignmentNote(event.target.value)} maxLength={2000} disabled={busy} rows={2} /><p className="field-hint">Assignment does not change lifecycle status.</p><button className="button button-primary" disabled={busy || assignedTo.trim() === (incident.assignedTo ?? '')}>Save assignment</button>
      </form>
      <form className="record-card management-form" aria-label="Internal notes" onSubmit={event => { event.preventDefault(); if (internalNote.trim().length < 3) { setError('Enter at least 3 characters for an internal note.'); return }; void change(() => addInternalNote(incident.id, internalNote.trim()), 'Internal note added.', () => setInternalNote('')) }}>
        <h2>Internal investigation note</h2><label htmlFor="internal-note">Private note</label><textarea id="internal-note" value={internalNote} onChange={event => setInternalNote(event.target.value)} maxLength={2000} required disabled={busy} rows={4} /><p className="field-hint">Visible only to authorised operators. Notes cannot be edited or deleted.</p><button className="button button-primary" disabled={busy}>Add internal note</button>
      </form>
    </div>
    <section className="record-card" aria-label="Incident activity"><h2>Activity timeline</h2>{historyError && <div role="alert" className="error-banner">{historyError}<button className="button button-secondary" onClick={() => void loadHistory()}>Retry history</button></div>}
      <ol className="activity-timeline">{events.map(event => <li key={event.id}><strong>{event.eventType === 'StatusChanged' ? `${statusLabel(event.oldStatus ?? '')} → ${statusLabel(event.newStatus ?? '')}` : event.eventType.replace(/([a-z])([A-Z])/g, '$1 $2')}</strong><span className="event-visibility">{event.isPublic ? 'Public progress metadata · note restricted' : 'Internal only'}</span>{event.note && <p className="record-description">{event.note}</p>}<p>Actor: {event.actorIdentifier}</p><time dateTime={event.createdAtUtc}>{formatTimestamp(event.createdAtUtc)} SAST</time></li>)}</ol>
    </section>
  </>
}
