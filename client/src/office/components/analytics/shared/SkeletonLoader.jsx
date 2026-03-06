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
      <div className="analytics-skeleton ao-skeleton-chart">
        <div className="ao-skeleton-bar" style={{ height: '40%', opacity: 0.4 }} />
        <div className="ao-skeleton-bar" style={{ height: '70%', opacity: 0.5 }} />
        <div className="ao-skeleton-bar" style={{ height: '55%', opacity: 0.4 }} />
        <div className="ao-skeleton-bar" style={{ height: '85%', opacity: 0.6 }} />
        <div className="ao-skeleton-bar" style={{ height: '45%', opacity: 0.4 }} />
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="analytics-skeleton p-16">
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
      <div className="analytics-skeleton ao-skeleton-donut">
        <div className="ao-skeleton-ring" />
      </div>
    );
  }

  if (type === 'kpi') {
    const cards = Array.from({ length: 6 });
    return (
      <>
        {cards.map((_, i) => (
          <div key={i} className="kpi-card kpi-card--neutral opacity-50">
            <div className="kpi-card__value ao-skeleton-block" style={{ width: 40, height: 28, margin: '0 auto' }} />
            <div className="kpi-card__label ao-skeleton-block" style={{ width: 80, height: 12, margin: '8px auto 0' }} />
          </div>
        ))}
      </>
    );
  }

  if (type === 'kpi-single') {
    return (
      <div className="ao-skeleton-kpi-single">
        <div className="ao-skeleton-block" style={{ width: 48, height: 24 }} />
        <div className="ao-skeleton-block" style={{ width: 72, height: 10 }} />
      </div>
    );
  }

  if (type === 'heatmap') {
    const cells = Array.from({ length: 66 });
    return (
      <div className="analytics-skeleton ao-skeleton-heatmap">
        {cells.map((_, i) => (
          <div key={i} className="ao-skeleton-cell" />
        ))}
      </div>
    );
  }

  return null;
}
