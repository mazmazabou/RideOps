import { useMemo } from 'react';
import RideStrip from './RideStrip';
import { hexToRgb } from '../../../utils/campus';

export default function DriverRow({
  driver, driverRides, driverShifts, paletteColor,
  cols, startHour, gridColStyle, isActive,
  isTardy, tardyMinutes, onRideClick,
}) {
  const dotClass = isActive ? 'time-grid__driver-dot--online' : 'time-grid__driver-dot--offline';
  const tardyClass = isTardy ? ' time-grid__row--tardy' : '';
  const rowOpacity = (!isActive && !isTardy) ? 0.5 : undefined;

  const bandColor = paletteColor ? hexToRgb(paletteColor) : 'var(--color-secondary-rgb, 210,180,140)';

  // Build hour cells with rides
  const hourCells = useMemo(() => {
    const cells = [];
    for (let h = startHour; h < startHour + cols; h++) {
      const ridesInHour = driverRides.filter(r => {
        const rideHour = new Date(r.requestedTime).getHours();
        return rideHour === h;
      });
      cells.push(
        <div key={h} className="relative" style={{ borderRight: '1px solid var(--color-border-light)' }}>
          {ridesInHour.map(r => (
            <RideStrip key={r.id} ride={r} driverColor={paletteColor} onClick={onRideClick} />
          ))}
        </div>
      );
    }
    return cells;
  }, [startHour, cols, driverRides, paletteColor, onRideClick]);

  // Shift bands
  const shiftBands = useMemo(() =>
    driverShifts.map(s => {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      const startFrac = sh + sm / 60;
      const endFrac = eh + em / 60;

      const visStart = Math.max(startFrac, startHour);
      const visEnd = Math.min(endFrac, startHour + cols);
      if (visEnd <= visStart) return null;

      const leftFrac = ((visStart - startHour) / cols).toFixed(6);
      const widthFrac = ((visEnd - visStart) / cols).toFixed(6);

      return (
        <div
          key={s.id}
          className="time-grid__shift-band"
          style={{
            left: `calc(100px + (100% - 100px) * ${leftFrac})`,
            width: `calc((100% - 100px) * ${widthFrac})`,
            background: `rgba(${bandColor}, 0.18)`,
            borderColor: `rgba(${bandColor}, 0.45)`,
          }}
        />
      );
    }).filter(Boolean),
    [driverShifts, startHour, cols, bandColor]
  );

  return (
    <div
      className={`time-grid__row${tardyClass}`}
      data-driver-id={driver.id}
      data-active={String(isActive)}
      style={{ gridTemplateColumns: gridColStyle, opacity: rowOpacity }}
    >
      {shiftBands}
      <div className="time-grid__driver">
        <span className={`time-grid__driver-dot ${dotClass}`} />
        <span>{driver.name}</span>
        {isTardy && tardyMinutes > 0 && (
          <span className="tardy-badge">
            <i className="ti ti-clock-exclamation" />
            {tardyMinutes}m late
          </span>
        )}
      </div>
      {hourCells}
    </div>
  );
}
