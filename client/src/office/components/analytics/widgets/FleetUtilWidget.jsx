import React, { useMemo } from 'react';
import { getCampusPalette, getCampusSlug } from '../../../../utils/campus';

export default function FleetUtilWidget({ data }) {
  const palette = getCampusPalette(getCampusSlug());
  const vehicles = data?.vehicles || [];
  const summary = data?.summary || {};

  const activeVehicles = useMemo(() => {
    return vehicles.filter((v) => v.status !== 'retired');
  }, [vehicles]);

  const maxRides = useMemo(() => {
    if (activeVehicles.length === 0) return 1;
    return Math.max(1, ...activeVehicles.map((v) => v.totalRides || 0));
  }, [activeVehicles]);

  if (!data || activeVehicles.length === 0) {
    return (
      <div className="ro-empty ao-empty">
        <i className="ti ti-bus ao-empty-icon" />
        No fleet utilization data available
      </div>
    );
  }

  // Sort by totalRides descending
  const sorted = [...activeVehicles].sort((a, b) => (b.totalRides || 0) - (a.totalRides || 0));

  return (
    <div>
      <div className="flex-col" style={{ gap: '0.5rem' }}>
        {sorted.map((vehicle, i) => {
          const rides = vehicle.totalRides || 0;
          const pct = maxRides > 0 ? (rides / maxRides) * 100 : 0;
          const color = palette[i % palette.length];

          return (
            <div key={vehicle.name + '-' + i} className="ao-vehicle-row">
              <div className="ao-vehicle-name" title={vehicle.name}>
                {vehicle.name}
              </div>
              <div className="ao-progress-track">
                <div
                  style={{
                    height: '100%',
                    width: pct + '%',
                    backgroundColor: color,
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                    minWidth: rides > 0 ? '4px' : '0',
                  }}
                />
              </div>
              <div className="ao-vehicle-count">
                {rides}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      <div className="ao-summary-row ao-summary-row--bordered">
        <span>Total Fleet: <strong style={{ color: 'var(--color-text, #1f2937)' }}>{summary.totalFleet || 0}</strong></span>
        <span>Available: <strong style={{ color: '#2fb344' }}>{summary.available || 0}</strong></span>
        {summary.overdueCount > 0 && (
          <span>Overdue Maintenance: <strong style={{ color: '#d63939' }}>{summary.overdueCount}</strong></span>
        )}
      </div>
    </div>
  );
}
