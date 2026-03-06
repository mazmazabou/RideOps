import Drawer from '../ui/Drawer';
import { ProfileAvatar } from '../ui/ProfileCard';
import ProfileForm from './ProfileForm';
import PasswordChange from './PasswordChange';
import { useAuth } from '../../contexts/AuthContext';
import { isActiveStatus } from '../../utils/status';
import { escapeHtml } from '../../utils/formatters';

export default function SettingsDrawer({ open, onClose }) {
  const { user, logout } = useAuth();

  if (!user) return null;

  // We can't easily get missCount from here without rides context,
  // but the user object may have it from meUser enrichment
  const missCount = user.consecutiveMisses || 0;

  return (
    <Drawer open={open} onClose={onClose} title="Settings">
      {/* Header with avatar */}
      <div className="flex items-center gap-12" style={{ marginBottom: 20 }}>
        <ProfileAvatar avatarUrl={user.avatar_url} name={user.name} size="lg" />
        <div>
          <div className="fw-700" style={{ fontSize: 15 }}>{user.preferred_name || user.name || ''}</div>
          <div className="text-xs text-muted">{user.email || ''}</div>
        </div>
      </div>

      {/* No-show banner */}
      {missCount > 0 && (
        <div className={`drawer-noshows-banner ${missCount >= 5 ? 'noshows-critical' : missCount >= 3 ? 'noshows-warn' : 'noshows-clear'}`}>
          <div className="drawer-noshows-count">{missCount}/5</div>
          <div className="drawer-noshows-label">consecutive no-shows</div>
        </div>
      )}

      <ProfileForm />
      <PasswordChange />

      <hr className="drawer-divider" />
      <button className="ro-btn ro-btn--danger ro-btn--full" onClick={logout}>
        <i className="ti ti-logout" /> Logout
      </button>
    </Drawer>
  );
}
