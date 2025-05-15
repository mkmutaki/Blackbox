import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoggedIn, isLoading } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    // Save the current location for redirection after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Render children if authenticated
  return <>{children}</>;
}