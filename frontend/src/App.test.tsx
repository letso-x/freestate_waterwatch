import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createIncident, getIncidents } from './lib/api'
import type { Incident } from './lib/incidents'

vi.mock('./lib/api', async importOriginal => ({
  ...await importOriginal<typeof import('./lib/api')>(), getIncidents: vi.fn(), createIncident: vi.fn(),
}))
// Fixtures are confined to tests; the operational UI has no sample reports.
const report: Incident = {
  id: '40ac8cb2-20d8-4bfa-8f4d-74f466767236', title: 'Burst pipe near library',
  description: 'Water is flowing from a pipe beside the library.', location: 'Welkom, Library Street',
  status: 'Reported', createdAtUtc: '2026-10-29T10:00:00Z', latitude: null, longitude: null,
}

beforeEach(() => { vi.mocked(getIncidents).mockReset().mockResolvedValue([]); vi.mocked(createIncident).mockReset() })

async function openAndFill() {
  const user = userEvent.setup({ delay: null })
  await user.click(screen.getByRole('button', { name: /^Report incident$/ }))
  const dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByLabelText(/Incident title/), report.title)
  await user.type(within(dialog).getByLabelText(/Location/), report.location)
  await user.type(within(dialog).getByLabelText(/What did you notice/), report.description)
  return { user, dialog }
}

describe('municipal dashboard', () => {
  it('shows loading without inventing zero statistics', async () => {
    vi.mocked(getIncidents).mockReturnValue(new Promise(() => {}))
    render(<App />)
    expect(screen.getByText('Loading incident reports')).toBeInTheDocument()
    expect(screen.queryByText('No incidents reported yet')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Incident summary' })).getAllByText('—')).toHaveLength(4)
  })
  it('shows the actual empty state', async () => {
    render(<App />)
    expect(await screen.findByText('No incidents reported yet')).toBeInTheDocument()
    expect(screen.getByText(/Showing 0 of 0 incidents/)).toBeInTheDocument()
  })
  it('renders real response fields and filters by text and status', async () => {
    vi.mocked(getIncidents).mockResolvedValue([report])
    const user = userEvent.setup({ delay: null })
    render(<App />)
    expect(await screen.findByRole('heading', { name: report.title })).toBeInTheDocument()
    expect(screen.getByText(report.description)).toBeInTheDocument()
    expect(screen.getByText(report.location)).toBeInTheDocument()
    expect(screen.getByText(/29 Oct 2026/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Status'), 'Reported')
    expect(screen.getByRole('heading', { name: report.title })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search incidents'), 'not found')
    expect(screen.getByText('No reports match your filters')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('heading', { name: report.title })).toBeInTheDocument()
  })
  it('shows an error and recovers on retry', async () => {
    vi.mocked(getIncidents).mockRejectedValueOnce(new Error('The API is offline.')).mockResolvedValue([])
    const user = userEvent.setup({ delay: null })
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The API is offline.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No incidents reported yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('validates before sending a report', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await screen.findByText('No incidents reported yet')
    await user.click(screen.getByRole('button', { name: /^Report incident$/ }))
    await user.click(screen.getByRole('button', { name: 'Submit report' }))
    expect(screen.getAllByText('Enter at least 3 characters.')).toHaveLength(2)
    expect(screen.getByText('Enter at least 10 characters.')).toBeInTheDocument()
    expect(createIncident).not.toHaveBeenCalled()
  })
  it('submits, refreshes records and immediately shows the stored incident', async () => {
    vi.mocked(getIncidents).mockResolvedValueOnce([]).mockResolvedValue([report])
    vi.mocked(createIncident).mockResolvedValue(report)
    render(<App />)
    await screen.findByText('No incidents reported yet')
    const { user } = await openAndFill()
    await user.click(screen.getByRole('button', { name: 'Submit report' }))
    expect(await screen.findByRole('heading', { name: report.title })).toBeInTheDocument()
    expect(createIncident).toHaveBeenCalledWith({ title: report.title, location: report.location, description: report.description })
    expect(getIncidents).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('saved successfully')
  })
  it('preserves input when POST fails', async () => {
    vi.mocked(createIncident).mockRejectedValue(new Error('Submission unavailable.'))
    render(<App />)
    await screen.findByText('No incidents reported yet')
    const { user, dialog } = await openAndFill()
    await user.click(within(dialog).getByRole('button', { name: 'Submit report' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Submission unavailable.')
    expect(within(dialog).getByLabelText(/Incident title/)).toHaveValue(report.title)
    expect(within(dialog).getByRole('button', { name: 'Submit report' })).toBeEnabled()
  })
  it('retains the confirmed report if refresh fails after a successful POST', async () => {
    vi.mocked(getIncidents).mockResolvedValueOnce([]).mockRejectedValue(new Error('Refresh unavailable.'))
    vi.mocked(createIncident).mockResolvedValue(report)
    render(<App />)
    await screen.findByText('No incidents reported yet')
    const { user } = await openAndFill()
    await user.click(screen.getByRole('button', { name: 'Submit report' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: report.title })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh unavailable.')
    expect(createIncident).toHaveBeenCalledTimes(1)
  })
})
