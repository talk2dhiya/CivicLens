import React from 'react'

export default function Sidebar({
  activeTab,
  onSelectTab,
  currentUser,
  collapsed = false,
  onToggleCollapse,
}) {
  const isAuthority =
    (currentUser?.role === 'authority' && currentUser?.account_status === 'active') ||
    currentUser?.role === 'admin'
  const isAdmin = currentUser?.role === 'admin'

  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-title">CivicLens</div>
        <div className="sidebar-brand-subtitle">Municipal Intelligence</div>
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        <div className="sidebar-nav-section-label">Public Access</div>
        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'browse' ? 'active' : ''}`}
          onClick={() => onSelectTab('browse')}
        >
          <span className="nav-item-indicator" />
          <span className="nav-item-label">Browse Reports</span>
        </button>

        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => onSelectTab('map')}
        >
          <span className="nav-item-indicator" />
          <span className="nav-item-label">Map and Hotspots</span>
        </button>

        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'report' ? 'active' : ''}`}
          onClick={() => onSelectTab('report')}
        >
          <span className="nav-item-indicator" />
          <span className="nav-item-label">Report an Issue</span>
        </button>

        {/* Municipal Operations & Administration (Role Protected) */}
        {(isAuthority || isAdmin) && (
          <>
            <div className="sidebar-nav-section-label">Operations</div>
            {isAuthority && (
              <button
                type="button"
                className={`sidebar-nav-item ${activeTab === 'authority' ? 'active' : ''}`}
                onClick={() => onSelectTab('authority')}
              >
                <span className="nav-item-indicator" />
                <span className="nav-item-label">Operations Dashboard</span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                className={`sidebar-nav-item ${activeTab === 'admin' ? 'active' : ''}`}
                onClick={() => onSelectTab('admin')}
              >
                <span className="nav-item-indicator" />
                <span className="nav-item-label">Admin Panel</span>
              </button>
            )}
          </>
        )}
      </nav>

      {/* Sidebar Footer / Account Summary */}
      <div className="sidebar-footer">
        {currentUser ? (
          <div className="sidebar-user-block">
            <div className="sidebar-user-name">{currentUser.display_name}</div>
            <div className="sidebar-user-role">
              {currentUser.role === 'admin'
                ? 'Administrator'
                : currentUser.role === 'authority'
                ? `Authority (${currentUser.department || 'Officer'})`
                : 'Citizen Resident'}
            </div>
            {currentUser.role === 'authority' &&
              currentUser.account_status === 'pending_approval' && (
                <div className="sidebar-status-warning">Pending Approval</div>
              )}
          </div>
        ) : (
          <div className="sidebar-user-block">
            <div className="sidebar-user-role">Public Resident Mode</div>
            <div className="sidebar-user-hint">Sign in to submit or manage issues</div>
          </div>
        )}
      </div>
    </aside>
  )
}
