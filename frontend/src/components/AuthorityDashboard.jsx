import React, { useState, useEffect, useCallback } from 'react'
import ResolutionEvidenceModal from './ResolutionEvidenceModal'

const STATUS_ORDER = ['Pending', 'Acknowledged', 'In Progress', 'Resolved', 'Rejected']

const DEPARTMENT_TO_CATEGORY = {
  'Roads & Infrastructure': 'Road Damage / Potholes',
  'Water Supply & Sewerage': 'Water Leakage',
  'Solid Waste Management': 'Garbage Overflow',
  'Stormwater & Flood Control': 'Flooding / Waterlogging',
  'Electrical & Public Lighting': 'Broken Streetlights',
}

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

export default function AuthorityDashboard({ token, currentUser, onSelectReport }) {
  const officerDept = currentUser?.department || null
  const hasSpecificDept = Boolean(officerDept && DEPARTMENT_TO_CATEGORY[officerDept])

  // Filter state
  const [filterMyDeptOnly, setFilterMyDeptOnly] = useState(hasSpecificDept)
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Data states
  const [stats, setStats] = useState(null)
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  // Resolution modal state
  const [resolvingReport, setResolvingReport] = useState(null)

  // Fetch KPI statistics
  const fetchStats = useCallback(async () => {
    try {
      const deptParam = filterMyDeptOnly && officerDept ? `?department=${encodeURIComponent(officerDept)}` : ''
      const res = await fetch(`/api/v1/statistics/summary${deptParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch {
      // Ignore background fetch error
    }
  }, [filterMyDeptOnly, officerDept, token])

  // Fetch triage reports queue
  const fetchQueue = useCallback(async () => {
    setLoading(true)
    setActionError('')
    try {
      const params = new URLSearchParams()
      if (filterMyDeptOnly && officerDept && DEPARTMENT_TO_CATEGORY[officerDept]) {
        params.append('category', DEPARTMENT_TO_CATEGORY[officerDept])
      }
      if (filterStatus !== 'ALL') {
        params.append('status', filterStatus)
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim())
      }
      params.append('limit', '100')

      const res = await fetch(`/api/v1/reports?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load department triage queue.')
      const data = await res.json()
      setReports(data.reports || [])
    } catch (err) {
      setActionError(err.message || 'Error loading report queue.')
    } finally {
      setLoading(false)
    }
  }, [filterMyDeptOnly, officerDept, filterStatus, searchQuery])

  useEffect(() => {
    fetchStats()
    fetchQueue()
  }, [fetchStats, fetchQueue])

  // Quick transition action handler (Acknowledge, Start Work, Reject, Reopen)
  const handleQuickTransition = async (reportId, targetStatus) => {
    setActionError('')
    setActionSuccess('')

    let note = `Transitioned to ${targetStatus} via Authority Operations Dashboard`
    if (targetStatus === 'Rejected') {
      const inputNote = window.prompt('Please provide a reason for rejection (compulsory, min 5 characters):')
      if (inputNote === null) return // cancelled
      if (!inputNote.trim() || inputNote.trim().length < 5) {
        alert('Rejection note of at least 5 characters is compulsory.')
        return
      }
      note = inputNote.trim()
    }

    try {
      const res = await fetch(`/api/v1/reports/${reportId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: targetStatus, note }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || `Failed to transition report to ${targetStatus}.`)
      }

      setActionSuccess(`Report #${reportId} status successfully updated to "${targetStatus}".`)
      fetchStats()
      fetchQueue()
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <div className="ops-dashboard-container">
      {/* Top Header */}
      <div className="ops-header-section">
        <div className="ops-header-titles">
          <h2 className="ops-title">Operations Dashboard</h2>
          <div className="ops-meta-row">
            <span>Officer: <strong>{currentUser?.display_name || 'Staff'}</strong></span>
            <span className="ops-meta-dot">•</span>
            <span>Department: <strong>{officerDept || 'Central Administration'}</strong></span>
          </div>
        </div>

        <div className="ops-header-actions">
          {hasSpecificDept && (
            <div className="ops-dept-toggle">
              <button
                type="button"
                className={`ops-toggle-btn ${filterMyDeptOnly ? 'active' : ''}`}
                onClick={() => setFilterMyDeptOnly(true)}
              >
                {officerDept}
              </button>
              <button
                type="button"
                className={`ops-toggle-btn ${!filterMyDeptOnly ? 'active' : ''}`}
                onClick={() => setFilterMyDeptOnly(false)}
              >
                Citywide Queue
              </button>
            </div>
          )}
          <button
            type="button"
            className="ops-refresh-btn"
            onClick={() => {
              fetchStats()
              fetchQueue()
            }}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {actionSuccess && <div className="ops-alert ops-alert-success">{actionSuccess}</div>}
      {actionError && <div className="ops-alert ops-alert-error">{actionError}</div>}

      {/* KPI Metric Cards */}
      <div className="ops-kpi-grid">
        <div className="ops-kpi-card">
          <div className="ops-kpi-num">{stats?.total_reports ?? '--'}</div>
          <div className="ops-kpi-label">Total Assigned Reports</div>
        </div>
        <div className="ops-kpi-card ops-kpi-pending">
          <div className="ops-kpi-num">{stats?.status_counts?.Pending ?? '--'}</div>
          <div className="ops-kpi-label">Pending Initial Review</div>
        </div>
        <div className="ops-kpi-card ops-kpi-progress">
          <div className="ops-kpi-num">
            {(stats?.status_counts?.['In Progress'] ?? 0) + (stats?.status_counts?.Acknowledged ?? 0)}
          </div>
          <div className="ops-kpi-label">Active Remediation</div>
        </div>
        <div className="ops-kpi-card ops-kpi-resolved">
          <div className="ops-kpi-num">{stats?.status_counts?.Resolved ?? '--'}</div>
          <div className="ops-kpi-label">Verified Resolved</div>
        </div>
        <div className="ops-kpi-card">
          <div className="ops-kpi-num">
            {stats?.average_resolution_hours !== null && stats?.average_resolution_hours !== undefined
              ? `${stats.average_resolution_hours}h`
              : '--'}
          </div>
          <div className="ops-kpi-label">Avg Turnaround Time</div>
        </div>
        <div className="ops-kpi-card ops-kpi-hotspot">
          <div className="ops-kpi-num">{stats?.active_hotspots_count ?? '--'}</div>
          <div className="ops-kpi-label">Active Hotspot Clusters</div>
        </div>
      </div>

      {/* Review Queue Filter Toolbar */}
      <div className="ops-toolbar">
        <div className="ops-search-box">
          <input
            type="text"
            className="ops-search-input"
            placeholder="Search location or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="ops-filter-select-box">
          <select
            className="ops-filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="ALL">All Triage Statuses</option>
            {STATUS_ORDER.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
        <div className="ops-count-box">
          Showing {reports.length} {reports.length === 1 ? 'issue' : 'issues'}
        </div>
      </div>

      {/* Triage Queue Table */}
      {loading ? (
        <div className="ops-empty-state">
          <h3>Loading department review queue...</h3>
        </div>
      ) : reports.length === 0 ? (
        <div className="ops-empty-state">
          <h3>Queue is clear</h3>
          <p>There are no outstanding reports matching your active filters.</p>
        </div>
      ) : (
        <div className="ops-table-wrapper">
          <table className="ops-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>ID</th>
                <th style={{ width: '70px' }}>Photo</th>
                <th>Category and Location</th>
                <th style={{ width: '130px' }}>Status</th>
                <th style={{ width: '140px' }}>Submitted</th>
                <th style={{ width: '240px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="ops-id-badge">#{r.id}</span>
                  </td>
                  <td>
                    {r.image_path ? (
                      <img
                        src={r.image_path}
                        alt="Issue thumbnail"
                        className="ops-thumbnail"
                      />
                    ) : (
                      <div className="ops-no-thumbnail">No photo</div>
                    )}
                  </td>
                  <td>
                    <div className="ops-category-name">{r.category}</div>
                    <div className="ops-location-text">{r.location_text}</div>
                  </td>
                  <td>
                    <span className={`status-badge ${getStatusClass(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="ops-date-cell">
                    {formatDate(r.created_at)}
                  </td>
                  <td>
                    <div className="ops-action-cell">
                      {r.status === 'Pending' && (
                        <>
                          <button
                            type="button"
                            className="ops-btn-action ops-btn-ack"
                            onClick={() => handleQuickTransition(r.id, 'Acknowledged')}
                          >
                            Acknowledge
                          </button>
                          <button
                            type="button"
                            className="ops-btn-action ops-btn-reject"
                            onClick={() => handleQuickTransition(r.id, 'Rejected')}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {r.status === 'Acknowledged' && (
                        <>
                          <button
                            type="button"
                            className="ops-btn-action ops-btn-start"
                            onClick={() => handleQuickTransition(r.id, 'In Progress')}
                          >
                            Start Work
                          </button>
                          <button
                            type="button"
                            className="ops-btn-action ops-btn-reject"
                            onClick={() => handleQuickTransition(r.id, 'Rejected')}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {r.status === 'In Progress' && (
                        <button
                          type="button"
                          className="ops-btn-action ops-btn-resolve"
                          onClick={() => setResolvingReport(r)}
                        >
                          Resolve with Proof
                        </button>
                      )}
                      {r.status === 'Resolved' && (
                        <span className="ops-resolved-pill">
                          Proof Verified
                        </span>
                      )}
                      {r.status === 'Rejected' && (
                        <button
                          type="button"
                          className="ops-btn-action ops-btn-reopen"
                          onClick={() => handleQuickTransition(r.id, 'Pending')}
                        >
                          Reopen
                        </button>
                      )}
                      <button
                        type="button"
                        className="ops-btn-action ops-btn-inspect"
                        onClick={() => onSelectReport(r.id)}
                      >
                        Inspect
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Resolution Proof Evidence Modal */}
      {resolvingReport && (
        <ResolutionEvidenceModal
          isOpen={Boolean(resolvingReport)}
          report={resolvingReport}
          token={token}
          onClose={() => setResolvingReport(null)}
          onSuccess={(updated) => {
            setActionSuccess(`Report #${updated.id} successfully verified and resolved with photographic evidence.`)
            fetchStats()
            fetchQueue()
          }}
        />
      )}
    </div>
  )
}
