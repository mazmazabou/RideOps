/* ── RideOps Shared Utilities ── */

// Lighten (positive amount) or darken (negative amount) a hex color.
// amount: -255 to 255. Positive = mix toward white, negative = mix toward black.
function shadeHex(hex, amount) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  var n = parseInt(hex, 16);
  var r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amount));
  var g = Math.min(255, Math.max(0, ((n >> 8)  & 255) + amount));
  var b = Math.min(255, Math.max(0, ( n        & 255) + amount));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// Convert hex color to "r, g, b" string for rgba() usage
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  var n = parseInt(hex, 16);
  return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255);
}

// Build locations API URL with optional campus param from sessionStorage
function locationsUrl() {
  var campus = null;
  try { campus = sessionStorage.getItem('ro-demo-campus'); } catch(e) {}
  if (campus) return '/api/locations?campus=' + encodeURIComponent(campus);
  return '/api/locations';
}

// Tenant theme loader — merges campus override from sessionStorage in demo mode
async function applyTenantTheme() {
  try {
    var config = await fetch('/api/tenant-config').then(function(r) { return r.json(); });
    var root = document.documentElement;

    // Check for demo campus override
    var campusKey = null;
    try { campusKey = sessionStorage.getItem('ro-demo-campus'); } catch(e) {}
    if (campusKey && typeof CAMPUS_THEMES !== 'undefined' && CAMPUS_THEMES[campusKey]) {
      var ct = CAMPUS_THEMES[campusKey];
      // Merge campus theme over server config
      config.orgName = ct.orgName;
      config.orgShortName = ct.orgShortName;
      config.orgTagline = ct.orgTagline;
      config.orgInitials = ct.orgInitials;
      config.primaryColor = ct.primaryColor;
      config.secondaryColor = ct.secondaryColor;
      config.mapUrl = ct.mapUrl;
    }

    // Apply primary/accent colors
    if (config.primaryColor) {
      root.style.setProperty('--color-primary', config.primaryColor);
      root.style.setProperty('--color-primary-rgb', hexToRgb(config.primaryColor));
      // Compute derived shades so hover states, focus rings, and subtle backgrounds
      // reflect the actual tenant color instead of staying as hardcoded steelblue.
      root.style.setProperty('--color-primary-dark',   shadeHex(config.primaryColor, -25));
      root.style.setProperty('--color-primary-light',  shadeHex(config.primaryColor, 80));
      root.style.setProperty('--color-primary-subtle', shadeHex(config.primaryColor, 120));
    }
    if (config.secondaryColor) {
      root.style.setProperty('--color-accent', config.secondaryColor);
      root.style.setProperty('--color-accent-dark', shadeHex(config.secondaryColor, -20));
      root.style.setProperty('--color-secondary', config.secondaryColor);
      root.style.setProperty('--color-secondary-rgb', hexToRgb(config.secondaryColor));
    }

    // Header background
    var headerBg = config.headerBg || (typeof DEFAULT_HEADER_BG !== 'undefined' ? DEFAULT_HEADER_BG : '#EEF3F8');
    root.style.setProperty('--color-header-bg', headerBg);
    // If API doesn't return headerBg, derive it from the campus key
    if (!config.headerBg && config.campusKey) {
      var ctH = typeof CAMPUS_THEMES !== 'undefined' && CAMPUS_THEMES[config.campusKey];
      if (ctH && ctH.headerBg) root.style.setProperty('--color-header-bg', ctH.headerBg);
    }

    // Apply sidebar overrides if campus theme provides them
    if (campusKey && typeof CAMPUS_THEMES !== 'undefined' && CAMPUS_THEMES[campusKey]) {
      var ct = CAMPUS_THEMES[campusKey];
      if (ct.sidebarBg) root.style.setProperty('--color-sidebar-bg', ct.sidebarBg);
      if (ct.sidebarText) root.style.setProperty('--color-sidebar-text', ct.sidebarText);
      if (ct.sidebarActiveBg) root.style.setProperty('--color-sidebar-active-bg', ct.sidebarActiveBg);
      if (ct.sidebarHover) root.style.setProperty('--color-sidebar-hover', ct.sidebarHover);
      if (ct.sidebarBorder) root.style.setProperty('--color-sidebar-border', ct.sidebarBorder);
      root.style.setProperty('--color-sidebar-active', ct.primaryColor);
      if (ct.secondaryTextColor) root.style.setProperty('--color-secondary-text', ct.secondaryTextColor);
      if (ct.primaryLight) root.style.setProperty('--color-primary-light', ct.primaryLight);
      if (ct.primaryDark)  root.style.setProperty('--color-primary-dark',  ct.primaryDark);
    }

    // Apply org name/short name to DOM
    var orgEl = document.getElementById('org-name');
    if (orgEl && config.orgName) orgEl.textContent = config.orgName;
    var shortEl = document.getElementById('org-short-name');
    if (shortEl && config.orgShortName) shortEl.textContent = config.orgShortName;

    return config;
  } catch (e) { console.warn('Tenant config not loaded:', e); return null; }
}

// Status badge HTML
function statusBadge(status, graceMins) {
  var label;
  if (status === 'driver_arrived_grace') {
    var mins = graceMins || window._opsGraceMins || 5;
    label = mins + '-min grace period';
  } else {
    label = (status || '').replace(/_/g, ' ').replace('driver ', '');
  }
  return '<span class="status-badge status-badge--' + status + '">' + label + '</span>';
}

// Toast system
let _toastContainer = null;
function showToastNew(message, type) {
  type = type || 'info';
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.className = 'ro-toast';
    document.body.appendChild(_toastContainer);
  }
  var toast = document.createElement('div');
  toast.className = 'ro-toast-item ro-toast-item--' + type;
  var icon = type === 'success' ? '\u2713' : type === 'error' ? '\u2715' : '\u2139';
  toast.innerHTML = '<span>' + icon + '</span> ' + message;
  _toastContainer.appendChild(toast);
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(function() { toast.remove(); }, 300);
  }, 4000);
}

// Modal system
function showModalNew(opts) {
  var title = opts.title || 'Confirm';
  var body = opts.body || '';
  var confirmLabel = opts.confirmLabel || 'Confirm';
  var confirmClass = opts.confirmClass || 'ro-btn--danger';
  var onConfirm = opts.onConfirm;
  var overlay = document.createElement('div');
  overlay.className = 'ro-modal-overlay open';
  overlay.innerHTML =
    '<div class="ro-modal">' +
    '<div class="ro-modal__title">' + title + '</div>' +
    '<div class="ro-modal__body">' + body + '</div>' +
    '<div class="ro-modal__actions">' +
    '<button class="ro-btn ro-btn--outline" data-action="cancel">Cancel</button>' +
    '<button class="ro-btn ' + confirmClass + '" data-action="confirm">' + confirmLabel + '</button>' +
    '</div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector('[data-action="cancel"]').onclick = function() { overlay.remove(); };
  overlay.querySelector('[data-action="confirm"]').onclick = function() { if (onConfirm) onConfirm(); overlay.remove(); };
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
}

// Drawer system
function openDrawer(contentHTML) {
  closeDrawer();
  var ov = document.createElement('div');
  ov.className = 'ro-drawer-overlay open';
  ov.id = 'ro-drawer-overlay';
  var dw = document.createElement('div');
  dw.className = 'ro-drawer open';
  dw.id = 'ro-drawer';
  dw.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
    '<span style="font-size:16px;font-weight:700">Details</span>' +
    '<button class="ro-btn ro-btn--outline ro-btn--sm" onclick="closeDrawer()">\u2715</button></div>' +
    '<div id="ro-drawer-content">' + contentHTML + '</div>';
  document.body.appendChild(ov);
  document.body.appendChild(dw);
  ov.onclick = closeDrawer;
}
function closeDrawer() {
  var ov = document.getElementById('ro-drawer-overlay');
  var dw = document.getElementById('ro-drawer');
  if (ov) ov.remove();
  if (dw) dw.remove();
}

// Sidebar navigation
function initSidebar() {
  var brandIcon = document.querySelector('.ro-brand-icon');
  if (brandIcon) {
    brandIcon.addEventListener('click', function() {
      var shell = document.querySelector('.ro-shell');
      if (shell && shell.classList.contains('collapsed')) {
        toggleSidebar();
      }
    });
  }
  document.querySelectorAll('.ro-nav-item[data-target]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var target = btn.dataset.target;
      document.querySelectorAll('.ro-nav-item').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
      var panel = document.getElementById(target);
      if (panel) panel.classList.add('active');
      var title = btn.querySelector('.ro-nav-label');
      var headerTitle = document.getElementById('header-title');
      if (headerTitle && title) headerTitle.textContent = title.textContent;
    });
  });
}
function toggleSidebar() {
  var shell = document.querySelector('.ro-shell');
  if (shell) {
    shell.classList.toggle('collapsed');
    try { localStorage.setItem('ro-sidebar-collapsed', shell.classList.contains('collapsed') ? '1' : ''); } catch(e) {}
  }
}
function restoreSidebarState() {
  try {
    if (localStorage.getItem('ro-sidebar-collapsed') === '1') {
      var shell = document.querySelector('.ro-shell');
      if (shell) shell.classList.add('collapsed');
    }
  } catch(e) {}
}

// Sub-tab navigation
function initSubTabs() {
  document.querySelectorAll('.ro-tab[data-subtarget]').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var target = tab.dataset.subtarget;
      var parent = tab.closest('.tab-panel');
      tab.closest('.ro-tabs').querySelectorAll('.ro-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      if (parent) {
        parent.querySelectorAll('.sub-panel').forEach(function(p) { p.classList.remove('active'); });
        var sp = document.getElementById(target);
        if (sp) sp.classList.add('active');
      }
    });
  });
}

// Bottom tab navigation (mobile views)
function initBottomTabs() {
  document.querySelectorAll('.ro-bottom-tab[data-target]').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var target = tab.dataset.target;
      document.querySelectorAll('.ro-bottom-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
      var panel = document.getElementById(target);
      if (panel) panel.classList.add('active');
    });
  });
}

// Format helpers
function formatTime(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function formatDate(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function timeAgo(iso) {
  var diff = Date.now() - new Date(iso).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

// ----- Business Rules / Ops Config helpers -----
function jsDateToOurDay(date) {
  // JS getDay: 0=Sun, 1=Mon ... 6=Sat → our: 0=Mon ... 6=Sun
  var d = typeof date === 'number' ? date : date.getDay();
  return d === 0 ? 6 : d - 1;
}
function ourDayToFCDay(ourDay) {
  // our 0=Mon → FC/JS 1=Mon, our 6=Sun → FC/JS 0=Sun
  return (ourDay + 1) % 7;
}
function ourDayLabel(ourDay) {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][ourDay] || '';
}

var _opsConfigPromise = null;
function getOpsConfig() {
  if (!_opsConfigPromise) {
    _opsConfigPromise = fetch('/api/settings/public/operations')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(cfg) {
        return cfg || {
          service_hours_start: '08:00',
          service_hours_end: '19:00',
          operating_days: '0,1,2,3,4',
          grace_period_minutes: '5'
        };
      })
      .catch(function() {
        return {
          service_hours_start: '08:00',
          service_hours_end: '19:00',
          operating_days: '0,1,2,3,4',
          grace_period_minutes: '5'
        };
      });
  }
  return _opsConfigPromise;
}
function invalidateOpsConfig() {
  _opsConfigPromise = null;
}

function formatServiceHoursText(cfg) {
  var opDays = String(cfg.operating_days || '0,1,2,3,4').split(',').map(Number).sort();
  var labels = opDays.map(ourDayLabel);
  var dayStr;
  // Check if consecutive
  if (labels.length > 2) {
    var consecutive = true;
    for (var i = 1; i < opDays.length; i++) {
      if (opDays[i] !== opDays[i - 1] + 1) { consecutive = false; break; }
    }
    dayStr = consecutive ? labels[0] + '\u2013' + labels[labels.length - 1] : labels.join(', ');
  } else {
    dayStr = labels.join(', ');
  }
  function fmtTime(t) {
    var parts = String(t).split(':');
    var h = parseInt(parts[0]);
    var m = parts[1] || '00';
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    return h12 + ':' + m + ' ' + ampm;
  }
  return dayStr + ', ' + fmtTime(cfg.service_hours_start || '08:00') + ' \u2013 ' + fmtTime(cfg.service_hours_end || '19:00');
}

// Show specific tab programmatically
function showTab(targetId) {
  document.querySelectorAll('.ro-nav-item').forEach(function(b) { b.classList.remove('active'); });
  var matchBtn = document.querySelector('.ro-nav-item[data-target="' + targetId + '"]');
  if (matchBtn) matchBtn.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  var panel = document.getElementById(targetId);
  if (panel) panel.classList.add('active');
}

// ── Notification Bell System ──

var _notifPollInterval = null;
var _notifBellEl = null;
var _notifBadgeEl = null;

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function initNotificationBell(bellSelector) {
  _notifBellEl = document.querySelector(bellSelector);
  if (!_notifBellEl) return;
  _notifBadgeEl = _notifBellEl.querySelector('.notif-badge');
  _notifBellEl.addEventListener('click', function(e) {
    e.stopPropagation();
    openNotificationDrawer();
  });
  pollNotificationCount();
  _notifPollInterval = setInterval(pollNotificationCount, 30000);
}

function pollNotificationCount() {
  fetch('/api/notifications?limit=1&unread_only=true')
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data) updateBellBadge(data.unreadCount);
    })
    .catch(function() {});
}

function updateBellBadge(count) {
  if (!_notifBadgeEl) return;
  if (count > 0) {
    _notifBadgeEl.textContent = count > 99 ? '99+' : count;
    _notifBadgeEl.classList.add('visible');
  } else {
    _notifBadgeEl.classList.remove('visible');
  }
}

var _notifIconMap = {
  new_ride_request: 'ti-car',
  ride_approved: 'ti-circle-check',
  ride_denied: 'ti-circle-x',
  ride_scheduled: 'ti-user-check',
  ride_driver_on_the_way: 'ti-road',
  ride_driver_arrived: 'ti-map-pin',
  ride_completed_rider: 'ti-flag-check',
  ride_no_show_rider: 'ti-user-off',
  ride_cancelled: 'ti-ban',
  ride_unassigned: 'ti-user-minus',
  driver_tardy: 'ti-clock-exclamation',
  rider_no_show: 'ti-user-off',
  rider_approaching_termination: 'ti-alert-triangle',
  rider_terminated: 'ti-shield-off',
  ride_pending_stale: 'ti-clock-pause'
};

function openNotificationDrawer() {
  fetch('/api/notifications?limit=50')
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (!data) return;
      renderNotificationDrawer(data.notifications, data.unreadCount);
    })
    .catch(function() {});
}

function renderNotificationDrawer(notifications, unreadCount) {
  closeDrawer();
  var ov = document.createElement('div');
  ov.className = 'ro-drawer-overlay open';
  ov.id = 'ro-drawer-overlay';
  var dw = document.createElement('div');
  dw.className = 'ro-drawer open';
  dw.id = 'ro-drawer';

  var headerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
    '<span style="font-size:16px;font-weight:700">Notifications</span>' +
    '<div style="display:flex;gap:8px;align-items:center">';
  if (unreadCount > 0) {
    headerHTML += '<button class="ro-btn ro-btn--outline ro-btn--sm" id="notif-mark-all-read">Mark All Read</button>';
  }
  headerHTML += '<button class="ro-btn ro-btn--outline ro-btn--sm" onclick="closeDrawer()">\u2715</button>';
  headerHTML += '</div></div>';

  var listHTML = '';
  if (!notifications.length) {
    listHTML = '<div class="notif-empty"><i class="ti ti-bell-off" style="font-size:24px;display:block;margin-bottom:8px"></i>No notifications yet</div>';
  } else {
    listHTML = '<ul class="notif-list">';
    for (var i = 0; i < notifications.length; i++) {
      var n = notifications[i];
      var cls = n.read ? 'notif-item notif-item--read' : 'notif-item notif-item--unread';
      var icon = _notifIconMap[n.event_type] || 'ti-bell';
      listHTML +=
        '<li class="' + cls + '" data-notif-id="' + escapeHtml(n.id) + '">' +
        '<div class="notif-item__icon"><i class="ti ' + icon + '"></i></div>' +
        '<div class="notif-item__content">' +
        '<div class="notif-item__title">' + escapeHtml(n.title) + '</div>' +
        '<div class="notif-item__body">' + escapeHtml(n.body) + '</div>' +
        '<div class="notif-item__time">' + timeAgo(n.created_at) + '</div>' +
        '</div></li>';
    }
    listHTML += '</ul>';
  }

  dw.innerHTML = headerHTML + '<div id="ro-drawer-content">' + listHTML + '</div>';
  document.body.appendChild(ov);
  document.body.appendChild(dw);
  ov.onclick = closeDrawer;

  // Mark all read button
  var markAllBtn = dw.querySelector('#notif-mark-all-read');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', function() {
      fetch('/api/notifications/read-all', { method: 'PUT' })
        .then(function() {
          updateBellBadge(0);
          dw.querySelectorAll('.notif-item--unread').forEach(function(el) {
            el.classList.remove('notif-item--unread');
            el.classList.add('notif-item--read');
          });
          markAllBtn.remove();
        })
        .catch(function() {});
    });
  }

  // Click individual notification to mark as read
  dw.querySelectorAll('.notif-item--unread').forEach(function(el) {
    el.addEventListener('click', function() {
      var id = el.dataset.notifId;
      fetch('/api/notifications/' + id + '/read', { method: 'PUT' })
        .then(function() {
          el.classList.remove('notif-item--unread');
          el.classList.add('notif-item--read');
          pollNotificationCount();
        })
        .catch(function() {});
    });
  });
}

// ── Profile Cards & DiceBear Avatars ──

var DICEBEAR_BASE = 'https://api.dicebear.com/9.x';
var DICEBEAR_STYLES = [
  { id: 'thumbs', label: 'Thumbs' },
  { id: 'fun-emoji', label: 'Emoji' },
  { id: 'avataaars', label: 'People' },
  { id: 'bottts', label: 'Robots' },
  { id: 'shapes', label: 'Shapes' },
  { id: 'initials', label: 'Initials' }
];

function dicebearUrl(style, seed) {
  return DICEBEAR_BASE + '/' + style + '/svg?seed=' + encodeURIComponent(seed);
}

function defaultAvatarUrl(name) {
  return dicebearUrl('initials', name || 'User');
}

function profileAvatarHTML(avatarUrl, name, size) {
  size = size || '';
  var sizeClass = size === 'lg' ? ' profile-avatar--lg' : '';
  var src = avatarUrl || defaultAvatarUrl(name);
  return '<div class="profile-avatar' + sizeClass + '"><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(name || '') + '"></div>';
}

function profileCardHTML(user, opts) {
  opts = opts || {};
  var variant = opts.variant || '';
  var variantClass = variant ? ' profile-card--' + variant : '';
  var displayName = user.preferredName || user.preferred_name || user.name || 'Unknown';
  var avatarSize = variant === 'hero' ? 'lg' : '';

  var html = '<div class="profile-card' + variantClass + '">';
  html += profileAvatarHTML(user.avatarUrl || user.avatar_url, user.name, avatarSize);
  html += '<div class="profile-info">';
  html += '<div class="profile-name">' + escapeHtml(displayName) + '</div>';

  var details = [];
  if (user.major) details.push(escapeHtml(user.major));
  if (user.graduationYear || user.graduation_year) details.push("'" + String(user.graduationYear || user.graduation_year).slice(-2));
  if (details.length) {
    html += '<div class="profile-detail">' + details.join(' &middot; ') + '</div>';
  }
  if (user.bio) {
    html += '<div class="profile-bio">&ldquo;' + escapeHtml(user.bio) + '&rdquo;</div>';
  }
  html += '</div></div>';
  return html;
}

function avatarPickerHTML(currentAvatarUrl, userId) {
  var html = '<div class="avatar-picker" id="avatar-picker">';
  DICEBEAR_STYLES.forEach(function(style) {
    var url = dicebearUrl(style.id, userId || 'preview');
    var selected = (currentAvatarUrl === url) ? ' selected' : '';
    html += '<div class="avatar-option' + selected + '" data-avatar-url="' + escapeHtml(url) + '" data-style="' + style.id + '" title="' + style.label + '">';
    html += '<img src="' + escapeHtml(url) + '" alt="' + style.label + '">';
    html += '</div>';
  });
  html += '</div>';
  html += '<label class="avatar-upload-btn" for="avatar-upload-input">';
  html += '<i class="ti ti-upload"></i> Upload Photo Instead';
  html += '</label>';
  html += '<input type="file" id="avatar-upload-input" accept="image/png,image/jpeg,image/webp" style="display:none">';
  return html;
}

function initAvatarPicker(containerId, userId, onSelect) {
  var container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll('.avatar-option').forEach(function(opt) {
    opt.addEventListener('click', function() {
      container.querySelectorAll('.avatar-option').forEach(function(o) { o.classList.remove('selected'); });
      opt.classList.add('selected');
      var style = opt.dataset.style;
      var url = dicebearUrl(style, userId || 'preview');
      if (onSelect) onSelect(url);
    });
  });

  var fileInput = container.querySelector('#avatar-upload-input');
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      if (file.size > 500 * 1024) {
        showToastNew('Image must be under 500KB', 'error');
        return;
      }
      var reader = new FileReader();
      reader.onload = function(ev) {
        container.querySelectorAll('.avatar-option').forEach(function(o) { o.classList.remove('selected'); });
        if (onSelect) onSelect(ev.target.result);
      };
      reader.readAsDataURL(file);
    });
  }
}

