export default function PlaceholderPanel({ icon, title, phase }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
      <div className="text-center text-muted">
        <i className={`ti ti-${icon} mb-12`} style={{ fontSize: '3rem', display: 'block' }}></i>
        <h3 className="text-secondary" style={{ margin: '0 0 8px' }}>{title}</h3>
        <p className="text-14" style={{ margin: 0 }}>
          This panel is being migrated to React (Phase {phase}).
        </p>
      </div>
    </div>
  );
}
