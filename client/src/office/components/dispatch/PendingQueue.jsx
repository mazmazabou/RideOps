import { useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { useModal } from '../../../components/ui/Modal';
import { approveRide, denyRide } from '../../../api';
import { formatDateTime } from '../../../utils/formatters';

export default function PendingQueue({ rides, onRideClick, onRefresh }) {
  const { showToast } = useToast();
  const { showModal } = useModal();

  const handleApprove = useCallback(async (e, rideId) => {
    e.stopPropagation();
    try {
      await approveRide(rideId);
      showToast('Ride approved', 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to approve', 'error');
    }
  }, [showToast, onRefresh]);

  const handleDeny = useCallback(async (e, rideId) => {
    e.stopPropagation();
    const ok = await showModal({
      title: 'Deny Ride',
      body: 'Are you sure you want to deny this ride?',
      confirmLabel: 'Deny',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await denyRide(rideId);
      showToast('Ride denied', 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to deny', 'error');
    }
  }, [showModal, showToast, onRefresh]);

  if (!rides.length) {
    return (
      <div className="ro-empty">
        <i className="ti ti-checks" style={{ fontSize: 32, opacity: 0.4 }} />
        <div className="ro-empty__title">No pending rides</div>
        <div className="ro-empty__message">All ride requests have been processed.</div>
      </div>
    );
  }

  return (
    <div className="strip-list" id="pending-queue-list">
      {rides.map(ride => {
        const terminated = ride.consecutiveMisses >= 5;
        return (
          <div key={ride.id} className="strip-row" onClick={() => onRideClick(ride)}>
            <div className="flex-1">
              <div>
                <span className="status-badge status-badge--pending">Pending</span>{' '}
                <span className="fw-600">{ride.riderName}</span>
              </div>
              <div className="text-sm text-muted mt-2">
                {ride.pickupLocation} &rarr; {ride.dropoffLocation} &middot; {formatDateTime(ride.requestedTime)}
              </div>
              {terminated && (
                <div className="alert mt-4">
                  SERVICE TERMINATED — 5 consecutive no-shows
                </div>
              )}
            </div>
            <div className="strip-row__actions">
              <button
                className="ro-btn ro-btn--success ro-btn--sm"
                disabled={terminated}
                onClick={(e) => handleApprove(e, ride.id)}
              >
                Approve
              </button>
              <button
                className="ro-btn ro-btn--danger ro-btn--sm"
                onClick={(e) => handleDeny(e, ride.id)}
              >
                Deny
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
