import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { RecordingProvider, useRecording } from '@/context/RecordingContext';
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

// Stands in for Index opening the recorder screen.
const RecorderScreen = ({ open }: { open: boolean }) => {
  const { setIsRecording } = useRecording();
  useEffect(() => setIsRecording(open), [open, setIsRecording]);
  return null;
};

const tree = (path: string, logout: () => void, onRecorder = false) => (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <AuthContext.Provider value={{ user: { profile: { autoLockMinutes: 5 } }, logout } as any}>
    <RecordingProvider>
      <MemoryRouter initialEntries={[path]}>
        <RecorderScreen open={onRecorder} />
        <LogoutTimer showWarningAt={120} />
      </MemoryRouter>
    </RecordingProvider>
  </AuthContext.Provider>
);

const renderAt = (path: string, logout: () => void) => render(tree(path, logout));

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

  it('pauses on the recording screen and restarts in full once it closes', () => {
    const logout = vi.fn();
    const { rerender } = render(tree('/home', logout, true));

    advanceSeconds(20 * 60);
    expect(logout).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();

    rerender(tree('/home', logout, false));
    advanceSeconds(5 * 60 - 1);
    expect(logout).not.toHaveBeenCalled();

    advanceSeconds(1);
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
