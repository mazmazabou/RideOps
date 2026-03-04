import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllAnalytics } from '../hooks/useAnalyticsFetch';
import { fetchOpsConfig } from '../../../../api';
import { getCampusPalette } from '../../../../utils/campus';
import WidgetGrid from '../WidgetGrid';
import WidgetToolbar from '../WidgetToolbar';
import WidgetLibraryDrawer from '../WidgetLibraryDrawer';
import { useWidgetLayout } from '../hooks/useWidgetLayout';
import {
  TAB_CONFIGS, WIDGET_REGISTRY, findNextPosition,
  getCompletionClass, getNoShowClass, getPunctualityClass,
} from '../constants';
import SkeletonLoader from '../shared/SkeletonLoader';

import KPISingleWidget from '../widgets/KPISingleWidget';
import RideVolumeWidget from '../widgets/RideVolumeWidget';
import RideOutcomesWidget from '../widgets/RideOutcomesWidget';
import PeakHoursWidget from '../widgets/PeakHoursWidget';
import RidesByDOWWidget from '../widgets/RidesByDOWWidget';
import RidesByHourWidget from '../widgets/RidesByHourWidget';
import TopRoutesWidget from '../widgets/TopRoutesWidget';
import DriverLeaderboardWidget from '../widgets/DriverLeaderboardWidget';
import ShiftCoverageWidget from '../widgets/ShiftCoverageWidget';
import FleetUtilWidget from '../widgets/FleetUtilWidget';
import RiderCohortsWidget from '../widgets/RiderCohortsWidget';

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DashboardTab({ dateRange, userId, onSummaryData }) {
  const { layout, setLayout, saveLayout, saveCustomDefault, resetLayout } = useWidgetLayout(TAB_CONFIGS.dashboard, userId);
  const [editMode, setEditMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  const visibleIds = layout.map(w => w.id);
  const hasLoadedRef = useRef(false);

  const loadData = useCallback(async () => {
    // Only show full skeleton on initial load — incremental widget adds render in place
    if (!hasLoadedRef.current) setLoading(true);
    const endpoints = [];
    const has = id => visibleIds.includes(id);

    const kpiIds = ['kpi-total-rides', 'kpi-completion-rate', 'kpi-no-show-rate', 'kpi-active-riders'];
    if (kpiIds.some(id => visibleIds.includes(id))) endpoints.push('summary');
    endpoints.push('tardiness', 'fleet-utilization');
    if (has('ride-volume')) endpoints.push('ride-volume');
    if (has('ride-outcomes')) endpoints.push('ride-outcomes');
    if (has('peak-hours')) endpoints.push('peak-hours');
    if (has('rides-by-dow') || has('rides-by-hour')) endpoints.push('frequency');
    if (has('top-routes')) endpoints.push('routes');
    if (has('driver-leaderboard')) endpoints.push('driver-performance');
    if (has('shift-coverage')) endpoints.push('shift-coverage');
    if (has('rider-cohorts')) endpoints.push('rider-cohorts');

    const unique = [...new Set(endpoints)];
    const results = await fetchAllAnalytics(unique, dateRange, { noCache: false });

    // Also fetch ops config for DOW filtering
    let opsConfig = null;
    try { opsConfig = await fetchOpsConfig(); } catch (e) { /* ignore */ }

    // Transform frequency data for DOW/Hour widgets
    if (results.frequency) {
      const opDays = opsConfig?.operating_days
        ? String(opsConfig.operating_days).split(',').map(Number)
        : [0, 1, 2, 3, 4];
      const freq = results.frequency;

      if (freq.byDayOfWeek) {
        results._dowData = opDays.map(d => {
          const pgDow = (d + 1) % 7;
          const row = freq.byDayOfWeek.find(r => parseInt(r.dow) === pgDow);
          return { label: DOW_NAMES[pgDow], count: row ? row.count : 0 };
        });
      }
      if (freq.byHour) {
        results._hourData = freq.byHour
          .filter(r => parseInt(r.hour) >= 8 && parseInt(r.hour) <= 19)
          .map(r => {
            const h = parseInt(r.hour);
            const label = h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p';
            return { label, count: r.count };
          });
      }
    }

    setData(results);
    setLoading(false);
    hasLoadedRef.current = true;
    if (results.summary && onSummaryData) onSummaryData(results.summary);
  }, [dateRange, visibleIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  function handleLayoutChange(items) {
    setLayout(items);
    saveLayout(items);
  }

  function handleAddWidget(widgetId) {
    const def = WIDGET_REGISTRY[widgetId];
    if (!def) return;
    const defaultItem = TAB_CONFIGS.dashboard.defaultLayout.find(d => d.id === widgetId);
    const w = defaultItem ? defaultItem.w : 6;
    const h = defaultItem ? defaultItem.h : 4;
    const pos = findNextPosition(layout, w, h);
    saveLayout([...layout, { id: widgetId, x: pos.x, y: pos.y, w, h }]);
    // Scroll to the newly added widget after grid settles
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

  function handleSetDefault() {
    saveCustomDefault();
  }

  function renderWidget(widgetId) {
    if (loading) return <SkeletonLoader type={WIDGET_REGISTRY[widgetId]?.skeletonType || 'chart'} />;

    const summary = data.summary || {};
    const tardiness = data.tardiness?.summary || {};
    const fleet = data['fleet-utilization']?.summary || {};

    switch (widgetId) {
      // -- Individual KPI widgets --
      case 'kpi-total-rides': {
        const v = summary.totalRides || 0;
        return <KPISingleWidget value={v.toLocaleString()} label="Total Rides" icon="ti ti-car" colorClass="kpi-card--neutral" />;
      }
      case 'kpi-completion-rate': {
        const total = summary.totalRides || 0;
        const rate = total > 0 ? ((summary.completedRides || 0) / total * 100) : 0;
        return <KPISingleWidget value={rate.toFixed(1) + '%'} label="Completion Rate" icon="ti ti-circle-check" colorClass={getCompletionClass(rate)} />;
      }
      case 'kpi-no-show-rate': {
        const total = summary.totalRides || 0;
        const rate = total > 0 ? ((summary.noShows || 0) / total * 100) : 0;
        return <KPISingleWidget value={rate.toFixed(1) + '%'} label="No-Show Rate" icon="ti ti-user-x" colorClass={getNoShowClass(rate)} />;
      }
      case 'kpi-active-riders': {
        const v = summary.uniqueRiders || 0;
        return <KPISingleWidget value={v.toLocaleString()} label="Active Riders" icon="ti ti-users" colorClass="kpi-card--neutral" />;
      }
      case 'kpi-driver-punctuality': {
        const total = tardiness.totalClockIns || 0;
        const tardy = tardiness.tardyCount || 0;
        const rate = total > 0 ? ((total - tardy) / total * 100) : 100;
        return <KPISingleWidget value={rate.toFixed(1) + '%'} label="Driver Punctuality" icon="ti ti-clock-check" colorClass={getPunctualityClass(rate)} />;
      }
      case 'kpi-fleet-available': {
        const avail = fleet.available || 0;
        const total = fleet.totalFleet || 0;
        return <KPISingleWidget value={avail + '/' + total} label="Fleet Available" icon="ti ti-bus" colorClass="kpi-card--neutral" />;
      }

      // -- Chart widgets — show skeleton if data not yet fetched --
      case 'ride-volume':
        return data['ride-volume'] ? <RideVolumeWidget data={data['ride-volume']} /> : <SkeletonLoader type="chart" />;
      case 'ride-outcomes':
        return data['ride-outcomes'] ? <RideOutcomesWidget data={data['ride-outcomes']} /> : <SkeletonLoader type="donut" />;
      case 'peak-hours':
        return data['peak-hours'] ? <PeakHoursWidget data={data['peak-hours']} /> : <SkeletonLoader type="heatmap" />;
      case 'rides-by-dow':
        return data._dowData ? <RidesByDOWWidget data={data._dowData} /> : <SkeletonLoader type="chart" />;
      case 'rides-by-hour':
        return data._hourData ? <RidesByHourWidget data={data._hourData} /> : <SkeletonLoader type="chart" />;
      case 'top-routes':
        return data.routes ? <TopRoutesWidget routes={data.routes.routes} /> : <SkeletonLoader type="table" />;
      case 'driver-leaderboard':
        return data['driver-performance'] ? <DriverLeaderboardWidget drivers={data['driver-performance'].drivers} /> : <SkeletonLoader type="table" />;
      case 'shift-coverage':
        return data['shift-coverage'] ? <ShiftCoverageWidget data={data['shift-coverage']} /> : <SkeletonLoader type="table" />;
      case 'fleet-utilization':
        return data['fleet-utilization'] ? <FleetUtilWidget data={data['fleet-utilization']} /> : <SkeletonLoader type="chart" />;
      case 'rider-cohorts':
        return data['rider-cohorts'] ? <RiderCohortsWidget data={data['rider-cohorts']} /> : <SkeletonLoader type="chart" />;
      default:
        return <SkeletonLoader type="chart" />;
    }
  }

  return (
    <div id="analytics-dashboard-view">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <WidgetToolbar
          editMode={editMode}
          onToggleEdit={() => { setEditMode(!editMode); if (editMode) setLibraryOpen(false); }}
          onAdd={() => setLibraryOpen(true)}
          onSetDefault={handleSetDefault}
          onReset={resetLayout}
        />
      </div>
      <WidgetGrid
        gridId="widget-grid"
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
        allowedWidgets={TAB_CONFIGS.dashboard.allowedWidgets}
        onAddWidget={handleAddWidget}
      />
    </div>
  );
}
