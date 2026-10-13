import React, { useState, useEffect, useCallback } from 'react'

const CATEGORIES = [
  'Road Damage / Potholes',
  'Water Leakage',
  'Garbage Overflow',
  'Flooding / Waterlogging',
  'Broken Streetlights',
]

const STATUSES = [
  'Pending',
  'Acknowledged',
  'In Progress',
  'Resolved',
  'Rejected',
]

function getStatusClass(status) {
  switch (status) {
    case 'Pending':
      return 'status-pending'
    case 'Acknowledged':
      return 'status-acknowledged'
    case 'In Progress':
      return 'status-in-progress'
    case 'Resolved':
      return 'status-resolved'
    case 'Rejected':
      return 'status-rejected'
    default:
      return 'status-pending'
  }
}

function formatDate(isoString) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

function App() {
  const [activeTab, setActiveTab] = useState('browse') // 'report' | 'browse'
  const [backendStatus, setBackendStatus] = useState('checking')

  // Selected report for Details Full-View
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [detailReport, setDetailReport] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState('')

  // Authority Status Update state
  const [selectedNextStatus, setSelectedNextStatus] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [statusUpdateError, setStatusUpdateError] = useState('')
  const [statusUpdateSuccess, setStatusUpdateSuccess] = useState('')

  // Browse list state & filters
  const [reports, setReports] = useState([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [reportsError, setReportsError] = useState('')
  const [filterCategory, setFilterCategory] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [filterSearch, setFilterSearch] = useState('')

  // Report Submission Form State
  const [category, setCategory] = useState(CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [locationText, setLocationText] = useState('')
  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [successReport, setSuccessReport] = useState(null)

  // Verify backend connectivity
  useEffect(() => {
    fetch('/health')
      .then((res) => {
        if (res.ok) setBackendStatus('online')
        else setBackendStatus('offline')
      })
      .catch(() => setBackendStatus('offline'))
  }, [])

  // Fetch reports list with active filters
  const fetchReports = useCallback(async () => {
    setLoadingReports(true)
    setReportsError('')
    try {
      const params = new URLSearchParams()
      if (filterCategory !== 'ALL') params.append('category', filterCategory)
      if (filterStatus !== 'ALL') params.append('status', filterStatus)
      if (filterSearch.trim()) params.append('search', filterSearch.trim())

      const res = await fetch(`/api/v1/reports?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load reports from server.')
      const data = await res.json()
      setReports(data.reports || [])
    } catch (err) {
      setReportsError(err.message || 'Error connecting to backend.')
    } finally {
      setLoadingReports(false)
    }
  }, [filterCategory, filterStatus, filterSearch])

  useEffect(() => {
    if (activeTab === 'browse' && selectedReportId === null) {
      fetchReports()
    }
  }, [activeTab, selectedReportId, fetchReports])

  // Fetch single report details when selected
  useEffect(() => {
    if (selectedReportId !== null) {
      setLoadingDetail(true)
      setDetailError('')
      fetch(`/api/v1/reports/${selectedReportId}`)
        .then(async (res) => {
          if (!res.ok) {
            const errData = await res.json()
            throw new Error(errData.detail || 'Report not found.')
          }
          return res.json()
        })
        .then((data) => {
          setDetailReport(data)
          setSelectedNextStatus(data.allowed_transitions?.[0] || '')
          setStatusNote('')
          setStatusUpdateError('')
          setStatusUpdateSuccess('')
        })
        .catch((err) => setDetailError(err.message))
        .finally(() => setLoadingDetail(false))
    } else {
      setDetailReport(null)
    }
  }, [selectedReportId])

  // Handler for Authority updating status
  const handleUpdateStatus = async (e) => {
    e.preventDefault()
    setStatusUpdateError('')
    setStatusUpdateSuccess('')

    if (!selectedNextStatus) {
      setStatusUpdateError('Please select a target status.')
      return
    }

    if (
      selectedNextStatus === 'Rejected' &&
      (!statusNote.trim() || statusNote.trim().length < 5)
    ) {
      setStatusUpdateError(
        'A rejection note of at least 5 characters is compulsory when rejecting an issue.'
      )
      return
    }

    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/v1/reports/${detailReport.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: selectedNextStatus,
          note: statusNote.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update status.')
      }

      setDetailReport(data)
      setSelectedNextStatus(data.allowed_transitions?.[0] || '')
      setStatusNote('')
      setStatusUpdateSuccess(`Status successfully updated to ${data.status}!`)
      fetchReports()
    } catch (err) {
      setStatusUpdateError(err.message || 'Error updating status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  // GPS Location handler
  const handleDetectLocation = () => {
    setGeoError('')
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.')
      return
    }

    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(Number(pos.coords.latitude.toFixed(6)))
        setLongitude(Number(pos.coords.longitude.toFixed(6)))
        setGeoLoading(false)
      },
      (err) => {
        setGeoLoading(false)
        setGeoError(`Unable to retrieve location: ${err.message}`)
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  // Image change handler with 5MB limit check
  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size must be less than 5MB.')
      e.target.value = ''
      return
    }

    setSelectedImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleRemoveImage = () => {
    setSelectedImage(null)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
  }

  const resetForm = () => {
    setCategory(CATEGORIES[0])
    setDescription('')
    setLocationText('')
    setLatitude(null)
    setLongitude(null)
    setGeoError('')
    handleRemoveImage()
    setSubmitError('')
    setSuccessReport(null)
  }

  const handleClearFilters = () => {
    setFilterCategory('ALL')
    setFilterStatus('ALL')
    setFilterSearch('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    setSuccessReport(null)

    if (!selectedImage) {
      setSubmitError('Photo attachment is compulsory for reporting an issue.')
      return
    }

    if (!locationText.trim()) {
      setSubmitError('Please provide a location description.')
      return
    }

    if (description.trim() && description.trim().length > 2000) {
      setSubmitError('Description cannot exceed 2000 characters.')
      return
    }

    const formData = new FormData()
    formData.append('category', category)
    if (description.trim()) formData.append('description', description.trim())
    formData.append('location_text', locationText.trim())
    if (latitude !== null) formData.append('latitude', latitude)
    if (longitude !== null) formData.append('longitude', longitude)
    formData.append('image', selectedImage)

    setSubmitting(true)

    try {
      const response = await fetch('/api/v1/reports', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to submit report.')
      }

      setSuccessReport(data)
    } catch (err) {
      setSubmitError(err.message || 'Error connecting to server.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container">
      {/* Header */}
      <div className="card">
        <div className="header">
          <h1>CivicLens</h1>
          <p>AI-Powered Neighborhood Intelligence &amp; Response Platform</p>
          <span
            className={`badge ${
              backendStatus === 'online' ? 'badge-online' : 'badge-offline'
            }`}
          >
            {backendStatus === 'online'
              ? '● Backend Online'
              : backendStatus === 'checking'
              ? 'Checking API...'
              : '○ Backend Offline (Start Server)'}
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="nav-tabs">
          <button
            className={`tab-btn ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('browse')
              setSelectedReportId(null)
            }}
          >
            📋 Browse Reports
          </button>
          <button
            className={`tab-btn ${activeTab === 'report' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('report')
              setSelectedReportId(null)
            }}
          >
            ➕ Report an Issue
          </button>
        </div>
      </div>

      {/* VIEW 1: Full Report Details Transition */}
      {selectedReportId !== null ? (
        <div className="card details-view">
          <div className="details-header">
            <button
              className="btn btn-secondary"
              onClick={() => setSelectedReportId(null)}
            >
              ← Back to Reports
            </button>
            {detailReport && (
              <span className={`status-badge ${getStatusClass(detailReport.status)}`}>
                {detailReport.status}
              </span>
            )}
          </div>

          {loadingDetail && (
            <div className="empty-state">
              <div className="empty-state-icon">⏳</div>
              <h3>Loading report details...</h3>
            </div>
          )}

          {detailError && (
            <div className="alert alert-error">
              {detailError}
              <button
                className="btn btn-secondary"
                style={{ marginLeft: '12px' }}
                onClick={() => setSelectedReportId(null)}
              >
                Return to List
              </button>
            </div>
          )}

          {detailReport && !loadingDetail && (
            <div>
              <h2 style={{ margin: '0 0 16px 0', fontSize: '22px', color: '#111827' }}>
                {detailReport.category}
              </h2>

              {detailReport.image_path ? (
                <img
                  src={detailReport.image_path}
                  alt={detailReport.category}
                  className="details-image-full"
                />
              ) : (
                <div
                  style={{
                    background: '#f3f4f6',
                    height: '180px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    color: '#6b7280',
                    marginBottom: '20px',
                  }}
                >
                  No photo available
                </div>
              )}

              <div className="details-grid">
                <div className="details-info-item">
                  <div className="details-info-label">Report ID</div>
                  <div className="details-info-val">#{detailReport.id}</div>
                </div>

                <div className="details-info-item">
                  <div className="details-info-label">Date Submitted</div>
                  <div className="details-info-val">
                    {formatDate(detailReport.created_at)}
                  </div>
                </div>

                <div className="details-info-item" style={{ gridColumn: '1 / -1' }}>
                  <div className="details-info-label">Location</div>
                  <div className="details-info-val">
                    📍 {detailReport.location_text}
                  </div>
                  {detailReport.latitude !== null && detailReport.longitude !== null && (
                    <div style={{ marginTop: '8px' }}>
                      <span className="coords-pill">
                        GPS Coordinates: {detailReport.latitude}, {detailReport.longitude}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="details-desc-box">
                <div className="details-info-label" style={{ marginBottom: '8px' }}>
                  Citizen Description
                </div>
                <div style={{ color: '#374151', fontSize: '14px', lineHeight: 1.6 }}>
                  {detailReport.description
                    ? detailReport.description
                    : 'No additional description provided by the citizen.'}
                </div>
              </div>

              {/* Status Audit Timeline */}
              <div className="timeline-section">
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Status Audit History</h3>
                {detailReport.history && detailReport.history.length > 0 ? (
                  <div className="timeline">
                    {detailReport.history.map((h, idx) => {
                      const isLatest = idx === detailReport.history.length - 1
                      return (
                        <div key={h.id || idx} className="timeline-item">
                          <div className={`timeline-dot ${isLatest ? 'timeline-dot-latest' : ''}`} />
                          <div className="timeline-meta">
                            <span className={`status-badge ${getStatusClass(h.new_status)}`}>
                              {h.new_status}
                            </span>
                            <span className="timeline-date">{formatDate(h.created_at)}</span>
                          </div>
                          {h.note && <div className="timeline-note">{h.note}</div>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p style={{ color: '#6b7280', fontSize: '13px' }}>No status changes recorded yet.</p>
                )}
              </div>

              {/* Authority / Department Status Update Panel */}
              <div className="authority-panel">
                <div className="authority-title">
                  <span>Department / Authority Review</span>
                  <span className="authority-badge">Authority Action</span>
                </div>

                {statusUpdateSuccess && (
                  <div className="alert alert-success" style={{ padding: '8px 12px', fontSize: '13px' }}>
                    {statusUpdateSuccess}
                  </div>
                )}

                {statusUpdateError && (
                  <div className="alert alert-error" style={{ padding: '8px 12px', fontSize: '13px' }}>
                    {statusUpdateError}
                  </div>
                )}

                {detailReport.allowed_transitions && detailReport.allowed_transitions.length > 0 ? (
                  <form onSubmit={handleUpdateStatus}>
                    <label style={{ fontSize: '13px', marginBottom: '8px' }}>
                      Select Next Status:
                    </label>
                    <div className="transition-group">
                      {detailReport.allowed_transitions.map((st) => (
                        <button
                          key={st}
                          type="button"
                          className={`transition-btn ${selectedNextStatus === st ? 'active' : ''}`}
                          onClick={() => setSelectedNextStatus(st)}
                          disabled={updatingStatus}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    <div className="form-group" style={{ marginBottom: '14px' }}>
                      <label htmlFor="statusNote" style={{ fontSize: '13px' }}>
                        Decision Note {selectedNextStatus === 'Rejected' ? <span className="req">* (Required)</span> : '(Optional)'}
                      </label>
                      <input
                        type="text"
                        id="statusNote"
                        placeholder={
                          selectedNextStatus === 'Rejected'
                            ? 'Explain reason for rejection (min 5 chars)...'
                            : 'Add an optional note (e.g. dispatched inspection team)...'
                        }
                        value={statusNote}
                        onChange={(e) => setStatusNote(e.target.value)}
                        disabled={updatingStatus}
                      />
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={updatingStatus || !selectedNextStatus}
                      style={{ width: 'auto', padding: '8px 16px' }}
                    >
                      {updatingStatus ? 'Updating...' : `Update Status to ${selectedNextStatus}`}
                    </button>
                  </form>
                ) : (
                  <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>
                    No further transitions available from current status.
                  </p>
                )}
              </div>

              <div style={{ marginTop: '24px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelectedReportId(null)}
                >
                  ← Back to All Reports
                </button>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'browse' ? (
        /* VIEW 2: Browse Reports List */
        <div className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '20px' }}>Civic Issues Feed</h2>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {reports.length} {reports.length === 1 ? 'report' : 'reports'} found
            </span>
          </div>

          {/* Filters Bar */}
          <div className="filters-box">
            <div className="filters-row">
              <div>
                <input
                  type="text"
                  placeholder="🔍 Search location or keywords..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                />
              </div>

              <div>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="ALL">All Categories</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleClearFilters}
                  title="Reset all filters"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {reportsError && (
            <div className="alert alert-error">
              {reportsError}
              <button
                className="btn btn-secondary"
                style={{ marginLeft: '12px' }}
                onClick={fetchReports}
              >
                Retry
              </button>
            </div>
          )}

          {loadingReports ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏳</div>
              <h3>Loading civic reports...</h3>
            </div>
          ) : reports.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <h3>No civic reports found</h3>
              <p>
                {filterCategory !== 'ALL' || filterStatus !== 'ALL' || filterSearch
                  ? 'No reports match your selected filters. Try clearing the filters.'
                  : 'Be the first resident to report a civic issue in your neighborhood!'}
              </p>
              {filterCategory !== 'ALL' || filterStatus !== 'ALL' || filterSearch ? (
                <button className="btn btn-secondary" onClick={handleClearFilters}>
                  Clear Filters
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => setActiveTab('report')}
                >
                  Report an Issue
                </button>
              )}
            </div>
          ) : (
            <div className="reports-grid">
              {reports.map((r) => (
                <div key={r.id} className="report-card">
                  {r.image_path ? (
                    <img
                      src={r.image_path}
                      alt={r.category}
                      className="report-card-thumb"
                    />
                  ) : (
                    <div
                      className="report-card-thumb"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#9ca3af',
                        fontSize: '12px',
                      }}
                    >
                      No photo
                    </div>
                  )}

                  <div className="report-card-content">
                    <div className="report-card-badges">
                      <span className="cat-badge">{r.category}</span>
                      <span className={`status-badge ${getStatusClass(r.status)}`}>
                        {r.status}
                      </span>
                    </div>

                    <div className="report-card-location">
                      📍 {r.location_text}
                    </div>

                    <div className="report-card-desc">
                      {r.description
                        ? r.description.length > 80
                          ? `${r.description.substring(0, 80)}...`
                          : r.description
                        : 'No description provided.'}
                    </div>

                    <div className="report-card-footer">
                      <span className="report-card-date">
                        {formatDate(r.created_at)}
                      </span>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setSelectedReportId(r.id)}
                      >
                        View Details →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* VIEW 3: Report an Issue Form */
        <div className="card">
          {successReport ? (
            <div className="alert alert-success">
              <h3 style={{ margin: '0 0 8px 0' }}>Report Successfully Submitted!</h3>
              <p style={{ margin: '0 0 10px 0' }}>
                Your report has been securely saved and queued for municipal review.
              </p>
              <div className="success-details">
                <p>
                  <strong>Report ID:</strong> #{successReport.id}
                </p>
                <p>
                  <strong>Status:</strong>{' '}
                  <span
                    className={`status-badge ${getStatusClass(successReport.status)}`}
                  >
                    {successReport.status}
                  </span>
                </p>
                <p>
                  <strong>Category:</strong> {successReport.category}
                </p>
                <p>
                  <strong>Location:</strong> {successReport.location_text}
                </p>
                {successReport.image_path && (
                  <p>
                    <strong>Attached Photo:</strong>{' '}
                    <a
                      href={successReport.image_path}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#1a56db', textDecoration: 'underline' }}
                    >
                      View uploaded image
                    </a>
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  onClick={() => {
                    resetForm()
                    setSelectedReportId(successReport.id)
                  }}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  View in Details
                </button>
                <button
                  onClick={resetForm}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Submit Another Report
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '20px' }}>
                Report a Civic Issue
              </h2>

              {submitError && (
                <div className="alert alert-error">{submitError}</div>
              )}

              <div className="form-group">
                <label htmlFor="category">
                  Issue Category <span className="req">*</span>
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={submitting}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="photo">
                  Attach Photo <span className="req">*</span>
                </label>
                <input
                  type="file"
                  id="photo"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  disabled={submitting}
                  required
                />
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                  Compulsory: Photo is required for verification and AI model recognition (JPEG, PNG, WebP up to 5MB)
                </p>

                {imagePreview && (
                  <div className="image-preview-wrapper">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="image-preview"
                    />
                    <button
                      type="button"
                      className="btn-remove-img"
                      onClick={handleRemoveImage}
                    >
                      ✕ Remove
                    </button>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="location">
                  Location Details <span className="req">*</span>
                </label>
                <input
                  type="text"
                  id="location"
                  placeholder="e.g. Near Market Gate #2, 5th Cross Road"
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  disabled={submitting}
                  required
                />
                <div className="location-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleDetectLocation}
                    disabled={submitting || geoLoading}
                  >
                    {geoLoading ? 'Detecting GPS...' : '📍 Detect My Location'}
                  </button>
                  {latitude !== null && longitude !== null && (
                    <span className="coords-pill">
                      Lat: {latitude}, Lng: {longitude}
                    </span>
                  )}
                </div>
                {geoError && (
                  <div style={{ color: '#d73a49', fontSize: '12px', marginTop: '4px' }}>
                    {geoError}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="description">Description (Optional)</label>
                <textarea
                  id="description"
                  rows="4"
                  placeholder="Describe the problem, severity, and any hazards (optional)..."
                  value={description}
                  maxLength={2000}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                />
                <div className="char-counter">
                  {description.length} / 2000 characters
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={submitting}
              >
                {submitting ? 'Submitting Report...' : 'Submit Report'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

export default App
