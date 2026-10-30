import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { OperatorGate, OperatorProvider } from './OperatorAccess'
import { ApiError, clearOperatorToken, getIncidents, setOperatorToken } from '../lib/api'
vi.mock('../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../lib/api')>(), getIncidents: vi.fn(), setOperatorToken: vi.fn(), clearOperatorToken: vi.fn() }))
const localWrite = vi.fn(), sessionWrite = vi.fn()
beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { setItem: localWrite, getItem: () => null, removeItem: vi.fn(), clear: vi.fn(), length: 0 } })
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: { setItem: sessionWrite, getItem: () => null, removeItem: vi.fn(), clear: vi.fn(), length: 0 } })
  vi.resetAllMocks(); vi.mocked(getIncidents).mockResolvedValue([]).mockRejectedValueOnce(new ApiError('Sign in required.', {}, 401)) })
it('requires a token and verifies it before showing operations', async () => {
  render(<MemoryRouter><OperatorProvider><OperatorGate><h2>Protected operations</h2></OperatorGate></OperatorProvider></MemoryRouter>)
  expect(screen.queryByText('Protected operations')).not.toBeInTheDocument()
  const user = userEvent.setup({ delay: null })
  const token = crypto.randomUUID() + crypto.randomUUID()
  await user.click(await screen.findByLabelText('Staff access key')); await user.paste(token)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('Protected operations')).toBeInTheDocument()
  expect(setOperatorToken).toHaveBeenCalledWith(token)
  expect(localWrite).not.toHaveBeenCalled(); expect(sessionWrite).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(screen.queryByText('Protected operations')).not.toBeInTheDocument()
  expect(clearOperatorToken).toHaveBeenCalled()
})
it('rejects a failed operator verification without exposing the workspace', async () => {
  vi.mocked(getIncidents).mockRejectedValue(new Error('Operator credential rejected.'))
  render(<MemoryRouter><OperatorProvider><OperatorGate><h2>Protected operations</h2></OperatorGate></OperatorProvider></MemoryRouter>)
  const user = userEvent.setup({ delay: null })
  await user.click(await screen.findByLabelText('Staff access key')); await user.paste(crypto.randomUUID()+crypto.randomUUID())
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Operator credential rejected.')
  expect(screen.queryByText('Protected operations')).not.toBeInTheDocument()
  expect(clearOperatorToken).toHaveBeenCalled()
})

it('opens local operations without a key and rechecks access after a full remount', async () => {
  vi.mocked(getIncidents).mockReset().mockResolvedValue([])
  const view = render(<MemoryRouter><OperatorProvider><OperatorGate><h2>Protected operations</h2></OperatorGate></OperatorProvider></MemoryRouter>)
  expect(await screen.findByText('Protected operations')).toBeInTheDocument()
  expect(screen.queryByLabelText('Staff access key')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  expect(setOperatorToken).not.toHaveBeenCalled()
  view.unmount()
  render(<MemoryRouter><OperatorProvider><OperatorGate><h2>Protected operations</h2></OperatorGate></OperatorProvider></MemoryRouter>)
  expect(await screen.findByText('Protected operations')).toBeInTheDocument()
  expect(getIncidents).toHaveBeenCalledTimes(2)
})
it('shows connection failures and retries instead of demanding a local key', async () => {
  vi.mocked(getIncidents).mockReset().mockRejectedValueOnce(new Error('Connection unavailable.')).mockResolvedValue([])
  render(<MemoryRouter><OperatorProvider><OperatorGate><h2>Protected operations</h2></OperatorGate></OperatorProvider></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection unavailable.')
  expect(screen.queryByLabelText('Staff access key')).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Protected operations')).toBeInTheDocument()
})
