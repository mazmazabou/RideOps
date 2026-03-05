export default function Toolbar({
  filteredCount, totalCount, selectedCount,
  onBulkDelete, onExportCsv,
  viewMode, onViewChange,
}) {
  const showTotal = totalCount > 0 && filteredCount < totalCount;
  return (
    <div className="filter-bar" style={{ paddingTop: 0, gap: '12px', alignItems: 'center' }}>
      <span className="text-sm text-muted" id="ride-filter-count">
        {showTotal
          ? `Showing ${filteredCount} of ${totalCount} rides`
          : `${filteredCount} ride${filteredCount !== 1 ? 's' : ''}`}
      </span>
      <div style={{ flex: 1 }} />
      {selectedCount > 0 && (
        <span id="rides-bulk-actions">
          <button
            className="ro-btn ro-btn--danger ro-btn--sm"
            id="rides-delete-selected-btn"
            onClick={onBulkDelete}
          >
            <i className="ti ti-trash"></i> Delete Selected (<span id="rides-selected-count">{selectedCount}</span>)
          </button>
        </span>
      )}
      <button
        className="ro-btn ro-btn--outline ro-btn--sm"
        id="rides-export-csv-btn"
        title="Export CSV"
        onClick={onExportCsv}
      >
        <i className="ti ti-download"></i> CSV
      </button>
      <div className="ro-view-toggle" style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        <button
          className={`ro-view-toggle__btn${viewMode === 'table' ? ' active' : ''}`}
          id="rides-view-table-btn"
          title="Table view"
          onClick={() => onViewChange('table')}
        >
          <i className="ti ti-list"></i>
        </button>
        <button
          className={`ro-view-toggle__btn${viewMode === 'calendar' ? ' active' : ''}`}
          id="rides-view-calendar-btn"
          title="Calendar view"
          onClick={() => onViewChange('calendar')}
        >
          <i className="ti ti-calendar"></i>
        </button>
      </div>
    </div>
  );
}
