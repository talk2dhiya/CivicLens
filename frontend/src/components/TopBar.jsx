import React from 'react'

export default function TopBar({
  currentUser,
  backendStatus,
  onOpenAuth,
  onLogout,
}) {
  return (
    <header className="app-topbar">
      {/* Utilities & User Actions */}
      <div className="topbar-actions">
        {/* Backend Connectivity Status */}
        <div className="topbar-status-chip">
          <span
            className={`topbar-status-dot ${
              backendStatus === 'online'
                ? 'online'
                : backendStatus === 'checking'
                ? 'checking'
                : 'offline'
            }`}
          />
          <span className="topbar-status-text">
            {backendStatus === 'online'
              ? 'Backend Online'
              : backendStatus === 'checking'
              ? 'Checking Server...'
              : 'Backend Offline'}
          </span>
        </div>

        {/* User Account Session */}
        {currentUser ? (
          <div className="topbar-user-section">
            <div className="topbar-user-badge">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="topbar-avatar-icon"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span className="topbar-user-name">{currentUser.display_name}</span>
              <span className="topbar-role-tag">
                {currentUser.role === 'admin'
                  ? 'Admin'
                  : currentUser.role === 'authority'
                  ? `Authority: ${currentUser.department || 'Officer'}`
                  : 'Citizen'}
              </span>
              {currentUser.role === 'authority' &&
                currentUser.account_status === 'pending_approval' && (
                  <span className="topbar-pending-tag">Pending Verification</span>
                )}
            </div>
            <button
              type="button"
              className="topbar-btn-secondary"
              onClick={onLogout}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="topbar-btn-auth"
            onClick={onOpenAuth}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: '6px' }}
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            Sign In / Register
          </button>
        )}
      </div>
    </header>
  )
}
