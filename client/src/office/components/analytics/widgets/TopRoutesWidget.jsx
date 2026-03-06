import React, { useState, useMemo } from 'react';

function getCompletionStyle(rate) {
  if (rate >= 85) return { color: '#2fb344' };
  if (rate >= 70) return { color: '#f59f00' };
  return { color: '#d63939' };
}

export default function TopRoutesWidget({ routes }) {
  const [sortKey, setSortKey] = useState('total');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    if (!routes || routes.length === 0) return [];
    const top = routes.slice(0, 10);
    return [...top].sort((a, b) => {
      const av = a[sortKey] || 0;
      const bv = b[sortKey] || 0;
      return sortAsc ? av - bv : bv - av;
    });
  }, [routes, sortKey, sortAsc]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function sortIcon(key) {
    if (sortKey !== key) return '';
    return sortAsc ? ' \u25B2' : ' \u25BC';
  }

  if (!routes || routes.length === 0) {
    return (
      <div className="ro-empty ao-empty">
        <i className="ti ti-route ao-empty-icon" />
        No route data available
      </div>
    );
  }

  return (
    <div className="ao-table-wrap">
      <table className="ao-table">
        <thead>
          <tr>
            <th className="ao-th">Route</th>
            <th className="ao-th ao-th--right" onClick={() => handleSort('total')}>
              Rides{sortIcon('total')}
            </th>
            <th className="ao-th ao-th--right" onClick={() => handleSort('completionRate')}>
              Completion{sortIcon('completionRate')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((route, i) => (
            <tr key={i}>
              <td className="ao-td">
                <span className="fw-500">{route.pickupLocation}</span>
                <span className="text-muted" style={{ margin: '0 0.25rem' }}>&rarr;</span>
                <span>{route.dropoffLocation}</span>
              </td>
              <td className="ao-td ao-td--right ao-td--bold">
                {(route.total || 0).toLocaleString()}
              </td>
              <td className="ao-td ao-td--right ao-td--bold" style={getCompletionStyle(route.completionRate || 0)}>
                {(route.completionRate || 0).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
