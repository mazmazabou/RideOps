export default function OfficeHeader({ title, unreadCount, onBellClick }) {
  return (
    <header className="ro-header flex justify-between items-center">
      <h1 className="ro-header-title" id="header-title">{title}</h1>
      <button className="notif-bell" id="notif-bell-btn" title="Notifications" onClick={onBellClick}>
        <i className="ti ti-bell"></i>
        <span className={`notif-badge${unreadCount > 0 ? ' visible' : ''}`} id="notif-badge">
          {unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : ''}
        </span>
      </button>
    </header>
  );
}
