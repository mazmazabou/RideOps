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
  padding: '20px',
  marginBottom: '24px',
};

const cardTitleStyle = {
  fontSize: '15px',
  fontWeight: 600,
  margin: '0 0 16px',
};

export default function ProfilePanel() {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const [profileData, setProfileData] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);

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
    <div className="ro-section">
      <div id="admin-profile-content" style={{ maxWidth: '640px' }}>
        <div style={{ marginBottom: '4px' }}>
          <h2 className="ro-section__title" style={{ margin: '0 0 4px' }}>Profile</h2>
          <div className="text-xs text-muted">Update your personal information and preferences.</div>
        </div>

        {/* Identity Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 0' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src={displayAvatar}
              alt={displayName}
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', background: 'var(--color-surface)' }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '18px', fontWeight: 600, lineHeight: 1.3 }}>{displayName}</div>
            <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
              {displayRole}{displayEmail ? ` \u00B7 ${displayEmail}` : ''}
            </div>
          </div>
        </div>

        {/* Avatar Picker (collapsed under identity) */}
        {profileData && (
          <div style={{ marginBottom: '24px' }}>
            <AvatarPicker currentUrl={avatarUrl || profileData.avatar_url} userId={profileData.id} onSelect={handleAvatarSelect} />
          </div>
        )}

        {/* Personal Information Card */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Personal Information</h3>
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
          <PasswordChange variant="panel" />
        </div>
      </div>
    </div>
  );
}
