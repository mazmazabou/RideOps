import { useState, useEffect, useCallback } from 'react';
import Drawer from '../ui/Drawer';
import { useModal } from '../ui/Modal';
import { useToast } from '../../contexts/ToastContext';
import {
  fetchNotifications,
  markNotifRead,
  markAllNotifsRead,
  bulkReadNotifs,
  bulkDeleteNotifs,
  deleteAllNotifs,
} from '../../api';
import { timeAgo, escapeHtml } from '../../utils/formatters';

const ICON_MAP = {
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
  ride_pending_stale: 'ti-clock-pause',
};

export default function NotificationDrawer({ open, onClose, onCountChange }) {
  const { showModal } = useModal();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const loadNotifications = useCallback(() => {
    fetchNotifications(50).then(data => {
      setNotifications(data.notifications || []);
      setTotalCount(data.totalCount || data.notifications?.length || 0);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      loadNotifications();
    }
  }, [open, loadNotifications]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = notifications.length > 0 && selectedIds.size === notifications.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notifications.map(n => n.id)));
    }
  };

  const handleMarkRead = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    try {
      if (allSelected) {
        await markAllNotifsRead();
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        showToast('All notifications marked as read', 'success');
      } else {
        await bulkReadNotifs(ids);
        setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
        showToast(`Marked ${ids.length} notification${ids.length !== 1 ? 's' : ''} as read`, 'success');
      }
      setSelectedIds(new Set());
      onCountChange();
    } catch {
      showToast('Failed to mark notifications as read', 'error');
    }
  };

  const handleClear = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    const isAll = allSelected;
    const title = isAll ? 'Clear All Notifications' : 'Clear Notifications';
    const body = isAll
      ? `Delete all ${totalCount} notifications? This cannot be undone.`
      : `Delete ${ids.length} selected notification${ids.length !== 1 ? 's' : ''}?`;

    const confirmed = await showModal({
      title,
      body,
      confirmLabel: isAll ? 'Clear All' : 'Clear',
      confirmClass: 'ro-btn--danger',
    });
    if (!confirmed) return;

    try {
      if (isAll) {
        await deleteAllNotifs();
        showToast(`Cleared all ${totalCount} notifications`, 'success');
      } else {
        await bulkDeleteNotifs(ids);
        showToast(`Cleared ${ids.length} notification${ids.length !== 1 ? 's' : ''}`, 'success');
      }
      loadNotifications();
      onCountChange();
    } catch {
      showToast('Failed to clear notifications', 'error');
    }
  };

  const handleClickNotif = async (notif) => {
    if (!notif.read) {
      try {
        await markNotifRead(notif.id);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
        onCountChange();
      } catch { /* ignore */ }
    }
  };

  const markReadLabel = allSelected ? 'Mark All as Read'
    : selectedIds.size > 0 ? `Mark as Read (${selectedIds.size})`
    : 'Mark as Read';

  const clearLabel = allSelected ? `Clear All (${totalCount})`
    : selectedIds.size > 0 ? `Clear (${selectedIds.size})`
    : 'Clear';

  return (
    <Drawer open={open} onClose={onClose} title="Notifications">
      {/* Selection toolbar */}
      {notifications.length > 0 && (
        <div className="flex gap-8 items-center mb-12 pb-8" style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
          <label className="flex items-center gap-6 text-sm text-muted cursor-pointer">
            <input type="checkbox" id="notif-select-all" checked={allSelected} onChange={toggleSelectAll} className="cursor-pointer" /> Select All
          </label>
          <button className="ro-btn ro-btn--outline ro-btn--sm text-sm" id="notif-mark-read" disabled={selectedIds.size === 0} onClick={handleMarkRead}>
            {markReadLabel}
          </button>
          <button className="ro-btn ro-btn--outline ro-btn--sm text-sm" id="notif-clear" disabled={selectedIds.size === 0} onClick={handleClear}>
            <i className="ti ti-trash text-14" /> <span className="notif-clear-label">{clearLabel}</span>
          </button>
          <div className="flex-1" />
          {totalCount > notifications.length && (
            <span className="text-xs text-muted">
              Showing {notifications.length} of {totalCount}
            </span>
          )}
        </div>
      )}

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="notif-empty">
          <i className="ti ti-bell-off text-24 mb-8" style={{ display: 'block' }} />
          No notifications yet
        </div>
      ) : (
        <ul className="notif-list">
          {notifications.map(n => {
            const icon = ICON_MAP[n.event_type] || 'ti-bell';
            return (
              <li
                key={n.id}
                className={`notif-item ${n.read ? 'notif-item--read' : 'notif-item--unread'} flex items-start gap-8`}
                data-notif-id={n.id}
                onClick={() => handleClickNotif(n)}
              >
                <input
                  type="checkbox"
                  className="notif-item-cb mt-4 cursor-pointer"
                  data-id={n.id}
                  checked={selectedIds.has(n.id)}
                  onChange={() => toggleSelect(n.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ flexShrink: 0 }}
                />
                <div className="notif-item__icon"><i className={`ti ${icon}`} /></div>
                <div className="notif-item__content">
                  <div className="notif-item__title">{n.title}</div>
                  <div className="notif-item__body">{n.body}</div>
                  <div className="notif-item__time">{timeAgo(n.created_at)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
