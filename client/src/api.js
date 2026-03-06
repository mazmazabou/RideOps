import { getCampusSlug } from './utils/campus';

function campusParam() {
  const slug = getCampusSlug();
  return slug ? '?campus=' + encodeURIComponent(slug) : '';
}

async function request(url, opts = {}) {
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(res.ok ? 'Server returned an unexpected response' : `Request failed (${res.status})`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Auth
export function fetchMe() {
  return fetch('/api/auth/me').then(r => r.ok ? r.json() : null).catch(() => null);
}

export function doLogout() {
  return fetch('/api/auth/logout', { method: 'POST' });
}

// Tenant
export function fetchTenantConfig() {
  return request('/api/tenant-config' + campusParam());
}

// Locations
export function fetchLocations() {
  return request('/api/locations' + campusParam());
}

// Operations config
export function fetchOpsConfig() {
  return fetch('/api/settings/public/operations')
    .then(r => r.ok ? r.json() : null)
    .then(cfg => cfg || {
      service_hours_start: '08:00',
      service_hours_end: '19:00',
      operating_days: '0,1,2,3,4',
      grace_period_minutes: '5',
    })
    .catch(() => ({
      service_hours_start: '08:00',
      service_hours_end: '19:00',
      operating_days: '0,1,2,3,4',
      grace_period_minutes: '5',
    }));
}

// Rides
export function fetchMyRides() {
  return request('/api/my-rides');
}

export function submitRide(data) {
  return request('/api/rides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function cancelRide(id) {
  return request('/api/rides/' + id + '/cancel', { method: 'POST' });
}

// Recurring rides
export function fetchRecurringRides() {
  return request('/api/recurring-rides/my');
}

export function createRecurringRides(data) {
  return request('/api/recurring-rides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function cancelRecurringSeries(id) {
  return request('/api/recurring-rides/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  });
}

// Profile
export function fetchProfile() {
  return request('/api/me');
}

export function updateProfile(data) {
  return request('/api/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function changePassword(data) {
  return request('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// Notifications
export function fetchNotifications(limit = 50) {
  return request('/api/notifications?limit=' + limit);
}

export function fetchUnreadCount() {
  return fetch('/api/notifications?limit=1&unread_only=true')
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);
}

export function markNotifRead(id) {
  return fetch('/api/notifications/' + id + '/read', { method: 'PUT' });
}

export function markAllNotifsRead() {
  return fetch('/api/notifications/read-all', { method: 'PUT' });
}

export function bulkReadNotifs(ids) {
  return fetch('/api/notifications/bulk-read', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export function bulkDeleteNotifs(ids) {
  return fetch('/api/notifications/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export function deleteAllNotifs() {
  return fetch('/api/notifications/all', { method: 'DELETE' });
}

// Driver: employees & clock
export function fetchEmployees() {
  return request('/api/employees');
}

export function clockIn(employeeId) {
  return request('/api/employees/clock-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId }),
  });
}

export function clockOut(employeeId) {
  return request('/api/employees/clock-out', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId }),
  });
}

// Driver: rides
export function fetchAllRides(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.status) qs.set('status', params.status);
  const qStr = qs.toString();
  return request('/api/rides' + (qStr ? '?' + qStr : ''));
}

export function fetchRidesPaginated({ limit = 25, offset, cursor, status, from, to, search } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (offset != null) qs.set('offset', String(offset));
  if (cursor) qs.set('cursor', cursor);
  if (status) qs.set('status', status);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (search) qs.set('search', search);
  return request('/api/rides?' + qs.toString());
}

export function fetchVehicles() {
  return request('/api/vehicles');
}

export function claimRide(rideId) {
  return request('/api/rides/' + rideId + '/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

export function rideOnTheWay(rideId) {
  return fetch('/api/rides/' + rideId + '/on-the-way', { method: 'POST' })
    .then(r => {
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Failed'); });
      return r.json();
    });
}

export function rideArrived(rideId) {
  return fetch('/api/rides/' + rideId + '/here', { method: 'POST' })
    .then(r => {
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Failed'); });
      return r.json();
    });
}

export function completeRide(rideId) {
  return fetch('/api/rides/' + rideId + '/complete', { method: 'POST' })
    .then(r => {
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Failed'); });
      return r.json();
    });
}

export function markNoShow(rideId) {
  return fetch('/api/rides/' + rideId + '/no-show', { method: 'POST' })
    .then(r => {
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Failed'); });
      return r.json();
    });
}

export function setRideVehicle(rideId, vehicleId) {
  return request('/api/rides/' + rideId + '/set-vehicle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleId }),
  });
}

export function patchRideVehicle(rideId, vehicleId) {
  return request('/api/rides/' + rideId + '/vehicle', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle_id: vehicleId }),
  });
}

// Shifts
export function fetchShifts() {
  return request('/api/shifts');
}

// Today driver status
export function fetchTodayDriverStatus() {
  return request('/api/employees/today-status');
}

// ===== Office: Ride Actions =====
export function approveRide(id) {
  return request('/api/rides/' + id + '/approve', { method: 'POST' });
}

export function denyRide(id) {
  return request('/api/rides/' + id + '/deny', { method: 'POST' });
}

export function unassignRide(id) {
  return request('/api/rides/' + id + '/unassign', { method: 'POST' });
}

export function reassignRide(id, driverId) {
  return request('/api/rides/' + id + '/reassign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId }),
  });
}

export function assignRide(id, driverId) {
  return request('/api/rides/' + id + '/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId }),
  });
}

export function editRide(id, data) {
  return request('/api/rides/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function bulkDeleteRides(ids) {
  return request('/api/rides/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

// ===== Office: Settings =====
export function fetchSettings() {
  return request('/api/settings');
}

export function saveSettings(settingsArray) {
  return request('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settingsArray),
  });
}

// ===== Office: Admin Users =====
export function fetchAdminUsers({ includeDeleted } = {}) {
  const params = includeDeleted ? '?include_deleted=true' : '';
  return request('/api/admin/users' + params);
}

export function restoreAdminUser(id) {
  return request('/api/admin/users/' + id + '/restore', { method: 'POST' });
}

export function createAdminUser(data) {
  return request('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateAdminUser(id, data) {
  return request('/api/admin/users/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function deleteAdminUser(id) {
  return request('/api/admin/users/' + id, { method: 'DELETE' });
}

export function fetchAdminUserProfile(id) {
  return request('/api/admin/users/' + id + '/profile');
}

export function resetAdminUserPassword(id, data) {
  return request('/api/admin/users/' + id + '/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function resetMissCount(id) {
  return request('/api/admin/users/' + id + '/reset-miss-count', { method: 'POST' });
}

export function fetchEmailStatus() {
  return fetch('/api/admin/email-status')
    .then(r => r.ok ? r.json() : { configured: false })
    .catch(() => ({ configured: false }));
}

// ===== Office: Academic Terms =====
export function fetchAcademicTerms() {
  return request('/api/academic-terms');
}

export function createAcademicTerm(data) {
  return request('/api/academic-terms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateAcademicTerm(id, data) {
  return request('/api/academic-terms/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function deleteAcademicTerm(id) {
  return request('/api/academic-terms/' + id, { method: 'DELETE' });
}

// ===== Office: Program Content =====
export function fetchProgramRules() {
  return request('/api/program-rules');
}

export function saveProgramRules(data) {
  return request('/api/program-rules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ===== Office: Notification Preferences =====
export function fetchNotifPreferences() {
  return request('/api/notification-preferences');
}

export function saveNotifPreferences(data) {
  return request('/api/notification-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ===== Office: Data Management =====
export function purgeOldRides() {
  return request('/api/rides/purge-old', { method: 'POST' });
}

// ===== Office: Shift CRUD =====
export function fetchShiftsForWeek(weekStart) {
  return request('/api/shifts' + (weekStart ? '?weekStart=' + weekStart : ''));
}

export function createShift(data) {
  return request('/api/shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateShift(id, data) {
  return request('/api/shifts/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function duplicateShift(data) {
  return request('/api/shifts/duplicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function checkShiftConflict({ employeeId, dayOfWeek, weekStart, startTime, endTime }) {
  const params = new URLSearchParams({ employeeId, dayOfWeek, weekStart, startTime, endTime });
  return request('/api/shifts/check-conflict?' + params);
}

export function deleteShift(id) {
  return request('/api/shifts/' + id, { method: 'DELETE' });
}

// ===== Office: Fleet =====
export function fetchFleetVehicles() {
  return request('/api/analytics/vehicles');
}

export function createVehicle(data) {
  return request('/api/vehicles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateVehicle(id, data) {
  return request('/api/vehicles/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function deleteVehicle(id) {
  return request('/api/vehicles/' + id, { method: 'DELETE' });
}

export function retireVehicle(id) {
  return request('/api/vehicles/' + id + '/retire', { method: 'POST' });
}

export function logMaintenance(id, data) {
  return request('/api/vehicles/' + id + '/maintenance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function fetchMaintenanceLogs(id) {
  return request('/api/vehicles/' + id + '/maintenance');
}
