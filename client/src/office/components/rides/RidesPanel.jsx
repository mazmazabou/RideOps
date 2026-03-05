import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchRidesPaginated, fetchEmployees, fetchLocations, fetchOpsConfig, bulkDeleteRides, approveRide } from '../../../api';
import { useToast } from '../../../contexts/ToastContext';
import { useModal } from '../../../components/ui/Modal';
import { usePolling } from '../../../hooks/usePolling';
import FilterBar from './FilterBar';
import Toolbar from './Toolbar';
import RidesTable from './RidesTable';
import ScheduleGrid from './ScheduleGrid';
import RideDrawer from './RideDrawer';
import RideEditModal from './RideEditModal';

const IN_PROGRESS_STATUSES = ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'];
const PAGE_LIMIT = 50;
const SCHEDULE_LIMIT = 200;

function buildStatusParam(statusFilter) {
  if (statusFilter.has('all')) return '';
  const statuses = [...statusFilter];
  // Expand 'in_progress' to its constituent statuses
  const expanded = [];
  for (const s of statuses) {
    if (s === 'in_progress') {
      expanded.push(...IN_PROGRESS_STATUSES);
    } else {
      expanded.push(s);
    }
  }
  return [...new Set(expanded)].join(',');
}

export default function RidesPanel() {
  const { showToast } = useToast();
  const { showModal } = useModal();

  // Data state
  const [rides, setRides] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [opsConfig, setOpsConfig] = useState(null);

  // Pagination state
  const [nextCursor, setNextCursor] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState(() => new Set(['all']));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchText, setSearchText] = useState('');
  const searchDebounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // View state
  const [viewMode, setViewMode] = useState('table');

  // Selection (ref to survive polling, counter to trigger re-render)
  const selectedIdsRef = useRef(new Set());
  const [selectedCount, setSelectedCount] = useState(0);

  // Drawer / Modal
  const [drawerRide, setDrawerRide] = useState(null);
  const [editModalRide, setEditModalRide] = useState(null);

  // Debounce search text
  const handleSearchChange = useCallback((text) => {
    setSearchText(text);
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  }, []);

  // Load rides (called by polling) — always fetches page 1
  const loadRides = useCallback(async () => {
    try {
      const statusParam = buildStatusParam(statusFilter);
      const limit = viewMode === 'calendar' ? SCHEDULE_LIMIT : PAGE_LIMIT;
      const data = await fetchRidesPaginated({
        limit,
        status: statusParam || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        search: debouncedSearch || undefined,
      });
      setRides(data.rides);
      setNextCursor(data.nextCursor);
      setTotalCount(data.totalCount);
      setHasMore(data.hasMore);
    } catch {
      // Silently fail on polling errors
    }
  }, [statusFilter, dateFrom, dateTo, debouncedSearch, viewMode]);

  usePolling(loadRides, 5000);

  // Load employees, locations, ops config once
  useEffect(() => {
    fetchEmployees().then(d => setEmployees(Array.isArray(d) ? d : [])).catch(() => {});
    fetchLocations().then(d => setLocations(Array.isArray(d) ? d : [])).catch(() => {});
    fetchOpsConfig().then(d => setOpsConfig(d)).catch(() => {});
  }, []);

  // Load more (append next page)
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor) return;
    try {
      const statusParam = buildStatusParam(statusFilter);
      const data = await fetchRidesPaginated({
        limit: PAGE_LIMIT,
        cursor: nextCursor,
        status: statusParam || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        search: debouncedSearch || undefined,
      });
      setRides(prev => [...prev, ...data.rides]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (e) {
      showToast(e.message || 'Failed to load more rides', 'error');
    }
  }, [nextCursor, statusFilter, dateFrom, dateTo, debouncedSearch, showToast]);

  // Filtered rides — sorting only (filtering is server-side now)
  const filteredRides = useMemo(() => {
    // Server already sorts by requested_time DESC, id DESC
    // Keep client-side sort for consistency
    const sorted = [...rides];
    sorted.sort((a, b) => {
      const da = a.requestedTime ? new Date(a.requestedTime).getTime() : 0;
      const db = b.requestedTime ? new Date(b.requestedTime).getTime() : 0;
      return db - da;
    });
    return sorted;
  }, [rides]);

  // Prune selection when filtered rides change
  useEffect(() => {
    const visibleIds = new Set(filteredRides.map(r => r.id));
    const sel = selectedIdsRef.current;
    let changed = false;
    for (const id of sel) {
      if (!visibleIds.has(id)) {
        sel.delete(id);
        changed = true;
      }
    }
    if (changed) setSelectedCount(sel.size);
  }, [filteredRides]);

  // Selection handlers
  const toggleSelect = useCallback((id) => {
    const sel = selectedIdsRef.current;
    if (sel.has(id)) sel.delete(id); else sel.add(id);
    setSelectedCount(sel.size);
  }, []);

  const toggleSelectAll = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size === filteredRides.length && filteredRides.length > 0) {
      sel.clear();
    } else {
      filteredRides.forEach(r => sel.add(r.id));
    }
    setSelectedCount(sel.size);
  }, [filteredRides]);

  // Bulk delete
  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIdsRef.current];
    if (ids.length === 0) return;
    const ok = await showModal({
      title: 'Delete Rides',
      body: `Are you sure you want to delete ${ids.length} ride(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await bulkDeleteRides(ids);
      showToast(`Deleted ${ids.length} ride(s).`, 'success');
      selectedIdsRef.current.clear();
      setSelectedCount(0);
      loadRides();
    } catch (e) {
      showToast(e.message || 'Failed to delete rides', 'error');
    }
  }, [showModal, showToast, loadRides]);

  // Quick approve from table
  const handleApprove = useCallback(async (ride) => {
    try {
      await approveRide(ride.id);
      showToast('Ride approved', 'success');
      loadRides();
    } catch (e) {
      showToast(e.message || 'Failed to approve', 'error');
    }
  }, [showToast, loadRides]);

  // CSV export
  const handleExportCsv = useCallback(() => {
    const headers = ['ID', 'Rider', 'Rider Email', 'Pickup', 'Dropoff', 'Requested Time', 'Status', 'Driver', 'Notes'];
    const rows = filteredRides.map(r => {
      const driver = r.assignedDriverId
        ? (employees.find(e => e.id === r.assignedDriverId)?.name || '')
        : '';
      return [r.id, r.riderName || '', r.riderEmail || '', r.pickupLocation || '', r.dropoffLocation || '',
        r.requestedTime || '', r.status || '', driver, r.notes || ''];
    });
    const csv = [headers, ...rows]
      .map(row => row.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rides.csv';
    a.click();
  }, [filteredRides, employees]);

  // Drawer handlers
  const handleRowClick = useCallback((ride) => setDrawerRide(ride), []);
  const handleDrawerClose = useCallback(() => {
    setDrawerRide(null);
    loadRides();
  }, [loadRides]);

  // Edit modal handlers
  const handleEditClick = useCallback((ride) => setEditModalRide(ride), []);
  const handleEditClose = useCallback(() => setEditModalRide(null), []);
  const handleEditSaved = useCallback(() => {
    setEditModalRide(null);
    loadRides();
  }, [loadRides]);

  return (
    <>
      <FilterBar
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onSearchChange={handleSearchChange}
      />

      <Toolbar
        filteredCount={filteredRides.length}
        totalCount={totalCount}
        selectedCount={selectedCount}
        onBulkDelete={handleBulkDelete}
        onExportCsv={handleExportCsv}
        viewMode={viewMode}
        onViewChange={setViewMode}
      />

      {viewMode === 'table' ? (
        <RidesTable
          filteredRides={filteredRides}
          selectedIds={selectedIdsRef.current}
          employees={employees}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onRowClick={handleRowClick}
          onApprove={handleApprove}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
        />
      ) : (
        <ScheduleGrid
          filteredRides={filteredRides}
          opsConfig={opsConfig}
          onRideClick={handleRowClick}
        />
      )}

      <RideDrawer
        ride={drawerRide}
        employees={employees}
        vehicles={[]}
        gracePeriodMinutes={opsConfig?.grace_period_minutes ? Number(opsConfig.grace_period_minutes) : 5}
        onClose={handleDrawerClose}
        onEditClick={handleEditClick}
      />

      {editModalRide && (
        <RideEditModal
          ride={editModalRide}
          locations={locations}
          onClose={handleEditClose}
          onSaved={handleEditSaved}
        />
      )}
    </>
  );
}
