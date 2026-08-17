import { useState, useCallback } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { fetchEmployees, fetchAllRides, fetchVehicles } from '../../api';
import { currentServiceDay, addDays } from '../../utils/tz';

export function useDriverData() {
  const [employees, setEmployees] = useState([]);
  const [rides, setRides] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const today = currentServiceDay();
      const [emp, rds, veh] = await Promise.all([
        fetchEmployees(),
        fetchAllRides({ from: today, to: addDays(today, 1) }),
        fetchVehicles(),
      ]);
      setEmployees(emp);
      setRides(rds);
      setVehicles(veh);
    } catch (e) {
      console.warn('Failed to load driver data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(loadData, 3000);

  return { employees, rides, vehicles, loading, refresh: loadData };
}
