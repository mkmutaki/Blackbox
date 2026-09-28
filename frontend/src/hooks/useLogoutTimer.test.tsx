import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { useLogoutTimer } from './useLogoutTimer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeWrapper = (logout: () => void) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <AuthContext.Provider value={{ logout } as any}>{children}</AuthContext.Provider>
    );
  };

// Advances one second at a time so the hook's own setInterval/clearInterval
// dance (it resubscribes every tick because timeRemaining is a dependency)
// runs the same way it would against a real clock.
const advanceSeconds = (seconds: number) => {
  for (let i = 0; i < seconds; i++) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
};

describe('useLogoutTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not log out before the timer is started', () => {
    const logout = vi.fn();
    renderHook(() => useLogoutTimer({ timeoutMinutes: 1 }), { wrapper: makeWrapper(logout) });

    advanceSeconds(120);

    expect(logout).not.toHaveBeenCalled();
  });

  it('logs the user out once the idle timeout elapses', () => {
    const logout = vi.fn();
    const { result } = renderHook(() => useLogoutTimer({ timeoutMinutes: 1 }), {
      wrapper: makeWrapper(logout),
    });

    act(() => {
      result.current.startTimer();
    });
    advanceSeconds(60);

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('resetTimer restores the full countdown so activity prevents logout', () => {
    const logout = vi.fn();
    const { result } = renderHook(() => useLogoutTimer({ timeoutMinutes: 1 }), {
      wrapper: makeWrapper(logout),
    });

    act(() => {
      result.current.startTimer();
    });
    advanceSeconds(50);

    act(() => {
      result.current.resetTimer();
    });
    advanceSeconds(50);

    expect(logout).not.toHaveBeenCalled();

    advanceSeconds(10);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('calls a custom onTimeout instead of logout when one is provided', () => {
    const logout = vi.fn();
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useLogoutTimer({ timeoutMinutes: 1, onTimeout }), {
      wrapper: makeWrapper(logout),
    });

    act(() => {
      result.current.startTimer();
    });
    advanceSeconds(60);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
  });
});
