import { useState, useCallback } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { TenantProvider, useTenant } from '../contexts/TenantContext';
import { ToastProvider, useToast } from '../contexts/ToastContext';
import { ModalProvider, useModal } from '../components/ui/Modal';
import { useNotifications } from '../hooks/useNotifications';
import NotificationDrawer from '../components/drawers/NotificationDrawer';
import OfficeLayout from './components/layout/OfficeLayout';
import MobileWarning from './components/layout/MobileWarning';

const PANEL_TITLES = {
  'dispatch-panel': 'Dispatch',
  'rides-panel': 'Rides',
  'staff-panel': 'Staff & Shifts',
  'fleet-panel': 'Fleet',
  'analytics-panel': 'Analytics',
  'map-panel': 'Campus Map',
  'settings-panel': 'Settings',
  'profile-panel': 'Profile',
};

function OfficeApp() {
  const { user, logout } = useAuth();
  const { tenantConfig } = useTenant();
  const { showToast } = useToast();
  const { showModal } = useModal();
  const { unreadCount, refreshCount } = useNotifications();
  const [activePanel, setActivePanel] = useState('dispatch-panel');
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);

  const handleShowRules = useCallback(async () => {
    try {
      const res = await fetch('/api/program-rules');
      const data = await res.json();
      if (res.ok && data.rulesHtml) {
        await showModal({
          title: 'Program Rules & Guidelines',
          body: <div className="overflow-y-auto text-14" style={{ maxHeight: '60vh', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: data.rulesHtml }} />,
          confirmLabel: 'Close',
          cancelLabel: null,
        });
      } else {
        showToast('No program rules have been set.', 'info');
      }
    } catch {
      showToast('Failed to load program rules.', 'error');
    }
  }, [showModal, showToast]);

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  return (
    <>
      <MobileWarning />
      <OfficeLayout
        activePanel={activePanel}
        onPanelChange={setActivePanel}
        panelTitle={PANEL_TITLES[activePanel] || 'RideOps'}
        user={user}
        tenantConfig={tenantConfig}
        unreadCount={unreadCount}
        onBellClick={() => setShowNotifDrawer(true)}
        onShowRules={handleShowRules}
        onLogout={handleLogout}
      />
      <NotificationDrawer
        open={showNotifDrawer}
        onClose={() => setShowNotifDrawer(false)}
        onCountChange={refreshCount}
      />
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ModalProvider>
        <AuthProvider expectedRole="office">
          <TenantProvider roleLabel="Office">
            <OfficeApp />
          </TenantProvider>
        </AuthProvider>
      </ModalProvider>
    </ToastProvider>
  );
}
