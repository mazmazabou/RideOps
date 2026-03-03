export default function PlaceholderPanel({ icon, title, phase }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
      <div style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
        <i className={`ti ti-${icon}`} style={{ fontSize: '3rem', display: 'block', marginBottom: '12px' }}></i>
        <h3 style={{ margin: '0 0 8px', color: 'var(--color-text-secondary)' }}>{title}</h3>
        <p style={{ margin: 0, fontSize: '14px' }}>
          This panel is being migrated to React (Phase {phase}).
        </p>
      </div>
    </div>
  );
}
