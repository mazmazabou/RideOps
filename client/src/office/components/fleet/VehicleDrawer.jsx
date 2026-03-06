import { useState, useEffect } from 'react';
import Drawer from '../../../components/ui/Drawer';
import { fetchMaintenanceLogs } from '../../../api';

export default function VehicleDrawer({ vehicle, onClose, onLogMaintenance, onRetire, onDelete, onReactivate }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vehicle) return;
    setLoading(true);
    fetchMaintenanceLogs(vehicle.id)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [vehicle]);

  if (!vehicle) return null;

  const lastMaint = vehicle.last_maintenance_date
    ? new Date(vehicle.last_maintenance_date).toLocaleDateString() : 'Never';
  const lastUsed = vehicle.lastUsed
    ? new Date(vehicle.lastUsed).toLocaleDateString() : 'Never';
  const statusColor = vehicle.status === 'retired' ? 'var(--color-text-muted)' : 'var(--status-completed)';

  let actionButtons;
  if (vehicle.status === 'retired') {
    actionButtons = (
      <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={() => { onClose(); onReactivate(vehicle); }}>
        Reactivate
      </button>
    );
  } else if (vehicle.rideCount > 0) {
    actionButtons = (
      <>
        <button className="ro-btn ro-btn--primary ro-btn--sm" onClick={() => { onClose(); onLogMaintenance(vehicle); }}>
          Log Maintenance
        </button>
        <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={() => { onClose(); onRetire(vehicle); }}>
          Retire
        </button>
      </>
    );
  } else {
    actionButtons = (
      <>
        <button className="ro-btn ro-btn--primary ro-btn--sm" onClick={() => { onClose(); onLogMaintenance(vehicle); }}>
          Log Maintenance
        </button>
        <button className="ro-btn ro-btn--danger ro-btn--sm" onClick={() => { onClose(); onDelete(vehicle); }}>
          Delete
        </button>
      </>
    );
  }

  return (
    <Drawer open={true} onClose={onClose} title={vehicle.name || 'Vehicle Details'}>
      <div className="mb-16">
        <div className="flex items-center gap-8 mb-8">
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
          <span className="text-13 fw-600" style={{ textTransform: 'capitalize' }}>{vehicle.status}</span>
          <span className="text-sm text-muted ml-auto">{vehicle.type}</span>
        </div>
        {vehicle.maintenanceOverdue && (
          <div className="maintenance-alert mb-12">
            Maintenance overdue ({vehicle.daysSinceMaintenance} days since last service)
          </div>
        )}
        <div className="gap-8 text-13" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <span className="text-muted">Completed rides</span>
            <div className="fw-600">{vehicle.rideCount}</div>
          </div>
          <div>
            <span className="text-muted">Last used</span>
            <div className="fw-600">{lastUsed}</div>
          </div>
          <div>
            <span className="text-muted">Total miles</span>
            <div className="fw-600">{vehicle.total_miles != null ? Number(vehicle.total_miles).toLocaleString() : 'N/A'}</div>
          </div>
          <div>
            <span className="text-muted">Last maintenance</span>
            <div className="fw-600">{lastMaint}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-8" style={{ marginBottom: 20 }}>
        {actionButtons}
      </div>

      <div className="pt-12" style={{ borderTop: '1px solid var(--color-border-light)' }}>
        <h4 className="text-13 fw-700 text-secondary" style={{ margin: '0 0 8px' }}>
          <i className="ti ti-tool mr-4" />Maintenance History
        </h4>
        {loading ? (
          <div className="text-center p-16 text-muted text-13">
            Loading...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center p-16 text-muted text-13">
            No maintenance history yet.
          </div>
        ) : (
          <ul className="maint-timeline">
            {logs.map(log => {
              const date = new Date(log.service_date).toLocaleDateString();
              const mileage = log.mileage_at_service != null ? Number(log.mileage_at_service).toLocaleString() + ' mi' : '';
              const by = log.performed_by_name ? 'by ' + log.performed_by_name : '';
              const metaParts = [mileage, by].filter(Boolean).join(' \u00b7 ');
              return (
                <li key={log.id} className="maint-timeline__item">
                  <div className="maint-timeline__date">{date}</div>
                  {log.notes && <div className="maint-timeline__notes">{log.notes}</div>}
                  {metaParts && <div className="maint-timeline__meta">{metaParts}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
