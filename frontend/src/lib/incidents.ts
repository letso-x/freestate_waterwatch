export interface Incident {
  id: string
  title: string
  description: string
  location: string
  latitude: number | null
  longitude: number | null
  status: string
  createdAtUtc: string
}

export interface CreateIncidentRequest {
  title: string
  description: string
  location: string
}

export type FormErrors = Partial<Record<keyof CreateIncidentRequest, string>>

export function validateIncident(input: CreateIncidentRequest): FormErrors {
  const errors: FormErrors = {}
  const rules = { title: [3, 150], description: [10, 2000], location: [3, 300] } as const
  for (const field of Object.keys(rules) as (keyof CreateIncidentRequest)[]) {
    const [min, max] = rules[field]
    const length = input[field].trim().length
    if (length < min) errors[field] = `Enter at least ${min} characters.`
    else if (input[field].length > max) errors[field] = `Use ${max} characters or fewer.`
  }
  return errors
}

export function filterIncidents(incidents: Incident[], search: string, status: string): Incident[] {
  const query = search.trim().toLocaleLowerCase()
  return incidents.filter(incident =>
    (status === 'all' || incident.status === status) &&
    [incident.title, incident.description, incident.location, incident.id].some(value => value.toLocaleLowerCase().includes(query)),
  )
}

export function southAfricaDate(value: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))
}

export function summarize(incidents: Incident[], now = new Date()) {
  return {
    total: incidents.length,
    reported: incidents.filter(incident => incident.status === 'Reported').length,
    today: incidents.filter(incident => southAfricaDate(incident.createdAtUtc) === southAfricaDate(now)).length,
    locations: new Set(incidents.map(incident => incident.location.trim().toLocaleLowerCase())).size,
  }
}

export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}
