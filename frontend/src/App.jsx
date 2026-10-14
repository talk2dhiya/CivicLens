import React, { useState, useEffect, useCallback } from 'react'
import LocationPickerMap from './components/LocationPickerMap'
import CivicMapExplorer from './components/CivicMapExplorer'
import AuthPage from './components/AuthPage'
import AdminPanel from './components/AdminPanel'
import AuthorityDashboard from './components/AuthorityDashboard'
import ResolutionEvidenceModal from './components/ResolutionEvidenceModal'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'

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
  const [activeTab, setActiveTab] = useState('browse') // 'browse' | 'map' | 'report' | 'authority' | 'admin'
  const [backendStatus, setBackendStatus] = useState('checking')

  // Authentication State
  const [token, setToken] = useState(() => localStorage.getItem('civiclens_token') || '')
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('civiclens_user')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return null
      }
    }
    return null
  })
  const [myReportsOnly, setMyReportsOnly] = useState(false)

  // Selected report for Details Full-View
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [detailReport, setDetailReport] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [detailResolutionModalOpen, setDetailResolutionModalOpen] = useState(false)

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

  // Verify active JWT token on mount or token change
  useEffect(() => {
    if (token) {
      fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) {
            // Expired or invalid token
            setToken('')
            setCurrentUser(null)
            localStorage.removeItem('civiclens_token')
            localStorage.removeItem('civiclens_user')
          } else {
            return res.json()
          }
        })
        .then((data) => {
          if (data && data.user) {
            setCurrentUser(data.user)
            localStorage.setItem('civiclens_user', JSON.stringify(data.user))
          }
        })
        .catch(() => {})
    }
  }, [token])

  const handleLogout = () => {
    setToken('')
    setCurrentUser(null)
    setMyReportsOnly(false)
    localStorage.removeItem('civiclens_token')
    localStorage.removeItem('civiclens_user')
    if (activeTab === 'admin') {
      setActiveTab('browse')
    }
  }

  // Fetch reports list with active filters or My Reports toggle
  const fetchReports = useCallback(async () => {
    setLoadingReports(true)
    setReportsError('')
    try {
      let url = '/api/v1/reports'
      const headers = {}

      if (myReportsOnly && token) {
        url = '/api/v1/reports/my'
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const params = new URLSearchParams()
        if (filterCategory !== 'ALL') params.append('category', filterCategory)
        if (filterStatus !== 'ALL') params.append('status', filterStatus)
        if (filterSearch.trim()) params.append('search', filterSearch.trim())
        url = `/api/v1/reports?${params.toString()}`
      }

      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error('Failed to load reports from server.')
      const data = await res.json()
      setReports(data.reports || [])
    } catch (err) {
      setReportsError(err.message || 'Error connecting to backend.')
    } finally {
      setLoadingReports(false)
    }
  }, [filterCategory, filterStatus, filterSearch, myReportsOnly, token])

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

    if (selectedNextStatus === 'Resolved') {
      setDetailResolutionModalOpen(true)
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
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/v1/reports/${detailReport.id}/status`, {
        method: 'PATCH',
        headers,
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
    setMyReportsOnly(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    setSuccessReport(null)

    if (!token || !currentUser) {
      setSubmitError('You must sign in as a citizen or administrator to submit a report.')
      setActiveTab('auth')
      return
    }

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
      const headers = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch('/api/v1/reports', {
        method: 'POST',
        headers,
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

  if (activeTab === 'auth') {
    return (
      <AuthPage
        onAuthSuccess={(user, tok) => {
          setCurrentUser(user)
          setToken(tok)
          setActiveTab('browse')
        }}
        onBack={() => setActiveTab('browse')}
      />
    )
  }

  return (
    <div className="app-layout">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab)
          setSelectedReportId(null)
        }}
        currentUser={currentUser}
      />
      <div className="app-main-content">
        <TopBar
          currentUser={currentUser}
          backendStatus={backendStatus}
          onOpenAuth={() => setActiveTab('auth')}
          onLogout={handleLogout}
        />
        <main className="app-page-body">

      {/* VIEW 1: Full Report Details Transition */}
      {selectedReportId !== null ? (
        <div className="details-view-container">
          <div className="details-nav-bar">
            <button
              type="button"
              className="details-back-btn"
              onClick={() => setSelectedReportId(null)}
            >
              Back to Reports
            </button>
            {detailReport && (
              <span className={`status-badge ${getStatusClass(detailReport.status)}`}>
                {detailReport.status}
              </span>
            )}
          </div>

          {loadingDetail && (
            <div className="feed-empty">
              <h3>Loading report details...</h3>
            </div>
          )}

          {detailError && (
            <div className="alert alert-error">
              {detailError}
              <button
                type="button"
                className="details-back-btn"
                style={{ marginLeft: '12px' }}
                onClick={() => setSelectedReportId(null)}
              >
                Return to List
              </button>
            </div>
          )}

          {detailReport && !loadingDetail && (
            <div>
              {/* Primary Report Card */}
              <div className="details-hero-section">
                <div className="details-title-row">
                  <div>
                    <h2 className="details-category-title">{detailReport.category}</h2>
                    <div className="details-date-text">
                      Submitted on {formatDate(detailReport.created_at)}
                    </div>
                  </div>
                  <span className={`status-badge ${getStatusClass(detailReport.status)}`}>
                    {detailReport.status}
                  </span>
                </div>

                {/* Verified Resolution Proof Banner (If Resolved & Proof Photo Exists) */}
                {detailReport.status === 'Resolved' && detailReport.resolution_image_path ? (
                  <div className="details-proof-banner">
                    <div className="proof-title-bar">
                      <span className="proof-title-text">
                        Verified Municipal Resolution Evidence
                      </span>
                      {detailReport.resolved_at && (
                        <span className="proof-resolved-time">
                          Resolved on {formatDate(detailReport.resolved_at)}
                        </span>
                      )}
                    </div>
                    {detailReport.resolution_note && (
                      <div className="proof-remarks-box">
                        <strong>Completion Remarks:</strong> {detailReport.resolution_note}
                      </div>
                    )}
                    <div className="proof-grid">
                      <div>
                        <div className="proof-col-heading">Before (Citizen Submission)</div>
                        <img
                          src={detailReport.image_path}
                          alt="Before repair"
                          className="proof-img-frame"
                        />
                      </div>
                      <div>
                        <div className="proof-col-heading">After (Authority Repair Proof)</div>
                        <img
                          src={detailReport.resolution_image_path}
                          alt="After repair proof"
                          className="proof-img-frame"
                        />
                      </div>
                    </div>
                  </div>
                ) : detailReport.image_path ? (
                  <img
                    src={detailReport.image_path}
                    alt={detailReport.category}
                    className="details-image-banner"
                  />
                ) : (
                  <div className="details-image-empty">
                    No photographic evidence attached to this report
                  </div>
                )}

                {/* Metadata Grid */}
                <div className="details-meta-grid">
                  <div className="details-meta-card">
                    <div className="details-meta-label">Report ID</div>
                    <div className="details-meta-val">#{detailReport.id}</div>
                  </div>

                  <div className="details-meta-card">
                    <div className="details-meta-label">Date Submitted</div>
                    <div className="details-meta-val">
                      {formatDate(detailReport.created_at)}
                    </div>
                  </div>

                  <div className="details-meta-card" style={{ gridColumn: '1 / -1' }}>
                    <div className="details-meta-label">Location</div>
                    <div className="details-meta-val">
                      {detailReport.location_text}
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

                <div className="details-desc-card">
                  <div className="details-meta-label" style={{ marginBottom: '8px' }}>
                    Citizen Description
                  </div>
                  <p className="details-desc-text">
                    {detailReport.description
                      ? detailReport.description
                      : 'No additional description provided by the citizen.'}
                  </p>
                </div>
              </div>

              {/* Status Audit Timeline */}
              <div className="details-audit-section">
                <h3 className="audit-section-title">Status Audit History</h3>
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
                          {h.evidence_image_path && (
                            <div style={{ marginTop: '6px' }}>
                              <a
                                href={h.evidence_image_path}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'underline' }}
                              >
                                View Attached Resolution Proof
                              </a>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No status changes recorded yet.</p>
                )}
              </div>

              {/* Authority / Department Status Update Panel */}
              <div className="details-authority-card">
                <div className="authority-card-header">
                  <h3 className="authority-header-title">Department Review</h3>
                  <span className="authority-header-badge">Authority Action</span>
                </div>

                {statusUpdateSuccess && (
                  <div className="alert alert-success" style={{ padding: '8px 12px', fontSize: '13px', marginBottom: '14px' }}>
                    {statusUpdateSuccess}
                  </div>
                )}

                {statusUpdateError && (
                  <div className="alert alert-error" style={{ padding: '8px 12px', fontSize: '13px', marginBottom: '14px' }}>
                    {statusUpdateError}
                  </div>
                )}

                {!currentUser ? (
                  <div style={{ background: '#faf9f6', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--color-text-main)', lineHeight: 1.5 }}>
                    <strong>Authentication Required:</strong> Please{' '}
                    <button
                      type="button"
                      className="details-back-btn"
                      style={{ padding: '4px 10px', fontSize: '12px', display: 'inline', margin: '0 6px' }}
                      onClick={() => setActiveTab('auth')}
                    >
                      Sign In
                    </button>{' '}
                    with an approved Department Authority or Administrator account to update report statuses.
                  </div>
                ) : currentUser.role === 'citizen' ? (
                  <div style={{ background: 'var(--color-accent-tint)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid #c7e0cf', fontSize: '13px', color: 'var(--color-primary)', lineHeight: 1.5 }}>
                    <strong>Citizen Read-Only View:</strong> You are signed in as a citizen. Issue status transitions and audit notes can only be recorded by municipal officers.
                  </div>
                ) : currentUser.role === 'authority' && currentUser.account_status === 'pending_approval' ? (
                  <div style={{ background: 'var(--color-danger-tint)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid #fecaca', fontSize: '13px', color: 'var(--color-danger)', lineHeight: 1.5 }}>
                    <strong>Verification Pending:</strong> Your authority account is awaiting approval by the municipal administrator. Status updates are locked until your registration is verified.
                  </div>
                ) : detailReport.allowed_transitions && detailReport.allowed_transitions.length > 0 ? (
                  <form onSubmit={handleUpdateStatus}>
                    <label style={{ fontSize: '13px', marginBottom: '8px', display: 'block', fontWeight: 600 }}>
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

                    {selectedNextStatus === 'Resolved' ? (
                      <div style={{ background: 'var(--color-success-tint)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid #bbf7d0', marginBottom: '14px' }}>
                        <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#166534', fontWeight: 700 }}>
                          Resolution Evidence Compulsory:
                        </p>
                        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#166534', lineHeight: 1.4 }}>
                          Marking an issue as Resolved strictly requires photographic proof of the repair and a completion note.
                        </p>
                        <button
                          type="button"
                          className="report-success-btn-primary"
                          onClick={() => setDetailResolutionModalOpen(true)}
                          style={{ padding: '8px 16px', display: 'inline-block' }}
                        >
                          Attach Proof Photo and Resolve
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="form-group" style={{ marginBottom: '14px' }}>
                          <label htmlFor="statusNote" style={{ fontSize: '13px', fontWeight: 600 }}>
                            Decision Note {selectedNextStatus === 'Rejected' ? <span className="req">* (Required)</span> : '(Optional)'}
                          </label>
                          <input
                            type="text"
                            id="statusNote"
                            className="report-input-text"
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
                          className="report-submit-btn"
                          disabled={updatingStatus || !selectedNextStatus}
                          style={{ width: 'auto', padding: '10px 20px', marginTop: 0 }}
                        >
                          {updatingStatus ? 'Updating...' : `Update Status to ${selectedNextStatus}`}
                        </button>
                      </>
                    )}
                  </form>
                ) : (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: 0 }}>
                    No further transitions available from current status.
                  </p>
                )}
              </div>

              <div style={{ marginTop: '24px' }}>
                <button
                  type="button"
                  className="details-back-btn"
                  onClick={() => setSelectedReportId(null)}
                >
                  Back to Reports
                </button>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'browse' ? (
        /* VIEW 2: Browse Reports List */
        <div className="reports-feed-container">
          <div className="reports-feed-header">
            <div className="feed-header-main">
              <h2 className="feed-title">Civic Issues Feed</h2>
              <div className="feed-subtitle">Public municipal reports and infrastructure tracking</div>
            </div>
            <div className="feed-count-badge">
              {reports.length} {reports.length === 1 ? 'report active' : 'reports active'}
            </div>
          </div>

          {/* Filters Bar */}
          <div className="feed-toolbar">
            <div className="feed-toolbar-row">
              <div>
                <input
                  type="text"
                  className="feed-search-input"
                  placeholder="Filter by keyword or location..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                />
              </div>

              <div>
                <select
                  className="feed-filter-select"
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
                  className="feed-filter-select"
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
                  className="feed-reset-btn"
                  onClick={handleClearFilters}
                >
                  Reset Filters
                </button>
              </div>
            </div>

            {currentUser && (
              <label className="feed-my-toggle">
                <input
                  type="checkbox"
                  checked={myReportsOnly}
                  onChange={(e) => setMyReportsOnly(e.target.checked)}
                />
                <span>Show only my submitted reports</span>
              </label>
            )}
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
            <div className="feed-empty">
              <h3>Loading civic reports...</h3>
            </div>
          ) : reports.length === 0 ? (
            <div className="feed-empty">
              <h3>No civic reports found</h3>
              <p>
                {filterCategory !== 'ALL' || filterStatus !== 'ALL' || filterSearch
                  ? 'No reports match your selected filters. Try resetting the filters.'
                  : 'No community issues have been reported yet in your area.'}
              </p>
              {filterCategory !== 'ALL' || filterStatus !== 'ALL' || filterSearch ? (
                <button className="feed-empty-btn" onClick={handleClearFilters}>
                  Reset Filters
                </button>
              ) : (
                <button
                  className="feed-empty-btn"
                  onClick={() => setActiveTab('report')}
                >
                  Report an Issue
                </button>
              )}
            </div>
          ) : (
            <div className="feed-grid">
              {reports.map((r) => (
                <div key={r.id} className="feed-card">
                  {r.image_path ? (
                    <img
                      src={r.image_path}
                      alt={r.category}
                      className="feed-card-media"
                    />
                  ) : (
                    <div className="feed-card-placeholder">
                      No photo attached
                    </div>
                  )}

                  <div className="feed-card-body">
                    <div className="feed-card-top">
                      <div className="feed-card-category">{r.category}</div>
                      <span className={`status-badge ${getStatusClass(r.status)}`}>
                        {r.status}
                      </span>
                    </div>

                    <div className="feed-card-location">
                      {r.location_text}
                    </div>

                    <div className="feed-card-desc">
                      {r.description
                        ? r.description.length > 95
                          ? `${r.description.substring(0, 95)}...`
                          : r.description
                        : 'No description provided.'}
                    </div>

                    <div className="feed-card-footer">
                      <span className="feed-card-date">
                        {formatDate(r.created_at)}
                      </span>
                      <button
                        type="button"
                        className="feed-card-btn"
                        onClick={() => setSelectedReportId(r.id)}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'authority' &&
        ((currentUser?.role === 'authority' && currentUser?.account_status === 'active') ||
          currentUser?.role === 'admin') ? (
        /* VIEW 3: Authority Operations Dashboard */
        <AuthorityDashboard
          token={token}
          currentUser={currentUser}
          onSelectReport={(id) => setSelectedReportId(id)}
        />
      ) : activeTab === 'admin' && currentUser?.role === 'admin' ? (
        /* VIEW 4: Administrator Authority Approvals */
        <AdminPanel token={token} />
      ) : activeTab === 'map' ? (
        /* VIEW 5: Interactive Map Explorer & Hotspots */
        <CivicMapExplorer onSelectReport={(id) => setSelectedReportId(id)} />
      ) : (
        /* VIEW 5: Report an Issue Form */
        <div className="report-form-container">
          <div className="report-form-header">
            <h2 className="report-form-title">Report a Civic Issue</h2>
            <div className="report-form-subtitle">
              Submit neighborhood infrastructure concerns with coordinates and photo evidence for official review.
            </div>
          </div>

          {successReport ? (
            <div className="report-success-card">
              <h3 className="report-success-title">Report Successfully Submitted</h3>
              <p className="report-success-desc">
                Your report has been securely registered in the municipal database and queued for departmental triage.
              </p>
              <div className="report-receipt-grid">
                <div className="report-receipt-row">
                  <span className="report-receipt-label">Report ID</span>
                  <span className="report-receipt-value">#{successReport.id}</span>
                </div>
                <div className="report-receipt-row">
                  <span className="report-receipt-label">Status</span>
                  <span className="report-receipt-value">
                    <span className={`status-badge ${getStatusClass(successReport.status)}`}>
                      {successReport.status}
                    </span>
                  </span>
                </div>
                <div className="report-receipt-row">
                  <span className="report-receipt-label">Category</span>
                  <span className="report-receipt-value">{successReport.category}</span>
                </div>
                <div className="report-receipt-row">
                  <span className="report-receipt-label">Location</span>
                  <span className="report-receipt-value">{successReport.location_text}</span>
                </div>
                {successReport.image_path && (
                  <div className="report-receipt-row">
                    <span className="report-receipt-label">Attached Photo</span>
                    <span className="report-receipt-value">
                      <a
                        href={successReport.image_path}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
                      >
                        View uploaded evidence photo
                      </a>
                    </span>
                  </div>
                )}
              </div>
              <div className="report-success-actions">
                <button
                  type="button"
                  className="report-success-btn-primary"
                  onClick={() => {
                    resetForm()
                    setSelectedReportId(successReport.id)
                  }}
                >
                  View in Details
                </button>
                <button
                  type="button"
                  className="report-success-btn-secondary"
                  onClick={resetForm}
                >
                  Submit Another Report
                </button>
              </div>
            </div>
          ) : (
            <div className="report-card-surface">
              <form onSubmit={handleSubmit} className="report-form-body">
                {!currentUser && (
                  <div className="report-auth-notice">
                    <div className="report-auth-notice-text">
                      <strong>Citizen Sign-In Required:</strong> Community issue reporting requires an active citizen or administrator account to maintain neighborhood accountability and transparency.
                    </div>
                    <button
                      type="button"
                      className="report-auth-btn"
                      onClick={() => setActiveTab('auth')}
                    >
                      Sign In / Register
                    </button>
                  </div>
                )}

                {submitError && (
                  <div className="alert alert-error">{submitError}</div>
                )}

                <div className="report-field-group">
                  <label htmlFor="category" className="report-field-label">
                    Issue Category <span className="report-field-req">*</span>
                  </label>
                  <select
                    id="category"
                    className="report-input-select"
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

                <div className="report-field-group">
                  <label htmlFor="photo" className="report-field-label">
                    Photographic Evidence <span className="report-field-req">*</span>
                  </label>
                  <div className="report-file-control">
                    <input
                      type="file"
                      id="photo"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageChange}
                      disabled={submitting}
                      required
                    />
                    <div className="report-field-hint">
                      Compulsory: Clear photo evidence is required for automated review and municipal validation (JPEG, PNG, WebP up to 5MB).
                    </div>
                  </div>

                  {imagePreview && (
                    <div className="report-preview-container">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="report-preview-image"
                      />
                      <button
                        type="button"
                        className="report-remove-photo-btn"
                        onClick={handleRemoveImage}
                      >
                        Remove Photo
                      </button>
                    </div>
                  )}
                </div>

                <div className="report-field-group">
                  <label htmlFor="location" className="report-field-label">
                    Location Details <span className="report-field-req">*</span>
                  </label>
                  <input
                    type="text"
                    id="location"
                    className="report-input-text"
                    placeholder="e.g. Near Market Gate 2, 5th Cross Road"
                    value={locationText}
                    onChange={(e) => setLocationText(e.target.value)}
                    disabled={submitting}
                    required
                  />

                  <div className="report-geo-actions">
                    <button
                      type="button"
                      className="report-detect-btn"
                      onClick={handleDetectLocation}
                      disabled={submitting || geoLoading}
                    >
                      {geoLoading ? 'Detecting GPS...' : 'Detect My Location'}
                    </button>
                    {latitude !== null && longitude !== null && (
                      <span className="report-coords-badge">
                        GPS: {latitude}, {longitude}
                      </span>
                    )}
                  </div>

                  {geoError && (
                    <div style={{ color: 'var(--color-danger)', fontSize: '12px', marginTop: '4px' }}>
                      {geoError}
                    </div>
                  )}

                  <div style={{ marginTop: '12px' }}>
                    <LocationPickerMap
                      latitude={latitude}
                      longitude={longitude}
                      onChange={({ lat, lng }) => {
                        setLatitude(lat)
                        setLongitude(lng)
                      }}
                    />
                  </div>
                </div>

                <div className="report-field-group">
                  <label htmlFor="description" className="report-field-label">
                    Detailed Description (Optional)
                  </label>
                  <textarea
                    id="description"
                    className="report-input-textarea"
                    rows="4"
                    placeholder="Describe the issue severity, hazards, or landmarks (optional)..."
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
                  className="report-submit-btn"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting Report...' : 'Submit Report'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Resolution Evidence Modal for Details View */}
      {detailResolutionModalOpen && detailReport && (
        <ResolutionEvidenceModal
          isOpen={detailResolutionModalOpen}
          report={detailReport}
          token={token}
          onClose={() => setDetailResolutionModalOpen(false)}
          onSuccess={(updated) => {
            setDetailReport(updated)
            setSelectedNextStatus(updated.allowed_transitions?.[0] || '')
            setStatusNote('')
            setStatusUpdateSuccess('Report verified and resolved with resolution proof!')
            fetchReports()
          }}
        />
      )}
        </main>
      </div>
    </div>
  )
}

export default App

