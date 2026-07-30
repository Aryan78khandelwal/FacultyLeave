import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Layout
import DashboardLayout from './layouts/DashboardLayout';

// Public Pages
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

// Faculty Pages
import FacultyDashboard from './pages/faculty/FacultyDashboard';
import ApplyLeave from './pages/faculty/ApplyLeave';
import LeaveHistory from './pages/faculty/LeaveHistory';
import FacultyCalendar from './pages/faculty/FacultyCalendar';
import FacultyProfile from './pages/faculty/FacultyProfile';

// HOD Pages
import HODDashboard from './pages/hod/HODDashboard';
import FacultyManagement from './pages/hod/FacultyManagement';
import HODAnalytics from './pages/hod/HODAnalytics';
import DepartmentCalendar from './pages/hod/DepartmentCalendar';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import DepartmentManagement from './pages/admin/DepartmentManagement';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminSettings from './pages/admin/AdminSettings';

// Route Guards
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to respective home dashboard based on role
    if (user.role === 'Admin') return <Navigate to="/admin" replace />;
    if (user.role === 'HOD') return <Navigate to="/hod" replace />;
    return <Navigate to="/faculty" replace />;
  }

  return children;
};

// Catch all root redirect helper
const RootRedirect = () => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    if (user.role === 'Admin') return <Navigate to="/admin" replace />;
    if (user.role === 'HOD') return <Navigate to="/hod" replace />;
    return <Navigate to="/faculty" replace />;
  }

  return <Navigate to="/login" replace />;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />

            {/* Faculty Protected Routes */}
            <Route
              path="/faculty"
              element={
                <ProtectedRoute allowedRoles={['Faculty', 'HOD']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<FacultyDashboard />} />
              <Route path="apply" element={<ApplyLeave />} />
              <Route path="history" element={<LeaveHistory />} />
              <Route path="calendar" element={<FacultyCalendar />} />
              <Route path="profile" element={<FacultyProfile />} />
            </Route>

            {/* HOD Protected Routes */}
            <Route
              path="/hod"
              element={
                <ProtectedRoute allowedRoles={['HOD']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<HODDashboard />} />
              <Route path="requests" element={<HODDashboard />} />
              <Route path="faculty" element={<FacultyManagement />} />
              <Route path="analytics" element={<HODAnalytics />} />
              <Route path="calendar" element={<DepartmentCalendar />} />
              <Route path="profile" element={<FacultyProfile />} />
            </Route>

            {/* Admin Protected Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="departments" element={<DepartmentManagement />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="profile" element={<FacultyProfile />} />
            </Route>

            {/* Root Redirection */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        
        {/* Toast Notification Container */}
        <ToastContainer
          position="top-right"
          autoClose={4000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
        />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
