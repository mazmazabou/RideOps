import { useState, useEffect, useCallback } from 'react';
import { fetchAnalytics } from '../hooks/useAnalyticsFetch';
import { useTenant } from '../../../../contexts/TenantContext';
import WidgetGrid from '../WidgetGrid';
import WidgetToolbar from '../WidgetToolbar';
import WidgetLibraryDrawer from '../WidgetLibraryDrawer';
import { useWidgetLayout } from '../hooks/useWidgetLayout';
import { TAB_CONFIGS, WIDGET_REGISTRY, findNextPosition } from '../constants';
import SkeletonLoader from '../shared/SkeletonLoader';

import DriverMilestonesWidget from '../widgets/DriverMilestonesWidget';
import RiderMilestonesWidget from '../widgets/RiderMilestonesWidget';

export default function MilestonesTab({ userId }) {
  const { config } = useTenant();
  const { layout, setLayout, saveLayout, saveCustomDefault, resetLayout } = useWidgetLayout(TAB_CONFIGS.milestones, userId);
  const [editMode, setEditMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const visibleIds = layout.map(w => w.id);
  const orgShortName = config?.orgShortName || 'RideOps';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Milestones endpoint does not use date filtering
      const milestones = await fetchAnalytics('milestones', {});
      setData(milestones);
    } catch (e) {
      console.warn('Milestones fetch error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function handleLayoutChange(items) {
    setLayout(items);
    saveLayout(items);
  }

  function handleAddWidget(widgetId) {
    const defaultItem = TAB_CONFIGS.milestones.defaultLayout.find(d => d.id === widgetId);
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
    if (loading) return <SkeletonLoader type="chart" />;
    switch (widgetId) {
      case 'driver-milestones':
        return <DriverMilestonesWidget people={data?.drivers} orgShortName={orgShortName} />;
      case 'rider-milestones':
        return <RiderMilestonesWidget people={data?.riders} orgShortName={orgShortName} />;
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
        gridId="milestones-widget-grid"
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
        allowedWidgets={TAB_CONFIGS.milestones.allowedWidgets}
        onAddWidget={handleAddWidget}
      />
    </div>
  );
}
