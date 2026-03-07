import { useState, useEffect, useCallback } from 'react';
import { fetchSettings, saveSettings } from '../../../api';
import { useToast } from '../../../contexts/ToastContext';
import './settings.css';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Toggle({ checked, onChange, id }) {
  return (
    <label className="settings-toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="settings-toggle__track" />
    </label>
  );
}

export default function BusinessRulesSubPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState({});
  const [operatingDays, setOperatingDays] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await fetchSettings();
      const flat = {};
      Object.values(data).flat().forEach(s => { flat[s.key] = s.value; });
      setSettings(flat);
      const days = (flat.operating_days || '0,1,2,3,4,5,6').split(',').map(Number).filter(n => !isNaN(n));
      setOperatingDays(new Set(days));
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const toggleDay = (dayIndex) => {
    setOperatingDays(prev => {
      const next = new Set(prev);
      if (next.has(dayIndex)) next.delete(dayIndex); else next.add(dayIndex);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const arr = [
        { key: 'service_hours_start', value: settings.service_hours_start || '08:00' },
        { key: 'service_hours_end', value: settings.service_hours_end || '19:00' },
        { key: 'operating_days', value: Array.from(operatingDays).sort().join(',') },
        { key: 'auto_deny_outside_hours', value: String(settings.auto_deny_outside_hours ?? 'true') },
        { key: 'grace_period_minutes', value: String(settings.grace_period_minutes ?? '5') },
        { key: 'max_no_show_strikes', value: String(settings.max_no_show_strikes ?? '5') },
        { key: 'strikes_enabled', value: String(settings.strikes_enabled ?? 'true') },
        { key: 'tardy_threshold_minutes', value: String(settings.tardy_threshold_minutes ?? '1') },
      ];
      await saveSettings(arr);
      showToast('Settings saved.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const strikesEnabled = settings.strikes_enabled !== 'false';

  if (loading) {
    return (
      <div className="settings-skeleton" style={{ padding: '0 24px' }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="settings-skeleton__block" style={{ height: 160 }} />
        ))}
      </div>
    );
  }

  return (
    <div id="business-rules-container" style={{ padding: '0 24px' }}>
      <div className="settings-section">

        {/* ── Service Schedule ───────────────────────────────────────── */}
        <div className="settings-card">
          <div className="settings-card__header">
            <div className="settings-card__icon">
              <i className="ti ti-clock" />
            </div>
            <div className="settings-card__text">
              <h3 className="settings-card__title">Service Schedule</h3>
              <p className="settings-card__desc">
                Define when your transportation service is available. Rides outside these windows can be automatically denied.
              </p>
            </div>
          </div>

          {/* Service Hours */}
          <div className="settings-field settings-field--stacked">
            <div className="settings-field__info">
              <div className="settings-field__label">Service Hours</div>
              <p className="settings-field__help">The daily window when rides can be requested and fulfilled.</p>
            </div>
            <div className="settings-field__control">
              <div className="settings-time-range">
                <input
                  type="time"
                  className="ro-input"
                  value={settings.service_hours_start || '08:00'}
                  onChange={e => updateSetting('service_hours_start', e.target.value)}
                />
                <span className="settings-time-range__sep">to</span>
                <input
                  type="time"
                  className="ro-input"
                  value={settings.service_hours_end || '19:00'}
                  onChange={e => updateSetting('service_hours_end', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Operating Days */}
          <div className="settings-field settings-field--stacked">
            <div className="settings-field__info">
              <div className="settings-field__label">Operating Days</div>
              <p className="settings-field__help">Select the days of the week when service is active.</p>
            </div>
            <div className="settings-field__control">
              <div className="settings-day-toggles">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    className={`settings-day-btn${operatingDays.has(i) ? ' active' : ''}`}
                    onClick={() => toggleDay(i)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Auto-Deny */}
          <div className="settings-field">
            <div className="settings-field__info">
              <div className="settings-field__label">Auto-Deny Outside Hours</div>
              <p className="settings-field__help">Automatically deny ride requests submitted outside service hours and operating days.</p>
            </div>
            <div className="settings-field__control">
              <Toggle
                id="toggle-auto-deny"
                checked={settings.auto_deny_outside_hours !== 'false'}
                onChange={v => updateSetting('auto_deny_outside_hours', String(v))}
              />
            </div>
          </div>
        </div>

        {/* ── Ride Policies ─────────────────────────────────────────── */}
        <div className="settings-card">
          <div className="settings-card__header">
            <div className="settings-card__icon">
              <i className="ti ti-shield-check" />
            </div>
            <div className="settings-card__text">
              <h3 className="settings-card__title">Ride Policies</h3>
              <p className="settings-card__desc">
                Configure rider accountability. No-show tracking helps maintain service reliability by flagging repeated missed pickups.
              </p>
            </div>
          </div>

          {/* Grace Period */}
          <div className="settings-field">
            <div className="settings-field__info">
              <div className="settings-field__label">Grace Period</div>
              <p className="settings-field__help">Minutes a driver waits after arrival before the rider can be marked as a no-show.</p>
            </div>
            <div className="settings-field__control">
              <input
                type="number"
                className="ro-input settings-number-input"
                min="0"
                value={settings.grace_period_minutes ?? '5'}
                onChange={e => updateSetting('grace_period_minutes', e.target.value)}
              />
              <span className="settings-field__help">min</span>
            </div>
          </div>

          {/* Strikes Enabled */}
          <div className="settings-field">
            <div className="settings-field__info">
              <div className="settings-field__label">No-Show Strikes</div>
              <p className="settings-field__help">When enabled, consecutive no-shows are counted toward automatic service termination.</p>
            </div>
            <div className="settings-field__control">
              <Toggle
                id="toggle-strikes"
                checked={strikesEnabled}
                onChange={v => updateSetting('strikes_enabled', String(v))}
              />
            </div>
          </div>

          {/* Max Strikes */}
          <div className={`settings-field${!strikesEnabled ? ' settings-field--disabled' : ''}`}>
            <div className="settings-field__info">
              <div className="settings-field__label">Max Strikes Before Termination</div>
              <p className="settings-field__help">Number of consecutive no-shows before a rider's service is suspended. Completing a ride resets the count.</p>
            </div>
            <div className="settings-field__control">
              <input
                type="number"
                className="ro-input settings-number-input"
                min="1"
                value={settings.max_no_show_strikes ?? '5'}
                onChange={e => updateSetting('max_no_show_strikes', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── Staff Policies ────────────────────────────────────────── */}
        <div className="settings-card">
          <div className="settings-card__header">
            <div className="settings-card__icon">
              <i className="ti ti-users" />
            </div>
            <div className="settings-card__text">
              <h3 className="settings-card__title">Staff Policies</h3>
              <p className="settings-card__desc">
                Set expectations for driver punctuality and attendance tracking.
              </p>
            </div>
          </div>

          {/* Tardy Threshold */}
          <div className="settings-field">
            <div className="settings-field__info">
              <div className="settings-field__label">Tardy Threshold</div>
              <p className="settings-field__help">Minutes after shift start before a clock-in is marked as tardy. Admins can be notified when this occurs.</p>
            </div>
            <div className="settings-field__control">
              <input
                type="number"
                className="ro-input settings-number-input"
                min="1"
                value={settings.tardy_threshold_minutes ?? '1'}
                onChange={e => updateSetting('tardy_threshold_minutes', e.target.value)}
              />
              <span className="settings-field__help">min</span>
            </div>
          </div>
        </div>

      </div>

      {/* ── Save ──────────────────────────────────────────────────── */}
      <div className="settings-save-bar">
        <button className="ro-btn ro-btn--primary" onClick={handleSave} disabled={saving}>
          <i className={`ti ${saving ? 'ti-loader-2 ti-spin' : 'ti-device-floppy'}`} />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
