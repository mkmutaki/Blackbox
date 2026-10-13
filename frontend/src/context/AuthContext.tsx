import { createContext, useState, useEffect, ReactNode } from 'react';
import api, { setUnauthorizedHandler } from '../services/api';
import { getErrorMessage } from '../lib/errorMessage';

// Types
type User = {
  id: string;
  email: string;
  authProvider: 'local' | 'google';
  createdAt: string;
  profile?: {
    fullName?: string;
    username?: string;
    dateOfBirth?: string;
    autoLockMinutes?: number;
    onboardingComplete?: boolean;
    isProfileComplete: boolean;
  };
};

export type OnboardingAnswers = {
  username: string;
  autoLockMinutes: number;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, fullName: string, dateOfBirth: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (profileData: { username?: string; dateOfBirth: string }) => Promise<void>;
  completeOnboarding: (answers: OnboardingAnswers) => Promise<void>;
  deleteAccount: (proof: { password?: string; credential?: string }) => Promise<void>;
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

  // The session lives in an httpOnly cookie now — there's nothing in
  // localStorage to check first. Just ask the server; it either attaches
  // a valid cookie or it doesn't.
  useEffect(() => {
    const checkLoggedIn = async () => {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
        setIsLoggedIn(true);
      } catch (error) {
        // Not logged in, or the session expired — nothing to clean up
        // locally, there's no token to remove.
      } finally {
        setIsLoading(false);
      }
    };

    checkLoggedIn();
  }, []);

  // If a background request's silent refresh attempt ultimately fails
  // (the refresh token itself is invalid/revoked), the api layer has no
  // way to update React state itself — it calls this instead.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setIsLoggedIn(false);
    });
    return () => setUnauthorizedHandler(null);
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

      setUser(res.data.user);
      setIsLoggedIn(true);
      setIsLoading(false);
    } catch (error) {
      console.error('Registration error:', error);
      setError(getErrorMessage(error, 'Registration failed'));
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

      const { user } = res.data;

      setUser(user);
      setIsLoggedIn(true);
      setIsLoading(false);

      return user;
    } catch (error) {
      console.error('Login error:', error);
      setError(getErrorMessage(error, 'Invalid credentials'));
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

      setUser(res.data.user);
      setIsLoggedIn(true);
      setIsLoading(false);
    } catch (error) {
      console.error('Google login error:', error);
      setError(getErrorMessage(error, 'Google sign-in failed'));
      setIsLoading(false);
      throw error;
    }
  };

  // Logout user — tells the server to revoke the refresh-token family and
  // clear the cookies, then clears local state regardless of whether that
  // request succeeded (being offline shouldn't trap someone in a session
  // they're trying to leave).
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      setUser(null);
      setIsLoggedIn(false);
    }
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
    } catch (error) {
      console.error('Profile update error:', error);
      setError(getErrorMessage(error, 'Profile update failed'));
      setIsLoading(false);
      throw error;
    }
  };

  // Save onboarding answers and mark the flow as finished
  const completeOnboarding = async (answers: OnboardingAnswers) => {
    setError(null);

    try {
      const res = await api.post('/profile/onboarding', answers);
      setUser(res.data.user);
    } catch (error) {
      console.error('Onboarding error:', error);
      setError(getErrorMessage(error, 'Could not save your answers'));
      throw error;
    }
  };

  // Permanently delete the caller's own account. Re-throws on failure
  // (wrong password, mismatched Google credential, etc.) so the
  // confirmation UI can show the server's specific error rather than this
  // context's shared `error` banner, which other forms also read from.
  const deleteAccount = async (proof: { password?: string; credential?: string }) => {
    await api.delete('/auth/account', { data: proof });
    setUser(null);
    setIsLoggedIn(false);
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
        completeOnboarding,
        deleteAccount,
        error
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
