// frontend/src/hooks/useLogoutTimer.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';

interface UseLogoutTimerProps {
  timeoutMinutes?: number;
  onTimeout?: () => void;
}

export const useLogoutTimer = ({ 
  timeoutMinutes = 10, 
  onTimeout 
}: UseLogoutTimerProps = {}) => {
  const [timeRemaining, setTimeRemaining] = useState(timeoutMinutes * 60);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { logout } = useAuth();

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }, []);

  // Start the timer
  const startTimer = useCallback(() => {
    setTimeRemaining(timeoutMinutes * 60);
    setIsActive(true);
  }, [timeoutMinutes]);

  // Stop the timer
  const stopTimer = useCallback(() => {
    setIsActive(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Reset the timer (restart with full time)
  const resetTimer = useCallback(() => {
    if (isActive) {
      setTimeRemaining(timeoutMinutes * 60);
    }
  }, [timeoutMinutes, isActive]);

  // Handle timeout
  const handleTimeout = useCallback(async () => {
    stopTimer();
    
    // Call custom timeout handler if provided
    if (onTimeout) {
      onTimeout();
    } else {
      // Default behavior: logout user
      try {
        await logout();
      } catch (error) {
        console.error('Error during auto-logout:', error);
      }
    }
  }, [logout, onTimeout, stopTimer]);

  // Timer effect
  useEffect(() => {
    if (isActive && timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            handleTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, timeRemaining, handleTimeout]);

  return {
    timeRemaining,
    formattedTime: formatTime(timeRemaining),
    isActive,
    startTimer,
    stopTimer,
    resetTimer,
  };
};