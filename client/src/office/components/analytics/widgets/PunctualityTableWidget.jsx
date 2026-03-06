import React from 'react';
import SortableTable from '../shared/SortableTable.jsx';
import EmptyState from '../shared/EmptyState.jsx';

const COLUMNS = [
  { key: 'name', label: 'Driver' },
  { key: 'totalClockIns', label: 'Clock-Ins', align: 'center' },
  { key: 'tardyCount', label: 'Tardy', align: 'center' },
  { key: 'onTimePct', label: 'On-Time %', align: 'center' },
  { key: 'avgTardinessMinutes', label: 'Avg Late', align: 'center' },
  { key: 'maxTardinessMinutes', label: 'Max Late', align: 'center' },
  { key: 'missedShifts', label: 'Missed Shifts', align: 'center' },
];

/**
 * PunctualityTableWidget -- sortable table of driver punctuality metrics.
 *
 * @param {{ byDriver: Array<{name: string, totalClockIns: number, tardyCount: number,
 *           avgTardinessMinutes: number, maxTardinessMinutes: number, missedShifts: number}> }} props
 */
export default function PunctualityTableWidget({ byDriver }) {
  if (!byDriver || !byDriver.length) {
    return (
      <EmptyState
        icon="table"
        title="No driver data"
        message="No punctuality data available for the selected period."
      />
    );
  }

  // Pre-compute on-time % for sorting
  const rows = byDriver.map((d) => {
    const total = d.totalClockIns || 0;
    const tardy = d.tardyCount || 0;
    const onTimePct = total > 0 ? (((total - tardy) / total) * 100) : 0;
    return {
      ...d,
      onTimePct: parseFloat(onTimePct.toFixed(1)),
    };
  });

  function renderCell(row, colKey) {
    switch (colKey) {
      case 'name':
        return <span className="fw-600">{row.name}</span>;

      case 'tardyCount': {
        const cls = row.tardyCount === 0 ? 'badge--good' : 'badge--danger';
        return (
          <span className={`ro-badge ${cls}`}>
            {row.tardyCount}
          </span>
        );
      }

      case 'onTimePct': {
        const pct = row.onTimePct;
        let dotClass;
        if (row.tardyCount === 0) dotClass = 'good';
        else if (pct >= 80) dotClass = 'warning';
        else dotClass = 'poor';

        return (
          <div className="ao-punct-row">
            <span
              className={`punctuality-dot punctuality-dot--${dotClass} ao-punct-dot`}
              style={{
                background:
                  dotClass === 'good'
                    ? 'var(--status-completed)'
                    : dotClass === 'warning'
                    ? 'var(--status-on-the-way)'
                    : 'var(--status-no-show)',
              }}
            />
            <div className="ao-punct-bar-wrap">
              <span className="ao-punct-pct">{pct.toFixed(1)}%</span>
              <div className="ao-punct-track">
                <div
                  className="ao-punct-fill"
                  style={{
                    width: `${pct}%`,
                    background:
                      dotClass === 'good'
                        ? 'var(--status-completed)'
                        : dotClass === 'warning'
                        ? 'var(--status-on-the-way)'
                        : 'var(--status-no-show)',
                  }}
                />
              </div>
            </div>
          </div>
        );
      }

      case 'avgTardinessMinutes':
        return `${(row.avgTardinessMinutes || 0).toFixed(1)}m`;

      case 'maxTardinessMinutes':
        return `${(row.maxTardinessMinutes || 0).toFixed(1)}m`;

      case 'missedShifts': {
        if (row.missedShifts > 0) {
          return (
            <span className="ro-badge badge--danger">
              {row.missedShifts}
            </span>
          );
        }
        return row.missedShifts || 0;
      }

      default:
        return row[colKey];
    }
  }

  return (
    <SortableTable
      columns={COLUMNS}
      rows={rows}
      renderCell={renderCell}
    />
  );
}
