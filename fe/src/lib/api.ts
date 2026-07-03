import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
  // Send the httpOnly auth cookie with every request (same-site in prod,
  // cross-origin in dev via CORS credentials).
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Session expired or missing — bounce to login, but not while already on the
    // login/callback pages (the bootstrap /me probe 401s there and must not loop).
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/auth/callback') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
