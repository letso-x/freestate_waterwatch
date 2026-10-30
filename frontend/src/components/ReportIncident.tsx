import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, ArrowRight, LoaderCircle, MapPin, LocateFixed, X } from 'lucide-react'
import { ApiError, createIncident, uploadReportPhoto } from '../lib/api'
import { validateIncident } from '../lib/incidents'
import type { CreateIncidentRequest, FormErrors, Incident } from '../lib/incidents'
import LocationPicker from './LocationPicker'

interface Props { onCreated: (incident: Incident) => Promise<void> }
interface SelectedPhoto { id: string; file: File; previewUrl: string; uploaded: boolean; error: string }
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const MAX_PHOTOS = 3

export default function ReportIncident({ onCreated }: Props) {
  const formRegion = useRef<HTMLElement>(null)
  const mounted = useRef(true)
  const previewUrls = useRef<string[]>([])
  const [values, setValues] = useState<CreateIncidentRequest>({ title: '', description: '', location: '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [locating, setLocating] = useState(false)
  const [locationMessage, setLocationMessage] = useState('')
  const [photos, setPhotos] = useState<SelectedPhoto[]>([])
  const [photoError, setPhotoError] = useState('')
  const [createdIncident, setCreatedIncident] = useState<Incident | null>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => () => { for (const url of previewUrls.current) URL.revokeObjectURL(url) }, [])

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

  function selectPhotos(files: FileList | null) {
    if (!files) return
    const incoming = Array.from(files)
    const next = [...photos]
    const messages: string[] = []
    for (const file of incoming) {
      if (next.length >= MAX_PHOTOS) { messages.push(`You can add up to ${MAX_PHOTOS} photos.`); break }
      if (!PHOTO_TYPES.includes(file.type)) { messages.push(`${file.name}: choose a JPEG, PNG or WebP photo.`); continue }
      if (file.size === 0 || file.size > MAX_PHOTO_BYTES) { messages.push(`${file.name}: each photo must be 5 MB or smaller.`); continue }
      const previewUrl = URL.createObjectURL(file)
      previewUrls.current.push(previewUrl)
      next.push({ id: crypto.randomUUID(), file, previewUrl, uploaded: false, error: '' })
    }
    setPhotos(next)
    setPhotoError(messages.join(' '))
  }

  function removePhoto(id: string) {
    const photo = photos.find(item => item.id === id)
    if (photo) { URL.revokeObjectURL(photo.previewUrl); previewUrls.current = previewUrls.current.filter(url => url !== photo.previewUrl) }
    setPhotos(current => current.filter(item => item.id !== id))
    setPhotoError('')
  }

  async function uploadPendingPhotos(incident: Incident) {
    const failed: string[] = []
    for (const photo of photos.filter(item => !item.uploaded)) {
      setPhotos(current => current.map(item => item.id === photo.id ? { ...item, error: '', uploaded: false } : item))
      try {
        await uploadReportPhoto(incident.id, photo.file, photo.id)
        setPhotos(current => current.map(item => item.id === photo.id ? { ...item, uploaded: true, error: '' } : item))
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Upload failed.'
        failed.push(`${photo.file.name}: ${message}`)
        setPhotos(current => current.map(item => item.id === photo.id ? { ...item, error: message } : item))
      }
    }
    if (failed.length) {
      setError(`Report saved as ${incident.id}. These photos were not uploaded: ${failed.join(' ')}`)
      return
    }
    await onCreated(incident)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (createdIncident) {
      setSubmitting(true)
      setError('')
      try { await uploadPendingPhotos(createdIncident) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'The confirmation page could not be opened.') }
      finally { setSubmitting(false) }
      return
    }
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
      const report = { ...input, title: values.title.trim(), description: values.description.trim(), location: values.location.trim() }
      const incident = photos.length ? await createIncident(report, true) : await createIncident(report)
      setCreatedIncident(incident)
      await uploadPendingPhotos(incident)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The report could not be submitted. Please try again.')
      if (cause instanceof ApiError) setErrors(cause.fieldErrors)
    } finally { if (mounted.current) setSubmitting(false) }
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
          required aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : 'title-hint'} disabled={submitting || !!createdIncident} />
        {errors.title ? <span className="field-error" id="title-error">{errors.title}</span> : <span className="field-hint" id="title-hint">Summarise the problem in a few words.</span>}
      </div>
      <div className="form-field">
        <label htmlFor="report-location">Location <span aria-hidden="true">*</span></label>
        <div className="input-with-icon"><MapPin size={17} /><input id="report-location" name="location"
          placeholder="Street, landmark and town" value={values.location} onChange={event => update('location', event.target.value)}
          maxLength={300} required aria-invalid={!!errors.location} aria-describedby={errors.location ? 'location-error' : 'location-hint'} disabled={submitting || !!createdIncident} /></div>
        {errors.location ? <span className="field-error" id="location-error">{errors.location}</span> : <span className="field-hint" id="location-hint">Include the street, a nearby landmark and the town.</span>}
      </div>
      <fieldset className="location-fieldset" disabled={submitting || !!createdIncident}>
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
          required aria-invalid={!!errors.description} aria-describedby={errors.description ? 'description-error' : 'description-hint'} disabled={submitting || !!createdIncident} />
        {errors.description ? <span className="field-error" id="description-error">{errors.description}</span> : <span className="field-hint" id="description-hint">Include useful details, such as how much water is flowing. Leave out personal information.</span>}
      </div>
      <section className="photo-upload" aria-label="Incident photos">
        <div><label className="button button-secondary photo-picker" htmlFor="report-photos">Add photos</label>
          <input id="report-photos" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple
            disabled={submitting || !!createdIncident || photos.length >= MAX_PHOTOS} onChange={event => { selectPhotos(event.target.files); event.target.value = '' }} />
          <label className="button button-secondary photo-picker" htmlFor="report-camera">Take photo</label>
          <input id="report-camera" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
            disabled={submitting || !!createdIncident || photos.length >= MAX_PHOTOS} onChange={event => { selectPhotos(event.target.files); event.target.value = '' }} />
          <p className="attachment-note">Optional · Up to 3 photos, 5 MB each. JPEG, PNG or WebP.</p>
        </div>
        {photoError && <p className="field-error" role="alert">{photoError}</p>}
        {photos.length > 0 && <ul className="photo-previews">{photos.map(photo => <li className="photo-preview" key={photo.id}>
          <img src={photo.previewUrl} alt={`Preview: ${photo.file.name}`} />
          <span>{photo.file.name}</span>
          {photo.uploaded ? <small role="status">Uploaded</small> : photo.error ? <small className="field-error">{photo.error}</small> : null}
          {!photo.uploaded && <button type="button" className="icon-button" aria-label={`Remove ${photo.file.name}`} onClick={() => removePhoto(photo.id)} disabled={submitting}><X size={15} /></button>}
        </li>)}</ul>}
      </section>
      {error && <div className="error-banner" role="alert"><AlertCircle size={18} /><span>{error}</span></div>}
      <div className="dialog-footer">

        {createdIncident && <button type="button" className="button button-secondary" disabled={submitting} onClick={() => void onCreated(createdIncident)}>Continue to confirmation</button>}
        <button type="submit" className="button button-primary" disabled={submitting || locating}>
          {submitting ? <><LoaderCircle className="animate-spin" size={17} />{createdIncident ? 'Uploading photos…' : 'Sending…'}</> : createdIncident ? <>Retry photo uploads <ArrowRight size={17} /></> : <>Send report <ArrowRight size={17} /></>}
        </button>
      </div>
    </form>
  </section>
}
