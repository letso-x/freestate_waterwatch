import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

configure({ asyncUtilTimeout: 5000 })
vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:5100')
afterEach(() => cleanup())
window.scrollTo = vi.fn()
