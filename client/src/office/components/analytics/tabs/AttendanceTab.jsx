import { useState, useEffect, useCallback } from 'react';
import { fetchAnalytics } from '../hooks/useAnalyticsFetch';
import { fetchOpsConfig } from '../../../../api';
import WidgetGrid from '../WidgetGrid';
import WidgetToolbar from '../WidgetToolbar';
import WidgetLibraryDrawer from '../WidgetLibraryDrawer';
import { useWidgetLayout } from '../hooks/useWidgetLayout';
import {
  TAB_CONFIGS, WIDGET_REGISTRY, findNextPosition,
  getPunctualityClass, getTardyClass, getMissedShiftsClass, getAvgTardinessClass,
} from '../constants';
import SkeletonLoader from '../shared/SkeletonLoader';

import KPISingleWidget from '../widgets/KPISingleWidget';
import AttendanceDonutWidget from '../widgets/AttendanceDonutWidget';
import TardinessByDOWWidget from '../widgets/TardinessByDOWWidget';
import TardinessTrendWidget from '../widgets/TardinessTrendWidget';
import PunctualityTableWidget from '../widgets/PunctualityTableWidget';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AttendanceTab({ dateRange, userId }) {
  const { layout, setLayout, saveLayout, saveCustomDefault, resetLayout } = useWidgetLayout(TAB_CONFIGS.attendance, userId);
  const [editMode, setEditMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [data, setData] = useState(null);
  const [dowData, setDowData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [loading, setLoading] = useState(true);

  const visibleIds = layout.map(w => w.id);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const tardiness = await fetchAnalytics('tardiness', dateRange);
      setData(tardiness);

      // Transform DOW data with ops config
      if (tardiness?.byDayOfWeek) {
        let opsConfig = null;
        try { opsConfig = await fetchOpsConfig(); } catch (e) { /* ignore */ }
        const opDays = opsConfig?.operating_days
          ? String(opsConfig.operating_days).split(',').map(Number)
          : [0, 1, 2, 3, 4, 5, 6];
        const transformed = opDays.map(d => {
          const pgDow = (d + 1) % 7;
          const found = tardiness.byDayOfWeek.find(r => r.dayOfWeek === pgDow);
          return { label: DAY_LABELS[pgDow], count: found ? found.tardyCount : 0 };
        });
        setDowData(transformed);
      }

      // Transform trend data
      if (tardiness?.dailyTrend) {
        const transformed = tardiness.dailyTrend.map(d => ({
          label: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: d.tardyCount,
          raw: d,
        }));
        setTrendData(transformed);
      }
    } catch (e) {
      console.warn('Attendance fetch error:', e);
    }
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleLayoutChange(items) {
    setLayout(items);
    saveLayout(items);
  }

  function handleAddWidget(widgetId) {
    const defaultItem = TAB_CONFIGS.attendance.defaultLayout.find(d => d.id === widgetId);
    const w = defaultItem ? defaultItem.w : 6;
    const h = defaultItem ? defaultItem.h : 4;
    const pos = findNextPosition(layout, w, h);
    saveLayout([...layout, { id: widgetId, x: pos.x, y: pos.y, w, h }]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-widget-id="${widgetId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  function handleRemoveWidget(widgetId) {
    const newLayout = layout.filter(w => w.id !== widgetId);
    setLayout(newLayout);
    saveLayout(newLayout);
  }

  function renderWidget(widgetId) {
    if (loading) return <SkeletonLoader type={WIDGET_REGISTRY[widgetId]?.skeletonType || 'chart'} />;
    const summary = data?.summary || {};

    switch (widgetId) {
      case 'kpi-total-clock-ins':
        return <KPISingleWidget value={String(summary.totalClockIns || 0)} label="Total Clock-Ins" icon="ti ti-clock" colorClass="kpi-card--primary" />;
      case 'kpi-on-time-rate': {
        const total = summary.totalClockIns || 0;
        const onTime = summary.onTimeCount || 0;
        const rate = total > 0 ? (onTime / total * 100) : 0;
        return <KPISingleWidget value={rate.toFixed(1) + '%'} label="On-Time Rate" icon="ti ti-circle-check" colorClass={getPunctualityClass(rate)} />;
      }
      case 'kpi-tardy-count':
        return <KPISingleWidget value={String(summary.tardyCount || 0)} label="Tardy Count" icon="ti ti-clock-exclamation" colorClass={getTardyClass(summary.tardyCount || 0)} />;
      case 'kpi-avg-tardiness':
        return <KPISingleWidget value={(summary.avgTardinessMinutes || 0).toFixed(1) + 'm'} label="Avg Tardiness" icon="ti ti-hourglass" colorClass={getAvgTardinessClass(summary.avgTardinessMinutes || 0)} />;
      case 'kpi-missed-shifts':
        return <KPISingleWidget value={String(summary.totalMissedShifts || 0)} label="Missed Shifts" icon="ti ti-calendar-off" colorClass={getMissedShiftsClass(summary.totalMissedShifts || 0)} />;

      // -- Existing chart widgets (unchanged) --
      case 'attendance-donut':
        return <AttendanceDonutWidget distribution={data?.distribution} />;
      case 'tardiness-by-dow':
        return <TardinessByDOWWidget data={dowData} />;
      case 'tardiness-trend':
        return <TardinessTrendWidget data={trendData} />;
      case 'punctuality-table':
        return <PunctualityTableWidget byDriver={data?.byDriver} />;
      default:
        return <SkeletonLoader type="chart" />;
    }
  }

  return (
    <div>
      <div className="ao-toolbar-row">
        <WidgetToolbar
          editMode={editMode}
          onToggleEdit={() => { setEditMode(!editMode); if (editMode) setLibraryOpen(false); }}
          onAdd={() => setLibraryOpen(true)}
          onSetDefault={() => saveCustomDefault()}
          onReset={resetLayout}
        />
      </div>
      <WidgetGrid
        gridId="attendance-widget-grid"
        layout={layout}
        editMode={editMode}
        onLayoutChange={handleLayoutChange}
        onRemoveWidget={handleRemoveWidget}
        widgetRenderer={renderWidget}
      />
      <WidgetLibraryDrawer
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        visibleWidgetIds={visibleIds}
        allowedWidgets={TAB_CONFIGS.attendance.allowedWidgets}
        onAddWidget={handleAddWidget}
      />
    </div>
  );
}
