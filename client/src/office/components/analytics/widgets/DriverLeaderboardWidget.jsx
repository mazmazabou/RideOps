import React, { useState, useMemo } from 'react';

function getRateStyle(rate) {
  if (rate >= 85) return { color: '#2fb344' };
  if (rate >= 70) return { color: '#f59f00' };
  return { color: '#d63939' };
}

export default function DriverLeaderboardWidget({ drivers }) {
  const [sortKey, setSortKey] = useState('completed');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    if (!drivers || drivers.length === 0) return [];
    return [...drivers].sort((a, b) => {
      const av = a[sortKey] || 0;
      const bv = b[sortKey] || 0;
      return sortAsc ? av - bv : bv - av;
    });
  }, [drivers, sortKey, sortAsc]);

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

  if (!drivers || drivers.length === 0) {
    return (
      <div className="ro-empty ao-empty">
        <i className="ti ti-steering-wheel ao-empty-icon" />
        No driver data available
      </div>
    );
  }

  return (
    <div className="ao-table-wrap">
      <table className="ao-table">
        <thead>
          <tr>
            <th className="ao-th" onClick={() => handleSort('driverName')}>
              Driver{sortIcon('driverName')}
            </th>
            <th className="ao-th ao-th--right" onClick={() => handleSort('completed')}>
              Rides{sortIcon('completed')}
            </th>
            <th className="ao-th ao-th--right" onClick={() => handleSort('completionRate')}>
              Completion{sortIcon('completionRate')}
            </th>
            <th className="ao-th ao-th--right" onClick={() => handleSort('punctualityRate')}>
              On-Time{sortIcon('punctualityRate')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((driver, i) => (
            <tr key={i}>
              <td className="ao-td fw-500">
                {driver.driverName || 'Unknown'}
              </td>
              <td className="ao-td ao-td--right ao-td--bold">
                {(driver.completed || 0).toLocaleString()}
              </td>
              <td className="ao-td ao-td--right ao-td--bold" style={getRateStyle(driver.completionRate || 0)}>
                {(driver.completionRate || 0).toFixed(1)}%
              </td>
              <td className="ao-td ao-td--right ao-td--bold" style={getRateStyle(driver.punctualityRate || 0)}>
                {(driver.punctualityRate || 0).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
