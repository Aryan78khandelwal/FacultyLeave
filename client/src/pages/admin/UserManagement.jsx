import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { UserPlus, Edit2, Trash2, Search, X, Users, Settings } from 'lucide-react';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Modals visibility
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Form states
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'Faculty',
    employeeId: '',
    designation: '',
    department: '',
    casual: 12,
    sick: 10,
    earned: 15,
    password: '',
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      let url = `/users?page=${page}&limit=8`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (roleFilter) url += `&role=${roleFilter}`;
      if (deptFilter) url += `&department=${deptFilter}`;

      const response = await api.get(url);
      if (response.data.success) {
        setUsers(response.data.users);
        setTotalPages(response.data.totalPages || 1);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to load users list');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      if (response.data.success) {
        setDepartments(response.data.departments);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter, deptFilter]);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();

    if (formData.password && formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      const response = await api.post('/users', {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        employeeId: formData.employeeId,
        designation: formData.designation,
        department: formData.role === 'Admin' ? null : formData.department || null,
        password: formData.password || undefined,
        leaveBalance: {
          casual: parseInt(formData.casual),
          sick: parseInt(formData.sick),
          earned: parseInt(formData.earned),
        },
      });

      if (response.data.success) {
        toast.success(response.data.message || 'User created successfully');
        setCreateOpen(false);
        resetForm();
        setPage(1);
        await fetchUsers();
      }
    } catch (error) {
      console.error(error);
      let msg = 'Failed to create user';
      if (error.response?.data?.errors && error.response.data.errors.length > 0) {
        msg = error.response.data.errors.map((err) => err.msg).join(', ');
      } else if (error.response?.data?.message) {
        msg = error.response.data.message;
      }
      toast.error(msg);
    }
  };

  const handleEditClick = (userObj) => {
    setSelectedUser(userObj);
    setFormData({
      name: userObj.name || '',
      email: userObj.email || '',
      role: userObj.role || 'Faculty',
      employeeId: userObj.employeeId || '',
      designation: userObj.designation || '',
      department: userObj.department?._id || userObj.department || '',
      casual: userObj.leaveBalance?.casual || 12,
      sick: userObj.leaveBalance?.sick || 10,
      earned: userObj.leaveBalance?.earned || 15,
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await api.put(`/users/${selectedUser._id}`, {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        employeeId: formData.employeeId,
        designation: formData.designation,
        department: formData.role === 'Admin' ? null : formData.department || null,
        leaveBalance: {
          casual: parseInt(formData.casual),
          sick: parseInt(formData.sick),
          earned: parseInt(formData.earned),
        },
      });

      if (response.data.success) {
        toast.success('User updated successfully');
        setEditOpen(false);
        resetForm();
        await fetchUsers();
      }
    } catch (error) {
      console.error(error);
      let msg = 'Failed to update user';
      if (error.response?.data?.errors && error.response.data.errors.length > 0) {
        msg = error.response.data.errors.map((err) => err.msg).join(', ');
      } else if (error.response?.data?.message) {
        msg = error.response.data.message;
      }
      toast.error(msg);
    }
  };

  const handleDeleteClick = (userObj) => {
    setSelectedUser(userObj);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      const response = await api.delete(`/users/${selectedUser._id}`);
      if (response.data.success) {
        toast.success('User account deleted');
        setDeleteOpen(false);
        await fetchUsers();
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete user');
    }
  };

  const resetForm = () => {
    setSelectedUser(null);
    setFormData({
      name: '',
      email: '',
      role: 'Faculty',
      employeeId: '',
      designation: '',
      department: '',
      casual: 12,
      sick: 10,
      earned: 15,
      password: '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">User Account Management</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create, update, and manage college faculty, HOD, and administrative login accounts
          </p>
        </div>
        <button onClick={() => { resetForm(); setCreateOpen(true); }} className="btn-primary gap-2 self-start sm:self-auto">
          <UserPlus size={18} />
          <span>Add System User</span>
        </button>
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm flex flex-col md:flex-row gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            className="form-input pl-10"
            placeholder="Search by name, email, employee ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className="flex flex-wrap gap-4">
          <select
            className="form-input text-xs max-w-[150px] py-1.5"
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Roles</option>
            <option value="Admin">Admin</option>
            <option value="HOD">HOD</option>
            <option value="Faculty">Faculty</option>
          </select>

          <select
            className="form-input text-xs max-w-[180px] py-1.5"
            value={deptFilter}
            onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept._id} value={dept._id}>{dept.name}</option>
            ))}
          </select>
          
          <button onClick={fetchUsers} className="btn-secondary text-xs px-4 py-1.5">
            Apply Filters
          </button>
        </div>
      </div>

      {/* Users table */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-10 bg-slate-200 dark:bg-gray-800 rounded"></div>
          <div className="h-10 bg-slate-200 dark:bg-gray-800 rounded"></div>
          <div className="h-10 bg-slate-200 dark:bg-gray-800 rounded"></div>
        </div>
      ) : users.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-455">
          <Users size={48} className="stroke-[1.5] mb-2" />
          <p className="text-sm">No user accounts found matching the criteria.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="table-container">
            <table className="table-el">
              <thead>
                <tr>
                  <th className="table-th">User Profile</th>
                  <th className="table-th">Department</th>
                  <th className="table-th">Role</th>
                  <th className="table-th text-center">Balances (C/S/E)</th>
                  <th className="table-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
                {users.map((item) => (
                  <tr key={item._id} className="table-tr">
                    <td className="table-td">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-gray-700 flex items-center justify-center text-primary-655 font-bold overflow-hidden border border-slate-200">
                          {item.avatar ? (
                            <img src={item.avatar} alt="avatar" className="h-full w-full object-cover" />
                          ) : (
                            item.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-white">{item.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {item.email} • ID: {item.employeeId} • {item.designation}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="table-td text-xs">
                      {item.role === 'Admin' ? (
                        <span className="text-slate-400 italic">None (Admin)</span>
                      ) : (
                        item.department?.name || <span className="text-red-500 font-medium">Unassigned</span>
                      )}
                    </td>
                    <td className="table-td">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        item.role === 'Admin' 
                          ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200' 
                          : item.role === 'HOD' 
                          ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-705 border-amber-200' 
                          : 'bg-primary-50 dark:bg-primary-950/20 text-primary-600 border-primary-200'
                      }`}>
                        {item.role}
                      </span>
                    </td>
                    <td className="table-td text-center text-xs font-semibold">
                      {item.role === 'Admin' ? (
                        <span className="text-slate-400 italic">-</span>
                      ) : (
                        <span className="text-slate-700 dark:text-slate-300">
                          {item.leaveBalance?.casual || 0} / {item.leaveBalance?.sick || 0} / {item.leaveBalance?.earned || 0}
                        </span>
                      )}
                    </td>
                    <td className="table-td text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEditClick(item)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-700 dark:text-slate-250 rounded-lg"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(item)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-655 rounded-lg"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white dark:bg-gray-800 px-4 py-3 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm">
              <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="btn-secondary px-3 py-1 text-xs"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="btn-secondary px-3 py-1 text-xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Modals */}
      {(createOpen || editOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs px-4 overflow-y-auto py-8">
          <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-150 dark:border-gray-700 overflow-hidden my-auto animate-scaleIn">
            <div className="px-6 py-4 bg-primary-600 text-white flex justify-between items-center">
              <h3 className="font-bold">{createOpen ? 'Add New User Account' : 'Edit User Settings'}</h3>
              <button onClick={() => { setCreateOpen(false); setEditOpen(false); resetForm(); }} className="text-white hover:text-primary-200">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={createOpen ? handleCreateSubmit : handleEditSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    required
                    className="form-input text-sm"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    required
                    className="form-input text-sm"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Employee ID</label>
                  <input
                    type="text"
                    required
                    className="form-input text-sm"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Designation</label>
                  <input
                    type="text"
                    required
                    className="form-input text-sm"
                    value={formData.designation}
                    placeholder="e.g. Assistant Professor"
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  />
                </div>
              </div>

              {createOpen && (
                <div className="form-group">
                  <label className="form-label">Password (Optional - Leave blank to auto-generate)</label>
                  <input
                    type="text"
                    className="form-input text-sm"
                    placeholder="Custom password (at least 6 characters)"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select
                    className="form-input text-sm"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="Faculty">Faculty Member</option>
                    <option value="HOD">Head of Department (HOD)</option>
                    <option value="Admin">Administrator</option>
                  </select>
                </div>

                {formData.role !== 'Admin' && (
                  <div className="form-group">
                    <label className="form-label">Department Assignment</label>
                    <select
                      className="form-input text-sm"
                      value={formData.department}
                      required
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    >
                      <option value="">Choose Department</option>
                      {departments.map((dept) => (
                        <option key={dept._id} value={dept._id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {formData.role !== 'Admin' && (
                <div className="pt-2 border-t border-slate-100 dark:border-gray-700">
                  <h4 className="font-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Settings size={14} />
                    <span>Initialize Annual Leave Balances</span>
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="form-group">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Casual</label>
                      <input
                        type="number"
                        min="0"
                        className="form-input text-sm"
                        value={formData.casual}
                        onChange={(e) => setFormData({ ...formData, casual: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Sick</label>
                      <input
                        type="number"
                        min="0"
                        className="form-input text-sm"
                        value={formData.sick}
                        onChange={(e) => setFormData({ ...formData, sick: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Earned</label>
                      <input
                        type="number"
                        min="0"
                        className="form-input text-sm"
                        value={formData.earned}
                        onChange={(e) => setFormData({ ...formData, earned: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => { setCreateOpen(false); setEditOpen(false); resetForm(); }}
                  className="btn-secondary py-1.5"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary py-1.5">
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs px-4">
          <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-150 dark:border-gray-700 overflow-hidden animate-scaleIn">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/40 text-red-655 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-white">Delete User Account?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Are you sure you want to permanently delete <strong>{selectedUser?.name}</strong>'s account? This will remove all their leave histories. This action is irreversible.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDeleteOpen(false)}
                  className="btn-secondary flex-1 py-1.5"
                >
                  No, Keep it
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="btn-danger flex-1 py-1.5"
                >
                  Yes, Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
