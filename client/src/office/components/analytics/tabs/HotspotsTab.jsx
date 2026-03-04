import { useState, useEffect, useCallback } from 'react';
import { fetchAnalytics } from '../hooks/useAnalyticsFetch';
import WidgetGrid from '../WidgetGrid';
import WidgetToolbar from '../WidgetToolbar';
import WidgetLibraryDrawer from '../WidgetLibraryDrawer';
import { useWidgetLayout } from '../hooks/useWidgetLayout';
import { TAB_CONFIGS, WIDGET_REGISTRY, findNextPosition } from '../constants';
import SkeletonLoader from '../shared/SkeletonLoader';

import HotspotPickupsWidget from '../widgets/HotspotPickupsWidget';
import HotspotDropoffsWidget from '../widgets/HotspotDropoffsWidget';
import HotspotTopRoutesWidget from '../widgets/HotspotTopRoutesWidget';
import RouteDemandMatrixWidget from '../widgets/RouteDemandMatrixWidget';

export default function HotspotsTab({ dateRange, userId }) {
  const { layout, setLayout, saveLayout, saveCustomDefault, resetLayout } = useWidgetLayout(TAB_CONFIGS.hotspots, userId);
  const [editMode, setEditMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const visibleIds = layout.map(w => w.id);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const hotspots = await fetchAnalytics('hotspots', dateRange);
      setData(hotspots);
    } catch (e) {
      console.warn('Hotspots fetch error:', e);
    }
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleLayoutChange(items) {
    setLayout(items);
    saveLayout(items);
  }

  function handleAddWidget(widgetId) {
    const defaultItem = TAB_CONFIGS.hotspots.defaultLayout.find(d => d.id === widgetId);
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
    switch (widgetId) {
      case 'hotspot-pickups':
        return <HotspotPickupsWidget items={data?.topPickups} />;
      case 'hotspot-dropoffs':
        return <HotspotDropoffsWidget items={data?.topDropoffs} />;
      case 'hotspot-top-routes':
        return <HotspotTopRoutesWidget items={data?.topRoutes} />;
      case 'route-demand-matrix':
        return <RouteDemandMatrixWidget matrixData={data?.matrix} />;
      default:
        return <SkeletonLoader type="chart" />;
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <WidgetToolbar
          editMode={editMode}
          onToggleEdit={() => { setEditMode(!editMode); if (editMode) setLibraryOpen(false); }}
          onAdd={() => setLibraryOpen(true)}
          onSetDefault={() => saveCustomDefault()}
          onReset={resetLayout}
        />
      </div>
      <WidgetGrid
        gridId="hotspots-widget-grid"
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
        allowedWidgets={TAB_CONFIGS.hotspots.allowedWidgets}
        onAddWidget={handleAddWidget}
      />
    </div>
  );
}
