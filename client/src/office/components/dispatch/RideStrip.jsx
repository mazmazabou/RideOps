import { useCallback } from 'react';
import { campusTimeParts } from '../../../utils/tz';

const STATUS_COLORS = {
  approved: 'var(--status-approved)',
  scheduled: 'var(--status-scheduled)',
  driver_on_the_way: 'var(--status-on-the-way)',
  driver_arrived_grace: 'var(--status-grace)',
  completed: 'var(--status-completed)',
  no_show: 'var(--status-no-show)',
  pending: 'var(--status-pending)',
};

export default function RideStrip({ ride, driverColor, onClick }) {
  const mins = campusTimeParts(ride.requestedTime).min;
  const left = (mins / 60 * 100) + '%';
  const bg = STATUS_COLORS[ride.status] || 'var(--status-pending)';
  const lastName = (ride.riderName || '').split(' ').pop();
  const abbrev = abbreviateLocation(ride.pickupLocation);
  const isDraggable = ride.status === 'scheduled' || ride.status === 'approved';

  const handleDragStart = useCallback((e) => {
    const sourceRow = e.target.closest('.time-grid__row');
    const sourceDriverId = sourceRow?.dataset.driverId || '';
    const sourceRowType = sourceRow?.dataset.rowType === 'unassigned' ? 'unassigned' : 'driver';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-ride', JSON.stringify({
      rideId: ride.id,
      rideStatus: ride.status,
      sourceDriverId,
      sourceRowType,
    }));
    e.target.classList.add('time-grid__ride-strip--dragging');

    // Highlight drop targets
    const grid = e.target.closest('.time-grid');
    if (grid) {
      grid.querySelectorAll('.time-grid__row[data-driver-id][data-active="true"]').forEach(row => {
        if (row.dataset.driverId !== sourceDriverId) row.classList.add('time-grid__row--drop-ready');
      });
      if (sourceRowType === 'driver') {
        const unassignedRow = grid.querySelector('.time-grid__row[data-row-type="unassigned"]');
        if (unassignedRow) unassignedRow.classList.add('time-grid__row--drop-ready');
      }
    }
  }, [ride.id, ride.status]);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    onClick(ride);
  }, [ride, onClick]);

  const borderLeft = driverColor ? `3px solid ${driverColor}` : undefined;

  return (
    <div
      className="time-grid__ride-strip"
      data-ride-id={ride.id}
      data-ride-status={ride.status}
      draggable={isDraggable}
      onDragStart={isDraggable ? handleDragStart : undefined}
      onClick={handleClick}
      style={{ left, width: '50%', background: bg, borderLeft }}
      title={`${ride.riderName}: ${ride.pickupLocation} → ${ride.dropoffLocation}`}
    >
      {lastName} &middot; {abbrev}
    </div>
  );
}

function abbreviateLocation(location) {
  if (!location) return '?';
  const match = location.match(/\(([^)]+)\)\s*$/);
  if (match) return match[1];
  return location.substring(0, 6);
}
