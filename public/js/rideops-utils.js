(function () {
  // ============================================================================
  // Dev mode detection (same as original utils.js)
  // ============================================================================

  function isLocalDevHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  let cachedDevMode;

  async function resolveDevMode() {
    if (typeof cachedDevMode === 'boolean') return cachedDevMode;
    if (typeof window.__DART_IS_DEV__ === 'boolean') {
      cachedDevMode = window.__DART_IS_DEV__;
      return cachedDevMode;
    }
    try {
      const res = await fetch('/api/client-config', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.isDev === 'boolean') {
          cachedDevMode = data.isDev;
          return cachedDevMode;
        }
      }
    } catch {}
    cachedDevMode = isLocalDevHost(window.location.hostname);
    return cachedDevMode;
  }

  function isDevEnvironment() {
    if (typeof cachedDevMode === 'boolean') return cachedDevMode;
    return isLocalDevHost(window.location.hostname);
  }

  async function applyDevOnlyVisibility(root) {
    if (!root) root = document;
    const isDev = await resolveDevMode();
    root.querySelectorAll('[data-dev-only]').forEach(function (el) {
      el.hidden = !isDev;
      el.setAttribute('aria-hidden', String(!isDev));
      if ('disabled' in el) el.disabled = !isDev;
    });
    return isDev;
  }

  // ============================================================================
  // Toast — Bootstrap 5 toast
  // ============================================================================

  function getToastContainer() {
    var existing = document.getElementById('rideops-toast-container');
    if (existing) return existing;
    var container = document.createElement('div');
    container.id = 'rideops-toast-container';
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
  }

  var TOAST_ICONS = {
    success: 'circle-check',
    error: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info-circle'
  };

  var TOAST_COLORS = {
    success: 'success',
    error: 'danger',
    warning: 'warning',
    info: 'info'
  };

  function showToast(message, type, duration) {
    if (!type) type = 'info';
    if (!duration) duration = 3000;
    var container = getToastContainer();
    var icon = TOAST_ICONS[type] || TOAST_ICONS.info;
    var color = TOAST_COLORS[type] || TOAST_COLORS.info;

    var el = document.createElement('div');
    el.className = 'toast align-items-center text-bg-' + color + ' border-0';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-atomic', 'true');
    el.innerHTML =
      '<div class="d-flex">' +
        '<div class="toast-body d-flex align-items-center gap-2">' +
          '<i class="ti ti-' + icon + '" style="font-size:1.2rem;"></i> ' +
          message +
        '</div>' +
        '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>' +
      '</div>';
    container.appendChild(el);

    var toast = new bootstrap.Toast(el, { delay: duration });
    toast.show();
    el.addEventListener('hidden.bs.toast', function () { el.remove(); });
  }

  // ============================================================================
  // Confirm Modal — Bootstrap 5 modal
  // ============================================================================

  function normalizeConfirmOptions(titleOrOptions, message, confirmText, cancelText) {
    if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
      return {
        title: titleOrOptions.title || 'Confirm Action',
        message: titleOrOptions.message || 'Are you sure?',
        confirmLabel: titleOrOptions.confirmLabel || 'Confirm',
        cancelLabel: titleOrOptions.cancelLabel || 'Cancel',
        type: titleOrOptions.type || 'warning'
      };
    }
    return {
      title: titleOrOptions || 'Confirm Action',
      message: message || 'Are you sure?',
      confirmLabel: confirmText || 'Confirm',
      cancelLabel: cancelText || 'Cancel',
      type: 'warning'
    };
  }

  function showConfirmModal(titleOrOptions, message, confirmText, cancelText) {
    return new Promise(function (resolve) {
      var opts = normalizeConfirmOptions(titleOrOptions, message, confirmText, cancelText);
      var btnClass = opts.type === 'danger' ? 'btn-danger' : 'btn-primary';

      var modalEl = document.createElement('div');
      modalEl.className = 'modal modal-blur fade';
      modalEl.tabIndex = -1;
      modalEl.innerHTML =
        '<div class="modal-dialog modal-sm modal-dialog-centered">' +
          '<div class="modal-content">' +
            '<div class="modal-header">' +
              '<h5 class="modal-title">' + opts.title + '</h5>' +
              '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
            '</div>' +
            '<div class="modal-body">' + opts.message + '</div>' +
            '<div class="modal-footer">' +
              '<button type="button" class="btn btn-ghost-secondary" data-bs-dismiss="modal">' + opts.cancelLabel + '</button>' +
              '<button type="button" class="btn ' + btnClass + ' confirm-btn">' + opts.confirmLabel + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      document.body.appendChild(modalEl);
      var modal = new bootstrap.Modal(modalEl);
      var resolved = false;

      modalEl.querySelector('.confirm-btn').onclick = function () {
        resolved = true;
        modal.hide();
        resolve(true);
      };

      modalEl.addEventListener('hidden.bs.modal', function () {
        if (!resolved) resolve(false);
        modalEl.remove();
      });

      modal.show();
    });
  }

  // ============================================================================
  // Empty State — Tabler .empty pattern
  // ============================================================================

  function showEmptyState(containerOrId, options) {
    if (!options) options = {};
    var icon = options.icon || 'inbox';
    var title = options.title || 'No items found';
    var emptyMessage = options.message || '';
    var actionLabel = options.actionLabel || null;
    var actionHandler = options.actionHandler || null;

    var container = typeof containerOrId === 'string'
      ? document.getElementById(containerOrId)
      : containerOrId;
    if (!container) return;

    container.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon"><i class="ti ti-' + icon + '" style="font-size:3rem;"></i></div>' +
        '<p class="empty-title">' + title + '</p>' +
        (emptyMessage ? '<p class="empty-subtitle text-secondary">' + emptyMessage + '</p>' : '') +
        (actionLabel ? '<div class="empty-action"><button class="btn btn-primary empty-action-btn">' + actionLabel + '</button></div>' : '') +
      '</div>';

    if (actionLabel && actionHandler) {
      var btn = container.querySelector('.empty-action-btn');
      if (btn) btn.onclick = actionHandler;
    }
  }

  // ============================================================================
  // Format helpers
  // ============================================================================

  function formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    var date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ============================================================================
  // Tenant theming
  // ============================================================================

  function loadTenantTheme() {
    return fetch('/api/tenant-config')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (config) {
        if (!config) return;
        var style = document.documentElement.style;
        if (config.primaryColor) {
          style.setProperty('--tblr-primary', config.primaryColor);
          var rgb = hexToRgb(config.primaryColor);
          if (rgb) style.setProperty('--tblr-primary-rgb', rgb);
        }
        if (config.secondaryColor) {
          style.setProperty('--tblr-secondary', config.secondaryColor);
          var rgb2 = hexToRgb(config.secondaryColor);
          if (rgb2) style.setProperty('--tblr-secondary-rgb', rgb2);
        }
        if (config.orgName) document.title = config.orgName;
      })
      .catch(function () {});
  }

  function hexToRgb(hex) {
    if (!hex) return null;
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return r + ',' + g + ',' + b;
  }

  // ============================================================================
  // Status badge helper
  // ============================================================================

  var STATUS_ICON_MAP = {
    pending: 'clock',
    approved: 'circle-check',
    scheduled: 'calendar',
    driver_on_the_way: 'car',
    driver_arrived_grace: 'map-pin',
    completed: 'circle-check',
    no_show: 'alert-triangle',
    denied: 'ban',
    cancelled: 'x'
  };

  function statusLabel(status) {
    var labels = {
      pending: 'Pending', approved: 'Approved', scheduled: 'Scheduled',
      driver_on_the_way: 'On The Way', driver_arrived_grace: 'Driver Arrived',
      completed: 'Completed', no_show: 'No-Show', denied: 'Denied', cancelled: 'Cancelled'
    };
    return labels[status] || status.replace(/_/g, ' ');
  }

  function statusBadge(status) {
    var icon = STATUS_ICON_MAP[status] || '';
    var iconHtml = icon ? '<i class="ti ti-' + icon + '"></i> ' : '';
    return '<span class="badge badge-' + status + '">' + iconHtml + statusLabel(status) + '</span>';
  }

  // ============================================================================
  // Exports
  // ============================================================================

  window.resolveDevMode = resolveDevMode;
  window.isDevEnvironment = isDevEnvironment;
  window.applyDevOnlyVisibility = applyDevOnlyVisibility;
  window.showToast = showToast;
  window.showConfirmModal = showConfirmModal;
  window.showEmptyState = showEmptyState;
  window.formatDateTime = formatDateTime;
  window.loadTenantTheme = loadTenantTheme;
  window.statusBadge = statusBadge;
  window.statusLabel = statusLabel;
})();
