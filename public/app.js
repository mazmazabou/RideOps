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
  renderRideSchedule();
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

// ----- Ride Schedule -----
function renderRideSchedule() {
  const grid = document.getElementById('ride-schedule-grid');
  const timeSlots = generateTimeSlots();
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // Get the current week's Monday
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  let html = '<table class="grid-table"><thead><tr><th>Time</th>';
  days.forEach((d, idx) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + idx);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    html += `<th>${d}<br><span class="small-text">${dateStr}</span></th>`;
  });
  html += '</tr></thead><tbody>';

  timeSlots.forEach((slot) => {
    html += `<tr><td>${slot}</td>`;
    days.forEach((_, dayIdx) => {
      const cellDate = new Date(monday);
      cellDate.setDate(monday.getDate() + dayIdx);
      const cellDateStr = cellDate.toISOString().split('T')[0];

      // Find rides for this day/time slot
      const cellRides = rides.filter((r) => {
        if (!r.requestedTime) return false;
        const rideDate = r.requestedTime.split('T')[0];
        if (rideDate !== cellDateStr) return false;

        // Extract time from requestedTime
        const rideTime = new Date(r.requestedTime);
        const rideHour = rideTime.getHours();
        const rideMinute = rideTime.getMinutes();
        const rideTimeStr = `${String(rideHour).padStart(2, '0')}:${String(rideMinute).padStart(2, '0')}`;

        // Match time slot (30-min window)
        const slotParts = slot.split(':');
        const slotHour = parseInt(slotParts[0]);
        const slotMinute = parseInt(slotParts[1]);

        // Check if ride falls within this 30-min slot
        if (rideHour === slotHour) {
          if (slotMinute === 0 && rideMinute < 30) return true;
          if (slotMinute === 30 && rideMinute >= 30) return true;
        }
        return false;
      });

      let cellContent = '';
      cellRides.forEach((ride) => {
        const driver = employees.find((e) => e.id === ride.assignedDriverId);
        const driverName = driver ? driver.name.split(' ')[0] : '';
        cellContent += `<div class="ride-pill ${ride.status}" title="${ride.riderName} - ${ride.status}">
          ${ride.riderName.split(' ')[0]}${driverName ? ' (' + driverName + ')' : ''}
        </div>`;
      });

      const cellClass = cellRides.length ? 'ride-schedule-cell has-rides' : 'ride-schedule-cell';
      html += `<td class="${cellClass}">${cellContent}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  grid.innerHTML = html;
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
      console.log('Claimable ride:', ride.riderName, 'Phone:', ride.riderPhone);
      const contactButtons = ride.riderPhone
        ? `<div class="contact-buttons">
             <a href="tel:${ride.riderPhone}" class="contact-link" title="Call rider">📱</a>
             <a href="sms:${ride.riderPhone}" class="contact-link" title="Text rider">💬</a>
           </div>`
        : '';
      item.innerHTML = `
        <div class="flex-row" style="justify-content: space-between; align-items: center;">
          <strong>${ride.riderName}</strong>
          ${contactButtons}
        </div>
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
    console.log('Ride data:', ride.riderName, 'Phone:', ride.riderPhone);
    const contactButtons = ride.riderPhone
      ? `<div class="contact-buttons">
           <a href="tel:${ride.riderPhone}" class="contact-link" title="Call rider">📱</a>
           <a href="sms:${ride.riderPhone}" class="contact-link" title="Text rider">💬</a>
         </div>`
      : '';
    item.innerHTML = `
      <div class="flex-row" style="justify-content: space-between; align-items: center;">
        <div><span class="status-tag ${ride.status}">${ride.status.replace(/_/g, ' ')}</span> <strong>${ride.riderName}</strong></div>
        ${contactButtons}
      </div>
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
  initForms();
  await loadEmployees();
  await loadShifts();
  await loadRides();
  setInterval(loadRides, 5000);
  setInterval(renderDriverConsole, 1000);
});
