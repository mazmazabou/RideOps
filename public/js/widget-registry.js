/* Widget Registry — defines all available analytics widgets */
/* global WIDGET_REGISTRY, WIDGET_CATEGORIES, DEFAULT_WIDGET_LAYOUT */

var WIDGET_CATEGORIES = {
  overview: 'Overview',
  rides: 'Rides',
  drivers: 'Drivers',
  riders: 'Riders',
  fleet: 'Fleet',
  locations: 'Locations',
  attendance: 'Attendance',
  achievements: 'Achievements'
};

var WIDGET_REGISTRY = {
  'kpi-grid': {
    title: 'Key Metrics',
    icon: 'ti-dashboard',
    defaultSize: 'large',
    allowedSizes: ['large'],
    containerId: 'analytics-kpi-grid',
    containerClass: 'kpi-bar',
    category: 'overview',
    description: 'KPI cards showing totals, completion rate, and averages.'
  },
  'ride-volume': {
    title: 'Ride Volume',
    icon: 'ti-chart-area-line',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'chart-ride-volume',
    category: 'rides',
    description: 'Daily ride volume over the selected date range.'
  },
  'ride-outcomes': {
    title: 'Ride Outcomes',
    icon: 'ti-chart-donut-3',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'chart-ride-outcomes',
    category: 'rides',
    description: 'Donut chart of ride completion, cancellation, and no-show rates.'
  },
  'peak-hours': {
    title: 'Peak Hours',
    icon: 'ti-flame',
    defaultSize: 'large',
    allowedSizes: ['large'],
    containerId: 'chart-peak-hours',
    category: 'rides',
    description: 'Day-of-week by hour heatmap showing ride demand.'
  },
  'rides-by-dow': {
    title: 'Rides by Day of Week',
    icon: 'ti-calendar-stats',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'chart-dow',
    category: 'rides',
    description: 'Column chart of ride counts per day of week.'
  },
  'rides-by-hour': {
    title: 'Rides by Hour',
    icon: 'ti-clock-hour-4',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'chart-hour',
    category: 'rides',
    description: 'Column chart of ride counts per hour of the day.'
  },
  'top-routes': {
    title: 'Top Routes',
    icon: 'ti-route',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'chart-top-routes',
    category: 'rides',
    description: 'Ranked table of most popular pickup-to-dropoff routes.'
  },
  'driver-leaderboard': {
    title: 'Driver Leaderboard',
    icon: 'ti-steering-wheel',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'chart-driver-leaderboard',
    category: 'drivers',
    description: 'Driver scorecard with rides, punctuality, and hours.'
  },
  'shift-coverage': {
    title: 'Shift Coverage',
    icon: 'ti-calendar-stats',
    defaultSize: 'large',
    allowedSizes: ['large'],
    containerId: 'chart-shift-coverage',
    category: 'drivers',
    description: 'Scheduled vs actual driver hours, day-by-day gap analysis.'
  },
  'fleet-utilization': {
    title: 'Fleet Utilization',
    icon: 'ti-bus',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'chart-fleet-util',
    category: 'fleet',
    description: 'Per-vehicle ride counts and maintenance in period.'
  },
  'rider-cohorts': {
    title: 'Rider Cohorts',
    icon: 'ti-users-group',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'chart-rider-cohorts',
    category: 'riders',
    description: 'Active, new, returning, churned, at-risk rider segments.'
  },
  'hotspot-pickups': {
    title: 'Top Pickup Locations',
    icon: 'ti-map-pin',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'w-hotspot-pickups',
    category: 'locations',
    description: 'Ranked bar list of most popular pickup locations.'
  },
  'hotspot-dropoffs': {
    title: 'Top Dropoff Locations',
    icon: 'ti-map-pin-filled',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'w-hotspot-dropoffs',
    category: 'locations',
    description: 'Ranked bar list of most popular dropoff locations.'
  },
  'route-demand-matrix': {
    title: 'Route Demand Matrix',
    icon: 'ti-grid-dots',
    defaultSize: 'large',
    allowedSizes: ['large'],
    containerId: 'w-hotspot-matrix',
    category: 'locations',
    description: 'Origin-destination matrix showing route demand.'
  },
  'driver-milestones': {
    title: 'Driver Milestones',
    icon: 'ti-trophy',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'w-driver-milestones',
    category: 'achievements',
    description: 'Driver achievement badges based on cumulative rides.'
  },
  'rider-milestones': {
    title: 'Rider Milestones',
    icon: 'ti-award',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large'],
    containerId: 'w-rider-milestones',
    category: 'achievements',
    description: 'Rider achievement badges based on cumulative rides.'
  }
};

var DEFAULT_WIDGET_LAYOUT = [
  { id: 'kpi-grid', size: 'large' },
  { id: 'ride-volume', size: 'medium' },
  { id: 'ride-outcomes', size: 'medium' },
  { id: 'peak-hours', size: 'large' },
  { id: 'rides-by-dow', size: 'medium' },
  { id: 'rides-by-hour', size: 'medium' },
  { id: 'top-routes', size: 'medium' },
  { id: 'driver-leaderboard', size: 'medium' },
  { id: 'shift-coverage', size: 'large' },
  { id: 'fleet-utilization', size: 'medium' },
  { id: 'rider-cohorts', size: 'medium' }
];
