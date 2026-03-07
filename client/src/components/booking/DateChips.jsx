import { useMemo } from 'react';
import { jsDateToOurDay } from '../../utils/formatters';

export default function DateChips({ opsConfig, selectedDate, onSelect }) {
  const chips = useMemo(() => {
    const opDays = opsConfig
      ? String(opsConfig.operating_days || '0,1,2,3,4,5,6').split(',').map(Number)
      : [0, 1, 2, 3, 4, 5, 6];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = [];
    let count = 0;

    for (let i = 0; i < 30 && count < 7; i++) {
      const test = new Date(today);
      test.setDate(test.getDate() + i);
      const dow = test.getDay();
      if (!opDays.includes(jsDateToOurDay(dow))) continue;

      let label;
      if (count === 0 && test.getTime() === today.getTime() && dow >= 1 && dow <= 5) {
        label = 'Today';
      } else if (count <= 1) {
        const tmrw = new Date(today);
        tmrw.setDate(tmrw.getDate() + 1);
        if (test.getTime() === tmrw.getTime()) label = 'Tomorrow';
        else label = test.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      } else {
        label = test.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }

      const iso = test.getFullYear() + '-' +
        String(test.getMonth() + 1).padStart(2, '0') + '-' +
        String(test.getDate()).padStart(2, '0');

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
