import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './AuthContext';
import { useAuth } from '@/hooks/useAuth';
import api from '@/services/api';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

function TestConsumer() {
  const { user, isLoggedIn, login, logout, error } = useAuth();
  return (
    <div>
      <div data-testid="status">{isLoggedIn ? 'in' : 'out'}</div>
      <div data-testid="email">{user?.email ?? ''}</div>
      <div data-testid="error">{error ?? ''}</div>
      <button onClick={() => { login('test@example.com', 'password123').catch(() => {}); }}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('has no session on first mount when there is no stored token', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('out'));
    expect(api.get).not.toHaveBeenCalled();
  });

  it('login stores the token and marks the user as logged in', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        token: 'jwt-token',
        user: { id: '1', email: 'test@example.com', authProvider: 'local' },
      },
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
    expect(localStorage.getItem('token')).toBe('jwt-token');
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('surfaces the server error message and does not log in on failed login', async () => {
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
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('logout clears the token and user state', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        token: 'jwt-token',
        user: { id: '1', email: 'test@example.com', authProvider: 'local' },
      },
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

    expect(screen.getByTestId('status')).toHaveTextContent('out');
    expect(screen.getByTestId('email')).toHaveTextContent('');
    expect(localStorage.getItem('token')).toBeNull();
  });
});
