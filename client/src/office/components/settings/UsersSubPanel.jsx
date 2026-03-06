import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchAdminUsers, createAdminUser, deleteAdminUser, restoreAdminUser, resetAdminUserPassword } from '../../../api';
import { useToast } from '../../../contexts/ToastContext';
import { useModal } from '../../../components/ui/Modal';
import UserDrawer from './UserDrawer';
import Pagination from '../rides/Pagination';

const USER_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'username', label: 'Username' },
  { key: 'role', label: 'Role' },
  { key: 'member_id', label: 'Member ID' },
  { key: 'phone', label: 'Phone' },
];

function SortIcon({ col, sortCol, sortDir }) {
  if (col !== sortCol) return <i className="ti ti-arrows-sort ml-4 text-sm" style={{ opacity: 0.3 }} />;
  return sortDir === 'asc'
    ? <i className="ti ti-sort-ascending ml-4 text-sm" />
    : <i className="ti ti-sort-descending ml-4 text-sm" />;
}

export default function UsersSubPanel() {
  const { showToast } = useToast();
  const { showModal } = useModal();
  const [users, setUsers] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [drawerUserId, setDrawerUserId] = useState(null);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const filterTimer = useRef(null);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchAdminUsers({ includeDeleted: showDeleted });
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }, [showToast, showDeleted]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    let result = users;
    if (roleFilter !== 'all') {
      result = result.filter(u => u.role === roleFilter);
    }
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      result = result.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q) ||
        (u.member_id || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q)
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      const av = (a[sortCol] || '').toLowerCase();
      const bv = (b[sortCol] || '').toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return result;
  }, [users, filterText, roleFilter, sortCol, sortDir]);

  // Reset to page 1 when filters or sort change
  useEffect(() => { setPage(1); }, [filterText, roleFilter, sortCol, sortDir]);

  const totalCount = filteredUsers.length;
  const pagedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  const handleSort = useCallback((col) => {
    setSortCol(prev => {
      if (prev === col) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return col;
      }
      setSortDir('asc');
      return col;
    });
  }, []);

  const handlePageSizeChange = useCallback((newSize) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  const handleFilterChange = (e) => {
    clearTimeout(filterTimer.current);
    const val = e.target.value;
    filterTimer.current = setTimeout(() => setFilterText(val), 300);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = filteredUsers.filter(u => !u.deleted_at);
    if (selectedIds.size === selectable.length && selectable.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable.map(u => u.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await showModal({
      title: 'Delete Users',
      body: `Are you sure you want to delete ${selectedIds.size} user(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmClass: 'ro-btn--danger',
    });
    if (!ok) return;
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        await deleteAdminUser(id);
        deleted++;
      } catch (e) {
        showToast(`Failed to delete user: ${e.message}`, 'error');
      }
    }
    if (deleted > 0) {
      showToast(`Deleted ${deleted} user(s).`, 'success');
      setSelectedIds(new Set());
      loadUsers();
    }
  };

  const handleAddUser = async () => {
    const formData = { username: '', name: '', email: '', phone: '', memberId: '', role: 'rider', password: '' };
    const ok = await showModal({
      title: 'Create New User',
      body: (
        <div className="flex-col gap-12">
          <div><label className="ro-label">Username</label><input className="ro-input" placeholder="Username" onChange={e => { formData.username = e.target.value; }} /></div>
          <div><label className="ro-label">Full Name</label><input className="ro-input" placeholder="Full name" onChange={e => { formData.name = e.target.value; }} /></div>
          <div><label className="ro-label">Email</label><input className="ro-input" type="email" placeholder="Email" onChange={e => { formData.email = e.target.value; }} /></div>
          <div><label className="ro-label">Phone</label><input className="ro-input" placeholder="Phone (optional)" onChange={e => { formData.phone = e.target.value; }} /></div>
          <div><label className="ro-label">Member ID</label><input className="ro-input" placeholder="Member ID" onChange={e => { formData.memberId = e.target.value; }} /></div>
          <div>
            <label className="ro-label">Role</label>
            <select className="ro-input" defaultValue="rider" onChange={e => { formData.role = e.target.value; }}>
              <option value="rider">Rider</option>
              <option value="driver">Driver</option>
              <option value="office">Office</option>
            </select>
          </div>
          <div><label className="ro-label">Password</label><input className="ro-input" type="password" placeholder="Min 8 characters" onChange={e => { formData.password = e.target.value; }} /></div>
        </div>
      ),
      confirmLabel: 'Create User',
    });
    if (!ok) return;
    const { username, name, email, phone, memberId, role, password } = formData;
    if (!username.trim() || !name.trim() || !email.trim() || !memberId.trim() || !password) {
      showToast('Username, name, email, member ID, and password are required.', 'error');
      return;
    }
    if (password.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    try {
      await createAdminUser({ username: username.trim(), name: name.trim(), email: email.trim(), phone: phone.trim(), memberId: memberId.trim(), role, password });
      showToast('User created successfully.', 'success');
      loadUsers();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleResetPassword = async (userId, userName) => {
    const ok = await showModal({
      title: 'Reset Password',
      body: (
        <>
          <p>Reset password for <strong>{userName}</strong>?</p>
          <div className="mt-12">
            <label className="ro-label">New Password</label>
            <input className="ro-input" id="modal-reset-pw" type="password" placeholder="Min 8 characters" />
          </div>
        </>
      ),
      confirmLabel: 'Reset Password',
      confirmClass: 'ro-btn--danger',
    });
    if (!ok) return;
    const newPassword = document.getElementById('modal-reset-pw')?.value;
    if (!newPassword || newPassword.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    try {
      await resetAdminUserPassword(userId, { newPassword });
      showToast('Password reset successfully.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    const ok = await showModal({
      title: 'Delete User',
      body: <>Are you sure you want to deactivate <strong>{userName}</strong>? Their data will be preserved for audit trails. You can restore them later.</>,
      confirmLabel: 'Delete',
      confirmClass: 'ro-btn--danger',
    });
    if (!ok) return;
    try {
      await deleteAdminUser(userId);
      showToast('User deactivated.', 'success');
      loadUsers();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleRestoreUser = async (userId, userName) => {
    const ok = await showModal({
      title: 'Restore User',
      body: <>Restore <strong>{userName}</strong>? They will be able to log in again.</>,
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    try {
      await restoreAdminUser(userId);
      showToast('User restored.', 'success');
      loadUsers();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Username', 'Role', 'Member ID', 'Phone'];
    const rows = filteredUsers.map(u => [u.name, u.email, u.username, u.role, u.member_id || '', u.phone || '']);
    const csv = [headers, ...rows].map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'users.csv';
    a.click();
  };

  const roleBadgeClass = (role) => {
    if (role === 'office') return 'status-badge status-badge--approved';
    if (role === 'driver') return 'status-badge status-badge--scheduled';
    return 'status-badge status-badge--pending';
  };

  return (
    <>
      <div className="filter-bar items-center">
        <input
          type="text"
          id="admin-user-filter"
          className="ro-input"
          placeholder="Search by name, email, phone, member ID, or role..."
          style={{ maxWidth: '400px' }}
          onChange={handleFilterChange}
        />
        <label className="flex items-center text-13 text-muted cursor-pointer text-nowrap" style={{ gap: '6px' }}>
          <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
          Show deleted
        </label>
      </div>
      <div className="ro-section">
        <div className="text-sm text-muted mb-16">
          Manage riders, drivers, and office accounts. You cannot delete your own office account.
        </div>
        <div className="ro-table-wrap">
          <table className="ro-table" id="admin-users-table">
            <thead>
              <tr>
                <th style={{ width: '32px' }}>
                  <input
                    type="checkbox"
                    id="users-select-all"
                    checked={filteredUsers.length > 0 && selectedIds.size === filteredUsers.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                {USER_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="cursor-pointer"
                    style={{ userSelect: 'none' }}
                  >
                    {col.label}
                    <SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map(u => {
                const isDeleted = !!u.deleted_at;
                return (
                  <tr key={u.id} className={`cursor-pointer${isDeleted ? ' opacity-50' : ''}`} onClick={() => setDrawerUserId(u.id)}>
                    <td onClick={e => e.stopPropagation()}>
                      {!isDeleted && <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)} />}
                    </td>
                    <td style={isDeleted ? { textDecoration: 'line-through' } : undefined}>
                      {u.name}
                      {isDeleted && <span className="status-badge status-badge--denied" style={{ marginLeft: '6px', fontSize: '10px' }}>Deleted</span>}
                    </td>
                    <td>{u.email || '\u2014'}</td>
                    <td className="text-muted">{u.username}</td>
                    <td><span className={roleBadgeClass(u.role)}>{u.role}</span></td>
                    <td className="text-muted">{u.member_id || '\u2014'}</td>
                    <td className="text-muted">{u.phone || '\u2014'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="relative">
                        {isDeleted ? (
                          <KebabMenu
                            onRestore={() => handleRestoreUser(u.id, u.name)}
                          />
                        ) : (
                          <KebabMenu
                            onResetPassword={() => handleResetPassword(u.id, u.name)}
                            onDelete={() => handleDeleteUser(u.id, u.name)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pagedUsers.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted p-24">No users found.</td></tr>
              )}
            </tbody>
          </table>
          <Pagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
          <div className="table-toolbar">
            <span className="table-toolbar__count" id="admin-user-filter-count">
              {totalCount} user{totalCount !== 1 ? 's' : ''}
            </span>
            <button
              className="ro-btn ro-btn--danger ro-btn--sm"
              id="users-delete-selected-btn"
              style={{ display: selectedIds.size > 0 ? '' : 'none' }}
              onClick={handleBulkDelete}
            >
              <i className="ti ti-trash"></i> Delete Selected (<span id="users-selected-count">{selectedIds.size}</span>)
            </button>
            <div className="table-toolbar__actions">
              <div className="relative">
                <button
                  className="table-toolbar__btn"
                  id="admin-role-filter-btn"
                  title="Filter by role"
                  onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                >
                  <i className="ti ti-filter"></i>
                </button>
                {showRoleDropdown && (
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, minWidth: '120px',
                  }}>
                    {['all', 'office', 'driver', 'rider'].map(r => (
                      <button key={r} style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                        border: 'none', background: roleFilter === r ? 'var(--color-primary-subtle)' : 'transparent',
                        cursor: 'pointer', fontSize: '13px',
                      }} onClick={() => { setRoleFilter(r); setShowRoleDropdown(false); }}>
                        {r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="table-toolbar__btn" id="admin-export-csv-btn" title="Export CSV" onClick={exportCSV}>
                <i className="ti ti-download"></i>
              </button>
              <button className="table-toolbar__btn table-toolbar__btn--add" id="admin-add-user-btn" title="Add user" onClick={handleAddUser}>
                <i className="ti ti-plus"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <UserDrawer
        userId={drawerUserId}
        onClose={() => { setDrawerUserId(null); loadUsers(); }}
        onResetPassword={handleResetPassword}
        onDeleteUser={handleDeleteUser}
        onRestoreUser={handleRestoreUser}
      />
    </>
  );
}

function KebabMenu({ onResetPassword, onDelete, onRestore }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="kebab-btn" onClick={() => setOpen(!open)}>
        <i className="ti ti-dots-vertical"></i>
      </button>
      {open && (
        <div className="kebab-menu absolute" style={{ right: 0, top: '100%', zIndex: 10 }}>
          {onRestore ? (
            <button className="kebab-item" onClick={() => { setOpen(false); onRestore(); }}>
              <i className="ti ti-refresh"></i> Restore
            </button>
          ) : (
            <>
              <button className="kebab-item" onClick={() => { setOpen(false); onResetPassword(); }}>
                <i className="ti ti-key"></i> Reset Password
              </button>
              <button className="kebab-item" style={{ color: 'var(--status-denied)' }} onClick={() => { setOpen(false); onDelete(); }}>
                <i className="ti ti-trash"></i> Delete
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
