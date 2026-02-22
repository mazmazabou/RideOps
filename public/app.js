// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

// Status display helpers
function statusLabel(status) {
  const labels = {
    pending: 'Pending', approved: 'Approved', scheduled: 'Scheduled',
    driver_on_the_way: 'On The Way', driver_arrived_grace: 'Driver Arrived',
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
  const orgShort = document.getElementById('org-short-name');
  if (orgShort) orgShort.textContent = tenantConfig.orgShortName;
  const orgInitials = document.getElementById('org-initials');
  if (orgInitials) orgInitials.textContent = tenantConfig.orgInitials;
  const headerTitle = document.getElementById('header-title');
  if (headerTitle) headerTitle.textContent = tenantConfig.orgName + ' Operations Console';
  const wrappedTitle = document.getElementById('ro-wrapped-title');
  if (wrappedTitle) wrappedTitle.textContent = tenantConfig.orgShortName + ' Wrapped';
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
  renderRideScheduleGrid();
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
  filteredAdminUsers = q
    ? adminUsers.filter(u => [u.name, u.username, u.email, u.phone, u.member_id, u.role]
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
      <td><span class="role-badge role-${u.role}">${u.role}</span></td>
      <td>${u.member_id || ''}</td>
      <td>${u.phone || ''}</td>
      <td></td>
      <td><i class="ti ti-chevron-right admin-chevron"></i></td>
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
        ${missCount >= 5 ? '<div class="small-text" style="font-weight:700; color:#c62828;">SERVICE TERMINATED</div>' : ''}
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
          <div class="drawer-section-title" style="color:#c62828;">Danger Zone</div>
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
        uscId: body.querySelector('#drawer-edit-memberid').value.trim(),
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
      uscId: overlay.querySelector('#edit-user-memberid').value.trim(),
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
        msg.style.color = '#c62828';
        return;
      }
      showToast('User updated successfully', 'success');
      close();
      await loadAdminUsers();
    } catch {
      msg.textContent = 'Network error';
      msg.style.color = '#c62828';
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
        close();
      } else {
        msg.textContent = 'Password reset successfully.';
        msg.style.color = '#228b22';
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
  const username = document.getElementById('admin-new-username')?.value.trim();
  const email = document.getElementById('admin-new-email')?.value.trim();
  const phone = document.getElementById('admin-new-phone')?.value.trim();
  const uscId = document.getElementById('admin-new-memberid')?.value.trim();
  const role = document.getElementById('admin-new-role')?.value;
  const password = document.getElementById('admin-new-password')?.value;
  const msg = document.getElementById('admin-create-message');
  if (msg) msg.textContent = '';
  if (!name || !username || !email || !uscId || !role || !password) {
    if (msg) msg.textContent = 'All required fields must be filled.';
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    if (msg) msg.textContent = 'Username may only contain letters, numbers, and underscores.';
    return;
  }
  if (!uscId) {
    if (msg) msg.textContent = `${tenantConfig?.idFieldLabel || 'Member ID'} is required.`;
    return;
  }
  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, email, phone, uscId, role, password })
    });
    const data = await res.json();
    if (!res.ok) {
      if (msg) msg.textContent = data.error || 'Could not create user';
      return;
    }
    ['admin-new-name','admin-new-username','admin-new-email','admin-new-phone','admin-new-memberid','admin-new-password'].forEach(id => {
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
          <button class="btn secondary small" style="margin-top:6px;" onclick="navigator.clipboard.writeText('${clipText}').then(()=>showToast('Credentials copied','success'))">Copy Credentials</button>`;
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

function initShiftCalendar() {
  const calendarEl = document.getElementById('shift-calendar');
  if (!calendarEl) return;

  if (shiftCalendar) {
    // Just refresh events
    shiftCalendar.removeAllEvents();
    getShiftCalendarEvents().forEach(ev => shiftCalendar.addEvent(ev));
    return;
  }

  shiftCalendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'timeGridWeek',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },
    slotMinTime: '07:00:00',
    slotMaxTime: '20:00:00',
    allDaySlot: false,
    weekends: false,
    height: 'auto',
    events: getShiftCalendarEvents(),
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

const DRIVER_COLORS = [
  '#4682B4', // SteelBlue
  '#2E8B57', // SeaGreen
  '#8B4513', // SaddleBrown
  '#6A5ACD', // SlateBlue
  '#CD853F', // Peru
  '#20B2AA', // LightSeaTeal
  '#B8860B', // DarkGoldenrod
  '#9932CC', // DarkOrchid
];

function getShiftCalendarEvents() {
  const events = [];
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  shifts.forEach(s => {
    const emp = employees.find(e => e.id === s.employeeId);
    const name = emp?.name || 'Unknown';
    const employeeIndex = employees.findIndex(e => e.id === s.employeeId);
    const color = employeeIndex >= 0 ? DRIVER_COLORS[employeeIndex % DRIVER_COLORS.length] : '#94A3B8';
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
      extendedProps: { shiftId: s.id, employeeId: s.employeeId, notes: s.notes || '' }
    });
  });
  return events;
}

async function onCalendarSelect(info) {
  // Determine day of week (Mon=0)
  const jsDay = info.start.getDay();
  const dayOfWeek = (jsDay + 6) % 7;
  if (dayOfWeek > 4) return; // Skip weekends

  const startTime = info.start.toTimeString().substring(0, 8);
  const endTime = info.end.toTimeString().substring(0, 8);

  // Show employee picker modal
  const empId = await pickEmployeeForShift();
  if (!empId) {
    if (shiftCalendar) shiftCalendar.unselect();
    return;
  }

  try {
    await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: empId, dayOfWeek, startTime, endTime })
    });
    await loadShifts();
    showToast('Shift added', 'success');
  } catch {
    showToast('Failed to add shift', 'error');
  }
}

// ----- Shift Event Handlers (drag/drop, resize, popover, context menu) -----

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

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
  const dayOfWeek = (jsDay + 6) % 7;
  if (dayOfWeek > 4) {
    info.revert();
    showToast('Shifts must be on weekdays', 'error');
    return;
  }
  const startTime = info.event.start.toTimeString().substring(0, 5);
  const endTime = info.event.end.toTimeString().substring(0, 5);
  try {
    const res = await fetch(`/api/shifts/${shiftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayOfWeek, startTime, endTime })
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
    showShiftContextMenu(e, info.event);
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

function showShiftContextMenu(e, calEvent) {
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
        body: JSON.stringify({ employeeId: empId, dayOfWeek, startTime, endTime, notes })
      });
      if (!res.ok) { showToast('Failed to duplicate shift', 'error'); return; }
      await loadShifts();
      showToast('Shift duplicated', 'success');
    } catch { showToast('Failed to duplicate shift', 'error'); }
  };

  // Edit Details — open the popover
  menu.querySelector('[data-action="edit"]').onclick = () => {
    closeShiftContextMenu();
    // Find the DOM element for this event and trigger the popover
    const fcEvents = shiftCalendar.getEvents();
    const matchEv = fcEvents.find(ev => ev.extendedProps.shiftId === shiftId);
    if (matchEv) {
      // Synthesize an info-like object for onShiftEventClick
      const els = document.querySelectorAll('.fc-event');
      let targetEl = null;
      els.forEach(el => {
        const evObj = el.__fcEvent || null;
        // Match by position in DOM — find the el that renders this event
        if (el.textContent.includes(empName)) targetEl = el;
      });
      // Use the event's element if possible
      if (!targetEl) {
        // Fallback: use all fc-timegrid-event elements
        targetEl = document.querySelector('.fc-timegrid-event');
      }
      onShiftEventClick({ event: matchEv, el: targetEl || document.querySelector('.fc-event') });
    }
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
    const la = toLADate(date);
    const dayIdx = la.getDay() - 1; // Monday = 0
    if (dayIdx < 0 || dayIdx > 4) return;

    const hour = la.getHours();
    const minute = la.getMinutes();
    if (hour < 8 || hour > 19 || (hour === 19 && minute > 0)) return;
    const { slot, offset } = getSlotInfo(date);
    const key = `${slot}-${dayIdx}`;
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
      <label>Change Notes <span style="color:#c62828;">*</span>
        <textarea id="edit-ride-change-notes" rows="2" placeholder="Describe what changed and why..."></textarea>
      </label>
      <label>Initials <span style="color:#c62828;">*</span>
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
    if (!changeNotes) { msg.textContent = 'Change notes are required'; msg.style.color = '#c62828'; return; }
    if (!initials) { msg.textContent = 'Initials are required'; msg.style.color = '#c62828'; return; }

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
        msg.style.color = '#c62828';
        return;
      }
      showToast('Ride updated successfully', 'success');
      close();
      if (onDone) await onDone();
    } catch {
      msg.textContent = 'Network error';
      msg.style.color = '#c62828';
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
    overlay.className = 'modal-overlay';
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

// ----- History Helpers -----
function historyGroupKey(ride) {
  return `${ride.riderEmail || ride.riderName}|${ride.pickupLocation}|${ride.dropoffLocation}|${ride.status}`;
}
function formatHistoryDateHeader(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
}
function getDateKey(dateStr) {
  if (!dateStr) return 'unknown';
  const d = toLADate(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function buildHistoryItem(ride) {
  const item = document.createElement('div');
  item.className = 'item';
  const cancelledByOffice = ride.status === 'cancelled' && ride.cancelledBy === 'office';
  item.innerHTML = `
    <div>${statusBadge(ride.status)}${cancelledByOffice ? ' <span class="small-text">(cancelled by office)</span>' : ''} <span data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="clickable-name">${ride.riderName}</span></div>
    <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
    <div class="small-text">When: ${formatDate(ride.requestedTime)}</div>
    <div class="small-text">Misses: ${ride.consecutiveMisses || 0}</div>
    ${ride.vehicleId ? `<div class="small-text">Cart: ${vehicles.find(v => v.id === ride.vehicleId)?.name || ride.vehicleId}</div>` : ''}
  `;
  item.appendChild(buildKebabMenu(ride, () => loadRides()));
  return item;
}

// ----- Ride Lists -----
let rideStatusFilter = 'all';
let ridesDateFilter = '';

function renderRideLists() {
  const tbody = document.getElementById('rides-tbody');
  const historyEl = document.getElementById('history-items');
  if (!tbody) return;
  if (historyEl) historyEl.innerHTML = '';

  // Apply filters
  let filtered = rides;

  // Status filter
  if (rideStatusFilter === 'in_progress') {
    filtered = filtered.filter(r => ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(r.status));
  } else if (rideStatusFilter !== 'all') {
    filtered = filtered.filter(r => r.status === rideStatusFilter);
  }

  // Date filter
  if (ridesDateFilter) {
    filtered = filtered.filter(r => r.requestedTime && r.requestedTime.startsWith(ridesDateFilter));
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

  tbody.innerHTML = '';
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--color-text-muted);">No rides match the current filters.</td></tr>';
  } else {
    filtered.forEach(ride => {
      const tr = document.createElement('tr');
      const driverName = ride.assignedDriverId ? (employees.find(e => e.id === ride.assignedDriverId)?.name || '—') : '—';
      const pickup = abbreviateLocation(ride.pickupLocation);
      const dropoff = abbreviateLocation(ride.dropoffLocation);
      tr.innerHTML = `
        <td>${formatDate(ride.requestedTime)}</td>
        <td><span class="clickable-name" data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}">${ride.riderName}</span></td>
        <td title="${ride.pickupLocation} → ${ride.dropoffLocation}">${pickup} → ${dropoff}</td>
        <td>${statusBadge(ride.status)}</td>
        <td>${ride.assignedDriverId ? `<span class="clickable-name" data-user="${ride.assignedDriverId}">${driverName}</span>` : '—'}</td>
        <td></td>
      `;
      // Quick actions in last cell
      const actionsCell = tr.querySelectorAll('td')[5];
      if (ride.status === 'pending') {
        const approveBtn = document.createElement('button');
        approveBtn.className = 'ro-btn ro-btn--success ro-btn--sm';
        approveBtn.textContent = 'Approve';
        approveBtn.onclick = (e) => { e.stopPropagation(); updateRide(`/api/rides/${ride.id}/approve`); };
        actionsCell.appendChild(approveBtn);
      }
      tr.style.cursor = 'pointer';
      tr.onclick = (e) => {
        if (e.target.closest('.ro-btn') || e.target.closest('.clickable-name') || e.target.closest('select')) return;
        openRideDrawer(ride);
      };
      tbody.appendChild(tr);
    });
  }

  // Update count
  const countEl = document.getElementById('ride-filter-count');
  if (countEl) countEl.textContent = `${filtered.length} ride${filtered.length !== 1 ? 's' : ''}`;

  // History tab (still uses old format)
  const historyAll = rides.filter(r => ['completed', 'no_show', 'denied', 'cancelled'].includes(r.status));
  const history = historyAll.filter(r => rideMatchesFilter(r, historyFilterText));
  if (historyEl) renderHistory(history);
}

function renderHistory(history) {
  const historyEl = document.getElementById('history-items');
  if (!historyEl) return;

  const sorted = [...history].sort((a, b) => {
    const da = a.requestedTime ? new Date(a.requestedTime).getTime() : 0;
    const db = b.requestedTime ? new Date(b.requestedTime).getTime() : 0;
    return db - da;
  });

  const dateGroups = new Map();
  sorted.forEach(ride => {
    const dk = getDateKey(ride.requestedTime);
    if (!dateGroups.has(dk)) dateGroups.set(dk, { label: formatHistoryDateHeader(ride.requestedTime), rides: [] });
    dateGroups.get(dk).rides.push(ride);
  });

  dateGroups.forEach((group, dateKey) => {
    const dateHeader = document.createElement('div');
    dateHeader.className = 'history-date-header';
    dateHeader.textContent = group.label;
    historyEl.appendChild(dateHeader);

    const ridesInDay = group.rides;
    let i = 0;
    while (i < ridesInDay.length) {
      const currentKey = historyGroupKey(ridesInDay[i]);
      let runEnd = i + 1;
      while (runEnd < ridesInDay.length && historyGroupKey(ridesInDay[runEnd]) === currentKey) runEnd++;
      const runLength = runEnd - i;

      if (runLength === 1) {
        historyEl.appendChild(buildHistoryItem(ridesInDay[i]));
      } else {
        const groupId = `${dateKey}|${currentKey}`;
        const isExpanded = historyExpandedGroups.has(groupId);
        const firstRide = ridesInDay[i];
        const summary = document.createElement('div');
        summary.className = 'history-group-summary';
        summary.innerHTML = `${statusBadge(firstRide.status)} <strong>${firstRide.riderName}</strong> <span class="small-text">${firstRide.pickupLocation} → ${firstRide.dropoffLocation}</span> <span class="history-group-count">${runLength}</span> <button class="history-group-toggle">${isExpanded ? 'Hide' : 'Show all'}</button>`;
        const container = document.createElement('div');
        container.className = 'history-group-rides' + (isExpanded ? ' expanded' : '');
        for (let j = i; j < runEnd; j++) container.appendChild(buildHistoryItem(ridesInDay[j]));
        summary.querySelector('.history-group-toggle').onclick = () => {
          const nowExpanded = container.classList.toggle('expanded');
          summary.querySelector('.history-group-toggle').textContent = nowExpanded ? 'Hide' : 'Show all';
          if (nowExpanded) historyExpandedGroups.add(groupId);
          else historyExpandedGroups.delete(groupId);
        };
        historyEl.appendChild(summary);
        historyEl.appendChild(container);
      }
      i = runEnd;
    }
  });

  if (!history.length && !historyFilterText) {
    historyEl.innerHTML = '<div class="ro-empty"><i class="ti ti-history"></i><div class="ro-empty__title">No completed history yet</div><div class="ro-empty__message">Completed and no-show rides will appear here.</div></div>';
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
  const pendingRides = rides.filter(r => r.status === 'approved' && !r.assignedDriverId && r.requestedTime?.startsWith(today)).length;
  const completedToday = rides.filter(r => r.status === 'completed' && r.requestedTime?.startsWith(today)).length;
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('dispatch-active-drivers', activeDrivers);
  el('dispatch-active-rides', activeRides);
  el('dispatch-pending-rides', pendingRides);
  el('dispatch-completed-today', completedToday);
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

function renderDispatchGrid() {
  const grid = document.getElementById('dispatch-grid');
  if (!grid) return;
  const dateInput = document.getElementById('dispatch-date');
  const selectedDate = dateInput?.value ? parseDateInputLocal(dateInput.value) : new Date();
  const dateStr = formatDateInputLocal(selectedDate || new Date());
  const cols = 13; // 7am to 7pm (hours 7-19)
  const startHour = 7;

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

  // Active drivers
  activeDrivers.forEach(driver => {
    const driverRides = dayRides.filter(r => r.assignedDriverId === driver.id);
    html += buildDriverGridRow(driver, driverRides, cols, startHour, gridColStyle, true);
  });

  // Unassigned separator
  if (unassignedRides.length) {
    html += `<div class="time-grid__separator">Unassigned (${unassignedRides.length})</div>`;
    html += `<div class="time-grid__row" style="${gridColStyle}">`;
    html += `<div class="time-grid__driver"><span class="time-grid__driver-dot time-grid__driver-dot--offline"></span>Unassigned</div>`;
    for (let h = startHour; h < startHour + cols; h++) {
      html += `<div class="time-grid__shift-band" style="position:relative;">`;
      unassignedRides.forEach(r => {
        const laTime = toLADate(r.requestedTime);
        const rideHour = laTime.getHours();
        if (rideHour === h) {
          const mins = laTime.getMinutes();
          const left = (mins / 60 * 100) + '%';
          const lastName = (r.riderName || '').split(' ').pop();
          const abbrev = abbreviateLocation(r.pickupLocation);
          html += `<div class="time-grid__ride-strip" data-ride-id="${r.id}" style="left:${left};width:50%;background:var(--status-approved);" title="${r.riderName}: ${r.pickupLocation} → ${r.dropoffLocation}">${lastName} · ${abbrev}</div>`;
        }
      });
      html += '</div>';
    }
    html += '</div>';
  }

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

  // Add click handlers to ride strips
  grid.querySelectorAll('.time-grid__ride-strip[data-ride-id]').forEach(strip => {
    strip.onclick = (e) => {
      e.stopPropagation();
      const ride = rides.find(r => r.id === strip.dataset.rideId);
      if (ride) openRideDrawer(ride);
    };
  });
}

function buildDriverGridRow(driver, driverRides, cols, startHour, gridColStyle, isActive) {
  const dotClass = isActive ? 'time-grid__driver-dot--online' : 'time-grid__driver-dot--offline';
  let html = `<div class="time-grid__row" style="${gridColStyle}${!isActive ? ';opacity:0.5;' : ''}">`;
  html += `<div class="time-grid__driver"><span class="time-grid__driver-dot ${dotClass}"></span><span class="clickable-name" data-user="${driver.id}">${driver.name}</span></div>`;

  // Find driver's shifts for the selected day
  const dateInput = document.getElementById('dispatch-date');
  const selectedDate = dateInput?.value ? parseDateInputLocal(dateInput.value) : new Date();
  const dayOfWeek = selectedDate ? ((selectedDate.getDay() + 6) % 7) : ((new Date().getDay() + 6) % 7); // Mon=0

  for (let h = startHour; h < startHour + cols; h++) {
    const slot = `${String(h).padStart(2, '0')}:00`;
    const hasShift = shifts.some(s => s.employeeId === driver.id && s.dayOfWeek === dayOfWeek && s.startTime <= slot && s.endTime > slot);
    const bgStyle = hasShift ? 'background:var(--color-primary-subtle);' : '';
    html += `<div style="position:relative;${bgStyle}border-right:1px solid var(--color-border-light);">`;

    // Render rides at this hour
    driverRides.forEach(r => {
      const rideTime = new Date(r.requestedTime);
      const laRideTime = toLADate(rideTime);
      const rideHour = laRideTime.getHours();
      if (rideHour === h) {
        const mins = laRideTime.getMinutes();
        const left = (mins / 60 * 100) + '%';
        const statusColors = {
          approved: 'var(--status-approved)', scheduled: 'var(--status-scheduled)',
          driver_on_the_way: 'var(--status-on-the-way)', driver_arrived_grace: 'var(--status-grace)',
          completed: 'var(--status-completed)', no_show: 'var(--status-no-show)', pending: 'var(--status-pending)'
        };
        const bg = statusColors[r.status] || 'var(--status-pending)';
        const lastName = (r.riderName || '').split(' ').pop();
        const abbrev = abbreviateLocation(r.pickupLocation);
        html += `<div class="time-grid__ride-strip" data-ride-id="${r.id}" style="left:${left};width:50%;background:${bg};" title="${r.riderName}: ${r.pickupLocation} → ${r.dropoffLocation}">${lastName} · ${abbrev}</div>`;
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
  html += `<div style="font-size:15px;font-weight:700;margin-bottom:4px;"><span class="clickable-name" data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}">${ride.riderName}</span></div>`;
  html += `<div class="text-sm text-muted">${ride.riderEmail || ''}</div>`;
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
    actionsEl.appendChild(makeBtn('On My Way', 'ro-btn ro-btn--primary ro-btn--full', () => updateRide(`/api/rides/${ride.id}/on-the-way`).then(reload)));
    actionsEl.appendChild(makeBtn("I'm Here", 'ro-btn ro-btn--outline ro-btn--full', () => updateRide(`/api/rides/${ride.id}/here`).then(reload)));
    actionsEl.appendChild(makeBtn('Complete', 'ro-btn ro-btn--success ro-btn--full', async () => {
      const confirmed = await showConfirmModal({ title: 'Complete Ride', message: 'Mark this ride as completed?', confirmLabel: 'Complete', type: 'warning' });
      if (confirmed) { await updateRide(`/api/rides/${ride.id}/complete`); reload(); }
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
      if (confirmed) { await fetch(`/api/rides/${ride.id}/unassign`, { method: 'POST' }); reload(); }
    }));
    const reassignSelect = buildReassignDropdown(ride, ride.assignedDriverId, reload);
    reassignSelect.style.width = '100%';
    actionsEl.appendChild(reassignSelect);
  }

  if (!isTerminal) {
    actionsEl.appendChild(makeBtn('Cancel Ride', 'ro-btn ro-btn--danger ro-btn--full', async () => {
      const confirmed = await showConfirmModal({ title: 'Cancel Ride', message: 'Cancel this ride?', confirmLabel: 'Cancel Ride', type: 'danger' });
      if (confirmed) { await fetch(`/api/rides/${ride.id}/cancel`, { method: 'POST' }); reload(); }
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
  const remaining = Math.max(0, 300 - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60).toString().padStart(2, '0');
  const canNoShow = remaining <= 0;
  const message = canNoShow
    ? 'Wait time expired. You may mark a no-show.'
    : `Waiting for rider (${minutes}:${seconds} remaining)`;
  return { message, canNoShow };
}

// ----- Helpers -----
function toLADate(input) {
  var d = input instanceof Date ? input : new Date(input);
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
}

function formatDate(dateStr) {
  if (typeof window.formatDateTime === 'function') {
    return window.formatDateTime(dateStr);
  }
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return `${date.toLocaleDateString(undefined, { timeZone: 'America/Los_Angeles' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' })}`;
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
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' });
}

function formatLocationLabel(location) {
  if (!location) return 'N/A';
  return location.trim().toUpperCase();
}

function getSlotInfo(date) {
  const la = toLADate(date);
  const hour = la.getHours();
  const minute = la.getMinutes();
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
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:600px;">
      <div class="modal-title">Program Rules &amp; Guidelines</div>
      <ul style="padding-left:20px; line-height:1.8; color:var(--muted); font-size:14px;">
        ${(tenantConfig?.rules || [
          'This is a free accessible transportation service available during operating hours, Monday\u2013Friday.',
          'Vehicles cannot leave campus grounds.',
          'Riders must be present at the designated pickup location at the requested time.',
          'Drivers will wait up to 5 minutes (grace period). After that, the ride may be marked as a no-show.',
          'Service is automatically terminated after 5 consecutive missed pick-ups.'
        ]).map(r => `<li>${r}</li>`).join('')}
      </ul>
      <div class="modal-actions">
        <button class="btn primary modal-close-btn">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const close = () => {
    overlay.classList.remove('show');
    overlay.classList.add('hiding');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector('.modal-close-btn').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
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
    grid.innerHTML = '<div class="ro-empty"><i class="ti ti-bus-off"></i><div class="ro-empty__title">No vehicles</div><div class="ro-empty__message">Add vehicles to track fleet usage.</div></div>';
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
      actionButtons = `<button class="btn secondary small" onclick="reactivateVehicle('${v.id}', '${escapedName}')">Reactivate</button>`;
    } else if (v.rideCount > 0) {
      actionButtons = `<button class="btn secondary small" onclick="logVehicleMaintenance('${v.id}')">Log Maintenance</button>
        <button class="btn secondary small" title="Mark this vehicle as no longer in service. History is preserved." onclick="retireVehicle('${v.id}', '${escapedName}')">Retire</button>`;
    } else {
      actionButtons = `<button class="btn secondary small" onclick="logVehicleMaintenance('${v.id}')">Log Maintenance</button>
        <button class="btn danger small" title="Permanently remove this vehicle from the system. Use only if the vehicle was entered in error." onclick="deleteVehicle('${v.id}', '${escapedName}')">Delete</button>`;
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
    container.innerHTML = `<div class="ro-empty"><i class="ti ti-trophy-off"></i><div class="ro-empty__title">No ${type} data</div><div class="ro-empty__message">No completed rides yet.</div></div>`;
    return;
  }
  const badgeLabels = { 50: 'Rising Star', 100: 'Century Club', 250: 'Quarter Thousand', 500: (tenantConfig?.orgShortName || 'RideOps') + ' Legend', 1000: 'Diamond' };
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
      ${statBlock(data.current, data.semesterLabel + ' (Current)')}
      ${statBlock(data.previous, data.previousLabel + ' (Previous)')}
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
        <div class="wrapped-big">\u{1F680} 0 Rides</div>
        <div class="wrapped-line">In <strong>${data.semesterLabel}</strong>, ${tenantConfig?.orgShortName || 'RideOps'} has not yet completed any rides this semester.</div>
      </div>`;
    } else {
      wrapped.innerHTML = `<div class="ro-wrapped">
        <div class="wrapped-big">\u{1F389} ${c.completedRides} Rides</div>
        <div class="wrapped-line">In <strong>${data.semesterLabel}</strong>, ${tenantConfig?.orgShortName || 'RideOps'} completed <strong>${c.completedRides}</strong> rides and helped <strong>${c.peopleHelped ?? 0}</strong> people get around campus.</div>
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
    renderBarChart('chart-dow', dowData, { unit: 'rides' });

    // Hourly chart
    const hourData = data.byHour
      .filter(r => parseInt(r.hour) >= 8 && parseInt(r.hour) <= 19)
      .map(r => ({ label: `${r.hour}:00`, count: r.count }));
    renderBarChart('chart-hour', hourData, { colorClass: 'gold', yLabel: '# of rides', unit: 'rides' });

    // Daily volume (last 30 entries)
    const dailyData = data.daily.slice(-30).map(r => ({
      label: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: r.total
    }));
    renderBarChart('chart-daily', dailyData, { yLabel: '# of rides', unit: 'rides' });

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
      // Attach hover tooltips to status chart
      const statusTotal = statusData.reduce((s, d) => s + (parseInt(d.count) || 0), 0);
      statusContainer.querySelectorAll('.bar-chart-row').forEach((row, idx) => {
        const d = statusData[idx];
        const val = parseInt(d.count) || 0;
        const pct = statusTotal > 0 ? Math.round(val / statusTotal * 100) : 0;
        const text = `${d.label}: ${val} rides (${pct}%)`;
        row.addEventListener('mouseenter', (e) => showChartTooltip(e, text));
        row.addEventListener('mousemove', (e) => positionChartTooltip(e, getChartTooltip()));
        row.addEventListener('mouseleave', hideChartTooltip);
      });
    }
  } catch (e) { console.error('Analytics frequency error:', e); }
}

async function loadAnalyticsHotspots() {
  try {
    const res = await fetch('/api/analytics/hotspots' + getAnalyticsDateParams());
    if (!res.ok) return;
    const data = await res.json();
    renderHotspotList('hotspot-pickups', data.topPickups, '', 'pickups');
    renderHotspotList('hotspot-dropoffs', data.topDropoffs, 'darkgold', 'dropoffs');
    renderHotspotList('hotspot-routes', data.topRoutes, 'gold', 'trips');
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
        loadFleetVehicles();
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

  // Navigation is initialized via rideops-utils.js initSidebar() + initSubTabs() in index.html

  // Ride filter pills
  document.querySelectorAll('#rides-filter-bar .filter-pill[data-ride-status]').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#rides-filter-bar .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      rideStatusFilter = pill.dataset.rideStatus;
      renderRideLists();
    });
  });

  // Rides date filter
  const ridesDateFilterInput = document.getElementById('rides-date-filter');
  if (ridesDateFilterInput) {
    ridesDateFilterInput.addEventListener('change', () => {
      ridesDateFilter = ridesDateFilterInput.value || '';
      renderRideLists();
    });
  }

  // Ride text filter input
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

  // Admin drawer close events
  const drawerCloseBtn = document.getElementById('admin-drawer-close');
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeAdminDrawer);
  const drawerBackdrop = document.getElementById('admin-drawer-backdrop');
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeAdminDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('admin-drawer')?.classList.contains('open')) {
      closeAdminDrawer();
    }
  });

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

  // Fix FullCalendar day header overlap when Staff panel first becomes visible
  document.querySelector('.ro-nav-item[data-target="staff-panel"]')?.addEventListener('click', () => {
    if (shiftCalendar) requestAnimationFrame(() => shiftCalendar.updateSize());
  });

  setInterval(loadRides, 5000);
  setInterval(loadVehicles, 15000);
  setInterval(renderDriverConsole, 1000);
  setInterval(renderSchedule, 5000);
});
