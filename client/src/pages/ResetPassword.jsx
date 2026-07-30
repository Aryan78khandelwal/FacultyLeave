import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { ShieldAlert, Key, Eye, EyeOff } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      toast.warning('All fields are required');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await api.put(`/auth/resetpassword/${token}`, { password });
      if (response.data.success) {
        toast.success('Password updated successfully! Please log in.');
        navigate('/login');
      }
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || 'Failed to reset password. Link may be expired.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-100 to-slate-200 dark:from-gray-950 dark:to-gray-900 px-4 transition-colors duration-200 relative overflow-hidden">
      <AnimatedBackground />
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-slate-100 dark:border-gray-700 overflow-hidden relative z-10 animate-scaleIn">
        {/* Banner header */}
        <div className="bg-primary-600 px-8 py-8 text-center text-white relative">
          <div className="absolute top-4 left-4 p-2 bg-white/10 rounded-lg backdrop-blur-sm">
            <ShieldAlert size={20} />
          </div>
          <h2 className="text-2xl font-bold mt-2">New Password</h2>
          <p className="text-white/80 text-sm mt-1">Select a secure password for your account</p>
        </div>

        {/* Content Area */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="form-group">
            <label className="form-label">New Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Key size={18} />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="form-input pl-11 pr-10"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Key size={18} />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="form-input pl-11"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 gap-2 mt-2">
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>Update Password</span>
            )}
          </button>

          <div className="text-center pt-2">
            <Link to="/login" className="text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-350">
              Return to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
