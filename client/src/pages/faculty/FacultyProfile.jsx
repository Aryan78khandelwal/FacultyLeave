import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { User, Key, ShieldAlert, Award, Building } from 'lucide-react';

const FacultyProfile = () => {
  const { user, updateProfile } = useAuth();
  
  const [name, setName] = useState(user?.name || '');
  const [designation, setDesignation] = useState(user?.designation || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password && password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    const profileData = { name, designation, avatar };
    if (password) {
      profileData.password = password;
    }

    const result = await updateProfile(profileData);
    setLoading(false);

    if (result && result.success) {
      toast.success('Profile updated successfully!');
      setPassword('');
      setConfirmPassword('');
    } else {
      toast.error(result?.message || 'Failed to update profile');
    }
  };

  const avatarsList = [
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
    'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=150',
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">My Profile</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage your personal details and account credentials
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info summary card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary-600" />
            
            <div className="mt-4 relative inline-block mx-auto">
              <div className="w-24 h-24 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold border-4 border-slate-50 dark:border-gray-800 overflow-hidden shadow-sm">
                {avatar ? (
                  <img src={avatar} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  user?.name.charAt(0).toUpperCase()
                )}
              </div>
            </div>

            <h3 className="text-lg font-bold text-slate-800 dark:text-white mt-4">{user?.name}</h3>
            <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide">
              {user?.role}
            </p>

            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-gray-700 text-left space-y-3 text-sm">
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-350">
                <Building size={16} className="text-slate-400" />
                <span>Dept: {user?.department?.name || 'Academic Administration'}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-350">
                <Award size={16} className="text-slate-400" />
                <span>ID: {user?.employeeId}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-350">
                <User size={16} className="text-slate-400" />
                <span>Designation: {user?.designation}</span>
              </div>
            </div>
          </div>

          {/* Quick Preset Avatars */}
          <div className="card">
            <h4 className="font-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              Preset Avatars
            </h4>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {avatarsList.map((av, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatar(av)}
                  className={`w-10 h-10 rounded-full border-2 overflow-hidden transition-all ${
                    avatar === av ? 'border-primary-600 scale-105 shadow-sm' : 'border-transparent hover:scale-102'
                  }`}
                >
                  <img src={av} alt="avatar option" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Profile details form */}
        <div className="lg:col-span-2 card">
          <h3 className="font-bold text-slate-800 dark:text-white mb-6">Edit Profile Details</h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Designation</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Avatar Image URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://example.com/avatar.jpg"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-gray-700">
              <h4 className="font-bold text-sm text-slate-800 dark:text-white mb-4 flex items-center gap-1.5">
                <Key size={16} className="text-slate-400" />
                <span>Change Password (Leave blank to keep current)</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary px-8">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default FacultyProfile;
