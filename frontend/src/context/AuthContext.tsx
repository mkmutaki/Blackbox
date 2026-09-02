import { createContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';
import api from '../services/api';

// Types
type User = {
  id: string;
  email: string;
  authProvider: 'local' | 'google';
  createdAt: string;
  profile?: {
    username?: string;
    dateOfBirth?: string;
    isProfileComplete: boolean;
  };
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, dateOfBirth: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
  updateProfile: (profileData: { username?: string; dateOfBirth: string }) => Promise<void>;
  error: string | null;
};

// Create the context
export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Provider component
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user is logged in on initial load
  useEffect(() => {
    const checkLoggedIn = async () => {
      try {
        const token = localStorage.getItem('token');
        
        if (!token) {
          setIsLoading(false);
          return;
        }
        
        // Configure axios
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        // Verify token and get user data
        const res = await api.get('/auth/me');
        
        setUser(res.data);
        setIsLoggedIn(true);
        setIsLoading(false);
      } catch (error) {
        console.error('Authentication check failed', error);
        localStorage.removeItem('token');
        setIsLoading(false);
      }
    };
    
    checkLoggedIn();
  }, []);

  // Register user
  const register = async (email: string, password: string, fullName: string, dateOfBirth: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await api.post('/auth/register', {
        email,
        password,
        fullName,
        dateOfBirth
      });
      
      const { token, user } = res.data;
      
      // Save token to local storage
      localStorage.setItem('token', token);
      
      // Set default axios headers
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setUser(user);
      setIsLoggedIn(true);
      setIsLoading(false);
    } catch (error: any) {
      console.error('Registration error:', error);
      setError(error.response?.data?.error || 'Registration failed');
      setIsLoading(false);
      throw error;
    }
  };

  // Login user
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await api.post('/auth/login', {
        email,
        password
      });
      
      const { token, user } = res.data;
      
      // Save token to local storage
      localStorage.setItem('token', token);
      
      // Set default axios headers
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setUser(user);
      setIsLoggedIn(true);
      setIsLoading(false);
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.response?.data?.error || 'Invalid credentials');
      setIsLoading(false);
      throw error;
    }
  };

  // Login or register via a Google ID token credential
  const loginWithGoogle = async (credential: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await api.post('/auth/google', { credential });

      const { token, user } = res.data;

      // Save token to local storage
      localStorage.setItem('token', token);

      // Set default axios headers
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      setUser(user);
      setIsLoggedIn(true);
      setIsLoading(false);
    } catch (error: any) {
      console.error('Google login error:', error);
      setError(error.response?.data?.error || 'Google sign-in failed');
      setIsLoading(false);
      throw error;
    }
  };

  // Logout user
  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    setIsLoggedIn(false);
  };

  // Update user profile
  const updateProfile = async (profileData: { username?: string; dateOfBirth: string }) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await api.put('/profile/update', profileData);
      
      // Update user state with new profile data
      setUser(res.data.user);
      setIsLoading(false);
    } catch (error: any) {
      console.error('Profile update error:', error);
      setError(error.response?.data?.error || 'Profile update failed');
      setIsLoading(false);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn,
        login,
        register,
        loginWithGoogle,
        logout,
        updateProfile,
        error
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};