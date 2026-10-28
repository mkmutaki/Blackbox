import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { post } from '@/services/api';
import ResetPassword from './ResetPassword';

vi.mock('@/services/api', () => ({ post: vi.fn() }));
vi.mock('@/components/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/components/PixelGasBackground', () => ({ PixelGasBackground: () => null }));

const breachedError = () =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400,
    data: { error: 'This password has appeared in a known data breach', code: 'PASSWORD_BREACHED' },
  } as AxiosResponse);

const renderWithToken = () => {
  render(
    <MemoryRouter initialEntries={['/reset-password?token=abc']}>
      <ResetPassword />
    </MemoryRouter>,
  );
  const setPassword = (value: string) => {
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value } });
  };
  setPassword('Password1!');
  return { setPassword };
};

describe('ResetPassword breached password', () => {
  it('warns, then lets the user keep the password by pressing Reset again', async () => {
    const mockPost = vi.mocked(post);
    mockPost.mockReset().mockRejectedValueOnce(breachedError()).mockResolvedValueOnce({} as never);
    renderWithToken();

    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText(/known data breach/i)).toBeInTheDocument();
    expect(mockPost.mock.calls[0][1]).toMatchObject({ acceptBreachedPassword: false });

    fireEvent.click(screen.getByRole('button', { name: 'Reset Password Anyway' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][1]).toMatchObject({ acceptBreachedPassword: true });
  });

  it('keeps the warning after the password is edited, but no longer overrides the check', async () => {
    vi.mocked(post).mockReset().mockRejectedValueOnce(breachedError());
    const { setPassword } = renderWithToken();

    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    await screen.findByText(/known data breach/i);

    setPassword('Password1!x');
    expect(screen.getByText(/known data breach/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument();
  });
});
