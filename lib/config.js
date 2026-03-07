// lib/config.js — Pure configuration, no runtime dependencies
'use strict';

const fs = require('fs');
const path = require('path');

// ----- Tenant configuration -----

const DEFAULT_TENANT = {
  orgName: 'RideOps',
  orgShortName: 'RideOps',
  orgTagline: 'Accessible Campus Transportation',
  orgInitials: 'RO',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  primaryColor: '#4682B4',
  secondaryColor: '#D2B48C',
  secondaryTextColor: '#4B3A2A',
  sidebarBg: '#1E2B3A',
  sidebarText: '#94A3B8',
  sidebarActiveBg: 'rgba(70,130,180,0.15)',
  sidebarHover: 'rgba(255,255,255,0.06)',
  sidebarBorder: 'rgba(255,255,255,0.08)',
  headerBg: '#EEF3F8',
  mapUrl: null,
  mapTitle: 'Campus Map',
  idFieldLabel: 'Member ID',
  idFieldMaxLength: null,
  idFieldPattern: null,
  idFieldPlaceholder: '',
  serviceScopeText: 'Campus only',
  locationsFile: null,
  rules: [
    'This is a free accessible transportation service available during the academic year, between 8:00am–7:00pm, Monday–Friday.',
    'Vehicles (golf carts) are not street-legal and cannot leave campus grounds.',
    'If the driver arrives and the rider is not present, the driver will wait up to 5 minutes (grace period). After 5 minutes, the ride is marked as a no-show.',
    '5 consecutive no-shows will result in automatic service termination. Completed rides reset the no-show counter.',
    'Riders must be present at the designated pickup location at the requested time.'
  ]
};

function loadTenantConfig() {
  const tenantFile = process.env.TENANT_FILE;
  if (!tenantFile) return { ...DEFAULT_TENANT };
  try {
    const overrides = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', tenantFile), 'utf8'));
    return { ...DEFAULT_TENANT, ...overrides };
  } catch (err) {
    console.warn(`[tenant] Could not load ${tenantFile}, using defaults.`);
    return { ...DEFAULT_TENANT };
  }
}

// ----- Org-scoped campus slugs -----

const VALID_ORG_SLUGS = ['usc', 'stanford', 'ucla', 'uci'];

// ----- Notification event types -----

const NOTIFICATION_EVENT_TYPES = [
  // Office-targeted (existing)
  { key: 'driver_tardy', label: 'Driver Clocked In Late', description: 'A driver clocks in after their scheduled shift start time', defaultThreshold: null, thresholdUnit: null, category: 'staff', targetRole: 'office' },
  { key: 'rider_no_show', label: 'Rider No-Show', description: 'A rider is marked as a no-show', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'office' },
  { key: 'rider_approaching_termination', label: 'Rider Approaching Termination', description: 'A rider reaches N-1 consecutive no-shows', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'office' },
  { key: 'rider_terminated', label: 'Rider Terminated', description: 'A rider hits the max no-show strikes and is terminated', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'office' },
  { key: 'ride_pending_stale', label: 'Ride Pending Too Long', description: 'A ride request has been pending with no action for X minutes', defaultThreshold: 10, thresholdUnit: 'minutes', category: 'rides', targetRole: 'office' },
  { key: 'driver_missed_ride', label: 'Driver Missed Assigned Ride', description: 'A scheduled ride passes its requested time without the assigned driver starting it', defaultThreshold: 15, thresholdUnit: 'minutes', category: 'rides', targetRole: 'office' },
  { key: 'new_ride_request', label: 'New Ride Request', description: 'A new ride is submitted by a rider', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'office' },

  // Driver-targeted (new)
  { key: 'driver_upcoming_ride', label: 'Upcoming Ride Reminder', description: 'A reminder ~15 minutes before your scheduled ride', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'driver' },
  { key: 'driver_new_assignment', label: 'New Ride Assigned', description: 'A ride has been assigned to you', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'driver' },
  { key: 'driver_ride_cancelled', label: 'Ride Cancelled', description: 'A ride assigned to you was cancelled', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'driver' },
  { key: 'driver_late_clock_in', label: 'Late Clock-In Notice', description: 'You clocked in after your shift start time', defaultThreshold: null, thresholdUnit: null, category: 'staff', targetRole: 'driver' },
  { key: 'driver_missed_shift', label: 'Missed Shift Notice', description: 'A shift ended without a clock-in', defaultThreshold: null, thresholdUnit: null, category: 'staff', targetRole: 'driver' },

  // Rider-targeted (new)
  { key: 'rider_ride_approved', label: 'Ride Approved', description: 'Your ride request was approved', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'rider' },
  { key: 'rider_ride_denied', label: 'Ride Denied', description: 'Your ride request was denied', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'rider' },
  { key: 'rider_driver_on_way', label: 'Driver On The Way', description: 'Your driver is heading to the pickup location', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'rider' },
  { key: 'rider_driver_arrived', label: 'Driver Arrived', description: 'Your driver has arrived at the pickup location', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'rider' },
  { key: 'rider_ride_completed', label: 'Ride Completed', description: 'Your ride has been completed', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'rider' },
  { key: 'rider_ride_cancelled', label: 'Ride Cancelled', description: 'Your ride has been cancelled', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'rider' },
  { key: 'rider_no_show_notice', label: 'Missed Ride Notice', description: 'You were marked as a no-show', defaultThreshold: null, thresholdUnit: null, category: 'rides', targetRole: 'rider' },
  { key: 'rider_strike_warning', label: 'Service Warning', description: 'You are approaching the no-show limit', defaultThreshold: null, thresholdUnit: null, category: 'account', targetRole: 'rider' },
  { key: 'rider_terminated_notice', label: 'Service Suspended', description: 'Your ride service has been suspended', defaultThreshold: null, thresholdUnit: null, category: 'account', targetRole: 'rider' },
];

// ----- Configurable setting defaults & types -----

const SETTING_DEFAULTS = {
  max_no_show_strikes: '5',
  grace_period_minutes: '5',
  strikes_enabled: 'true',
  tardy_threshold_minutes: '1',
  service_hours_start: '08:00',
  service_hours_end: '19:00',
  operating_days: '0,1,2,3,4,5,6',
  auto_deny_outside_hours: 'true',
  notify_office_tardy: 'true',
  notify_rider_no_show: 'true',
  notify_rider_strike_warning: 'true'
};

const SETTING_TYPES = {
  max_no_show_strikes: 'number',
  grace_period_minutes: 'number',
  strikes_enabled: 'boolean',
  tardy_threshold_minutes: 'number',
  service_hours_start: 'time',
  service_hours_end: 'time',
  operating_days: 'string',
  auto_deny_outside_hours: 'boolean',
  notify_office_tardy: 'boolean',
  notify_rider_no_show: 'boolean',
  notify_rider_strike_warning: 'boolean'
};

// ----- Auth constants -----

const MIN_PASSWORD_LENGTH = 8;

// ----- Exports -----

module.exports = {
  DEFAULT_TENANT,
  loadTenantConfig,
  VALID_ORG_SLUGS,
  NOTIFICATION_EVENT_TYPES,
  SETTING_DEFAULTS,
  SETTING_TYPES,
  MIN_PASSWORD_LENGTH
};
