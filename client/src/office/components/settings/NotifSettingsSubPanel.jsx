import { useState, useEffect, useCallback } from 'react';
import { fetchNotifPreferences, saveNotifPreferences, fetchSettings, saveSettings } from '../../../api';
import { useToast } from '../../../contexts/ToastContext';

export default function NotifSettingsSubPanel() {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [prefsData, settingsData] = await Promise.all([
        fetchNotifPreferences(),
        fetchSettings(),
      ]);
      setPrefs(prefsData);
      const flat = {};
      Object.values(settingsData).flat().forEach(s => { flat[s.key] = s.value; });
      setSettings(flat);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const toggleChannel = (eventType, channel) => {
    setPrefs(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const ch = next.preferences[eventType]?.channels?.[channel];
      if (ch) ch.enabled = !ch.enabled;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save notification preferences
      const prefPayload = [];
      Object.entries(prefs.preferences).forEach(([eventType, pref]) => {
        Object.entries(pref.channels).forEach(([channel, ch]) => {
          prefPayload.push({
            eventType,
            channel,
            enabled: ch.enabled,
            thresholdValue: ch.thresholdValue,
          });
        });
      });
      await saveNotifPreferences({ preferences: prefPayload });

      // Save related settings
      const settingsArr = [
        { key: 'notify_office_tardy', value: String(settings.notify_office_tardy ?? 'true') },
        { key: 'notify_rider_no_show', value: String(settings.notify_rider_no_show ?? 'true') },
        { key: 'notify_rider_strike_warning', value: String(settings.notify_rider_strike_warning ?? 'true') },
      ];
      await saveSettings(settingsArr);
      showToast('Notification settings saved.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div id="notif-prefs-container" className="p-24 text-muted">
        Loading notification preferences...
      </div>
    );
  }

  return (
    <div id="notif-prefs-container" className="p-24">
      <h3 className="ro-section__title">Notification Preferences</h3>
      <div className="text-xs text-muted mb-16">
        Configure which notifications are sent via email and in-app channels.
      </div>

      {prefs && (() => {
        const entries = Object.entries(prefs.preferences);
        return entries.map(([eventType, pref], idx) => (
          <div key={eventType} className="flex items-center justify-between gap-16" style={{
            padding: '12px 0',
            borderBottom: idx < entries.length - 1 ? '1px solid var(--color-border)' : 'none',
          }}>
            <div className="min-w-0">
              <div className="fw-600 text-13" style={{ marginBottom: '2px' }}>{pref.label}</div>
              <div className="text-xs text-muted">{pref.description}</div>
            </div>
            <div className="flex gap-16" style={{ flexShrink: 0 }}>
              {Object.entries(pref.channels).map(([channel, ch]) => (
                <label
                  key={channel}
                  className="flex items-center gap-4 text-13 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={ch.enabled}
                    onChange={() => toggleChannel(eventType, channel)}
                  />
                  {channel === 'email' ? 'Email' : 'In-App'}
                </label>
              ))}
            </div>
          </div>
        ));
      })()}

      <button
        className="ro-btn ro-btn--primary mt-8"
        onClick={handleSave}
        disabled={saving}
      >
        <i className="ti ti-device-floppy"></i> {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
