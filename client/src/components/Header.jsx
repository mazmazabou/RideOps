import { useState } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { useNotifications } from '../hooks/useNotifications';
import NotificationDrawer from './drawers/NotificationDrawer';
import SettingsDrawer from './drawers/SettingsDrawer';

export default function Header() {
  const { tenantConfig } = useTenant();
  const { unreadCount, refreshCount } = useNotifications();
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  const orgShortName = tenantConfig?.orgShortName || 'RideOps';

  return (
    <>
      <header className="rider-header">
        <div className="rider-header__left">
          <span id="org-short-name">{orgShortName}</span>
          <span className="text-muted fw-400">Rider</span>
        </div>
        <div className="flex items-center gap-8">
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
          <button
            className="ro-btn ro-btn--outline ro-btn--sm"
            id="gear-btn"
            onClick={() => setShowSettingsDrawer(true)}
          >
            <i className="ti ti-settings" />
          </button>
        </div>
      </header>
      <NotificationDrawer
        open={showNotifDrawer}
        onClose={() => setShowNotifDrawer(false)}
        onCountChange={refreshCount}
      />
      <SettingsDrawer
        open={showSettingsDrawer}
        onClose={() => setShowSettingsDrawer(false)}
      />
    </>
  );
}
