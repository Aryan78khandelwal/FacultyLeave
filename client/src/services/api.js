import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token expiry / authorization errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Avoid infinite loop if already on login page
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('token');
        window.location.href = '/login?expired=true';
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Build an authenticated URL for serving uploaded files.
 * Appends the JWT as a query param so <a href> links work in the browser.
 * @param {string} filePath - The path stored in the DB, e.g. "/uploads/document-123.pdf"
 * @returns {string} Authenticated URL
 */
export const getFileUrl = (filePath) => {
  if (!filePath) return '';
  const token = localStorage.getItem('token');
  const filename = filePath.split('/').pop(); // Extract just the filename
  return `${BASE_URL}/files/${filename}?token=${token}`;
};

export default api;

