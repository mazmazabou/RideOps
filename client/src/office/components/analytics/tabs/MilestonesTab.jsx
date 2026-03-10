import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '../../../../contexts/TenantContext';
import SkeletonLoader from '../shared/SkeletonLoader';

import DriverMilestonesWidget from '../widgets/DriverMilestonesWidget';
import RiderMilestonesWidget from '../widgets/RiderMilestonesWidget';

export default function MilestonesTab() {
  const { config } = useTenant();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const orgShortName = config?.orgShortName || 'RideOps';

  const loadData = useCallback(async (includeDeleted) => {
    setLoading(true);
    try {
      const qs = includeDeleted ? '?include_deleted=true' : '';
      const res = await fetch('/api/analytics/milestones' + qs);
      if (!res.ok) throw new Error('Milestones fetch failed');
      setData(await res.json());
    } catch (e) {
      console.warn('Milestones fetch error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(showArchived); }, [loadData, showArchived]);

  return (
    <div className="milestones-page">
      <div className="milestones-toolbar">
        <button
          className={`ro-btn ro-btn--sm${showArchived ? ' ro-btn--primary' : ' ro-btn--ghost'}`}
          onClick={() => setShowArchived(v => !v)}
        >
          <i className={`ti ti-${showArchived ? 'eye-off' : 'archive'}`} />{' '}
          {showArchived ? 'Hide Archived' : 'Show Archived'}
        </button>
      </div>
      <section className="milestones-section">
        <h3 className="milestones-section__title">
          <i className="ti ti-trophy" /> Driver Milestones
        </h3>
        {loading
          ? <SkeletonLoader type="chart" />
          : <DriverMilestonesWidget people={data?.drivers} orgShortName={orgShortName} />
        }
      </section>
      <section className="milestones-section">
        <h3 className="milestones-section__title">
          <i className="ti ti-award" /> Rider Milestones
        </h3>
        {loading
          ? <SkeletonLoader type="chart" />
          : <RiderMilestonesWidget people={data?.riders} orgShortName={orgShortName} />
        }
      </section>
    </div>
  );
}
