import { useTenant } from '../../contexts/TenantContext';

export default function MapPanel({ activeRide, isVisible }) {
  const { tenantConfig } = useTenant();

  const campusMapUrl = tenantConfig?.mapUrl || null;
  const embeddable = campusMapUrl && tenantConfig?.mapEmbeddable !== false;

  if (!campusMapUrl) {
    return (
      <div className="flex-col items-center justify-center gap-16 text-muted text-center p-24" style={{ height: '60vh' }}>
        <i className="ti ti-map-off" style={{ fontSize: 48, opacity: 0.3 }} />
        <div className="fw-500" style={{ fontSize: 15 }}>No campus map configured</div>
      </div>
    );
  }

  return (
    <div className="flex-col gap-16 p-16" style={{ height: 'calc(100vh - 128px)', boxSizing: 'border-box' }}>
      {activeRide && (
        <div className="p-16" style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div className="text-sm text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Active Ride
          </div>
          <div className="fw-700 mb-12" style={{ fontSize: 15 }}>
            {activeRide.riderName || 'Rider'}
          </div>
          <div className="flex-col gap-6">
            <div className="flex items-start gap-8 text-13">
              <i className="ti ti-circle-dot" style={{ color: 'var(--color-primary)', marginTop: 1, flexShrink: 0 }} />
              <span className="text-muted">From:</span>
              <span className="fw-500">{activeRide.pickupLocation || 'Not specified'}</span>
            </div>
            <div className="flex items-start gap-8 text-13">
              <i className="ti ti-map-pin" style={{ color: 'var(--color-primary)', marginTop: 1, flexShrink: 0 }} />
              <span className="text-muted">To:</span>
              <span className="fw-500">{activeRide.dropoffLocation || 'Not specified'}</span>
            </div>
          </div>
        </div>
      )}
      {embeddable ? (
        <>
          <div className="overflow-hidden flex-1" style={{ borderRadius: 12, border: '1px solid var(--color-border)', minHeight: 200 }}>
            {isVisible && (
              <iframe
                src={campusMapUrl}
                width="100%"
                height="100%"
                className="border-none"
                style={{ display: 'block' }}
                allowFullScreen
                loading="lazy"
                title="Campus Map"
              />
            )}
          </div>
          <div className="text-xs text-muted text-center" style={{ marginTop: -4, flexShrink: 0 }}>
            Campus map — use pinch/zoom to navigate
          </div>
        </>
      ) : (
        <a
          href={campusMapUrl}
          target="_blank"
          rel="noopener"
          className="flex items-center justify-center gap-10 fw-700 text-16 p-16"
          style={{
            background: 'var(--color-primary)', color: 'white', borderRadius: 12,
            textDecoration: 'none', letterSpacing: 0.3,
            flexShrink: 0, boxShadow: '0 4px 12px rgba(var(--color-primary-rgb),0.35)',
          }}
        >
          <i className="ti ti-map-2 text-20" /> Open Campus Map
        </a>
      )}
    </div>
  );
}
