import { useState, useEffect } from 'react';

export default function MobileWarning() {
  const [visible, setVisible] = useState(false);
  const [showDemoLink, setShowDemoLink] = useState(false);

  useEffect(() => {
    const check = () => setVisible(window.innerWidth <= 480);
    check();
    window.addEventListener('resize', check);

    // Check demo mode
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(u => { if (u.demoMode) setShowDemoLink(true); })
      .catch(() => {});

    return () => window.removeEventListener('resize', check);
  }, []);

  if (!visible) return null;

  return (
    <div id="mobile-office-warning" style={{
      display: 'flex', position: 'fixed', inset: 0,
      background: 'var(--color-page-bg)', zIndex: 9999,
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '32px', gap: '16px',
    }}>
      <i className="ti ti-device-desktop" style={{ fontSize: '48px', color: 'var(--color-primary)' }}></i>
      <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-text)' }}>Desktop Required</div>
      <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', maxWidth: '280px', lineHeight: 1.6 }}>
        The RideOps Operations Console is optimized for desktop and tablet use. Please open this page on a larger screen.
      </div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
        Drivers and riders can use their role-specific mobile views.
      </div>
      {showDemoLink && (
        <a href="/demo.html" className="ro-btn ro-btn--outline" style={{ marginTop: '8px' }}>
          Switch Role &rarr;
        </a>
      )}
    </div>
  );
}
