vi.mock('./IncidentEvidence', () => ({ default: () => <section aria-label="Incident evidence">Photos</section> }))
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IncidentManagement from './IncidentManagement'
import PublicTrackingRecord from './PublicTrackingRecord'
import { ApiError, addInternalNote, getEvents, updateAssignment, updatePriority, updateStatus } from '../lib/api'
import type { Incident, IncidentEvent } from '../lib/incidents'

vi.mock('../lib/api', async original => ({ ...await original<typeof import('../lib/api')>(), getEvents: vi.fn(), updateStatus: vi.fn(), updatePriority: vi.fn(), updateAssignment: vi.fn(), addInternalNote: vi.fn() }))
vi.mock('./LocationPicker', () => ({ default: () => <div aria-label="Recorded map" /> }))
const report: Incident = { id: '40ac8cb2-20d8-4bfa-8f4d-74f466767236', title: 'Pipe leak', description: 'Water is flowing beside the road.', location: 'Bloemfontein', latitude: null, longitude: null, status: 'Reported', createdAtUtc: '2026-10-30T08:00:00Z', updatedAtUtc: '2026-10-30T08:00:00Z', priority: 'Medium', assignedTo: null }
const event: IncidentEvent = { id: 'event-1', incidentId: report.id, eventType: 'NoteAdded', oldStatus: null, newStatus: null, note: 'Private investigation details', actorIdentifier: 'demo-operator', isPublic: false, createdAtUtc: '2026-10-30T09:00:00Z' }
beforeEach(() => { vi.mocked(getEvents).mockReset().mockResolvedValue([]); vi.mocked(updateStatus).mockReset(); vi.mocked(updatePriority).mockReset(); vi.mocked(updateAssignment).mockReset(); vi.mocked(addInternalNote).mockReset() })

describe('operator workflow', () => {
  it('offers only the valid next transition', () => {
    render(<IncidentManagement initialIncident={report} />)
    expect(screen.getByRole('button', { name: 'Start review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start work' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record resolution' })).not.toBeInTheDocument()
  })
  it('persists a status change and confirms the returned status', async () => {
    vi.mocked(updateStatus).mockResolvedValue({ ...report, status: 'UnderReview' })
    render(<IncidentManagement initialIncident={report} />)
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Start review' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Status updated to Under Review.')
    expect(screen.getByRole('button', { name: 'Start work' })).toBeInTheDocument()
    expect(updateStatus).toHaveBeenCalledWith(report.id, 'UnderReview', '')
  })
  it('shows transition validation errors without claiming success', async () => {
    vi.mocked(updateStatus).mockRejectedValue(new ApiError('Cannot change this status.', {}, 400))
    render(<IncidentManagement initialIncident={report} />)
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Start review' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot change this status.')
    expect(screen.queryByText('Status updated to Under Review.')).not.toBeInTheDocument()
  })
  it('requires a meaningful resolution note and supports reopening', async () => {
    const view = render(<IncidentManagement initialIncident={{ ...report, status: 'InProgress' }} />)
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByLabelText('Resolution details (required)')); await user.paste('fixed')
    await user.click(screen.getByRole('button', { name: 'Record resolution' }))
    expect(screen.getByRole('alert')).toHaveTextContent('at least 10 characters')
    expect(updateStatus).not.toHaveBeenCalled()
    vi.mocked(updateStatus).mockResolvedValue({ ...report, status: 'Resolved', resolvedAtUtc: '2026-10-30T09:00:00Z' })
    await user.clear(screen.getByLabelText('Resolution details (required)'))
    await user.click(screen.getByLabelText('Resolution details (required)')); await user.paste('Replaced the damaged section of pipe.')
    await user.click(screen.getByRole('button', { name: 'Record resolution' }))
    expect(await screen.findByRole('button', { name: 'Reopen for review' })).toBeInTheDocument()
    view.unmount()
  })
  it('updates priority and assignment without changing lifecycle status', async () => {
    vi.mocked(updatePriority).mockResolvedValue({ ...report, priority: 'High' })
    vi.mocked(updateAssignment).mockResolvedValue({ ...report, priority: 'High', assignedTo: 'Maintenance A' })
    render(<IncidentManagement initialIncident={report} />)
    const user = userEvent.setup({ delay: null })
    await user.selectOptions(screen.getByLabelText('Priority'), 'High')
    await user.click(screen.getByRole('button', { name: 'Save priority' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Priority updated.')
    await user.click(screen.getByLabelText('Team or staff member')); await user.paste('Maintenance A')
    await user.click(screen.getByRole('button', { name: 'Save assignment' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Assignment updated.')
    expect(updateAssignment).toHaveBeenCalledWith(report.id, 'Maintenance A', '')
    expect(screen.getByRole('button', { name: 'Start review' })).toBeInTheDocument()
  })
  it('appends an internal note and displays the saved activity timeline', async () => {
    vi.mocked(addInternalNote).mockResolvedValue(event)
    vi.mocked(getEvents).mockResolvedValue([event])
    render(<IncidentManagement initialIncident={report} />)
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByLabelText('Note')); await user.paste('Private investigation details')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Note saved.')
    expect(screen.getByText('Private investigation details')).toBeInTheDocument()
    expect(screen.getByText('Staff only')).toBeInTheDocument()
    expect(screen.getByText('Recorded by: demo-operator')).toBeInTheDocument()
  })
})

it('shows safe public progress with readable labels and excludes operational fields', () => {
  const tracking = { id: report.id, title: report.title, locationDescription: 'Location recorded', status: 'Resolved', createdAtUtc: report.createdAtUtc, updatedAtUtc: '2026-10-30T09:00:00Z', events: [{ eventType: 'StatusChanged', oldStatus: 'UnderReview', newStatus: 'InProgress', summary: 'Municipal operator recorded In Progress.', createdAtUtc: '2026-10-30T08:30:00Z' }], note: 'PRIVATE', actorIdentifier: 'SECRET OPERATOR', assignedTo: 'SECRET TEAM' }
  render(<PublicTrackingRecord incident={tracking} />)
  expect(screen.getByText('In Progress')).toBeInTheDocument()
  expect(screen.getByText('Resolved')).toBeInTheDocument()
  expect(screen.getByText('The team has marked this report as resolved.')).toBeInTheDocument()
  expect(screen.queryByText(/PRIVATE|SECRET OPERATOR|SECRET TEAM/)).not.toBeInTheDocument()
})
