import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../../contexts/ToastContext';
import { useModal } from '../../../components/ui/Modal';
import {
  fetchFleetVehicles, createVehicle, updateVehicle,
  deleteVehicle as deleteVehicleAPI, retireVehicle as retireVehicleAPI,
  logMaintenance,
} from '../../../api';
import VehicleCard from './VehicleCard';
import VehicleDrawer from './VehicleDrawer';

export default function FleetPanel() {
  const { showToast } = useToast();
  const { showModal } = useModal();

  const [vehicles, setVehicles] = useState([]);
  const [drawerVehicle, setDrawerVehicle] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [maintModal, setMaintModal] = useState(null); // { vehicle }
  const loadedOnce = useRef(false);

  const loadVehicles = useCallback(async () => {
    try {
      const data = await fetchFleetVehicles();
      setVehicles(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    loadVehicles();
  }, [loadVehicles]);

  // Sort: active first, retired last
  const sorted = [...vehicles].sort((a, b) => {
    if ((a.status === 'retired') !== (b.status === 'retired')) return a.status === 'retired' ? 1 : -1;
    return 0;
  });
  const hasActive = sorted.some(v => v.status !== 'retired');
  const hasRetired = sorted.some(v => v.status === 'retired');

  // -- Actions --
  async function handleRetire(vehicle) {
    const confirmed = await showModal({
      title: 'Retire Vehicle',
      message: 'Retire "' + vehicle.name + '"? It will be moved to the archived section.',
      confirmLabel: 'Retire',
      type: 'danger',
    });
    if (!confirmed) return;
    try {
      await retireVehicleAPI(vehicle.id);
      showToast('Vehicle retired', 'success');
      loadVehicles();
    } catch (err) {
      showToast(err.message || 'Failed to retire vehicle', 'error');
    }
  }

  async function handleDelete(vehicle) {
    const confirmed = await showModal({
      title: 'Delete Vehicle',
      message: 'Permanently delete "' + vehicle.name + '"? This cannot be undone.',
      confirmLabel: 'Delete',
      type: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteVehicleAPI(vehicle.id);
      showToast('Vehicle deleted', 'success');
      loadVehicles();
    } catch (err) {
      showToast(err.message || 'Failed to delete vehicle', 'error');
    }
  }

  async function handleReactivate(vehicle) {
    const confirmed = await showModal({
      title: 'Reactivate Vehicle',
      message: 'Reactivate "' + vehicle.name + '" and return it to active service?',
      confirmLabel: 'Reactivate',
    });
    if (!confirmed) return;
    try {
      await updateVehicle(vehicle.id, { status: 'available' });
      showToast('Vehicle reactivated', 'success');
      loadVehicles();
    } catch (err) {
      showToast(err.message || 'Failed to reactivate vehicle', 'error');
    }
  }

  function handleLogMaintenance(vehicle) {
    setMaintModal({ vehicle });
  }

  function handleShowInfo() {
    showModal({
      title: 'Vehicle Status Definitions',
      body: (
        <div className="text-13" style={{ lineHeight: 1.6 }}>
          <p><strong>Active</strong> {'\u2014'} In service, available for ride assignments.</p>
          <p><strong>Retired</strong> {'\u2014'} Removed from service. History preserved.</p>
          <p><strong>Maintenance</strong> {'\u2014'} Temporarily unavailable for service.</p>
        </div>
      ),
      confirmLabel: 'Got it',
      cancelLabel: null,
    });
  }

  // Build card list with optional divider
  const cardElements = [];
  sorted.forEach((v, i) => {
    if (hasActive && hasRetired && i > 0 && v.status === 'retired' && sorted[i - 1].status !== 'retired') {
      cardElements.push(
        <div key="divider" className="vehicle-section-divider"><span>Archived</span></div>
      );
    }
    cardElements.push(
      <VehicleCard
        key={v.id}
        vehicle={v}
        onClick={setDrawerVehicle}
        onLogMaintenance={handleLogMaintenance}
        onRetire={handleRetire}
        onDelete={handleDelete}
        onReactivate={handleReactivate}
      />
    );
  });

  return (
    <div>
      <div className="ro-section">
        <div className="ro-section__header flex items-center justify-between">
          <h3 className="ro-section__title">
            <i className="ti ti-bus" /> Fleet Vehicles
          </h3>
          <div className="flex gap-8">
            <button
              className="ro-btn ro-btn--outline ro-btn--sm"
              title="Status definitions"
              onClick={handleShowInfo}
            >
              <i className="ti ti-info-circle" />
            </button>
            <button className="ro-btn ro-btn--primary ro-btn--sm" onClick={() => setAddModalOpen(true)}>
              <i className="ti ti-plus" /> Add Vehicle
            </button>
          </div>
        </div>

        {vehicles.length === 0 ? (
          <div className="text-center" style={{ padding: 40 }}>
            <i className="ti ti-bus-off text-muted" style={{ fontSize: 32 }} />
            <div className="fw-600 mt-8 text-secondary">No vehicles</div>
            <div className="text-13 text-muted mt-4">Add vehicles to track fleet usage.</div>
          </div>
        ) : (
          <div className="vehicles-grid">
            {cardElements}
          </div>
        )}
      </div>

      {/* Vehicle Detail Drawer */}
      {drawerVehicle && (
        <VehicleDrawer
          vehicle={drawerVehicle}
          onClose={() => { setDrawerVehicle(null); loadVehicles(); }}
          onLogMaintenance={handleLogMaintenance}
          onRetire={handleRetire}
          onDelete={handleDelete}
          onReactivate={handleReactivate}
        />
      )}

      {/* Add Vehicle Modal */}
      {addModalOpen && (
        <AddVehicleModal
          onConfirm={async (data) => {
            setAddModalOpen(false);
            try {
              await createVehicle(data);
              showToast('Vehicle added', 'success');
              loadVehicles();
            } catch (err) {
              showToast(err.message || 'Failed to add vehicle', 'error');
            }
          }}
          onCancel={() => setAddModalOpen(false)}
        />
      )}

      {/* Log Maintenance Modal */}
      {maintModal && (
        <MaintenanceModal
          vehicle={maintModal.vehicle}
          onConfirm={async (data) => {
            const vehicleId = maintModal.vehicle.id;
            setMaintModal(null);
            try {
              await logMaintenance(vehicleId, data);
              showToast('Maintenance logged', 'success');
              loadVehicles();
            } catch (err) {
              showToast(err.message || 'Failed to log maintenance', 'error');
            }
          }}
          onCancel={() => setMaintModal(null)}
        />
      )}
    </div>
  );
}

// -- Add Vehicle Modal --
function AddVehicleModal({ onConfirm, onCancel }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('standard');

  return createPortal(
    <div className="ro-modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="ro-modal">
        <div className="ro-modal__title">Add Vehicle</div>
        <div className="ro-modal__body">
          <div className="mb-12">
            <label className="text-sm fw-600 text-secondary" style={{ display: 'block', marginBottom: 4 }}>
              Name <span style={{ color: 'var(--status-no-show)' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Cart #1"
              className="w-full text-13" style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm fw-600 text-secondary" style={{ display: 'block', marginBottom: 4 }}>
              Type
            </label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full text-13" style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
            >
              <option value="standard">Standard</option>
              <option value="accessible">Accessible</option>
            </select>
          </div>
        </div>
        <div className="ro-modal__actions">
          <button className="ro-btn ro-btn--outline" onClick={onCancel}>Cancel</button>
          <button
            className="ro-btn ro-btn--primary"
            disabled={!name.trim()}
            onClick={() => onConfirm({ name: name.trim(), type })}
          >
            Add Vehicle
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// -- Maintenance Modal --
function MaintenanceModal({ vehicle, onConfirm, onCancel }) {
  const [notes, setNotes] = useState('');
  const [mileage, setMileage] = useState('');

  return createPortal(
    <div className="ro-modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="ro-modal">
        <div className="ro-modal__title">Log Maintenance</div>
        <div className="ro-modal__body">
          <p className="text-13 text-secondary" style={{ margin: '0 0 12px' }}>
            {vehicle.name}
          </p>
          <div className="mb-12">
            <label className="text-sm fw-600 text-secondary" style={{ display: 'block', marginBottom: 4 }}>
              Notes <span style={{ color: 'var(--status-no-show)' }}>*</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Describe maintenance performed..."
              className="w-full text-13" style={{ minHeight: 80, padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', resize: 'vertical' }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm fw-600 text-secondary" style={{ display: 'block', marginBottom: 4 }}>
              Mileage (optional)
            </label>
            <input
              type="number"
              value={mileage}
              onChange={e => setMileage(e.target.value)}
              placeholder="Current mileage"
              className="w-full text-13" style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
            />
          </div>
        </div>
        <div className="ro-modal__actions">
          <button className="ro-btn ro-btn--outline" onClick={onCancel}>Cancel</button>
          <button
            className="ro-btn ro-btn--primary"
            disabled={!notes.trim()}
            onClick={() => onConfirm({ notes: notes.trim(), mileage: mileage ? Number(mileage) : undefined })}
          >
            Log Maintenance
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
