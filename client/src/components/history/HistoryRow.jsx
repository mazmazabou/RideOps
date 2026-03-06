import { useState } from 'react';
import StatusBadge from '../ui/StatusBadge';
import { formatDate, formatTime, formatDateTime } from '../../utils/formatters';

export default function HistoryRow({ ride, index }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="history-row" onClick={() => setExpanded(!expanded)}>
      <div className="history-row__main">
        <div className="history-row__left">
          <div className="history-row__route">
            {ride.pickupLocation} <i className="ti ti-arrow-right text-xs" /> {ride.dropoffLocation}
          </div>
          <div className="history-row__meta">
            {formatDate(ride.requestedTime)} &middot; {formatTime(ride.requestedTime)}
          </div>
        </div>
        <StatusBadge status={ride.status} />
      </div>
      <div className={`history-row__detail${expanded ? ' expanded' : ''}`} id={`history-detail-${index}`}>
        <div>Requested: {formatDateTime(ride.requestedTime)}</div>
        {ride.notes && <div>Notes: {ride.notes}</div>}
      </div>
    </div>
  );
}
