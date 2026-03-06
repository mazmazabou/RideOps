import { useState, useEffect, useCallback } from 'react';
import { fetchSettings, saveSettings, purgeOldRides } from '../../../api';
import { useToast } from '../../../contexts/ToastContext';
import { useModal } from '../../../components/ui/Modal';

export default function DataSubPanel() {
  const { showToast } = useToast();
  const { showModal } = useModal();
  const [retentionValue, setRetentionValue] = useState('0');
  const [retentionUnit, setRetentionUnit] = useState('months');
  const [purgeResult, setPurgeResult] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchSettings();
      const flat = {};
      Object.values(data).flat().forEach(s => { flat[s.key] = s.value; });
      setRetentionValue(flat.ride_retention_value || '0');
      setRetentionUnit(flat.ride_retention_unit || 'months');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    try {
      await saveSettings([
        { key: 'ride_retention_value', value: retentionValue },
        { key: 'ride_retention_unit', value: retentionUnit },
      ]);
      showToast('Retention settings saved.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handlePurge = async () => {
    const ok = await showModal({
      title: 'Purge Old Rides',
      body: 'This will permanently delete all qualifying closed rides. This cannot be undone.',
      confirmLabel: 'Purge',
      confirmClass: 'ro-btn--danger',
    });
    if (!ok) return;
    try {
      const result = await purgeOldRides();
      setPurgeResult('Purged ' + result.purged + ' rides (cutoff: ' + result.cutoffDate + ').');
      showToast('Purged ' + result.purged + ' ride(s).', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  if (loading) return <div className="p-24 text-muted">Loading...</div>;

  const retentionStatus = Number(retentionValue) > 0
    ? 'Current: Delete after ' + retentionValue + ' ' + retentionUnit
    : 'Current: Keep forever';

  return (
    <div className="p-24">
      <h3 className="ro-section__title">Ride Data Retention</h3>
      <div className="text-xs text-muted mb-16">
        Automatically purge closed rides (completed, no-show, denied, cancelled) older than the configured period.
        Active rides are never purged. Set value to 0 to keep rides forever.
      </div>
      <div className="flex items-center gap-8 mb-16 flex-wrap">
        <label className="ro-label" style={{ marginBottom: 0 }}>Delete closed rides older than:</label>
        <input
          type="number"
          id="retention-value"
          className="ro-input"
          style={{ width: '80px' }}
          min="0"
          max="99"
          value={retentionValue}
          onChange={e => setRetentionValue(e.target.value)}
        />
        <select
          id="retention-unit"
          className="ro-select"
          style={{ width: 'auto' }}
          value={retentionUnit}
          onChange={e => setRetentionUnit(e.target.value)}
        >
          <option value="weeks">weeks</option>
          <option value="months">months</option>
          <option value="years">years</option>
        </select>
        <button className="ro-btn ro-btn--primary ro-btn--sm" id="save-retention-btn" onClick={handleSave}>
          <i className="ti ti-device-floppy"></i> Save
        </button>
      </div>
      <div className="text-xs text-muted mb-24" id="retention-status">{retentionStatus}</div>
      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '16px 0' }} />
      <h4 className="ro-section__title text-14">Manual Purge</h4>
      <div className="text-xs text-muted mb-8">
        Run the retention policy now. This will permanently delete qualifying closed rides.
      </div>
      <div className="flex items-center gap-8">
        <button
          className="ro-btn ro-btn--danger ro-btn--sm"
          id="purge-now-btn"
          disabled={Number(retentionValue) === 0}
          title={Number(retentionValue) === 0 ? 'Set a retention period first' : ''}
          onClick={handlePurge}
        >
          <i className="ti ti-trash"></i> Purge Now
        </button>
        <span className="text-sm text-muted" id="purge-result">{purgeResult}</span>
      </div>
    </div>
  );
}
