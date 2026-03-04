import React from 'react';

/**
 * KPISingleWidget -- renders a single KPI card that fills its entire grid cell.
 *
 * Props:
 *   value      - string: the formatted metric value (e.g. "1,234", "92.3%", "4/6")
 *   label      - string: the metric label (e.g. "Total Rides")
 *   icon       - string: Tabler icon class (e.g. "ti ti-car")
 *   colorClass - string: border-top color class (e.g. "kpi-card--good", "kpi-card--neutral")
 *   ring       - object|null: optional conic-gradient ring config { percent, color }
 */
export default function KPISingleWidget({ value, label, icon, colorClass, ring }) {
  return (
    <div className={`kpi-single ${colorClass || ''}`}>
      {ring ? (
        <div className="kpi-single__ring" style={{
          background: `conic-gradient(${ring.color} ${ring.percent * 3.6}deg, #e9ecef ${ring.percent * 3.6}deg)`,
        }}>
          <div className="kpi-single__ring-inner">
            {value}
          </div>
        </div>
      ) : (
        <div className="kpi-single__value">{value}</div>
      )}
      <div className="kpi-single__label">
        <i className={icon} />
        <span>{label}</span>
      </div>
    </div>
  );
}
