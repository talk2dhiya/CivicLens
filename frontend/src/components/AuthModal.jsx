import React, { useState } from 'react'

const DEPARTMENTS = [
  'Roads & Infrastructure',
  'Water Supply & Sewerage',
  'Solid Waste Management',
  'Stormwater & Flood Control',
  'Electrical & Public Lighting',
  'General Municipal Administration',
]

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [tab, setTab] = useState('login') // 'login' | 'register'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Form states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('citizen') // 'citizen' | 'authority'
  const [department, setDepartment] = useState(DEPARTMENTS[0])

  if (!isOpen) return null

  const resetForm = () => {
    setError('')
    setSuccessMsg('')
  }

  const handleSwitchTab = (newTab) => {
    setTab(newTab)
    resetForm()
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Login failed.')
      }

      localStorage.setItem('civiclens_token', data.access_token)
      localStorage.setItem('civiclens_user', JSON.stringify(data.user))
      onAuthSuccess(data.user, data.access_token)
      onClose()
    } catch (err) {
      setError(err.message || 'An error occurred during login.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    try {
      const payload = {
        email: email.trim(),
        password,
        display_name: displayName.trim(),
        role,
        department: role === 'authority' ? department : null,
      }

      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Registration failed.')
      }

      if (data.access_token) {
        // Immediate login for citizen
        localStorage.setItem('civiclens_token', data.access_token)
        localStorage.setItem('civiclens_user', JSON.stringify(data.user))
        onAuthSuccess(data.user, data.access_token)
        onClose()
      } else {
        // Authority awaiting approval
        setSuccessMsg(data.message)
      }
    } catch (err) {
      setError(err.message || 'An error occurred during registration.')
    } finally {
      setLoading(false)
    }
  }

  const fillDemoAdmin = () => {
    setEmail('admin@civiclens.local')
    setPassword('Admin123!')
    setTab('login')
  }

  return (
    <div className="auth-modal-backdrop" onClick={onClose}>
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#111827' }}>
              {tab === 'login' ? 'Sign In to CivicLens' : 'Create CivicLens Account'}
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6B7280' }}>
              {tab === 'login'
                ? 'Access your citizen reporting history or authority dashboard'
                : 'Join as a citizen or register as a municipal department authority'}
            </p>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            Close
          </button>
        </div>

        {/* Tab switch */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('login')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('register')}
          >
            Register
          </button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '14px' }}>{error}</div>}
        {successMsg && (
          <div className="alert alert-success" style={{ marginBottom: '14px' }}>
            {successMsg}
          </div>
        )}

        {/* LOGIN FORM */}
        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '8px' }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="demo-credentials-box">
              <span>Demo Admin:</span>
              <button
                type="button"
                className="btn-link"
                onClick={fillDemoAdmin}
              >
                Auto-fill admin@civiclens.local
              </button>
            </div>
          </form>
        ) : (
          /* REGISTER FORM */
          <form onSubmit={handleRegister} className="auth-form">
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Doe or Officer Name"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Password (min 6 characters)</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Select Your Role</label>
              <div className="role-selector-group">
                <label className={`role-card ${role === 'citizen' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="role"
                    value="citizen"
                    checked={role === 'citizen'}
                    onChange={() => setRole('citizen')}
                  />
                  <div>
                    <strong>Citizen</strong>
                    <div style={{ fontSize: '11px', color: '#6B7280' }}>
                      Report civic problems & track resolutions
                    </div>
                  </div>
                </label>

                <label className={`role-card ${role === 'authority' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="role"
                    value="authority"
                    checked={role === 'authority'}
                    onChange={() => setRole('authority')}
                  />
                  <div>
                    <strong>Municipal Authority</strong>
                    <div style={{ fontSize: '11px', color: '#6B7280' }}>
                      Review & resolve departmental reports
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {role === 'authority' && (
              <div className="form-group">
                <label>Department</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={loading}
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#B45309' }}>
                  Authority registrations require Administrator approval before being granted permission to update reports.
                </p>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '8px' }}
              disabled={loading}
            >
              {loading ? 'Registering...' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
