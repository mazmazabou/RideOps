import React from 'react';
import { Doughnut, Line, Bar } from 'react-chartjs-2';

/**
 * ChartCanvas — declarative wrapper using react-chartjs-2.
 *
 * The parent widget is responsible for pre-resolving CSS custom-property
 * colors via `resolveColor()` before building the chartConfig object.
 *
 * @param {object}  chartConfig - Chart.js configuration with { type, data, options }
 * @param {Array}   [plugins]   - Optional array of Chart.js plugins
 */
export default function ChartCanvas({ chartConfig, plugins }) {
  if (!chartConfig) return null;

  const { type, data, options } = chartConfig;
  const chartProps = { data, options, plugins: plugins || [] };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {type === 'doughnut' && <Doughnut {...chartProps} />}
      {type === 'line' && <Line {...chartProps} />}
      {type === 'bar' && <Bar {...chartProps} />}
    </div>
  );
}
