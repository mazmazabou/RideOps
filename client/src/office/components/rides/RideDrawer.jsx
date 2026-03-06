import { useState, useEffect, useCallback } from 'react';
import Drawer from '../../../components/ui/Drawer';
import { useToast } from '../../../contexts/ToastContext';
import { useModal } from '../../../components/ui/Modal';
import { statusLabel, isTerminalStatus } from '../../../utils/status';
import { formatDateTime } from '../../../utils/formatters';
import {
  approveRide, denyRide, unassignRide, reassignRide, assignRide,
  cancelRide, rideOnTheWay, rideArrived, completeRide, markNoShow,
} from '../../../api';

function buildGraceInfo(ride, gracePeriodMinutes) {
  if (ride.status !== 'driver_arrived_grace' || !ride.graceStartTime) {
    return { message: '', canNoShow: false };
  }
  const graceStart = new Date(ride.graceStartTime);
  const elapsed = (Date.now() - graceStart.getTime()) / 1000;
  const graceSec = (gracePeriodMinutes || 5) * 60;
  const remaining = Math.max(0, graceSec - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60).toString().padStart(2, '0');
  const canNoShow = remaining <= 0;
  const message = canNoShow
    ? 'Wait time expired. You may mark a no-show.'
    : `Waiting for rider (${minutes}:${seconds} remaining)`;
  return { message, canNoShow };
}

export default function RideDrawer({
  ride, employees, vehicles, gracePeriodMinutes,
  onClose, onEditClick,
}) {
  const { showToast } = useToast();
  const { showModal } = useModal();
  const [graceInfo, setGraceInfo] = useState({ message: '', canNoShow: false });

  useEffect(() => {
    if (!ride || ride.status !== 'driver_arrived_grace') return;
    const update = () => setGraceInfo(buildGraceInfo(ride, gracePeriodMinutes));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [ride, gracePeriodMinutes]);

  const reload = useCallback(() => onClose(), [onClose]);

  const doAction = useCallback(async (actionFn, successMsg) => {
    try {
      await actionFn();
      showToast(successMsg, 'success');
      reload();
    } catch (e) {
      showToast(e.message || 'Action failed', 'error');
    }
  }, [showToast, reload]);

  const handleApprove = () => doAction(() => approveRide(ride.id), 'Ride approved');
  const handleDeny = () => doAction(() => denyRide(ride.id), 'Ride denied');

  const handleUnassign = async () => {
    const ok = await showModal({
      title: 'Unassign Driver',
      body: `Unassign ${driverName}?`,
      confirmLabel: 'Unassign',
      type: 'warning',
    });
    if (ok) doAction(() => unassignRide(ride.id), 'Driver unassigned');
  };

  const handleCancel = async () => {
    const ok = await showModal({
      title: 'Cancel Ride',
      body: 'Cancel this ride?',
      confirmLabel: 'Cancel Ride',
      type: 'danger',
    });
    if (ok) doAction(() => cancelRide(ride.id), 'Ride cancelled');
  };

  const handleOnTheWay = () => doAction(() => rideOnTheWay(ride.id), 'Driver on the way');
  const handleArrived = () => doAction(() => rideArrived(ride.id), 'Driver arrived');

  const handleComplete = async () => {
    const ok = await showModal({
      title: 'Complete Ride',
      body: 'Mark this ride as completed?',
      confirmLabel: 'Complete',
      type: 'warning',
    });
    if (ok) doAction(() => completeRide(ride.id), 'Ride completed');
  };

  const handleNoShow = async () => {
    const ok = await showModal({
      title: 'Confirm No-Show',
      body: 'Mark this rider as a no-show?',
      confirmLabel: 'Mark No-Show',
      type: 'danger',
    });
    if (ok) doAction(() => markNoShow(ride.id), 'Marked as no-show');
  };

  const handleAssign = async (driverId) => {
    if (!driverId) return;
    const driver = employees.find(e => e.id === driverId);
    const name = driver?.name || 'driver';
    const ok = await showModal({
      title: 'Assign Ride',
      body: `Assign this ride to ${name}?`,
      confirmLabel: 'Assign',
      type: 'warning',
    });
    if (ok) doAction(() => assignRide(ride.id, driverId), `Ride assigned to ${name}`);
  };

  const handleReassign = async (driverId) => {
    if (!driverId) return;
    const driver = employees.find(e => e.id === driverId);
    const name = driver?.name || 'driver';
    const ok = await showModal({
      title: 'Reassign Ride',
      body: `Reassign this ride to ${name}?`,
      confirmLabel: 'Reassign',
      type: 'warning',
    });
    if (ok) doAction(() => reassignRide(ride.id, driverId), `Ride reassigned to ${name}`);
  };

  if (!ride) return null;

  const driverName = ride.assignedDriverId
    ? (employees.find(e => e.id === ride.assignedDriverId)?.name || 'Unknown')
    : 'Unassigned';
  const vehicleName = ride.vehicleId
    ? (vehicles.find(v => v.id === ride.vehicleId)?.name || ride.vehicleId)
    : null;
  const isTerminal = isTerminalStatus(ride.status);
  const isInProgress = ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(ride.status);
  const activeDrivers = employees.filter(e => e.active);

  return (
    <Drawer open={!!ride} onClose={onClose} title="Ride Details">
      {/* Status */}
      <div className="mb-16">
        <div className="mb-8">
          <span className={`status-badge status-badge--${ride.status} text-14`}>
            {statusLabel(ride.status)}
          </span>
        </div>

        {/* Rider */}
        <div className="ro-label mt-8">Rider</div>
        <div className="profile-card profile-card--compact mb-8">
          <div className="fw-600">{ride.riderName || '\u2014'}</div>
          {ride.riderEmail && <div className="text-sm text-muted">{ride.riderEmail}</div>}
          {ride.riderPhone && <div className="text-sm text-muted">{ride.riderPhone}</div>}
        </div>

        {/* Driver */}
        {ride.assignedDriverId && (
          <>
            <div className="ro-label mt-12">Driver</div>
            <div className="profile-card profile-card--compact mb-8">
              <div className="fw-600">{driverName}</div>
            </div>
          </>
        )}
      </div>

      {/* Route */}
      <div className="drawer-section">
        <div className="drawer-section-title">Route</div>
        <div className="drawer-field">
          <div className="drawer-field-label">Pickup</div>
          <div className="drawer-field-value">{ride.pickupLocation || '\u2014'}</div>
        </div>
        <div className="drawer-field">
          <div className="drawer-field-label">Dropoff</div>
          <div className="drawer-field-value">{ride.dropoffLocation || '\u2014'}</div>
        </div>
        <div className="drawer-field">
          <div className="drawer-field-label">Requested</div>
          <div className="drawer-field-value">{formatDateTime(ride.requestedTime)}</div>
        </div>
        <div className="drawer-field">
          <div className="drawer-field-label">Driver</div>
          <div className="drawer-field-value">{driverName}</div>
        </div>
        {vehicleName && (
          <div className="drawer-field">
            <div className="drawer-field-label">Vehicle</div>
            <div className="drawer-field-value">{vehicleName}</div>
          </div>
        )}
        {ride.notes && (
          <div className="drawer-field">
            <div className="drawer-field-label">Notes</div>
            <div className="drawer-field-value">{ride.notes}</div>
          </div>
        )}
        <div className="drawer-field">
          <div className="drawer-field-label">No-shows</div>
          <div className="drawer-field-value">{ride.consecutiveMisses || 0}</div>
        </div>
      </div>

      {/* Contact */}
      {ride.riderPhone && (
        <div className="drawer-section">
          <div className="drawer-section-title">Contact</div>
          <div className="contact-row">
            <a className="contact-pill" href={`tel:${ride.riderPhone}`}>
              <span className="icon">{'\u260E'}</span>Call
            </a>
            <a className="contact-pill" href={`sms:${ride.riderPhone}`}>
              <span className="icon">{'\u2709'}</span>Text
            </a>
          </div>
        </div>
      )}

      {/* Grace info */}
      {graceInfo.message && (
        <div className="text-sm fw-600" style={{
          padding: '8px 0',
          color: graceInfo.canNoShow ? 'var(--status-no-show)' : 'var(--status-grace)',
        }}>
          {graceInfo.message}
        </div>
      )}

      {/* Actions */}
      <div className="drawer-section">
        <div className="drawer-section-title">Actions</div>
        <div className="flex-col gap-8">
          {/* Pending */}
          {ride.status === 'pending' && (
            <>
              <button
                className="ro-btn ro-btn--success ro-btn--full"
                onClick={handleApprove}
                disabled={ride.consecutiveMisses >= 5}
              >Approve</button>
              <button className="ro-btn ro-btn--danger ro-btn--full" onClick={handleDeny}>Deny</button>
            </>
          )}

          {/* Approved + unassigned */}
          {ride.status === 'approved' && !ride.assignedDriverId && (
            <select
              className="reassign-select w-full"
              defaultValue=""
              onChange={e => handleAssign(e.target.value)}
            >
              <option value="">Assign to...</option>
              {activeDrivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}

          {/* In progress actions */}
          {isInProgress && (
            <>
              {ride.status === 'scheduled' && (
                <button className="ro-btn ro-btn--primary ro-btn--full" onClick={handleOnTheWay}>
                  On My Way
                </button>
              )}
              {(ride.status === 'scheduled' || ride.status === 'driver_on_the_way') && (
                <button className="ro-btn ro-btn--outline ro-btn--full" onClick={handleArrived}>
                  I'm Here
                </button>
              )}
              {ride.status === 'driver_arrived_grace' && (
                <>
                  <button className="ro-btn ro-btn--success ro-btn--full" onClick={handleComplete}>
                    Complete
                  </button>
                  <button
                    className="ro-btn ro-btn--danger ro-btn--full"
                    onClick={handleNoShow}
                    disabled={!graceInfo.canNoShow}
                  >No-Show</button>
                </>
              )}

              {/* Unassign / Reassign */}
              {ride.assignedDriverId && (
                <>
                  <hr className="border-none" style={{ borderTop: '1px solid var(--color-border)', margin: '8px 0' }} />
                  <button className="ro-btn ro-btn--outline ro-btn--full" onClick={handleUnassign}>
                    Unassign Driver
                  </button>
                  <select
                    className="reassign-select w-full"
                    defaultValue=""
                    onChange={e => handleReassign(e.target.value)}
                  >
                    <option value="">Reassign to...</option>
                    {activeDrivers
                      .filter(d => d.id !== ride.assignedDriverId)
                      .map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                  </select>
                </>
              )}
            </>
          )}

          {/* Cancel (non-terminal) */}
          {!isTerminal && (
            <button className="ro-btn ro-btn--danger ro-btn--full" onClick={handleCancel}>
              Cancel Ride
            </button>
          )}

          {/* Edit */}
          <button className="ro-btn ro-btn--outline ro-btn--full" onClick={() => {
            onClose();
            onEditClick(ride);
          }}>
            Edit Ride
          </button>
        </div>
      </div>
    </Drawer>
  );
}
