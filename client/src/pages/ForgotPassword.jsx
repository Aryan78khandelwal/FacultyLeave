import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { ShieldAlert, ArrowLeft, Mail } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.warning('Please enter your email');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/forgotpassword', { email });
      if (response.data.success) {
        setSent(true);
        toast.success('Password reset email sent!');
      }
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || 'Could not send reset email. Verify your address.';
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
          <Link
            to="/login"
            className="absolute top-4 left-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm transition-colors text-white"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg backdrop-blur-sm">
            <ShieldAlert size={20} />
          </div>
          <h2 className="text-2xl font-bold mt-2">Reset Password</h2>
          <p className="text-white/80 text-sm mt-1">Get a link to access your account</p>
        </div>

        {/* Content Area */}
        <div className="p-8">
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Enter your registered college email below. We'll send you an inbox link with a secure token to choose a new password.
              </p>
              
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Mail size={18} />
                  </span>
                  <input
                    type="email"
                    required
                    className="form-input pl-11"
                    placeholder="e.g. professor@college.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 gap-2">
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Send Reset Link</span>
                )}
              </button>
            </form>
          ) : (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <Mail size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Check Your Inbox</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                We've sent a password reset link to <strong>{email}</strong>. Please check your spam folder if you do not receive it shortly.
              </p>
              <div className="pt-4">
                <Link to="/login" className="btn-secondary py-2 px-6">
                  Back to Login
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
