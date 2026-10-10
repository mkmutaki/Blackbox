import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './AuthContext';
import { useAuth } from '@/hooks/useAuth';
import api, { setUnauthorizedHandler } from '@/services/api';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
  setUnauthorizedHandler: vi.fn(),
}));

function TestConsumer() {
  const { user, isLoggedIn, login, logout, error } = useAuth();
  return (
    <div>
      <div data-testid="status">{isLoggedIn ? 'in' : 'out'}</div>
      <div data-testid="email">{user?.email ?? ''}</div>
      <div data-testid="error">{error ?? ''}</div>
      <button onClick={() => { login('test@example.com', 'password123').catch(() => {}); }}>login</button>
      <button onClick={() => { logout(); }}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(setUnauthorizedHandler).mockReset();
  });

  it('has no session on first mount until /auth/me is checked — the session lives in an httpOnly cookie, not anything this code can read upfront', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 401 } });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(api.get).toHaveBeenCalledWith('/auth/me');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('out'));
  });

  it('picks up an existing session on mount when the cookie is still valid', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { id: '1', email: 'test@example.com', authProvider: 'local' } });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('in'));
    expect(screen.getByTestId('email')).toHaveTextContent('test@example.com');
  });

  it('registers an unauthorized handler with the api layer on mount', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 401 } });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(setUnauthorizedHandler).toHaveBeenCalledWith(expect.any(Function)));
  });

  it('login marks the user as logged in without ever seeing a token in the response', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 401 } });
    vi.mocked(api.post).mockResolvedValue({
      data: { user: { id: '1', email: 'test@example.com', authProvider: 'local' } },
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('out'));

    await user.click(screen.getByText('login'));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('in'));
    expect(screen.getByTestId('email')).toHaveTextContent('test@example.com');
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('surfaces the server error message and does not log in on failed login', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 401 } });
    vi.mocked(api.post).mockRejectedValue({
      response: { data: { error: 'Invalid credentials' } },
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('out'));

    await user.click(screen.getByText('login'));

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Invalid credentials'));
    expect(screen.getByTestId('status')).toHaveTextContent('out');
  });

  it('logout calls the server endpoint and clears local user state', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 401 } });
    vi.mocked(api.post).mockResolvedValue({
      data: { user: { id: '1', email: 'test@example.com', authProvider: 'local' } },
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('out'));
    await user.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('in'));

    await user.click(screen.getByText('logout'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/logout'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('out'));
    expect(screen.getByTestId('email')).toHaveTextContent('');
  });

  it('logout still clears local state even if the server request fails (e.g. offline)', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 401 } });
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === '/auth/login') {
        return Promise.resolve({ data: { user: { id: '1', email: 'test@example.com', authProvider: 'local' } } });
      }
      return Promise.reject(new Error('network error'));
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('out'));
    await user.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('in'));

    await user.click(screen.getByText('logout'));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('out'));
  });
});
