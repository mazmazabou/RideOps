export default function TerminationBanner({ visible }) {
  if (!visible) return null;

  return (
    <div
      id="terminated-banner"
      className="text-13 fw-600"
      style={{
        background: 'rgba(239,68,68,0.08)',
        color: 'var(--status-no-show)',
        padding: '14px 16px',
        borderRadius: 'var(--radius-sm)',
        margin: '0 16px 12px',
        lineHeight: 1.5,
      }}
    >
      <i className="ti ti-alert-circle mr-4" style={{ verticalAlign: 'middle' }} />
      Your ride privileges have been suspended due to repeated no-shows. Please contact the transportation office to reinstate your account.
    </div>
  );
}
