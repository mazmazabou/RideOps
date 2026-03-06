import StatusBadge from '../ui/StatusBadge';
import EmptyState from '../ui/EmptyState';
import HeroCard from './HeroCard';
import { useModal } from '../ui/Modal';
import { useToast } from '../../contexts/ToastContext';
import { cancelRide } from '../../api';
import { formatDateTime } from '../../utils/formatters';

export default function MyRidesPanel({ activeRides, onBookRide, onRefresh, opsConfig }) {
  const { showModal } = useModal();
  const { showToast } = useToast();

  const handleCancel = async (id) => {
    const confirmed = await showModal({
      title: 'Cancel Ride',
      body: 'Are you sure you want to cancel this ride request?',
      confirmLabel: 'Cancel Ride',
      confirmClass: 'ro-btn--danger',
    });
    if (!confirmed) return;
    try {
      await cancelRide(id);
      showToast('Ride cancelled', 'success');
      onRefresh();
    } catch (e) {
      showToast(e.message || 'Could not cancel', 'error');
    }
  };

  if (activeRides.length === 0) {
    return (
      <EmptyState icon="ti-car-off" title="No active rides" message="Book a ride to get started!">
        <button className="ro-btn ro-btn--primary ro-btn--sm mt-12" onClick={onBookRide}>
          <i className="ti ti-plus" /> Book a Ride
        </button>
      </EmptyState>
    );
  }

  const hero = activeRides[0];
  const rest = activeRides.slice(1);

  return (
    <>
      <HeroCard ride={hero} onCancel={handleCancel} opsConfig={opsConfig} />
      {rest.length > 0 && (
        <div className="mt-16">
          <div className="text-sm fw-600 text-muted mb-8">
            {rest.length} more active ride{rest.length > 1 ? 's' : ''}
          </div>
          <div className="strip-list">
            {rest.map(r => (
              <div key={r.id} className="strip-row flex-col items-start gap-4">
                <div><StatusBadge status={r.status} /></div>
                <div className="text-13 fw-600">
                  {r.pickupLocation} <i className="ti ti-arrow-right text-sm" /> {r.dropoffLocation}
                </div>
                <div className="text-xs text-muted">{formatDateTime(r.requestedTime)}</div>
                {(r.status === 'pending' || (r.status === 'approved' && !r.assignedDriverId)) && (
                  <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={() => handleCancel(r.id)}>Cancel</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
