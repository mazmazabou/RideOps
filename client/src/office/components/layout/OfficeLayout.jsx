import Sidebar from './Sidebar';
import OfficeHeader from './OfficeHeader';
import MapPanel from '../panels/MapPanel';
import AnalyticsPanel from '../analytics/AnalyticsPanel';
import ProfilePanel from '../panels/ProfilePanel';
import SettingsPanel from '../settings/SettingsPanel';
import RidesPanel from '../rides/RidesPanel';
import DispatchPanel from '../dispatch/DispatchPanel';
import StaffPanel from '../staff/StaffPanel';
import FleetPanel from '../fleet/FleetPanel';

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
            <DispatchPanel />
          </section>
          <section id="rides-panel" className={`tab-panel${activePanel === 'rides-panel' ? ' active' : ''}`}>
            <RidesPanel />
          </section>
          <section id="staff-panel" className={`tab-panel${activePanel === 'staff-panel' ? ' active' : ''}`}>
            <StaffPanel isVisible={activePanel === 'staff-panel'} />
          </section>
          <section id="fleet-panel" className={`tab-panel${activePanel === 'fleet-panel' ? ' active' : ''}`}>
            <FleetPanel />
          </section>
          <section id="analytics-panel" className={`tab-panel${activePanel === 'analytics-panel' ? ' active' : ''}`}>
            <AnalyticsPanel />
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
