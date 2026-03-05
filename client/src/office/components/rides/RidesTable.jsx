import RideRow from './RideRow';

export default function RidesTable({
  filteredRides, selectedIds, employees,
  onToggleSelect, onToggleSelectAll, onRowClick, onApprove,
  hasMore, onLoadMore,
}) {
  const allSelected = filteredRides.length > 0 && filteredRides.every(r => selectedIds.has(r.id));

  return (
    <div id="rides-table-view" className="ro-section">
      <div className="ro-table-wrap">
        <table className="ro-table" id="rides-table">
          <thead>
            <tr>
              <th style={{ width: '32px' }}>
                <input
                  type="checkbox"
                  id="rides-select-all"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                />
              </th>
              <th>Requested</th>
              <th>Rider</th>
              <th>Route</th>
              <th>Status</th>
              <th>Driver</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="rides-tbody">
            {filteredRides.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                  No rides match the current filters.
                </td>
              </tr>
            ) : (
              filteredRides.map(ride => (
                <RideRow
                  key={ride.id}
                  ride={ride}
                  selected={selectedIds.has(ride.id)}
                  employees={employees}
                  onToggleSelect={onToggleSelect}
                  onRowClick={onRowClick}
                  onApprove={onApprove}
                />
              ))
            )}
            {hasMore && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '12px' }}>
                  <button className="ro-btn ro-btn--outline ro-btn--sm" onClick={onLoadMore}>
                    <i className="ti ti-chevrons-down"></i> Load More
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
