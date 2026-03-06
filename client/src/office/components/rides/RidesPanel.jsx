import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchRidesPaginated, fetchEmployees, fetchLocations, fetchOpsConfig, bulkDeleteRides, approveRide, submitRide } from '../../../api';
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
const DEFAULT_PAGE_SIZE = 25;
const SCHEDULE_LIMIT = 200;

function buildStatusParam(statusFilter) {
  if (statusFilter.has('all')) return '';
  const statuses = [...statusFilter];
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);

  // Filter state
  const [statusFilter, setStatusFilter] = useState(() => new Set(['all']));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchText, setSearchText] = useState('');
  const searchDebounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // View state
  const [viewMode, setViewMode] = useState('table');

  // Sort state
  const [sortCol, setSortCol] = useState('requested');
  const [sortDir, setSortDir] = useState('desc');

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

  // Load rides — fetches current page using offset
  const loadRides = useCallback(async () => {
    try {
      const statusParam = buildStatusParam(statusFilter);
      if (viewMode === 'calendar') {
        // Calendar: fetch all (up to SCHEDULE_LIMIT) without offset
        const data = await fetchRidesPaginated({
          limit: SCHEDULE_LIMIT,
          offset: 0,
          status: statusParam || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
          search: debouncedSearch || undefined,
        });
        setRides(data.rides);
        setTotalCount(data.totalCount);
      } else {
        // Table: offset-based pagination
        const offset = (page - 1) * pageSize;
        const data = await fetchRidesPaginated({
          limit: pageSize,
          offset,
          status: statusParam || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
          search: debouncedSearch || undefined,
        });
        setRides(data.rides);
        setTotalCount(data.totalCount);
      }
    } catch {
      // Silently fail on polling errors
    }
  }, [statusFilter, dateFrom, dateTo, debouncedSearch, viewMode, page, pageSize]);

  usePolling(loadRides, 5000);

  // Load employees, locations, ops config once
  useEffect(() => {
    fetchEmployees().then(d => setEmployees(Array.isArray(d) ? d : [])).catch(() => {});
    fetchLocations().then(d => setLocations(Array.isArray(d) ? d : [])).catch(() => {});
    fetchOpsConfig().then(d => setOpsConfig(d)).catch(() => {});
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateFrom, dateTo, debouncedSearch]);

  // Page size change resets to page 1
  const handlePageSizeChange = useCallback((newSize) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  // Sort handler
  const handleSort = useCallback((col) => {
    setSortCol(prev => {
      if (prev === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return col; }
      setSortDir(col === 'requested' ? 'desc' : 'asc');
      return col;
    });
  }, []);

  // Client-side sort on loaded rides
  const filteredRides = useMemo(() => {
    const sorted = [...rides];
    const dir = sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      let av, bv;
      switch (sortCol) {
        case 'requested':
          av = a.requestedTime ? new Date(a.requestedTime).getTime() : 0;
          bv = b.requestedTime ? new Date(b.requestedTime).getTime() : 0;
          return (av - bv) * dir;
        case 'rider':
          av = (a.riderName || '').toLowerCase();
          bv = (b.riderName || '').toLowerCase();
          return av < bv ? -dir : av > bv ? dir : 0;
        case 'route':
          av = (a.pickupLocation || '').toLowerCase();
          bv = (b.pickupLocation || '').toLowerCase();
          return av < bv ? -dir : av > bv ? dir : 0;
        case 'status':
          av = (a.status || '').toLowerCase();
          bv = (b.status || '').toLowerCase();
          return av < bv ? -dir : av > bv ? dir : 0;
        case 'driver':
          av = a.assignedDriverId ? (employees.find(e => e.id === a.assignedDriverId)?.name || '').toLowerCase() : '';
          bv = b.assignedDriverId ? (employees.find(e => e.id === b.assignedDriverId)?.name || '').toLowerCase() : '';
          return av < bv ? -dir : av > bv ? dir : 0;
        default:
          return 0;
      }
    });
    return sorted;
  }, [rides, sortCol, sortDir, employees]);

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

  // Create ride
  const handleCreateRide = useCallback(async () => {
    const locationOptions = (locations || []).map(loc => {
      const label = typeof loc === 'string' ? loc : (loc.label || loc.value);
      return label;
    }).filter(Boolean);

    const today = new Date().toISOString().slice(0, 10);
    const formData = { riderName: '', riderEmail: '', riderPhone: '', pickup: '', dropoff: '', date: today, time: '', notes: '' };

    const ok = await showModal({
      title: 'Create Ride',
      body: (
        <div className="flex-col gap-12">
          <div><label className="ro-label">Rider Name *</label><input className="ro-input" placeholder="Full name" onChange={e => { formData.riderName = e.target.value; }} /></div>
          <div><label className="ro-label">Rider Email *</label><input className="ro-input" type="email" placeholder="Email" onChange={e => { formData.riderEmail = e.target.value; }} /></div>
          <div><label className="ro-label">Rider Phone</label><input className="ro-input" placeholder="Phone (optional)" onChange={e => { formData.riderPhone = e.target.value; }} /></div>
          <div>
            <label className="ro-label">Pickup Location *</label>
            <select className="ro-input" defaultValue="" onChange={e => { formData.pickup = e.target.value; }}>
              <option value="" disabled>Select pickup</option>
              {locationOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>
          <div>
            <label className="ro-label">Dropoff Location *</label>
            <select className="ro-input" defaultValue="" onChange={e => { formData.dropoff = e.target.value; }}>
              <option value="" disabled>Select dropoff</option>
              {locationOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>
          <div className="flex gap-12">
            <div className="flex-1"><label className="ro-label">Date *</label><input className="ro-input" type="date" defaultValue={today} onChange={e => { formData.date = e.target.value; }} /></div>
            <div className="flex-1"><label className="ro-label">Time *</label><input className="ro-input" type="time" onChange={e => { formData.time = e.target.value; }} /></div>
          </div>
          <div><label className="ro-label">Notes</label><input className="ro-input" placeholder="Notes (optional)" onChange={e => { formData.notes = e.target.value; }} /></div>
        </div>
      ),
      confirmLabel: 'Create Ride',
    });
    if (!ok) return;

    const { riderName, riderEmail, riderPhone, pickup, dropoff, date, time, notes } = formData;
    if (!riderName.trim() || !riderEmail.trim() || !pickup || !dropoff || !date || !time) {
      showToast('Name, email, pickup, dropoff, date, and time are required.', 'error');
      return;
    }
    const requestedTime = new Date(`${date}T${time}`).toISOString();
    try {
      await submitRide({
        riderName: riderName.trim(),
        riderEmail: riderEmail.trim(),
        riderPhone: riderPhone.trim() || undefined,
        pickupLocation: pickup,
        dropoffLocation: dropoff,
        requestedTime,
        notes: notes.trim() || undefined,
      });
      showToast('Ride created successfully.', 'success');
      loadRides();
    } catch (e) {
      showToast(e.message || 'Failed to create ride', 'error');
    }
  }, [locations, showModal, showToast, loadRides]);

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
        onCreateRide={handleCreateRide}
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
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={handleSort}
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
