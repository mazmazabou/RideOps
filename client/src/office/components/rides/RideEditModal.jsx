import { useState } from 'react';
import { createPortal } from 'react-dom';
import { editRide } from '../../../api';
import { useToast } from '../../../contexts/ToastContext';

export default function RideEditModal({ ride, locations, onClose, onSaved }) {
  const { showToast } = useToast();
  const [pickup, setPickup] = useState(ride?.pickupLocation || '');
  const [dropoff, setDropoff] = useState(ride?.dropoffLocation || '');
  const [time, setTime] = useState(() => {
    if (!ride?.requestedTime) return '';
    return new Date(ride.requestedTime).toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState(ride?.notes || '');
  const [changeNotes, setChangeNotes] = useState('');
  const [initials, setInitials] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  if (!ride) return null;

  const locationOptions = (locations || []).map(loc => {
    const label = typeof loc === 'string' ? loc : (loc.label || loc.value);
    return label;
  }).filter(Boolean);

  // Add current values if not in list
  const pickupOptions = [...new Set([...locationOptions, pickup].filter(Boolean))];
  const dropupOptions = [...new Set([...locationOptions, dropoff].filter(Boolean))];

  const handleSave = async () => {
    setErrorMsg('');
    if (!changeNotes.trim()) { setErrorMsg('Change notes are required'); return; }
    if (!initials.trim()) { setErrorMsg('Initials are required'); return; }

    setSaving(true);
    try {
      await editRide(ride.id, {
        pickupLocation: pickup,
        dropoffLocation: dropoff,
        requestedTime: time ? new Date(time).toISOString() : ride.requestedTime,
        notes,
        changeNotes: changeNotes.trim(),
        initials: initials.trim(),
      });
      showToast('Ride updated successfully', 'success');
      onSaved();
    } catch (e) {
      setErrorMsg(e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <h3>Edit Ride</h3>
        <label>
          Pickup Location
          <select className="ro-input" value={pickup} onChange={e => setPickup(e.target.value)}>
            <option value="">Select location</option>
            {pickupOptions.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </label>
        <label>
          Dropoff Location
          <select className="ro-input" value={dropoff} onChange={e => setDropoff(e.target.value)}>
            <option value="">Select location</option>
            {dropupOptions.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </label>
        <label>
          Requested Time
          <input
            type="datetime-local"
            className="ro-input"
            value={time}
            onChange={e => setTime(e.target.value)}
          />
        </label>
        <label>
          Rider Notes
          <textarea className="ro-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </label>
        <hr className="border-none" style={{ margin: '16px 0', borderTop: '1px solid var(--border)' }} />
        <label>
          Change Notes <span style={{ color: 'var(--status-no-show)' }}>*</span>
          <textarea
            className="ro-input"
            rows={2}
            placeholder="Describe what changed and why..."
            value={changeNotes}
            onChange={e => setChangeNotes(e.target.value)}
          />
        </label>
        <label>
          Initials <span style={{ color: 'var(--status-no-show)' }}>*</span>
          <input
            type="text"
            className="ro-input"
            maxLength={5}
            placeholder="Your initials"
            style={{ maxWidth: 120 }}
            value={initials}
            onChange={e => setInitials(e.target.value)}
          />
        </label>
        {errorMsg && (
          <div className="small-text mt-8" style={{ color: 'var(--status-no-show)' }}>
            {errorMsg}
          </div>
        )}
        <div className="flex-row gap-8 mt-12">
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
