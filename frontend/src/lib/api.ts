import type { CreateIncidentRequest, FormErrors, Incident, IncidentEvent, PublicTracking } from './incidents'
import type { Sensor, TelemetryReading } from './sensors'

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
  const privileged = path.startsWith('/api/incidents') && (options.method ?? 'GET') !== 'POST' || /\/api\/incidents\/[^/]+\/(?:notes|attachments)(?:\/|$)/.test(path) || path.startsWith('/api/sensors')
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

export function createIncident(input: CreateIncidentRequest, requestPhotoUploadCapability = false): Promise<Incident> {
  return request<Incident>('/api/incidents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestPhotoUploadCapability ? { ...input, requestPhotoUploadCapability: true } : input),
    ...(requestPhotoUploadCapability ? { credentials: 'include' as const } : {}),
  })
}

export type AttachmentType = 'ReportEvidence' | 'RepairEvidence'
export interface IncidentAttachmentResponse { id: string; attachmentType: AttachmentType; createdAtUtc: string }

export async function uploadReportPhoto(id: string, photo: File, uploadId?: string): Promise<IncidentAttachmentResponse> {
  const form = new FormData()
  form.append('photo', photo)
  if (uploadId) form.append('uploadId', uploadId)
  try {
    return await request(`/api/public/incidents/${encodeURIComponent(id)}/attachments`, {
      method: 'POST', body: form, credentials: 'include',
    })
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) throw new ApiError('Photo upload permission is missing or has expired. Your report is already saved.', {}, 401)
    throw cause
  }
}

export async function getIncidentAttachments(id: string): Promise<IncidentAttachmentResponse[]> {
  return request(`/api/incidents/${encodeURIComponent(id)}/attachments`, {})
}

export async function uploadRepairPhoto(id: string, photo: File, uploadId?: string): Promise<IncidentAttachmentResponse> {
  const form = new FormData()
  form.append('photo', photo)
  if (uploadId) form.append('uploadId', uploadId)
  return request(`/api/incidents/${encodeURIComponent(id)}/attachments`, { method: 'POST', body: form })
}

export async function getAttachmentImage(incidentId: string, attachmentId: string): Promise<Blob> {
  const path = `/api/incidents/${encodeURIComponent(incidentId)}/attachments/${encodeURIComponent(attachmentId)}/content`
  const headers = new Headers()
  if (operatorToken) headers.set('Authorization', 'Bearer ' + operatorToken)
  let response: Response
  try {
    response = await fetch(endpoint(path), {
      headers: Object.fromEntries(headers.entries()),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new ApiError('We couldn’t load this evidence photo. Check your connection and try again.')
  }
  if (!response.ok)
    throw new ApiError(response.status === 401 ? 'Please sign in to continue.' : 'This evidence photo could not be loaded.', {}, response.status)
  return response.blob()
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

export async function getSensors(signal?: AbortSignal): Promise<Sensor[]> {
  const sensors: Sensor[] = []
  for (let page = 1; ; page++) {
    const batch = await request<Sensor[]>(`/api/sensors?page=${page}&pageSize=100`, { signal })
    if (!Array.isArray(batch)) throw new ApiError('We couldn’t load the sensors. Please try again.')
    sensors.push(...batch)
    if (batch.length < 100) return sensors
  }
}
export function getSensorReadings(id: string, signal?: AbortSignal): Promise<TelemetryReading[]> {
  return request(`/api/sensors/${encodeURIComponent(id)}/readings?limit=60`, { signal })
}
