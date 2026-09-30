import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Layout (keep static since it wraps all protected routes)
import DashboardLayout from './layouts/DashboardLayout';

// Public Pages (Lazy loaded)
const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

// Faculty Pages (Lazy loaded)
const FacultyDashboard = lazy(() => import('./pages/faculty/FacultyDashboard'));
const ApplyLeave = lazy(() => import('./pages/faculty/ApplyLeave'));
const LeaveHistory = lazy(() => import('./pages/faculty/LeaveHistory'));
const FacultyCalendar = lazy(() => import('./pages/faculty/FacultyCalendar'));
const FacultyProfile = lazy(() => import('./pages/faculty/FacultyProfile'));

// HOD Pages (Lazy loaded)
const HODDashboard = lazy(() => import('./pages/hod/HODDashboard'));
const FacultyManagement = lazy(() => import('./pages/hod/FacultyManagement'));
const HODAnalytics = lazy(() => import('./pages/hod/HODAnalytics'));
const DepartmentCalendar = lazy(() => import('./pages/hod/DepartmentCalendar'));

// Admin Pages (Lazy loaded)
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const DepartmentManagement = lazy(() => import('./pages/admin/DepartmentManagement'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

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
          <Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
                <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />

              {/* Faculty Protected Routes */}
              <Route
                path="/faculty"
                element={
                  <ProtectedRoute allowedRoles={['Faculty', 'HOD', 'Instructor', 'SDA']}>
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
          </Suspense>
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
