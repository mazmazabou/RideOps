import { useMemo } from 'react';
import { jsDateToOurDay } from '../../utils/formatters';
import { campusToday, addDays } from '../../utils/tz';

export default function DateChips({ opsConfig, selectedDate, onSelect }) {
  const chips = useMemo(() => {
    const opDays = opsConfig
      ? String(opsConfig.operating_days || '0,1,2,3,4,5,6').split(',').map(Number)
      : [0, 1, 2, 3, 4, 5, 6];

    // Overnight windows (e.g. 22:00-03:00) spill into the NEXT calendar day:
    // a Sunday 1 AM ride is the tail of Saturday-night service, so the day
    // after an operating day must also be offered.
    const [sH, sM] = String(opsConfig?.service_hours_start || '08:00').split(':').map(Number);
    const [eH, eM] = String(opsConfig?.service_hours_end || '19:00').split(':').map(Number);
    const overnight = (eH * 60 + (eM || 0)) < (sH * 60 + (sM || 0));

    const today = campusToday();
    const result = [];
    let count = 0;

    for (let i = 0; i < 30 && count < 7; i++) {
      const iso = addDays(today, i);
      const [y, m, d] = iso.split('-').map(Number);
      const asDate = new Date(Date.UTC(y, m - 1, d));
      const ourDay = jsDateToOurDay(asDate.getUTCDay());
      const prevDay = (ourDay + 6) % 7;
      const bookable = opDays.includes(ourDay) || (overnight && opDays.includes(prevDay));
      if (!bookable) continue;

      let label;
      if (iso === today) label = 'Today';
      else if (iso === addDays(today, 1)) label = 'Tomorrow';
      else label = asDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

      result.push({ label, value: iso });
      count++;
    }
    return result;
  }, [opsConfig]);

  return (
    <div className="date-chips" id="date-chips">
      {chips.map(chip => (
        <button
          key={chip.value}
          type="button"
          className={`filter-pill${selectedDate === chip.value ? ' active' : ''}`}
          data-date={chip.value}
          onClick={() => onSelect(chip.value)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
