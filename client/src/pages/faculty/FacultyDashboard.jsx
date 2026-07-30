import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { FileText, Calendar, PlusCircle, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

const FacultyDashboard = () => {
  const { user } = useAuth();
  const [recentLeaves, setRecentLeaves] = useState([]);
  const [stats, setStats] = useState({ approved: 0, pending: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch recent leaves
        const leavesResponse = await api.get('/leaves?limit=5');
        if (leavesResponse.data.success) {
          setRecentLeaves(leavesResponse.data.leaves);
        }

        // Fetch analytics
        const analyticsResponse = await api.get('/leaves/analytics');
        if (analyticsResponse.data.success) {
          const statusStats = analyticsResponse.data.stats.statusStats || [];
          let approved = 0, pending = 0, rejected = 0;
          
          statusStats.forEach((stat) => {
            if (stat._id === 'approved') approved = stat.count;
            if (stat._id === 'pending') pending = stat.count;
            if (stat._id === 'rejected') rejected = stat.count;
          });

          setStats({ approved, pending, rejected });
        }
      } catch (error) {
        console.error('Failed to load faculty dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
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
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            Welcome back, {user?.name}!
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {user?.designation} • Employee ID: {user?.employeeId}
          </p>
        </div>
        <Link to="/faculty/apply" className="btn-primary gap-2 self-start sm:self-auto">
          <PlusCircle size={18} />
          <span>Apply for Leave</span>
        </Link>
      </div>

      {/* Leave Balance Section */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
          My Leave Balances
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Casual Leave */}
          <div className="card-metric border-l-4 border-l-primary-500">
            <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">Casual Leave</h4>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-slate-800 dark:text-white">
                {user?.leaveBalance?.casual || 0}
              </span>
              <span className="text-xs text-slate-400">days available</span>
            </div>
            <div className="mt-4 text-xs text-slate-400 bg-primary-50/50 dark:bg-primary-950/10 p-2 rounded">
              Ideal for short personal emergencies
            </div>
          </div>

          {/* Sick Leave */}
          <div className="card-metric border-l-4 border-l-red-500">
            <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">Sick Leave</h4>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-slate-800 dark:text-white">
                {user?.leaveBalance?.sick || 0}
              </span>
              <span className="text-xs text-slate-400">days available</span>
            </div>
            <div className="mt-4 text-xs text-slate-400 bg-red-50/50 dark:bg-red-950/10 p-2 rounded">
              Medical emergency or health concerns
            </div>
          </div>

          {/* Earned Leave */}
          <div className="card-metric border-l-4 border-l-emerald-500">
            <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">Earned Leave</h4>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-slate-800 dark:text-white">
                {user?.leaveBalance?.earned || 0}
              </span>
              <span className="text-xs text-slate-400">days available</span>
            </div>
            <div className="mt-4 text-xs text-slate-400 bg-emerald-50/50 dark:bg-emerald-950/10 p-2 rounded">
              Accumulated leaves for scheduled breaks
            </div>
          </div>
        </div>
      </div>

      {/* Stats and Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Counters */}
        <div className="card flex flex-col justify-between">
          <h3 className="font-bold text-slate-800 dark:text-white mb-4">Application Summary</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <CheckCircle size={18} />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-355">Approved Requests</span>
              </div>
              <span className="text-lg font-bold text-slate-800 dark:text-white">{stats.approved}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-lg">
                  <Clock size={18} />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-355">Pending Review</span>
              </div>
              <span className="text-lg font-bold text-slate-800 dark:text-white">{stats.pending}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-lg">
                  <AlertTriangle size={18} />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-355">Declined Requests</span>
              </div>
              <span className="text-lg font-bold text-slate-800 dark:text-white">{stats.rejected}</span>
            </div>
          </div>
          <div className="mt-6 text-center">
            <Link to="/faculty/history" className="text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400">
              View Complete History →
            </Link>
          </div>
        </div>

        {/* Recent Leave Requests */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 dark:text-white">Recent Leave Requests</h3>
            <Link to="/faculty/calendar" className="text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400 flex items-center gap-1">
              <Calendar size={14} />
              <span>Full Calendar View</span>
            </Link>
          </div>

          {recentLeaves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <FileText size={48} className="stroke-[1.5] mb-2" />
              <p className="text-sm">No leave applications found.</p>
              <Link to="/faculty/apply" className="text-xs font-semibold text-primary-600 dark:text-primary-400 mt-1 hover:underline">
                Submit your first application
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-gray-700 text-slate-400 font-medium">
                    <th className="py-2.5">Leave Type</th>
                    <th className="py-2.5">Dates</th>
                    <th className="py-2.5">Days</th>
                    <th className="py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
                  {recentLeaves.map((leave) => (
                    <tr key={leave._id} className="text-slate-600 dark:text-slate-350">
                      <td className="py-3 font-semibold capitalize">{leave.leaveType}</td>
                      <td className="py-3">
                        {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                      </td>
                      <td className="py-3">{leave.totalDays}</td>
                      <td className="py-3">
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
    </div>
  );
};

export default FacultyDashboard;
