(function () {
  function isLocalDevHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  let cachedDevMode;

  async function resolveDevMode() {
    if (typeof cachedDevMode === 'boolean') return cachedDevMode;

    if (typeof window.__RIDEOPS_IS_DEV__ === 'boolean') {
      cachedDevMode = window.__RIDEOPS_IS_DEV__;
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
    } catch {
      // Fall back to hostname-based detection when config is unavailable.
    }

    cachedDevMode = isLocalDevHost(window.location.hostname);
    return cachedDevMode;
  }

  function isDevEnvironment() {
    if (typeof cachedDevMode === 'boolean') return cachedDevMode;
    return isLocalDevHost(window.location.hostname);
  }

  async function applyDevOnlyVisibility(root = document) {
    const isDev = await resolveDevMode();
    root.querySelectorAll('[data-dev-only]').forEach((el) => {
      el.hidden = !isDev;
      el.setAttribute('aria-hidden', String(!isDev));
      if ('disabled' in el) {
        el.disabled = !isDev;
      }
    });
    return isDev;
  }

  function getToastIcon(type) {
    const icons = {
      success: 'check_circle',
      error: 'error',
      warning: 'warning',
      info: 'info'
    };
    return icons[type] || icons.info;
  }

  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon"><span class="material-symbols-outlined">${getToastIcon(type)}</span></span>
      <span class="toast-message">${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

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
    return new Promise((resolve) => {
      const opts = normalizeConfirmOptions(titleOrOptions, message, confirmText, cancelText);

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-box">
          <h3 class="modal-title">${opts.title}</h3>
          <p class="modal-message">${opts.message}</p>
          <div class="modal-actions">
            <button class="btn secondary modal-cancel">${opts.cancelLabel}</button>
            <button class="btn ${opts.type === 'danger' ? 'danger' : 'primary'} modal-confirm">${opts.confirmLabel}</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const cleanup = () => {
        modal.classList.add('hiding');
        setTimeout(() => modal.remove(), 200);
      };

      modal.querySelector('.modal-cancel').onclick = () => {
        cleanup();
        resolve(false);
      };

      modal.querySelector('.modal-confirm').onclick = () => {
        cleanup();
        resolve(true);
      };

      modal.onclick = (event) => {
        if (event.target === modal) {
          cleanup();
          resolve(false);
        }
      };

      setTimeout(() => modal.classList.add('show'), 10);
    });
  }

  function showEmptyState(containerOrId, options = {}) {
    const {
      icon = 'inbox',
      title = 'No items found',
      message = '',
      actionLabel = null,
      actionHandler = null
    } = options;

    const container = typeof containerOrId === 'string'
      ? document.getElementById(containerOrId)
      : containerOrId;

    if (!container) return;

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><span class="material-symbols-outlined">${icon}</span></div>
        <h3 class="empty-title">${title}</h3>
        ${message ? `<p class="empty-message">${message}</p>` : ''}
        ${actionLabel ? `<button class="btn secondary empty-action">${actionLabel}</button>` : ''}
      </div>
    `;

    if (actionLabel && actionHandler) {
      const actionBtn = container.querySelector('.empty-action');
      if (actionBtn) actionBtn.onclick = actionHandler;
    }
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return `${date.toLocaleDateString(undefined, { timeZone: 'America/Los_Angeles' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' })}`;
  }

  window.resolveDevMode = resolveDevMode;
  window.isDevEnvironment = isDevEnvironment;
  window.applyDevOnlyVisibility = applyDevOnlyVisibility;
  window.getToastIcon = getToastIcon;
  window.showToast = showToast;
  window.showConfirmModal = showConfirmModal;
  window.showEmptyState = showEmptyState;
  window.formatDateTime = formatDateTime;
})();
