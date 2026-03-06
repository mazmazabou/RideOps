import { useState } from 'react';
import EmptyState from '../ui/EmptyState';
import HistoryRow from './HistoryRow';
import RecurringSection from './RecurringSection';

export default function HistoryPanel({ terminalRides }) {
  const [historyLimit, setHistoryLimit] = useState(20);

  const limited = terminalRides.slice(0, historyLimit);

  return (
    <>
      <h3 className="text-16 fw-700" style={{ margin: '0 0 16px' }}>Ride History</h3>
      <div id="history-content">
        {terminalRides.length === 0 ? (
          <EmptyState icon="ti-history-off" title="No ride history yet" message="Your completed rides will appear here." />
        ) : (
          limited.map((ride, idx) => <HistoryRow key={ride.id} ride={ride} index={idx} />)
        )}
      </div>
      {terminalRides.length > historyLimit && (
        <div id="history-load-more" className="text-center p-12">
          <button className="ro-btn ro-btn--outline ro-btn--sm" id="load-more-btn" onClick={() => setHistoryLimit(prev => prev + 20)}>
            Load More
          </button>
        </div>
      )}
      <RecurringSection />
    </>
  );
}
