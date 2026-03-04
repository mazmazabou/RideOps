import React, { useCallback, useMemo, useRef } from 'react';
import ReactGridLayout, { useContainerWidth, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { WIDGET_REGISTRY, getLogicalSize } from './constants';

/**
 * WidgetCard — a single widget rendered inside the grid.
 * Must forwardRef and render {children} so react-grid-layout can inject resize handles.
 */
const WidgetCard = React.forwardRef(function WidgetCard(
  { widgetId, widgetW, editMode, onRemove, widgetRenderer, style, className, children, ...rest },
  ref
) {
  const def = WIDGET_REGISTRY[widgetId];
  if (!def) return null;

  const logicalSize = getLogicalSize(widgetW);
  const isKPI = def.isKPI === true;

  if (isKPI) {
    return (
      <div
        ref={ref}
        style={style}
        className={`widget-card widget-card--kpi ${editMode ? 'kpi-widget--draggable' : ''} ${className || ''}`}
        data-logical-size={logicalSize}
        data-widget-id={widgetId}
        {...rest}
      >
        <div className="widget-card__body widget-card__body--kpi">
          {widgetRenderer(widgetId)}
        </div>
        {editMode && (
          <button
            className="kpi-widget__remove"
            onClick={(e) => { e.stopPropagation(); onRemove(widgetId); }}
            title="Remove"
          >
            <i className="ti ti-x" />
          </button>
        )}
        {children}
      </div>
    );
  }

  // Non-KPI: existing rendering (unchanged)
  return (
    <div
      ref={ref}
      style={style}
      className={`widget-card ${className || ''}`}
      data-logical-size={logicalSize}
      data-widget-id={widgetId}
      {...rest}
    >
      <div className="widget-card__header">
        <div className="widget-card__drag-handle">
          <i className="ti ti-grip-vertical" />
        </div>
        <h4 className="widget-card__title">
          <i className={`ti ${def.icon}`} /> {def.title}
        </h4>
        {editMode && (
          <div className="widget-card__actions" style={{ display: 'flex' }}>
            <button
              className="widget-action widget-action--remove"
              onClick={(e) => { e.stopPropagation(); onRemove(widgetId); }}
              title="Remove"
            >
              <i className="ti ti-x" />
            </button>
          </div>
        )}
      </div>
      <div className={`widget-card__body${def.containerClass ? ' ' + def.containerClass : ''}`}>
        {widgetRenderer(widgetId)}
      </div>
      {children}
    </div>
  );
});

/**
 * WidgetGrid — renders a react-grid-layout grid of analytics widgets.
 *
 * Props:
 *   gridId           - DOM id for the container
 *   layout           - Array<{id, x, y, w, h}> (our domain format)
 *   editMode         - boolean, enables drag/resize
 *   onLayoutChange   - (items: Array<{id, x, y, w, h}>) => void
 *   onRemoveWidget   - (widgetId: string) => void
 *   widgetRenderer   - (widgetId: string) => ReactNode
 */
export default function WidgetGrid({ gridId, layout, editMode, onLayoutChange, onRemoveWidget, widgetRenderer }) {
  const { width, containerRef, mounted } = useContainerWidth();
  const scrollRef = useRef(null);
  const interactingRef = useRef(false);
  const pendingLayoutRef = useRef(null);

  // Flush pending layout after resize/drag completes
  const flushPendingLayout = useCallback(() => {
    interactingRef.current = false;
    if (pendingLayoutRef.current) {
      onLayoutChange(pendingLayoutRef.current);
      pendingLayoutRef.current = null;
    }
  }, [onLayoutChange]);

  // Restore scroll after layout flush + React re-render settles
  const restoreScroll = useCallback(() => {
    const saved = scrollRef.current;
    scrollRef.current = null;
    if (saved != null) {
      // Double-rAF waits for React commit + browser paint
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo(0, saved));
      });
    }
  }, []);

  const handleResizeStart = useCallback(() => {
    interactingRef.current = true;
    scrollRef.current = window.scrollY;
  }, []);
  const handleResizeStop = useCallback(() => {
    flushPendingLayout();
    restoreScroll();
  }, [flushPendingLayout, restoreScroll]);

  const handleDragStart = useCallback(() => {
    interactingRef.current = true;
    scrollRef.current = window.scrollY;
  }, []);
  const handleDragStop = useCallback(() => {
    flushPendingLayout();
    restoreScroll();
  }, [flushPendingLayout, restoreScroll]);

  // Convert our domain layout (id) to RGL layout (i), adding constraints from registry
  const rglLayout = useMemo(() => {
    if (!layout || layout.length === 0) return [];
    return layout.map(item => {
      const def = WIDGET_REGISTRY[item.id];
      return {
        i: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: def?.minW,
        maxW: def?.maxW,
        minH: def?.minH,
        maxH: def?.maxH,
        static: def?.noResize || false,
      };
    });
  }, [layout]);

  // Build a width lookup for each widget so WidgetCard can derive logical size
  const widthMap = useMemo(() => {
    const map = {};
    if (layout) {
      layout.forEach(item => { map[item.id] = item.w; });
    }
    return map;
  }, [layout]);

  // Convert RGL layout back to our domain format
  // During active resize/drag, stash the layout instead of updating state
  // to prevent the controlled-component feedback loop from snapping back
  const handleLayoutChange = useCallback((newLayout) => {
    const mapped = newLayout.map(item => ({
      id: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }));
    if (interactingRef.current) {
      pendingLayoutRef.current = mapped;
    } else {
      onLayoutChange(mapped);
    }
  }, [onLayoutChange]);

  // Empty state
  if (!layout || layout.length === 0) {
    return (
      <div ref={containerRef} id={gridId}>
        <div
          className="ro-empty"
          style={{
            padding: '64px 24px',
            border: '2px dashed var(--color-border)',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
          }}
        >
          <i className="ti ti-layout-dashboard" />
          <div className="ro-empty__title">No widgets on this tab</div>
          <div className="ro-empty__message">Click &quot;Customize&quot; to add widgets.</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} id={gridId} className={editMode ? 'widget-grid--editing' : ''}>
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={rglLayout}
          gridConfig={{
            cols: 12,
            rowHeight: 80,
            margin: [8, 8],
            containerPadding: [0, 0],
          }}
          dragConfig={{
            enabled: editMode,
            handle: '.widget-card__drag-handle, .kpi-widget--draggable',
          }}
          resizeConfig={{
            enabled: editMode,
            handles: ['se'],
          }}
          compactor={verticalCompactor}
          onLayoutChange={handleLayoutChange}
          onDragStart={handleDragStart}
          onDragStop={handleDragStop}
          onResizeStart={handleResizeStart}
          onResizeStop={handleResizeStop}
          autoSize={true}
          className="widget-grid"
        >
          {rglLayout.map(item => (
            <WidgetCard
              key={item.i}
              widgetId={item.i}
              widgetW={widthMap[item.i] || item.w}
              editMode={editMode}
              onRemove={onRemoveWidget}
              widgetRenderer={widgetRenderer}
            />
          ))}
        </ReactGridLayout>
      )}
    </div>
  );
}
