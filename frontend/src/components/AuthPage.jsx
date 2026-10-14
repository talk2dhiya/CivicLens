import React, { useState } from 'react'

const DEPARTMENTS = [
  'Roads & Infrastructure',
  'Water Supply & Sewerage',
  'Solid Waste Management',
  'Stormwater & Flood Control',
  'Electrical & Public Lighting',
  'General Municipal Administration',
]

export default function AuthPage({ onAuthSuccess, onBack }) {
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
  const [showPassword, setShowPassword] = useState(false)

  const resetMessages = () => {
    setError('')
    setSuccessMsg('')
  }

  const handleSwitchTab = (newTab) => {
    setTab(newTab)
    resetMessages()
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    resetMessages()
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
    } catch (err) {
      setError(err.message || 'An error occurred during login.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    resetMessages()
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
      } else {
        // Authority awaiting administrator approval
        setSuccessMsg(data.message)
      }
    } catch (err) {
      setError(err.message || 'An error occurred during registration.')
    } finally {
      setLoading(false)
    }
  }

  const fillCredentials = (userEmail, userPass) => {
    setEmail(userEmail)
    setPassword(userPass)
    setTab('login')
    resetMessages()
  }

  return (
    <div className="auth-page-wrapper">
      <div className="auth-page-container">
        {/* Navigation link back to feed */}
        <div style={{ marginBottom: '16px' }}>
          <button
            type="button"
            className="auth-back-link"
            onClick={onBack}
          >
            Back to Public Feed
          </button>
        </div>

        <div className="auth-card">
          <div className="auth-card-header">
            <h1 className="auth-title">CivicLens</h1>
            <p className="auth-subtitle">Account Access and Registration</p>
          </div>

          {/* Clean text tabs */}
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

          {error && <div className="auth-alert auth-alert-error">{error}</div>}
          {successMsg && <div className="auth-alert auth-alert-success">{successMsg}</div>}

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="auth-form">
              <div className="auth-field">
                <label htmlFor="auth-email">Email Address</label>
                <input
                  type="email"
                  id="auth-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  disabled={loading}
                />
              </div>

              <div className="auth-field">
                <label htmlFor="auth-password">Password</label>
                <div className="auth-password-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="auth-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="auth-btn-primary"
                disabled={loading}
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>

              {/* Demo Credentials Section */}
              <div className="auth-demo-section">
                <div className="auth-demo-title">Test Accounts (Click to Fill)</div>
                <div className="auth-demo-grid">
                  <button
                    type="button"
                    className="auth-demo-btn"
                    onClick={() => fillCredentials('admin@civiclens.local', 'Admin123!')}
                  >
                    Administrator
                  </button>
                  <button
                    type="button"
                    className="auth-demo-btn"
                    onClick={() => fillCredentials('citizen@civiclens.local', 'Citizen123!')}
                  >
                    Citizen
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="auth-form">
              {/* Role Selection */}
              <div className="auth-field">
                <label>Account Type</label>
                <div className="auth-role-group">
                  <label className={`auth-role-option ${role === 'citizen' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="role"
                      value="citizen"
                      checked={role === 'citizen'}
                      onChange={() => setRole('citizen')}
                    />
                    <div className="auth-role-text">
                      <span className="auth-role-name">Citizen</span>
                      <span className="auth-role-desc">Submit neighborhood reports and track status</span>
                    </div>
                  </label>

                  <label className={`auth-role-option ${role === 'authority' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="role"
                      value="authority"
                      checked={role === 'authority'}
                      onChange={() => setRole('authority')}
                    />
                    <div className="auth-role-text">
                      <span className="auth-role-name">Municipal Authority</span>
                      <span className="auth-role-desc">Department officer account (requires verification)</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="reg-name">Full Name</label>
                <input
                  type="text"
                  id="reg-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Official name or resident name"
                  required
                  disabled={loading}
                />
              </div>

              <div className="auth-field">
                <label htmlFor="reg-email">Email Address</label>
                <input
                  type="email"
                  id="reg-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  disabled={loading}
                />
              </div>

              <div className="auth-field">
                <label htmlFor="reg-password">Password (Minimum 6 characters)</label>
                <div className="auth-password-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="reg-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Choose a secure password"
                    required
                    minLength={6}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {role === 'authority' && (
                <div className="auth-field">
                  <label htmlFor="reg-dept">Municipal Department</label>
                  <select
                    id="reg-dept"
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
                </div>
              )}

              <button
                type="submit"
                className="auth-btn-primary"
                disabled={loading}
              >
                {loading ? 'Submitting Registration...' : 'Create Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
