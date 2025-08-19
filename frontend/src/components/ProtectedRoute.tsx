import { ReactNode, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ProfileSetup } from '@/components/ProfileSetup';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoggedIn, isLoading, user } = useAuth();
  const location = useLocation();
  const [showProfileSetup, setShowProfileSetup] = useState(false);

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

  // Check if profile is complete
  const isProfileComplete = user?.profile?.isProfileComplete;
  
  // Show profile setup if not complete
  if (isLoggedIn && !isProfileComplete) {
    return (
      <>
        {children}
        <ProfileSetup 
          isOpen={true} 
          onComplete={() => setShowProfileSetup(false)} 
        />
      </>
    );
  }

  // Render children if authenticated and profile is complete
  return <>{children}</>;
}