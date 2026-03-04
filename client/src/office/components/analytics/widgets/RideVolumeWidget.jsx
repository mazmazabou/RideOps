import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { getCampusPalette, getCampusSlug, hexToRgb } from '../../../../utils/campus';

export default function RideVolumeWidget({ data }) {
  const { chartData, chartOptions, palette } = useMemo(() => {
    const items = data?.data;
    if (!items || items.length === 0) return { chartData: null, chartOptions: null, palette: null };

    const p = getCampusPalette(getCampusSlug());
    const primaryColor = p[0] || '#4682B4';
    const rgbStr = hexToRgb(primaryColor);

    const labels = items.map((d) => {
      const dt = new Date(d.date);
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const totals = items.map((d) => d.total || 0);

    return {
      chartData: {
        labels,
        datasets: [{
          label: 'Rides',
          data: totals,
          borderColor: primaryColor,
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return 'rgba(' + rgbStr + ', 0.15)';
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(' + rgbStr + ', 0.35)');
            gradient.addColorStop(1, 'rgba(' + rgbStr + ', 0.02)');
            return gradient;
          },
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
        }],
      },
      chartOptions: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (tipItems) => {
                const idx = tipItems[0]?.dataIndex;
                if (idx == null) return '';
                const d = items[idx];
                return new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              },
              label: (tipItem) => {
                const idx = tipItem.dataIndex;
                const d = items[idx];
                return d.total + ' rides (' + (d.completed || 0) + ' completed, ' + (d.noShows || 0) + ' no-shows, ' + (d.cancelled || 0) + ' cancelled)';
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 12 },
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
      },
      palette: p,
    };
  }, [data]);

  const items = data?.data;
  if (!items || items.length === 0) {
    return (
      <div className="ro-empty" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted, #6b7280)' }}>
        <i className="ti ti-chart-area-line" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }} />
        No ride volume data available
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Line data={chartData} options={chartOptions} />
    </div>
  );
}
