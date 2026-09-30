import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { Edit2, Users, Search, X, Award } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const FacultyManagement = () => {
  const { user } = useAuth();
  const [faculty, setFaculty] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [editingFaculty, setEditingFaculty] = useState(null);
  const [casual, setCasual] = useState(12);
  const [restricted, setRestricted] = useState(10);
  const [earned, setEarned] = useState(15);
  const [vacation, setVacation] = useState(11);
  const [ood, setOod] = useState(10);
  const [restrictedLeaveEnabled, setRestrictedLeaveEnabled] = useState(true);
  const [earnedLeaveEnabled, setEarnedLeaveEnabled] = useState(true);
  const [vacationLeaveEnabled, setVacationLeaveEnabled] = useState(true);
  const [oodLeaveEnabled, setOodLeaveEnabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchFaculty = async () => {
    try {
      if (user?.department) {
        const response = await api.get(`/departments/${user.department._id}`);
        if (response.data.success) {
          setFaculty(response.data.department.facultyList || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch department faculty:', error);
      toast.error('Failed to load faculty list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFaculty();
  }, [user?._id]);

  const handleEditClick = (fac) => {
    setEditingFaculty(fac);
    setCasual(fac.leaveBalance?.casual !== undefined ? fac.leaveBalance.casual : 12);
    setRestricted(fac.leaveBalance?.restricted !== undefined ? fac.leaveBalance.restricted : 10);
    setEarned(fac.leaveBalance?.earned !== undefined ? fac.leaveBalance.earned : 15);
    setVacation(fac.leaveBalance?.vacation !== undefined ? fac.leaveBalance.vacation : 11);
    setOod(fac.leaveBalance?.ood !== undefined ? fac.leaveBalance.ood : 10);
    setRestrictedLeaveEnabled(fac.restrictedLeaveEnabled !== false);
    setEarnedLeaveEnabled(fac.earnedLeaveEnabled !== false);
    setVacationLeaveEnabled(fac.vacationLeaveEnabled !== false);
    setOodLeaveEnabled(fac.oodLeaveEnabled !== false);
  };

  const handleUpdateBalances = async (e) => {
    e.preventDefault();
    setUpdating(true);
    try {
      const response = await api.put(`/users/${editingFaculty._id}`, {
        leaveBalance: {
          casual: parseInt(casual),
          restricted: parseInt(restricted),
          earned: parseInt(earned),
          vacation: parseInt(vacation),
          ood: parseInt(ood),
        },
        restrictedLeaveEnabled,
        earnedLeaveEnabled,
        vacationLeaveEnabled,
        oodLeaveEnabled,
      });

      if (response.data.success) {
        toast.success(`Leave balances updated for ${editingFaculty.name}`);
        setEditingFaculty(null);
        await fetchFaculty();
      }
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || 'Failed to update leave balances';
      toast.error(msg);
    } finally {
      setUpdating(false);
    }
  };

  const filteredFaculty = faculty.filter((fac) => {
    return (
      fac.name.toLowerCase().includes(search.toLowerCase()) ||
      fac.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      fac.designation.toLowerCase().includes(search.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-slate-200 dark:bg-gray-800 rounded"></div>
        <div className="h-20 bg-slate-200 dark:bg-gray-800 rounded"></div>
        <div className="h-20 bg-slate-200 dark:bg-gray-800 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Manage Department Faculty</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            View details and update annual leave balances for department members
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            className="form-input pl-10"
            placeholder="Search by name, designation, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Faculty List Table */}
      {filteredFaculty.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-450">
          <Users size={48} className="stroke-[1.5] mb-2" />
          <p className="text-sm font-medium">No faculty members found.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table-el">
            <thead>
              <tr>
                <th className="table-th">Faculty Profile</th>
                <th className="table-th">Role</th>
                <th className="table-th text-center">Casual Balance</th>
                <th className="table-th text-center">Restricted Balance</th>
                <th className="table-th text-center">Earned Balance</th>
                <th className="table-th text-center">Vacation Balance</th>
                <th className="table-th text-center">OOD Balance</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
              {filteredFaculty.map((fac) => (
                <tr key={fac._id} className="table-tr">
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold overflow-hidden border border-primary-200">
                        {fac.avatar ? (
                          <img src={fac.avatar} alt="avatar" className="h-full w-full object-cover" />
                        ) : (
                          fac.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-white">{fac.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {fac.designation} • ID: {fac.employeeId}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="table-td text-xs font-semibold uppercase">{fac.role}</td>
                  <td className="table-td text-center font-bold text-slate-700 dark:text-slate-300">
                    {fac.leaveBalance?.casual !== undefined ? fac.leaveBalance.casual : 12} days
                  </td>
                  <td className="table-td text-center font-bold text-slate-700 dark:text-slate-300">
                    {fac.restrictedLeaveEnabled !== false ? `${fac.leaveBalance?.restricted !== undefined ? fac.leaveBalance.restricted : 10} days` : <span className="text-red-500 font-bold text-xs">Disabled</span>}
                  </td>
                  <td className="table-td text-center font-bold text-slate-700 dark:text-slate-300">
                    {fac.earnedLeaveEnabled !== false ? `${fac.leaveBalance?.earned !== undefined ? fac.leaveBalance.earned : 15} days` : <span className="text-red-500 font-bold text-xs">Disabled</span>}
                  </td>
                  <td className="table-td text-center font-bold text-slate-700 dark:text-slate-300">
                    {(fac.vacationLeaveEnabled === false || ['Instructor', 'SDA'].includes(fac.role))
                      ? <span className="text-red-500 font-bold text-xs">Disabled</span>
                      : `${fac.role === 'HOD' ? '0' : (fac.leaveBalance?.vacation !== undefined ? fac.leaveBalance.vacation : 11)} days`}
                  </td>
                  <td className="table-td text-center font-bold text-slate-700 dark:text-slate-300">
                    {(fac.oodLeaveEnabled === false || ['Instructor', 'SDA'].includes(fac.role))
                      ? <span className="text-red-500 font-bold text-xs">Disabled</span>
                      : `${fac.leaveBalance?.ood !== undefined ? fac.leaveBalance.ood : 10} days`}
                  </td>
                  <td className="table-td text-right">
                    {/* HOD can update leave balances of other users, but not block themselves from the UI */}
                    {fac._id !== user._id && (
                      <button
                        onClick={() => handleEditClick(fac)}
                        className="p-2 bg-slate-100 dark:bg-gray-700 text-slate-655 dark:text-slate-300 hover:text-primary-600 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1.5"
                      >
                        <Edit2 size={14} />
                        <span className="text-xs font-semibold">Modify Balance</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Balance Modal */}
      {editingFaculty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs px-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-150 dark:border-gray-700 overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-primary-600 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <Award size={18} />
                <span>Adjust Leave Balance</span>
              </h3>
              <button onClick={() => setEditingFaculty(null)} className="text-white hover:text-primary-200">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateBalances} className="p-6 space-y-4">
              <div className="pb-3 border-b border-slate-100 dark:border-gray-700">
                <p className="text-xs text-slate-400 uppercase font-semibold">Faculty Name</p>
                <p className="text-base font-bold text-slate-800 dark:text-white mt-0.5">
                  {editingFaculty.name}
                </p>
              </div>

              {/* Casual Leave input */}
              <div className="form-group">
                <label className="form-label">Casual Leave Balance</label>
                <input
                  type="number"
                  min="0"
                  required
                  className="form-input text-sm"
                  value={casual}
                  onChange={(e) => setCasual(e.target.value)}
                />
              </div>

              {/* Restricted Leave input */}
              <div className="form-group">
                <div className="flex items-center justify-between mb-1">
                  <label className="form-label mb-0">Restricted Leave Balance</label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={restrictedLeaveEnabled}
                      onChange={(e) => setRestrictedLeaveEnabled(e.target.checked)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-3.5 w-3.5"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Enabled</span>
                  </label>
                </div>
                <input
                  type="number"
                  min="0"
                  required={restrictedLeaveEnabled}
                  disabled={!restrictedLeaveEnabled}
                  className="form-input text-sm"
                  value={restricted}
                  onChange={(e) => setRestricted(e.target.value)}
                />
              </div>

              {/* Earned Leave input */}
              <div className="form-group">
                <div className="flex items-center justify-between mb-1">
                  <label className="form-label mb-0">Earned Leave Balance</label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={earnedLeaveEnabled}
                      onChange={(e) => setEarnedLeaveEnabled(e.target.checked)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-3.5 w-3.5"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Enabled</span>
                  </label>
                </div>
                <input
                  type="number"
                  min="0"
                  required={earnedLeaveEnabled}
                  disabled={!earnedLeaveEnabled}
                  className="form-input text-sm"
                  value={earned}
                  onChange={(e) => setEarned(e.target.value)}
                />
              </div>

              {/* Vacation Leave input */}
              <div className="form-group">
                <div className="flex items-center justify-between mb-1">
                  <label className="form-label mb-0">Vacation Leave Balance</label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={vacationLeaveEnabled}
                      onChange={(e) => setVacationLeaveEnabled(e.target.checked)}
                      disabled={['Instructor', 'SDA'].includes(editingFaculty?.role)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-3.5 w-3.5 disabled:cursor-not-allowed"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                      {['Instructor', 'SDA'].includes(editingFaculty?.role) ? 'N/A for this role' : 'Enabled'}
                    </span>
                  </label>
                </div>
                <input
                  type="number"
                  min="0"
                  required={vacationLeaveEnabled}
                  disabled={!vacationLeaveEnabled || ['Instructor', 'SDA'].includes(editingFaculty?.role)}
                  className="form-input text-sm"
                  value={vacation}
                  onChange={(e) => setVacation(e.target.value)}
                />
              </div>

              {/* OOD Leave input */}
              <div className="form-group">
                <div className="flex items-center justify-between mb-1">
                  <label className="form-label mb-0">Official Duty (OOD) Balance</label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={oodLeaveEnabled}
                      onChange={(e) => setOodLeaveEnabled(e.target.checked)}
                      disabled={['Instructor', 'SDA'].includes(editingFaculty?.role)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-3.5 w-3.5 disabled:cursor-not-allowed"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                      {['Instructor', 'SDA'].includes(editingFaculty?.role) ? 'N/A for this role' : 'Enabled'}
                    </span>
                  </label>
                </div>
                <input
                  type="number"
                  min="0"
                  required={oodLeaveEnabled}
                  disabled={!oodLeaveEnabled || ['Instructor', 'SDA'].includes(editingFaculty?.role)}
                  className="form-input text-sm"
                  value={ood}
                  onChange={(e) => setOod(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingFaculty(null)}
                  className="btn-secondary py-1.5"
                  disabled={updating}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary py-1.5" disabled={updating}>
                  {updating ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacultyManagement;
