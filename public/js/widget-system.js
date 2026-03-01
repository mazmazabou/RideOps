/* Widget System — manages the analytics widget dashboard */
/* Depends on: widget-registry.js (WIDGET_REGISTRY, DEFAULT_WIDGET_LAYOUT, WIDGET_CATEGORIES) */
/* Depends on: SortableJS (optional — degrades gracefully if CDN fails) */

var WIDGET_LAYOUT_VERSION = 1;
var _widgetLayout = null;
var _widgetEditMode = false;
var _widgetGridSortable = null;
var _widgetUserId = null;
var _widgetLoaders = {};

// ── Layout Persistence ──

function getWidgetStorageKey(userId) {
  return 'rideops_widget_layout_' + (userId || 'default');
}

function loadWidgetLayout(userId) {
  try {
    var raw = localStorage.getItem(getWidgetStorageKey(userId));
    if (!raw) return null;
    var saved = JSON.parse(raw);
    if (!saved || saved.version !== WIDGET_LAYOUT_VERSION || !Array.isArray(saved.widgets)) return null;
    // Validate: remove widgets that no longer exist in registry
    saved.widgets = saved.widgets.filter(function(w) { return WIDGET_REGISTRY[w.id]; });
    return saved.widgets;
  } catch (e) {
    return null;
  }
}

function saveWidgetLayout(userId, layout) {
  try {
    localStorage.setItem(getWidgetStorageKey(userId), JSON.stringify({
      version: WIDGET_LAYOUT_VERSION,
      widgets: layout
    }));
  } catch (e) {
    console.warn('Failed to save widget layout:', e);
  }
}

// ── Widget Registration ──

function registerWidgetLoader(widgetId, loaderFn) {
  _widgetLoaders[widgetId] = loaderFn;
}

// ── Widget Grid Rendering ──

function getVisibleWidgetIds() {
  if (!_widgetLayout) return [];
  return _widgetLayout.map(function(w) { return w.id; });
}

function buildWidgetCardHTML(widgetId, size) {
  var def = WIDGET_REGISTRY[widgetId];
  if (!def) return '';
  var sizeClass = 'widget-card--' + (size || def.defaultSize);
  var canResize = def.allowedSizes && def.allowedSizes.length > 1;
  var bodyId = def.containerId;
  var bodyClass = def.containerClass ? ' ' + def.containerClass : '';

  return '<div class="widget-card ' + sizeClass + '" data-widget-id="' + widgetId + '">' +
    '<div class="widget-card__header">' +
      '<div class="widget-card__drag-handle"><i class="ti ti-grip-vertical"></i></div>' +
      '<h4 class="widget-card__title"><i class="ti ' + def.icon + '"></i> ' + def.title + '</h4>' +
      '<div class="widget-card__actions">' +
        (canResize ? '<button class="widget-action widget-action--resize" title="Resize"><i class="ti ti-arrows-diagonal"></i></button>' : '') +
        '<button class="widget-action widget-action--remove" title="Remove"><i class="ti ti-x"></i></button>' +
      '</div>' +
    '</div>' +
    '<div class="widget-card__body' + bodyClass + '" id="' + bodyId + '"></div>' +
  '</div>';
}

function renderWidgetGrid() {
  var grid = document.getElementById('widget-grid');
  if (!grid) return;

  if (!_widgetLayout || _widgetLayout.length === 0) {
    grid.innerHTML = '<div class="ro-empty"><i class="ti ti-layout-dashboard"></i>' +
      '<div class="ro-empty__title">No widgets on the dashboard</div>' +
      '<div class="ro-empty__message">Click "Customize" to add widgets.</div></div>';
    return;
  }

  var html = '';
  _widgetLayout.forEach(function(w) {
    html += buildWidgetCardHTML(w.id, w.size);
  });
  grid.innerHTML = html;

  // Bind remove and resize buttons
  grid.querySelectorAll('.widget-action--remove').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var card = btn.closest('.widget-card');
      var widgetId = card.dataset.widgetId;
      removeWidget(widgetId);
    });
  });

  grid.querySelectorAll('.widget-action--resize').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var card = btn.closest('.widget-card');
      var widgetId = card.dataset.widgetId;
      resizeWidget(widgetId);
    });
  });

  // Init SortableJS if available
  initWidgetSortable();
}

// ── Widget Library ──

function renderWidgetLibrary() {
  var list = document.getElementById('widget-library-list');
  if (!list) return;

  var visibleIds = new Set(getVisibleWidgetIds());
  var available = Object.keys(WIDGET_REGISTRY).filter(function(id) {
    return !visibleIds.has(id);
  });

  if (available.length === 0) {
    list.innerHTML = '<div class="ro-empty"><i class="ti ti-check"></i>' +
      '<div class="ro-empty__title">All widgets placed</div>' +
      '<div class="ro-empty__message">Every available widget is on your dashboard.</div></div>';
    return;
  }

  // Group by category
  var groups = {};
  available.forEach(function(id) {
    var def = WIDGET_REGISTRY[id];
    var cat = def.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(id);
  });

  var html = '';
  Object.keys(groups).forEach(function(cat) {
    var catLabel = (WIDGET_CATEGORIES && WIDGET_CATEGORIES[cat]) || cat;
    html += '<div class="widget-library-group">';
    html += '<div class="widget-library-group__label">' + catLabel + '</div>';
    groups[cat].forEach(function(id) {
      var def = WIDGET_REGISTRY[id];
      html += '<div class="widget-library-item" data-widget-id="' + id + '">' +
        '<div class="widget-library-item__icon"><i class="ti ' + def.icon + '"></i></div>' +
        '<div class="widget-library-item__info">' +
          '<div class="widget-library-item__name">' + def.title + '</div>' +
          '<div class="widget-library-item__desc">' + (def.description || '') + '</div>' +
          '<span class="widget-library-item__size">' + def.defaultSize + '</span>' +
        '</div>' +
        '<button class="ro-btn ro-btn--outline ro-btn--xs widget-library-item__add" title="Add to dashboard"><i class="ti ti-plus"></i></button>' +
      '</div>';
    });
    html += '</div>';
  });
  list.innerHTML = html;

  // Bind add buttons
  list.querySelectorAll('.widget-library-item__add').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var item = btn.closest('.widget-library-item');
      var widgetId = item.dataset.widgetId;
      addWidget(widgetId);
    });
  });
}

function openWidgetLibrary() {
  var drawer = document.getElementById('widget-library-drawer');
  var backdrop = document.getElementById('widget-library-backdrop');
  if (drawer) drawer.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
  renderWidgetLibrary();
}

function closeWidgetLibrary() {
  var drawer = document.getElementById('widget-library-drawer');
  var backdrop = document.getElementById('widget-library-backdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

// ── Widget Operations ──

function addWidget(widgetId) {
  var def = WIDGET_REGISTRY[widgetId];
  if (!def) return;
  _widgetLayout.push({ id: widgetId, size: def.defaultSize });
  saveWidgetLayout(_widgetUserId, _widgetLayout);
  renderWidgetGrid();
  renderWidgetLibrary();
  // Re-load all widgets (renderWidgetGrid rebuilds innerHTML, wiping existing content)
  if (typeof loadAllAnalytics === 'function') loadAllAnalytics();
}

function removeWidget(widgetId) {
  _widgetLayout = _widgetLayout.filter(function(w) { return w.id !== widgetId; });
  saveWidgetLayout(_widgetUserId, _widgetLayout);
  renderWidgetGrid();
  renderWidgetLibrary();
  // Re-load all widgets (renderWidgetGrid rebuilds innerHTML, wiping existing content)
  if (typeof loadAllAnalytics === 'function') loadAllAnalytics();
}

function resizeWidget(widgetId) {
  var def = WIDGET_REGISTRY[widgetId];
  if (!def || !def.allowedSizes || def.allowedSizes.length < 2) return;
  var entry = _widgetLayout.find(function(w) { return w.id === widgetId; });
  if (!entry) return;
  var currentIdx = def.allowedSizes.indexOf(entry.size);
  var nextIdx = (currentIdx + 1) % def.allowedSizes.length;
  entry.size = def.allowedSizes[nextIdx];
  saveWidgetLayout(_widgetUserId, _widgetLayout);
  // Update the card class without full re-render
  var card = document.querySelector('.widget-card[data-widget-id="' + widgetId + '"]');
  if (card) {
    card.className = 'widget-card widget-card--' + entry.size;
  }
}

function resetWidgetLayout() {
  if (typeof showModalNew === 'function') {
    showModalNew({
      title: 'Reset Layout',
      body: 'Reset dashboard to the default layout? Your customizations will be lost.',
      confirmLabel: 'Reset',
      confirmClass: 'ro-btn--danger',
      onConfirm: function() {
        _widgetLayout = JSON.parse(JSON.stringify(DEFAULT_WIDGET_LAYOUT));
        saveWidgetLayout(_widgetUserId, _widgetLayout);
        renderWidgetGrid();
        renderWidgetLibrary();
        if (typeof loadAllAnalytics === 'function') loadAllAnalytics();
        if (typeof showToastNew === 'function') showToastNew('Dashboard reset to defaults', 'success');
      }
    });
  } else {
    _widgetLayout = JSON.parse(JSON.stringify(DEFAULT_WIDGET_LAYOUT));
    saveWidgetLayout(_widgetUserId, _widgetLayout);
    renderWidgetGrid();
    renderWidgetLibrary();
    if (typeof loadAllAnalytics === 'function') loadAllAnalytics();
  }
}

// ── Edit Mode ──

function toggleWidgetEditMode() {
  _widgetEditMode = !_widgetEditMode;
  var grid = document.getElementById('widget-grid');
  var toolbar = document.getElementById('widget-toolbar');
  var customizeBtn = document.getElementById('widget-customize-btn');

  if (grid) grid.classList.toggle('widget-grid--editing', _widgetEditMode);
  if (toolbar) toolbar.style.display = _widgetEditMode ? '' : 'none';
  if (customizeBtn) customizeBtn.style.display = _widgetEditMode ? 'none' : '';

  if (_widgetGridSortable) {
    _widgetGridSortable.option('disabled', !_widgetEditMode);
  }

  if (!_widgetEditMode) {
    closeWidgetLibrary();
  }
}

// ── SortableJS Integration ──

function initWidgetSortable() {
  if (typeof Sortable === 'undefined') return;
  var grid = document.getElementById('widget-grid');
  if (!grid) return;

  if (_widgetGridSortable) {
    _widgetGridSortable.destroy();
    _widgetGridSortable = null;
  }

  _widgetGridSortable = new Sortable(grid, {
    handle: '.widget-card__drag-handle',
    animation: 200,
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    disabled: !_widgetEditMode,
    onEnd: function() {
      // Read new order from DOM
      var newLayout = [];
      grid.querySelectorAll('.widget-card[data-widget-id]').forEach(function(card) {
        var wid = card.dataset.widgetId;
        var existing = _widgetLayout.find(function(w) { return w.id === wid; });
        if (existing) newLayout.push({ id: wid, size: existing.size });
      });
      _widgetLayout = newLayout;
      saveWidgetLayout(_widgetUserId, _widgetLayout);
    }
  });
}

// ── Data Loading ──

function loadSingleWidget(widgetId) {
  var loader = _widgetLoaders[widgetId];
  if (loader) {
    try { loader(); } catch (e) { console.warn('Widget loader error:', widgetId, e); }
  }
}

function loadVisibleWidgets() {
  if (!_widgetLayout) return;
  _widgetLayout.forEach(function(w) {
    var def = WIDGET_REGISTRY[w.id];
    var container = def ? document.getElementById(def.containerId) : null;
    if (container && typeof showAnalyticsSkeleton === 'function') {
      var skeletonType = 'chart';
      if (w.id === 'kpi-grid') skeletonType = 'kpi';
      else if (w.id === 'peak-hours' || w.id === 'route-demand-matrix') skeletonType = 'heatmap';
      else if (w.id === 'ride-outcomes') skeletonType = 'donut';
      else if (['top-routes', 'driver-leaderboard', 'shift-coverage'].indexOf(w.id) !== -1) skeletonType = 'table';
      showAnalyticsSkeleton(def.containerId, skeletonType);
    }
  });
}

// ── Initialization ──

function initWidgetSystem(userId) {
  _widgetUserId = userId;

  // Load saved layout or use defaults
  var saved = loadWidgetLayout(userId);
  _widgetLayout = saved || JSON.parse(JSON.stringify(DEFAULT_WIDGET_LAYOUT));

  // Render the grid
  renderWidgetGrid();

  // Bind edit mode controls
  var customizeBtn = document.getElementById('widget-customize-btn');
  if (customizeBtn) {
    customizeBtn.addEventListener('click', toggleWidgetEditMode);
  }

  var doneBtn = document.getElementById('widget-done-btn');
  if (doneBtn) {
    doneBtn.addEventListener('click', toggleWidgetEditMode);
  }

  var addBtn = document.getElementById('widget-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', openWidgetLibrary);
  }

  var resetBtn = document.getElementById('widget-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetWidgetLayout);
  }

  // Library drawer close
  var libClose = document.getElementById('widget-library-close');
  if (libClose) libClose.addEventListener('click', closeWidgetLibrary);

  var libBackdrop = document.getElementById('widget-library-backdrop');
  if (libBackdrop) libBackdrop.addEventListener('click', closeWidgetLibrary);

  // Hide customize button if SortableJS isn't loaded
  if (typeof Sortable === 'undefined' && customizeBtn) {
    customizeBtn.style.display = 'none';
  }
}
