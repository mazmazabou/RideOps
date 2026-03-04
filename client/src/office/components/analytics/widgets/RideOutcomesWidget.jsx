import React, { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { resolveColor } from '../constants';

// Center text plugin for doughnut chart — uses chartArea for correct centering
const centerTextPlugin = {
  id: 'rideOutcomesCenterText',
  afterDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || meta.data.length === 0) return;

    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const total = chart.config.options.plugins.centerText?.total;
    if (total == null) return;

    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 1.5rem system-ui, -apple-system, sans-serif';
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#1f2937';
    ctx.fillText(total.toLocaleString(), cx, cy - 8);

    ctx.font = '0.7rem system-ui, -apple-system, sans-serif';
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim() || '#6b7280';
    ctx.fillText('total rides', cx, cy + 14);

    ctx.restore();
  },
};

export default function RideOutcomesWidget({ data }) {
  const { chartData, chartOptions, total } = useMemo(() => {
    const dist = data?.distribution;
    if (!dist) return { chartData: null, chartOptions: null, total: 0 };

    const completed = dist.completed || 0;
    const noShows = dist.noShows || 0;
    const cancelled = dist.cancelled || 0;
    const denied = dist.denied || 0;
    const t = completed + noShows + cancelled + denied;
    if (t === 0) return { chartData: null, chartOptions: null, total: 0 };

    const colors = [
      resolveColor('var(--status-completed)') || '#2fb344',
      resolveColor('var(--color-warning)') || '#f59f00',
      resolveColor('var(--status-cancelled)') || '#6c757d',
      resolveColor('var(--status-denied)') || '#d63939',
    ];

    return {
      chartData: {
        labels: ['Completed', 'No-Shows', 'Cancelled', 'Denied'],
        datasets: [{
          data: [completed, noShows, cancelled, denied],
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--color-card-bg').trim() || '#fff',
          hoverOffset: 6,
          hoverBorderWidth: 3,
        }],
      },
      chartOptions: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (tipItem) => {
                const val = tipItem.raw;
                const pct = t > 0 ? ((val / t) * 100).toFixed(1) : '0.0';
                return tipItem.label + ': ' + val + ' (' + pct + '%)';
              },
            },
          },
          centerText: { total: t },
        },
      },
      total: t,
    };
  }, [data]);

  const dist = data?.distribution;
  if (!dist || total === 0) {
    return (
      <div className="ro-empty" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted, #6b7280)' }}>
        <i className="ti ti-chart-donut-3" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }} />
        No ride outcome data available
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Doughnut data={chartData} options={chartOptions} plugins={[centerTextPlugin]} />
    </div>
  );
}
