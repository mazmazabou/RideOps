import React, { useMemo } from 'react';
import ChartCanvas from '../shared/ChartCanvas.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import { resolveColor } from '../constants';

/**
 * TardinessByDOWWidget -- bar chart of tardy clock-ins by day of week.
 *
 * @param {{ data: Array<{label: string, count: number}> }} props
 */
export default function TardinessByDOWWidget({ data }) {
  const chartConfig = useMemo(() => {
    if (!data || !data.length) return null;

    const labels = data.map((d) => d.label);
    const values = data.map((d) => parseInt(d.count, 10) || 0);
    const barColor = resolveColor('var(--status-on-the-way)') || '#f59f00';

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Tardy Clock-Ins',
            data: values,
            backgroundColor: barColor,
            borderRadius: 4,
            maxBarThickness: 48,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                return `${ctx.raw} tardy clock-ins`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: {
              color: resolveColor('var(--color-border)') || '#e9ecef',
            },
          },
        },
      },
    };
  }, [data]);

  if (!chartConfig) {
    return (
      <EmptyState
        icon="calendar-stats"
        title="No tardiness data"
        message="No tardy clock-ins recorded for the selected period."
      />
    );
  }

  return <ChartCanvas chartConfig={chartConfig} />;
}
