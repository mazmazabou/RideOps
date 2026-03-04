import './chartSetup';
import { useState, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { clearAnalyticsCache } from './hooks/useAnalyticsFetch';
import AnalyticsTabBar from './AnalyticsTabBar';
import DateFilterBar from './DateFilterBar';
import DashboardTab from './tabs/DashboardTab';
import HotspotsTab from './tabs/HotspotsTab';
import MilestonesTab from './tabs/MilestonesTab';
import AttendanceTab from './tabs/AttendanceTab';
import ReportsTab from './tabs/ReportsTab';

function getDefaultDateRange() {
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const weekAgo = new Date(today.getTime() - 6 * 86400000);
  const weekAgoStr = weekAgo.getFullYear() + '-' + String(weekAgo.getMonth() + 1).padStart(2, '0') + '-' + String(weekAgo.getDate()).padStart(2, '0');
  return { from: weekAgoStr, to: todayStr };
}

export default function AnalyticsPanel() {
  const { user } = useAuth();
  const userId = user?.id || 'default';

  const [activeTab, setActiveTab] = useState('dashboard');
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    clearAnalyticsCache();
    setRefreshKey(k => k + 1);
  }, []);

  const handleDateChange = useCallback((newRange) => {
    clearAnalyticsCache();
    setDateRange(newRange);
  }, []);

  return (
    <div>
      <DateFilterBar
        dateRange={dateRange}
        onDateChange={handleDateChange}
        onRefresh={handleRefresh}
      />
      <AnalyticsTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'dashboard' && (
        <DashboardTab
          key={'dashboard-' + refreshKey}
          dateRange={dateRange}
          userId={userId}
        />
      )}
      {activeTab === 'hotspots' && (
        <HotspotsTab
          key={'hotspots-' + refreshKey}
          dateRange={dateRange}
          userId={userId}
        />
      )}
      {activeTab === 'milestones' && (
        <MilestonesTab
          key={'milestones-' + refreshKey}
          userId={userId}
        />
      )}
      {activeTab === 'attendance' && (
        <AttendanceTab
          key={'attendance-' + refreshKey}
          dateRange={dateRange}
          userId={userId}
        />
      )}
      {activeTab === 'reports' && (
        <ReportsTab
          key={'reports-' + refreshKey}
          dateRange={dateRange}
        />
      )}
    </div>
  );
}
