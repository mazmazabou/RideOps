import { useRef } from 'react';
import { useToast } from '../../contexts/ToastContext';

const MAX_RAW_SIZE = 2 * 1024 * 1024; // 2MB

function compressImage(file, maxSize = 256, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      canvas.width = maxSize;
      canvas.height = maxSize;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export default function AvatarPicker({ currentUrl, userId, userName, onSelect }) {
  const { showToast } = useToast();
  const fileRef = useRef(null);

  const defaultUrl = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(userName || userId || 'User')}`;
  const displayUrl = currentUrl || defaultUrl;
  const hasCustomAvatar = currentUrl && !currentUrl.includes('api.dicebear.com');

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_RAW_SIZE) {
      showToast('Image must be under 2MB', 'error');
      e.target.value = '';
      return;
    }
    try {
      const dataUri = await compressImage(file);
      onSelect(dataUri);
    } catch {
      // Canvas failed -- fall back to raw file read with size guard
      if (file.size > MAX_RAW_SIZE) {
        showToast('Image must be under 2MB', 'error');
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => onSelect(ev.target.result);
        reader.readAsDataURL(file);
      }
    }
    e.target.value = '';
  };

  const handleRemove = () => {
    onSelect(null);
  };

  return (
    <div className="avatar-picker">
      <div className="avatar-preview">
        <img src={displayUrl} alt="Avatar preview" />
      </div>
      <div className="avatar-actions">
        <button
          type="button"
          className="ro-btn ro-btn--outline ro-btn--sm"
          onClick={() => fileRef.current?.click()}
        >
          <i className="ti ti-upload" /> Upload Photo
        </button>
        {hasCustomAvatar && (
          <button
            type="button"
            className="ro-btn ro-btn--outline ro-btn--sm"
            onClick={handleRemove}
          >
            <i className="ti ti-trash" /> Remove
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
    </div>
  );
}
