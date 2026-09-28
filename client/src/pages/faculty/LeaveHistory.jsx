import React, { useState, useEffect } from 'react';
import api, { getFileUrl } from '../../services/api';
import { toast } from 'react-toastify';
import { FileText, Download, AlertCircle, ChevronLeft, ChevronRight, Eye, Upload } from 'lucide-react';

const LeaveHistory = () => {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [uploadingLeaveId, setUploadingLeaveId] = useState(null);
  const [certificateFile, setCertificateFile] = useState(null);

  useEffect(() => {
    const fetchLeaves = async () => {
      setLoading(true);
      try {
        let url = `/leaves?page=${page}&limit=8`;
        if (status) url += `&status=${status}`;
        if (leaveType) url += `&leaveType=${leaveType}`;

        const response = await api.get(url);
        if (response.data.success) {
          setLeaves(response.data.leaves);
          setTotalPages(response.data.totalPages || 1);
        }
      } catch (error) {
        console.error('Failed to load leaves history:', error);
        toast.error('Failed to load leave history');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaves();
  }, [page, status, leaveType]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const handleUploadSubmit = async (leaveId) => {
    if (!certificateFile) {
      toast.warning('Please select a certificate file first');
      return;
    }
    
    const formData = new FormData();
    formData.append('document', certificateFile);
    
    try {
      setUploadingLeaveId(leaveId);
      const response = await api.put(`/leaves/${leaveId}/certificate`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data.success) {
        toast.success('Certificate uploaded successfully');
        setCertificateFile(null);
        setLeaves(leaves.map(l => l._id === leaveId ? response.data.leave : l));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload certificate');
    } finally {
      setUploadingLeaveId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Leave History</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Track and review all your submitted leave applications
        </p>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm">
        <div className="flex-1 form-group mb-0">
          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Status</label>
          <select
            className="form-input text-xs py-1.5"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            disabled={loading}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="temporarily_approved">Temp. Approved</option>
            <option value="certificate_submitted">Cert. Submitted</option>
            <option value="certificate_rejected">Cert. Rejected</option>
          </select>
        </div>

        <div className="flex-1 form-group mb-0">
          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Leave Type</label>
          <select
            className="form-input text-xs py-1.5"
            value={leaveType}
            onChange={(e) => { setLeaveType(e.target.value); setPage(1); }}
            disabled={loading}
          >
            <option value="">All Types</option>
            <option value="casual">Casual Leave</option>
            <option value="restricted">Restricted Leave</option>
            <option value="earned">Earned Leave</option>
            <option value="ood">Official Duty (OOD)</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-10 bg-slate-200 dark:bg-gray-800 rounded"></div>
          <div className="h-10 bg-slate-200 dark:bg-gray-800 rounded"></div>
          <div className="h-10 bg-slate-200 dark:bg-gray-800 rounded"></div>
        </div>
      ) : leaves.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-450">
          <FileText size={48} className="stroke-[1.5] mb-2" />
          <p className="text-sm">No leave records match the filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="table-container">
            <table className="table-el">
              <thead>
                <tr>
                  <th className="table-th">Leave Type</th>
                  <th className="table-th">Duration</th>
                  <th className="table-th">Half</th>
                  <th className="table-th">Deduction</th>
                  <th className="table-th">Reason</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Reviewed By</th>
                  <th className="table-th text-right">Attachments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
                {leaves.map((leave) => (
                  <tr key={leave._id} className="table-tr">
                    <td className="table-td font-semibold capitalize">
                      {leave.leaveType}
                      {leave.isPaidLeave && (
                         <div className="text-[9px] text-red-500 font-bold uppercase mt-0.5">Paid Leave (Overdrawn)</div>
                      )}
                    </td>
                    {/* Duration column */}
                    <td className="table-td">
                      <div className="text-xs">
                        {new Date(leave.startDate).toLocaleDateString()}
                        {(!leave.duration || leave.duration === 'FULL_DAY') && (
                          <span className="ml-1 text-slate-400">–</span>
                        )}
                        {(!leave.duration || leave.duration === 'FULL_DAY') && (
                          <span className="ml-1">{new Date(leave.endDate).toLocaleDateString()}</span>
                        )}
                      </div>
                      <div className="mt-1">
                        {leave.duration === 'HALF_DAY' ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">
                            ½ Half Day
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Full Day
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Half column */}
                    <td className="table-td">
                      {leave.duration === 'HALF_DAY' && leave.halfDayType ? (
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          {leave.halfDayType === 'FIRST_HALF' ? 'First Half' : 'Second Half'}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">&mdash;</span>
                      )}
                    </td>
                    {/* Deduction column */}
                    <td className="table-td">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {leave.totalDays} day(s)
                      </div>
                      {leave.calendarDays && leave.calendarDays > leave.totalDays && leave.duration !== 'HALF_DAY' && (
                        <div 
                          className="text-[10px] text-slate-400 mt-1 cursor-help underline decoration-dotted" 
                          title={leave.excludedDates?.map(e => `${new Date(e.date).toLocaleDateString()} (${e.reason})`).join(' | ')}
                        >
                          {leave.calendarDays - leave.totalDays} holiday(s) excluded
                        </div>
                      )}
                    </td>
                    <td className="table-td max-w-xs truncate" title={leave.reason}>
                      {leave.reason}
                    </td>
                    <td className="table-td">
                      <span
                        className={
                          leave.status === 'approved'
                            ? 'badge-approved'
                            : leave.status === 'rejected' || leave.status === 'certificate_rejected'
                            ? 'badge-rejected'
                            : leave.status === 'temporarily_approved'
                            ? 'badge-pending !bg-amber-100 !text-amber-800'
                            : leave.status === 'certificate_submitted'
                            ? 'badge-pending !bg-blue-100 !text-blue-800'
                            : 'badge-pending'
                        }
                      >
                        {leave.status.replace('_', ' ')}
                      </span>
                      {(leave.status === 'rejected' || leave.status === 'certificate_rejected') && leave.rejectionReason && (
                        <div className="text-[10px] text-red-650 mt-1 max-w-[180px] truncate" title={leave.rejectionReason}>
                          Reason: {leave.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td className="table-td text-xs">
                      {leave.approvedBy ? (
                        <div>
                          <p className="font-semibold">{leave.approvedBy.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase">{leave.approvedBy.role}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unprocessed</span>
                      )}
                    </td>
                    <td className="table-td text-right">
                      {leave.documents && (
                        <a
                          href={getFileUrl(leave.documents)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex p-1.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-200 dark:hover:bg-gray-600 rounded-lg transition-colors mb-1"
                          title="View supporting document"
                        >
                          <Eye size={16} />
                        </a>
                      )}
                      {leave.certificateDocument && (
                        <a
                          href={getFileUrl(leave.certificateDocument)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex p-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg transition-colors ml-1 mb-1"
                          title="View uploaded certificate"
                        >
                          <FileText size={16} />
                        </a>
                      )}
                      
                      {(leave.status === 'temporarily_approved' || leave.status === 'certificate_rejected') && leave.leaveType === 'ood' ? (
                        <div className="mt-1 flex flex-col items-end gap-1">
                           <input 
                             type="file" 
                             accept=".png,.jpg,.jpeg,.pdf" 
                             className="text-[10px] w-36 block border border-slate-200 dark:border-slate-700 rounded"
                             onChange={(e) => setCertificateFile(e.target.files[0])}
                           />
                           <button 
                             onClick={() => handleUploadSubmit(leave._id)}
                             disabled={uploadingLeaveId === leave._id}
                             className="btn-primary py-1 px-2 text-[10px] gap-1 mt-1"
                           >
                             <Upload size={12} />
                             {uploadingLeaveId === leave._id ? 'Uploading...' : 'Upload Cert'}
                           </button>
                        </div>
                      ) : !leave.documents && !leave.certificateDocument ? (
                        <span className="text-xs text-slate-400 italic">None</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white dark:bg-gray-800 px-4 py-3 rounded-xl border border-slate-100 dark:border-gray-700 shadow-sm">
              <span className="text-xs text-slate-500 dark:text-slate-450">
                Page <strong>{page}</strong> of <strong>{totalPages}</strong>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1 || loading}
                  className="btn-secondary px-3 py-1.5 gap-1.5"
                >
                  <ChevronLeft size={16} />
                  <span className="hidden sm:inline">Prev</span>
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages || loading}
                  className="btn-secondary px-3 py-1.5 gap-1.5"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LeaveHistory;
