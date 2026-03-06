import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { patchRideVehicle } from '../../api';

export default function VehicleSelector({ rideId, vehicleId, vehicles, onRefresh }) {
  const { showToast } = useToast();
  const [showSelect, setShowSelect] = useState(!vehicleId);
  const available = vehicles.filter(v => v.status !== 'retired');
  const currentVehicle = vehicles.find(v => v.id === vehicleId);

  const handleChange = async (newVehicleId) => {
    if (!newVehicleId) return;
    try {
      await patchRideVehicle(rideId, newVehicleId);
      showToast('Vehicle recorded', 'success');
      setShowSelect(false);
      onRefresh();
    } catch (e) {
      showToast(e.message || 'Failed to record vehicle', 'error');
    }
  };

  if (vehicleId && !showSelect) {
    return (
      <div className="flex items-center gap-6 text-13 text-muted mt-8 mb-8">
        <i className="ti ti-car" style={{ color: 'var(--color-primary)' }} />
        <span>{currentVehicle?.name || 'Vehicle'}</span>
        <button
          onClick={() => setShowSelect(true)}
          className="ml-auto text-xs border-none cursor-pointer"
          style={{ color: 'var(--color-primary)', background: 'none', textDecoration: 'underline' }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div id="ride-vehicle-row" className="mt-12 pt-12" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="text-sm fw-600 text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        <i className="ti ti-car" /> Vehicle
      </div>
      <select
        id="ride-vehicle-select"
        onChange={e => handleChange(e.target.value)}
        defaultValue=""
        className="w-full text-14"
        style={{
          padding: '10px 12px', border: '1px solid var(--color-border)',
          borderRadius: 8, background: 'var(--color-surface)',
          color: 'var(--color-text)', appearance: 'none',
        }}
      >
        <option value="">Select vehicle…</option>
        {available.map(v => (
          <option key={v.id} value={v.id}>
            {v.name}{v.type === 'accessible' ? ' (Accessible)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
