import React, { useState, useEffect } from 'react'

export default function AdminPanel({ token }) {
  const [authorities, setAuthorities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  const fetchAuthorities = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/v1/admin/authorities', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to fetch authorities.')
      }
      setAuthorities(data.authorities || [])
    } catch (err) {
      setError(err.message || 'Error loading authority list.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) fetchAuthorities()
  }, [token])

  const handleApprove = async (id, name) => {
    setActionSuccess('')
    setError('')
    try {
      const res = await fetch(`/api/v1/admin/authorities/${id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to approve authority.')
      setActionSuccess(`Authority '${name}' has been approved and activated.`)
      fetchAuthorities()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleReject = async (id, name) => {
    if (!window.confirm(`Are you sure you want to disable ${name}?`)) return
    setActionSuccess('')
    setError('')
    try {
      const res = await fetch(`/api/v1/admin/authorities/${id}/reject`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to disable authority.')
      setActionSuccess(`Authority '${name}' has been disabled.`)
      fetchAuthorities()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-panel-container">
      <div className="admin-header-section">
        <div className="admin-header-titles">
          <h2 className="admin-title">Authority Management</h2>
          <p className="admin-subtitle">
            Review, verify, and approve municipal department authority registration requests.
          </p>
        </div>
        <button
          type="button"
          className="admin-refresh-btn"
          onClick={fetchAuthorities}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {actionSuccess && <div className="admin-alert admin-alert-success">{actionSuccess}</div>}
      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      {loading ? (
        <div className="admin-empty-state">
          <h3>Loading authority registrations...</h3>
        </div>
      ) : authorities.length === 0 ? (
        <div className="admin-empty-state">
          <h3>No authority accounts registered yet</h3>
          <p>When municipal officers register with an authority role, their requests will appear here for review.</p>
        </div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>ID</th>
                <th>Name and Email</th>
                <th>Department</th>
                <th style={{ width: '160px' }}>Status</th>
                <th style={{ width: '130px' }}>Registered On</th>
                <th style={{ width: '180px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {authorities.map((auth) => (
                <tr key={auth.id}>
                  <td>
                    <span className="admin-id-badge">#{auth.id}</span>
                  </td>
                  <td>
                    <strong className="admin-user-name">{auth.display_name}</strong>
                    <div className="admin-user-email">{auth.email}</div>
                  </td>
                  <td>
                    <span className="admin-dept-text">{auth.department || 'Not specified'}</span>
                  </td>
                  <td>
                    <span className={`admin-status-badge status-${auth.account_status}`}>
                      {auth.account_status === 'pending_approval'
                        ? 'Pending Approval'
                        : auth.account_status === 'active'
                        ? 'Active / Approved'
                        : 'Disabled'}
                    </span>
                  </td>
                  <td className="admin-date-cell">
                    {auth.created_at?.split('T')[0]}
                  </td>
                  <td>
                    <div className="admin-action-cell">
                      {auth.account_status !== 'active' && (
                        <button
                          type="button"
                          className="admin-btn-approve"
                          onClick={() => handleApprove(auth.id, auth.display_name)}
                        >
                          Approve
                        </button>
                      )}
                      {auth.account_status !== 'disabled' && (
                        <button
                          type="button"
                          className="admin-btn-disable"
                          onClick={() => handleReject(auth.id, auth.display_name)}
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
