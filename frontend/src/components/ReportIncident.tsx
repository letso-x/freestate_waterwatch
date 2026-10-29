import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, ArrowRight, Check, LoaderCircle, MapPin, LocateFixed } from 'lucide-react'
import { ApiError, createIncident } from '../lib/api'
import { validateIncident } from '../lib/incidents'
import type { CreateIncidentRequest, FormErrors, Incident } from '../lib/incidents'
import LocationPicker from './LocationPicker'

interface Props { onCreated: (incident: Incident) => Promise<void> }

export default function ReportIncident({ onCreated }: Props) {
  const formRegion = useRef<HTMLElement>(null)
  const mounted = useRef(true)
  const [values, setValues] = useState<CreateIncidentRequest>({ title: '', description: '', location: '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [locating, setLocating] = useState(false)
  const [locationMessage, setLocationMessage] = useState('')
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  function selectCoordinates(point: { latitude: number; longitude: number }) {
    setLatitude(point.latitude.toFixed(6)); setLongitude(point.longitude.toFixed(6))
    setErrors(current => ({ ...current, latitude: undefined, longitude: undefined }))
    setLocationMessage('Location selected. Please check the address.')
  }

  function useGps() {
    if (!navigator.geolocation) { setLocationMessage('Your current location isn’t available. Choose a spot on the map or enter the address.'); return }
    setLocating(true); setLocationMessage('Allow location access in your browser to continue.')
    navigator.geolocation.getCurrentPosition(position => {
      if (!mounted.current) return
      selectCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setLocating(false)
    }, cause => {
      if (!mounted.current) return
      setLocating(false)
      setLocationMessage(cause.code === 1 ? 'Location access was declined. You can still use the map or enter an address.' : 'We couldn’t find your location. Please use the map or enter an address.')
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 })
  }

  const selectedPoint = latitude.trim() && longitude.trim() && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180
    ? { latitude: Number(latitude), longitude: Number(longitude) } : null

  function update(field: 'title' | 'description' | 'location', value: string) {
    setValues(current => ({ ...current, [field]: value }))
    setErrors(current => ({ ...current, [field]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const input: CreateIncidentRequest = { ...values,
      ...(latitude.trim() ? { latitude: Number(latitude) } : {}),
      ...(longitude.trim() ? { longitude: Number(longitude) } : {}),
    }
    const validation = validateIncident(input)
    setErrors(validation)
    if (Object.keys(validation).length) {
      const first = Object.keys(validation)[0]
      formRegion.current?.querySelector<HTMLElement>(`#report-${first}`)?.focus()
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const incident = await createIncident({
        ...input, title: values.title.trim(), description: values.description.trim(), location: values.location.trim(),
      })
      setSaved(true)
      await onCreated(incident)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The report could not be submitted. Please try again.')
      if (cause instanceof ApiError) setErrors(cause.fieldErrors)
      setSubmitting(false)
    }
  }

  return <section ref={formRegion} className="report-card" aria-labelledby="report-heading">
    <div className="dialog-accent" />
    <div className="dialog-intro">

      <h2 id="report-heading">Report details</h2>
      <p>A clear description and location will help the team review your report.</p>
    </div>
    <form onSubmit={submit} noValidate className="report-form">
      <div className="form-field">
        <label htmlFor="report-title">Report title <span aria-hidden="true">*</span></label>
        <input autoFocus id="report-title" name="title" placeholder="e.g. Burst pipe outside the library"
          value={values.title} onChange={event => update('title', event.target.value)} maxLength={150}
          required aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : 'title-hint'} disabled={submitting} />
        {errors.title ? <span className="field-error" id="title-error">{errors.title}</span> : <span className="field-hint" id="title-hint">Summarise the problem in a few words.</span>}
      </div>
      <div className="form-field">
        <label htmlFor="report-location">Location <span aria-hidden="true">*</span></label>
        <div className="input-with-icon"><MapPin size={17} /><input id="report-location" name="location"
          placeholder="Street, landmark and town" value={values.location} onChange={event => update('location', event.target.value)}
          maxLength={300} required aria-invalid={!!errors.location} aria-describedby={errors.location ? 'location-error' : 'location-hint'} disabled={submitting} /></div>
        {errors.location ? <span className="field-error" id="location-error">{errors.location}</span> : <span className="field-hint" id="location-hint">Include the street, a nearby landmark and the town.</span>}
      </div>
      <fieldset className="location-fieldset" disabled={submitting}>
        <legend>Choose a location <span>Optional</span></legend>
        <p className="field-hint">Place a pin where the problem is, then check that it matches the address.</p>
        <button type="button" className="button button-secondary gps-button" onClick={useGps} disabled={locating}><LocateFixed size={17} />{locating ? 'Locating…' : 'Use my current location'}</button>
        <p className="map-privacy">Your current location is requested only when you choose to use it.</p>
        <LocationPicker value={selectedPoint} onChange={selectCoordinates} />
        <div className="coordinate-grid">
          <div className="form-field"><label htmlFor="report-latitude">Latitude</label><input id="report-latitude" type="number" step="any" min="-90" max="90" value={latitude} onChange={event => setLatitude(event.target.value)} aria-invalid={!!errors.latitude} aria-describedby={errors.latitude ? 'latitude-error' : undefined} />{errors.latitude && <span id="latitude-error" className="field-error">{errors.latitude}</span>}</div>
          <div className="form-field"><label htmlFor="report-longitude">Longitude</label><input id="report-longitude" type="number" step="any" min="-180" max="180" value={longitude} onChange={event => setLongitude(event.target.value)} aria-invalid={!!errors.longitude} aria-describedby={errors.longitude ? 'longitude-error' : undefined} />{errors.longitude && <span id="longitude-error" className="field-error">{errors.longitude}</span>}</div>
        </div>
        <div className="coordinate-actions">{latitude || longitude ? <button type="button" className="text-button" onClick={() => { setLatitude(''); setLongitude(''); setLocationMessage('Map pin removed. Your address is unchanged.'); setErrors(current => ({ ...current, latitude: undefined, longitude: undefined })) }}>Clear coordinates</button> : null}<p role="status">{locationMessage}</p></div>
      </fieldset>
      <div className="form-field">
        <label htmlFor="report-description">What did you notice? <span aria-hidden="true">*</span></label>
        <textarea id="report-description" name="description" rows={4} placeholder="Describe the leak or water issue and any useful details…"
          value={values.description} onChange={event => update('description', event.target.value)} maxLength={2000}
          required aria-invalid={!!errors.description} aria-describedby={errors.description ? 'description-error' : 'description-hint'} disabled={submitting} />
        {errors.description ? <span className="field-error" id="description-error">{errors.description}</span> : <span className="field-hint" id="description-hint">Include useful details, such as how much water is flowing. Leave out personal information.</span>}
      </div>
      <p className="attachment-note">Photo attachments aren’t available yet. Please include useful details in your description.</p>
      {error && <div className="error-banner" role="alert"><AlertCircle size={18} /><span>{error}</span></div>}
      <div className="dialog-footer">

        <button type="submit" className="button button-primary" disabled={submitting || locating}>
          {submitting ? <>{saved ? <Check size={17} /> : <LoaderCircle className="animate-spin" size={17} />}{saved ? 'Report saved…' : 'Sending…'}</> : <>Send report <ArrowRight size={17} /></>}
        </button>
      </div>
    </form>
  </section>
}
