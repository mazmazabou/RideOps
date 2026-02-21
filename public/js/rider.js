// ============================================================================
// Rider Console JS (extracted from rider.html inline script)
// ============================================================================

let locations = [];
let meUser = null;
let showAllHistory = false;

// Tenant config
fetch('/api/tenant-config').then(r => r.ok ? r.json() : null).then(c => {
  if (!c) return;
  document.title = c.orgShortName + ' Rider';
  const b = document.getElementById('rider-brand');
  if (b) b.textContent = c.orgShortName + ' Rider';
  if (typeof window.loadTenantTheme === 'function') window.loadTenantTheme();
}).catch(() => {});

async function init() {
  const me = await fetchMe();
  if (!me || me.role !== 'rider') { window.location.href = '/'; return; }
  meUser = me;
  const acctSummary = document.getElementById('rider-account-summary');
  if (acctSummary) acctSummary.textContent = '\u2014 ' + (me.name || '') + ' \u00b7 ' + (me.username || '');
  document.getElementById('user-info').innerHTML = `
    <span class="badge bg-white-lt">${me.name}</span>
    <span class="badge bg-white-lt">${me.email || ''}</span>
  `;
  await loadProfile();
  await loadLocations();
  setDefaultTime();
  initRideTypeToggle();
  attachForm(me);
  await loadMyRides();
  await loadMyRecurring();
  setInterval(loadMyRides, 5000);
  const historyToggle = document.getElementById('rider-history-toggle');
  if (historyToggle) {
    historyToggle.onclick = () => { showAllHistory = !showAllHistory; loadMyRides(); historyToggle.textContent = showAllHistory ? 'Show recent only' : 'View all history'; };
  }
}

async function fetchMe() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function loadProfile() {
  try {
    const res = await fetch('/api/me');
    const profile = await res.json();
    document.getElementById('profile-uscid').value = profile.usc_id || '';
    document.getElementById('profile-email').value = profile.email || '';
    document.getElementById('profile-username').value = profile.username || '';
    document.getElementById('profile-name').value = profile.name || '';
    document.getElementById('profile-phone').value = profile.phone || '';
  } catch {}
  const saveBtn = document.getElementById('profile-save');
  if (saveBtn) saveBtn.onclick = saveProfile;
  const pwBtn = document.getElementById('pw-change-btn');
  if (pwBtn) pwBtn.onclick = changePassword;
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
  meUser = data;
  const acctSummary = document.getElementById('rider-account-summary');
  if (acctSummary) acctSummary.textContent = '\u2014 ' + (data.name || '') + ' \u00b7 ' + (meUser.username || '');
  document.getElementById('user-info').innerHTML = `
    <span class="badge bg-white-lt">${data.name}</span>
    <span class="badge bg-white-lt">${data.email || ''}</span>
  `;
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

function initRideTypeToggle() {
  const radios = document.querySelectorAll('input[name="ride-type"]');
  const recurringFields = document.getElementById('recurring-fields');
  const requestedLabel = document.getElementById('requested-time-label');
  radios.forEach((r) => r.addEventListener('change', () => {
    if (r.value === 'recurring' && r.checked) {
      recurringFields.style.display = 'block';
      requestedLabel.style.display = 'none';
    } else if (r.checked) {
      recurringFields.style.display = 'none';
      requestedLabel.style.display = 'block';
    }
  }));
}

function setDefaultTime() {
  const input = document.getElementById('requested-time');
  const recurringTime = document.getElementById('recurring-time');
  const recurringStart = document.getElementById('recurring-start');
  const recurringEnd = document.getElementById('recurring-end');
  const now = new Date();
  const date = new Date(now);
  const day = date.getDay();
  if (day === 0) date.setDate(date.getDate() + 1);
  if (day === 6) date.setDate(date.getDate() + 2);
  let hours = date.getHours();
  let minutes = date.getMinutes();
  minutes = minutes > 30 ? 0 : 30;
  if (hours < 8) hours = 8;
  if (hours >= 19) { hours = 8; date.setDate(date.getDate() + 1); }
  date.setHours(hours, minutes, 0, 0);
  const isoLocal = formatDateInputLocal(date);
  input.value = isoLocal;
  if (recurringTime) recurringTime.value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  if (recurringStart) recurringStart.value = isoLocal.split('T')[0];
  if (recurringEnd) {
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 7);
    recurringEnd.value = formatDateInputLocal(endDate).split('T')[0];
  }
}

async function loadLocations() {
  try {
    const res = await fetch('/api/locations');
    locations = await res.json();
  } catch {
    locations = [];
  }
  const selects = [document.getElementById('pickup-location'), document.getElementById('dropoff-location')];
  selects.forEach(select => {
    select.innerHTML = '<option value="">Select location</option>';
    locations.forEach(loc => {
      const label = typeof loc === 'string' ? loc : (loc.label || loc.value);
      const value = typeof loc === 'string' ? loc : (loc.label || loc.value);
      if (!label) return;
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    });
    const other = document.createElement('option');
    other.value = 'Other';
    other.textContent = 'Other (type below)';
    select.appendChild(other);
  });
}

function attachForm(me) {
  const form = document.getElementById('ride-form');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rideType = document.querySelector('input[name="ride-type"]:checked')?.value || 'one-time';
    const pickup = document.getElementById('pickup-location').value;
    const dropoff = document.getElementById('dropoff-location').value;
    const pickupNote = document.getElementById('pickup-note').value.trim();
    const dropoffNote = document.getElementById('dropoff-note').value.trim();
    const requestedTime = document.getElementById('requested-time').value;
    const riderPhone = document.getElementById('rider-phone').value;
    const notes = document.getElementById('notes').value.trim();

    const messageEl = document.getElementById('form-message');
    messageEl.textContent = '';

    const resolvedPickup = pickup === 'Other' ? pickupNote : pickup;
    const resolvedDropoff = dropoff === 'Other' ? dropoffNote : dropoff;

    if (!resolvedPickup || !resolvedDropoff) {
      messageEl.textContent = 'Please choose pickup and dropoff (or type details).';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    if (rideType === 'recurring') {
      const start = document.getElementById('recurring-start').value;
      const end = document.getElementById('recurring-end').value;
      const timeOfDay = document.getElementById('recurring-time').value;
      const days = Array.from(document.querySelectorAll('#recurring-days input:checked')).map((c) => c.value);
      if (!start || !end || !timeOfDay || !days.length) {
        messageEl.textContent = 'Select start/end dates, time of day, and days.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
        return;
      }
      try {
        const res = await fetch('/api/recurring-rides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickupLocation: resolvedPickup,
            dropoffLocation: resolvedDropoff,
            timeOfDay,
            startDate: start,
            endDate: end,
            daysOfWeek: days,
            notes,
            riderPhone
          })
        });
        const data = await res.json();
        if (!res.ok) {
          messageEl.textContent = data.error || 'Could not submit recurring request.';
          return;
        }
        messageEl.textContent = `Recurring request submitted. Created ${data.createdRides} rides.`;
        await loadMyRecurring();
        await loadMyRides();
      } catch {
        messageEl.textContent = 'Network error submitting request.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
      }
    } else {
      try {
        const res = await fetch('/api/rides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickupLocation: resolvedPickup,
            dropoffLocation: resolvedDropoff,
            requestedTime,
            riderPhone,
            riderName: me.name,
            notes
          })
        });
        if (!res.ok) {
          const err = await res.json();
          messageEl.textContent = err.error || 'Could not submit request.';
          return;
        }
        messageEl.textContent = 'Request submitted. Watch your status below.';
        document.getElementById('notes').value = '';
        document.getElementById('pickup-note').value = '';
        document.getElementById('dropoff-note').value = '';
        await loadMyRides();
      } catch {
        messageEl.textContent = 'Network error submitting request.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
      }
    }
  });
}

async function loadMyRides() {
  try {
    const res = await fetch('/api/my-rides');
    if (!res.ok) throw new Error();
    const rides = await res.json();
    renderMyRides(rides);
  } catch {
    showEmptyState('my-rides', {
      icon: 'inbox',
      title: 'Unable to load requests',
      message: 'Please refresh and try again.'
    });
  }
}

async function loadMyRecurring() {
  try {
    const res = await fetch('/api/recurring-rides/my');
    if (!res.ok) throw new Error();
    const rows = await res.json();
    renderRecurring(rows);
  } catch {
    showEmptyState('my-recurring', {
      icon: 'inbox',
      title: 'Unable to load recurring rides',
      message: 'Please refresh and try again.'
    });
  }
}

function renderMyRides(rides) {
  const container = document.getElementById('my-rides');
  if (!rides.length) {
    showEmptyState(container, {
      icon: 'inbox',
      title: 'No requests yet',
      message: 'Submit a ride request above to get started.'
    });
    return;
  }
  const sorted = rides.slice().sort((a, b) => new Date(b.requestedTime) - new Date(a.requestedTime));
  const limited = showAllHistory ? sorted : sorted.slice(0, 10);
  container.innerHTML = '';
  limited.forEach((ride) => {
    const div = document.createElement('div');
    div.className = 'item';
    const misses = Number(ride.consecutiveMisses || 0);
    const missReminder = misses >= 3
      ? `<div class="small-text text-danger">Reminder: ${misses} of 5 allowed no-shows used.</div>`
      : '';
    const canCancel = ride.status === 'pending' || (ride.status === 'approved' && !ride.assignedDriverId);
    div.innerHTML = `
      <div>${statusBadge(ride.status)} <strong>${ride.pickupLocation}</strong> → ${ride.dropoffLocation}</div>
      <div class="small-text">When: ${formatDateTime(ride.requestedTime)}</div>
      <div class="small-text">Notes: ${ride.notes || '—'}</div>
      ${missReminder}
    `;
    if (canCancel) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-danger btn-sm mt-1';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = () => cancelRide(ride.id);
      div.appendChild(cancelBtn);
    }
    container.appendChild(div);
  });
  if (!showAllHistory && sorted.length > 10) {
    const note = document.createElement('div');
    note.className = 'small-text text-secondary';
    note.textContent = `Showing recent 10 of ${sorted.length}.`;
    container.appendChild(note);
  }
}

function renderRecurring(rows) {
  const container = document.getElementById('my-recurring');
  if (!rows.length) {
    showEmptyState(container, {
      icon: 'inbox',
      title: 'No recurring rides yet',
      message: 'Recurring rides will appear here after you create one.'
    });
    return;
  }
  container.innerHTML = '';
  rows.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div><strong>${r.pickup_location}</strong> → ${r.dropoff_location}</div>
      <div class="small-text">${formatTimeAmPm(r.time_of_day)} · ${formatDaysOfWeek(r.days_of_week)}</div>
      <div class="small-text">${formatDateReadable(r.start_date)} – ${formatDateReadable(r.end_date)}</div>
      <div class="small-text">${r.status.charAt(0).toUpperCase() + r.status.slice(1)} · ${r.upcomingCount || 0} upcoming</div>
    `;
    if (r.status === 'active') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-danger btn-sm mt-1';
      btn.textContent = 'Cancel series';
      btn.onclick = () => cancelRecurring(r.id);
      div.appendChild(btn);
    }
    container.appendChild(div);
  });
}

async function cancelRide(id) {
  const confirmed = await showConfirmModal({
    title: 'Cancel Ride Request',
    message: 'Cancel this ride request?',
    confirmLabel: 'Cancel Ride',
    cancelLabel: 'Keep Ride',
    type: 'warning'
  });
  if (!confirmed) return;

  const res = await fetch(`/api/rides/${id}/cancel`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Could not cancel ride', 'error');
    return;
  }
  showToast('Ride cancelled successfully', 'success');
  await loadMyRides();
  await loadMyRecurring();
}

async function cancelRecurring(id) {
  const confirmed = await showConfirmModal({
    title: 'Cancel Recurring Series',
    message: 'Cancel this recurring ride series and future rides?',
    confirmLabel: 'Cancel Series',
    cancelLabel: 'Keep Series',
    type: 'warning'
  });
  if (!confirmed) return;

  const res = await fetch(`/api/recurring-rides/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' })
  });
  if (!res.ok) {
    showToast('Could not cancel recurring ride', 'error');
    return;
  }
  showToast('Recurring ride cancelled successfully', 'success');
  await loadMyRecurring();
  await loadMyRides();
}

function toggleSection(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.textContent = isHidden ? '▾' : '▸';
}

function formatDateInputLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

function toggleLegendPopover(e) {
  e.stopPropagation();
  const el = document.getElementById('legend-popover');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function formatDaysOfWeek(arr) {
  const names = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
  return (arr || []).map(d => names[d] || d).join(', ') || '\u2014';
}

function formatTimeAmPm(t) {
  if (!t) return '\u2014';
  const p = t.split(':');
  let h = parseInt(p[0], 10);
  const m = p[1] || '00';
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return h + ':' + m + ' ' + ap;
}

function formatDateReadable(d) {
  if (!d) return '\u2014';
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

init();
