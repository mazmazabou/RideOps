import { useModal } from '../../components/ui/Modal';
import { useToast } from '../../contexts/ToastContext';
import { clockIn, clockOut } from '../../api';

export default function ClockButton({ isActive, employee, rides, userId, onRefresh }) {
  const { showModal } = useModal();
  const { showToast } = useToast();

  const handleToggle = async () => {
    if (!employee) return;

    if (isActive) {
      const activeStatuses = ['driver_on_the_way', 'driver_arrived_grace'];
      const assignedStatuses = ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'];
      const activeCount = rides.filter(r => r.assignedDriverId === userId && activeStatuses.includes(r.status)).length;
      const assignedCount = rides.filter(r => r.assignedDriverId === userId && assignedStatuses.includes(r.status)).length;

      let message = 'Are you sure you want to clock out?';
      if (activeCount > 0) {
        message = `You have ${activeCount} active ride${activeCount === 1 ? '' : 's'}. Clock out anyway?`;
      } else if (assignedCount > 0) {
        message = `You still have ${assignedCount} assigned ride${assignedCount === 1 ? '' : 's'}. Clock out anyway?`;
      }

      const confirmed = await showModal({
        title: 'Clock Out',
        body: message,
        confirmLabel: 'Clock Out',
        confirmClass: 'ro-btn--danger',
      });
      if (!confirmed) return;
    }

    try {
      if (isActive) {
        await clockOut(userId);
        showToast('Clocked out', 'success');
      } else {
        await clockIn(userId);
        showToast('Clocked in', 'success');
      }
      onRefresh();
    } catch (e) {
      showToast(e.message || 'Could not update clock status', 'error');
    }
  };

  if (isActive) {
    return (
      <button
        className="ro-btn ro-btn--action ro-btn--full mb-24"
        onClick={handleToggle}
        style={{ background: 'transparent', color: 'var(--status-no-show)', border: '2px solid var(--status-no-show)' }}
      >
        <i className="ti ti-plug-off" /> CLOCK OUT
      </button>
    );
  }

  return (
    <button className="ro-btn ro-btn--primary ro-btn--action ro-btn--full mb-12" onClick={handleToggle} style={{ maxWidth: 320 }}>
      <i className="ti ti-plug" /> CLOCK IN
    </button>
  );
}
