import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:5100')
afterEach(() => cleanup())
// jsdom does not implement native dialog methods; browser QA uses the real dialog.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
