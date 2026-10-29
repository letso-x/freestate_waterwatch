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
    catch (cause) { setHistoryError(cause instanceof Error ? cause.message : 'We couldn’t load the activity history.') }
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'We couldn’t save your changes.') }
    finally { setBusy(false) }
  }
  function statusSubmit(event: FormEvent) {
    event.preventDefault()
    if (!next) return
    if (next === 'Resolved' && statusNote.trim().length < 10) { setError('Describe the work completed in at least 10 characters.'); return }
    void change(() => updateStatus(incident.id, next, statusNote.trim()), `Status updated to ${statusLabel(next)}.`, () => setStatusNote(''))
  }
  const actions: Record<string,string> = { UnderReview: incident.status === 'Resolved' ? 'Reopen for review' : 'Start review', InProgress: 'Start work', Resolved: 'Record resolution' }
  return <>
    {notice && <div className="success-banner" role="status">{notice}</div>}
    {error && <div className="error-banner" role="alert">{error} </div>}
    <IncidentRecord incident={incident} />
    {incident.latitude != null && incident.longitude != null && <section className="record-card"><h2>Reported location</h2><LocationPicker value={{ latitude: incident.latitude, longitude: incident.longitude }} onChange={() => {}} readOnly /></section>}
    <div className="management-grid">
      <form className="record-card management-form" onSubmit={statusSubmit} aria-label="Report progress">
        <h2>Report progress</h2><p>Current: <strong>{statusLabel(incident.status)}</strong></p>
        <label htmlFor="status-note">{next === 'Resolved' ? 'Resolution details (required)' : 'Progress note (staff only)'}</label>
        <textarea id="status-note" value={statusNote} onChange={event => setStatusNote(event.target.value)} maxLength={2000} required={next === 'Resolved'} disabled={busy} rows={3} />
        <p className="field-hint">Residents can see the status change. Your note stays private.</p>
        <button className="button button-primary" disabled={busy || !next}>{busy ? 'Saving…' : next ? actions[next] : 'Update unavailable'}</button>
      </form>
      <form className="record-card management-form" aria-label="Report priority" onSubmit={event => { event.preventDefault(); void change(() => updatePriority(incident.id, priority, priorityNote.trim()), 'Priority updated.', () => setPriorityNote('')) }}>
        <h2>Priority</h2><label htmlFor="incident-priority">Priority</label><select id="incident-priority" value={priority} onChange={event => setPriority(event.target.value)} disabled={busy}>{priorities.map(item => <option key={item}>{item}</option>)}</select>
        <label htmlFor="priority-note">Priority note (optional)</label><textarea id="priority-note" value={priorityNote} onChange={event => setPriorityNote(event.target.value)} maxLength={2000} disabled={busy} rows={2} />
        <button className="button button-primary" disabled={busy || priority === (incident.priority ?? 'Medium')}>Save priority</button>
      </form>
      <form className="record-card management-form" aria-label="Maintenance assignment" onSubmit={event => { event.preventDefault(); void change(() => updateAssignment(incident.id, assignedTo, assignmentNote.trim()), 'Assignment updated.', () => setAssignmentNote('')) }}>
        <h2>Maintenance assignment</h2><label htmlFor="assigned-to">Team or staff member</label><input id="assigned-to" value={assignedTo} onChange={event => setAssignedTo(event.target.value)} maxLength={120} disabled={busy} placeholder="e.g. Maintenance Team A" />
        <label htmlFor="assignment-note">Assignment note (optional)</label><textarea id="assignment-note" value={assignmentNote} onChange={event => setAssignmentNote(event.target.value)} maxLength={2000} disabled={busy} rows={2} /><button className="button button-primary" disabled={busy || assignedTo.trim() === (incident.assignedTo ?? '')}>Save assignment</button>
      </form>
      <form className="record-card management-form" aria-label="Staff notes" onSubmit={event => { event.preventDefault(); if (internalNote.trim().length < 3) { setError('Enter at least 3 characters for an internal note.'); return }; void change(() => addInternalNote(incident.id, internalNote.trim()), 'Note saved.', () => setInternalNote('')) }}>
        <h2>Add a staff note</h2><label htmlFor="internal-note">Note</label><textarea id="internal-note" value={internalNote} onChange={event => setInternalNote(event.target.value)} maxLength={2000} required disabled={busy} rows={4} /><p className="field-hint">Only staff can see these notes. Saved notes cannot be changed.</p><button className="button button-primary" disabled={busy}>Save note</button>
      </form>
    </div>
    <section className="record-card" aria-label="Activity history"><h2>Activity history</h2>{historyError && <div role="alert" className="error-banner">{historyError}<button className="button button-secondary" onClick={() => void loadHistory()}>Try again</button></div>}
      <ol className="activity-timeline">{events.map(event => <li key={event.id}><strong>{event.eventType === 'StatusChanged' ? `${statusLabel(event.oldStatus ?? '')} → ${statusLabel(event.newStatus ?? '')}` : ({ Created: 'Report received', PriorityChanged: 'Priority changed', AssignmentChanged: 'Assignment changed', NoteAdded: 'Staff note' } as Record<string,string>)[event.eventType] ?? 'Report updated'}</strong><span className="event-visibility">{event.isPublic ? 'Status shared · note private' : 'Staff only'}</span>{event.note && <p className="record-description">{event.note}</p>}<p>Recorded by: {event.actorIdentifier}</p><time dateTime={event.createdAtUtc}>{formatTimestamp(event.createdAtUtc)} SAST</time></li>)}</ol>
    </section>
  </>
}
