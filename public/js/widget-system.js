/* Widget System — manages analytics widget dashboards (multi-tab) */
/* Depends on: widget-registry.js (WIDGET_REGISTRY, DEFAULT_WIDGET_LAYOUT, WIDGET_CATEGORIES) */
/* Depends on: GridStack (loaded from CDN) */

var WIDGET_LAYOUT_VERSION = 3;
var _widgetLoaders = {};
var _widgetInstances = {};   // keyed by tabId
var _activeWidgetTab = null; // tracks which tab the library drawer should operate on

// -- Widget Registration --

function registerWidgetLoader(widgetId, loaderFn) {
  _widgetLoaders[widgetId] = loaderFn;
}

// -- Logical Size Derivation --

function getLogicalSize(gridStackW) {
  if (gridStackW <= 3) return 'xs';
  if (gridStackW <= 6) return 'sm';
  if (gridStackW <= 9) return 'md';
  return 'lg';
}

// -- Multi-Instance Factory --

function createWidgetInstance(tabId, config) {
  // config: {
  //   gridId: string          -- DOM id of the grid container
  //   storagePrefix: string   -- localStorage key prefix
  //   defaultLayout: array    -- default widget layout for this tab [{id, x, y, w, h}]
  //   allowedWidgets: array|null  -- widget IDs allowed on this tab (null = all)
  //   containerOverrides: object|null -- { widgetId: 'alt-container-id' }
  //   toolbarIds: { customize, toolbar, done, setDefault, add, reset }
  // }
  var instance = {
    tabId: tabId,
    config: config,
    layout: null,
    editMode: false,
    grid: null,  // GridStack instance
    userId: null
  };
  _widgetInstances[tabId] = instance;
  return instance;
}

// -- Layout Persistence --

function getWidgetStorageKey(storagePrefix, userId) {
  return 'rideops_widget_layout_' + storagePrefix + '_' + (userId || 'default');
}

function loadWidgetLayout(storagePrefix, userId) {
  try {
    var raw = localStorage.getItem(getWidgetStorageKey(storagePrefix, userId));
    if (!raw) return null;
    var saved = JSON.parse(raw);
    if (!saved || saved.version !== WIDGET_LAYOUT_VERSION || !Array.isArray(saved.widgets)) return null;
    // Filter out widgets that no longer exist in the registry
    saved.widgets = saved.widgets.filter(function(w) { return WIDGET_REGISTRY[w.id]; });
    // Clamp saved values to current registry constraints
    saved.widgets.forEach(function(w) {
      var def = WIDGET_REGISTRY[w.id];
      if (def) {
        if (typeof def.minW === 'number' && w.w < def.minW) w.w = def.minW;
        if (typeof def.maxW === 'number' && w.w > def.maxW) w.w = def.maxW;
        if (typeof def.minH === 'number' && w.h < def.minH) w.h = def.minH;
        if (typeof def.maxH === 'number' && w.h > def.maxH) w.h = def.maxH;
      }
    });
    return saved.widgets;
  } catch (e) {
    return null;
  }
}

function saveWidgetLayout(storagePrefix, userId, gridStackItems) {
  try {
    var widgets = gridStackItems.map(function(item) {
      return {
        id: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h
      };
    });
    localStorage.setItem(getWidgetStorageKey(storagePrefix, userId), JSON.stringify({
      version: WIDGET_LAYOUT_VERSION,
      widgets: widgets
    }));
  } catch (e) {
    console.warn('Failed to save widget layout:', e);
  }
}

// -- Custom Default Persistence --

function getCustomDefaultKey(storagePrefix, userId) {
  return 'rideops_widget_custom_default_' + storagePrefix + '_' + (userId || 'default');
}

function loadCustomDefault(storagePrefix, userId) {
  try {
    var raw = localStorage.getItem(getCustomDefaultKey(storagePrefix, userId));
    if (!raw) return null;
    var saved = JSON.parse(raw);
    if (!saved || saved.version !== WIDGET_LAYOUT_VERSION || !Array.isArray(saved.widgets)) return null;
    saved.widgets = saved.widgets.filter(function(w) { return WIDGET_REGISTRY[w.id]; });
    return saved.widgets;
  } catch (e) {
    return null;
  }
}

function saveCustomDefault(storagePrefix, userId, layoutItems) {
  try {
    var widgets = layoutItems.map(function(item) {
      return { id: item.id, x: item.x, y: item.y, w: item.w, h: item.h };
    });
    localStorage.setItem(getCustomDefaultKey(storagePrefix, userId), JSON.stringify({
      version: WIDGET_LAYOUT_VERSION,
      widgets: widgets
    }));
  } catch (e) {
    console.warn('Failed to save custom default:', e);
  }
}

// -- Widget Content Builder (inner HTML for grid-stack-item-content) --
// Widget card HTML is constructed from developer-defined registry data (title, icon,
// description) -- not user input. Safe for innerHTML construction.

function buildGridStackItemContent(widgetId, containerId) {
  var def = WIDGET_REGISTRY[widgetId];
  if (!def) return '';
  var bodyClass = def.containerClass ? ' ' + def.containerClass : '';

  return '<div class="widget-card__header">' +
      '<div class="widget-card__drag-handle"><i class="ti ti-grip-vertical"></i></div>' +
      '<h4 class="widget-card__title"><i class="ti ' + def.icon + '"></i> ' + def.title + '</h4>' +
      '<div class="widget-card__actions">' +
        '<button class="widget-action widget-action--remove" title="Remove"><i class="ti ti-x"></i></button>' +
      '</div>' +
    '</div>' +
    '<div class="widget-card__body' + bodyClass + '" id="' + containerId + '"></div>';
}

// -- Widget Grid Rendering --

function getVisibleWidgetIds(tabId) {
  var inst = _widgetInstances[tabId || 'dashboard'];
  if (!inst || !inst.layout) return [];
  return inst.layout.map(function(w) { return w.id; });
}

function _resolveContainerId(widgetId, containerOverrides) {
  if (containerOverrides && containerOverrides[widgetId]) return containerOverrides[widgetId];
  var def = WIDGET_REGISTRY[widgetId];
  return def ? def.containerId : null;
}

function renderWidgetGrid(tabId) {
  tabId = tabId || 'dashboard';
  var inst = _widgetInstances[tabId];
  if (!inst) return;

  var gridEl = document.getElementById(inst.config.gridId);
  if (!gridEl) return;

  // Destroy existing GridStack instance if present
  if (inst.grid) {
    try { inst.grid.destroy(false); } catch (e) { /* ignore */ }
    inst.grid = null;
  }

  // Clear the container
  gridEl.innerHTML = '';

  if (!inst.layout || inst.layout.length === 0) {
    // Show empty state -- content is static developer text, safe for innerHTML
    gridEl.innerHTML = '<div class="ro-empty" style="padding:64px 24px;border:2px dashed var(--color-border);border-radius:var(--radius-md);text-align:center;">' +
      '<i class="ti ti-layout-dashboard"></i>' +
      '<div class="ro-empty__title">No widgets on this tab</div>' +
      '<div class="ro-empty__message">Click "Customize" to add widgets.</div></div>';
    return;
  }

  // Pre-build DOM elements with gs-* attributes, then let GridStack.init() discover them.
  // This avoids the v12 content-escaping issue and the deprecated addWidget(el, opts) API.
  var overrides = inst.config.containerOverrides || null;
  inst.layout.forEach(function(w) {
    var def = WIDGET_REGISTRY[w.id];
    if (!def) return;
    var containerId = _resolveContainerId(w.id, overrides);

    var itemEl = document.createElement('div');
    itemEl.className = 'grid-stack-item';
    // GridStack reads gs-* attributes on existing children during init
    itemEl.setAttribute('gs-id', w.id);
    itemEl.setAttribute('gs-x', w.x);
    itemEl.setAttribute('gs-y', w.y);
    itemEl.setAttribute('gs-w', w.w);
    itemEl.setAttribute('gs-h', w.h);
    if (def.minW) itemEl.setAttribute('gs-min-w', def.minW);
    if (def.maxW) itemEl.setAttribute('gs-max-w', def.maxW);
    if (def.minH) itemEl.setAttribute('gs-min-h', def.minH);
    if (def.maxH) itemEl.setAttribute('gs-max-h', def.maxH);
    if (def.noResize) {
      itemEl.setAttribute('gs-no-resize', 'true');
      itemEl.setAttribute('gs-no-move', 'true');
    }
    itemEl.setAttribute('data-logical-size', getLogicalSize(w.w));

    var contentEl = document.createElement('div');
    contentEl.className = 'grid-stack-item-content';
    contentEl.innerHTML = buildGridStackItemContent(w.id, containerId);
    itemEl.appendChild(contentEl);

    gridEl.appendChild(itemEl);
  });

  // Initialize GridStack — it auto-discovers the child elements we just added
  var grid = GridStack.init({
    column: 12,
    cellHeight: 80,
    margin: 8,
    animate: true,
    float: false,
    staticGrid: !inst.editMode,
    disableResize: !inst.editMode,
    draggable: {
      handle: '.widget-card__drag-handle'
    },
    columnOpts: {
      breakpoints: [
        { c: 12, w: 1200 },
        { c: 8,  w: 996 },
        { c: 4,  w: 768 },
        { c: 1,  w: 480 }
      ],
      layout: 'list'
    }
  }, '#' + inst.config.gridId);

  inst.grid = grid;

  // Bind remove buttons on all widget items
  gridEl.querySelectorAll('.widget-action--remove').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var gsItem = btn.closest('.grid-stack-item');
      if (gsItem && gsItem.gridstackNode) {
        removeWidget(tabId, gsItem.gridstackNode.id);
      }
    });
  });

  // Hook events
  _hookGridEvents(tabId);
}

// -- GridStack Event Hooks --

function _hookGridEvents(tabId) {
  var inst = _widgetInstances[tabId];
  if (!inst || !inst.grid) return;

  // On resizestop: check if logical size changed, re-render if needed
  inst.grid.on('resizestop', function(event, el) {
    if (!el || !el.gridstackNode) return;
    var node = el.gridstackNode;
    var newLogical = getLogicalSize(node.w);
    var oldLogical = el.getAttribute('data-logical-size') || '';

    // Always update the attribute
    el.setAttribute('data-logical-size', newLogical);

    // If logical size crossed a threshold, re-render the widget content
    if (newLogical !== oldLogical) {
      var widgetId = node.id;
      var overrides = inst.config.containerOverrides || {};
      var containerId = _resolveContainerId(widgetId, overrides);
      if (containerId && _widgetLoaders[widgetId]) {
        try { _widgetLoaders[widgetId](containerId); } catch (e) {
          console.warn('Widget resize re-render error:', widgetId, e);
        }
      }
    }

    // Save layout after resize
    _saveCurrentLayout(tabId);
  });

  // On change: auto-save layout on any move/resize
  inst.grid.on('change', function() {
    // Update logical size attributes for all items that may have shifted
    var gridEl = document.getElementById(inst.config.gridId);
    if (gridEl) {
      gridEl.querySelectorAll('.grid-stack-item').forEach(function(el) {
        if (el.gridstackNode) {
          el.setAttribute('data-logical-size', getLogicalSize(el.gridstackNode.w));
        }
      });
    }
    _saveCurrentLayout(tabId);
  });
}

function _saveCurrentLayout(tabId) {
  var inst = _widgetInstances[tabId];
  if (!inst || !inst.grid) return;
  var items = inst.grid.save(false);
  if (Array.isArray(items)) {
    // Update the in-memory layout reference
    inst.layout = items.map(function(item) {
      return { id: item.id, x: item.x, y: item.y, w: item.w, h: item.h };
    });
    saveWidgetLayout(inst.config.storagePrefix, inst.userId, inst.layout);
  }
}

// -- Widget Library (shared drawer, filtered by active tab) --
// Widget library content is built from developer-defined registry data (title, icon,
// description) -- not user input. Safe for innerHTML construction.

function renderWidgetLibrary(tabId) {
  tabId = tabId || _activeWidgetTab || 'dashboard';
  var inst = _widgetInstances[tabId];
  if (!inst) return;

  var list = document.getElementById('widget-library-list');
  if (!list) return;

  var visibleIds = new Set(getVisibleWidgetIds(tabId));
  var allowedSet = inst.config.allowedWidgets ? new Set(inst.config.allowedWidgets) : null;

  var available = Object.keys(WIDGET_REGISTRY).filter(function(id) {
    if (visibleIds.has(id)) return false;
    if (allowedSet && !allowedSet.has(id)) return false;
    return true;
  });

  if (available.length === 0) {
    list.innerHTML = '<div class="ro-empty"><i class="ti ti-check"></i>' +
      '<div class="ro-empty__title">All widgets placed</div>' +
      '<div class="ro-empty__message">Every available widget is on this tab.</div></div>';
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
        '</div>' +
        '<button class="ro-btn ro-btn--outline ro-btn--xs widget-library-item__add" title="Add to tab"><i class="ti ti-plus"></i></button>' +
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
      addWidget(tabId, widgetId);
    });
  });
}

function openWidgetLibrary(tabId) {
  _activeWidgetTab = tabId || 'dashboard';
  var drawer = document.getElementById('widget-library-drawer');
  var backdrop = document.getElementById('widget-library-backdrop');
  if (drawer) drawer.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
  renderWidgetLibrary(tabId);
}

function closeWidgetLibrary() {
  var drawer = document.getElementById('widget-library-drawer');
  var backdrop = document.getElementById('widget-library-backdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

// -- Widget Operations --

function addWidget(tabId, widgetId) {
  tabId = tabId || 'dashboard';
  var inst = _widgetInstances[tabId];
  if (!inst || !inst.grid) return;
  var def = WIDGET_REGISTRY[widgetId];
  if (!def) return;

  // Determine default w/h from the tab's default layout, or use a sensible default
  var defaultItem = null;
  if (inst.config.defaultLayout) {
    defaultItem = inst.config.defaultLayout.find(function(d) { return d.id === widgetId; });
  }
  var w = defaultItem ? defaultItem.w : 6;
  var h = defaultItem ? defaultItem.h : 4;

  var overrides = inst.config.containerOverrides || {};
  var containerId = _resolveContainerId(widgetId, overrides);

  // Build DOM element with gs-* attributes, append to grid, then makeWidget()
  var gridEl = document.getElementById(inst.config.gridId);
  if (!gridEl) return;

  var itemEl = document.createElement('div');
  itemEl.className = 'grid-stack-item';
  itemEl.setAttribute('gs-id', widgetId);
  itemEl.setAttribute('gs-w', w);
  itemEl.setAttribute('gs-h', h);
  if (def.minW) itemEl.setAttribute('gs-min-w', def.minW);
  if (def.maxW) itemEl.setAttribute('gs-max-w', def.maxW);
  if (def.minH) itemEl.setAttribute('gs-min-h', def.minH);
  if (def.maxH) itemEl.setAttribute('gs-max-h', def.maxH);
  if (def.noResize) {
    itemEl.setAttribute('gs-no-resize', 'true');
    itemEl.setAttribute('gs-no-move', 'true');
  }
  itemEl.setAttribute('data-logical-size', getLogicalSize(w));

  var contentEl = document.createElement('div');
  contentEl.className = 'grid-stack-item-content';
  contentEl.innerHTML = buildGridStackItemContent(widgetId, containerId);
  itemEl.appendChild(contentEl);

  gridEl.appendChild(itemEl);
  inst.grid.makeWidget(itemEl);

  // Bind remove button
  var removeBtn = contentEl.querySelector('.widget-action--remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', function() {
      removeWidget(tabId, widgetId);
    });
  }

  // Update in-memory layout and save
  _saveCurrentLayout(tabId);
  renderWidgetLibrary(tabId);
  _triggerTabReload(tabId);
}

function removeWidget(tabId, widgetId) {
  tabId = tabId || 'dashboard';
  var inst = _widgetInstances[tabId];
  if (!inst || !inst.grid) return;

  // Find the DOM element for this widget
  var gridEl = document.getElementById(inst.config.gridId);
  if (!gridEl) return;
  var el = null;
  gridEl.querySelectorAll('.grid-stack-item').forEach(function(item) {
    if (item.gridstackNode && item.gridstackNode.id === widgetId) {
      el = item;
    }
  });

  if (el) {
    // Destroy any Chart.js instances in this widget before removing
    if (typeof destroyChart === 'function') {
      var overrides = inst.config.containerOverrides || {};
      var cid = _resolveContainerId(widgetId, overrides);
      if (cid) destroyChart(cid);
    }
    inst.grid.removeWidget(el);
  }

  // Update in-memory layout and save
  _saveCurrentLayout(tabId);
  renderWidgetLibrary(tabId);
}

function setDefaultLayout(tabId) {
  tabId = tabId || 'dashboard';
  var inst = _widgetInstances[tabId];
  if (!inst || !inst.grid) return;
  if (typeof showModalNew === 'function') {
    showModalNew({
      title: 'Set as Default',
      body: 'Save the current layout as your default for this tab? "Reset" will restore to this layout.',
      confirmLabel: 'Set Default',
      onConfirm: function() {
        var items = inst.grid.save(false);
        if (Array.isArray(items)) {
          saveCustomDefault(inst.config.storagePrefix, inst.userId, items);
          if (typeof showToastNew === 'function') showToastNew('Default layout saved', 'success');
        }
      }
    });
  } else {
    var items = inst.grid.save(false);
    if (Array.isArray(items)) {
      saveCustomDefault(inst.config.storagePrefix, inst.userId, items);
    }
  }
}

function resetWidgetLayout(tabId) {
  tabId = tabId || 'dashboard';
  var inst = _widgetInstances[tabId];
  if (!inst) return;
  var customDefault = loadCustomDefault(inst.config.storagePrefix, inst.userId);
  var resetTarget = customDefault || inst.config.defaultLayout;
  var label = customDefault ? 'your saved default' : 'the built-in default';
  if (typeof showModalNew === 'function') {
    showModalNew({
      title: 'Reset Layout',
      body: 'Reset this tab to ' + label + ' layout? Your current customizations will be lost.',
      confirmLabel: 'Reset',
      confirmClass: 'ro-btn--danger',
      onConfirm: function() {
        inst.layout = JSON.parse(JSON.stringify(resetTarget));
        saveWidgetLayout(inst.config.storagePrefix, inst.userId, inst.layout);
        renderWidgetGrid(tabId);
        renderWidgetLibrary(tabId);
        _triggerTabReload(tabId);
        if (typeof showToastNew === 'function') showToastNew('Layout reset to defaults', 'success');
      }
    });
  } else {
    inst.layout = JSON.parse(JSON.stringify(resetTarget));
    saveWidgetLayout(inst.config.storagePrefix, inst.userId, inst.layout);
    renderWidgetGrid(tabId);
    renderWidgetLibrary(tabId);
    _triggerTabReload(tabId);
  }
}

// Helper: trigger reload for the tab after widget add/remove/reset
function _triggerTabReload(tabId) {
  if (tabId === 'dashboard' && typeof loadDashboardWidgets === 'function') {
    loadDashboardWidgets();
  } else if (tabId === 'hotspots' && typeof loadHotspotsWidgets === 'function') {
    loadHotspotsWidgets();
  } else if (tabId === 'milestones' && typeof loadMilestonesWidgets === 'function') {
    loadMilestonesWidgets();
  } else if (tabId === 'attendance' && typeof loadAttendanceWidgets === 'function') {
    loadAttendanceWidgets();
  } else if (typeof loadAllAnalytics === 'function') {
    loadAllAnalytics();
  }
}

// -- Edit Mode --

function toggleWidgetEditMode(tabId) {
  tabId = tabId || 'dashboard';
  var inst = _widgetInstances[tabId];
  if (!inst) return;

  inst.editMode = !inst.editMode;
  var gridEl = document.getElementById(inst.config.gridId);
  var ids = inst.config.toolbarIds;
  var toolbar = ids ? document.getElementById(ids.toolbar) : null;
  var customizeBtn = ids ? document.getElementById(ids.customize) : null;

  // Toggle GridStack static mode
  if (inst.grid) {
    inst.grid.setStatic(!inst.editMode);
  }

  // Toggle visual editing class on the grid container
  if (gridEl) {
    gridEl.classList.toggle('gs-editing', inst.editMode);
  }

  // Toggle toolbar visibility
  if (toolbar) toolbar.style.display = inst.editMode ? '' : 'none';
  if (customizeBtn) customizeBtn.style.display = inst.editMode ? 'none' : '';

  if (!inst.editMode) {
    closeWidgetLibrary();
  }
}

// -- Data Loading --

function loadSingleWidget(widgetId, containerId) {
  var loader = _widgetLoaders[widgetId];
  if (loader) {
    try { loader(containerId); } catch (e) { console.warn('Widget loader error:', widgetId, e); }
  }
}

function loadVisibleWidgets(tabId) {
  tabId = tabId || 'dashboard';
  var inst = _widgetInstances[tabId];
  if (!inst || !inst.layout) return;
  var overrides = inst.config.containerOverrides || {};
  inst.layout.forEach(function(w) {
    var cid = _resolveContainerId(w.id, overrides);
    var container = cid ? document.getElementById(cid) : null;
    if (container && typeof showAnalyticsSkeleton === 'function') {
      var skeletonType = 'chart';
      if (w.id === 'kpi-grid' || w.id === 'attendance-kpis') skeletonType = 'kpi';
      else if (w.id === 'peak-hours' || w.id === 'route-demand-matrix') skeletonType = 'heatmap';
      else if (w.id === 'ride-outcomes' || w.id === 'attendance-donut') skeletonType = 'donut';
      else if (['top-routes', 'driver-leaderboard', 'shift-coverage', 'punctuality-table'].indexOf(w.id) !== -1) skeletonType = 'table';
      showAnalyticsSkeleton(cid, skeletonType);
    }
  });
}

// -- Tab Initialization --

function initTabWidgets(tabId, userId) {
  var inst = _widgetInstances[tabId];
  if (!inst) return;
  inst.userId = userId;

  // Load saved layout or use defaults
  var saved = loadWidgetLayout(inst.config.storagePrefix, userId);
  inst.layout = saved || JSON.parse(JSON.stringify(inst.config.defaultLayout));

  // Filter out widgets not allowed on this tab
  if (inst.config.allowedWidgets) {
    var allowed = new Set(inst.config.allowedWidgets);
    inst.layout = inst.layout.filter(function(w) { return allowed.has(w.id); });
  }

  // Render the grid
  renderWidgetGrid(tabId);

  // Bind edit mode controls for this tab
  var ids = inst.config.toolbarIds;
  if (!ids) return;

  var customizeBtn = document.getElementById(ids.customize);
  if (customizeBtn) {
    var newBtn = customizeBtn.cloneNode(true);
    customizeBtn.parentNode.replaceChild(newBtn, customizeBtn);
    newBtn.addEventListener('click', function() { toggleWidgetEditMode(tabId); });
    // GridStack is always available (CDN loaded before this script)
    if (typeof GridStack === 'undefined') newBtn.style.display = 'none';
  }

  var doneBtn = document.getElementById(ids.done);
  if (doneBtn) {
    var newDone = doneBtn.cloneNode(true);
    doneBtn.parentNode.replaceChild(newDone, doneBtn);
    newDone.addEventListener('click', function() { toggleWidgetEditMode(tabId); });
  }

  var setDefaultBtn = ids.setDefault ? document.getElementById(ids.setDefault) : null;
  if (setDefaultBtn) {
    var newSetDefault = setDefaultBtn.cloneNode(true);
    setDefaultBtn.parentNode.replaceChild(newSetDefault, setDefaultBtn);
    newSetDefault.addEventListener('click', function() { setDefaultLayout(tabId); });
  }

  var addBtn = document.getElementById(ids.add);
  if (addBtn) {
    var newAdd = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAdd, addBtn);
    newAdd.addEventListener('click', function() { openWidgetLibrary(tabId); });
  }

  var resetBtn = document.getElementById(ids.reset);
  if (resetBtn) {
    var newReset = resetBtn.cloneNode(true);
    resetBtn.parentNode.replaceChild(newReset, resetBtn);
    newReset.addEventListener('click', function() { resetWidgetLayout(tabId); });
  }
}

// -- Backward-Compatible Initialization (Dashboard) --

function initWidgetSystem(userId) {
  if (!_widgetInstances['dashboard']) {
    createWidgetInstance('dashboard', {
      gridId: 'widget-grid',
      storagePrefix: 'dashboard',
      defaultLayout: DEFAULT_WIDGET_LAYOUT,
      allowedWidgets: null,
      containerOverrides: null,
      toolbarIds: {
        customize: 'widget-customize-btn',
        toolbar: 'widget-toolbar',
        done: 'widget-done-btn',
        setDefault: 'widget-setdefault-btn',
        add: 'widget-add-btn',
        reset: 'widget-reset-btn'
      }
    });
  }
  initTabWidgets('dashboard', userId);

  // Bind shared library drawer close buttons
  var libClose = document.getElementById('widget-library-close');
  if (libClose) {
    var newClose = libClose.cloneNode(true);
    libClose.parentNode.replaceChild(newClose, libClose);
    newClose.addEventListener('click', closeWidgetLibrary);
  }

  var libBackdrop = document.getElementById('widget-library-backdrop');
  if (libBackdrop) {
    var newBackdrop = libBackdrop.cloneNode(true);
    libBackdrop.parentNode.replaceChild(newBackdrop, libBackdrop);
    newBackdrop.addEventListener('click', closeWidgetLibrary);
  }

  // Sync backward-compat globals
  _syncDashboardGlobals();
}

// -- Backward-compatible globals --

var _widgetLayout = null;
var _widgetEditMode = false;
var _widgetUserId = null;

function _syncDashboardGlobals() {
  var inst = _widgetInstances['dashboard'];
  if (inst) {
    _widgetLayout = inst.layout;
    _widgetEditMode = inst.editMode;
    _widgetUserId = inst.userId;
  }
}
