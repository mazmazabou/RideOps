import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePolling } from '../../../hooks/usePolling';
import { useToast } from '../../../contexts/ToastContext';
import {
  fetchAllRides, fetchTodayDriverStatus, fetchShifts,
  fetchOpsConfig, fetchEmployees, fetchLocations, fetchVehicles,
} from '../../../api';
import KPIBar from './KPIBar';
import PendingQueue from './PendingQueue';
import DispatchGrid from './DispatchGrid';
import RideDrawer from '../rides/RideDrawer';
import RideEditModal from '../rides/RideEditModal';

export default function DispatchPanel() {
  const { showToast } = useToast();

  // Polled state
  const [rides, setRides] = useState([]);
  const [todayStatus, setTodayStatus] = useState([]);

  // Load-once state
  const [shifts, setShifts] = useState([]);
  const [opsConfig, setOpsConfig] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [locations, setLocations] = useState([]);
  const loadedOnce = useRef(false);

  // UI state
  const [drawerRide, setDrawerRide] = useState(null);
  const [editModalRide, setEditModalRide] = useState(null);

  // Load-once data
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    fetchShifts().then(setShifts).catch(() => {});
    fetchOpsConfig().then(setOpsConfig).catch(() => {});
    fetchEmployees().then(setEmployees).catch(() => {});
    fetchVehicles().then(setVehicles).catch(() => {});
    fetchLocations().then(setLocations).catch(() => {});
  }, []);

  // 5s polling for rides + today driver status
  const pollData = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [ridesData, statusData] = await Promise.all([
        fetchAllRides({ from: today, to: today }),
        fetchTodayDriverStatus(),
      ]);
      setRides(ridesData);
      setTodayStatus(statusData);
    } catch {
      // silent — will retry
    }
  }, []);

  usePolling(pollData, 5000);

  // Refresh handler — called after actions
  const refresh = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [ridesData, statusData] = await Promise.all([
        fetchAllRides({ from: today, to: today }),
        fetchTodayDriverStatus(),
      ]);
      setRides(ridesData);
      setTodayStatus(statusData);
    } catch {
      // silent
    }
  }, []);

  // Pending rides (always today's, sorted oldest first)
  const pendingRides = useMemo(() =>
    rides
      .filter(r => r.status === 'pending')
      .sort((a, b) => new Date(a.createdAt || a.requestedTime) - new Date(b.createdAt || b.requestedTime)),
    [rides]
  );

  // Drawer handlers
  const openDrawer = useCallback((ride) => setDrawerRide(ride), []);
  const closeDrawer = useCallback(() => {
    setDrawerRide(null);
    refresh();
  }, [refresh]);

  const openEditModal = useCallback((ride) => setEditModalRide(ride), []);
  const closeEditModal = useCallback(() => setEditModalRide(null), []);
  const onEditSaved = useCallback(() => {
    setEditModalRide(null);
    refresh();
  }, [refresh]);

  return (
    <div>
      {/* KPI Summary */}
      <div className="ro-section">
        <KPIBar
          rides={rides}
          todayStatus={todayStatus}
          employees={employees}
          shifts={shifts}
        />
      </div>

      {/* Pending Queue */}
      <div className="ro-section" style={{ marginTop: 20 }}>
        <div className="ro-section__header">
          <h3 className="ro-section__title">
            <i className="ti ti-clock-hour-4" /> Pending Rides
            {pendingRides.length > 0 && (
              <span className="status-badge status-badge--pending ml-8 text-xs">
                {pendingRides.length}
              </span>
            )}
          </h3>
        </div>
        <PendingQueue
          rides={pendingRides}
          onRideClick={openDrawer}
          onRefresh={refresh}
        />
      </div>

      {/* Schedule Grid */}
      <div className="ro-section" style={{ marginTop: 20 }}>
        <DispatchGrid
          rides={rides}
          todayStatus={todayStatus}
          employees={employees}
          shifts={shifts}
          opsConfig={opsConfig}
          onRideClick={openDrawer}
          onRefresh={refresh}
        />
      </div>

      {/* Ride Detail Drawer */}
      {drawerRide && (
        <RideDrawer
          ride={drawerRide}
          employees={employees}
          vehicles={vehicles}
          gracePeriodMinutes={Number(opsConfig?.grace_period_minutes || 5)}
          onClose={closeDrawer}
          onEditClick={openEditModal}
        />
      )}

      {/* Edit Modal */}
      {editModalRide && (
        <RideEditModal
          ride={editModalRide}
          locations={locations}
          onClose={closeEditModal}
          onSaved={onEditSaved}
        />
      )}
    </div>
  );
}
