// frontend/src/components/LogoutTimer.tsx
import { useLogoutTimer } from '@/hooks/useLogoutTimer';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';

interface LogoutTimerProps {
  timeoutMinutes?: number;
  showWarningAt?: number; // seconds before timeout to show warning
  className?: string;
}

export const LogoutTimer = ({ 
  timeoutMinutes = 10, 
  showWarningAt = 120, // 2 minutes warning
  className = ""
}: LogoutTimerProps) => {
  const { user } = useAuth();
  const { timeRemaining, formattedTime, isActive, startTimer, resetTimer } = useLogoutTimer({
    timeoutMinutes,
    onTimeout: () => {
      toast({
        title: "Session Expired",
        description: "You have been logged out due to inactivity.",
        variant: "destructive",
      });
    }
  });

  // Start timer when user logs in
  useEffect(() => {
    if (user) {
      startTimer();
    }
  }, [user, startTimer]);

  // Show warning toast when approaching timeout
  useEffect(() => {
    if (isActive && timeRemaining === showWarningAt) {
      toast({
        title: "Session Warning",
        description: `Your session will expire in ${Math.floor(showWarningAt / 60)} minutes due to inactivity.`,
        variant: "destructive",
      });
    }
  }, [timeRemaining, showWarningAt, isActive]);

  // Reset timer on user activity
  useEffect(() => {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      if (isActive) {
        resetTimer();
      }
    };

    // Add event listeners for user activity
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Cleanup event listeners
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
    };
  }, [isActive, resetTimer]);

  // Don't render if user is not authenticated
  if (!user || !isActive) {
    return null;
  }

  return (
    <div className={`fixed bottom-4 right-4 bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2 shadow-lg transition-opacity duration-300 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-mono">
        <div className={`w-2 h-2 rounded-full ${timeRemaining <= showWarningAt ? 'bg-destructive animate-pulse' : 'bg-accent'}`} />
        <span className="text-muted-foreground">Session:</span>
        <span className={timeRemaining <= showWarningAt ? 'text-destructive font-semibold' : 'text-foreground'}>
          {formattedTime}
        </span>
      </div>
    </div>
  );
};