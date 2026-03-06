import React, { useMemo } from 'react';
import EmptyState from '../shared/EmptyState.jsx';
import { resolveColor } from '../constants';

/**
 * RouteDemandMatrixWidget -- origin-destination heatmap table.
 *
 * @param {{ matrixData: Array<{pickup_location: string, dropoff_location: string, count: number}> }} props
 */
export default function RouteDemandMatrixWidget({ matrixData }) {
  const { origins, destinations, countMap, maxCount } = useMemo(() => {
    if (!matrixData || !matrixData.length) {
      return { origins: [], destinations: [], countMap: {}, maxCount: 0 };
    }

    // Tally counts per origin and destination
    const originTotals = {};
    const destTotals = {};
    const map = {};

    matrixData.forEach(({ pickup_location, dropoff_location, count }) => {
      const c = parseInt(count, 10) || 0;
      originTotals[pickup_location] = (originTotals[pickup_location] || 0) + c;
      destTotals[dropoff_location] = (destTotals[dropoff_location] || 0) + c;
      const key = `${pickup_location}||${dropoff_location}`;
      map[key] = (map[key] || 0) + c;
    });

    // Top 8 origins and destinations by total volume
    const topOrigins = Object.entries(originTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);

    const topDests = Object.entries(destTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);

    let max = 0;
    topOrigins.forEach((o) => {
      topDests.forEach((d) => {
        const v = map[`${o}||${d}`] || 0;
        if (v > max) max = v;
      });
    });

    return { origins: topOrigins, destinations: topDests, countMap: map, maxCount: max };
  }, [matrixData]);

  if (!origins.length || !destinations.length) {
    return (
      <EmptyState
        icon="grid-dots"
        title="No route data"
        message="No origin-destination data available for the selected period."
      />
    );
  }

  const baseColor = resolveColor('var(--color-primary)') || '#4682B4';

  function shorten(name) {
    if (!name) return '';
    return name.length > 16 ? name.slice(0, 14) + '\u2026' : name;
  }

  function cellBg(count) {
    if (!count || maxCount === 0) return 'transparent';
    const intensity = Math.max(0.08, count / maxCount);
    // Convert hex to rgb for rgba
    let hex = baseColor.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${intensity})`;
  }

  return (
    <div className="route-demand-matrix">
      <div className="ro-table-wrap">
        <table className="ro-table ro-table--matrix">
          <thead>
            <tr>
              <th></th>
              {destinations.map((d) => (
                <th key={d} title={d} className="text-sm text-nowrap">
                  {shorten(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {origins.map((o) => (
              <tr key={o}>
                <td
                  title={o}
                  className="fw-600 text-nowrap"
                  style={{ fontSize: '0.8rem' }}
                >
                  {shorten(o)}
                </td>
                {destinations.map((d) => {
                  const val = countMap[`${o}||${d}`] || 0;
                  return (
                    <td
                      key={d}
                      className="text-center"
                      style={{
                        background: cellBg(val),
                        fontWeight: val > 0 ? 600 : 400,
                        color: val > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                        minWidth: 40,
                      }}
                    >
                      {val || '\u2014'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-sm mt-8 text-center" style={{ color: 'var(--text-muted)' }}>
        Top 8 origins x top 8 destinations. Darker = higher volume.
      </div>
    </div>
  );
}
