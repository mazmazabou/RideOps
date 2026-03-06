import { useState, useEffect } from 'react';
import { fetchAcademicTerms } from '../../../api';

function toDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export default function DateFilterBar({ dateRange, onDateChange, onRefresh }) {
  const [terms, setTerms] = useState([]);
  const [activePreset, setActivePreset] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    fetchAcademicTerms().then(setTerms).catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = () => setMoreOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [moreOpen]);

  function applyPreset(preset) {
    const today = new Date();
    const todayStr = toDateStr(today);
    let fromStr = todayStr;
    if (preset === '7d') {
      fromStr = toDateStr(new Date(today.getTime() - 6 * 86400000));
    } else if (preset === 'this-month') {
      fromStr = toDateStr(new Date(today.getTime() - 29 * 86400000));
    }
    setActivePreset(preset);
    onDateChange({ from: fromStr, to: todayStr });
  }

  function applyTerm(term) {
    setActivePreset('term-' + term.id);
    setMoreOpen(false);
    onDateChange({ from: term.start_date, to: term.end_date });
  }

  // Split terms: up to 3 inline, rest in dropdown
  let inlineTerms = terms;
  let dropdownTerms = [];
  if (terms.length > 4) {
    const today = new Date().toISOString().slice(0, 10);
    const sorted = [...terms].sort((a, b) =>
      Math.abs(new Date(a.start_date) - new Date(today)) - Math.abs(new Date(b.start_date) - new Date(today))
    );
    inlineTerms = sorted.slice(0, 3);
    dropdownTerms = sorted.slice(3);
  }

  return (
    <div className="analytics-date-bar ao-filter-bar">
      <input
        type="date"
        id="analytics-from"
        value={dateRange.from}
        onChange={e => { setActivePreset(null); onDateChange({ ...dateRange, from: e.target.value }); }}
        className="ro-input ro-input--sm ao-filter-input"
      />
      <span className="ao-filter-sep">to</span>
      <input
        type="date"
        id="analytics-to"
        value={dateRange.to}
        onChange={e => { setActivePreset(null); onDateChange({ ...dateRange, to: e.target.value }); }}
        className="ro-input ro-input--sm ao-filter-input"
      />
      <button id="analytics-refresh-btn" className="ro-btn ro-btn--primary ro-btn--sm" onClick={onRefresh}>
        <i className="ti ti-refresh"></i> Refresh
      </button>
      <div className="analytics-quick-select ao-filter-quick">
        {[{ key: 'today', label: 'Today' }, { key: '7d', label: 'Week' }, { key: 'this-month', label: 'Month' }].map(p => (
          <button
            key={p.key}
            className={`ro-btn ro-btn--ghost ro-btn--xs${activePreset === p.key ? ' active' : ''}`}
            data-range={p.key}
            onClick={() => applyPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {terms.length > 0 && (
        <div id="analytics-term-buttons" className="ao-filter-terms">
          {inlineTerms.map(term => (
            <button
              key={term.id}
              className={`ro-btn ro-btn--ghost ro-btn--xs${activePreset === 'term-' + term.id ? ' active' : ''}`}
              onClick={() => applyTerm(term)}
            >
              {term.name}
            </button>
          ))}
          {dropdownTerms.length > 0 && (
            <div className="analytics-term-more ao-term-more">
              <button
                className="ro-btn ro-btn--ghost ro-btn--xs"
                onClick={e => { e.stopPropagation(); setMoreOpen(!moreOpen); }}
              >
                More <i className="ti ti-chevron-down text-sm"></i>
              </button>
              {moreOpen && (
                <div className="analytics-term-dropdown open ao-term-dropdown">
                  {dropdownTerms.map(term => (
                    <button
                      key={term.id}
                      className={`analytics-term-dropdown-item${activePreset === 'term-' + term.id ? ' active' : ''}`}
                      onClick={() => applyTerm(term)}
                    >
                      {term.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
