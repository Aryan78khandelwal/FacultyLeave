import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { Check, X, FileText, Download, Calendar, Users, FileCheck, Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const HODDashboard = () => {
  const { user } = useAuth();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, deptSize: 0, activeToday: 0 });

  // Modal states for rejection
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchDashboardData = async () => {
    try {
      // 1. Fetch pending requests
      const response = await api.get('/leaves?status=pending');
      if (response.data.success) {
        setPendingRequests(response.data.leaves);
      }

      // 2. Fetch department details for size
      if (user?.department) {
        const deptResponse = await api.get(`/departments/${user.department._id}`);
        if (deptResponse.data.success) {
          const dept = deptResponse.data.department;
          
          // Check how many are active on leave today
          const today = new Date().toISOString().split('T')[0];
          const approvedLeavesResponse = await api.get('/leaves?status=approved');
          let activeToday = 0;
          if (approvedLeavesResponse.data.success) {
            approvedLeavesResponse.data.leaves.forEach((leave) => {
              const start = new Date(leave.startDate).toISOString().split('T')[0];
              const end = new Date(leave.endDate).toISOString().split('T')[0];
              if (today >= start && today <= end) {
                activeToday += 1;
              }
            });
          }

          setStats({
            pending: response.data.totalLeaves || 0,
            deptSize: dept.facultyList?.length || 0,
            activeToday,
          });
        }
      }
    } catch (error) {
      console.error('Failed to load HOD dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  const handleReview = async (id, status, reason = '') => {
    if (status === 'rejected' && !reason) {
      toast.warning('Please specify a rejection reason');
      return;
    }

    setSubmittingReview(true);
    try {
      const response = await api.put(`/leaves/${id}/review`, {
        status,
        rejectionReason: reason,
      });

      if (response.data.success) {
        toast.success(`Leave request ${status} successfully`);
        setRejectingRequest(null);
        setRejectionReason('');
        await fetchDashboardData();
      }
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || 'Failed to review leave request';
      toast.error(msg);
    } finally {
      setSubmittingReview(false);
    }
  };

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
      {/* Department Banner */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">
          {user?.department?.name || 'Department'} Administration
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          HOD: {user?.name} • Manage faculty leaves, reviews, and allocations
        </p>
      </div>

      {/* Metrics Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-metric border-l-4 border-l-amber-500">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">Pending Reviews</h4>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">{stats.pending}</span>
            <span className="text-xs text-slate-400">applications</span>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <FileText size={14} />
            <span>Requires prompt action</span>
          </div>
        </div>

        <div className="card-metric border-l-4 border-l-primary-500">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Faculty</h4>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">{stats.deptSize}</span>
            <span className="text-xs text-slate-400">members registered</span>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400">
            <Users size={14} />
            <span>Active department strength</span>
          </div>
        </div>

        <div className="card-metric border-l-4 border-l-emerald-500">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">On Leave Today</h4>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">{stats.activeToday}</span>
            <span className="text-xs text-slate-400">faculty off</span>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Calendar size={14} />
            <span>Check Calendar to view coverages</span>
          </div>
        </div>
      </div>

      {/* Pending Leave Requests Table */}
      <div className="card">
        <h3 className="font-bold text-slate-800 dark:text-white mb-4">Pending Leave Applications</h3>
        
        {pendingRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-450">
            <FileCheck size={48} className="stroke-[1.5] mb-2 text-emerald-500" />
            <p className="text-sm font-medium text-slate-655 dark:text-slate-400">All caught up! No pending leaves to review.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table-el">
              <thead>
                <tr>
                  <th className="table-th">Faculty Member</th>
                  <th className="table-th">Leave Type</th>
                  <th className="table-th">Duration</th>
                  <th className="table-th">Reason</th>
                  <th className="table-th text-center">Docs</th>
                  <th className="table-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
                {pendingRequests.map((leave) => (
                  <tr key={leave._id} className="table-tr">
                    <td className="table-td">
                      <div className="font-semibold text-slate-800 dark:text-white">
                        {leave.facultyId?.name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {leave.facultyId?.designation} • ID: {leave.facultyId?.employeeId}
                      </div>
                    </td>
                    <td className="table-td font-medium capitalize">{leave.leaveType}</td>
                    <td className="table-td">
                      <div className="text-xs">
                        {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">({leave.totalDays} day(s))</div>
                    </td>
                    <td className="table-td max-w-xs truncate" title={leave.reason}>
                      {leave.reason}
                    </td>
                    <td className="table-td text-center">
                      {leave.documents ? (
                        <a
                          href={`http://localhost:5000${leave.documents}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex p-1.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:text-primary-600 rounded-lg"
                        >
                          <Eye size={14} />
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">None</span>
                      )}
                    </td>
                    <td className="table-td text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleReview(leave._id, 'approved')}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors"
                          title="Approve Leave"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => setRejectingRequest(leave)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-650 dark:text-red-400 rounded-lg transition-colors"
                          title="Reject Leave"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rejection Reason Modal */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs px-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-150 dark:border-gray-700 overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-red-600 text-white flex justify-between items-center">
              <h3 className="font-bold">Reject Leave Application</h3>
              <button onClick={() => setRejectingRequest(null)} className="text-white hover:text-red-200">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">Faculty Member</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5">
                  {rejectingRequest.facultyId?.name}
                </p>
              </div>
              
              <div className="form-group">
                <label className="form-label">Rejection Reason</label>
                <textarea
                  required
                  rows="3"
                  className="form-input text-sm"
                  placeholder="Provide comments on why this request is declined..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingRequest(null)}
                  className="btn-secondary py-1.5"
                  disabled={submittingReview}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReview(rejectingRequest._id, 'rejected', rejectionReason)}
                  className="btn-danger py-1.5"
                  disabled={submittingReview}
                >
                  {submittingReview ? 'Declining...' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HODDashboard;
