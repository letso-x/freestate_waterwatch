import type { CreateIncidentRequest, FormErrors, Incident, IncidentEvent, PublicTracking } from './incidents'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const baseUrl = configuredBaseUrl?.replace(/\/+$/, '')

let operatorToken = ''
export function setOperatorToken(token: string) { operatorToken = token.trim() }
export function clearOperatorToken() { operatorToken = '' }

export class ApiError extends Error {
  public readonly fieldErrors: FormErrors
  public readonly status?: number
  constructor(message: string, fieldErrors: FormErrors = {}, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.fieldErrors = fieldErrors
    this.status = status
  }
}

function endpoint(path: string): string {
  if (!baseUrl) throw new ApiError('Reporting is unavailable. Please contact your service administrator.')
  if (!/^https?:\/\//i.test(baseUrl)) throw new ApiError('The service address is not valid. Please contact your service administrator.')
  return `${baseUrl}${path}`
}

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const privileged = path.startsWith('/api/incidents') && (options.method ?? 'GET') !== 'POST' || /\/api\/incidents\/[^/]+\/notes/.test(path)
  const headers = new Headers(options.headers)
  if (privileged && operatorToken) headers.set('Authorization', 'Bearer ' + operatorToken)
  let response: Response
  try {
    response = await fetch(endpoint(path), { ...options, headers: Object.fromEntries(headers.entries()), signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) })
  } catch (error) {
    if (error instanceof ApiError || (error instanceof DOMException && error.name === 'AbortError')) throw error
    throw new ApiError('We couldn’t connect. Check your connection and try again.')
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({})) as {
      title?: string; detail?: string; errors?: Record<string, string[]>
    }
    const fields: FormErrors = {}
    for (const [key, messages] of Object.entries(problem.errors ?? {})) {
      const field = key.toLocaleLowerCase() as keyof CreateIncidentRequest
      if (['title', 'description', 'location', 'latitude', 'longitude'].includes(field)) fields[field] = messages.join(' ')
    }
    throw new ApiError(response.status === 401 ? 'Please sign in to continue.' : response.status >= 500
      ? 'Reporting is temporarily unavailable. Please try again shortly.'
      : (problem.detail ?? problem.title ?? `The request failed (${response.status}).`).replaceAll('UnderReview', 'Under Review').replaceAll('InProgress', 'In Progress').replaceAll('operator', 'staff member').replaceAll('incident lifecycle', 'report progress sequence'), fields, response.status)
  }
  return response.json() as Promise<T>
}

// Fetch every API page so summaries and client-side filters include all stored records.
export async function getIncidents(signal?: AbortSignal): Promise<Incident[]> {
  const all = new Map<string, Incident>()
  const pageSize = 100
  for (let page = 1; ; page++) {
    const batch = await request<Incident[]>(`/api/incidents?page=${page}&pageSize=${pageSize}`, { signal })
    if (!Array.isArray(batch)) throw new ApiError('We couldn’t load the reports. Please try again.')
    for (const incident of batch) all.set(incident.id, incident)
    if (batch.length < pageSize) break
  }
  return [...all.values()].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc) || b.id.localeCompare(a.id))
}

export function createIncident(input: CreateIncidentRequest): Promise<Incident> {
  return request<Incident>('/api/incidents', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
}

export function getIncident(id: string, signal?: AbortSignal): Promise<Incident> {
  if (!isIncidentReference(id)) return Promise.reject(new ApiError('Enter the full reference number from your confirmation.', {}, 400))
  return request<Incident>(`/api/incidents/${encodeURIComponent(id.trim())}`, { signal })
}

export function isIncidentReference(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

export function getPublicTracking(id: string, signal?: AbortSignal): Promise<PublicTracking> {
  if (!isIncidentReference(id)) return Promise.reject(new ApiError('Enter the full report reference shown on your confirmation.', {}, 400))
  return request<PublicTracking>('/api/public/incidents/' + encodeURIComponent(id.trim()) + '/tracking', { signal })
}
export function getEvents(id: string): Promise<IncidentEvent[]> { return request('/api/incidents/' + encodeURIComponent(id) + '/events', {}) }
export function updateStatus(id: string, status: string, note: string): Promise<Incident> { return request('/api/incidents/' + encodeURIComponent(id) + '/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note }) }) }
export function updatePriority(id: string, priority: string, note: string): Promise<Incident> { return request('/api/incidents/' + encodeURIComponent(id) + '/priority', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority, note }) }) }
export function updateAssignment(id: string, assignedTo: string, note: string): Promise<Incident> { return request('/api/incidents/' + encodeURIComponent(id) + '/assignment', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedTo: assignedTo.trim() || null, note }) }) }
export function addInternalNote(id: string, note: string): Promise<IncidentEvent> { return request('/api/incidents/' + encodeURIComponent(id) + '/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) }) }
