import React from 'react';
import { resolveColor } from '../constants';

const COHORT_CARDS = [
  { key: 'active', label: 'Active', icon: 'ti ti-user-check', cssVar: 'var(--status-completed)' },
  { key: 'new', label: 'New', icon: 'ti ti-user-plus', cssVar: 'var(--status-approved)' },
  { key: 'returning', label: 'Returning', icon: 'ti ti-refresh', cssVar: 'var(--color-primary)' },
  { key: 'atRisk', label: 'At Risk', icon: 'ti ti-alert-triangle', cssVar: 'var(--status-on-the-way)' },
  { key: 'churned', label: 'Churned', icon: 'ti ti-user-minus', cssVar: 'var(--color-text-muted)' },
  { key: 'terminated', label: 'Terminated', icon: 'ti ti-user-x', cssVar: 'var(--status-no-show)' },
];

export default function RiderCohortsWidget({ data }) {
  const summary = data?.summary || {};
  const retentionRate = data?.retentionRate;

  if (!data || !data.summary) {
    return (
      <div className="ro-empty ao-empty">
        <i className="ti ti-users-group ao-empty-icon" />
        No rider cohort data available
      </div>
    );
  }

  return (
    <div>
      <div className="ao-cohort-grid">
        {COHORT_CARDS.map((card) => {
          const color = resolveColor(card.cssVar) || '#6b7280';
          const count = summary[card.key] || 0;

          return (
            <div key={card.key} className="ao-cohort-card">
              <i className={card.icon + ' ao-cohort-icon'} style={{ color }} />
              <div className="ao-metric-value">
                {count.toLocaleString()}
              </div>
              <div className="ao-metric-label">
                {card.label}
              </div>
            </div>
          );
        })}
      </div>

      {retentionRate != null && (
        <div className="ao-cohort-footer">
          Retention Rate: <strong className="text-16" style={{ color: 'var(--color-text, #1f2937)' }}>{retentionRate.toFixed(1)}%</strong>
        </div>
      )}
    </div>
  );
}
