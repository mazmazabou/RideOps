// Widget Registry — defines all available analytics widgets (ported from widget-registry.js)

export const WIDGET_LAYOUT_VERSION = 11;

export const WIDGET_CATEGORIES = {
  overview: 'Overview',
  rides: 'Rides',
  drivers: 'Drivers',
  riders: 'Riders',
  fleet: 'Fleet',
  locations: 'Locations',
  attendance: 'Attendance',
  achievements: 'Achievements',
};

export const WIDGET_REGISTRY = {
  // -- Dashboard KPI widgets (6) --
  'kpi-total-rides': {
    title: 'Total Rides',
    icon: 'ti-car',
    category: 'overview',
    skeletonType: 'kpi-single',
    isKPI: true,
    minW: 2, maxW: 4, minH: 1, maxH: 2,
  },
  'kpi-completion-rate': {
    title: 'Completion Rate',
    icon: 'ti-circle-check',
    category: 'overview',
    skeletonType: 'kpi-single',
    isKPI: true,
    minW: 2, maxW: 4, minH: 1, maxH: 2,
  },
  'kpi-no-show-rate': {
    title: 'No-Show Rate',
    icon: 'ti-user-x',
    category: 'overview',
    skeletonType: 'kpi-single',
    isKPI: true,
    minW: 2, maxW: 4, minH: 1, maxH: 2,
  },
  'kpi-active-riders': {
    title: 'Active Riders',
    icon: 'ti-users',
    category: 'overview',
    skeletonType: 'kpi-single',
    isKPI: true,
    minW: 2, maxW: 4, minH: 1, maxH: 2,
  },
  'kpi-driver-punctuality': {
    title: 'Driver Punctuality',
    icon: 'ti-clock-check',
    category: 'overview',
    skeletonType: 'kpi-single',
    isKPI: true,
    minW: 2, maxW: 4, minH: 1, maxH: 2,
  },
  'kpi-fleet-available': {
    title: 'Fleet Available',
    icon: 'ti-bus',
    category: 'overview',
    skeletonType: 'kpi-single',
    isKPI: true,
    minW: 2, maxW: 4, minH: 1, maxH: 2,
  },
  'ride-volume': {
    title: 'Ride Volume',
    icon: 'ti-chart-area-line',
    category: 'rides',
    skeletonType: 'chart',
    minW: 3, maxW: 12, minH: 3, maxH: 6,
  },
  'ride-outcomes': {
    title: 'Ride Outcomes',
    icon: 'ti-chart-donut-3',
    category: 'rides',
    skeletonType: 'donut',
    minW: 2, maxW: 12, minH: 3, maxH: 6,
  },
  'peak-hours': {
    title: 'Peak Hours',
    icon: 'ti-flame',
    category: 'rides',
    skeletonType: 'heatmap',
    minW: 4, maxW: 12, minH: 3, maxH: 7,
  },
  'rides-by-dow': {
    title: 'Rides by Day of Week',
    icon: 'ti-calendar-stats',
    category: 'rides',
    skeletonType: 'chart',
    minW: 3, maxW: 12, minH: 3, maxH: 6,
  },
  'rides-by-hour': {
    title: 'Rides by Hour',
    icon: 'ti-clock-hour-4',
    category: 'rides',
    skeletonType: 'chart',
    minW: 3, maxW: 12, minH: 3, maxH: 6,
  },
  'top-routes': {
    title: 'Top Routes',
    icon: 'ti-route',
    category: 'rides',
    skeletonType: 'table',
    minW: 3, maxW: 12, minH: 3, maxH: 7,
  },
  'driver-leaderboard': {
    title: 'Driver Leaderboard',
    icon: 'ti-steering-wheel',
    category: 'drivers',
    skeletonType: 'table',
    minW: 3, maxW: 12, minH: 3, maxH: 7,
  },
  'shift-coverage': {
    title: 'Shift Coverage',
    icon: 'ti-calendar-stats',
    category: 'drivers',
    skeletonType: 'table',
    minW: 3, maxW: 12, minH: 3, maxH: 8,
  },
  'fleet-utilization': {
    title: 'Fleet Utilization',
    icon: 'ti-bus',
    category: 'fleet',
    skeletonType: 'chart',
    minW: 3, maxW: 12, minH: 2, maxH: 6,
  },
  'rider-cohorts': {
    title: 'Rider Cohorts',
    icon: 'ti-users-group',
    category: 'riders',
    skeletonType: 'chart',
    minW: 1, maxW: 12, minH: 2, maxH: 8,
  },
  'hotspot-pickups': {
    title: 'Top Pickup Locations',
    icon: 'ti-map-pin',
    category: 'locations',
    skeletonType: 'chart',
    minW: 3, maxW: 12, minH: 3, maxH: 6,
  },
  'hotspot-dropoffs': {
    title: 'Top Dropoff Locations',
    icon: 'ti-map-pin-filled',
    category: 'locations',
    skeletonType: 'chart',
    minW: 3, maxW: 12, minH: 3, maxH: 6,
  },
  'route-demand-matrix': {
    title: 'Route Demand Matrix',
    icon: 'ti-grid-dots',
    category: 'locations',
    skeletonType: 'heatmap',
    minW: 4, maxW: 12, minH: 3, maxH: 7,
  },
  'hotspot-top-routes': {
    title: 'Top Routes (Hotspots)',
    icon: 'ti-route',
    category: 'locations',
    skeletonType: 'table',
    minW: 3, maxW: 12, minH: 3, maxH: 6,
  },
  'driver-milestones': {
    title: 'Driver Milestones',
    icon: 'ti-trophy',
    category: 'achievements',
    skeletonType: 'chart',
    minW: 3, maxW: 12, minH: 3, maxH: 8,
  },
  'rider-milestones': {
    title: 'Rider Milestones',
    icon: 'ti-award',
    category: 'achievements',
    skeletonType: 'chart',
    minW: 3, maxW: 12, minH: 3, maxH: 8,
  },
  // -- Attendance KPI widgets (5) --
  'kpi-total-clock-ins': {
    title: 'Total Clock-Ins',
    icon: 'ti-clock',
    category: 'attendance',
    skeletonType: 'kpi-single',
    isKPI: true,
    minW: 2, maxW: 4, minH: 1, maxH: 2,
  },
  'kpi-on-time-rate': {
    title: 'On-Time Rate',
    icon: 'ti-circle-check',
    category: 'attendance',
    skeletonType: 'kpi-single',
    isKPI: true,
    minW: 2, maxW: 4, minH: 1, maxH: 2,
  },
  'kpi-tardy-count': {
    title: 'Tardy Count',
    icon: 'ti-clock-exclamation',
    category: 'attendance',
    skeletonType: 'kpi-single',
    isKPI: true,
    minW: 2, maxW: 4, minH: 1, maxH: 2,
  },
  'kpi-avg-tardiness': {
    title: 'Avg Tardiness',
    icon: 'ti-hourglass',
    category: 'attendance',
    skeletonType: 'kpi-single',
    isKPI: true,
    minW: 2, maxW: 4, minH: 1, maxH: 2,
  },
  'kpi-missed-shifts': {
    title: 'Missed Shifts',
    icon: 'ti-calendar-off',
    category: 'attendance',
    skeletonType: 'kpi-single',
    isKPI: true,
    minW: 2, maxW: 4, minH: 1, maxH: 2,
  },
  'attendance-donut': {
    title: 'Attendance Distribution',
    icon: 'ti-chart-donut-3',
    category: 'attendance',
    skeletonType: 'donut',
    minW: 3, maxW: 9, minH: 3, maxH: 5,
  },
  'tardiness-by-dow': {
    title: 'Tardiness by Day',
    icon: 'ti-calendar-stats',
    category: 'attendance',
    skeletonType: 'chart',
    minW: 3, maxW: 9, minH: 3, maxH: 5,
  },
  'tardiness-trend': {
    title: 'Tardiness Trend',
    icon: 'ti-trending-up',
    category: 'attendance',
    skeletonType: 'chart',
    minW: 3, maxW: 12, minH: 3, maxH: 6,
  },
  'punctuality-table': {
    title: 'Punctuality by Driver',
    icon: 'ti-table',
    category: 'attendance',
    skeletonType: 'table',
    minW: 3, maxW: 12, minH: 3, maxH: 8,
  },
};

export const DEFAULT_WIDGET_LAYOUT = [
  // Row 0: 6 KPI widgets (h: 1 each, total row height = 80px)
  { id: 'kpi-total-rides',       x: 0,  y: 0, w: 2, h: 1 },
  { id: 'kpi-completion-rate',   x: 2,  y: 0, w: 2, h: 1 },
  { id: 'kpi-no-show-rate',      x: 4,  y: 0, w: 2, h: 1 },
  { id: 'kpi-active-riders',     x: 6,  y: 0, w: 2, h: 1 },
  { id: 'kpi-driver-punctuality',x: 8,  y: 0, w: 2, h: 1 },
  { id: 'kpi-fleet-available',   x: 10, y: 0, w: 2, h: 1 },
  // Row 1: charts begin
  { id: 'ride-volume',           x: 0,  y: 1, w: 9,  h: 4 },
  { id: 'ride-outcomes',         x: 9,  y: 1, w: 3,  h: 4 },
  { id: 'peak-hours',            x: 0,  y: 5, w: 12, h: 5 },
  { id: 'rides-by-dow',          x: 0,  y: 10, w: 4,  h: 4 },
  { id: 'rides-by-hour',         x: 4,  y: 10, w: 4,  h: 4 },
  { id: 'top-routes',            x: 8,  y: 10, w: 4,  h: 4 },
  { id: 'driver-leaderboard',    x: 0,  y: 14, w: 6,  h: 4 },
  { id: 'shift-coverage',        x: 6,  y: 14, w: 6,  h: 5 },
  { id: 'fleet-utilization',     x: 0,  y: 19, w: 6,  h: 3 },
  { id: 'rider-cohorts',         x: 6,  y: 19, w: 6,  h: 3 },
];

export const DEFAULT_HOTSPOTS_LAYOUT = [
  { id: 'hotspot-pickups',      x: 0,  y: 0,  w: 6,  h: 4 },
  { id: 'hotspot-dropoffs',     x: 6,  y: 0,  w: 6,  h: 4 },
  { id: 'hotspot-top-routes',   x: 0,  y: 4,  w: 9,  h: 4 },
  { id: 'route-demand-matrix',  x: 0,  y: 8,  w: 12, h: 5 },
];

export const DEFAULT_MILESTONES_LAYOUT = [
  { id: 'driver-milestones',  x: 0,  y: 0,  w: 6,  h: 4 },
  { id: 'rider-milestones',   x: 6,  y: 0,  w: 6,  h: 4 },
];

export const DEFAULT_ATTENDANCE_LAYOUT = [
  // Row 0: 5 KPI widgets (2+3+2+2+3 = 12 columns)
  { id: 'kpi-total-clock-ins',   x: 0,  y: 0, w: 2, h: 1 },
  { id: 'kpi-on-time-rate',      x: 2,  y: 0, w: 3, h: 1 },
  { id: 'kpi-tardy-count',       x: 5,  y: 0, w: 2, h: 1 },
  { id: 'kpi-avg-tardiness',     x: 7,  y: 0, w: 2, h: 1 },
  { id: 'kpi-missed-shifts',     x: 9,  y: 0, w: 3, h: 1 },
  // Row 1: charts
  { id: 'attendance-donut',      x: 0,  y: 1, w: 4,  h: 4 },
  { id: 'tardiness-by-dow',      x: 4,  y: 1, w: 4,  h: 4 },
  { id: 'tardiness-trend',       x: 8,  y: 1, w: 4,  h: 4 },
  { id: 'punctuality-table',     x: 0,  y: 5, w: 12, h: 5 },
];

// Tab configs used by WidgetGrid
export const TAB_CONFIGS = {
  dashboard: {
    storagePrefix: 'dashboard',
    defaultLayout: DEFAULT_WIDGET_LAYOUT,
    allowedWidgets: [
      'kpi-total-rides', 'kpi-completion-rate', 'kpi-no-show-rate',
      'kpi-active-riders', 'kpi-driver-punctuality', 'kpi-fleet-available',
      'ride-volume', 'ride-outcomes', 'peak-hours',
      'rides-by-dow', 'rides-by-hour', 'top-routes',
      'driver-leaderboard', 'shift-coverage', 'fleet-utilization', 'rider-cohorts',
    ],
  },
  hotspots: {
    storagePrefix: 'hotspots',
    defaultLayout: DEFAULT_HOTSPOTS_LAYOUT,
    allowedWidgets: ['hotspot-pickups', 'hotspot-dropoffs', 'hotspot-top-routes', 'route-demand-matrix'],
  },
  milestones: {
    storagePrefix: 'milestones',
    defaultLayout: DEFAULT_MILESTONES_LAYOUT,
    allowedWidgets: ['driver-milestones', 'rider-milestones'],
  },
  attendance: {
    storagePrefix: 'attendance',
    defaultLayout: DEFAULT_ATTENDANCE_LAYOUT,
    allowedWidgets: [
      'kpi-total-clock-ins', 'kpi-on-time-rate', 'kpi-tardy-count',
      'kpi-avg-tardiness', 'kpi-missed-shifts',
      'attendance-donut', 'tardiness-by-dow', 'tardiness-trend', 'punctuality-table',
    ],
  },
};

// Report sheet definitions for Excel export
export const REPORT_SHEETS = {
  full: {
    label: 'Full Report (All Sheets)',
    desc: 'Comprehensive export with all available data sheets.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Daily Volume', icon: 'ti-chart-bar', desc: 'Rides per day with status breakdown' },
      { name: 'Routes', icon: 'ti-route', desc: 'Top routes by frequency' },
      { name: 'Driver Performance', icon: 'ti-steering-wheel', desc: 'Per-driver rides, punctuality, hours' },
      { name: 'Rider Analysis', icon: 'ti-users', desc: 'Active, new, returning, and at-risk riders' },
      { name: 'Fleet', icon: 'ti-car', desc: 'Vehicle usage and maintenance' },
      { name: 'Shift Coverage', icon: 'ti-clock', desc: 'Scheduled vs actual driver-hours' },
      { name: 'Peak Hours', icon: 'ti-flame', desc: 'Day-of-week by hour heatmap' },
    ],
  },
  rides: {
    label: 'Rides Only',
    desc: 'Ride volume, daily trends, and popular routes.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Daily Volume', icon: 'ti-chart-bar', desc: 'Rides per day with status breakdown' },
      { name: 'Routes', icon: 'ti-route', desc: 'Top routes by frequency' },
    ],
  },
  drivers: {
    label: 'Driver Performance',
    desc: 'Driver scorecards and shift coverage analysis.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Driver Performance', icon: 'ti-steering-wheel', desc: 'Per-driver rides, punctuality, hours' },
      { name: 'Shift Coverage', icon: 'ti-clock', desc: 'Scheduled vs actual driver-hours' },
    ],
  },
  riders: {
    label: 'Rider Analysis',
    desc: 'Rider cohorts, activity, and engagement metrics.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Rider Analysis', icon: 'ti-users', desc: 'Active, new, returning, and at-risk riders' },
    ],
  },
  fleet: {
    label: 'Fleet Report',
    desc: 'Vehicle utilization and maintenance history.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Fleet', icon: 'ti-car', desc: 'Vehicle usage and maintenance' },
    ],
  },
};

// -- KPI color class helpers --

export function getCompletionClass(rate) {
  if (rate >= 85) return 'kpi-card--good';
  if (rate >= 70) return 'kpi-card--warning';
  return 'kpi-card--danger';
}

export function getNoShowClass(rate) {
  if (rate <= 5) return 'kpi-card--good';
  if (rate <= 15) return 'kpi-card--warning';
  return 'kpi-card--danger';
}

export function getPunctualityClass(rate) {
  if (rate >= 90) return 'kpi-card--good';
  if (rate >= 80) return 'kpi-card--warning';
  return 'kpi-card--danger';
}

export function getTardyClass(count) {
  return count === 0 ? 'kpi-card--good' : 'kpi-card--danger';
}

export function getMissedShiftsClass(count) {
  if (count === 0) return 'kpi-card--good';
  if (count <= 3) return 'kpi-card--warning';
  return 'kpi-card--danger';
}

export function getAvgTardinessClass(minutes) {
  if (minutes <= 0) return 'kpi-card--good';
  if (minutes <= 10) return 'kpi-card--warning';
  return 'kpi-card--danger';
}

export function getLogicalSize(gridStackW) {
  if (gridStackW <= 3) return 'xs';
  if (gridStackW <= 6) return 'sm';
  if (gridStackW <= 9) return 'md';
  return 'lg';
}

export function findNextPosition(layout, w, h, cols = 12) {
  if (!layout || layout.length === 0) return { x: 0, y: 0 };
  const colHeights = new Array(cols).fill(0);
  for (const item of layout) {
    const bottom = item.y + item.h;
    for (let c = item.x; c < item.x + item.w && c < cols; c++) {
      colHeights[c] = Math.max(colHeights[c], bottom);
    }
  }
  let bestX = 0, bestY = Infinity;
  for (let x = 0; x <= cols - w; x++) {
    let maxH = 0;
    for (let c = x; c < x + w; c++) maxH = Math.max(maxH, colHeights[c]);
    if (maxH < bestY) { bestY = maxH; bestX = x; }
  }
  return { x: bestX, y: bestY };
}

export function resolveColor(cssVar) {
  if (!cssVar || !cssVar.startsWith('var(')) return cssVar;
  const propName = cssVar.replace(/^var\(/, '').replace(/\)$/, '').trim();
  return getComputedStyle(document.documentElement).getPropertyValue(propName).trim() || cssVar;
}
