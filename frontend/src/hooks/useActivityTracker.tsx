// frontend/src/hooks/useActivityTracker.ts
import { useCallback, useEffect, useRef } from 'react';

interface UseActivityTrackerProps {
  onActivity: () => void;
  isActive?: boolean;
  events?: string[];
  throttleMs?: number;
}

export const useActivityTracker = ({
  onActivity,
  isActive = true,
  events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'],
  throttleMs = 1000
}: UseActivityTrackerProps) => {
  const lastActivityRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const throttledOnActivity = useCallback(() => {
    const now = Date.now();
    
    if (now - lastActivityRef.current >= throttleMs) {
      lastActivityRef.current = now;
      onActivity();
    }
  }, [onActivity, throttleMs]);

  const handleActivity = useCallback(() => {
    if (!isActive) return;
    
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Set new timeout to prevent excessive calls
    timeoutRef.current = setTimeout(throttledOnActivity, 100);
  }, [isActive, throttledOnActivity]);

  useEffect(() => {
    if (!isActive) return;

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [events, handleActivity, isActive]);

  return null;
};