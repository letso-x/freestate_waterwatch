import type { CreateIncidentRequest, FormErrors, Incident } from './incidents'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const baseUrl = configuredBaseUrl?.replace(/\/+$/, '')

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
  if (!baseUrl) throw new ApiError('The incident API is not configured. Set VITE_API_BASE_URL and restart the dashboard.')
  if (!/^https?:\/\//i.test(baseUrl)) throw new ApiError('VITE_API_BASE_URL must be an HTTP or HTTPS URL.')
  return `${baseUrl}${path}`
}

async function request<T>(path: string, options: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(endpoint(path), { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) })
  } catch (error) {
    if (error instanceof ApiError || (error instanceof DOMException && error.name === 'AbortError')) throw error
    throw new ApiError('We could not reach the incident API. Check your connection and that the API is running, then try again.')
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
    throw new ApiError(response.status >= 500
      ? 'The incident service is temporarily unavailable. Please try again shortly.'
      : problem.detail ?? problem.title ?? `The request failed (${response.status}).`, fields, response.status)
  }
  return response.json() as Promise<T>
}

// Fetch every API page so summaries and client-side filters include all stored records.
export async function getIncidents(signal?: AbortSignal): Promise<Incident[]> {
  const all = new Map<string, Incident>()
  const pageSize = 100
  for (let page = 1; ; page++) {
    const batch = await request<Incident[]>(`/api/incidents?page=${page}&pageSize=${pageSize}`, { signal })
    if (!Array.isArray(batch)) throw new ApiError('The incident API returned an unexpected response.')
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
  if (!isIncidentReference(id)) return Promise.reject(new ApiError('Enter the full report reference shown on your confirmation.', {}, 400))
  return request<Incident>(`/api/incidents/${encodeURIComponent(id.trim())}`, { signal })
}

export function isIncidentReference(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}
