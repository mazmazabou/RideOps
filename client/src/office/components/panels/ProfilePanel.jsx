import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ProfileForm from '../../../components/drawers/ProfileForm';
import PasswordChange from '../../../components/drawers/PasswordChange';
import AvatarPicker from '../../../components/drawers/AvatarPicker';
import { updateProfile } from '../../../api';
import { useToast } from '../../../contexts/ToastContext';

const cardStyle = {
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  padding: '24px',
  background: 'var(--color-surface)',
};

const cardTitleStyle = {
  fontSize: '14px',
  fontWeight: 600,
  margin: '0 0 4px',
  color: 'var(--color-text)',
};

const cardDescStyle = {
  fontSize: '12px',
  color: 'var(--color-muted)',
  margin: '0 0 20px',
};

export default function ProfilePanel() {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const [profileData, setProfileData] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const handleAvatarSelect = async (url) => {
    setAvatarUrl(url);
    try {
      const data = await updateProfile({ avatarUrl: url });
      updateUser(data);
      showToast('Avatar updated', 'success');
    } catch (e) {
      showToast(e.message || 'Could not update avatar', 'error');
    }
  };

  if (!user) return null;

  const displayName = profileData?.name || user.name || user.username;
  const displayEmail = profileData?.email || '';
  const displayRole = user.role === 'office' ? 'Administrator' : user.role === 'driver' ? 'Driver' : 'Rider';
  const displayAvatar = avatarUrl || profileData?.avatar_url || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(displayName)}`;

  return (
    <div className="ro-section" id="admin-profile-content">

      {/* Identity Header */}
      <div style={{ ...cardStyle, marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => setShowAvatarPicker(!showAvatarPicker)}
            style={{
              position: 'relative', flexShrink: 0, padding: 0, border: 'none',
              background: 'none', cursor: 'pointer', borderRadius: '50%',
            }}
            title="Change avatar"
          >
            <img
              src={displayAvatar}
              alt={displayName}
              style={{
                width: 72, height: 72, borderRadius: '50%', objectFit: 'cover',
                background: 'var(--color-bg)', display: 'block',
              }}
            />
            <span style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--color-surface)', border: '2px solid var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', color: 'var(--color-muted)',
            }}>
              <i className="ti ti-camera" />
            </span>
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 600, lineHeight: 1.3 }}>{displayName}</div>
            <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
              {displayRole}{displayEmail ? ` \u00B7 ${displayEmail}` : ''}
            </div>
          </div>
        </div>

        {showAvatarPicker && profileData && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
            <AvatarPicker currentUrl={avatarUrl || profileData.avatar_url} userId={profileData.id} onSelect={handleAvatarSelect} />
          </div>
        )}
      </div>

      {/* Two-column layout: Personal Info + Security */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)',
        gap: '20px',
        alignItems: 'start',
      }}>
        {/* Personal Information Card */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Personal Information</h3>
          <p style={cardDescStyle}>Update your name, contact, and academic details.</p>
          <ProfileForm
            idPrefix="admin-profile-"
            placeholderWho="staff"
            variant="panel"
            onProfileLoaded={(p) => {
              setProfileData(p);
              setAvatarUrl(p.avatar_url || null);
            }}
          />
        </div>

        {/* Security Card */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Security</h3>
          <p style={cardDescStyle}>Change your account password.</p>
          <PasswordChange variant="panel" />
        </div>
      </div>
    </div>
  );
}
