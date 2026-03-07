import { useState } from 'react';
import { useModal } from '../../components/ui/Modal';
import { useToast } from '../../contexts/ToastContext';
import StatusBadge from '../../components/ui/StatusBadge';
import ProfileCard from '../../components/ui/ProfileCard';
import DriverGraceTimer from './DriverGraceTimer';
import VehicleSelector from './VehicleSelector';
import { rideOnTheWay, rideArrived, completeRide, markNoShow, setRideVehicle } from '../../api';
import { formatTime } from '../../utils/formatters';
import { useGraceTimer } from '../hooks/useGraceTimer';

export default function ActiveRideCard({ ride, vehicles, gracePeriodMinutes, onRefresh }) {
  const { showModal } = useModal();
  const { showToast } = useToast();
  const [vehicleBanner, setVehicleBanner] = useState(false);

  const vehicleName = ride.vehicleId ? (vehicles.find(v => v.id === ride.vehicleId)?.name || '') : '';
  const phone = ride.riderPhone || '';

  const handleStartRide = async () => {
    if (ride.vehicleId) {
      // Vehicle already selected via inline selector — simple confirmation
      const confirmed = await showModal({
        title: 'Confirm On My Way',
        body: `Head to ${ride.pickupLocation} in ${vehicleName}?`,
        confirmLabel: 'Confirm',
        confirmClass: 'ro-btn--primary',
      });
      if (!confirmed) return;
      try {
        await rideOnTheWay(ride.id);
        showToast('On your way!', 'success');
        onRefresh();
      } catch (e) {
        showToast(e.message || 'Failed to start ride', 'error');
      }
      return;
    }

    // No vehicle selected yet — show vehicle selection modal
    const available = vehicles.filter(v => v.status === 'available');
    let selectedVehicleId = null;

    const confirmed = await showModal({
      title: 'Confirm On My Way',
      body: (
        <div>
          <div className="mb-12">Which vehicle are you taking?</div>
          <select
            id="modal-vehicle-select"
            className="form-select"
            defaultValue=""
            onChange={e => { selectedVehicleId = e.target.value; }}
          >
            <option value="">Select a vehicle…</option>
            {available.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
      ),
      confirmLabel: 'Confirm',
      confirmClass: 'ro-btn--primary',
    });

    if (!confirmed) return;

    // Read from the DOM since the onChange may not have fired for the default value
    const selectEl = document.getElementById('modal-vehicle-select');
    const vehicleId = selectedVehicleId || (selectEl ? selectEl.value : '');

    if (!vehicleId) {
      showToast('Please select a vehicle', 'warning');
      return;
    }

    try {
      await setRideVehicle(ride.id, vehicleId);
      await rideOnTheWay(ride.id);
      showToast('On your way!', 'success');
      onRefresh();
    } catch (e) {
      showToast(e.message || 'Failed to start ride', 'error');
    }
  };

  const handleHere = async () => {
    try {
      await rideArrived(ride.id);
      showToast('Marked as arrived — grace timer started', 'success');
      onRefresh();
    } catch (e) {
      showToast(e.message || 'Action failed', 'error');
    }
  };

  const handleComplete = async () => {
    const confirmed = await showModal({
      title: 'Complete Ride',
      body: 'Mark this ride as completed?',
      confirmLabel: 'Complete',
      confirmClass: 'ro-btn--success',
    });
    if (!confirmed) return;

    try {
      await completeRide(ride.id);
      showToast('Ride completed', 'success');
      onRefresh();
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('vehicle')) {
        setVehicleBanner(true);
      }
      showToast(e.message || 'Action failed', 'error');
    }
  };

  const handleNoShow = async () => {
    const confirmed = await showModal({
      title: 'Confirm No-Show',
      body: 'Mark this rider as a no-show? This increases their no-show count.',
      confirmLabel: 'Mark No-Show',
      confirmClass: 'ro-btn--danger',
    });
    if (!confirmed) return;

    try {
      await markNoShow(ride.id);
      showToast('Marked as no-show', 'success');
      onRefresh();
    } catch (e) {
      showToast(e.message || 'Action failed', 'error');
    }
  };

  let cta = null;
  if (ride.status === 'scheduled') {
    cta = (
      <button className="ro-btn ro-btn--primary ro-btn--action ro-btn--full" onClick={handleStartRide}>
        <i className="ti ti-navigation" /> ON MY WAY
      </button>
    );
  } else if (ride.status === 'driver_on_the_way') {
    cta = (
      <button className="ro-btn ro-btn--primary ro-btn--action ro-btn--full" onClick={handleHere}>
        <i className="ti ti-map-pin" /> I'M HERE
      </button>
    );
  } else if (ride.status === 'driver_arrived_grace') {
    cta = (
      <>
        <DriverGraceTimer graceStartTime={ride.graceStartTime} gracePeriodMinutes={gracePeriodMinutes} />
        <GraceActions ride={ride} gracePeriodMinutes={gracePeriodMinutes} onComplete={handleComplete} onNoShow={handleNoShow} />
      </>
    );
  }

  return (
    <div className="active-ride-card mb-16" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: 20 }} data-ride-id={ride.id}>
      {vehicleBanner && (
        <div id="vehicle-required-banner-slot">
          <div className="flex items-center gap-10 mb-12" style={{
            background: 'rgba(255,193,7,0.12)', border: '1px solid rgba(255,193,7,0.4)',
            borderRadius: 8, padding: '10px 14px',
          }}>
            <i className="ti ti-alert-triangle" style={{ color: '#d97706', flexShrink: 0 }} />
            <span className="text-13" style={{ color: 'var(--color-text)' }}>
              <strong>Select a vehicle</strong> in the section below before completing this ride.
            </span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-8 mb-12">
        {ride.status === 'driver_arrived_grace'
          ? <span className="status-badge status-badge--driver_arrived_grace">Grace Period</span>
          : <StatusBadge status={ride.status} />
        }
        <span className="text-xs text-muted">{formatTime(ride.requestedTime)}</span>
      </div>
      <ProfileCard user={{
        name: ride.riderName,
        preferredName: ride.riderPreferredName,
        avatarUrl: ride.riderAvatar,
        major: ride.riderMajor,
        graduationYear: ride.riderGraduationYear,
        bio: ride.riderBio,
      }} variant="compact" />
      <div className="text-sm text-secondary" style={{ margin: '8px 0' }}>
        <i className="ti ti-map-pin text-14" style={{ verticalAlign: 'middle' }} />
        {' '}{ride.pickupLocation} → {ride.dropoffLocation}
      </div>
      {phone && (
        <div className="mb-8">
          <a href={`tel:${phone}`} className="items-center gap-4 text-13" style={{ color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex' }}>
            <i className="ti ti-phone text-16" /> {phone}
          </a>
        </div>
      )}
      {ride.notes && (
        <div className="text-xs text-muted mb-12">
          <i className="ti ti-note text-14" style={{ verticalAlign: 'middle' }} /> {ride.notes}
        </div>
      )}
      <VehicleSelector rideId={ride.id} vehicleId={ride.vehicleId} vehicles={vehicles} onRefresh={onRefresh} />
      <div className="mt-16">{cta}</div>
    </div>
  );
}

function GraceActions({ ride, gracePeriodMinutes, onComplete, onNoShow }) {
  const { expired } = useGraceTimer(ride.graceStartTime, gracePeriodMinutes);

  return (
    <div className="flex gap-8">
      <button className="ro-btn ro-btn--success ro-btn--action flex-1" onClick={onComplete}>
        <i className="ti ti-check" /> RIDER BOARDED
      </button>
      <button className="ro-btn ro-btn--danger ro-btn--action flex-1" onClick={onNoShow} disabled={!expired}>
        <i className="ti ti-user-off" /> NO SHOW
      </button>
    </div>
  );
}
