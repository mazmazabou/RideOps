import { useTenant } from '../../../contexts/TenantContext';

export default function MapPanel({ isVisible }) {
  const { tenantConfig } = useTenant();

  const campusMapUrl = tenantConfig?.mapUrl || null;
  const embeddable = campusMapUrl && tenantConfig?.mapEmbeddable !== false;

  if (!campusMapUrl) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '60vh', gap: 16, color: 'var(--color-text-muted)', textAlign: 'center', padding: 24,
      }}>
        <i className="ti ti-map-off" style={{ fontSize: 48, opacity: 0.3 }} />
        <div style={{ fontSize: 15, fontWeight: 500 }}>No campus map configured</div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 80px)', marginTop: -24,
    }}>
      {embeddable ? (
        <>
          <div style={{
            overflow: 'hidden', flex: 1, minHeight: 200,
          }}>
            {isVisible && (
              <iframe
                src={campusMapUrl}
                width="100%"
                height="100%"
                style={{ border: 0, display: 'block' }}
                allowFullScreen
                loading="lazy"
                title="Campus Map"
              />
            )}
          </div>
        </>
      ) : (
        <a
          href={campusMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: 'var(--color-primary)', color: 'white', padding: 16, borderRadius: 12,
            textDecoration: 'none', fontWeight: 700, fontSize: 16, letterSpacing: 0.3,
            flexShrink: 0, boxShadow: '0 4px 12px rgba(var(--color-primary-rgb),0.35)',
          }}
        >
          <i className="ti ti-map-2" style={{ fontSize: 20 }} /> Open Campus Map
        </a>
      )}
    </div>
  );
}
