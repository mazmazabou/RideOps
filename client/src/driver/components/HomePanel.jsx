import ClockButton from './ClockButton';
import AvailableRidesList from './AvailableRidesList';

export default function HomePanel({ isActive, employee, rides, vehicles, userId, available, onRefresh }) {
  if (!isActive) {
    return (
      <div className="flex-col items-center justify-center text-center" style={{ padding: '80px 24px' }}>
        <i className="ti ti-plug-off text-muted mb-16" style={{ fontSize: 48 }} />
        <div className="fw-700 text-18 mb-8">You're Clocked Out</div>
        <ClockButton isActive={false} employee={employee} rides={rides} userId={userId} onRefresh={onRefresh} />
        <div className="text-sm text-muted">Clock in to see available rides</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-8 mb-16">
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--status-completed)', display: 'inline-block' }} />
        <span className="fw-700 text-14">You're Online</span>
      </div>
      <ClockButton isActive={true} employee={employee} rides={rides} userId={userId} onRefresh={onRefresh} />
      <AvailableRidesList rides={available} onRefresh={onRefresh} />
    </>
  );
}
