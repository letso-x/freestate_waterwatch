import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from './App'
import { ApiError, createIncident, getIncident, getIncidents, getPublicTracking, getEvents } from './lib/api'
import type { Incident } from './lib/incidents'

vi.mock('./lib/api', async importOriginal => ({
  ...await importOriginal<typeof import('./lib/api')>(), getIncidents: vi.fn(), getIncident: vi.fn(), getPublicTracking: vi.fn(), getEvents: vi.fn(), createIncident: vi.fn(),
}))
vi.mock('./components/OperatorAccess', () => ({ OperatorGate: ({ children }: { children: import('react').ReactNode }) => children, OperatorProvider: ({ children }: { children: import('react').ReactNode }) => children }))
// The map adapter is tested separately; these route tests exercise the real form.
vi.mock('./components/LocationPicker', () => ({ default: ({ onChange }: { onChange: (value: { latitude: number; longitude: number }) => void }) => <button type="button" onClick={() => onChange({ latitude: -29.12, longitude: 26.21 })}>Select test map point</button> }))
const report: Incident = {
  id: '40ac8cb2-20d8-4bfa-8f4d-74f466767236', title: 'Burst pipe near library',
  description: 'Water is flowing from a pipe beside the library.', location: 'Bloemfontein, Library Street',
  status: 'Reported', createdAtUtc: '2026-10-29T10:00:00Z', latitude: -29.12, longitude: 26.21,
}

beforeEach(() => {
  vi.mocked(getIncidents).mockReset().mockResolvedValue([])
  vi.mocked(getIncident).mockReset().mockResolvedValue(report)
  vi.mocked(getPublicTracking).mockReset().mockResolvedValue({ id: report.id, title: report.title, locationDescription: 'Location recorded', status: report.status, createdAtUtc: report.createdAtUtc, updatedAtUtc: report.createdAtUtc, events: [] })
  vi.mocked(getEvents).mockReset().mockResolvedValue([])
  vi.mocked(createIncident).mockReset()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
})
function open(path = '/operations/incidents') { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>) }
async function fill() {
  const user = userEvent.setup({ delay: null })
  await user.click(screen.getByLabelText(/Report title/)); await user.paste(report.title)
  await user.click(screen.getByLabelText(/^Location/)); await user.paste(report.location)
  await user.click(screen.getByLabelText(/What did you notice/)); await user.paste(report.description)
  return user
}

describe('municipal monitoring', () => {
  it('shows loading without invented statistics', () => {
    vi.mocked(getIncidents).mockReturnValue(new Promise(() => {}))
    open()
    expect(screen.getByText('Loading reports')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Incident summary' })).getAllByText('—')).toHaveLength(4)
  })
  it('retains the empty state and removes public submission from operations', async () => {
    open()
    expect(await screen.findByText('No reports yet')).toBeInTheDocument()
    expect(screen.getByText(/Showing 0 of 0 reports/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Report incident|Send report/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Resident reporting portal/ })).toHaveAttribute('href', '/report')
    expect(screen.queryByText('Hackathon Prototype')).not.toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Not an official Mangaung municipal service.')
  })
  it('preserves response fields, status filtering and search', async () => {
    vi.mocked(getIncidents).mockResolvedValue([report])
    const user = userEvent.setup({ delay: null })
    open()
    expect(await screen.findByRole('link', { name: report.title })).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent(report.title)
    expect(screen.getByText(report.location)).toBeInTheDocument()
    expect(screen.getAllByText(/29 Oct 2026/).length).toBeGreaterThan(0)
    await user.selectOptions(screen.getByLabelText('Status'), 'Reported')
    await user.click(screen.getByLabelText('Search reports')); await user.paste('not found')
    expect(screen.getByText('No matching reports')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('link', { name: report.title })).toBeInTheDocument()
  })
  it('recovers from fetch failure on retry', async () => {
    vi.mocked(getIncidents).mockRejectedValueOnce(new Error('The API is offline.')).mockResolvedValue([])
    const user = userEvent.setup({ delay: null })
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('The API is offline.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No reports yet')).toBeInTheDocument()
  })
  it('opens an incident details route using a single-record lookup', async () => {
    vi.mocked(getIncidents).mockResolvedValue([report])
    const user = userEvent.setup({ delay: null })
    open()
    await user.click(await screen.findByRole('link', { name: report.title }))
    expect(await screen.findByRole('heading', { name: 'Report details' })).toBeInTheDocument()
    expect(await screen.findByText('-29.120000, 26.210000')).toBeInTheDocument()
    expect(screen.getByText(report.description)).toBeInTheDocument()
    expect(getIncident).toHaveBeenCalledWith(report.id, expect.any(AbortSignal))
  })
})

describe('independent resident portal', () => {
  it('validates required fields before POST and does not fetch the incident list', async () => {
    const user = userEvent.setup({ delay: null })
    open('/report')
    await user.click(screen.getByRole('button', { name: 'Send report' }))
    expect(screen.getAllByText('Enter at least 3 characters.')).toHaveLength(2)
    expect(screen.getByText('Enter at least 10 characters.')).toBeInTheDocument()
    expect(createIncident).not.toHaveBeenCalled()
    expect(getIncidents).not.toHaveBeenCalled()
  })
  it('submits and displays a verified confirmation with the full reference', async () => {
    vi.mocked(createIncident).mockResolvedValue(report)
    open('/report')
    const user = await fill()
    await user.click(screen.getByRole('button', { name: 'Send report' }))
    expect(await screen.findByRole('heading', { name: 'Your report has been received.' })).toBeInTheDocument()
    expect(screen.getByText(report.id)).toBeInTheDocument()
    expect(createIncident).toHaveBeenCalledWith({ title: report.title, location: report.location, description: report.description })
    expect(getIncidents).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Track this report' })).toHaveAttribute('href', `/track?reference=${report.id}`)
  })
  it('retains entered text when submission fails', async () => {
    vi.mocked(createIncident).mockRejectedValue(new Error('Submission unavailable.'))
    open('/report')
    const user = await fill()
    await user.click(screen.getByRole('button', { name: 'Send report' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Submission unavailable.')
    expect(screen.getByLabelText(/Report title/)).toHaveValue(report.title)
    expect(screen.getByRole('button', { name: 'Send report' })).toBeEnabled()
  })
  it('does not offer resubmission if the confirmation lookup fails after saving', async () => {
    vi.mocked(createIncident).mockResolvedValue(report)
    vi.mocked(getPublicTracking).mockRejectedValue(new Error('Lookup unavailable.'))
    open('/report')
    const user = await fill()
    await user.click(screen.getByRole('button', { name: 'Send report' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('keep this reference')
    expect(screen.getByRole('alert')).toHaveTextContent(report.id)
    expect(screen.queryByRole('button', { name: 'Send report' })).not.toBeInTheDocument()
    expect(createIncident).toHaveBeenCalledTimes(1)
  })
  it('saves map-selected coordinates through the existing POST contract', async () => {
    vi.mocked(createIncident).mockResolvedValue(report)
    open('/report')
    const user = await fill()
    await user.click(screen.getByRole('button', { name: 'Select test map point' }))
    await user.click(screen.getByRole('button', { name: 'Send report' }))
    await screen.findByRole('heading', { name: 'Your report has been received.' })
    expect(createIncident).toHaveBeenCalledWith(expect.objectContaining({ latitude: -29.12, longitude: 26.21 }))
  })
  it('does not request GPS until clicked and handles permission denial', async () => {
    const locate = vi.fn((_success, failure) => failure({ code: 1 }))
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: locate } })
    open('/report')
    expect(locate).not.toHaveBeenCalled()
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByRole('button', { name: 'Use my current location' }))
    expect(await screen.findByText(/Location access was declined/)).toBeInTheDocument()
    expect(screen.getByLabelText('Latitude')).toHaveValue(null)
    expect(screen.getByRole('button', { name: 'Send report' })).toBeEnabled()
  })
  it('populates coordinates after GPS succeeds', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn(success => success({ coords: { latitude: -29.12, longitude: 26.21 } })) } })
    open('/report')
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByRole('button', { name: 'Use my current location' }))
    expect(screen.getByLabelText('Latitude')).toHaveValue(-29.12)
    expect(screen.getByLabelText('Longitude')).toHaveValue(26.21)
  })
  it('rejects an incomplete coordinate pair and states that photos are unavailable', async () => {
    open('/report')
    const user = await fill()
    await user.type(screen.getByLabelText('Latitude'), '91')
    await user.click(screen.getByRole('button', { name: 'Send report' }))
    expect(screen.getByText('Latitude must be between -90 and 90.')).toBeInTheDocument()
    expect(screen.getByText('Supply both latitude and longitude, or clear both.')).toBeInTheDocument()
    expect(createIncident).not.toHaveBeenCalled()
    expect(screen.getByText(/Photo attachments aren’t available yet/)).toBeInTheDocument()
    expect(document.querySelector('input[type=file]')).toBeNull()
  })
  it('does not fabricate a receipt for the direct success route', () => {
    open('/report/success')
    expect(screen.queryByRole('heading', { name: 'Your report has been received.' })).not.toBeInTheDocument()
    expect(screen.getByText(/This link doesn’t include a reference number/)).toBeInTheDocument()
    expect(getIncident).not.toHaveBeenCalled()
  })
})

describe('resident tracking', () => {
  it('validates the full reference before a lookup', async () => {
    open('/track')
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByLabelText('Reference number')); await user.paste('short')
    await user.click(screen.getByRole('button', { name: 'Track report' }))
    expect(screen.getByText('Enter the full reference number from your confirmation.')).toBeInTheDocument()
    expect(getIncident).not.toHaveBeenCalled()
  })
  it('retrieves the requested report without loading other citizen reports', async () => {
    open('/track')
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByLabelText('Reference number')); await user.paste(report.id)
    await user.click(screen.getByRole('button', { name: 'Track report' }))
    expect(await screen.findByRole('link', { name: report.title })).toBeInTheDocument()
    expect(getIncidents).not.toHaveBeenCalled()
  })
  it('shows not-found feedback for an unknown reference', async () => {
    vi.mocked(getPublicTracking).mockRejectedValue(new ApiError('Not found', {}, 404))
    open(`/track?reference=${report.id}`)
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t find that report')
  })
})
