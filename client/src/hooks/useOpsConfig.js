import { useState, useEffect } from 'react';
import { fetchOpsConfig } from '../api';
import { setServiceWindow } from '../utils/tz';

export function useOpsConfig() {
  const [opsConfig, setOpsConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOpsConfig()
      .then(config => {
        setServiceWindow(config?.service_hours_start, config?.service_hours_end);
        setOpsConfig(config);
      })
      .finally(() => setLoading(false));
  }, []);

  return { opsConfig, loading };
}
