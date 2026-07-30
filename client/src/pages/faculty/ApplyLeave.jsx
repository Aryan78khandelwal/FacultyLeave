import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FileText, Calendar, Upload, ArrowLeft } from 'lucide-react';

const ApplyLeave = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [leaveType, setLeaveType] = useState('casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [document, setDocument] = useState(null);
  const [totalDays, setTotalDays] = useState(0);
  const [loading, setLoading] = useState(false);

  // Auto calculate total days when dates change
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (start <= end) {
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        setTotalDays(diffDays);
      } else {
        setTotalDays(0);
      }
    } else {
      setTotalDays(0);
    }
  }, [startDate, endDate]);

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setDocument(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!startDate || !endDate || !reason) {
      toast.warning('Please fill in all required fields');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      toast.error('Start date cannot be after end date');
      return;
    }

    const availableBalance = user?.leaveBalance?.[leaveType] || 0;
    if (totalDays > availableBalance) {
      toast.error(`Insufficient balance. You requested ${totalDays} days but only have ${availableBalance} days left.`);
      return;
    }

    setLoading(true);

    // Use FormData for file upload support
    const formData = new FormData();
    formData.append('leaveType', leaveType);
    formData.append('startDate', startDate);
    formData.append('endDate', endDate);
    formData.append('reason', reason);
    if (document) {
      formData.append('document', document);
    }

    try {
      const response = await api.post('/leaves', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        toast.success('Leave application submitted successfully!');
        await refreshUser(); // Update balance in Auth Context
        navigate('/faculty/history');
      }
    } catch (error) {
      console.error(error);
      let msg = 'Failed to submit leave application';
      if (error.response?.data?.errors && error.response.data.errors.length > 0) {
        msg = error.response.data.errors.map((err) => err.msg).join(', ');
      } else if (error.response?.data?.message) {
        msg = error.response.data.message;
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Apply for Leave</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Submit a new leave request for department review
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Application Form */}
        <div className="lg:col-span-2 card">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Leave Type */}
              <div className="form-group">
                <label className="form-label">Leave Type</label>
                <select
                  className="form-input"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  disabled={loading}
                >
                  <option value="casual">Casual Leave ({user?.leaveBalance?.casual || 0} left)</option>
                  <option value="sick">Sick Leave ({user?.leaveBalance?.sick || 0} left)</option>
                  <option value="earned">Earned Leave ({user?.leaveBalance?.earned || 0} left)</option>
                </select>
              </div>

              {/* Day count preview (interactive) */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-gray-800/50 border border-slate-200 dark:border-slate-700/80 rounded-lg mt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-200/50 dark:bg-gray-700/50 text-slate-600 dark:text-slate-300 rounded-lg">
                    <Calendar size={18} />
                  </div>
                  <div className="text-left">
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">Total Duration</span>
                    <p className="text-base font-bold text-slate-800 dark:text-white">
                      {totalDays} {totalDays === 1 ? 'Day' : 'Days'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Start Date */}
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Calendar size={16} />
                  </span>
                  <input
                    type="date"
                    required
                    className="form-input pl-10"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              {/* End Date */}
              <div className="form-group">
                <label className="form-label">End Date</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Calendar size={16} />
                  </span>
                  <input
                    type="date"
                    required
                    className="form-input pl-10"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* Reason */}
            <div className="form-group">
              <label className="form-label">Reason for Leave</label>
              <textarea
                required
                rows="4"
                className="form-input"
                placeholder="Please state the reason for leave in detail..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={loading}
                minLength={5}
              />
            </div>

            {/* Document upload (optional) */}
            <div className="form-group">
              <label className="form-label">Supporting Document (Optional)</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-200 dark:border-gray-700 border-dashed rounded-lg hover:border-primary-400 transition-colors">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-12 w-12 text-slate-400" />
                  <div className="flex text-sm text-slate-600 dark:text-slate-450">
                    <label className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-primary-600 dark:text-primary-400 hover:text-primary-500 focus-within:outline-none">
                      <span>Upload a file</span>
                      <input
                        type="file"
                        className="sr-only"
                        accept=".png,.jpg,.jpeg,.pdf"
                        onChange={handleFileChange}
                        disabled={loading}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-slate-400">PDF, PNG, JPG, JPEG up to 5MB</p>
                  {document && (
                    <div className="mt-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-xs">
                      Selected: {document.name}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 gap-2">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <FileText size={18} />
                  <span>Submit Application</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Info Card / Balances list */}
        <div className="space-y-6">
          <div className="card bg-slate-50 dark:bg-gray-800">
            <h3 className="font-bold text-slate-800 dark:text-white mb-4">Guidelines</h3>
            <ul className="text-xs space-y-3 text-slate-500 dark:text-slate-400 list-disc pl-4">
              <li>Leave applications should be submitted at least 3 days prior to scheduled dates except for medical emergencies.</li>
              <li>Calculated days represent academic calendar days (inclusive of weekends/holidays if leave wraps them).</li>
              <li>A supporting document (medical certificate, official letter) is required for sick leaves exceeding 2 consecutive days.</li>
              <li>Upon submission, the HOD of your department receives an email notification to approve or reject.</li>
              <li>If approved, the leave duration is automatically deducted from your balances. If rejected, you will be notified with comments.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApplyLeave;
