import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchProgramRules, saveProgramRules } from '../../../api';
import { useToast } from '../../../contexts/ToastContext';

export default function GuidelinesSubPanel() {
  const { showToast } = useToast();
  const editorRef = useRef(null);
  const quillRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const initQuill = useCallback(async () => {
    if (loaded || !editorRef.current) return;
    setLoaded(true);

    // Init Quill editor from CDN window.Quill
    if (typeof window.Quill !== 'undefined' && !quillRef.current) {
      quillRef.current = new window.Quill(editorRef.current, {
        theme: 'snow',
        modules: {
          toolbar: [
            ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ header: [1, 2, 3, false] }],
            ['clean'],
          ],
        },
      });
    }

    // Load content from server (trusted HTML stored in DB, authored by office staff only)
    try {
      const data = await fetchProgramRules();
      if (data.rulesHtml && quillRef.current) {
        // Server-authored content — Quill uses root.innerHTML as its standard API
        quillRef.current.root.innerHTML = data.rulesHtml;
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  }, [loaded, showToast]);

  useEffect(() => { initQuill(); }, [initQuill]);

  const handleSave = async () => {
    if (!quillRef.current) return;
    setSaving(true);
    try {
      await saveProgramRules({ rulesHtml: quillRef.current.root.innerHTML });
      showToast('Program guidelines saved.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-24">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="ro-section__title" style={{ margin: 0 }}>Program Rules &amp; Guidelines</h3>
          <div className="text-xs text-muted mt-4">
            Shown to riders and drivers in the &ldquo;Program Rules&rdquo; modal.
            Supports bold, italic, bullets, and highlights.
          </div>
        </div>
        <button
          className="ro-btn ro-btn--primary"
          id="save-program-guidelines-btn"
          onClick={handleSave}
          disabled={saving}
        >
          <i className="ti ti-device-floppy"></i> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <div className="overflow-hidden mt-16" style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}>
        <div
          ref={editorRef}
          id="program-guidelines-editor"
          className="text-14"
          style={{ minHeight: '320px' }}
        ></div>
      </div>
      <div className="text-xs text-muted mt-8">
        Changes save to the database and are immediately visible to all users.
      </div>
    </div>
  );
}
