import React, { useMemo } from 'react';
import ChartCanvas from '../shared/ChartCanvas.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import { resolveColor } from '../constants';

/**
 * TardinessTrendWidget -- line chart with area fill showing tardiness over time.
 *
 * @param {{ data: Array<{label: string, value: number, raw: {date: string, tardyCount: number, totalClockIns: number, avgTardinessMinutes: number}}> }} props
 */
export default function TardinessTrendWidget({ data }) {
  const chartConfig = useMemo(() => {
    if (!data || !data.length) return null;

    const labels = data.map((d) => d.label);
    const values = data.map((d) => d.value);
    const lineColor = resolveColor('var(--status-on-the-way)') || '#f59f00';

    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Tardy Clock-Ins',
            data: values,
            borderColor: lineColor,
            backgroundColor: lineColor + '33', // ~20% opacity fill
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: lineColor,
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
              title(items) {
                if (!items.length) return '';
                const idx = items[0].dataIndex;
                const raw = data[idx] && data[idx].raw;
                if (raw && raw.date) {
                  const d = new Date(raw.date);
                  return d.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  });
                }
                return items[0].label;
              },
              label(ctx) {
                const idx = ctx.dataIndex;
                const raw = data[idx] && data[idx].raw;
                if (raw) {
                  const pct = raw.totalClockIns > 0
                    ? ((raw.tardyCount / raw.totalClockIns) * 100).toFixed(0)
                    : 0;
                  const avg = (raw.avgTardinessMinutes || 0).toFixed(1);
                  return `${raw.tardyCount} tardy of ${raw.totalClockIns} (${pct}%) \u00b7 Avg ${avg}m`;
                }
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
        icon="trending-up"
        title="No trend data"
        message="No tardiness trend data available for the selected period."
      />
    );
  }

  return <ChartCanvas chartConfig={chartConfig} />;
}
