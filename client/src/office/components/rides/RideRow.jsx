import { statusLabel } from '../../../utils/status';
import { formatDateTime } from '../../../utils/formatters';

function abbreviateLocation(location) {
  if (!location) return '?';
  const match = location.match(/\(([^)]+)\)\s*$/);
  if (match) return match[1];
  return location.length > 20 ? location.substring(0, 20) + '\u2026' : location;
}

export default function RideRow({ ride, selected, employees, onToggleSelect, onRowClick, onApprove }) {
  const driverName = ride.assignedDriverId
    ? (employees.find(e => e.id === ride.assignedDriverId)?.name || '\u2014')
    : '\u2014';

  return (
    <tr className="cursor-pointer" onClick={(e) => {
      if (e.target.closest('.ro-btn') || e.target.closest('.clickable-name') || e.target.closest('input[type="checkbox"]')) return;
      onRowClick(ride);
    }}>
      <td onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          className="ride-row-cb"
          checked={selected}
          onChange={() => onToggleSelect(ride.id)}
        />
      </td>
      <td>{formatDateTime(ride.requestedTime)}</td>
      <td>
        <span className="clickable-name">{ride.riderName || '\u2014'}</span>
      </td>
      <td title={`${ride.pickupLocation || ''} → ${ride.dropoffLocation || ''}`}>
        {abbreviateLocation(ride.pickupLocation)} → {abbreviateLocation(ride.dropoffLocation)}
      </td>
      <td>
        <span className={`status-badge status-badge--${ride.status}`}>
          {statusLabel(ride.status)}
        </span>
      </td>
      <td>{ride.assignedDriverId ? driverName : '\u2014'}</td>
      <td onClick={e => e.stopPropagation()}>
        {ride.status === 'pending' && (
          <button
            className="ro-btn ro-btn--success ro-btn--sm"
            onClick={() => onApprove(ride)}
          >
            Approve
          </button>
        )}
      </td>
    </tr>
  );
}
