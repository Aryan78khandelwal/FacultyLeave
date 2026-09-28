import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { BarChart3, TrendingUp, PieChart as PieIcon, Building2 } from 'lucide-react';

const AdminAnalytics = () => {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await api.get('/leaves/analytics');
        if (response.data.success) {
          setAnalyticsData(response.data.stats);
        }
      } catch (error) {
        console.error('Failed to load analytics:', error);
        toast.error('Failed to load global system analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-gray-800 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-slate-200 dark:bg-gray-800 rounded-xl"></div>
          <div className="h-64 bg-slate-200 dark:bg-gray-800 rounded-xl"></div>
        </div>
      </div>
    );
  }

  // Pre-process Monthly Data
  const monthlyData = (analyticsData?.monthlyStats || []).map((item) => {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return {
      name: `${months[item._id.month - 1]} ${item._id.year}`,
      days: item.days,
      count: item.count,
    };
  });

  // Pre-process Leave Type Data
  const typeColors = { casual: '#3b82f6', restricted: '#ef4444', earned: '#10b981' };
  const typeData = (analyticsData?.typeStats || []).map((item) => {
    const rawType = item._id ? item._id.toLowerCase() : '';
    const label = rawType === 'restricted' ? 'RESTRICTED' : rawType.toUpperCase();
    return {
      name: label,
      value: item.totalDays,
      count: item.count,
      color: typeColors[rawType] || '#cbd5e1',
    };
  });

  // Pre-process Status Data
  const statusColors = { approved: '#10b981', rejected: '#ef4444', pending: '#f59e0b' };
  const statusData = (analyticsData?.statusStats || []).map((item) => ({
    name: item._id.toUpperCase(),
    value: item.count,
    color: statusColors[item._id] || '#cbd5e1',
  }));

  // Pre-process Department Comparison Data (Admin Only)
  const deptData = (analyticsData?.deptStats || []).map((item) => ({
    name: item._id,
    days: item.days,
    applications: item.count,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Global Analytics</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Monitor university-wide leave utilization and department coverages
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Comparison Bar Chart */}
        <div className="card lg:col-span-2">
          <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-1.5">
            <Building2 size={18} className="text-primary-655" />
            <span>Department Comparison (Total Days Taken)</span>
          </h3>
          <div className="h-72 mt-6">
            {deptData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
                No department leave data to display.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" className="dark:stroke-gray-700" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                  <Bar dataKey="days" fill="#3b82f6" name="Total Days Taken" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Monthly Trend Area Chart */}
        <div className="card">
          <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-1.5">
            <TrendingUp size={18} className="text-primary-655" />
            <span>Monthly Leaves Trend (Days Taken)</span>
          </h3>
          <div className="h-64 mt-6">
            {monthlyData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
                No leave data to plot.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorDaysAdmin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" className="dark:stroke-gray-700" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip />
                  <Area type="monotone" dataKey="days" stroke="#3b82f6" fillOpacity={1} fill="url(#colorDaysAdmin)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Leave Type Distribution Pie Chart */}
        <div className="card">
          <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-1.5">
            <PieIcon size={18} className="text-primary-655" />
            <span>Leave Type Utilization (Total Days)</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center h-64 mt-6">
            {typeData.length === 0 ? (
              <div className="sm:col-span-2 text-center text-xs text-slate-400 italic">
                No utilization records available.
              </div>
            ) : (
              <>
                <div className="h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={typeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {typeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 px-4">
                  {typeData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-medium text-slate-600 dark:text-slate-350">{item.name}</span>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-white">
                        {item.value} days
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalytics;
