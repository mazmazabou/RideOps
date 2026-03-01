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
      success: 'ti ti-circle-check',
      error: 'ti ti-circle-x',
      warning: 'ti ti-alert-triangle',
      info: 'ti ti-info-circle'
    };
    return icons[type] || icons.info;
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
        <div class="empty-icon"><i class="ti ti-${icon}" style="font-size: 48px; opacity: 0.4;"></i></div>
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
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  window.resolveDevMode = resolveDevMode;
  window.isDevEnvironment = isDevEnvironment;
  window.applyDevOnlyVisibility = applyDevOnlyVisibility;
  window.getToastIcon = getToastIcon;
  window.showEmptyState = showEmptyState;
  window.formatDateTime = formatDateTime;
})();
