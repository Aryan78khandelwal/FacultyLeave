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
 * Build a safe URL for serving uploaded files.
 * Does NOT append sensitive JWT tokens to the URL query string.
 * @param {string} filePath - The path stored in the DB, e.g. "/uploads/document-123.pdf"
 * @returns {string} Safe file URL without sensitive tokens
 */
export const getFileUrl = (filePath) => {
  if (!filePath) return '';
  const filename = filePath.split('/').pop(); // Extract just the filename
  return `${BASE_URL}/files/${filename}`;
};

/**
 * Fetch a protected file via the authenticated Axios client (with Authorization: Bearer header)
 * and display it safely in a pre-opened tab (or newly opened tab) using a temporary object URL.
 * Prevents browser popup blocking by using a tab opened synchronously in the user gesture.
 * Avoids duplicate opens and automatically revokes the object URL after navigation.
 *
 * @param {string} filePath - Path stored in DB, e.g. "/uploads/document-123.pdf"
 * @param {Window|null} targetTab - Pre-opened window from the click event handler
 * @returns {Promise<void>}
 */
export const viewProtectedFile = async (filePath, targetTab = null) => {
  if (!filePath) {
    if (targetTab && !targetTab.closed) {
      targetTab.close();
    }
    throw new Error('No file path provided');
  }

  // If caller did not pre-open a tab synchronously in their click handler,
  // attempt to open one immediately before any async await.
  // Note: do not pass 'noopener' here so targetTab remains a valid Window reference.
  const tab = targetTab || (typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null);

  // Render a clean loading indicator in the new tab while the document fetches
  if (tab && tab.document) {
    try {
      tab.document.write(
        '<!DOCTYPE html><html><head><title>Loading Document...</title>' +
        '<style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#64748b;background:#f8fafc;}</style>' +
        '</head><body><p>Loading document, please wait...</p></body></html>'
      );
      tab.document.close();
    } catch {
      // Safe to ignore in case of document write restrictions
    }
  }

  try {
    const filename = filePath.split('/').pop();

    const response = await api.get(`/files/${filename}`, {
      responseType: 'blob',
    });

    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const blob = new Blob([response.data], { type: contentType });
    const objectUrl = window.URL.createObjectURL(blob);

    if (tab && !tab.closed) {
      tab.location.href = objectUrl;
      try {
        tab.opener = null; // Decouple window.opener for security
      } catch {
        // Safe to ignore
      }
    } else {
      // Fallback if popup was strictly blocked by browser settings
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Revoke the temporary object URL after 60s
    setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
    }, 60000);
  } catch (err) {
    // If the request fails (403, 404, etc.), close the blank tab immediately
    if (tab && !tab.closed) {
      try {
        tab.close();
      } catch {
        // Safe to ignore
      }
    }
    throw err;
  }
};

export default api;

