const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'hotspots', label: 'Hotspots' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'reports', label: 'Reports' },
];

export default function AnalyticsTabBar({ activeTab, onTabChange }) {
  return (
    <div className="ro-tabs">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`ro-tab${activeTab === tab.id ? ' active' : ''}`}
          data-analytics-tab={tab.id}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
