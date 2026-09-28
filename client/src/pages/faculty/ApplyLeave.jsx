import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FileText, Calendar, Upload, ArrowLeft, AlertTriangle } from 'lucide-react';

const ApplyLeave = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [leaveType, setLeaveType] = useState('casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [document, setDocument] = useState(null);
  const [totalDays, setTotalDays] = useState(0);
  const [calendarDays, setCalendarDays] = useState(0);
  const [excludedDates, setExcludedDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState('FULL_DAY');
  const [halfDayType, setHalfDayType] = useState('FIRST_HALF');
  // IMP-08: Synchronous guard to prevent double-submit before React re-renders
  const isSubmitting = useRef(false);

  // Only CL and EL support half-day
  const supportsHalfDay = ['casual', 'earned'].includes(leaveType);

  const calculateLeaveDays = (start, end) => {
    const sDate = new Date(start);
    const eDate = new Date(end);
    sDate.setHours(0, 0, 0, 0);
    eDate.setHours(0, 0, 0, 0);

    let calDays = 0;
    let lvDays = 0;
    const exDates = [];

    const currentDate = new Date(sDate);
    while (currentDate <= eDate) {
      calDays++;
      const dayOfWeek = currentDate.getDay(); // 0 is Sunday, 6 is Saturday

      if (dayOfWeek === 0) {
        exDates.push({ date: new Date(currentDate), reason: 'Sunday' });
      } else if (dayOfWeek === 6) {
        const weekOfMonth = Math.ceil(currentDate.getDate() / 7);
        if (weekOfMonth === 1) {
          exDates.push({ date: new Date(currentDate), reason: '1st Saturday' });
        } else if (weekOfMonth === 3) {
          exDates.push({ date: new Date(currentDate), reason: '3rd Saturday' });
        } else {
          lvDays++;
        }
      } else {
        lvDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return { calendarDays: calDays, leaveDays: lvDays, excludedDates: exDates };
  };

  // Auto calculate total days when dates change
  useEffect(() => {
    if (duration === 'HALF_DAY') {
      // For half-day: preview 0.5 if a start date is selected
      if (startDate) {
        setTotalDays(0.5);
        setCalendarDays(1);
        setExcludedDates([]);
      } else {
        setTotalDays(0);
        setCalendarDays(0);
        setExcludedDates([]);
      }
      return;
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (start <= end) {
        const result = calculateLeaveDays(startDate, endDate);
        setTotalDays(result.leaveDays);
        setCalendarDays(result.calendarDays);
        setExcludedDates(result.excludedDates);
      } else {
        setTotalDays(0);
        setCalendarDays(0);
        setExcludedDates([]);
      }
    } else {
      setTotalDays(0);
      setCalendarDays(0);
      setExcludedDates([]);
    }
  }, [startDate, endDate, duration]);

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setDocument(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // IMP-08: Synchronous lock — prevents double-submit before loading state re-renders
    if (isSubmitting.current) return;
    isSubmitting.current = true;

    if (!startDate || !reason) {
      toast.warning('Please fill in all required fields');
      isSubmitting.current = false;
      return;
    }

    // For full-day, endDate is also required
    if (duration === 'FULL_DAY' && !endDate) {
      toast.warning('Please fill in all required fields');
      isSubmitting.current = false;
      return;
    }

    // For half-day: validate halfDayType
    if (duration === 'HALF_DAY' && !halfDayType) {
      toast.warning('Please select First Half or Second Half');
      isSubmitting.current = false;
      return;
    }

    // Half-day is only for CL and EL (front-end guard; backend also enforces)
    if (duration === 'HALF_DAY' && !['casual', 'earned'].includes(leaveType)) {
      toast.error('Half-day leave is only allowed for Casual Leave and Earned Leave.');
      isSubmitting.current = false;
      return;
    }

    const effectiveEndDate = duration === 'HALF_DAY' ? startDate : endDate;

    if (new Date(startDate) > new Date(effectiveEndDate)) {
      toast.error('Start date cannot be after end date');
      isSubmitting.current = false;
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    if (start < today) {
      toast.error('Start date cannot be in the past');
      isSubmitting.current = false;
      return;
    }

    if (leaveType === 'restricted' && user?.restrictedLeaveEnabled === false) {
      toast.error('Restricted leave is disabled for your account.');
      isSubmitting.current = false;
      return;
    }
    if (leaveType === 'vacation' && user?.vacationLeaveEnabled === false) {
      toast.error('Vacation leave is disabled for your account.');
      isSubmitting.current = false;
      return;
    }
    if (leaveType === 'earned' && user?.earnedLeaveEnabled === false) {
      toast.error('Earned leave is disabled for your account.');
      isSubmitting.current = false;
      return;
    }
    if (leaveType === 'ood' && user?.oodLeaveEnabled === false) {
      toast.error('OOD leave is disabled for your account.');
      isSubmitting.current = false;
      return;
    }

    // Synchronously calculate days to avoid state lag
    let calculatedDays = 0;
    if (duration === 'HALF_DAY') {
      calculatedDays = 0.5;
    } else {
      const end = new Date(effectiveEndDate);
      if (start <= end) {
        calculatedDays = calculateLeaveDays(startDate, effectiveEndDate).leaveDays;
      }
    }

    if (calculatedDays === 0) {
      toast.error('Selected date range contains only holidays. Leave days cannot be 0.');
      isSubmitting.current = false;
      return;
    }

    let availableBalance = user?.leaveBalance?.[leaveType];
    if (availableBalance === undefined) {
      if (leaveType === 'vacation') availableBalance = 11;
      else if (leaveType === 'casual') availableBalance = 12;
      else if (leaveType === 'restricted') availableBalance = 10;
      else if (leaveType === 'earned') availableBalance = 15;
      else if (leaveType === 'ood') availableBalance = 10;
      else availableBalance = 0;
    }

    if (calculatedDays > availableBalance) {
      if (leaveType === 'casual') {
        const confirmMsg = "You have no CL remaining. If you continue, this leave will be treated as Paid Leave and your CL balance will go into negative.";
        if (!window.confirm(confirmMsg)) {
          isSubmitting.current = false;
          return;
        }
      } else {
        toast.error(`Insufficient balance. You requested ${calculatedDays} days but only have ${availableBalance} days left.`);
        isSubmitting.current = false;
        return;
      }
    }

    setLoading(true);

    // Use FormData for file upload support
    const formData = new FormData();
    formData.append('leaveType', leaveType);
    formData.append('startDate', startDate);
    formData.append('endDate', effectiveEndDate);
    formData.append('reason', reason);
    formData.append('duration', duration);
    if (duration === 'HALF_DAY') {
      formData.append('halfDayType', halfDayType);
    }
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
      isSubmitting.current = false;
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
          {leaveType === 'casual' && (user?.leaveBalance?.casual || 0) <= 0 && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg flex items-start gap-3">
              <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
              <div className="text-sm text-amber-700 dark:text-amber-400">
                <strong>Your CL balance has been exhausted.</strong> Any further CL application will be treated as Paid Leave.
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Leave Type */}
              <div className="form-group">
                <label className="form-label">Leave Type</label>
                <select
                  className="form-input"
                  value={leaveType}
                  onChange={(e) => {
                    setLeaveType(e.target.value);
                    // Reset to full-day when switching to a type that doesn't support half-day
                    if (!['casual', 'earned'].includes(e.target.value)) {
                      setDuration('FULL_DAY');
                    }
                  }}
                  disabled={loading}
                >
                  <option value="casual">Casual Leave ({user?.leaveBalance?.casual !== undefined ? user.leaveBalance.casual : 12} left)</option>
                  <option value="restricted" disabled={user?.restrictedLeaveEnabled === false}>
                    {user?.restrictedLeaveEnabled === false
                      ? 'Restricted Leave (Disabled)'
                      : `Restricted Leave (${user?.leaveBalance?.restricted !== undefined ? user.leaveBalance.restricted : 10} left)`}
                  </option>
                  <option value="earned" disabled={user?.earnedLeaveEnabled === false}>
                    {user?.earnedLeaveEnabled === false
                      ? 'Earned Leave (Disabled)'
                      : `Earned Leave (${user?.leaveBalance?.earned !== undefined ? user.leaveBalance.earned : 15} left)`}
                  </option>
                  <option value="ood" disabled={user?.oodLeaveEnabled === false}>
                    {user?.oodLeaveEnabled === false
                      ? 'Official Duty Leave (Disabled)'
                      : `Official Duty Leave (OOD) (${user?.leaveBalance?.ood !== undefined ? user.leaveBalance.ood : 10} left)`}
                  </option>
                  {['Faculty', 'Instructor', 'SDA'].includes(user?.role) && (
                    <option value="vacation" disabled={user?.vacationLeaveEnabled === false}>
                      {user?.vacationLeaveEnabled === false
                        ? 'Vacation Leave (Disabled)'
                        : `Vacation Leave (${user?.leaveBalance?.vacation !== undefined ? user.leaveBalance.vacation : 11} left)`}
                    </option>
                  )}
                </select>
              </div>

              {/* Day count preview (interactive) */}
              <div className="flex flex-col gap-2 mt-6">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-gray-800/50 border border-slate-200 dark:border-slate-700/80 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-200/50 dark:bg-gray-700/50 text-slate-600 dark:text-slate-300 rounded-lg">
                      <Calendar size={18} />
                    </div>
                    <div className="text-left">
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">Leave Days</span>
                      <p className="text-base font-bold text-primary-600 dark:text-primary-400">
                        {totalDays} {totalDays === 1 ? 'Day' : 'Days'}
                      </p>
                    </div>
                  </div>
                  {calendarDays > 0 && duration !== 'HALF_DAY' && (
                    <div className="text-right">
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">Calendar Days</span>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{calendarDays}</p>
                    </div>
                  )}
                  {duration === 'HALF_DAY' && (
                    <div className="text-right">
                      <span className="block text-[10px] text-indigo-400 dark:text-indigo-400 uppercase font-bold tracking-wider">Half Day</span>
                      <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                        {halfDayType === 'FIRST_HALF' ? 'First Half' : 'Second Half'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Leave Duration Toggle — only for CL and EL */}
            {supportsHalfDay && (
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 rounded-lg">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-3">Leave Duration</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="duration"
                      value="FULL_DAY"
                      checked={duration === 'FULL_DAY'}
                      onChange={() => setDuration('FULL_DAY')}
                      disabled={loading}
                      className="accent-primary-600"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Day</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="duration"
                      value="HALF_DAY"
                      checked={duration === 'HALF_DAY'}
                      onChange={() => setDuration('HALF_DAY')}
                      disabled={loading}
                      className="accent-primary-600"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Half Day</span>
                  </label>
                </div>

                {/* Half-day type selector */}
                {duration === 'HALF_DAY' && (
                  <div className="mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-800/40">
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">Select Half</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="halfDayType"
                          value="FIRST_HALF"
                          checked={halfDayType === 'FIRST_HALF'}
                          onChange={() => setHalfDayType('FIRST_HALF')}
                          disabled={loading}
                          className="accent-indigo-600"
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">First Half (AM)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="halfDayType"
                          value="SECOND_HALF"
                          checked={halfDayType === 'SECOND_HALF'}
                          onChange={() => setHalfDayType('SECOND_HALF')}
                          disabled={loading}
                          className="accent-indigo-600"
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Second Half (PM)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Breakdown UI */}
            {excludedDates.length > 0 && (
              <div className="p-4 bg-slate-50 dark:bg-gray-800/50 border border-slate-200 dark:border-slate-700/80 rounded-lg text-sm text-slate-600 dark:text-slate-400">
                <div className="font-semibold mb-2">Excluded Holidays ({excludedDates.length}):</div>
                <ul className="list-disc pl-5 space-y-1">
                  {excludedDates.map((exc, index) => (
                    <li key={index}>
                      {new Date(exc.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} &rarr; {exc.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Start Date */}
              <div className="form-group">
                <label className="form-label">
                  {duration === 'HALF_DAY' ? 'Date' : 'Start Date'}
                </label>
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

              {/* End Date — hidden for half-day */}
              {duration !== 'HALF_DAY' && (
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
              )}
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
              <li>A supporting document (medical certificate, official letter) is required for restricted leaves exceeding 2 consecutive days.</li>
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
