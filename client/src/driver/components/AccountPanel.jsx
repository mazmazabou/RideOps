import ProfileForm from '../../components/drawers/ProfileForm';
import PasswordChange from '../../components/drawers/PasswordChange';
import NotificationToggles from '../../components/NotificationToggles';

export default function AccountPanel() {
  return (
    <>
      <ProfileForm idPrefix="profile-" placeholderWho="riders" />
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 20 }}>
        <PasswordChange />
      </div>
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 20, marginTop: 20 }}>
        <NotificationToggles role="driver" />
      </div>
    </>
  );
}
