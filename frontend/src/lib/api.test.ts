import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createIncident, getIncidents } from './api'
import type { Incident } from './incidents'

const row = (id: number): Incident => ({
  id: String(id), title: `Leak ${id}`, description: 'Water flowing from a damaged pipe.', location: 'Welkom',
  latitude: null, longitude: null, status: 'Reported', createdAtUtc: '2026-10-29T10:00:00Z',
})
afterEach(() => vi.unstubAllGlobals())

describe('API client', () => {
  it('fetches every page and deduplicates records', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(Array.from({ length: 100 }, (_, id) => row(id))))
      .mockResolvedValueOnce(Response.json([row(99), row(100)]))
    vi.stubGlobal('fetch', fetch)
    const incidents = await getIncidents()
    expect(incidents).toHaveLength(101)
    expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:5100/api/incidents?page=1&pageSize=100', expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:5100/api/incidents?page=2&pageSize=100', expect.any(Object))
  })
  it('sends JSON to the existing POST endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(row(1), { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    const input = { title: 'Burst pipe', description: 'Water flowing outside.', location: 'Welkom' }
    await expect(createIncident(input)).resolves.toEqual(row(1))
    expect(fetch).toHaveBeenCalledWith('http://localhost:5100/api/incidents', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    }))
  })
  it('surfaces server validation fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ title: 'Invalid input', errors: { Title: ['Title is required.'] } }, { status: 400 })))
    await expect(createIncident({ title: '', description: '', location: '' })).rejects.toMatchObject({ fieldErrors: { title: 'Title is required.' } })
  })
  it('provides useful network and database error messages', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(Response.json({}, { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    await expect(getIncidents()).rejects.toThrow('could not reach')
    await expect(getIncidents()).rejects.toThrow('temporarily unavailable')
  })
  it('rejects unexpected data rather than showing fake records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ records: [] })))
    await expect(getIncidents()).rejects.toBeInstanceOf(ApiError)
  })
})
