import { currentServiceDay, serviceDayOf } from '../../../utils/tz';

export default function KPIBar({ rides, todayStatus, employees, shifts }) {
  const today = currentServiceDay();

  const activeDrivers = todayStatus.filter(e => e.active).length;
  const pendingRides = rides.filter(r => r.status === 'pending').length;
  const inProgress = rides.filter(r =>
    ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(r.status) &&
    r.requestedTime && serviceDayOf(r.requestedTime) === today
  ).length;
  const completedToday = rides.filter(r =>
    r.status === 'completed' && r.requestedTime && serviceDayOf(r.requestedTime) === today
  ).length;

  const tardyToday = todayStatus.filter(d =>
    d.todayClockEvents?.some(ce => ce.tardiness_minutes > 0)
  ).length;

  // Missing: not active, not clocked in today, but currently within a shift window
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const todayDow = (now.getDay() + 6) % 7; // Mon=0
  const monday = getMondayOfWeek(now);

  const missingDrivers = employees.filter(e => {
    if (e.active) return false;
    const status = todayStatus.find(d => d.id === e.id);
    if (status?.todayClockEvents?.length > 0) return false;
    return shifts.some(s =>
      s.employeeId === e.id &&
      s.dayOfWeek === todayDow &&
      (!s.weekStart || s.weekStart.slice(0, 10) === monday) &&
      isWithinShift(s, nowMins)
    );
  }).length;

  return (
    <div className="kpi-bar">
      <KPICard id="dispatch-active-drivers" value={activeDrivers} label="Active Drivers" variant="primary" />
      <KPICard id="dispatch-pending-rides" value={pendingRides} label="Pending" variant="pending" />
      <KPICard id="dispatch-active-rides" value={inProgress} label="In Progress" variant="progress" />
      <KPICard id="dispatch-completed-today" value={completedToday} label="Completed Today" variant="completed" />
      <KPICard id="dispatch-tardy-today" value={tardyToday} label="Tardy Today" variant="tardy" />
      <KPICard id="dispatch-missing-drivers" value={missingDrivers} label="No-Show" variant="warning" />
    </div>
  );
}

function KPICard({ id, value, label, variant }) {
  return (
    <div className={`kpi-card kpi-card--${variant}`}>
      <div className="kpi-card__value" id={id}>{value}</div>
      <div className="kpi-card__label">{label}</div>
    </div>
  );
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function isWithinShift(shift, nowMins) {
  const [sh, sm] = shift.startTime.split(':').map(Number);
  const [eh, em] = shift.endTime.split(':').map(Number);
  return nowMins >= (sh * 60 + sm) && nowMins < (eh * 60 + em);
}
