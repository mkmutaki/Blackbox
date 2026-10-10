import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// Dynamic API base URL based on environment
const getApiBaseUrl = () => {
  // Check if we're in development mode (use proxy)
  if (import.meta.env.DEV) {
    return '/api';  // Use relative path - Vite will proxy this
  }

  // Check if we're running on GitHub Pages
  if (window.location.hostname === 'mkmutaki.github.io') {
    return 'https://blackbox-2lt5.onrender.com/api';
  }

  // Fallback for other environments
  return import.meta.env.VITE_API_BASE_URL || '/api';
};

const API_BASE_URL = getApiBaseUrl();

// Create Axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // The session lives in httpOnly cookies now, not a token this code can
  // read — withCredentials is what makes the browser attach them (and
  // store the ones a response sets) on cross-site requests at all.
  withCredentials: true,
});

// Called once, from AuthContext, so a session that turns out to be
// unrecoverable (refresh itself failed) can clear local user state even
// when the failing request happened well after the initial page load.
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
}

// Concurrent requests that all 401 at once (e.g. a page that fires several
// API calls on mount) must not each trigger their own /auth/refresh —
// that would race multiple rotations of the same refresh token against
// each other. Coalesce into a single in-flight attempt they all await.
let refreshPromise: Promise<boolean> | null = null;
const attemptRefresh = (): Promise<boolean> => {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh')
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// Response interceptor: a single transparent retry after a silent refresh.
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined;
    const status = error.response?.status;

    if (status === 401 && config && !config._retriedAfterRefresh && config.url !== '/auth/refresh') {
      config._retriedAfterRefresh = true;

      const refreshed = await attemptRefresh();
      if (refreshed) {
        return api(config);
      }

      onUnauthorized?.();
    }

    return Promise.reject(error);
  }
);

// Generic GET request
export const get = async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
  const response = await api.get<T>(url, config);
  return response.data;
};

// Generic POST request
export const post = async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
  const response = await api.post<T>(url, data, config);
  return response.data;
};

// Generic PUT request
export const put = async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
  const response = await api.put<T>(url, data, config);
  return response.data;
};

// Generic PATCH request
export const patch = async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
  const response = await api.patch<T>(url, data, config);
  return response.data;
};

// Generic DELETE request
export const del = async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
  const response = await api.delete<T>(url, config);
  return response.data;
};

export default api;
