import { describe, expect, it } from 'vitest'
import { filterIncidents, summarize, validateIncident } from './incidents'
import type { Incident } from './incidents'

const incident: Incident = {
  id: 'test-1', title: 'Burst pipe', description: 'Water is flowing outside the library.', location: 'Welkom',
  latitude: null, longitude: null, status: 'Reported', createdAtUtc: '2026-10-28T23:30:00Z',
}

describe('incident rules', () => {
  it('requires meaningful text and enforces API lengths', () => {
    expect(validateIncident({ title: '  a  ', description: '          ', location: ' x ' })).toEqual({
      title: 'Enter at least 3 characters.', description: 'Enter at least 10 characters.', location: 'Enter at least 3 characters.',
    })
    expect(validateIncident({ title: 'x'.repeat(151), description: 'x'.repeat(2001), location: 'x'.repeat(301) })).toHaveProperty('title')
    expect(validateIncident({ title: 'Burst pipe', description: 'A damaged pipe outside.', location: 'Welkom' })).toEqual({})
  })
  it('searches title, description and location without case sensitivity', () => {
    for (const query of ['BURST', 'library', 'welkom']) expect(filterIncidents([incident], query, 'all')).toEqual([incident])
    expect(filterIncidents([incident], 'unmatched', 'all')).toEqual([])
    expect(filterIncidents([incident], '', 'Resolved')).toEqual([])
    expect(filterIncidents([incident], 'pipe', 'Reported')).toEqual([incident])
  })
  it('counts actual records and uses South Africa midnight for today', () => {
    const records = [incident, { ...incident, id: 'test-2', location: ' welkom ', createdAtUtc: '2026-10-27T21:00:00Z' }]
    expect(summarize(records, new Date('2026-10-29T01:00:00Z'))).toEqual({ total: 2, reported: 2, today: 1, locations: 1 })
    expect(summarize([])).toEqual({ total: 0, reported: 0, today: 0, locations: 0 })
  })
})
