// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Loading state management
function showLoader(containerId, message = 'Loading...') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="d-flex flex-column align-items-center justify-content-center py-4">
      <div class="spinner-border text-primary mb-2" role="status"></div>
      <p class="text-secondary">${message}</p>
    </div>
  `;
}

function hideLoader(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
}

function fallbackIsDevMode() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

// Status display helpers
function statusLabel(status) {
  const labels = {
    pending: 'Pending', approved: 'Approved', scheduled: 'Scheduled',
    driver_on_the_way: 'On The Way', driver_arrived_grace: 'Driver Arrived',
    completed: 'Completed', no_show: 'No-Show', denied: 'Denied', cancelled: 'Cancelled'
  };
  return labels[status] || status.replace(/_/g, ' ');
}

const STATUS_ICONS = {
  pending: 'clock', approved: 'circle-check', scheduled: 'calendar',
  driver_on_the_way: 'car', driver_arrived_grace: 'map-pin',
  completed: 'circle-check', no_show: 'alert-triangle', denied: 'ban', cancelled: 'x'
};

function statusTag(status) {
  const icon = STATUS_ICONS[status];
  const iconHtml = icon ? `<i class="ti ti-${icon}"></i> ` : '';
  return `<span class="badge badge-${status}">${iconHtml}${statusLabel(status)}</span>`;
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
let selectedDriverId = null;
let adminUsers = [];
let filteredAdminUsers = [];
let selectedAdminUser = null;
let drawerUserId = null;
let rideScheduleAnchor = new Date();
let emailConfigured = false;
let tenantConfig = null;
let historyExpandedGroups = new Set();

async function loadTenantConfig() {
  try {
    const res = await fetch('/api/tenant-config');
    if (res.ok) tenantConfig = await res.json();
  } catch {}
  if (!tenantConfig) return;
  document.title = tenantConfig.orgName + ' Operations Console';
  const brandTitle = document.querySelector('.brand-title');
  if (brandTitle) brandTitle.textContent = tenantConfig.orgShortName + ' Ops';
  const headerTitle = document.getElementById('header-title');
  if (headerTitle) headerTitle.textContent = tenantConfig.orgName + ' Operations Console';
  const headerSub = document.getElementById('header-subtitle');
  if (headerSub) headerSub.textContent = 'Dispatch + Driver tools for ' + tenantConfig.orgTagline;
  const wrappedTitle = document.getElementById('dart-wrapped-title');
  if (wrappedTitle) wrappedTitle.textContent = tenantConfig.orgShortName + ' Wrapped';
  if (typeof window.loadTenantTheme === 'function') window.loadTenantTheme();
}

// ----- Auth -----
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/login'; return false; }
    currentUser = await res.json();
    return true;
  } catch { window.location.href = '/login'; return false; }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// ----- Data Loading -----
async function loadEmployees() {
  try {
    const res = await fetch('/api/employees');
    if (res.ok) employees = await res.json();
  } catch (e) { console.error('Failed to load employees', e); }
  renderEmployees();
  populateShiftFilterSelect();
}

async function loadShifts() {
  try {
    const res = await fetch('/api/shifts');
    if (res.ok) shifts = await res.json();
  } catch (e) { console.error('Failed to load shifts', e); }
  refreshShiftCalendar();
}

async function loadRides() {
  try {
    const res = await fetch('/api/rides');
    if (res.ok) rides = await res.json();
  } catch (e) { console.error('Failed to load rides', e); }
  renderRideLists();
  renderRideScheduleGrid();
  renderDriverConsole();
  refreshShiftCalendar();
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
  filteredAdminUsers = q
    ? adminUsers.filter(u => [u.name, u.username, u.email, u.phone, u.usc_id, u.role]
        .some(f => (f || '').toLowerCase().includes(q)))
    : adminUsers;
  renderAdminUsers(filteredAdminUsers);
  if (countEl) countEl.textContent = q ? `${filteredAdminUsers.length} of ${adminUsers.length} users` : `${adminUsers.length} users`;
}

function renderAdminUsers(users) {
  const tbody = document.querySelector('#admin-users-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="admin-name-primary">${u.name || ''}</div>
        <div class="admin-name-secondary">${u.email || ''}</div>
      </td>
      <td>${u.username || ''}</td>
      <td><span class="badge">${u.role}</span></td>
      <td>${u.usc_id || ''}</td>
      <td>${u.phone || ''}</td>
      <td></td>
      <td><i class="ti ti-chevron-right text-secondary"></i></td>
    `;
    // Insert kebab menu into the 6th cell
    const kebabCell = tr.querySelectorAll('td')[5];
    kebabCell.appendChild(buildAdminKebabMenu(u));
    // Row click opens drawer (skip if kebab clicked)
    tr.onclick = (e) => { if (!e.target.closest('.kebab-menu-wrapper')) openAdminDrawer(u.id); };
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
  editBtn.innerHTML = '<i class="ti ti-edit" style="font-size:16px;"></i> Edit';
  editBtn.onclick = (e) => { e.stopPropagation(); dropdown.classList.remove('open'); openAdminDrawer(user.id, 'edit'); };
  dropdown.appendChild(editBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'edit-option';
  resetBtn.innerHTML = '<i class="ti ti-lock" style="font-size:16px;"></i> Reset Password';
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
  const body = document.getElementById('admin-drawer-body');
  const title = document.getElementById('admin-drawer-title');

  bootstrap.Offcanvas.getOrCreateInstance(drawer).show();
  body.innerHTML = '<div class="d-flex flex-column align-items-center justify-content-center py-4"><div class="spinner-border text-primary mb-2" role="status"></div><p class="text-secondary">Loading...</p></div>';
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
        <div style="margin-top:2px;"><span class="badge">${user.role}</span></div>
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
        ${missCount >= 5 ? '<div class="small-text" style="font-weight:700; color:#c62828;">SERVICE TERMINATED</div>' : ''}
        ${missCount > 0 ? '<button class="btn btn-outline-secondary btn-sm" id="drawer-reset-miss-count" style="margin-left:auto;">Reset</button>' : ''}
      </div>`;
    }

    // Details section (view mode)
    html += `<div class="drawer-section" id="drawer-details-view">
      <div class="drawer-section-title">Details</div>
      <div class="drawer-field"><div class="drawer-field-label">Email</div><div class="drawer-field-value">${user.email || '—'}</div></div>
      <div class="drawer-field"><div class="drawer-field-label">USC ID</div><div class="drawer-field-value">${user.usc_id || '—'}</div></div>
      <div class="drawer-field"><div class="drawer-field-label">Phone</div><div class="drawer-field-value">${user.phone || '—'}</div></div>
      ${user.role === 'driver' ? `<div class="drawer-field"><div class="drawer-field-label">Status</div><div class="drawer-field-value">${user.active ? '<span style="color:#28a745; font-weight:700;">Clocked In</span>' : '<span style="color:#dc3545;">Clocked Out</span>'}</div></div>` : ''}
      <button class="btn btn-outline-secondary btn-sm" id="drawer-edit-toggle" style="margin-top:4px;">Edit</button>
    </div>`;

    // Edit section (hidden)
    html += `<div class="drawer-section" id="drawer-details-edit" style="display:none;">
      <div class="drawer-section-title">Edit Details</div>
      <label>Name<input type="text" id="drawer-edit-name" value="${user.name || ''}"></label>
      <label>Email<input type="email" id="drawer-edit-email" value="${user.email || ''}"></label>
      <label>Phone<input type="tel" id="drawer-edit-phone" value="${user.phone || ''}"></label>
      <label>USC ID<input type="text" id="drawer-edit-uscid" value="${user.usc_id || ''}" maxlength="10"></label>
      <label>Role
        <select id="drawer-edit-role">
          <option value="rider" ${user.role === 'rider' ? 'selected' : ''}>rider</option>
          <option value="driver" ${user.role === 'driver' ? 'selected' : ''}>driver</option>
          <option value="office" ${user.role === 'office' ? 'selected' : ''}>office</option>
        </select>
      </label>
      <div id="drawer-edit-message" class="small-text" style="margin-top:8px;"></div>
      <div class="flex-row" style="gap:8px; margin-top:12px;">
        <button class="btn btn-primary" id="drawer-edit-save">Save</button>
        <button class="btn btn-outline-secondary" id="drawer-edit-cancel">Cancel</button>
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
          <button class="btn btn-outline-secondary btn-sm" id="drawer-pw-copy">Copy</button>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" id="drawer-pw-reset" style="margin-top:8px;">Reset Password</button>
    </div>`;

    // Danger zone
    if (!isSelf) {
      html += `<div class="drawer-section">
        <div class="drawer-danger-zone">
          <div class="drawer-section-title" style="color:#c62828;">Danger Zone</div>
          <p class="small-text" style="margin:0 0 12px 0;">Permanently delete this user and all associated data.</p>
          <button class="btn btn-danger btn-sm" id="drawer-delete-btn">Delete User</button>
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
        uscId: body.querySelector('#drawer-edit-uscid').value.trim(),
        role: body.querySelector('#drawer-edit-role').value
      };
      try {
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) { msg.textContent = result.error || 'Update failed'; msg.style.color = '#c62828'; return; }
        showToast('User updated successfully', 'success');
        await loadAdminUsers();
        openAdminDrawer(userId);
      } catch { msg.textContent = 'Network error'; msg.style.color = '#c62828'; }
    };

    // Wire password reset
    const pwResetBtn = body.querySelector('#drawer-pw-reset');
    if (pwResetBtn) pwResetBtn.onclick = async () => {
      const msg = body.querySelector('#drawer-pw-message');
      const pw = body.querySelector('#drawer-pw-input').value;
      msg.textContent = '';
      msg.style.color = '';
      if (!pw || pw.length < 8) { msg.textContent = 'Password must be at least 8 characters.'; msg.style.color = '#c62828'; return; }
      try {
        const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword: pw })
        });
        const result = await res.json();
        if (!res.ok) { msg.textContent = result.error || 'Reset failed'; msg.style.color = '#c62828'; return; }
        if (result.emailSent) {
          showToast('Password reset. Notification email sent.', 'success');
          msg.textContent = 'Password reset successfully. Email sent.';
          msg.style.color = '#228b22';
        } else {
          msg.textContent = 'Password reset successfully.';
          msg.style.color = '#228b22';
          const resultDiv = body.querySelector('#drawer-pw-result');
          resultDiv.style.display = 'block';
          body.querySelector('#drawer-pw-display').textContent = pw;
          body.querySelector('#drawer-pw-copy').onclick = () => {
            navigator.clipboard.writeText(pw).then(() => showToast('Copied to clipboard', 'success'));
          };
          pwResetBtn.style.display = 'none';
          body.querySelector('#drawer-pw-input').parentElement.style.display = 'none';
        }
      } catch { msg.textContent = 'Network error'; msg.style.color = '#c62828'; }
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
  const offcanvas = bootstrap.Offcanvas.getInstance(drawer);
  if (offcanvas) offcanvas.hide();
  drawerUserId = null;
}

function showEditUserModal(user) {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal modal-blur fade';
  modalEl.tabIndex = -1;
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Edit User: ${user.name || user.username}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3"><label class="form-label">Name</label><input type="text" class="form-control" id="edit-user-name" value="${user.name || ''}"></div>
          <div class="mb-3"><label class="form-label">USC Email</label><input type="email" class="form-control" id="edit-user-email" value="${user.email || ''}"></div>
          <div class="mb-3"><label class="form-label">Phone</label><input type="tel" class="form-control" id="edit-user-phone" value="${user.phone || ''}"></div>
          <div class="mb-3"><label class="form-label">USC ID</label><input type="text" class="form-control" id="edit-user-uscid" value="${user.usc_id || ''}" maxlength="10"></div>
          <div class="mb-3"><label class="form-label">Role</label>
            <select class="form-select" id="edit-user-role">
              <option value="rider" ${user.role === 'rider' ? 'selected' : ''}>rider</option>
              <option value="driver" ${user.role === 'driver' ? 'selected' : ''}>driver</option>
              <option value="office" ${user.role === 'office' ? 'selected' : ''}>office</option>
            </select>
          </div>
          <div id="edit-user-message" class="small-text"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-primary" id="edit-user-save">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
  modalEl.querySelector('#edit-user-save').onclick = async () => {
    const msg = modalEl.querySelector('#edit-user-message');
    msg.textContent = '';
    const body = {
      name: modalEl.querySelector('#edit-user-name').value.trim(),
      email: modalEl.querySelector('#edit-user-email').value.trim(),
      phone: modalEl.querySelector('#edit-user-phone').value.trim(),
      uscId: modalEl.querySelector('#edit-user-uscid').value.trim(),
      role: modalEl.querySelector('#edit-user-role').value
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
        msg.style.color = '#c62828';
        return;
      }
      showToast('User updated successfully', 'success');
      modal.hide();
      await loadAdminUsers();
    } catch {
      msg.textContent = 'Network error';
      msg.style.color = '#c62828';
    }
  };
}

function resetUserPassword(userId, userName) {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal modal-blur fade';
  modalEl.tabIndex = -1;
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Reset Password: ${userName}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <p class="text-secondary">Enter a temporary password. The user will be required to change it on next login.</p>
          <div class="mb-3"><label class="form-label">New Password (min 8 chars)</label><input type="password" class="form-control" id="reset-pw-input"></div>
          <div id="reset-pw-message" class="small-text"></div>
          <div id="reset-pw-result" style="display:none; margin-top:8px;">
            <div class="small-text fw-bold">Temporary password (email not configured):</div>
            <div class="d-flex gap-2 mt-1">
              <code id="reset-pw-display" style="background:#f5f5f5; padding:4px 8px; border-radius:4px; font-size:14px;"></code>
              <button class="btn btn-outline-secondary btn-sm" id="reset-pw-copy">Copy</button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-primary" id="reset-pw-confirm">Reset Password</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
  modalEl.querySelector('#reset-pw-confirm').onclick = async () => {
    const msg = modalEl.querySelector('#reset-pw-message');
    const pw = modalEl.querySelector('#reset-pw-input').value;
    msg.textContent = '';
    msg.style.color = '';
    if (!pw || pw.length < 8) {
      msg.textContent = 'Password must be at least 8 characters.';
      msg.style.color = '#c62828';
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
        msg.style.color = '#c62828';
        return;
      }
      if (data.emailSent) {
        showToast('Password reset. Notification email sent.', 'success');
        modal.hide();
      } else {
        msg.textContent = 'Password reset successfully.';
        msg.style.color = '#228b22';
        const resultDiv = modalEl.querySelector('#reset-pw-result');
        resultDiv.style.display = 'block';
        modalEl.querySelector('#reset-pw-display').textContent = pw;
        modalEl.querySelector('#reset-pw-copy').onclick = () => {
          navigator.clipboard.writeText(pw).then(() => showToast('Copied to clipboard', 'success'));
        };
        modalEl.querySelector('#reset-pw-confirm').style.display = 'none';
        modalEl.querySelector('#reset-pw-input').closest('.mb-3').style.display = 'none';
      }
    } catch {
      msg.textContent = 'Network error';
      msg.style.color = '#c62828';
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


async function createAdminUser() {
  const name = document.getElementById('admin-new-name')?.value.trim();
  const email = document.getElementById('admin-new-email')?.value.trim();
  const phone = document.getElementById('admin-new-phone')?.value.trim();
  const uscId = document.getElementById('admin-new-uscid')?.value.trim();
  const role = document.getElementById('admin-new-role')?.value;
  const password = document.getElementById('admin-new-password')?.value;
  const msg = document.getElementById('admin-create-message');
  if (msg) msg.textContent = '';
  if (!name || !email || !uscId || !role || !password) {
    if (msg) msg.textContent = 'All required fields must be filled.';
    return;
  }
  if (!/^[0-9]{10}$/.test(uscId)) {
    if (msg) msg.textContent = 'USC ID must be 10 digits.';
    return;
  }
  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, uscId, role, password })
    });
    const data = await res.json();
    if (!res.ok) {
      if (msg) msg.textContent = data.error || 'Could not create user';
      return;
    }
    ['admin-new-name','admin-new-email','admin-new-phone','admin-new-uscid','admin-new-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (msg) {
      if (data.emailSent) {
        msg.innerHTML = '<span style="color:#228b22;">User created. Welcome email sent.</span>';
      } else {
        const safeUser = data.username || email.split('@')[0];
        const safePw = password.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const clipText = `Username: ${safeUser}\\nPassword: ${password}`;
        msg.innerHTML = `<span style="color:#228b22;">User created.</span> Share these credentials:<br>
          <div style="background:#f5f5f5; padding:8px 12px; border-radius:6px; margin-top:6px; font-family:monospace; font-size:0.9rem;">
            <strong>Username:</strong> ${safeUser}<br>
            <strong>Password:</strong> ${safePw}
          </div>
          <button class="btn btn-outline-secondary btn-sm" style="margin-top:6px;" onclick="navigator.clipboard.writeText('${clipText}').then(()=>showToast('Credentials copied','success'))">Copy Credentials</button>`;
      }
    }
    await loadAdminUsers();
  } catch {
    if (msg) msg.textContent = 'Network error';
  }
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
    chip.querySelector('.emp-name').onclick = () => openProfileById(emp.id);
    chip.appendChild(actionBtn);
    container.appendChild(chip);
  });
}

async function clockEmployee(id, isIn) {
  await fetch(`/api/employees/${isIn ? 'clock-in' : 'clock-out'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId: id })
  });
  await loadEmployees();
  await loadRides();
}

function populateShiftFilterSelect() {
  const select = document.getElementById('shift-filter-employee');
  if (!select) return;
  const prev = select.value;
  select.innerHTML = '<option value="all">All Drivers</option>';
  employees.forEach((emp) => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = emp.name;
    select.appendChild(opt);
  });
  if (prev) select.value = prev;
}

// ----- Schedule Grid -----
function generateTimeSlots() {
  const slots = [];
  for (let hour = 8; hour < 19; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  slots.push('19:00');
  return slots;
}

function renderRideScheduleGrid() {
  const grid = document.getElementById('ride-schedule-grid');
  if (!grid) return;
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timeSlots = generateTimeSlots();
  const slotMap = {};
  const weekDates = getWeekDates(rideScheduleAnchor);
  const weekStart = new Date(weekDates[0]);
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekDates[4]);
  weekEnd.setHours(23,59,59,999);

  rides.forEach((ride) => {
    if (!ride.requestedTime) return;
    const date = new Date(ride.requestedTime);
    if (isNaN(date.getTime())) return;
    if (date < weekStart || date > weekEnd) return;
    const dayIdx = date.getDay() - 1; // Monday = 0
    if (dayIdx < 0 || dayIdx > 4) return;

    const hour = date.getHours();
    const minute = date.getMinutes();
    if (hour < 8 || hour > 19 || (hour === 19 && minute > 0)) return;
    const { slot, offset } = getSlotInfo(date);
    const key = `${slot}-${dayIdx}`;
    if (!slotMap[key]) slotMap[key] = [];
    slotMap[key].push({ ...ride, offset });
  });

  updateRideWeekLabel();

  if (!Object.keys(slotMap).length) {
    showEmptyState(grid, {
      icon: 'calendar',
      title: 'No rides on the calendar',
      message: 'Approved and scheduled rides will appear here. Try switching to the Active Rides tab to approve pending requests.',
      actionLabel: 'Go to Active Rides',
      actionHandler: () => {
        const activeTab = document.querySelector('#rides-panel .nav-link[data-subtarget="rides-active-view"]');
        if (activeTab) activeTab.click();
      }
    });
    return;
  }

  let html = '<table class="grid-table ride-schedule-table"><thead><tr><th>Time</th>';
  days.forEach((day, idx) => {
    const label = `${day} (${formatShortDate(weekDates[idx])})`;
    html += `<th>${label}</th>`;
  });
  html += '</tr></thead><tbody>';

  timeSlots.forEach((slot) => {
    html += `<tr><td>${slot}</td>`;
    days.forEach((_, dayIdx) => {
      const ridesForCell = slotMap[`${slot}-${dayIdx}`] || [];
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

async function loadUserProfile(userId) {
  const content = document.getElementById('admin-profile-content');
  if (!content) return;
  content.innerHTML = 'Loading...';
  showTab('profile-panel');
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
  const upcomingList = upcoming.slice(0, 5).map(renderProfileRide).join('') || '<p class="small-text">None.</p>';
  const pastList = past.slice(0, 5).map(renderProfileRide).join('') || '<p class="small-text">None.</p>';
  const isSelf = user.id === currentUser.id;
  const passwordSection = isSelf ? `
    <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border); max-width:500px;">
      <h4>Change Password</h4>
      <label>Current Password<input type="password" id="profile-pw-current"></label>
      <label>New Password (min 8 chars)<input type="password" id="profile-pw-new"></label>
      <label>Confirm New Password<input type="password" id="profile-pw-confirm"></label>
      <button class="btn btn-outline-secondary" id="profile-pw-btn">Update Password</button>
      <div id="profile-pw-message" class="small-text" style="margin-top:8px;"></div>
    </div>
  ` : '';
  content.innerHTML = `
    <div class="profile-block">
      <div><strong>${user.name || ''}</strong> (${user.role})</div>
      <div class="small-text">Username: ${user.username || ''}</div>
      <div class="small-text">USC Email: ${user.email || ''}</div>
      <div class="small-text">USC ID: ${user.usc_id || ''}</div>
      <div class="small-text">Phone: ${user.phone || ''}</div>
    </div>
    <div class="flex-row" style="gap:12px; margin:10px 0;">
      <button class="btn btn-primary" onclick="renderProfileEdit()">Edit Name/Phone</button>
    </div>
    ${user.role !== 'office' ? `<div>
      <h4>Upcoming Rides</h4>
      ${upcomingList}
    </div>
    <div>
      <h4>Recent Rides</h4>
      ${pastList}
    </div>` : ''}
    ${passwordSection}
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
      if (!currentPassword || !newPassword || !confirm) { msg.textContent = 'All fields are required.'; msg.style.color = '#c62828'; return; }
      if (newPassword.length < 8) { msg.textContent = 'New password must be at least 8 characters.'; msg.style.color = '#c62828'; return; }
      if (newPassword !== confirm) { msg.textContent = 'Passwords do not match.'; msg.style.color = '#c62828'; return; }
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();
        if (!res.ok) { msg.textContent = data.error || 'Failed to change password'; msg.style.color = '#c62828'; return; }
        msg.textContent = 'Password updated successfully!';
        msg.style.color = '#228b22';
        content.querySelector('#profile-pw-current').value = '';
        content.querySelector('#profile-pw-new').value = '';
        content.querySelector('#profile-pw-confirm').value = '';
      } catch { msg.textContent = 'Connection error'; msg.style.color = '#c62828'; }
    };
  }
}

function renderProfileRide(ride) {
  return `<div class="item">
    <div>${statusTag(ride.status)} ${ride.pickupLocation} → ${ride.dropoffLocation}</div>
    <div class="small-text">${formatDate(ride.requestedTime)}</div>
  </div>`;
}

function renderProfileEdit() {
  if (!selectedAdminUser) return;
  const content = document.getElementById('admin-profile-content');
  content.innerHTML = `
    <div class="profile-block">
      <label>Name <input type="text" id="admin-profile-name" value="${selectedAdminUser.name || ''}"></label>
      <label>Phone <input type="tel" id="admin-profile-phone" value="${selectedAdminUser.phone || ''}"></label>
      <div class="small-text">USC Email: ${selectedAdminUser.email || ''} | Username: ${selectedAdminUser.username}</div>
    </div>
    <div class="flex-row" style="gap:8px; margin-top:8px;">
      <button class="btn btn-primary" onclick="saveAdminProfile('${selectedAdminUser.id}')">Save</button>
      <button class="btn btn-outline-secondary" onclick="loadUserProfile('${selectedAdminUser.id}')">Cancel</button>
    </div>
    <div id="admin-profile-message" class="small-text"></div>
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
// ----- FullCalendar for Staff & Shifts -----
let shiftCalendar = null;
let shiftFilterEmployeeId = 'all';
let showRidesOnCalendar = true;

const DRIVER_COLORS = [
  '#4682B4', '#D2691E', '#2E8B57', '#8B008B', '#B8860B',
  '#4169E1', '#C71585', '#008080', '#CD853F', '#6A5ACD'
];

function driverColor(driverId) {
  let hash = 0;
  for (let i = 0; i < driverId.length; i++) hash = ((hash << 5) - hash + driverId.charCodeAt(i)) | 0;
  return DRIVER_COLORS[Math.abs(hash) % DRIVER_COLORS.length];
}

function shiftsToEvents(viewStart, viewEnd) {
  const events = [];
  const filtered = shiftFilterEmployeeId === 'all'
    ? shifts
    : shifts.filter(s => s.employeeId === shiftFilterEmployeeId);

  const start = new Date(viewStart);
  const end = new Date(viewEnd);

  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const jsDay = d.getDay();
    if (jsDay === 0 || jsDay === 6) continue; // skip weekends
    const ourDay = (jsDay + 6) % 7; // Mon=0

    const dateStr = formatDateInputLocal(d);
    filtered.forEach(shift => {
      if (shift.dayOfWeek !== ourDay) return;
      const emp = employees.find(e => e.id === shift.employeeId);
      const name = emp?.name || 'Unknown';
      // shift.startTime may be "HH:MM" or "HH:MM:SS" from Postgres TIME
      const sTime = shift.startTime.length <= 5 ? shift.startTime + ':00' : shift.startTime;
      const eTime = shift.endTime.length <= 5 ? shift.endTime + ':00' : shift.endTime;
      events.push({
        id: shift.id + '_' + dateStr,
        title: name,
        start: dateStr + 'T' + sTime,
        end: dateStr + 'T' + eTime,
        color: driverColor(shift.employeeId),
        editable: true,
        extendedProps: {
          type: 'shift',
          shiftId: shift.id,
          employeeId: shift.employeeId,
          dayOfWeek: shift.dayOfWeek
        }
      });
    });
  }
  return events;
}

function ridesToEvents(viewStart, viewEnd) {
  if (!showRidesOnCalendar) return [];
  const events = [];
  const start = new Date(viewStart);
  const end = new Date(viewEnd);

  rides.forEach(ride => {
    if (!ride.requestedTime || !isRenderableRideStatus(ride.status)) return;
    const rideDate = new Date(ride.requestedTime);
    if (rideDate < start || rideDate > end) return;

    const endDate = new Date(rideDate.getTime() + 30 * 60 * 1000);
    events.push({
      id: 'ride_' + ride.id,
      title: (ride.riderName || 'Rider') + ' - ' + (ride.pickupLocation || ''),
      start: rideDate.toISOString(),
      end: endDate.toISOString(),
      color: '#cce5ff',
      textColor: '#004085',
      borderColor: '#004085',
      editable: false,
      extendedProps: { type: 'ride', rideId: ride.id }
    });
  });
  return events;
}

function initShiftCalendar() {
  const calendarEl = document.getElementById('shift-calendar');
  if (!calendarEl) return;

  shiftCalendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'timeGridWeek,timeGridDay'
    },
    slotMinTime: '06:00:00',
    slotMaxTime: '22:00:00',
    slotDuration: '00:30:00',
    weekends: false,
    allDaySlot: false,
    nowIndicator: true,
    editable: true,
    selectable: true,
    selectMirror: true,
    height: 'auto',
    events: function(info, successCallback) {
      const all = [
        ...shiftsToEvents(info.start, info.end),
        ...ridesToEvents(info.start, info.end)
      ];
      successCallback(all);
    },
    select: function(info) {
      openAddShiftModal(info);
      shiftCalendar.unselect();
    },
    eventClick: function(info) {
      if (info.event.extendedProps.type === 'shift') {
        openEditShiftModal(info.event);
      }
    },
    eventDrop: function(info) {
      if (info.event.extendedProps.type !== 'shift') { info.revert(); return; }
      handleShiftDragOrResize(info);
    },
    eventResize: function(info) {
      if (info.event.extendedProps.type !== 'shift') { info.revert(); return; }
      handleShiftDragOrResize(info);
    },
    eventDidMount: function(info) {
      if (info.event.extendedProps.type === 'ride') {
        info.el.style.borderStyle = 'dashed';
        info.el.style.opacity = '0.75';
      }
    }
  });

  shiftCalendar.render();
}

function refreshShiftCalendar() {
  if (shiftCalendar) shiftCalendar.refetchEvents();
}

async function handleShiftDragOrResize(info) {
  const event = info.event;
  const shiftId = event.extendedProps.shiftId;
  const newStart = event.start;
  const newEnd = event.end;
  const jsDay = newStart.getDay();

  if (jsDay === 0 || jsDay === 6) { info.revert(); return; }

  const newDayOfWeek = (jsDay + 6) % 7;
  const startTime = String(newStart.getHours()).padStart(2, '0') + ':' + String(newStart.getMinutes()).padStart(2, '0');
  const endTime = String(newEnd.getHours()).padStart(2, '0') + ':' + String(newEnd.getMinutes()).padStart(2, '0');

  try {
    const res = await fetch(`/api/shifts/${shiftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayOfWeek: newDayOfWeek, startTime, endTime })
    });
    if (!res.ok) {
      info.revert();
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Failed to update shift', 'error');
      return;
    }
    await loadShifts();
  } catch {
    info.revert();
    showToast('Failed to update shift', 'error');
  }
}

function openAddShiftModal(selectionInfo) {
  const jsDay = selectionInfo.start.getDay();
  const ourDay = (jsDay + 6) % 7;
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const startTime = String(selectionInfo.start.getHours()).padStart(2, '0') + ':' + String(selectionInfo.start.getMinutes()).padStart(2, '0');
  const endTime = String(selectionInfo.end.getHours()).padStart(2, '0') + ':' + String(selectionInfo.end.getMinutes()).padStart(2, '0');

  const empOptions = employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

  const modal = document.createElement('div');
  modal.className = 'modal modal-blur fade show';
  modal.style.display = 'block';
  modal.style.background = 'rgba(0,0,0,0.4)';
  modal.innerHTML = `
    <div class="modal-dialog modal-sm modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Add Shift</h5>
          <button type="button" class="btn-close" data-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Driver</label>
            <select class="form-select" id="modal-shift-employee">${empOptions}</select>
          </div>
          <div class="mb-3">
            <label class="form-label">Day</label>
            <input class="form-control" value="${dayNames[ourDay] || 'Unknown'}" readonly>
          </div>
          <div class="mb-3">
            <label class="form-label">Start Time</label>
            <input type="time" class="form-control" id="modal-shift-start" value="${startTime}">
          </div>
          <div class="mb-3">
            <label class="form-label">End Time</label>
            <input type="time" class="form-control" id="modal-shift-end" value="${endTime}">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" data-dismiss="modal">Cancel</button>
          <button class="btn btn-primary" id="modal-shift-save">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelectorAll('[data-dismiss="modal"]').forEach(el => el.addEventListener('click', close));
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  document.getElementById('modal-shift-save').addEventListener('click', async () => {
    const employeeId = document.getElementById('modal-shift-employee').value;
    const start = document.getElementById('modal-shift-start').value;
    const end = document.getElementById('modal-shift-end').value;
    if (!employeeId || !start || !end) return;

    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, dayOfWeek: ourDay, startTime: start, endTime: end })
      });
      if (res.ok) {
        await loadShifts();
        showToast('Shift created');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to create shift', 'error');
      }
    } catch {
      showToast('Failed to create shift', 'error');
    }
    close();
  });
}

function openEditShiftModal(fcEvent) {
  const props = fcEvent.extendedProps;
  const shiftId = props.shiftId;
  const shift = shifts.find(s => s.id === shiftId);
  if (!shift) return;

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const empOptions = employees.map(e =>
    `<option value="${e.id}" ${e.id === shift.employeeId ? 'selected' : ''}>${e.name}</option>`
  ).join('');

  const modal = document.createElement('div');
  modal.className = 'modal modal-blur fade show';
  modal.style.display = 'block';
  modal.style.background = 'rgba(0,0,0,0.4)';
  modal.innerHTML = `
    <div class="modal-dialog modal-sm modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Edit Shift</h5>
          <button type="button" class="btn-close" data-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Driver</label>
            <select class="form-select" id="modal-edit-employee">${empOptions}</select>
          </div>
          <div class="mb-3">
            <label class="form-label">Day</label>
            <input class="form-control" value="${dayNames[shift.dayOfWeek] || 'Unknown'}" readonly>
          </div>
          <div class="mb-3">
            <label class="form-label">Start Time</label>
            <input type="time" class="form-control" id="modal-edit-start" value="${shift.startTime}">
          </div>
          <div class="mb-3">
            <label class="form-label">End Time</label>
            <input type="time" class="form-control" id="modal-edit-end" value="${shift.endTime}">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger" id="modal-edit-delete">Delete</button>
          <button class="btn" data-dismiss="modal">Cancel</button>
          <button class="btn btn-primary" id="modal-edit-save">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelectorAll('[data-dismiss="modal"]').forEach(el => el.addEventListener('click', close));
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  document.getElementById('modal-edit-save').addEventListener('click', async () => {
    const employeeId = document.getElementById('modal-edit-employee').value;
    const startTime = document.getElementById('modal-edit-start').value;
    const endTime = document.getElementById('modal-edit-end').value;
    if (!employeeId || !startTime || !endTime) return;

    try {
      const res = await fetch(`/api/shifts/${shiftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, startTime, endTime })
      });
      if (res.ok) {
        await loadShifts();
        showToast('Shift updated');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to update shift', 'error');
      }
    } catch {
      showToast('Failed to update shift', 'error');
    }
    close();
  });

  document.getElementById('modal-edit-delete').addEventListener('click', async () => {
    if (!confirm('Delete this shift?')) return;
    try {
      const res = await fetch(`/api/shifts/${shiftId}`, { method: 'DELETE' });
      if (res.ok) {
        await loadShifts();
        showToast('Shift deleted');
      } else {
        showToast('Failed to delete shift', 'error');
      }
    } catch {
      showToast('Failed to delete shift', 'error');
    }
    close();
  });
}

// ----- Ride Filter -----
let rideFilterText = '';
let historyFilterText = '';

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
  btn.className = 'btn btn-danger';
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
  editBtn.innerHTML = '<i class="ti ti-edit" style="font-size:16px;"></i> Edit';
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
  // Fetch locations for dropdowns
  let locations = [];
  try {
    const locRes = await fetch('/api/locations');
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

  const modalEl = document.createElement('div');
  modalEl.className = 'modal modal-blur fade';
  modalEl.tabIndex = -1;
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Edit Ride</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3"><label class="form-label">Pickup Location</label><select class="form-select" id="edit-ride-pickup">${buildOptions(ride.pickupLocation)}</select></div>
          <div class="mb-3"><label class="form-label">Dropoff Location</label><select class="form-select" id="edit-ride-dropoff">${buildOptions(ride.dropoffLocation)}</select></div>
          <div class="mb-3"><label class="form-label">Requested Time</label><input type="datetime-local" class="form-control" id="edit-ride-time" value="${currentTime}"></div>
          <div class="mb-3"><label class="form-label">Rider Notes</label><textarea class="form-control" id="edit-ride-notes" rows="2">${ride.notes || ''}</textarea></div>
          <hr>
          <div class="mb-3"><label class="form-label">Change Notes <span class="text-danger">*</span></label><textarea class="form-control" id="edit-ride-change-notes" rows="2" placeholder="Describe what changed and why..."></textarea></div>
          <div class="mb-3"><label class="form-label">Initials <span class="text-danger">*</span></label><input type="text" class="form-control" id="edit-ride-initials" maxlength="5" placeholder="Your initials" style="max-width:120px;"></div>
          <div id="edit-ride-message" class="small-text"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-primary" id="edit-ride-save">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());

  modalEl.querySelector('#edit-ride-save').onclick = async () => {
    const msg = modalEl.querySelector('#edit-ride-message');
    msg.textContent = '';
    const changeNotes = modalEl.querySelector('#edit-ride-change-notes').value.trim();
    const initials = modalEl.querySelector('#edit-ride-initials').value.trim();
    if (!changeNotes) { msg.textContent = 'Change notes are required'; msg.style.color = '#c62828'; return; }
    if (!initials) { msg.textContent = 'Initials are required'; msg.style.color = '#c62828'; return; }

    const body = {
      pickupLocation: modalEl.querySelector('#edit-ride-pickup').value,
      dropoffLocation: modalEl.querySelector('#edit-ride-dropoff').value,
      requestedTime: modalEl.querySelector('#edit-ride-time').value ? new Date(modalEl.querySelector('#edit-ride-time').value).toISOString() : ride.requestedTime,
      notes: modalEl.querySelector('#edit-ride-notes').value,
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
        msg.style.color = '#c62828';
        return;
      }
      showToast('Ride updated successfully', 'success');
      modal.hide();
      if (onDone) await onDone();
    } catch {
      msg.textContent = 'Network error';
      msg.style.color = '#c62828';
    }
  };
}

function buildUnassignButton(ride, driverName, onDone) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-outline-secondary';
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
    const availableVehicles = vehicles.filter(v => v.status === 'available');
    const vehOpts = availableVehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    const modalEl = document.createElement('div');
    modalEl.className = 'modal modal-blur fade';
    modalEl.tabIndex = -1;
    modalEl.innerHTML = `
      <div class="modal-dialog modal-sm modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Select Vehicle</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="text-secondary">A vehicle must be recorded for this ride. Please select one:</p>
            <select class="form-select" id="vehicle-prompt-select">
              <option value="">Choose a cart...</option>${vehOpts}
            </select>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost-secondary" data-bs-dismiss="modal" id="vehicle-prompt-cancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="vehicle-prompt-confirm">Confirm</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
    const modal = new bootstrap.Modal(modalEl);
    let resolved = false;
    const cleanup = (val) => { if (resolved) return; resolved = true; modal.hide(); resolve(val); };
    modalEl.addEventListener('hidden.bs.modal', () => { if (!resolved) { resolved = true; resolve(null); } modalEl.remove(); });
    modalEl.querySelector('#vehicle-prompt-confirm').onclick = () => {
      const val = modalEl.querySelector('#vehicle-prompt-select').value;
      if (!val) { showToast('Please select a vehicle', 'warning'); return; }
      cleanup(val);
    };
    modal.show();
  });
}

// ----- History Helpers -----
function historyGroupKey(ride) {
  return `${ride.riderEmail || ride.riderName}|${ride.pickupLocation}|${ride.dropoffLocation}|${ride.status}`;
}
function formatHistoryDateHeader(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function getDateKey(dateStr) {
  if (!dateStr) return 'unknown';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function buildHistoryItem(ride) {
  const item = document.createElement('div');
  item.className = 'item';
  const cancelledByOffice = ride.status === 'cancelled' && ride.cancelledBy === 'office';
  item.innerHTML = `
    <div>${statusTag(ride.status)}${cancelledByOffice ? ' <span class="small-text">(cancelled by office)</span>' : ''} <span data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="clickable-name">${ride.riderName}</span></div>
    <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
    <div class="small-text">When: ${formatDate(ride.requestedTime)}</div>
    <div class="small-text">Misses: ${ride.consecutiveMisses || 0}</div>
    ${ride.vehicleId ? `<div class="small-text">Cart: ${vehicles.find(v => v.id === ride.vehicleId)?.name || ride.vehicleId}</div>` : ''}
  `;
  item.appendChild(buildKebabMenu(ride, () => loadRides()));
  return item;
}

// ----- Ride Lists -----
function renderRideLists() {
  const unassignedEl = document.getElementById('unassigned-items');
  const pendingEl = document.getElementById('pending-items');
  const approvedEl = document.getElementById('approved-items');
  const historyEl = document.getElementById('history-items');
  unassignedEl.innerHTML = '';
  pendingEl.innerHTML = '';
  approvedEl.innerHTML = '';
  historyEl.innerHTML = '';

  // Unassigned rides: approved, no driver, today only
  const today = getTodayLocalDate();
  const unassignedAll = rides.filter((r) => r.status === 'approved' && !r.assignedDriverId && r.requestedTime?.startsWith(today));
  const unassigned = unassignedAll.filter((r) => rideMatchesFilter(r, rideFilterText));
  unassigned.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item ride-needs-action';
    item.innerHTML = `
      <div><span data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="clickable-name">${ride.riderName}</span></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">Time: ${formatDate(ride.requestedTime)}</div>
      <div class="ride-hint">Needs driver assignment</div>
    `;
    const actionRow = document.createElement('div');
    actionRow.className = 'ride-actions-compact';
    actionRow.appendChild(buildAssignDropdown(ride, () => loadRides()));
    item.appendChild(actionRow);
    unassignedEl.appendChild(item);
  });
  document.getElementById('unassigned-list').style.display = unassigned.length ? '' : 'none';

  const pendingAll = rides.filter((r) => r.status === 'pending');
  const pending = pendingAll.filter((r) => rideMatchesFilter(r, rideFilterText));
  const approvedAll = rides.filter((r) => ['approved', 'scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(r.status));
  const approved = approvedAll.filter((r) => rideMatchesFilter(r, rideFilterText));
  const historyAll = rides.filter((r) => ['completed', 'no_show', 'denied', 'cancelled'].includes(r.status));
  const history = historyAll.filter((r) => rideMatchesFilter(r, historyFilterText));

  pending.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item';
    const terminated = ride.consecutiveMisses >= 5;
    item.innerHTML = `
      <div><span class="badge badge-pending"><i class="ti ti-clock"></i> Pending</span> <span data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="clickable-name">${ride.riderName}</span> (${ride.riderEmail})</div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">Requested: ${formatDate(ride.requestedTime)}</div>
      ${terminated ? '<div class="alert alert-danger">SERVICE TERMINATED after five consecutive no-shows.</div>' : ''}
      <div class="d-flex gap-2">
        <button class="btn btn-success" ${terminated ? 'disabled' : ''}>Approve</button>
        <button class="btn btn-danger" data-role="deny">Deny</button>
      </div>
    `;
    item.querySelector('.btn.btn-success').onclick = () => updateRide(`/api/rides/${ride.id}/approve`);
    item.querySelector('[data-role="deny"]').onclick = () => updateRide(`/api/rides/${ride.id}/deny`);
    item.appendChild(buildKebabMenu(ride, () => loadRides()));
    pendingEl.appendChild(item);
  });
  document.getElementById('pending-list').style.display = pending.length ? '' : 'none';

  approved.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item';
    if (ride.status === 'approved' && !ride.assignedDriverId) {
      item.classList.add('ride-needs-action');
    } else if (ride.status === 'scheduled') {
      item.classList.add('ride-assigned');
    } else if (ride.status === 'driver_on_the_way' || ride.status === 'driver_arrived_grace') {
      item.classList.add('ride-in-transit');
    }
    const driverName = employees.find((e) => e.id === ride.assignedDriverId)?.name || 'Unassigned';
    const rideVehicleName = ride.vehicleId ? (vehicles.find(v => v.id === ride.vehicleId)?.name) : null;
    const driverDisplay = ride.assignedDriverId ? `<span class="ride-driver-prominent clickable-name" data-user="${ride.assignedDriverId}">${driverName}</span>` : driverName;
    item.innerHTML = `
      <div>${statusTag(ride.status)} <span data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="clickable-name">${ride.riderName}</span></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text ride-meta">When: ${formatDate(ride.requestedTime)} · Driver: ${driverDisplay}${rideVehicleName ? ` · Cart: ${rideVehicleName}` : ''}</div>
      ${ride.status === 'approved' && !ride.assignedDriverId ? '<div class="ride-hint">Needs driver assignment</div>' : ''}
    `;
    const contactSpan = document.createElement('span');
    contactSpan.className = 'contact-inline';
    contactSpan.append(
      buildContactPill('tel', ride.riderPhone, '☎', 'Call'),
      buildContactPill('sms', ride.riderPhone, '✉', 'Text')
    );
    item.querySelector('.ride-meta').appendChild(contactSpan);

    // Office quick actions
    if (!ride.assignedDriverId) {
      const assignRow = document.createElement('div');
      assignRow.className = 'ride-actions-compact';
      assignRow.appendChild(buildAssignDropdown(ride, () => loadRides()));
      item.appendChild(assignRow);
    } else if (['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(ride.status)) {
      if (['driver_on_the_way', 'driver_arrived_grace'].includes(ride.status)) {
        item.appendChild(buildWarningBanner(driverName));
      }
      const actionRow = document.createElement('div');
      actionRow.className = 'ride-actions-compact';
      const unassignBtn = buildUnassignButton(ride, driverName, () => loadRides());
      unassignBtn.classList.add('small');
      actionRow.appendChild(unassignBtn);
      actionRow.appendChild(buildReassignDropdown(ride, ride.assignedDriverId, () => loadRides()));
      item.appendChild(actionRow);
    }

    item.appendChild(buildKebabMenu(ride, () => loadRides()));
    approvedEl.appendChild(item);
  });
  document.getElementById('approved-list').style.display = (rideFilterText && !approved.length) ? 'none' : '';
  if (!approved.length && !rideFilterText) {
    showEmptyState(approvedEl, {
      icon: 'inbox',
      title: 'No approved or scheduled rides',
      message: 'Approved rides in progress will show in this section.'
    });
  }

  // Sort history by requestedTime descending
  const sortedHistory = [...history].sort((a, b) => {
    const da = a.requestedTime ? new Date(a.requestedTime).getTime() : 0;
    const db = b.requestedTime ? new Date(b.requestedTime).getTime() : 0;
    return db - da;
  });

  // Group by date
  const dateGroups = new Map();
  sortedHistory.forEach((ride) => {
    const dk = getDateKey(ride.requestedTime);
    if (!dateGroups.has(dk)) {
      dateGroups.set(dk, { label: formatHistoryDateHeader(ride.requestedTime), rides: [] });
    }
    dateGroups.get(dk).rides.push(ride);
  });

  dateGroups.forEach((group, dateKey) => {
    const dateHeader = document.createElement('div');
    dateHeader.className = 'history-date-header';
    dateHeader.textContent = group.label;
    historyEl.appendChild(dateHeader);

    // Detect consecutive runs of same groupKey
    const ridesInDay = group.rides;
    let i = 0;
    while (i < ridesInDay.length) {
      const currentKey = historyGroupKey(ridesInDay[i]);
      let runEnd = i + 1;
      while (runEnd < ridesInDay.length && historyGroupKey(ridesInDay[runEnd]) === currentKey) {
        runEnd++;
      }
      const runLength = runEnd - i;

      if (runLength === 1) {
        historyEl.appendChild(buildHistoryItem(ridesInDay[i]));
      } else {
        // Collapsed group
        const groupId = `${dateKey}|${currentKey}`;
        const isExpanded = historyExpandedGroups.has(groupId);
        const firstRide = ridesInDay[i];
        const summary = document.createElement('div');
        summary.className = 'history-group-summary';
        summary.innerHTML = `
          ${statusTag(firstRide.status)}
          <strong>${firstRide.riderName}</strong>
          <span class="small-text">${firstRide.pickupLocation} → ${firstRide.dropoffLocation}</span>
          <span class="history-group-count">${runLength}</span>
          <button class="history-group-toggle">${isExpanded ? 'Hide' : 'Show all'}</button>
        `;

        const container = document.createElement('div');
        container.className = 'history-group-rides' + (isExpanded ? ' expanded' : '');
        for (let j = i; j < runEnd; j++) {
          container.appendChild(buildHistoryItem(ridesInDay[j]));
        }

        summary.querySelector('.history-group-toggle').onclick = () => {
          const nowExpanded = container.classList.toggle('expanded');
          summary.querySelector('.history-group-toggle').textContent = nowExpanded ? 'Hide' : 'Show all';
          if (nowExpanded) {
            historyExpandedGroups.add(groupId);
          } else {
            historyExpandedGroups.delete(groupId);
          }
        };

        historyEl.appendChild(summary);
        historyEl.appendChild(container);
      }

      i = runEnd;
    }
  });

  document.getElementById('history-list').style.display = (historyFilterText && !history.length) ? 'none' : '';
  if (!history.length && !historyFilterText) {
    showEmptyState(historyEl, {
      icon: 'inbox',
      title: 'No completed history yet',
      message: 'Completed and no-show rides will appear here after dispatch activity.'
    });
  }

  // Update filter match count
  const countEl = document.getElementById('ride-filter-count');
  if (countEl) {
    const totalShown = unassigned.length + pending.length + approved.length;
    countEl.textContent = rideFilterText ? `${totalShown} match${totalShown !== 1 ? 'es' : ''}` : '';
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

// ----- Dispatch & Monitoring (Driver Dashboard) -----
function renderDriverConsole() {
  renderDispatchSummary();
  renderDriverDashboard();
  renderDriverDetail();
  renderAllActiveRides();
}

function renderDispatchSummary() {
  const today = getTodayLocalDate();
  const activeDrivers = employees.filter(e => e.active).length;
  const activeRides = rides.filter(r => ['scheduled','driver_on_the_way','driver_arrived_grace'].includes(r.status) && r.requestedTime?.startsWith(today)).length;
  const pendingRides = rides.filter(r => r.status === 'approved' && !r.assignedDriverId && r.requestedTime?.startsWith(today)).length;
  const completedToday = rides.filter(r => r.status === 'completed' && r.requestedTime?.startsWith(today)).length;
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('dispatch-active-drivers', activeDrivers);
  el('dispatch-active-rides', activeRides);
  el('dispatch-pending-rides', pendingRides);
  el('dispatch-completed-today', completedToday);
}

function renderDriverDashboard() {
  const dashboard = document.getElementById('driver-dashboard');
  if (!dashboard) return;
  dashboard.innerHTML = '';
  const today = getTodayLocalDate();

  employees.forEach((emp) => {
    const card = document.createElement('div');
    card.className = 'driver-card' + (emp.id === selectedDriverId ? ' selected' : '');

    const todayRides = rides.filter((r) => r.assignedDriverId === emp.id && r.requestedTime?.startsWith(today)
      && !['denied', 'cancelled'].includes(r.status));
    const rideCount = todayRides.length;

    // Find active ride
    const activeRide = todayRides.find((r) => ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(r.status));
    let currentStatus = '';
    if (activeRide) {
      const statusLabels = {
        scheduled: 'Scheduled',
        driver_on_the_way: 'On the way to',
        driver_arrived_grace: 'Waiting at'
      };
      const dest = activeRide.status === 'driver_on_the_way' ? activeRide.dropoffLocation : activeRide.pickupLocation;
      currentStatus = `Currently: ${statusLabels[activeRide.status]} ${dest}`;
      if (activeRide.status === 'driver_arrived_grace' && activeRide.graceStartTime) {
        const elapsed = (Date.now() - new Date(activeRide.graceStartTime).getTime()) / 1000;
        const remaining = Math.max(0, 300 - elapsed);
        const minutes = Math.floor(remaining / 60);
        const seconds = Math.floor(remaining % 60).toString().padStart(2, '0');
        currentStatus += ` (${minutes}:${seconds} remaining)`;
      }
    }

    card.innerHTML = `
      <span class="driver-status-dot ${emp.active ? 'active' : 'inactive'}"></span>
      <span class="driver-card-name clickable-name" data-user="${emp.id}">${emp.name}</span>
      <span class="driver-card-info">${emp.active ? 'Clocked In' : 'Clocked Out'} &mdash; ${rideCount} ${rideCount === 1 ? 'ride' : 'rides'} today${currentStatus ? ' &mdash; ' + currentStatus : ''}</span>
    `;
    card.onclick = () => {
      selectedDriverId = emp.id;
      renderDriverDashboard();
      renderDriverDetail();
      const detail = document.getElementById('driver-detail');
      if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    dashboard.appendChild(card);
  });

  if (!employees.length) {
    showEmptyState(dashboard, {
      icon: 'inbox',
      title: 'No drivers registered',
      message: 'Add drivers in Admin Settings to see them here.'
    });
  }
}

function renderDriverDetail() {
  const detail = document.getElementById('driver-detail');
  const title = document.getElementById('driver-detail-title');
  const list = document.getElementById('driver-ride-list');
  const clockBtn = document.getElementById('admin-clock-toggle');
  if (!detail || !list) return;

  const driver = employees.find((e) => e.id === selectedDriverId);
  if (!driver) {
    detail.style.display = 'none';
    return;
  }
  detail.style.display = 'block';
  title.textContent = `Driver: ${driver.name}`;
  clockBtn.textContent = driver.active ? 'Clock Out' : 'Clock In';
  clockBtn.className = driver.active ? 'btn btn-outline-secondary btn-sm' : 'btn btn-primary btn-sm';
  clockBtn.onclick = () => adminClockToggle(driver);

  list.innerHTML = '';
  const today = getTodayLocalDate();

  // Show claimable rides (approved, unassigned, today) if driver is active
  if (driver.active) {
    const claimable = rides.filter((r) => r.status === 'approved' && !r.assignedDriverId && r.requestedTime?.startsWith(today));
    if (claimable.length) {
      const claimSection = document.createElement('div');
      claimSection.innerHTML = '<h4>Available to Claim</h4>';
      claimable.forEach((ride) => {
        const item = document.createElement('div');
        item.className = 'item';
        item.innerHTML = `
          <div><span data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="clickable-name">${ride.riderName}</span></div>
          <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
          <div class="small-text">Time: ${formatDate(ride.requestedTime)}</div>
        `;
        const claimBtn = document.createElement('button');
        claimBtn.className = 'btn btn-primary';
        claimBtn.textContent = 'Claim Ride';
        claimBtn.onclick = () => claimRide(ride.id, driver.id);
        item.appendChild(claimBtn);
        claimSection.appendChild(item);
      });
      list.appendChild(claimSection);
    }
  }

  const driverRides = rides.filter((r) => r.assignedDriverId === driver.id && r.requestedTime?.startsWith(today));
  if (!driverRides.length && !(driver.active && rides.some((r) => r.status === 'approved' && !r.assignedDriverId && r.requestedTime?.startsWith(today)))) {
    showEmptyState(list, {
      icon: 'inbox',
      title: 'No rides for today',
      message: 'This driver has no assigned or claimable rides right now.'
    });
    return;
  }

  driverRides.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item';
    const graceInfo = buildGraceInfo(ride);

    // Admin warning banner — only for active in-progress statuses
    if (['driver_on_the_way', 'driver_arrived_grace'].includes(ride.status)) {
      item.appendChild(buildWarningBanner(driver.name));
    }

    const vehicleName = ride.vehicleId ? (vehicles.find(v => v.id === ride.vehicleId)?.name || 'Unknown') : null;
    const rideInfo = document.createElement('div');
    rideInfo.innerHTML = `
      <div>${statusTag(ride.status)} <span data-user="${ride.riderId || ''}" class="clickable-name">${ride.riderName}</span></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      ${ride.notes ? `<div class="small-text">Notes: ${ride.notes}</div>` : ''}
      <div class="small-text">Time: ${formatDate(ride.requestedTime)}</div>
      <div class="small-text">Rider misses: ${ride.consecutiveMisses || 0}</div>
      ${vehicleName ? `<div class="small-text">Cart: <strong>${vehicleName}</strong></div>` : '<div class="small-text" style="color:#856404;">No vehicle assigned</div>'}
    `;
    item.appendChild(rideInfo);

    const contactRow = document.createElement('div');
    contactRow.className = 'contact-row';
    contactRow.append(
      buildContactPill('tel', ride.riderPhone, '☎', 'Call'),
      buildContactPill('sms', ride.riderPhone, '✉', 'SMS')
    );
    item.appendChild(contactRow);

    // Vehicle selector for active rides
    if (['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(ride.status)) {
      const vehRow = document.createElement('div');
      vehRow.style.cssText = 'margin-top:4px;margin-bottom:4px;';
      const vehSelect = document.createElement('select');
      vehSelect.style.cssText = 'width:100%;padding:0.4rem;border:1px solid #ddd;border-radius:4px;font-size:0.85rem;';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = ride.vehicleId ? 'Change cart...' : 'Select cart...';
      vehSelect.appendChild(defaultOpt);
      vehicles.filter(v => v.status === 'available').forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        if (v.id === ride.vehicleId) opt.selected = true;
        vehSelect.appendChild(opt);
      });
      vehSelect.onchange = async () => {
        if (!vehSelect.value) return;
        const ok = await updateRide(`/api/rides/${ride.id}/set-vehicle`, { vehicleId: vehSelect.value });
        if (ok) showToast('Vehicle updated', 'success');
      };
      vehRow.appendChild(vehSelect);
      item.appendChild(vehRow);
    }

    if (graceInfo.message) {
      const message = document.createElement('div');
      message.className = 'small-text';
      message.textContent = graceInfo.message;
      item.appendChild(message);
    }

    // Driver action buttons
    const actionable = ['scheduled','driver_on_the_way','driver_arrived_grace'];
    if (actionable.includes(ride.status)) {
      const driverLabel = document.createElement('div');
      driverLabel.className = 'small-text';
      driverLabel.style.cssText = 'margin-top:8px;margin-bottom:4px;font-weight:700;';
      driverLabel.textContent = 'Driver Actions';
      item.appendChild(driverLabel);

      const actions = document.createElement('div');
      actions.className = 'flex-row';
      actions.style.flexWrap = 'wrap';

      const onWayBtn = document.createElement('button');
      onWayBtn.className = 'btn btn-primary';
      onWayBtn.textContent = 'On My Way';
      onWayBtn.onclick = async () => {
        if (!ride.vehicleId) {
          const vehSelect = item.querySelector('select');
          const selectedVehicle = vehSelect?.value;
          if (selectedVehicle) {
            await updateRide(`/api/rides/${ride.id}/on-the-way`, { vehicleId: selectedVehicle });
          } else {
            showToast('Please select a vehicle before starting this ride', 'warning');
          }
          return;
        }
        await updateRide(`/api/rides/${ride.id}/on-the-way`);
      };
      actions.appendChild(onWayBtn);

      const hereBtn = document.createElement('button');
      hereBtn.className = 'btn btn-outline-secondary';
      hereBtn.textContent = "I'm Here";
      hereBtn.onclick = () => updateRide(`/api/rides/${ride.id}/here`);
      actions.appendChild(hereBtn);

      const completeBtn = document.createElement('button');
      completeBtn.className = 'btn btn-primary';
      completeBtn.textContent = 'Complete';
      completeBtn.onclick = async () => {
        if (!ride.vehicleId) {
          const vehicleId = await showVehiclePromptModal();
          if (!vehicleId) return;
          const confirmed = await showConfirmModal({
            title: 'Complete Ride',
            message: 'Mark this ride as completed?',
            confirmLabel: 'Complete',
            cancelLabel: 'Keep Open',
            type: 'warning'
          });
          if (confirmed) await updateRide(`/api/rides/${ride.id}/complete`, { vehicleId });
          return;
        }
        const confirmed = await showConfirmModal({
          title: 'Complete Ride',
          message: 'Mark this ride as completed?',
          confirmLabel: 'Complete',
          cancelLabel: 'Keep Open',
          type: 'warning'
        });
        if (confirmed) await updateRide(`/api/rides/${ride.id}/complete`);
      };
      actions.appendChild(completeBtn);

      const noShowBtn = document.createElement('button');
      noShowBtn.className = 'btn btn-danger';
      noShowBtn.textContent = 'No-Show';
      const { canNoShow } = graceInfo;
      noShowBtn.disabled = !canNoShow;
      noShowBtn.onclick = async () => {
        const confirmed = await showConfirmModal({
          title: 'Confirm No-Show',
          message: 'Mark this rider as a no-show? This increases their no-show count.',
          confirmLabel: 'Mark No-Show',
          cancelLabel: 'Go Back',
          type: 'danger'
        });
        if (confirmed) await updateRide(`/api/rides/${ride.id}/no-show`);
      };
      actions.appendChild(noShowBtn);
      item.appendChild(actions);
    }

    // Office override buttons
    const hasOverrides = actionable.includes(ride.status) || !['completed', 'no_show', 'cancelled', 'denied'].includes(ride.status);
    if (hasOverrides) {
      const officeLabel = document.createElement('div');
      officeLabel.className = 'small-text';
      officeLabel.style.cssText = 'margin-top:12px;margin-bottom:4px;font-weight:700;color:var(--cardinal);';
      officeLabel.textContent = 'Office Overrides';
      item.appendChild(officeLabel);

      const adminActions = document.createElement('div');
      adminActions.className = 'flex-row';
      adminActions.style.flexWrap = 'wrap';

      if (actionable.includes(ride.status)) {
        adminActions.appendChild(buildUnassignButton(ride, driver.name, () => loadRides()));
        adminActions.appendChild(buildReassignDropdown(ride, driver.id, () => loadRides()));
      }
      item.appendChild(adminActions);
    }
    item.appendChild(buildKebabMenu(ride, () => loadRides()));
    list.appendChild(item);
  });
}

async function adminClockToggle(driver) {
  if (driver.active) {
    const today = getTodayLocalDate();
    const activeRideCount = rides.filter((r) => r.assignedDriverId === driver.id
      && ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(r.status)
      && r.requestedTime?.startsWith(today)).length;
    let message = `Clock out ${driver.name}?`;
    if (activeRideCount > 0) {
      message = `${driver.name} has ${activeRideCount} active ride${activeRideCount === 1 ? '' : 's'} assigned. Clocking out will NOT unassign those rides, but the driver won't be able to claim new ones. Continue?`;
    }
    const confirmed = await showConfirmModal({
      title: 'Clock Out Driver',
      message,
      confirmLabel: 'Clock Out',
      cancelLabel: 'Cancel',
      type: 'warning'
    });
    if (!confirmed) return;
  }
  await clockEmployee(driver.id, !driver.active);
}

function renderAllActiveRides() {
  const list = document.getElementById('all-active-rides-list');
  if (!list) return;
  const today = getTodayLocalDate();
  const activeStatuses = ['pending', 'approved', 'scheduled', 'driver_on_the_way', 'driver_arrived_grace'];
  const activeRides = rides.filter((r) => activeStatuses.includes(r.status) && r.requestedTime?.startsWith(today));

  // Update count in header
  const countEl = document.getElementById('active-rides-count');
  if (countEl) countEl.textContent = activeRides.length ? `(${activeRides.length})` : '';

  if (!activeRides.length) {
    showEmptyState(list, {
      icon: 'inbox',
      title: 'No active rides today',
      message: 'Active rides across all drivers will appear here.'
    });
    return;
  }

  // Sort by urgency — soonest requested time first
  activeRides.sort((a, b) => new Date(a.requestedTime) - new Date(b.requestedTime));

  list.innerHTML = '';
  activeRides.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item';
    const driverName = ride.assignedDriverId
      ? (employees.find((e) => e.id === ride.assignedDriverId)?.name || 'Unknown')
      : 'Unassigned';
    const driverClickable = ride.assignedDriverId ? `<span class="clickable-name" data-user="${ride.assignedDriverId}">${driverName}</span>` : driverName;
    item.innerHTML = `
      <div>
        ${statusTag(ride.status)}
        <span data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="clickable-name">${ride.riderName}</span>
      </div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">Time: ${formatDate(ride.requestedTime)} | Driver: ${driverClickable}</div>
    `;
    if (ride.assignedDriverId) {
      const viewLink = document.createElement('span');
      viewLink.className = 'small-text';
      viewLink.style.cssText = 'font-weight:700; color:var(--cardinal); cursor:pointer;';
      viewLink.textContent = 'View in dispatch';
      viewLink.onclick = (e) => {
        e.stopPropagation();
        selectedDriverId = ride.assignedDriverId;
        renderDriverConsole();
        document.getElementById('driver-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      item.appendChild(viewLink);
    } else {
      item.appendChild(buildAssignDropdown(ride, () => loadRides()));
    }
    item.appendChild(buildKebabMenu(ride, () => loadRides()));
    list.appendChild(item);
  });
}

function toggleAllActiveRides(header) {
  const el = document.getElementById('all-active-rides');
  if (!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? 'block' : 'none';
  const btn = header.querySelector('.toggle-btn-slim');
  if (btn) btn.textContent = isHidden ? '▾' : '▸';
}

function buildGraceInfo(ride) {
  if (ride.status !== 'driver_arrived_grace' || !ride.graceStartTime) {
    return { message: '', canNoShow: false };
  }
  const graceStart = new Date(ride.graceStartTime);
  const elapsed = (Date.now() - graceStart.getTime()) / 1000;
  const remaining = Math.max(0, 300 - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60).toString().padStart(2, '0');
  const canNoShow = remaining <= 0;
  const message = canNoShow
    ? 'Wait time expired. You may mark a no-show.'
    : `Waiting for rider (${minutes}:${seconds} remaining)`;
  return { message, canNoShow };
}

// ----- Forms -----
async function initForms() {
  // Dev: Load sample rides button
  const sampleCard = document.getElementById('sample-rides-card');
  const loadSampleBtn = document.getElementById('load-sample-rides');
  if (loadSampleBtn) {
    const isDev = typeof window.resolveDevMode === 'function'
      ? await window.resolveDevMode()
      : fallbackIsDevMode();

    if (sampleCard) {
      sampleCard.hidden = !isDev;
      sampleCard.setAttribute('aria-hidden', String(!isDev));
    }
    loadSampleBtn.disabled = !isDev;

    loadSampleBtn.addEventListener('click', async () => {
      const allowed = typeof window.resolveDevMode === 'function'
        ? await window.resolveDevMode()
        : fallbackIsDevMode();
      if (!allowed) {
        showToast('Sample ride loading is only available in local development.', 'warning');
        return;
      }

      const res = await fetch('/api/dev/seed-rides', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not load sample rides', 'error');
        return;
      }
      showToast(data.message || 'Sample rides loaded', 'success');
      await loadRides();
    });
  } else if (sampleCard) {
    sampleCard.hidden = true;
    sampleCard.setAttribute('aria-hidden', 'true');
  }
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

function getWeekDates(selectedDate) {
  const date = new Date(selectedDate);
  const jsDay = date.getDay(); // 0=Sun
  const diffToMonday = (jsDay + 6) % 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - diffToMonday);
  return Array.from({ length: 5 }, (_, idx) => {
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

function changeRideWeek(delta) {
  rideScheduleAnchor.setDate(rideScheduleAnchor.getDate() + delta * 7);
  updateRideWeekLabel();
  renderRideScheduleGrid();
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

function showRulesModal() {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal modal-blur fade';
  modalEl.tabIndex = -1;
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Program Rules &amp; Guidelines</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <ul style="padding-left:20px; line-height:1.8;" class="text-secondary">
            <li>${tenantConfig?.orgShortName || 'DART'} is a free service provided by USC Transportation to assist USC students, faculty and staff with mobility issues in getting around campus. Service is available at UPC during the Fall and Spring semesters only, between 8:00am\u20137:00pm, Monday\u2013Friday.</li>
            <li>${tenantConfig?.orgShortName || 'DART'} vehicles (golf carts) are not city-street legal and cannot leave campus. Service is NOT available to off-campus housing, off-campus parking structures, the USC Village, etc.</li>
            <li>Riders must be able to independently get in and out of a standard golf cart. Drivers cannot assist with lifting/carrying medical equipment (crutches, wheelchairs, etc.). A wheelchair-accessible golf cart is available upon request.</li>
            <li>Due to high demand, drivers cannot wait more than five (5) minutes past a scheduled pick-up time. After that grace period, they may leave to continue other assignments.</li>
            <li>Service is automatically terminated after five (5) consecutive missed pick-ups.</li>
          </ul>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
}

function initSubTabs() {
  document.querySelectorAll('.nav-link[data-subtarget]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const strip = btn.closest('.nav');
      if (strip) {
        strip.querySelectorAll('.nav-link').forEach((b) => b.classList.remove('active'));
      }
      btn.classList.add('active');
      const panel = btn.closest('.tab-panel') || btn.closest('.card')?.parentElement;
      if (panel) {
        panel.querySelectorAll(':scope > .sub-panel, :scope .sub-panel').forEach((p) => {
          if (p.closest('.tab-panel') === panel || !p.closest('.tab-panel')) p.style.display = 'none';
        });
      }
      const target = document.getElementById(btn.dataset.subtarget);
      if (target) target.style.display = 'block';
    });
  });
}

function initTabs() {
  const buttons = document.querySelectorAll('.nav-link[data-target]');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      buttons.forEach((b) => b.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(btn.dataset.target);
      if (panel) panel.classList.add('active');
      // Collapse sidebar on mobile after nav click
      const sidebarMenu = document.getElementById('sidebar-menu');
      if (sidebarMenu && sidebarMenu.classList.contains('show')) {
        bootstrap.Collapse.getInstance(sidebarMenu)?.hide();
      }
    });
  });
}

function showTab(panelId) {
  const buttons = document.querySelectorAll('.nav-link[data-target]');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach((b) => b.classList.remove('active'));
  panels.forEach((p) => p.classList.remove('active'));
  const matchBtn = document.querySelector(`.nav-link[data-target="${panelId}"]`);
  if (matchBtn) matchBtn.classList.add('active');
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
}

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

function renderBarChart(containerId, data, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!data || !data.length) {
    showEmptyState(container, { icon: 'inbox', title: 'No data', message: 'No ride data for this period.' });
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
}

function renderHotspotList(containerId, items, colorClass) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!items || !items.length) {
    showEmptyState(container, { icon: 'inbox', title: 'No data', message: 'No location data available.' });
    return;
  }
  const cls = colorClass || '';
  const max = Math.max(...items.map(i => parseInt(i.count) || 0));
  container.innerHTML = '<div class="hotspot-list">' + items.map((item, idx) => {
    const val = parseInt(item.count) || 0;
    const pct = max > 0 ? (val / max * 100) : 0;
    const name = item.location || item.route;
    return `<div class="hotspot-item">
      <div class="hotspot-rank">#${idx + 1}</div>
      <div class="hotspot-name" title="${name}">${name}</div>
      <div class="hotspot-bar"><div class="hotspot-bar-fill ${cls}" style="width:${pct}%"></div></div>
      <div class="hotspot-count">${val}</div>
    </div>`;
  }).join('') + '</div>';
}

function getKpiColorClass(label, value) {
  const num = parseFloat(value);
  if (label === 'Completion Rate') {
    if (num >= 70) return 'kpi-card--good';
    if (num >= 40) return 'kpi-card--warning';
    return 'kpi-card--danger';
  }
  if (label === 'No-Shows') {
    if (num === 0) return 'kpi-card--good';
    if (num <= 3) return 'kpi-card--warning';
    return 'kpi-card--danger';
  }
  if (label === 'Completed') return 'kpi-card--good';
  return 'kpi-card--neutral';
}

function renderKPIGrid(data) {
  const grid = document.getElementById('analytics-kpi-grid');
  if (!grid) return;
  const kpis = [
    { label: 'Total Rides', value: data.totalRides },
    { label: 'Completed', value: data.completedRides },
    { label: 'No-Shows', value: data.noShows },
    { label: 'Completion Rate', value: data.completionRate + '%' },
    { label: 'People Helped', value: data.peopleHelped ?? 0 },
    { label: 'Total Requesters', value: data.uniqueRiders },
    { label: 'Active Drivers', value: data.uniqueDrivers }
  ];
  grid.innerHTML = kpis.map(k => `
    <div class="kpi-card ${getKpiColorClass(k.label, k.value)}">
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-label">${k.label}</div>
    </div>
  `).join('');
}

function renderVehicleCards(vehicles) {
  const grid = document.getElementById('vehicles-grid');
  if (!grid) return;
  if (!vehicles || !vehicles.length) {
    showEmptyState(grid, { icon: 'inbox', title: 'No vehicles', message: 'Add vehicles to track fleet usage.' });
    return;
  }
  grid.innerHTML = vehicles.map(v => {
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
      actionButtons = `<button class="btn btn-outline-secondary btn-sm" onclick="reactivateVehicle('${v.id}', '${escapedName}')">Reactivate</button>`;
    } else if (v.rideCount > 0) {
      actionButtons = `<button class="btn btn-outline-secondary btn-sm" onclick="logVehicleMaintenance('${v.id}')">Log Maintenance</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="retireVehicle('${v.id}', '${escapedName}')">Retire</button>`;
    } else {
      actionButtons = `<button class="btn btn-outline-secondary btn-sm" onclick="logVehicleMaintenance('${v.id}')">Log Maintenance</button>
        <button class="btn btn-danger btn-sm" onclick="deleteVehicle('${v.id}', '${escapedName}')">Delete</button>`;
    }
    return `<div class="vehicle-card${overdueClass}${retiredClass}">
      <div class="vehicle-name">${v.name}${retiredBadge}</div>
      <div class="vehicle-meta">Type: ${v.type} &middot; Status: ${v.status}</div>
      <div class="vehicle-meta">Completed rides: ${v.rideCount} &middot; Last used: ${lastUsed}</div>
      <div class="vehicle-meta">Last maintenance: ${lastMaint}</div>
      ${alert}
      <div class="ride-actions-compact" style="margin-top:8px;">
        ${actionButtons}
      </div>
    </div>`;
  }).join('');
}

function renderMilestoneList(containerId, people, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!people || !people.length) {
    showEmptyState(container, { icon: 'inbox', title: `No ${type} data`, message: `No completed rides yet.` });
    return;
  }
  const badgeLabels = { 50: 'Rising Star', 100: 'Century Club', 250: 'Quarter Thousand', 500: (tenantConfig?.orgShortName || 'DART') + ' Legend', 1000: 'Diamond' };
  const badgeIcons = { 50: '\u{1F31F}', 100: '\u2B50', 250: '\u{1F3C6}', 500: '\u{1F451}', 1000: '\u{1F48E}' };
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
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="progress-label">${label}</div>
    </div>`;
  }).join('') + '</div>';
}

function renderSemesterReport(data) {
  const container = document.getElementById('semester-report-content');
  if (!container) return;
  analyticsReportData = data;

  function statBlock(stats, label) {
    return `<div class="semester-period">
      <h4>${label}</h4>
      <div class="semester-stat"><div class="stat-value">${stats.completedRides}</div><div class="stat-label">Rides Completed</div></div>
      <div class="semester-stat"><div class="stat-value">${stats.peopleHelped ?? 0}</div><div class="stat-label">People Helped</div></div>
      <div class="semester-stat"><div class="stat-value">${stats.completionRate}%</div><div class="stat-label">Completion Rate</div></div>
      <div class="semester-stat"><div class="stat-value">${stats.noShows}</div><div class="stat-label">No-Shows</div></div>
    </div>`;
  }

  let monthlyTable = '';
  if (data.monthlyBreakdown && data.monthlyBreakdown.length) {
    monthlyTable = `<h4 style="margin-top:16px;">Monthly Breakdown</h4>
    <table class="grid-table"><thead><tr><th>Month</th><th>Completed</th><th>Total</th><th>Riders</th></tr></thead><tbody>
    ${data.monthlyBreakdown.map(m => `<tr><td>${m.month}</td><td>${m.completed}</td><td>${m.total}</td><td>${m.riders}</td></tr>`).join('')}
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
      ${statBlock(data.current, data.semesterLabel + ' (Current)')}
      ${statBlock(data.previous, data.previousLabel + ' (Previous)')}
    </div>
    ${monthlyTable}
    ${leaderboard}
  `;

  // DART Wrapped
  const wrapped = document.getElementById('dart-wrapped-content');
  if (wrapped) {
    const c = data.current;
    const mvp = data.driverLeaderboard?.[0];
    if (c.completedRides === 0) {
      wrapped.innerHTML = `<div class="dart-wrapped">
        <div class="wrapped-big">\u{1F680} 0 Rides</div>
        <div class="wrapped-line">In <strong>${data.semesterLabel}</strong>, ${tenantConfig?.orgShortName || 'DART'} has not yet completed any rides this semester.</div>
      </div>`;
    } else {
      wrapped.innerHTML = `<div class="dart-wrapped">
        <div class="wrapped-big">\u{1F389} ${c.completedRides} Rides</div>
        <div class="wrapped-line">In <strong>${data.semesterLabel}</strong>, ${tenantConfig?.orgShortName || 'DART'} completed <strong>${c.completedRides}</strong> rides and helped <strong>${c.peopleHelped ?? 0}</strong> people get around campus.</div>
        ${mvp ? `<div class="wrapped-line">MVP Driver: <strong>${mvp.name}</strong> with <strong>${mvp.completed}</strong> completed rides</div>` : ''}
        <div class="wrapped-line">Completion Rate: <strong>${c.completionRate}%</strong></div>
      </div>`;
    }
  }
}

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_COLORS = { completed: 'green', cancelled: 'orange', no_show: 'red', denied: '', pending: 'gold', approved: '', scheduled: '' };

async function loadAnalyticsSummary() {
  try {
    const res = await fetch('/api/analytics/summary' + getAnalyticsDateParams());
    if (!res.ok) return;
    renderKPIGrid(await res.json());
  } catch (e) { console.error('Analytics summary error:', e); }
}

async function loadAnalyticsFrequency() {
  try {
    const res = await fetch('/api/analytics/frequency' + getAnalyticsDateParams());
    if (!res.ok) return;
    const data = await res.json();

    // Day of week chart
    const dowData = DOW_NAMES.map((name, i) => {
      const row = data.byDayOfWeek.find(r => parseInt(r.dow) === i);
      return { label: name, count: row ? row.count : 0 };
    }).filter((_, i) => i >= 1 && i <= 5); // Mon-Fri only
    renderBarChart('chart-dow', dowData);

    // Hourly chart
    const hourData = data.byHour
      .filter(r => parseInt(r.hour) >= 8 && parseInt(r.hour) <= 19)
      .map(r => ({ label: `${r.hour}:00`, count: r.count }));
    renderBarChart('chart-hour', hourData, { colorClass: 'gold', yLabel: '# of rides' });

    // Daily volume (last 30 entries)
    const dailyData = data.daily.slice(-30).map(r => ({
      label: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: r.total
    }));
    renderBarChart('chart-daily', dailyData, { yLabel: '# of rides' });

    // Status breakdown
    const statusData = data.byStatus.map(r => ({
      label: statusLabel(r.status),
      count: r.count,
      colorClass: STATUS_COLORS[r.status] || ''
    }));
    const statusContainer = document.getElementById('chart-status');
    if (statusContainer && statusData.length) {
      const max = Math.max(...statusData.map(d => parseInt(d.count) || 0));
      const legendHtml = statusData.map(d => {
        const color = d.colorClass || '';
        return `<span class="status-legend-item"><span class="status-legend-dot ${color}"></span>${d.label}</span>`;
      }).join('');
      statusContainer.innerHTML = '<div class="bar-chart">' + statusData.map(d => {
        const val = parseInt(d.count) || 0;
        const pct = max > 0 ? (val / max * 100) : 0;
        return `<div class="bar-chart-row">
          <div class="bar-chart-label">${d.label}</div>
          <div class="bar-chart-track"><div class="bar-chart-fill ${d.colorClass}" style="width:${pct}%"></div></div>
          <div class="bar-chart-count">${val}</div>
        </div>`;
      }).join('') + '</div>' + `<div class="status-legend-row">${legendHtml}</div>`;
    }
  } catch (e) { console.error('Analytics frequency error:', e); }
}

async function loadAnalyticsHotspots() {
  try {
    const res = await fetch('/api/analytics/hotspots' + getAnalyticsDateParams());
    if (!res.ok) return;
    const data = await res.json();
    renderHotspotList('hotspot-pickups', data.topPickups);
    renderHotspotList('hotspot-dropoffs', data.topDropoffs, 'darkgold');
    renderHotspotList('hotspot-routes', data.topRoutes, 'gold');
  } catch (e) { console.error('Analytics hotspots error:', e); }
}

async function loadFleetVehicles() {
  try {
    const res = await fetch('/api/analytics/vehicles' + getAnalyticsDateParams());
    if (!res.ok) return;
    renderVehicleCards(await res.json());
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

async function loadAllAnalytics() {
  await Promise.all([
    loadAnalyticsSummary(),
    loadAnalyticsFrequency(),
    loadAnalyticsHotspots(),
    loadAnalyticsMilestones(),
    loadSemesterReport()
  ]);
}

async function logVehicleMaintenance(vehicleId) {
  const confirmed = await showConfirmModal({
    title: 'Log Maintenance',
    message: 'Mark this vehicle as maintained today?',
    confirmLabel: 'Log Maintenance',
    cancelLabel: 'Cancel',
    type: 'warning'
  });
  if (!confirmed) return;
  const res = await fetch(`/api/vehicles/${vehicleId}/maintenance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to log maintenance', 'error');
  } else {
    showToast('Maintenance logged', 'success');
    loadFleetVehicles();
  }
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

async function addVehicle() {
  const name = prompt('Vehicle name:');
  if (!name) return;
  const type = prompt('Type (standard / accessible):', 'standard') || 'standard';
  const res = await fetch('/api/vehicles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type })
  });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to add vehicle', 'error');
  } else {
    showToast('Vehicle added', 'success');
    loadFleetVehicles();
  }
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
  downloadCSV(headers, rows, `dart-report-${d.semesterLabel.replace(/\s/g, '-').toLowerCase()}.csv`);
  showToast('CSV downloaded', 'success');
}

// ----- Initialize -----
document.addEventListener('DOMContentLoaded', async () => {
  await loadTenantConfig();
  if (!await checkAuth()) return;
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

  initTabs();
  initSubTabs();
  await initForms();

  // Ride filter input
  const rideFilterInput = document.getElementById('ride-filter-input');
  if (rideFilterInput) {
    rideFilterInput.addEventListener('input', debounce(() => {
      rideFilterText = rideFilterInput.value.trim();
      renderRideLists();
    }, 300));
  }

  // History filter input
  const historyFilterInput = document.getElementById('history-filter-input');
  if (historyFilterInput) {
    historyFilterInput.addEventListener('input', debounce(() => {
      historyFilterText = historyFilterInput.value.trim();
      renderRideLists();
    }, 300));
  }

  // Admin user filter input
  const adminFilterInput = document.getElementById('admin-user-filter');
  if (adminFilterInput) {
    adminFilterInput.addEventListener('input', debounce(filterAdminUsers, 300));
  }

  // Admin drawer cleanup on hide (offcanvas handles close/backdrop/escape natively)
  const adminDrawerEl = document.getElementById('admin-drawer');
  if (adminDrawerEl) {
    adminDrawerEl.addEventListener('hidden.bs.offcanvas', () => {
      const body = document.getElementById('admin-drawer-body');
      if (body) body.innerHTML = '';
      drawerUserId = null;
    });
  }

  await loadEmployees();
  await loadShifts();
  await loadRides();
  await loadVehicles();
  await loadAdminUsers();
  checkEmailStatus();
  // Default to showing own profile in Profile tab
  if (currentUser?.id) {
    await loadUserProfile(currentUser.id);
  }
  initShiftCalendar();
  document.getElementById('shift-filter-employee')?.addEventListener('change', (e) => {
    shiftFilterEmployeeId = e.target.value;
    refreshShiftCalendar();
  });
  document.getElementById('shift-show-rides')?.addEventListener('change', (e) => {
    showRidesOnCalendar = e.target.checked;
    refreshShiftCalendar();
  });

  const createBtn = document.getElementById('admin-create-btn');
  if (createBtn) createBtn.addEventListener('click', createAdminUser);
  const ridePrev = document.getElementById('ride-week-prev');
  const rideNext = document.getElementById('ride-week-next');
  if (ridePrev) ridePrev.addEventListener('click', () => changeRideWeek(-1));
  if (rideNext) rideNext.addEventListener('click', () => changeRideWeek(1));

  // Analytics: lazy load on first tab click
  const analyticsRefreshBtn = document.getElementById('analytics-refresh-btn');
  if (analyticsRefreshBtn) analyticsRefreshBtn.addEventListener('click', loadAllAnalytics);
  const addVehicleBtn = document.getElementById('add-vehicle-btn');
  if (addVehicleBtn) addVehicleBtn.addEventListener('click', addVehicle);
  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportSemesterCSV);

  const analyticsNavBtn = document.querySelector('.nav-link[data-target="analytics-panel"]');
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
  const fleetNavBtn = document.querySelector('.nav-link[data-target="fleet-panel"]');
  if (fleetNavBtn) {
    fleetNavBtn.addEventListener('click', () => {
      if (!fleetLoaded) {
        fleetLoaded = true;
        loadFleetVehicles();
      }
    });
  }

  setInterval(loadRides, 5000);
  setInterval(loadVehicles, 15000);
  setInterval(renderDriverConsole, 1000);
  setInterval(refreshShiftCalendar, 5000);
});
