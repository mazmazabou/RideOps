import React from 'react';

/**
 * KPICardGrid — renders a flex row of KPI metric cards.
 *
 * @param {Array<{label: string, value: string|number, icon: string, colorClass: string}>} cards
 *   - icon: full Tabler icon class (e.g. "ti ti-chart-bar")
 *   - colorClass: CSS modifier class (e.g. "kpi-card--primary", "kpi-card--good")
 */
export default function KPICardGrid({ cards }) {
  if (!cards || !cards.length) return null;

  return (
    <>
      {cards.map((card, i) => (
        <div key={i} className={`kpi-card ${card.colorClass || ''}`}>
          <div className="kpi-value">{card.value}</div>
          <div className="kpi-label">
            <i className={`ti ${card.icon} mr-4`}></i>
            {card.label}
          </div>
        </div>
      ))}
    </>
  );
}
