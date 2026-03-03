import Sidebar from './Sidebar';
import OfficeHeader from './OfficeHeader';
import PlaceholderPanel from '../panels/PlaceholderPanel';
import MapPanel from '../panels/MapPanel';
import ProfilePanel from '../panels/ProfilePanel';
import SettingsPanel from '../settings/SettingsPanel';

export default function OfficeLayout({
  activePanel, onPanelChange, panelTitle,
  user, tenantConfig,
  unreadCount, onBellClick,
  onShowRules, onLogout,
}) {
  const mapVisible = tenantConfig?.mapEmbeddable !== false;

  return (
    <div className="ro-shell" id="app-shell">
      <Sidebar
        activePanel={activePanel}
        onPanelChange={onPanelChange}
        user={user}
        tenantConfig={tenantConfig}
        mapVisible={mapVisible}
        onShowRules={onShowRules}
        onLogout={onLogout}
      />
      <main className="ro-main">
        <OfficeHeader
          title={panelTitle}
          unreadCount={unreadCount}
          onBellClick={onBellClick}
        />
        <div className="ro-content">
          <section id="dispatch-panel" className={`tab-panel${activePanel === 'dispatch-panel' ? ' active' : ''}`}>
            <PlaceholderPanel icon="broadcast" title="Dispatch" phase="3d" />
          </section>
          <section id="rides-panel" className={`tab-panel${activePanel === 'rides-panel' ? ' active' : ''}`}>
            <PlaceholderPanel icon="car" title="Rides" phase="3c" />
          </section>
          <section id="staff-panel" className={`tab-panel${activePanel === 'staff-panel' ? ' active' : ''}`}>
            <PlaceholderPanel icon="users" title="Staff & Shifts" phase="3b" />
          </section>
          <section id="fleet-panel" className={`tab-panel${activePanel === 'fleet-panel' ? ' active' : ''}`}>
            <PlaceholderPanel icon="bus" title="Fleet" phase="3b" />
          </section>
          <section id="analytics-panel" className={`tab-panel${activePanel === 'analytics-panel' ? ' active' : ''}`}>
            <PlaceholderPanel icon="chart-bar" title="Analytics" phase="3e" />
          </section>
          <section id="map-panel" className={`tab-panel${activePanel === 'map-panel' ? ' active' : ''}`}>
            <MapPanel isVisible={activePanel === 'map-panel'} />
          </section>
          <section id="settings-panel" className={`tab-panel${activePanel === 'settings-panel' ? ' active' : ''}`}>
            <SettingsPanel />
          </section>
          <section id="profile-panel" className={`tab-panel${activePanel === 'profile-panel' ? ' active' : ''}`}>
            <ProfilePanel />
          </section>
        </div>
      </main>
    </div>
  );
}
