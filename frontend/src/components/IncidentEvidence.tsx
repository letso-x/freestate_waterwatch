import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { X } from 'lucide-react'
import { getAttachmentImage, getIncidentAttachments, uploadRepairPhoto } from '../lib/api'
import type { AttachmentType, IncidentAttachmentResponse } from '../lib/api'
import { formatTimestamp } from '../lib/incidents'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_BYTES = 5 * 1024 * 1024

export default function IncidentEvidence({ incidentId }: { incidentId: string }) {
  const [attachments, setAttachments] = useState<IncidentAttachmentResponse[]>([])
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const previewUrls = useRef<string[]>([])
  const loadVersion = useRef(0)
  const [selectedImage, setSelectedImage] = useState<{ url: string; type: AttachmentType } | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const uploadId = useRef('')
  const repairInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadEvidence() {
    const version = ++loadVersion.current
    for (const url of previewUrls.current) URL.revokeObjectURL(url)
    previewUrls.current = []
    setPreviews({})
    setLoading(true)
    setError('')
    try {
      const records = await getIncidentAttachments(incidentId)
      const next: Record<string, string> = {}
      for (const record of records) {
        try {
          const blob = await getAttachmentImage(incidentId, record.id)
          const url = URL.createObjectURL(blob)
          if (version === loadVersion.current) {
            previewUrls.current.push(url)
            next[record.id] = url
          } else URL.revokeObjectURL(url)
        } catch (cause) {
          if (version === loadVersion.current)
            setError(cause instanceof Error ? cause.message : 'An evidence photo could not be loaded.')
        }
      }
      if (version === loadVersion.current) {
        setAttachments(records)
        setPreviews(next)
      }
    } catch (cause) {
      if (version === loadVersion.current)
        setError(cause instanceof Error ? cause.message : 'Evidence could not be loaded.')
    } finally { if (version === loadVersion.current) setLoading(false) }
  }

  useEffect(() => {
    void loadEvidence()
    return () => {
      loadVersion.current++
      for (const url of previewUrls.current) URL.revokeObjectURL(url)
      previewUrls.current = []
    }
  }, [incidentId])

  function choosePhoto(file: File | undefined) {
    setError('')
    setNotice('')
    if (!file) { setPhoto(null); return }
    if (!ACCEPTED_TYPES.includes(file.type)) { setError('Choose a JPEG, PNG or WebP photo.'); setPhoto(null); return }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) { setError('The repair photo must be 5 MB or smaller.'); setPhoto(null); return }
    uploadId.current = crypto.randomUUID()
    setPhoto(file)
  }

  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!photo || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await uploadRepairPhoto(incidentId, photo, uploadId.current)
      setPhoto(null)
      setNotice('Repair photo uploaded.')
      await loadEvidence()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The repair photo could not be uploaded.')
    } finally { setBusy(false) }
  }

  function group(type: AttachmentType, title: string) {
    const records = attachments.filter(item => item.attachmentType === type)
    return <section className="evidence-group" aria-label={title}>
      <h3>{title}</h3>
      {records.length === 0 ? <p className="field-hint">No {title.toLowerCase()} yet.</p> :
        <ul className="evidence-list">{records.map(item => <li key={item.id}>
          {previews[item.id] ? <button className="evidence-preview-button" type="button" onClick={() => setSelectedImage({ url: previews[item.id], type })} aria-label={`View ${title.toLowerCase()} photo from ${formatTimestamp(item.createdAtUtc)}`}>
            <img className="evidence-thumbnail" src={previews[item.id]} alt="" />
          </button> : <span className="evidence-thumbnail evidence-unavailable" role="img" aria-label="Photo unavailable" />}
          <time dateTime={item.createdAtUtc}>{formatTimestamp(item.createdAtUtc)} SAST</time>
        </li>)}</ul>}
    </section>
  }

  return <section className="record-card evidence-card" aria-label="Incident evidence">
    <h2>Photos</h2>
    {loading && <p role="status">Loading photos…</p>}
    {error && <div className="error-banner" role="alert">{error}<button type="button" className="button button-secondary" onClick={() => void loadEvidence()}>Try again</button></div>}
    {notice && <p role="status" className="success-banner">{notice}</p>}
    {group('ReportEvidence', 'Report photos')}
    {group('RepairEvidence', 'Repair photos')}
    <form className="repair-photo-form" onSubmit={upload}>
      <label htmlFor="repair-photo">Add repair photo</label>
      <input ref={repairInput} id="repair-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
        onChange={event => choosePhoto(event.target.files?.[0])} />
      {photo && <span>{photo.name}</span>}
      <button className="button button-secondary" type="submit" disabled={!photo || busy}>{busy ? 'Uploading…' : 'Upload repair photo'}</button>
    </form>
    {selectedImage && <div className="evidence-dialog-backdrop">
      <section className="evidence-dialog" role="dialog" aria-modal="true" aria-label={selectedImage.type === 'ReportEvidence' ? 'Report photo' : 'Repair photo'}>
        <button type="button" className="icon-button evidence-close" aria-label="Close photo preview" onClick={() => setSelectedImage(null)}><X size={18} /></button>
        <img src={selectedImage.url} alt={selectedImage.type === 'ReportEvidence' ? 'Resident-submitted incident photo' : 'Municipal repair evidence photo'} />
      </section>
    </div>}
  </section>
}
