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
let selectedDriverId = null;
let scheduleMode = 'weekly';
let adminUsers = [];
let filteredAdminUsers = [];
let selectedAdminUser = null;
let rideScheduleAnchor = new Date();

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
  const res = await fetch('/api/employees');
  employees = await res.json();
  renderEmployees();
  populateEmployeeSelects();
}

async function loadShifts() {
  const res = await fetch('/api/shifts');
  shifts = await res.json();
  renderScheduleGrid();
}

async function loadRides() {
  const res = await fetch('/api/rides');
  rides = await res.json();
  renderRideLists();
  renderRideScheduleGrid();
  renderDriverConsole();
}

async function loadAdminUsers() {
  if (!currentUser || currentUser.role !== 'office') return;
  const res = await fetch('/api/admin/users');
  adminUsers = await res.json();
  filteredAdminUsers = adminUsers;
  renderAdminUsers(filteredAdminUsers);
}

function renderAdminUsers(users) {
  const tbody = document.querySelector('#admin-users-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><a href="#" data-user="${u.id}" class="admin-user-link">${u.name || ''}</a></td>
      <td><a href="#" data-user="${u.id}" class="admin-user-link">${u.username || ''}</a></td>
      <td>${u.role}</td>
      <td><a href="#" data-user="${u.id}" class="admin-user-link">${u.email || ''}</a></td>
      <td><a href="#" data-user="${u.id}" class="admin-user-link">${u.usc_id || ''}</a></td>
      <td>${u.phone || ''}</td>
      <td>${u.id === currentUser.id ? '' : '<button class="btn danger" data-id="' + u.id + '">Delete</button>'}</td>
    `;
    tr.querySelectorAll('.admin-user-link').forEach((link) => {
      link.onclick = (e) => { e.preventDefault(); loadUserProfile(u.id); };
    });
    const btn = tr.querySelector('button');
    if (btn) btn.onclick = () => deleteUser(u.id);
    tbody.appendChild(tr);
  });
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

async function searchByUSCID() {
  const input = document.getElementById('admin-usc-search');
  const resEl = document.getElementById('admin-search-result');
  if (!input || !resEl) return;
  const val = input.value.trim();
  if (!/^[0-9]{10}$/.test(val)) {
    resEl.textContent = 'Please enter a 10-digit USC ID.';
    return;
  }
  const res = await fetch(`/api/admin/users/search?usc_id=${val}`);
  if (!res.ok) {
    resEl.textContent = 'No user found.';
    filteredAdminUsers = adminUsers;
    renderAdminUsers(filteredAdminUsers);
    return;
  }
  const user = await res.json();
  resEl.textContent = `${user.name} (${user.role}) — ${user.email || ''}`;
  filteredAdminUsers = adminUsers.filter((u) => u.id === user.id);
  renderAdminUsers(filteredAdminUsers);
  loadUserProfile(user.id);
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
    if (msg) msg.textContent = 'User created';
    ['admin-new-name','admin-new-email','admin-new-phone','admin-new-uscid','admin-new-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    await loadAdminUsers();
    renderAdminUsers(adminUsers);
  } catch {
    if (msg) msg.textContent = 'Network error';
  }
}

// ----- Employee UI -----
function renderEmployees() {
  const container = document.getElementById('employee-list');
  container.innerHTML = '<h3>Employees</h3>';
  employees.forEach((emp) => {
    const row = document.createElement('div');
    row.className = 'employee-row' + (emp.active ? ' active' : '');
    row.innerHTML = `
      <div>
        <strong>${emp.name}</strong>
        ${emp.active ? '<span class="badge">On shift</span>' : ''}
      </div>
      <div class="flex-row">
        <button class="btn secondary" data-action="clock-in">Clock In</button>
        <button class="btn" data-action="clock-out">Clock Out</button>
      </div>
    `;
    row.querySelector('strong').style.cursor = 'pointer';
    row.querySelector('strong').onclick = () => openProfileById(emp.id);
    row.querySelector('[data-action="clock-in"]').onclick = () => clockEmployee(emp.id, true);
    row.querySelector('[data-action="clock-out"]').onclick = () => clockEmployee(emp.id, false);
    container.appendChild(row);
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
    grid.innerHTML = '<p class="small-text">No rides scheduled in this window. Approve rides to plot them on the weekly grid.</p>';
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
        : '<span class="empty-cell">—</span>';
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
    <div>
      <h4>Upcoming Rides</h4>
      ${upcomingList}
    </div>
    <div>
      <h4>Recent Rides</h4>
      ${pastList}
    </div>
  `;
}

function renderProfileRide(ride) {
  return `<div class="item">
    <div><span class="status-tag ${ride.status}">${ride.status.replace(/_/g,' ')}</span> ${ride.pickupLocation} → ${ride.dropoffLocation}</div>
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
      html += `<div class="schedule-row"><div class="time-label">${slot}</div><div class="slots"><span class="small-text">—</span></div></div>`;
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
      const cellContent = cellParts.length ? `<div class="cell-stack">${cellParts.join('')}</div>` : '<span class="empty-cell">—</span>';
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
    item.className = 'item';
    item.innerHTML = `
      <div><strong><a href="#" data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="admin-user-link">${ride.riderName}</a></strong></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">Time: ${formatDate(ride.requestedTime)}</div>
    `;
    item.appendChild(buildAssignDropdown(ride, () => loadRides()));
    unassignedEl.appendChild(item);
  });
  if (!unassigned.length) {
    showEmptyState(unassignedEl, {
      icon: '[]',
      title: rideFilterText ? 'No rides match your filter' : 'No unassigned rides today',
      message: rideFilterText ? '' : 'Approved rides without a driver assignment will appear here.'
    });
  }

  const pendingAll = rides.filter((r) => r.status === 'pending');
  const pending = pendingAll.filter((r) => rideMatchesFilter(r, rideFilterText));
  const approvedAll = rides.filter((r) => ['approved', 'scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(r.status));
  const approved = approvedAll.filter((r) => rideMatchesFilter(r, rideFilterText));
  const historyAll = rides.filter((r) => ['completed', 'no_show', 'denied', 'cancelled'].includes(r.status));
  const history = historyAll.filter((r) => rideMatchesFilter(r, rideFilterText));

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
  if (!pending.length) {
    showEmptyState(pendingEl, {
      icon: '[]',
      title: rideFilterText ? 'No rides match your filter' : 'No pending requests',
      message: rideFilterText ? '' : 'New rider requests waiting for approval will appear here.'
    });
  }

  approved.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item';
    const driverName = employees.find((e) => e.id === ride.assignedDriverId)?.name || 'Unassigned';
    item.innerHTML = `
      <div><span class="status-tag ${ride.status}">${ride.status.replace(/_/g, ' ')}</span> <strong><a href="#" data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="admin-user-link">${ride.riderName}</a></strong></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">When: ${formatDate(ride.requestedTime)}</div>
      <div class="small-text">Driver: ${driverName}</div>
    `;
    const contactRow = document.createElement('div');
    contactRow.className = 'flex-row contact-row';
    contactRow.append(
      buildContactPill('tel', ride.riderPhone, '☎', `Call ${ride.riderName}`),
      buildContactPill('sms', ride.riderPhone, '✉', `Text ${ride.riderName}`)
    );
    item.appendChild(contactRow);

    // Office quick actions
    if (!ride.assignedDriverId) {
      item.appendChild(buildAssignDropdown(ride, () => loadRides()));
    } else if (['scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(ride.status)) {
      if (['driver_on_the_way', 'driver_arrived_grace'].includes(ride.status)) {
        item.appendChild(buildWarningBanner(driverName));
      }
      const actionRow = document.createElement('div');
      actionRow.className = 'flex-row';
      actionRow.style.flexWrap = 'wrap';
      actionRow.appendChild(buildUnassignButton(ride, driverName, () => loadRides()));
      actionRow.appendChild(buildReassignDropdown(ride, ride.assignedDriverId, () => loadRides()));
      actionRow.appendChild(buildCancelButton(ride, () => loadRides()));
      item.appendChild(actionRow);
    }

    approvedEl.appendChild(item);
  });
  if (!approved.length) {
    showEmptyState(approvedEl, {
      icon: '[]',
      title: rideFilterText ? 'No rides match your filter' : 'No approved or scheduled rides',
      message: rideFilterText ? '' : 'Approved rides in progress will show in this section.'
    });
  }

  history.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item';
    const cancelledByOffice = ride.status === 'cancelled' && ride.cancelledBy === 'office';
    item.innerHTML = `
      <div><span class="status-tag ${ride.status}">${ride.status.replace(/_/g, ' ')}</span>${cancelledByOffice ? ' <span class="small-text">(cancelled by office)</span>' : ''} <strong><a href="#" data-user="${ride.riderId || ''}" data-email="${ride.riderEmail || ''}" class="admin-user-link">${ride.riderName}</a></strong></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">When: ${formatDate(ride.requestedTime)}</div>
      <div class="small-text">Misses: ${ride.consecutiveMisses || 0}</div>
    `;
    historyEl.appendChild(item);
  });
  if (!history.length) {
    showEmptyState(historyEl, {
      icon: '[]',
      title: rideFilterText ? 'No rides match your filter' : 'No completed history yet',
      message: rideFilterText ? '' : 'Completed and no-show rides will appear here after dispatch activity.'
    });
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

async function updateRide(url) {
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to update ride', 'error');
  }
  await loadRides();
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
  renderDriverDashboard();
  renderDriverDetail();
  renderAllActiveRides();
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
        currentStatus += ` (grace ${minutes}:${seconds})`;
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
      icon: '[]',
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
      icon: '[]',
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

    const rideInfo = document.createElement('div');
    rideInfo.innerHTML = `
      <div><span class="status-tag ${ride.status}">${ride.status.replace(/_/g, ' ')}</span> <strong><a href="#" data-user="${ride.riderId || ''}" class="admin-user-link">${ride.riderName}</a></strong></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      ${ride.notes ? `<div class="small-text">Notes: ${ride.notes}</div>` : ''}
      <div class="small-text">Time: ${formatDate(ride.requestedTime)}</div>
      <div class="small-text">Rider misses: ${ride.consecutiveMisses || 0}</div>
    `;
    item.appendChild(rideInfo);

    const contactRow = document.createElement('div');
    contactRow.className = 'contact-row';
    contactRow.append(
      buildContactPill('tel', ride.riderPhone, '☎', 'Call'),
      buildContactPill('sms', ride.riderPhone, '✉', 'SMS')
    );
    item.appendChild(contactRow);

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
      onWayBtn.onclick = () => updateRide(`/api/rides/${ride.id}/on-the-way`);
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
      icon: '[]',
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
        <span class="status-tag ${ride.status}">${ride.status.replace(/_/g, ' ')}</span>
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
    ? 'Grace period expired. You may mark a no-show.'
    : `Grace period running (${minutes}:${seconds} remaining)`;
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

function toggleRulesSection(header) {
  const rulesList = document.getElementById('rules-list');
  if (!rulesList) return;
  const isHidden = rulesList.style.display === 'none';
  rulesList.style.display = isHidden ? 'block' : 'none';
  const btn = header.querySelector('.toggle-btn-slim');
  if (btn) btn.innerHTML = isHidden ? '&#9662;' : '&#9656;';
}

function initTabs() {
  const buttons = document.querySelectorAll('.nav-btn');
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

// ----- Initialize -----
document.addEventListener('DOMContentLoaded', async () => {
  if (!await checkAuth()) return;
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
  await initForms();

  // Ride filter input
  const rideFilterInput = document.getElementById('ride-filter-input');
  if (rideFilterInput) {
    rideFilterInput.addEventListener('input', debounce(() => {
      rideFilterText = rideFilterInput.value.trim();
      renderRideLists();
    }, 300));
  }

  await loadEmployees();
  await loadShifts();
  await loadRides();
  await loadAdminUsers();
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

  const searchBtn = document.getElementById('admin-usc-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', searchByUSCID);
  }
  const createBtn = document.getElementById('admin-create-btn');
  if (createBtn) createBtn.addEventListener('click', createAdminUser);
  const ridePrev = document.getElementById('ride-week-prev');
  const rideNext = document.getElementById('ride-week-next');
  if (ridePrev) ridePrev.addEventListener('click', () => changeRideWeek(-1));
  if (rideNext) rideNext.addEventListener('click', () => changeRideWeek(1));

  setInterval(loadRides, 5000);
  setInterval(renderDriverConsole, 1000);
  setInterval(renderSchedule, 5000);
});
