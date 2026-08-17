import { useState, useEffect } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { useNotifications } from '../hooks/useNotifications';
import { fetchProgramRules } from '../api';
import NotificationDrawer from './drawers/NotificationDrawer';
import SettingsDrawer from './drawers/SettingsDrawer';

export default function Header() {
  const { tenantConfig } = useTenant();
  const { unreadCount, refreshCount } = useNotifications();
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [studentNotices, setStudentNotices] = useState('');
  const [showNotices, setShowNotices] = useState(false);

  useEffect(() => {
    fetchProgramRules()
      .then(data => setStudentNotices(data.studentRulesHtml || ''))
      .catch(() => {});
  }, []);

  // Quill's empty state is "<p><br></p>" — treat as no content
  const hasNotices = studentNotices && studentNotices.replace(/<[^>]*>/g, '').trim().length > 0;

  const orgShortName = tenantConfig?.orgShortName || 'RideOps';

  return (
    <>
      <header className="rider-header">
        <div className="rider-header__left">
          <span id="org-short-name">{orgShortName}</span>
          <span className="text-muted fw-400">Rider</span>
        </div>
        <div className="flex items-center gap-8">
          {hasNotices && (
            <button
              className="ro-btn ro-btn--outline ro-btn--sm"
              id="student-notices-btn"
              title="Service notices"
              onClick={() => setShowNotices(true)}
            >
              <i className="ti ti-info-circle" />
            </button>
          )}
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
      {showNotices && (
        <div
          className="ro-modal-overlay open"
          id="student-notices-modal"
          onClick={e => { if (e.target === e.currentTarget) setShowNotices(false); }}
        >
          <div className="ro-modal" style={{ maxWidth: 480 }}>
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-16 fw-700" style={{ margin: 0 }}>
                <i className="ti ti-info-circle mr-4" />
                Service Notices
              </h3>
              <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={() => setShowNotices(false)}>
                <i className="ti ti-x" />
              </button>
            </div>
            {/* Office-authored, server-sanitized HTML */}
            <div className="text-14" style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: studentNotices }} />
          </div>
        </div>
      )}
    </>
  );
}
