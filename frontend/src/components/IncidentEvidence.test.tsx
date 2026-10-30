import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IncidentEvidence from './IncidentEvidence'
import { getAttachmentImage, getIncidentAttachments, uploadRepairPhoto } from '../lib/api'

vi.mock('../lib/api', () => ({ getAttachmentImage: vi.fn(), getIncidentAttachments: vi.fn(), uploadRepairPhoto: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks(); URL.createObjectURL = vi.fn(() => 'blob:private-evidence'); URL.revokeObjectURL = vi.fn()
  vi.mocked(getIncidentAttachments).mockResolvedValue([{ id: 'report-photo', attachmentType: 'ReportEvidence', createdAtUtc: '2026-10-30T04:00:00Z' }])
  vi.mocked(getAttachmentImage).mockResolvedValue(new Blob(['image'], { type: 'image/jpeg' }))
  vi.mocked(uploadRepairPhoto).mockResolvedValue({ id: 'repair-photo', attachmentType: 'RepairEvidence', createdAtUtc: '2026-10-30T04:05:00Z' })
})
it('retrieves private image bytes through the backend and opens the staff preview', async () => {
  const view = render(<IncidentEvidence incidentId="incident-1" />)
  const preview = await screen.findByRole('button', { name: /View report photos photo/ })
  await userEvent.setup().click(preview)
  expect(getAttachmentImage).toHaveBeenCalledWith('incident-1', 'report-photo')
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Report photo')
  expect(screen.getByAltText('Resident-submitted incident photo')).toHaveAttribute('src', 'blob:private-evidence')
  view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-evidence')
})
it('uploads staff repair evidence and refreshes the existing evidence list', async () => {
  render(<IncidentEvidence incidentId="incident-1" />)
  const user = userEvent.setup({ delay: null }); const file = new File(['image'], 'repair.webp', { type: 'image/webp' })
  await user.upload(screen.getByLabelText('Add repair photo'), file)
  await user.click(screen.getByRole('button', { name: 'Upload repair photo' }))
  expect(await screen.findByText('Repair photo uploaded.')).toBeInTheDocument()
  expect(uploadRepairPhoto).toHaveBeenCalledWith('incident-1', file, expect.any(String))
  expect(getIncidentAttachments).toHaveBeenCalledTimes(2)
})
