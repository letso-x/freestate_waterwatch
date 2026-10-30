import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReportIncident from './ReportIncident'
import { createIncident, uploadReportPhoto } from '../lib/api'
import type { Incident } from '../lib/incidents'

vi.mock('../lib/api', async original => ({ ...await original<typeof import('../lib/api')>(), createIncident: vi.fn(), uploadReportPhoto: vi.fn() }))
vi.mock('./LocationPicker', () => ({ default: () => <div>Location selection</div> }))
const report: Incident = { id: '40ac8cb2-20d8-4bfa-8f4d-74f466767236', title: 'Water at manhole', description: 'Water is collecting beside the manhole.', location: 'Test street', status: 'Reported', latitude: null, longitude: null, createdAtUtc: '2026-10-30T04:00:00Z' }
beforeEach(() => {
  vi.resetAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:local-photo-preview')
  URL.revokeObjectURL = vi.fn()
  vi.mocked(createIncident).mockResolvedValue(report)
  vi.mocked(uploadReportPhoto).mockResolvedValue({ id: 'photo-1', attachmentType: 'ReportEvidence', createdAtUtc: report.createdAtUtc })
})
async function fill() {
  const user = userEvent.setup({ delay: null })
  for (const [label, value] of [[/Report title/, report.title], [/^Location/, report.location], [/What did you notice/, report.description]] as const) {
    await user.click(screen.getByLabelText(label)); await user.paste(value)
  }
  return user
}
it('previews the selected file and uploads it with a scoped capability and stable photo identity', async () => {
  const created = vi.fn().mockResolvedValue(undefined)
  const view = render(<ReportIncident onCreated={created} />)
  const user = await fill(); const file = new File(['selected image bytes'], 'water.jpg', { type: 'image/jpeg' })
  await user.upload(screen.getByLabelText('Add photos'), file)
  expect(screen.getByAltText('Preview: water.jpg')).toHaveAttribute('src', 'blob:local-photo-preview')
  await user.click(screen.getByRole('button', { name: 'Send report' }))
  expect(createIncident).toHaveBeenCalledWith(expect.objectContaining({ title: report.title }), true)
  expect(uploadReportPhoto).toHaveBeenCalledWith(report.id, file, expect.any(String))
  expect(created).toHaveBeenCalledWith(report)
  view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalled()
})
it('can retry a failed photo without creating a second report or changing the upload identity', async () => {
  vi.mocked(uploadReportPhoto).mockRejectedValueOnce(new Error('Photo upload unavailable.'))
  const created = vi.fn().mockResolvedValue(undefined)
  render(<ReportIncident onCreated={created} />)
  const user = await fill(); await user.upload(screen.getByLabelText('Add photos'), new File(['image'], 'water.png', { type: 'image/png' }))
  await user.click(screen.getByRole('button', { name: 'Send report' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(`Report saved as ${report.id}`)
  const retry = screen.getByRole('button', { name: 'Retry photo uploads' }); expect(retry).toBeEnabled()
  expect(created).not.toHaveBeenCalled()
  const originalUpload = vi.mocked(uploadReportPhoto).mock.calls[0]
  await user.click(retry)
  expect(createIncident).toHaveBeenCalledTimes(1)
  expect(vi.mocked(uploadReportPhoto).mock.calls[1]).toEqual(originalUpload)
  expect(created).toHaveBeenCalledWith(report)
})
it('limits previews to three files and rejects unsupported or oversized files', async () => {
  render(<ReportIncident onCreated={vi.fn()} />)
  const user = userEvent.setup({ applyAccept: false, delay: null })
  await user.upload(screen.getByLabelText('Add photos'), new File(['svg'], 'bad.svg', { type: 'image/svg+xml' }))
  expect(screen.getByRole('alert')).toHaveTextContent('JPEG, PNG or WebP')
  await user.upload(screen.getByLabelText('Add photos'), new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }))
  expect(screen.getByRole('alert')).toHaveTextContent('5 MB')
  await user.upload(screen.getByLabelText('Add photos'), [1, 2, 3, 4].map(index => new File(['photo'], `${index}.jpg`, { type: 'image/jpeg' })))
  expect(screen.getAllByRole('img')).toHaveLength(3)
  expect(screen.getByRole('alert')).toHaveTextContent('up to 3 photos')
  expect(screen.getByLabelText('Take photo')).toHaveAttribute('capture', 'environment')
})
