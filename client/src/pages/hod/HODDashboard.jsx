import React, { useState, useEffect } from 'react';
import api, { getFileUrl } from '../../services/api';
import { toast } from 'react-toastify';
import { Check, X, FileText, Download, Calendar, Users, FileCheck, Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const HODDashboard = () => {
  const { user } = useAuth();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, deptSize: 0, activeToday: 0 });

  // Pagination state (IMP-04)
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 20;

  // Modal states for rejection
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchDashboardData = async (currentPage = 1, append = false) => {
    try {
      // Batch: fetch paginated actionable leaves and approved-today count in parallel.
      const batchedStatusParam = 'pending,certificate_submitted,temporarily_approved';

      const requests = [
        api.get(`/leaves?status=${batchedStatusParam}&page=${currentPage}&limit=${PAGE_SIZE}`),
        api.get(`/leaves?status=approved&activeToday=true&limit=1`),
      ];

      if (user?.department) {
        requests.push(api.get(`/departments/${user.department._id}`));
      }

      const [leavesRes, activeTodayRes, deptRes] = await Promise.all(requests);

      if (leavesRes.data.success) {
        const newLeaves = leavesRes.data.leaves;
        setPendingRequests((prev) => (append ? [...prev, ...newLeaves] : newLeaves));

        // Determine if there are more pages
        const totalPages = leavesRes.data.totalPages || 1;
        setHasMore(currentPage < totalPages);

        // Count only truly "pending" and "certificate_submitted" for the stat badge
        const totalPending = leavesRes.data.leaves.filter(
          (l) => l.status === 'pending' || l.status === 'certificate_submitted'
        ).length;
        if (!append) {
          setStats((prev) => ({ ...prev, pending: totalPending }));
        }
      }

      if (!append) {
        const activeToday = activeTodayRes?.data?.success ? activeTodayRes.data.totalLeaves : 0;
        const deptSize = deptRes?.data?.success ? deptRes.data.department?.facultyList?.length || 0 : 0;
        setStats((prev) => ({ ...prev, activeToday, deptSize }));
      }
    } catch (error) {
      console.error('Failed to load HOD dashboard data:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = async () => {
    const nextPage = page + 1;
    setPage(nextPage);
    setLoadingMore(true);
    await fetchDashboardData(nextPage, true);
  };


  useEffect(() => {
    setPage(1);
    fetchDashboardData(1, false);
  }, [user?._id]);

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
        // Reset to page 1 after any review action
        setPage(1);
        await fetchDashboardData(1, false);
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
                    <td className="table-td font-medium capitalize">
                      {leave.leaveType}
                      {leave.status === 'certificate_submitted' && (
                         <div className="text-[9px] text-blue-500 font-bold uppercase mt-0.5">Cert Review</div>
                      )}
                      {leave.status === 'temporarily_approved' && (
                         <div className="text-[9px] text-amber-500 font-bold uppercase mt-0.5">Awaiting Cert</div>
                      )}
                      {leave.isPaidLeave && (
                         <div className="text-[9px] text-amber-600 font-bold uppercase mt-0.5 flex items-center gap-0.5">
                           ⚠️ Paid Leave (CL Overdrawn)
                         </div>
                      )}
                    </td>
                    <td className="table-td">
                      <div className="text-xs">
                        {new Date(leave.startDate).toLocaleDateString()}
                        {(!leave.duration || leave.duration === 'FULL_DAY') && (
                          <> – {new Date(leave.endDate).toLocaleDateString()}</>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {leave.duration === 'HALF_DAY' ? (
                          <span className="text-indigo-500 dark:text-indigo-400 font-semibold">
                            Half Day
                            {leave.halfDayType && (
                              <> &mdash; {leave.halfDayType === 'FIRST_HALF' ? 'First Half' : 'Second Half'}</>
                            )}
                            {' '}&mdash; 0.5 day
                          </span>
                        ) : (
                          <>({leave.totalDays} day(s))</>
                        )}
                      </div>
                      {leave.calendarDays && leave.calendarDays > leave.totalDays && leave.duration !== 'HALF_DAY' && (
                        <div 
                          className="text-[10px] text-slate-400 mt-0.5 cursor-help underline decoration-dotted" 
                          title={leave.excludedDates?.map(e => `${new Date(e.date).toLocaleDateString()} (${e.reason})`).join(' | ')}
                        >
                          ({leave.calendarDays - leave.totalDays} holiday(s) excluded)
                        </div>
                      )}
                    </td>
                    <td className="table-td max-w-xs truncate" title={leave.reason}>
                      {leave.reason}
                    </td>
                    <td className="table-td text-center">
                      <div className="flex justify-center gap-1">
                        {leave.documents && (
                          <a
                            href={getFileUrl(leave.documents)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex p-1.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:text-primary-600 rounded-lg"
                            title="Initial Document"
                          >
                            <Eye size={14} />
                          </a>
                        )}
                        {leave.certificateDocument && (
                          <a
                            href={getFileUrl(leave.certificateDocument)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex p-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:text-blue-700 rounded-lg"
                            title="Uploaded Certificate"
                          >
                            <FileText size={14} />
                          </a>
                        )}
                        {!leave.documents && !leave.certificateDocument && (
                          <span className="text-[10px] text-slate-400 italic">None</span>
                        )}
                      </div>
                    </td>
                    <td className="table-td text-right">
                      <div className="flex justify-end gap-2">
                        {leave.leaveType === 'ood' && leave.status === 'pending' ? (
                           <>
                             <button
                               onClick={() => handleReview(leave._id, 'temporarily_approved')}
                               disabled={submittingReview}
                               className="p-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-lg transition-colors text-[10px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                               title="Temporarily Approve"
                             >
                               Temp Approve
                             </button>
                             <button
                               onClick={() => setRejectingRequest(leave)}
                               disabled={submittingReview}
                               className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 text-red-650 dark:text-red-400 rounded-lg transition-colors text-[10px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                               title="Reject Leave"
                             >
                               Reject
                             </button>
                           </>
                         ) : leave.leaveType === 'ood' && leave.status === 'certificate_submitted' ? (
                           <>
                             <button
                               onClick={() => handleReview(leave._id, 'approved')}
                               disabled={submittingReview}
                               className="p-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors text-[10px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                               title="Verify and Approve"
                             >
                               Verify & Approve
                             </button>
                             <button
                               onClick={() => setRejectingRequest({ ...leave, isCertReject: true })}
                               disabled={submittingReview}
                               className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 text-red-650 dark:text-red-400 rounded-lg transition-colors text-[10px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                               title="Reject Certificate"
                             >
                               Reject Cert
                             </button>
                           </>
                        ) : leave.status === 'temporarily_approved' ? (
                           <span className="text-[10px] text-slate-400 font-medium italic pr-2">
                             Awaiting Faculty
                           </span>
                        ) : (
                           <>
                             <button
                               onClick={() => handleReview(leave._id, 'approved')}
                               disabled={submittingReview}
                               className="p-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                               title="Approve Leave"
                             >
                               <Check size={16} />
                             </button>
                             <button
                               onClick={() => setRejectingRequest(leave)}
                               disabled={submittingReview}
                               className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 text-red-650 dark:text-red-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                               title="Reject Leave"
                             >
                               <X size={16} />
                             </button>
                           </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Load More (IMP-04 pagination) */}
        {hasMore && (
          <div className="mt-4 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="btn-secondary py-1.5 px-6 text-sm disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>

      {/* Rejection Reason Modal */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs px-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-150 dark:border-gray-700 overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-red-600 text-white flex justify-between items-center">
              <h3 className="font-bold">{rejectingRequest.isCertReject ? 'Reject Duty Certificate' : 'Reject Leave Application'}</h3>
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
                  onClick={() => handleReview(rejectingRequest._id, rejectingRequest.isCertReject ? 'certificate_rejected' : 'rejected', rejectionReason)}
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
