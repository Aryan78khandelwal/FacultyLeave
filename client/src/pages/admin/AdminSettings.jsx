import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Settings, Save, ShieldAlert, RotateCcw } from 'lucide-react';

const AdminSettings = () => {
  const [policies, setPolicies] = useState({
    casualDays: 12,
    restrictedDays: 10,
    earnedDays: 15,
    carryForward: false,
    notificationsEnabled: true,
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success('System policies updated successfully!');
    }, 800);
  };

  const handleReset = () => {
    setPolicies({
      casualDays: 12,
      restrictedDays: 10,
      earnedDays: 15,
      carryForward: false,
      notificationsEnabled: true,
    });
    toast.info('Policies reset to defaults.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">ERP System Settings</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure baseline university leave policies and systemic controls
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSubmit} className="lg:col-span-2 card space-y-6">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5 border-b border-slate-100 dark:border-gray-700 pb-3">
            <Settings size={18} className="text-primary-600" />
            <span>Default Leave Allowances (Annual)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="form-group">
              <label className="form-label">Casual Leaves</label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={policies.casualDays}
                onChange={(e) => setPolicies({ ...policies, casualDays: parseInt(e.target.value) || 0 })}
                disabled={loading}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Restricted Leaves</label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={policies.restrictedDays}
                onChange={(e) => setPolicies({ ...policies, restrictedDays: parseInt(e.target.value) || 0 })}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Earned Leaves</label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={policies.earnedDays}
                onChange={(e) => setPolicies({ ...policies, earnedDays: parseInt(e.target.value) || 0 })}
                disabled={loading}
              />
            </div>
          </div>

          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5 border-b border-slate-100 dark:border-gray-700 pb-3 pt-4">
            <ShieldAlert size={18} className="text-primary-600" />
            <span>System Policies & Auditing</span>
          </h3>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300 dark:border-gray-700 text-primary-600 focus:ring-primary-500"
                checked={policies.carryForward}
                onChange={(e) => setPolicies({ ...policies, carryForward: e.target.checked })}
                disabled={loading}
              />
              <div>
                <span className="text-sm font-semibold text-slate-800 dark:text-white">Enable Carry-Forward</span>
                <p className="text-xs text-slate-550 dark:text-slate-400">
                  Allow unused casual or earned leaves to carry over into the subsequent academic year.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300 dark:border-gray-700 text-primary-600 focus:ring-primary-500"
                checked={policies.notificationsEnabled}
                onChange={(e) => setPolicies({ ...policies, notificationsEnabled: e.target.checked })}
                disabled={loading}
              />
              <div>
                <span className="text-sm font-semibold text-slate-800 dark:text-white">Automated SMTP Alerts</span>
                <p className="text-xs text-slate-550 dark:text-slate-400">
                  Trigger automatic email dispatches when leaves are submitted, approved, or rejected.
                </p>
              </div>
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-gray-700">
            <button
              type="button"
              onClick={handleReset}
              className="btn-secondary py-2 gap-1.5"
              disabled={loading}
            >
              <RotateCcw size={16} />
              <span>Reset Defaults</span>
            </button>
            <button
              type="submit"
              className="btn-primary py-2 gap-1.5"
              disabled={loading}
            >
              <Save size={16} />
              <span>{loading ? 'Saving Policies...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <div className="card bg-slate-50 dark:bg-gray-800 border-l-4 border-l-primary-500">
            <h4 className="font-bold text-sm text-slate-800 dark:text-white mb-2">Policy Seeding</h4>
            <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed">
              These settings initialize the annual allowances offered to new faculty members when their profiles are registered in the portal. Changing these values will not modify the current balances of existing accounts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
