import { useState, useEffect, useCallback } from 'react';
import { fetchAcademicTerms, createAcademicTerm, updateAcademicTerm, deleteAcademicTerm } from '../../../api';
import { useToast } from '../../../contexts/ToastContext';
import { useModal } from '../../../components/ui/Modal';

export default function AcademicTermsSubPanel() {
  const { showToast } = useToast();
  const { showModal } = useModal();
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchAcademicTerms();
      setTerms(Array.isArray(data) ? data : []);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const ok = await showModal({
      title: 'Add Academic Term',
      body: (
        <div className="flex-col gap-12">
          <div><label className="ro-label">Name</label><input className="ro-input" id="modal-term-name" placeholder="e.g. Fall 2026" /></div>
          <div><label className="ro-label">Start Date</label><input className="ro-input" id="modal-term-start" type="date" /></div>
          <div><label className="ro-label">End Date</label><input className="ro-input" id="modal-term-end" type="date" /></div>
          <div>
            <label className="ro-label">Display Order</label>
            <input className="ro-input" id="modal-term-sort" type="number" defaultValue="0" min="0" placeholder="0" />
            <span className="text-xs text-muted mt-4" style={{ display: 'block' }}>
              Lower numbers appear first in the list
            </span>
          </div>
        </div>
      ),
      confirmLabel: 'Add Term',
    });
    if (!ok) return;
    const name = document.getElementById('modal-term-name')?.value?.trim();
    const start_date = document.getElementById('modal-term-start')?.value;
    const end_date = document.getElementById('modal-term-end')?.value;
    const sort_order = Number(document.getElementById('modal-term-sort')?.value || 0);
    if (!name || !start_date || !end_date) {
      showToast('Name, start date, and end date are required.', 'error');
      return;
    }
    try {
      await createAcademicTerm({ name, start_date, end_date, sort_order });
      showToast('Term added.', 'success');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleEdit = async (term) => {
    const startVal = term.start_date ? term.start_date.slice(0, 10) : '';
    const endVal = term.end_date ? term.end_date.slice(0, 10) : '';
    const sortVal = term.sort_order || 0;
    const ok = await showModal({
      title: 'Edit Academic Term',
      body: (
        <div className="flex-col gap-12">
          <div><label className="ro-label">Name</label><input className="ro-input" id="modal-term-name" defaultValue={term.name} /></div>
          <div><label className="ro-label">Start Date</label><input className="ro-input" id="modal-term-start" type="date" defaultValue={startVal} /></div>
          <div><label className="ro-label">End Date</label><input className="ro-input" id="modal-term-end" type="date" defaultValue={endVal} /></div>
          <div>
            <label className="ro-label">Display Order</label>
            <input className="ro-input" id="modal-term-sort" type="number" defaultValue={sortVal} min="0" />
            <span className="text-xs text-muted mt-4" style={{ display: 'block' }}>
              Lower numbers appear first in the list
            </span>
          </div>
        </div>
      ),
      confirmLabel: 'Save',
    });
    if (!ok) return;
    const name = document.getElementById('modal-term-name')?.value?.trim();
    const start_date = document.getElementById('modal-term-start')?.value;
    const end_date = document.getElementById('modal-term-end')?.value;
    const sort_order = Number(document.getElementById('modal-term-sort')?.value || 0);
    if (!name || !start_date || !end_date) {
      showToast('Name, start date, and end date are required.', 'error');
      return;
    }
    try {
      await updateAcademicTerm(term.id, { name, start_date, end_date, sort_order });
      showToast('Term updated.', 'success');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleDelete = async (term) => {
    const ok = await showModal({
      title: 'Delete Academic Term',
      body: 'Are you sure you want to delete "' + term.name + '"?',
      confirmLabel: 'Delete',
      confirmClass: 'ro-btn--danger',
    });
    if (!ok) return;
    try {
      await deleteAcademicTerm(term.id);
      showToast('Term deleted.', 'success');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  if (loading) {
    return (
      <div id="academic-terms-container" className="p-24 text-muted">
        Loading academic terms...
      </div>
    );
  }

  return (
    <div id="academic-terms-container" className="p-24">
      <div className="flex justify-between items-center mb-16">
        <h3 className="ro-section__title" style={{ margin: 0 }}>Academic Terms</h3>
        <button className="ro-btn ro-btn--primary ro-btn--sm" onClick={handleAdd}>
          <i className="ti ti-plus"></i> Add Term
        </button>
      </div>

      {terms.length === 0 ? (
        <div className="text-muted text-center" style={{ padding: '32px' }}>
          <i className="ti ti-calendar-off mb-8" style={{ fontSize: '32px', display: 'block' }}></i>
          No academic terms defined.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {terms.map(term => (
            <div key={term.id} className="flex justify-between items-center" style={{
              padding: '12px 16px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <div>
                <div className="fw-600 text-14">{term.name}</div>
                <div className="text-xs text-muted">
                  {term.start_date ? term.start_date.slice(0, 10) : ''} &mdash; {term.end_date ? term.end_date.slice(0, 10) : ''}
                  {term.sort_order != null && <span> &middot; Display Order: {term.sort_order}</span>}
                </div>
              </div>
              <div className="flex gap-4">
                <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={() => handleEdit(term)}>
                  <i className="ti ti-edit"></i>
                </button>
                <button
                  className="ro-btn ro-btn--ghost ro-btn--sm"
                  style={{ color: 'var(--status-denied)' }}
                  onClick={() => handleDelete(term)}
                >
                  <i className="ti ti-trash"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
