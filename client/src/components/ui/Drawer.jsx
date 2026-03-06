import { createPortal } from 'react-dom';

export default function Drawer({ open, onClose, title, children }) {
  if (!open) return null;

  return createPortal(
    <>
      <div className="ro-drawer-overlay open" onClick={onClose} />
      <div className="ro-drawer open">
        <div className="flex justify-between items-center mb-16">
          <span className="text-16 fw-700">{title || 'Details'}</span>
          <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div>{children}</div>
      </div>
    </>,
    document.body
  );
}
