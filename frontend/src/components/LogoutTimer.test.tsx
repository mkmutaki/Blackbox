import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '@/context/AuthContext';
import { LogoutTimer } from './LogoutTimer';

const toast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ toast: (...args: unknown[]) => toast(...args) }));

const advanceSeconds = (seconds: number) => {
  for (let i = 0; i < seconds; i++) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
};

const renderAt = (path: string, logout: () => void) =>
  render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <AuthContext.Provider value={{ user: { profile: { autoLockMinutes: 5 } }, logout } as any}>
      <MemoryRouter initialEntries={[path]}>
        <LogoutTimer showWarningAt={120} />
      </MemoryRouter>
    </AuthContext.Provider>
  );

describe('LogoutTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toast.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns and announces the expiry inside the app', () => {
    const logout = vi.fn();
    renderAt('/home', logout);

    advanceSeconds(5 * 60);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls.map(([arg]) => arg.title)).toEqual(['Session Warning', 'Session Expired']);
  });

  it('logs out silently on the landing page', () => {
    const logout = vi.fn();
    renderAt('/', logout);

    advanceSeconds(5 * 60);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });
});
