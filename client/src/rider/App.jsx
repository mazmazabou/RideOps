import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { TenantProvider } from '../contexts/TenantContext';
import { ToastProvider } from '../contexts/ToastContext';
import { ModalProvider } from '../components/ui/Modal';
import { useRides } from '../hooks/useRides';
import { useOpsConfig } from '../hooks/useOpsConfig';
import Header from '../components/Header';
import BottomTabs from '../components/BottomTabs';
import TerminationBanner from '../components/TerminationBanner';
import ClosureBanner from '../components/ClosureBanner';
import BookPanel from '../components/booking/BookPanel';
import MyRidesPanel from '../components/rides/MyRidesPanel';
import HistoryPanel from '../components/history/HistoryPanel';

function RiderApp() {
  const { isTerminated } = useAuth();
  const { activeRides, terminalRides, initialLoadDone, refresh } = useRides();
  const { opsConfig } = useOpsConfig();
  const [activeTab, setActiveTab] = useState('book-panel');
  const [autoSwitched, setAutoSwitched] = useState(false);

  // Auto-switch to My Rides if rider has active rides on initial load
  useEffect(() => {
    if (!initialLoadDone || autoSwitched) return;
    setAutoSwitched(true);
    if (activeRides.length > 0) {
      setActiveTab('myrides-panel');
    }
  }, [initialLoadDone, activeRides.length, autoSwitched]);

  // Force to myrides if terminated
  useEffect(() => {
    if (isTerminated && activeTab === 'book-panel') {
      setActiveTab('myrides-panel');
    }
  }, [isTerminated, activeTab]);

  const handleBookSuccess = () => {
    setActiveTab('myrides-panel');
    refresh();
  };

  return (
    <>
      <Header />
      <main className="rider-main">
        <TerminationBanner visible={isTerminated} />
        <ClosureBanner
          visible={opsConfig?.service_closed === 'true'}
          message={opsConfig?.service_closed_message}
        />
        <div id="book-panel" className={`tab-panel${activeTab === 'book-panel' ? ' active' : ''}`}>
          <BookPanel onSubmitSuccess={handleBookSuccess} />
        </div>
        <div id="myrides-panel" className={`tab-panel${activeTab === 'myrides-panel' ? ' active' : ''}`}>
          <div id="myrides-content">
            <MyRidesPanel
              activeRides={activeRides}
              onBookRide={() => setActiveTab('book-panel')}
              onRefresh={refresh}
              opsConfig={opsConfig}
            />
          </div>
        </div>
        <div id="history-panel" className={`tab-panel${activeTab === 'history-panel' ? ' active' : ''}`}>
          <HistoryPanel terminalRides={terminalRides} />
        </div>
      </main>
      <BottomTabs activeTab={activeTab} onTabChange={setActiveTab} hideBook={isTerminated} />
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ModalProvider>
        <AuthProvider expectedRole="rider">
          <TenantProvider roleLabel="Rider">
            <RiderApp />
          </TenantProvider>
        </AuthProvider>
      </ModalProvider>
    </ToastProvider>
  );
}
