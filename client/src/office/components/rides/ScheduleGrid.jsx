import { useState, useMemo } from 'react';
import RideChip from './RideChip';

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getWeekDates(anchor) {
  const date = new Date(anchor);
  const jsDay = date.getDay(); // 0=Sun
  const diffToMonday = (jsDay + 6) % 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - diffToMonday);
  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    return d;
  });
}

function formatShortDate(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function generateTimeSlots(startHour, endHour) {
  const slots = [];
  for (let hour = startHour; hour < endHour; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  slots.push(`${String(endHour).padStart(2, '0')}:00`);
  return slots;
}

function getSlotInfo(date) {
  const hour = date.getHours();
  const minute = date.getMinutes();
  let slotMinute = '00';
  let offset = 'start';
  if (minute < 15) {
    slotMinute = '00'; offset = 'start';
  } else if (minute < 30) {
    slotMinute = '00'; offset = 'mid';
  } else if (minute < 45) {
    slotMinute = '30'; offset = 'start';
  } else {
    slotMinute = '30'; offset = 'mid';
  }
  return { slot: `${String(hour).padStart(2, '0')}:${slotMinute}`, offset };
}

export default function ScheduleGrid({ filteredRides, opsConfig, onRideClick }) {
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());

  const opDays = useMemo(() => {
    return String(opsConfig?.operating_days || '0,1,2,3,4,5,6').split(',').map(Number).sort((a, b) => a - b);
  }, [opsConfig]);

  const startHour = parseInt(String(opsConfig?.service_hours_start || '08:00').split(':')[0], 10);
  const endHour = parseInt(String(opsConfig?.service_hours_end || '19:00').split(':')[0], 10);

  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);
  const days = opDays.map(i => ALL_DAYS[i]);
  const activeDates = opDays.map(i => weekDates[i]);
  const timeSlots = useMemo(() => generateTimeSlots(startHour, endHour), [startHour, endHour]);

  const weekLabel = useMemo(() => {
    const start = weekDates[0];
    const end = weekDates[6];
    return `Week of ${formatShortDate(start)} - ${formatShortDate(end)}`;
  }, [weekDates]);

  const slotMap = useMemo(() => {
    const map = {};
    if (activeDates.length === 0) return map;

    const weekStart = new Date(activeDates[0]);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(activeDates[activeDates.length - 1]);
    weekEnd.setHours(23, 59, 59, 999);

    filteredRides.forEach(ride => {
      if (!ride.requestedTime) return;
      const date = new Date(ride.requestedTime);
      if (isNaN(date.getTime())) return;
      if (date < weekStart || date > weekEnd) return;

      const jsDay = date.getDay();
      const ourDay = (jsDay + 6) % 7;
      const colIdx = opDays.indexOf(ourDay);
      if (colIdx < 0) return;

      const hour = date.getHours();
      const minute = date.getMinutes();
      if (hour < startHour || hour > endHour || (hour === endHour && minute > 0)) return;

      const { slot, offset } = getSlotInfo(date);
      const key = `${slot}-${colIdx}`;
      if (!map[key]) map[key] = [];
      map[key].push({ ...ride, _offset: offset });
    });
    return map;
  }, [filteredRides, activeDates, opDays, startHour, endHour]);

  const changeWeek = (delta) => {
    setWeekAnchor(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta * 7);
      return next;
    });
  };

  const hasRides = Object.keys(slotMap).length > 0;

  return (
    <div id="rides-calendar-view-container" className="ro-section">
      <div className="flex items-center justify-between mb-16">
        <button className="ro-btn ro-btn--outline ro-btn--sm" id="ride-week-prev" onClick={() => changeWeek(-1)}>
          <i className="ti ti-chevron-left"></i> Prev Week
        </button>
        <span className="text-sm fw-600" id="ride-week-label">{weekLabel}</span>
        <button className="ro-btn ro-btn--outline ro-btn--sm" id="ride-week-next" onClick={() => changeWeek(1)}>
          Next Week <i className="ti ti-chevron-right"></i>
        </button>
      </div>
      <div id="ride-schedule-grid">
        {!hasRides ? (
          <div className="ro-empty">
            <i className="ti ti-calendar-off"></i>
            <div className="ro-empty__title">No rides on the calendar</div>
            <div className="ro-empty__message">Approved and scheduled rides will appear here.</div>
          </div>
        ) : (
          <table className="grid-table ride-schedule-table">
            <thead>
              <tr>
                <th>Time</th>
                {days.map((day, idx) => (
                  <th key={idx}>{day} ({formatShortDate(activeDates[idx])})</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map(slot => (
                <tr key={slot}>
                  <td>{slot}</td>
                  {days.map((_, colIdx) => {
                    const rides = slotMap[`${slot}-${colIdx}`] || [];
                    return (
                      <td key={colIdx}>
                        {rides.map(ride => (
                          <RideChip
                            key={ride.id}
                            ride={ride}
                            offset={ride._offset}
                            onClick={onRideClick}
                          />
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
