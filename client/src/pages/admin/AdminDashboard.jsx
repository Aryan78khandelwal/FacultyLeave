import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { Users, Building2, FileText, CheckSquare, PlusCircle, ArrowRight, ShieldCheck } from 'lucide-react';

const AdminDashboard = () => {
  const [metrics, setMetrics] = useState({ users: 0, departments: 0, pendingLeaves: 0 });
  const [recentRequests, setRecentRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdminDashboard = async () => {
      try {
        // Fire all 4 requests in parallel instead of sequentially
        const [usersResponse, deptsResponse, pendingResponse, leavesResponse] = await Promise.all([
          api.get('/users?limit=1'),
          api.get('/departments?minimal=true'),
          api.get('/leaves?status=pending&limit=1'),
          api.get('/leaves?limit=5'),
        ]);

        const totalUsers = usersResponse.data.totalUsers || 0;
        const totalDepts = deptsResponse.data.count || 0;
        const pendingCount = pendingResponse.data.totalLeaves || 0;
        const recent = leavesResponse.data.leaves || [];

        setMetrics({
          users: totalUsers,
          departments: totalDepts,
          pendingLeaves: pendingCount,
        });

        setRecentRequests(recent);
      } catch (error) {
        console.error('Failed to load admin dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminDashboard();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-gray-800 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-32 bg-slate-200 dark:bg-gray-800 rounded-xl"></div>
          <div className="h-32 bg-slate-200 dark:bg-gray-800 rounded-xl"></div>
          <div className="h-32 bg-slate-200 dark:bg-gray-800 rounded-xl"></div>
        </div>
        <div className="h-64 bg-slate-200 dark:bg-gray-800 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin header banner */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <ShieldCheck size={24} className="text-primary-600" />
            <span>ERP Global Administration Dashboard</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            University Portal Control Panel • System Audit and Policy Configurations
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-metric border-l-4 border-l-primary-500">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">Total System Users</h4>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">{metrics.users}</span>
            <span className="text-xs text-slate-400">accounts active</span>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs text-primary-655">
            <Users size={14} />
            <span>Manage accounts and roles</span>
          </div>
        </div>

        <div className="card-metric border-l-4 border-l-emerald-500">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">Active Departments</h4>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">{metrics.departments}</span>
            <span className="text-xs text-slate-400">registered academic areas</span>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs text-emerald-655">
            <Building2 size={14} />
            <span>Configure HOD assignments</span>
          </div>
        </div>

        <div className="card-metric border-l-4 border-l-amber-500">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">Global Pending Leaves</h4>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">{metrics.pendingLeaves}</span>
            <span className="text-xs text-slate-400">awaiting HOD review</span>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs text-amber-655">
            <FileText size={14} />
            <span>Awaiting department evaluation</span>
          </div>
        </div>
      </div>

      {/* Quick Action Tiles */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
          Administrative Actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Link
            to="/admin/users"
            className="card p-5 hover:translate-y-[-2px] hover:border-primary-300 dark:hover:border-primary-900 transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary-50 dark:bg-primary-950/20 text-primary-600 rounded-lg">
                <PlusCircle size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-bold text-sm text-slate-800 dark:text-white">Create New User</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Add faculty or administrators</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400" />
          </Link>

          <Link
            to="/admin/departments"
            className="card p-5 hover:translate-y-[-2px] hover:border-emerald-300 dark:hover:border-emerald-900 transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 rounded-lg">
                <Building2 size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-bold text-sm text-slate-800 dark:text-white">Manage Departments</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Add department & assign HOD</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400" />
          </Link>

          <Link
            to="/admin/settings"
            className="card p-5 hover:translate-y-[-2px] hover:border-amber-300 dark:hover:border-amber-900 transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 text-amber-600 rounded-lg">
                <CheckSquare size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-bold text-sm text-slate-800 dark:text-white">ERP Policies</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Adjust leave balance metrics</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400" />
          </Link>
        </div>
      </div>

      {/* Global Leaves Activity Log */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 dark:text-white">Global Leave Activity Log</h3>
          <Link
            to="/admin/analytics"
            className="text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
          >
            Access Global Charts →
          </Link>
        </div>

        {recentRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <FileText size={48} className="stroke-[1.5] mb-2" />
            <p className="text-sm">No leave records registered in system.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table-el">
              <thead>
                <tr>
                  <th className="table-th">Faculty Profile</th>
                  <th className="table-th">Department</th>
                  <th className="table-th">Leave Type</th>
                  <th className="table-th">Duration</th>
                  <th className="table-th">Days</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
                {recentRequests.map((leave) => (
                  <tr key={leave._id} className="table-tr">
                    <td className="table-td">
                      <div className="font-semibold text-slate-800 dark:text-white">
                        {leave.facultyId?.name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {leave.facultyId?.designation} • ID: {leave.facultyId?.employeeId}
                      </div>
                    </td>
                    <td className="table-td text-xs font-medium">
                      {leave.facultyId?.department?.name || <span className="text-slate-400 italic">None</span>}
                    </td>
                    <td className="table-td font-semibold capitalize text-xs">{leave.leaveType}</td>
                    <td className="table-td text-xs">
                      {new Date(leave.startDate).toLocaleDateString()} -{' '}
                      {new Date(leave.endDate).toLocaleDateString()}
                    </td>
                    <td className="table-td text-xs font-medium">{leave.totalDays} day(s)</td>
                    <td className="table-td">
                      <span
                        className={
                          leave.status === 'approved'
                            ? 'badge-approved'
                            : leave.status === 'rejected'
                            ? 'badge-rejected'
                            : 'badge-pending'
                        }
                      >
                        {leave.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
