import React, { useMemo } from 'react';
import ChartCanvas from '../shared/ChartCanvas.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import { resolveColor } from '../constants';

const DONUT_COLORS = [
  'var(--status-completed)',
  'var(--color-warning)',
  'var(--status-on-the-way)',
  'var(--color-warning-dark)',
  'var(--status-no-show)',
];

/**
 * Center-text plugin for Chart.js doughnut chart.
 */
function makeCenterTextPlugin(totalLabel, subLabel) {
  return {
    id: 'attendanceCenterText',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = 'bold 1.4rem system-ui, sans-serif';
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--text-primary')
        .trim() || '#1e293b';
      ctx.fillText(totalLabel, cx, cy - 10);

      ctx.font = '0.75rem system-ui, sans-serif';
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--text-muted')
        .trim() || '#64748b';
      ctx.fillText(subLabel, cx, cy + 12);

      ctx.restore();
    },
  };
}

/**
 * AttendanceDonutWidget -- doughnut chart showing tardiness distribution.
 *
 * @param {{ distribution: Array<{bucket: string, count: number}> }} props
 */
export default function AttendanceDonutWidget({ distribution }) {
  const { chartConfig, plugins, total } = useMemo(() => {
    if (!distribution || !distribution.length) {
      return { chartConfig: null, plugins: [], total: 0 };
    }

    // Filter out zero-count entries
    const items = distribution.filter((d) => parseInt(d.count, 10) > 0);
    if (!items.length) {
      return { chartConfig: null, plugins: [], total: 0 };
    }

    const labels = items.map((d) => d.bucket);
    const data = items.map((d) => parseInt(d.count, 10));
    const sum = data.reduce((a, b) => a + b, 0);

    const resolvedColors = items.map((_, i) =>
      resolveColor(DONUT_COLORS[i % DONUT_COLORS.length])
    );

    const config = {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: resolvedColors,
            borderWidth: 1,
            borderColor: '#fff',
            hoverOffset: 6,
            hoverBorderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const pct = sum > 0 ? ((ctx.raw / sum) * 100).toFixed(1) : 0;
                return `${ctx.label}: ${ctx.raw} (${pct}%)`;
              },
            },
          },
        },
      },
    };

    const pluginsList = [makeCenterTextPlugin(String(sum), 'clock-ins')];

    return { chartConfig: config, plugins: pluginsList, total: sum };
  }, [distribution]);

  if (!chartConfig) {
    return (
      <EmptyState
        icon="chart-donut-3"
        title="No attendance data"
        message="No clock-in data available for the selected period."
      />
    );
  }

  return <ChartCanvas chartConfig={chartConfig} plugins={plugins} />;
}
