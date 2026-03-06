import { useTenant } from '../../../contexts/TenantContext';

export default function MapPanel({ isVisible }) {
  const { tenantConfig } = useTenant();

  const campusMapUrl = tenantConfig?.mapUrl || null;
  const embeddable = campusMapUrl && tenantConfig?.mapEmbeddable !== false;

  if (!campusMapUrl) {
    return (
      <div className="flex-col items-center justify-center gap-16 text-muted text-center p-24" style={{
        height: '60vh',
      }}>
        <i className="ti ti-map-off" style={{ fontSize: 48, opacity: 0.3 }} />
        <div className="fw-500" style={{ fontSize: 15 }}>No campus map configured</div>
      </div>
    );
  }

  return (
    <div className="flex-col" style={{
      height: 'calc(100vh - 80px)', marginTop: -24,
    }}>
      {embeddable ? (
        <>
          <div className="overflow-hidden flex-1" style={{ minHeight: 200 }}>
            {isVisible && (
              <iframe
                src={campusMapUrl}
                width="100%"
                height="100%"
                className="border-none" style={{ display: 'block' }}
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
          className="flex items-center justify-center p-16 fw-700 text-16"
          style={{
            gap: 10,
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
