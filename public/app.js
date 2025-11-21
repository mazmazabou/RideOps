let employees = [];
let shifts = [];
let rides = [];
let selectedDriverId = null;

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
        <strong>${emp.name}</strong> (${emp.role})
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
  const activeDrivers = employees.filter((e) => e.role === 'driver');
  select.innerHTML = '<option value="">-- Select Driver --</option>';
  activeDrivers.forEach((d) => {
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
  const grid = document.getElementById('schedule-grid');
  const timeSlots = generateTimeSlots();
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  let html = '<table class="grid-table"><thead><tr><th>Time</th>';
  days.forEach((d) => (html += `<th>${d}</th>`));
  html += '</tr></thead><tbody>';
  timeSlots.forEach((slot) => {
    html += `<tr><td>${slot}</td>`;
    days.forEach((_, idx) => {
      const onShift = shifts.filter((s) => s.dayOfWeek === idx && s.startTime <= slot && s.endTime >= slot);
      const names = onShift.map((s) => {
        const emp = employees.find((e) => e.id === s.employeeId);
        return emp ? emp.name : 'Unknown';
      });
      html += `<td>${names.join('<br>')}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  grid.innerHTML = html;
}

// ----- Ride Lists -----
function renderRideLists() {
  const pendingEl = document.getElementById('pending-items');
  const approvedEl = document.getElementById('approved-items');
  const historyEl = document.getElementById('history-items');
  pendingEl.innerHTML = '';
  approvedEl.innerHTML = '';
  historyEl.innerHTML = '';

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
    const driverSelect = buildDriverDropdown(ride.assignedDriverId);
    const driverName = employees.find((e) => e.id === ride.assignedDriverId)?.name || 'Unassigned';
    item.innerHTML = `
      <div><span class="status-tag ${ride.status}">${ride.status.replace(/_/g, ' ')}</span> <strong>${ride.riderName}</strong></div>
      <div>${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="small-text">When: ${formatDate(ride.requestedTime)}</div>
      <div class="small-text">Driver: ${driverName}</div>
      <div class="flex-row driver-assign"></div>
    `;
    const assignWrap = item.querySelector('.driver-assign');
    assignWrap.appendChild(driverSelect);
    const assignBtn = document.createElement('button');
    assignBtn.className = 'btn primary';
    assignBtn.textContent = 'Assign Driver';
    assignBtn.onclick = () => assignDriver(ride.id, driverSelect.value);
    assignWrap.appendChild(assignBtn);
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

function buildDriverDropdown(selected) {
  const select = document.createElement('select');
  const activeDrivers = employees.filter((e) => e.role === 'driver' && e.active);
  activeDrivers.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.name;
    if (selected === d.id) opt.selected = true;
    select.appendChild(opt);
  });
  if (!activeDrivers.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No drivers clocked in';
    select.appendChild(opt);
  }
  return select;
}

async function updateRide(url) {
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    alert(err.error || 'Failed to update ride');
  }
  await loadRides();
}

async function assignDriver(rideId, driverId) {
  const res = await fetch(`/api/rides/${rideId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId })
  });
  if (!res.ok) {
    const err = await res.json();
    alert(err.error || 'Cannot assign driver');
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
  const driverRides = rides.filter((r) => r.assignedDriverId === driver.id && r.requestedTime?.startsWith(today));
  if (!driverRides.length) {
    list.innerHTML = '<p class="small-text">No rides assigned for today.</p>';
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
  const rideForm = document.getElementById('ride-form');

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

  rideForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      riderName: document.getElementById('rider-name').value,
      riderEmail: document.getElementById('rider-email').value,
      riderPhone: document.getElementById('rider-phone').value,
      pickupLocation: document.getElementById('pickup').value,
      dropoffLocation: document.getElementById('dropoff').value,
      requestedTime: document.getElementById('requested-time').value
    };
    await fetch('/api/rides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    rideForm.reset();
    await loadRides();
  });

  const driverSelect = document.getElementById('driver-select');
  driverSelect.addEventListener('change', (e) => {
    selectedDriverId = e.target.value || null;
    renderDriverConsole();
  });
}

// ----- Helpers -----
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// ----- Initialize -----
document.addEventListener('DOMContentLoaded', async () => {
  initForms();
  await loadEmployees();
  await loadShifts();
  await loadRides();
  setInterval(loadRides, 5000);
  setInterval(renderDriverConsole, 1000);
});
