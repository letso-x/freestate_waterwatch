import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { OperatorGate, OperatorProvider } from './OperatorAccess'
import { clearOperatorToken, getIncidents, setOperatorToken } from '../lib/api'
vi.mock('../lib/api', () => ({ getIncidents: vi.fn(), setOperatorToken: vi.fn(), clearOperatorToken: vi.fn() }))
const localWrite = vi.fn(), sessionWrite = vi.fn()
beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { setItem: localWrite, getItem: () => null, removeItem: vi.fn(), clear: vi.fn(), length: 0 } })
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: { setItem: sessionWrite, getItem: () => null, removeItem: vi.fn(), clear: vi.fn(), length: 0 } })
  vi.clearAllMocks(); vi.mocked(getIncidents).mockResolvedValue([]) })
it('requires a token and verifies it before showing operations', async () => {
  render(<MemoryRouter><OperatorProvider><OperatorGate><h2>Protected operations</h2></OperatorGate></OperatorProvider></MemoryRouter>)
  expect(screen.queryByText('Protected operations')).not.toBeInTheDocument()
  const user = userEvent.setup({ delay: null })
  const token = crypto.randomUUID() + crypto.randomUUID()
  await user.click(screen.getByLabelText('Demo operator token')); await user.paste(token)
  await user.click(screen.getByRole('button', { name: 'Open operations' }))
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
  await user.click(screen.getByLabelText('Demo operator token')); await user.paste(crypto.randomUUID()+crypto.randomUUID())
  await user.click(screen.getByRole('button', { name: 'Open operations' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Operator credential rejected.')
  expect(screen.queryByText('Protected operations')).not.toBeInTheDocument()
  expect(clearOperatorToken).toHaveBeenCalled()
})
