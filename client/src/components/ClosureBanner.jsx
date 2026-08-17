export default function ClosureBanner({ visible, message }) {
  if (!visible) return null;

  return (
    <div
      id="closure-banner"
      className="text-13 fw-600"
      style={{
        background: 'rgba(245,158,11,0.1)',
        color: '#92400E',
        padding: '14px 16px',
        borderRadius: 'var(--radius-sm)',
        margin: '0 16px 12px',
        lineHeight: 1.5,
      }}
    >
      <i className="ti ti-cloud-storm mr-4" style={{ verticalAlign: 'middle' }} />
      {message || 'Service is temporarily closed. Please check back later.'}
    </div>
  );
}
