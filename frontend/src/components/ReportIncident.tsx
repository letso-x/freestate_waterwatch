import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, ArrowRight, Check, Droplets, LoaderCircle, MapPin, ShieldCheck, X } from 'lucide-react'
import { ApiError, createIncident } from '../lib/api'
import { validateIncident } from '../lib/incidents'
import type { CreateIncidentRequest, FormErrors, Incident } from '../lib/incidents'

interface Props { onClose: () => void; onCreated: (incident: Incident) => Promise<void> }

export default function ReportIncident({ onClose, onCreated }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState<CreateIncidentRequest>({ title: '', description: '', location: '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { dialog.current?.showModal() }, [])

  function update(field: keyof CreateIncidentRequest, value: string) {
    setValues(current => ({ ...current, [field]: value }))
    setErrors(current => ({ ...current, [field]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const validation = validateIncident(values)
    setErrors(validation)
    if (Object.keys(validation).length) {
      const first = Object.keys(validation)[0]
      dialog.current?.querySelector<HTMLElement>(`#report-${first}`)?.focus()
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const incident = await createIncident({
        title: values.title.trim(), description: values.description.trim(), location: values.location.trim(),
      })
      setSaved(true)
      await onCreated(incident)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The report could not be submitted. Please try again.')
      if (cause instanceof ApiError) setErrors(cause.fieldErrors)
      setSubmitting(false)
    }
  }

  return <dialog ref={dialog} className="report-dialog" aria-labelledby="report-heading"
    onCancel={event => { event.preventDefault(); if (!submitting) onClose() }}>
    <div className="dialog-accent" />
    <div className="dialog-header">
      <div className="dialog-symbol"><Droplets size={25} /></div>
      <button className="icon-button" aria-label="Close report form" onClick={onClose} disabled={submitting}><X size={20} /></button>
    </div>
    <div className="dialog-intro">
      <span className="eyebrow">CITIZEN WATER REPORT</span>
      <h2 id="report-heading">Report a water incident</h2>
      <p>A few details can make a difference. Tell us what happened and where.</p>
    </div>
    <form onSubmit={submit} noValidate className="report-form">
      <div className="form-field">
        <label htmlFor="report-title">Incident title <span aria-hidden="true">*</span></label>
        <input autoFocus id="report-title" name="title" placeholder="e.g. Burst pipe outside the library"
          value={values.title} onChange={event => update('title', event.target.value)} maxLength={150}
          required aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : 'title-hint'} disabled={submitting} />
        {errors.title ? <span className="field-error" id="title-error">{errors.title}</span> : <span className="field-hint" id="title-hint">A short, clear summary. 3–150 characters.</span>}
      </div>
      <div className="form-field">
        <label htmlFor="report-location">Location <span aria-hidden="true">*</span></label>
        <div className="input-with-icon"><MapPin size={17} /><input id="report-location" name="location"
          placeholder="Street, landmark and town" value={values.location} onChange={event => update('location', event.target.value)}
          maxLength={300} required aria-invalid={!!errors.location} aria-describedby={errors.location ? 'location-error' : 'location-hint'} disabled={submitting} /></div>
        {errors.location ? <span className="field-error" id="location-error">{errors.location}</span> : <span className="field-hint" id="location-hint">Include enough detail to find the incident. 3–300 characters.</span>}
      </div>
      <div className="form-field">
        <label htmlFor="report-description">What did you notice? <span aria-hidden="true">*</span></label>
        <textarea id="report-description" name="description" rows={4} placeholder="Describe the leak or water issue and any useful details…"
          value={values.description} onChange={event => update('description', event.target.value)} maxLength={2000}
          required aria-invalid={!!errors.description} aria-describedby={errors.description ? 'description-error' : 'description-hint'} disabled={submitting} />
        {errors.description ? <span className="field-error" id="description-error">{errors.description}</span> : <span className="field-hint" id="description-hint">10–2,000 characters. Please leave out personal information.</span>}
      </div>
      {error && <div className="error-banner" role="alert"><AlertCircle size={18} /><span>{error}</span></div>}
      <div className="submission-note"><ShieldCheck size={18} /><p>Your report will be saved as <strong>Reported</strong> and appear in the municipal overview.</p></div>
      <div className="dialog-footer">
        <button type="button" className="button button-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? <>{saved ? <Check size={17} /> : <LoaderCircle className="animate-spin" size={17} />}{saved ? 'Saved. Refreshing…' : 'Submitting…'}</> : <>Submit report <ArrowRight size={17} /></>}
        </button>
      </div>
    </form>
  </dialog>
}
