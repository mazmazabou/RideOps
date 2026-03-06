import { useState, useEffect, useCallback } from 'react';
import { fetchNotifPreferences, saveNotifPreferences } from '../api';
import { useToast } from '../contexts/ToastContext';

const DRIVER_GROUPS = [
  { label: 'Ride Reminders', icon: 'ti-car', keys: ['driver_upcoming_ride', 'driver_new_assignment', 'driver_ride_cancelled'] },
  { label: 'Shift & Attendance', icon: 'ti-clock', keys: ['driver_late_clock_in', 'driver_missed_shift'] },
];

const RIDER_GROUPS = [
  { label: 'Ride Updates', icon: 'ti-car', keys: ['rider_ride_approved', 'rider_ride_denied', 'rider_driver_on_way', 'rider_driver_arrived', 'rider_ride_completed', 'rider_ride_cancelled'] },
  { label: 'Account', icon: 'ti-user', keys: ['rider_no_show_notice', 'rider_strike_warning', 'rider_terminated_notice'] },
];

export default function NotificationToggles({ role }) {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  const groups = role === 'driver' ? DRIVER_GROUPS : RIDER_GROUPS;

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifPreferences();
      setPrefs(data);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (eventType, channel) => {
    const prev = prefs.preferences[eventType]?.channels?.[channel];
    if (!prev) return;
    const newEnabled = !prev.enabled;

    // Optimistic update
    setPrefs(p => {
      const next = JSON.parse(JSON.stringify(p));
      next.preferences[eventType].channels[channel].enabled = newEnabled;
      return next;
    });

    setSavingKey(`${eventType}-${channel}`);
    try {
      await saveNotifPreferences({
        preferences: [{
          eventType,
          channel,
          enabled: newEnabled,
          thresholdValue: prev.thresholdValue,
        }]
      });
      showToast('Preference saved', 'success');
    } catch (e) {
      // Revert on error
      setPrefs(p => {
        const next = JSON.parse(JSON.stringify(p));
        next.preferences[eventType].channels[channel].enabled = !newEnabled;
        return next;
      });
      showToast(e.message, 'error');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return <div className="text-muted text-13 p-16">Loading notification preferences...</div>;
  }

  if (!prefs) return null;

  return (
    <div className="notif-toggles">
      <h4 className="ro-section__title" style={{ fontSize: 14, marginBottom: 4 }}>
        <i className="ti ti-bell" style={{ marginRight: 6 }} />
        Notifications
      </h4>
      <div className="text-xs text-muted" style={{ marginBottom: 16 }}>
        Choose how you'd like to be notified.
      </div>

      {groups.map(group => {
        const groupPrefs = group.keys
          .filter(k => prefs.preferences[k])
          .map(k => ({ key: k, ...prefs.preferences[k] }));

        if (!groupPrefs.length) return null;

        return (
          <div key={group.label} style={{ marginBottom: 20 }}>
            <div className="flex items-center gap-8 text-13 fw-600" style={{ marginBottom: 8, color: 'var(--color-text)' }}>
              <i className={`ti ${group.icon}`} style={{ fontSize: 16, opacity: 0.7 }} />
              {group.label}
            </div>

            {groupPrefs.map((pref, idx) => (
              <div
                key={pref.key}
                className="flex items-center justify-between gap-12"
                style={{
                  padding: '10px 0',
                  borderBottom: idx < groupPrefs.length - 1 ? '1px solid var(--color-border)' : 'none',
                }}
              >
                <div className="min-w-0">
                  <div className="text-13" style={{ marginBottom: 1 }}>{pref.label}</div>
                  <div className="text-xs text-muted">{pref.description}</div>
                </div>
                <div className="flex gap-12" style={{ flexShrink: 0 }}>
                  {Object.entries(pref.channels).map(([channel, ch]) => (
                    <label key={channel} className="notif-toggle-label">
                      <input
                        type="checkbox"
                        className="notif-toggle-input"
                        checked={ch.enabled}
                        onChange={() => toggle(pref.key, channel)}
                        disabled={savingKey === `${pref.key}-${channel}`}
                      />
                      <span className="notif-toggle-switch" />
                      <span className="notif-toggle-text">
                        {channel === 'email' ? 'Email' : 'In-App'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
