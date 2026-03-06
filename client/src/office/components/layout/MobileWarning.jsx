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
    <div id="mobile-office-warning" className="flex-col items-center justify-center text-center gap-16" style={{
      position: 'fixed', inset: 0,
      background: 'var(--color-page-bg)', zIndex: 9999,
      padding: '32px',
    }}>
      <i className="ti ti-device-desktop" style={{ fontSize: '48px', color: 'var(--color-primary)' }}></i>
      <div className="text-20" style={{ fontWeight: 800, color: 'var(--color-text)' }}>Desktop Required</div>
      <div className="text-14 text-secondary" style={{ maxWidth: '280px', lineHeight: 1.6 }}>
        The RideOps Operations Console is optimized for desktop and tablet use. Please open this page on a larger screen.
      </div>
      <div className="text-sm text-muted mt-8">
        Drivers and riders can use their role-specific mobile views.
      </div>
      {showDemoLink && (
        <a href="/demo.html" className="ro-btn ro-btn--outline mt-8">
          Switch Role &rarr;
        </a>
      )}
    </div>
  );
}
