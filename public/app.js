let employees = [];
let shifts = [];
let rides = [];
let selectedDriverId = null;

// ----- Auth -----
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/login'; return false; }
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
  renderDriverSelect();
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
  renderDriverConsole();
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

function renderDriverSelect() {
  const select = document.getElementById('driver-select');
  select.innerHTML = '<option value="">-- Select Driver --</option>';
  employees.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = `${d.name}${d.active ? ' (clocked in)' : ''}`;
    select.appendChild(opt);
  });
  select.value = selectedDriverId || '';
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

// ----- Daily Schedule View (Shifts + Rides) -----
function initScheduleDate() {
  const dateInput = document.getElementById('schedule-date');
  dateInput.value = new Date().toISOString().split('T')[0];
  renderDaySchedule();
}

function changeScheduleDay(delta) {
  const dateInput = document.getElementById('schedule-date');
  const current = new Date(dateInput.value);
  current.setDate(current.getDate() + delta);
  dateInput.value = current.toISOString().split('T')[0];
  renderDaySchedule();
}

function renderDaySchedule() {
  const container = document.getElementById('day-schedule');
  const dateInput = document.getElementById('schedule-date');
  const selectedDate = new Date(dateInput.value);
  const dayOfWeek = (selectedDate.getDay() + 6) % 7; // Convert to Mon=0
  const dateStr = dateInput.value;

  const timeSlots = generateTimeSlots();
  let html = '';

  timeSlots.forEach(slot => {
    // Find shifts covering this time slot
    const activeShifts = shifts.filter(s =>
      s.dayOfWeek === dayOfWeek && s.startTime <= slot && s.endTime > slot
    );

    // Find rides at this time
    const slotRides = rides.filter(r => {
      if (!r.requestedTime?.startsWith(dateStr)) return false;
      const rideTime = new Date(r.requestedTime);
      const rideHour = rideTime.getHours();
      const rideMin = rideTime.getMinutes();
      const rideSlot = `${String(rideHour).padStart(2,'0')}:${rideMin < 30 ? '00' : '30'}`;
      return rideSlot === slot && ['pending','approved','scheduled','driver_on_the_way','driver_arrived_grace'].includes(r.status);
    });

    if (activeShifts.length || slotRides.length) {
      html += `<div class="schedule-row"><div class="time-label">${slot}</div><div class="slots">`;
      activeShifts.forEach(s => {
        const emp = employees.find(e => e.id === s.employeeId);
        html += `<span class="schedule-slot shift">${emp?.name || 'Unknown'}</span>`;
      });
      slotRides.forEach(r => {
        html += `<span class="schedule-slot ride">${r.riderName} (${r.pickupLocation}→${r.dropoffLocation})</span>`;
      });
      html += '</div></div>';
    } else {
      html += `<div class="schedule-row"><div class="time-label">${slot}</div><div class="slots"><span class="small-text">—</span></div></div>`;
    }
  });

  container.innerHTML = html;
}

// ----- Interactive Shift Grid -----
let shiftGridDragging = false;
let shiftGridStart = null;

function renderShiftGrid() {
  const grid = document.getElementById('shift-grid');
  const timeSlots = generateTimeSlots();
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const empId = document.getElementById('shift-employee').value;

  let html = '<div class="header-cell"></div>';
  days.forEach(d => html += `<div class="header-cell">${d}</div>`);

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
  const today = new Date().toISOString().split('T')[0];
  const unassigned = rides.filter((r) => r.status === 'approved' && !r.assignedDriverId && r.requestedTime?.startsWith(today));
  unassigned.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <div><strong>${ride.riderName}</strong></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">Time: ${formatDate(ride.requestedTime)}</div>
    `;
    unassignedEl.appendChild(item);
  });
  if (!unassigned.length) {
    unassignedEl.innerHTML = '<p class="small-text">No unassigned rides for today.</p>';
  }

  const pending = rides.filter((r) => r.status === 'pending');
  const approved = rides.filter((r) => ['approved', 'scheduled', 'driver_on_the_way', 'driver_arrived_grace'].includes(r.status));
  const history = rides.filter((r) => ['completed', 'no_show', 'denied'].includes(r.status));

  pending.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item';
    const terminated = ride.consecutiveMisses >= 5;
    item.innerHTML = `
      <div><span class="status-tag pending">Pending</span> <strong>${ride.riderName}</strong> (${ride.riderEmail})</div>
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
    pendingEl.appendChild(item);
  });

  approved.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item';
    const driverName = employees.find((e) => e.id === ride.assignedDriverId)?.name || 'Unassigned';
    item.innerHTML = `
      <div><span class="status-tag ${ride.status}">${ride.status.replace(/_/g, ' ')}</span> <strong>${ride.riderName}</strong></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">When: ${formatDate(ride.requestedTime)}</div>
      <div class="small-text">Driver: ${driverName}</div>
    `;
    approvedEl.appendChild(item);
  });

  history.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <div><span class="status-tag ${ride.status}">${ride.status.replace(/_/g, ' ')}</span> <strong>${ride.riderName}</strong></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">When: ${formatDate(ride.requestedTime)}</div>
      <div class="small-text">Misses: ${ride.consecutiveMisses || 0}</div>
    `;
    historyEl.appendChild(item);
  });
}

async function updateRide(url) {
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    alert(err.error || 'Failed to update ride');
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
    alert(err.error || 'Cannot claim ride');
  }
  await loadRides();
}

// ----- Driver Console -----
function renderDriverConsole() {
  const info = document.getElementById('driver-info');
  const list = document.getElementById('driver-ride-list');
  info.innerHTML = '';
  list.innerHTML = '';
  const driver = employees.find((e) => e.id === selectedDriverId);
  if (!driver) {
    info.innerHTML = '<p class="small-text">Select a driver to view assignments.</p>';
    return;
  }
  info.innerHTML = `<p><strong>${driver.name}</strong> — ${driver.active ? 'Clocked in' : 'Clocked out'}</p>`;
  if (!driver.active) {
    list.innerHTML = '<p class="alert">Driver must be clocked in to view and action rides.</p>';
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  // Show claimable rides (approved, unassigned, today)
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

  const driverRides = rides.filter((r) => r.assignedDriverId === driver.id && r.requestedTime?.startsWith(today));
  if (!driverRides.length && !claimable.length) {
    list.innerHTML = '<p class="small-text">No rides assigned or available for today.</p>';
    return;
  }
  if (!driverRides.length) {
    return;
  }

  driverRides.forEach((ride) => {
    const item = document.createElement('div');
    item.className = 'item';
    const graceInfo = buildGraceInfo(ride);
    item.innerHTML = `
      <div><span class="status-tag ${ride.status}">${ride.status.replace(/_/g, ' ')}</span> <strong>${ride.riderName}</strong></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">Time: ${formatDate(ride.requestedTime)}</div>
      <div class="small-text">Rider misses: ${ride.consecutiveMisses || 0}</div>
    `;
    const actions = document.createElement('div');
    actions.className = 'flex-row';

    const onWayBtn = document.createElement('button');
    onWayBtn.className = 'btn primary';
    onWayBtn.textContent = 'Driver on the way';
    onWayBtn.onclick = () => updateRide(`/api/rides/${ride.id}/on-the-way`);
    actions.appendChild(onWayBtn);

    const hereBtn = document.createElement('button');
    hereBtn.className = 'btn secondary';
    hereBtn.textContent = 'Driver here (start 5-min grace)';
    hereBtn.onclick = () => updateRide(`/api/rides/${ride.id}/here`);
    actions.appendChild(hereBtn);

    const completeBtn = document.createElement('button');
    completeBtn.className = 'btn primary';
    completeBtn.textContent = 'Complete ride';
    completeBtn.onclick = () => updateRide(`/api/rides/${ride.id}/complete`);
    actions.appendChild(completeBtn);

    const noShowBtn = document.createElement('button');
    noShowBtn.className = 'btn danger';
    noShowBtn.textContent = 'Mark no-show';
    const { canNoShow } = graceInfo;
    noShowBtn.disabled = !canNoShow;
    noShowBtn.onclick = () => updateRide(`/api/rides/${ride.id}/no-show`);
    actions.appendChild(noShowBtn);

    if (graceInfo.message) {
      const message = document.createElement('div');
      message.className = 'small-text';
      message.textContent = graceInfo.message;
      item.appendChild(message);
    }

    item.appendChild(actions);
    list.appendChild(item);
  });
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
function initForms() {
  const shiftForm = document.getElementById('shift-form');

  // Populate time options
  const startSelect = document.getElementById('shift-start');
  const endSelect = document.getElementById('shift-end');
  generateTimeSlots().forEach((slot) => {
    const opt1 = document.createElement('option');
    opt1.value = slot;
    opt1.textContent = slot;
    startSelect.appendChild(opt1);
    const opt2 = document.createElement('option');
    opt2.value = slot;
    opt2.textContent = slot;
    endSelect.appendChild(opt2);
  });

  shiftForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      employeeId: document.getElementById('shift-employee').value,
      dayOfWeek: Number(document.getElementById('shift-day').value),
      startTime: document.getElementById('shift-start').value,
      endTime: document.getElementById('shift-end').value
    };
    await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    shiftForm.reset();
    await loadShifts();
  });

  const driverSelect = document.getElementById('driver-select');
  driverSelect.addEventListener('change', (e) => {
    selectedDriverId = e.target.value || null;
    renderDriverConsole();
  });

  // Dev: Load sample rides button
  const loadSampleBtn = document.getElementById('load-sample-rides');
  if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', async () => {
      const res = await fetch('/api/dev/seed-rides', { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'Sample rides loaded');
      await loadRides();
    });
  }
}

// ----- Helpers -----
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// ----- Initialize -----
document.addEventListener('DOMContentLoaded', async () => {
  if (!await checkAuth()) return;
  initForms();
  await loadEmployees();
  await loadShifts();
  await loadRides();
  initScheduleDate();

  // Re-render shift grid when employee changes
  document.getElementById('shift-employee').addEventListener('change', renderShiftGrid);

  setInterval(loadRides, 5000);
  setInterval(renderDriverConsole, 1000);
  setInterval(renderDaySchedule, 5000);
});
