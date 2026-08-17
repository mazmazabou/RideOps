import { useMemo } from 'react';
import RideStrip from './RideStrip';
import { hexToRgb } from '../../../utils/campus';
import { campusTimeParts } from '../../../utils/tz';

export default function DriverRow({
  driver, driverRides, driverShifts, paletteColor,
  cols, startHour, overnight, gridColStyle, isActive,
  isTardy, tardyMinutes, onRideClick,
}) {
  const dotClass = isActive ? 'time-grid__driver-dot--online' : 'time-grid__driver-dot--offline';
  const tardyClass = isTardy ? ' time-grid__row--tardy' : '';
  const rowOpacity = (!isActive && !isTardy) ? 0.5 : undefined;

  const bandColor = paletteColor ? hexToRgb(paletteColor) : 'var(--color-secondary-rgb, 210,180,140)';

  // Build hour cells with rides — hours in campus time, axis wraps mod-24
  // when the service window crosses midnight.
  const hourCells = useMemo(() => {
    const cells = [];
    for (let i = 0; i < cols; i++) {
      const h = (startHour + i) % 24;
      const ridesInHour = driverRides.filter(r =>
        campusTimeParts(r.requestedTime).h === h
      );
      cells.push(
        <div key={i} className="relative" style={{ borderRight: '1px solid var(--color-border-light)' }}>
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

      // Map wall-clock hours onto axis offsets (wrapping past midnight when
      // the board shows an overnight window).
      const toOffset = (frac) => {
        let o = frac - startHour;
        if (overnight && o < 0) o += 24;
        return o;
      };
      let startOff = toOffset(startFrac);
      let endOff = toOffset(endFrac);
      if (endOff < startOff) endOff = cols; // shift itself crosses the wrap

      const visStart = Math.max(startOff, 0);
      const visEnd = Math.min(endOff, cols);
      if (visEnd <= visStart) return null;

      const leftFrac = (visStart / cols).toFixed(6);
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
    [driverShifts, startHour, cols, overnight, bandColor]
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
