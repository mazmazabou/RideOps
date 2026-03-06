import { useState, useEffect } from 'react';
import { fetchProfile, updateProfile } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import AvatarPicker from './AvatarPicker';

export default function ProfileForm({ idPrefix = 'drawer-', placeholderWho = 'drivers', variant = 'drawer', onProfileLoaded }) {
  const { updateUser } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [major, setMajor] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);

  useEffect(() => {
    fetchProfile().then(p => {
      setProfile(p);
      setName(p.name || '');
      setPhone(p.phone || '');
      setPreferredName(p.preferred_name || '');
      setMajor(p.major || '');
      setGradYear(p.graduation_year || '');
      setBio(p.bio || '');
      setAvatarUrl(p.avatar_url || null);
      if (onProfileLoaded) onProfileLoaded(p);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    const body = {
      name,
      phone,
      preferredName: preferredName || null,
      major: major || null,
      graduationYear: gradYear ? parseInt(gradYear, 10) : null,
      bio: bio || null,
    };
    if (avatarUrl !== undefined) body.avatarUrl = avatarUrl;
    try {
      const data = await updateProfile(body);
      updateUser(data);
      showToast('Profile saved', 'success');
    } catch (e) {
      showToast(e.message || 'Could not save', 'error');
    }
  };

  const curYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => curYear + i);

  if (!profile) return null;

  const isPanel = variant === 'panel';

  const fieldGrid = isPanel
    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }
    : undefined;

  return (
    <div className={isPanel ? undefined : 'drawer-section'}>
      {!isPanel && <div className="drawer-section-title">Profile</div>}
      {!isPanel && (
        <div className="mb-8">
          <label className="ro-label" id={idPrefix + 'memberid-label'}>Member ID</label>
          <input type="text" className="ro-input" id={idPrefix + 'memberid'} value={profile.member_id || ''} readOnly />
        </div>
      )}
      {!isPanel && (
        <div className="mb-8">
          <label className="ro-label">Email</label>
          <input type="text" className="ro-input" id={idPrefix + 'email'} value={profile.email || ''} readOnly />
        </div>
      )}
      <div style={fieldGrid}>
        <div className={isPanel ? undefined : 'mb-8'}>
          <label className="ro-label">Full Name</label>
          <input type="text" className="ro-input" id={idPrefix + 'name'} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className={isPanel ? undefined : 'mb-8'}>
          <label className="ro-label">Preferred Name</label>
          <input type="text" className="ro-input" id={idPrefix + 'preferred-name'} value={preferredName} onChange={e => setPreferredName(e.target.value)} placeholder={`What should ${placeholderWho} call you?`} maxLength={50} />
        </div>
        <div className={isPanel ? undefined : 'mb-8'}>
          <label className="ro-label">Phone</label>
          <input type="tel" className="ro-input" id={idPrefix + 'phone'} value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div className={isPanel ? undefined : 'mb-8'}>
          <label className="ro-label">Major</label>
          <input type="text" className="ro-input" id={idPrefix + 'major'} value={major} onChange={e => setMajor(e.target.value)} placeholder="e.g. Computer Science" maxLength={100} />
        </div>
        <div className={isPanel ? undefined : 'mb-8'}>
          <label className="ro-label">Graduation Year</label>
          <select className="ro-input" id={idPrefix + 'grad-year'} value={gradYear} onChange={e => setGradYear(e.target.value)}>
            <option value="">{'\u2014'}</option>
            {years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
          </select>
        </div>
        {isPanel && (
          <div>
            <label className="ro-label" style={{ color: 'var(--color-muted)' }}>Member ID</label>
            <div className="text-14" style={{ padding: '6px 0', color: 'var(--color-text)' }}>{profile.member_id || '\u2014'}</div>
          </div>
        )}
        <div className={isPanel ? undefined : 'mb-8'} style={isPanel ? { gridColumn: '1 / -1' } : undefined}>
          <label className="ro-label">Bio</label>
          <input type="text" className="ro-input" id={idPrefix + 'bio'} value={bio} onChange={e => setBio(e.target.value)} placeholder={`Quick note for your ${placeholderWho === 'drivers' ? 'driver' : 'riders'} (120 chars)`} maxLength={120} />
        </div>
      </div>
      {!isPanel && (
        <div className="mb-12">
          <label className="ro-label">Avatar</label>
          <AvatarPicker currentUrl={avatarUrl} userId={profile.id} onSelect={setAvatarUrl} />
        </div>
      )}
      <button className={`ro-btn ro-btn--primary ro-btn--sm${isPanel ? ' mt-16' : ''}`} id={idPrefix + 'save-btn'} onClick={handleSave}>{isPanel ? 'Save Changes' : 'Save'}</button>
    </div>
  );
}
