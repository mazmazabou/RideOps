import { useRef, useEffect, useCallback } from 'react';
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

function getDroppedFile(e) {
  if (e.dataTransfer?.files?.length) return e.dataTransfer.files[0];
  if (e.dataTransfer?.items?.length) {
    for (const item of e.dataTransfer.items) {
      if (item.kind === 'file') return item.getAsFile();
    }
  }
  return null;
}

export default function AvatarPicker({ currentUrl, userId, userName, onSelect }) {
  const { showToast } = useToast();
  const fileRef = useRef(null);
  const dropRef = useRef(null);
  const dragCounter = useRef(0);

  const defaultUrl = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(userName || userId || 'User')}`;
  const displayUrl = currentUrl || defaultUrl;
  const hasCustomAvatar = currentUrl && !currentUrl.includes('api.dicebear.com');

  const processFile = useCallback(async (file) => {
    if (!file) {
      showToast('Could not read that file — try the Upload button', 'error');
      return;
    }
    const validExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = file.name ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
    const isImage = file.type.startsWith('image/') || validExts.includes(ext);
    if (!isImage) {
      showToast('Please drop an image file', 'error');
      return;
    }
    if (file.size > MAX_RAW_SIZE) {
      showToast('Image must be under 2MB', 'error');
      return;
    }
    try {
      const dataUri = await compressImage(file);
      onSelect(dataUri);
    } catch {
      if (file.size > MAX_RAW_SIZE) {
        showToast('Image must be under 2MB', 'error');
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => onSelect(ev.target.result);
        reader.readAsDataURL(file);
      }
    }
  }, [showToast, onSelect]);

  // Native event listeners — no React re-renders during drag
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    const onDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      el.classList.add('avatar-picker--drag');
    };

    const onDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const onDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        el.classList.remove('avatar-picker--drag');
      }
    };

    const onDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      el.classList.remove('avatar-picker--drag');
      const file = getDroppedFile(e);
      processFile(file);
    };

    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
    };
  }, [processFile]);

  const handleFileUpload = (e) => {
    processFile(e.target.files[0]);
    e.target.value = '';
  };

  const handleRemove = () => {
    onSelect(null);
  };

  return (
    <div className="avatar-picker" ref={dropRef}>
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
