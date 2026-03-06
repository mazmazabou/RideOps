export default function VehicleCard({ vehicle, onLogMaintenance, onRetire, onDelete, onReactivate, onClick }) {
  const lastMaint = vehicle.last_maintenance_date
    ? new Date(vehicle.last_maintenance_date).toLocaleDateString() : 'Never';
  const lastUsed = vehicle.lastUsed
    ? new Date(vehicle.lastUsed).toLocaleDateString() : 'Never';

  const overdueClass = vehicle.maintenanceOverdue ? ' maintenance-overdue' : '';
  const retiredClass = vehicle.status === 'retired' ? ' vehicle-retired' : '';

  let actionButtons;
  if (vehicle.status === 'retired') {
    actionButtons = (
      <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={e => { e.stopPropagation(); onReactivate(vehicle); }}>
        Reactivate
      </button>
    );
  } else if (vehicle.rideCount > 0) {
    actionButtons = (
      <>
        <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={e => { e.stopPropagation(); onLogMaintenance(vehicle); }}>
          Log Maintenance
        </button>
        <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={e => { e.stopPropagation(); onRetire(vehicle); }}>
          Retire
        </button>
      </>
    );
  } else {
    actionButtons = (
      <>
        <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={e => { e.stopPropagation(); onLogMaintenance(vehicle); }}>
          Log Maintenance
        </button>
        <button className="ro-btn ro-btn--danger ro-btn--sm" onClick={e => { e.stopPropagation(); onDelete(vehicle); }}>
          Delete
        </button>
      </>
    );
  }

  return (
    <div className={'vehicle-card' + overdueClass + retiredClass} onClick={() => onClick(vehicle)}>
      <div className="vehicle-name">
        {vehicle.name}
        {vehicle.status === 'retired' && <span className="retired-badge">Retired</span>}
      </div>
      <div className="vehicle-meta">Type: {vehicle.type} &middot; Status: {vehicle.status}</div>
      <div className="vehicle-meta">Completed rides: {vehicle.rideCount} &middot; Last used: {lastUsed}</div>
      <div className="vehicle-meta">Last maintenance: {lastMaint}</div>
      {vehicle.maintenanceOverdue && (
        <div className="maintenance-alert">
          Maintenance overdue ({vehicle.daysSinceMaintenance} days since last service)
        </div>
      )}
      <div className="flex gap-8 mt-8" onClick={e => e.stopPropagation()}>
        {actionButtons}
      </div>
    </div>
  );
}
