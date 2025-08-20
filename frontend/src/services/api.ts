import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

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

console.log('API Base URL:', API_BASE_URL); // Debug log to verify correct URL

// Create Axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - will be used for authentication later
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

// Response interceptor for error handling
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    // Handle common errors here
    const status = error.response?.status;
    
    if (status === 401) {
      // Handle unauthorized (e.g., logout user, redirect to login)
      localStorage.removeItem('token');
      // We'll implement redirect logic later
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