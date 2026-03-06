import { useState, useEffect } from 'react';
import { fetchAdminUserProfile, resetMissCount } from '../../../api';
import { useToast } from '../../../contexts/ToastContext';
import { useAuth } from '../../../contexts/AuthContext';
import Drawer from '../../../components/ui/Drawer';

const DICEBEAR_BASE = 'https://api.dicebear.com/9.x';

function defaultAvatarUrl(name) {
  return `${DICEBEAR_BASE}/initials/svg?seed=${encodeURIComponent(name || 'User')}`;
}

export default function UserDrawer({ userId, onClose, onResetPassword, onDeleteUser, onRestoreUser }) {
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) { setProfile(null); return; }
    setLoading(true);
    fetchAdminUserProfile(userId)
      .then(data => setProfile(data))
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [userId, showToast]);

  const handleResetMissCount = async () => {
    try {
      await resetMissCount(userId);
      showToast('Miss count reset to 0.', 'success');
      const data = await fetchAdminUserProfile(userId);
      setProfile(data);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const isSelf = currentUser?.id === userId;
  const user = profile?.user || profile;
  const missCount = profile?.missCount ?? 0;
  const maxStrikes = profile?.maxStrikes ?? 5;
  const rides = profile?.rides || [];

  return (
    <Drawer open={!!userId} onClose={onClose} title="User Details">
      {loading && (
        <div className="text-muted p-24 text-center">Loading...</div>
      )}
      {!loading && user && (
        <div>
          {/* User header */}
          <div className="flex items-center gap-12 mb-16">
            <div className="profile-avatar">
              <img src={user.avatar_url || defaultAvatarUrl(user.name)} alt={user.name} />
            </div>
            <div>
              <div className="fw-600 text-16">{user.name}</div>
              <span className={`status-badge status-badge--${user.role === 'office' ? 'approved' : user.role === 'driver' ? 'scheduled' : 'pending'}`}>
                {user.role}
              </span>
            </div>
          </div>

          {/* Deleted banner */}
          {user.deleted_at && (
            <div className="mb-16 text-13" style={{
              padding: '12px', borderRadius: 'var(--radius-sm)',
              background: 'rgba(107,114,128,0.1)',
              border: '1px solid var(--color-text-muted)',
            }}>
              <strong>Deleted</strong> on {new Date(user.deleted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}

          {/* No-show banner for riders */}
          {user.role === 'rider' && missCount > 0 && (
            <div className="mb-16 text-13" style={{
              padding: '12px', borderRadius: 'var(--radius-sm)',
              background: missCount >= maxStrikes ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
              border: `1px solid ${missCount >= maxStrikes ? 'var(--status-denied)' : 'var(--status-on-the-way)'}`,
            }}>
              <strong>{missCount >= maxStrikes ? 'Service Terminated' : 'No-Show Warning'}</strong>: {missCount} / {maxStrikes} consecutive no-shows.
              <button
                className="ro-btn ro-btn--outline ro-btn--sm ml-8"
                onClick={handleResetMissCount}
              >
                Reset Count
              </button>
            </div>
          )}

          {/* Details */}
          <div className="text-13 gap-8 mb-24" style={{
            display: 'grid',
            gridTemplateColumns: '100px 1fr',
          }}>
            <span className="text-muted">Email</span><span>{user.email || '\u2014'}</span>
            <span className="text-muted">Username</span><span>{user.username}</span>
            <span className="text-muted">Phone</span><span>{user.phone || '\u2014'}</span>
            <span className="text-muted">Member ID</span><span>{user.member_id || '\u2014'}</span>
          </div>

          {/* Recent rides */}
          {rides.length > 0 && (
            <div className="mb-24">
              <h4 className="text-13 fw-600 mb-8">
                Recent Rides ({rides.length})
              </h4>
              <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
                {rides.slice(0, 10).map(r => (
                  <div key={r.id} className="flex justify-between p-8 text-sm" style={{
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    <span>{r.pickup_location} \u2192 {r.dropoff_location}</span>
                    <span className={`status-badge status-badge--${r.status} text-xs`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {!isSelf && (
            <div className="pt-16" style={{ borderTop: '1px solid var(--color-border)' }}>
              {user.deleted_at ? (
                <button
                  className="ro-btn ro-btn--outline ro-btn--sm"
                  onClick={() => onRestoreUser(userId, user.name)}
                >
                  <i className="ti ti-refresh"></i> Restore User
                </button>
              ) : (
                <>
                  <button
                    className="ro-btn ro-btn--outline ro-btn--sm mr-8"
                    onClick={() => onResetPassword(userId, user.name)}
                  >
                    <i className="ti ti-key"></i> Reset Password
                  </button>
                  <button
                    className="ro-btn ro-btn--danger ro-btn--sm"
                    onClick={() => onDeleteUser(userId, user.name)}
                  >
                    <i className="ti ti-trash"></i> Delete User
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
