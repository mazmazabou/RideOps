import { useRef } from 'react';
import StatusPill from './StatusPill';

const PILLS = [
  { status: 'all', label: 'All' },
  { status: 'pending', label: 'Pending' },
  { status: 'approved', label: 'Approved' },
  { status: 'scheduled', label: 'Scheduled' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'completed', label: 'Completed' },
  { status: 'no_show', label: 'No-Show' },
  { status: 'cancelled', label: 'Cancelled' },
  { status: 'denied', label: 'Denied' },
];

export default function FilterBar({
  statusFilter, onStatusChange,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  onSearchChange,
}) {
  const searchTimer = useRef(null);

  const handlePillClick = (status) => {
    onStatusChange(prev => {
      const next = new Set(prev);
      if (status === 'all') {
        return new Set(['all']);
      }
      next.delete('all');
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      if (next.size === 0) return new Set(['all']);
      return next;
    });
  };

  const handleSearch = (e) => {
    clearTimeout(searchTimer.current);
    const val = e.target.value;
    searchTimer.current = setTimeout(() => onSearchChange(val), 300);
  };

  return (
    <div className="filter-bar" id="rides-filter-bar">
      {PILLS.map(p => (
        <StatusPill
          key={p.status}
          status={p.status}
          label={p.label}
          active={statusFilter.has(p.status)}
          onClick={handlePillClick}
        />
      ))}
      <div className="flex-1" />
      <input
        type="date"
        id="rides-date-from"
        className="ro-input"
        style={{ width: 'auto' }}
        title="From date"
        value={dateFrom}
        onChange={e => onDateFromChange(e.target.value)}
      />
      <input
        type="date"
        id="rides-date-to"
        className="ro-input"
        style={{ width: 'auto' }}
        title="To date"
        value={dateTo}
        onChange={e => onDateToChange(e.target.value)}
      />
      <input
        type="text"
        id="ride-filter-input"
        className="ro-input"
        placeholder="Search..."
        style={{ maxWidth: '200px' }}
        onChange={handleSearch}
      />
    </div>
  );
}
