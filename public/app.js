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
  pending: 'schedule', approved: 'check_circle', scheduled: 'calendar_today',
  driver_on_the_way: 'directions_car', driver_arrived_grace: 'person_pin_circle',
  completed: 'check_circle', no_show: 'warning', denied: 'block', cancelled: 'cancel'
};

function statusTag(status) {
  const icon = STATUS_ICONS[status];
  const iconHtml = icon ? `<span class="material-symbols-outlined">${icon}</span>` : '';
  return `<span class="status-tag ${status}">${iconHtml}${statusLabel(status)}</span>`;
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
let scheduleMode = 'weekly';
let adminUsers = [];
let filteredAdminUsers = [];
let selectedAdminUser = null;
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
  const brandCollapsed = document.querySelector('.brand-collapsed');
  if (brandCollapsed) brandCollapsed.textContent = tenantConfig.orgInitials;
  const headerTitle = document.getElementById('header-title');
  if (headerTitle) headerTitle.textContent = tenantConfig.orgName + ' Operations Console';
  const headerSub = document.getElementById('header-subtitle');
  if (headerSub) headerSub.textContent = 'Dispatch + Driver tools for ' + tenantConfig.orgTagline;
  const wrappedTitle = document.getElementById('dart-wrapped-title');
  if (wrappedTitle) wrappedTitle.textContent = tenantConfig.orgShortName + ' Wrapped';
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
  populateEmployeeSelects();
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
    const isSelf = u.id === currentUser.id;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><a href="#" data-user="${u.id}" class="admin-user-link">${u.name || ''}</a></td>
      <td><a href="#" data-user="${u.id}" class="admin-user-link">${u.username || ''}</a></td>
      <td>${u.role}</td>
      <td><a href="#" data-user="${u.id}" class="admin-user-link">${u.email || ''}</a></td>
      <td><a href="#" data-user="${u.id}" class="admin-user-link">${u.usc_id || ''}</a></td>
      <td>${u.phone || ''}</td>
      <td class="admin-actions-cell"><button class="btn secondary small admin-edit-btn">Edit</button><button class="btn secondary small admin-reset-pw-btn">Reset PW</button>${isSelf ? '' : '<button class="btn danger small admin-delete-btn">Delete</button>'}</td>
    `;
    tr.querySelectorAll('.admin-user-link').forEach((link) => {
      link.onclick = (e) => { e.preventDefault(); loadUserProfile(u.id); };
    });
    const editBtn = tr.querySelector('.admin-edit-btn');
    if (editBtn) editBtn.onclick = () => showEditUserModal(u);
    const resetBtn = tr.querySelector('.admin-reset-pw-btn');
    if (resetBtn) resetBtn.onclick = () => resetUserPassword(u.id, u.name);
    const deleteBtn = tr.querySelector('.admin-delete-btn');
    if (deleteBtn) deleteBtn.onclick = () => deleteUser(u.id);
    tbody.appendChild(tr);
  });
}

function showEditUserModal(user) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `
    <div class="modal-box">
      <h3>Edit User: ${user.name || user.username}</h3>
      <label>Name<input type="text" id="edit-user-name" value="${user.name || ''}"></label>
      <label>USC Email<input type="email" id="edit-user-email" value="${user.email || ''}"></label>
      <label>Phone<input type="tel" id="edit-user-phone" value="${user.phone || ''}"></label>
      <label>USC ID<input type="text" id="edit-user-uscid" value="${user.usc_id || ''}" maxlength="10"></label>
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
      uscId: overlay.querySelector('#edit-user-uscid').value.trim(),
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

function populateEmployeeSelects() {
  const select = document.getElementById('shift-employee');
  select.innerHTML = '';
  employees.forEach((emp) => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = emp.name;
    select.appendChild(opt);
  });
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

function renderScheduleGrid() {
  renderShiftGrid();
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
      icon: 'calendar_today',
      title: 'No rides on the calendar',
      message: 'Approved and scheduled rides will appear here. Try switching to the Active Rides tab to approve pending requests.',
      actionLabel: 'Go to Active Rides',
      actionHandler: () => {
        const activeTab = document.querySelector('#rides-panel .sub-tab[data-subtarget="rides-active-view"]');
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
              const riderLink = ride.riderId ? `<a href="#" data-user="${ride.riderId}" data-email="${ride.riderEmail || ''}" class="admin-user-link">${ride.riderName}</a>` : ride.riderName;
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

// ----- Daily Schedule View (Shifts + Rides) -----
function initScheduleDate() {
  const dateInput = document.getElementById('schedule-date');
  dateInput.value = formatDateInputLocal(new Date());
  renderSchedule();
}

function changeScheduleDay(delta) {
  const dateInput = document.getElementById('schedule-date');
  const current = getSelectedDate();
  current.setDate(current.getDate() + delta);
  dateInput.value = formatDateInputLocal(current);
  renderSchedule();
  renderShiftGrid();
}

function changeScheduleWeek(deltaWeeks) {
  const dateInput = document.getElementById('schedule-date');
  const current = getSelectedDate();
  current.setDate(current.getDate() + deltaWeeks * 7);
  dateInput.value = formatDateInputLocal(current);
  renderSchedule();
  renderShiftGrid();
}

function onScheduleDateChange() {
  renderSchedule();
  renderShiftGrid();
}

function renderSchedule() {
  if (scheduleMode === 'daily') {
    renderDailySchedule();
  } else {
    renderWeeklySchedule();
  }
}

async function loadUserProfile(userId) {
  const content = document.getElementById('admin-profile-content');
  if (!content) return;
  content.innerHTML = 'Loading...';
  const profileTab = document.querySelector('.nav-btn[data-target="profile-panel"]');
  if (profileTab) profileTab.click();
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
      <button class="btn secondary" id="profile-pw-btn">Update Password</button>
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
      <button class="btn primary" onclick="renderProfileEdit()">Edit Name/Phone</button>
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
      <button class="btn primary" onclick="saveAdminProfile('${selectedAdminUser.id}')">Save</button>
      <button class="btn secondary" onclick="loadUserProfile('${selectedAdminUser.id}')">Cancel</button>
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
function renderDailySchedule() {
  const container = document.getElementById('day-schedule');
  const dateInput = document.getElementById('schedule-date');
  const selectedDate = getSelectedDate();
  const dayOfWeek = (selectedDate.getDay() + 6) % 7; // Convert to Mon=0
  const dateStr = formatDateInputLocal(selectedDate);

  const timeSlots = generateTimeSlots();
  let html = '';

  timeSlots.forEach(slot => {
    // Find shifts covering this time slot
    const activeShifts = shifts.filter(s =>
      s.dayOfWeek === dayOfWeek && s.startTime <= slot && s.endTime > slot
    );

    // Find rides at this time
    const slotRides = rides.filter(r => {
      if (!isRideOnDate(r, selectedDate)) return false;
      const rideTime = new Date(r.requestedTime);
      const rideSlot = getSlotInfo(rideTime).slot;
      return rideSlot === slot && isRenderableRideStatus(r.status);
    });

    if (activeShifts.length || slotRides.length) {
      html += `<div class="schedule-row"><div class="time-label">${slot}</div><div class="slots">`;
      activeShifts.forEach(s => {
        const emp = employees.find(e => e.id === s.employeeId);
        const name = emp?.name || 'Unknown';
        const clickable = emp ? `<a href="#" data-user="${emp.id}" class="admin-user-link">${name}</a>` : name;
        html += `<span class="schedule-slot shift">${clickable}</span>`;
      });
      slotRides.forEach(r => {
        const riderLink = r.riderId ? `<a href="#" data-user="${r.riderId}" class="admin-user-link">${r.riderName}</a>` : r.riderName;
        const offsetClass = getSlotInfo(new Date(r.requestedTime)).offset === 'mid' ? 'offset-mid' : '';
        html += `<span class="schedule-slot ride ${offsetClass}">${riderLink} (${r.pickupLocation}→${r.dropoffLocation})</span>`;
      });
      html += '</div></div>';
    } else {
      html += `<div class="schedule-row"><div class="time-label">${slot}</div><div class="slots"></div></div>`;
    }
  });

  container.innerHTML = html;
}

function renderWeeklySchedule() {
  const container = document.getElementById('day-schedule');
  const selectedDate = getSelectedDate();
  const weekDates = getWeekDates(selectedDate);
  const timeSlots = generateTimeSlots();
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  let html = '<div class="weekly-table-wrapper"><table class="grid-table ride-schedule-table"><thead><tr><th class="time-col">Time</th>';
  days.forEach((day, idx) => {
    const dateLabel = formatShortDate(weekDates[idx]);
    html += `<th>${day} (${dateLabel})</th>`;
  });
  html += '</tr></thead><tbody>';

  timeSlots.forEach((slot) => {
    html += `<tr><td class="time-col">${slot}</td>`;
    days.forEach((_, idx) => {
      const slotShifts = shifts.filter((s) => s.dayOfWeek === idx && s.startTime <= slot && s.endTime > slot);
      const dateStr = formatDateInputLocal(weekDates[idx]);
      const slotRides = rides.filter((r) => {
        if (!isRideOnDate(r, weekDates[idx])) return false;
        const rideTime = new Date(r.requestedTime);
        const rideSlot = getSlotInfo(rideTime).slot;
        return rideSlot === slot && isRenderableRideStatus(r.status);
      });

      const cellParts = [];
      slotShifts.forEach((s) => {
        const emp = employees.find((e) => e.id === s.employeeId);
        const name = emp?.name || 'Unknown';
        const clickable = emp ? `<a href="#" data-user="${emp.id}" data-email="${emp.email || ''}" class="admin-user-link">${name}</a>` : name;
        cellParts.push(`<span class="schedule-slot shift">${clickable}</span>`);
      });
      slotRides.forEach((r) => {
        const clickable = r.riderId ? `<a href="#" data-user="${r.riderId}" data-email="${r.riderEmail || ''}" class="admin-user-link">${r.riderName}</a>` : r.riderName;
        const offsetClass = getSlotInfo(new Date(r.requestedTime)).offset === 'mid' ? 'offset-mid' : '';
        cellParts.push(`<span class="schedule-slot ride ${offsetClass}">${clickable}</span>`);
      });
      const cellContent = cellParts.length ? `<div class="cell-stack">${cellParts.join('')}</div>` : '';
      html += `<td>${cellContent}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  container.innerHTML = html;
}

function setScheduleMode(mode) {
  scheduleMode = mode;
  updateScheduleToggleUI();
  renderSchedule();
}

function updateScheduleToggleUI() {
  document.querySelectorAll('[data-schedule-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scheduleMode === scheduleMode);
  });
}

// ----- Interactive Shift Grid -----
let shiftGridDragging = false;
let shiftGridStart = null;

function renderShiftGrid() {
  const grid = document.getElementById('shift-grid');
  const timeSlots = generateTimeSlots();
  const selectedDate = getSelectedDate();
  const weekDates = getWeekDates(selectedDate);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const empId = document.getElementById('shift-employee').value;

  let html = '<div class="header-cell"></div>';
  days.forEach((d, idx) => {
    const dateLabel = formatShortDate(weekDates[idx]);
    html += `<div class="header-cell">${d} (${dateLabel})</div>`;
  });

  timeSlots.forEach((slot, rowIdx) => {
    html += `<div class="time-cell">${slot}</div>`;
    days.forEach((_, dayIdx) => {
      const hasShift = shifts.some(s => s.employeeId === empId && s.dayOfWeek === dayIdx && s.startTime <= slot && s.endTime > slot);
      html += `<div class="grid-cell${hasShift ? ' has-shift' : ''}" data-day="${dayIdx}" data-slot="${slot}" data-row="${rowIdx}"></div>`;
    });
  });

  grid.innerHTML = html;

  // Add drag listeners
  grid.querySelectorAll('.grid-cell').forEach(cell => {
    cell.addEventListener('mousedown', onShiftGridMouseDown);
    cell.addEventListener('mouseenter', onShiftGridMouseEnter);
    cell.addEventListener('click', onShiftGridClick);
  });
}

function onShiftGridMouseDown(e) {
  shiftGridDragging = true;
  shiftGridStart = { day: e.target.dataset.day, row: parseInt(e.target.dataset.row) };
  e.target.classList.add('selected');
}

function onShiftGridMouseEnter(e) {
  if (!shiftGridDragging || !shiftGridStart) return;
  const grid = document.getElementById('shift-grid');
  grid.querySelectorAll('.grid-cell.selected').forEach(c => c.classList.remove('selected'));

  const currentRow = parseInt(e.target.dataset.row);
  const day = shiftGridStart.day;
  const minRow = Math.min(shiftGridStart.row, currentRow);
  const maxRow = Math.max(shiftGridStart.row, currentRow);

  grid.querySelectorAll(`.grid-cell[data-day="${day}"]`).forEach(cell => {
    const row = parseInt(cell.dataset.row);
    if (row >= minRow && row <= maxRow) cell.classList.add('selected');
  });
}

async function onShiftGridClick(e) {
  if (e.target.classList.contains('has-shift')) {
    // Remove shift on click
    const empId = document.getElementById('shift-employee').value;
    const day = parseInt(e.target.dataset.day);
    const slot = e.target.dataset.slot;
    const shiftToRemove = shifts.find(s => s.employeeId === empId && s.dayOfWeek === day && s.startTime <= slot && s.endTime > slot);
    if (shiftToRemove) {
      await fetch(`/api/shifts/${shiftToRemove.id}`, { method: 'DELETE' });
      await loadShifts();
    }
  }
}

document.addEventListener('mouseup', async () => {
  if (!shiftGridDragging) return;
  shiftGridDragging = false;

  const grid = document.getElementById('shift-grid');
  const selected = Array.from(grid.querySelectorAll('.grid-cell.selected')).filter(c => !c.classList.contains('has-shift'));

  if (selected.length) {
    const empId = document.getElementById('shift-employee').value;
    const day = parseInt(selected[0].dataset.day);
    const slots = selected.map(c => c.dataset.slot).sort();
    const startTime = slots[0];
    const timeSlots = generateTimeSlots();
    const lastIdx = timeSlots.indexOf(slots[slots.length - 1]);
    const endTime = timeSlots[lastIdx + 1] || '19:00';

    await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: empId, dayOfWeek: day, startTime, endTime })
    });
    await loadShifts();
  }

  grid.querySelectorAll('.grid-cell.selected').forEach(c => c.classList.remove('selected'));
  shiftGridStart = null;
});

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
    <div>${statusTag(ride.status)}${cancelledByOffice ? ' <span class="small-text">(cancelled by office)</span>' : ''} <strong><a href="#" data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="admin-user-link">${ride.riderName}</a></strong></div>
    <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
    <div class="small-text">When: ${formatDate(ride.requestedTime)}</div>
    <div class="small-text">Misses: ${ride.consecutiveMisses || 0}</div>
    ${ride.vehicleId ? `<div class="small-text">Cart: ${vehicles.find(v => v.id === ride.vehicleId)?.name || ride.vehicleId}</div>` : ''}
  `;
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
      <div><strong><a href="#" data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="admin-user-link">${ride.riderName}</a></strong></div>
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
      <div><span class="status-tag pending">Pending</span> <strong><a href="#" data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="admin-user-link">${ride.riderName}</a></strong> (${ride.riderEmail})</div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">Requested: ${formatDate(ride.requestedTime)}</div>
      ${terminated ? '<div class="alert">SERVICE TERMINATED after five consecutive no-shows.</div>' : ''}
      <div class="flex-row">
        <button class="btn primary" ${terminated ? 'disabled' : ''}>Approve</button>
        <button class="btn" data-role="deny">Deny</button>
      </div>
    `;
    item.querySelector('.btn.primary').onclick = () => updateRide(`/api/rides/${ride.id}/approve`);
    item.querySelector('[data-role="deny"]').onclick = () => updateRide(`/api/rides/${ride.id}/deny`);
    item.querySelector('.flex-row').appendChild(buildCancelButton(ride, () => loadRides()));
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
    const driverDisplay = ride.assignedDriverId ? `<span class="ride-driver-prominent">${driverName}</span>` : driverName;
    item.innerHTML = `
      <div>${statusTag(ride.status)} <strong><a href="#" data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="admin-user-link">${ride.riderName}</a></strong></div>
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
      const cancelBtn = buildCancelButton(ride, () => loadRides());
      cancelBtn.classList.add('small');
      actionRow.appendChild(unassignBtn);
      actionRow.appendChild(buildReassignDropdown(ride, ride.assignedDriverId, () => loadRides()));
      actionRow.appendChild(cancelBtn);
      item.appendChild(actionRow);
    }

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

  // Wire profile links
  document.querySelectorAll('.admin-user-link').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.dataset.user;
      const email = a.dataset.email;
      openProfileById(id || email);
    });
  });
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
      <span class="driver-card-name">${emp.name}</span>
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
  clockBtn.className = driver.active ? 'btn secondary' : 'btn primary';
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
          <div><strong>${ride.riderName}</strong></div>
          <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
          <div class="small-text">Time: ${formatDate(ride.requestedTime)}</div>
        `;
        const claimBtn = document.createElement('button');
        claimBtn.className = 'btn primary';
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
      <div>${statusTag(ride.status)} <strong><a href="#" data-user="${ride.riderId || ''}" class="admin-user-link">${ride.riderName}</a></strong></div>
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
      onWayBtn.className = 'btn primary';
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
      hereBtn.className = 'btn secondary';
      hereBtn.textContent = "I'm Here";
      hereBtn.onclick = () => updateRide(`/api/rides/${ride.id}/here`);
      actions.appendChild(hereBtn);

      const completeBtn = document.createElement('button');
      completeBtn.className = 'btn primary';
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
      noShowBtn.className = 'btn danger';
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
      adminActions.appendChild(buildCancelButton(ride, () => loadRides()));
      item.appendChild(adminActions);
    }
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
    item.innerHTML = `
      <div>
        ${statusTag(ride.status)}
        <strong>${ride.riderName}</strong>
      </div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">Time: ${formatDate(ride.requestedTime)} | Driver: ${driverName}</div>
    `;
    if (ride.assignedDriverId) {
      const viewLink = document.createElement('a');
      viewLink.href = '#';
      viewLink.className = 'small-text';
      viewLink.style.fontWeight = '700';
      viewLink.style.color = 'var(--cardinal)';
      viewLink.textContent = 'View driver';
      viewLink.onclick = (e) => {
        e.preventDefault();
        selectedDriverId = ride.assignedDriverId;
        renderDriverConsole();
        document.getElementById('driver-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      item.appendChild(viewLink);
      item.appendChild(buildCancelButton(ride, () => loadRides()));
    } else {
      item.appendChild(buildAssignDropdown(ride, () => loadRides()));
    }
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
    loadUserProfile(currentUser?.id);
    return;
  }
  let targetId = id;
  if (currentUser?.role === 'office' && Array.isArray(adminUsers) && adminUsers.length) {
    const found = adminUsers.find((u) => u.id === id || u.email === id || u.username === id);
    if (found) targetId = found.id;
  }
  loadUserProfile(targetId);
}

function showRulesModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:600px;">
      <div class="modal-title">Program Rules &amp; Guidelines</div>
      <ul style="padding-left:20px; line-height:1.8; color:var(--muted); font-size:14px;">
        <li>${tenantConfig?.orgShortName || 'DART'} is a free service provided by USC Transportation to assist USC students, faculty and staff with mobility issues in getting around campus. Service is available at UPC during the Fall and Spring semesters only, between 8:00am\u20137:00pm, Monday\u2013Friday.</li>
        <li>${tenantConfig?.orgShortName || 'DART'} vehicles (golf carts) are not city-street legal and cannot leave campus. Service is NOT available to off-campus housing, off-campus parking structures, the USC Village, etc.</li>
        <li>Riders must be able to independently get in and out of a standard golf cart. Drivers cannot assist with lifting/carrying medical equipment (crutches, wheelchairs, etc.). A wheelchair-accessible golf cart is available upon request.</li>
        <li>Due to high demand, drivers cannot wait more than five (5) minutes past a scheduled pick-up time. After that grace period, they may leave to continue other assignments.</li>
        <li>Service is automatically terminated after five (5) consecutive missed pick-ups.</li>
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

function initSubTabs() {
  document.querySelectorAll('.sub-tabs').forEach((strip) => {
    strip.querySelectorAll('.sub-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        strip.querySelectorAll('.sub-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const panel = strip.closest('.tab-panel') || strip.parentElement;
        panel.querySelectorAll(':scope > .sub-panel').forEach((p) => p.style.display = 'none');
        const target = document.getElementById(btn.dataset.subtarget);
        if (target) target.style.display = 'block';
      });
    });
  });
}

function toggleSidebar() {
  const shell = document.querySelector('.shell');
  const nav = document.querySelector('.side-nav');
  const btn = document.querySelector('.sidebar-toggle');
  const collapsed = nav.classList.toggle('collapsed');
  shell.classList.toggle('sidebar-collapsed', collapsed);
  btn.textContent = collapsed ? '\u00BB' : '\u00AB';
  localStorage.setItem('dart-sidebar-collapsed', collapsed ? '1' : '');
}

function initTabs() {
  const buttons = document.querySelectorAll('.nav-btn[data-target]');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(btn.dataset.target);
      if (panel) panel.classList.add('active');
    });
  });
}

function showTab(panelId) {
  const buttons = document.querySelectorAll('.nav-btn[data-target]');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach((b) => b.classList.remove('active'));
  panels.forEach((p) => p.classList.remove('active'));
  const matchBtn = document.querySelector(`.nav-btn[data-target="${panelId}"]`);
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
      actionButtons = `<button class="btn secondary small" onclick="reactivateVehicle('${v.id}', '${escapedName}')">Reactivate</button>`;
    } else if (v.rideCount > 0) {
      actionButtons = `<button class="btn secondary small" onclick="logVehicleMaintenance('${v.id}')">Log Maintenance</button>
        <button class="btn secondary small" onclick="retireVehicle('${v.id}', '${escapedName}')">Retire</button>`;
    } else {
      actionButtons = `<button class="btn secondary small" onclick="logVehicleMaintenance('${v.id}')">Log Maintenance</button>
        <button class="btn danger small" onclick="deleteVehicle('${v.id}', '${escapedName}')">Delete</button>`;
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
  // Global profile link handler
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.admin-user-link');
    if (link) {
      e.preventDefault();
      const id = link.dataset.user;
      openProfileById(id);
    }
  });

  initTabs();
  initSubTabs();
  // Restore sidebar collapsed state
  if (localStorage.getItem('dart-sidebar-collapsed') === '1') {
    document.querySelector('.side-nav')?.classList.add('collapsed');
    document.querySelector('.shell')?.classList.add('sidebar-collapsed');
    const sidebarBtn = document.querySelector('.sidebar-toggle');
    if (sidebarBtn) sidebarBtn.textContent = '\u00BB';
  }
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
  initScheduleDate();
  updateScheduleToggleUI();

  // Re-render shift grid when employee changes
  document.getElementById('shift-employee').addEventListener('change', renderShiftGrid);
  const shiftProfileBtn = document.getElementById('shift-employee-profile');
  if (shiftProfileBtn) {
    shiftProfileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = document.getElementById('shift-employee').value;
      openProfileById(id);
    });
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

  const analyticsNavBtn = document.querySelector('.nav-btn[data-target="analytics-panel"]');
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
  const fleetNavBtn = document.querySelector('.nav-btn[data-target="fleet-panel"]');
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
  setInterval(renderSchedule, 5000);
});
