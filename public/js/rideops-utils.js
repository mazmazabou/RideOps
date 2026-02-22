/* ── RideOps Shared Utilities ── */

// Tenant theme loader
async function applyTenantTheme() {
  try {
    const config = await fetch('/api/tenant-config').then(r => r.json());
    const root = document.documentElement;
    if (config.primaryColor) root.style.setProperty('--color-primary', config.primaryColor);
    if (config.secondaryColor) root.style.setProperty('--color-accent', config.secondaryColor);
    const orgEl = document.getElementById('org-name');
    if (orgEl && config.orgName) orgEl.textContent = config.orgName;
    const shortEl = document.getElementById('org-short-name');
    if (shortEl && config.orgShortName) shortEl.textContent = config.orgShortName;
  } catch (e) { console.warn('Tenant config not loaded:', e); }
}

// Status badge HTML
function statusBadge(status) {
  const label = (status || '').replace(/_/g, ' ').replace('driver ', '');
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
  overlay.querySelector('[data-action="confirm"]').onclick = function() { overlay.remove(); if (onConfirm) onConfirm(); };
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
    try { localStorage.setItem('dart-sidebar-collapsed', shell.classList.contains('collapsed') ? '1' : ''); } catch(e) {}
  }
}
function restoreSidebarState() {
  try {
    if (localStorage.getItem('dart-sidebar-collapsed') === '1') {
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

// Show specific tab programmatically
function showTab(targetId) {
  document.querySelectorAll('.ro-nav-item').forEach(function(b) { b.classList.remove('active'); });
  var matchBtn = document.querySelector('.ro-nav-item[data-target="' + targetId + '"]');
  if (matchBtn) matchBtn.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  var panel = document.getElementById(targetId);
  if (panel) panel.classList.add('active');
}
