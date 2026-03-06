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
  margin: '0 0 4px',
  color: 'var(--color-text)',
};

const cardDescStyle = {
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
        <div className="flex items-center gap-16">
          <button
            onClick={() => setShowAvatarPicker(!showAvatarPicker)}
            className="relative p-0 border-none cursor-pointer"
            style={{
              flexShrink: 0,
              background: 'none', borderRadius: '50%',
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
            <span className="absolute flex items-center justify-center text-sm" style={{
              bottom: -2, right: -2,
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--color-surface)', border: '2px solid var(--color-border)',
              color: 'var(--color-muted)',
            }}>
              <i className="ti ti-camera" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-18 fw-600 lh-tight">{displayName}</div>
            <div className="text-13" style={{ color: 'var(--color-muted)', marginTop: '2px' }}>
              {displayRole}{displayEmail ? ` \u00B7 ${displayEmail}` : ''}
            </div>
          </div>
        </div>

        {showAvatarPicker && profileData && (
          <div className="mt-16 pt-16" style={{ borderTop: '1px solid var(--color-border)' }}>
            <AvatarPicker currentUrl={avatarUrl || profileData.avatar_url} userId={profileData.id} onSelect={handleAvatarSelect} />
          </div>
        )}
      </div>

      {/* Two-column layout: Personal Info + Security */}
      <div className="items-start" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)',
        gap: '20px',
      }}>
        {/* Personal Information Card */}
        <div style={cardStyle}>
          <h3 className="text-14 fw-600" style={cardTitleStyle}>Personal Information</h3>
          <p className="text-sm" style={{ ...cardDescStyle, color: 'var(--color-muted)' }}>Update your name, contact, and academic details.</p>
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
          <h3 className="text-14 fw-600" style={cardTitleStyle}>Security</h3>
          <p className="text-sm" style={{ ...cardDescStyle, color: 'var(--color-muted)' }}>Change your account password.</p>
          <PasswordChange variant="panel" />
        </div>
      </div>
    </div>
  );
}
