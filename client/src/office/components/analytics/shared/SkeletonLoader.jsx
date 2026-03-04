import React from 'react';

/**
 * SkeletonLoader — analytics loading skeleton states.
 * Ported from the vanilla `showAnalyticsSkeleton()` in chart-utils.js.
 *
 * @param {'chart'|'table'|'donut'|'kpi'|'heatmap'} type
 */
export default function SkeletonLoader({ type }) {
  if (type === 'chart') {
    return (
      <div
        className="analytics-skeleton"
        style={{ height: 200, display: 'flex', alignItems: 'flex-end', gap: 8, padding: 16 }}
      >
        <div style={{ flex: 1, background: 'var(--color-border)', borderRadius: '4px 4px 0 0', height: '40%', opacity: 0.4 }} />
        <div style={{ flex: 1, background: 'var(--color-border)', borderRadius: '4px 4px 0 0', height: '70%', opacity: 0.5 }} />
        <div style={{ flex: 1, background: 'var(--color-border)', borderRadius: '4px 4px 0 0', height: '55%', opacity: 0.4 }} />
        <div style={{ flex: 1, background: 'var(--color-border)', borderRadius: '4px 4px 0 0', height: '85%', opacity: 0.6 }} />
        <div style={{ flex: 1, background: 'var(--color-border)', borderRadius: '4px 4px 0 0', height: '45%', opacity: 0.4 }} />
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="analytics-skeleton" style={{ padding: 16 }}>
        <div className="analytics-skeleton__bar analytics-skeleton__bar--full" />
        <div className="analytics-skeleton__bar analytics-skeleton__bar--long" />
        <div className="analytics-skeleton__bar analytics-skeleton__bar--medium" />
        <div className="analytics-skeleton__bar analytics-skeleton__bar--short" />
        <div className="analytics-skeleton__bar analytics-skeleton__bar--long" />
      </div>
    );
  }

  if (type === 'donut') {
    return (
      <div
        className="analytics-skeleton"
        style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: '50%',
            border: '24px solid var(--color-border)',
            opacity: 0.4,
          }}
        />
      </div>
    );
  }

  if (type === 'kpi') {
    const cards = Array.from({ length: 6 });
    return (
      <>
        {cards.map((_, i) => (
          <div key={i} className="kpi-card kpi-card--neutral" style={{ opacity: 0.5 }}>
            <div
              className="kpi-card__value"
              style={{
                background: 'var(--color-border)',
                width: 40,
                height: 28,
                borderRadius: 4,
                margin: '0 auto',
              }}
            />
            <div
              className="kpi-card__label"
              style={{
                background: 'var(--color-border)',
                width: 80,
                height: 12,
                borderRadius: 4,
                margin: '8px auto 0',
              }}
            />
          </div>
        ))}
      </>
    );
  }

  if (type === 'kpi-single') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '6px',
        opacity: 0.5,
      }}>
        <div style={{
          background: 'var(--color-border)',
          width: 48,
          height: 24,
          borderRadius: 4,
        }} />
        <div style={{
          background: 'var(--color-border)',
          width: 72,
          height: 10,
          borderRadius: 4,
        }} />
      </div>
    );
  }

  if (type === 'heatmap') {
    const cells = Array.from({ length: 66 });
    return (
      <div
        className="analytics-skeleton"
        style={{
          height: 280,
          padding: 16,
          display: 'grid',
          gridTemplateColumns: '60px repeat(5, 1fr)',
          gap: 4,
        }}
      >
        {cells.map((_, i) => (
          <div
            key={i}
            style={{
              background: 'var(--color-border)',
              borderRadius: 3,
              opacity: 0.3,
            }}
          />
        ))}
      </div>
    );
  }

  return null;
}
