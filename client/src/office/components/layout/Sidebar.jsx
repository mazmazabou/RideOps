import { useEffect, useRef } from 'react';

const NAV_ITEMS = [
  { id: 'dispatch-panel', icon: 'ti-broadcast', label: 'Dispatch' },
  { id: 'rides-panel', icon: 'ti-car', label: 'Rides' },
  { id: 'staff-panel', icon: 'ti-users', label: 'Staff & Shifts' },
  { id: 'fleet-panel', icon: 'ti-bus', label: 'Fleet' },
  { id: 'analytics-panel', icon: 'ti-chart-bar', label: 'Analytics' },
  { id: 'map-panel', icon: 'ti-map', label: 'Campus Map', navId: 'nav-map' },
  { id: 'settings-panel', icon: 'ti-settings', label: 'Settings' },
];

export default function Sidebar({ activePanel, onPanelChange, user, tenantConfig, mapVisible, onShowRules, onLogout }) {
  const shellRef = useRef(null);

  useEffect(() => {
    // Restore sidebar collapsed state
    const shell = document.getElementById('app-shell');
    shellRef.current = shell;
    if (localStorage.getItem('ro-sidebar-collapsed') === 'true' && shell) {
      shell.classList.add('collapsed');
    }
  }, []);

  const toggleSidebar = () => {
    const shell = shellRef.current || document.getElementById('app-shell');
    if (!shell) return;
    const isCollapsed = shell.classList.toggle('collapsed');
    localStorage.setItem('ro-sidebar-collapsed', isCollapsed);
  };

  return (
    <aside className="ro-sidebar">
      <div className="ro-sidebar-brand">
        <img
          src="/logoWithoutBackground.png"
          alt={tenantConfig?.orgShortName || 'RideOps'}
          className="ro-brand-icon"
          id="org-initials"
          style={{ objectFit: 'cover' }}
        />
        <div className="ro-brand-text">
          <span className="fw-700" id="org-short-name" style={{ fontSize: '14px' }}>
            {tenantConfig?.orgShortName || 'RideOps'}
          </span>
          <span className="text-xs text-muted">Operations</span>
        </div>
        <button className="ro-sidebar-toggle" onClick={toggleSidebar} title="Toggle sidebar">
          <i className="ti ti-chevrons-left"></i>
        </button>
      </div>
      <nav className="ro-nav">
        {NAV_ITEMS.map(item => {
          if (item.id === 'map-panel' && !mapVisible) return null;
          return (
            <button
              key={item.id}
              className={`ro-nav-item${activePanel === item.id ? ' active' : ''}`}
              data-target={item.id}
              title={item.label}
              id={item.navId || undefined}
              onClick={() => onPanelChange(item.id)}
            >
              <i className={`ti ${item.icon}`}></i>
              <span className="ro-nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="ro-sidebar-footer">
        <div className="ro-sidebar-footer-row">
          <button
            className={`ro-nav-item${activePanel === 'profile-panel' ? ' active' : ''}`}
            data-target="profile-panel"
            title="Profile"
            onClick={() => onPanelChange('profile-panel')}
          >
            <i className="ti ti-user-circle"></i>
            <span className="ro-nav-label" id="sidebar-user-name">{user?.name || 'Office'}</span>
          </button>
          <div className="ro-sidebar-footer-actions">
            <button onClick={onShowRules} title="Program Rules"><i className="ti ti-book"></i></button>
            <button onClick={onLogout} title="Logout"><i className="ti ti-logout"></i></button>
          </div>
        </div>
      </div>
    </aside>
  );
}
