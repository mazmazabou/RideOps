// ============================================================================
// Driver Console JS (extracted from driver.html inline script)
// ============================================================================

let currentUser = null;
let employees = [];
let rides = [];
let vehicles = [];

const ACTIVE_STATUSES = ['driver_on_the_way', 'driver_arrived_grace'];
const ASSIGNED_OPEN_STATUSES = ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'];

// Tenant config
fetch('/api/tenant-config').then(r => r.ok ? r.json() : null).then(c => {
  if (!c) return;
  document.title = c.orgShortName + ' Driver';
  const b = document.getElementById('driver-brand');
  if (b) b.textContent = c.orgShortName + ' Driver';
  if (typeof window.loadTenantTheme === 'function') window.loadTenantTheme();
}).catch(() => {});

function todayLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function pluralize(count, word) {
  return `${word}${count === 1 ? '' : 's'}`;
}

function buildContactPill(phone, protocol, label) {
  const href = phone ? `${protocol}:${phone}` : '#';
  const icon = protocol === 'tel' ? 'phone' : 'message';
  const onMissingPhone = phone
    ? ''
    : 'onclick="event.preventDefault();showToast(\'No phone number available\',\'warning\')"';
  return `<a class="contact-pill" href="${href}" ${onMissingPhone}><span class="icon"><i class="ti ti-${icon}"></i></span><span>${label}</span></a>`;
}

async function init() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login';
      return;
    }
    currentUser = await res.json();
    document.getElementById('user-name').textContent = currentUser.name;
    await loadProfile();
    await loadData();
    setInterval(loadData, 3000);
    setInterval(updateGraceTimers, 1000);
  } catch {
    window.location.href = '/login';
  }
}

async function loadData() {
  const [empRes, ridesRes, vehRes] = await Promise.all([fetch('/api/employees'), fetch('/api/rides'), fetch('/api/vehicles')]);
  employees = await empRes.json();
  rides = await ridesRes.json();
  vehicles = await vehRes.json();
  render();
}

async function loadProfile() {
  try {
    const res = await fetch('/api/me');
    const me = await res.json();
    document.getElementById('profile-uscid').value = me.usc_id || '';
    document.getElementById('profile-email').value = me.email || '';
    document.getElementById('profile-username').value = me.username || '';
    document.getElementById('profile-name').value = me.name || '';
    document.getElementById('profile-phone').value = me.phone || '';
    const summaryEl = document.getElementById('account-summary');
    if (summaryEl) {
      const nm = me.name || '';
      const em = me.email || '';
      summaryEl.textContent = nm && em ? '\u2014 ' + nm + ' \u00b7 ' + em : nm ? '\u2014 ' + nm : '';
    }
  } catch {}
}

async function saveProfile() {
  const msg = document.getElementById('profile-message');
  msg.textContent = '';
  const name = document.getElementById('profile-name').value.trim();
  const phone = document.getElementById('profile-phone').value.trim();
  const res = await fetch('/api/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone })
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || 'Could not save profile';
    return;
  }
  msg.textContent = 'Saved!';
  document.getElementById('user-name').textContent = data.name;
  const summaryEl = document.getElementById('account-summary');
  if (summaryEl) {
    const nm = data.name || '';
    const em = document.getElementById('profile-email').value || '';
    summaryEl.textContent = nm && em ? '\u2014 ' + nm + ' \u00b7 ' + em : nm ? '\u2014 ' + nm : '';
  }
  toggleProfileEdit(true);
}

async function changePassword() {
  const msg = document.getElementById('pw-message');
  msg.textContent = '';
  msg.style.color = '';
  const currentPassword = document.getElementById('pw-current').value;
  const newPassword = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;
  if (!currentPassword || !newPassword || !confirm) {
    msg.textContent = 'All fields are required.';
    msg.style.color = '#c62828';
    return;
  }
  if (newPassword.length < 8) {
    msg.textContent = 'New password must be at least 8 characters.';
    msg.style.color = '#c62828';
    return;
  }
  if (newPassword !== confirm) {
    msg.textContent = 'Passwords do not match.';
    msg.style.color = '#c62828';
    return;
  }
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || 'Failed to change password';
      msg.style.color = '#c62828';
      return;
    }
    msg.textContent = 'Password updated successfully!';
    msg.style.color = '#228b22';
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
  } catch {
    msg.textContent = 'Connection error';
    msg.style.color = '#c62828';
  }
}

function toggleProfileEdit(forceClose) {
  const content = document.getElementById('profile-content');
  const btn = document.getElementById('profile-toggle');
  if (!content || !btn) return;
  const isOpen = content.style.display !== 'none';
  if (forceClose || isOpen) {
    content.style.display = 'none';
    btn.textContent = '▸';
  } else {
    content.style.display = 'block';
    btn.textContent = '▾';
  }
}

function toggleDriverSection(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.textContent = isHidden ? '▾' : '▸';
}

function render() {
  const me = employees.find((e) => e.id === currentUser.id);
  const isActive = me?.active || false;
  const clockStatus = document.getElementById('clock-status');
  clockStatus.textContent = isActive ? 'Clocked In' : 'Clocked Out';
  clockStatus.className = isActive ? 'text-success fw-bold' : 'text-danger fw-bold';
  const clockBtn = document.getElementById('clock-btn');
  clockBtn.textContent = isActive ? 'Clock Out' : 'Clock In';
  clockBtn.className = isActive ? 'btn btn-outline-secondary' : 'btn btn-primary';
  // Update card status top color
  const clockCard = document.getElementById('clock-card');
  if (clockCard) {
    clockCard.className = isActive ? 'card card-status-top border-success' : 'card card-status-top border-secondary';
  }

  const today = todayLocal();
  const actionableStatuses = ['scheduled', 'driver_on_the_way', 'driver_arrived_grace', 'completed', 'no_show'];
  const myRides = rides.filter(
    (r) => r.assignedDriverId === currentUser.id && r.requestedTime?.startsWith(today) && actionableStatuses.includes(r.status)
  );

  const myRidesEl = document.getElementById('my-rides');
  if (!myRides.length) {
    showEmptyState(myRidesEl, {
      icon: 'inbox',
      title: 'No rides assigned today',
      message: 'Your next assignments will appear here when dispatch adds them.'
    });
  } else {
    myRidesEl.innerHTML = myRides.map((r) => renderRide(r, true)).join('');
  }

  const availableSection = document.getElementById('available-section');
  const availableEl = document.getElementById('available-rides');
  if (!isActive) {
    availableSection.style.display = 'none';
  } else {
    availableSection.style.display = 'block';
    const availableRides = rides.filter((r) => r.status === 'approved' && !r.assignedDriverId && r.requestedTime?.startsWith(today));
    if (!availableRides.length) {
      showEmptyState(availableEl, {
        icon: 'inbox',
        title: 'No rides available',
        message: 'Approved rides with no assigned driver will show up here.'
      });
    } else {
      availableEl.innerHTML = availableRides.map((r) => renderRide(r, false)).join('');
    }
  }
}

function renderRide(ride, assigned) {
  const labels = {
    approved: 'Available',
    scheduled: 'Scheduled',
    driver_on_the_way: 'On The Way',
    driver_arrived_grace: 'Waiting',
    completed: 'Completed',
    no_show: 'No-Show'
  };
  let grace = '';
  let actions = '';
  if (ride.status === 'driver_arrived_grace' && ride.graceStartTime) {
    grace = `<div class="alert alert-warning py-2 px-3 mb-2" data-grace="${ride.graceStartTime}"></div>`;
  }
  if (assigned) {
    if (ride.status === 'scheduled') {
      const vehOpts = vehicles.filter(v => v.status === 'available').map(v =>
        `<option value="${v.id}" ${v.id === ride.vehicleId ? 'selected' : ''}>${v.name}</option>`
      ).join('');
      const hasVehicle = !!ride.vehicleId;
      const noVehWarn = hasVehicle ? '' : '<div class="alert alert-warning py-1 px-2 mb-2" style="font-size:0.85rem;">Select a cart before starting</div>';
      actions = `<select id="veh-sched-${ride.id}" class="form-select form-select-sm mb-2" onchange="setVehicle('${ride.id}', this.value)">
        <option value="">${hasVehicle ? 'Change cart...' : 'Select cart...'}</option>${vehOpts}
      </select>${noVehWarn}<button class="btn btn-primary w-100" onclick="startRide('${ride.id}')">On My Way</button>`;
    } else if (ride.status === 'driver_on_the_way') {
      const vehChangeOpts = vehicles.filter(v => v.status === 'available').map(v =>
        `<option value="${v.id}" ${v.id === ride.vehicleId ? 'selected' : ''}>${v.name}</option>`
      ).join('');
      const vehicleChange = `<select class="form-select form-select-sm mb-2" onchange="setVehicle('${ride.id}', this.value)">
        <option value="">Change cart...</option>${vehChangeOpts}
      </select>`;
      actions = `${vehicleChange}<button class="btn btn-outline-secondary w-100 mb-1" onclick="action('${ride.id}','here')">I'm Here</button><button class="btn btn-primary w-100" onclick="action('${ride.id}','complete')">Complete</button>`;
    } else if (ride.status === 'driver_arrived_grace') {
      const canNoShow = (Date.now() - new Date(ride.graceStartTime).getTime()) / 1000 >= 300;
      actions = `<button class="btn btn-primary w-100 mb-1" onclick="action('${ride.id}','complete')">Complete</button><button class="btn btn-danger w-100" onclick="action('${ride.id}','no-show')" ${canNoShow ? '' : 'disabled'}>No-Show</button>`;
    }
  } else {
    const vehOpts = vehicles.filter(v => v.status === 'available').map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    actions = `<select id="veh-${ride.id}" class="form-select form-select-sm mb-2"><option value="">Select cart...</option>${vehOpts}</select><button class="btn btn-primary w-100" onclick="claim('${ride.id}')">Claim</button>`;
  }

  // Urgency indicator
  let urgencyClass = '';
  let urgencyLabel = '';
  if (ride.requestedTime && !['completed', 'no_show'].includes(ride.status)) {
    const diffMs = new Date(ride.requestedTime).getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin >= 0 && diffMin <= 15) {
      urgencyClass = 'urgent';
      urgencyLabel = `<div class="ride-urgency urgent"><i class="ti ti-clock" style="font-size:16px;vertical-align:middle;"></i> In ${diffMin} min</div>`;
    } else if (diffMin > 15 && diffMin <= 30) {
      urgencyClass = 'soon';
      urgencyLabel = `<div class="ride-urgency soon">In ${diffMin} min</div>`;
    }
  }

  const phone = ride.riderPhone || '';
  const contactRow = `<div class="contact-row">${buildContactPill(phone, 'tel', 'Call')}${buildContactPill(phone, 'sms', 'SMS')}</div>`;
  const vehicleName = ride.vehicleId ? (vehicles.find(v => v.id === ride.vehicleId)?.name || '') : '';
  const vehicleLine = vehicleName ? `<div class="text-secondary small">Vehicle: ${vehicleName}</div>` : '';
  return `<div class="card mb-2 ${urgencyClass}">${urgencyLabel}
    <div class="card-body py-3">
      <span class="badge badge-${ride.status} mb-2">${labels[ride.status] || ride.status}</span>
      <div class="fw-bold fs-5 mb-1">${ride.riderName}</div>
      <div class="mb-1">${ride.pickupLocation} → ${ride.dropoffLocation}</div>
      <div class="text-secondary small mb-1">${new Date(ride.requestedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      ${vehicleLine}${contactRow}${grace}${actions ? `<div class="mt-2">${actions}</div>` : ''}
    </div>
  </div>`;
}

function updateGraceTimers() {
  document.querySelectorAll('[data-grace]').forEach((el) => {
    const elapsed = (Date.now() - new Date(el.dataset.grace).getTime()) / 1000;
    const remaining = Math.max(0, 300 - elapsed);
    if (remaining <= 0) {
      el.textContent = 'Rider did not show \u2014 you may mark no-show';
      el.className = 'alert alert-danger py-2 px-3 mb-2';
      const btn = el.closest('.card')?.querySelector('.btn-danger');
      if (btn) btn.disabled = false;
    } else {
      el.textContent = `Waiting for rider (${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')})`;
    }
  });
}

async function toggleClock() {
  const me = employees.find((e) => e.id === currentUser.id);
  if (!me) return;

  if (me.active) {
    const activeRideCount = rides.filter((r) => r.assignedDriverId === currentUser.id && ACTIVE_STATUSES.includes(r.status)).length;
    const assignedRideCount = rides.filter((r) => r.assignedDriverId === currentUser.id && ASSIGNED_OPEN_STATUSES.includes(r.status)).length;
    let message = 'Are you sure you want to clock out?';
    if (activeRideCount > 0) {
      message = `You have ${activeRideCount} active ${pluralize(activeRideCount, 'ride')}. Clock out anyway?`;
    } else if (assignedRideCount > 0) {
      message = `You still have ${assignedRideCount} assigned ${pluralize(assignedRideCount, 'ride')}. Clock out anyway?`;
    }
    const confirmed = await showConfirmModal({
      title: 'Clock Out',
      message,
      confirmLabel: 'Clock Out',
      cancelLabel: 'Stay Clocked In',
      type: 'warning'
    });
    if (!confirmed) return;
  }

  const endpoint = me.active ? 'clock-out' : 'clock-in';
  const response = await fetch(`/api/employees/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId: currentUser.id })
  });
  if (!response.ok) {
    const err = await response.json();
    showToast(err.error || 'Could not update clock status', 'error');
    return;
  }
  await loadData();
}

async function claim(id) {
  const vehSelect = document.getElementById(`veh-${id}`);
  const vehicleId = vehSelect?.value || null;
  const body = vehicleId ? JSON.stringify({ vehicleId }) : '{}';
  const response = await fetch(`/api/rides/${id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (!response.ok) {
    const err = await response.json();
    showToast(err.error || 'Failed to claim ride', 'error');
  } else {
    showToast('Ride claimed successfully', 'success');
  }
  await loadData();
}

async function action(id, act) {
  if (act === 'complete') {
    const confirmed = await showConfirmModal({
      title: 'Complete Ride',
      message: 'Mark this ride as completed?',
      confirmLabel: 'Complete',
      cancelLabel: 'Keep Open',
      type: 'warning'
    });
    if (!confirmed) return;
  }

  if (act === 'no-show') {
    const confirmed = await showConfirmModal({
      title: 'Confirm No-Show',
      message: 'Mark this rider as a no-show? This increases their no-show count.',
      confirmLabel: 'Mark No-Show',
      cancelLabel: 'Go Back',
      type: 'danger'
    });
    if (!confirmed) return;
  }

  const response = await fetch(`/api/rides/${id}/${act}`, { method: 'POST' });
  if (!response.ok) {
    const err = await response.json();
    showToast(err.error || 'Action failed', 'error');
  } else {
    const messages = {
      'on-the-way': 'Marked as on the way',
      here: 'Marked as arrived',
      complete: 'Ride completed',
      'no-show': 'Marked as no-show'
    };
    showToast(messages[act] || 'Action completed', 'success');
  }
  await loadData();
}

async function startRide(id) {
  const selectEl = document.getElementById(`veh-sched-${id}`);
  const ride = rides.find(r => r.id === id);
  const vehicleId = selectEl?.value || ride?.vehicleId || null;
  if (!vehicleId) {
    showToast('Please select a cart before starting this ride', 'warning');
    if (selectEl) selectEl.focus();
    return;
  }
  const response = await fetch(`/api/rides/${id}/on-the-way`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleId })
  });
  if (!response.ok) {
    const err = await response.json();
    showToast(err.error || 'Could not start ride', 'error');
  } else {
    showToast('Marked as on the way', 'success');
  }
  await loadData();
}

async function setVehicle(rideId, vehicleId) {
  if (!vehicleId) return;
  const response = await fetch(`/api/rides/${rideId}/set-vehicle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleId })
  });
  if (!response.ok) {
    const err = await response.json();
    showToast(err.error || 'Could not set vehicle', 'error');
  } else {
    const veh = vehicles.find(v => v.id === vehicleId);
    showToast(`Vehicle set to ${veh?.name || 'cart'}`, 'success');
  }
  await loadData();
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

init();
