import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useNotifications } from '../../hooks/useNotifications';
import NotificationDrawer from '../../components/drawers/NotificationDrawer';

export default function DriverHeader() {
  const { user, logout } = useAuth();
  const { tenantConfig } = useTenant();
  const { unreadCount, refreshCount } = useNotifications();
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);

  const orgShortName = tenantConfig?.orgShortName || 'RideOps';
  const displayName = user?.preferred_name || user?.name || '';

  return (
    <>
      <header className="driver-header">
        <div className="driver-header__left">
          <span id="org-short-name">{orgShortName}</span>
          <span className="text-muted fw-400">Driver</span>
        </div>
        <div className="driver-header__right">
          <button
            className="notif-bell"
            id="notif-bell-btn"
            title="Notifications"
            onClick={() => setShowNotifDrawer(true)}
          >
            <i className="ti ti-bell" />
            <span className={`notif-badge${unreadCount > 0 ? ' visible' : ''}`} id="notif-badge">
              {unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : ''}
            </span>
          </button>
          <span id="driver-name">{displayName}</span>
          <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={logout}>
            <i className="ti ti-logout" />
          </button>
        </div>
      </header>
      <NotificationDrawer
        open={showNotifDrawer}
        onClose={() => setShowNotifDrawer(false)}
        onCountChange={refreshCount}
      />
    </>
  );
}
