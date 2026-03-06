import { useState, useMemo, useCallback, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { assignRide, reassignRide, unassignRide } from '../../../api';
import { getCampusPalette, getCampusSlug } from '../../../utils/campus';
import DriverRow from './DriverRow';
import RideStrip from './RideStrip';
import NowLine from './NowLine';

export default function DispatchGrid({
  rides, todayStatus, employees, shifts, opsConfig,
  onRideClick, onRefresh,
}) {
  const { showToast } = useToast();
  const isDragging = useRef(false);

  const today = new Date().toLocaleDateString('en-CA');
  const [selectedDate, setSelectedDate] = useState(today);

  const isToday = selectedDate === today;
  const selectedDateObj = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  // Time axis
  const sH = parseInt(String(opsConfig?.service_hours_start || '08:00').split(':')[0], 10);
  const eH = parseInt(String(opsConfig?.service_hours_end || '19:00').split(':')[0], 10);
  const startHour = Math.max(0, sH - 1);
  const cols = Math.min(24, eH + 1) - startHour;
  const gridColStyle = `100px repeat(${cols}, 1fr)`;

  // Hour labels
  const hourLabels = useMemo(() => {
    const labels = [];
    for (let h = startHour; h < startHour + cols; h++) {
      if (h === 0) labels.push('12a');
      else if (h < 12) labels.push(h + 'a');
      else if (h === 12) labels.push('12p');
      else labels.push((h - 12) + 'p');
    }
    return labels;
  }, [startHour, cols]);

  // Driver color map
  const driverColorMap = useMemo(() => {
    const slug = getCampusSlug();
    const palette = getCampusPalette(slug);
    const sortedIds = employees.map(d => d.id).filter(Boolean).sort();
    const map = {};
    sortedIds.forEach((id, i) => { map[id] = palette[i % palette.length]; });
    return map;
  }, [employees]);

  // Day rides (filter for selected date, exclude denied/cancelled)
  const dateStr = selectedDate;
  const dayRides = useMemo(() =>
    rides.filter(r =>
      r.requestedTime?.startsWith(dateStr) &&
      !['denied', 'cancelled'].includes(r.status)
    ),
    [rides, dateStr]
  );

  // Day of week + week start for shift matching
  const dayOfWeek = useMemo(() => (selectedDateObj.getDay() + 6) % 7, [selectedDateObj]);
  const mondayStr = useMemo(() => getMondayOfWeek(selectedDateObj), [selectedDateObj]);

  // Classify drivers
  const { activeDrivers, inactiveDrivers } = useMemo(() => {
    const active = [];
    const inactive = [];
    employees.forEach(e => {
      if (e.active) active.push(e);
      else inactive.push(e);
    });
    return { activeDrivers: active, inactiveDrivers: inactive };
  }, [employees]);

  // Filter shifts for selected day
  const getDriverShifts = useCallback((driverId) =>
    shifts.filter(s =>
      s.employeeId === driverId &&
      s.dayOfWeek === dayOfWeek &&
      (!s.weekStart || s.weekStart.slice(0, 10) === mondayStr)
    ),
    [shifts, dayOfWeek, mondayStr]
  );

  // Tardiness detection
  const getTardyInfo = useCallback((driver) => {
    if (driver.active || !isToday) return { isTardy: false, tardyMinutes: 0 };
    const status = todayStatus.find(d => d.id === driver.id);
    if (status?.todayClockEvents?.length > 0) return { isTardy: false, tardyMinutes: 0 };

    const driverShifts = getDriverShifts(driver.id);
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();

    for (const s of driverShifts) {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      if (nowMins >= (sh * 60 + sm) && nowMins < (eh * 60 + em)) {
        return { isTardy: true, tardyMinutes: nowMins - (sh * 60 + sm) };
      }
    }
    return { isTardy: false, tardyMinutes: 0 };
  }, [isToday, todayStatus, getDriverShifts]);

  // Unassigned approved rides
  const unassignedRides = useMemo(() =>
    dayRides.filter(r => r.status === 'approved' && !r.assignedDriverId),
    [dayRides]
  );

  // Drag-and-drop handlers (delegated to grid)
  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleDragOver = useCallback((e) => {
    const row = e.target.closest('.time-grid__row');
    if (!row) return;
    const isActiveDriver = row.dataset.driverId && row.dataset.active === 'true';
    const isUnassigned = row.dataset.rowType === 'unassigned';
    if (isActiveDriver || isUnassigned) e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((e) => {
    const row = e.target.closest('.time-grid__row');
    if (!row) return;
    const isActiveDriver = row.dataset.driverId && row.dataset.active === 'true';
    const isUnassigned = row.dataset.rowType === 'unassigned';
    if (isActiveDriver || isUnassigned) row.classList.add('time-grid__row--drop-hover');
  }, []);

  const handleDragLeave = useCallback((e) => {
    const row = e.target.closest('.time-grid__row');
    if (!row) return;
    if (!row.contains(e.relatedTarget)) row.classList.remove('time-grid__row--drop-hover');
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    // Clean up drop visual states
    const grid = e.currentTarget;
    grid.querySelectorAll('.time-grid__ride-strip--dragging').forEach(el =>
      el.classList.remove('time-grid__ride-strip--dragging')
    );
    grid.querySelectorAll('.time-grid__row--drop-ready, .time-grid__row--drop-hover').forEach(el =>
      el.classList.remove('time-grid__row--drop-ready', 'time-grid__row--drop-hover')
    );

    const row = e.target.closest('.time-grid__row');
    if (!row) return;
    const isActiveDriver = row.dataset.driverId && row.dataset.active === 'true';
    const isUnassigned = row.dataset.rowType === 'unassigned';
    if (!isActiveDriver && !isUnassigned) return;

    let data;
    try { data = JSON.parse(e.dataTransfer.getData('application/x-ride')); } catch { return; }
    const { rideId, rideStatus, sourceDriverId, sourceRowType } = data;
    const targetDriverId = row.dataset.driverId || '';

    try {
      // Unassign
      if (isUnassigned && sourceRowType === 'driver') {
        await unassignRide(rideId);
        showToast('Ride moved to unassigned', 'success');
        onRefresh();
        return;
      }

      // No-ops
      if (isUnassigned && sourceRowType === 'unassigned') return;
      if (isActiveDriver && targetDriverId === sourceDriverId) return;

      // Assign or reassign
      if (rideStatus === 'approved') {
        await assignRide(rideId, targetDriverId);
      } else if (rideStatus === 'scheduled') {
        await reassignRide(rideId, targetDriverId);
      } else {
        return;
      }
      const driverName = employees.find(emp => emp.id === targetDriverId)?.name || 'driver';
      showToast(`Ride assigned to ${driverName}`, 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Assignment failed', 'error');
    }
  }, [employees, showToast, onRefresh]);

  // Check if there's any content
  const hasContent = activeDrivers.length > 0 || unassignedRides.length > 0 || inactiveDrivers.length > 0;

  return (
    <div>
      <div className="ro-section__header flex items-center gap-12">
        <h3 className="ro-section__title" style={{ margin: 0 }}>
          <i className="ti ti-calendar-time" /> Schedule
        </h3>
        <input
          type="date"
          id="dispatch-date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value || today)}
          className="ro-input text-13"
          style={{ width: 160 }}
        />
      </div>

      {!hasContent ? (
        <div className="ro-empty">
          <i className="ti ti-calendar-off" style={{ fontSize: 32, opacity: 0.4 }} />
          <div className="ro-empty__title">No activity</div>
          <div className="ro-empty__message">No drivers or rides for this date.</div>
        </div>
      ) : (
        <div
          className="time-grid"
          id="dispatch-grid"
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Header row */}
          <div className="time-grid__header" style={{ gridTemplateColumns: gridColStyle }}>
            <div className="time-grid__time-label fw-700">Driver</div>
            {hourLabels.map((label, i) => (
              <div key={i} className="time-grid__time-label">{label}</div>
            ))}
          </div>

          {/* Active drivers */}
          {activeDrivers.map(driver => {
            const driverRides = dayRides.filter(r => r.assignedDriverId === driver.id);
            const driverShifts = getDriverShifts(driver.id);
            const { isTardy, tardyMinutes } = getTardyInfo(driver);
            return (
              <DriverRow
                key={driver.id}
                driver={driver}
                driverRides={driverRides}
                driverShifts={driverShifts}
                paletteColor={driverColorMap[driver.id] || '#94A3B8'}
                cols={cols}
                startHour={startHour}
                gridColStyle={gridColStyle}
                isActive={true}
                isTardy={isTardy}
                tardyMinutes={tardyMinutes}
                onRideClick={onRideClick}
              />
            );
          })}

          {/* Unassigned row */}
          <div className="time-grid__separator">
            {unassignedRides.length ? `Unassigned (${unassignedRides.length})` : 'Unassigned'}
          </div>
          <div
            className="time-grid__row"
            data-row-type="unassigned"
            style={{ gridTemplateColumns: gridColStyle }}
          >
            <div className="time-grid__driver">
              <span className="time-grid__driver-dot time-grid__driver-dot--offline" />
              Unassigned
            </div>
            {Array.from({ length: cols }, (_, i) => {
              const h = startHour + i;
              const ridesInHour = unassignedRides.filter(r => {
                const rideHour = new Date(r.requestedTime).getHours();
                return rideHour === h;
              });
              return (
                <div key={h} className="relative" style={{ borderRight: '1px solid var(--color-border-light)' }}>
                  {ridesInHour.map(r => (
                    <RideStrip
                      key={r.id}
                      ride={r}
                      driverColor={undefined}
                      onClick={onRideClick}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Off-shift drivers */}
          {inactiveDrivers.length > 0 && (
            <>
              <div className="time-grid__separator">Off Shift ({inactiveDrivers.length})</div>
              {inactiveDrivers.map(driver => {
                const driverRides = dayRides.filter(r => r.assignedDriverId === driver.id);
                const driverShifts = getDriverShifts(driver.id);
                const { isTardy, tardyMinutes } = getTardyInfo(driver);
                return (
                  <DriverRow
                    key={driver.id}
                    driver={driver}
                    driverRides={driverRides}
                    driverShifts={driverShifts}
                    paletteColor={driverColorMap[driver.id] || '#94A3B8'}
                    cols={cols}
                    startHour={startHour}
                    gridColStyle={gridColStyle}
                    isActive={false}
                    isTardy={isTardy}
                    tardyMinutes={tardyMinutes}
                    onRideClick={onRideClick}
                  />
                );
              })}
            </>
          )}

          {/* Now line */}
          {isToday && <NowLine startHour={startHour} cols={cols} />}
        </div>
      )}
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
