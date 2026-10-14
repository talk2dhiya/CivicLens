import React, { useState } from 'react'

export default function ResolutionEvidenceModal({
  isOpen,
  report,
  token,
  onClose,
  onSuccess,
}) {
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen || !report) return null

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      alert('Photo must be smaller than 5MB.')
      e.target.value = ''
      return
    }

    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleRemovePhoto = () => {
    setPhoto(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!photo) {
      setError('A resolution proof photo is strictly compulsory before marking an issue as Resolved.')
      return
    }

    if (!note.trim() || note.trim().length < 5) {
      setError('Please provide a completion note of at least 5 characters explaining the repair or action taken.')
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('image', photo)
      formData.append('note', note.trim())

      const res = await fetch(`/api/v1/reports/${report.id}/resolution-evidence`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to submit resolution evidence.')
      }

      onSuccess(data)
      handleRemovePhoto()
      setNote('')
      onClose()
    } catch (err) {
      setError(err.message || 'Error uploading resolution evidence.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--color-primary)', fontFamily: 'var(--font-serif)', fontWeight: 700 }}>
              Resolve Issue with Verification Proof
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Report #{report.id} &bull; {report.category}
            </span>
          </div>
          <button
            type="button"
            className="modal-close-text-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '14px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ background: 'var(--color-success-tint)', border: '1px solid #bbf7d0', padding: '12px 14px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '12px', color: '#166534', lineHeight: 1.5 }}>
            <strong>Public Transparency Requirement:</strong> Municipal resolution requires an after-repair photo proof and completion note. Citizens and supervisors will inspect this evidence in the verified timeline.
          </div>

          <div className="form-group">
            <label htmlFor="res-photo">
              After-Repair Proof Photo <span className="req">* (Compulsory)</span>
            </label>
            <input
              type="file"
              id="res-photo"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              disabled={submitting}
              required
            />
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
              Upload photographic evidence showing the resolved condition (max 5MB)
            </p>

            {photoPreview && (
              <div className="image-preview-wrapper" style={{ marginTop: '10px' }}>
                <img
                  src={photoPreview}
                  alt="Resolution Preview"
                  className="image-preview"
                  style={{ maxHeight: '180px' }}
                />
                <button
                  type="button"
                  className="report-remove-photo-btn"
                  onClick={handleRemovePhoto}
                >
                  Remove Photo
                </button>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="res-note">
              Resolution Remarks / Actions Completed <span className="req">* (Min 5 chars)</span>
            </label>
            <textarea
              id="res-note"
              rows="3"
              placeholder="Detail the work done (e.g. repaved road section, cleaned up overflow, replaced fixture)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              type="button"
              className="report-success-btn-secondary"
              onClick={onClose}
              disabled={submitting}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="report-success-btn-primary"
              disabled={submitting || !photo || note.trim().length < 5}
              style={{ flex: 2 }}
            >
              {submitting ? 'Submitting Proof...' : 'Verify and Mark as Resolved'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
