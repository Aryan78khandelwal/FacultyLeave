import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { LogIn, Key, Mail, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';

const Login = () => {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check for expired token parameter
  useEffect(() => {
    if (searchParams.get('expired') === 'true') {
      toast.error('Session expired. Please log in again.');
    }
  }, [searchParams]);

  // If already authenticated, redirect immediately
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'Admin') navigate('/admin');
      else if (user.role === 'HOD') navigate('/hod');
      else navigate('/faculty');
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.warning('Please enter both email and password');
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      toast.success('Successfully logged in!');
      // Redirection is handled in useEffect above
    } else {
      toast.error(result.message || 'Invalid credentials');
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
          <h2 className="text-2xl font-bold mt-2">College Portal</h2>
          <p className="text-white/80 text-sm mt-1">Faculty Leave Management System</p>
        </div>

        {/* Form area */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="form-group">
            <label className="form-label">College Email</label>
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

          <div className="form-group">
            <div className="flex items-center justify-between mb-1.5">
              <label className="form-label">Password</label>
              <Link
                to="/forgot-password"
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              >
                Forgot Password?
              </Link>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Key size={18} />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="form-input pl-11 pr-10"
                placeholder="••••••••"
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

          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 gap-2 mt-2">
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={18} />
                <span>Sign In to ERP</span>
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="px-8 py-4 bg-slate-50 dark:bg-gray-800/50 border-t border-slate-100 dark:border-gray-700 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            For admin assistance, please contact the IT Helpdesk.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
