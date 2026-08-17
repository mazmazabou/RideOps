import { useState, useEffect } from 'react';
import { campusTimeParts } from '../../../utils/tz';

export default function NowLine({ startHour, cols, overnight }) {
  const [nowFraction, setNowFraction] = useState(null);

  useEffect(() => {
    const update = () => {
      const p = campusTimeParts(new Date());
      let offset = p.h + p.min / 60 - startHour;
      if (overnight && offset < 0) offset += 24;
      if (offset >= 0 && offset < cols) {
        setNowFraction(offset / cols);
      } else {
        setNowFraction(null);
      }
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [startHour, cols, overnight]);

  if (nowFraction === null) return null;

  return (
    <div
      className="time-grid__now-line"
      style={{ left: `calc(100px + (100% - 100px) * ${nowFraction})` }}
    />
  );
}
