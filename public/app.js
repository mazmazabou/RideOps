// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Handle 401 session expiry on API responses — returns true if session expired
function handleSessionExpiry(res) {
  if (res.status === 401) {
    showToast('Your session has expired. Please log in again.', 'error');
    setTimeout(() => { window.location.href = '/login'; }, 2000);
    return true;
  }
  return false;
}

function getCurrentCampusPalette() {
  var key = sessionStorage.getItem('ro-demo-campus');
  if (typeof getCampusPalette === 'function') return getCampusPalette(key);
  return ['var(--color-primary)', 'var(--color-accent)', 'var(--color-primary-light)'];
}

// Loading state management
function showLoader(containerId, message = 'Loading...') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="loader">
      <div class="loader-spinner"></div>
      <p class="loader-text">${message}</p>
    </div>
  `;
}

function hideLoader(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
}

// Analytics skeleton loading states
function showAnalyticsSkeleton(containerId, type) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (type === 'chart') {
    el.innerHTML = '<div class="analytics-skeleton" style="height:200px;display:flex;align-items:flex-end;gap:8px;padding:16px;">' +
      '<div style="flex:1;background:var(--color-border);border-radius:4px 4px 0 0;height:40%;opacity:0.4;"></div>' +
      '<div style="flex:1;background:var(--color-border);border-radius:4px 4px 0 0;height:70%;opacity:0.5;"></div>' +
      '<div style="flex:1;background:var(--color-border);border-radius:4px 4px 0 0;height:55%;opacity:0.4;"></div>' +
      '<div style="flex:1;background:var(--color-border);border-radius:4px 4px 0 0;height:85%;opacity:0.6;"></div>' +
      '<div style="flex:1;background:var(--color-border);border-radius:4px 4px 0 0;height:45%;opacity:0.4;"></div>' +
      '</div>';
  } else if (type === 'table') {
    el.innerHTML = '<div class="analytics-skeleton" style="padding:16px;">' +
      '<div class="analytics-skeleton__bar analytics-skeleton__bar--full"></div>' +
      '<div class="analytics-skeleton__bar analytics-skeleton__bar--long"></div>' +
      '<div class="analytics-skeleton__bar analytics-skeleton__bar--medium"></div>' +
      '<div class="analytics-skeleton__bar analytics-skeleton__bar--short"></div>' +
      '<div class="analytics-skeleton__bar analytics-skeleton__bar--long"></div>' +
      '</div>';
  } else if (type === 'donut') {
    el.innerHTML = '<div class="analytics-skeleton" style="height:200px;display:flex;align-items:center;justify-content:center;">' +
      '<div style="width:140px;height:140px;border-radius:50%;border:24px solid var(--color-border);opacity:0.4;"></div>' +
      '</div>';
  } else if (type === 'heatmap') {
    el.innerHTML = '<div class="analytics-skeleton" style="height:280px;padding:16px;display:grid;grid-template-columns:60px repeat(5, 1fr);gap:4px;">' +
      Array(66).fill('<div style="background:var(--color-border);border-radius:3px;opacity:0.3;"></div>').join('') +
      '</div>';
  } else if (type === 'kpi') {
    el.innerHTML = Array(6).fill(
      '<div class="kpi-card kpi-card--neutral" style="opacity:0.5;">' +
      '<div class="kpi-card__value" style="background:var(--color-border);width:40px;height:28px;border-radius:4px;margin:0 auto;"></div>' +
      '<div class="kpi-card__label" style="background:var(--color-border);width:80px;height:12px;border-radius:4px;margin:8px auto 0;"></div>' +
      '</div>'
    ).join('');
  }
}

// Make analytics table headers sortable on click
function makeSortable(tableElement) {
  if (!tableElement) return;
  var headers = tableElement.querySelectorAll('thead th');
  headers.forEach(function(th, colIdx) {
    th.classList.add('sortable-header');
    th.addEventListener('click', function() {
      var tbody = tableElement.querySelector('tbody');
      var rows = Array.from(tbody.querySelectorAll('tr'));
      var currentDir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';

      // Reset other headers
      headers.forEach(function(h) { h.removeAttribute('data-sort-dir'); });
      th.dataset.sortDir = currentDir;

      rows.sort(function(a, b) {
        var aText = (a.cells[colIdx] ? a.cells[colIdx].textContent.trim().replace('%', '') : '');
        var bText = (b.cells[colIdx] ? b.cells[colIdx].textContent.trim().replace('%', '') : '');
        var aNum = parseFloat(aText);
        var bNum = parseFloat(bText);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return currentDir === 'asc' ? aNum - bNum : bNum - aNum;
        }
        return currentDir === 'asc' ? aText.localeCompare(bText) : bText.localeCompare(aText);
      });

      rows.forEach(function(r) { tbody.appendChild(r); });
    });
  });
}

// Status display helpers
function statusLabel(status) {
  const labels = {
    pending: 'Pending', approved: 'Approved', scheduled: 'Scheduled',
    driver_on_the_way: 'On The Way', driver_arrived_grace: 'Grace Period',
    completed: 'Completed', no_show: 'No-Show', denied: 'Denied', cancelled: 'Cancelled'
  };
  return labels[status] || status.replace(/_/g, ' ');
}


// Debounce helper for search inputs
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// ============================================================================
// APPLICATION STATE
// ============================================================================

let currentUser = null;
let employees = [];
let shifts = [];
let rides = [];
let vehicles = [];
let adminUsers = [];
let filteredAdminUsers = [];
let adminRoleFilter = 'all';
let selectedAdminUser = null;
let drawerUserId = null;
let fleetVehicles = [];
let rideScheduleAnchor = new Date();
let emailConfigured = false;
let tenantConfig = null;
let ridesDateFrom = '';
let ridesDateTo = '';
let todayDriverStatus = [];
let isDragging = false;

async function loadTenantConfig() {
  // Detect org slug from URL path (e.g. /usc, /stanford/driver → 'usc')
  let orgSlug = null;
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const knownSlugs = ['usc', 'stanford', 'ucla', 'uci'];
  if (pathParts.length > 0 && knownSlugs.indexOf(pathParts[0]) !== -1) {
    orgSlug = pathParts[0];
  }

  try {
    const url = orgSlug ? '/api/tenant-config?campus=' + orgSlug : '/api/tenant-config';
    const res = await fetch(url);
    if (res.ok) tenantConfig = await res.json();
  } catch {}
  if (!tenantConfig) return;

  // SessionStorage campus override ONLY for demo.html legacy flow (not org-scoped URLs)
  if (!orgSlug) {
    let campusKey = null;
    try { campusKey = sessionStorage.getItem('ro-demo-campus'); } catch {}
    if (campusKey && typeof CAMPUS_THEMES !== 'undefined' && CAMPUS_THEMES[campusKey]) {
      const ct = CAMPUS_THEMES[campusKey];
      tenantConfig.orgName = ct.orgName;
      tenantConfig.orgShortName = ct.orgShortName;
      tenantConfig.orgTagline = ct.orgTagline;
      tenantConfig.orgInitials = ct.orgInitials;
      tenantConfig.primaryColor = ct.primaryColor;
      tenantConfig.secondaryColor = ct.secondaryColor;
      tenantConfig.secondaryTextColor = ct.secondaryTextColor;
      tenantConfig.mapUrl = ct.mapUrl;
      tenantConfig.sidebarBg = ct.sidebarBg;
      tenantConfig.sidebarText = ct.sidebarText;
      tenantConfig.sidebarActiveBg = ct.sidebarActiveBg;
      tenantConfig.sidebarHover = ct.sidebarHover;
      tenantConfig.sidebarBorder = ct.sidebarBorder;
      tenantConfig.headerBg = ct.headerBg;
    }
  }

  // Apply CSS vars from tenantConfig (works for both server config and sessionStorage override)
  const root = document.documentElement;
  if (tenantConfig.primaryColor) {
    root.style.setProperty('--color-primary', tenantConfig.primaryColor);
    root.style.setProperty('--color-primary-rgb', hexToRgb(tenantConfig.primaryColor));
    root.style.setProperty('--color-primary-dark', shadeHex(tenantConfig.primaryColor, -25));
    root.style.setProperty('--color-primary-light', shadeHex(tenantConfig.primaryColor, 80));
    root.style.setProperty('--color-sidebar-active', tenantConfig.primaryColor);
  }
  if (tenantConfig.secondaryColor) {
    root.style.setProperty('--color-accent', tenantConfig.secondaryColor);
    root.style.setProperty('--color-secondary', tenantConfig.secondaryColor);
    root.style.setProperty('--color-secondary-rgb', hexToRgb(tenantConfig.secondaryColor));
  }
  if (tenantConfig.secondaryTextColor) root.style.setProperty('--color-secondary-text', tenantConfig.secondaryTextColor);
  if (tenantConfig.headerBg) root.style.setProperty('--color-header-bg', tenantConfig.headerBg);
  if (tenantConfig.sidebarBg) root.style.setProperty('--color-sidebar-bg', tenantConfig.sidebarBg);
  if (tenantConfig.sidebarText) root.style.setProperty('--color-sidebar-text', tenantConfig.sidebarText);
  if (tenantConfig.sidebarActiveBg) root.style.setProperty('--color-sidebar-active-bg', tenantConfig.sidebarActiveBg);
  if (tenantConfig.sidebarHover) root.style.setProperty('--color-sidebar-hover', tenantConfig.sidebarHover);
  if (tenantConfig.sidebarBorder) root.style.setProperty('--color-sidebar-border', tenantConfig.sidebarBorder);

  document.title = tenantConfig.orgName + ' Operations Console';
  const orgShort = document.getElementById('org-short-name');
  if (orgShort) orgShort.textContent = tenantConfig.orgShortName;
  const orgInitials = document.getElementById('org-initials');
  if (orgInitials) orgInitials.textContent = tenantConfig.orgInitials;
  const headerTitle = document.getElementById('header-title');
  if (headerTitle) headerTitle.textContent = tenantConfig.orgName + ' Operations Console';
  const wrappedTitle = document.getElementById('ro-wrapped-title');
  if (wrappedTitle) wrappedTitle.textContent = tenantConfig.orgShortName + ' Wrapped';

  // Update analytics academic period preset label
  const semesterBtn = document.getElementById('analytics-semester-btn');
  if (semesterBtn && tenantConfig.academic_period_label) {
    semesterBtn.textContent = tenantConfig.academic_period_label;
  }

  // Show campus map nav item if mapUrl is configured
  loadMapPanel();
}

function loadMapPanel() {
  const mapNav = document.getElementById('nav-map');
  const mapContainer = document.getElementById('map-container');
  if (!tenantConfig || !tenantConfig.mapUrl) {
    if (mapNav) mapNav.style.display = 'none';
    return;
  }
  if (mapNav) mapNav.style.display = '';
  if (mapContainer) {
    mapContainer.innerHTML = '<iframe src="' + tenantConfig.mapUrl + '" style="width:100%;height:100%;border:none;" title="Campus Map" loading="lazy"></iframe>';
  }
}

// ----- Auth -----
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/login'; return false; }
    currentUser = await res.json();
    if (!currentUser.demoMode && currentUser.role !== 'office') {
      window.location.href = currentUser.role === 'driver' ? '/driver.html' : '/rider.html';
      return false;
    }
    return true;
  } catch { window.location.href = '/login'; return false; }
}

async function logout() {
  if (window._pollIntervals) {
    window._pollIntervals.forEach(id => clearInterval(id));
    window._pollIntervals = [];
  }
  await fetch('/api/auth/logout', { method: 'POST' });
  var parts = window.location.pathname.split('/').filter(Boolean);
  var slugs = ['usc', 'stanford', 'ucla', 'uci'];
  var org = (parts.length > 0 && slugs.indexOf(parts[0]) !== -1) ? parts[0] : null;
  window.location.href = org ? '/' + org : '/login';
}

// ----- Data Loading -----
async function loadEmployees() {
  try {
    const res = await fetch('/api/employees');
    if (res.ok) employees = await res.json();
  } catch (e) { console.error('Failed to load employees', e); }
  await loadTodayDriverStatus();
  renderEmployees();
}

async function loadTodayDriverStatus() {
  try {
    const res = await fetch('/api/employees/today-status');
    if (res.ok) todayDriverStatus = await res.json();
  } catch (e) { console.error('today-status error:', e); }
}

async function loadShifts() {
  try {
    const res = await fetch('/api/shifts');
    if (res.ok) shifts = await res.json();
  } catch (e) { console.error('Failed to load shifts', e); }
  renderScheduleGrid();
}

async function loadRides() {
  try {
    const res = await fetch('/api/rides');
    if (res.ok) rides = await res.json();
  } catch (e) { console.error('Failed to load rides', e); }
  renderRideLists();
  await renderRideScheduleGrid();
  renderDriverConsole();
}

async function loadVehicles() {
  try {
    const res = await fetch('/api/vehicles');
    if (res.ok) vehicles = await res.json();
  } catch (e) { console.error('Failed to load vehicles', e); }
}

async function loadAdminUsers() {
  if (!currentUser || currentUser.role !== 'office') return;
  try {
    const res = await fetch('/api/admin/users');
    if (res.ok) adminUsers = await res.json();
  } catch (e) { console.error('Failed to load admin users', e); }
  filterAdminUsers();
}

async function checkEmailStatus() {
  try {
    const res = await fetch('/api/admin/email-status');
    if (res.ok) {
      const data = await res.json();
      emailConfigured = data.configured;
    }
  } catch {}
  renderEmailIndicator();
}

function renderEmailIndicator() {
  const el = document.getElementById('admin-email-status');
  if (!el) return;
  if (emailConfigured) {
    el.innerHTML = '<span class="email-status-badge active">Email notifications active</span>';
  } else {
    el.innerHTML = '<span class="email-status-badge inactive">Email not configured — temporary passwords will be shown on screen</span>';
  }
}

function filterAdminUsers() {
  const input = document.getElementById('admin-user-filter');
  const countEl = document.getElementById('admin-user-filter-count');
  const q = (input?.value || '').trim().toLowerCase();
  filteredAdminUsers = adminUsers;
  if (q) {
    filteredAdminUsers = filteredAdminUsers.filter(u => [u.name, u.username, u.email, u.phone, u.member_id, u.role]
        .some(f => (f || '').toLowerCase().includes(q)));
  }
  if (adminRoleFilter !== 'all') {
    filteredAdminUsers = filteredAdminUsers.filter(u => u.role === adminRoleFilter);
  }
  renderAdminUsers(filteredAdminUsers);
  const isFiltered = q || adminRoleFilter !== 'all';
  if (countEl) countEl.textContent = isFiltered ? `${filteredAdminUsers.length} of ${adminUsers.length} users` : `${adminUsers.length} users`;
}

let _usersSelectedIds = new Set();

function _usersUpdateSelectionUI() {
  const count = _usersSelectedIds.size;
  const deleteBtn = document.getElementById('users-delete-selected-btn');
  const countEl = document.getElementById('users-selected-count');
  const selectAllCb = document.getElementById('users-select-all');
  if (deleteBtn) deleteBtn.style.display = count > 0 ? 'inline-flex' : 'none';
  if (countEl) countEl.textContent = count;
  if (selectAllCb) {
    const allCbs = document.querySelectorAll('#admin-users-table tbody .user-row-cb:not(:disabled)');
    selectAllCb.checked = allCbs.length > 0 && count === allCbs.length;
  }
}

function renderAdminUsers(users) {
  const tbody = document.querySelector('#admin-users-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  _usersSelectedIds = new Set();
  _usersUpdateSelectionUI();
  users.forEach((u) => {
    const tr = document.createElement('tr');
    const isSelf = currentUser && u.id === currentUser.id;
    tr.innerHTML = `
      <td><input type="checkbox" class="user-row-cb" data-user-id="${u.id}" ${isSelf ? 'disabled title="Cannot select your own account"' : ''} style="cursor:${isSelf ? 'not-allowed' : 'pointer'};"></td>
      <td>${u.name || ''}</td>
      <td><span class="admin-name-secondary">${u.email || ''}</span></td>
      <td>${u.username || ''}</td>
      <td><span class="role-badge role-${u.role}">${u.role}</span></td>
      <td>${u.member_id || ''}</td>
      <td>${u.phone || ''}</td>
      <td></td>
      <td><i class="ti ti-chevron-right admin-chevron"></i></td>
    `;
    // Checkbox handler
    const cb = tr.querySelector('.user-row-cb');
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      if (cb.checked) _usersSelectedIds.add(u.id);
      else _usersSelectedIds.delete(u.id);
      _usersUpdateSelectionUI();
    });
    // Insert kebab menu into the 8th cell (shifted by 1 due to checkbox column)
    const kebabCell = tr.querySelectorAll('td')[7];
    kebabCell.appendChild(buildAdminKebabMenu(u));
    // Row click opens drawer (skip if kebab or checkbox clicked)
    tr.onclick = (e) => { if (!e.target.closest('.kebab-menu-wrapper') && !e.target.closest('.user-row-cb')) openAdminDrawer(u.id); };
    tbody.appendChild(tr);
  });
}

function buildAdminKebabMenu(user) {
  const wrapper = document.createElement('div');
  wrapper.className = 'kebab-menu-wrapper';

  const btn = document.createElement('button');
  btn.className = 'kebab-btn';
  btn.innerHTML = '<i class="ti ti-dots-vertical" style="font-size:20px;"></i>';

  const dropdown = document.createElement('div');
  dropdown.className = 'kebab-dropdown';

  const editBtn = document.createElement('button');
  editBtn.className = 'edit-option';
  editBtn.innerHTML = '<i class="ti ti-pencil" style="font-size:16px;"></i> Edit';
  editBtn.onclick = (e) => { e.stopPropagation(); dropdown.classList.remove('open'); openAdminDrawer(user.id, 'edit'); };
  dropdown.appendChild(editBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'edit-option';
  resetBtn.innerHTML = '<i class="ti ti-key" style="font-size:16px;"></i> Reset Password';
  resetBtn.onclick = (e) => { e.stopPropagation(); dropdown.classList.remove('open'); openAdminDrawer(user.id, 'password'); };
  dropdown.appendChild(resetBtn);

  if (user.id !== currentUser.id) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-option';
    deleteBtn.innerHTML = '<i class="ti ti-trash" style="font-size:16px;"></i> Delete';
    deleteBtn.onclick = (e) => { e.stopPropagation(); dropdown.classList.remove('open'); deleteUser(user.id); };
    dropdown.appendChild(deleteBtn);
  }

  btn.onclick = (e) => {
    e.stopPropagation();
    document.querySelectorAll('.kebab-dropdown.open').forEach((d) => { if (d !== dropdown) d.classList.remove('open'); });
    dropdown.classList.toggle('open');
  };
  const closeHandler = (e) => {
    if (!wrapper.contains(e.target)) {
      dropdown.classList.remove('open');
      document.removeEventListener('click', closeHandler);
    }
  };
  btn.addEventListener('click', () => {
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(dropdown);
  return wrapper;
}

async function openAdminDrawer(userId, scrollTo) {
  drawerUserId = userId;
  const drawer = document.getElementById('admin-drawer');
  const backdrop = document.getElementById('admin-drawer-backdrop');
  const body = document.getElementById('admin-drawer-body');
  const title = document.getElementById('admin-drawer-title');

  drawer.classList.add('open');
  backdrop.classList.add('open');
  body.innerHTML = '<div class="loader"><div class="loader-spinner"></div><p class="loader-text">Loading...</p></div>';
  title.textContent = 'User Details';

  try {
    const res = await fetch(`/api/admin/users/${userId}/profile`);
    if (!res.ok) throw new Error('Failed to load user');
    const data = await res.json();
    const user = data.user;
    const isSelf = user.id === currentUser.id;
    const initial = (user.name || user.username || '?').charAt(0).toUpperCase();

    title.textContent = user.name || user.username;

    let html = '';

    // User header
    html += `<div style="display:flex; align-items:center; gap:14px; margin-bottom:24px;">
      <div class="drawer-avatar">${initial}</div>
      <div>
        <div style="font-weight:700; font-size:16px;">${user.name || ''}</div>
        <div style="margin-top:2px;"><span class="role-badge role-${user.role}">${user.role}</span></div>
        <div class="admin-name-secondary" style="margin-top:4px;">@${user.username || ''}</div>
      </div>
    </div>`;

    // Rider no-show banner (riders only, above details)
    if (user.role === 'rider') {
      const missCount = data.missCount || 0;
      const severity = missCount >= 5 ? 'noshows-critical' : missCount > 0 ? 'noshows-warn' : 'noshows-clear';
      html += `<div class="drawer-noshows-banner ${severity}">
        <div class="drawer-noshows-count">${missCount}</div>
        <div class="drawer-noshows-label">consecutive no-show${missCount !== 1 ? 's' : ''}</div>
        ${missCount >= 5 ? '<div class="small-text" style="font-weight:700; color:var(--status-no-show);">SERVICE TERMINATED</div>' : ''}
        ${missCount > 0 ? '<button class="btn secondary small" id="drawer-reset-miss-count" style="margin-left:auto;">Reset</button>' : ''}
      </div>`;
    }

    // Details section (view mode)
    html += `<div class="drawer-section" id="drawer-details-view">
      <div class="drawer-section-title">Details</div>
      <div class="drawer-field"><div class="drawer-field-label">Email</div><div class="drawer-field-value">${user.email || '—'}</div></div>
      <div class="drawer-field"><div class="drawer-field-label">${tenantConfig?.idFieldLabel || 'Member ID'}</div><div class="drawer-field-value">${user.member_id || '—'}</div></div>
      <div class="drawer-field"><div class="drawer-field-label">Phone</div><div class="drawer-field-value">${user.phone || '—'}</div></div>
      ${user.role === 'driver' ? `<div class="drawer-field"><div class="drawer-field-label">Status</div><div class="drawer-field-value">${user.active ? '<span style="color:#28a745; font-weight:700;">Clocked In</span>' : '<span style="color:#dc3545;">Clocked Out</span>'}</div></div>` : ''}
      <button class="btn secondary small" id="drawer-edit-toggle" style="margin-top:4px;">Edit</button>
    </div>`;

    // Edit section (hidden)
    html += `<div class="drawer-section" id="drawer-details-edit" style="display:none;">
      <div class="drawer-section-title">Edit Details</div>
      <label>Name<input type="text" id="drawer-edit-name" value="${user.name || ''}"></label>
      <label>Email<input type="email" id="drawer-edit-email" value="${user.email || ''}"></label>
      <label>Phone<input type="tel" id="drawer-edit-phone" value="${user.phone || ''}"></label>
      <label>${tenantConfig?.idFieldLabel || 'Member ID'}<input type="text" id="drawer-edit-memberid" value="${user.member_id || ''}"${tenantConfig?.idFieldMaxLength ? ` maxlength="${tenantConfig.idFieldMaxLength}"` : ''}></label>
      <label>Role
        <select id="drawer-edit-role">
          <option value="rider" ${user.role === 'rider' ? 'selected' : ''}>rider</option>
          <option value="driver" ${user.role === 'driver' ? 'selected' : ''}>driver</option>
          <option value="office" ${user.role === 'office' ? 'selected' : ''}>office</option>
        </select>
      </label>
      <div id="drawer-edit-message" class="small-text" style="margin-top:8px;"></div>
      <div class="flex-row" style="gap:8px; margin-top:12px;">
        <button class="btn primary" id="drawer-edit-save">Save</button>
        <button class="btn secondary" id="drawer-edit-cancel">Cancel</button>
      </div>
    </div>`;

    // Rides (non-office)
    if (user.role !== 'office') {
      const upcoming = (data.upcoming || []).slice(0, 5);
      const past = (data.past || []).slice(0, 5);
      html += `<div class="drawer-section">
        <div class="drawer-section-title">Upcoming Rides</div>
        ${upcoming.length ? upcoming.map(renderProfileRide).join('') : '<p class="small-text">None.</p>'}
      </div>
      <div class="drawer-section">
        <div class="drawer-section-title">Recent Rides</div>
        ${past.length ? past.map(renderProfileRide).join('') : '<p class="small-text">None.</p>'}
      </div>`;
    }

    // Divider before admin actions
    html += `<hr class="drawer-divider">`;

    // Password reset section
    html += `<div class="drawer-section" id="drawer-password-section">
      <div class="drawer-section-title">Password Reset</div>
      <label>New Password (min 8 chars)<input type="password" id="drawer-pw-input"></label>
      <div id="drawer-pw-message" class="small-text" style="margin-top:8px;"></div>
      <div id="drawer-pw-result" style="display:none; margin-top:8px;">
        <div class="small-text" style="font-weight:700;">Temporary password (email not configured):</div>
        <div class="flex-row" style="gap:8px; margin-top:4px;">
          <code id="drawer-pw-display" style="background:#f5f5f5; padding:4px 8px; border-radius:4px; font-size:14px;"></code>
          <button class="btn secondary small" id="drawer-pw-copy">Copy</button>
        </div>
      </div>
      <button class="btn primary small" id="drawer-pw-reset" style="margin-top:8px;">Reset Password</button>
    </div>`;

    // Danger zone
    if (!isSelf) {
      html += `<div class="drawer-section">
        <div class="drawer-danger-zone">
          <div class="drawer-section-title" style="color:var(--status-no-show);">Danger Zone</div>
          <p class="small-text" style="margin:0 0 12px 0;">Permanently delete this user and all associated data.</p>
          <button class="btn danger small" id="drawer-delete-btn">Delete User</button>
        </div>
      </div>`;
    }

    body.innerHTML = html;

    // Wire reset miss count
    const resetMissBtn = body.querySelector('#drawer-reset-miss-count');
    if (resetMissBtn) resetMissBtn.onclick = async () => {
      const confirmed = await showConfirmModal({
        title: 'Reset Miss Count',
        message: `Reset ${user.name || user.username}'s consecutive no-show count to 0? This will restore their ability to have rides approved.`,
        confirmLabel: 'Reset',
        cancelLabel: 'Cancel',
        type: 'warning'
      });
      if (!confirmed) return;
      try {
        const res = await fetch(`/api/admin/users/${userId}/reset-miss-count`, { method: 'POST' });
        const result = await res.json();
        if (!res.ok) { showToast(result.error || 'Reset failed', 'error'); return; }
        showToast('Miss count reset to 0', 'success');
        openAdminDrawer(userId);
      } catch { showToast('Network error', 'error'); }
    };

    // Wire edit toggle
    const editToggle = body.querySelector('#drawer-edit-toggle');
    const detailsView = body.querySelector('#drawer-details-view');
    const detailsEdit = body.querySelector('#drawer-details-edit');
    if (editToggle) editToggle.onclick = () => {
      detailsView.style.display = 'none';
      detailsEdit.style.display = '';
    };
    const editCancel = body.querySelector('#drawer-edit-cancel');
    if (editCancel) editCancel.onclick = () => {
      detailsEdit.style.display = 'none';
      detailsView.style.display = '';
    };

    // Wire edit save
    const editSave = body.querySelector('#drawer-edit-save');
    if (editSave) editSave.onclick = async () => {
      const msg = body.querySelector('#drawer-edit-message');
      msg.textContent = '';
      const payload = {
        name: body.querySelector('#drawer-edit-name').value.trim(),
        email: body.querySelector('#drawer-edit-email').value.trim(),
        phone: body.querySelector('#drawer-edit-phone').value.trim(),
        memberId: body.querySelector('#drawer-edit-memberid').value.trim(),
        role: body.querySelector('#drawer-edit-role').value
      };
      try {
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) { msg.textContent = result.error || 'Update failed'; msg.style.color = 'var(--status-no-show)'; return; }
        showToast('User updated successfully', 'success');
        await loadAdminUsers();
        openAdminDrawer(userId);
      } catch { msg.textContent = 'Network error'; msg.style.color = 'var(--status-no-show)'; }
    };

    // Wire password reset
    const pwResetBtn = body.querySelector('#drawer-pw-reset');
    if (pwResetBtn) pwResetBtn.onclick = async () => {
      const msg = body.querySelector('#drawer-pw-message');
      const pw = body.querySelector('#drawer-pw-input').value;
      msg.textContent = '';
      msg.style.color = '';
      if (!pw || pw.length < 8) { msg.textContent = 'Password must be at least 8 characters.'; msg.style.color = 'var(--status-no-show)'; return; }
      try {
        const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword: pw })
        });
        const result = await res.json();
        if (!res.ok) { msg.textContent = result.error || 'Reset failed'; msg.style.color = 'var(--status-no-show)'; return; }
        if (result.emailSent) {
          showToast('Password reset. Notification email sent.', 'success');
          msg.textContent = 'Password reset successfully. Email sent.';
          msg.style.color = 'var(--status-completed)';
        } else {
          msg.textContent = 'Password reset successfully.';
          msg.style.color = 'var(--status-completed)';
          const resultDiv = body.querySelector('#drawer-pw-result');
          resultDiv.style.display = 'block';
          body.querySelector('#drawer-pw-display').textContent = pw;
          body.querySelector('#drawer-pw-copy').onclick = () => {
            navigator.clipboard.writeText(pw).then(() => showToast('Copied to clipboard', 'success'));
          };
          pwResetBtn.style.display = 'none';
          body.querySelector('#drawer-pw-input').parentElement.style.display = 'none';
        }
      } catch { msg.textContent = 'Network error'; msg.style.color = 'var(--status-no-show)'; }
    };

    // Wire delete
    const deleteBtn = body.querySelector('#drawer-delete-btn');
    if (deleteBtn) deleteBtn.onclick = () => deleteUser(userId);

    // Scroll to section if requested
    if (scrollTo === 'edit') {
      detailsView.style.display = 'none';
      detailsEdit.style.display = '';
    } else if (scrollTo === 'password') {
      const pwSection = body.querySelector('#drawer-password-section');
      if (pwSection) setTimeout(() => pwSection.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  } catch (e) {
    body.innerHTML = `<p class="small-text">${e.message || 'Unable to load user details.'}</p>`;
  }
}

function closeAdminDrawer() {
  const drawer = document.getElementById('admin-drawer');
  const backdrop = document.getElementById('admin-drawer-backdrop');
  drawer.classList.remove('open');
  backdrop.classList.remove('open');
  setTimeout(() => {
    const body = document.getElementById('admin-drawer-body');
    if (body && !drawer.classList.contains('open')) body.innerHTML = '';
  }, 300);
  drawerUserId = null;
}

function showEditUserModal(user) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `
    <div class="modal-box">
      <h3>Edit User: ${user.name || user.username}</h3>
      <label>Name<input type="text" id="edit-user-name" value="${user.name || ''}"></label>
      <label>Email<input type="email" id="edit-user-email" value="${user.email || ''}"></label>
      <label>Phone<input type="tel" id="edit-user-phone" value="${user.phone || ''}"></label>
      <label>${tenantConfig?.idFieldLabel || 'Member ID'}<input type="text" id="edit-user-memberid" value="${user.member_id || ''}"${tenantConfig?.idFieldMaxLength ? ` maxlength="${tenantConfig.idFieldMaxLength}"` : ''}></label>
      <label>Role
        <select id="edit-user-role">
          <option value="rider" ${user.role === 'rider' ? 'selected' : ''}>rider</option>
          <option value="driver" ${user.role === 'driver' ? 'selected' : ''}>driver</option>
          <option value="office" ${user.role === 'office' ? 'selected' : ''}>office</option>
        </select>
      </label>
      <div id="edit-user-message" class="small-text" style="margin-top:8px;"></div>
      <div class="flex-row" style="gap:8px; margin-top:12px;">
        <button class="btn primary" id="edit-user-save">Save</button>
        <button class="btn secondary" id="edit-user-cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => {
    overlay.classList.remove('show');
    overlay.classList.add('hiding');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector('#edit-user-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#edit-user-save').onclick = async () => {
    const msg = overlay.querySelector('#edit-user-message');
    msg.textContent = '';
    const body = {
      name: overlay.querySelector('#edit-user-name').value.trim(),
      email: overlay.querySelector('#edit-user-email').value.trim(),
      phone: overlay.querySelector('#edit-user-phone').value.trim(),
      memberId: overlay.querySelector('#edit-user-memberid').value.trim(),
      role: overlay.querySelector('#edit-user-role').value
    };
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        msg.textContent = data.error || 'Update failed';
        msg.style.color = 'var(--status-no-show)';
        return;
      }
      showToast('User updated successfully', 'success');
      close();
      await loadAdminUsers();
    } catch {
      msg.textContent = 'Network error';
      msg.style.color = 'var(--status-no-show)';
    }
  };
}

function resetUserPassword(userId, userName) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `
    <div class="modal-box">
      <h3>Reset Password: ${userName}</h3>
      <p class="small-text">Enter a temporary password. The user will be required to change it on next login.</p>
      <label>New Password (min 8 chars)<input type="password" id="reset-pw-input"></label>
      <div id="reset-pw-message" class="small-text" style="margin-top:8px;"></div>
      <div id="reset-pw-result" style="display:none; margin-top:8px;">
        <div class="small-text" style="font-weight:700;">Temporary password (email not configured):</div>
        <div class="flex-row" style="gap:8px; margin-top:4px;">
          <code id="reset-pw-display" style="background:#f5f5f5; padding:4px 8px; border-radius:4px; font-size:14px;"></code>
          <button class="btn secondary small" id="reset-pw-copy">Copy</button>
        </div>
      </div>
      <div class="flex-row" style="gap:8px; margin-top:12px;">
        <button class="btn primary" id="reset-pw-confirm">Reset Password</button>
        <button class="btn secondary" id="reset-pw-cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => {
    overlay.classList.remove('show');
    overlay.classList.add('hiding');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector('#reset-pw-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#reset-pw-confirm').onclick = async () => {
    const msg = overlay.querySelector('#reset-pw-message');
    const pw = overlay.querySelector('#reset-pw-input').value;
    msg.textContent = '';
    msg.style.color = '';
    if (!pw || pw.length < 8) {
      msg.textContent = 'Password must be at least 8 characters.';
      msg.style.color = 'var(--status-no-show)';
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: pw })
      });
      const data = await res.json();
      if (!res.ok) {
        msg.textContent = data.error || 'Reset failed';
        msg.style.color = 'var(--status-no-show)';
        return;
      }
      if (data.emailSent) {
        showToast('Password reset. Notification email sent.', 'success');
        close();
      } else {
        msg.textContent = 'Password reset successfully.';
        msg.style.color = 'var(--status-completed)';
        const resultDiv = overlay.querySelector('#reset-pw-result');
        resultDiv.style.display = 'block';
        overlay.querySelector('#reset-pw-display').textContent = pw;
        overlay.querySelector('#reset-pw-copy').onclick = () => {
          navigator.clipboard.writeText(pw).then(() => showToast('Copied to clipboard', 'success'));
        };
        overlay.querySelector('#reset-pw-confirm').style.display = 'none';
        overlay.querySelector('#reset-pw-input').parentElement.style.display = 'none';
      }
    } catch {
      msg.textContent = 'Network error';
      msg.style.color = 'var(--status-no-show)';
    }
  };
}

async function deleteUser(id) {
  const confirmed = await showConfirmModal({
    title: 'Delete User',
    message: 'Are you sure you want to delete this user? This action cannot be undone.',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    type: 'danger'
  });
  if (!confirmed) return;

  const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to delete user', 'error');
    return;
  }
  showToast('User deleted successfully', 'success');
  if (drawerUserId === id) closeAdminDrawer();
  await loadAdminUsers();
  selectedAdminUser = null;
  renderProfilePanel(null);
}


function showCreateUserModal() {
  const idLabel = tenantConfig?.idFieldLabel || 'Member ID';
  const overlay = document.createElement('div');
  overlay.className = 'ro-modal-overlay open';
  overlay.innerHTML = `
    <div class="ro-modal">
      <div class="ro-modal__title">Create User</div>
      <div class="ro-modal__body">
        <div class="form-grid">
          <div class="field-group">
            <label class="ro-label">Name</label>
            <input type="text" id="modal-new-name" class="ro-input" required>
          </div>
          <div class="field-group">
            <label class="ro-label">Username <span style="color:var(--status-no-show)">*</span></label>
            <input type="text" class="ro-input" id="modal-new-username"
                   placeholder="e.g. jsmith" autocomplete="off"
                   pattern="[a-zA-Z0-9_]+" title="Letters, numbers, and underscores only" required>
            <div class="text-xs text-muted" style="margin-top:4px;">Used to log in. Letters, numbers, and underscores only.</div>
          </div>
          <div class="field-group">
            <label class="ro-label">Email</label>
            <input type="email" id="modal-new-email" class="ro-input" required>
          </div>
          <div class="field-group">
            <label class="ro-label">Phone</label>
            <input type="tel" id="modal-new-phone" class="ro-input">
          </div>
          <div class="field-group">
            <label class="ro-label">${idLabel}</label>
            <input type="text" id="modal-new-memberid" class="ro-input" required>
          </div>
          <div class="field-group">
            <label class="ro-label">Role</label>
            <select id="modal-new-role" class="ro-select">
              <option value="rider">rider</option>
              <option value="driver">driver</option>
              <option value="office">office</option>
            </select>
          </div>
          <div class="field-group">
            <label class="ro-label">Temp Password</label>
            <input type="password" id="modal-new-password" class="ro-input" required>
          </div>
        </div>
      </div>
      <div class="ro-modal__actions">
        <button class="ro-btn ro-btn--outline" data-action="cancel">Cancel</button>
        <button class="ro-btn ro-btn--primary" data-action="confirm">Create User</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-action="cancel"]').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector('[data-action="confirm"]').onclick = async () => {
    const name = document.getElementById('modal-new-name')?.value.trim();
    const username = document.getElementById('modal-new-username')?.value.trim();
    const email = document.getElementById('modal-new-email')?.value.trim();
    const phone = document.getElementById('modal-new-phone')?.value.trim();
    const memberId = document.getElementById('modal-new-memberid')?.value.trim();
    const role = document.getElementById('modal-new-role')?.value;
    const password = document.getElementById('modal-new-password')?.value;
    if (!name || !username || !email || !memberId || !role || !password) {
      showToast('All required fields must be filled', 'error');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      showToast('Username may only contain letters, numbers, and underscores', 'error');
      return;
    }
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, email, phone, memberId, role, password })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not create user', 'error');
        return;
      }
      overlay.remove();
      if (data.emailSent) {
        showToast('User created. Welcome email sent.', 'success');
      } else {
        const safeUser = data.username || email.split('@')[0];
        const clipText = `Username: ${safeUser}\nPassword: ${password}`;
        showToast(`User created — Username: ${safeUser}`, 'success');
        navigator.clipboard.writeText(clipText).catch(() => {});
      }
      await loadAdminUsers();
    } catch {
      showToast('Network error', 'error');
    }
  };
}

// ----- Employee UI -----
function renderEmployees() {
  const container = document.getElementById('employee-bar');
  if (!container) return;
  container.innerHTML = '';
  employees.forEach((emp) => {
    const chip = document.createElement('div');
    chip.className = 'emp-chip' + (emp.active ? ' active' : '');
    chip.title = `${emp.name} — ${emp.active ? 'Clocked In' : 'Clocked Out'}`;
    chip.innerHTML = `
      <span class="emp-dot${emp.active ? ' active' : ''}"></span>
      <span class="emp-name">${emp.name}</span>
      <span class="emp-status-label ${emp.active ? 'clocked-in' : 'clocked-out'}">${emp.active ? 'Clocked In' : 'Clocked Out'}</span>
    `;
    const actionBtn = document.createElement('button');
    actionBtn.className = 'emp-action-btn ' + (emp.active ? 'clock-out' : 'clock-in');
    actionBtn.title = emp.active ? `Clock out ${emp.name}` : `Clock in ${emp.name}`;
    actionBtn.textContent = emp.active ? 'Clock Out' : 'Clock In';
    actionBtn.onclick = () => clockEmployee(emp.id, !emp.active);
    // Add punctuality indicator: only show if driver hasn't clocked in today and shift is active
    const statusData = todayDriverStatus.find(d => d.id === emp.id);
    const hasClockedInToday = statusData?.todayClockEvents?.length > 0;
    if (!emp.active && !hasClockedInToday && statusData?.todayShifts?.length) {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const activeShift = statusData.todayShifts.find(s => {
        const [sh, sm] = s.start_time.split(':').map(Number);
        const [eh, em] = s.end_time.split(':').map(Number);
        return nowMins >= (sh * 60 + sm) && nowMins < (eh * 60 + em);
      });
      if (activeShift) {
        const [sh, sm] = activeShift.start_time.split(':').map(Number);
        const tardyMins = nowMins - (sh * 60 + sm);
        if (tardyMins > 0) {
          const tardySpan = document.createElement('span');
          tardySpan.className = 'tardy-badge';
          tardySpan.innerHTML = `<i class="ti ti-clock-exclamation"></i>${tardyMins}m late`;
          chip.appendChild(tardySpan);
        }
      }
    }
    chip.querySelector('.emp-name').onclick = () => openProfileById(emp.id);
    chip.appendChild(actionBtn);
    container.appendChild(chip);
  });
}

async function clockEmployee(id, isIn) {
  try {
    const res = await fetch(`/api/employees/${isIn ? 'clock-in' : 'clock-out'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: id })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || `Failed to clock ${isIn ? 'in' : 'out'}`, 'error');
      return;
    }
  } catch {
    showToast('Network error — could not update clock status', 'error');
    return;
  }
  await loadEmployees();
  await loadRides();
}

// ----- Schedule Grid -----
function generateTimeSlots(startHour = 8, endHour = 19) {
  const slots = [];
  for (let hour = startHour; hour < endHour; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  slots.push(`${String(endHour).padStart(2, '0')}:00`);
  return slots;
}

function getCurrentWeekDates() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const weekDates = [];
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  for (let i = 0; i < 5; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    weekDates.push({
      dayName: dayNames[i],
      date: date,
      dateStr: date.toISOString().split('T')[0],
      displayStr: `${dayNames[i]} (${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()})`
    });
  }
  return weekDates;
}

let shiftCalendar = null;

function renderScheduleGrid() {
  initShiftCalendar();
}

async function initShiftCalendar() {
  const calendarEl = document.getElementById('shift-calendar');
  if (!calendarEl) return;

  if (shiftCalendar) {
    shiftCalendar.refetchEvents();
    return;
  }

  const cfg = await getOpsConfig();
  const opDays = String(cfg.operating_days || '0,1,2,3,4').split(',').map(Number);
  const hiddenDays = [];
  for (let d = 0; d < 7; d++) {
    if (!opDays.includes(d)) hiddenDays.push(ourDayToFCDay(d));
  }
  const [startH] = String(cfg.service_hours_start || '08:00').split(':').map(Number);
  const [endH] = String(cfg.service_hours_end || '19:00').split(':').map(Number);
  const slotMin = String(Math.max(0, startH - 1)).padStart(2, '0') + ':00:00';
  const slotMax = String(Math.min(24, endH + 1)).padStart(2, '0') + ':00:00';

  shiftCalendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'timeGridWeek',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },
    slotMinTime: slotMin,
    slotMaxTime: slotMax,
    allDaySlot: false,
    hiddenDays: hiddenDays,
    height: 'auto',
    nowIndicator: true,
    events: async function(fetchInfo, successCallback) {
      try {
        const weekStart = formatDateInputLocal(getMondayOfWeek(fetchInfo.start));
        const res = await fetch(`/api/shifts?weekStart=${weekStart}`);
        const weekShifts = res.ok ? await res.json() : [];
        successCallback(mapShiftsToCalEvents(weekShifts, fetchInfo.start));
      } catch {
        successCallback(getShiftCalendarEvents(fetchInfo.start));
      }
    },
    selectable: true,
    selectMirror: true,
    editable: true,
    eventStartEditable: true,
    eventDurationEditable: true,
    select: onCalendarSelect,
    eventClick: onShiftEventClick,
    eventDrop: onShiftEventDrop,
    eventResize: onShiftEventResize,
    eventDidMount: onShiftEventMount,
  });
  shiftCalendar.render();
}

async function refreshCalendarSettings() {
  if (!shiftCalendar) return;
  try {
    invalidateOpsConfig();
    const cfg = await getOpsConfig();
    const opDays = String(cfg.operating_days || '0,1,2,3,4').split(',').map(Number);
    const hiddenDays = [];
    for (let d = 0; d < 7; d++) {
      if (!opDays.includes(d)) hiddenDays.push(ourDayToFCDay(d));
    }
    const [startH] = String(cfg.service_hours_start || '08:00').split(':').map(Number);
    const [endH] = String(cfg.service_hours_end || '19:00').split(':').map(Number);
    const slotMin = String(Math.max(0, startH - 1)).padStart(2, '0') + ':00:00';
    const slotMax = String(Math.min(24, endH + 1)).padStart(2, '0') + ':00:00';

    shiftCalendar.setOption('slotMinTime', slotMin);
    shiftCalendar.setOption('slotMaxTime', slotMax);
    shiftCalendar.setOption('hiddenDays', hiddenDays);
    shiftCalendar.refetchEvents();
  } catch (e) {
    console.warn('Failed to refresh calendar settings:', e);
  }
}

function getDriverColors() {
  return getCurrentCampusPalette();
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + mondayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function mapShiftsToCalEvents(shiftList, viewStart) {
  const events = [];
  const monday = getMondayOfWeek(viewStart || new Date());

  shiftList.forEach(s => {
    const emp = employees.find(e => e.id === s.employeeId);
    const name = emp?.name || 'Unknown';
    const employeeIndex = employees.findIndex(e => e.id === s.employeeId);
    const driverColors = getDriverColors();
    const color = employeeIndex >= 0 ? driverColors[employeeIndex % driverColors.length] : '#94A3B8';
    // Map dayOfWeek (0=Mon) to date
    const eventDate = new Date(monday);
    eventDate.setDate(monday.getDate() + s.dayOfWeek);
    const dateStr = formatDateInputLocal(eventDate);
    events.push({
      id: s.id,
      title: name,
      start: `${dateStr}T${s.startTime}`,
      end: `${dateStr}T${s.endTime}`,
      backgroundColor: color,
      borderColor: color,
      extendedProps: { shiftId: s.id, employeeId: s.employeeId, notes: s.notes || '', weekStart: s.weekStart || null }
    });
  });
  return events;
}

function getShiftCalendarEvents(viewStart) {
  return mapShiftsToCalEvents(shifts, viewStart);
}

async function onCalendarSelect(info) {
  // Determine day of week (Mon=0)
  const jsDay = info.start.getDay();
  const dayOfWeek = jsDateToOurDay(jsDay);
  const cfg = await getOpsConfig();
  const opDays = String(cfg.operating_days || '0,1,2,3,4').split(',').map(Number);
  if (!opDays.includes(dayOfWeek)) return;

  const startTime = info.start.toTimeString().substring(0, 8);
  const endTime = info.end.toTimeString().substring(0, 8);

  // Show employee picker modal
  const empId = await pickEmployeeForShift();
  if (!empId) {
    if (shiftCalendar) shiftCalendar.unselect();
    return;
  }

  const weekStart = formatDateInputLocal(getMondayOfWeek(info.start));
  try {
    await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: empId, dayOfWeek, startTime, endTime, weekStart })
    });
    await loadShifts();
    if (shiftCalendar) shiftCalendar.refetchEvents();
    showToast('Shift added', 'success');
  } catch {
    showToast('Failed to add shift', 'error');
  }
}

// ----- Shift Event Handlers (drag/drop, resize, popover, context menu) -----

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatTimeLabel(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

async function onShiftEventDrop(info) {
  const shiftId = info.event.extendedProps.shiftId;
  const jsDay = info.event.start.getDay();
  const dayOfWeek = jsDateToOurDay(jsDay);
  const cfg = await getOpsConfig();
  const opDays = String(cfg.operating_days || '0,1,2,3,4').split(',').map(Number);
  if (!opDays.includes(dayOfWeek)) {
    info.revert();
    showToast('Shifts must be on operating days', 'error');
    return;
  }
  const startTime = info.event.start.toTimeString().substring(0, 5);
  const endTime = info.event.end.toTimeString().substring(0, 5);
  const weekStart = formatDateInputLocal(getMondayOfWeek(info.event.start));
  try {
    const res = await fetch(`/api/shifts/${shiftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayOfWeek, startTime, endTime, weekStart })
    });
    if (!res.ok) { info.revert(); showToast('Failed to move shift', 'error'); return; }
    await loadShifts();
    showToast('Shift moved', 'success');
  } catch { info.revert(); showToast('Failed to move shift', 'error'); }
}

async function onShiftEventResize(info) {
  const shiftId = info.event.extendedProps.shiftId;
  const endTime = info.event.end.toTimeString().substring(0, 5);
  try {
    const res = await fetch(`/api/shifts/${shiftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endTime })
    });
    if (!res.ok) { info.revert(); showToast('Failed to resize shift', 'error'); return; }
    await loadShifts();
    showToast('Shift updated', 'success');
  } catch { info.revert(); showToast('Failed to resize shift', 'error'); }
}

function onShiftEventMount(info) {
  info.el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showShiftContextMenu(e, info.event, info.el);
  });
}

// --- Shift Popover ---
function closeShiftPopover() {
  const existing = document.querySelector('.shift-popover');
  if (existing) existing.remove();
  document.removeEventListener('keydown', _shiftPopoverEsc);
  document.removeEventListener('mousedown', _shiftPopoverOutside);
}

function _shiftPopoverEsc(e) { if (e.key === 'Escape') closeShiftPopover(); }
function _shiftPopoverOutside(e) {
  const pop = document.querySelector('.shift-popover');
  if (pop && !pop.contains(e.target)) closeShiftPopover();
}

function positionShiftPopover(popover, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const pw = 300;
  let left = rect.right + 8;
  if (left + pw > window.innerWidth - 12) {
    left = rect.left - pw - 8;
  }
  if (left < 12) left = 12;
  let top = rect.top;
  const ph = popover.offsetHeight || 280;
  if (top + ph > window.innerHeight - 12) {
    top = window.innerHeight - ph - 12;
  }
  if (top < 12) top = 12;
  popover.style.left = left + 'px';
  popover.style.top = top + 'px';
}

function onShiftEventClick(info) {
  closeShiftPopover();
  closeShiftContextMenu();

  const ev = info.event;
  const shiftId = ev.extendedProps.shiftId;
  const empName = ev.title;
  const jsDay = ev.start.getDay();
  const dayOfWeek = (jsDay + 6) % 7;
  const dayName = DAY_NAMES[dayOfWeek] || '';
  const startTime = ev.start.toTimeString().substring(0, 5);
  const endTime = ev.end.toTimeString().substring(0, 5);
  const notes = ev.extendedProps.notes || '';

  const popover = document.createElement('div');
  popover.className = 'shift-popover';
  popover.innerHTML = `
    <div class="shift-popover__header">
      <h4 class="shift-popover__title">${empName}</h4>
      <button class="shift-popover__close" title="Close"><i class="ti ti-x"></i></button>
    </div>
    <div class="shift-popover__body">
      <div class="shift-popover__row"><i class="ti ti-calendar"></i> ${dayName}</div>
      <div class="shift-popover__row"><i class="ti ti-clock"></i> ${formatTimeLabel(startTime)} – ${formatTimeLabel(endTime)}</div>
      <div class="shift-popover__notes-label">Notes</div>
      <textarea class="shift-popover__notes" placeholder="Add shift notes...">${notes}</textarea>
    </div>
    <div class="shift-popover__footer">
      <button class="shift-popover__btn shift-popover__btn--danger" data-action="delete"><i class="ti ti-trash"></i> Delete</button>
      <button class="shift-popover__btn shift-popover__btn--primary" data-action="save">Save Notes</button>
    </div>
  `;

  document.body.appendChild(popover);
  positionShiftPopover(popover, info.el);

  // Close handlers
  popover.querySelector('.shift-popover__close').onclick = closeShiftPopover;
  setTimeout(() => {
    document.addEventListener('keydown', _shiftPopoverEsc);
    document.addEventListener('mousedown', _shiftPopoverOutside);
  }, 0);

  // Delete handler
  popover.querySelector('[data-action="delete"]').onclick = async () => {
    closeShiftPopover();
    const confirmed = await showConfirmModal({
      title: 'Delete Shift',
      message: `Delete ${empName}'s shift on ${dayName}?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      type: 'danger'
    });
    if (!confirmed) return;
    await fetch(`/api/shifts/${shiftId}`, { method: 'DELETE' });
    await loadShifts();
    showToast('Shift deleted', 'success');
  };

  // Save notes handler
  popover.querySelector('[data-action="save"]').onclick = async () => {
    const newNotes = popover.querySelector('.shift-popover__notes').value;
    try {
      const res = await fetch(`/api/shifts/${shiftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes })
      });
      if (!res.ok) { showToast('Failed to save notes', 'error'); return; }
      closeShiftPopover();
      await loadShifts();
      showToast('Notes saved', 'success');
    } catch { showToast('Failed to save notes', 'error'); }
  };
}

// --- Context Menu ---
function closeShiftContextMenu() {
  const existing = document.querySelector('.shift-context-menu');
  if (existing) existing.remove();
  document.removeEventListener('keydown', _shiftCtxEsc);
  document.removeEventListener('mousedown', _shiftCtxOutside);
}

function _shiftCtxEsc(e) { if (e.key === 'Escape') closeShiftContextMenu(); }
function _shiftCtxOutside(e) {
  const menu = document.querySelector('.shift-context-menu');
  if (menu && !menu.contains(e.target)) closeShiftContextMenu();
}

function showShiftContextMenu(e, calEvent, eventEl) {
  closeShiftContextMenu();
  closeShiftPopover();

  const shiftId = calEvent.extendedProps.shiftId;
  const empId = calEvent.extendedProps.employeeId;
  const empName = calEvent.title;
  const jsDay = calEvent.start.getDay();
  const dayOfWeek = (jsDay + 6) % 7;
  const startTime = calEvent.start.toTimeString().substring(0, 5);
  const endTime = calEvent.end.toTimeString().substring(0, 5);
  const notes = calEvent.extendedProps.notes || '';
  const weekStart = formatDateInputLocal(getMondayOfWeek(calEvent.start));

  const menu = document.createElement('div');
  menu.className = 'shift-context-menu';
  menu.innerHTML = `
    <button class="shift-context-menu__item" data-action="duplicate"><i class="ti ti-copy"></i> Duplicate</button>
    <button class="shift-context-menu__item" data-action="edit"><i class="ti ti-pencil"></i> Edit Details</button>
    <button class="shift-context-menu__item shift-context-menu__item--danger" data-action="delete"><i class="ti ti-trash"></i> Delete</button>
  `;

  document.body.appendChild(menu);

  // Position at mouse, clamped to viewport
  let left = e.clientX;
  let top = e.clientY;
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  if (top + mh > window.innerHeight - 8) top = window.innerHeight - mh - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  setTimeout(() => {
    document.addEventListener('keydown', _shiftCtxEsc);
    document.addEventListener('mousedown', _shiftCtxOutside);
  }, 0);

  // Duplicate
  menu.querySelector('[data-action="duplicate"]').onclick = async () => {
    closeShiftContextMenu();
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: empId, dayOfWeek, startTime, endTime, notes, weekStart })
      });
      if (!res.ok) { showToast('Failed to duplicate shift', 'error'); return; }
      await loadShifts();
      if (shiftCalendar) shiftCalendar.refetchEvents();
      showToast('Shift duplicated', 'success');
    } catch { showToast('Failed to duplicate shift', 'error'); }
  };

  // Edit Details — open the popover anchored to the original calendar event element
  menu.querySelector('[data-action="edit"]').onclick = () => {
    closeShiftContextMenu();
    onShiftEventClick({ event: calEvent, el: eventEl });
  };

  // Delete
  menu.querySelector('[data-action="delete"]').onclick = async () => {
    closeShiftContextMenu();
    const dayName = DAY_NAMES[dayOfWeek] || '';
    const confirmed = await showConfirmModal({
      title: 'Delete Shift',
      message: `Delete ${empName}'s shift on ${dayName}?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      type: 'danger'
    });
    if (!confirmed) return;
    await fetch(`/api/shifts/${shiftId}`, { method: 'DELETE' });
    await loadShifts();
    showToast('Shift deleted', 'success');
  };
}

function pickEmployeeForShift() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    let empOptions = employees.map(e =>
      `<option value="${e.id}">${e.name}${e.active ? ' (Active)' : ''}</option>`
    ).join('');
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>Add Shift</h3>
        <p class="small-text">Select the driver for this shift:</p>
        <select id="shift-modal-employee" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-sm);font-size:13px;">
          ${empOptions}
        </select>
        <div class="modal-actions" style="margin-top:16px;">
          <button class="btn secondary" id="shift-modal-cancel">Cancel</button>
          <button class="btn primary" id="shift-modal-confirm">Add Shift</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const cleanup = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#shift-modal-cancel').onclick = () => cleanup(null);
    overlay.querySelector('#shift-modal-confirm').onclick = () => {
      const val = overlay.querySelector('#shift-modal-employee').value;
      cleanup(val || null);
    };
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
  });
}

async function renderRideScheduleGrid() {
  const grid = document.getElementById('ride-schedule-grid');
  if (!grid) return;

  const cfg = await getOpsConfig();
  const opDays = String(cfg.operating_days || '0,1,2,3,4').split(',').map(Number).sort((a, b) => a - b);
  const startHour = parseInt(String(cfg.service_hours_start || '08:00').split(':')[0], 10);
  const endHour = parseInt(String(cfg.service_hours_end || '19:00').split(':')[0], 10);

  const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekDates = getWeekDates(rideScheduleAnchor); // returns Mon–Sun (7 dates)

  const days = opDays.map(i => ALL_DAYS[i]);
  const activeDates = opDays.map(i => weekDates[i]);

  const timeSlots = generateTimeSlots(startHour, endHour);
  const slotMap = {};

  const weekStart = new Date(activeDates[0]);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(activeDates[activeDates.length - 1]);
  weekEnd.setHours(23, 59, 59, 999);

  const filteredRides = getFilteredRides();
  filteredRides.forEach((ride) => {
    if (!ride.requestedTime) return;
    const date = new Date(ride.requestedTime);
    if (isNaN(date.getTime())) return;
    if (date < weekStart || date > weekEnd) return;
    // Convert JS day (0=Sun) to our day index (0=Mon...6=Sun)
    const jsDay = date.getDay();
    const ourDay = (jsDay + 6) % 7;
    const colIdx = opDays.indexOf(ourDay);
    if (colIdx < 0) return; // ride falls on a non-operating day

    const hour = date.getHours();
    const minute = date.getMinutes();
    if (hour < startHour || hour > endHour || (hour === endHour && minute > 0)) return;
    const { slot, offset } = getSlotInfo(date);
    const key = `${slot}-${colIdx}`;
    if (!slotMap[key]) slotMap[key] = [];
    slotMap[key].push({ ...ride, offset });
  });

  updateRideWeekLabel();

  if (!Object.keys(slotMap).length) {
    grid.innerHTML = '<div class="ro-empty"><i class="ti ti-calendar-off"></i><div class="ro-empty__title">No rides on the calendar</div><div class="ro-empty__message">Approved and scheduled rides will appear here.</div></div>';
    return;
  }

  let html = '<table class="grid-table ride-schedule-table"><thead><tr><th>Time</th>';
  days.forEach((day, idx) => {
    const label = `${day} (${formatShortDate(activeDates[idx])})`;
    html += `<th>${label}</th>`;
  });
  html += '</tr></thead><tbody>';

  timeSlots.forEach((slot) => {
    html += `<tr><td>${slot}</td>`;
    days.forEach((_, colIdx) => {
      const ridesForCell = slotMap[`${slot}-${colIdx}`] || [];
      const content = ridesForCell.length
        ? ridesForCell
            .map((ride) => {
              const statusClass = `status-${ride.status}`;
              const pickup = formatLocationLabel(ride.pickupLocation);
              const riderLink = ride.riderId ? `<span data-user="${ride.riderId}" data-email="${ride.riderEmail || ''}" class="clickable-name">${ride.riderName}</span>` : ride.riderName;
              const offsetClass = ride.offset === 'mid' ? 'offset-mid' : '';
              return `<span class="ride-chip ${statusClass} ${offsetClass}"><span>${riderLink}</span><span class="time">${formatTimeOnly(ride.requestedTime)}</span><span class="small-text">${pickup}</span></span>`;
            })
            .join('')
        : '';
      html += `<td>${content}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  grid.innerHTML = html;
}

function renderSchedule() {
  // Legacy: FullCalendar handles schedule view now
}

async function loadUserProfileData(userId) {
  const content = document.getElementById('admin-profile-content');
  if (!content) return;
  content.innerHTML = 'Loading...';
  return _fetchAndRenderProfile(userId, content);
}

async function loadUserProfile(userId) {
  const content = document.getElementById('admin-profile-content');
  if (!content) return;
  content.innerHTML = 'Loading...';
  showTab('profile-panel');
  return _fetchAndRenderProfile(userId, content);
}

async function _fetchAndRenderProfile(userId, content) {
  try {
    let data;
    if (currentUser?.role === 'office') {
      const res = await fetch(`/api/admin/users/${userId || currentUser.id}/profile`);
      if (!res.ok) {
        let errText = '';
        try { errText = (await res.json()).error; } catch { errText = await res.text(); }
        throw new Error(errText || 'Unable to load profile');
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Unexpected response while loading profile');
      }
      data = await res.json();
      selectedAdminUser = data.user;
    } else {
      const meRes = await fetch('/api/me');
      if (!meRes.ok) {
        let errText = '';
        try { errText = (await meRes.json()).error; } catch { errText = await meRes.text(); }
        throw new Error(errText || 'Unable to load your profile');
      }
      const me = await meRes.json();
      let rides = [];
      if (me.role === 'rider') {
        const r = await fetch('/api/my-rides');
        rides = r.ok ? await r.json() : [];
      } else if (me.role === 'driver') {
        const r = await fetch('/api/rides');
        rides = r.ok ? await r.json() : [];
      }
      data = {
        user: me,
        upcoming: rides.filter((ride) => ['pending','approved','scheduled','driver_on_the_way','driver_arrived_grace'].includes(ride.status)),
        past: rides.filter((ride) => ['completed','no_show','denied','cancelled'].includes(ride.status))
      };
      selectedAdminUser = me;
    }
    renderProfilePanel(data);
  } catch (e) {
    content.innerHTML = `<p class="small-text">${e.message || 'Unable to load profile.'}</p>`;
  }
}

function renderProfilePanel(data) {
  const card = document.getElementById('profile-panel');
  const content = document.getElementById('admin-profile-content');
  if (!card || !content) return;
  if (!data) {
    return;
  }
  const { user, upcoming = [], past = [] } = data;
  const upcomingList = upcoming.slice(0, 5).map(renderProfileRide).join('') || '<p class="text-sm text-muted">None.</p>';
  const pastList = past.slice(0, 5).map(renderProfileRide).join('') || '<p class="text-sm text-muted">None.</p>';
  const isSelf = user.id === currentUser.id;
  const passwordSection = isSelf ? `
    <hr style="margin: 24px 0; border: none; border-top: 1px solid var(--color-border);">
    <div class="ro-section__title" style="margin-bottom:16px;">Change Password</div>
    <div class="mb-16">
      <label class="ro-label">Current Password</label>
      <input type="password" class="ro-input" id="profile-pw-current">
    </div>
    <div class="mb-16">
      <label class="ro-label">New Password (min 8 chars)</label>
      <input type="password" class="ro-input" id="profile-pw-new">
    </div>
    <div class="mb-16">
      <label class="ro-label">Confirm New Password</label>
      <input type="password" class="ro-input" id="profile-pw-confirm">
    </div>
    <button class="ro-btn ro-btn--outline" id="profile-pw-btn">Update Password</button>
    <div id="profile-pw-message" class="text-sm text-muted" style="margin-top:8px;"></div>
  ` : '';

  const ridesSection = user.role !== 'office' ? `
    <hr style="margin: 24px 0; border: none; border-top: 1px solid var(--color-border);">
    <div class="ro-section__title" style="margin-bottom:12px;">Upcoming Rides</div>
    ${upcomingList}
    <div class="ro-section__title" style="margin-top:20px; margin-bottom:12px;">Recent Rides</div>
    ${pastList}
  ` : '';

  content.innerHTML = `
    <div class="ro-section__header">
      <div>
        <div class="ro-section__title">My Profile</div>
        <div class="ro-section__subtitle">Your account information</div>
      </div>
      <button class="ro-btn ro-btn--primary" onclick="renderProfileEdit()"><i class="ti ti-edit"></i> Edit</button>
    </div>
    <div style="max-width: 480px;">
      <div class="mb-16">
        <label class="ro-label">Full Name</label>
        <input type="text" class="ro-input" value="${user.name || ''}" readonly>
      </div>
      <div class="mb-16">
        <label class="ro-label">Username</label>
        <input type="text" class="ro-input" value="${user.username || ''}" readonly>
      </div>
      <div class="mb-16">
        <label class="ro-label">Email</label>
        <input type="email" class="ro-input" value="${user.email || ''}" readonly>
      </div>
      <div class="mb-16">
        <label class="ro-label">${tenantConfig?.idFieldLabel || 'Member ID'}</label>
        <input type="text" class="ro-input" value="${user.member_id || ''}" readonly>
      </div>
      <div class="mb-16">
        <label class="ro-label">Phone</label>
        <input type="tel" class="ro-input" value="${user.phone || ''}" readonly>
      </div>
      <div class="mb-16">
        <label class="ro-label">Role</label>
        <input type="text" class="ro-input" value="${user.role || ''}" readonly style="text-transform: capitalize;">
      </div>
      ${ridesSection}
      ${passwordSection}
    </div>
  `;
  if (isSelf) {
    const pwBtn = content.querySelector('#profile-pw-btn');
    if (pwBtn) pwBtn.onclick = async () => {
      const msg = content.querySelector('#profile-pw-message');
      msg.textContent = '';
      msg.style.color = '';
      const currentPassword = content.querySelector('#profile-pw-current').value;
      const newPassword = content.querySelector('#profile-pw-new').value;
      const confirm = content.querySelector('#profile-pw-confirm').value;
      if (!currentPassword || !newPassword || !confirm) { msg.textContent = 'All fields are required.'; msg.style.color = 'var(--color-danger)'; return; }
      if (newPassword.length < 8) { msg.textContent = 'New password must be at least 8 characters.'; msg.style.color = 'var(--color-danger)'; return; }
      if (newPassword !== confirm) { msg.textContent = 'Passwords do not match.'; msg.style.color = 'var(--color-danger)'; return; }
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();
        if (!res.ok) { msg.textContent = data.error || 'Failed to change password'; msg.style.color = 'var(--color-danger)'; return; }
        msg.textContent = 'Password updated successfully!';
        msg.style.color = 'var(--color-success)';
        content.querySelector('#profile-pw-current').value = '';
        content.querySelector('#profile-pw-new').value = '';
        content.querySelector('#profile-pw-confirm').value = '';
      } catch { msg.textContent = 'Connection error'; msg.style.color = 'var(--color-danger)'; }
    };
  }
}

function renderProfileRide(ride) {
  return `<div style="padding:8px 0; border-bottom:1px solid var(--color-border);">
    <div>${statusBadge(ride.status)} ${ride.pickupLocation} → ${ride.dropoffLocation}</div>
    <div class="text-sm text-muted" style="margin-top:2px;">${formatDate(ride.requestedTime)}</div>
  </div>`;
}

function renderProfileEdit() {
  if (!selectedAdminUser) return;
  const content = document.getElementById('admin-profile-content');
  content.innerHTML = `
    <div class="ro-section__header">
      <div>
        <div class="ro-section__title">Edit Profile</div>
        <div class="ro-section__subtitle">Update your name and phone number</div>
      </div>
    </div>
    <div style="max-width: 480px;">
      <div class="mb-16">
        <label class="ro-label">Name</label>
        <input type="text" class="ro-input" id="admin-profile-name" value="${selectedAdminUser.name || ''}">
      </div>
      <div class="mb-16">
        <label class="ro-label">Phone</label>
        <input type="tel" class="ro-input" id="admin-profile-phone" value="${selectedAdminUser.phone || ''}" placeholder="(213) 555-0000">
      </div>
      <div class="text-sm text-muted" style="margin-bottom:16px;">Email: ${selectedAdminUser.email || ''} · Username: ${selectedAdminUser.username}</div>
      <div style="display:flex; gap:8px;">
        <button class="ro-btn ro-btn--primary" onclick="saveAdminProfile('${selectedAdminUser.id}')">Save Changes</button>
        <button class="ro-btn ro-btn--outline" onclick="loadUserProfile('${selectedAdminUser.id}')">Cancel</button>
      </div>
      <div id="admin-profile-message" class="text-sm text-muted" style="margin-top:8px;"></div>
    </div>
  `;
}

async function saveAdminProfile(userId) {
  const msg = document.getElementById('admin-profile-message');
  if (msg) msg.textContent = '';
  const name = document.getElementById('admin-profile-name')?.value.trim();
  const phone = document.getElementById('admin-profile-phone')?.value.trim();
  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone })
    });
    const data = await res.json();
    if (!res.ok) {
      if (msg) msg.textContent = data.error || 'Update failed';
      return;
    }
    await loadAdminUsers();
    await loadUserProfile(userId);
  } catch {
    if (msg) msg.textContent = 'Network error';
  }
}


// ----- Ride Filter -----
let rideFilterText = '';

function rideMatchesFilter(ride, filterText) {
  if (!filterText) return true;
  const q = filterText.toLowerCase();
  return (ride.riderName || '').toLowerCase().includes(q)
    || (ride.pickupLocation || '').toLowerCase().includes(q)
    || (ride.dropoffLocation || '').toLowerCase().includes(q)
    || (ride.status || '').toLowerCase().includes(q);
}

// ----- Ride Action Helpers -----

function buildAssignDropdown(ride, onDone) {
  const select = document.createElement('select');
  select.className = 'reassign-select';
  select.innerHTML = '<option value="">Assign to...</option>';
  employees.filter((e) => e.active).forEach((e) => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    select.appendChild(opt);
  });
  select.onchange = async () => {
    const driverId = select.value;
    if (!driverId) return;
    const driverName = employees.find((e) => e.id === driverId)?.name || 'driver';
    const confirmed = await showConfirmModal({
      title: 'Assign Ride',
      message: `Assign this ride to ${driverName}?`,
      confirmLabel: 'Assign',
      cancelLabel: 'Cancel',
      type: 'warning'
    });
    if (!confirmed) { select.value = ''; return; }
    const res = await fetch(`/api/rides/${ride.id}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId })
    });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Failed to assign', 'error');
    } else {
      showToast(`Ride assigned to ${driverName}`, 'success');
    }
    if (onDone) await onDone();
  };
  return select;
}

function buildReassignDropdown(ride, excludeDriverId, onDone) {
  const select = document.createElement('select');
  select.className = 'reassign-select';
  select.innerHTML = '<option value="">Reassign to...</option>';
  employees.filter((e) => e.active && e.id !== excludeDriverId).forEach((e) => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    select.appendChild(opt);
  });
  select.onchange = async () => {
    const driverId = select.value;
    if (!driverId) return;
    const driverName = employees.find((e) => e.id === driverId)?.name || 'driver';
    const confirmed = await showConfirmModal({
      title: 'Reassign Ride',
      message: `Reassign this ride to ${driverName}?`,
      confirmLabel: 'Reassign',
      cancelLabel: 'Cancel',
      type: 'warning'
    });
    if (!confirmed) { select.value = ''; return; }
    const res = await fetch(`/api/rides/${ride.id}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId })
    });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Failed to reassign', 'error');
    } else {
      showToast(`Ride reassigned to ${driverName}`, 'success');
    }
    if (onDone) await onDone();
  };
  return select;
}

function buildCancelButton(ride, onDone) {
  const btn = document.createElement('button');
  btn.className = 'btn danger';
  btn.textContent = 'Cancel';
  btn.onclick = async () => {
    const confirmed = await showConfirmModal({
      title: 'Cancel Ride',
      message: 'Cancel this ride? This cannot be undone.',
      confirmLabel: 'Cancel Ride',
      cancelLabel: 'Keep Ride',
      type: 'danger'
    });
    if (!confirmed) return;
    const res = await fetch(`/api/rides/${ride.id}/cancel`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Failed to cancel', 'error');
    } else {
      showToast('Ride cancelled', 'success');
    }
    if (onDone) await onDone();
  };
  return btn;
}

function buildKebabMenu(ride, onDone) {
  const wrapper = document.createElement('div');
  wrapper.className = 'kebab-menu-wrapper';

  const btn = document.createElement('button');
  btn.className = 'kebab-btn';
  btn.innerHTML = '<i class="ti ti-dots-vertical" style="font-size:20px;"></i>';

  const dropdown = document.createElement('div');
  dropdown.className = 'kebab-dropdown';

  // Edit option — always visible
  const editBtn = document.createElement('button');
  editBtn.className = 'edit-option';
  editBtn.innerHTML = '<i class="ti ti-pencil" style="font-size:16px;"></i> Edit';
  editBtn.onclick = (e) => {
    e.stopPropagation();
    dropdown.classList.remove('open');
    showEditRideModal(ride, onDone);
  };
  dropdown.appendChild(editBtn);

  // Delete option — hidden for terminal statuses
  const terminalStatuses = ['completed', 'no_show', 'cancelled', 'denied'];
  if (!terminalStatuses.includes(ride.status)) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-option';
    deleteBtn.innerHTML = '<i class="ti ti-trash" style="font-size:16px;"></i> Delete';
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      dropdown.classList.remove('open');
      const confirmed = await showConfirmModal({
        title: 'Delete Ride',
        message: 'Delete this ride? This cannot be undone.',
        confirmLabel: 'Delete Ride',
        cancelLabel: 'Keep Ride',
        type: 'danger'
      });
      if (!confirmed) return;
      const res = await fetch(`/api/rides/${ride.id}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Failed to delete', 'error');
      } else {
        showToast('Ride deleted', 'success');
      }
      if (onDone) await onDone();
    };
    dropdown.appendChild(deleteBtn);
  }

  btn.onclick = (e) => {
    e.stopPropagation();
    // Close any other open kebab menus
    document.querySelectorAll('.kebab-dropdown.open').forEach((d) => { if (d !== dropdown) d.classList.remove('open'); });
    dropdown.classList.toggle('open');
  };

  // Close on outside click
  const closeHandler = (e) => {
    if (!wrapper.contains(e.target)) {
      dropdown.classList.remove('open');
      document.removeEventListener('click', closeHandler);
    }
  };
  btn.addEventListener('click', () => {
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(dropdown);
  return wrapper;
}

async function showEditRideModal(ride, onDone) {
  // Fetch locations for dropdowns (uses campus param in demo mode)
  let locations = [];
  try {
    const locRes = await fetch(locationsUrl());
    locations = await locRes.json();
  } catch { /* fallback empty */ }

  const buildOptions = (selected) => {
    let html = '<option value="">Select location</option>';
    locations.forEach((loc) => {
      const label = typeof loc === 'string' ? loc : (loc.label || loc.value);
      if (!label) return;
      html += `<option value="${label}" ${label === selected ? 'selected' : ''}>${label}</option>`;
    });
    // If current value isn't in the list, add it
    if (selected && !locations.some((l) => (typeof l === 'string' ? l : (l.label || l.value)) === selected)) {
      html += `<option value="${selected}" selected>${selected}</option>`;
    }
    return html;
  };

  const currentTime = ride.requestedTime ? new Date(ride.requestedTime).toISOString().slice(0, 16) : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:520px;">
      <h3>Edit Ride</h3>
      <label>Pickup Location
        <select id="edit-ride-pickup">${buildOptions(ride.pickupLocation)}</select>
      </label>
      <label>Dropoff Location
        <select id="edit-ride-dropoff">${buildOptions(ride.dropoffLocation)}</select>
      </label>
      <label>Requested Time
        <input type="datetime-local" id="edit-ride-time" value="${currentTime}">
      </label>
      <label>Rider Notes
        <textarea id="edit-ride-notes" rows="2">${ride.notes || ''}</textarea>
      </label>
      <hr style="margin:16px 0; border:none; border-top:1px solid var(--border);">
      <label>Change Notes <span style="color:var(--status-no-show);">*</span>
        <textarea id="edit-ride-change-notes" rows="2" placeholder="Describe what changed and why..."></textarea>
      </label>
      <label>Initials <span style="color:var(--status-no-show);">*</span>
        <input type="text" id="edit-ride-initials" maxlength="5" placeholder="Your initials" style="max-width:120px;">
      </label>
      <div id="edit-ride-message" class="small-text" style="margin-top:8px;"></div>
      <div class="flex-row" style="gap:8px; margin-top:12px;">
        <button class="btn primary" id="edit-ride-save">Save</button>
        <button class="btn secondary" id="edit-ride-cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.remove('show');
    overlay.classList.add('hiding');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector('#edit-ride-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#edit-ride-save').onclick = async () => {
    const msg = overlay.querySelector('#edit-ride-message');
    msg.textContent = '';
    const changeNotes = overlay.querySelector('#edit-ride-change-notes').value.trim();
    const initials = overlay.querySelector('#edit-ride-initials').value.trim();
    if (!changeNotes) { msg.textContent = 'Change notes are required'; msg.style.color = 'var(--status-no-show)'; return; }
    if (!initials) { msg.textContent = 'Initials are required'; msg.style.color = 'var(--status-no-show)'; return; }

    const body = {
      pickupLocation: overlay.querySelector('#edit-ride-pickup').value,
      dropoffLocation: overlay.querySelector('#edit-ride-dropoff').value,
      requestedTime: overlay.querySelector('#edit-ride-time').value ? new Date(overlay.querySelector('#edit-ride-time').value).toISOString() : ride.requestedTime,
      notes: overlay.querySelector('#edit-ride-notes').value,
      changeNotes,
      initials
    };
    try {
      const res = await fetch(`/api/rides/${ride.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        msg.textContent = data.error || 'Update failed';
        msg.style.color = 'var(--status-no-show)';
        return;
      }
      showToast('Ride updated successfully', 'success');
      close();
      if (onDone) await onDone();
    } catch {
      msg.textContent = 'Network error';
      msg.style.color = 'var(--status-no-show)';
    }
  };
}

function buildUnassignButton(ride, driverName, onDone) {
  const btn = document.createElement('button');
  btn.className = 'btn secondary';
  btn.textContent = 'Unassign';
  btn.onclick = async () => {
    const confirmed = await showConfirmModal({
      title: 'Unassign Driver',
      message: `Unassign ${driverName} from this ride? It will return to the Available queue.`,
      confirmLabel: 'Unassign',
      cancelLabel: 'Cancel',
      type: 'warning'
    });
    if (!confirmed) return;
    const res = await fetch(`/api/rides/${ride.id}/unassign`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Failed to unassign', 'error');
    } else {
      showToast('Ride unassigned', 'success');
    }
    if (onDone) await onDone();
  };
  return btn;
}

function buildWarningBanner(driverName) {
  const banner = document.createElement('div');
  banner.className = 'admin-warning-banner';
  banner.innerHTML = `&#9888;&#65039; This ride is assigned to ${driverName}. Actions here will override the driver's workflow.`;
  return banner;
}

function showVehiclePromptModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    const box = document.createElement('div');
    box.className = 'modal-box';
    const availableVehicles = vehicles.filter(v => v.status === 'available');
    const vehOpts = availableVehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    box.innerHTML = `
      <h3>Select Vehicle</h3>
      <p>A vehicle must be recorded for this ride. Please select one:</p>
      <select id="vehicle-prompt-select" style="width:100%;padding:0.5rem;margin:0.5rem 0;border:1px solid #ddd;border-radius:4px;">
        <option value="">Choose a cart...</option>${vehOpts}
      </select>
      <div class="modal-actions">
        <button class="btn" id="vehicle-prompt-cancel">Cancel</button>
        <button class="btn primary" id="vehicle-prompt-confirm">Confirm</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const cleanup = (val) => { document.body.removeChild(overlay); resolve(val); };
    document.getElementById('vehicle-prompt-cancel').onclick = () => cleanup(null);
    document.getElementById('vehicle-prompt-confirm').onclick = () => {
      const val = document.getElementById('vehicle-prompt-select').value;
      if (!val) { showToast('Please select a vehicle', 'warning'); return; }
      cleanup(val);
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
  });
}

function getDateKey(dateStr) {
  if (!dateStr) return 'unknown';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ----- Ride Lists -----
let rideStatusFilter = new Set(['all']);
let _ridesSelectedIds = new Set();

function _ridesUpdateSelectionUI() {
  const count = _ridesSelectedIds.size;
  const bulkActions = document.getElementById('rides-bulk-actions');
  const countEl = document.getElementById('rides-selected-count');
  const selectAllCb = document.getElementById('rides-select-all');
  if (bulkActions) bulkActions.style.display = count > 0 ? 'inline' : 'none';
  if (countEl) countEl.textContent = count;
  if (selectAllCb) {
    const allCbs = document.querySelectorAll('#rides-tbody .ride-row-cb');
    selectAllCb.checked = allCbs.length > 0 && count === allCbs.length;
  }
}

function getFilteredRides() {
  let filtered = rides;

  // Status filter (multi-select)
  if (!rideStatusFilter.has('all')) {
    filtered = filtered.filter(r => {
      if (rideStatusFilter.has('in_progress')) {
        if (['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(r.status)) return true;
      }
      return rideStatusFilter.has(r.status);
    });
  }

  // Date range filter
  if (ridesDateFrom) {
    filtered = filtered.filter(r => r.requestedTime && getDateKey(r.requestedTime) >= ridesDateFrom);
  }
  if (ridesDateTo) {
    filtered = filtered.filter(r => r.requestedTime && getDateKey(r.requestedTime) <= ridesDateTo);
  }

  // Text filter
  if (rideFilterText) {
    filtered = filtered.filter(r => rideMatchesFilter(r, rideFilterText));
  }

  // Sort by requestedTime descending
  filtered.sort((a, b) => {
    const da = a.requestedTime ? new Date(a.requestedTime).getTime() : 0;
    const db = b.requestedTime ? new Date(b.requestedTime).getTime() : 0;
    return db - da;
  });

  return filtered;
}

function renderRideViews() {
  renderRideLists();
  const calView = document.getElementById('rides-calendar-view-container');
  if (calView && calView.style.display !== 'none') {
    renderRideScheduleGrid();
  }
}

function renderRideLists() {
  const tbody = document.getElementById('rides-tbody');
  if (!tbody) return;

  const filtered = getFilteredRides();

  tbody.innerHTML = '';
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--color-text-muted);">No rides match the current filters.</td></tr>';
  } else {
    filtered.forEach(ride => {
      const tr = document.createElement('tr');
      const driverName = ride.assignedDriverId ? (employees.find(e => e.id === ride.assignedDriverId)?.name || '—') : '—';
      const pickup = abbreviateLocation(ride.pickupLocation);
      const dropoff = abbreviateLocation(ride.dropoffLocation);
      tr.innerHTML = `
        <td><input type="checkbox" class="ride-row-cb" data-ride-id="${ride.id}" style="cursor:pointer;"></td>
        <td>${formatDate(ride.requestedTime)}</td>
        <td><span class="clickable-name" data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}">${ride.riderName}</span></td>
        <td title="${ride.pickupLocation} → ${ride.dropoffLocation}">${pickup} → ${dropoff}</td>
        <td>${statusBadge(ride.status)}</td>
        <td>${ride.assignedDriverId ? `<span class="clickable-name" data-user="${ride.assignedDriverId}">${driverName}</span>` : '—'}</td>
        <td></td>
      `;
      // Checkbox handler — preserve selections across re-renders
      const cb = tr.querySelector('.ride-row-cb');
      if (_ridesSelectedIds.has(ride.id)) cb.checked = true;
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        if (cb.checked) _ridesSelectedIds.add(ride.id);
        else _ridesSelectedIds.delete(ride.id);
        _ridesUpdateSelectionUI();
      });
      // Quick actions in last cell
      const actionsCell = tr.querySelectorAll('td')[6];
      if (ride.status === 'pending') {
        const approveBtn = document.createElement('button');
        approveBtn.className = 'ro-btn ro-btn--success ro-btn--sm';
        approveBtn.textContent = 'Approve';
        approveBtn.onclick = (e) => { e.stopPropagation(); updateRide(`/api/rides/${ride.id}/approve`); };
        actionsCell.appendChild(approveBtn);
      }
      tr.style.cursor = 'pointer';
      tr.onclick = (e) => {
        if (e.target.closest('.ro-btn') || e.target.closest('.clickable-name') || e.target.closest('select') || e.target.closest('.ride-row-cb')) return;
        openRideDrawer(ride);
      };
      tbody.appendChild(tr);
    });
  }

  // Update count
  const countEl = document.getElementById('ride-filter-count');
  if (countEl) countEl.textContent = `${filtered.length} ride${filtered.length !== 1 ? 's' : ''}`;

  // Prune selections for rides no longer visible, preserve the rest
  const visibleRideIds = new Set(filtered.map(r => r.id));
  for (const id of _ridesSelectedIds) {
    if (!visibleRideIds.has(id)) _ridesSelectedIds.delete(id);
  }
  _ridesUpdateSelectionUI();
  const selectAllCb = document.getElementById('rides-select-all');
  if (selectAllCb) {
    const allCbs = document.querySelectorAll('#rides-tbody .ride-row-cb');
    selectAllCb.checked = allCbs.length > 0 && _ridesSelectedIds.size === allCbs.length;
  }
}

async function updateRide(url, body = null) {
  const options = { method: 'POST' };
  if (body) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to update ride', 'error');
    return false;
  }
  await loadRides();
  return true;
}

async function claimRide(rideId, driverId) {
  const res = await fetch(`/api/rides/${rideId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId })
  });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Cannot claim ride', 'error');
  }
  await loadRides();
}

// ----- Dispatch & Monitoring -----
function renderDriverConsole() {
  renderDispatchSummary();
  renderPendingQueue();
  renderDispatchGrid();
}

function renderDispatchSummary() {
  const today = getTodayLocalDate();
  const activeDrivers = employees.filter(e => e.active).length;
  const activeRides = rides.filter(r => ['scheduled','driver_on_the_way','driver_arrived_grace'].includes(r.status) && r.requestedTime?.startsWith(today)).length;
  const pendingRides = rides.filter(r => r.status === 'pending').length;
  const completedToday = rides.filter(r => r.status === 'completed' && r.requestedTime?.startsWith(today)).length;
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('dispatch-active-drivers', activeDrivers);
  el('dispatch-active-rides', activeRides);
  el('dispatch-pending-rides', pendingRides);
  el('dispatch-completed-today', completedToday);

  // Tardy today: drivers who clocked in late today (confirmed tardiness from clock_events)
  const tardyToday = todayDriverStatus.filter(d =>
    d.todayClockEvents?.some(ce => ce.tardiness_minutes > 0)
  ).length;
  el('dispatch-tardy-today', tardyToday);

  // Missing: drivers not clocked in but currently within a shift window
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const todayDow = (now.getDay() + 6) % 7; // Mon=0
  const currentWeekStart = formatDateInputLocal(getMondayOfWeek(now));
  const missingDrivers = employees.filter(e => {
    if (e.active) return false;
    const hasClockedInToday = todayDriverStatus.find(d => d.id === e.id)?.todayClockEvents?.length > 0;
    if (hasClockedInToday) return false;
    return shifts.some(s =>
      s.employeeId === e.id &&
      s.dayOfWeek === todayDow &&
      (!s.weekStart || s.weekStart.slice(0, 10) === currentWeekStart) &&
      (() => {
        const [sh, sm] = s.startTime.split(':').map(Number);
        const [eh, em] = s.endTime.split(':').map(Number);
        return nowMins >= (sh * 60 + sm) && nowMins < (eh * 60 + em);
      })()
    );
  }).length;
  const missingEl = document.getElementById('dispatch-missing-drivers');
  if (missingEl) missingEl.textContent = missingDrivers;
}

function renderPendingQueue() {
  const list = document.getElementById('pending-queue-list');
  if (!list) return;
  const today = getTodayLocalDate();
  const pending = rides.filter(r => r.status === 'pending');
  if (!pending.length) {
    list.innerHTML = '<div class="ro-empty"><div class="ro-empty__title">No pending rides</div><div class="ro-empty__message">All ride requests have been processed.</div></div>';
    return;
  }
  list.innerHTML = '';
  pending.forEach(ride => {
    const row = document.createElement('div');
    row.className = 'strip-row';
    const terminated = ride.consecutiveMisses >= 5;
    row.innerHTML = `
      <div style="flex:1;">
        <div>${statusBadge('pending')} <span class="clickable-name" data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}">${ride.riderName}</span></div>
        <div class="text-sm text-muted" style="margin-top:2px;">${ride.pickupLocation} → ${ride.dropoffLocation} · ${formatDate(ride.requestedTime)}</div>
        ${terminated ? '<div class="alert" style="margin-top:4px;">SERVICE TERMINATED — 5 consecutive no-shows</div>' : ''}
      </div>
    `;
    const actions = document.createElement('div');
    actions.className = 'strip-row__actions';
    const approveBtn = document.createElement('button');
    approveBtn.className = 'ro-btn ro-btn--success ro-btn--sm';
    approveBtn.textContent = 'Approve';
    approveBtn.disabled = terminated;
    approveBtn.onclick = (e) => { e.stopPropagation(); updateRide(`/api/rides/${ride.id}/approve`); };
    const denyBtn = document.createElement('button');
    denyBtn.className = 'ro-btn ro-btn--danger ro-btn--sm';
    denyBtn.textContent = 'Deny';
    denyBtn.onclick = (e) => { e.stopPropagation(); updateRide(`/api/rides/${ride.id}/deny`); };
    actions.appendChild(approveBtn);
    actions.appendChild(denyBtn);
    row.appendChild(actions);
    row.onclick = () => openRideDrawer(ride);
    list.appendChild(row);
  });
}

async function renderDispatchGrid() {
  if (isDragging) return;
  const grid = document.getElementById('dispatch-grid');
  if (!grid) return;
  const dateInput = document.getElementById('dispatch-date');
  const selectedDate = dateInput?.value ? parseDateInputLocal(dateInput.value) : new Date();
  const dateStr = formatDateInputLocal(selectedDate || new Date());
  const cfg = await getOpsConfig();
  const [sH] = String(cfg.service_hours_start || '08:00').split(':').map(Number);
  const [eH] = String(cfg.service_hours_end || '19:00').split(':').map(Number);
  const startHour = Math.max(0, sH - 1);
  const cols = Math.min(24, eH + 1) - startHour;

  // Classify drivers
  const activeDrivers = employees.filter(e => e.active);
  const inactiveDrivers = employees.filter(e => !e.active);

  // Get today's rides
  const dayRides = rides.filter(r => r.requestedTime && r.requestedTime.startsWith(dateStr) && !['denied', 'cancelled'].includes(r.status));

  // Unassigned approved rides
  const unassignedRides = dayRides.filter(r => r.status === 'approved' && !r.assignedDriverId);

  const gridColStyle = `grid-template-columns: 100px repeat(${cols}, 1fr)`;

  let html = '';

  // Header row
  html += `<div class="time-grid__header" style="${gridColStyle}">`;
  html += `<div class="time-grid__time-label" style="font-weight:700;">Driver</div>`;
  for (let h = startHour; h < startHour + cols; h++) {
    const label = h <= 12 ? h + 'a' : (h - 12) + 'p';
    html += `<div class="time-grid__time-label">${label}</div>`;
  }
  html += '</div>';

  // Assign each active driver a color from the campus palette for visual identification
  const campusPal = getCurrentCampusPalette();
  activeDrivers.forEach((driver, idx) => {
    driver._paletteColor = campusPal[idx % campusPal.length];
  });

  // Active drivers
  activeDrivers.forEach(driver => {
    const driverRides = dayRides.filter(r => r.assignedDriverId === driver.id);
    html += buildDriverGridRow(driver, driverRides, cols, startHour, gridColStyle, true);
  });

  // Unassigned row (always rendered as drop target)
  const unassignedLabel = unassignedRides.length ? `Unassigned (${unassignedRides.length})` : 'Unassigned';
  html += `<div class="time-grid__separator">${unassignedLabel}</div>`;
  html += `<div class="time-grid__row" data-row-type="unassigned" style="${gridColStyle}">`;
  html += `<div class="time-grid__driver"><span class="time-grid__driver-dot time-grid__driver-dot--offline"></span>Unassigned</div>`;
  for (let h = startHour; h < startHour + cols; h++) {
    html += `<div style="position:relative;border-right:1px solid var(--color-border-light);">`;
    unassignedRides.forEach(r => {
      const rideDate = new Date(r.requestedTime);
      const rideHour = rideDate.getHours();
      if (rideHour === h) {
        const mins = rideDate.getMinutes();
        const left = (mins / 60 * 100) + '%';
        const lastName = (r.riderName || '').split(' ').pop();
        const abbrev = abbreviateLocation(r.pickupLocation);
        html += `<div class="time-grid__ride-strip" data-ride-id="${r.id}" data-ride-status="${r.status}" draggable="true" style="left:${left};width:50%;background:var(--status-approved);" title="${r.riderName}: ${r.pickupLocation} → ${r.dropoffLocation}">${lastName} · ${abbrev}</div>`;
      }
    });
    html += '</div>';
  }
  html += '</div>';

  // Off-shift separator
  if (inactiveDrivers.length) {
    html += `<div class="time-grid__separator">Off Shift (${inactiveDrivers.length})</div>`;
    inactiveDrivers.forEach(driver => {
      const driverRides = dayRides.filter(r => r.assignedDriverId === driver.id);
      html += buildDriverGridRow(driver, driverRides, cols, startHour, gridColStyle, false);
    });
  }

  if (!activeDrivers.length && !unassignedRides.length && !inactiveDrivers.length) {
    html = '<div class="ro-empty"><i class="ti ti-calendar-off"></i><div class="ro-empty__title">No activity</div><div class="ro-empty__message">No drivers or rides for this date.</div></div>';
  }

  grid.innerHTML = html;

  // Now-line: only show if viewing today
  if (dateStr === getTodayLocalDate()) {
    const now = new Date();
    const nowHours = now.getHours() + now.getMinutes() / 60;
    if (nowHours >= startHour && nowHours < startHour + cols) {
      const fraction = (nowHours - startHour) / cols;
      const line = document.createElement('div');
      line.className = 'time-grid__now-line';
      line.style.left = `calc(100px + (100% - 100px) * ${fraction})`;
      grid.appendChild(line);
    }
  }

}

function buildDriverGridRow(driver, driverRides, cols, startHour, gridColStyle, isActive) {
  // Find driver's shifts for the selected day (computed before row div so we can detect tardiness)
  const dateInput = document.getElementById('dispatch-date');
  const selectedDate = dateInput?.value ? parseDateInputLocal(dateInput.value) : new Date();
  const dayOfWeek = selectedDate ? ((selectedDate.getDay() + 6) % 7) : ((new Date().getDay() + 6) % 7); // Mon=0
  const currentWeekStart = formatDateInputLocal(getMondayOfWeek(selectedDate));

  const driverShifts = shifts.filter(s =>
    s.employeeId === driver.id &&
    s.dayOfWeek === dayOfWeek &&
    (!s.weekStart || s.weekStart.slice(0, 10) === currentWeekStart)
  );

  // Tardiness detection: not clocked in + viewing today + currently within a shift window
  const isToday = formatDateInputLocal(selectedDate) === getTodayLocalDate();
  const hasClockedInToday = todayDriverStatus.find(d => d.id === driver.id)?.todayClockEvents?.length > 0;
  const isTardy = !isActive && !hasClockedInToday && isToday && driverShifts.some(s => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return nowMins >= (sh * 60 + sm) && nowMins < (eh * 60 + em);
  });

  const dotClass = isActive ? 'time-grid__driver-dot--online' : 'time-grid__driver-dot--offline';
  const tardyClass = isTardy ? ' time-grid__row--tardy' : '';
  const rowOpacity = (!isActive && !isTardy) ? ';opacity:0.5;' : '';
  let html = `<div class="time-grid__row${tardyClass}" data-driver-id="${driver.id}" data-active="${isActive}" style="${gridColStyle}${rowOpacity}">`;
  let tardyBadgeHtml = '';
  if (isTardy) {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const activeShift = driverShifts.find(s => {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      return nowMins >= (sh * 60 + sm) && nowMins < (eh * 60 + em);
    });
    if (activeShift) {
      const [sh, sm] = activeShift.startTime.split(':').map(Number);
      const tardyMins = nowMins - (sh * 60 + sm);
      tardyBadgeHtml = `<span class="tardy-badge"><i class="ti ti-clock-exclamation"></i>${tardyMins}m late</span>`;
    }
  }
  html += `<div class="time-grid__driver"><span class="time-grid__driver-dot ${dotClass}"></span><span class="clickable-name" data-user="${driver.id}">${driver.name}</span>${tardyBadgeHtml}</div>`;

  const bandColor = driver._paletteColor ? hexToRgb(driver._paletteColor) : 'var(--color-secondary-rgb, 210,180,140)';
  driverShifts.forEach(s => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    const startFrac = sh + sm / 60;
    const endFrac = eh + em / 60;

    // Clamp to visible grid range
    const visStart = Math.max(startFrac, startHour);
    const visEnd = Math.min(endFrac, startHour + cols);
    if (visEnd <= visStart) return;

    const leftFrac = ((visStart - startHour) / cols).toFixed(6);
    const widthFrac = ((visEnd - visStart) / cols).toFixed(6);

    html += `<div class="time-grid__shift-band" style="left:calc(100px + (100% - 100px) * ${leftFrac});width:calc((100% - 100px) * ${widthFrac});background:rgba(${bandColor},0.18);border-color:rgba(${bandColor},0.45);"></div>`;
  });

  for (let h = startHour; h < startHour + cols; h++) {
    html += `<div style="position:relative;border-right:1px solid var(--color-border-light);">`;

    // Render rides at this hour
    driverRides.forEach(r => {
      const rideTime = new Date(r.requestedTime);
      const rideHour = rideTime.getHours();
      if (rideHour === h) {
        const mins = rideTime.getMinutes();
        const left = (mins / 60 * 100) + '%';
        const statusColors = {
          approved: 'var(--status-approved)', scheduled: 'var(--status-scheduled)',
          driver_on_the_way: 'var(--status-on-the-way)', driver_arrived_grace: 'var(--status-grace)',
          completed: 'var(--status-completed)', no_show: 'var(--status-no-show)', pending: 'var(--status-pending)'
        };
        const bg = statusColors[r.status] || 'var(--status-pending)';
        const lastName = (r.riderName || '').split(' ').pop();
        const abbrev = abbreviateLocation(r.pickupLocation);
        const isDraggable = r.status === 'scheduled';
        html += `<div class="time-grid__ride-strip" data-ride-id="${r.id}" data-ride-status="${r.status}"${isDraggable ? ' draggable="true"' : ''} style="left:${left};width:50%;background:${bg};border-left:3px solid ${driver._paletteColor || bg};" title="${r.riderName}: ${r.pickupLocation} → ${r.dropoffLocation}">${lastName} · ${abbrev}</div>`;
      }
    });

    html += '</div>';
  }
  html += '</div>';
  return html;
}

function abbreviateLocation(location) {
  if (!location) return '?';
  // Extract abbreviation from parentheses, e.g. "Some Building (ABC)" → "ABC"
  const match = location.match(/\(([^)]+)\)\s*$/);
  if (match) return match[1];
  // Fall back to first 6 chars
  return location.substring(0, 6);
}

function openRideDrawer(ride) {
  const driverName = ride.assignedDriverId ? (employees.find(e => e.id === ride.assignedDriverId)?.name || 'Unknown') : 'Unassigned';
  const vehicleName = ride.vehicleId ? (vehicles.find(v => v.id === ride.vehicleId)?.name || ride.vehicleId) : null;
  const graceInfo = buildGraceInfo(ride);
  const isTerminal = ['completed', 'no_show', 'cancelled', 'denied'].includes(ride.status);

  let html = '';
  html += `<div style="margin-bottom:16px;">`;
  html += `<div style="margin-bottom:8px;">${statusBadge(ride.status)}</div>`;
  html += `<div class="ro-label" style="margin-top:8px;">Rider</div>`;
  html += profileCardHTML({
    name: ride.riderName,
    preferredName: ride.riderPreferredName,
    avatarUrl: ride.riderAvatar,
    major: ride.riderMajor,
    graduationYear: ride.riderGraduationYear,
    bio: ride.riderBio
  }, { variant: 'compact' });
  if (ride.assignedDriverId) {
    html += `<div class="ro-label" style="margin-top:12px;">Driver</div>`;
    html += profileCardHTML({
      name: driverName,
      preferredName: ride.driverPreferredName,
      avatarUrl: ride.driverAvatar,
      bio: ride.driverBio
    }, { variant: 'compact' });
  }
  html += `</div>`;

  // Route
  html += `<div class="drawer-section">`;
  html += `<div class="drawer-section-title">Route</div>`;
  html += `<div class="drawer-field"><div class="drawer-field-label">Pickup</div><div class="drawer-field-value">${ride.pickupLocation}</div></div>`;
  html += `<div class="drawer-field"><div class="drawer-field-label">Dropoff</div><div class="drawer-field-value">${ride.dropoffLocation}</div></div>`;
  html += `<div class="drawer-field"><div class="drawer-field-label">Requested</div><div class="drawer-field-value">${formatDate(ride.requestedTime)}</div></div>`;
  html += `<div class="drawer-field"><div class="drawer-field-label">Driver</div><div class="drawer-field-value">${ride.assignedDriverId ? `<span class="clickable-name" data-user="${ride.assignedDriverId}">${driverName}</span>` : 'Unassigned'}</div></div>`;
  if (vehicleName) html += `<div class="drawer-field"><div class="drawer-field-label">Vehicle</div><div class="drawer-field-value">${vehicleName}</div></div>`;
  if (ride.notes) html += `<div class="drawer-field"><div class="drawer-field-label">Notes</div><div class="drawer-field-value">${ride.notes}</div></div>`;
  html += `<div class="drawer-field"><div class="drawer-field-label">No-shows</div><div class="drawer-field-value">${ride.consecutiveMisses || 0}</div></div>`;
  html += `</div>`;

  // Contact
  if (ride.riderPhone) {
    html += `<div class="drawer-section"><div class="drawer-section-title">Contact</div>`;
    html += `<div class="contact-row">`;
    html += `<a class="contact-pill" href="tel:${ride.riderPhone}"><span class="icon">☎</span>Call</a>`;
    html += `<a class="contact-pill" href="sms:${ride.riderPhone}"><span class="icon">✉</span>Text</a>`;
    html += `</div></div>`;
  }

  // Grace info
  if (graceInfo.message) {
    html += `<div class="text-sm" style="padding:8px 0;font-weight:600;${graceInfo.canNoShow ? 'color:var(--status-no-show);' : 'color:var(--status-grace);'}">${graceInfo.message}</div>`;
  }

  // Actions
  html += `<div class="drawer-section"><div class="drawer-section-title">Actions</div>`;
  html += `<div id="ride-drawer-actions" style="display:flex;flex-direction:column;gap:8px;"></div>`;
  html += `</div>`;

  openDrawer(html);

  // Wire action buttons
  const actionsEl = document.getElementById('ride-drawer-actions');
  if (!actionsEl) return;

  const reload = async () => { await loadRides(); closeDrawer(); };

  if (ride.status === 'pending') {
    const terminated = ride.consecutiveMisses >= 5;
    actionsEl.appendChild(makeBtn('Approve', 'ro-btn ro-btn--success ro-btn--full', () => updateRide(`/api/rides/${ride.id}/approve`).then(reload), terminated));
    actionsEl.appendChild(makeBtn('Deny', 'ro-btn ro-btn--danger ro-btn--full', () => updateRide(`/api/rides/${ride.id}/deny`).then(reload)));
  }

  if (ride.status === 'approved' && !ride.assignedDriverId) {
    const select = buildAssignDropdown(ride, reload);
    select.style.width = '100%';
    actionsEl.appendChild(select);
  }

  if (['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(ride.status)) {
    actionsEl.appendChild(makeBtn('On My Way', 'ro-btn ro-btn--primary ro-btn--full', async () => {
      if (!ride.vehicleId) {
        const vehicleId = await showVehiclePromptModal();
        if (!vehicleId) return;
        await updateRide(`/api/rides/${ride.id}/on-the-way`, { vehicleId });
      } else {
        await updateRide(`/api/rides/${ride.id}/on-the-way`);
      }
      reload();
    }));
    actionsEl.appendChild(makeBtn("I'm Here", 'ro-btn ro-btn--outline ro-btn--full', () => updateRide(`/api/rides/${ride.id}/here`).then(reload)));
    actionsEl.appendChild(makeBtn('Complete', 'ro-btn ro-btn--success ro-btn--full', async () => {
      const confirmed = await showConfirmModal({ title: 'Complete Ride', message: 'Mark this ride as completed?', confirmLabel: 'Complete', type: 'warning' });
      if (!confirmed) return;
      if (!ride.vehicleId) {
        const vehicleId = await showVehiclePromptModal();
        if (!vehicleId) return;
        await updateRide(`/api/rides/${ride.id}/complete`, { vehicleId });
      } else {
        await updateRide(`/api/rides/${ride.id}/complete`);
      }
      reload();
    }));
    actionsEl.appendChild(makeBtn('No-Show', 'ro-btn ro-btn--danger ro-btn--full', async () => {
      const confirmed = await showConfirmModal({ title: 'Confirm No-Show', message: 'Mark this rider as a no-show?', confirmLabel: 'Mark No-Show', type: 'danger' });
      if (confirmed) { await updateRide(`/api/rides/${ride.id}/no-show`); reload(); }
    }, !graceInfo.canNoShow));
  }

  if (ride.assignedDriverId && ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(ride.status)) {
    const hr = document.createElement('hr');
    hr.style.cssText = 'border:none;border-top:1px solid var(--color-border);margin:8px 0;';
    actionsEl.appendChild(hr);
    actionsEl.appendChild(makeBtn('Unassign Driver', 'ro-btn ro-btn--outline ro-btn--full', async () => {
      const confirmed = await showConfirmModal({ title: 'Unassign Driver', message: `Unassign ${driverName}?`, confirmLabel: 'Unassign', type: 'warning' });
      if (confirmed) {
        try {
          const res = await fetch(`/api/rides/${ride.id}/unassign`, { method: 'POST' });
          if (!res.ok) { const err = await res.json().catch(() => ({})); showToast(err.error || 'Failed to unassign', 'error'); }
          else { showToast('Driver unassigned', 'success'); }
        } catch { showToast('Network error', 'error'); }
        reload();
      }
    }));
    const reassignSelect = buildReassignDropdown(ride, ride.assignedDriverId, reload);
    reassignSelect.style.width = '100%';
    actionsEl.appendChild(reassignSelect);
  }

  if (!isTerminal) {
    actionsEl.appendChild(makeBtn('Cancel Ride', 'ro-btn ro-btn--danger ro-btn--full', async () => {
      const confirmed = await showConfirmModal({ title: 'Cancel Ride', message: 'Cancel this ride?', confirmLabel: 'Cancel Ride', type: 'danger' });
      if (confirmed) {
        try {
          const res = await fetch(`/api/rides/${ride.id}/cancel`, { method: 'POST' });
          if (!res.ok) { const err = await res.json().catch(() => ({})); showToast(err.error || 'Failed to cancel', 'error'); }
          else { showToast('Ride cancelled', 'success'); }
        } catch { showToast('Network error', 'error'); }
        reload();
      }
    }));
  }

  actionsEl.appendChild(makeBtn('Edit Ride', 'ro-btn ro-btn--outline ro-btn--full', () => { closeDrawer(); showEditRideModal(ride, () => loadRides()); }));
}

function makeBtn(label, className, onclick, disabled) {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = label;
  btn.onclick = onclick;
  if (disabled) btn.disabled = true;
  return btn;
}


function buildGraceInfo(ride) {
  if (ride.status !== 'driver_arrived_grace' || !ride.graceStartTime) {
    return { message: '', canNoShow: false };
  }
  const graceStart = new Date(ride.graceStartTime);
  const elapsed = (Date.now() - graceStart.getTime()) / 1000;
  const graceSec = (tenantConfig && tenantConfig.grace_period_minutes ? Number(tenantConfig.grace_period_minutes) : 5) * 60;
  const remaining = Math.max(0, graceSec - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60).toString().padStart(2, '0');
  const canNoShow = remaining <= 0;
  const message = canNoShow
    ? 'Wait time expired. You may mark a no-show.'
    : `Waiting for rider (${minutes}:${seconds} remaining)`;
  return { message, canNoShow };
}

// ----- Helpers -----
function formatDate(dateStr) {
  if (typeof window.formatDateTime === 'function') {
    return window.formatDateTime(dateStr);
  }
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function getTodayLocalDate() {
  return formatDateInputLocal(new Date());
}

function formatDateInputLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateInputLocal(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function getSelectedDate() {
  const input = document.getElementById('schedule-date');
  const parsed = parseDateInputLocal(input?.value);
  return parsed || new Date();
}

function getWeekDates(selectedDate) {
  const date = new Date(selectedDate);
  const jsDay = date.getDay(); // 0=Sun
  const diffToMonday = (jsDay + 6) % 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - diffToMonday);
  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    return d;
  });
}

function formatShortDate(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function formatTimeOnly(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLocationLabel(location) {
  if (!location) return 'N/A';
  return location.trim().toUpperCase();
}

function getSlotInfo(date) {
  const hour = date.getHours();
  const minute = date.getMinutes();
  let slotMinute = '00';
  let offset = 'start';
  if (minute < 15) {
    slotMinute = '00';
    offset = 'start';
  } else if (minute < 30) {
    slotMinute = '00';
    offset = 'mid';
  } else if (minute < 45) {
    slotMinute = '30';
    offset = 'start';
  } else {
    slotMinute = '30';
    offset = 'mid';
  }
  return { slot: `${String(hour).padStart(2, '0')}:${slotMinute}`, offset };
}

function updateRideWeekLabel() {
  const label = document.getElementById('ride-week-label');
  if (!label) return;
  const week = getWeekDates(rideScheduleAnchor);
  const start = week[0];
  const end = week[week.length - 1];
  label.textContent = `Week of ${formatShortDate(start)} - ${formatShortDate(end)}`;
}

async function changeRideWeek(delta) {
  rideScheduleAnchor.setDate(rideScheduleAnchor.getDate() + delta * 7);
  updateRideWeekLabel();
  await renderRideScheduleGrid();
}

function isRenderableRideStatus(status) {
  return ['pending','approved','scheduled','driver_on_the_way','driver_arrived_grace','completed','no_show'].includes(status);
}

function isRideOnDate(ride, dateObj) {
  if (!ride?.requestedTime) return false;
  const rideDate = new Date(ride.requestedTime);
  if (isNaN(rideDate)) return false;
  return rideDate.toDateString() === dateObj.toDateString();
}

function buildContactPill(protocol, phone, icon, label) {
  const link = document.createElement('a');
  link.className = 'contact-pill';
  link.innerHTML = `<span class="icon">${icon}</span><span>${label}</span>`;
  if (phone) {
    link.href = `${protocol}:${phone}`;
    link.setAttribute('aria-label', `${label} ${phone}`);
  } else {
    link.href = '#';
    link.onclick = (e) => {
      e.preventDefault();
      showToast('No phone number available', 'warning');
    };
  }
  return link;
}

function openProfileById(id) {
  if (!id) {
    openAdminDrawer(currentUser?.id);
    return;
  }
  let targetId = id;
  if (currentUser?.role === 'office' && Array.isArray(adminUsers) && adminUsers.length) {
    const found = adminUsers.find((u) => u.id === id || u.email === id || u.username === id);
    if (found) targetId = found.id;
  }
  openAdminDrawer(targetId);
}

window._cachedRulesHtml = null;

async function showRulesModal() {
  const overlay = document.createElement('div');
  overlay.className = 'ro-modal-overlay open';
  overlay.innerHTML =
    '<div class="ro-modal" style="max-width:600px;width:92%;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
    '<div class="ro-modal__title" style="margin:0;">Program Rules &amp; Guidelines</div>' +
    '<button class="ro-btn ro-btn--outline ro-btn--sm modal-close-btn">\u2715 Close</button>' +
    '</div>' +
    '<div id="rules-modal-body" style="font-size:14px;line-height:1.8;color:var(--color-text);max-height:65vh;overflow-y:auto;">' +
    '<div class="text-muted text-sm">Loading...</div>' +
    '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close-btn').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  try {
    if (!window._cachedRulesHtml) {
      const data = await fetch('/api/program-rules').then(r => r.json());
      window._cachedRulesHtml = data.rulesHtml || '';
    }
    const body = overlay.querySelector('#rules-modal-body');
    if (body) {
      if (window._cachedRulesHtml) {
        body.innerHTML = window._cachedRulesHtml;
      } else {
        const fallback = (window.tenantConfig && window.tenantConfig.rules) || [
          'This is a free accessible transportation service, Monday\u2013Friday.',
          'Vehicles cannot leave campus grounds.',
          'Riders must be at the pickup location at the requested time.',
          'Drivers wait up to 5 minutes. After that the ride may be a no-show.',
          '5 consecutive no-shows result in automatic service termination.'
        ];
        body.innerHTML = '<ul style="padding-left:20px;">' + fallback.map(r => '<li>' + r + '</li>').join('') + '</ul>';
      }
    }
  } catch (err) {
    const body = overlay.querySelector('#rules-modal-body');
    if (body) body.innerHTML = '<p class="text-muted">Could not load rules. Please try again.</p>';
    console.error('showRulesModal error:', err);
  }
}

// initSubTabs — delegated to rideops-utils.js initSubTabs()

// toggleSidebar — delegated to rideops-utils.js toggleSidebar()

// initTabs — delegated to rideops-utils.js initSidebar()

// showTab — delegated to rideops-utils.js showTab()

// ============================================================================
// ANALYTICS MODULE
// ============================================================================
let analyticsLoaded = false;
let analyticsReportData = null;

function getAnalyticsDateParams() {
  const from = document.getElementById('analytics-from')?.value;
  const to = document.getElementById('analytics-to')?.value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? '?' + qs : '';
}

function setAnalyticsQuickRange(preset) {
  var _today = new Date();
  var todayStr = _today.getFullYear() + '-' + String(_today.getMonth() + 1).padStart(2, '0') + '-' + String(_today.getDate()).padStart(2, '0');
  var fromStr = todayStr;
  var toStr = todayStr;

  switch (preset) {
    case 'today':
      fromStr = todayStr;
      break;
    case '7d': {
      var d7 = new Date(_today.getTime() - 6 * 86400000);
      fromStr = d7.getFullYear() + '-' + String(d7.getMonth() + 1).padStart(2, '0') + '-' + String(d7.getDate()).padStart(2, '0');
      break;
    }
    case 'this-month':
      fromStr = todayStr.slice(0, 8) + '01';
      break;
    case 'semester': {
      var month = _today.getMonth(); // 0-indexed
      var year = _today.getFullYear();
      var periodLabel = (tenantConfig && tenantConfig.academic_period_label) || 'Semester';
      if (periodLabel === 'Quarter') {
        // Quarter: Winter Jan 5, Spring Mar 25, Summer Jun 15, Fall Sep 20
        if (month <= 2) { fromStr = year + '-01-05'; }       // Winter
        else if (month <= 5) { fromStr = year + '-03-25'; }  // Spring
        else if (month <= 8) { fromStr = year + '-06-15'; }  // Summer
        else { fromStr = year + '-09-20'; }                  // Fall
      } else if (periodLabel === 'Trimester') {
        // Trimester: Spring Jan 10, Summer May 5, Fall Aug 25
        if (month <= 3) { fromStr = year + '-01-10'; }       // Spring
        else if (month <= 7) { fromStr = year + '-05-05'; }  // Summer
        else { fromStr = year + '-08-25'; }                  // Fall
      } else {
        // Semester (default): Spring Jan 10, Summer May 16, Fall Aug 15
        if (month <= 4) { fromStr = year + '-01-10'; }       // Spring
        else if (month <= 6) { fromStr = year + '-05-16'; }  // Summer
        else { fromStr = year + '-08-15'; }                  // Fall
      }
      break;
    }
  }
  var fromInput = document.getElementById('analytics-from');
  var toInput = document.getElementById('analytics-to');
  if (fromInput) fromInput.value = fromStr;
  if (toInput) toInput.value = toStr;
}

/* ── Chart tooltip helpers ── */
function getChartTooltip() {
  let el = document.getElementById('chart-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chart-tooltip';
    el.className = 'chart-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

function showChartTooltip(e, text) {
  const tip = getChartTooltip();
  tip.textContent = text;
  tip.classList.add('visible');
  positionChartTooltip(e, tip);
}

function hideChartTooltip() {
  const tip = document.getElementById('chart-tooltip');
  if (tip) tip.classList.remove('visible');
}

function positionChartTooltip(e, tip) {
  let left = e.clientX + 12;
  let top = e.clientY - 8;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  if (left + tw > window.innerWidth - 8) left = e.clientX - tw - 12;
  if (top + th > window.innerHeight - 8) top = window.innerHeight - th - 8;
  if (top < 8) top = 8;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

function renderColumnChart(containerId, data, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!data || !data.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-bar-off"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No ride data for this period.</div></div>';
    return;
  }
  const W = 700, H = 180;
  const pad = { top: 16, right: 16, bottom: 36, left: 40 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const maxY = Math.max(...data.map(d => parseInt(d.count) || 0), 1);
  const total = data.reduce((s, d) => s + (parseInt(d.count) || 0), 0);
  const unit = options.unit || 'rides';
  const palette = options.palette || null;
  const fillColor = options.color || 'var(--color-primary)';

  // Y-axis gridlines
  const yTicks = 4;
  let gridLines = '';
  for (let i = 0; i <= yTicks; i++) {
    const yVal = Math.round(maxY * i / yTicks);
    const yPos = pad.top + ch - (i / yTicks) * ch;
    gridLines += `<line x1="${pad.left}" y1="${yPos}" x2="${W - pad.right}" y2="${yPos}" class="grid-line"/>`;
    gridLines += `<text x="${pad.left - 6}" y="${yPos + 3}" class="axis-label" text-anchor="end">${yVal}</text>`;
  }

  // Bars
  const slotW = cw / data.length;
  const barW = Math.min(slotW * 0.6, 50);
  let bars = '';
  let labels = '';
  let valueLabels = '';
  data.forEach((d, i) => {
    const val = parseInt(d.count) || 0;
    const barH = maxY > 0 ? (val / maxY) * ch : 0;
    const x = pad.left + i * slotW + (slotW - barW) / 2;
    const y = pad.top + ch - barH;
    const barColor = palette ? palette[i % palette.length] : fillColor;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${barColor}" class="col-bar" data-idx="${i}"/>`;
    if (options.showValues !== false) {
      valueLabels += `<text x="${x + barW / 2}" y="${y - 4}" class="axis-label" text-anchor="middle">${val}</text>`;
    }
    labels += `<text x="${pad.left + i * slotW + slotW / 2}" y="${H - 6}" class="axis-label" text-anchor="middle">${d.label}</text>`;
  });

  container.innerHTML = `<div class="col-chart-wrap"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${gridLines}${bars}${valueLabels}${labels}</svg></div>`;

  // Tooltips
  container.querySelectorAll('.col-bar').forEach((bar, idx) => {
    const d = data[idx];
    const val = parseInt(d.count) || 0;
    const pct = total > 0 ? Math.round(val / total * 100) : 0;
    const text = `${d.label}: ${val} ${unit} (${pct}%)`;
    bar.addEventListener('mouseenter', (e) => showChartTooltip(e, text));
    bar.addEventListener('mousemove', (e) => positionChartTooltip(e, getChartTooltip()));
    bar.addEventListener('mouseleave', hideChartTooltip);
  });
}

function renderLineChart(containerId, data, options = {}) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  if (!data || !data.length) {
    wrap.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-line"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No daily trend data for this period.</div></div>';
    return;
  }

  const W = 700, H = 260;
  const pad = { top: 16, right: 32, bottom: 32, left: 36 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const maxY = Math.max(...data.map(d => d.value), 1);
  const stepX = data.length > 1 ? cw / (data.length - 1) : cw;
  const lineColor = options.color || 'var(--color-primary)';
  const unit = options.unit || '';
  const gradientId = containerId + '-gradient';

  const points = data.map((d, i) => ({
    x: pad.left + (data.length > 1 ? i * stepX : cw / 2),
    y: pad.top + ch - (d.value / maxY) * ch,
    d
  }));

  // Smooth monotone cubic path
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    linePath += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
  }
  const areaPath = linePath + ` L ${points[points.length - 1].x} ${pad.top + ch} L ${points[0].x} ${pad.top + ch} Z`;

  // SVG gradient definition
  const gradient = `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${lineColor}" stop-opacity="${options.fillOpacity || 0.15}"/>
    <stop offset="100%" stop-color="${lineColor}" stop-opacity="0.02"/>
  </linearGradient></defs>`;

  // Y-axis gridlines
  const yTicks = 4;
  let gridLines = '';
  for (let i = 0; i <= yTicks; i++) {
    const yVal = Math.round(maxY * i / yTicks);
    const yPos = pad.top + ch - (i / yTicks) * ch;
    gridLines += `<line x1="${pad.left}" y1="${yPos}" x2="${W - pad.right}" y2="${yPos}" class="grid-line" style="opacity:0.6"/>`;
    gridLines += `<text x="${pad.left - 6}" y="${yPos + 3}" class="axis-label" text-anchor="end">${yVal}</text>`;
  }

  // X-axis labels — pixel-based collision avoidance
  let xLabels = '';
  const MIN_LABEL_GAP = 65; // minimum pixels between label centers
  let lastLabelX = -Infinity;

  // Pass 1: decide which indices get labels
  const labelIndices = [];
  data.forEach((d, i) => {
    const x = pad.left + (data.length > 1 ? i * stepX : cw / 2);
    if (i === 0 || x - lastLabelX >= MIN_LABEL_GAP) {
      labelIndices.push(i);
      lastLabelX = x;
    }
  });

  // Pass 2: if the last data point isn't labeled, force it —
  // but remove the previous label if it's too close
  const lastIdx = data.length - 1;
  if (labelIndices[labelIndices.length - 1] !== lastIdx) {
    const lastX = pad.left + (data.length > 1 ? lastIdx * stepX : cw / 2);
    const prevIdx = labelIndices[labelIndices.length - 1];
    const prevX = pad.left + (data.length > 1 ? prevIdx * stepX : cw / 2);
    if (lastX - prevX < MIN_LABEL_GAP) {
      labelIndices.pop(); // drop the second-to-last to make room
    }
    labelIndices.push(lastIdx);
  }

  // Pass 3: render
  labelIndices.forEach(i => {
    const x = pad.left + (data.length > 1 ? i * stepX : cw / 2);
    xLabels += `<text x="${x}" y="${H - 4}" class="axis-label" text-anchor="middle">${data[i].label}</text>`;
  });

  // Dots hidden by default (r=0), shown on hover
  const dots = points.map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="0" fill="${lineColor}" stroke="var(--color-surface)" stroke-width="2" class="area-dot" data-idx="${i}"/>`).join('');
  const crosshair = `<line x1="0" y1="${pad.top}" x2="0" y2="${pad.top + ch}" class="crosshair" id="${containerId}-crosshair"/>`;

  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    ${gradient}
    ${gridLines}
    <path d="${areaPath}" class="area-fill" fill="url(#${gradientId})"/>
    <path d="${linePath}" class="area-line" fill="none" stroke="${lineColor}" style="stroke-width:2.5"/>
    ${dots}
    ${crosshair}
    ${xLabels}
  </svg>`;

  // Hover interactions
  const svg = wrap.querySelector('svg');
  const crosshairEl = document.getElementById(`${containerId}-crosshair`);
  if (!svg) return;

  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    let nearest = 0, minDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < minDist) { minDist = dist; nearest = i; }
    });
    const p = points[nearest];
    if (crosshairEl) {
      crosshairEl.setAttribute('x1', p.x);
      crosshairEl.setAttribute('x2', p.x);
    }
    svg.querySelectorAll('.area-dot').forEach((dot, i) => {
      dot.setAttribute('r', i === nearest ? '5' : '0');
      dot.setAttribute('opacity', i === nearest ? '1' : '0');
    });
    const text = options.tooltipFn ? options.tooltipFn(p.d.raw) : `${p.d.label}: ${p.d.value} ${unit}`;
    showChartTooltip(e, text);
  });

  svg.addEventListener('mouseleave', () => {
    hideChartTooltip();
    if (crosshairEl) crosshairEl.style.opacity = '0';
    svg.querySelectorAll('.area-dot').forEach(dot => {
      dot.setAttribute('r', '0');
      dot.setAttribute('opacity', '0');
    });
  });
}

function renderStackedBar(containerId, segments, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const total = segments.reduce((s, seg) => s + (parseInt(seg.count) || 0), 0);
  const unit = options.unit || '';
  if (total === 0) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-bar-off"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No ride data for this period.</div></div>';
    return;
  }

  const trackHtml = segments.map((seg, i) => {
    const pct = (seg.count / total * 100);
    return `<div class="stacked-bar__seg" style="width:${pct}%;background:${seg.color};" data-idx="${i}"></div>`;
  }).join('');

  const legendHtml = segments.map((seg, i) => {
    const pct = Math.round(seg.count / total * 100);
    return `<div class="stacked-bar__legend-item" data-idx="${i}">
      <span class="stacked-bar__legend-dot" style="background:${seg.color};"></span>
      <span>${seg.label}</span>
      <span class="stacked-bar__legend-value">${seg.count}</span>
      <span class="stacked-bar__legend-pct">${pct}%</span>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="stacked-bar__track">${trackHtml}</div><div class="stacked-bar__legend">${legendHtml}</div>`;

  // Tooltips on segments and legend items
  container.querySelectorAll('[data-idx]').forEach(el => {
    const idx = parseInt(el.dataset.idx);
    const seg = segments[idx];
    const pct = Math.round(seg.count / total * 100);
    const text = `${seg.label}: ${seg.count} ${unit} (${pct}%)`;
    el.addEventListener('mouseenter', (e) => showChartTooltip(e, text));
    el.addEventListener('mousemove', (e) => positionChartTooltip(e, getChartTooltip()));
    el.addEventListener('mouseleave', hideChartTooltip);
  });
}

function renderBarChart(containerId, data, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!data || !data.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-bar-off"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No ride data for this period.</div></div>';
    return;
  }
  const max = Math.max(...data.map(d => parseInt(d.count) || 0));
  const colorClass = options.colorClass || '';
  const chartHtml = '<div class="bar-chart">' + data.map(d => {
    const val = parseInt(d.count) || 0;
    const pct = max > 0 ? (val / max * 100) : 0;
    return `<div class="bar-chart-row">
      <div class="bar-chart-label">${d.label}</div>
      <div class="bar-chart-track"><div class="bar-chart-fill ${colorClass}" style="width:${pct}%"></div></div>
      <div class="bar-chart-count">${val}</div>
    </div>`;
  }).join('') + '</div>';
  if (options.yLabel) {
    container.innerHTML = `<div style="display:flex;align-items:stretch;"><div class="chart-ylabel">${options.yLabel}</div><div style="flex:1;">${chartHtml}</div></div>`;
  } else {
    container.innerHTML = chartHtml;
  }
  // Attach hover tooltips
  const total = data.reduce((s, d) => s + (parseInt(d.count) || 0), 0);
  const unit = options.unit || 'rides';
  container.querySelectorAll('.bar-chart-row').forEach((row, idx) => {
    const d = data[idx];
    const val = parseInt(d.count) || 0;
    const pct = total > 0 ? Math.round(val / total * 100) : 0;
    const text = `${d.label}: ${val} ${unit} (${pct}%)`;
    row.addEventListener('mouseenter', (e) => showChartTooltip(e, text));
    row.addEventListener('mousemove', (e) => positionChartTooltip(e, getChartTooltip()));
    row.addEventListener('mouseleave', hideChartTooltip);
  });
}

function renderHotspotList(containerId, items, colorClass, unit) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!items || !items.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-map-pin-off"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No location data available.</div></div>';
    return;
  }
  const pal = getCurrentCampusPalette();
  const max = Math.max(...items.map(i => parseInt(i.count) || 0));
  container.innerHTML = '<div class="hotspot-list">' + items.map((item, idx) => {
    const val = parseInt(item.count) || 0;
    const pct = max > 0 ? (val / max * 100) : 0;
    const name = item.location || item.route;
    const barFillColor = pal[idx % pal.length];
    return `<div class="hotspot-item">
      <div class="hotspot-rank">#${idx + 1}</div>
      <div class="hotspot-name" title="${name}">${name}</div>
      <div class="hotspot-bar"><div class="hotspot-bar-fill" style="width:${pct}%;background:${barFillColor};"></div></div>
      <div class="hotspot-count">${val}</div>
    </div>`;
  }).join('') + '</div>';
  // Attach hover tooltips
  const total = items.reduce((s, i) => s + (parseInt(i.count) || 0), 0);
  const u = unit || 'rides';
  container.querySelectorAll('.hotspot-item').forEach((row, idx) => {
    const item = items[idx];
    const val = parseInt(item.count) || 0;
    const name = item.location || item.route;
    const pct = total > 0 ? Math.round(val / total * 100) : 0;
    const text = `#${idx + 1} ${name}: ${val} ${u} (${pct}%)`;
    row.addEventListener('mouseenter', (e) => showChartTooltip(e, text));
    row.addEventListener('mousemove', (e) => positionChartTooltip(e, getChartTooltip()));
    row.addEventListener('mouseleave', hideChartTooltip);
  });
}

function renderODMatrix(containerId, matrixData) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!matrixData || !matrixData.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-grid-dots"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No route data available.</div></div>';
    return;
  }

  // Extract unique origins and destinations (top 8 each by frequency)
  const originCounts = {}, destCounts = {};
  matrixData.forEach(r => {
    originCounts[r.pickup_location] = (originCounts[r.pickup_location] || 0) + parseInt(r.count);
    destCounts[r.dropoff_location] = (destCounts[r.dropoff_location] || 0) + parseInt(r.count);
  });
  const origins = Object.entries(originCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
  const dests = Object.entries(destCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);

  // Build count lookup
  const lookup = {};
  matrixData.forEach(r => { lookup[`${r.pickup_location}__${r.dropoff_location}`] = parseInt(r.count); });
  const maxCount = Math.max(...matrixData.map(r => parseInt(r.count)));

  // Shorten location names for display
  const shorten = (name) => name.length > 16 ? name.slice(0, 14) + '…' : name;

  let html = '<div class="od-matrix" style="overflow-x:auto;">';
  html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
  html += '<thead><tr><th class="od-row-header" style="text-align:left;padding:4px 8px;font-size:11px;color:var(--color-text-muted);">Origin ↓ / Dest →</th>';
  dests.forEach(d => {
    html += `<th style="padding:4px 6px;font-size:10px;color:var(--color-text-muted);text-align:center;max-width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${d}">${shorten(d)}</th>`;
  });
  html += '</tr></thead><tbody>';

  origins.forEach(o => {
    html += `<tr><td class="od-row-header" style="padding:4px 8px;font-weight:600;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;" title="${o}">${shorten(o)}</td>`;
    dests.forEach(d => {
      const count = lookup[`${o}__${d}`] || 0;
      if (o === d || count === 0) {
        html += '<td class="od-cell od-cell--empty" style="text-align:center;padding:4px 6px;color:var(--color-text-muted);">—</td>';
      } else {
        const intensity = Math.max(0.1, count / maxCount);
        const bg = `rgba(70, 130, 180, ${intensity})`;
        const textColor = intensity > 0.5 ? '#fff' : 'var(--color-text)';
        html += `<td class="od-cell" style="text-align:center;padding:4px 6px;background:${bg};color:${textColor};border-radius:3px;font-weight:600;cursor:default;" title="${o} → ${d}: ${count} rides" data-origin="${o}" data-dest="${d}" data-count="${count}">${count}</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  html += '<div class="od-matrix-note" style="font-size:11px;color:var(--color-text-muted);margin-top:8px;">Top 8 origins × top 8 destinations. Darker = higher volume.</div>';
  container.innerHTML = html;

  // Tooltips on cells
  container.querySelectorAll('.od-cell:not(.od-cell--empty)').forEach(cell => {
    const text = `${cell.dataset.origin} → ${cell.dataset.dest}: ${cell.dataset.count} rides`;
    cell.addEventListener('mouseenter', (e) => showChartTooltip(e, text));
    cell.addEventListener('mousemove', (e) => positionChartTooltip(e, getChartTooltip()));
    cell.addEventListener('mouseleave', hideChartTooltip);
  });
}

function getKpiColorClass(label, value) {
  const num = parseFloat(value);
  if (label === 'Completion Rate') {
    if (num >= 80) return 'kpi-card--good';
    return 'kpi-card--neutral';
  }
  if (label === 'No-Shows') {
    if (num === 0) return 'kpi-card--good';
    if (num <= 3) return 'kpi-card--warning';
    return 'kpi-card--danger';
  }
  if (label === 'Completed') return 'kpi-card--good';
  return 'kpi-card--neutral';
}

function renderKPIGrid(summaryData, tardinessData, fleetData) {
  const grid = document.getElementById('analytics-kpi-grid');
  if (!grid) return;

  const total = summaryData.totalRides || 0;
  const completionRate = summaryData.completionRate || 0;
  const noShowRate = summaryData.noShowRate || 0;
  const activeRiders = summaryData.uniqueRiders || 0;

  // Driver punctuality from tardiness data
  var punctuality = 100;
  if (tardinessData && tardinessData.summary) {
    var totalClockIns = tardinessData.summary.totalClockIns || 0;
    var tardyCount = tardinessData.summary.tardyCount || 0;
    punctuality = totalClockIns > 0 ? Math.round((totalClockIns - tardyCount) / totalClockIns * 100) : 100;
  }

  // Fleet availability
  var fleetAvail = '\u2014';
  if (fleetData && fleetData.summary) {
    var available = fleetData.summary.available || 0;
    var fleetTotal = fleetData.summary.totalFleet || 0;
    fleetAvail = fleetTotal > 0 ? available + '/' + fleetTotal : '\u2014';
  }

  const kpis = [
    { label: 'Total Rides', value: total, icon: 'ti-car', colorClass: 'kpi-card--neutral' },
    { label: 'Completion Rate', value: completionRate + '%', icon: 'ti-circle-check', colorClass: completionRate >= 85 ? 'kpi-card--good' : completionRate >= 70 ? 'kpi-card--warning' : 'kpi-card--danger' },
    { label: 'No-Show Rate', value: noShowRate + '%', icon: 'ti-user-x', colorClass: noShowRate <= 5 ? 'kpi-card--good' : noShowRate <= 15 ? 'kpi-card--warning' : 'kpi-card--danger' },
    { label: 'Active Riders', value: activeRiders, icon: 'ti-users', colorClass: 'kpi-card--neutral' },
    { label: 'Driver Punctuality', value: punctuality + '%', icon: 'ti-clock-check', colorClass: punctuality >= 90 ? 'kpi-card--good' : punctuality >= 80 ? 'kpi-card--warning' : 'kpi-card--danger' },
    { label: 'Fleet Available', value: fleetAvail, icon: 'ti-bus', colorClass: 'kpi-card--neutral' }
  ];

  grid.innerHTML = kpis.map(function(k) {
    return '<div class="kpi-card ' + k.colorClass + '">' +
      '<div class="kpi-value">' + k.value + '</div>' +
      '<div class="kpi-label"><i class="ti ' + k.icon + '" style="margin-right:4px;"></i>' + k.label + '</div>' +
    '</div>';
  }).join('');
}

function renderVehicleCards(vehicles) {
  const grid = document.getElementById('vehicles-grid');
  if (!grid) return;
  if (!vehicles || !vehicles.length) {
    grid.innerHTML = '<div class="ro-empty"><i class="ti ti-bus-off"></i><div class="ro-empty__title">No vehicles</div><div class="ro-empty__message">Add vehicles to track fleet usage.</div></div>';
    return;
  }
  const sorted = [...vehicles].sort((a, b) => {
    if ((a.status === 'retired') !== (b.status === 'retired')) return a.status === 'retired' ? 1 : -1;
    return 0;
  });
  const hasActive = sorted.some(v => v.status !== 'retired');
  const hasRetired = sorted.some(v => v.status === 'retired');
  grid.innerHTML = sorted.map((v, i) => {
    const divider = (hasActive && hasRetired && i > 0 && v.status === 'retired' && sorted[i - 1].status !== 'retired')
      ? '<div class="vehicle-section-divider"><span>Archived</span></div>' : '';
    const overdueClass = v.maintenanceOverdue ? ' maintenance-overdue' : '';
    const alert = v.maintenanceOverdue
      ? `<div class="maintenance-alert">Maintenance overdue (${v.daysSinceMaintenance} days since last service)</div>` : '';
    const lastMaint = v.last_maintenance_date
      ? new Date(v.last_maintenance_date).toLocaleDateString() : 'Never';
    const lastUsed = v.lastUsed ? new Date(v.lastUsed).toLocaleDateString() : 'Never';
    const retiredClass = v.status === 'retired' ? ' vehicle-retired' : '';
    const retiredBadge = v.status === 'retired' ? '<span class="retired-badge">Retired</span>' : '';
    const escapedName = (v.name||'').replace(/'/g, "\\'");
    let actionButtons;
    if (v.status === 'retired') {
      actionButtons = `<button class="btn secondary small" onclick="reactivateVehicle('${v.id}', '${escapedName}')">Reactivate</button>`;
    } else if (v.rideCount > 0) {
      actionButtons = `<button class="btn secondary small" onclick="logVehicleMaintenance('${v.id}')">Log Maintenance</button>
        <button class="btn secondary small" title="Mark this vehicle as no longer in service. History is preserved." onclick="retireVehicle('${v.id}', '${escapedName}')">Retire</button>`;
    } else {
      actionButtons = `<button class="btn secondary small" onclick="logVehicleMaintenance('${v.id}')">Log Maintenance</button>
        <button class="btn danger small" title="Permanently remove this vehicle from the system. Use only if the vehicle was entered in error." onclick="deleteVehicle('${v.id}', '${escapedName}')">Delete</button>`;
    }
    return `${divider}<div class="vehicle-card${overdueClass}${retiredClass}" onclick="openVehicleDrawer('${v.id}')">
      <div class="vehicle-name">${v.name}${retiredBadge}</div>
      <div class="vehicle-meta">Type: ${v.type} &middot; Status: ${v.status}</div>
      <div class="vehicle-meta">Completed rides: ${v.rideCount} &middot; Last used: ${lastUsed}</div>
      <div class="vehicle-meta">Last maintenance: ${lastMaint}</div>
      ${alert}
      <div class="ride-actions-compact" style="margin-top:8px;" onclick="event.stopPropagation()">
        ${actionButtons}
      </div>
    </div>`;
  }).join('');
}

function renderMilestoneList(containerId, people, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!people || !people.length) {
    container.innerHTML = `<div class="ro-empty"><i class="ti ti-trophy-off"></i><div class="ro-empty__title">No ${type} data</div><div class="ro-empty__message">No completed rides yet.</div></div>`;
    return;
  }
  const badgeLabels = { 50: 'Rising Star', 100: 'Century Club', 250: 'Quarter Thousand', 500: (tenantConfig?.orgShortName || 'RideOps') + ' Legend', 1000: 'Diamond' };
  const badgeIcons = { 50: '<i class="ti ti-star"></i>', 100: '<i class="ti ti-award"></i>', 250: '<i class="ti ti-trophy"></i>', 500: '<i class="ti ti-crown"></i>', 1000: '<i class="ti ti-diamond"></i>' };
  container.innerHTML = '<div class="milestone-list">' + people.map(p => {
    const badges = [50, 100, 250, 500, 1000].map(m => {
      const earned = p.achievedMilestones.includes(m);
      return `<span class="milestone-badge${earned ? ' earned' : ''}" title="${badgeLabels[m]}">${badgeIcons[m]} ${m}</span>`;
    }).join('');
    const pct = p.nextMilestone ? Math.max(Math.min((p.rideCount / p.nextMilestone * 100), 100), 2).toFixed(1) : 100;
    const label = p.nextMilestone ? `${p.rideCount} / ${p.nextMilestone} rides` : 'All milestones achieved!';
    return `<div class="milestone-card">
      <div class="milestone-name">${p.name}</div>
      <div class="milestone-count">${p.rideCount} completed rides</div>
      <div class="milestone-badges">${badges}</div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:0%" data-target="${pct}"></div></div>
      <div class="progress-label">${label}</div>
    </div>`;
  }).join('') + '</div>';
  // Animate progress bars
  requestAnimationFrame(() => {
    container.querySelectorAll('.progress-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  });
}

function renderSemesterReport(data) {
  const container = document.getElementById('semester-report-content');
  if (!container) return;
  analyticsReportData = data;

  function delta(curr, prev) {
    if (!prev || prev === 0) return '';
    const diff = curr - prev;
    if (diff === 0) return '';
    const arrow = diff > 0 ? 'ti-arrow-up' : 'ti-arrow-down';
    const cls = diff > 0 ? 'delta--up' : 'delta--down';
    const formatted = Number.isInteger(diff) ? Math.abs(diff) : parseFloat(Math.abs(diff).toFixed(2));
    return `<span class="delta ${cls}"><i class="ti ${arrow}"></i>${formatted}</span>`;
  }

  function statBlock(stats, label, prevStats) {
    return `<div class="semester-period">
      <h4>${label}</h4>
      <div class="semester-stat"><div class="stat-value">${stats.completedRides}${prevStats ? delta(stats.completedRides, prevStats.completedRides) : ''}</div><div class="stat-label">Rides Completed</div></div>
      <div class="semester-stat"><div class="stat-value">${stats.peopleHelped ?? 0}${prevStats ? delta(stats.peopleHelped ?? 0, prevStats.peopleHelped ?? 0) : ''}</div><div class="stat-label">People Helped</div></div>
      <div class="semester-stat"><div class="stat-value">${stats.completionRate}%${prevStats ? delta(stats.completionRate, prevStats.completionRate) : ''}</div><div class="stat-label">Completion Rate</div></div>
      <div class="semester-stat"><div class="stat-value">${stats.noShows}${prevStats ? delta(stats.noShows, prevStats.noShows) : ''}</div><div class="stat-label">No-Shows</div></div>
    </div>`;
  }

  let monthlyTable = '';
  if (data.monthlyBreakdown && data.monthlyBreakdown.length) {
    monthlyTable = `<h4 style="margin-top:16px;">Monthly Breakdown</h4>
    <table class="grid-table"><thead><tr><th>Month</th><th>Completed</th><th>Total</th><th>Riders</th></tr></thead><tbody>
    ${data.monthlyBreakdown.map(m => `<tr><td>${new Date(m.month + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td><td>${m.completed}</td><td>${m.total}</td><td>${m.riders}</td></tr>`).join('')}
    </tbody></table>`;
  }

  let leaderboard = '';
  if (data.driverLeaderboard && data.driverLeaderboard.length) {
    leaderboard = `<h4 style="margin-top:16px;">Driver Leaderboard</h4>
    <table class="grid-table"><thead><tr><th>Driver</th><th>Completed Rides</th></tr></thead><tbody>
    ${data.driverLeaderboard.map(d => `<tr><td>${d.name}</td><td>${d.completed}</td></tr>`).join('')}
    </tbody></table>`;
  }

  container.innerHTML = `
    <div class="semester-comparison">
      ${statBlock(data.previous, data.previousLabel + ' (Previous)')}
      ${statBlock(data.current, data.semesterLabel + ' (Current)', data.previous)}
    </div>
    ${monthlyTable}
    ${leaderboard}
  `;

  // RideOps Wrapped
  const wrapped = document.getElementById('ro-wrapped-content');
  if (wrapped) {
    const c = data.current;
    const mvp = data.driverLeaderboard?.[0];
    if (c.completedRides === 0) {
      wrapped.innerHTML = `<div class="ro-wrapped">
        <div class="wrapped-grid">
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-road"></i></div><div class="wrapped-card__value">0</div><div class="wrapped-card__label">Rides Completed</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-users"></i></div><div class="wrapped-card__value">0</div><div class="wrapped-card__label">People Helped</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-percentage"></i></div><div class="wrapped-card__value">—</div><div class="wrapped-card__label">Completion Rate</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-star"></i></div><div class="wrapped-card__value">—</div><div class="wrapped-card__label">MVP Driver</div></div>
        </div>
      </div>`;
    } else {
      wrapped.innerHTML = `<div class="ro-wrapped">
        <div class="wrapped-grid">
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-road"></i></div><div class="wrapped-card__value">${c.completedRides}</div><div class="wrapped-card__label">Rides Completed</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-users"></i></div><div class="wrapped-card__value">${c.peopleHelped ?? 0}</div><div class="wrapped-card__label">People Helped</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-percentage"></i></div><div class="wrapped-card__value">${c.completionRate}%</div><div class="wrapped-card__label">Completion Rate</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-star"></i></div><div class="wrapped-card__value">${mvp ? mvp.name : '—'}</div><div class="wrapped-card__label">${mvp ? `MVP · ${mvp.completed} rides` : 'MVP Driver'}</div></div>
        </div>
      </div>`;
    }
  }
}

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_COLORS = { completed: 'green', cancelled: 'orange', no_show: 'red', denied: '', pending: 'gold', approved: '', scheduled: '' };

function getStatusColor(status) {
  const map = {
    completed: 'var(--status-completed)', cancelled: 'var(--status-cancelled)',
    no_show: 'var(--status-no-show)', denied: 'var(--status-denied)',
    pending: 'var(--status-pending)', approved: 'var(--status-approved)',
    scheduled: 'var(--status-scheduled)', driver_on_the_way: 'var(--status-on-the-way)',
    driver_arrived_grace: 'var(--status-grace)'
  };
  return map[status] || 'var(--color-primary)';
}

async function loadAnalyticsSummary() {
  // KPI rendering is now handled by loadAllAnalytics which combines summary + tardiness + fleet data.
  // This function is kept for compatibility but no longer renders KPIs directly.
  try {
    const res = await fetch('/api/analytics/summary' + getAnalyticsDateParams());
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { console.error('Analytics summary error:', e); return null; }
}

async function loadAnalyticsFrequency() {
  try {
    const res = await fetch('/api/analytics/frequency' + getAnalyticsDateParams());
    if (!res.ok) return;
    const data = await res.json();

    // Day of week — column chart (respect operating_days setting)
    const opsConfig = typeof getOpsConfig === 'function' ? await getOpsConfig() : null;
    const opDays = opsConfig && opsConfig.operating_days
      ? String(opsConfig.operating_days).split(',').map(Number)
      : [0, 1, 2, 3, 4]; // fallback Mon-Fri (our format)
    const dowData = opDays.map(d => {
      const pgDow = (d + 1) % 7; // our 0=Mon → PG DOW 1=Mon
      const row = data.byDayOfWeek.find(r => parseInt(r.dow) === pgDow);
      return { label: DOW_NAMES[pgDow], count: row ? row.count : 0 };
    });
    renderColumnChart('chart-dow', dowData, { unit: 'rides', palette: getCurrentCampusPalette() });

    // Hourly — column chart
    const hourData = data.byHour
      .filter(r => parseInt(r.hour) >= 8 && parseInt(r.hour) <= 19)
      .map(r => ({ label: `${r.hour}:00`, count: r.count }));
    renderColumnChart('chart-hour', hourData, { unit: 'rides', palette: getCurrentCampusPalette() });

    // Daily volume — line chart
    const lineData = data.daily.slice(-30).map(r => ({
      label: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: parseInt(r.total) || 0, raw: r
    }));
    renderLineChart('chart-daily', lineData, { unit: 'rides', color: getCurrentCampusPalette()[0] });

    // Status breakdown — stacked bar (filter transient statuses)
    const hiddenStatuses = ['driver_on_the_way', 'driver_arrived_grace'];
    const statusSegments = data.byStatus
      .filter(r => !hiddenStatuses.includes(r.status))
      .map(r => ({
        label: statusLabel(r.status), count: parseInt(r.count) || 0, color: getStatusColor(r.status)
      }));
    renderStackedBar('chart-status', statusSegments, { unit: 'rides' });
  } catch (e) { console.error('Analytics frequency error:', e); }
}

async function loadAnalyticsHotspots() {
  try {
    const res = await fetch('/api/analytics/hotspots' + getAnalyticsDateParams());
    if (!res.ok) return;
    const data = await res.json();
    renderHotspotList('hotspot-pickups', data.topPickups, '', 'pickups');
    renderHotspotList('hotspot-dropoffs', data.topDropoffs, 'darkgold', 'dropoffs');
    renderODMatrix('hotspot-matrix', data.matrix);
  } catch (e) { console.error('Analytics hotspots error:', e); }
}

async function loadFleetVehicles() {
  try {
    const res = await fetch('/api/analytics/vehicles' + getAnalyticsDateParams());
    if (!res.ok) return;
    fleetVehicles = await res.json();
    renderVehicleCards(fleetVehicles);
  } catch (e) { console.error('Analytics vehicles error:', e); }
}

async function loadAnalyticsMilestones() {
  try {
    const res = await fetch('/api/analytics/milestones');
    if (!res.ok) return;
    const data = await res.json();
    renderMilestoneList('driver-milestones', data.drivers, 'driver');
    renderMilestoneList('rider-milestones', data.riders, 'rider');
  } catch (e) { console.error('Analytics milestones error:', e); }
}

async function loadSemesterReport() {
  try {
    const res = await fetch('/api/analytics/semester-report');
    if (!res.ok) return;
    renderSemesterReport(await res.json());
  } catch (e) { console.error('Semester report error:', e); }
}

async function loadTardinessAnalytics() {
  const container = document.getElementById('tardiness-analytics-container');
  if (!container) return;
  try {
    const res = await fetch('/api/analytics/tardiness' + getAnalyticsDateParams());
    if (!res.ok) return;
    const data = await res.json();
    await renderTardinessSection(container, data);
  } catch (e) { console.error('Tardiness analytics error:', e); }
}

async function renderTardinessSection(container, data) {
  const { summary, byDriver, byDayOfWeek, dailyTrend, distribution } = data;
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = '';

  // ── 1. KPI Cards (4 cards with ring gauge for on-time rate) ──
  const onTimeRate = summary.totalClockIns > 0 ? Math.round((summary.onTimeCount / summary.totalClockIns) * 100) : 100;
  const onTimeClass = onTimeRate >= 90 ? 'kpi-card--good' : onTimeRate >= 80 ? 'kpi-card--warning' : 'kpi-card--danger';
  const tardyClass = summary.tardyCount === 0 ? 'kpi-card--good' : 'kpi-card--danger';
  const avgTardy = summary.avgTardinessMinutes ? parseFloat(summary.avgTardinessMinutes).toFixed(1) : '0';

  const ringColor = onTimeRate >= 90 ? 'var(--status-completed)' : onTimeRate >= 80 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';
  const ringBg = 'var(--color-border-light)';

  html += '<div class="analytics-card analytics-card--wide analytics-card--kpi" style="margin:16px 24px 0;">';
  html += '<div class="kpi-bar">';
  html += `<div class="kpi-card kpi-card--neutral"><div class="kpi-card__value">${summary.totalClockIns}</div><div class="kpi-card__label">Total Clock-Ins</div></div>`;
  html += `<div class="kpi-card ${onTimeClass}">
    <div class="kpi-ring" style="background: conic-gradient(${ringColor} ${onTimeRate * 3.6}deg, ${ringBg} ${onTimeRate * 3.6}deg);">
      <div class="kpi-ring__inner">${onTimeRate}%</div>
    </div>
    <div class="kpi-card__label">On-Time Rate</div>
  </div>`;
  html += `<div class="kpi-card ${tardyClass}"><div class="kpi-card__value">${summary.tardyCount}</div><div class="kpi-card__label">Tardy Count</div></div>`;
  html += `<div class="kpi-card kpi-card--neutral"><div class="kpi-card__value">${avgTardy}m</div><div class="kpi-card__label">Avg Tardiness</div></div>`;
  const missedClass = (summary.totalMissedShifts || 0) === 0 ? 'kpi-card--good' : (summary.totalMissedShifts || 0) <= 3 ? 'kpi-card--warning' : 'kpi-card--danger';
  html += `<div class="kpi-card ${missedClass}"><div class="kpi-card__value">${summary.totalMissedShifts || 0}</div><div class="kpi-card__label">Missed Shifts</div></div>`;
  html += '</div></div>';

  // ── 2. Card grid: SVG Donut + Day of Week Column Chart ──
  html += '<div class="analytics-card-grid">';

  // 2a. SVG Donut
  html += '<div class="analytics-card"><div class="analytics-card__header"><h4 class="analytics-card__title">Attendance Distribution</h4></div><div class="analytics-card__body">';
  if (distribution && distribution.some(d => d.count > 0)) {
    const donutColors = ['var(--status-completed)', 'var(--color-warning)', 'var(--status-on-the-way)', 'var(--color-warning-dark)', 'var(--status-no-show)'];
    const total = distribution.reduce((s, d) => s + d.count, 0);
    const R = 60, CX = 80, CY = 80, SW = 24;
    const circumference = 2 * Math.PI * R;
    // Start from top (12 o'clock): initial offset = circumference/4 (quarter turn back)
    let offset = circumference / 4;

    let circles = '';
    distribution.forEach((d, i) => {
      if (d.count === 0) return;
      const segLen = (d.count / total) * circumference;
      // Positive dashoffset shifts start clockwise; we negate to go counter-clockwise from top
      circles += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${donutColors[i]}" stroke-width="${SW}" stroke-dasharray="${segLen} ${circumference - segLen}" stroke-dashoffset="${offset}" class="donut-seg" data-idx="${i}"/>`;
      offset -= segLen;
    });

    html += `<div class="donut-wrap">
      <div class="donut-svg-wrap" id="tardiness-donut">
        <svg viewBox="0 0 160 160">${circles}</svg>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;">
          <div style="font-size:18px;font-weight:700;color:var(--color-text);line-height:1.1;">${total}</div>
          <div style="font-size:10px;color:var(--color-text-muted);">clock-ins</div>
        </div>
      </div>
      <div class="donut-legend" id="tardiness-donut-legend">`;
    distribution.forEach((d, i) => {
      const pct = total > 0 ? Math.round(d.count / total * 100) : 0;
      html += `<div class="donut-legend-item" data-idx="${i}">
        <div class="donut-legend-dot" style="background: ${donutColors[i]};"></div>
        <div class="donut-legend-label">${d.bucket}</div>
        <div class="donut-legend-value">${d.count}</div>
        <div class="donut-legend-pct">${pct}%</div>
      </div>`;
    });
    html += '</div></div>';
  } else {
    html += '<div class="ro-empty"><i class="ti ti-chart-donut-off"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No clock-in data available.</div></div>';
  }
  html += '</div></div>';

  // 2b. Day of Week — column chart card
  html += '<div class="analytics-card"><div class="analytics-card__header"><h4 class="analytics-card__title">Tardiness by Day of Week</h4></div><div class="analytics-card__body">';
  html += '<div id="tardiness-dow-col"></div>';
  html += '</div></div>';

  // ── 3. Daily Trend Line Chart ──
  html += '<div class="analytics-card analytics-card--wide"><div class="analytics-card__header"><h4 class="analytics-card__title">Daily Tardiness Trend</h4></div><div class="analytics-card__body"><div id="tardiness-area-chart" class="area-chart-wrap"></div></div></div>';

  // ── 4. Punctuality by Driver Table ──
  html += '<div class="analytics-card analytics-card--wide"><div class="analytics-card__header"><h4 class="analytics-card__title">Punctuality by Driver</h4><button class="csv-export-icon" onclick="exportTableCSV(this.closest(\'.analytics-card\').querySelector(\'table\'),\'punctuality-by-driver.csv\')" title="Export CSV"><i class="ti ti-download"></i></button></div><div class="analytics-card__body">';
  if (byDriver && byDriver.length) {
    html += '<div class="ro-table-wrap"><table class="ro-table"><thead><tr><th>Driver</th><th>Clock-Ins</th><th>Tardy</th><th>On-Time %</th><th>Avg Late</th><th>Max Late</th><th>Missed Shifts</th></tr></thead><tbody>';
    byDriver.forEach(d => {
      const driverOnTime = d.totalClockIns > 0 ? Math.round(((d.totalClockIns - d.tardyCount) / d.totalClockIns) * 100) : 100;
      const tardyPct = d.totalClockIns > 0 ? (d.tardyCount / d.totalClockIns * 100) : 0;
      const dotClass = d.tardyCount === 0 ? 'punctuality-dot--good' : tardyPct < 20 ? 'punctuality-dot--warning' : 'punctuality-dot--poor';
      const avg = d.avgTardinessMinutes ? parseFloat(d.avgTardinessMinutes).toFixed(1) + 'm' : '—';
      const maxL = d.maxTardinessMinutes ? d.maxTardinessMinutes + 'm' : '—';
      const barColor = driverOnTime >= 90 ? 'var(--status-completed)' : driverOnTime >= 80 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';
      const missedShifts = parseInt(d.missedShifts, 10) || 0;
      const missedBadge = missedShifts > 0
        ? `<span class="tardy-badge" style="background:var(--status-no-show)">${missedShifts}</span>`
        : '<span class="text-muted">—</span>';
      html += `<tr>
        <td><span class="punctuality-dot ${dotClass}"></span>${d.name}</td>
        <td>${d.totalClockIns}</td>
        <td>${d.tardyCount > 0 ? '<span class="tardy-badge">' + d.tardyCount + '</span>' : '<span class="text-muted">—</span>'}</td>
        <td><div class="ontime-bar-cell"><div class="ontime-bar-track"><div class="ontime-bar-fill" style="width:${driverOnTime}%; background:${barColor};"></div></div><span class="ontime-bar-label">${driverOnTime}%</span></div></td>
        <td>${avg}</td>
        <td>${maxL}</td>
        <td>${missedBadge}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  } else {
    html += '<div class="ro-empty"><i class="ti ti-clock-check"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No clock-in data available for this period.</div></div>';
  }
  html += '</div></div>'; // close analytics-card__body + analytics-card
  html += '</div>'; // close analytics-card-grid

  container.innerHTML = html;

  // ── Post-render: SVG donut tooltips + cross-highlight ──
  const donutSvg = document.querySelector('#tardiness-donut svg');
  const donutLegend = document.getElementById('tardiness-donut-legend');
  if (donutSvg && donutLegend && distribution) {
    const total = distribution.reduce((s, d) => s + d.count, 0);
    const segs = donutSvg.querySelectorAll('.donut-seg');
    const legendItems = donutLegend.querySelectorAll('.donut-legend-item');

    const highlight = (idx, e) => {
      const d = distribution[idx];
      if (!d) return;
      const pct = total > 0 ? Math.round(d.count / total * 100) : 0;
      showChartTooltip(e, `${d.bucket}: ${d.count} clock-ins (${pct}% of total)`);
      segs.forEach((s, i) => { s.style.opacity = i === idx ? '1' : '0.4'; });
      legendItems.forEach((l, i) => { l.style.opacity = i === idx ? '1' : '0.5'; });
    };
    const unhighlight = () => {
      hideChartTooltip();
      segs.forEach(s => { s.style.opacity = '1'; });
      legendItems.forEach(l => { l.style.opacity = '1'; });
    };

    segs.forEach(seg => {
      const idx = parseInt(seg.dataset.idx);
      seg.addEventListener('mouseenter', (e) => highlight(idx, e));
      seg.addEventListener('mousemove', (e) => positionChartTooltip(e, getChartTooltip()));
      seg.addEventListener('mouseleave', unhighlight);
    });
    legendItems.forEach(item => {
      const idx = parseInt(item.dataset.idx);
      item.addEventListener('mouseenter', (e) => highlight(idx, e));
      item.addEventListener('mousemove', (e) => positionChartTooltip(e, getChartTooltip()));
      item.addEventListener('mouseleave', unhighlight);
    });
  }

  // Day of Week — column chart
  if (byDayOfWeek && byDayOfWeek.length) {
    const opsConfig2 = typeof getOpsConfig === 'function' ? await getOpsConfig() : null;
    const opDays2 = opsConfig2 && opsConfig2.operating_days
      ? String(opsConfig2.operating_days).split(',').map(Number)
      : [0, 1, 2, 3, 4];
    const tardyDowData = opDays2.map(d => {
      const pgDow = (d + 1) % 7;
      const found = byDayOfWeek.find(r => r.dayOfWeek === pgDow);
      return { label: dayLabels[pgDow], count: found ? found.tardyCount : 0 };
    });
    renderColumnChart('tardiness-dow-col', tardyDowData, { color: 'var(--status-on-the-way)', unit: 'tardy clock-ins' });
  }

  // Daily trend — line chart
  const trendData = (dailyTrend || []).map(d => ({
    label: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: d.tardyCount, raw: d
  }));
  renderLineChart('tardiness-area-chart', trendData, {
    color: 'var(--status-on-the-way)', fillOpacity: 0.12, unit: 'tardy',
    tooltipFn: (raw) => {
      const dateStr = new Date(raw.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
      const rate = raw.totalClockIns > 0 ? Math.round(raw.tardyCount / raw.totalClockIns * 100) : 0;
      return `${dateStr}: ${raw.tardyCount} tardy of ${raw.totalClockIns} (${rate}%) \u00B7 Avg ${raw.avgTardinessMinutes || 0}m`;
    }
  });
}

// ── New Analytics Data Loaders ──

async function loadRideVolume() {
  try {
    var res = await fetch('/api/analytics/ride-volume' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderRideVolumeChart(data);
  } catch (e) { console.error('Ride volume error:', e); }
}

async function loadRideOutcomes() {
  try {
    var res = await fetch('/api/analytics/ride-outcomes' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderDonutChart('chart-ride-outcomes', data.distribution);
  } catch (e) { console.error('Ride outcomes error:', e); }
}

async function loadPeakHours() {
  try {
    var res = await fetch('/api/analytics/peak-hours' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderPeakHoursHeatmap('chart-peak-hours', data);
  } catch (e) { console.error('Peak hours error:', e); }
}

async function loadTopRoutes() {
  try {
    var res = await fetch('/api/analytics/routes' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderTopRoutesTable('chart-top-routes', data.routes);
  } catch (e) { console.error('Top routes error:', e); }
}

async function loadDriverLeaderboard() {
  try {
    var res = await fetch('/api/analytics/driver-performance' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderDriverLeaderboard('chart-driver-leaderboard', data.drivers);
  } catch (e) { console.error('Driver leaderboard error:', e); }
}

async function loadShiftCoverage() {
  try {
    var res = await fetch('/api/analytics/shift-coverage' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderShiftCoverageChart('chart-shift-coverage', data);
  } catch (e) { console.error('Shift coverage error:', e); }
}

async function loadFleetUtilization() {
  try {
    var res = await fetch('/api/analytics/fleet-utilization' + getAnalyticsDateParams());
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { console.error('Fleet utilization error:', e); return null; }
}

async function loadRiderCohorts() {
  try {
    var res = await fetch('/api/analytics/rider-cohorts' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderRiderCohorts('chart-rider-cohorts', data);
  } catch (e) { console.error('Rider cohorts error:', e); }
}

async function downloadExcelReport() {
  var btn = document.getElementById('download-excel-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i> Generating...'; }
  try {
    var qs = getAnalyticsDateParams();
    var res = await fetch('/api/analytics/export-report' + qs);
    if (!res.ok) { showToast('Failed to generate report', 'error'); return; }
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var fromVal = document.getElementById('analytics-from') ? document.getElementById('analytics-from').value : 'report';
    var toVal = document.getElementById('analytics-to') ? document.getElementById('analytics-to').value : '';
    a.download = 'rideops-report-' + fromVal + '-to-' + toVal + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Report downloaded successfully', 'success');
  } catch (e) {
    console.error('Export error:', e);
    showToast('Failed to download report', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-download"></i> Download .xlsx'; }
  }
}

// ── Report Preview ──

var REPORT_SHEETS = {
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
      { name: 'Peak Hours', icon: 'ti-flame', desc: 'Day-of-week by hour heatmap' }
    ]
  },
  rides: {
    label: 'Rides Only',
    desc: 'Ride volume, daily trends, and popular routes.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Daily Volume', icon: 'ti-chart-bar', desc: 'Rides per day with status breakdown' },
      { name: 'Routes', icon: 'ti-route', desc: 'Top routes by frequency' }
    ]
  },
  drivers: {
    label: 'Driver Performance',
    desc: 'Driver scorecards and shift coverage analysis.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Driver Performance', icon: 'ti-steering-wheel', desc: 'Per-driver rides, punctuality, hours' },
      { name: 'Shift Coverage', icon: 'ti-clock', desc: 'Scheduled vs actual driver-hours' }
    ]
  },
  riders: {
    label: 'Rider Analysis',
    desc: 'Rider cohorts, activity, and engagement metrics.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Rider Analysis', icon: 'ti-users', desc: 'Active, new, returning, and at-risk riders' }
    ]
  },
  fleet: {
    label: 'Fleet Report',
    desc: 'Vehicle utilization and maintenance history.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Fleet', icon: 'ti-car', desc: 'Vehicle usage and maintenance' }
    ]
  }
};

function updateReportPreview(summaryData) {
  var container = document.getElementById('report-preview-table');
  if (!container) return;

  var sel = document.getElementById('report-type-select');
  var type = sel ? sel.value : 'full';
  var info = REPORT_SHEETS[type] || REPORT_SHEETS.full;

  // Date range display
  var fromEl = document.getElementById('analytics-from');
  var toEl = document.getElementById('analytics-to');
  var fromStr = fromEl ? fromEl.value : '';
  var toStr = toEl ? toEl.value : '';
  var dateLabel = '';
  function fmtShortDate(s) {
    if (!s) return '';
    var d = new Date(s + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (fromStr && toStr) {
    dateLabel = fmtShortDate(fromStr) + ' \u2013 ' + fmtShortDate(toStr);
  } else if (fromStr) {
    dateLabel = 'From ' + fmtShortDate(fromStr);
  }

  // Build the sheets list
  var sheetsHtml = info.sheets.map(function(s) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;">' +
      '<i class="ti ' + s.icon + '" style="font-size:16px;color:var(--color-primary);opacity:0.7;width:20px;text-align:center;"></i>' +
      '<span style="font-weight:600;font-size:13px;min-width:130px;">' + s.name + '</span>' +
      '<span style="font-size:12px;color:var(--color-text-muted);">' + s.desc + '</span>' +
      '</div>';
  }).join('');

  // Build data summary if we have it
  var summaryHtml = '';
  if (summaryData) {
    var items = [
      { icon: 'ti-receipt', label: 'Rides', value: summaryData.totalRides },
      { icon: 'ti-circle-check', label: 'Completed', value: summaryData.completedRides },
      { icon: 'ti-steering-wheel', label: 'Drivers', value: summaryData.uniqueDrivers },
      { icon: 'ti-users', label: 'Riders', value: summaryData.uniqueRiders }
    ];
    summaryHtml = '<div style="display:flex;gap:16px;flex-wrap:wrap;padding:12px 16px;background:var(--color-surface-dim);border-radius:var(--radius-sm);margin-bottom:12px;">';
    items.forEach(function(item) {
      summaryHtml += '<div style="display:flex;align-items:center;gap:6px;">' +
        '<i class="ti ' + item.icon + '" style="font-size:14px;color:var(--color-text-muted);"></i>' +
        '<span style="font-size:13px;font-weight:700;">' + item.value + '</span>' +
        '<span style="font-size:12px;color:var(--color-text-muted);">' + item.label + '</span>' +
        '</div>';
    });
    summaryHtml += '</div>';
  } else if (analyticsReportData) {
    // Use cached data
    return updateReportPreview(analyticsReportData);
  }

  var html = '';

  // Data summary bar
  html += summaryHtml;

  // Description
  html += '<div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:10px;">' +
    '<i class="ti ti-info-circle" style="margin-right:4px;opacity:0.6;"></i>' +
    info.desc;
  if (dateLabel) {
    html += ' <span style="color:var(--color-text-muted);font-size:12px;">(' + dateLabel + ')</span>';
  }
  html += '</div>';

  // Sheets list
  html += '<div style="font-size:12px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Included Sheets (' + info.sheets.length + ')</div>';
  html += '<div style="border:1px solid var(--color-border-light);border-radius:var(--radius-sm);padding:4px 12px;">' + sheetsHtml + '</div>';

  container.innerHTML = html;

  // Cache summary data for dropdown changes
  if (summaryData) analyticsReportData = summaryData;
}

// ── New Chart Rendering Functions ──

function renderRideVolumeChart(data) {
  var container = document.getElementById('chart-ride-volume');
  if (!container) return;
  if (!data.data || !data.data.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-area-line"></i><div class="ro-empty__title">No ride data</div><div class="ro-empty__message">No rides found in this period.</div></div>';
    return;
  }
  var lineData = data.data.map(function(r) {
    return {
      label: new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: r.total || 0,
      raw: r
    };
  });
  renderLineChart('chart-ride-volume', lineData, {
    unit: 'rides',
    color: getCurrentCampusPalette()[0],
    tooltipFn: function(raw) {
      return raw.date + ': ' + raw.total + ' rides (' + raw.completed + ' completed, ' + raw.noShows + ' no-shows, ' + raw.cancelled + ' cancelled)';
    }
  });
}

function renderDonutChart(containerId, distribution) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var items = [
    { label: 'Completed', value: distribution.completed || 0, color: 'var(--status-completed)' },
    { label: 'No-Shows', value: distribution.noShows || 0, color: 'var(--status-no-show)' },
    { label: 'Cancelled', value: distribution.cancelled || 0, color: 'var(--status-cancelled)' },
    { label: 'Denied', value: distribution.denied || 0, color: 'var(--status-denied)' }
  ].filter(function(i) { return i.value > 0; });

  var total = items.reduce(function(s, i) { return s + i.value; }, 0);
  if (total === 0) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-donut-3"></i><div class="ro-empty__title">No outcomes</div><div class="ro-empty__message">No terminal rides in this period.</div></div>';
    return;
  }

  var W = 300, H = 260;
  var cx = 130, cy = 130, r = 95, strokeW = 28;
  var circumference = 2 * Math.PI * r;
  var offset = 0;

  var arcs = '';
  items.forEach(function(item) {
    var pct = item.value / total;
    var dashLen = pct * circumference;
    arcs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + item.color + '" stroke-width="' + strokeW + '" stroke-dasharray="' + dashLen + ' ' + (circumference - dashLen) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" />';
    offset += dashLen;
  });

  var legend = items.map(function(i) {
    var pct = (i.value / total * 100).toFixed(1);
    return '<div style="display:flex;align-items:center;gap:6px;font-size:12px;"><span style="width:10px;height:10px;border-radius:2px;background:' + i.color + ';flex-shrink:0;"></span>' + i.label + ': ' + i.value + ' (' + pct + '%)</div>';
  }).join('');

  container.innerHTML =
    '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:200px;height:200px;">' +
        arcs +
        '<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" style="font-size:28px;font-weight:700;fill:var(--color-text);">' + total + '</text>' +
        '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" style="font-size:12px;fill:var(--color-text-muted);">total rides</text>' +
      '</svg>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">' + legend + '</div>' +
    '</div>';
}

function renderPeakHoursHeatmap(containerId, data) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var grid = data.grid || [];
  var maxCount = data.maxCount || 1;
  var opHours = data.operatingHours || { start: 8, end: 19 };
  var dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  var palette = getCurrentCampusPalette();
  var baseColor = palette[0] || getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4682B4';

  // Resolve CSS variable to hex if needed
  if (baseColor.indexOf('var(') === 0) {
    baseColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4682B4';
  }

  // Build lookup
  var lookup = {};
  grid.forEach(function(cell) { lookup[cell.dow + '-' + cell.hour] = cell.total; });

  var html = '<div style="overflow-x:auto;"><table style="border-collapse:separate;border-spacing:3px;width:100%;font-size:12px;">';
  html += '<thead><tr><th style="padding:4px 8px;font-size:11px;color:var(--color-text-muted);text-align:left;">Hour</th>';
  dayLabels.forEach(function(d) { html += '<th style="padding:4px 8px;font-size:11px;color:var(--color-text-muted);text-align:center;">' + d + '</th>'; });
  html += '</tr></thead><tbody>';

  for (var hour = opHours.start; hour < opHours.end; hour++) {
    var label = (hour > 12 ? hour - 12 : hour) + (hour >= 12 ? 'pm' : 'am');
    html += '<tr><td style="padding:4px 8px;font-size:11px;color:var(--color-text-muted);white-space:nowrap;font-weight:500;">' + label + '</td>';
    for (var dow = 1; dow <= 5; dow++) {
      var count = lookup[dow + '-' + hour] || 0;
      var intensity = maxCount > 0 ? count / maxCount : 0;
      var rr = parseInt(baseColor.slice(1, 3), 16);
      var gg = parseInt(baseColor.slice(3, 5), 16);
      var bb = parseInt(baseColor.slice(5, 7), 16);
      var bg = count > 0 ? 'rgba(' + rr + ', ' + gg + ', ' + bb + ', ' + Math.max(0.08, intensity * 0.85) + ')' : 'var(--color-surface-dim)';
      var textColor = intensity > 0.5 ? '#fff' : 'var(--color-text)';
      html += '<td style="padding:8px 4px;text-align:center;background:' + bg + ';color:' + textColor + ';border-radius:4px;font-weight:' + (count > 0 ? '600' : '400') + ';min-width:48px;cursor:default;" title="' + dayLabels[dow - 1] + ' ' + label + ': ' + count + ' rides">' + (count > 0 ? count : '\u2014') + '</td>';
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11px;color:var(--color-text-muted);"><span>Low</span>';
  for (var i = 0; i < 5; i++) {
    var opacity = 0.08 + i * 0.2;
    var rr2 = parseInt(baseColor.slice(1, 3), 16);
    var gg2 = parseInt(baseColor.slice(3, 5), 16);
    var bb2 = parseInt(baseColor.slice(5, 7), 16);
    html += '<span style="display:inline-block;width:20px;height:14px;border-radius:3px;background:rgba(' + rr2 + ',' + gg2 + ',' + bb2 + ',' + opacity + ');"></span>';
  }
  html += '<span>High</span></div>';

  container.innerHTML = html;
}

function renderTopRoutesTable(containerId, routes) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!routes || !routes.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-route"></i><div class="ro-empty__title">No routes</div><div class="ro-empty__message">No route data for this period.</div></div>';
    return;
  }
  var top10 = routes.slice(0, 10);
  var html = '<table class="ro-table ro-table--sm" style="width:100%;"><thead><tr><th>Route</th><th style="text-align:right;">Rides</th><th style="text-align:right;">Completion</th></tr></thead><tbody>';
  top10.forEach(function(r) {
    var rateColor = r.completionRate >= 85 ? 'var(--status-completed)' : r.completionRate >= 70 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';
    html += '<tr><td style="font-size:12px;">' + r.pickupLocation + ' \u2192 ' + r.dropoffLocation + '</td><td style="text-align:right;font-weight:600;">' + r.total + '</td><td style="text-align:right;"><span style="color:' + rateColor + ';font-weight:600;">' + r.completionRate + '%</span></td></tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  makeSortable(container.querySelector('table'));
}

function renderDriverLeaderboard(containerId, drivers) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!drivers || !drivers.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-steering-wheel"></i><div class="ro-empty__title">No driver data</div><div class="ro-empty__message">No driver performance data for this period.</div></div>';
    return;
  }
  var sorted = drivers.slice().sort(function(a, b) { return b.completed - a.completed; });
  var html = '<table class="ro-table ro-table--sm" style="width:100%;"><thead><tr><th>Driver</th><th style="text-align:right;">Rides</th><th style="text-align:right;">Completion</th><th style="text-align:right;">On-Time</th></tr></thead><tbody>';
  sorted.forEach(function(d) {
    var compRate = d.completionRate || 0;
    var punctRate = d.punctualityRate || 100;
    var compColor = compRate >= 85 ? 'var(--status-completed)' : compRate >= 70 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';
    var punctColor = punctRate >= 90 ? 'var(--status-completed)' : punctRate >= 80 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';
    html += '<tr><td style="font-size:12px;">' + d.driverName + '</td><td style="text-align:right;font-weight:600;">' + d.completed + '</td><td style="text-align:right;"><span style="color:' + compColor + ';font-weight:600;">' + compRate + '%</span></td><td style="text-align:right;"><span style="color:' + punctColor + ';font-weight:600;">' + punctRate + '%</span></td></tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  makeSortable(container.querySelector('table'));
}

function renderShiftCoverageChart(containerId, data) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!data.daily || !data.daily.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-calendar-stats"></i><div class="ro-empty__title">No coverage data</div><div class="ro-empty__message">No shift coverage data for this period.</div></div>';
    return;
  }

  var totals = data.totals || {};
  var coverageRate = totals.coverageRate || 0;
  var coverageColor = coverageRate >= 95 ? 'var(--status-completed)' : coverageRate >= 80 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';

  var html = '<div style="display:flex;gap:24px;margin-bottom:16px;flex-wrap:wrap;">' +
    '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:' + coverageColor + ';">' + coverageRate + '%</div><div style="font-size:11px;color:var(--color-text-muted);">Coverage Rate</div></div>' +
    '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;">' + (totals.scheduledHours || 0) + 'h</div><div style="font-size:11px;color:var(--color-text-muted);">Scheduled</div></div>' +
    '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;">' + (totals.actualHours || 0) + 'h</div><div style="font-size:11px;color:var(--color-text-muted);">Actual</div></div>' +
    '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;">' + (totals.totalCompletedRides || 0) + '</div><div style="font-size:11px;color:var(--color-text-muted);">Rides Completed</div></div>' +
  '</div>';

  html += '<table class="ro-table ro-table--sm" style="width:100%;"><thead><tr><th>Date</th><th style="text-align:right;">Scheduled</th><th style="text-align:right;">Actual</th><th style="text-align:right;">Gap</th><th style="text-align:right;">Rides</th></tr></thead><tbody>';
  data.daily.forEach(function(d) {
    var gapColor = d.gapHours < 0 ? 'var(--status-no-show)' : d.gapHours > 0 ? 'var(--status-completed)' : '';
    var gapText = d.gapHours > 0 ? '+' + d.gapHours + 'h' : d.gapHours + 'h';
    var dateStr = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    html += '<tr><td style="font-size:12px;">' + dateStr + '</td><td style="text-align:right;">' + d.scheduledHours + 'h</td><td style="text-align:right;">' + d.actualHours + 'h</td><td style="text-align:right;color:' + gapColor + ';font-weight:600;">' + gapText + '</td><td style="text-align:right;">' + d.completedRides + '</td></tr>';
  });
  html += '</tbody></table>';

  container.innerHTML = html;
}

function renderRiderCohorts(containerId, data) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var summary = data.summary || {};
  var items = [
    { label: 'Active', value: summary.active || 0, color: 'var(--status-completed)', icon: 'ti-user-check' },
    { label: 'New', value: summary.new || 0, color: 'var(--status-approved)', icon: 'ti-user-plus' },
    { label: 'Returning', value: summary.returning || 0, color: 'var(--color-primary)', icon: 'ti-refresh' },
    { label: 'At-Risk', value: summary.atRisk || 0, color: 'var(--status-on-the-way)', icon: 'ti-alert-triangle' },
    { label: 'Churned', value: summary.churned || 0, color: 'var(--color-text-muted)', icon: 'ti-user-minus' },
    { label: 'Terminated', value: summary.terminated || 0, color: 'var(--status-no-show)', icon: 'ti-ban' }
  ];

  var html = '<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;">';
  items.forEach(function(i) {
    html += '<div style="text-align:center;padding:12px;border-radius:8px;background:var(--color-surface-dim);">' +
      '<i class="ti ' + i.icon + '" style="font-size:20px;color:' + i.color + ';"></i>' +
      '<div style="font-size:20px;font-weight:700;color:' + i.color + ';margin:4px 0;">' + i.value + '</div>' +
      '<div style="font-size:11px;color:var(--color-text-muted);">' + i.label + '</div>' +
    '</div>';
  });
  html += '</div>';

  if (data.retentionRate !== undefined) {
    html += '<div style="margin-top:12px;text-align:center;font-size:12px;color:var(--color-text-muted);">Retention Rate: <strong>' + data.retentionRate + '%</strong></div>';
  }

  container.innerHTML = html;
}

function renderFleetUtilChart(containerId, data) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!data || !data.vehicles || !data.vehicles.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-bus"></i><div class="ro-empty__title">No fleet data</div><div class="ro-empty__message">No vehicle data available.</div></div>';
    return;
  }
  var palette = getCurrentCampusPalette();
  var vehicles = data.vehicles.filter(function(v) { return v.status !== 'retired'; });
  var totalRides = vehicles.reduce(function(s, v) { return s + (v.totalRides || 0); }, 0);
  if (totalRides === 0) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-bus"></i><div class="ro-empty__title">No vehicle assignments</div><div class="ro-empty__message">No vehicles were assigned to rides in this period. Assign vehicles to rides from the dispatch view.</div></div>';
    return;
  }
  var maxRides = Math.max.apply(null, vehicles.map(function(v) { return v.totalRides || 0; }).concat([1]));

  var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
  vehicles.forEach(function(v, i) {
    var pct = maxRides > 0 ? ((v.totalRides || 0) / maxRides * 100) : 0;
    var color = palette[i % palette.length];
    var typeIcon = v.type === 'accessible' ? 'ti-wheelchair' : 'ti-car';
    html += '<div style="display:flex;align-items:center;gap:8px;">' +
      '<i class="ti ' + typeIcon + '" style="color:var(--color-text-muted);font-size:14px;width:16px;"></i>' +
      '<span style="font-size:12px;min-width:70px;white-space:nowrap;">' + v.name + '</span>' +
      '<div style="flex:1;background:var(--color-surface-dim);border-radius:4px;height:20px;overflow:hidden;">' +
        '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:4px;transition:width 0.3s;"></div>' +
      '</div>' +
      '<span style="font-size:12px;font-weight:600;min-width:35px;text-align:right;">' + (v.totalRides || 0) + '</span>' +
    '</div>';
  });
  html += '</div>';

  if (data.summary) {
    html += '<div style="margin-top:12px;font-size:11px;color:var(--color-text-muted);">' + data.summary.totalFleet + ' vehicles total \u00B7 ' + data.summary.available + ' available \u00B7 ' + (data.summary.overdueCount || 0) + ' maintenance overdue</div>';
  }

  container.innerHTML = html;
}

// ── Updated Analytics Orchestrator ──

async function loadAllAnalytics() {
  // Initialize or refresh widget system (creates dynamic widget card DOM)
  if (typeof initWidgetSystem === 'function') {
    if (typeof _widgetUserId === 'undefined' || !_widgetUserId) {
      // First call: full init
      initWidgetSystem(currentUser ? currentUser.id : 'default');
    } else {
      // Subsequent calls (date change, refresh): just rebuild DOM
      renderWidgetGrid();
    }
  }

  // Helper: check if a container exists in the DOM (widget is visible)
  function has(id) { return !!document.getElementById(id); }

  // Show skeleton loading states for visible widgets
  if (has('analytics-kpi-grid')) showAnalyticsSkeleton('analytics-kpi-grid', 'kpi');
  if (has('chart-ride-volume')) showAnalyticsSkeleton('chart-ride-volume', 'chart');
  if (has('chart-ride-outcomes')) showAnalyticsSkeleton('chart-ride-outcomes', 'donut');
  if (has('chart-peak-hours')) showAnalyticsSkeleton('chart-peak-hours', 'heatmap');
  if (has('chart-dow')) showAnalyticsSkeleton('chart-dow', 'chart');
  if (has('chart-hour')) showAnalyticsSkeleton('chart-hour', 'chart');
  if (has('chart-top-routes')) showAnalyticsSkeleton('chart-top-routes', 'table');
  if (has('chart-driver-leaderboard')) showAnalyticsSkeleton('chart-driver-leaderboard', 'table');
  if (has('chart-shift-coverage')) showAnalyticsSkeleton('chart-shift-coverage', 'table');
  if (has('chart-fleet-util')) showAnalyticsSkeleton('chart-fleet-util', 'chart');
  if (has('chart-rider-cohorts')) showAnalyticsSkeleton('chart-rider-cohorts', 'chart');

  // Determine which shared data sources are needed
  var needKPI = has('analytics-kpi-grid');
  var needTardiness = needKPI || has('tardiness-analytics-container');
  var needFleet = needKPI || has('chart-fleet-util');

  // Fetch KPI data sources first (in parallel)
  var results = await Promise.all([
    needKPI ? fetch('/api/analytics/summary' + getAnalyticsDateParams()).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }) : Promise.resolve(null),
    needTardiness ? fetch('/api/analytics/tardiness' + getAnalyticsDateParams()).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }) : Promise.resolve(null),
    needFleet ? fetch('/api/analytics/fleet-utilization' + getAnalyticsDateParams()).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }) : Promise.resolve(null)
  ]);

  var summaryData = results[0];
  var tardinessData = results[1];
  var fleetData = results[2];

  // Render KPIs from combined data
  if (summaryData && has('analytics-kpi-grid')) renderKPIGrid(summaryData, tardinessData, fleetData);

  // Update report preview with summary data
  updateReportPreview(summaryData);

  // Render fleet utilization chart (if visible in widget grid)
  if (fleetData && has('chart-fleet-util')) renderFleetUtilChart('chart-fleet-util', fleetData);

  // Load everything else in parallel — only for visible containers
  var loaders = [];
  if (has('chart-ride-volume')) loaders.push(loadRideVolume());
  if (has('chart-ride-outcomes')) loaders.push(loadRideOutcomes());
  if (has('chart-peak-hours')) loaders.push(loadPeakHours());
  if (has('chart-dow') || has('chart-hour')) loaders.push(loadAnalyticsFrequency());
  if (has('chart-top-routes')) loaders.push(loadTopRoutes());
  if (has('chart-driver-leaderboard')) loaders.push(loadDriverLeaderboard());
  if (has('chart-shift-coverage')) loaders.push(loadShiftCoverage());
  if (has('chart-rider-cohorts')) loaders.push(loadRiderCohorts());
  // Hotspots & milestones are on separate sub-tabs but also available as widgets
  if (has('hotspot-pickups') || has('hotspot-dropoffs') || has('hotspot-matrix')) loaders.push(loadAnalyticsHotspots());
  if (has('driver-milestones') || has('rider-milestones')) loaders.push(loadAnalyticsMilestones());
  // These always load (on their own sub-tabs)
  loaders.push(loadSemesterReport());
  if (tardinessData) loaders.push(renderTardinessSection(document.getElementById('tardiness-analytics-container'), tardinessData));

  await Promise.all(loaders);
}

function logVehicleMaintenance(vehicleId) {
  const formHtml =
    '<div style="margin-bottom:12px;">' +
    '<label class="ro-label">What was serviced? <span style="color:var(--status-no-show)">*</span></label>' +
    '<textarea class="ro-input" id="maintenance-notes" rows="3" placeholder="e.g. Oil change, brake inspection, tire rotation..."></textarea>' +
    '</div>' +
    '<div>' +
    '<label class="ro-label">Mileage at service (optional)</label>' +
    '<input type="number" class="ro-input" id="maintenance-mileage" placeholder="e.g. 12450">' +
    '</div>';
  showModalNew({
    title: 'Log Maintenance',
    body: formHtml,
    confirmLabel: 'Log Maintenance',
    confirmClass: 'ro-btn--primary',
    onConfirm: async function() {
      const notes = document.getElementById('maintenance-notes')?.value?.trim();
      const mileage = document.getElementById('maintenance-mileage')?.value?.trim();
      if (!notes) {
        showToast('Please describe what was serviced', 'error');
        return;
      }
      const payload = { notes };
      if (mileage) payload.mileage = Number(mileage);
      const res = await fetch(`/api/vehicles/${vehicleId}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Failed to log maintenance', 'error');
      } else {
        showToast('Maintenance logged', 'success');
        await loadFleetVehicles();
        if (document.getElementById('vehicle-drawer')?.classList.contains('open')) {
          openVehicleDrawer(vehicleId);
        }
      }
    }
  });
}

async function deleteVehicle(vehicleId, vehicleName) {
  const confirmed = await showConfirmModal({
    title: 'Delete Vehicle',
    message: `Are you sure you want to delete "${vehicleName || 'this vehicle'}"? This action cannot be undone.`,
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    type: 'danger'
  });
  if (!confirmed) return;
  const res = await fetch(`/api/vehicles/${vehicleId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to delete', 'error');
  } else {
    showToast('Vehicle deleted', 'success');
    loadFleetVehicles();
  }
}

async function retireVehicle(vehicleId, vehicleName) {
  const confirmed = await showConfirmModal({
    title: 'Retire Vehicle',
    message: `Retire "${vehicleName || 'this vehicle'}"? It will be hidden from driver dropdowns but its ride history will be preserved.`,
    confirmLabel: 'Retire',
    cancelLabel: 'Cancel',
    type: 'warning'
  });
  if (!confirmed) return;
  const res = await fetch(`/api/vehicles/${vehicleId}/retire`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to retire vehicle', 'error');
  } else {
    showToast('Vehicle retired', 'success');
    loadFleetVehicles();
  }
}

function showFleetStatusInfo() {
  showModalNew({
    title: 'Vehicle Statuses',
    body: '<div style="font-size:13px; line-height:1.7;">' +
      '<strong>Active</strong> — in service and available for assignment.<br>' +
      '<strong>Retired</strong> — removed from service, ride history preserved.<br>' +
      '<strong>Maintenance</strong> — temporarily unavailable for assignment.<br><br>' +
      'Use <strong>Delete</strong> only to remove incorrectly entered vehicles.' +
      '</div>',
    confirmLabel: 'Got it',
    confirmClass: 'ro-btn--primary',
  });
}

async function reactivateVehicle(vehicleId, vehicleName) {
  const confirmed = await showConfirmModal({
    title: 'Reactivate Vehicle',
    message: `Reactivate "${vehicleName || 'this vehicle'}"? It will become available for assignment again.`,
    confirmLabel: 'Reactivate',
    cancelLabel: 'Cancel',
    type: 'warning'
  });
  if (!confirmed) return;
  const res = await fetch(`/api/vehicles/${vehicleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'available' })
  });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to reactivate vehicle', 'error');
  } else {
    showToast('Vehicle reactivated', 'success');
    loadFleetVehicles();
  }
}

async function openVehicleDrawer(vehicleId) {
  const drawer = document.getElementById('vehicle-drawer');
  const backdrop = document.getElementById('vehicle-drawer-backdrop');
  const body = document.getElementById('vehicle-drawer-body');
  const title = document.getElementById('vehicle-drawer-title');
  if (!drawer || !body) return;

  drawer.classList.add('open');
  backdrop.classList.add('open');
  body.innerHTML = '<div style="text-align:center; padding:32px; color:var(--color-text-muted);"><i class="ti ti-loader" style="font-size:24px;"></i></div>';

  const v = fleetVehicles.find(veh => veh.id === vehicleId);
  if (!v) {
    body.innerHTML = '<div class="ro-empty"><i class="ti ti-bus-off"></i><div class="ro-empty__title">Vehicle not found</div></div>';
    return;
  }

  title.textContent = v.name || 'Vehicle Details';

  let logs = [];
  try {
    const res = await fetch(`/api/vehicles/${vehicleId}/maintenance`);
    if (res.ok) logs = await res.json();
  } catch (e) { console.error('Failed to load maintenance logs', e); }

  const lastMaint = v.last_maintenance_date ? new Date(v.last_maintenance_date).toLocaleDateString() : 'Never';
  const lastUsed = v.lastUsed ? new Date(v.lastUsed).toLocaleDateString() : 'Never';
  const statusColor = v.status === 'retired' ? 'var(--color-text-muted)' : 'var(--status-completed)';
  const escapedName = (v.name || '').replace(/'/g, "\\'");

  let actionButtons = '';
  if (v.status === 'retired') {
    actionButtons = `<button class="ro-btn ro-btn--outline ro-btn--sm" onclick="reactivateVehicle('${v.id}', '${escapedName}'); closeVehicleDrawer();">Reactivate</button>`;
  } else if (v.rideCount > 0) {
    actionButtons = `<button class="ro-btn ro-btn--primary ro-btn--sm" onclick="closeVehicleDrawer(); logVehicleMaintenance('${v.id}');">Log Maintenance</button>
      <button class="ro-btn ro-btn--outline ro-btn--sm" onclick="retireVehicle('${v.id}', '${escapedName}'); closeVehicleDrawer();">Retire</button>`;
  } else {
    actionButtons = `<button class="ro-btn ro-btn--primary ro-btn--sm" onclick="closeVehicleDrawer(); logVehicleMaintenance('${v.id}');">Log Maintenance</button>
      <button class="ro-btn ro-btn--danger ro-btn--sm" onclick="deleteVehicle('${v.id}', '${escapedName}'); closeVehicleDrawer();">Delete</button>`;
  }

  let overdueAlert = '';
  if (v.maintenanceOverdue) {
    overdueAlert = `<div class="maintenance-alert" style="margin-bottom:12px;">Maintenance overdue (${v.daysSinceMaintenance} days since last service)</div>`;
  }

  let timelineHtml = '';
  if (logs.length === 0) {
    timelineHtml = '<div style="text-align:center; padding:16px; color:var(--color-text-muted); font-size:13px;">No maintenance history yet.</div>';
  } else {
    timelineHtml = '<ul class="maint-timeline">' + logs.map(log => {
      const date = new Date(log.service_date).toLocaleDateString();
      const mileage = log.mileage_at_service != null ? `${Number(log.mileage_at_service).toLocaleString()} mi` : '';
      const by = log.performed_by_name ? `by ${log.performed_by_name}` : '';
      const metaParts = [mileage, by].filter(Boolean).join(' &middot; ');
      return `<li class="maint-timeline__item">
        <div class="maint-timeline__date">${date}</div>
        ${log.notes ? `<div class="maint-timeline__notes">${log.notes}</div>` : ''}
        ${metaParts ? `<div class="maint-timeline__meta">${metaParts}</div>` : ''}
      </li>`;
    }).join('') + '</ul>';
  }

  body.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${statusColor};"></span>
        <span style="font-size:13px; font-weight:600; text-transform:capitalize;">${v.status}</span>
        <span style="font-size:12px; color:var(--color-text-muted); margin-left:auto;">${v.type}</span>
      </div>
      ${overdueAlert}
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px;">
        <div><span style="color:var(--color-text-muted);">Completed rides</span><div style="font-weight:600;">${v.rideCount}</div></div>
        <div><span style="color:var(--color-text-muted);">Last used</span><div style="font-weight:600;">${lastUsed}</div></div>
        <div><span style="color:var(--color-text-muted);">Total miles</span><div style="font-weight:600;">${v.total_miles != null ? Number(v.total_miles).toLocaleString() : 'N/A'}</div></div>
        <div><span style="color:var(--color-text-muted);">Last maintenance</span><div style="font-weight:600;">${lastMaint}</div></div>
      </div>
    </div>
    <div style="display:flex; gap:8px; margin-bottom:20px;">
      ${actionButtons}
    </div>
    <div style="border-top:1px solid var(--color-border-light); padding-top:12px;">
      <h4 style="font-size:13px; font-weight:700; margin:0 0 8px; color:var(--color-text-secondary);"><i class="ti ti-tool" style="margin-right:4px;"></i>Maintenance History</h4>
      ${timelineHtml}
    </div>
  `;
}

function closeVehicleDrawer() {
  const drawer = document.getElementById('vehicle-drawer');
  const backdrop = document.getElementById('vehicle-drawer-backdrop');
  drawer.classList.remove('open');
  backdrop.classList.remove('open');
  setTimeout(() => {
    const body = document.getElementById('vehicle-drawer-body');
    if (body && !drawer.classList.contains('open')) body.innerHTML = '';
  }, 300);
}

async function addVehicle() {
  const result = await new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>Add Vehicle</h3>
        <label>Vehicle Name<input type="text" id="add-veh-name" placeholder="e.g. Cart #5"></label>
        <label>Type
          <select id="add-veh-type">
            <option value="standard">Standard</option>
            <option value="accessible">Accessible</option>
          </select>
        </label>
        <div class="modal-actions" style="margin-top:16px;">
          <button class="btn secondary" id="add-veh-cancel">Cancel</button>
          <button class="btn primary" id="add-veh-confirm">Add Vehicle</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const cleanup = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#add-veh-cancel').onclick = () => cleanup(null);
    overlay.querySelector('#add-veh-confirm').onclick = () => {
      const name = overlay.querySelector('#add-veh-name').value.trim();
      const type = overlay.querySelector('#add-veh-type').value;
      if (!name) { showToast('Name is required', 'error'); return; }
      cleanup({ name, type });
    };
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
  });
  if (!result) return;
  const res = await fetch('/api/vehicles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result)
  });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to add vehicle', 'error');
  } else {
    showToast('Vehicle added', 'success');
    loadFleetVehicles();
  }
}

function exportTableCSV(tableEl, filename) {
  if (!tableEl) return;
  const headers = Array.from(tableEl.querySelectorAll('thead th')).map(th => th.textContent.trim());
  const rows = Array.from(tableEl.querySelectorAll('tbody tr')).map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
  );
  downloadCSV(headers, rows, filename);
  showToast('CSV downloaded', 'success');
}

function downloadCSV(headers, rows, filename) {
  const escape = v => {
    const s = String(v == null ? '' : v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportSemesterCSV() {
  if (!analyticsReportData) {
    showToast('Load the report first', 'error');
    return;
  }
  const d = analyticsReportData;
  const headers = ['Metric', d.semesterLabel, d.previousLabel];
  const rows = [
    ['Total Rides', d.current.totalRides, d.previous.totalRides],
    ['Completed Rides', d.current.completedRides, d.previous.completedRides],
    ['Unique Riders', d.current.uniqueRiders, d.previous.uniqueRiders],
    ['Completion Rate %', d.current.completionRate, d.previous.completionRate],
    ['No-Shows', d.current.noShows, d.previous.noShows],
    ['Cancelled', d.current.cancelledRides, d.previous.cancelledRides],
    ['', '', ''],
    ['Monthly Breakdown', '', ''],
    ['Month', 'Completed', 'Total', 'Riders']
  ];
  if (d.monthlyBreakdown) {
    d.monthlyBreakdown.forEach(m => rows.push([m.month, m.completed, m.total, m.riders]));
  }
  rows.push(['', '', ''], ['Driver Leaderboard', '', ''], ['Driver', 'Completed', '']);
  if (d.driverLeaderboard) {
    d.driverLeaderboard.forEach(dr => rows.push([dr.name, dr.completed, '']));
  }
  downloadCSV(headers, rows, `rideops-report-${d.semesterLabel.replace(/\s/g, '-').toLowerCase()}.csv`);
  showToast('CSV downloaded', 'success');
}

// ----- Initialize -----
// ----- Business Rules -----
let businessRulesLoaded = false;

async function loadBusinessRules() {
  const container = document.getElementById('business-rules-container');
  if (!container) return;
  container.innerHTML = '<div class="text-muted text-sm">Loading settings...</div>';
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Failed to fetch');
    const grouped = await res.json();

    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const CATEGORY_LABELS = { operations: 'Operations', rides: 'Rides', staff: 'Staff' };
    const CATEGORY_ICONS = { operations: 'ti-clock', rides: 'ti-car', staff: 'ti-users' };
    const categoryOrder = ['operations', 'rides', 'staff'];

    // Sort settings within each category: put time fields in logical order (start before end)
    const SORT_ORDER = {
      'service_hours_start': 0,
      'service_hours_end': 1
    };
    for (const cat of categoryOrder) {
      if (grouped[cat]) {
        grouped[cat].sort((a, b) => {
          const oa = SORT_ORDER[a.key] !== undefined ? SORT_ORDER[a.key] : 50;
          const ob = SORT_ORDER[b.key] !== undefined ? SORT_ORDER[b.key] : 50;
          return oa - ob;
        });
      }
    }

    let html = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">';
    html += '<h3 class="ro-section__title" style="margin:0;">Business Rules</h3>';
    html += '<button class="ro-btn ro-btn--primary" id="save-business-rules"><i class="ti ti-device-floppy"></i> Save Changes</button>';
    html += '</div>';

    for (const cat of categoryOrder) {
      const settings = grouped[cat];
      if (!settings) continue;
      // Card wrapper for each category
      html += `<div class="ro-table-wrap" style="margin-bottom:16px;">`;
      html += `<div style="padding:14px 16px 10px; border-bottom:1px solid var(--color-border-light); display:flex; align-items:center; gap:6px;">`;
      html += `<i class="ti ${CATEGORY_ICONS[cat] || 'ti-settings'}" style="font-size:16px; color:var(--color-text-secondary);"></i>`;
      html += `<span style="font-size:13px; font-weight:700; color:var(--color-text);">${CATEGORY_LABELS[cat] || cat}</span>`;
      html += `</div>`;
      html += '<div style="padding:16px; display:flex; flex-direction:column; gap:14px;">';
      for (const s of settings) {
        if (s.key === 'operating_days') {
          // Render as day pills
          const activeDays = String(s.value).split(',').map(Number);
          html += `<div class="field-group"><label class="ro-label">${s.label}</label>`;
          html += `<div style="display:flex; gap:6px; flex-wrap:wrap;">`;
          for (let d = 0; d < 7; d++) {
            const active = activeDays.includes(d);
            html += `<button type="button" class="ro-btn ro-btn--sm day-pill-btn${active ? ' ro-btn--primary' : ' ro-btn--outline'}" data-day="${d}" style="min-width:48px;">${DAY_LABELS[d]}</button>`;
          }
          html += '</div>';
          html += '</div>';
        } else if (s.type === 'boolean') {
          html += `<div class="field-group" style="display:flex; align-items:center; gap:8px; flex-direction:row;">`;
          html += `<input type="checkbox" id="setting-${s.key}" data-key="${s.key}" data-type="boolean" ${s.value === 'true' ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--color-primary); flex-shrink:0;">`;
          html += `<div>`;
          html += `<label for="setting-${s.key}" style="font-size:13px; font-weight:600; cursor:pointer; color:var(--color-text);">${s.label}</label>`;
          if (s.description) html += `<div class="text-xs text-muted" style="margin-top:1px;">${s.description}</div>`;
          html += `</div>`;
          html += '</div>';
        } else if (s.type === 'number') {
          html += `<div class="field-group"><label class="ro-label">${s.label}</label>`;
          html += `<input type="number" id="setting-${s.key}" data-key="${s.key}" data-type="number" value="${s.value}" class="ro-input" style="max-width:120px;" min="0">`;
          if (s.description) html += `<div class="text-xs text-muted" style="margin-top:4px;">${s.description}</div>`;
          html += '</div>';
        } else if (s.type === 'time') {
          html += `<div class="field-group"><label class="ro-label">${s.label}</label>`;
          html += `<input type="time" id="setting-${s.key}" data-key="${s.key}" data-type="time" value="${s.value}" class="ro-input" style="max-width:150px;">`;
          if (s.description) html += `<div class="text-xs text-muted" style="margin-top:4px;">${s.description}</div>`;
          html += '</div>';
        } else if (s.key === 'academic_period_label') {
          const aplOptions = ['Semester', 'Quarter', 'Trimester'];
          html += `<div class="field-group"><label class="ro-label">${s.label}</label>`;
          html += `<select id="setting-${s.key}" data-key="${s.key}" data-type="select" class="ro-input" style="max-width:200px;">`;
          for (const opt of aplOptions) {
            html += `<option value="${opt}"${s.value === opt ? ' selected' : ''}>${opt}</option>`;
          }
          html += '</select>';
          if (s.description) html += `<div class="text-xs text-muted" style="margin-top:4px;">${s.description}</div>`;
          html += '</div>';
        } else {
          html += `<div class="field-group"><label class="ro-label">${s.label}</label>`;
          html += `<input type="text" id="setting-${s.key}" data-key="${s.key}" data-type="string" value="${s.value}" class="ro-input" style="max-width:300px;">`;
          if (s.description) html += `<div class="text-xs text-muted" style="margin-top:4px;">${s.description}</div>`;
          html += '</div>';
        }
      }
      html += '</div></div>';
    }

    container.innerHTML = html;

    // Day pill toggle behavior
    container.querySelectorAll('.day-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const isActive = btn.classList.contains('ro-btn--primary');
        if (isActive) {
          const activeCount = container.querySelectorAll('.day-pill-btn.ro-btn--primary').length;
          if (activeCount <= 1) {
            showToast('At least one operating day must be selected', 'error');
            return;
          }
        }
        btn.classList.toggle('ro-btn--primary');
        btn.classList.toggle('ro-btn--outline');
      });
    });

    // Save button
    document.getElementById('save-business-rules')?.addEventListener('click', saveBusinessRules);
  } catch (err) {
    container.innerHTML = '<div class="text-muted text-sm">Failed to load settings.</div>';
    console.error('loadBusinessRules error:', err);
  }
}

async function saveBusinessRules() {
  const updates = [];
  // Collect operating_days from day pills
  const activeDays = [];
  document.querySelectorAll('.day-pill-btn.ro-btn--primary').forEach(btn => {
    activeDays.push(Number(btn.dataset.day));
  });

  // Client-side validation
  if (activeDays.length === 0) {
    showToast('At least one operating day must be selected', 'error');
    return;
  }

  const startInput = document.querySelector('[data-key="service_hours_start"]');
  const endInput = document.querySelector('[data-key="service_hours_end"]');
  if (startInput && endInput && startInput.value >= endInput.value) {
    showToast('Service hours start must be earlier than end time', 'error');
    return;
  }

  const graceInput = document.querySelector('[data-key="grace_period_minutes"]');
  if (graceInput && (isNaN(parseInt(graceInput.value)) || parseInt(graceInput.value) < 1)) {
    showToast('Grace period must be at least 1 minute', 'error');
    return;
  }

  const strikesInput = document.querySelector('[data-key="max_no_show_strikes"]');
  if (strikesInput && (isNaN(parseInt(strikesInput.value)) || parseInt(strikesInput.value) < 1)) {
    showToast('Max no-show strikes must be at least 1', 'error');
    return;
  }

  updates.push({ key: 'operating_days', value: activeDays.sort().join(',') });

  // Collect all other settings
  document.querySelectorAll('[data-key][data-type]').forEach(el => {
    const key = el.dataset.key;
    const type = el.dataset.type;
    let value;
    if (type === 'boolean') {
      value = el.checked ? 'true' : 'false';
    } else {
      value = el.value;
    }
    updates.push({ key, value });
  });

  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (handleSessionExpiry(res)) return;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Failed to save business rules', 'error');
      return;
    }
    showToast('Business rules saved', 'success');
    // Invalidate cached ops config
    if (typeof invalidateOpsConfig === 'function') invalidateOpsConfig();
    // Refresh calendar settings dynamically
    refreshCalendarSettings();
  } catch (err) {
    showToast('Failed to save business rules', 'error');
    console.error('saveBusinessRules error:', err);
  }
}

let guidelinesQuill = null;
let guidelinesLoaded = false;

async function loadProgramGuidelines() {
  if (guidelinesLoaded) return;
  guidelinesLoaded = true;
  const editorEl = document.getElementById('program-guidelines-editor');
  if (!editorEl || typeof Quill === 'undefined') {
    console.error('Quill not available or editor element missing');
    return;
  }
  guidelinesQuill = new Quill('#program-guidelines-editor', {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['clean']
      ]
    },
    placeholder: 'Enter program rules and guidelines for riders and drivers...'
  });
  try {
    const data = await fetch('/api/program-rules').then(r => r.json());
    if (data.rulesHtml) guidelinesQuill.clipboard.dangerouslyPasteHTML(data.rulesHtml);
  } catch (err) {
    console.error('loadProgramGuidelines fetch error:', err);
  }
  const saveBtn = document.getElementById('save-program-guidelines-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveProgramGuidelines);
}

async function saveProgramGuidelines() {
  if (!guidelinesQuill) return;
  const saveBtn = document.getElementById('save-program-guidelines-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Saving...'; }
  try {
    const res = await fetch('/api/program-rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rulesHtml: guidelinesQuill.root.innerHTML })
    });
    if (handleSessionExpiry(res)) return;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Failed to save guidelines', 'error');
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.ok) { showToast('Program guidelines saved', 'success'); window._cachedRulesHtml = null; }
    else showToast(data.error || 'Save failed', 'error');
  } catch (err) {
    showToast('Failed to save guidelines', 'error');
    console.error('saveProgramGuidelines error:', err);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="ti ti-device-floppy"></i> Save'; }
  }
}

// ----- Notification Preferences -----
let notifPrefsLoaded = false;

async function loadNotificationPreferences() {
  const container = document.getElementById('notif-prefs-container');
  if (!container) return;
  container.innerHTML = '<div class="text-muted">Loading notification preferences...</div>';

  try {
    const [prefsRes, settingsRes] = await Promise.all([
      fetch('/api/notification-preferences'),
      fetch('/api/settings')
    ]);
    if (!prefsRes.ok) throw new Error('Failed to load');
    const data = await prefsRes.json();
    const prefs = data.preferences;

    // Extract system-level notification toggles from settings
    const settingsData = settingsRes.ok ? await settingsRes.json() : {};
    const systemNotifSettings = (settingsData.notifications || []);

    const categoryLabels = { staff: 'Staff Alerts', rides: 'Ride Alerts', reports: 'Reports' };
    const byCategory = {};
    for (const [key, pref] of Object.entries(prefs)) {
      const cat = pref.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(pref);
    }

    let html = '';
    html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">';
    html += '<div><div class="ro-section__title">Notification Preferences</div>';
    html += '<div class="ro-section__subtitle">Choose which events notify you and how</div></div>';
    html += '<button class="ro-btn ro-btn--primary" id="save-notif-prefs-btn"><i class="ti ti-device-floppy"></i> Save Preferences</button>';
    html += '</div>';

    // System Notifications section
    if (systemNotifSettings.length > 0) {
      html += '<div class="ro-table-wrap" style="margin-bottom:16px;">';
      html += '<table class="ro-table" style="table-layout:fixed;">';
      html += '<thead><tr>';
      html += '<th style="width:auto;">System Notifications</th>';
      html += '<th style="width:80px; text-align:center;">Enabled</th>';
      html += '</tr></thead>';
      html += '<tbody>';
      for (const setting of systemNotifSettings) {
        const checked = setting.value === 'true' ? 'checked' : '';
        html += '<tr style="cursor:default;">';
        html += '<td style="vertical-align:middle;">';
        html += '<div class="fw-600" style="font-size:13px; color:var(--color-text);">' + setting.label + '</div>';
        html += '<div class="text-muted text-xs">' + (setting.description || '') + '</div>';
        html += '</td>';
        html += '<td style="text-align:center; vertical-align:middle;">';
        html += '<input type="checkbox" data-system-setting="' + setting.key + '" ' + checked + ' style="width:16px;height:16px;accent-color:var(--color-primary);cursor:pointer">';
        html += '</td>';
        html += '</tr>';
      }
      html += '</tbody></table>';
      html += '</div>';
    }

    const categoryOrder = ['reports', 'staff', 'rides'];
    const orderedCategories = categoryOrder.filter(c => byCategory[c]).map(c => [c, byCategory[c]]);
    // Include any categories not in our explicit order
    for (const [c, evts] of Object.entries(byCategory)) {
      if (!categoryOrder.includes(c)) orderedCategories.push([c, evts]);
    }

    for (const [category, events] of orderedCategories) {
      // Card wrapper per category
      html += '<div class="ro-table-wrap" style="margin-bottom:16px;">';
      html += '<table class="ro-table" style="table-layout:fixed;">';
      // Category header row
      html += '<thead>';
      html += '<tr>';
      html += '<th style="width:auto;">' + (categoryLabels[category] || category) + '</th>';
      html += '<th style="width:64px; text-align:center;">Email</th>';
      html += '<th style="width:64px; text-align:center;">In-App</th>';
      html += '<th style="width:100px; text-align:center; padding-right:16px;">Threshold</th>';
      html += '</tr>';
      html += '</thead>';
      html += '<tbody>';

      for (const evt of events) {
        const emailCh = evt.channels.email || { enabled: false };
        const inAppCh = evt.channels.in_app || { enabled: false };
        const threshold = emailCh.thresholdValue;

        html += '<tr style="cursor:default;">';

        // Label + description
        html += '<td style="vertical-align:middle;">';
        html += '<div class="fw-600" style="font-size:13px; color:var(--color-text);">' + evt.label + '</div>';
        html += '<div class="text-muted text-xs">' + (evt.description || '') + '</div>';
        html += '</td>';

        // Email toggle
        html += '<td style="text-align:center; vertical-align:middle;">';
        html += '<input type="checkbox" data-event="' + evt.key + '" data-channel="email" '
          + (emailCh.enabled ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:var(--color-primary);cursor:pointer">';
        html += '</td>';

        // In-app toggle
        html += '<td style="text-align:center; vertical-align:middle;">';
        html += '<input type="checkbox" data-event="' + evt.key + '" data-channel="in_app" '
          + (inAppCh.enabled ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:var(--color-primary);cursor:pointer">';
        html += '</td>';

        // Threshold
        html += '<td style="text-align:center; vertical-align:middle; padding-right:16px;">';
        if (evt.thresholdUnit) {
          const unit = evt.thresholdUnit === 'minutes' || evt.thresholdUnit === 'minutes_after_shift_start' ? 'min' : '';
          html += '<div style="display:flex; align-items:center; gap:4px; justify-content:center;">';
          html += '<input type="number" class="ro-input" data-event="' + evt.key + '" data-field="threshold" value="' + (threshold || '') + '" style="width:50px;text-align:center;padding:4px" min="1">';
          html += '<span class="text-xs text-muted">' + unit + '</span>';
          html += '</div>';
        } else {
          html += '<span class="text-muted" style="font-size:12px;">\u2014</span>';
        }
        html += '</td>';

        html += '</tr>';
      }
      html += '</tbody></table>';
      html += '</div>';
    }
    container.innerHTML = html;

    document.getElementById('save-notif-prefs-btn').addEventListener('click', saveNotificationPreferences);
  } catch (e) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-bell-off"></i><div class="ro-empty__title">Error</div><div class="ro-empty__message">Could not load notification preferences.</div></div>';
    console.error('loadNotificationPreferences error:', e);
  }
}

async function saveNotificationPreferences() {
  const btn = document.getElementById('save-notif-prefs-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> Saving...';

  try {
    // Save system-level notification toggles first
    const systemCheckboxes = document.querySelectorAll('#notif-prefs-container input[data-system-setting]');
    if (systemCheckboxes.length > 0) {
      const settings = [];
      systemCheckboxes.forEach(function(el) {
        settings.push({ key: el.dataset.systemSetting, value: el.checked ? 'true' : 'false' });
      });
      const sysRes = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });
      if (handleSessionExpiry(sysRes)) return;
      if (!sysRes.ok) {
        const data = await sysRes.json().catch(() => ({}));
        showToastNew(data.error || 'Failed to save system settings', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Preferences';
        return;
      }
    }

    // Save per-user notification preferences
    const preferences = [];
    const checkboxes = document.querySelectorAll('#notif-prefs-container input[data-event][data-channel]');
    checkboxes.forEach(function(el) {
      const eventType = el.dataset.event;
      const channel = el.dataset.channel;
      const thresholdEl = document.querySelector('#notif-prefs-container input[data-event="' + eventType + '"][data-field="threshold"]');
      preferences.push({
        eventType,
        channel,
        enabled: el.checked,
        thresholdValue: thresholdEl ? (parseInt(thresholdEl.value) || null) : null
      });
    });

    const res = await fetch('/api/notification-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences })
    });
    if (handleSessionExpiry(res)) return;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToastNew(data.error || 'Failed to save preferences', 'error');
      return;
    }
    showToastNew('Notification preferences saved', 'success');
  } catch (e) {
    showToastNew('Failed to save preferences', 'error');
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Preferences';
}

// ── Data Retention Settings ──

function updateRetentionUI(val, unit) {
  const statusEl = document.getElementById('retention-status');
  const purgeBtn = document.getElementById('purge-now-btn');
  const numVal = parseInt(val) || 0;
  if (statusEl) {
    statusEl.textContent = numVal > 0 ? 'Current: ' + numVal + ' ' + unit : 'Current: Keep forever';
  }
  if (purgeBtn) {
    purgeBtn.disabled = numVal <= 0;
    purgeBtn.title = numVal <= 0 ? 'Set a retention period first' : '';
  }
}

async function loadRetentionSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const grouped = await res.json();
    const dataSettings = grouped.data || [];
    let retVal = '0', retUnit = 'months';
    for (const s of dataSettings) {
      if (s.key === 'ride_retention_value') retVal = s.value;
      if (s.key === 'ride_retention_unit') retUnit = s.value;
    }
    const valInput = document.getElementById('retention-value');
    const unitSelect = document.getElementById('retention-unit');
    if (valInput) valInput.value = retVal;
    if (unitSelect) unitSelect.value = retUnit;
    updateRetentionUI(retVal, retUnit);
  } catch {}

  // Save button
  const saveBtn = document.getElementById('save-retention-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const val = document.getElementById('retention-value')?.value || '0';
      const unit = document.getElementById('retention-unit')?.value || 'months';
      try {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([
            { key: 'ride_retention_value', value: val },
            { key: 'ride_retention_unit', value: unit }
          ])
        });
        if (res.ok) {
          showToastNew('Retention settings saved', 'success');
          updateRetentionUI(val, unit);
        } else {
          const err = await res.json();
          showToastNew(err.error || 'Failed to save', 'error');
        }
      } catch {
        showToastNew('Failed to save retention settings', 'error');
      }
    });
  }

  // Purge Now button
  const purgeBtn = document.getElementById('purge-now-btn');
  if (purgeBtn) {
    purgeBtn.addEventListener('click', () => {
      const val = document.getElementById('retention-value')?.value || '0';
      const unit = document.getElementById('retention-unit')?.value || 'months';
      if (parseInt(val) <= 0) return;
      showModalNew({
        title: 'Purge Old Rides',
        body: 'This will permanently delete all closed rides older than ' + val + ' ' + unit + '. This cannot be undone.',
        confirmLabel: 'Purge',
        confirmClass: 'ro-btn--danger',
        onConfirm: async function() {
          const resultEl = document.getElementById('purge-result');
          try {
            const res = await fetch('/api/rides/purge-old', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
              showToastNew('Purged ' + data.purged + ' ride' + (data.purged !== 1 ? 's' : ''), 'success');
              if (resultEl) resultEl.textContent = 'Purged ' + data.purged + ' rides';
              await loadRides();
            } else {
              showToastNew(data.error || 'Purge failed', 'error');
              if (resultEl) resultEl.textContent = data.error || 'Purge failed';
            }
          } catch {
            showToastNew('Failed to purge rides', 'error');
          }
        }
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadTenantConfig();
  if (!await checkAuth()) return;

  // Register widget loaders for the widget system
  if (typeof registerWidgetLoader === 'function') {
    registerWidgetLoader('kpi-grid', async function() {
      var results = await Promise.all([
        fetch('/api/analytics/summary' + getAnalyticsDateParams()).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
        fetch('/api/analytics/tardiness' + getAnalyticsDateParams()).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
        fetch('/api/analytics/fleet-utilization' + getAnalyticsDateParams()).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; })
      ]);
      if (results[0]) renderKPIGrid(results[0], results[1], results[2]);
    });
    registerWidgetLoader('ride-volume', loadRideVolume);
    registerWidgetLoader('ride-outcomes', loadRideOutcomes);
    registerWidgetLoader('peak-hours', loadPeakHours);
    registerWidgetLoader('rides-by-dow', loadAnalyticsFrequency);
    registerWidgetLoader('rides-by-hour', loadAnalyticsFrequency);
    registerWidgetLoader('top-routes', loadTopRoutes);
    registerWidgetLoader('driver-leaderboard', loadDriverLeaderboard);
    registerWidgetLoader('shift-coverage', loadShiftCoverage);
    registerWidgetLoader('fleet-utilization', async function() {
      var data = await loadFleetUtilization();
      if (data) renderFleetUtilChart('chart-fleet-util', data);
    });
    registerWidgetLoader('rider-cohorts', loadRiderCohorts);
    registerWidgetLoader('hotspot-pickups', async function() {
      try {
        var res = await fetch('/api/analytics/hotspots' + getAnalyticsDateParams());
        if (!res.ok) return;
        var data = await res.json();
        if (data.topPickups) renderHotspotList('w-hotspot-pickups', data.topPickups, '', 'pickups');
      } catch(e) {}
    });
    registerWidgetLoader('hotspot-dropoffs', async function() {
      try {
        var res = await fetch('/api/analytics/hotspots' + getAnalyticsDateParams());
        if (!res.ok) return;
        var data = await res.json();
        if (data.topDropoffs) renderHotspotList('w-hotspot-dropoffs', data.topDropoffs, 'darkgold', 'dropoffs');
      } catch(e) {}
    });
    registerWidgetLoader('route-demand-matrix', async function() {
      try {
        var res = await fetch('/api/analytics/hotspots' + getAnalyticsDateParams());
        if (!res.ok) return;
        var data = await res.json();
        if (data.matrix) renderODMatrix('w-hotspot-matrix', data.matrix);
      } catch(e) {}
    });
    registerWidgetLoader('driver-milestones', async function() {
      try {
        var res = await fetch('/api/analytics/milestones');
        if (!res.ok) return;
        var data = await res.json();
        if (data.drivers) renderMilestoneList('w-driver-milestones', data.drivers, 'driver');
      } catch(e) {}
    });
    registerWidgetLoader('rider-milestones', async function() {
      try {
        var res = await fetch('/api/analytics/milestones');
        if (!res.ok) return;
        var data = await res.json();
        if (data.riders) renderMilestoneList('w-rider-milestones', data.riders, 'rider');
      } catch(e) {}
    });
  }

  const sidebarUserName = document.getElementById('sidebar-user-name');
  if (sidebarUserName && currentUser?.name) sidebarUserName.textContent = currentUser.name;
  if (typeof window.applyDevOnlyVisibility === 'function') {
    await window.applyDevOnlyVisibility(document);
  }
  // Global profile link handler (clickable name tokens)
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.clickable-name');
    if (link && (link.dataset.user || link.dataset.email)) {
      e.preventDefault();
      e.stopPropagation();
      const id = link.dataset.user;
      const email = link.dataset.email;
      openProfileById(id || email);
    }
  });

  // Navigation is initialized via rideops-utils.js initSidebar() + initSubTabs() in index.html

  // Ride filter pills (multi-select)
  document.querySelectorAll('#rides-filter-bar .filter-pill[data-ride-status]').forEach(pill => {
    pill.addEventListener('click', () => {
      const status = pill.dataset.rideStatus;
      if (status === 'all') {
        // Reset to "All"
        rideStatusFilter = new Set(['all']);
      } else {
        // Remove "all" if present
        rideStatusFilter.delete('all');
        if (rideStatusFilter.has(status)) {
          rideStatusFilter.delete(status);
          // If nothing left, revert to "all"
          if (rideStatusFilter.size === 0) rideStatusFilter = new Set(['all']);
        } else {
          rideStatusFilter.add(status);
        }
      }
      // Update pill visual state
      document.querySelectorAll('#rides-filter-bar .filter-pill').forEach(p => {
        p.classList.toggle('active', rideStatusFilter.has(p.dataset.rideStatus));
      });
      renderRideViews();
    });
  });

  // Rides date range filters
  const ridesDateFromInput = document.getElementById('rides-date-from');
  const ridesDateToInput = document.getElementById('rides-date-to');
  if (ridesDateFromInput) {
    ridesDateFromInput.addEventListener('change', () => {
      ridesDateFrom = ridesDateFromInput.value || '';
      renderRideViews();
    });
  }
  if (ridesDateToInput) {
    ridesDateToInput.addEventListener('change', () => {
      ridesDateTo = ridesDateToInput.value || '';
      renderRideViews();
    });
  }

  // Ride text filter input
  const rideFilterInput = document.getElementById('ride-filter-input');
  if (rideFilterInput) {
    rideFilterInput.addEventListener('input', debounce(() => {
      rideFilterText = rideFilterInput.value.trim();
      renderRideViews();
    }, 300));
  }

  // Rides view toggle (table / calendar)
  const viewTableBtn = document.getElementById('rides-view-table-btn');
  const viewCalBtn = document.getElementById('rides-view-calendar-btn');
  const tableView = document.getElementById('rides-table-view');
  const calView = document.getElementById('rides-calendar-view-container');
  if (viewTableBtn && viewCalBtn) {
    viewTableBtn.addEventListener('click', () => {
      viewTableBtn.classList.add('active');
      viewCalBtn.classList.remove('active');
      if (tableView) tableView.style.display = '';
      if (calView) calView.style.display = 'none';
    });
    viewCalBtn.addEventListener('click', () => {
      viewCalBtn.classList.add('active');
      viewTableBtn.classList.remove('active');
      if (calView) calView.style.display = '';
      if (tableView) tableView.style.display = 'none';
      renderRideScheduleGrid();
    });
  }

  // Rides select-all checkbox
  const ridesSelectAllCb = document.getElementById('rides-select-all');
  if (ridesSelectAllCb) {
    ridesSelectAllCb.addEventListener('change', () => {
      const checked = ridesSelectAllCb.checked;
      document.querySelectorAll('#rides-tbody .ride-row-cb').forEach(cb => {
        cb.checked = checked;
        if (checked) _ridesSelectedIds.add(cb.dataset.rideId);
        else _ridesSelectedIds.delete(cb.dataset.rideId);
      });
      _ridesUpdateSelectionUI();
    });
  }

  // Rides delete-selected button
  const ridesDeleteSelBtn = document.getElementById('rides-delete-selected-btn');
  if (ridesDeleteSelBtn) {
    ridesDeleteSelBtn.addEventListener('click', () => {
      const ids = Array.from(_ridesSelectedIds);
      if (!ids.length) return;
      showModalNew({
        title: 'Delete Rides',
        body: 'Delete ' + ids.length + ' ride' + (ids.length !== 1 ? 's' : '') + '? This cannot be undone.',
        confirmLabel: 'Delete',
        confirmClass: 'ro-btn--danger',
        onConfirm: async function() {
          try {
            const res = await fetch('/api/rides/bulk-delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids })
            });
            if (res.ok) {
              const data = await res.json();
              showToastNew('Deleted ' + data.deleted + ' ride' + (data.deleted !== 1 ? 's' : ''), 'success');
            } else {
              const err = await res.json().catch(() => ({}));
              showToastNew(err.error || 'Failed to delete rides', 'error');
            }
          } catch (e) {
            console.error('Bulk ride delete error:', e);
            showToastNew('Failed to delete rides', 'error');
          }
          _ridesSelectedIds = new Set();
          _ridesUpdateSelectionUI();
          await loadRides();
        }
      });
    });
  }

  // Rides CSV export
  const ridesCsvBtn = document.getElementById('rides-export-csv-btn');
  if (ridesCsvBtn) {
    ridesCsvBtn.addEventListener('click', () => {
      const filtered = getFilteredRides();
      if (!filtered.length) return showToastNew('No rides to export', 'info');
      const headers = ['Requested Time', 'Rider', 'Pickup', 'Dropoff', 'Status', 'Driver', 'Notes'];
      const rows = filtered.map(r => [
        r.requestedTime || '',
        r.riderName || '',
        r.pickupLocation || '',
        r.dropoffLocation || '',
        r.status || '',
        r.assignedDriverId ? (employees.find(e => e.id === r.assignedDriverId)?.name || '') : '',
        (r.notes || '').replace(/"/g, '""')
      ]);
      let csv = headers.join(',') + '\n';
      rows.forEach(row => {
        csv += row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',') + '\n';
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rides-export-' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Admin user filter input
  const adminFilterInput = document.getElementById('admin-user-filter');
  if (adminFilterInput) {
    adminFilterInput.addEventListener('input', debounce(filterAdminUsers, 300));
  }

  // Users select-all checkbox
  const usersSelectAllCb = document.getElementById('users-select-all');
  if (usersSelectAllCb) {
    usersSelectAllCb.addEventListener('change', () => {
      const checked = usersSelectAllCb.checked;
      document.querySelectorAll('#admin-users-table tbody .user-row-cb:not(:disabled)').forEach(cb => {
        cb.checked = checked;
        if (checked) _usersSelectedIds.add(cb.dataset.userId);
        else _usersSelectedIds.delete(cb.dataset.userId);
      });
      _usersUpdateSelectionUI();
    });
  }

  // Users delete-selected button
  const usersDeleteSelBtn = document.getElementById('users-delete-selected-btn');
  if (usersDeleteSelBtn) {
    usersDeleteSelBtn.addEventListener('click', () => {
      const ids = Array.from(_usersSelectedIds);
      if (!ids.length) return;
      showModalNew({
        title: 'Delete Users',
        body: 'Delete ' + ids.length + ' selected user' + (ids.length !== 1 ? 's' : '') + '? This cannot be undone.',
        confirmLabel: 'Delete',
        confirmClass: 'ro-btn--danger',
        onConfirm: async function() {
          let deleted = 0;
          let failed = 0;
          for (const id of ids) {
            try {
              const res = await fetch('/api/admin/users/' + id, { method: 'DELETE' });
              if (res.ok) deleted++;
              else failed++;
            } catch {
              failed++;
            }
          }
          if (deleted > 0) showToastNew('Deleted ' + deleted + ' user' + (deleted !== 1 ? 's' : ''), 'success');
          if (failed > 0) showToastNew(failed + ' user' + (failed !== 1 ? 's' : '') + ' failed to delete', 'error');
          _usersSelectedIds = new Set();
          _usersUpdateSelectionUI();
          await loadAdminUsers();
        }
      });
    });
  }

  // Admin drawer close events
  const drawerCloseBtn = document.getElementById('admin-drawer-close');
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeAdminDrawer);
  const drawerBackdrop = document.getElementById('admin-drawer-backdrop');
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeAdminDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('vehicle-drawer')?.classList.contains('open')) {
        closeVehicleDrawer();
      } else if (document.getElementById('admin-drawer')?.classList.contains('open')) {
        closeAdminDrawer();
      }
    }
  });

  // Vehicle drawer close events
  const vehDrawerCloseBtn = document.getElementById('vehicle-drawer-close');
  if (vehDrawerCloseBtn) vehDrawerCloseBtn.addEventListener('click', closeVehicleDrawer);
  const vehDrawerBackdrop = document.getElementById('vehicle-drawer-backdrop');
  if (vehDrawerBackdrop) vehDrawerBackdrop.addEventListener('click', closeVehicleDrawer);

  await loadEmployees();
  await loadShifts();
  await loadRides();
  await loadVehicles();
  await loadAdminUsers();
  checkEmailStatus();
  // Pre-load profile data without switching tab
  if (currentUser?.id) {
    await loadUserProfileData(currentUser.id);
  }
  // Dispatch date picker
  const dispatchDate = document.getElementById('dispatch-date');
  if (dispatchDate) {
    dispatchDate.value = getTodayLocalDate();
    dispatchDate.addEventListener('change', () => renderDispatchGrid());
  }

  // Delegated click handler for dispatch grid ride strips
  const dispatchGrid = document.getElementById('dispatch-grid');
  if (dispatchGrid) {
    dispatchGrid.addEventListener('click', (e) => {
      const strip = e.target.closest('.time-grid__ride-strip[data-ride-id]');
      if (!strip) return;
      e.stopPropagation();
      const ride = rides.find(r => r.id === strip.dataset.rideId);
      if (ride) openRideDrawer(ride);
    });

    // ── Drag-and-drop: assign, unassign, reassign ──
    dispatchGrid.addEventListener('dragstart', (e) => {
      const strip = e.target.closest('.time-grid__ride-strip[draggable="true"]');
      if (!strip) return;
      isDragging = true;
      const rideId = strip.dataset.rideId;
      const rideStatus = strip.dataset.rideStatus;
      const sourceDriverRow = strip.closest('.time-grid__row[data-driver-id]');
      const sourceDriverId = sourceDriverRow ? sourceDriverRow.dataset.driverId : '';
      const sourceRowType = sourceDriverRow ? 'driver' : 'unassigned';
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-ride', JSON.stringify({ rideId, rideStatus, sourceDriverId, sourceRowType }));
      strip.classList.add('time-grid__ride-strip--dragging');
      // Highlight active driver rows (except source) as drop targets
      dispatchGrid.querySelectorAll('.time-grid__row[data-driver-id][data-active="true"]').forEach(row => {
        if (row.dataset.driverId !== sourceDriverId) row.classList.add('time-grid__row--drop-ready');
      });
      // Highlight unassigned row when dragging from a driver (for unassign)
      if (sourceRowType === 'driver') {
        const unassignedRow = dispatchGrid.querySelector('.time-grid__row[data-row-type="unassigned"]');
        if (unassignedRow) unassignedRow.classList.add('time-grid__row--drop-ready');
      }
    });

    dispatchGrid.addEventListener('dragend', () => {
      isDragging = false;
      dispatchGrid.querySelectorAll('.time-grid__ride-strip--dragging').forEach(el => el.classList.remove('time-grid__ride-strip--dragging'));
      dispatchGrid.querySelectorAll('.time-grid__row--drop-ready, .time-grid__row--drop-hover').forEach(el => {
        el.classList.remove('time-grid__row--drop-ready', 'time-grid__row--drop-hover');
      });
    });

    dispatchGrid.addEventListener('dragover', (e) => {
      const row = e.target.closest('.time-grid__row');
      if (!row) return;
      const isActiveDriver = row.dataset.driverId && row.dataset.active === 'true';
      const isUnassigned = row.dataset.rowType === 'unassigned';
      if (isActiveDriver || isUnassigned) e.preventDefault();
    });

    dispatchGrid.addEventListener('dragenter', (e) => {
      const row = e.target.closest('.time-grid__row');
      if (!row) return;
      const isActiveDriver = row.dataset.driverId && row.dataset.active === 'true';
      const isUnassigned = row.dataset.rowType === 'unassigned';
      if (isActiveDriver || isUnassigned) row.classList.add('time-grid__row--drop-hover');
    });

    dispatchGrid.addEventListener('dragleave', (e) => {
      const row = e.target.closest('.time-grid__row');
      if (!row) return;
      if (!row.contains(e.relatedTarget)) row.classList.remove('time-grid__row--drop-hover');
    });

    dispatchGrid.addEventListener('drop', async (e) => {
      e.preventDefault();
      const row = e.target.closest('.time-grid__row');
      if (!row) return;
      const isActiveDriver = row.dataset.driverId && row.dataset.active === 'true';
      const isUnassigned = row.dataset.rowType === 'unassigned';
      if (!isActiveDriver && !isUnassigned) return;

      let data;
      try { data = JSON.parse(e.dataTransfer.getData('application/x-ride')); } catch { return; }
      const { rideId, rideStatus, sourceDriverId, sourceRowType } = data;
      const targetDriverId = row.dataset.driverId || '';

      try {
        // Drop on unassigned row from a driver row → unassign
        if (isUnassigned && sourceRowType === 'driver') {
          const res = await fetch(`/api/rides/${rideId}/unassign`, { method: 'POST' });
          const result = await res.json();
          if (!res.ok) { showToast(result.error || 'Unassign failed', 'error'); return; }
          showToast('Ride moved to unassigned', 'success');
          await loadRides();
          return;
        }

        // Same row or unassigned→unassigned — no-op (use ride drawer to edit time)
        if (isUnassigned && sourceRowType === 'unassigned') return;
        if (isActiveDriver && targetDriverId === sourceDriverId) return;

        // Drop on different active driver → assign or reassign
        let res;
        if (rideStatus === 'approved') {
          res = await fetch(`/api/rides/${rideId}/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverId: targetDriverId }) });
        } else if (rideStatus === 'scheduled') {
          res = await fetch(`/api/rides/${rideId}/reassign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverId: targetDriverId }) });
        } else { return; }
        const result = await res.json();
        if (!res.ok) { showToast(result.error || 'Assignment failed', 'error'); return; }
        const driverName = employees.find(emp => emp.id === targetDriverId)?.name || 'driver';
        showToast(`Ride assigned to ${driverName}`, 'success');
        await loadRides();
      } catch { showToast('Network error', 'error'); }
    });
  }

  // Table toolbar: Add User button
  const addUserBtn = document.getElementById('admin-add-user-btn');
  if (addUserBtn) addUserBtn.addEventListener('click', showCreateUserModal);

  // Table toolbar: CSV export
  const exportCsvUsersBtn = document.getElementById('admin-export-csv-btn');
  if (exportCsvUsersBtn) exportCsvUsersBtn.addEventListener('click', () => {
    exportTableCSV(document.getElementById('admin-users-table'), 'users.csv');
  });

  // Table toolbar: Role filter
  const roleFilterBtn = document.getElementById('admin-role-filter-btn');
  if (roleFilterBtn) {
    roleFilterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close existing dropdown if any
      const existing = document.querySelector('.role-filter-dropdown');
      if (existing) { existing.remove(); return; }
      const dd = document.createElement('div');
      dd.className = 'role-filter-dropdown';
      ['all', 'driver', 'rider', 'office'].forEach(role => {
        const btn = document.createElement('button');
        btn.textContent = role === 'all' ? 'All roles' : role.charAt(0).toUpperCase() + role.slice(1);
        if (adminRoleFilter === role) btn.classList.add('selected');
        btn.onclick = () => {
          adminRoleFilter = role;
          filterAdminUsers();
          roleFilterBtn.classList.toggle('table-toolbar__btn--active', role !== 'all');
          dd.remove();
        };
        dd.appendChild(btn);
      });
      roleFilterBtn.parentElement.appendChild(dd);
      // Close on outside click
      const closeDD = (ev) => {
        if (!dd.contains(ev.target) && ev.target !== roleFilterBtn) {
          dd.remove();
          document.removeEventListener('click', closeDD);
        }
      };
      setTimeout(() => document.addEventListener('click', closeDD), 0);
    });
  }

  const ridePrev = document.getElementById('ride-week-prev');
  const rideNext = document.getElementById('ride-week-next');
  if (ridePrev) ridePrev.addEventListener('click', () => changeRideWeek(-1));
  if (rideNext) rideNext.addEventListener('click', () => changeRideWeek(1));

  // Analytics: default date filter to last 7 days
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const sevenDaysAgo = new Date(now.getTime() - 6 * 86400000);
  const sevenDaysAgoStr = sevenDaysAgo.getFullYear() + '-' + String(sevenDaysAgo.getMonth() + 1).padStart(2, '0') + '-' + String(sevenDaysAgo.getDate()).padStart(2, '0');
  const analyticsFrom = document.getElementById('analytics-from');
  const analyticsTo = document.getElementById('analytics-to');
  if (analyticsFrom) analyticsFrom.value = sevenDaysAgoStr;
  if (analyticsTo) analyticsTo.value = today;

  // Analytics: lazy load on first tab click
  const analyticsRefreshBtn = document.getElementById('analytics-refresh-btn');
  if (analyticsRefreshBtn) analyticsRefreshBtn.addEventListener('click', loadAllAnalytics);

  // Analytics: quick-select range buttons
  document.querySelectorAll('.analytics-quick-select button[data-range]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.analytics-quick-select button').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      setAnalyticsQuickRange(btn.dataset.range);
      loadAllAnalytics();
    });
  });

  // Excel download button
  var downloadExcelBtn = document.getElementById('download-excel-btn');
  if (downloadExcelBtn) downloadExcelBtn.addEventListener('click', downloadExcelReport);

  // Report type dropdown — update preview on change
  var reportTypeSelect = document.getElementById('report-type-select');
  if (reportTypeSelect) reportTypeSelect.addEventListener('change', function() { updateReportPreview(); });

  const addVehicleBtn = document.getElementById('add-vehicle-btn');
  if (addVehicleBtn) addVehicleBtn.addEventListener('click', addVehicle);
  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportSemesterCSV);

  const analyticsNavBtn = document.querySelector('.ro-nav-item[data-target="analytics-panel"]');
  if (analyticsNavBtn) {
    analyticsNavBtn.addEventListener('click', () => {
      if (!analyticsLoaded) {
        analyticsLoaded = true;
        loadAllAnalytics();
      }
    });
  }

  // Fleet: lazy load vehicles on first tab click
  let fleetLoaded = false;
  const fleetNavBtn = document.querySelector('.ro-nav-item[data-target="fleet-panel"]');
  if (fleetNavBtn) {
    fleetNavBtn.addEventListener('click', () => {
      if (!fleetLoaded) {
        fleetLoaded = true;
        loadFleetVehicles();
      }
    });
  }

  // Business Rules: lazy load on first sub-tab click
  const rulesTab = document.querySelector('.ro-tab[data-subtarget="admin-rules-view"]');
  if (rulesTab) {
    rulesTab.addEventListener('click', () => {
      if (!businessRulesLoaded) {
        businessRulesLoaded = true;
        loadBusinessRules();
      }
    });
  }

  const guidelinesTab = document.querySelector('.ro-tab[data-subtarget="admin-guidelines-view"]');
  if (guidelinesTab) {
    guidelinesTab.addEventListener('click', () => { loadProgramGuidelines(); });
  }

  // Notifications: lazy load on first sub-tab click
  const notifTab = document.querySelector('.ro-tab[data-subtarget="notif-settings"]');
  if (notifTab) {
    notifTab.addEventListener('click', () => {
      if (!notifPrefsLoaded) {
        notifPrefsLoaded = true;
        loadNotificationPreferences();
      }
    });
  }

  // Data Management: lazy load retention settings on first sub-tab click
  let dataManagementLoaded = false;
  const dataTab = document.querySelector('.ro-tab[data-subtarget="admin-data-view"]');
  if (dataTab) {
    dataTab.addEventListener('click', () => {
      if (!dataManagementLoaded) {
        dataManagementLoaded = true;
        loadRetentionSettings();
      }
    });
  }

  // Fix FullCalendar day header overlap when Staff panel first becomes visible
  document.querySelector('.ro-nav-item[data-target="staff-panel"]')?.addEventListener('click', () => {
    if (shiftCalendar) {
      requestAnimationFrame(() => shiftCalendar.updateSize());
      refreshCalendarSettings();
    }
  });

  initNotificationBell('#notif-bell-btn');

  window._pollIntervals = [
    setInterval(loadRides, 5000),
    setInterval(loadVehicles, 15000),
    setInterval(renderDriverConsole, 1000),
    setInterval(renderSchedule, 5000)
  ];
});
