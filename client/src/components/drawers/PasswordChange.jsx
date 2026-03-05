import { useState } from 'react';
import { changePassword } from '../../api';
import { useToast } from '../../contexts/ToastContext';

export default function PasswordChange({ variant = 'drawer' }) {
  const { showToast } = useToast();
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');

  const handleSubmit = async () => {
    if (!current || !newPw || !confirm) {
      showToast('All fields required', 'error');
      return;
    }
    if (newPw.length < 8) {
      showToast('Min 8 characters', 'error');
      return;
    }
    if (newPw !== confirm) {
      showToast('Passwords do not match', 'error');
      return;
    }
    try {
      await changePassword({ currentPassword: current, newPassword: newPw });
      showToast('Password updated', 'success');
      setCurrent('');
      setNewPw('');
      setConfirm('');
    } catch (e) {
      showToast(e.message || 'Failed', 'error');
    }
  };

  return (
    <div className={variant === 'drawer' ? 'drawer-section' : undefined}>
      {variant === 'drawer' && <div className="drawer-section-title">Change Password</div>}
      <div style={{ marginBottom: 8 }}>
        <label className="ro-label">Current Password</label>
        <input type="password" className="ro-input" id="drawer-pw-current" value={current} onChange={e => setCurrent(e.target.value)} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label className="ro-label">New Password (min 8)</label>
        <input type="password" className="ro-input" id="drawer-pw-new" value={newPw} onChange={e => setNewPw(e.target.value)} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label className="ro-label">Confirm</label>
        <input type="password" className="ro-input" id="drawer-pw-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} />
      </div>
      <button className="ro-btn ro-btn--outline ro-btn--sm" id="drawer-pw-btn" onClick={handleSubmit}>Update Password</button>
    </div>
  );
}
