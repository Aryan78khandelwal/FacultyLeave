import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  LayoutDashboard,
  Calendar,
  FileText,
  UserCheck,
  Users,
  Settings,
  ShieldAlert,
  BarChart3,
  User,
  Building2
} from 'lucide-react';

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Define sidebar links based on user role
  const getSidebarLinks = () => {
    switch (user?.role) {
      case 'Admin':
        return [
          { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
          { path: '/admin/users', label: 'User Management', icon: Users },
          { path: '/admin/departments', label: 'Departments', icon: Building2 },
          { path: '/admin/analytics', label: 'Global Analytics', icon: BarChart3 },
          { path: '/admin/settings', label: 'Settings', icon: Settings },
          { path: '/admin/profile', label: 'My Profile', icon: User },
        ];
      case 'HOD':
        return [
          { path: '/hod', label: 'Dashboard', icon: LayoutDashboard },
          { path: '/hod/requests', label: 'Leave Requests', icon: FileText },
          { path: '/hod/faculty', label: 'Manage Faculty', icon: UserCheck },
          { path: '/hod/analytics', label: 'Department Analytics', icon: BarChart3 },
          { path: '/hod/calendar', label: 'Department Calendar', icon: Calendar },
          { path: '/hod/profile', label: 'My Profile', icon: User },
        ];
      case 'Faculty':
      default:
        return [
          { path: '/faculty', label: 'Dashboard', icon: LayoutDashboard },
          { path: '/faculty/apply', label: 'Apply Leave', icon: FileText },
          { path: '/faculty/history', label: 'Leave History', icon: FileText },
          { path: '/faculty/calendar', label: 'Leave Calendar', icon: Calendar },
          { path: '/faculty/profile', label: 'My Profile', icon: User },
        ];
    }
  };

  const links = getSidebarLinks();

  // Get current page header title
  const getPageTitle = () => {
    const activeLink = links.find((link) => location.pathname === link.path);
    if (activeLink) return activeLink.label;
    if (location.pathname.includes('/profile')) return 'My Profile';
    return 'College ERP';
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Component */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 border-r border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-800 transition-transform duration-300 lg:translate-x-0 lg:static lg:h-screen ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary-600 rounded-lg text-white">
              <ShieldAlert size={20} />
            </div>
            <span className="font-bold text-slate-800 dark:text-white tracking-tight">
              Faculty Leave ERP
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-700 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* User Card */}
        <div className="p-4 border-b border-slate-100 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold border border-primary-200 dark:border-primary-900 overflow-hidden">
              {user?.avatar ? (
                <img src={user.avatar} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                user?.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                {user?.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {user?.role} • {user?.department?.name || 'Admin'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.path}
                to={link.path}
                end
                className={({ isActive }) =>
                  isActive ? 'sidebar-link-active' : 'sidebar-link text-slate-600 dark:text-slate-350'
                }
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={18} />
                <span>{link.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer / Logout */}
        <div className="p-4 border-t border-slate-100 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/40">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-red-650 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-750 transition-colors"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-screen">
        {/* Top Navbar */}
        <header className="h-16 flex items-center justify-between px-6 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-bold text-slate-800 dark:text-white">
              {getPageTitle()}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Quick Profile Link */}
            <div className="flex items-center gap-2">
              <Link
                to={user?.role === 'Admin' ? '/admin/profile' : user?.role === 'HOD' ? '/hod/profile' : '/faculty/profile'}
                className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-350 hover:text-primary-600 dark:hover:text-primary-400"
              >
                <span className="hidden sm:inline font-medium">{user?.designation}</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
